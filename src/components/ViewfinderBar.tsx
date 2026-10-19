/**
 * 取景器下方那一条参数栏：收拢态 = 四颗**常驻**胶囊（v2.1.0 起：三颗参数 + 一颗预设强度），
 * 展开态 = 一块 86%×48 的液态玻璃面板。
 *
 * ── 为什么几何常量住在这个文件里（task-6 的结构性修复，别搬回去）─────────────
 * 上一轮这些常量（`CAPSULE_WIDTH` / `RULER_RANGE_PX` / `MARK_GAP` …）住在
 * `ParameterScrubBar`，而本文件反向 import 它们；`CameraScreen` 又 import 了
 * `ParameterScrubBar`，于是形成 `CameraScreen → ParameterScrubBar → ViewfinderBar →
 * ParameterScrubBar` 的 require 环。Metro 的 CJS 互操作下，本文件**模块顶层**读到的
 * 那些跨模块常量全是 `undefined`：`Math.round(undefined / 8)` = NaN →
 * `Array.from({ length: NaN })` = `[]` → 一根刻度都没有、刻度高度是 `undefined`（高 0）。
 * 真机上就是用户报的「展开后是个空洞灰框」。药方只有一条：**几何只有一个所有者，且它
 * 不反向依赖手势层**。本文件是渲染层，只被 `ParameterScrubBar` 单向 import，所以几何
 * 放这里；手势层需要哪几个数字就 import 哪几个（`FocalOption` 走 `import type`，
 * 类型导入会被编译期完全抹掉，不构成运行时依赖）。
 *
 * 本文件里没有一行手势代码 —— 四颗胶囊的点击、长按、滑动都在 `ParameterScrubBar` 的
 * 捕获阶段被接走（见那个文件的 `onStartShouldSetPanResponderCapture`）。
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PRESET_INTENSITY_OPTIONS, intensityOption } from '../constants/intensity';
import { ASSUMED_LENS_NATIVE_MM } from '../constants/lenses';
import { UI_MONO, useTheme } from '../constants/theme';
import { useI18n } from '../i18n';
import { GLASS_TEXT_COLOR, glassTextShadow, LiquidGlassView } from './LiquidGlassView';

import type { FocalOption } from './ParameterScrubBar';
import type { PresetIntensityTier } from '../types';

/** 三颗**可滑**参数胶囊（wb/zoom/ev）的身份；「预设强度」是六档离散值，不属于可滑集合。这个词表由本文件定义、手势层引用。 */
export type ScrubbableParameter = 'wb' | 'zoom' | 'ev';

/**
 * 参数栏里可以展开的**全部**胶囊（v2.1.0 起四颗）：三颗连续参数 + 一颗「预设强度」。
 *
 * 强度是六档离散值，手势语义与连续参数不同（只做"轻点展开 → 轻点选档"，没有刻度尺、
 * 不参与滑动），但它的宽度、命中区、无障碍动作和另外三颗完全同构 —— 所以共用同一条
 * 胶囊行，只把它登记进 `CapsuleParameter`，让手势层按 dial 分支处理。
 */
export type CapsuleParameter = ScrubbableParameter | 'intensity';

// ── 一次两态过渡（数字的来历见各处注释）────────────────────────────────────
/**
 * 展开 160ms / 收拢 180ms。为什么不对称：展开是"我按下了"的直接回应，要跟手、要快；
 * 收拢是"我看完了"的收尾，稍微慢一点反而更松弛，也能避免手指刚离开就开始缩造成的
 * 闪烁感。两者都用 `useNativeDriver: true` —— 只动 opacity 与 scale，不触发 JS 帧。
 */
const EXPAND_MS = 160;
const COLLAPSE_MS = 180;

// ── 外壳与胶囊几何 ─────────────────────────────────────────────────────────
/**
 * 面板宽 = 窗口的 86%。为什么不铺满：这是"上一层"的浮层，两侧留白既是视觉分层的
 * 提示，也让它在 iPhone SE 这类窄屏上不至于贴到边缘。比例只写一次，
 * 百分比字符串由它推出来 —— 写死在两处迟早对不上。
 */
export const DIAL_WIDTH_FRACTION = 0.86;
export const DIAL_WIDTH_RATIO = `${DIAL_WIDTH_FRACTION * 100}%`;
/**
 * 面板高 48、胶囊高 30。48 是"两行内容（14 的读数行 + 24 的刻度视窗）+ 上下各 5 的
 * 内边距"算出来的下限，就是它、不留余量 —— 壳高恒定，收拢/展开才有"原地过渡"可言
 * （见 `shell` 的注释）。30 是胶囊里 13 的图标与 11pt 等宽数字都放得下、
 * 又明显比 48 的面板矮一截的高度。
 */
export const DIAL_HEIGHT = 48;
export const CAPSULE_HEIGHT = 30;
/** 四颗胶囊之间的 8pt：够手指区分"这是四颗"，又小到仍读作"一组"。 */
export const CAPSULE_GAP = 8;
/** 胶囊左右内边距 9：图标到圆头的呼吸位。圆角是 `CAPSULE_HEIGHT / 2` 的胶囊圆。 */
export const CAPSULE_PAD_H = 9;
/** 行左右各留 10pt：窗口再窄也不许胶囊贴边（见 `buildCapsules` 的钳制）。 */
export const CAPSULE_ROW_EDGE = 10;
/** 图标 13×13、图标与文字间距 5、读数与中文词间距 4（都是上一轮定下的比例）。 */
export const GLYPH_SIZE = 13;
export const CAPSULE_ICON_GAP = 5;
export const CAPSULE_WORD_GAP = 4;
/**
 * 胶囊最小宽 64：四颗胶囊（v2.1.0 加了强度档）挤在一条行里，每颗的可用宽度比三颗
 * 时代少了约 30pt；64 仍放得下 13 的图标 + 4 个 11pt 等宽字符（`130%` / `AUTO`），
 * 再窄读数就要和图标打架。
 */
