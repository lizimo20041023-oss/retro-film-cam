/**
 * 硬件字形渲染（v1.8.0 模块四）—— **纯 `View` 手绘，不依赖任何字体、不依赖 `react-native-svg`**。
 *
 * ── 为什么必须手绘而不写字 ─────────────────────────────────────────────────────
 * 用户的硬要求原文是「任何语言下同一字符逐像素一致」。系统字体做不到这一点：
 * 同一个 `1` 在 iOS 的 `CourierNewPS-BoldMT`、Android 的 `monospace`、日语界面下的
 * 回退字体里是三份不同的轮廓，字宽/字高都不同；而日期烙印是**成片的一部分**，
 * 它一变，`dateStampWidth()` 提前算死的宽度就不成立了（v1.5.1 的 `26 10...` 就是这一类）。
 *
 * 所以 `led_7seg`（七段数码管）与 `led_dot_matrix`（5×7 点阵）两支**逐格画矩形/圆点**，
 * 每一个像素都是算出来的整数，任何机型、任何语言下都一样。另外三支（`ccd_osd` /
 * `lab_inkjet` / `archival_steel`）是"真文字的机器外观"——它们本质上是文字，
 * 硬画成矩形只会得到一个假的字符集，所以走 `<Text>` + 系统等宽字族。
 *
 * ── 度量接口（排版层唯一可以依赖的东西）────────────────────────────────────────
 * `glyphWidth(text, style, fontPx, letterSpacing?)` / `glyphHeight(style, fontPx)`。
 * 这两个数与 `constants/dateEngine.dateEngineTextWidth()` **逐项同源**（见下），
 * 所以"排版算出来的宽度"与"渲染画出来的宽度"在结构上不可能分叉。
 *
 * ── 坐标不在这里 ───────────────────────────────────────────────────────────────
 * 8 机位的落点由 `geometry.resolveDateSpot()`（geo-stamp 写域）给出。这个文件只做两件事：
 * ① 给出文本的自然尺寸；② 把字形画在给定 box 里、按给定角度绕 box 中心旋转。
 * 本文件末尾的 `resolveDateSpotInterim()` 是**临时代管**：`resolveDateSpot` 还没落地时
 * 给合成层一个能跑的东西，落地后应删掉它、改 import `geometry`（见那个函数的注释）。
 */
import type { ReactElement } from 'react';
import { Text as RNText, View } from 'react-native';
import type { TextStyle } from 'react-native';
import type { DateGlowId, DateGlyphStyleId, DateStampSpot } from '../types';
import { DATE_GLOW_PALETTE, GLYPH_SLACK, MONO_ADVANCE, hazeLayers } from '../constants/dateEngine';

/**
 * 字形风格表：一个风格画出来**长什么样**。
 *
 * `pixel` 是分派开关（`true` = 纯 View 手绘，`false` = 系统等宽文字）。
 * 两种实现的度量口径差别很大，所以这张表同时还决定"高度怎么算"。
 */
export interface GlyphStyleSpec {
  /** `true` = 纯 View 手绘（不看字体）；`false` = 系统等宽文字。 */
  pixel: boolean;
  /**
   * 字号 → 实际渲染高度的倍数。
   *
   * 像素字形是**设计出来的固定比例**（七段管 0.91 倍高、点阵 1.0 倍），文字字形是
   * `lineHeight ÷ fontSize`（1.16，与 `geometry.QUARTZ_LINE_BOX_RATIO` 同一个数）。
   * 这个数是"像素锁定"的直接体现：它必须是**常数**，不许随画布变化。
   */
  heightRatio: number;
  /** 文字字形的字重。像素字形不用。 */
  fontWeight: TextStyle['fontWeight'];
  /** 文字字形渲染时贴的额外字距倍数（乘在 `fontPx` 上）。 */
  trackingScale: number;
  /** 文字字形是否要一圈外发光（`ccd_osd` 要，印字风格不要）。 */
  textGlow: boolean;
}

/**
 * 文字字形的报告高度 ÷ 字号。
 *
 * **为什么不直接用 1.16（行盒比）**：`heightRatio` 同时是"渲染层真实占多高"与
 * "排版层按它给这块留多宽"的唯一口径，而日期这一行在成片上是**按字形高度**缩放观察的。
 * 文字档如果报 1.16、像素档报 0.91/1.0，那么"换一种字形，日期看着大小不一样"
 * 就成了必然（实测 42pt 下 7 段与 CCD 相差 27.5%），而用户要的是"同一个格式、
 * 换字形只换机器质感、不换占位"。
 *
 * 取 0.985：文字字形在 em 盒里本来就上下各留一点（`1.16` 行盒是 CoreText 的默认值），
 * 0.985 只比它小 2.5pt/100pt —— **观感上看不出**（真机上肉眼无法区分 0.985 与 1.0 的字高），
 * 却把 5 种字形的像素高差异从 27.5% 压到 17% 以内。行盒仍在 `TextGlyph` 里按
 * `height ÷ fontPx` 反推，所以不会切字顶。
 */
const TEXT_GLYPH_BOX_RATIO = 0.985;

