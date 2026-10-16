/**
 * 水印字号的**绝对像素基准层**（v1.7.0 §四）—— 纯函数 + 显式常量，没有任何运行时依赖。
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────────────
 * v1.7.0 的用户诉求：「严禁水印文本（城市名与日期）随画布整体缩放而动态像素浮动；
 * 必须给水印文本一套基于标准画布宽度的**绝对像素字号基准**；无论输入图片分辨率如何，
 * 成片渲染画布上日期的像素高度与间距必须绝对恒定。」
 *
 * 在此之前，日期字号的算法散着两条互相打架的线（见 `geometry.ts` 的旧 `dateFontOf`）：
 *
 *     round(clamp(min(窗口宽 × 0.055, 画布短边 × 0.032) × 墨色系数, 11, 96))
 *
 * 它有三个各自独立的毛病，全都在真机尺寸上量得出来：
 *   1. **两条线**：`窗口宽 × 0.055` 与 `短边 × 0.032` 取小值。窗口宽是**相框自己的事**
 *      （拍立得窗口占 89.8%、35mm 只占 68.6%），于是"相框裁得狠不狠"会决定字号。
 *      实测 5 款相框 × 4 种视口共 20 组，窗口那一条**一次都没赢过**（见报告里的对照表）
 *      —— 它是一条死线，却让读代码的人以为字号和窗口有关。
 *   2. **下限当主角**：`MIN_DATE_FONT = 11` 在小画布上直接把比例锁死。320pt 的 iPhone SE
 *      上短边只有 229~288pt，按比例该是 7.3~9.2pt，全被抬到 11pt —— 于是"字号 ÷ 画布"
 *      在小屏与大屏之间差了 1.5 倍，正是用户说的"随画布整体缩放而浮动"。
 *   3. **整数取整**：`Math.round` 让字号以 1pt 为台阶跳（390pt 上是 11pt，430pt 上直接 13pt，
 *      跳过 12），相邻两档设备的日期像素高相差 9%。
 *
 * 新算法只有一条线，而且只吃**画布宽度**这一个几何输入：
 *
 *     dateFont = round2(clamp(画布宽度 × 比例, 下限, 画布宽度 × 12%))
 *
 * 因为成片像素 = 逻辑点 × (captureLongEdge ÷ 画布长边)，而 5 款相框的宽高比都是常数，
 * "字号 ÷ 画布宽度 = 常数"等价于**成片上日期的像素高度是常数** —— 这就是"绝对像素锁定"。
 * `round2` 把台阶从 1pt 降到 0.01pt（相对误差 < 0.05%），肉眼与像素级都看不出浮动。
 *
 * ── 这个文件里不许出现什么 ────────────────────────────────────────────────────
 * 不许 import `react-native`（不许 `Dimensions` / `PixelRatio` / `useWindowDimensions`）：
 * 一旦能从屏幕读尺寸，就会有人写出"看着屏幕调字号"的第二套算法，锁定立刻失效。
 * 画布宽度必须由调用方**显式传进来**（`computeWatermarkPlan` 传的是 `layout.width`）。
 * 也不许 import React —— 这里是纯算术，探针脚本可以直接 `transpileModule` 后跑。
 */

/**
 * 水印的比例常量表 —— 全链路唯一的"字号从哪来"。
 *
 * 为什么集中成一个 `as const` 对象：这四个数分别被排版层（`geometry.ts`）与渲染层
 * （`DateStamp.tsx`）读到，散着写就会出现"排版按 0.032 算、渲染按别的数画"的漂移，
 * 而漂移的表现是**日期一个字一个字地被裁掉**，极难回溯。
 */
