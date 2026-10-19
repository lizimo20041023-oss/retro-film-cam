/**
 * v2.0.1 真胶片管线的**文件层**封装 —— 把一张照片文件洗成"已上卷"的 PNG 中间图。
 *
 * 为什么单独一层：
 * - 像素算法（`filmRender.ts`）是纯 JS、零 RN/Expo 依赖，Node 探针能直接跑；
 * - 文件读写只能走 expo-file-system（SDK 57 只保留新 API），把它关在这里，探针不碰 IO。
 *
 * 数据流（一次快门，v2.0.1 起**不再有两遍截图**）：
 *   `expo-image-manipulator` 从原图裁出相框窗口比例、缩放到长边 1440~1800，存 **PNG**
 *     （`prepareLutSource`，见 `processFilmPhoto.ts`）
 *     → `new File(uri).bytesSync()` 读字节，**按魔数路由**（v2.1.1 双格式输入）：
 *        · PNG（`89 50 4E 47`）      → `decodePng` 纯 JS 解码
 *        · JPEG（`FF D8`）/ 其它格式 → 原生兜底：`expo-image-manipulator` 读这张文件、
 *          重存成 8-bit PNG（`SaveFormat.PNG`）后再 `decodePng`
 *     → `renderFilmFrame`（单趟：LUT 整型三线性 → 暗角 → 颗粒 → 纯 R halation）
 *     → `encodePngRgba`（zlib store 模式，不压缩；1800×1350 实测 ~30ms）
 *     → 写进 `Paths.cache`，返回 file:// uri 给唯一的最终 view-shot
 *
 * 为什么要路由，而不是"一律走原生兜底"：
 * - 正常链路（相机 / 相册导入 → 归一化 → 裁切 → `prepareLutSource`）产出的就是 PNG，
 *   纯 JS 解码省掉"原生读图 → 落盘 → 再读回"这一整趟，也就少一条会失败的原生桥；
 * - 但成片管线**不能因为输入不是 PNG 就失败**（v2.1.1：JPEG 来源的照片也必须能洗）。
 *   兜底只负责把"任意容器格式"收口成 8-bit PNG，像素算法仍然只有一份 —— 两条分支
 *   在 `decodePng` 之后完全同构，LUT / 颗粒 / 暗角 / 强度语义逐字节相同。
 *
 * 为什么 16-bit PNG 不走去兜底：路由只看魔数（PNG 一律进 `decodePng`），位深支持是
 * `pngCodec.ts` 自己的契约。若把它推给原生兜底，等于把 16-bit 无谓地先降到 8-bit，
 * 那是**降质**而不是兜底 —— 真不支持时 `decodePng` 会自己抛，符合下面的失败语义。
 *
 * ⚠️ 这里**不吞异常**：任何一步失败都原样抛出去。v2.1.0 起调用方
 * （`processFilmPhoto`）**不再**回退声明式调色层 —— 用户要求"像素管线失败必须报错，
 * 不许静默给一张没上卷的原图"（m03050 手术三）。
 */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SceneStats } from '../types';
import { filmLookParamsFor, filmLookWithIntensity, renderFilmFrame } from './filmRender';
import type { FilmLookParams, FilmRenderStage } from './filmRender';
import { getLutForStock } from './lutAssets';
import { decodePng, encodePngRgba } from './pngCodec';
import type { PngImage } from './pngCodec';

