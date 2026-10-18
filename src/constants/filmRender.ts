/**
 * v2.0.0 成片像素渲染常量（LUT → halation → vignette → grain）
 *
 * 这些数值同时是门禁口径：`_probe_v200_lut.cjs` 逐条断言，`_v200_contract.md` §3 与
 * README §51.5 记录同一组数字。改数值必须同步三处，否则门禁会红。
 *
 * 视觉依据：`_v200_render_ref.py` 的 numpy 参考渲染 + 两张实拍图（城市/雪景）+ 九卷对照，
 * 参数标定目标：
 *  · halation 只在真正的高光（post-LUT luma ≥ 0.72）附近起晕，暖红，不污染中间调；
 *  · grain 中间调最强（4L(1−L)·(1−0.55L) 响应，阴影略强于高光），高光/纯黑几乎没有，
 *    细/粗两档配比把颗粒尺度做到 ≈1.5px@2048（避免「数字噪点」感）；
 *  · vignette 角部 −0.55 ~ −0.92EV（随试卷暗角 0.16~0.30），过渡用 1.4 次幂（比高斯更贴真实 cos⁴ 衰减）。
 */

/** LUT 立方体边长（33³ = 35,937 项 × 3 通道 = 107,811 B/卷） */
export const LUT_SIZE = 33;

/** 九卷 id（顺序与 `PRESETS` 一致，门禁用它校验图集覆盖率） */
export const LUT_STOCK_IDS = [
  'um-400',
  'gd-200',
  'pt-400',
  'cp-200',
  'fj-400',
  'ek-100',
  'cs-800t',
  'hp-400',
  'tx-400',
] as const;

export type LutStockId = (typeof LUT_STOCK_IDS)[number];

/** halation 起晕阈值（post-LUT luma，0..1） */
export const HALATION_THRESHOLD = 0.72;

/** halation 暖色（screen 叠加的 RGB 权重，归一化） */
export const HALATION_COLOR: readonly [number, number, number] = [1, 0.42, 0.24];

/** halation 模糊半径（降采样后的像素；降采样倍率见 HALATION_DOWNSCALE_TARGET） */
export const HALATION_RADIUS_DS = 4;

/** halation 模糊 box 半径的重复遍数（3 遍 ≈ 高斯） */
export const HALATION_BLUR_PASSES = 3;

/** 降采样目标长边：输出长边 / 这个值 = 降采样倍率（2048 → 4） */
export const HALATION_DOWNSCALE_TARGET = 512;

/**
 * 每卷 halation 强度（screen 叠加比例）。
 * 钨丝夜景片（cs-800t）halation 最重；反转片/黑白几乎不 halo；其余常规彩负 0.14。
 */
export const HALATION_BY_STOCK: Readonly<Record<string, number>> = {
  'cs-800t': 0.22,
  'ek-100': 0.1,
  'hp-400': 0.1,
  'tx-400': 0.1,
};

/** 卷不在表里时用的 halation 强度 */
export const HALATION_DEFAULT = 0.14;

/** 颗粒幅度 = 用户颗粒档位 × 这个系数（档位见 `constants/grain.ts`，0 / 0.04 / 0.075 / 0.115 / 0.16） */
export const GRAIN_AMPLITUDE_PER_LEVEL = 1.2;

/** 颗粒幅度上限（防止「极重」档在像素管线里压过画面） */
export const GRAIN_AMPLITUDE_MAX = 0.18;

/** 细颗粒权重（每像素白噪；与粗颗粒配比决定颗粒尺度 ≈1.5px@2048）*/
export const GRAIN_FINE_WEIGHT = 0.5;

/** 粗颗粒权重（2×2 聚合后再双线性放大，模拟银盐团簇） */
export const GRAIN_COARSE_WEIGHT = 1.15;

/**
 * 阴影偏置：银盐颗粒在低密度区更明显，亮度响应在 4L(1−L) 上再乘 (1 − bias·L)，
 * 使 64/192 灰阶的 RMS 比落在 1.3–2.0（T10 口径）。
 */
export const GRAIN_SHADOW_BIAS = 0.55;

/** 暗角基础强度（与预设暗角叠加） */
export const VIGNETTE_BASE = 0.14;

/** 暗角强度 = VIGNETTE_BASE + preset.vignette × VIGNETTE_GAIN */
export const VIGNETTE_GAIN = 1.1;

/** 暗角强度上限（角部最多压到 1 − 0.55 = 45%，约 −1.15EV） */
export const VIGNETTE_MAX = 0.55;

/** 暗角径向幂次（中心 0 → 角 1，1.4 次幂比线性更贴 cos⁴） */
export const VIGNETTE_EXPONENT = 1.4;

/** 颗粒幅度：用户档位（0..1）→ 像素增量幅度 */
export function grainAmplitudeFor(grainLevel: number): number {
  const raw = grainLevel * GRAIN_AMPLITUDE_PER_LEVEL;
  return Math.max(0, Math.min(GRAIN_AMPLITUDE_MAX, raw));
}

/** 暗角强度：预设暗角（0.16~0.28）→ 角部衰减比例 */
export function vignetteStrengthFor(presetVignette: number): number {
  const raw = VIGNETTE_BASE + presetVignette * VIGNETTE_GAIN;
  return Math.max(0, Math.min(VIGNETTE_MAX, raw));
}

/** 卷 id → halation 强度 */
export function halationFor(stockId: string): number {
  const value = HALATION_BY_STOCK[stockId];
  return value === undefined ? HALATION_DEFAULT : value;
}