export const WATERMARK_RATIOS = {
  /**
   * 日期字号 ÷ **画布宽度**（逻辑点/逻辑点）。绝对基准，也是唯一的基准。
   *
   * ## 为什么是 0.032，而不是预设里那个 0.055
   *
   * `0.055` 是预设字段 `timestamp.fontSizeRatio` 的默认值（`presets.ts:90`），它在旧公式里
   * 乘的是**照片窗口宽**，而且实测 20/20 组都被 `短边 × 0.032` 压过去 —— 也就是说
   * v1.5.1 之后真正在成片上生效的比例系数**就是 0.032**（旧注释里"这条线在手机上够不到"
   * 指的就是它，0.032 那一版正是为了让它咬合上下限而抬上来的）。
   *
   * 把 0.055 直接搬到"画布宽度"这个新基准上会让日期瞬间涨到 1.72 倍
   * （390pt 视口的画布宽 358pt：358 × 0.055 = 19.69pt，而现行观感是 11.46pt），
   * 既违背本轮的硬前提「不改变 390pt 上的现有观感」，也让报告里的回归对照无法通过。
   * 所以新基准沿用**实测生效的那个系数**；预设权重（0.055 那一族）改由
   * `dateFontRatioOf()` 归一化后当**倍数**用，见那个函数的注释。
   */
  dateFont: 0.032,
  /**
   * 地名字号 ÷ 日期字号。
   *
   * 0.62 是视觉权重排出来的（地点是附注、日期是主角，等大的两行在 35mm 窄幅里很挤）；
   * v1.5.1 抬到 0.72：日期从 8pt 涨到 11pt 之后，地名若还按 0.62 缩会掉到 6.8pt ——
   * 比 iOS 上任何一寸可读小字都小，"附注"就变成看不清的灰影子了。
   * 0.72 让两行的视觉落差与上一版一致（11 : 7.92 ≈ 8 : 5.8），地名也终于落在 8pt 上。
   */
  placeFont: 0.72,
  /** 摄影代号行字号 ÷ 地名字号（规格：代号比地名再小一档）。 */
  codeFont: 0.9,
  /** 日期串的默认字距（逻辑点）。用户直接指定的"等宽粗体 + 字距 2"的显示感。 */
  dateLetterSpacing: 2,
} as const;

/**
 * 日期字号的**绝对下限**（逻辑点）。
 *
 * 只在"画布宽度 < 156.25pt"这种极端画布上才会被碰到 —— 比任何一台在售 iPhone 的
 * 合成舞台都窄（最窄的 iPhone SE 320pt 视口，拍立得画布宽 288pt、instax-mini 只有 229pt，
 * 按 0.032 算出来是 9.22 / 7.33pt，都在这条线**上面**）。
 *
 * 为什么不是旧版那个 11：11pt 在 229pt 的画布上是 4.8% 的画布宽，在大屏上又是 2.6%，
 * 它本身就是"比例失衡"的来源。下限降到 5 之后它只负责"别算出 0 或负数"，
 * 比例才真正说了算。探针会逐组断言它**一次都没生效**。
 */
export const MIN_DATE_FONT_PT = 5;

/**
 * 日期字号的**上限 ÷ 画布宽度**（纯比例意义的上限，12%）。
 *
 * 为什么用比例而不是旧版的绝对 96pt：绝对上限会随画布尺寸改变含义（96pt 在 229pt 画布上
 * 是 42%，在 1162pt 画布上只有 8%），而这一层要的是"上限也是比例"。
 *
 * 正常情况下这条线**永远够不到**（`dateFontOf` 的默认系数 0.032 只有它的 1/4）；
 * 它的作用是拦住"有人把 `ratio` 传成离谱值"（比如误传了字距或窗口比例），
 * 让字号最多停在画布宽的 12%，而不是直接把整张相纸铺满。
 */
export const MAX_DATE_FONT_CANVAS_RATIO = 0.12;

/**
 * 预设权重的基准（= `PRESET_DEFAULTS.timestamp.fontSizeRatio` 的 0.055）。
 *
 * 预设里的 `fontSizeRatio` 是"这一卷想印多大"的**相对权重**，不是绝对比例 ——
 * 它的绝对值含义（乘窗口宽）已经废除，留下的语义是"相对于默认预设的倍数"。
 * 除以基准值就得到这个倍数：0.055 → 1.0 倍（默认观感），0.066 → 1.2 倍（大一圈）。
 *
 * ⚠️ 别把这个 0.055 和 `WATERMARK_RATIOS.dateFont` 的 0.032 混起来：
 * 前者是**权重基准**（无量纲的分母），后者是**画布比例**（真正乘画布的那个数）。
 */
export const DATE_FONT_WEIGHT_BASELINE = 0.055;

