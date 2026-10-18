/**
 * 场景自适应调色 —— 四场景反 HDR 决策层（v1.9.4：明度/色度解耦后的轻量校准）
 *
 * ## 背景（v1.9.3 的遗产与 v1.9.4 的取舍）
 *
 * v1.9.3 的自适应把「反差优先 + 夜景纯黑」做成了四场景增量：S 曲线 +0.10~+0.18、
 * color-burn 色彩密度 +0.05~+0.08、夜景把曝光提亮整体压到 0、平光场景染色 ×1.20。
 * 但 v1.9.4 的实拍翻车（用户 m10195）根因是**同源 overlay 撕裂 R/G/B 通道 + color-burn
 * 叠加失控** —— 所以 v1.9.4 把 color-burn / color-density 图层整个删掉，场景增量随之收敛为
 * 「只校准明度」：S 曲线统一 +0.08（平光/高反差/暗部都轻推一点），亮部场景补 +0.06
 * screen 高光，暗部场景改用 `exposureLiftTarget = 0.06` 的**目标覆盖**（不再整体置零，
 * 只把 preset 的 0.16~0.26 提亮压到 0.06，夜景仍纯黑但暗部细节更实）。
 *
 * ## 判定完全不变
 *
 * 只按 SceneStats 的直方图结构分五类（优先级 dark → bright → high-contrast → flat →
 * neutral），阈值与 v1.9.1/v1.9.2/v1.9.3 逐字节一致，读原始字段、不改 sceneStats.ts 的数学。
 *
 * ## 输出「叠到零模糊管线（gradeLayers.ts）上的增量」
 *
 *   · `sCurveContrastDelta` → 叠到 s-curve-contrast 层（夹 [0, 0.20]，管线再夹 0.60）
 *   · `exposureLiftDelta`   → 叠到 exposure-lift 层（只有 bright 用 +0.06，夹 [0, 0.20]）
 *   · `exposureLiftTarget`  → **整体覆盖语义**：非 null 时消费方把曝光提亮层 opacity
 *     直接设为该值（dark = 0.06）；其余场景 null
 *   · `vignetteDelta` / `colorDensityScale` / `separationScale` / `halationDelta`
 *     —— v1.9.4 起染色层不再乘 density/separation 倍率（契约 §1 逐字口径），这两个字段
 *     仅为 API 兼容保留；halation 仍恒 0。
 *
 * **chromaLock 不被任何场景修改**：色度锁恒等于预设值（渲染侧夹 0.54~0.68），
 * 自适应只动明度类层 —— 严禁用场景逻辑关闭色度锁。
 *
 * ## 冻结增量表（v1.9.4，探针按导出常量逐项核对）
 *
 *     场景            sCurve   exposureLift        vignette  density  sep   halation
 *     dark           +0.08      target = 0.06        0        1.00     1.00  0
 *     high-contrast  +0.08      0                    0        1.00     1.00  0
 *     flat           +0.08      0                    0        1.20     1.20  0
 *     bright          0        +0.06                 0        1.00     1.00  0
 *     neutral         0         0                    0        1.00     1.00  0
 *
 * ## 白平衡（唯一读 SceneStats 的「颜色」量）
 *
 *   whiteBalanceShift = clamp((0.06 - warmth) * 1.4, ±0.14)
 *   tintShift         = clamp((0 - tintBias) * 0.9,  ±0.08)
 *
 * 只微调 temperature / tint 两个 soft-light 层（applyAdaptiveColor），不碰其它键、
 * 更不碰 chromaLock。
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
 * v1.9.4：删除 `colorBurnDelta`（图层已删）；`exposureLiftTarget` 改为 dark = 0.06。
 */
