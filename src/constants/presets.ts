/**
 * 胶片抽屉的预设数据。选卷 UI 使用 PRESETS；成片 LUT 人格见 filmProfiles.ts。
 * 已下架卷保留在 LEGACY_PRESET_ID_ALIASES，仅用于旧照片回放。
 */
import type {
  FilmPreset,
  ResolvedColorGrade,
  ResolvedFilmPreset,
  ResolvedTimestampConfig,
} from '../types';
import { clampIntensityScale } from './intensity';
import { DEFAULT_CAPTURE_QUALITY, resolveCaptureLongEdge } from './captureQuality';

/** 调色/颗粒/暗角等参数的默认值：不写就用它。 */
export const PRESET_DEFAULTS = {
  /** 色温与用户白平衡旋钮相加；未指定卷默认为中性。 */
  temperature: 0,
  /** 色调与用户旋钮相加。 */
  tint: 0,
  /** 零模糊 S 曲线；0 = 不出图层。 */
  sCurveContrast: 0,
  /** 同源色度锁，保护原图色彩；黑白卷使用中性灰去色层。 */
  chromaLock: 0,
  /** 曝光提亮；0 = 不出图层。 */
  exposureLift: 0,
  /** 黑位托底；当前卷都不使用。 */
  shadowCrush: 0,
  /**
   * 化学冷暖分离色。空串 = 该卷没有这一层；
   * v1.9.4 起混合模式**只允许 soft-light**（渲染侧会 sanitize）。
   */
  shadowTint: '',
  shadowTintBlendMode: 'soft-light',
  shadowTintOpacity: 0,
  highlightTint: '',
  highlightTintBlendMode: 'soft-light',
  highlightTintOpacity: 0,
  /** 暖红光晕：仅 CS-800T 使用。 */
  halation: 0,
  /**
   * 颗粒**强度**（v1.8.3 起 = 图层绝对不透明度）。
   * v1.9.4 默认 0.025 = 标准档；运行时会先被用户颗粒档位覆盖（applyGrainLevel），
   * 本字段只为历史/兼容保留，不直接参与渲染。
   */
  grain: 0.025,
  /** 灰尘与划痕（历史字段，v1.8.3 起不再产生图层）。 */
  dust: 0,
  /** 轻微暗角缺省值；各卷可以覆盖。 */
  vignette: 0.12,
  lightLeak: 0,
  lightLeakFlip: false,
  /** 真黑白：满幅 #808080 + 'color' 混合 = 数学上 R=G=B 的真去色。 */
  mono: false,
  showGuide: true,
  /**
   * 保存前把原图最长边压到多少像素。**0 = 不压缩**（用相机原图，约 12 MP）。
   * 注意：0 会让合成期间多占约 48 MB 内存，但成片画质只受 captureLongEdge 限制。
   */
  normalizeMaxLongEdge: 0,
  /**
   * 成片的长边目标像素数。**默认值来自画质档**：`resolveCaptureLongEdge(DEFAULT_CAPTURE_QUALITY)`
   * —— 三档与内存口径见 `captureQuality.ts`，当前默认 = 1800（standard）。
   */
  captureLongEdge: resolveCaptureLongEdge(DEFAULT_CAPTURE_QUALITY),
} as const;

/** 日期水印默认值（经典橙色液晶）。 */
export const DEFAULT_TIMESTAMP: Omit<ResolvedTimestampConfig, 'fontFamily' | 'anchor'> = {
  enabled: true,
  format: 'YY MM DD',
  color: '#FF8A00',
  fontSizeRatio: 0.055,
  letterSpacingRatio: 0.14,
  glow: true,
  fontWeight: '700',
  insetRatio: 0.028,
};

