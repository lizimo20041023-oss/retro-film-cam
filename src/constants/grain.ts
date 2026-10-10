/**
 * 颗粒强度档位 —— 相机屏幕底部那排分段按钮（`GRAIN_LEVELS`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这不是"第 11 个预设"，而是**叠在所有预设之上的用户级微调**。
 * ─────────────────────────────────────────────────────────────────────────
 * 每个预设自己那点颗粒量（RETRO 400 = 0.30、PORTRA 400 = 0.20、DIGICAM 2002 = 0.38 …）
 * 是它的"底味"，不该被这里覆盖；这里选的是"再乘多少"：
 *
 *     最终 opacity = 预设的 grain × 这一档的 scale
 *
 * 所以 PORTRA 400 选「轻」得到 0.20 × 0.45 = 0.09（细颗粒人像），
 * 而 DIGICAM 2002 选「轻」得到 0.38 × 0.45 = 0.17（依然比 PORTRA 标准粗）——
 * 每一支卷的性格都保留着，只是整体浓淡可以拧。
 *
 * 同时被乘的还有 `grainChroma`（色噪，CCD / DIGICAM 那种紫绿斑点）：
 * 它是"噪点"的另一半，只拧黑白颗粒会得到很怪的半干净画面。
 * **不动 `dust`（灰尘划痕）** —— 那是"扫描件不干净"，不是颗粒感，是另一个轴。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改
 * ─────────────────────────────────────────────────────────────────────────
 * · 想改档位数值：直接改下面 `scale`，热重载后按快门就能看到。
 * · 想改开机默认：改 `DEFAULT_GRAIN_LEVEL_ID`（当前 'std' = 预设原本的强度）。
 * · 想加/删一档：往数组里加一项即可，UI 是按数组长度平分的，不用改布局代码。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FilmPreset, GrainLevel } from '../types';
import { PRESET_DEFAULTS } from './presets';

export const GRAIN_LEVELS: GrainLevel[] = [
  {
    id: 'off',
    label: '关',
    labelKey: 'grain.level.off',
    code: 'OFF',
    scale: 0,
    description: '不加颗粒也不加色噪。只剩调色、暗角和日期 —— 想当"数码净片"用这一档。',
  },
  {
    id: 'light',
    label: '轻',
    labelKey: 'grain.level.light',
    code: 'LT',
    scale: 0.45,
    description: '约标准的一半。细颗粒，细节看得清，适合人像和想留解析力的场合。',
  },
  {
    id: 'std',
    label: '标准',
    labelKey: 'grain.level.std',
    code: 'STD',
    scale: 1,
    description: '十支卷原本调好的量（开机默认）。每个预设的性格都是按这一档定的。',
  },
  {
    id: 'heavy',
    label: '重',
    labelKey: 'grain.level.heavy',
    code: 'HV',
    scale: 1.5,
    description: '颗粒明显、开始吃细节，高感光夜拍和街头抓拍的味道。',
  },
  {
    id: 'max',
    label: '极重',
    labelKey: 'grain.level.max',
    code: 'MAX',
    scale: 2.2,
    description: '颗粒糊脸，纯氛围向。配合 EXPIRED 64 / DIGICAM 2002 会非常脏（褒义）。',
  },
];

/** 开机用哪一档。'std' = 不改预设原本的调子。 */
export const DEFAULT_GRAIN_LEVEL_ID = 'std';

/** 按 id 找档位下标；找不到就退回默认档（再找不到就是 0）。 */
export function findGrainLevelIndex(id: string): number {
  const index = GRAIN_LEVELS.findIndex((level) => level.id === id);
  if (index >= 0) {
    return index;
  }
  const fallback = GRAIN_LEVELS.findIndex((level) => level.id === DEFAULT_GRAIN_LEVEL_ID);
  return fallback >= 0 ? fallback : 0;
}

/** 取下标对应的档位；越界自动夹回边界（UI 里点分段按钮用得到）。 */
export function grainLevelAt(index: number): GrainLevel {
  if (GRAIN_LEVELS.length === 0) {
    // 配置被改空时的最后兜底：等价于"标准"，绝不返回 undefined 让 UI 崩
    return { id: 'std', label: '标准', labelKey: 'grain.level.std', code: 'STD', scale: 1, description: '' };
  }
  const clamped = Math.min(Math.max(Math.trunc(index), 0), GRAIN_LEVELS.length - 1);
  return GRAIN_LEVELS[clamped];
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 把某一档的 scale 乘进预设的 `grain` / `grainChroma`。
 *
 * 纯函数、不改原对象 —— 在 `resolvePreset` **之前**调用，
 * 这样 `resolvePreset` 照样负责"补默认值"，两条链路各管一件事。
 * `scale === 1`（标准档）时原样返回，连对象都不新建。
 */
export function applyGrainLevel(preset: FilmPreset, scale: number): FilmPreset {
  if (scale === 1) {
    return preset;
  }
  return {
    ...preset,
    grain: clamp01((preset.grain ?? PRESET_DEFAULTS.grain) * scale),
    grainChroma: clamp01((preset.grainChroma ?? PRESET_DEFAULTS.grainChroma) * scale),
  };
}
