/**
 * 场景自适应调色 —— 四场景反 HDR 决策层（v1.9.0 手术）
 *
 * ## 为什么整层重写
 *
 * v1.8.x 的自适应是「手机 HDR 修图」思路：先把场景测出来，再朝「目标对比度 / 目标饱和度 /
 * 目标亮度」补偿 —— 提对比、拉饱和、加 S 曲线，外加「暗部提亮 / 高光压暗」两层全屏色纸。
 * 实拍样张证明这条路是错的：胶片相机的曝光已经被机内测光定死，用户要的不是「把光比修平」，
 * 而是「让光比按胶片的化学反应溢出去」。把暗部提亮、把高光压回来，得到的是一张数码味的
 * 平灰照片 —— 这正是用户反复否掉的「HDR 感」。
 *
 * ## v1.9.0 的判定方式（反 HDR）
 *
 * 1. **不再读预设自身的 color**：不追目标值、不做对比度/饱和度补偿、不建 S 曲线。
 *    `preset` 参数保留只为兼容旧调用签名，内部以 `_preset` 命名、不参与计算。
 * 2. **只按 SceneStats 的直方图结构判定四场景**（阈值读原始字段，不改 sceneStats.ts 的数学），
 *    优先级从高到低、先命中先停：
 *      · dark          暗部场景：shadowShare > 0.60 且 highlightShare < 0.08
 *      · bright        亮部场景：highlightShare > 0.42
 *      · high-contrast 高反差：  (highlightShare > 0.16 且 shadowShare > 0.18) 或 contrast > 0.22
 *      · flat          平光：    contrast < 0.16 且 midShare > 0.52
 *      · neutral       中性：    其余（全部增量为 0）
 * 3. **输出有符号增量，叠到五层同源管线（gradeLayers.ts）的层参数上**：
 *    压暗部（shadowCrushDelta）→ 加高光溢出（highlightBloomDelta）→ 染色密度/分离度
 *    （colorDensityScale / separationScale）→ 暗角（vignetteDelta）→ 光晕（halationDelta）。
 *
 * 增量表（冻结值，见下方 SCENE_DELTA_* / SCENE_* 导出常量）：
 *
 *     场景           压暗部    高光溢出   染色密度   分离度   暗角    光晕
 *     high-contrast  +0.16     +0.18      1.22      1.00     0       0
 *     flat           +0.18     +0.15      1.25      1.25     0       0
 *     bright          0        +0.12      1.20      1.00    +0.16    0
 *     dark           -0.14     +0.22      1.00      1.00     0      +0.50
 *     neutral         0         0         1.00      1.00     0       0
 *
 * 注意 dark 是 **负的** shadowCrushDelta：暗部场景不再「提亮暗部」，而是让暗部保持暗；
 * 补偿它的是 +0.22 高光溢出与 +0.50 光晕 —— 这才是胶片在欠曝时的真实表现。
 * bright 不加高光溢出补偿，而是加暗角把视线收回中心。
 *
 * ## 白平衡（唯一读 SceneStats 的「颜色」量）
 *
 *   whiteBalanceShift = clamp((0.06 - warmth) * 1.4, ±0.14)
 *   tintShift         = clamp((0 - tintBias) * 0.9,  ±0.08)
 *
 * 只微调 temperature / tint 两个 overlay 层（applyAdaptiveColor），不碰其它 10 个键。
 *
 * ## 退化契约（探针快照依赖）
 *
 * `scene == null` / `scene == undefined` / `scene.samples < MIN_SAMPLES` 一律返回 `null`；
 * `applyAdaptiveColor(color, null)` 原样返回**同一引用**。因此关闭自适应/场景探测失败时，
 * buildGradeLayers 的层表与静态预设逐字节一致。
 */
import type { ResolvedColorGrade, ResolvedFilmPreset, SceneStats } from '../types';

/**
 * 四场景分类。`neutral` 是兜底类别，所有增量 0、密度/分离度 1。
 */
export type SceneClass = 'high-contrast' | 'flat' | 'bright' | 'dark' | 'neutral';

/**
 * 场景判定后叠到管线层参数上的增量计划。
 *
 * 全部数值 round4（=保留 4 位小数），保证探针快照稳定、避免浮点尾巴。
 */