/** 胶片抽屉顺序与实时预览/回退调色参数；成片主路径的 LUT 人格见 filmProfiles.ts。 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'um-400',
    name: 'UM-400',
    description: '青黑暖光 · 高反差街拍',
    color: {
      temperature: 0.04,
      sCurveContrast: 0.42,
      chromaLock: 0.2,
      exposureLift: 0.14,
      shadowCrush: 0,
      shadowTint: '#344452',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.19,
      highlightTint: '#F2E8D5',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.16,
    },
    grain: 0.025,
    vignette: 0.16,
  },
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '暖金日光 · 柔亮高光',
    color: {
      temperature: 0.1,
      sCurveContrast: 0.35,
      chromaLock: 0.22,
      exposureLift: 0.15,
      shadowCrush: 0,
      shadowTint: '#66523D',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.16,
      highlightTint: '#F1D595',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.18,
    },
    grain: 0.025,
    vignette: 0.13,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '柔粉人像 · 低反差浅黑',
    color: {
      temperature: -0.04,
      sCurveContrast: 0.2,
      chromaLock: 0.25,
      exposureLift: 0.16,
      shadowCrush: 0,
      shadowTint: '#CDD9DB',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.12,
      highlightTint: '#FFDAC3',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.13,
    },
    grain: 0.025,
    vignette: 0.07,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '橄榄茶褐 · 旧日街景',
    color: {
      temperature: 0.07,
      sCurveContrast: 0.32,
      chromaLock: 0.23,
      exposureLift: 0.12,
      shadowCrush: 0,
      shadowTint: '#675B4D',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.16,
      highlightTint: '#D9C486',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.16,
    },
    grain: 0.025,
    vignette: 0.12,
  },
  {
    id: 'dc-200',
    name: 'DC-200',
    description: '冷静纪实 · 柔亮深影',
    color: {
      // 参考低饱和纪实质感，保留肤色与粉花，只对阴影作轻微冷移。
      temperature: -0.025,
      sCurveContrast: 0.3,
      chromaLock: 0.3,
      exposureLift: 0.08,
      shadowCrush: 0,
      shadowTint: '#697A83',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.13,
      highlightTint: '#EEEAE1',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.09,
    },
    grain: 0.025,
    vignette: 0.1,
  },
  {
    id: 'fg-400',
    name: 'FG-400',
    description: '富士绿 · 青影柔红',
    color: {
      temperature: -0.03,
      tint: 0.04,
      sCurveContrast: 0.38,
      chromaLock: 0.24,
      exposureLift: 0.09,
      shadowCrush: 0,
      shadowTint: '#49746B',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.18,
      highlightTint: '#EACDDD',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.11,
    },
    grain: 0.025,
    vignette: 0.14,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转片 · 清晰浓彩',
    color: {
      temperature: 0,
      sCurveContrast: 0.43,
      chromaLock: 0.28,
      exposureLift: 0.09,
      shadowCrush: 0,
      shadowTint: '#5B6870',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.1,
      highlightTint: '#EEF3FA',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.1,
    },
    grain: 0,
    vignette: 0.15,
  },
  {
    id: 'rb-100',
    name: 'RB-100',
    description: '理光蓝 · 晴空正片',
    color: {
      temperature: -0.04,
      sCurveContrast: 0.4,
      chromaLock: 0.27,
      exposureLift: 0.09,
      shadowCrush: 0,
      shadowTint: '#4C6474',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.15,
      highlightTint: '#F2E9D6',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.12,
    },
    grain: 0.015,
    vignette: 0.14,
  },
  {
    id: 'mt-500',
    name: 'MT-500',
    description: '柔阶电影 · 留住夜色',
    color: {
      // 参考宽容电影影调；轻抬阴影但保持黑位，避免整张照片变灰。
      temperature: -0.015,
      sCurveContrast: 0.15,
      chromaLock: 0.34,
      exposureLift: 0.1,
      shadowCrush: 0,
      shadowTint: '#72808B',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.08,
      highlightTint: '#ECE6DB',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.08,
    },
    grain: 0.02,
    vignette: 0.07,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '钨丝夜色 · 蓝影暖灯',
    color: {
      temperature: -0.1,
      tint: -0.04,
      sCurveContrast: 0.3,
      chromaLock: 0.23,
      exposureLift: 0.1,
      shadowCrush: 0,
      shadowTint: '#5377A0',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.19,
      highlightTint: '#C9E4FF',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.12,
      halation: 0.02,
    },
    grain: 0.025,
    vignette: 0.16,
  },
  {
    id: 'hp-400',
    name: 'HP-400',
    description: '纪实黑白 · 银盐灰阶',
    mono: true,
    color: {
      sCurveContrast: 0.28,
      exposureLift: 0.07,
      shadowCrush: 0,
    },
    grain: 0.025,
    vignette: 0.11,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.9.0 起是 ek-100 反转片，v2.1.0 不变）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v2.1.0 起仍是 UM-400 王牌卷）。 */
