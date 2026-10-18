/**
 * 场景自适应调色 —— 四场景反 HDR 决策层（v1.9.2：**只许提亮、严禁加雾**）
 *
 * ## v1.9.1 为什么还欠曝
 *
 * v1.9.1 删了 halation 与 14px 模糊（方向对），但仍保留了 v1.9.0 的「提亮暗部 / 压高光」
 * HDR 思路：dark 靠 +0.21 曝光、其余场景靠 +0.12~0.22 的 S 曲线拉反差，同时还有
 * shadowCrushTarget 去踩黑。实拍十张样片（用户 m09093）白衬衫/斑马线/白云仍欠曝 0.7~1.0 EV。
 *
 * ## v1.9.2 的判定与补偿
 *
 * 1. **只按 SceneStats 的直方图结构判定四场景**（阈值完全不变：priority dark → bright →
 *    high-contrast → flat → neutral，读原始字段、不改 sceneStats.ts 的数学）。
 * 2. **任何场景严禁减少 exposureLift、严禁增加 shadowCrush**：四场景增量全部 ≥0，
 *    曝光补偿只加不减（用户铁律四）。dark/flat 额外 `exposureLift += 0.15 / 0.12`。
 * 3. **输出「叠到零模糊管线（gradeLayers.ts）上的非负增量」**：
 *      · sCurveContrastDelta   → 叠到零模糊 S 曲线层（夹 [0,0.15]）
 *      · exposureLiftDelta     → 叠到零模糊曝光提亮层（夹 [0,0.15]）
 *      · vignetteDelta / colorDensityScale / separationScale / halationDelta
 *    `shadowCrushTarget` 字段与 `SCENE_CRUSH_TARGET_*` 常量已在 v1.9.2 删除：
 *    crush 只来自预设静态值（九卷 0，仅 TX-400 0.03），自适应无权再压黑。
 * 4. **halationDelta 恒 0**：光晕层已删；`HALATION_DELTA_MAX = 0` 作为死上限保留。
 *
 * ## 冻结增量表（v1.9.2，探针按导出常量逐项核对）
 *
 *     场景            sCurve   exposure   vignette  density  sep   halation
 *     dark           +0.06    +0.15      0         1.00     1.00  0
 *     high-contrast  +0.10    +0.06      0         1.00     1.00  0
 *     flat           +0.12    +0.12      0         1.20     1.20  0
 *     bright         +0.04    +0.04      0         1.00     1.00  0
 *     neutral         0        0         0         1.00     1.00  0
 *
 * 解读：暗部场景曝光补偿最重（+0.15 零模糊 screen）、S 曲线只轻加（+0.06，避免欠曝区
 * 2Y² 踩死细节）；平光场景共加 0.12/0.12 并把染色密度/明暗分离提到 1.20（阴天靠化学
 * 反应出层次）；亮部场景只轻加 +0.04/+0.04（雪景不再被压）；neutral 完全不动
 * （层表逐字节 = 静态预设）。
 *
 * ## 白平衡（唯一读 SceneStats 的「颜色」量）
 *
 *   whiteBalanceShift = clamp((0.06 - warmth) * 1.4, ±0.14)
 *   tintShift         = clamp((0 - tintBias) * 0.9,  ±0.08)
 *
 * 只微调 temperature / tint 两个 soft-light 层（applyAdaptiveColor），不碰其它键。
 *
 * ## 退化契约（探针快照依赖）
 *
 * `scene == null` / `scene == undefined` / `scene.samples < MIN_SAMPLES` 一律返回 `null`；
 * `applyAdaptiveColor(color, null)` 原样返回**同一引用**。因此关闭自适应 / 场景探测失败时，
 * buildGradeLayers 的层表与静态预设逐字节一致。
 */
import type { ResolvedColorGrade, ResolvedFilmPreset, SceneStats } from '../types';

/**
 * 四场景分类。`neutral` 是兜底类别，所有增量 0、密度/分离度 1。
 */
export type SceneClass = 'high-contrast' | 'flat' | 'bright' | 'dark' | 'neutral';

/**
 * 场景判定后叠到零模糊管线层参数上的增量计划。
 *
 * 全部数值 round4（=保留 4 位小数），保证探针快照稳定、避免浮点尾巴。
 * v1.9.2：删除 `shadowCrushTarget` 字段（crush 只来自预设静态值），
 * 保留 sCurveContrastDelta / exposureLiftDelta（均夹 [0,0.15]，只加不减）。
 */
