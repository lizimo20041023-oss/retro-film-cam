/**
 * 预设强度档位表（v2.1.2 用户 m00001：单遍干净管线）。
 *
 * 用户在设置页 / 底片库顶部 / 取景器参数栏三处选强度：
 *   subtle 35% · soft 60% · standard 80%（默认）· rich 92% · max 100% · auto
 *
 * 渲染侧只认 `intensityScale`（0.35~1.00 的全局风格乘数），**只做区间内插值、绝不外推**：
 *   · `out = orig + (lut − orig) * scale`，`scale` 恒在 [0.35, 1.00]；
 *   · `scale = 1.00`（max 档）就是 LUT 标定的原味上限，不存在越过标定值的超频档位；
 *   · 声明式兜底/取景器路径把染色层、S 曲线、颗粒、暗角的不透明度都乘 `scale`，
 *     同样只往回收、不超过各自基准值。
 *
 * `auto` 档没有固定倍率：由 `utils/sceneMatch.ts` 的 `recommendStockAndIntensity()`
 * 按场景在 70%~85% 之间决定。
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
    percent: '60%',
    scale: 0.6,
    description: '通透克制，保留大部分原图色彩。',
  },
  {
    id: 'standard',
    label: '標準',
    percent: '80%',
    scale: 0.8,
    description: '八成浓度，胶片感与画面细节兼顾。',
  },
  {
    id: 'rich',
    label: '濃郁',
    percent: '92%',
    scale: 0.92,
    description: '浓郁档：接近满浓度，适合需要更明显胶片感时。',
  },
  {
    id: 'max',
    label: '極致',
    percent: '100%',
    scale: 1,
    description: 'LUT 标定的满浓度，不越过标定上限。',
  },
  {
    id: 'auto',
    label: 'AUTO',
    percent: 'AUTO',
    scale: null,
    description: '按场景智能匹配强度（70%~85%）。',
  },
];

/** 默认档位；老用户已保存的档位不会被覆盖。 */
export const DEFAULT_PRESET_INTENSITY: PresetIntensityTier = 'standard';

/** 固定档位的乘数范围（上限 1.00：任何档位都不再越过 LUT 标定值）。 */
export const INTENSITY_SCALE_MIN = 0.35;
export const INTENSITY_SCALE_MAX = 1;

/** AUTO 强度范围（与 `utils/sceneMatch.ts` 同步）。 */
export const INTENSITY_AUTO_MIN = 0.7;
export const INTENSITY_AUTO_MAX = 0.85;

/** 非法乘数回落到默认标准档。 */
export const INTENSITY_SCALE_FALLBACK = 0.8;

/** 把任意乘数夹到合法区间。 */
export function clampIntensityScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return INTENSITY_SCALE_FALLBACK;
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

/** 乘数 → `'92%'` 文本（AUTO 场景引擎的徽标用）。 */
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