export const CAPSULE_MIN_WIDTH = 64;
/**
 * 用户要的"磨砂深灰底"与"1px 白描边"。
 *
 * 底色的实现方式值得记一笔：`LiquidGlassView` 的 `BlurView` 之外还有一层 `overlay`
 * 色，默认是 `rgba(18,18,22,0.42)`（几乎全黑）。把 overlay 换成这个半透明深灰，
 * 就精确等于"磨砂深灰"，而且比把深灰画在玻璃**下面**更稳 —— 它压在模糊层之上，
 * 不管背后是天空还是暗墙，颜色都不会被透出来的画面改掉。描边交给外层 View 的
 * `borderWidth`，同时 `rim={false}` 关掉玻璃自带的渐变边框，否则会和这条硬边
 * 叠成两层边。这两个值是按用户原话定的，不是调出来的。
 */
/**
 * 胶囊玻璃层与描边：用户给的色值，**逐字节照抄**（`rgba(40,40,45,0.65)` /
 * `rgba(255,255,255,0.32)`，用户原文没有空格）。这两个不是主题色，而是"机身玻璃材质"
 * 的一部分 —— 与 `LiquidGlassView.tsx` 里那批模块级 `RIM_COLORS`/`OVERLAY_*` 同类；
 * 随主题变的是**状态色**（琥珀指针、读数），那部分一律走 `useTheme()`。
 * 玻璃层仍保留（`overlay` 压在上面），所以"半透明磨砂深灰底"是真实模糊 + 深灰色罩。
 */
const CAPSULE_OVERLAY = 'rgba(40,40,45,0.65)';
const CAPSULE_BORDER = 'rgba(255,255,255,0.32)';
const CAPSULE_BORDER_WIDTH = 1;
/** 展开后的面板底比胶囊更深一点：白色刻度要在它上面立得住（对比度，不是审美）。 */
const DIAL_OVERLAY = 'rgba(18, 18, 22, 0.55)';

// ── 刻度尺几何（同时是手势层的换算依据）────────────────────────────────────
/**
 * 刻度间距 8pt、主刻度 14 高、次刻度 7 高、透明度 0.85 / 0.35。
 *
 * 这些数字按用户真机反馈重定过一轮：上一版主 12 / 次 6，在深色玻璃上"看不清、
 * 像一片空洞"，所以主刻度加到 14、次刻度加到 7（比值仍是 2:1，一眼能分出主次），
 * 透明度维持 0.85 / 0.35 —— 次刻度再亮就会让整条尺子变成一块白噪声。
 * 颜色是纯白（`GLASS_TEXT_COLOR`），和高光文字同源；琥珀橙只留给指针与读数，
 * 两个颜色分工明确，尺子才不会和值抢注意力。
 *
 * 刻度条数：用户指定 **41 根**、每 5 格一根主刻度（周期 5×8 = 40pt）。
 * 但 41 根只铺到 328pt，而 390pt 屏的面板视窗有约 335pt —— 照字面画 41 根会在最右侧
 * 露一小段白。所以条数由 `rulerMarkCount` 按"视窗 + 一个周期"算（390pt 屏 → 48 根，
 * 其中约 43 根在视窗内），保证任何屏宽都不露白；规格里的 41 根是这套算法在更窄的视窗
 * 上的取值。**这一点要写进报告的「拿不准的」**（我没有真机，无法确认用户要的是"正好
 * 41 根"还是"铺满不露白"）。
 */
export const MARK_GAP = 8;
export const MARK_MAJOR = 14;
export const MARK_MINOR = 7;
export const MARK_MAJOR_ALPHA = 0.85;
export const MARK_MINOR_ALPHA = 0.35;
/** 刻度线宽 1pt，正好落在像素栅格上，不糊。 */
const MARK_WIDTH = 1;
/** 每 5 格一根主刻度。 */
const MARK_MAJOR_EVERY = 5;
/** 尺子的周期 = 主刻度周期 40pt。相位按这个取模（见 `rulerPhase`）。 */
export const MARK_PERIOD_PX = MARK_GAP * MARK_MAJOR_EVERY;
const MARK_COLOR = GLASS_TEXT_COLOR;

/**
 * 指针：宽 2、高 18，正中固定、琥珀橙。
 *
 * 高 18 比主刻度的 14 高 4 —— 指针要能"压住"主刻度，视觉上才是读数基准；
 * 宽 2 是 1pt 的两倍，避免和刻度线一样细而糊在一起。
 * `RULER_VIEWPORT_HEIGHT = 指针高 + 6`：上下各留 3pt，指针不会被视窗边缘切掉。
 */
