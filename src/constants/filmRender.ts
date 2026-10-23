/**
 * 真胶片像素管线的常量（v2.0.1 · 单遍整型管线）
 *
 * v2.0.0 把「LUT → halation → vignette → grain」做成四趟独立的整图遍历，
 * 每趟都要重新读一遍 RGB（v1.9.0 的 `photo + blur + screen` 白雾图层也还在兜底路径里挂着）。
 * v2.1.0 再叠一条用户要求（m03050 手术二）：**预设强度倍率**。v2.1.2（用户 m00001）把它
 * 收敛成**无外推**的 0.35~1.00 全局风格乘数（见 `constants/intensity.ts`）：LUT 输出与原图
 * 按它插值，暗角 EV、颗粒幅度、halation 幅度都乘它、再各自夹到本文件的上下限。
 * scale = 1 = 逐字节等于 v2.0.1 的输出（旧探针不受影响）。
 *
 * v2.0.1 按用户红线重做：
 *
 *   · **halation 只允许「极高光纯 R 通道微扩散」**：阈值 0.88（只看 Luma），
 *     只有 CS-800T（0.12）与极弱的 UM-400 / GD-200（0.015）有值，其余六卷恒 0。
 *     没有任何全屏 `blur + screen` 图层，G/B 通道严格 0 增量 —— 不可能再出乳白雾。
 *   · **颗粒烘焙进同一个像素循环**（不是外部透明图层）：2×2 团簇哈希噪声、
 *     Y 归一化亮度权重 `w = (4·Y·(1−Y) + 0.15) / 1.15`、**单色亮度颗粒**（R/G/B 同一个
 *     delta，没有任何彩卷三通道权重）。强度用**像素幅度** 0 / 2.5 / 5 / 8.5 / 13。
 *   · **暗角限制在 −0.25 ~ −0.55 EV**，中心 55% 完全通透（smoothstep 平台），
 *     不再是中心就开始压的幂函数。
 *   · **LUT 输入长边锁在 1024~1440px**：三档画质各有固定的 JS 像素预算。
 *   · **场景自适应 gamma**：逆光/暗光把 LUT 输入暗部与中间调整体托起（0.88~1.06）。
 *
 * 所有函数都是纯函数、不读任何环境，Node 探针可以直接 import 逐值核对。
 */

import { INTENSITY_SCALE_MAX, INTENSITY_SCALE_MIN } from './intensity';

/**
 * 预设强度倍率区间（v2.1.2 用户 m00001）：0.35 = 35%（subtle）… 1.00 = 100%（max）。
 *
 * 数据源是 `constants/intensity.ts`（UI 那三个入口共用一张档位表）；这里 re-export，
 * 是为了让**像素管线**的常量收口在同一个模块 —— Node 探针只 import 本文件就能核对上下限，
 * 不会出现"UI 一处、渲染一处"两个数各改各的。
 */
export { INTENSITY_SCALE_MAX, INTENSITY_SCALE_MIN };

/** 3D LUT 每轴的采样数（33³ = 35,937 项）。 */
export const LUT_SIZE = 33;

/** 内置 LUT 的十一卷 id。 */
export const LUT_STOCK_IDS = [
  'um-400',
  'gd-200',
  'pt-400',
  'cp-200',
  'dc-200',
  'fg-400',
  'ek-100',
  'rb-100',
  'mt-500',
  'cs-800t',
  'hp-400',
] as const;

export type LutStockId = (typeof LUT_STOCK_IDS)[number];

/* ========================================================================== *
 * Halation：只有「极高光纯 R 通道微扩散」
 * ========================================================================== */

/**
 * 触发 halation 的亮度阈值（Luma 0~1）。
 *
 * 用户红线（m02361）②：旧版 `photo + blur + screen` 全屏图层会把整张照片糊成乳白 CCD 柔光
 * （v1.9.0 已实拍证实），所以只有**极高光**（> 0.88）允许参与，且只在 LUT 像素循环内做
 * **纯 R 通道微扩散**；G/B 严格不动。
 */
export const HALATION_THRESHOLD = 0.88;

/** halation 扩散半径（像素）：5×5 邻域，超出部分不参与。 */
export const HALATION_RADIUS = 2;

/**
 * 5×5 高斯核（σ≈1.2，已归一化为总和 1）。
 *
 * 中心 0.11794；一阶邻域 0.08333/0.02077 这一层是行/列方向；
 * 数值是 `exp(-r²/2.88)` 归一化后的定点近似，探针逐项核对。
 */