export interface AdaptivePlan {
  /** 命中的场景类别（五选一）。 */
  sceneClass: SceneClass;
  /** 暗部压片增量：叠加到 shadow-crush 层 opacity（可为负，暗部场景为 -0.14）。 */
  shadowCrushDelta: number;
  /** 高光溢出增量：叠加到 highlight-bloom 层 opacity。 */
  highlightBloomDelta: number;
  /** 染色密度倍率：缩放高光染色层 opacity（1 = 不变）。 */
  colorDensityScale: number;
  /** 明暗分离倍率：缩放暗部/高光染色层 opacity（1 = 不变）。 */
  separationScale: number;
  /** 暗角增量：叠加到 vignette 层 opacity。 */
  vignetteDelta: number;
  /** 光晕增量：叠加到 halation 层 opacity（未乘 0.18 渲染上限）。 */
  halationDelta: number;
  /** 白平衡色温偏移（-1~1，正 = 更暖）。 */
  whiteBalanceShift: number;
  /** 白平衡色调偏移（-1~1，正 = 更品红）。 */
  tintShift: number;
  /** 原始场景统计（探针/调试用，不参与渲染）。 */
  stats: SceneStats;
}

/** 场景样本数下限：低于该值视为「没测到」，退化回静态预设（v1.8.11 起不变）。 */
export const MIN_SAMPLES = 12;

/** 白平衡色温偏移上限（正负同值）。 */
export const WB_SHIFT_MAX = 0.14;
/** 白平衡色调偏移上限（正负同值）。 */
export const TINT_SHIFT_MAX = 0.08;

/** 高反差场景：暗部压片增量。 */
export const SCENE_DELTA_CRUSH_HIGH_CONTRAST = 0.16;
/** 平光场景：暗部压片增量。 */
export const SCENE_DELTA_CRUSH_FLAT = 0.18;
/** 暗部场景：暗部压片增量（负值 = 放弃压暗，让暗部保持暗）。 */
export const SCENE_DELTA_CRUSH_DARK = -0.14;

/** 高反差场景：高光溢出增量。 */
export const SCENE_DELTA_BLOOM_HIGH_CONTRAST = 0.18;
/** 平光场景：高光溢出增量。 */
export const SCENE_DELTA_BLOOM_FLAT = 0.15;
/** 亮部场景：高光溢出增量。 */
export const SCENE_DELTA_BLOOM_BRIGHT = 0.12;
/** 暗部场景：高光溢出增量。 */
export const SCENE_DELTA_BLOOM_DARK = 0.22;

/** 高反差场景：染色密度倍率。 */
export const SCENE_DENSITY_HIGH_CONTRAST = 1.22;
/** 平光场景：明暗分离倍率（同时用于染色密度）。 */
export const SCENE_SEPARATION_FLAT = 1.25;
/** 亮部场景：染色密度倍率。 */
export const SCENE_DENSITY_BRIGHT = 1.2;

/** 亮部场景：暗角增量。 */
export const SCENE_DELTA_VIGNETTE_BRIGHT = 0.16;
/** 暗部场景：光晕增量。 */
export const SCENE_DELTA_HALATION_DARK = 0.5;

/** 中性白平衡目标色温（SceneStats.warmth 的口径：正 = 偏暖）。 */
const TARGET_WARMTH = 0.06;

/** 把数值卡到 [lo, hi]（浮点安全，不做 round）。 */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** 保留 4 位小数（探针快照稳定；-0 归一为 0）。 */
function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 四场景判定（优先级从高到低，先命中先停）。
 *
 * 阈值全部针对 SceneStats 原始字段（不做归一化/重采样），保证与 sceneProbe 的读数一一对应。
 */
function classifyScene(stats: SceneStats): SceneClass {
  // 1 暗部：满屏暗、几乎没有高光。
  if (stats.shadowShare > 0.6 && stats.highlightShare < 0.08) return 'dark';
  // 2 亮部：高光占比过高（雪景/逆光/白墙）。
  if (stats.highlightShare > 0.42) return 'bright';
  // 3 高反差：暗部与高光同时存在，或整体对比度已经很高（硬光/日落）。
  if ((stats.highlightShare > 0.16 && stats.shadowShare > 0.18) || stats.contrast > 0.22) {
    return 'high-contrast';
  }
  // 4 平光：整体对比度低且中间调占大头（阴天/雾/室内漫射光）。
  if (stats.contrast < 0.16 && stats.midShare > 0.52) return 'flat';
  // 5 中性：不干预。
  return 'neutral';
}