export const POINTER_WIDTH = 2;
export const POINTER_HEIGHT = 18;
export const RULER_VIEWPORT_HEIGHT = POINTER_HEIGHT + 6;
/** 展开面板的内边距：横向 12（让刻度不顶到圆头），纵向 5（见 DIAL_HEIGHT 的账）。 */
export const DIAL_PAD_H = 12;
const DIAL_PAD_V = 5;
/** 读数行高 14：9pt 的名称 + 13pt 的读数并排，14 刚好框住，不挤刻度。 */
const HEAD_HEIGHT = 14;

// ── 焦段分段胶囊条几何 ─────────────────────────────────────────────────────
/**
 * 焦段改成"四档定焦"后的分段条：段高 34、段间距 6、圆角 6。
 *
 * 为什么焦段不画刻度尺：真机上连续每毫米地滑会一路经过多个物理镜头的切换点，
 * 切换镜头要重配原生会话，手势就在那一刻断了（用户报的「卡死在 13~15mm」）。
 * 定焦档位把"能去哪"限制成有限几个值，滑选只改高亮、松手才提交一次，物理切换
 * 就只会发生在用户明确落脚的那一刻。34 是 48 的面板减上下各 5 的边距后、还留
 * 4pt 呼吸的高度；6 的间距保证相邻两段不连成一条。
 */
export const FOCAL_SEGMENT_HEIGHT = 34;
export const FOCAL_SEGMENT_GAP = 6;
const FOCAL_SEGMENT_RADIUS = 6;

/** 分段条的可排布宽度：面板宽减去左右内边距。 */
export function focalSegmentInnerWidth(windowWidth: number): number {
  return Math.max(0, DIAL_WIDTH_FRACTION * windowWidth - DIAL_PAD_H * 2);
}

/** 单段宽度。段数变化（有没有长焦档）时按比例分。 */
export function focalSegmentWidth(innerWidth: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, (innerWidth - FOCAL_SEGMENT_GAP * (count - 1)) / count);
}

/**
 * 落点在第几段 —— 手势层与渲染层**共用这一个函数**（上一轮 require 环的教训：
 * 同一套几何算两遍就一定漂）。
 */
export function focalSegmentIndexAtOffset(offsetFromRowLeft: number, innerWidth: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  const pitch = focalSegmentWidth(innerWidth, count) + FOCAL_SEGMENT_GAP;
  if (pitch <= 0) {
    return 0;
  }
  const raw = Math.floor((offsetFromRowLeft + FOCAL_SEGMENT_GAP / 2) / pitch);
  return Math.min(Math.max(raw, 0), count - 1);
}

/**
 * 尺子里的刻度数：视窗宽 + 一个周期，再向上取整到格。
 *
 * 为什么要"视窗 + 一个周期"而不是写死 41：41 根 × 8pt = 328pt，铺不满 390pt 屏的
 * 335pt 视窗，最右侧会露白；多出来的那一个周期是给相位取模留的余量
 * （`rulerPhase` 会把尺子平移 0~40pt）。390pt 屏算得 48 根，其中约 43 根在视窗里。
 */
export function rulerMarkCount(windowWidth: number): number {
  const viewport = DIAL_WIDTH_FRACTION * windowWidth;
  return Math.ceil((viewport + MARK_PERIOD_PX) / MARK_GAP) + 1;
}

/**
 * 尺子位移：`offset` 是"值 → 像素"的线性位移（负值向左），按刻度周期 40pt 取模。
 *
 * 为什么可以取模：刻度是等距周期纹理，整周期平移后自己和自己重合，视觉上与一条
 * 无限长的尺子在滑完全等价；而值本身由顶部那行数字负责，刻度只负责手感与档位感。
 * 取模之后尺子永远只需约 41 根刻度，不必随拖动范围变长。
 * 返回负值：值变大时尺子向右走（跟着手指的方向）。
 */
export function rulerPhase(offset: number): number {
  const modulo = ((offset % MARK_PERIOD_PX) + MARK_PERIOD_PX) % MARK_PERIOD_PX;
  return -modulo;
}

// ── 读数格式化 ─────────────────────────────────────────────────────────────
/**
 * 色温写成 `+0.28` / `-0.15` / `0.00`：两位小数是因为一个格子的跨度
 * （`ParameterScrubBar` 里每 0.02 一档的 1/6）本来就是百分位级别，
 * 少写一位会让相邻两格的读数看起来一模一样。
 */
export function formatScrubTemperature(value: number): string {
  const clamped = Math.min(Math.max(value, -1), 1);
  if (Math.abs(clamped) < 0.005) {
    return '0.00';
  }
  return `${clamped > 0 ? '+' : '-'}${Math.abs(clamped).toFixed(2)}`;
}

