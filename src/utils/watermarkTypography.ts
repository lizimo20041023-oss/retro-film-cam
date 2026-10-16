/**
 * 水印排版的**唯一度量产地**（v1.8.0 §五）—— 纯函数 + 显式常量，没有任何运行时依赖。
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────────────
 * v1.7.0 的用户诉求：「严禁水印文本（城市名与日期）随画布整体缩放而动态像素浮动；
 * 必须给水印文本一套基于标准画布宽度的**绝对像素字号基准**；成片渲染画布上日期的
 * 像素高度与间距必须绝对恒定。」
 *
 * v1.7.0 用「画布宽度 × 比例（0.032）」达成了这件事，但那条式子外面还套着三层
 * **按设备分叉**的东西，它们各自都能把"锁定"重新解开：
 *   1. `MIN_DATE_FONT = 11` / `MAX_DATE_FONT = 96` 绝对上下限 —— 小画布（320pt 视口下
 *      instax 画布只有 229pt，按比例该是 7.33pt）会被下限抬到 11pt，于是"字号 ÷ 画布"
 *      在小屏与大屏之间差 1.5 倍，正是用户说的"随画布整体缩放而浮动"；
 *   2. `Math.round` 的 1pt 台阶 —— 390pt 上 11pt、430pt 上直接 13pt，跳过 12；
 *   3. 预设权重（`fontSizeRatio`）与墨色系数（`fontScale`）叠在比例上 —— 同一台设备
 *      换个相框/换个墨色，日期的"占画布比例"就变了。
 *
 * v1.8.0 的算法只剩**一次线性映射**，没有 clamp、没有 round 到整数、没有任何分支：
 *
 *     dateFont = absoluteFontPx(DATE_DESIGN_PX[glyphStyle], canvasWidth)
 *
 * `absoluteFontPx`（`constants/canvasBase.ts`）的定义是 `设计像素 × 画布宽度 ÷ 1440`，
 * 所以 `dateFont ÷ canvasWidth` 恒等于 `DATE_DESIGN_PX[glyphStyle] ÷ 1440` —— **与设备无关**。
 * 又因为成片像素 = 逻辑点 ×（成片长边 ÷ 画布长边），而 5 款相框的宽高比都是常数，
 * "字号 ÷ 画布宽度 = 常数"就等价于**成片上日期的像素高度是常数**，这就是"绝对像素锁定"。
 * 它现在不是"调出来"的，而是**结构上不可能不成立**。
 *
 * ── 为什么字距与分列缝走设计像素，而字形余量走绝对点 ─────────────────────────
 * 字距与缝是"文字像素"的一部分：字距若写成绝对点（旧版 2pt），大画布上字距÷字号就会变小，
 * 一行日期的疏密随画布变化 —— 用户报的"间距浮动"就是这个。所以它们和字号用**完全同一条**
 * `absoluteFontPx` 换算，在 `WATERMARK_DESIGN_PX` 里以 1440 基准上的设计像素给出。
 *
 * **字形余量是唯一的例外**（`DATE_GLYPH_SLACK = 0.5`，绝对点、不随画布缩放）：它的用途是
 * 补偿 CoreText 的**逐字形取整**，而取整发生在设备像素上，需要的余量≈半个点、与画布宽无关；
 * 渲染层 `DateGlyphs.tsx` 用的就是这个常量，排版层必须与它逐位对齐，否则 quartz 盒子会比
 * 真实墨迹宽、右对齐的日期随画布变大离白边越来越远（Lead 裁定，见 `dateGlyphSlackOf`）。
 * `WATERMARK_DESIGN_PX.dateGlyphSlack` 从此只是"参考画布上的展示值"。
 *
 * ── 这个文件里不许出现什么 ────────────────────────────────────────────────────
 * 不许 import `react-native`（不许 `Dimensions` / `PixelRatio` / `useWindowDimensions`）：
 * 一旦能从屏幕读尺寸，就会有人写出"看着屏幕调字号"的第二套算法，锁定立刻失效。
 * 画布宽度必须由调用方**显式传进来**（`computeWatermarkPlan` 传的是 `layout.width`）。
 * 也不许 import React —— 这里是纯算术，探针脚本可以直接 `transpileModule` 后跑。
 */

import {
  BASE_CANVAS_W,
  CODE_DESIGN_PX,
  DATE_DESIGN_PX,
  PLACE_DESIGN_PX,
  absoluteFontPx,
} from '../constants/canvasBase';
import type { DateGlyphStyleId } from '../types';

