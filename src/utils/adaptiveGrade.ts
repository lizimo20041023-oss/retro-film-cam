/**
 * 场景自适应调色 —— 四场景反 HDR 决策层（v1.9.3：**反差优先 + 夜景纯黑校准**）
 *
 * ## v1.9.2 的遗留问题
 *
 * v1.9.2 把「只许提亮、严禁加雾」写死：dark 场景再 +0.15 曝光、其余场景 +0.04~+0.12，
 * 于是夜景/暗光被强行提亮，黑色显示器、夜空、暗部衣料全部变成灰 —— 用户 m09629 的
 * 「夜景不够纯黑」正是这里来的。与此同时 S 曲线被压到 0.16~0.30，德味反差也没了。
 *
 * ## v1.9.3 的判定与补偿
 *
 * 1. **判定完全不变**：只按 SceneStats 的直方图结构分五类（优先级
 *    dark → bright → high-contrast → flat → neutral），阈值与 v1.9.1/v1.9.2 逐字节一致，
 *    读原始字段、不改 sceneStats.ts 的数学。
 * 2. **输出「叠到零模糊管线（gradeLayers.ts）上的增量」**：
 *      · `sCurveContrastDelta` → 叠到 s-curve-contrast 层（夹 [0, 0.20]）
 *      · `colorBurnDelta`      → 叠到 color-density 层（夹 [0, 0.08]）
 *      · `exposureLiftDelta`   → 叠到 exposure-lift 层（只有 bright 用 +0.08）
 *      · `exposureLiftTarget`  → **整体覆盖语义**：非 null 时消费方把曝光提亮层
 *        opacity 直接设为该值（dark = 0 ⇒ 夜景不叠任何 screen 提亮层，纯黑校准）；
 *      · `vignetteDelta` / `colorDensityScale` / `separationScale` / `halationDelta`
 *    `shadowCrushTarget` 字段与 `SCENE_CRUSH_TARGET_*` 常量在 v1.9.2 已删除，
 *    v1.9.3 继续不恢复：crush 只来自预设静态值（九卷 0，仅 TX-400 0.08）。
 * 3. **halationDelta 恒 0**：光晕只来自预设静态值（只有 CS-800T 0.06）；
 *    `HALATION_DELTA_MAX = 0` 作为死上限保留，v1.9.0 的 dark +0.50「泼牛奶」绝不复活。
 *
 * ## 冻结增量表（v1.9.3，探针按导出常量逐项核对）
 *
 *     场景            sCurve   colorBurn  exposureLift        vignette  density  sep   halation
 *     dark           +0.14      +0.05      target = 0          0         1.00     1.00  0
 *     high-contrast  +0.12      +0.06      0                   0         1.00     1.00  0
 *     flat           +0.18      +0.08      0                   0         1.20     1.20  0
 *     bright         +0.10       0        +0.08                0         1.00     1.00  0
 *     neutral         0          0         0                   0         1.00     1.00  0
 *
 * 解读：所有场景都先拉 S 曲线（德味反差）；暗部/高反差/平光再用 color-burn 增重色彩密度；
 * **只有亮部场景**需要一点 screen 高光补偿（雪景/逆光不欠曝）；夜景反过来把曝光提亮整体
 * 压到 0 —— 该黑的地方必须黑。平光场景靠 1.20 的染色密度/明暗分离出层次。
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
 * v1.9.3：新增 `colorBurnDelta`（光学色彩密度）与 `exposureLiftTarget`（夜景纯黑校准）。
 */