/** 曝光写成 `+0.7` / `0.0`：相机曝光补偿本来就是 1/3 档，一位小数足够表达。 */
export function formatScrubExposure(value: number): string {
  if (Math.abs(value) < 0.05) {
    return '0.0';
  }
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}`;
}

/**
 * 「预设强度」胶囊/分段条的显示文本：AUTO 档写 `AUTO`，其余写百分比（`130%`）。
 *
 * 为什么不写乘数：用户选的是档位、看的是百分比；`1.3` 这种只在渲染侧存在的数字
 * 出现在 UI 上没人认。
 */
export function formatIntensityTier(tier: PresetIntensityTier): string {
  return tier === 'auto' ? 'AUTO' : intensityOption(tier).percent;
}

/**
 * 倍率写法：0.5 → `0.5×`，1 → `1×`，35/26 → `1.35×`（去掉无意义的小数 0）。
 *
 * 两位小数而不是一位：v1.8.4 的 35mm 档倍率是 `35/26 = 1.346…`，一位小数会显示
 * `1.3×`（把 1.346 说成 1.3）；两位刚好落回用户能对照的 `1.35×`。0.5 / 1 / 2
 * 这类整数倍在两位精度下仍然输出 `0.5× / 1× / 2×`，视觉不变。
 */
function formatMultiplier(multiplier: number): string {
  return `${Number(multiplier.toFixed(2))}×`;
}

/** 离给定焦距最近的档位。用于把"当前 mm"翻译成丝印倍数（1.346 → 1.35×）。 */
function nearestFocalOption(
  focalMm: number,
  options: readonly FocalOption[],
): FocalOption | undefined {
  let best: FocalOption | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const distance = Math.abs(option.mm - focalMm);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 焦段胶囊的两行读数：`26mm` / `1×`。
 *
 * 为什么分两行：一行放不下 `26mm 1×` 再加中文词（定宽胶囊会被挤爆），
 * 而"毫米数"和"倍数"是两种用户都会用的说法（老摄影看 mm，手机用户看 ×），
 * 砍掉任何一个都会让一半人看不懂。两行都是等宽字体，右对齐成一列。
 * 倍数优先取档位表里的丝印值（v1.8.4 的 35 档 `digitalFactor = 35/26`，丝印就是
 * 35mm / 1.35×），拿 mm 现除会得到 1.346× 这种没人认的数字。
 */
export function focalReadoutLines(focalMm: number, options: readonly FocalOption[]): readonly string[] {
  const rounded = Math.round(focalMm);
  const option = nearestFocalOption(rounded, options);
  const multiplier = option?.multiplier ?? rounded / ASSUMED_LENS_NATIVE_MM.wide;
  return [`${rounded}mm`, formatMultiplier(multiplier)];
}

// ── 胶囊内容与命中区（手势层与渲染层共用的唯一来源）─────────────────────────
export interface CapsuleSpec {
  readonly dial: CapsuleParameter;
  /** 单行读数（色温/曝光）。焦段用 `lines`。 */
  readonly value: string;
  /** 双行读数（焦段）。色温/曝光为空。 */
  readonly lines: readonly string[];
  /** 胶囊里的中文词；窗口太窄时会被丢掉（见 `buildCapsules`）。 */
  readonly word: string;
  /** 算出来的胶囊宽度 —— 玻璃层是绝对定位的，宽度撑不开，必须提前算。 */
  readonly width: number;
}

const DIAL_ORDER: readonly CapsuleParameter[] = ['wb', 'zoom', 'ev', 'intensity'];
/** 11pt 等宽字体一个字符的估值（等宽，估得比较准；宁可略大，见 `buildCapsules`）。 */
const VALUE_CHAR_PX = 6.6;
/** 10pt 双行读数的估值。 */
const LINE_CHAR_PX = 6.2;
/** 9pt 中日韩词一个字的估值（全角，约等于字号）。 */
const WORD_CHAR_PX = 9.6;

function capsuleWidth(value: string, lines: readonly string[], word: string): number {
  const textWidth = Math.max(
    value.length * VALUE_CHAR_PX,
    ...lines.map((line) => line.length * LINE_CHAR_PX),
    0,
  );
  const wordWidth = word === '' ? 0 : CAPSULE_WORD_GAP + word.length * WORD_CHAR_PX;
  // 加上 1pt 描边：RN 的宽度是 border-box，描边会从内容区里扣，
  // 不补这 2pt 的话最紧的那颗胶囊会被裁掉半个字。
  return (
    CAPSULE_PAD_H * 2 +
    CAPSULE_BORDER_WIDTH * 2 +
    GLYPH_SIZE +
    CAPSULE_ICON_GAP +
    textWidth +
    wordWidth
  );
}

/**
 * 四颗胶囊的内容与宽度 —— **手势层和渲染层都调这一个函数**。
 *
 * 为什么要"估"宽：`LiquidGlassView` 的玻璃层是 `StyleSheet.absoluteFill` 铺满的，
 * 它的宽度完全由外层 View 决定，内容撑不开；而手势命中区又必须和真实布局像素对齐。
 * 于是宽度必须在渲染之前算出来，且两处必须用同一个函数算（上一轮 require 环留下的
 * 教训就是"同一套几何算两遍就一定漂"）。
 *
 * 估错了会怎样：宁可宽一点（视觉上松一点），也不能窄 —— 窄了文字会被裁。
 * 真的塞不下时**先丢中文词、再压到上限**：一行四颗胶囊 + 三个 8pt 间距 + 左右各 10pt
 * 的窗口约束是硬红线，绝不能把胶囊挤出屏幕。
 */
export function buildCapsules(input: {
  readonly temperature: number;
  readonly focalMm: number;
  readonly exposure: number;
  readonly focalOptions: readonly FocalOption[];
  readonly intensityTier: PresetIntensityTier;
  readonly words: Readonly<Record<CapsuleParameter, string>>;
  readonly windowWidth: number;
}): readonly CapsuleSpec[] {
  const wbValue = formatScrubTemperature(input.temperature);
  const evValue = formatScrubExposure(input.exposure);
  const intensityValue = formatIntensityTier(input.intensityTier);
  const zoomLines = focalReadoutLines(input.focalMm, input.focalOptions);
  const available = Math.max(
    CAPSULE_MIN_WIDTH,
    (input.windowWidth - CAPSULE_ROW_EDGE * 2 - CAPSULE_GAP * (DIAL_ORDER.length - 1)) /
      DIAL_ORDER.length,
  );

  return DIAL_ORDER.map((dial) => {
    const value =
      dial === 'wb'
        ? wbValue
        : dial === 'ev'
          ? evValue
          : dial === 'intensity'
            ? intensityValue
            : '';
    const lines = dial === 'zoom' ? zoomLines : [];
    const word = input.words[dial];
    const natural = capsuleWidth(value, lines, word);
    if (natural <= available) {
      return { dial, value, lines, word, width: Math.max(natural, CAPSULE_MIN_WIDTH) };
    }
    return {
      dial,
      value,
      lines,
      word: '',
      width: Math.min(Math.max(capsuleWidth(value, lines, ''), CAPSULE_MIN_WIDTH), available),
    };
  });
}

/** 一行胶囊的总宽（父级把它居中，所以左边缘 = 窗口宽与总宽之差的一半）。 */
export function capsuleRowWidth(capsules: readonly CapsuleSpec[]): number {
  return (
    capsules.reduce((total, capsule) => total + capsule.width, 0) +
    CAPSULE_GAP * Math.max(0, capsules.length - 1)
  );
}

export interface CapsuleHitZone {
  readonly dial: CapsuleParameter;
  /** 相对胶囊行左边缘的区间。 */
  readonly from: number;
  readonly to: number;
}

/** 命中区 = 胶囊的排布矩形。手势层拿它把 `pageX` 翻译成"按到了哪一颗"。 */
export function capsuleHitZones(capsules: readonly CapsuleSpec[]): readonly CapsuleHitZone[] {
  const zones: CapsuleHitZone[] = [];
  let x = 0;
  for (const capsule of capsules) {
    zones.push({ dial: capsule.dial, from: x, to: x + capsule.width });
    x += capsule.width + CAPSULE_GAP;
  }
  return zones;
}

// ── 图标（纯 View 画的线框，13×13，颜色与文字同源）──────────────────────────
function ThermoGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.thermoStem} />
      <View style={styles.thermoBulb} />
      <View style={styles.thermoCore} />
    </View>
  );
}

function LensGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.lensRing} />
      <View style={styles.lensCore} />
    </View>
  );
}

function SunGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.sunRing} />
      <View style={styles.sunRayTop} />
      <View style={styles.sunRayBottom} />
      <View style={styles.sunRayLeft} />
      <View style={styles.sunRayRight} />
    </View>
  );
}

/**
 * 强度图标：三根递升的竖条 —— 底片密度/浓度最直观的写法，和「强度」这个词同构。
 * 13pt 的框里 4/7/10 三档高度递增，颜色与文字同源。
 */
function IntensityGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={[styles.intensityBar, styles.intensityBarShort]} />
      <View style={[styles.intensityBar, styles.intensityBarMid]} />
      <View style={[styles.intensityBar, styles.intensityBarTall]} />
    </View>
  );
}

function glyphFor(dial: CapsuleParameter) {
  if (dial === 'wb') {
    return <ThermoGlyph />;
  }
  if (dial === 'zoom') {
    return <LensGlyph />;
  }
  if (dial === 'intensity') {
    return <IntensityGlyph />;
  }
  return <SunGlyph />;
}

// ── 刻度尺 ─────────────────────────────────────────────────────────────────
/**
 * 刻度尺 = 白色刻度阵列 + 正中固定的琥珀指针（`RulerStrip` 只在 props 变时重渲染，
 * 位移靠 `Animated.Value` 直接改 transform，不经过 React）。
 */
const RulerStrip = memo(function RulerStrip({
  scroll,
  pointerColor,
  markCount,
}: {
  scroll: Animated.Value;
  pointerColor: string;
  markCount: number;
}) {
  return (
    <View style={styles.rulerClip}>
      <Animated.View style={[styles.marks, { width: markCount * MARK_GAP, transform: [{ translateX: scroll }] }]}>
        {Array.from({ length: markCount }, (_, index) => (
          <View
            key={index}
            style={[
              styles.mark,
              index % MARK_MAJOR_EVERY === 0 ? styles.markMajor : styles.markMinor,
              { left: index * MARK_GAP },
            ]}
          />
        ))}
      </Animated.View>
      <View style={[styles.pointer, { backgroundColor: pointerColor }]} />
    </View>
  );
});

// ── 展开态：焦段的分段胶囊条 ────────────────────────────────────────────────
/**
 * 分段胶囊条：每段两行（`13mm` / `0.5×`），当前档用琥珀橙底 + 深色字。
 *
 * 为什么高亮用色块而不是换字色：滑动时手指就压在条上，字会被指尖挡住一半，
 * 只有**色块**能在被遮住的情况下依然告诉用户"现在停在第几档"。
 * 高亮段的文字改深色：浅色机身的琥珀是朱红 `#D32F2F`，白字压上去对比度不够；
 * 深色机身的琥珀 `#E5A93C` 是暖黄，白字更看不清。
 */
