/**
 * 绝对像素画布基准（v1.8.0 模块五）。
 *
 * ## 为什么需要这个文件
 *
 * 用户的要求原话是「严禁让水印文本随画布整体缩放而产生动态像素浮动……必须为水印文本
 * 设定一套基于标准画布宽度的绝对像素字号基准」。
 *
 * 实现上这就是一句话：**字号的"设计值"定义在 1440 宽的标准画布上，落到任意画布时按
 * 宽度等比换算**。因为换算完之后的字号恒等于「画布宽度 × 固定比例」，所以它天然满足
 * "不随缩放浮动"—— 同一张图不管中间被 resize 过几次、最终还是同一个像素高度。
 *
 * 反过来说：**任何"短边比例""最小 pt 下限""按设备档位分叉"的写法都会破坏这条不变式**，
 * v1.7.0 之前的水印字号 bug（字时大时小）就是那么来的。这里的常量是唯一产地。
 *
 * ## 单位
 *
 * `DESIGN_*_PX` 的单位是**设计像素**（1440 宽画布上的像素），不是点、不是设备像素。
 * 换算后得到的是**逻辑点**（与画布宽高同一坐标系），乘 `PixelRatio` 才是设备像素。
 *
 * 日期字形的设计像素随字形不同（四档的视觉高度要分别校准），
 * 所以按 `DateGlyphStyleId` 分档给出。`quartz_led` 沿用 v1.8.2 里 7 段数码管的
 * 44 设计像素 —— v1.8.3 起四档都是同一套等宽文本，44 保住参考画布上 10.94pt 的既有观感。
 */

import type { DateGlyphStyleId } from '../types';

/** 标准画布宽度（设计像素）。所有 `DESIGN_*_PX` 都以它为基准。 */
export const BASE_CANVAS_W = 1440;

/** 日期文本在标准画布上的设计像素高（按字形分档）。 */
export const DATE_DESIGN_PX: Record<DateGlyphStyleId, number> = {
  quartz_led: 44,
  ccd_osd: 46,
  lab_inkjet: 44,
  archival_steel: 46,
};

/**
 * 地名文本在标准画布上的设计像素高。
 *
 * `32 ≈ 44 × 0.72`：0.72 是 v1.7.0 真机调校过的「地名 ÷ 日期」比值。v1.8.0 只把这条
 * 比例从旧式 `round(max(6, 日期字号 × 0.72))` 里提出来变成设计像素常量 —— **比例不变，
 * 去掉的只是"小于 6pt 就抬到 6pt"那条设备分叉**（Lead 裁定：本轮用户只要求"字号绝对
 * 锁定"，把地名放大到 40（= 0.909 倍日期）属于没被要求的观感变化，不做）。
 */
export const PLACE_DESIGN_PX = 32;

/**
 * 白边角落那行小字（预设名 / 画幅代码）在标准画布上的设计像素高。
 *
 * `29 ≈ 32 × 0.9`：**0.9 是"代号 ÷ 地名"**，不是"代号 ÷ 日期" —— v1.7.0 的两条签名
 * 把层级写死了（`git show 27d4ca6:src/utils/watermarkTypography.ts`）：
 *   `placeFontOf(dateFont) = Math.max(6, Math.round(dateFont * 0.72))`
 *   `codeFontOf(placeFont) = Math.max(6, Math.round(placeFont * 0.9))`   ← 入参是 placeFont
 * 所以设计像素应取 `PLACE_DESIGN_PX × 0.9 = 28.8`：29 实测比值 0.9063（358pt 上
 * 7.21/7.96 = 0.9058）最贴近 0.9；28 → 0.875 偏小、30 → 0.9372 偏大 4.1%（Lead 裁定）。
 * 旧式 `max(6, …)` 里"小于 6pt 抬到 6pt"的设备分叉同样不再保留。
 */
export const CODE_DESIGN_PX = 29;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把设计像素换算成当前画布上的逻辑点。**这是像素锁定的唯一换算入口。**
 *
 * @param designPx 1440 宽画布上的设计像素
 * @param canvasWidth 当前渲染画布宽度（逻辑点）
 */
export function absoluteFontPx(designPx: number, canvasWidth: number): number {
  return round2((designPx * canvasWidth) / BASE_CANVAS_W);
}

/**
 * 反向换算：当前画布上的逻辑点相当于标准画布上的多少设计像素。
 * 只给探针/调试用 —— 正常渲染只走 {@link absoluteFontPx}。
 */
export function designPxOf(pointPx: number, canvasWidth: number): number {
  if (canvasWidth <= 0) {
    return 0;
  }
  return round2((pointPx * BASE_CANVAS_W) / canvasWidth);
}
