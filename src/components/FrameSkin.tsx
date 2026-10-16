/**
 * 相框皮肤（v1.7.0）—— 画在素材相框**之上**的纯 `<View>` 叠加层（纸面做旧 / 手绘涂鸦）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 为什么是一个组件，而不是"预览一套 + 成片一套"
 * ─────────────────────────────────────────────────────────────────────────
 * v1.7.0 要求"取景器里就能看见相框风格的实时预览，而且和成片长得一样"。
 * 取巧的做法是预览拿一张近似图、成片另画一套 —— 那两边必然对不上。
 * 这里只有**一个**实现：取景器把它盖在相框上（小尺寸），
 * `FilmCompositor` 把它插在相框 `<Image>` 之后（成片尺寸）。
 * 两处唯一的差别是 `width/height`，而所有几何量都是 0~1 归一化后再乘尺寸的，
 * 所以两边**等比**。探针里有一条断言专门守这件事（同一相框 120pt 与 390pt
 * 渲染出的归一化图案必须一致）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 硬规则（改这个文件之前先读）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 只用 `<View>`：不 require 素材、不画 canvas、不用 SVG。皮肤是"几何 + 颜色"，
 *    不是图 —— 加素材图会让包体变差，也会让预览与成片两条路径悄悄分叉。
 * 2. 只吃四种输入：变体、seed、画幅（width/height）、照片窗口（window）。
 *    图案必须**确定性**：同一个 seed 连调两次要逐元素相同；禁止
 *    `Math.random()` / `Date.now()`，否则取景器预览和成片会长得不一样。
 * 3. 波点 / 笔触 / 晕染**只许落在相纸留白里**（`window` 是照片内容区，压进去就等于
 *    改了用户拍的那张照片）。生成时用 `isOutsideWindow` 过滤，探针里拿五款相框的
 *    真实 window 各断言一遍"窗口内 0 命中"。
 * 4. `classic` 档必须 `return null`：它的渲染树要和 v1.6.1（没有这一层时）逐像素一致，
 *    连一个空 View 都不该多出来。
 *
 * ⚠️ 唯一的例外是 `aged` 的整幅暖化层（`buildSkinWash`）：task 的原话是
 *    "整幅 #F4EEDC 暖化层"，而"绝不许画进 window"那条点名的是**波点 / 笔触 / 晕染**。
 *    所以暖化层故意盖住照片（整幅泛黄才叫"泛黄复古"），晕染与斑点则严格躲开窗口。
 *    如果评审认为照片也不该泛黄：只改 `buildSkinWash` 一个函数（改成按四条边带铺）即可。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 几何约定
 * ─────────────────────────────────────────────────────────────────────────
 * · 原点 = 相纸左上角，单位 pt；调用方传进来的 width/height 就是相纸尺寸。
 * · 比例一律先按 0~1 采样再乘 width/height，所以小预览与大画布严格等比。
 * · 每个元素存的是**旋转后的轴对齐外接盒**（`box`），渲染时按盒心回推 left/top ——
 *    这样"盒子不与窗口相交"才真的等于"像素不会压到照片"。
 */
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import type { BlendMode, FrameVariant, Rect } from '../types';

/**
 * 调用方要给的四个数（+ 半径）。
 *
 * ⚠️ **接口冻结**：`CameraScreen`（取景器实时预览）和 `FilmCompositor`（成片合成）
 *    都按这个签名调用。要加字段只能加成**可选**的，并且要同步告诉 Lead。
 */
export interface FrameSkinProps {
  /** 相纸宽（pt）。取景器里是预览尺寸，成片里是 `layout.width`。 */
  width: number;
  /** 相纸高（pt）。 */
  height: number;
  /** 照片窗口在相纸里的位置（pt，绝对坐标）—— 皮肤绝不画进这个矩形。 */
  window: Rect;
  /** 相纸圆角（pt）。素材相框是直角就传 0 / 不传。 */
  radius?: number;
  /** 风格变体。'classic' 时本组件返回 `null`。 */
  variant: FrameVariant;
  /** 图案种子。成片里由 `frameSkinSeedOf(frame)` 给（目前就是相框 id）。 */
  seed: string;
}