function FocalSegmentRow({
  options,
  activeIndex,
  previewIndex,
  innerWidth,
  pointerColor,
  activeInk,
}: {
  options: readonly FocalOption[];
  activeIndex: number;
  /** 滑动中的临时高亮（松手前不提交，见 `ParameterScrubBar`）。 */
  previewIndex: number | null;
  innerWidth: number;
  pointerColor: string;
  activeInk: string;
}) {
  const highlighted = previewIndex ?? activeIndex;
  const width = focalSegmentWidth(innerWidth, options.length);
  return (
    <View style={styles.segmentRow}>
      {options.map((option, index) => {
        const active = index === highlighted;
        return (
          <View
            key={`${option.mm}`}
            style={[
              styles.segment,
              { width },
              active ? { backgroundColor: pointerColor, borderColor: pointerColor } : null,
            ]}
          >
            <Text allowFontScaling={false} style={[styles.segmentMm, active ? { color: activeInk } : null]}>
              {`${option.mm}mm`}
            </Text>
            <Text allowFontScaling={false} style={[styles.segmentMul, active ? { color: activeInk } : null]}>
              {formatMultiplier(option.multiplier)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 展开态：「预设强度」的六档分段条 ─────────────────────────────────────────
/**
 * 强度六档：每段一个单行标签（`35%` / `100%` / `AUTO`），当前档琥珀底 + 深色字。
 *
 * 为什么不用刻度尺：强度是离散档位，没有连续量可滑。轻点在段上直接提交，这和焦段
 * "滑选只预览、松手才提交"不同 —— 六档一次点选就是最终决定，中间态没有意义。
 * 段宽/落点换算与焦段共用 `focalSegmentWidth` / `focalSegmentIndexAtOffset`。
 */
function IntensitySegmentRow({
  tier,
  innerWidth,
  pointerColor,
  activeInk,
}: {
  tier: PresetIntensityTier;
  innerWidth: number;
  pointerColor: string;
  activeInk: string;
}) {
  const width = focalSegmentWidth(innerWidth, PRESET_INTENSITY_OPTIONS.length);
  const activeIndex = PRESET_INTENSITY_OPTIONS.findIndex((option) => option.id === tier);
  return (
    <View style={styles.segmentRow}>
      {PRESET_INTENSITY_OPTIONS.map((option, index) => {
        const active = index === activeIndex;
        return (
          <View
            key={option.id}
            style={[
              styles.segment,
              { width },
              active ? { backgroundColor: pointerColor, borderColor: pointerColor } : null,
            ]}
          >
            <Text allowFontScaling={false} style={[styles.segmentMm, active ? { color: activeInk } : null]}>
              {option.percent}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 收拢态：四颗胶囊 ───────────────────────────────────────────────────────
/**
 * 四颗胶囊**常驻**（v2.1.0 起：三颗参数 + 一颗「预设强度」）：没有任何"镜头列表为空
 * 就藏起来"的门控（真机上那条报告是误诊）。
 * 每颗都给无障碍动作，VoiceOver 的"激活"= 展开（焦段）/ 归零（色温、曝光），
 * "上/下滑动"= 走一格 —— 手势层不在无障碍路径上，所以这条线必须在这儿接。
 */
function CapsuleRow({
  capsules,
  labels,
  expand,
  onActivate,
  onAdjust,
}: {
  capsules: readonly CapsuleSpec[];
  labels: Readonly<Record<CapsuleParameter, string>>;
  expand: Animated.Value;
  onActivate: (dial: CapsuleParameter) => void;
  onAdjust: (dial: CapsuleParameter, direction: 1 | -1) => void;
}) {
  const opacity = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const scale = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  return (
    <Animated.View style={[styles.collapsedLayer, { opacity, transform: [{ scale }] }]}>
      <View style={styles.row}>
        {capsules.map((capsule) => (
          <LiquidGlassView
            key={capsule.dial}
            radius={CAPSULE_HEIGHT / 2}
            overlay={CAPSULE_OVERLAY}
            rim={false}
            style={[styles.capsule, styles.capsuleBorder, { width: capsule.width }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={labels[capsule.dial]}
            accessibilityActions={[
              { name: 'activate' },
              { name: 'increment' },
              { name: 'decrement' },
            ]}
            onAccessibilityAction={(event) => {
              const action = event.nativeEvent.actionName;
              if (action === 'activate') {
                onActivate(capsule.dial);
                return;
              }
              onAdjust(capsule.dial, action === 'increment' ? 1 : -1);
            }}
          >
            {glyphFor(capsule.dial)}
            {capsule.lines.length > 0 ? (
              <View style={styles.lineStack}>
                {capsule.lines.map((line) => (
                  <Text key={line} allowFontScaling={false} style={styles.line}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : (
              <Text allowFontScaling={false} style={styles.value}>
                {capsule.value}
              </Text>
            )}
            {capsule.word === '' ? null : (
              <Text allowFontScaling={false} style={styles.word}>
                {capsule.word}
              </Text>
            )}
          </LiquidGlassView>
        ))}
      </View>
    </Animated.View>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────────
export interface ViewfinderBarProps {
  /** 正在展开/已展开的面板；`null` = 收拢。由手势层持有。 */
  active: CapsuleParameter | null;
  /** 顶部读数（由手势层格式化好，本文件不猜单位）。 */
  reading: string;
  temperature: number;
  focalMm: number;
  exposure: number;
  /** 当前「预设强度」档（AUTO 档在胶囊里写 `AUTO`）。 */
  intensityTier: PresetIntensityTier;
  /** 尺子位移（手势层持有，`Animated.Value` 不经过 React state）。 */
  scroll: Animated.Value;
  /** 可选焦段档位（有没有超广角/长焦由手势层决定）。 */
  focalOptions: readonly FocalOption[];
  /** 当前档位下标；滑动预览由 `previewIndex` 覆盖。 */
  focalActiveIndex: number;
  previewIndex: number | null;
  /** VoiceOver 的"激活"：焦段/强度 = 展开档位条，色温/曝光 = 归零。 */
  onActivate: (dial: CapsuleParameter) => void;
  onAdjust: (dial: CapsuleParameter, direction: 1 | -1) => void;
}

function ViewfinderBarInner({
  active,
  reading,
  temperature,
  focalMm,
  exposure,
  intensityTier,
  scroll,
  focalOptions,
  focalActiveIndex,
  previewIndex,
  onActivate,
  onAdjust,
}: ViewfinderBarProps) {
  const { t } = useI18n();
  const theme = useTheme();
  const { ink } = theme;
  const { width: windowWidth } = useWindowDimensions();
  const expand = useRef(new Animated.Value(active === null ? 0 : 1)).current;
  const [dialMounted, setDialMounted] = useState(active !== null);
  /**
   * 记住"最后一次展开的是哪个盘"。收拢的那 180ms 里 `active` 已经是 `null`，
   * 但面板还在树上淡出 —— 不记这一笔，读数行的名字会在淡出过程中闪一下"曝光"。
   */
  const lastDial = useRef<CapsuleParameter>(active ?? 'ev');
  if (active !== null) {
    lastDial.current = active;
  }
  const shownDial = active ?? lastDial.current;

  useEffect(() => {
    if (active !== null) {
      setDialMounted(true);
      Animated.timing(expand, {
        toValue: 1,
        duration: EXPAND_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(expand, {
      toValue: 0,
      duration: COLLAPSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setDialMounted(false);
      }
    });
  }, [active, expand]);

  const dialScale = expand.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });
  const words: Record<CapsuleParameter, string> = {
    wb: t('camera.bar.temp'),
    zoom: t('camera.bar.focal'),
    ev: t('camera.bar.ev'),
    intensity: t('camera.bar.intensity'),
  };
  const capsules = buildCapsules({
    temperature,
    focalMm,
    exposure,
    focalOptions,
    intensityTier,
    words,
    windowWidth,
  });
  const intensityText = formatIntensityTier(intensityTier);
  const a11yLabels: Record<CapsuleParameter, string> = {
    wb: t('camera.bar.temp.a11y', { label: formatScrubTemperature(temperature) }),
    zoom: t('camera.bar.focal.a11y', { label: `${Math.round(focalMm)}mm` }),
    ev: t('camera.bar.ev.a11y', { value: formatScrubExposure(exposure) }),
    intensity: t('camera.bar.intensity.a11y', { label: intensityText }),
  };
  const dialName =
    shownDial === 'zoom'
      ? words.zoom
      : shownDial === 'wb'
        ? words.wb
        : shownDial === 'intensity'
          ? words.intensity
          : words.ev;
  const readingText =
    shownDial === 'ev' ? `${reading} EV` : shownDial === 'intensity' ? intensityText : reading;
  const innerWidth = focalSegmentInnerWidth(windowWidth);

  return (
    <View style={styles.root}>
      <View style={styles.shell}>
        <CapsuleRow
          capsules={capsules}
          labels={a11yLabels}
          expand={expand}
          onActivate={onActivate}
          onAdjust={onAdjust}
        />
        {dialMounted ? (
          <Animated.View style={[styles.dialLayer, { opacity: expand, transform: [{ scale: dialScale }] }]}>
            <LiquidGlassView
              radius={DIAL_HEIGHT / 2}
              overlay={DIAL_OVERLAY}
              style={[
                styles.dial,
                shownDial === 'zoom' || shownDial === 'intensity' ? styles.dialCenter : null,
              ]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={dialName}
              accessibilityValue={{ text: shownDial === 'zoom' ? `${Math.round(focalMm)}mm` : readingText }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => {
                onAdjust(shownDial, event.nativeEvent.actionName === 'increment' ? 1 : -1);
              }}
            >
              {shownDial === 'zoom' ? (
                <FocalSegmentRow
                  options={focalOptions}
                  activeIndex={focalActiveIndex}
                  previewIndex={previewIndex}
                  innerWidth={innerWidth}
                  pointerColor={ink.amber}
                  activeInk={theme.scheme === 'dark' ? '#1A1206' : GLASS_TEXT_COLOR}
                />
              ) : shownDial === 'intensity' ? (
                <IntensitySegmentRow
                  tier={intensityTier}
                  innerWidth={innerWidth}
                  pointerColor={ink.amber}
                  activeInk={theme.scheme === 'dark' ? '#1A1206' : GLASS_TEXT_COLOR}
                />
              ) : (
                <>
                  <View style={styles.head}>
                    <Text allowFontScaling={false} style={[styles.name, { color: ink.amber }]}>
                      {dialName}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.reading, { color: ink.amber }]}>
                      {readingText}
                    </Text>
                  </View>
                  <RulerStrip
                    scroll={scroll}
                    pointerColor={ink.amber}
                    markCount={rulerMarkCount(windowWidth)}
                  />
                </>
              )}
            </LiquidGlassView>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

export const ViewfinderBar = memo(ViewfinderBarInner);

// ── 样式 ───────────────────────────────────────────────────────────────────
/** RN 0.86 移除了可展开的 `StyleSheet.absoluteFillObject`，只能自己写一份。 */
const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  /**
   * `alignSelf: 'stretch'` + `shell` 的百分比宽度：父级（`CameraScreen` 的
   * `barLayer`）只给了"左 0 / 右 0 / 居中"，宽度得靠拉伸拿到确定的父宽，
   * 否则 `86%` 会退化成一个不确定的值。
   */
  root: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  shell: {
    width: DIAL_WIDTH_RATIO,
    height: DIAL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedLayer: { ...FILL, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: CAPSULE_GAP },
  /**
   * 胶囊内部是**一行**：图标 + 读数 + 中文词。
   * `flexDirection: 'row'` 必须在玻璃外层的 style 上给 —— 玻璃的 children 直接挂在
   * 外层 View 下（`LiquidGlassView` 自己不加任何 flex 方向），漏了这句就变成
   * 图标、数值、中文词**竖着叠**，胶囊再宽也看不出问题、却完全不是设计的样子。
   */
  capsule: {
    height: CAPSULE_HEIGHT,
    paddingHorizontal: CAPSULE_PAD_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleBorder: { borderWidth: CAPSULE_BORDER_WIDTH, borderColor: CAPSULE_BORDER },
  value: {
    fontFamily: UI_MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginLeft: CAPSULE_ICON_GAP,
    color: GLASS_TEXT_COLOR,
    ...glassTextShadow,
  },
  word: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: CAPSULE_WORD_GAP,
    color: GLASS_TEXT_COLOR,
    ...glassTextShadow,
  },
  lineStack: { marginLeft: CAPSULE_ICON_GAP, alignItems: 'center' },
  line: {
    fontFamily: UI_MONO,
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: GLASS_TEXT_COLOR,
    ...glassTextShadow,
  },
  dialLayer: { ...FILL },
  dial: {
    flex: 1,
    paddingHorizontal: DIAL_PAD_H,
    paddingVertical: DIAL_PAD_V,
    justifyContent: 'space-between',
  },
  /** 焦段：分段条自己撑满，居中比 `space-between` 稳。 */
  dialCenter: { justifyContent: 'center' },
  head: { height: HEAD_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  name: { fontSize: 9, fontWeight: '600', letterSpacing: 1, ...glassTextShadow },
  reading: { fontFamily: UI_MONO, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, ...glassTextShadow },
  rulerClip: { height: RULER_VIEWPORT_HEIGHT, alignSelf: 'stretch', overflow: 'hidden' },
  marks: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  mark: { position: 'absolute', bottom: 0, width: MARK_WIDTH },
  markMajor: { height: MARK_MAJOR, opacity: MARK_MAJOR_ALPHA, backgroundColor: MARK_COLOR },
  markMinor: { height: MARK_MINOR, opacity: MARK_MINOR_ALPHA, backgroundColor: MARK_COLOR },
  pointer: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -POINTER_WIDTH / 2,
    width: POINTER_WIDTH,
    height: POINTER_HEIGHT,
  },
  segmentRow: {
    alignSelf: 'stretch',
    height: FOCAL_SEGMENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: FOCAL_SEGMENT_GAP,
  },
  segment: {
    borderRadius: FOCAL_SEGMENT_RADIUS,
    borderWidth: 1,
    borderColor: CAPSULE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentMm: {
    fontFamily: UI_MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: GLASS_TEXT_COLOR,
    ...glassTextShadow,
  },
  segmentMul: {
    fontFamily: UI_MONO,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 1,
    color: GLASS_TEXT_COLOR,
    ...glassTextShadow,
  },
  glyph: {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    shadowColor: 'rgba(0, 0, 0, 0.65)',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 2,
    shadowOpacity: 1,
  },
  intensityBar: {
    position: 'absolute',
    bottom: 2,
    width: 2,
    borderRadius: 1,
    backgroundColor: MARK_COLOR,
  },
  intensityBarShort: { left: 2, height: 4 },
  intensityBarMid: { left: 5.5, height: 7 },
  intensityBarTall: { left: 9, height: 10 },
  thermoStem: {
    position: 'absolute',
    left: 4.5,
    top: 0,
    width: 4,
    height: 10,
    borderWidth: 1,
    borderColor: MARK_COLOR,
    borderRadius: 2,
  },
  thermoBulb: {
    position: 'absolute',
    left: 3,
    top: 5,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: MARK_COLOR,
    borderRadius: 3.5,
  },
  thermoCore: {
    position: 'absolute',
    left: 5.5,
    top: 7.5,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: MARK_COLOR,
  },
  lensRing: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: MARK_COLOR,
    borderRadius: 4.5,
  },
  lensCore: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: MARK_COLOR,
  },
  sunRing: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: MARK_COLOR,
    borderRadius: 3.5,
  },
  sunRayTop: { position: 'absolute', left: 6, top: 0, width: 1, height: 2, backgroundColor: MARK_COLOR },
  sunRayBottom: { position: 'absolute', left: 6, top: 11, width: 1, height: 2, backgroundColor: MARK_COLOR },
  sunRayLeft: { position: 'absolute', left: 0, top: 6, width: 2, height: 1, backgroundColor: MARK_COLOR },
  sunRayRight: { position: 'absolute', left: 11, top: 6, width: 2, height: 1, backgroundColor: MARK_COLOR },
});
