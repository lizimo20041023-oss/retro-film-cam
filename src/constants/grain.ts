/**
 * 颗粒强度档位 —— 设置页里那排分段按钮（`GRAIN_LEVELS`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这不是"第 11 个预设"，而是**叠在所有预设之上的用户级微调**。
 * ─────────────────────────────────────────────────────────────────────────
 * 每个预设自己那点颗粒量（RT-400 = 0.12、PR-400 = 0.08、DIGI-02 = 0.15 …）
 * 是它的"底味"，不该被这里覆盖；这里选的是"再乘多少"：
 *
 *     最终 opacity = 预设的 grain × 这一档的 scale
 *
 * 所以 PR-400 选「轻」得到 0.08 × 0.45 ≈ 0.04（细颗粒人像），
 * 而 DIGI-02 选「轻」得到 0.15 × 0.45 ≈ 0.07（依然比 PR-400 标准粗）——
 * 每一支卷的性格都保留着，只是整体浓淡可以拧。
 *
 * 2026-10-12：所有预设的 grain 已整体下调 60%（×0.4）。原来 0.2~0.38 那一档
 * 是在"3x 插值把颗粒抹平 65%"的前提下补出来的，补过头了 —— 用户要的是
 * "细腻沉稳的哑光胶片质感"，所以现在按绝对量压下来，只靠档位往回调。
 *
 * 同时被乘的只有 `grain` 一项。这里曾经还乘一个 `grainChroma`（预烘焙的品红↔绿
 * 块状彩噪贴图），它是 CCD / DIGICAM 那两款满屏紫绿伪色的唯一来源 ——
 * 用户要的是真实银盐颗粒，所以那套彩噪连同贴图一起被彻底删掉了（不是调小，是删除）。
 * **不动 `dust`（灰尘划痕）** —— 那是"扫描件不干净"，不是颗粒感，是另一个轴。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改
 * ─────────────────────────────────────────────────────────────────────────
 * · 想改档位数值：直接改下面 `scale`，热重载后按快门就能看到。
 *   ⚠️ 预设的 grain 已经按"细腻哑光"调过（整体 ×0.4），所以「重」/「极重」这两档
 *   现在才是接近旧默认的量 —— 觉得太淡就往上选一档，别回头改预设的绝对值。
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
    description: '不加颗粒。只剩调色、暗角和日期 —— 想当"数码净片"用这一档。',
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
    description: '颗粒糊脸，纯氛围向。配合 EXP-64 / DIGI-02 会非常脏（褒义）。',
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
 * 把某一档的 scale 乘进预设的 `grain`。
 *
 * 只缩放 `grain` 一项：`grain.png` 三通道逐像素恒等（纯亮度颗粒），所以
 * "颗粒多浓"就是这里唯一的旋钮，画面里不存在任何可被放大的色度噪声。
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
  };
}