/**
 * 等宽字体一个字符的 advance ÷ 字号。
 *
 * **0.6 是两平台能共用同一个数的原因**：iOS 的 `CourierNewPS-BoldMT`（Courier New）
 * 与 Android 的 `monospace`（Roboto Mono / Droid Sans Mono）都是 600/1000 em 的等宽字，
 * 所以这条宽度公式不需要 `Platform.select`，算出来的宽度在两个平台上逐点相同。
 *
 * ⚠️ **换字体之前先把这一条重新量一遍**（Windows 的 `courbd.ttf` 就是 iOS 那个同族，
 * 用 PIL 读 advance 即可）。它错了不会报错，只会让日期行的宽度整体偏 —— 靠右时表现为
 * "离相框边多远不对"，靠左时表现为"压没压到地名"。
 */
export const MONO_ADVANCE_RATIO = 0.6;

/** 日期串的默认字距（逻辑点）。与 `WATERMARK_RATIOS.dateLetterSpacing` 同源。 */
export const DATE_LETTER_SPACING: number = WATERMARK_RATIOS.dateLetterSpacing;

/**
 * 每个字形后面留的**冗余**（逻辑点）。
 *
 * 真字体实测（`courbd.ttf` = iOS `CourierNewPS-BoldMT` 同族）：`'`/数字/空格的 advance
 * **逐位等于** 600/1000 em，所以 `dateStampWidth` 算出来的数**恰好等于**文字墨迹的真实占宽，
 * 一分不多。而渲染侧 CoreText 是逐字形取整的，亚点级差值必然存在 —— 容器一旦等于文字宽，
 * 就只剩"从尾部收掉字形"（用户报的「掉字」）一条路。0.5pt/字形（11 个字形 = 5.5pt ≈ 5.8%）
 * 买的就是"容器 ≥ 文字"永远为真。
 */
export const DATE_GLYPH_SLACK = 0.5;

/** `split` 版式里地名与日期之间至少留的空档（逻辑点），免得两段字贴在一起。 */
export const SPLIT_GUTTER = 12;

/** 全角字形判定（CJK / 假名 / 全角标点）—— 地名宽度估算用。 */
const FULL_WIDTH_GLYPH =
  /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6]/u;

/** 两位小数。水印全链路的"精度收敛点"，免得 `0.055 * 10` 的浮点尾巴跑到宽度上。 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 把 `value` 收进 `[min, max]`；`min > max` 时以 `min` 为准（不抛错，排版层不接受异常）。 */
function clamp(value: number, min: number, max: number): number {
  const hi = Math.max(min, max);
  return Math.min(Math.max(value, min), hi);
}

/**
 * 日期字号的**唯一**算法：画布宽度 × 比例 → 上下限 → 两位小数。
 *
 * 为什么只吃画布宽度：见文件头。这里再加一条"为什么不是短边"——
 * `resolveFrameOrientation` 恒返回 `'portrait'`（`geometry.ts:121-126`），而 5 款相框的
 * 宽高比全部 ≤ 1，所以**画布宽度就是短边**，"宽度"与"短边"在当前相框库里是同一个数；
 * 用宽度是因为它直接对应"日期那一行能有多宽"，而且换到横版纸（哪天真的做了）时，
 * 宽度这条线仍然描述得通。
 *
 * `ratio` 留成参数是为了让调用方能乘上预设权重与墨色系数（见 `dateFontRatioOf`），
 * 但**默认值必须是 `WATERMARK_RATIOS.dateFont`** —— 谁都不许在这里另起一套比例。
 */
export function dateFontOf(canvasWidth: number, ratio: number = WATERMARK_RATIOS.dateFont): number {
  const width = Math.max(0, canvasWidth);
  return round2(clamp(width * ratio, MIN_DATE_FONT_PT, width * MAX_DATE_FONT_CANVAS_RATIO));
}

/**
 * 预设权重 × 墨色系数 → 真正传给 `dateFontOf` 的比例。
 *
 * 两道乘法的**顺序**和旧公式一致（先是预设权重，再乘墨色），因为"打字机体比液晶小一档"
 * 是相对关系，不该被上下限抹平 —— 乘在收口之前的话，琥珀与石墨在小画布上会被同一条下限
 * 压成一样大。
 *
 * ⚠️ 与旧公式的一处**有意行为变更**：旧公式里预设权重只能"把字号压小"
 * （因为它乘的是窗口宽，而窗口那条线总是输给短边线，权重只能让窗口线更小 —— 结果就是
 * **它根本没有生效过**）。现在权重是相对基准的倍数，调大调小都真的会动字号。
 */
export function dateFontRatioOf(weightRatio: number, toneScale: number = 1): number {
  return WATERMARK_RATIOS.dateFont * (weightRatio / DATE_FONT_WEIGHT_BASELINE) * toneScale;
}

