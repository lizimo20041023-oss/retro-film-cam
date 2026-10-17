/**
 * 颗粒强度档位 —— 设置页里那排分段按钮（`GRAIN_LEVELS`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.8.3（用户 m01534 · 模块 C1）：档位从"乘积系数"改成"绝对不透明度"
 * ─────────────────────────────────────────────────────────────────────────
 * 用户实测两轮之后给了**军规级数值表**，并明确"颗粒整体下调两档、最高封顶 0.11、
 * 严禁超过此值变成雪花屏"：
 *
 *     關 (OFF)   → 0      （整层不渲染，不是 opacity 0 的空层）
 *     輕 (LT)    → 0.022  （极轻微呼吸感，正常观看画面纯净，放大才见微弱肌理）
 *     標準 (STD) → 0.045  （自然细腻，相当于旧版"轻"的三分之一浓度）
 *     重 (HV)    → 0.075  （经典 400 度胶卷颗粒感，绝不喧宾夺主）
 *     極重 (MAX) → 0.110  （硬封顶，严禁再高）
 *
 * 为什么不能继续用乘积：v1.8.0 的预设 `grain` 是 0.42~0.62（振幅语义），
 * 再乘旧 scale 0/0.45/1/1.5/2.2 就能到 1.364 → `clamp01` 夹成 1.0，
 * 整张不透明中灰噪声贴图以 100% 不透明度盖住画面（用户图 23/24 的"灰网"）。
 * v1.8.1 曾把它夹进 [0.12, 0.22]，但用户仍然觉得"像脏云雾"（2026-10-17 投诉），
 * 所以 v1.8.3 直接改成**绝对值**：预设的性格由调色层负责，颗粒浓度只由这张表决定。
 *
 * ⚠️ 这张表是用户硬规范，不是建议值。任何"想让它更浓"的改动都会被用户打回：
 *     想更浓只能重烤一张对比度更高的 `grain.png`（v1.8.2 已重烤，σ=0.2616），
 *     绝不能抬这里的 opacity。
 *
 * 同时被乘的只有 `grain` 一项。这里曾经还乘一个 `grainChroma`（预烘焙的品红↔绿
 * 块状彩噪贴图），它是 CCD / DIGICAM 那两款满屏紫绿伪色的唯一来源 ——
 * 用户要的是真实银盐颗粒，所以那套彩噪连同贴图一起被彻底删掉了（不是调小，是删除）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改
 * ─────────────────────────────────────────────────────────────────────────
 * · 想改档位数值：直接改下面的 `opacity`，热重载后按快门就能看到。
 * · 想改开机默认：改 `DEFAULT_GRAIN_LEVEL_ID`（当前 'std'）。
 * · 想加/删一档：往数组里加一项即可，UI 是按数组长度平分的，不用改布局代码。
 * ⚠️ 加档位时 opacity 也不许超过 `GRAIN_OPACITY_MAX`（0.11）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FilmPreset, GrainLevel } from '../types';

/** 颗粒层总不透明度的硬封顶（用户 m01534 的「極重 0.110」）。超过它一律夹回。 */
export const GRAIN_OPACITY_MAX = 0.11;

/**
 * 微尘（Dust Specs）的硬约束（用户 m01534 · C1 第 3 条）。
 *
 * 用户要求：白尘**只在 HV / MAX 两档**出现，且每张成片 1~2 颗、透明度 ≤ 0.18；
 * OFF / LT / STD 一律 0 颗（"保持画面绝对干净"）。
 */
export const DUST_SPEC_ALPHA_MAX = 0.18;

