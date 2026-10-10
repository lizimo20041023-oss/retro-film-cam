/**
 * 变焦 ZOOM 的取值规则。
 *
 * ## 为什么用原生 zoom，而不是自己裁一刀
 *
 * expo-camera 的 `zoom` 属性最终落到 iOS 的 `AVCaptureDevice.videoZoomFactor`
 * （`node_modules/expo-camera/ios/Current/CameraSessionManager.swift:221`）：
 *
 *     device.videoZoomFactor = minZoom * pow(device.activeFormat.videoMaxZoomFactor / minZoom, delegate.zoom)
 *
 * 两件事值得注意：
 *
 * 1. 它是**指数插值**的（`minZoom` 写死 1.0），所以行程的手感像真实变焦环 ——
 *    每往上一格，放大倍率乘一个固定系数，而不是线性加一点。
 * 2. `videoZoomFactor` 是**设备级**属性：预览和 `takePicture()` 的输出一起吃这个值。
 *
 * 第 2 点是这里不去自己写裁剪的根本原因 —— 「取景器里看到多大，成片就是多大」
 * 是白送的，而且成片是相机自己按传感器裁出来的全分辨率结果，比「先拍全图、
 * 再拿缩到 2048px 的图去裁中心」清楚一个数量级。
 *
 * ## 为什么量程上限只到 0.75
 *
 * `zoom = 1` 的含义是「设备允许的最大数码变焦」。iPhone 后置广角这个值普遍在
 * 16 倍上下（部分机型更高），而本项目拍完还要把长边缩到 2048px ——
 * 拉满就是一坨糊掉的颜色，没有任何可用画面。
 * 0.75 在 16 倍的机型上大约是 8 倍，已经够用。宁可少给一段，不要给一段全是噪点的行程。
 *
 * ## 为什么显示的是百分比，而不是「×N 倍」
 *
 * `videoMaxZoomFactor` 只有原生侧读得到，JS 拿不到，所以**设备真实的最大倍率是未知的**，
 * 也就没法把 0~1 换成准确的倍数。写死一个「×8」在 16 倍的机型和 8 倍的机型上
 * 总有一边是错的，而错的数字比没有数字更糟。百分比永远是对的，
 * 也符合本 App 到处是仪表读数的调性（LCD 上本来就写着 `颗粒 STD .30 · 暗角 .18`）。
 */

/** 不放大。 */
export const ZOOM_MIN = 0;

/** 量程上限（**是传给 zoom 的值，不是倍数**，见文件头）。 */
export const ZOOM_MAX = 0.75;

/** 开机默认：不放大。 */
export const DEFAULT_ZOOM = ZOOM_MIN;

/** 轨道上刻几道参考刻度（不含两端）。 */
export const ZOOM_TICKS = 4;

/** 无障碍「增大 / 减小」一格的步长：整条轨道分成 20 格。 */
export const ZOOM_STEP = ZOOM_MAX / 20;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ZOOM;
  }
  return Math.min(Math.max(value, ZOOM_MIN), ZOOM_MAX);
}

/**
 * 真正传给 `<CameraView zoom={...}>` 的值。
 *
 * 量化到 1%：拖动时每一帧都会走一次 setState，不量化的话原生侧每帧都要
 * `lockForConfiguration()` 改一次 `videoZoomFactor`，纯属浪费。
 * 1% 对 0.75 的量程来说远超肉眼的区分能力。
 */
export function toCameraZoom(value: number): number {
  return Math.round(clampZoom(value) * 100) / 100;
}

/** 0~100，相对量程上限。用于界面读数。 */
export function zoomPercent(value: number): number {
  return Math.round((clampZoom(value) / ZOOM_MAX) * 100);
}

/** 刻度的归一化位置（0~1，不含两端），从下往上。 */
export function zoomTickRatios(): number[] {
  return Array.from({ length: ZOOM_TICKS }, (_, index) => (index + 1) / (ZOOM_TICKS + 1));
}