export const DEFAULT_PRESET_ID = 'um-400';

/**
 * 旧代号 → 新代号的兼容映射（v1.9.0 底片库换代，v1.9.1~v1.9.4 数值重做、映射不变）。
 *
 * 用途**只有一处**：旧版本拍下的照片在 `galleryStore` 里记着旧 `presetId`
 * （v1.8.9 的 gd-200/… 以及 v1.8.10~v1.8.11 的 su-200/…），重新冲印/回放时
 * `findPresetIndex()` 先查这张表，让旧照片还能落到"性格最接近"的新卷上。
 *
 * 选卷 UI / 胶片抽屉不读这张表；卡片只来自 PRESETS。
 * 这张表是只读的历史账本，新代号不再迭代时不要往里加。
 */
export const LEGACY_PRESET_ID_ALIASES: Readonly<Record<string, string>> = {
  // 下架卷及其旧代号保留旧照片回放；只映射到当前在售卷。
  'fj-400': 'fg-400',
  'tx-400': 'hp-400',
  'hp-400-bw': 'hp-400',
  'tx-400-bw': 'hp-400',
  'su-200': 'gd-200',
  'vl-400': 'pt-400',
  'vx-400': 'um-400',
  'am-200': 'cp-200',
  'nz-400': 'fg-400',
  'ri-100': 'ek-100',
  'nt-800t': 'cs-800t',
  'mn-400-bw': 'hp-400',
  'sl-400-bw': 'hp-400',
};

/**
 * 按 id 找预设下标；找不到返回 0。
 * 旧代号先过 `LEGACY_PRESET_ID_ALIASES`（旧照片兼容），再查表；都不中才回落默认卷。
 */
export function findPresetIndex(id: string): number {
  const target = LEGACY_PRESET_ID_ALIASES[id] ?? id;
  const index = PRESETS.findIndex((preset) => preset.id === target);
  return index >= 0 ? index : 0;
}