export interface AdaptivePlan {
  /** 命中的场景类别（五选一）。 */
  sceneClass: SceneClass;
  /** 零模糊 S 曲线增量：叠加到 s-curve-contrast 层 opacity（gradeLayers 里再夹 0~0.60）。 */
  sCurveContrastDelta: number;
  /** 零模糊曝光提亮增量：叠加到 exposure-lift 层 opacity（只有 bright 用；夹 [0,0.20]）。 */
  exposureLiftDelta: number;
  /**
   * 曝光提亮**目标覆盖值**：非 null 时消费方把 exposure-lift 层 opacity 直接设为该值，
   * 忽略预设静态值与 `exposureLiftDelta`。v1.9.4：dark = 0.06（压黑但保暗部细节），
   * 其余场景 = null。
   */
  exposureLiftTarget: number | null;
  /** 暗角增量：叠加到 vignette 层 opacity（再夹 0~0.28）。 */
  vignetteDelta: number;
  /** 染色密度倍率（v1.9.4 起染色层不再乘；字段仅为 API 兼容保留，恒 1，平光 1.20）。 */
  colorDensityScale: number;
  /** 明暗分离倍率（v1.9.4 起染色层不再乘；字段仅为 API 兼容保留，恒 1，平光 1.20）。 */
  separationScale: number;
  /** 光晕增量（v1.9.4 恒 0；HALATION_DELTA_MAX=0 夹取，光晕只来自预设静态值）。 */
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
 * 光晕增量上限（v1.9.4 维持 0）。
 *
 * 光晕层 v1.9.4 只来自「预设静态值」（只有 CS-800T 0.04），**不允许自适应再加**：
 * 这条常量保留为死上限，任何正增量都会被夹回 0，v1.9.0 的 dark +0.50「泼牛奶」绝不复活。
 */
export const HALATION_DELTA_MAX = 0;

/** S 曲线 / 曝光提亮增量绝对值上限（均夹 [0, MAX]）。 */
export const ADAPTIVE_DELTA_MAX = 0.2;

/* ========================================================================== *
 * 四场景冻结参数（v1.9.4，探针按常量逐项核对）
 * ========================================================================== */

/** 暗部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_DARK = 0.08;
/** 高反差场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_HIGH_CONTRAST = 0.08;
/** 平光场景：零模糊 S 曲线增量（阴天最需要反差）。 */
export const SCENE_S_CURVE_FLAT = 0.08;
/** 亮部场景：零模糊 S 曲线增量（亮部已在推高光，不再叠反差）。 */
export const SCENE_S_CURVE_BRIGHT = 0;

/** 暗部场景：曝光提亮增量 = 0（由 `exposureLiftTarget = 0.06` 接管，整体覆盖预设值）。 */
export const SCENE_EXPOSURE_DARK = 0;
/** 高反差场景：曝光提亮增量 = 0（反差优先，不靠 screen 冲淡暗部）。 */
export const SCENE_EXPOSURE_HIGH_CONTRAST = 0;
/** 平光场景：曝光提亮增量 = 0（平光本来不欠曝）。 */
export const SCENE_EXPOSURE_FLAT = 0;
/** 亮部场景：曝光提亮增量（雪景/逆光唯一的 screen 补偿）。 */
export const SCENE_EXPOSURE_BRIGHT = 0.06;

/** 暗部场景：曝光提亮目标覆盖值（0.16~0.26 的预设提亮压到 0.06，夜景纯黑但暗部有细节）。 */
export const SCENE_EXPOSURE_TARGET_DARK = 0.06;

/** 平光场景：染色密度倍率（v1.9.4 起染色层不再乘，仅为 API 兼容保留）。 */
export const SCENE_DENSITY_FLAT = 1.2;
/** 平光场景：明暗分离倍率（v1.9.4 起染色层不再乘，仅为 API 兼容保留）。 */
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
 * v1.9.4 阈值与 v1.9.1/v1.9.2/v1.9.3 逐字节一致（只换补偿方式，不动判定）。
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
  exposureLiftTarget: number | null;
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
        exposureLiftTarget: null,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'flat':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_FLAT,
        exposureLiftDelta: SCENE_EXPOSURE_FLAT,
        exposureLiftTarget: null,
        vignetteDelta: 0,
        colorDensityScale: SCENE_DENSITY_FLAT,
        separationScale: SCENE_SEPARATION_FLAT,
        halationDelta: 0,
      };
    case 'bright':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_BRIGHT,
        exposureLiftDelta: SCENE_EXPOSURE_BRIGHT,
        exposureLiftTarget: null,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'dark':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_DARK,
        exposureLiftDelta: SCENE_EXPOSURE_DARK,
        // 夜景校准：目标覆盖值 0.06 ⇒ 消费方把曝光提亮层压到 0.06（不整体置零）。
        exposureLiftTarget: SCENE_EXPOSURE_TARGET_DARK,
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
        exposureLiftTarget: null,
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
    // v1.9.4：S 曲线/曝光提亮增量都只加不减，各自夹在自己的上限里（管线侧再夹总上限）。
    sCurveContrastDelta: round4(clamp(deltas.sCurveContrastDelta, 0, ADAPTIVE_DELTA_MAX)),
    exposureLiftDelta: round4(clamp(deltas.exposureLiftDelta, 0, ADAPTIVE_DELTA_MAX)),
    exposureLiftTarget: deltas.exposureLiftTarget,
    vignetteDelta: round4(deltas.vignetteDelta),
    colorDensityScale: round4(deltas.colorDensityScale),
    separationScale: round4(deltas.separationScale),
    // v1.9.4：光晕增量恒 0（HALATION_DELTA_MAX = 0），光晕只来自预设静态值。
    halationDelta: round4(clamp(deltas.halationDelta, 0, HALATION_DELTA_MAX)),
    whiteBalanceShift,
    tintShift,
    stats: scene,
  };
}

/**
 * 把自适应白平衡偏移应用到颜色配置上。
 *
 * v1.9.4 只动 temperature / tint 两个用户白平衡键；chromaLock 与其余键原样返回。
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