/** 一档皮肤会画的元素种类。 */
export type SkinElementKind = 'wash' | 'bloom' | 'speck' | 'dot' | 'hoop' | 'stroke';

/** 一个待绘制的元素（纯数据，渲染层只按它摆一个 `<View>`）。 */
export interface SkinElement {
  key: string;
  kind: SkinElementKind;
  /** 旋转后的轴对齐外接盒（pt，相对相纸左上角）。 */
  box: Rect;
  /** 渲染尺寸（未旋转，pt）；圆点 / 斑点就是直径。 */
  width: number;
  height: number;
  /** 圆角半径（pt）：圆点 = 直径/2，笔触 = 高/2，方块 = 0。 */
  radius: number;
  /** 旋转角（度），0 = 不旋转。 */
  rotate: number;
  /**
   * 颜色。wash / bloom / speck 把 alpha 写在色串里（`rgba(...)`，做旧那几层
   * 本来就是半透明的"水墨感"）；doodle 用实色 + `opacity`，方便调撞色。
   */
  color: string;
  opacity: number;
  blendMode?: BlendMode;
  /** 空心圈（hoop）的描边宽度；有值时背景走透明。 */
  borderWidth?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// 配方常量：想调"有多旧 / 有多花"，只动这一段就够了
// ─────────────────────────────────────────────────────────────────────────

/** B 档的整幅暖化层。`#F4EEDC` 是 task 点名的相纸底色。 */
const AGED_WASH = '#F4EEDC';
/** 暖化层的不透明度。0.6 是在"低不透明度"和"浅色相纸上仍看得出发黄"之间取的折中。 */
const AGED_WASH_OPACITY = 0.6;

/** 暗房晕染的墨色（RGB）。每级只改 alpha，所以整圈色相统一。 */
const BLOOM_INK = { r: 120, g: 88, b: 40 } as const;
/** 从相纸**外沿往里**每一级占该边留白厚度的比例（6 级刚好铺满一条边带）。 */
const BLOOM_STEPS: readonly number[] = [0.14, 0.16, 0.18, 0.18, 0.18, 0.16];
/** 对应的 alpha：越靠边越深（0.20 → 0.034），是"暗房药水从边上渗进来"的观感。 */
const BLOOM_ALPHAS: readonly number[] = [0.2, 0.155, 0.115, 0.082, 0.055, 0.034];

/** 岁月斑点：颜色固定 `rgba(120, 90, 40, α)`，α ∈ [0.05, 0.14]（task 点名）。 */
const SPECK_INK = { r: 120, g: 90, b: 40 } as const;
const AGED_SPECK_COUNT = 20;
const AGED_SPECK_MIN_RATIO = 0.003;
const AGED_SPECK_MAX_RATIO = 0.013;
const AGED_SPECK_MIN_ALPHA = 0.05;
const AGED_SPECK_MAX_ALPHA = 0.14;

/** C 档的撞色盘：荧光粉 / 柠檬黄 / 天蓝 为主，薄荷偶尔点缀。 */
const DOODLE_INKS: readonly string[] = ['#FF5FA2', '#FFD34D', '#3FB6F0', '#7BE3C0'];
const DOODLE_DOT_COUNT = 16;
const DOODLE_DOT_MIN_RATIO = 0.015;
const DOODLE_DOT_MAX_RATIO = 0.05;
const DOODLE_DOT_MIN_ALPHA = 0.5;
const DOODLE_DOT_MAX_ALPHA = 0.9;
const DOODLE_HOOP_COUNT = 4;
const DOODLE_HOOP_MIN_RATIO = 0.025;
const DOODLE_HOOP_MAX_RATIO = 0.06;
const DOODLE_HOOP_MIN_STROKE_RATIO = 0.004;
const DOODLE_HOOP_MAX_STROKE_RATIO = 0.008;
const DOODLE_STROKE_COUNT = 3;
/**
 * 每条笔触最多重抽几次。
 * 为什么需要：笔触只放上/下两条横带，窄相框（`fp100c`）的带只有几个百分点深，
 * 一次抽签"放不下"就少一条 —— 原来一次抽不中就作废，实测 `fp100c` 的 C 档只剩
 * 1 条笔触，和"2~3 条"对不上。重抽不引入新随机源（同一条 rng 序列继续走），
 * 只是把"放不下"这个理由多试几次；真的放不下依然少画（见下面那个 `continue`）。
 */
const DOODLE_STROKE_RETRY = 8;
const DOODLE_STROKE_MIN_LENGTH_RATIO = 0.18;
const DOODLE_STROKE_MAX_LENGTH_RATIO = 0.34;
const DOODLE_STROKE_MIN_THICK_RATIO = 0.008;
const DOODLE_STROKE_MAX_THICK_RATIO = 0.018;
/** 笔触最大倾角（度）。再大就不像随手一笔，像 UI 里的斜线了。 */
const DOODLE_STROKE_MAX_TILT = 14;
const DOODLE_STROKE_MIN_ALPHA = 0.22;
const DOODLE_STROKE_MAX_ALPHA = 0.4;
/** 笔触在带内最多占几成厚度 —— 留点空气，别顶到窗口边上。 */
const STROKE_BAND_FILL = 0.62;

/**
 * 元素最小可见尺寸：**相纸短边的比例**，而不是固定 pt。
 *
 * 为什么必须按比例：取景器里的实时预览只有 120pt 宽、成片是 300~500pt 宽，两边要
 * 是共用同一个绝对阈值，小预览会悄悄丢掉最细的几层晕染 —— 用户看到的预览和拍出来
 * 的成片就不是同一张图案了（task 里"预览与成片比例完全一致"这条硬要求）。
 * 0.004 在 120pt 预览上 ≈ 0.48pt，和原来的固定 0.5pt 基本重合。
 */
const MIN_VISIBLE_RATIO = 0.004;
/**
 * 过滤窗口时额外让开的安全边：**相纸短边的比例**（同上的等比理由）。
 * 为什么需要：`computeFrameLayout` 把归一化窗口乘尺寸后**取整**（±0.5pt），
 * 让开 0.6% 短边（120pt 预览上 ≈0.72pt、390pt 成片上 ≈2.3pt）之后，
 * 任何取整方向都不会有点压进照片，预览/成片也仍然逐元素等比。
 */
const SKIN_WINDOW_PADDING_RATIO = 0.006;
/** 均匀抽点 vs "先挑一条边带" 的概率。窄侧边靠它才分得到图案。 */
const BAND_PROPOSAL_CHANCE = 0.55;
/** 下带（拍立得的宽下巴）加权：涂鸦与做旧最常出现在那片留白上。 */
const BOTTOM_BAND_BIAS = 1.6;

// ─────────────────────────────────────────────────────────────────────────
// 纯几何
// ─────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function rgba(r: number, g: number, b: number, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/**
 * 点 `(x, y)` 是否落在照片窗口**之外**。
 *
 * ⚠️ 贴边算"没出去"（返回 `false`）—— 宁可少画一颗点，也不赌那半个像素。
 */
export function isOutsideWindow(x: number, y: number, window: Rect): boolean {
  return (
    x < window.left ||
    x > window.left + window.width ||
    y < window.top ||
    y > window.top + window.height
  );
}

/**
 * 矩形 `box` 是否与照片窗口**完全不相交**（贴边算不相交）。
 *
 * 为什么点测之外还要这个：一个大盒子可以四个角都在窗口外、中间却把窗口整个吞掉
 * （极端例子：整幅相纸）。生成时两个都跑 —— 点测是 task 点名要的，
 * 盒测才真正保证"一个像素都不压进照片"。
 */
export function isRectOutsideWindow(box: Rect, window: Rect): boolean {
  return (
    box.left + box.width <= window.left ||
    box.left >= window.left + window.width ||
    box.top + box.height <= window.top ||
    box.top >= window.top + window.height
  );
}

/** 把窗口往外撑 `by` pt，用于过滤（见 `SKIN_WINDOW_PADDING_RATIO`）。 */
function inflateRect(rect: Rect, by: number): Rect {
  return {
    left: rect.left - by,
    top: rect.top - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

/** 四条边带之一（相纸留白的一部分）。 */
interface SkinBand {
  side: 'top' | 'bottom' | 'left' | 'right';
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 病态输入（窗口把相纸铺满）时的零面积带，调用方会自然放弃。 */
const EMPTY_BAND: SkinBand = { side: 'bottom', left: 0, top: 0, width: 0, height: 0 };

/**
 * 把"相纸留白"切成**四条互不重叠**的边带：上、下两条横贯整幅，
 * 左、右两条只占窗口所在的那一段 —— 四条带拼起来正好是"相纸 − 窗口"，
 * 不多不少、不互相重叠（重叠会让半透明层在接缝处叠出更深的边）。
 * 窗口贴边（留白为 0）的那条带不生成。
 */
function marginBands(width: number, height: number, window: Rect): SkinBand[] {
  const left = clamp(window.left, 0, width);
  const top = clamp(window.top, 0, height);
  const right = clamp(window.left + window.width, left, width);
  const bottom = clamp(window.top + window.height, top, height);
  const bands: SkinBand[] = [];
  if (top > 0) {
    bands.push({ side: 'top', left: 0, top: 0, width, height: top });
  }
  if (height - bottom > 0) {
    bands.push({ side: 'bottom', left: 0, top: bottom, width, height: height - bottom });
  }
  const bodyHeight = bottom - top;
  if (bodyHeight > 0 && left > 0) {
    bands.push({ side: 'left', left: 0, top, width: left, height: bodyHeight });
  }
  if (bodyHeight > 0 && width - right > 0) {
    bands.push({ side: 'right', left: right, top, width: width - right, height: bodyHeight });
  }
  return bands;
}

/**
 * 按面积加权抽一条边带；下带（下巴）额外乘 `BOTTOM_BAND_BIAS`。
 * 权重是"面积"，所以大留白自然被抽中更多次。
 */
function pickBand(rng: () => number, bands: readonly SkinBand[]): SkinBand {
  let total = 0;
  for (const band of bands) {
    total += band.width * band.height * (band.side === 'bottom' ? BOTTOM_BAND_BIAS : 1);
  }
  if (total <= 0) {
    return EMPTY_BAND;
  }
  let ticket = rng() * total;
  for (const band of bands) {
    ticket -= band.width * band.height * (band.side === 'bottom' ? BOTTOM_BAND_BIAS : 1);
    if (ticket <= 0) {
      return band;
    }
  }
  const last = bands[bands.length - 1];
  return last !== undefined ? last : EMPTY_BAND;
}

/**
 * 给一个 `boxWidth × boxHeight` 的足迹抽位置：
 * 一半概率"整幅均匀"，一半概率"先挑一条边带、再带内均匀"。
 * 前者让图案自然聚在大块留白上（拍立得的宽下巴），后者保证很窄的侧边也分得到几颗 ——
 * 只按面积均匀抽的话，5% 宽的侧带几乎永远抽不到，那一侧就全空了。
 *
 * 返回 `null` = 这次抽签放不下（带比足迹还窄），调用方继续重抽。
 */
function sampleBox(
  rng: () => number,
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
  bands: readonly SkinBand[],
): Rect | null {
  if (bands.length > 0 && rng() < BAND_PROPOSAL_CHANCE) {
    const band = pickBand(rng, bands);
    const spanX = band.width - boxWidth;
    const spanY = band.height - boxHeight;
    if (spanX < 0 || spanY < 0) {
      return null;
    }
    return {
      left: band.left + rng() * spanX,
      top: band.top + rng() * spanY,
      width: boxWidth,
      height: boxHeight,
    };
  }
  const spanX = width - boxWidth;
  const spanY = height - boxHeight;
  if (spanX < 0 || spanY < 0) {
    return null;
  }
  return { left: rng() * spanX, top: rng() * spanY, width: boxWidth, height: boxHeight };
}

// ─────────────────────────────────────────────────────────────────────────
// 确定性随机
// ─────────────────────────────────────────────────────────────────────────

/**
 * 字符串 seed → 32 位整数（FNV-1a）。
 * seed 是相框 id（`'polaroid-600'` 这种）或设置页给的串，不能直接当状态用。
 */
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32：32 位状态、分布够均匀、5 行实现、零依赖。 */
function mulberry32(state: number): () => number {
  let next = state >>> 0;
  return () => {
    next = (next + 0x6d2b79f5) >>> 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────────────────────────────────

/**
 * B 档的整幅暖化层；别的档 / 尺寸非法时返回 `null`。
 *
 * ⚠️ 它**故意**盖住照片窗口 —— 见文件头那条"唯一的例外"。
 * 返回值是元素而不是布尔值，是为了让调用方（和探针）能直接看见它的几何与混合模式。
 */
export function buildSkinWash(
  variant: FrameVariant,
  width: number,
  height: number,
): SkinElement | null {
  if (variant !== 'aged' || !(width > 0) || !(height > 0)) {
    return null;
  }
  return {
    key: 'wash',
    kind: 'wash',
    box: { left: 0, top: 0, width, height },
    width,
    height,
    radius: 0,
    rotate: 0,
    color: AGED_WASH,
    opacity: AGED_WASH_OPACITY,
    blendMode: 'multiply',
  };
}

/**
 * 一档皮肤在**相纸留白**里要画的所有元素（`classic` 恒为空数组）。
 *
 * 纯函数：同一个 (variant, seed, width, height, window) 一定给出同一串元素。
 * 探针直接拿它跑断言（窗口内 0 命中、逐元素可复现、小预览与大画布等比）。
 */
export function buildSkinElements(
  variant: FrameVariant,
  seed: string,
  width: number,
  height: number,
  window: Rect,
): SkinElement[] {
  if (!(width > 0) || !(height > 0)) {
    return [];
  }
  if (variant === 'classic') {
    return [];
  }
  // seed 里再拌上变体名：同一款相框的 aged 与 doodle 各拿一条独立的随机序列，
  // 免得"换风格后斑点和波点排成同一串位置"。
  const rng = mulberry32(hashSeed(`${variant}\u00b7${seed}`));
  if (variant === 'aged') {
    return buildAgedElements(rng, width, height, window);
  }
  if (variant === 'doodle') {
    return buildDoodleElements(rng, width, height, window);
  }
  return [];
}

/** B 档：四周暗房晕染（只有留白）+ 岁月斑点。整幅暖化层走 `buildSkinWash`。 */
function buildAgedElements(
  rng: () => number,
  width: number,
  height: number,
  window: Rect,
): SkinElement[] {
  const elements: SkinElement[] = [];
  /*
    安全边与最小可见尺寸都按**相纸短边**取比例，不写死 pt：
    取景器里的实时预览只有约 120pt 宽、成片是 300~500pt 宽，写死 pt 会让两边的
    元素集合不一致（预览里被过滤掉的碎片，成片里还在），那就不是"同一张图案"了。
  */
  const shortSide = Math.min(width, height);
  const safe = inflateRect(window, SKIN_WINDOW_PADDING_RATIO * shortSide);
  const minVisible = MIN_VISIBLE_RATIO * shortSide;
  const bands = marginBands(width, height, window);

  // ① 暗房晕染：每条边带由外向内 6 级，越靠边越深。
  for (const band of bands) {
    const horizontal = band.side === 'top' || band.side === 'bottom';
    const depth = horizontal ? band.height : band.width;
    const outerFirst = band.side === 'top' || band.side === 'left';
    let cursor = 0;
    for (let step = 0; step < BLOOM_STEPS.length; step += 1) {
      const thickness = depth * BLOOM_STEPS[step];
      // 外沿起算；下/右两条边带的"外沿"在另一头，所以要反过来摆。
      const offset = outerFirst ? cursor : depth - cursor - thickness;
      cursor += thickness;
      if (thickness < minVisible) {
        continue;
      }
      const box: Rect = horizontal
        ? { left: band.left, top: band.top + offset, width: band.width, height: thickness }
        : { left: band.left + offset, top: band.top, width: thickness, height: band.height };
      if (!isRectOutsideWindow(box, safe)) {
        continue;
      }
      elements.push({
        key: `bloom-${band.side}-${step}`,
        kind: 'bloom',
        box,
        width: box.width,
        height: box.height,
        radius: 0,
        rotate: 0,
        color: rgba(BLOOM_INK.r, BLOOM_INK.g, BLOOM_INK.b, BLOOM_ALPHAS[step]),
        opacity: 1,
      });
    }
  }

  // ② 岁月斑点：整幅均匀撒，靠 isOutsideWindow 把落进照片的那些拒掉。
  let placed = 0;
  for (let attempt = 0; attempt < AGED_SPECK_COUNT * 8 && placed < AGED_SPECK_COUNT; attempt += 1) {
    const diameter =
      (AGED_SPECK_MIN_RATIO + rng() * (AGED_SPECK_MAX_RATIO - AGED_SPECK_MIN_RATIO)) * width;
    const box = sampleBox(rng, width, height, diameter, diameter, bands);
    if (box === null) {
      continue;
    }
    if (!isOutsideWindow(box.left + box.width / 2, box.top + box.height / 2, window)) {
      continue;
    }
    if (!isRectOutsideWindow(box, safe)) {
      continue;
    }
    const alpha = AGED_SPECK_MIN_ALPHA + rng() * (AGED_SPECK_MAX_ALPHA - AGED_SPECK_MIN_ALPHA);
    elements.push({
      key: `speck-${placed}`,
      kind: 'speck',
      box,
      width: box.width,
      height: box.height,
      radius: box.width / 2,
      rotate: 0,
      color: rgba(SPECK_INK.r, SPECK_INK.g, SPECK_INK.b, alpha),
      opacity: 1,
    });
    placed += 1;
  }

  return elements;
}

/** C 档：撞色波点 + 空心圈 + 手绘笔触，全部落在留白里。 */
function buildDoodleElements(
  rng: () => number,
  width: number,
  height: number,
  window: Rect,
): SkinElement[] {
  const elements: SkinElement[] = [];
  const shortSide = Math.min(width, height);
  const safe = inflateRect(window, SKIN_WINDOW_PADDING_RATIO * shortSide);
  const minVisible = MIN_VISIBLE_RATIO * shortSide;
  const bands = marginBands(width, height, window);
  let counter = 0;

  // ① 撞色波点：口径 1.5%~5% 相纸宽，大小不一 —— "不规则"正是手绘感的来源。
  let dots = 0;
  for (let attempt = 0; attempt < DOODLE_DOT_COUNT * 10 && dots < DOODLE_DOT_COUNT; attempt += 1) {
    const diameter =
      (DOODLE_DOT_MIN_RATIO + rng() * (DOODLE_DOT_MAX_RATIO - DOODLE_DOT_MIN_RATIO)) * width;
    const box = sampleBox(rng, width, height, diameter, diameter, bands);
    if (box === null) {
      continue;
    }
    if (!isOutsideWindow(box.left + box.width / 2, box.top + box.height / 2, window)) {
      continue;
    }
    if (!isRectOutsideWindow(box, safe)) {
      continue;
    }
    elements.push({
      key: `dot-${counter}`,
      kind: 'dot',
      box,
      width: box.width,
      height: box.height,
      radius: box.width / 2,
      rotate: 0,
      color: DOODLE_INKS[Math.floor(rng() * DOODLE_INKS.length)],
      opacity: DOODLE_DOT_MIN_ALPHA + rng() * (DOODLE_DOT_MAX_ALPHA - DOODLE_DOT_MIN_ALPHA),
    });
    counter += 1;
    dots += 1;
  }

  // ② 空心圈：同样撞色，但只有描边 —— 破掉"全是实心圆"的呆板。
  let hoops = 0;
  for (let attempt = 0; attempt < DOODLE_HOOP_COUNT * 10 && hoops < DOODLE_HOOP_COUNT; attempt += 1) {
    const diameter =
      (DOODLE_HOOP_MIN_RATIO + rng() * (DOODLE_HOOP_MAX_RATIO - DOODLE_HOOP_MIN_RATIO)) * width;
    const borderWidth =
      (DOODLE_HOOP_MIN_STROKE_RATIO +
        rng() * (DOODLE_HOOP_MAX_STROKE_RATIO - DOODLE_HOOP_MIN_STROKE_RATIO)) *
      width;
    /*
      描边太细就别画（0.18pt 的圈在小预览上等于没有）。
      **必须用 `minVisible`（相纸短边的比例）而不是写死的 0.4pt**：
      写死之后 `96×72` 的抽屉预览里相纸只有 45~72pt 宽，描边 0.18~0.36pt 全部
      小于 0.4 → 4 个空心圈**一个不剩**，而成片里 4 个都在 ——
      "预览里少一整类元素"正是探针抓出来的那 9 条失败。
    */
    if (borderWidth < minVisible) {
      continue;
    }
    const box = sampleBox(rng, width, height, diameter, diameter, bands);
    if (box === null) {
      continue;
    }
    if (!isOutsideWindow(box.left + box.width / 2, box.top + box.height / 2, window)) {
      continue;
    }
    if (!isRectOutsideWindow(box, safe)) {
      continue;
    }
    elements.push({
      key: `hoop-${counter}`,
      kind: 'hoop',
      box,
      width: box.width,
      height: box.height,
      radius: box.width / 2,
      rotate: 0,
      color: DOODLE_INKS[Math.floor(rng() * DOODLE_INKS.length)],
      opacity: DOODLE_DOT_MIN_ALPHA + rng() * (DOODLE_DOT_MAX_ALPHA - DOODLE_DOT_MIN_ALPHA),
      borderWidth,
    });
    counter += 1;
    hoops += 1;
  }

  // ③ 手绘笔触：2~3 条圆角长条，只放上/下两条横带（侧带太窄，塞不下一条像样的笔触）。
  const horizontal = bands.filter((band) => band.side === 'top' || band.side === 'bottom');
  let strokes = 0;
  let strokeAttempt = 0;
  while (
    strokes < DOODLE_STROKE_COUNT &&
    horizontal.length > 0 &&
    strokeAttempt < DOODLE_STROKE_COUNT * DOODLE_STROKE_RETRY
  ) {
    const band = horizontal[strokeAttempt % horizontal.length];
    strokeAttempt += 1;
    const rotate = (rng() * 2 - 1) * DOODLE_STROKE_MAX_TILT;
    const radian = (Math.abs(rotate) * Math.PI) / 180;
    const cos = Math.cos(radian);
    const sin = Math.sin(radian);
    let thickness =
      (DOODLE_STROKE_MIN_THICK_RATIO +
        rng() * (DOODLE_STROKE_MAX_THICK_RATIO - DOODLE_STROKE_MIN_THICK_RATIO)) *
      width;
    let length =
      (DOODLE_STROKE_MIN_LENGTH_RATIO +
        rng() * (DOODLE_STROKE_MAX_LENGTH_RATIO - DOODLE_STROKE_MIN_LENGTH_RATIO)) *
      width;
    // 旋转后的外接盒：W = |L·cosθ| + |t·sinθ|，H = |L·sinθ| + |t·cosθ|。
    // 先把长度收进带宽里：H 必须放得下，其次 W 不能超过带长。
    const maxHeight = band.height * STROKE_BAND_FILL;
    thickness = Math.min(thickness, maxHeight);
    if (thickness < minVisible) {
      continue;
    }
    const maxByHeight =
      sin > 0.001 ? (maxHeight - thickness * cos) / sin : Number.POSITIVE_INFINITY;
    length = Math.min(length, maxByHeight, band.width * STROKE_BAND_FILL);
    if (!(length > 0) || length < width * DOODLE_STROKE_MIN_LENGTH_RATIO * 0.5) {
      continue; // 放不下就不画 —— 宁可少一条，也别画根面条贴在边上。
    }
    const boxWidth = length * cos + thickness * sin;
    const boxHeight = length * sin + thickness * cos;
    const box: Rect = {
      left: band.left + rng() * Math.max(0, band.width - boxWidth),
      top: band.top + rng() * Math.max(0, band.height - boxHeight),
      width: boxWidth,
      height: boxHeight,
    };
    if (!isRectOutsideWindow(box, safe)) {
      continue;
    }
    elements.push({
      key: `stroke-${strokes}`,
      kind: 'stroke',
      box,
      width: length,
      height: thickness,
      radius: thickness / 2,
      rotate,
      color: DOODLE_INKS[Math.floor(rng() * DOODLE_INKS.length)],
      opacity:
        DOODLE_STROKE_MIN_ALPHA + rng() * (DOODLE_STROKE_MAX_ALPHA - DOODLE_STROKE_MIN_ALPHA),
    });
    strokes += 1;
  }

  return elements;
}

// ─────────────────────────────────────────────────────────────────────────
// 渲染
// ─────────────────────────────────────────────────────────────────────────

/**
 * 一个元素 → 一个 `<View>` 的样式。
 * `box` 是**旋转后**的外接盒，所以按盒心回推 left/top（旋转以元素中心为轴）。
 */
function elementStyle(element: SkinElement): ViewStyle {
  const style: ViewStyle = {
    position: 'absolute',
    left: element.box.left + element.box.width / 2 - element.width / 2,
    top: element.box.top + element.box.height / 2 - element.height / 2,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    backgroundColor: element.kind === 'hoop' ? 'transparent' : element.color,
  };
  if (element.radius > 0) {
    style.borderRadius = element.radius;
  }
  if (element.rotate !== 0) {
    style.transform = [{ rotate: `${element.rotate}deg` }];
  }
  if (element.blendMode !== undefined) {
    style.mixBlendMode = element.blendMode;
  }
  if (element.borderWidth !== undefined) {
    style.borderWidth = element.borderWidth;
    style.borderColor = element.color;
  }
  return style;
}

function FrameSkinInner({
  width,
  height,
  window: photoWindow,
  radius = 0,
  variant,
  seed,
}: FrameSkinProps) {
  const wash = useMemo(() => buildSkinWash(variant, width, height), [variant, width, height]);
  const elements = useMemo(
    () => buildSkinElements(variant, seed, width, height, photoWindow),
    // ⚠️ 依赖里除了 [variant, seed] 还必须有 width/height/window：
    //   换相框、转屏都会换画幅，只认 seed 的话会留着上一套几何（错位）。
    //   写成四个标量而不是 window 对象，是为了不要求调用方把 window 缓存起来。
    [
      variant,
      seed,
      width,
      height,
      photoWindow.left,
      photoWindow.top,
      photoWindow.width,
      photoWindow.height,
    ],
  );

  // classic 档（以及尺寸还没量出来的那一帧）**必须**什么都不渲染：
  // 那档的渲染树要和 v1.6.1 逐像素一致。
  if (variant === 'classic' || !(width > 0) || !(height > 0)) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.root, { width, height, borderRadius: radius }]}>
      {wash !== null ? <View style={elementStyle(wash)} /> : null}
      {elements.map((element) => (
        <View key={element.key} style={elementStyle(element)} />
      ))}
    </View>
  );
}

/**
 * 相框皮肤。`memo` 是必要的：取景器每次重排（拖动、对焦、状态变化）都会重建整棵树，
 * 而皮肤只跟 (variant, seed, 画幅, 窗口) 有关 —— 没变就不该重画。
 */
export const FrameSkin = memo(FrameSkinInner);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    // 裁掉溢出：元素本来都在相纸内，但相纸圆角 + 取整可能多出半个点。
    overflow: 'hidden',
  },
});