export const HALATION_KERNEL: readonly number[] = [
  0.00734, 0.02077, 0.02942, 0.02077, 0.00734,
  0.02077, 0.05889, 0.08333, 0.05889, 0.02077,
  0.02942, 0.08333, 0.11794, 0.08333, 0.02942,
  0.02077, 0.05889, 0.08333, 0.05889, 0.02077,
  0.00734, 0.02077, 0.02942, 0.02077, 0.00734,
];

/**
 * 逐卷 halation 强度（0~1，相对「极高光像素的 R 值」）。
 *
 * 只有 CS-800T 明显（0.12）；UM-400 / GD-200 极弱（0.015）；其余六卷恒 0。
 * 这是用户红线的「白名单」——任何新卷想开 halation 必须显式加进这张表。
 */
export const HALATION_BY_STOCK: Record<LutStockId, number> = {
  'um-400': 0.015,
  'gd-200': 0.015,
  'pt-400': 0,
  'cp-200': 0,
  'dc-200': 0,
  'fg-400': 0,
  'ek-100': 0,
  'rb-100': 0,
  'mt-500': 0,
  'cs-800t': 0.12,
  'hp-400': 0,
};

/** 未登记卷的 halation 缺省值：0（宁可没有，也不许再出一层雾）。 */
export const HALATION_DEFAULT = 0;

/** 卷 id → halation 强度（未知卷返回 `HALATION_DEFAULT`）。 */
export function halationFor(stockId: string): number {
  if (Object.prototype.hasOwnProperty.call(HALATION_BY_STOCK, stockId)) {
    return HALATION_BY_STOCK[stockId as LutStockId];
  }
  return HALATION_DEFAULT;
}

/* ========================================================================== *
 * 颗粒：烘焙进 LUT 像素循环的单色亮度幅度
 * ========================================================================== */

/**
 * 颗粒强度档位（预设 `grain` 值 → 像素幅度，0~255 尺度）。
 *
 * `grain` 是 `GRAIN_LEVELS` 的 opacity（0 / 0.04 / 0.075 / 0.115 / 0.16，约 30 条老断言钉死，
 * 本版**不许改那五个值**），这里只把同一档位映射成像素单位幅度：
 * 0 / 2.5 / 5.0 / 8.5 / 13.0（v2.1.2 用户 m00001：纯单色亮度颗粒，比 v2.1.0 的
 * 0 / 9 / 18 / 30 / 44 收敛）。中间的任意 grain 值按线性插值取到 0.1；超出 0.16 夹到 13.0。
 */
export const GRAIN_PIXEL_LEVELS: readonly { readonly grain: number; readonly pixels: number }[] = [
  { grain: 0, pixels: 0 },
  { grain: 0.04, pixels: 2.5 },
  { grain: 0.075, pixels: 5 },
  { grain: 0.115, pixels: 8.5 },
  { grain: 0.16, pixels: 13 },
];

/** 颗粒像素幅度上限（= 最大档 13.0，用户红线）。 */
export const GRAIN_PIXEL_MAX = 13;

/**
 * grain（预设档位值 0~0.16）→ 像素幅度（0~13，0.1 步进）。
 *
 * 五个档位精确命中 0 / 2.5 / 5 / 8.5 / 13；其它值线性插值后取到 0.1，最后夹 [0, 13]。
 * 幅度允许小数：像素循环里乘完亮度权重再 `Math.round` 成整数 delta（R/G/B 同一个值）。
 */
export function grainPixelFor(grain: number): number {
  if (!Number.isFinite(grain) || grain <= 0) return 0;
  const last = GRAIN_PIXEL_LEVELS[GRAIN_PIXEL_LEVELS.length - 1];
  if (grain >= last.grain) return last.pixels;
  for (let i = 1; i < GRAIN_PIXEL_LEVELS.length; i += 1) {
    const hi = GRAIN_PIXEL_LEVELS[i];
    if (grain <= hi.grain) {
      const lo = GRAIN_PIXEL_LEVELS[i - 1];
      const span = hi.grain - lo.grain;
      if (span <= 0) return hi.pixels;
      const t = (grain - lo.grain) / span;
      const pixels = lo.pixels + (hi.pixels - lo.pixels) * t;
      return Math.min(GRAIN_PIXEL_MAX, Math.max(0, Math.round(pixels * 10) / 10));
    }
  }
  return last.pixels;
}

/** grain（预设档位值）→ 0~1 的幅度（= `grainPixelFor(grain) / 255`，测试/探针用）。 */
export function grainAmplitudeFor(grain: number): number {
  return grainPixelFor(grain) / 255;
}

