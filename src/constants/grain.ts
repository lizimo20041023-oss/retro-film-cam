/**
 * 颗粒强度档位 —— 设置页里那排分段按钮（`GRAIN_LEVELS`）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这不是"第 11 个预设"，而是**叠在所有预设之上的用户级微调**。
 * ─────────────────────────────────────────────────────────────────────────
 * 每个预设自己那点颗粒量（v1.8.0 起是 0.42~0.62 的**强度**语义）是它的"底味"，
 * 不该被这里覆盖；这里选的是"再乘多少"：
 *
 *     最终强度 = 预设的 grain × 这一档的 scale
 *     图层 opacity = grainLayerOpacity(最终强度)   ← v1.8.1：夹进 [0.12, 0.22]
 *
 * v1.8.0 时第二行不存在，图层 opacity 直接就是乘完的强度（0.42~0.62，极重档 1.36→1.0），
 * 于是"拧到重档 = 颗粒层变成不透明灰色大网"（用户实测图 23/24）—— 见
 * `GRAIN_OPACITY_MAX` 的注释。
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
 * 颗粒层**总不透明度**的硬边界（v1.8.1 · 用户强制规范）。
 *
 * 用户实测：在取景器里把颗粒往「重 / 极重」拧，颗粒层会变成**不透明的灰色大网**
 * 把相机画面整个盖住（图 23/24）。根因就在这条链路 —— `gradeLayers` 以前直接拿
 * `clamp01(preset.grain × scale)` 当图层 opacity，而 v1.8.0 的 grain 已经是 0.42~0.62
 * 的**振幅**语义、档位 scale 又乘到 2.2 ⇒ 0.62 × 2.2 = 1.36 → 夹成 **1.0**：
 * 整张贴图（`grain.png` 是**不透明**的中灰噪声，不是透明底）以 100% 不透明度盖住了
 * 实时画面。就算混合模式正常，overlay 在 1.0 也是"糊脸"；一旦平台把 overlay 降级成
 * 普通 alpha，那就真的是"灰色大网"。
 *
 * 现在的规矩：**颗粒层的 opacity 永远落在 [0.12, 0.22]，无论档位怎么拧。**
 *   · `GRAIN_OPACITY_MAX = 0.22` —— 混合模式万一被降级，画面最多被 22% 的中灰压一层，
 *     **不可能遮挡主体**。这是硬上限，不是建议值，任何"想让它更浓"的改动都不许抬它。
 *   · `GRAIN_OPACITY_MIN = 0.12` —— 开着颗粒就不会淡到看不见，档位之间仍有区分度。
 *   · 关档（scale 0）走 `grain ≤ 0.01` 那条分支，**整层不渲染**（不是 opacity 0 的空层）。
 *
 * 代价（必须知道）：可见振幅 = `σ_贴图 × opacity` = 0.2605 × [0.12, 0.22] ≈ **[0.031, 0.057]**，
 * 比 v1.8.0 默认档（0.109~0.161）低约 2.4 倍 —— 这是"绝不遮挡主体"的物理代价。
 * 想在同样的上限下更浓，只能**重烤一张对比度更高的 `grain.png`**（σ 上限 0.5），
 * 绝不能靠抬 opacity：那条路已经被用户封死了。
 */
export const GRAIN_OPACITY_MIN = 0.12;
export const GRAIN_OPACITY_MAX = 0.22;

/**
 * 预设 grain（强度语义）× 档位 scale 之后，真正写进图层的 opacity。
 *
 * 线性映射进 `[GRAIN_OPACITY_MIN, GRAIN_OPACITY_MAX]`：强度 0 → 0（调用方判 `≤0.01`
 * 整层不渲染），强度 1 → 0.22。单调不减 ⇒ "越重越明显"这条档位语义仍然成立。
 *
 * 纯函数、无副作用；`gradeLayers` 与探针读的是**同一个**函数，
 * 所以"探针绿"与"真机不遮挡"说的是同一件事。
 */
export function grainLayerOpacity(strength: number): number {
  const s = clamp01(strength);
  if (s <= 0) {
    return 0;
  }
  const value = GRAIN_OPACITY_MIN + (GRAIN_OPACITY_MAX - GRAIN_OPACITY_MIN) * s;
  return Math.round(value * 1000) / 1000;
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
