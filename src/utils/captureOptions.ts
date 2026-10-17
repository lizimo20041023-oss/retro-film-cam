/**
 * 截图尺寸规划 —— 决定成片到底有多少像素。
 *
 * 为什么不能"直接拍 12MP"：
 * 这套管线是**把舞台视图画出来再截屏**（见 `FilmCompositor.tsx`），调色全部依赖
 * `mixBlendMode` → iOS 上就是 `CALayer.compositingFilter`，而 `compositingFilter`
 * 只在"把视图画进上下文"时生效。往下的两条路里：
 *   - `drawViewHierarchyInRect:` 会重绘整棵图层树 → 调色在 ✓，但**尺寸受上下文限制**；
 *   - `renderInContext:`      能画很大的图 → 但**不渲染 compositingFilter**，调色全丢 ✗。
 * 所以只能用前者，成片像素数 = 截图的点尺寸 × 设备像素比。
 *
 * 但"点尺寸"是**可以传的**：`captureRef` 的 `width/height` 单位是点，
 * iOS 侧 `UIGraphicsImageRendererFormat.scale = 0`（= 用设备缩放），
 * 于是把舞台的逻辑尺寸按比例放大后传进去，UIKit 会把整棵树**重绘到更大的矩形**上 ——
 * 照片从原图重新采样、日期文字是矢量、相框从 PNG 重新采样，
 * 拿到的是真的更多像素，而不是把屏幕截图拉伸放大。
 *
 * 代价是内存：上下文是 `宽 × 高 × 4` 字节。长边 2048 时约 12 MB，
 * 长边 3024 时约 27 MB，长边 4032（= iPhone 原图）时约 48 MB —— 再加上原图的解码副本，
 * 峰值会翻倍。所以默认停在 2048（= `captureQuality.ts` 的 standard 档），
 * 想要更大就让用户在设置页里选"高清 / 极致"（v1.7.0），或在预设里写死 `captureLongEdge`。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 不凭空上采样（v1.7.0）
 * ─────────────────────────────────────────────────────────────────────────
 * 把画布放大只对"矢量 / 源够大"的东西有意义。相框 PNG 是 2700×3600、日期是矢量文字，
 * 都经得起放大；**照片不是** —— 它进管线后先被按相框窗口比例中心裁切过一次，
 * 源长边经常小于 4032。这时若照样把画布开到 4032，结果只是"小图被插值放大成大文件"：
 * 文件更大、合成更慢、更吃内存，清晰度一点没涨。
 * 所以调用方可以传 `sourceLongEdge`（当前这张底片的长边像素数），planCapture 会把它
 * 当成上限：有效目标 = min(目标长边, 源图长边)，并老老实实回报 `clampedToSource`。
 * 不传 `sourceLongEdge` 时的行为与 v1.6.0 完全一致（不设上限）。
 */

import { PixelRatio } from 'react-native';

/** 传给 `captureRef` 的截图选项；`width`/`height` 的单位是**逻辑点**，不是像素。 */
export interface PlannedCaptureOptions {
  format: 'jpg';
  quality: number;
  result: 'tmpfile';
  width?: number;
  height?: number;
}

export interface CapturePlan {
  /** 直接交给 `ViewShot` 的 `options`。 */
  options: PlannedCaptureOptions;
  /** 成片的实际像素宽度。 */
  pixelWidth: number;
  /** 成片的实际像素高度。 */
  pixelHeight: number;
  /** 设备像素比（成片像素 = 逻辑点 × 它）。 */
  pixelRatio: number;
  /**
   * 是否真的做了超采样。
   * `false` 表示目标长边没超过屏幕原生尺寸，走的是"不传 width/height"的默认路径。
   * ⚠️ `true` **不等于**"源图被插值放大" —— 源图不够大时会被 `clampedToSource` 先夹住。
   */
  upscaled: boolean;
  /**
   * 实际生效的长边目标像素数 = `min(请求值, 源图长边)`。
   * 请求值 `<= 0`（= 用屏幕原生尺寸）时原样是 0。
   * ⚠️ 这是**目标**：`ViewShot` 只接受整数逻辑点，点尺寸取整后再乘 `pixelRatio`，
   * 所以 `pixelWidth` / `pixelHeight` 的长边可能比它差 ±1px（实测目标 1600 → 1599）。
   */
  targetLongEdge: number;
  /**
   * 是否因为"目标超过源图长边"而把有效目标夹小了。
   * `true` = 这次不再请求超出源图的画布，`targetLongEdge` 就是源图长边。
   * ⚠️ 夹完仍可能**低于屏幕原生尺寸**：那时走的是"不传 width/height"的默认路径，
   *    真文件长边 = 屏幕原生尺寸（`pixelWidth` / `pixelHeight` 报的就是它，不会对不上）；
   *    只有夹完仍高于屏幕原生时，画布才真的等于源图长边（1:1，点取整可能差 ±1px）。
   */
  clampedToSource: boolean;
}