/** 颗粒亮度权重增益：`w = GRAIN_WEIGHT_GAIN · Y · (1 − Y) + GRAIN_WEIGHT_FLOOR`。 */
export const GRAIN_WEIGHT_GAIN = 4;

/** 颗粒亮度权重下限（暗部/高光也有底噪，避免颗粒只出现在中间调）。 */
export const GRAIN_WEIGHT_FLOOR = 0.15;

/**
 * 亮度权重曲线的峰值：`Y = 0.5` 处的 `4 × 0.25 + 0.15 = 1.15`。
 *
 * 权重表按它归一化（`w / GRAIN_WEIGHT_PEAK`），于是「中间调 delta 的最大值」恰好等于
 * `grainPixelFor()` 给的幅度 —— 表里的 2.5 / 5 / 8.5 / 13 就是真实像素振幅，不再被旧表
 * 的 1.15 倍偷偷放大（v2.1.2 用户 m00001：GRAIN_WEIGHT 表与幅度表配合改）。
 */
export const GRAIN_WEIGHT_PEAK = GRAIN_WEIGHT_GAIN * 0.25 + GRAIN_WEIGHT_FLOOR;

/** 颗粒团簇边长（2×2 同值，肉眼才成「盐粒」而不是电视雪花）。 */
export const GRAIN_CLUSTER_SIZE = 2;

/* ========================================================================== *
 * 暗角：EV 曲线 + 中心 55% 平台
 * ========================================================================== */

/** 最轻一档暗角的角部 EV（magnitude，正数）：−0.25 EV。 */
export const VIGNETTE_EV_SOFT = 0.25;

/** 最深一档暗角的角部 EV（magnitude，正数）：−0.55 EV。 */
export const VIGNETTE_EV_DEEP = 0.55;

/** 预设 `vignette` 的参考值：0.16 映射到最轻一档（`VIGNETTE_EV_SOFT`）。 */
export const VIGNETTE_EV_REFERENCE = 0.16;

/** 预设 `vignette` 超过参考值后的 EV 斜率（每 1.0 增加 2.0 EV）。 */
export const VIGNETTE_EV_SLOPE = 2;

/** 中心平台半径：径向距离 ≤ 55% 角半径的区域完全通透（乘数恰 1）。 */
export const VIGNETTE_CENTER_PLATEAU = 0.55;

/** 径向距离平方的定点刻度（`dx² · 128`，相加后正好落进 257 项查找表）。 */
export const VIGNETTE_RADIUS_SCALE = 128;

/**
 * 预设 `vignette`（0~0.3）→ 角部 EV magnitude（0 / 0.25~0.55）。
 *
 *   v <= 0            → 0（不做暗角）
 *   v = 0.16          → 0.25
 *   v = 0.24          → 0.41
 *   v = 0.30          → 0.53
 *   中间线性、上下夹 [VIGNETTE_EV_SOFT, VIGNETTE_EV_DEEP]。
 */
export function vignetteEvFor(vignette: number): number {
  if (!Number.isFinite(vignette) || vignette <= 0) return 0;
  const magnitude = VIGNETTE_EV_SOFT + (vignette - VIGNETTE_EV_REFERENCE) * VIGNETTE_EV_SLOPE;
  return Math.min(VIGNETTE_EV_DEEP, Math.max(VIGNETTE_EV_SOFT, magnitude));
}

/** 预设 `vignette` → 角部亮度衰减比例（0~0.32，`1 − 2^(−EV)`；测试/探针用）。 */
export function vignetteStrengthFor(vignette: number): number {
  const ev = vignetteEvFor(vignette);
  return ev <= 0 ? 0 : 1 - Math.pow(2, -ev);
}

/* ========================================================================== *
 * 预设强度倍率（v2.1.0 手术二 → v2.1.2 无外推）：所有观感量乘 intensity 后再夹取
 * ========================================================================== */

/** 中性强度（100%）：不乘任何东西，输出与 v2.0.1 逐字节相同（= `max` 档，标定上限）。 */
export const INTENSITY_NEUTRAL = 1;

/**
 * 强度缩放后的暗角 EV 上限（magnitude，正数）。
 *
 * 用户要求（m00001）「强度只在原图与 LUT 之间插值，所有档位 scale ≤ 1」：
 * 上限 0.85 在 scale ≤ 1 时根本不会触发（最深的卷 0.55 × 1.00 = 0.55），
 * 这个盖子只防将来有人把 `VIGNETTE_EV_SOFT/DEEP` 调深。
 *
 * v2.1.2 起**取消了下限**：原来那层 `max(base · scale, 0.15)` 会让 35% 档的暗角
 * 逼近 60%（0.15 / 0.25），与「所有观感量乘同一个 scale」的口径矛盾。
 * 现在暗角就是 `base · scale`，`base <= 0` 的卷仍然是 0（不无中生有）。
 */
