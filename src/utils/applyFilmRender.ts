/**
 * v2.0.0 真胶片管线的**文件层**封装 —— 把 pass1 截出来的照片 PNG 洗成"已上卷"的 PNG。
 *
 * 为什么单独一层：
 * - 像素算法（`filmRender.ts`）是纯 JS、零 RN/Expo 依赖，Node 探针能直接跑（`_probe_v200_lut.cjs`）；
 * - 文件读写只能走 expo-file-system（SDK 57 只保留新 API，旧 `copyAsync/getInfoAsync`
 *   等函数在该版本运行时会直接抛错），把它关在这里，探针不碰 IO。
 *
 * 数据流（一次快门）：
 *   `<FilmPhotoStage>` 截图 PNG（tmpfile）
 *     → `new File(uri).bytesSync()` 读字节
 *     → `decodePng` 解出 RGBA
 *     → `renderFilmFrame`（LUT → halation → vignette → grain）
 *     → `encodePngRgba`
 *     → 写进 `Paths.cache`，返回 file:// uri 给 pass2 的 `<FilmCompositor>`
 *
 * ⚠️ 这里**不吞异常**：任何一步失败都原样抛出去，由 `processFilmPhoto` 统一兜底
 * 回退到 v1.9.x 的声明式调色层 —— 用户永远拿得到照片，只是少了真胶片观感。
 * （这条兜底是产品红线：不能让一次 LUT 解码失败变成"快门没反应"。）
 */
import { File, Paths } from 'expo-file-system';
import { filmLookParamsFor, renderFilmFrame } from './filmRender';
import type { FilmLookParams, FilmRenderStage } from './filmRender';
import { getLutForStock } from './lutAssets';
import { decodePng, encodePngRgba } from './pngCodec';

export interface RenderFilmToFileInput {
  /** pass1 截出来的照片 PNG（`result: 'tmpfile'` 给的 `file://` uri）。 */
  sourceUri: string;
  /** 卷 id（决定用哪张 33³ LUT，以及 halation 强度）。 */
  stockId: string;
  /** 预设里与观感有关的两个字段（`ResolvedFilmPreset` 的子集）。 */
  preset: { id: string; grain: number; vignette?: number };
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
  /** 实际用的三个观感参数（探针/日志用）。 */
  params: FilmLookParams;
}

/**
 * 同步实现：调用点已经在 async 流程里，且这几步都是纯 CPU + 小文件 IO。
 * 3.1MP 在 Node 上约 0.2s，Hermes 预计 0.6~1.2s（渲染期间显影遮罩会挡住屏幕）。
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
    onProgress: input.onStage,
  });
  /*
   * 同卷同种子覆盖写同一个文件名：tmpfile 由 view-shot 自己清，缓存目录里这张
   * 中间图是"用完即弃"的，不参与相册；同名覆盖避免连续拍摄时缓存无限膨胀。
   * （相册成片走 processAndSaveFilmPhoto 的另一条 JPEG 路径，与这里无关。）
   */
  const target = new File(Paths.cache, `film-${input.stockId}-${input.seed}.png`);
  target.write(encodePngRgba(png.width, png.height, png.rgba));
  return { uri: target.uri, width: png.width, height: png.height, params };
}