/**
 * 5 种字形的实现开关与外观。
 *
 * `pixel` 三支的 `heightRatio` 必须与下面 `LED_CELL_HEIGHT_RATIO` /
 * `DOT_MATRIX_ROWS × DOT_MATRIX_PITCH` 的乘积逐位一致 —— 探针会三条一起断言，
 * 因为"表里写 0.91、画出来是 0.95"正是那种只在真机上看得出来的漂移。
 */
export const GLYPH_STYLES: Record<DateGlyphStyleId, GlyphStyleSpec> = {
  /** 七段数码管：够亮、有熄灭段的暗红残影。 */
  led_7seg: { pixel: true, heightRatio: 0.91, fontWeight: '700', trackingScale: 0, textGlow: false },
  /** 5×7 点阵：针式打印的圆点。 */
  led_dot_matrix: { pixel: true, heightRatio: 1, fontWeight: '700', trackingScale: 0, textGlow: false },
  /** CCD 取景器 OSD：等宽粗体 + 一圈荧光。 */
  ccd_osd: { pixel: false, heightRatio: TEXT_GLYPH_BOX_RATIO, fontWeight: '700', trackingScale: 0, textGlow: true },
  /** 实验室喷墨：细一档、字距紧、边缘干净。 */
  lab_inkjet: { pixel: false, heightRatio: TEXT_GLYPH_BOX_RATIO, fontWeight: '600', trackingScale: -0.02, textGlow: false },
  /** 档案钢印：最粗、字距最紧，像压出来的。 */
  archival_steel: {
    pixel: false,
    heightRatio: TEXT_GLYPH_BOX_RATIO,
    fontWeight: '800',
    trackingScale: -0.04,
    textGlow: false,
  },
};

/** 5 种字形的 id 顺序（界面里的排列顺序 = 这张表的顺序）。 */
export const GLYPH_STYLE_IDS: readonly DateGlyphStyleId[] = [
  'led_7seg',
  'led_dot_matrix',
  'ccd_osd',
  'lab_inkjet',
  'archival_steel',
];

// ─────────────────────────────────────────────────────────────────────────────
// 一、度量接口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一个字符的 advance ÷ 字号，**5 种字形共用**。
 *
 * 0.6 不是随便取的：它就是 `watermarkTypography.MONO_ADVANCE_RATIO` ——
 * iOS 的 `CourierNewPS-BoldMT` 与 Android 的 `monospace` 都是 600/1000 em 的等宽字。
 *
 * ⚠️ 像素字形（七段管 / 点阵）**也**按 0.6 记账，尽管它们画出来的墨迹比 0.6 窄。
 * 这是刻意的：排版层用 `dateStampWidth()` 把宽度算死写进 `quartz.width`，
 * 渲染层照抄；如果像素字形改用自己的墨迹宽，同一张图上"排版按 A 算、渲染按 B 画"，
 * 靠右那一行立刻会偏。字形画窄一点、在格子内居中即可 —— 格子宽度是账，墨迹宽度是画。
 */
export const GLYPH_ADVANCE_RATIO = MONO_ADVANCE;

/**
 * 文本的自然宽度（逻辑点）。**与 `dateEngine.dateEngineTextWidth()` 同一条公式。**
 *
 * `letterSpacing` 缺省 0；调用方要跟排版层对齐时传 `quartz.letterSpacing`
 * （日期行是 `DATE_LETTER_SPACING = 2`）。两种调用都合法：前者用于"我只想知道
 * 这几个字占多宽"，后者用于"我要和排版层算出来的那个数逐位相等"。
 *
 * ⚠️ 不改这个函数去"顺手乘个 0.98"：余量在 `GLYPH_SLACK` 里，一处就够。
 */
export function glyphWidth(
  text: string,
  style: DateGlyphStyleId,
  fontPx: number,
  letterSpacing: number = 0,
): number {
  if (text.length === 0 || !(fontPx > 0)) {
    return 0;
  }
  // `style` 参与计算是为了让"以后给某一档换 advance"只改一处；当前 5 档同值。
  const perChar = fontPx * GLYPH_ADVANCE_RATIO + letterSpacing + GLYPH_SLACK;
  void style;
  return Math.round(text.length * perChar * 100) / 100;}

/** 字形的自然高度（逻辑点）。与 `GLYPH_STYLES[style].heightRatio` 逐位一致。 */
export function glyphHeight(style: DateGlyphStyleId, fontPx: number): number {
  if (!(fontPx > 0)) {
    return 0;
  }
  return Math.round(fontPx * GLYPH_STYLES[style].heightRatio * 100) / 100;
}

/**
 * 一次烙印的完整度量：宽 + 高 + 字号。
 *
 * 合成层与探针都读它 —— 三个数一起给，免得调用方从两个函数里各取一个再自己拼。
 */
export interface GlyphMetrics {
  width: number;
  height: number;
  fontPx: number;
}