/**
 * 水印"非字号"度量的设计像素表 —— 单位与 `DATE_DESIGN_PX` 完全相同（1440 宽基准画布上的像素）。
 *
 * 三个数都锚在 v1.7.0 真机调校过的值上：在 358pt 的参考画布上换算回来分别是
 * 1.99pt / 0.50pt / 11.93pt，对应旧版的字距 2pt、字形余量 0.5pt、分列缝 12pt
 * （差 ≤ 0.6%，肉眼与像素级都看不出）。**它们不是新调的数**，只是把旧版"绝对点"
 * 重新表达成"随画布缩放"，这样字距÷字号才在所有画布上都是同一个数。
 */
export const WATERMARK_DESIGN_PX = {
  /**
   * 日期串的字距（10 个字形 = 89 设计像素 ≈ 6.2% 的日期行宽）。
   *
   * ⚠️ 与 `DATE_GLYPH_SLACK` 的分工：字距是**排版意图**（用户直接指定的"等宽粗体 + 字距"），
   * 字形余量是**渲染误差的保险**。两者不能合并 —— 合并后想单独调疏密就会同时改变容器宽度，
   * 而容器宽度是"日期绝不被截断"那条硬要求的唯一依据。
   */
  dateLetterSpacing: 8,
  /**
   * 每个字形后面留的**冗余**（2 设计像素 ≈ 0.14pt/字号比例）。
   *
   * 真字体实测（`courbd.ttf` = iOS `CourierNewPS-BoldMT` 同族）：`'`/数字/空格的 advance
   * **逐位等于** 600/1000 em，所以 `dateStampWidth` 算出来的数**恰好等于**文字墨迹的真实占宽，
   * 一分不多。而渲染侧 CoreText 是逐字形取整的，亚点级差值必然存在 —— 容器一旦等于文字宽，
   * 就只剩"从尾部收掉字形"（用户报的「掉字」）一条路。这点余量买的就是"容器 ≥ 文字"永远为真。
   */
  dateGlyphSlack: 2,
  /**
   * `split` 版式里地名与日期之间至少留的空档（48 设计像素 ≈ 12pt@358）。
   *
   * 为什么这条是**有量纲的长度**而不是字号比例：缝是两段文字之间的**留白**，它随画布缩放
   * 是对的（大画布上留白也该大），但它不该随"日期字号档位"变（换个字形档就让地名与日期
   * 贴在一起是荒谬的）。所以它锚在画布宽度上，与 `DATE_DESIGN_PX` 那五档无关。
   */
  splitGutter: 48,
} as const;

/**
 * 等宽字体一个字符的 advance ÷ 字号。
 *
 * **0.6 是两平台能共用同一个数的原因**：iOS 的 `CourierNewPS-BoldMT`（Courier New）
 * 与 Android 的 `monospace`（Roboto Mono / Droid Sans Mono）都是 600/1000 em 的等宽字，
 * 所以这条宽度公式不需要 `Platform.select`，算出来的宽度在两个平台上逐点相同。
 *
 * ⚠️ 它与 `utils/dateEngine.ts` 的 `MONO_ADVANCE` 是**同一个物理量**，两处必须逐字相同：
 * 排版层（本文件）算容器宽度、字形层（`dateEngine.ts`）算笔画占位，一旦分叉，
 * 表现是"日期被右边界裁掉半个字"，而不是报错。
 *
 * ⚠️ **换字体之前先把这一条重新量一遍**（Windows 的 `courbd.ttf` 就是 iOS 那个同族，
 * 用 PIL 读 advance 即可）。
 */
export const MONO_ADVANCE_RATIO = 0.6;

/**
 * 参考画布宽度（逻辑点）= iPhone 14/15/16 在 `computeDevelopStageBox` 下的合成画布宽。
 *
 * **它只用于文档与探针解释，代码里没有任何分支依赖它** —— v1.7.0 那套"按设备档位选择
 * 系数"的做法已经被 `absoluteFontPx` 的单一线性映射取代。留这个常量是为了让"在 358pt
 * 画布上换算回来是多少"这句人话能被机器验证：探针会断言
 * `absoluteFontPx(WATERMARK_DESIGN_PX.splitGutter, REFERENCE_CANVAS_W) ≈ 11.93`。
 */
export const REFERENCE_CANVAS_W = 358;

