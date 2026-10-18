/**
 * 场景自适应调色 —— 四场景反 HDR 决策层（v1.9.1 手术：**禁止加雾**）
 *
 * ## v1.9.0 为什么翻车
 *
 * v1.9.0 把「暗部场景」当成需要打光的场景处理：
 *
 *     dark: halationDelta = +0.50
 *
 * 结果实拍夜景被用户 m08443 判成「泼了一层牛奶」—— 光晕层是 screen 混合，
 * +0.50 的暖红 screen 会把整个暗部抬亮并染红，**这根本不是胶片欠曝的样子，是加了雾**。
 * 同版 bright 场景还靠 +0.16 暗角压高光、high-contrast/flat 场景靠 +0.15~0.22 的
 * 高光溢出（14px 模糊）拉反差，全都在往画面里灌漫射光。
 *
 * ## v1.9.1 的判定与补偿
 *
 * 1. **只按 SceneStats 的直方图结构判定四场景**（阈值完全不变：priority dark → bright →
 *    high-contrast → flat → neutral，读原始字段、不改 sceneStats.ts 的数学）。
 * 2. **输出「叠到零模糊管线（gradeLayers.ts）上的有符号增量」**，四项光学手术之一：
 *      · sCurveContrastDelta   → 叠到零模糊 S 曲线层（真反差，过 (0,0)/(1,1)）
 *      · exposureLiftDelta     → 叠到零模糊曝光提亮层（screen 2Y−Y²，黑场不起雾）
 *      · shadowCrushTarget     → 直接替换黑位托底 opacity（null = 沿用预设静态值）
 *      · vignetteDelta / colorDensityScale / separationScale / halationDelta
 *    **不再有**「暗部提亮 / 高光压暗 / 高光溢出」任何一层 —— 反差全部交给 S 曲线，
 *    曝光补偿全部交给零模糊 screen，再也不用「提亮暗部、压暗高光」的 HDR 思路。
 * 3. **halationDelta 恒 0**：光晕只用来画 cs-800t 那颗红点，不再当反差/打光工具。
 *    上限常量 `HALATION_DELTA_MAX = 0.03` 仍导出并夹取（防止未来有人加回正增量）。
 *
 * ## 冻结增量表（v1.9.1，探针按导出常量逐项核对）
 *
 *     场景            sCurve   exposure   crushTarget   vignette  density  sep   halation
 *     dark           +0.15    +0.21      0             0         1.00     1.00  0
 *     high-contrast  +0.22    +0.12      0.08          0         1.00     1.00  0
 *     flat           +0.28    +0.10      0.08          0         1.25     1.25  0
 *     bright         +0.18    +0.10      0             0         1.00     1.00  0
 *     neutral         0        0         null          0         1.00     1.00  0
 *
 * 解读：暗部场景曝光补偿最重（+0.21 零模糊 screen）、S 曲线轻加（+0.15，避免欠曝区
 * 2Y² 踩死细节）；平光场景最重拉 S 曲线（+0.28）+ 染色密度/明暗分离 1.25（阴天靠化学
 * 反应出层次，不靠打光）；亮部场景只轻加 S 曲线（+0.18）与一点曝光（+0.10），暗角不补
 * （v1.9.0 的 +0.16 已删）；neutral 完全不动（层表逐字节 = 静态预设）。
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
 * `applyAdaptiveColor(color, null)` 原样返回**同一引用**。因此关闭自适应 / 场景探测失败时，
 * buildGradeLayers 的层表与静态预设逐字节一致。
 */
import type { ResolvedColorGrade, ResolvedFilmPreset, SceneStats } from '../types';

/**
 * 四场景分类。`neutral` 是兜底类别，所有增量 0、密度/分离度 1、crush target = null。
 */
export type SceneClass = 'high-contrast' | 'flat' | 'bright' | 'dark' | 'neutral';

/**
 * 场景判定后叠到零模糊管线层参数上的增量计划。
 *
 * 全部数值 round4（=保留 4 位小数），保证探针快照稳定、避免浮点尾巴。
 * v1.9.1：旧的 shadowCrushDelta / highlightBloomDelta 字段已删除，
 * 换成 shadowCrushTarget（直接设目标不透明度）与 sCurveContrastDelta / exposureLiftDelta。
 */