export const VIGNETTE_EV_MAX = 0.85;

/**
 * 强度缩放后的颗粒幅度上限（0~255 像素单位，0.1 步进）。
 *
 * v2.1.2 的颗粒表最大档是 13.0（单色亮度颗粒）；`scale ≤ 1` 时有效值不会超过它，
 * 这个盖子只防「将来有人把 `GRAIN_PIXEL_LEVELS` 调到 13 以上」。取整在
 * `filmLookWithIntensity` 里做（保持全整型热路径）。
 */
export const GRAIN_PIXEL_EFFECTIVE_MAX = 13;

/**
 * 强度缩放后的 halation 强度上限（0~1）。
 *
 * 最深的 cs-800t 是 0.22，×1.00 = 0.22，离上限还远；这个盖子只防"将来有人把表调到 0.6 以上"。
 */
export const HALATION_EFFECTIVE_MAX = 0.6;

/* ========================================================================== *
 * LUT 输入长边（JS 像素循环的硬预算）
 * ========================================================================== */

/** 标准档输入长边；相对 1120px 少约 16% 像素，高清档仍保留原尺寸。 */
export const LUT_SOURCE_LONG_EDGE_MIN = 1024;

/** LUT 输入图长边上限（像素）。 */
export const LUT_SOURCE_LONG_EDGE_MAX = 1440;

/** 三档输出画布 → LUT 输入预算。胶片 LUT 不变，只减少纯 JS 要处理的像素数。 */
const LUT_SOURCE_LONG_EDGE_BY_CAPTURE: readonly { readonly capture: number; readonly source: number }[] = [
  { capture: 1800, source: 1024 },
  { capture: 2560, source: 1280 },
  { capture: 3264, source: 1440 },
];

/**
 * 成片画布长边（`captureLongEdge`）→ 进 JS LUT 的图长边（1024~1440）。
 *
 * 用三个画质参考点做分段线性：≤1800 恒 1024，≥3264 恒 1440，中间按比例；没有第三个变量的
 * 隐藏状态 —— `FilmCompositor` 与 `processFilmPhoto` 各算一次也一定得到同一个数。
 */
export function lutSourceLongEdgeFor(captureLongEdge: number): number {
  if (!Number.isFinite(captureLongEdge) || captureLongEdge <= 0) {
    return LUT_SOURCE_LONG_EDGE_MIN;
  }
  if (captureLongEdge <= LUT_SOURCE_LONG_EDGE_BY_CAPTURE[0].capture) {
    return LUT_SOURCE_LONG_EDGE_MIN;
  }
  const last = LUT_SOURCE_LONG_EDGE_BY_CAPTURE[LUT_SOURCE_LONG_EDGE_BY_CAPTURE.length - 1];
  if (captureLongEdge >= last.capture) return LUT_SOURCE_LONG_EDGE_MAX;
  for (let i = 1; i < LUT_SOURCE_LONG_EDGE_BY_CAPTURE.length; i += 1) {
    const hi = LUT_SOURCE_LONG_EDGE_BY_CAPTURE[i];
    if (captureLongEdge <= hi.capture) {
      const lo = LUT_SOURCE_LONG_EDGE_BY_CAPTURE[i - 1];
      const t = (captureLongEdge - lo.capture) / (hi.capture - lo.capture);
      const value = lo.source + (hi.source - lo.source) * t;
      return Math.min(
        LUT_SOURCE_LONG_EDGE_MAX,
        Math.max(LUT_SOURCE_LONG_EDGE_MIN, Math.round(value / 2) * 2),
      );
    }
  }
  return LUT_SOURCE_LONG_EDGE_MAX;
}

/* ========================================================================== *
 * 场景自适应 gamma（吃 sceneStats，只托起暗部/中间调）
 * ========================================================================== */

/** 自适应 gamma 下限（<1 = 提亮暗部与中间调；暗光/逆光最多 0.88）。 */
export const SCENE_GAMMA_MIN = 0.88;

/** 自适应 gamma 上限（>1 = 略压中间调；高调场景最多 1.06，防风光过曝）。 */
export const SCENE_GAMMA_MAX = 1.06;

/** 无场景数据时的中性 gamma。 */
export const SCENE_GAMMA_NEUTRAL = 1;