/** 每类场景的管线增量表（集中一处，探针按常量逐项核对）。 */
function sceneDeltas(sceneClass: SceneClass): {
  shadowCrushDelta: number;
  highlightBloomDelta: number;
  colorDensityScale: number;
  separationScale: number;
  vignetteDelta: number;
  halationDelta: number;
} {
  switch (sceneClass) {
    case 'high-contrast':
      return {
        shadowCrushDelta: SCENE_DELTA_CRUSH_HIGH_CONTRAST,
        highlightBloomDelta: SCENE_DELTA_BLOOM_HIGH_CONTRAST,
        colorDensityScale: SCENE_DENSITY_HIGH_CONTRAST,
        separationScale: 1,
        vignetteDelta: 0,
        halationDelta: 0,
      };
    case 'flat':
      return {
        shadowCrushDelta: SCENE_DELTA_CRUSH_FLAT,
        highlightBloomDelta: SCENE_DELTA_BLOOM_FLAT,
        colorDensityScale: SCENE_SEPARATION_FLAT,
        separationScale: SCENE_SEPARATION_FLAT,
        vignetteDelta: 0,
        halationDelta: 0,
      };
    case 'bright':
      return {
        shadowCrushDelta: 0,
        highlightBloomDelta: SCENE_DELTA_BLOOM_BRIGHT,
        colorDensityScale: SCENE_DENSITY_BRIGHT,
        separationScale: 1,
        vignetteDelta: SCENE_DELTA_VIGNETTE_BRIGHT,
        halationDelta: 0,
      };
    case 'dark':
      return {
        shadowCrushDelta: SCENE_DELTA_CRUSH_DARK,
        highlightBloomDelta: SCENE_DELTA_BLOOM_DARK,
        colorDensityScale: 1,
        separationScale: 1,
        vignetteDelta: 0,
        halationDelta: SCENE_DELTA_HALATION_DARK,
      };
    case 'neutral':
    default:
      return {
        shadowCrushDelta: 0,
        highlightBloomDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        vignetteDelta: 0,
        halationDelta: 0,
      };
  }
}

/**
 * 由场景统计 + 预设算出自适应增量计划。
 *
 * @param scene  拍照后由场景探测（sceneProbe/sceneStats）给出的 SceneStats；null/undefined = 关闭。
 * @param _preset 旧签名兼容参数（v1.9.0 起不读预设：自适应只输出「叠到管线上的增量」，
 *                预设基线由 gradeLayers.ts 自己掌握）。刻意保留参数位，调用方无需改动。
 * @returns 命中增量计划；不满足样本数/无场景时返回 `null`（调用方按静态预设渲染）。
 */
export function planAdaptiveGrade(
  scene: SceneStats | null | undefined,
  _preset?: ResolvedFilmPreset,
): AdaptivePlan | null {
  if (scene === null || scene === undefined) return null;
  if (!Number.isFinite(scene.samples) || scene.samples < MIN_SAMPLES) return null;

  const sceneClass = classifyScene(scene);
  const deltas = sceneDeltas(sceneClass);

  // 白平衡：朝中性目标 0.06 拉，只微调色温层；色调朝 0 拉。
  const whiteBalanceShift = round4(
    clamp((TARGET_WARMTH - scene.warmth) * 1.4, -WB_SHIFT_MAX, WB_SHIFT_MAX),
  );
  const tintShift = round4(clamp((0 - scene.tintBias) * 0.9, -TINT_SHIFT_MAX, TINT_SHIFT_MAX));

  return {
    sceneClass,
    shadowCrushDelta: round4(deltas.shadowCrushDelta),
    highlightBloomDelta: round4(deltas.highlightBloomDelta),
    colorDensityScale: round4(deltas.colorDensityScale),
    separationScale: round4(deltas.separationScale),
    vignetteDelta: round4(deltas.vignetteDelta),
    halationDelta: round4(deltas.halationDelta),
    whiteBalanceShift,
    tintShift,
    stats: scene,
  };
}

/**
 * 把自适应白平衡偏移应用到颜色配置上。
 *
 * v1.9.0 只动 temperature / tint 两个用户白平衡键；其余 10 个键（含三支新光学键）原样返回。
 * `plan === null` 时返回**同一引用**（层表逐字节等于静态预设的前提）。
 */
export function applyAdaptiveColor(
  color: ResolvedColorGrade,
  plan: AdaptivePlan | null,
): ResolvedColorGrade {
  if (plan === null) return color;
  return {
    ...color,
    temperature: round4(clamp(color.temperature + plan.whiteBalanceShift, -1, 1)),
    tint: round4(clamp(color.tint + plan.tintShift, -1, 1)),
  };
}
