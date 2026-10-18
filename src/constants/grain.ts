/**
 * 颗粒强度档位 —— 设置页里那排分段按钮（`GRAIN_LEVELS`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.9.4（用户 m10195 手术二）：全画幅非周期银盐板 + 五档绝对不透明度
 * ─────────────────────────────────────────────────────────────────────────
 * v1.9.3 的 512×512 不透明中灰板 + `overlay` 黑点在真机上暴露两个问题：
 *   1. 它是**周期性平铺**（每 170.67pt 一块），蓝天上出现「重复网格黑麻点（纱窗）」；
 *   2. overlay 下黑点对比过强，颗粒被看成污渍而不是银盐肌理。
 * 用户 m10195 的战术后撤：颗粒改**全画幅 1200×1600 一次性银盐板 + soft-light**，
 * 只加肌理、绝不弄脏蓝天；五档总不透明度重新压低到 0 / 0.04 / 0.075 / 0.115 / 0.16。
 *
 * 用户军规数值表（v1.9.4 冻结，绝对不透明度）：
 *
 *     關 (OFF)   → 0      （整层不渲染，不是 opacity 0 的空层）
 *     輕 (LT)    → 0.04   （细腻微粒，放大可见清晰银盐肌理）
 *     標準 (STD) → 0.075  （标准 200/400 度胶卷颗粒感，开机默认）
 *     重 (HV)    → 0.115  （浓郁粗粝的纪实街头颗粒感）
 *     極重 (MAX) → 0.16   （森山大道式高反差粗颗粒，硬封顶）
 *
 * 微尘按新档位判定：`grain >= 0.155` → 2 颗；`grain >= 0.105` → 1 颗；其余 0 颗
 * —— 即 HV 1 颗、MAX 2 颗，保持用户「HV/MAX 才出微尘」的原始要求。
 *
 * 渲染纪律（性能与观感同时冻结）：
 *   · 颗粒是 **整幅单张 RGBA 贴图**（`assets/textures/grain.png` 1200×1600，
 *     全画幅非周期，**禁止 repeat / 手工平铺 / 周期小图**），`resizeMode="stretch"`
 *     一次铺满窗口，`soft-light` 混合；live 取景器**永不挂载颗粒层**（v1.8.6 发热纪律）。
 *   · 想改浓度只改这里的档位 opacity，或重烤贴图粒子核心 alpha；不要在渲染侧叠第二层。
 *
 * 这里曾经还乘一个 `grainChroma`（预烘焙的品红↔绿块状彩噪贴图），它是 CCD / DIGICAM
 * 那两款满屏紫绿伪色的唯一来源 —— 用户要的是真实银盐颗粒，那套彩噪已连同贴图删除。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么改
 * ─────────────────────────────────────────────────────────────────────────
 * · 想改档位数值：直接改下面的 `opacity`，热重载后按快门就能看到。
 * · 想改开机默认：改 `DEFAULT_GRAIN_LEVEL_ID`（当前 'std'）。
 * · 想加/删一档：往数组里加一项即可，UI 是按数组长度平分的，不用改布局代码。
 * ⚠️ 加档位时 opacity 也不许超过 `GRAIN_OPACITY_MAX`（0.16）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FilmPreset, GrainLevel } from '../types';

/** 颗粒层总不透明度的硬封顶（用户 m10195 的「極重 0.16」）。超过它一律夹回。 */
export const GRAIN_OPACITY_MAX = 0.16;

/**
 * 微尘（Dust Specs）的硬约束（用户 m01534 · C1 第 3 条，v1.9.4 沿用）。
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
    opacity: 0.04,
    description: '细腻微粒：正常观看干净，放大可见清晰的银盐肌理。',
  },
  {
    id: 'std',
    label: '标准',
    labelKey: 'grain.level.std',
    code: 'STD',
    opacity: 0.075,
    description: '标准 200/400 度胶卷颗粒感（开机默认），肉眼一眼可辨。',
  },
  {
    id: 'heavy',
    label: '重',
    labelKey: 'grain.level.heavy',
    code: 'HV',
    opacity: 0.115,
    description: '浓郁粗粝的纪实街头颗粒感；这一档起才出现 1 颗微尘。',
  },
  {
    id: 'max',
    label: '极重',
    labelKey: 'grain.level.max',
    code: 'MAX',
    opacity: 0.16,
    description: '森山大道式高反差粗颗粒；最高封顶 0.16（严禁更高），外加 2 颗微尘。',
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
    return { id: 'std', label: '标准', labelKey: 'grain.level.std', code: 'STD', opacity: 0.075, description: '' };
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
 * v1.9.4 起这不再是"映射"，只是一个**带硬封顶的恒等函数**：
 *   · ≤ 0 → 0（调用方判 `≤0.01` 整层不渲染）；
 *   · 否则 = `min(strength, 0.16)`，保留三位小数。
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
 * 这张成片该有几颗微尘（v1.9.4 新档位：OFF/LT/STD = 0，HV = 1，MAX = 2）。
 *
 * 判据用 `grain`（= 档位绝对不透明度）而不是独立字段：合成链路里
 * `preset.grain` 就是"这一档有多浓"的唯一真值，两边不会漂移。
 *   0.16 (MAX) → 2
 *   0.115 (HV) → 1
 *   其余（含 0.075 / 0.04 / 0） → 0
 */
export function dustSpecCountForGrain(grain: number): number {
  if (!(grain > 0)) {
    return 0;
  }
  if (grain >= 0.155) {
    return 2;
  }
  if (grain >= 0.105) {
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
