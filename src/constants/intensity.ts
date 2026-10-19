/**
 * 预设强度档位表（v2.1.0 用户 m03050 手术二）。
 *
 * 用户在设置页 / 底片库顶部 / 取景器参数栏三处选强度：
 *   subtle 35% · soft 65% · standard 100% · rich 130%（**默认**）· max 160% · auto
 *
 * 渲染侧只认 `intensityScale`（0.35~1.60 的全局风格乘数）：
 *   · `scale <= 1`：`out = orig + (lut - orig) * scale`（在原图与 100% 胶片输出之间插值）
 *   · `scale > 1`：同一公式自然变成**超频外推**，LUT 的色相偏移/通道反差/暗角一起被放大
 *   · 声明式兜底/取景器路径把染色层、S 曲线、颗粒、暗角的不透明度都乘 `scale`
 *
 * `auto` 档没有固定倍率：由 `utils/sceneMatch.ts` 的 `recommendStockAndIntensity()`
 * 按场景在 70%~145% 之间决定。
 */

import type { PresetIntensityTier } from '../types';

/** 一档预设强度的静态数据。 */
export interface PresetIntensityOption {
  id: PresetIntensityTier;
  /** zh-Hans 兜底标签（UI 有翻译键时用翻译键）。 */
  label: string;
  /** 百分比显示文本；auto 显示 `AUTO`。 */
  percent: string;
  /** 渲染侧全局风格乘数；auto = null（由场景引擎决定）。 */
  scale: number | null;
  /** 一句话说明（设置页/长按提示用）。 */
  description: string;
}

export const PRESET_INTENSITY_OPTIONS: readonly PresetIntensityOption[] = [
  {
    id: 'subtle',
    label: '輕柔',
    percent: '35%',
    scale: 0.35,
    description: '只留一点点胶片味，适合人像与商业直出。',
  },
  {
    id: 'soft',
    label: '清透',
    percent: '65%',
    scale: 0.65,
    description: '通透克制，保留大部分原图色彩。',
  },
  {
    id: 'standard',
    label: '標準',
    percent: '100%',
    scale: 1,
    description: 'LUT 标定的原始浓度。',
  },
  {
    id: 'rich',
    label: '濃郁',
    percent: '130%',
    scale: 1.3,
    description: '默认档：胶片味直接拉满，一眼可辨。',
  },
  {
    id: 'max',
    label: '極致',
    percent: '160%',
    scale: 1.6,
    description: '超频外推，暗部沉底、色相最凶。',
  },
  {
    id: 'auto',
    label: 'AUTO',
    percent: 'AUTO',
    scale: null,
    description: '按场景智能匹配强度（70%~145%）。',
  },
];

/** 默认档位（用户 m03050 明确要求默认 `rich` = 130%）。 */
export const DEFAULT_PRESET_INTENSITY: PresetIntensityTier = 'rich';

/** 固定档位的乘数范围。 */
export const INTENSITY_SCALE_MIN = 0.35;
export const INTENSITY_SCALE_MAX = 1.6;

/** AUTO 强度的可调范围（用户 m03050 手术三）。 */
export const INTENSITY_AUTO_MIN = 0.7;
export const INTENSITY_AUTO_MAX = 1.45;

/** 把任意乘数夹到合法区间（非法输入回落 1 = standard）。 */
export function clampIntensityScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return Math.min(INTENSITY_SCALE_MAX, Math.max(INTENSITY_SCALE_MIN, scale));
}

/** 挡位 → 乘数；`auto` / 未知 → null（交给场景引擎）。 */
export function intensityScaleForTier(
  tier: PresetIntensityTier | null | undefined,
): number | null {
  if (!tier || tier === 'auto') {
    return null;
  }
  for (const option of PRESET_INTENSITY_OPTIONS) {
    if (option.id === tier && option.scale !== null) {
      return option.scale;
    }
  }
  return null;
}

/** 乘数 → `'130%'` 文本（AUTO 场景引擎的徽标用）。 */
export function intensityPercentText(scale: number): string {
  return `${Math.round(clampIntensityScale(scale) * 100)}%`;
}

/** 查一档的静态数据；未知档回落 standard。 */
export function intensityOption(
  tier: PresetIntensityTier | null | undefined,
): PresetIntensityOption {
  const found = PRESET_INTENSITY_OPTIONS.find((option) => option.id === tier);
  return found ?? PRESET_INTENSITY_OPTIONS[2];
}
