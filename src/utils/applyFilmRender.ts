/**
 * v2.0.1 真胶片管线的**文件层**封装 —— 把一张照片文件洗成"已上卷"的 PNG 中间图。
 *
 * 为什么单独一层：
 * - 像素算法（`filmRender.ts`）是纯 JS、零 RN/Expo 依赖，Node 探针能直接跑；
 * - 文件读写只能走 expo-file-system（SDK 57 只保留新 API），把它关在这里，探针不碰 IO。
 *
 * 数据流（一次快门，v2.0.1 起**不再有两遍截图**）：
 *   `expo-image-manipulator` 从原图裁出相框窗口比例、缩放到长边 1440~1800，存 **PNG**
 *     → `new File(uri).bytesSync()` 读字节
 *     → `decodePng` 解出 RGBA
 *     → `renderFilmFrame`（单趟：LUT 整型三线性 → 暗角 → 颗粒 → 纯 R halation）
 *     → `encodePngRgba`（zlib store 模式，不压缩；1800×1350 实测 ~30ms）
 *     → 写进 `Paths.cache`，返回 file:// uri 给唯一的最终 view-shot
 *
 * ⚠️ 这里**不吞异常**：任何一步失败都原样抛出去。v2.1.0 起调用方
 * （`processFilmPhoto`）**不再**回退声明式调色层 —— 用户要求"像素管线失败必须报错，
 * 不许静默给一张没上卷的原图"（m03050 手术三）。
 */
import { File, Paths } from 'expo-file-system';
import type { SceneStats } from '../types';
import { filmLookParamsFor, filmLookWithIntensity, renderFilmFrame } from './filmRender';
import type { FilmLookParams, FilmRenderStage } from './filmRender';
import { getLutForStock } from './lutAssets';
import { decodePng, encodePngRgba } from './pngCodec';

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
 * 同步实现：调用点已经在 async 流程里，且这几步都是纯 CPU + 小文件 IO。
 * 2.43MP 在 Node V8 上预计 90~120ms（渲染）+ 20~40ms（PNG 解/编码），
 * Hermes 无 JIT 预计再慢 2~3 倍（渲染期间显影遮罩会挡住屏幕）。
 */
export function renderFilmToFile(input: RenderFilmToFileInput): RenderedFilmFile {
  const lut = getLutForStock(input.stockId);
  if (lut === null) {
    throw new Error(`没有 ${input.stockId} 的 LUT 资产（constants/lutAtlas.ts）`);
  }
  const source = new File(input.sourceUri);
  if (!source.exists) {
    throw new Error(`照片中间图不存在：${input.sourceUri}`);
  }
  const png = decodePng(source.bytesSync());
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