export interface RenderFilmToFileInput {
  /** 待显影的照片文件（`file://`；由 ImageManipulator 预处理成 PNG 或 JPEG）。 */
  sourceUri: string;
  /** 卷 id（决定用哪张 33³ LUT，以及 halation 强度）。 */
  stockId: string;
  /** 预设里与观感有关的字段（`ResolvedFilmPreset` 的子集）。 */
  preset: {
    id: string;
    grain: number;
    vignette?: number;
    /** 黑白卷：颗粒三通道同步。 */
    mono?: boolean;
    /** 场景统计（自适应输入 gamma 用；null/缺省 = 中性 1）。 */
    scene?: SceneStats | null;
  };
  /**
   * 颗粒种子。同一张照片必须固定，否则"重试一次显影"会得到不同颗粒；
   * 调用点用快门时间戳的整数部分（`Date.now() & 0x7fffffff`）。
   */
  seed: number;
  /**
   * 预设强度乘数（v2.1.0 手术二）：0.35~1.60，缺省 1 = 100%。
   *
   * 它是"整卷观感的全局乘数"：LUT 输出与原图插值/外推、暗角 EV、颗粒幅度、
   * halation 幅度都乘它（夹取规则在 `utils/filmRender.ts` 的 `filmLookWithIntensity`）。
   */
  intensity?: number;
  /** 渲染阶段回调（显影进度条/阶段文案用）。 */
  onStage?: (stage: FilmRenderStage) => void;
}

export interface RenderedFilmFile {
  /** 洗好的 PNG（`file://`，尺寸 = 成片里照片窗口的像素尺寸）。 */
  uri: string;
  width: number;
  height: number;
  /** 实际用的观感参数（探针/日志用）。 */
  params: FilmLookParams;
}

/**
 * 输入照片的容器格式。
 *
 * ⚠️ 只认**文件头魔数**，不认扩展名：中间图的文件名是上游拼出来的，扩展名与真实编码
 * 并不保证一致（截图 / 转存工具留下一个名叫 `.png` 的 JPEG 是常见情况）。这也正是
 * 这里必须先读字节、而不能只看 uri 后缀的原因。
 *
 * `'jpeg'` 与 `'other'` 走**同一条**原生兜底；分开只为了把路由表写清楚，
 * 排查时一眼能看出进来的是"标准 JPEG"还是"魔数不认识的第 N 种格式"。
 */
type FilmSourceFormat = 'png' | 'jpeg' | 'other';

/** PNG 签名前 4 字节：`\x89 P N G`。 */
const PNG_MAGIC: readonly number[] = [0x89, 0x50, 0x4e, 0x47];
/** JPEG SOI（Start Of Image）：`FF D8`。 */
const JPEG_MAGIC: readonly number[] = [0xff, 0xd8];

function startsWithMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) {
      return false;
    }
  }
  return true;
}

function sniffFilmSourceFormat(bytes: Uint8Array): FilmSourceFormat {
  if (startsWithMagic(bytes, PNG_MAGIC)) {
    return 'png';
  }
  if (startsWithMagic(bytes, JPEG_MAGIC)) {
    return 'jpeg';
  }
  return 'other';
}

/**
 * 原生 8-bit 兜底：让 `expo-image-manipulator` 读这张文件，**重存成 8-bit PNG**，
 * 再把字节交给 `decodePng`。零新增依赖（它本就是成片管线的依赖）。
 *
 * 为什么是"重存 PNG"而不是"原生直接给 RGBA"：Expo 没有暴露 `UIImage` / `Bitmap` 的
 * 像素缓冲，能拿到像素的稳定通道只有 `decodePng`。原生解码器（ImageIO / BitmapFactory）
 * 能吃 JPEG / HEIC / WebP / 16-bit PNG，输出统一落成 8-bit RGBA —— 正好把"容器格式的
 * 多样性"收口成 `decodePng` 认识的**单一输入**，像素算法因此不必知道任何容器细节。
 *
 * 两个必须守住的点：
 * - **不加任何 `resize` / `crop` 动作**：只换容器、不碰几何。一旦重采样，成片的
 *   "取景器所见 = 成片内容"就断了（见 `processFilmPhoto.ts` 第 0.5 步居中裁切）。
 * - **中间 PNG 读完立刻删**：它的文件名每次随机（不像 `film-*.png` 那样定名覆盖），
 *   留着会让缓存随拍摄张数线性膨胀。
 */
