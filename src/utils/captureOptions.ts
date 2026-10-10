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
 * 峰值会翻倍。所以默认停在 2048，想要更大就自己在预设里调 `captureLongEdge`。
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
   */
  upscaled: boolean;
}

/** JPEG 质量：0.95 在"看不出压缩"和"文件别太大"之间。 */
const JPEG_QUALITY = 0.95;

export interface CapturePlanInput {
  /** 舞台的逻辑宽度（点），来自 `computeFrameLayout`。 */
  width: number;
  /** 舞台的逻辑高度（点）。 */
  height: number;
  /** 成片长边目标像素数；`<= 0` 表示就用屏幕原生尺寸。 */
  targetLongEdge: number;
}

/**
 * 算出这次截图该传什么、最终会得到多少像素。
 *
 * 纯函数（只读一次 `PixelRatio.get()`），所以 `FilmCompositor` 和 `processFilmPhoto`
 * 用同样的输入调用它，一定能得到同样的结论 —— 报告给用户的像素数不会和实际文件对不上。
 */
export function planCapture(input: CapturePlanInput): CapturePlan {
  const pixelRatio = PixelRatio.get();
  const nativeLongEdge = Math.max(input.width, input.height) * pixelRatio;
  const nativeWidth = Math.round(input.width * pixelRatio);
  const nativeHeight = Math.round(input.height * pixelRatio);

  // 目标没比屏幕原生大（或者压根没设）→ 不传 width/height，省一次重采样
  if (!(input.targetLongEdge > 0) || input.targetLongEdge <= nativeLongEdge + 1) {
    return {
      options: { format: 'jpg', quality: JPEG_QUALITY, result: 'tmpfile' },
      pixelWidth: nativeWidth,
      pixelHeight: nativeHeight,
      pixelRatio,
      upscaled: false,
    };
  }

  // 目标像素 / 原生像素 = 点尺寸要乘的倍数（因为输出像素 = 点 × pixelRatio）
  const scale = input.targetLongEdge / nativeLongEdge;
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
  };
}