export const GRAIN_LEVELS: GrainLevel[] = [
  {
    id: 'off',
    label: '关',
    labelKey: 'grain.level.off',
    code: 'OFF',
    opacity: 0,
    description: '不加颗粒（整层不渲染）。只剩调色、暗角与日期 —— 想当"数码净片"用这一档。',
  },
  {
    id: 'light',
    label: '轻',
    labelKey: 'grain.level.light',
    code: 'LT',
    opacity: 0.022,
    description: '极轻微的呼吸感：正常观看画面纯净，放大细看才见微弱胶片肌理。',
  },
  {
    id: 'std',
    label: '标准',
    labelKey: 'grain.level.std',
    code: 'STD',
    opacity: 0.045,
    description: '自然细腻（开机默认），约等于 v1.8.2 之前"轻"的三分之一浓度。',
  },
  {
    id: 'heavy',
    label: '重',
    labelKey: 'grain.level.heavy',
    code: 'HV',
    opacity: 0.075,
    description: '经典 400 度胶卷颗粒感，绝不喧宾夺主；这一档起才出现 1 颗微尘。',
  },
  {
    id: 'max',
    label: '极重',
    labelKey: 'grain.level.max',
    code: 'MAX',
    opacity: 0.11,
    description: '最高封顶 0.11（严禁更高），外加 2 颗微尘 —— 氛围向，不是雪花屏。',
  },
];

/** 开机用哪一档。'std' = 用户数值表里的标准浓度。 */
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
    return { id: 'std', label: '标准', labelKey: 'grain.level.std', code: 'STD', opacity: 0.045, description: '' };
  }
  const clamped = Math.min(Math.max(Math.trunc(index), 0), GRAIN_LEVELS.length - 1);
  return GRAIN_LEVELS[clamped];
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 预设 `grain`（已经是档位的绝对不透明度）→ 真正写进图层的 opacity。
 *
 * v1.8.3 起这不再是"映射"，只是一个**带硬封顶的恒等函数**：
 *   · ≤ 0 → 0（调用方判 `≤0.01` 整层不渲染）；
 *   · 否则 = `min(strength, 0.11)`，保留三位小数。
 *
 * 之所以还留一层函数而不在各处直接写 opacity：`gradeLayers` 与探针读的是**同一个**
 * 函数 ⇒ "探针绿"与"真机不遮挡"说的是同一件事；封顶也只有一处，改不散。
 */
export function grainLayerOpacity(strength: number): number {
  const s = clamp01(strength);
  if (s <= 0) {
    return 0;
  }
  return Math.round(Math.min(s, GRAIN_OPACITY_MAX) * 1000) / 1000;
}

/**
 * 把某一档的 `opacity` **绝对地**写进预设的 `grain`。
 *
 * ⚠️ 不再乘预设原值：v1.8.3 之后"预设的 grain 底味"这个概念已经不存在了
 * （见文件头）。只改 `grain` 一项，`dust/vignette/lightLeak` 一个都不碰。
 *
 * 纯函数、不改原对象 —— 在 `resolvePreset` **之前**调用，
 * 这样 `resolvePreset` 照样负责"补默认值"，两条链路各管一件事。
 */
export function applyGrainLevel(preset: FilmPreset, opacity: number): FilmPreset {
  const next = clamp01(opacity);
  if (next === preset.grain) {
    return preset;
  }
  return { ...preset, grain: next };
}

/**
 * 这张成片该有几颗微尘（用户 m01534 的硬表：OFF/LT/STD = 0，HV = 1，MAX = 2）。
 *
 * 判据用 `grain`（= 档位绝对不透明度）而不是独立字段：合成链路里
 * `preset.grain` 就是"这一档有多浓"的唯一真值，两边不会漂移。
 *   0.11 (MAX)  → 2
 *   0.075 (HV)  → 1
 *   其余（含 0.045 / 0.022 / 0） → 0
 */
export function dustSpecCountForGrain(grain: number): number {
  if (!(grain > 0)) {
    return 0;
  }
  if (grain >= 0.1) {
    return 2;
  }
  if (grain >= 0.06) {
    return 1;
  }
  return 0;
}

/**
 * 第 `index` 颗微尘的核心不透明度。
 *
 * 用户要求"≤ 0.18、极克制"：第一颗 0.10、第二颗 0.18（硬顶由 `DUST_SPEC_ALPHA_MAX` 把住）。
 * 光晕与描环在渲染时按核心值再乘系数（见 `FilmLookLayers`），所以真实可见度更低。
 */
export function dustSpecAlpha(index: number): number {
  return Math.min(DUST_SPEC_ALPHA_MAX, 0.1 + index * 0.08);
}