export interface AdaptivePlan {
  /** 命中的场景类别（五选一）。 */
  sceneClass: SceneClass;
  /** 零模糊 S 曲线增量：叠加到 s-curve-contrast 层 opacity（gradeLayers 里再夹 0~0.30）。 */
  sCurveContrastDelta: number;
  /** 零模糊曝光提亮增量：叠加到 exposure-lift 层 opacity（再夹 0~0.62；只加不减）。 */
  exposureLiftDelta: number;
  /** 暗角增量：叠加到 vignette 层 opacity（再夹 0~0.15）。 */
  vignetteDelta: number;
  /** 染色密度倍率：缩放高光染色层 opacity（1 = 不变）。 */
  colorDensityScale: number;
  /** 明暗分离倍率：缩放暗部/高光染色层 opacity（1 = 不变）。 */
  separationScale: number;
  /** 光晕增量（v1.9.2 恒 0；HALATION_DELTA_MAX=0 夹取，光晕层已删）。 */
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

/**
 * 光晕增量上限（v1.9.2 冻结为 0）。
 *
 * halation 层已从管线删除；这条常量保留为死上限，任何正增量都会被夹回 0，
 * v1.9.0 的 dark +0.50「泼牛奶」绝不允许复活。
 */
export const HALATION_DELTA_MAX = 0;

/** 自适应增量绝对值上限（exposureLift / sCurveContrast 均夹 [0, MAX]）。 */
export const ADAPTIVE_DELTA_MAX = 0.15;

/* ========================================================================== *
 * 四场景冻结参数（探针按常量逐项核对）
 * ========================================================================== */

/** 暗部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_DARK = 0.06;
/** 高反差场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_HIGH_CONTRAST = 0.1;
/** 平光场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_FLAT = 0.12;
/** 亮部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_BRIGHT = 0.04;

/** 暗部场景：零模糊曝光提亮增量（v1.9.2 用户铁律四：dark 额外 +0.15）。 */
export const SCENE_EXPOSURE_DARK = 0.15;
/** 高反差场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_HIGH_CONTRAST = 0.06;
/** 平光场景：零模糊曝光提亮增量（flat 额外 +0.12）。 */
export const SCENE_EXPOSURE_FLAT = 0.12;
/** 亮部场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_BRIGHT = 0.04;

/** 平光场景：染色密度倍率（v1.9.2 由 1.25 收敛到 1.20）。 */
export const SCENE_DENSITY_FLAT = 1.2;
/** 平光场景：明暗分离倍率（v1.9.2 由 1.25 收敛到 1.20）。 */
export const SCENE_SEPARATION_FLAT = 1.2;

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
 * v1.9.2 阈值与 v1.9.1 逐字节一致（只换补偿方式，不动判定）。
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

/** 每类场景的零模糊管线增量表（集中一处，探针按常量逐项核对）。 */
function sceneDeltas(sceneClass: SceneClass): {
  sCurveContrastDelta: number;
  exposureLiftDelta: number;
  vignetteDelta: number;
  colorDensityScale: number;
  separationScale: number;
  halationDelta: number;
} {
  switch (sceneClass) {
    case 'high-contrast':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_HIGH_CONTRAST,
        exposureLiftDelta: SCENE_EXPOSURE_HIGH_CONTRAST,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'flat':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_FLAT,
        exposureLiftDelta: SCENE_EXPOSURE_FLAT,
        vignetteDelta: 0,
        colorDensityScale: SCENE_DENSITY_FLAT,
        separationScale: SCENE_SEPARATION_FLAT,
        halationDelta: 0,
      };
    case 'bright':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_BRIGHT,
        exposureLiftDelta: SCENE_EXPOSURE_BRIGHT,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'dark':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_DARK,
        exposureLiftDelta: SCENE_EXPOSURE_DARK,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'neutral':
    default:
      return {
        sCurveContrastDelta: 0,
        exposureLiftDelta: 0,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
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
    // v1.9.2 铁律：曝光/反差增量只加不减，且各自夹在 [0,0.15]。
    sCurveContrastDelta: round4(clamp(deltas.sCurveContrastDelta, 0, ADAPTIVE_DELTA_MAX)),
    exposureLiftDelta: round4(clamp(deltas.exposureLiftDelta, 0, ADAPTIVE_DELTA_MAX)),
    vignetteDelta: round4(deltas.vignetteDelta),
    colorDensityScale: round4(deltas.colorDensityScale),
    separationScale: round4(deltas.separationScale),
    // v1.9.2：光晕增量恒 0（HALATION_DELTA_MAX = 0），层已删。
    halationDelta: round4(clamp(deltas.halationDelta, 0, HALATION_DELTA_MAX)),
    whiteBalanceShift,
    tintShift,
    stats: scene,
  };
}

/**
 * 把自适应白平衡偏移应用到颜色配置上。
 *
 * v1.9.2 只动 temperature / tint 两个用户白平衡键；其余键原样返回。
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