/** 两位小数。水印全链路的"精度收敛点"，免得 `0.055 * 10` 的浮点尾巴跑到宽度上。 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 日期字号的**唯一**算法：字形档的设计像素 → 绝对像素。
 *
 * 为什么按 `DateGlyphStyleId` 分档，而不是留一个比例系数：五档字形的**墨迹粗细不同**
 * （7 段数码管笔画细、CCD OSD 像点阵），要让它们在成片上有相同的视觉重量，字号就必须
 * 分别调 —— 这是"设计像素"该表达的东西（人眼在 1440 宽的基准画布上调到顺眼），
 * 而不是让五个调用方各自乘一个魔数。档位表在 `constants/canvasBase.ts` 的 `DATE_DESIGN_PX`。
 *
 * `glyphStyle` 的默认值 `'led_7seg'` = `DEFAULT_SETTINGS.dateEngine.glyphStyle`，
 * 也是 v1.7.0 的观感。**新代码请显式传档位**；给默认值是为了不破坏
 * `computeTimestampLayout` 那类"只要一个日期行尺寸"的旧调用。
 *
 * 没有上下限：探针会在实测的全部画布宽上断言旧版的 clamp 一次都没生效
 * （最窄 229pt 画布 → 7.0pt；最宽 1162pt → 35.5pt，都远远在旧限 11 / 96 之外）。
 * 留着 clamp 只会再造一个"按设备分叉"的入口。
 */
export function dateFontOf(canvasWidth: number, glyphStyle: DateGlyphStyleId = 'led_7seg'): number {
  return absoluteFontPx(DATE_DESIGN_PX[glyphStyle], canvasWidth);
}

/** 日期串的字距（逻辑点）：与字号同一条换算，所以"字距 ÷ 字号"在所有画布上恒定。 */
export function dateLetterSpacingOf(canvasWidth: number): number {
  return absoluteFontPx(WATERMARK_DESIGN_PX.dateLetterSpacing, canvasWidth);
}

/**
 * 每个字形后面留的渲染余量（逻辑点）—— **绝对点，不随画布缩放**。
 *
 * 与 `src/constants/dateEngine.ts` 的 `GLYPH_SLACK` **同值**（探针断言两者逐位相等），
 * 也是 `DateGlyphs.tsx` 逐字排字时用的那个数：排版层算容器宽度、渲染层量真实墨迹，
 * 两边差一个余量就会让"盒子 ≥ 墨迹"不成立。
 *
 * 为什么它是全链路里唯一**不**随画布缩放的度量：它的用途不是观感，而是**设备像素取整
 * 补偿** —— CoreText 逐字形取整发生在设备像素上，需要的冗余≈半个点，与画布宽无关。
 * 字号/字距/缝都该缩放（那三个量决定"看起来多大"），这一条不该。
 *
 * ⚠️ 曾经写成 `2W/1440`（随画布缩放），后果是排版层与渲染层只在参考画布 358pt 上对齐：
 * 956pt 画布上两者差 62.41%（≈11pt），quartz 盒子比真实墨迹宽，**右对齐的日期会随画布
 * 变大而离白边越来越远**。Lead 裁定统一到常量（m09983/m10059 §八.1）。
 */
export const DATE_GLYPH_SLACK = 0.5;

/**
 * 每个字形后面留的渲染余量（逻辑点）。**恒为 {@link DATE_GLYPH_SLACK}。**
 *
 * 签名保留 `canvasWidth` 形参只为所有调用点零改动；这个量按上面的理由与画布宽无关，
 * 所以参数不再被使用（下划线前缀避免 `noUnusedParameters`）。
 *
 * `WATERMARK_DESIGN_PX.dateGlyphSlack` 与 `referenceCanvasMetrics()` **未随之改动** ——
 * 它们从此只是"参考画布上的展示值"（358pt 上换算回 0.4972 ≈ 0.5），不再是换算来源。
 */
export function dateGlyphSlackOf(_canvasWidth: number): number {
  return DATE_GLYPH_SLACK;
}

/** `split` 版式里地名与日期之间的空档（逻辑点）。 */
export function splitGutterOf(canvasWidth: number): number {
  return absoluteFontPx(WATERMARK_DESIGN_PX.splitGutter, canvasWidth);
}

/**
 * 地名字号（逻辑点）：`PLACE_DESIGN_PX`（32 设计像素）的绝对像素。
 *
 * ⚠️ 与 v1.7.0 的关系（Lead 裁定）：旧版地名 = `round(max(6, 日期字号 × 0.72))`，
 * 在 358pt 画布上算出 8pt；新版 7.96pt —— `32 ≈ 44 × 0.72` **保留了那条比例**，
 * 去掉的只是"小于 6pt 就抬到 6pt"的设备分叉。所有画布上「地名 ÷ 日期」恒为 0.727。
 *
 * 为什么不是 40（= 0.909 倍日期）：本轮用户要的是"字号绝对锁定"，**没有**要求把地名
 * 放大 26%；无请求的观感变化是这一轮最该避免的东西。
 */
export function placeFontOf(canvasWidth: number): number {
  return absoluteFontPx(PLACE_DESIGN_PX, canvasWidth);
}