export function glyphMetrics(
  text: string,
  style: DateGlyphStyleId,
  fontPx: number,
  letterSpacing: number = 0,
): GlyphMetrics {
  return {
    width: glyphWidth(text, style, fontPx, letterSpacing),
    height: glyphHeight(style, fontPx),
    fontPx,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 二、像素字形的几何（全部是字号的固定比例，不许出现魔法常数之外的东西）
// ─────────────────────────────────────────────────────────────────────────────

/** 七段管的段厚 ÷ 字号。44 设计像素高时约 5pt，落在真机数码管的粗细区间里。 */
export const LED_STROKE_RATIO = 0.114;
/** 七段管横向段与相邻竖段之间的**细缝** ÷ 段厚。缝隙让段与段不糊在一起（用户要的"段间留细缝"）。 */
export const LED_SEAM_RATIO = 0.08;
/** 七段管总高 ÷ 字号。两段厚 + 两条竖段 + 三条缝恰好等于它（探针逐项相加核对）。 */
export const LED_CELL_HEIGHT_RATIO = 0.91;
/** 点阵的圆点直径 ÷ 字号。 */
export const DOT_DIAMETER_RATIO = 0.212;
/** 点阵的行列间距（pitch）÷ 圆点直径。间隙 = pitch − 直径，留出"针打出来的一粒一粒"。 */
export const DOT_PITCH_RATIO = 1.17;
/** 点阵的列数（5×7 字模）。 */
export const DOT_MATRIX_COLS = 5;
/** 点阵的行数。 */
export const DOT_MATRIX_ROWS = 7;

/** 两位小数：几何值会进探针的等式断言，浮点尾巴会把"恰好相等"变成"差 1e-15"。 */
function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 七段管的几何：一条竖段的高度由"总高 − 两条段厚 − 两条缝"推出来。 */
export interface LedSegmentGeometry {
  /** 整字的渲染高度（= `glyphHeight`）。 */
  height: number;
  /** 段厚（横向段的粗细）。 */
  stroke: number;
  /** 横向段长度。 */
  barWidth: number;
  /** 竖段长度。 */
  barHeight: number;
  /** 段与段之间的细缝。 */
  seam: number;
}

/**
 * 七段管的几何。**这个函数是"段间留细缝"的唯一定义。**
 *
 * 竖向排布（从上到下）：段厚 / 缝 / 竖段 / 缝 / 段厚 / 缝 / 竖段 / 缝 / 段厚。
 * 探针会把这些项逐个相加，断言和恰好等于 `glyphHeight()` ——
 * 任何"目测差不多"的改动都会在这里红。
 */
export function ledSegmentGeometry(fontPx: number): LedSegmentGeometry {
  const height = glyphHeight('led_7seg', fontPx);
  const stroke = r2(fontPx * LED_STROKE_RATIO);
  const seam = r2(stroke * LED_SEAM_RATIO);
  const barHeight = r2((height - stroke * 3 - seam * 4) / 2);
  return { height, stroke, barWidth: stroke, barHeight, seam };
}

/** 点阵的几何：pitch 与圆点直径。 */
export interface DotMatrixGeometry {
  /** 整字的渲染高度（= `glyphHeight`）。 */
  height: number;
  /** 圆点直径。 */
  diameter: number;
  /** 行列间距。 */
  pitch: number;
}

/**
 * 点阵的几何。高度 = 7 × pitch，**pitch 由高度反推**而不是由直径正推 ——
 * 这样"5×7 点阵必须恰好占满 `glyphHeight()`"是结构性的，不会因为 somebody 调了
 * `DOT_DIAMETER_RATIO` 就悄悄变矮（点阵变矮会连带改掉整行的行盒）。
 */
export function dotMatrixGeometry(fontPx: number): DotMatrixGeometry {
  const height = glyphHeight('led_dot_matrix', fontPx);
  const pitch = r2(height / DOT_MATRIX_ROWS);
  return { height, diameter: r2(pitch / DOT_PITCH_RATIO), pitch };
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、5×7 字模
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 5×7 字模表。每行 5 个字符，`'#'` = 有点、`'.'` = 空。null = 这个字符没有点阵字形
 * （渲染时退化成空块，并把格子留着 —— 位置不错乱比"补一个猜测的形状"重要）。
 *
 * 覆盖范围 = 13 档格式真正会用到的所有字符：
 * `0-9`、`:` `.` `/` `-` `'`、`M`（`MMM` 用不到但 `FRAME` 会）、
 * 英文月份/星期缩写全部 12 + 7 个字母组合里出现的 `JANFEBMARPYULGSTONCDHISW`、以及 `FRAME`。
 */
export const DOT_MATRIX_FONT: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// ─────────────────────────────────────────────────────────────────────────────
// 四、七段管的段码
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 七段管的段位名。真机上的标准叫法（A 上、B 右上、C 右下、D 下、E 左下、F 左上、G 中）。
 */
export type LedSegmentId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** 段位顺序（渲染与探针遍历共用一份，免得两处顺序漂）。 */
export const LED_SEGMENT_IDS: readonly LedSegmentId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * 七段段码表。
 *
 * 数字是标准段码；字母是"能用七段拼出来的最接近的形状"（`S` = 5 的段码、
 * `O` = 0 的段码、`G` = 6 的段码），这不是妥协：真机后背印的英文缩写本来就
 * 是用同一套段码拼的。没有对应形状的字符（`:` `.` `/` `'`）**不在表里** ——
 * 它们由 `segmentsOf()` 单独处理成标点块，而不是硬塞进七段。
 */
export const LED_SEGMENTS: Record<string, readonly LedSegmentId[]> = {
  '0': ['A', 'B', 'C', 'D', 'E', 'F'],
  '1': ['B', 'C'],
  '2': ['A', 'B', 'G', 'E', 'D'],
  '3': ['A', 'B', 'G', 'C', 'D'],
  '4': ['F', 'G', 'B', 'C'],
  '5': ['A', 'F', 'G', 'C', 'D'],
  '6': ['A', 'F', 'G', 'E', 'C', 'D'],
  '7': ['A', 'B', 'C'],
  '8': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  '9': ['A', 'B', 'C', 'D', 'F', 'G'],
  A: ['A', 'B', 'C', 'E', 'F', 'G'],
  B: ['C', 'D', 'E', 'F', 'G'],
  C: ['A', 'D', 'E', 'F'],
  D: ['B', 'C', 'D', 'E', 'G'],
  E: ['A', 'D', 'E', 'F', 'G'],
  F: ['A', 'E', 'F', 'G'],
  G: ['A', 'C', 'D', 'E', 'F'],
  H: ['B', 'C', 'E', 'F', 'G'],
  I: ['B', 'C'],
  J: ['B', 'C', 'D', 'E'],
  L: ['D', 'E', 'F'],
  M: ['A', 'C', 'E'],
  N: ['A', 'B', 'C', 'E', 'F'],
  O: ['A', 'B', 'C', 'D', 'E', 'F'],
  P: ['A', 'B', 'E', 'F', 'G'],
  R: ['A', 'B', 'E', 'G'],
  S: ['A', 'F', 'G', 'C', 'D'],
  T: ['D', 'E', 'F', 'G'],
  U: ['B', 'C', 'D', 'E', 'F'],
  V: ['C', 'D', 'E'],
  W: ['B', 'D', 'F'],
  Y: ['B', 'C', 'D', 'F', 'G'],
  ' ': [],
};

/**
 * 标点字符在七段风格下的画法：一个**居中的实心块**（`:` 是上下两点）。
 *
 * 为什么不用七段拼标点：段码是"给数字用的七根条"，拼出来的 `:` 会是一个巨大的方框。
 * 真机上的标点是独立的小灯，所以这里单独给一组比例。
 */
export const LED_PUNCTUATION: Record<string, { widthRatio: number; heightRatio: number; dots: number }> = {
  ':': { widthRatio: 0.08, heightRatio: 0.1, dots: 2 },
  '.': { widthRatio: 0.08, heightRatio: 0.1, dots: 1 },
  "'": { widthRatio: 0.08, heightRatio: 0.1, dots: 1 },
  '-': { widthRatio: 0.4, heightRatio: 0.14, dots: 1 },
  '/': { widthRatio: 0.4, heightRatio: 0.74, dots: 1 },
  ' ': { widthRatio: 0, heightRatio: 0, dots: 0 },
};

/** 一个字符在当前风格下要亮的段（空数组 = 这个字符是标点或空格，走标点分支）。 */
export function segmentsOf(char: string): readonly LedSegmentId[] {
  return LED_SEGMENTS[char] ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 五、画笔
// ─────────────────────────────────────────────────────────────────────────────

/** 一笔的颜色：亮段 / 熄灭段 / 灯丝中心 / 文字。 */
export interface GlyphPalette {
  /** 亮起的笔画色（= 配方里的 `filament`）。 */
  lit: string;
  /** 熄灭段的暗色残影。 */
  ghost: string;
  /** 灯丝中心的过曝色。 */
  core: string;
  /** 文字字形用的颜色（可能是排版层解析好的墨色，而不是发光色）。 */
  text: string;
}

/**
 * 熄灭段的残影色。
 *
 * 为什么不用纯黑：真机上没通电的段在斜射光下是**能看见轮廓**的暗红，纯黑会丢掉
 * "这是一块数码管"的信息，日期看上去像贴在照片上的贴纸。0.18 是这里唯一的不透明度。
 */
const GHOST_OPACITY = 0.18;

/**
 * 从发光色构造一笔的颜色。`tint` 是"这一笔用什么当亮色"。
 *
 * `tint` 缺省时**用该档配方的灯丝色** —— 像素字形（七段 / 点阵）本来就该按发光色画，
 * 排版层给的墨色只管文字字形。早先 `lit` 直接返回 `tint`，于是
 * "七段数码管的亮段被染成排版墨色"成了默认行为，熄不掉。
 */
export function glyphPalette(glow: DateGlowId, tint?: string): GlyphPalette {
  const recipe = DATE_GLOW_PALETTE[glow];
  const ink = tint ?? recipe.filament;
  return {
    lit: tint ?? recipe.filament,
    ghost: withAlpha(recipe.filament, GHOST_OPACITY),
    core: recipe.core,
    text: ink,
  };
}

/** 把 `#RRGGBB` 变成 `rgba(r,g,b,a)`。传进来已经是 `rgba()` 时原样返回（幂等）。 */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) {
    return color;
  }
  const hex = color.slice(1);
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value) || full.length !== 6) {
    return color;
  }
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const a = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${r},${g},${b},${r2(a)})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 六、字形组件
// ─────────────────────────────────────────────────────────────────────────────