export interface AdaptivePlan {
  /** 命中的场景类别（五选一）。 */
  sceneClass: SceneClass;
  /** 零模糊 S 曲线增量：叠加到 s-curve-contrast 层 opacity（gradeLayers 里再夹 0~0.72）。 */
  sCurveContrastDelta: number;
  /** 零模糊曝光提亮增量：叠加到 exposure-lift 层 opacity（再夹 0~0.5）。 */
  exposureLiftDelta: number;
  /** 黑位托底目标不透明度：非 null 时**直接替换** shadow-crush 层 opacity；null = 沿用预设静态值。 */
  shadowCrushTarget: number | null;
  /** 暗角增量：叠加到 vignette 层 opacity（再夹 0~0.32）。 */
  vignetteDelta: number;
  /** 染色密度倍率：缩放高光染色层 opacity（1 = 不变）。 */
  colorDensityScale: number;
  /** 明暗分离倍率：缩放暗部/高光染色层 opacity（1 = 不变）。 */
  separationScale: number;
  /** 光晕增量（v1.9.1 恒 0；由 HALATION_DELTA_MAX 夹取，绝不作为「打光」手段）。 */
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
 * 光晕增量上限（v1.9.1 冻结）。
 *
 * halationDelta 现在恒 0 —— 这条常量存在只为「未来任何正增量都必须被夹在 0.03 以内」，
 * v1.9.0 的 dark +0.50 是夜景泼牛奶的直接罪魁，绝不允许以任何形式复活。
 */
export const HALATION_DELTA_MAX = 0.03;

/* ========================================================================== *
 * 四场景冻结参数（探针按常量逐项核对）
 * ========================================================================== */

/** 暗部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_DARK = 0.15;
/** 高反差场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_HIGH_CONTRAST = 0.22;
/** 平光场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_FLAT = 0.28;
/** 亮部场景：零模糊 S 曲线增量。 */
export const SCENE_S_CURVE_BRIGHT = 0.18;

/** 暗部场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_DARK = 0.21;
/** 高反差场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_HIGH_CONTRAST = 0.12;
/** 平光场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_FLAT = 0.1;
/** 亮部场景：零模糊曝光提亮增量。 */
export const SCENE_EXPOSURE_BRIGHT = 0.1;

/** 暗部场景：黑位托底目标（0 = 不压，夜景保持死黑，Y² 不再往下踩）。 */
export const SCENE_CRUSH_TARGET_DARK = 0;
/** 高反差场景：黑位托底目标（轻压 0.08，把暗部踩实）。 */
export const SCENE_CRUSH_TARGET_HIGH_CONTRAST = 0.08;
/** 平光场景：黑位托底目标（轻压 0.08，给平灰画面一点黑）。 */
export const SCENE_CRUSH_TARGET_FLAT = 0.08;
/** 亮部场景：黑位托底目标（0 = 雪景/逆光不压暗部，避免脏灰）。 */
export const SCENE_CRUSH_TARGET_BRIGHT = 0;

/** 平光场景：染色密度倍率。 */
export const SCENE_DENSITY_FLAT = 1.25;
/** 平光场景：明暗分离倍率。 */
export const SCENE_SEPARATION_FLAT = 1.25;

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
 * v1.9.1 阈值与 v1.9.0 逐字节一致（只换补偿方式，不动判定）。
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
  shadowCrushTarget: number | null;
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
        shadowCrushTarget: SCENE_CRUSH_TARGET_HIGH_CONTRAST,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'flat':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_FLAT,
        exposureLiftDelta: SCENE_EXPOSURE_FLAT,
        shadowCrushTarget: SCENE_CRUSH_TARGET_FLAT,
        vignetteDelta: 0,
        colorDensityScale: SCENE_DENSITY_FLAT,
        separationScale: SCENE_SEPARATION_FLAT,
        halationDelta: 0,
      };
    case 'bright':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_BRIGHT,
        exposureLiftDelta: SCENE_EXPOSURE_BRIGHT,
        shadowCrushTarget: SCENE_CRUSH_TARGET_BRIGHT,
        vignetteDelta: 0,
        colorDensityScale: 1,
        separationScale: 1,
        halationDelta: 0,
      };
    case 'dark':
      return {
        sCurveContrastDelta: SCENE_S_CURVE_DARK,
        exposureLiftDelta: SCENE_EXPOSURE_DARK,
        shadowCrushTarget: SCENE_CRUSH_TARGET_DARK,
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
        shadowCrushTarget: null,
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
    sCurveContrastDelta: round4(deltas.sCurveContrastDelta),
    exposureLiftDelta: round4(deltas.exposureLiftDelta),
    // 黑位托底：null 原样透传（neutral = 沿用预设静态值）；非 null 时夹进渲染硬上限。
    shadowCrushTarget:
      deltas.shadowCrushTarget === null
        ? null
        : round4(clamp(deltas.shadowCrushTarget, 0, 0.12)),
    vignetteDelta: round4(deltas.vignetteDelta),
    colorDensityScale: round4(deltas.colorDensityScale),
    separationScale: round4(deltas.separationScale),
    // v1.9.1：光晕增量恒 0，但仍按上限常量为未来改动兜底（绝不允许 > 0.03）。
    halationDelta: round4(clamp(deltas.halationDelta, 0, HALATION_DELTA_MAX)),
    whiteBalanceShift,
    tintShift,
    stats: scene,
  };
}

/**
 * 把自适应白平衡偏移应用到颜色配置上。
 *
 * v1.9.1 只动 temperature / tint 两个用户白平衡键；其余 10 个键（含三支零模糊光学键）原样返回。
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
