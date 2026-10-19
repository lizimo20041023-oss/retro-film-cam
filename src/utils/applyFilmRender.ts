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
 * ⚠️ 这里**不吞异常**：任何一步失败都原样抛出去，由 `processFilmPhoto` 统一兜底
 * 回退到 v1.9.x 的声明式调色层 —— 用户永远拿得到照片，只是少了真胶片观感。
 * （这条兜底是产品红线：不能让一次 LUT 解码失败变成"快门没反应"。）
 */
import { File, Paths } from 'expo-file-system';
import type { SceneStats } from '../types';
import { filmLookParamsFor, renderFilmFrame } from './filmRender';
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
    onProgress: input.onStage,
  });
  /*
   * 同卷同种子覆盖写同一个文件名：中间图是"用完即弃"的，不参与相册；
   * 同名覆盖避免连续拍摄时缓存无限膨胀。
   */
  const target = new File(Paths.cache, `film-${input.stockId}-${input.seed}.png`);
  target.write(encodePngRgba(png.width, png.height, png.rgba));
  return { uri: target.uri, width: png.width, height: png.height, params };
}