/**
 * 摄影代号行字号（逻辑点）：`CODE_DESIGN_PX`（29 设计像素）的绝对像素。
 *
 * ⚠️ 层次锚在**地名**上，不是日期：v1.7.0 的签名是
 * `codeFontOf(placeFont) = Math.max(6, Math.round(placeFont * 0.9))`，所以 0.9 是"代号 ÷ 地名"。
 * 29 ÷ 32 = 0.9063（358pt 上 7.21pt ÷ 7.96pt = 0.9058），最贴近 v1.7.0 的 0.9 ——
 * `PLACE_DESIGN_PX` 从 40 收到 32 之后，`CODE_DESIGN_PX` 必须同步收到 29 才能保住这条关系
 * （留在 30 就是 0.9375，比设计大 4.1%，代号与地名会在观感上撞在一起）。Lead 裁定。
 */
export function codeFontOf(canvasWidth: number): number {
  return absoluteFontPx(CODE_DESIGN_PX, canvasWidth);
}

/**
 * 日期串的渲染宽度（逻辑点）。
 *
 * **这是"日期行宽度"的唯一定义**：`computeWatermarkPlan` 用它算 `quartz.width`，
 * `DateStamp` 拿它当容器宽度 —— 两边共用同一个函数，"算出来的宽度"与"画出来的宽度"
 * 在结构上不可能不一致，这就是"日期被截断"那个 bug 的修复方式。
 *
 * 三项全部 ∝ 字号（`fontSize × 0.6` 是字身、字距与余量由调用方从 `*Of(canvasWidth)` 取），
 * 所以宽度÷字号恒定 —— 换画布时这一行**等比缩放**，不会出现"大画布上日期反而更挤"。
 *
 * 为什么**不减掉**尾字距：RN 的 `letterSpacing` 在 iOS 走 `NSKernAttributeName`，
 * **每个**字形后面都加一笔，最后一个也加。减掉会让容器比文字窄一个字距，靠右那一行
 * 就有被省略号收掉的风险。
 */
export function dateStampWidth(
  text: string,
  fontSize: number,
  letterSpacing: number,
  glyphSlack: number,
): number {
  return round2(text.length * (fontSize * MONO_ADVANCE_RATIO + letterSpacing + glyphSlack));
}

/** 全角字形判定（CJK / 假名 / 全角标点）—— 地名宽度估算用。 */
const FULL_WIDTH_GLYPH =
  /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6]/u;

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
 * `region.width - quartz.width - 缝`）。留 2% 的缝给估算误差。
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
 * 日期块用的是 `quartz` 里**算好的那个宽度**（含尾字距与字形余量），所以这里不存在第二套量法。
 *
 * `gutter` **必填**：缝是随画布缩放的（`splitGutterOf(canvasWidth)`），给默认值等于
 * 允许调用方漏传后悄悄用某个设备档的值 —— 那正是本轮要拆掉的东西。
 *
 * ⚠️ 返回 0 表示"这一档连日期块都占满了"——调用方按 0 处理（不印地名），
 * **不许**拿它反推日期块宽度然后压缩日期。日期块是不可协商的那一方。
 */
export function splitPlaceAvailableWidth(
  regionWidth: number,
  quartzWidth: number,
  gutter: number,
): number {
  return Math.max(0, round2(regionWidth - quartzWidth - gutter));
}

/**
 * 供探针/报告引用的一行对照：在参考画布上把每个设计像素换算回逻辑点。
 *
 * 放在这里（而不是探针脚本里）是因为它也是**人读文档时最需要的那个数**：
 * "44 设计像素到底多大"只有换算成 pt 才有意义。返回顺序固定为
 * `[日期(led_7seg), 地名, 代号, 字距, 余量, 缝]`。
 */
export function referenceCanvasMetrics(): number[] {
  return [
    absoluteFontPx(DATE_DESIGN_PX.led_7seg, REFERENCE_CANVAS_W),
    absoluteFontPx(PLACE_DESIGN_PX, REFERENCE_CANVAS_W),
    absoluteFontPx(CODE_DESIGN_PX, REFERENCE_CANVAS_W),
    absoluteFontPx(WATERMARK_DESIGN_PX.dateLetterSpacing, REFERENCE_CANVAS_W),
    absoluteFontPx(WATERMARK_DESIGN_PX.dateGlyphSlack, REFERENCE_CANVAS_W),
    absoluteFontPx(WATERMARK_DESIGN_PX.splitGutter, REFERENCE_CANVAS_W),
  ];
}

/** 基准画布宽度（1440）在这里也导出一次，免得调用方为了算比例去 import 两个模块。 */
export { BASE_CANVAS_W };