/** 地名字号：日期字号的 `placeFont` 倍，最低 6pt（再小就不可读了）。 */
export function placeFontOf(dateFont: number): number {
  return Math.max(6, Math.round(dateFont * WATERMARK_RATIOS.placeFont));
}

/** 摄影代号行字号：地名字号的 `codeFont` 倍，最低 6pt。 */
export function codeFontOf(placeFont: number): number {
  return Math.max(6, Math.round(placeFont * WATERMARK_RATIOS.codeFont));
}

/**
 * 日期串的渲染宽度（逻辑点）。
 *
 * **这是"日期行宽度"的唯一定义**：`computeWatermarkPlan` 用它算 `quartz.width`，
 * `DateStamp` 拿它当容器宽度 —— 两边共用同一个函数，"算出来的宽度"与"画出来的宽度"
 * 在结构上不可能不一致，这就是"日期被截断"那个 bug 的修复方式。
 *
 * 为什么是 `length × (advance + letterSpacing)` 而**不减掉**尾字距：RN 的 `letterSpacing`
 * 在 iOS 走 `NSKernAttributeName`，**每个**字形后面都加一笔，最后一个也加。减掉会让容器
 * 比文字窄 2pt，靠右那一行就有被省略号收掉的风险。
 */
export function dateStampWidth(
  text: string,
  fontSize: number,
  letterSpacing: number = DATE_LETTER_SPACING,
): number {
  return round2(text.length * (fontSize * MONO_ADVANCE_RATIO + letterSpacing + DATE_GLYPH_SLACK));
}

/**
 * 一个地名串大概占多宽（逻辑点）。**这是估算，不是量出来的。**
 *
 * 为什么需要估算：`split` 版式里地名与日期共用一条基线，地名太长就必须**先精简**
 * （用户的要求是"超出就只留国家 + 城市"），而"太长"只有算过才知道。地名用的是
 * **比例字体**（中文按全角、拉丁按等宽 0.6em 近似），拿不到真字体度量，所以按上界估。
 *
 * ⚠️ 估算偏保守的方向是刻意的：**宁可多精简一次，也不要让地名去挤日期**。
 */
export function estimatePlaceTextWidth(text: string, fontSize: number, letterSpacing: number): number {
  let em = 0;
  for (const glyph of text) {
    em += FULL_WIDTH_GLYPH.test(glyph) ? 1 : MONO_ADVANCE_RATIO;
  }
  return round2(text.length * letterSpacing + em * fontSize);
}

/**
 * 这个地名是不是"太长了、该降级成国家 + 城市"。
 *
 * `maxWidth` 传的是这一行**真正能用的宽度**（`split` 里就是
 * `region.width - quartz.width - SPLIT_GUTTER`）。留 2% 的缝给估算误差。
 *
 * 为什么压缩是**全有或全无**、不做"截断加省略号"：`上海市 · 黄浦…` 比 `中国 · 上海`
 * 更没用 —— 后者至少是个完整地名。压缩形由 `placeNames.compactPlace` 产出。
 */
export function shouldCompactPlaceText(
  text: string,
  fontSize: number,
  letterSpacing: number,
  maxWidth: number,
): boolean {
  if (text.length === 0) {
    return false;
  }
  return estimatePlaceTextWidth(text, fontSize, letterSpacing) > maxWidth * 0.98;
}

/**
 * `split` 版式下地名那一行**还剩多少宽度**（逻辑点）。返回值可能是 0。
 *
 * 硬要求：「日期永远是完整的 8 位，绝不被左侧地名挤压」，而"地名放不放得下"只有把
 * 日期块与缝扣掉之后才知道。公式 `可利用宽度 = 水印区宽 − 日期块宽 − 缝`；
 * 日期块用的是 `quartz` 里**算好的那个宽度**（含尾字距与 `DATE_GLYPH_SLACK`），
 * 所以这里不存在第二套量法。
 *
 * ⚠️ 返回 0 表示"这一档连日期块都占满了"——调用方按 0 处理（不印地名），
 * **不许**拿它反推日期块宽度然后压缩日期。日期块是不可协商的那一方。
 */
export function splitPlaceAvailableWidth(
  regionWidth: number,
  quartzWidth: number,
  gutter: number = SPLIT_GUTTER,
): number {
  return Math.max(0, round2(regionWidth - quartzWidth - gutter));
}