export interface AdaptivePlan {
  /** 命中的场景类别（五选一）。 */
  sceneClass: SceneClass;
  /** 零模糊 S 曲线增量：叠加到 s-curve-contrast 层 opacity（gradeLayers 里再夹 0~0.72）。 */
  sCurveContrastDelta: number;
  /** 光学色彩密度增量：叠加到 color-density 层 opacity（gradeLayers 里再夹 0~0.24）。 */
  colorBurnDelta: number;
  /** 零模糊曝光提亮增量：叠加到 exposure-lift 层 opacity（只有 bright 用；夹 [0,0.20]）。 */
  exposureLiftDelta: number;
  /**
   * 曝光提亮**目标覆盖值**：非 null 时消费方把 exposure-lift 层 opacity 直接设为该值，
   * 忽略预设静态值与 `exposureLiftDelta`。v1.9.3：dark = 0（夜景纯黑），其余场景 = null。
   */
  exposureLiftTarget: number | null;
  /** 暗角增量：叠加到 vignette 层 opacity（再夹 0~0.40）。 */
  vignetteDelta: number;
  /** 染色密度倍率：缩放高光染色层 opacity（1 = 不变）。 */
  colorDensityScale: number;
  /** 明暗分离倍率：缩放暗部/高光染色层 opacity（1 = 不变）。 */
  separationScale: number;
  /** 光晕增量（v1.9.3 恒 0；HALATION_DELTA_MAX=0 夹取，光晕只来自预设静态值）。 */
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
 * 光晕增量上限（v1.9.3 维持 0）。
 *
 * 光晕层 v1.9.3 恢复为「仅预设静态值」（只有 CS-800T 0.06），**不允许自适应再加**：
 * 这条常量保留为死上限，任何正增量都会被夹回 0，v1.9.0 的 dark +0.50「泼牛奶」绝不复活。
 */
export const HALATION_DELTA_MAX = 0;

/** S 曲线 / 曝光提亮增量绝对值上限（均夹 [0, MAX]）。 */
export const ADAPTIVE_DELTA_MAX = 0.2;
/** color-burn 色彩密度增量上限（夹 [0, MAX]）。 */
export const ADAPTIVE_COLOR_BURN_DELTA_MAX = 0.08;

/* ========================================================================== *
 * 四场景冻结参数（探针按常量逐项核对）
 * ========================================================================== */

/** 暗部场景：零模糊 S 曲线增量（夜景反差足，只要轻加）。 */
export const SCENE_S_CURVE_DARK = 0.14;
/** 高反差场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_HIGH_CONTRAST = 0.12;
/** 平光场景：零模糊 S 曲线增量（阴天最需要反差）。 */
export const SCENE_S_CURVE_FLAT = 0.18;
/** 亮部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_BRIGHT = 0.1;

/** 暗部场景：color-burn 光学色彩密度增量。 */
export const SCENE_COLOR_BURN_DARK = 0.05;
/** 高反差场景：color-burn 光学色彩密度增量。 */
export const SCENE_COLOR_BURN_HIGH_CONTRAST = 0.06;
/** 平光场景：color-burn 光学色彩密度增量（阴天靠色彩密度出油画感）。 */
export const SCENE_COLOR_BURN_FLAT = 0.08;

/** 暗部场景：曝光提亮增量 = 0（由 `exposureLiftTarget = 0` 接管，直接置零整层）。 */
export const SCENE_EXPOSURE_DARK = 0;
/** 高反差场景：曝光提亮增量 = 0（反差优先，不靠 screen 冲淡暗部）。 */
export const SCENE_EXPOSURE_HIGH_CONTRAST = 0;
/** 平光场景：曝光提亮增量 = 0（平光本来不欠曝）。 */
export const SCENE_EXPOSURE_FLAT = 0;
/** 亮部场景：曝光提亮增量（雪景/逆光唯一的 screen 补偿）。 */
export const SCENE_EXPOSURE_BRIGHT = 0.08;

/** 平光场景：染色密度倍率。 */
export const SCENE_DENSITY_FLAT = 1.2;
/** 平光场景：明暗分离倍率。 */
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
 * v1.9.3 阈值与 v1.9.1/v1.9.2 逐字节一致（只换补偿方式，不动判定）。
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
  colorBurnDelta: number;
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
        colorBurnDelta: SCENE_COLOR_BURN_HIGH_CONTRAST,
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
        colorBurnDelta: SCENE_COLOR_BURN_FLAT,
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
        colorBurnDelta: 0,
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
        colorBurnDelta: SCENE_COLOR_BURN_DARK,
        exposureLiftDelta: SCENE_EXPOSURE_DARK,
        // 夜景纯黑校准：目标覆盖值 0 ⇒ 消费方把曝光提亮层整体置零。
        exposureLiftTarget: 0,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'neutral':
    default:
      return {
        sCurveContrastDelta: 0,
        colorBurnDelta: 0,
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
    // v1.9.3：S 曲线/色彩密度/曝光提亮增量都只加不减，各自夹在自己的上限里。
    sCurveContrastDelta: round4(clamp(deltas.sCurveContrastDelta, 0, ADAPTIVE_DELTA_MAX)),
    colorBurnDelta: round4(clamp(deltas.colorBurnDelta, 0, ADAPTIVE_COLOR_BURN_DELTA_MAX)),
    exposureLiftDelta: round4(clamp(deltas.exposureLiftDelta, 0, ADAPTIVE_DELTA_MAX)),
    exposureLiftTarget: deltas.exposureLiftTarget,
    vignetteDelta: round4(deltas.vignetteDelta),
    colorDensityScale: round4(deltas.colorDensityScale),
    separationScale: round4(deltas.separationScale),
    // v1.9.3：光晕增量恒 0（HALATION_DELTA_MAX = 0），光晕只来自预设静态值。
    halationDelta: round4(clamp(deltas.halationDelta, 0, HALATION_DELTA_MAX)),
    whiteBalanceShift,
    tintShift,
    stats: scene,
  };
}

/**
 * 把自适应白平衡偏移应用到颜色配置上。
 *
 * v1.9.3 只动 temperature / tint 两个用户白平衡键；其余键原样返回。
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