async function readAsEightBitPngBytes(uri: string): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  /*
   * PNG 是无损的：`compress: 1` = 最高质量（对 PNG 只影响 deflate 力度，不改像素）。
   * 刻意**不复用** JPEG 那条路的 0.98 之类质量值 —— 那会把二次有损压缩带进像素管线。
   */
  const saved = await image.saveAsync({ format: SaveFormat.PNG, compress: 1 });
  const file = new File(saved.uri);
  try {
    return file.bytesSync();
  } finally {
    /*
     * 清理失败**不能**影响成片：字节已经读进内存，残留只是一个几 MB 的缓存文件。
     * 这不是"静默回退"（像素仍然来自这张原图），所以只在这里咽掉清理这一步的异常。
     */
    if (file.exists) {
      try {
        file.delete();
      } catch {
        /* 见上：清理尽力而为 */
      }
    }
  }
}

/**
 * 异步实现（v2.1.1）：输入格式由字节魔数决定，非 PNG 要先 `await` 一次原生重编码，
 * 所以整个函数必须是 `async`，调用点（`processFilmPhoto.ts`）跟着 `await`。
 *
 * 耗时口径不变：2.43MP 在 Node V8 上预计 90~120ms（渲染）+ 20~40ms（PNG 解/编码），
 * Hermes 无 JIT 预计再慢 2~3 倍（渲染期间显影遮罩会挡住屏幕）。非 PNG 额外多一趟
 * 原生解码 + PNG 落盘（几十 ms 量级），这是"能洗出来"换来的代价。
 */
export async function renderFilmToFile(
  input: RenderFilmToFileInput,
): Promise<RenderedFilmFile> {
  const lut = getLutForStock(input.stockId);
  if (lut === null) {
    throw new Error(`没有 ${input.stockId} 的 LUT 资产（constants/lutAtlas.ts）`);
  }
  const source = new File(input.sourceUri);
  if (!source.exists) {
    throw new Error(`照片中间图不存在：${input.sourceUri}`);
  }
  /*
   * 字节只读**一次**：路由和 PNG 解码共用同一份 buffer。
   * 非 PNG 分支里这份 buffer 会活到函数结束（几 MB），相比随后 10MB+ 的 RGBA
   * 可以忽略；换来的是不必为了 sniff 先把文件读两遍。
   */
  const bytes = source.bytesSync();
  const format = sniffFilmSourceFormat(bytes);
  let png: PngImage;
  if (format === 'png') {
    png = decodePng(bytes);
  } else {
    /* JPEG 或任何其它魔数：原生收口成 8-bit PNG，再走同一条纯 JS 解码。 */
    png = decodePng(await readAsEightBitPngBytes(input.sourceUri));
  }
  const params = filmLookParamsFor(input.preset);
  renderFilmFrame(png.rgba, png.width, png.height, {
    lut,
    halation: params.halation,
    vignette: params.vignette,
    grain: params.grain,
    seed: input.seed,
    gamma: params.gamma,
    mono: params.mono,
    /*
     * 把强度交给像素循环（不要在这里先乘好再传）：`renderFilmFrame` 内部用
     * `scaleFilmLook` 一次算出「暗角 EV / 颗粒幅度 / halation 幅度」的生效值，
     * 这里再乘一遍就成了平方。
     */
    intensity: input.intensity,
    onProgress: input.onStage,
  });
  /*
   * 同卷同种子覆盖写同一个文件名：中间图是"用完即弃"的，不参与相册；
   * 同名覆盖避免连续拍摄时缓存无限膨胀。
   */
  const target = new File(Paths.cache, `film-${input.stockId}-${input.seed}.png`);
  target.write(encodePngRgba(png.width, png.height, png.rgba));
  /*
   * 回报**实际生效**的一版参数（强度已经乘进去、夹取也做完）：`processFilmPhoto`
   * 直接把 `halation / vignette / grain` 写进 `layers`，探针读到的也是像素里真正用的数。
   */
  return {
    uri: target.uri,
    width: png.width,
    height: png.height,
    params: filmLookWithIntensity(params, input.intensity),
  };
}