/**
 * JPEG 质量：**0.98**（v1.8.4 起）。
 *
 * 用户（m02103 item ④）明确要求 quality 0.98：上一版 0.95 在 12MP 成片上会被看出
 * 色块边界（尤其大面积天空 + 颗粒叠加之后）。0.98 的代价是文件大约 +15%，
 * 相对"原图零柔焦"的红线可以接受；归一化 / 中心裁切两处中间 JPEG 也统一到 0.98
 * （`normalizePhoto.ts` / `processFilmPhoto.ts`），否则中间那两次重编码会先降一次质。
 */
const JPEG_QUALITY = 0.98;

export interface CapturePlanInput {
  /** 舞台的逻辑宽度（点），来自 `computeFrameLayout`。 */
  width: number;
  /** 舞台的逻辑高度（点）。 */
  height: number;
  /** 成片长边目标像素数；`<= 0` 表示就用屏幕原生尺寸。 */
  targetLongEdge: number;
  /**
   * 源图（当前这张底片，已经过归一化 + 中心裁切）的长边像素数。
   * 传了它 = 允许把目标夹到源长边，避免"凭空插值放大"。
   * 不传 / `<= 0` / 非有限值 = 不设上限（与 v1.6.0 行为一致）。
   */
  sourceLongEdge?: number;
}

/**
 * 算出这次截图该传什么、最终会得到多少像素。
 *
 * 纯函数（只读一次 `PixelRatio.get()`），所以 `FilmCompositor` 和 `processFilmPhoto`
 * 用同样的输入调用它，一定能得到同样的结论 —— 报告给用户的像素数不会和实际文件对不上。
 *
 * 输入了 `sourceLongEdge` 时，会先把目标夹到源图长边（不凭空上采样），见文件头。
 */
export function planCapture(input: CapturePlanInput): CapturePlan {
  const pixelRatio = PixelRatio.get();
  const nativeLongEdge = Math.max(input.width, input.height) * pixelRatio;
  const nativeWidth = Math.round(input.width * pixelRatio);
  const nativeHeight = Math.round(input.height * pixelRatio);

  /*
   * ① 先取"想要多大"和"源图能给多大"的交集：源图不够大就绝不凭空插值。
   *    `sourceLongEdge` 缺省 / 非法值一律当作"不设上限"，所以老调用点行为不变。
   */
  const requested = Number.isFinite(input.targetLongEdge) ? input.targetLongEdge : 0;
  const rawSourceCap = input.sourceLongEdge;
  const sourceCap =
    typeof rawSourceCap === 'number' && Number.isFinite(rawSourceCap) && rawSourceCap > 0 ? rawSourceCap : 0;
  const clampedToSource = sourceCap > 0 && requested > sourceCap;
  const targetLongEdge = clampedToSource ? sourceCap : requested;

  // 目标没比屏幕原生大（或者压根没设）→ 不传 width/height，省一次重采样
  if (!(targetLongEdge > 0) || targetLongEdge <= nativeLongEdge + 1) {
    return {
      options: { format: 'jpg', quality: JPEG_QUALITY, result: 'tmpfile' },
      pixelWidth: nativeWidth,
      pixelHeight: nativeHeight,
      pixelRatio,
      upscaled: false,
      targetLongEdge,
      clampedToSource,
    };
  }

  // 目标像素 / 原生像素 = 点尺寸要乘的倍数（因为输出像素 = 点 × pixelRatio）
  const scale = targetLongEdge / nativeLongEdge;
  const pointWidth = Math.round(input.width * scale);
  const pointHeight = Math.round(input.height * scale);

  return {
    options: {
      format: 'jpg',
      quality: JPEG_QUALITY,
      result: 'tmpfile',
      width: pointWidth,
      height: pointHeight,
    },
    pixelWidth: Math.round(pointWidth * pixelRatio),
    pixelHeight: Math.round(pointHeight * pixelRatio),
    pixelRatio,
    upscaled: true,
    targetLongEdge,
    clampedToSource,
  };
}