/** 循环取下标（左下角那排预设胶囊用它左右翻）。 */
export function wrapPresetIndex(index: number): number {
  const length = PRESETS.length;
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

/**
 * 把"用户写的预设"补全成"管线要用的预设"。
 * 纯函数、无副作用 —— 这是 `processFilmPhoto` 的第一行，也是单测的第一个断言点。
 */
export function resolvePreset(preset: FilmPreset): ResolvedFilmPreset {
  const color = preset.color;
  const resolvedColor: ResolvedColorGrade = {
    temperature: color.temperature ?? PRESET_DEFAULTS.temperature,
    tint: color.tint ?? PRESET_DEFAULTS.tint,
    sCurveContrast: color.sCurveContrast ?? PRESET_DEFAULTS.sCurveContrast,
    chromaLock: color.chromaLock ?? PRESET_DEFAULTS.chromaLock,
    exposureLift: color.exposureLift ?? PRESET_DEFAULTS.exposureLift,
    shadowCrush: color.shadowCrush ?? PRESET_DEFAULTS.shadowCrush,
    shadowTint: color.shadowTint ?? PRESET_DEFAULTS.shadowTint,
    shadowTintBlendMode: color.shadowTintBlendMode ?? PRESET_DEFAULTS.shadowTintBlendMode,
    shadowTintOpacity: color.shadowTintOpacity ?? PRESET_DEFAULTS.shadowTintOpacity,
    highlightTint: color.highlightTint ?? PRESET_DEFAULTS.highlightTint,
    highlightTintBlendMode: color.highlightTintBlendMode ?? PRESET_DEFAULTS.highlightTintBlendMode,
    highlightTintOpacity: color.highlightTintOpacity ?? PRESET_DEFAULTS.highlightTintOpacity,
    halation: color.halation ?? PRESET_DEFAULTS.halation,
  };

  const timestamp = preset.timestamp;
  const resolvedTimestamp: ResolvedTimestampConfig = {
    enabled: timestamp?.enabled ?? DEFAULT_TIMESTAMP.enabled,
    format: timestamp?.format ?? DEFAULT_TIMESTAMP.format,
    color: timestamp?.color ?? DEFAULT_TIMESTAMP.color,
    fontSizeRatio: timestamp?.fontSizeRatio ?? DEFAULT_TIMESTAMP.fontSizeRatio,
    letterSpacingRatio: timestamp?.letterSpacingRatio ?? DEFAULT_TIMESTAMP.letterSpacingRatio,
    glow: timestamp?.glow ?? DEFAULT_TIMESTAMP.glow,
    fontWeight: timestamp?.fontWeight ?? DEFAULT_TIMESTAMP.fontWeight,
    // null = 交给 useFilmFonts 决定系统等宽字体
    fontFamily: timestamp?.fontFamily ?? null,
    // null = 用相框自带的 watermark.anchor
    anchor: timestamp?.anchor ?? null,
    insetRatio: timestamp?.insetRatio ?? DEFAULT_TIMESTAMP.insetRatio,
  };

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? '',
    color: resolvedColor,
    grain: preset.grain ?? PRESET_DEFAULTS.grain,
    dust: preset.dust ?? PRESET_DEFAULTS.dust,
    vignette: preset.vignette ?? PRESET_DEFAULTS.vignette,
    lightLeak: preset.lightLeak ?? PRESET_DEFAULTS.lightLeak,
    lightLeakFlip: preset.lightLeakFlip ?? PRESET_DEFAULTS.lightLeakFlip,
    mono: preset.mono ?? PRESET_DEFAULTS.mono,
    timestamp: resolvedTimestamp,
    showGuide: preset.showGuide ?? PRESET_DEFAULTS.showGuide,
    normalizeMaxLongEdge: preset.normalizeMaxLongEdge ?? PRESET_DEFAULTS.normalizeMaxLongEdge,
    captureLongEdge: preset.captureLongEdge ?? PRESET_DEFAULTS.captureLongEdge,
  };
}

/**
 * 预设强度缩放（v2.1.0 用户 m03050 手术二的**声明式侧**）。
 *
 * 渲染侧只认 `intensityScale`（0.35~1.00 的全局风格乘数，档位数据见
 * `constants/intensity.ts`）：取景器实时预览与成片兜底路径
 * 都是「预设图层 + 不透明度」，所以强度在这里就是**把声明式参数整体乘一下**。
 *
 * 规则（与契约 v2.1.0 §2 一致）：
 *   · sCurveContrast / exposureLift / chromaLock / shadowCrush 乘 scale 后各自夹回
 *     合法上限（0.62 / 0.28 / 0.22 / 0.12）—— v2.1.2 起 scale 上限 1.00，
 *     不再做 >1 外推，避免通道截断与伪色；
 *   · shadowTintOpacity / highlightTintOpacity 乘 scale 后夹 `[0, 0.5]`；
 *   · temperature / tint 乘 scale 后夹 `±0.3`（用户 WB 旋钮另有自己的夹取）；
 *   · vignette 乘 scale 后夹 `0.28`；grain **不缩放**（颗粒由用户档位独立控制）；
 *   · scale 非法（NaN / ±Infinity / ≤ 0）一律回落 0.92（与 `clampIntensityScale`
 *     同一口径 = 默认 standard 档），保证调用方传错不崩；
 *   · 其余字段（id/name/description/dust/lightLeak/mono/timestamp/scene…）原样。
 *
 * 纯函数、**不修改入参**：返回一份新的 `ResolvedFilmPreset`，旧对象可以安全复用
 * （`PRESETS` 经过 `resolvePreset()` 后常被缓存，若原地改会污染下一次渲染）。
 */