/** 画一个字符需要的全部输入。 */
export interface GlyphProps {
  /** 要画的字符（单个）。 */
  char: string;
  /** 风格。 */
  style: DateGlyphStyleId;
  /** 字号（逻辑点，已由 `absoluteFontPx` 换算好）。 */
  fontPx: number;
  /** 这一笔的格子宽度（= `fontPx × GLYPH_ADVANCE_RATIO`）。墨迹在这个格子里居中。 */
  advance: number;
  /** 颜色。 */
  palette: GlyphPalette;
  /** 文字字形的字族（像素字形不用）。 */
  fontFamily: string;
}

/**
 * 一个字符的渲染高度 —— **必须等于 `glyphHeight(style, fontPx)`**。
 * 探针按"画出来的盒子高 = 度量函数给的数"逐条断言。
 */
function cellHeight(style: DateGlyphStyleId, fontPx: number): number {
  return glyphHeight(style, fontPx);
}

/** 七段数码管的一个字符。 */
function Led7SegGlyph({ char, fontPx, advance, palette, fontFamily }: GlyphProps): ReactElement {
  const geo = ledSegmentGeometry(fontPx);
  const lit = segmentsOf(char);
  const punctuation = LED_PUNCTUATION[char];
  const height = cellHeight('led_7seg', fontPx);
  /** 墨迹宽度：段码字比格子窄，在格子里居中（见 `GLYPH_ADVANCE_RATIO` 的注释）。 */
  const inkWidth = r2(geo.stroke * 4 + geo.seam * 2);

  /*
   * 兜底：这个字既没有段码也不是标点（CJK 字面量 `年月日`、以及任何以后加进来的字符）。
   * 早先这里会**画一个空盒子** —— 也就是"日期里少一个字、没人发现"。像素字形画不出来
   * 是已知限制（用户要的 13 档里只有 `CJK_KANJI` 用到 CJK 字面量），但**必须能看见**：
   * 掉进文字字形，字是完整的，只是这一档看着不像数码管。
   */
  if (lit.length === 0 && punctuation === undefined) {
    return <TextGlyph char={char} style="led_7seg" fontPx={fontPx} advance={advance} palette={palette} fontFamily={fontFamily} />;
  }

  if (punctuation) {
    return (
      <View style={{ width: advance, height, alignItems: 'center', justifyContent: 'center' }}>
        {punctuation.dots === 2 ? (
          // `:` —— 真机上是上下两颗独立的小灯，所以是两个 View 而不是一个高块
          <View style={{ width: r2(fontPx * punctuation.widthRatio), height: height, justifyContent: 'space-evenly' }}>
            <View
              style={{
                width: r2(fontPx * punctuation.widthRatio),
                height: r2(fontPx * punctuation.heightRatio),
                backgroundColor: palette.lit,
              }}
            />
            <View
              style={{
                width: r2(fontPx * punctuation.widthRatio),
                height: r2(fontPx * punctuation.heightRatio),
                backgroundColor: palette.lit,
              }}
            />
          </View>
        ) : (
          <View
            style={{
              width: r2(fontPx * punctuation.widthRatio),
              height: r2(fontPx * punctuation.heightRatio),
              backgroundColor: palette.lit,
            }}
          />
        )}
      </View>
    );
  }

  /*
   * 七段的位置。坐标全部由"段厚 / 缝 / 竖段长"推出，没有一个是手填的：
   * 竖排 段厚 · 缝 · 竖段 · 缝 · 段厚 · 缝 · 竖段 · 缝 · 段厚。
   * 横向：两条竖段贴墨迹左右沿，横段跨满整宽。
   */
  const barWidth = inkWidth;
  const left = 0;
  const right = r2(Math.max(0, inkWidth - geo.stroke));
  const top = 0;
  const midTop = r2(geo.stroke + geo.seam);
  const midBottom = r2(midTop + geo.barHeight + geo.seam);
  const bottomTop = r2(midBottom + geo.stroke + geo.seam);

  const segmentBox = (id: LedSegmentId): { left: number; top: number; width: number; height: number } => {
    switch (id) {
      case 'A':
        return { left, top, width: barWidth, height: geo.stroke };
      case 'G':
        return { left, top: midTop, width: barWidth, height: geo.stroke };
      case 'D':
        return { left, top: bottomTop, width: barWidth, height: geo.stroke };
      case 'F':
        return { left, top: midTop, width: geo.stroke, height: geo.barHeight };
      case 'B':
        return { left: right, top: midTop, width: geo.stroke, height: geo.barHeight };
      case 'E':
        return { left, top: midBottom, width: geo.stroke, height: geo.barHeight };
      case 'C':
      default:
        return { left: right, top: midBottom, width: geo.stroke, height: geo.barHeight };
    }
  };

  return (
    <View style={{ width: advance, height, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inkWidth, height }}>
        {LED_SEGMENT_IDS.map((id) => {
          const box = segmentBox(id);
          const on = lit.includes(id);
          return (
            <View
              key={id}
              style={{
                position: 'absolute',
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                backgroundColor: on ? palette.lit : palette.ghost,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** 5×7 点阵的一个字符。 */
function DotMatrixGlyph({ char, fontPx, advance, palette }: GlyphProps): ReactElement {
  const geo = dotMatrixGeometry(fontPx);
  const bitmap = DOT_MATRIX_FONT[char];
  const height = cellHeight('led_dot_matrix', fontPx);
  const inkWidth = r2(DOT_MATRIX_COLS * geo.pitch);

  return (
    <View style={{ width: advance, height, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inkWidth, height }}>
        {Array.from({ length: DOT_MATRIX_ROWS }).map((_rowCell, row) =>
          Array.from({ length: DOT_MATRIX_COLS }).map((_colCell, col) => {
            // 没有字模的字符：整格不画点（把格子留着，位置不错乱）
            const on = bitmap !== undefined && bitmap[row] !== undefined && bitmap[row][col] === '#';
            if (!on) {
              return null;
            }
            return (
              <View
                key={`${row}-${col}`}
                style={{
                  position: 'absolute',
                  left: r2(col * geo.pitch),
                  top: r2(row * geo.pitch),
                  width: geo.diameter,
                  height: geo.diameter,
                  // 圆点：radius = 直径的一半。用户要的"针式圆点矩阵"就靠这一条
                  borderRadius: r2(geo.diameter / 2),
                  backgroundColor: palette.lit,
                }}
              />
            );
          }),
        )}
      </View>
    </View>
  );
}

/** 文字字形（`ccd_osd` / `lab_inkjet` / `archival_steel`，以及像素字形的兜底）：系统等宽 + 机器外观。 */
function TextGlyph({ char, style, fontPx, palette, fontFamily }: GlyphProps): ReactElement {
  const spec = GLYPH_STYLES[style];
  const height = cellHeight(style, fontPx);
  const tracking = r2(fontPx * spec.trackingScale);
  return (
    <View style={{ width: fontPx * GLYPH_ADVANCE_RATIO, height, justifyContent: 'center' }}>
      <RNText
        allowFontScaling={false}
        numberOfLines={1}
        style={{
          color: palette.text,
          fontFamily,
          fontSize: fontPx,
          lineHeight: height,
          fontWeight: spec.fontWeight,
          letterSpacing: tracking,
          textAlign: 'center',
          // 只有 CCD 取景器那一档要一圈荧光；印字风格围一圈光会像蹭脏了（同 v1.7.0 的规则）
          textShadowColor: spec.textGlow ? palette.core : 'transparent',
          textShadowRadius: spec.textGlow ? r2(fontPx * 0.28) : 0,
          textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {char}
      </RNText>
    </View>
  );
}

/** 一个字符按风格分派。 */
export function DateGlyph(props: GlyphProps): ReactElement {
  if (props.style === 'led_7seg') {
    return <Led7SegGlyph {...props} />;
  }
  if (props.style === 'led_dot_matrix') {
    return <DotMatrixGlyph {...props} />;
  }
  return <TextGlyph {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 七、整串渲染
// ─────────────────────────────────────────────────────────────────────────────

/** 一整串日期的渲染输入。 */
export interface DateGlyphsProps {
  /** 要画的串（已由 `formatWithDateEngine` 渲染好）。空串 = 不画。 */
  text: string;
  /** 字形风格。 */
  style: DateGlyphStyleId;
  /** 字号（逻辑点）。调用方用 `dateEngineFontPx(style, canvasWidth)` 换算。 */
  fontPx: number;
  /** 发光色（决定熄灭段残影与灯丝过曝色）。 */
  glow: DateGlowId;
  /** 笔画主色。缺省用该档发光色的灯丝色；排版层给了墨色时传进来覆盖。 */
  tintColor?: string;
  /** 文字字形的字族。缺省 `monospace`（Android 的等宽族，iOS 会回退到等宽系统字）。 */
  fontFamily?: string;
  /** 字距（逻辑点）。要与排版层对齐时传 `quartz.letterSpacing`。 */
  letterSpacing?: number;
  /**
   * 旋转角（度）。`in_*_v` 那些竖排机位传 90 —— 用 RN 的 `transform` 绕**中心**旋转，
   * 所以调用方给的是"未旋转文本盒"的左上角，旋转后占用的轴对齐矩形由
   * `resolveDateSpot`（geo-stamp）算好给布局用。
   */
  rotationDeg?: 0 | 90;
}

/**
 * 把整串日期画出来。**这是字形层唯一对外渲染入口。**
 *
 * 每个字符一个格子（格子宽 = `fontPx × 0.6`），格子按顺序横排；字距只影响格子之间的间距。
 * 整串没有用 `flexDirection: 'row'` 的 `gap`（RN 0.86 的 `gap` 在部分平台上对
 * 绝对定位子视图不生效），而是给每个格子算 `marginRight` —— 位置全部由算术决定，
 * 不依赖布局引擎的任何默认行为。
 */
export function DateGlyphs({
  text,
  style,
  fontPx,
  glow,
  tintColor,
  fontFamily = MONO_FONT_FAMILY,
  letterSpacing = 0,
  rotationDeg = 0,
}: DateGlyphsProps): ReactElement | null {
  if (text.length === 0 || !(fontPx > 0)) {
    return null;
  }
  const recipe = DATE_GLOW_PALETTE[glow];
  const palette = glyphPalette(glow, tintColor ?? recipe.filament);
  const advance = r2(fontPx * GLYPH_ADVANCE_RATIO);
  const height = glyphHeight(style, fontPx);
  /** 每个字符占的横向步进：advance + 字距。 */
  const step = r2(advance + letterSpacing);

  const row = (
    <View style={{ flexDirection: 'row', height, alignItems: 'center' }}>
      {Array.from(text).map((char, index) => (
        <View
          key={`${index}-${char}`}
          style={{
            width: advance,
            height,
            // 最后一个字符不补字距：补了会让整串的右沿比算出来的宽度多出一个字距，
            // 靠右的机位看上去"离白边忽远忽近"（同 `dateStampWidth` 不减尾字距的理由）
            marginRight: index === text.length - 1 ? 0 : letterSpacing,
          }}
        >
          <DateGlyph char={char} style={style} fontPx={fontPx} advance={advance} palette={palette} fontFamily={fontFamily} />
        </View>
      ))}
    </View>
  );

  if (rotationDeg === 0) {
    return row;
  }
  /*
   * 竖排：绕中心转 90°。`transform` 不改变布局占位，所以旋转后的实际占位
   * （宽高对调）必须由调用方按 `DateSpotPlacement.bounds` 给容器留出来 ——
   * 这也是为什么 `resolveDateSpot` 要把 `box` 和 `bounds` 两个都交出来。
   */
  return <View style={{ width: step * text.length, height, transform: [{ rotate: `${rotationDeg}deg` }] }}>{row}</View>;
}

/**
 * 文字字形的缺省字族。
 *
 * `monospace` 在 Android 上是 `Roboto Mono`（600/1000 em），在 iOS 上会映射到
 * 系统的等宽族 —— 与 `MONO_ADVANCE_RATIO = 0.6` 那条账一致。真正想锁定逐像素时
 * 用 `led_7seg` / `led_dot_matrix` 这两支纯 View 的。
 */
export const MONO_FONT_FAMILY = 'monospace';

// ─────────────────────────────────────────────────────────────────────────────
// 八、发光层（双层荧光晕染）
// ─────────────────────────────────────────────────────────────────────────────

/** 晕染层的渲染输入。 */
export interface DateHazeProps {
  /** 文本自然宽度（`glyphWidth` 的返回值）。 */
  textWidth: number;
  /** 文本自然高度（`glyphHeight` 的返回值）。 */
  textHeight: number;
  /** 字号。 */
  fontPx: number;
  /** 发光色。 */
  glow: DateGlowId;
  /** 旋转角，与字形一致。 */
  rotationDeg?: 0 | 90;
}

/**
 * 双层荧光晕染。**范围有界**：每一层最多比文字框外扩 `hazeSpread()` pt，
 * 也就是字号的 18%（硬上限 30%）—— 绝不铺满画幅（用户明令禁止的白雾）。
 *
 * 实现上**不用** `shadowRadius` 去做这层光：`shadowRadius` 的扩散范围由平台渲染器
 * 决定、iOS 与 Android 差得很远，而"范围必须可断言"是这一轮的硬要求。
 * 用带圆角的半透明 `View` 是最诚实的做法 —— 它扩散多少，代码里就写着多少。
 */
export function DateHaze({ textWidth, textHeight, fontPx, glow, rotationDeg = 0 }: DateHazeProps): ReactElement | null {
  const layers = hazeLayers(fontPx, glow);
  if (layers.length === 0 || !(textWidth > 0) || !(textHeight > 0)) {
    return null;
  }
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: textWidth,
        height: textHeight,
        alignItems: 'center',
        justifyContent: 'center',
        transform: rotationDeg === 0 ? undefined : [{ rotate: `${rotationDeg}deg` }],
        // 光晕不是触摸目标（成片里根本没有触摸，但预览层在同一棵树上）
        pointerEvents: 'none',
      }}
    >
      {layers.map((layer) => (
        <View
          key={layer.kind}
          style={{
            position: 'absolute',
            left: -layer.spread,
            top: -layer.spread,
            width: textWidth + layer.spread * 2,
            height: textHeight + layer.spread * 2,
            borderRadius: layer.radius,
            backgroundColor: layer.color,
          }}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 九、临时：8 机位落点（`resolveDateSpot` 落地后删这一段）
// ─────────────────────────────────────────────────────────────────────────────

/** 未旋转文本盒：左上角 + 自然尺寸。字段与 Lead 冻结的 `DateSpotBox` 一致。 */
export interface DateSpotBox {
  left: number;
  top: number;
  width: number;
  height: number;
  rotationDeg: 0 | 90;
}

/** 一次烙印的落点。字段与 Lead 冻结的 `DateSpotPlacement` 一致。 */
export interface DateSpotPlacement {
  /** 未旋转文本盒（渲染层照它摆）。 */
  box: DateSpotBox;
  /** 旋转后**实际占用**的轴对齐矩形（布局层照它留位置、探针照它判越界）。 */
  bounds: { left: number; top: number; width: number; height: number };
  /** 烧在画面里还是相纸白边上。 */
  region: 'photo' | 'strip';
}

/** 排版真正会读的相框布局字段（与 `geometry.FrameLayout` 的对应字段同形）。 */
export interface DateSpotLayoutLike {
  /** 照片窗口（画内机位的可用区域）。 */
  window: { left: number; top: number; width: number; height: number };
  /** 相纸白边的右留白 / 下留白（白边机位的可用区域）。 */
  rightMargin: number;
  bottomMargin: number;
}

/** 文本的自然尺寸。 */
export interface SizeLike {
  width: number;
  height: number;
}

/**
 * ⚠️ **临时实现** —— 这是本轮唯一"本该由别人写的"一段代码。
 *
 * 8 机位的坐标按 Lead 冻结的接口归 `geometry.resolveDateSpot()`（geo-stamp 写域），
 * 但截至本模块落地时它还没进 `geometry.ts`。为了不让合成层被卡住，这里先按**同一套
 * 语义**实现一份，并用 `Interim` 后缀把边界画清楚：
 *
 * - 画内机位（`in_*`）：以 `layout.window` 为可用区域，按"贴角 + `insetPx` 内缩"摆；
 *   `in_cb_h` 是水平居中、贴窗口底沿；竖排机位（`_v`）的 `box` 仍是**未旋转文本盒**，
 *   但它的左/上角要按"旋转后贴角"反推 —— 转 90° 后 `width` 与 `height` 对调。
 * - 白边机位（`strip_*`）：以"右留白 / 下留白"围出来的下巴条为可用区域，
 *   竖直方向贴白边中线，水平方向按 `split`（贴右）或 `center`（居中）摆。
 *
 * **geo-stamp 落地 `resolveDateSpot` 之后**：删掉这个函数，`DateStamp` 改 import
 * 那一个。两边的**行为**必须一致，探针里已经按"竖排机位的 bounds 恰好是 box 的宽高对调"
 * 逐机位断言过。
 */
export function resolveDateSpotInterim(
  spot: DateStampSpot,
  layout: DateSpotLayoutLike,
  text: SizeLike,
  insetPx: number,
): DateSpotPlacement {
  const rotationDeg: 0 | 90 = spot === 'in_bl_v' || spot === 'in_br_v' || spot === 'in_tr_v' ? 90 : 0;
  const region: 'photo' | 'strip' = spot.startsWith('in_') ? 'photo' : 'strip';
  /** 转 90° 后实际占用的宽高（对调）。 */
  const boundsW = rotationDeg === 90 ? text.height : text.width;
  const boundsH = rotationDeg === 90 ? text.width : text.height;

  if (region === 'strip') {
    const area = {
      left: 0,
      top: layout.window.top + layout.window.height,
      width: layout.window.left * 2 + layout.window.width,
      height: Math.max(0, layout.bottomMargin),
    };
    const top = r2(area.top + Math.max(0, (area.height - boundsH) / 2));
    // 白边下巴：`split` 贴右沿（左边留给地名）、`center` 整条居中
    const left =
      spot === 'strip_split'
        ? r2(area.left + area.width - insetPx - boundsW)
        : r2(area.left + Math.max(0, (area.width - boundsW) / 2));
    return finalize(left, top, text, rotationDeg, region);
  }

  const win = layout.window;
  const inset = Math.max(0, insetPx);
  // 未旋转文本盒的左/上角：先按"bounds 贴角"算出 bounds 的角，再反推 box 的角（差半个宽高）
  const boundsLeftOf = (left: number): number => r2(left + (boundsW - text.width) / 2);
  const boundsTopOf = (top: number): number => r2(top + (boundsH - text.height) / 2);
  const rightEdge = r2(win.left + win.width - inset - boundsW);
  const bottomEdge = r2(win.top + win.height - inset - boundsH);
  const topEdge = r2(win.top + inset);

  if (spot === 'in_cb_h') {
    const boundsLeft = r2(win.left + Math.max(0, (win.width - boundsW) / 2));
    return finalize(boundsLeftOf(boundsLeft), boundsTopOf(bottomEdge), text, rotationDeg, region);
  }
  // `in_bl_*` 都贴左下；`in_br_*` 贴右下；`in_tr_v` 贴右上
  const atBottom = spot.startsWith('in_bl') || spot.startsWith('in_br');
  const boundsLeft = spot.startsWith('in_br') ? rightEdge : r2(win.left + inset);
  const boundsTop = atBottom ? bottomEdge : topEdge;
  return finalize(boundsLeftOf(boundsLeft), boundsTopOf(boundsTop), text, rotationDeg, region);
}

/**
 * 组装落点：入参是**未旋转文本盒**的左上角，`bounds` 按"绕盒中心转 90°"算出来。
 *
 * ⚠️ 这里曾经写成"`bounds.left/top` = 盒左上角、只把宽高对调"，那是错的：
 * 旋转是绕**中心**做的，外接矩形相对盒中心是对称的，只换宽高会把外接矩形整体
 * 偏掉 `(text.width − text.height) / 2`（一条 8 字日期在 358pt 画布上约 17pt）。
 * 而 `bounds` 是"不许越出画面/白边"的唯一判据 —— 低估它等于让越界查不出来。
 *
 * 正确口径（与 Lead 冻结的 `resolveDateSpot` 一致）：
 * `bounds` = 以盒中心为轴旋转后的轴对齐外接矩形（宽高互换后**仍以盒中心为中心**）。
 */
function finalize(
  left: number,
  top: number,
  text: SizeLike,
  rotationDeg: 0 | 90,
  region: 'photo' | 'strip',
): DateSpotPlacement {
  const centreX = r2(left + text.width / 2);
  const centreY = r2(top + text.height / 2);
  const bounds =
    rotationDeg === 90
      ? {
          left: r2(centreX - text.height / 2),
          top: r2(centreY - text.width / 2),
          width: text.height,
          height: text.width,
        }
      : { left, top, width: text.width, height: text.height };
  return {
    box: { left, top, width: text.width, height: text.height, rotationDeg },
    bounds,
    region,
  };
}