export function applyPresetIntensity(
  preset: ResolvedFilmPreset,
  intensityScale: number,
): ResolvedFilmPreset {
  const scale = clampIntensityScale(intensityScale);
  const color = preset.color;

  return {
    ...preset,
    color: {
      ...color,
      temperature: clampSignedIntensity(color.temperature * scale, TEMPERATURE_LIMIT),
      tint: clampSignedIntensity(color.tint * scale, TEMPERATURE_LIMIT),
      sCurveContrast: clampIntensity(color.sCurveContrast * scale, S_CURVE_LIMIT),
      chromaLock: clampIntensity(color.chromaLock * scale, CHROMA_LOCK_LIMIT),
      exposureLift: clampIntensity(color.exposureLift * scale, EXPOSURE_LIFT_LIMIT),
      shadowCrush: clampIntensity(color.shadowCrush * scale, SHADOW_CRUSH_LIMIT),
      shadowTintOpacity: clampIntensity(color.shadowTintOpacity * scale, TINT_LIMIT),
      highlightTintOpacity: clampIntensity(color.highlightTintOpacity * scale, TINT_LIMIT),
    },
    vignette: clampIntensity(preset.vignette * scale, VIGNETTE_LIMIT),
  };
}

/** `applyPresetIntensity` 的引擎硬上限（调用方不应绕过这些数字，探针按它们断值）。 */
export const PRESET_INTENSITY_LIMITS = {
  /** 零模糊 S 曲线上限（旧引擎 0.60，v2.1.0 手术一抬到 0.62）。 */
  sCurveContrast: 0.62,
  /** 曝光提亮上限（不变）。 */
  exposureLift: 0.28,
  /** 色度锁上限（v2.1.0 从 0.68 下调到 0.22）。 */
  chromaLock: 0.22,
  /** 黑位托底上限；当前卷不启用。 */
  shadowCrush: 0.12,
  /** 化学染色层不透明度上限。 */
  tintOpacity: 0.5,
  /** 静态色温 / 色调上限（用户 WB 旋钮量 ±0.30）。 */
  temperature: 0.3,
  /** 暗角上限（不变）。 */
  vignette: 0.28,
} as const;

const S_CURVE_LIMIT = PRESET_INTENSITY_LIMITS.sCurveContrast;
const EXPOSURE_LIFT_LIMIT = PRESET_INTENSITY_LIMITS.exposureLift;
const CHROMA_LOCK_LIMIT = PRESET_INTENSITY_LIMITS.chromaLock;
const SHADOW_CRUSH_LIMIT = PRESET_INTENSITY_LIMITS.shadowCrush;
const TINT_LIMIT = PRESET_INTENSITY_LIMITS.tintOpacity;
const TEMPERATURE_LIMIT = PRESET_INTENSITY_LIMITS.temperature;
const VIGNETTE_LIMIT = PRESET_INTENSITY_LIMITS.vignette;

/** 把缩放后的值夹回 `[0, upper]`（NaN 兜底 0）。 */
function clampIntensity(value: number, upper: number): number {
  if (Number.isNaN(value) || value <= 0) {
    return 0;
  }
  return value > upper ? upper : value;
}

/** 把缩放后的值夹回 `[-upper, upper]`（色温/色调可以负向）。 */
function clampSignedIntensity(value: number, upper: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value > upper) {
    return upper;
  }
  return value < -upper ? -upper : value;
}
