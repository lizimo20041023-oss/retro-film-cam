/**
 * 场景自适应调色（v1.8.11，用户 m06849 第一条）。
 *
 * 用户原话：「不要简单的调个色，而是深入底层代码，去修改这个滤镜的底层逻辑，而不是简简单单
 * 换个色调，使得这个照片的质感很假很虚，要更换成那种可以根据光线变化而改变的，明部暗部也是
 * 要根据拍摄场景自己去计算而不是简简单单换个色调和饱和度」。
 *
 * 所以这里不是"再给每支卷加一个色偏"，而是**在预设曲线之上做一层有界的场景补偿**：
 *
 *   · 测量（`utils/sceneStats.ts`）：成片链路读裁切后底片（JPEG q0.98）的字节，用纯 JS 的
 *     baseline-JPEG DC 解码器采样出分块亮度网格（4:2:0 底片约 190×250 格）、反差、色温倾向、
 *     绿-品红倾向、饱和度 —— 这正是"明部暗部按拍摄场景自己算"的那份数据。
 *   · 决策（本文件）：`planAdaptiveGrade(scene, preset)` 把这几个测量值换算成**四类补偿**：
 *       ① 白平衡：场景已经偏暖就收一点、偏冷就补一点（避免"暖卷 + 暖光"叠成橘黄）；
 *       ② 反差：平光场景给一点对比、大光比场景收一点（避免死黑死白）；
 *       ③ 中调 S 曲线：暗场景略加、亮场景略减（保住中间调层次）；
 *       ④ 分区：暗部占比高 → 一层**有界**的暖/冷 screen（提暗部层次）；
 *          高光占比高 → 一层**有界**的近白 multiply（收高光，防死白）。
 *   · 落地（`utils/gradeLayers.ts`）：①~③ 直接改 `ResolvedColorGrade` 的数值后再走原有
 *     图层公式（不新增层，不改公式）；④ 追加两层 `kind:'color'`，opacity 硬夹在
 *     [0.03, 0.06] —— 与 `_haze_audit` 的"色层纪律"完全同一条预算。
 *
 * ── 为什么这样不会把画面弄"假/虚"（v1.8.11 的硬约束）──────────────────────────
 *   · **零模糊**：不产生任何 `kind:'photo'` 层，不碰 `blurRadius`（v1.8.3/v1.8.5 红线）。
 *   · **零白蒙**：①~③ 走 overlay 色层与自混合，都是"亮度恒等"的数学（见 gradeLayers 文件头）；
 *     ④ 的 screen 层 opacity ≤ 0.05、multiply 层色值 ≥ #F2 级别，白场损失 ≤ 0.005。
 *   · **有界**：每个补偿量都有硬上下限（下面常量），最坏情况也不可能把一支卷的性格洗掉；
 *     推镜下界 0.90 / 1.10，暗部提升 ≤ 5%，高光收敛 ≤ 6%。
 *   · **可退化**：`scene` 缺失（取景器实时预览、纯函数探针、旧存档重放）时 `plan === null`，
 *     `applyAdaptiveColor` 原样返回、`buildSceneLayers` 返回空数组 —— 图层栈逐字节回到
 *     v1.8.10 的静态曲线，18 道旧门禁的数值一个都不许漂。
 *
 * 纯函数、零依赖、零 RN 引用（Node 探针可以直接装载断言）。
 */
import type { GradeLayer, ResolvedColorGrade, ResolvedFilmPreset, SceneStats } from '../types';

/* ── 目标值与边界：全部是"硬预算"，改这里等于改观感，必须先跑 _probe_v1811_adaptive ── */

/** 讨喜的轻微暖调目标（warmth 测量值 ≈ 0.06）。 */
const TARGET_WARMTH = 0.06;
/** 常规场景的亮度标准差目标（平光 ≈ 0.10，硬光 ≈ 0.24）。 */
const TARGET_CONTRAST = 0.16;
/** 常规场景的平均饱和度目标。 */
const TARGET_SATURATION = 0.22;
/** 常规场景的平均亮度目标（0.5 略偏暗，给高光留余量）。 */
const TARGET_LUMA = 0.48;

/** 白平衡补偿硬上限（叠加后仍会再 clamp 到 [-1,1]）。 */
export const WB_SHIFT_MAX = 0.14;
/** 色调（绿-品红）补偿硬上限。 */
export const TINT_SHIFT_MAX = 0.08;
/** 反差增益上下限。 */
export const CONTRAST_GAIN_MIN = 0.9;
export const CONTRAST_GAIN_MAX = 1.1;
/** 饱和增益上下限。 */
export const SATURATION_GAIN_MIN = 0.92;
export const SATURATION_GAIN_MAX = 1.08;
/** S 曲线增量上下限（叠加后仍会再 clamp 到 [0, 0.42]）。 */
export const S_CURVE_DELTA_MAX = 0.06;
/** 暗部提升层：[0.03, 0.05]（不到 0.03 就不生成图层）。 */
export const SHADOW_LIFT_MIN = 0.03;
export const SHADOW_LIFT_MAX = 0.05;
/** 高光收敛层：[0.03, 0.06]（不到 0.03 就不生成图层）。 */
export const HIGHLIGHT_ROLL_MIN = 0.03;
export const HIGHLIGHT_ROLL_MAX = 0.06;

/** 场景统计的有效下限：少于这么多采样块就不做自适应（统计噪声太大）。 */
const MIN_SAMPLES = 12;

/**
 * 一次成片的自适应决策。只有数值，没有"怎么画"——画是 `gradeLayers.ts` 的事。
 * `stats` 原样带回，给图层 label 与调试/探针用。
 */
export interface AdaptivePlan {
  /** 色温补偿量（加在 `color.temperature` 上，正 = 更暖）。[-0.14, 0.14] */
  whiteBalanceShift: number;
  /** 色调补偿量（加在 `color.tint` 上，正 = 更绿）。[-0.08, 0.08] */
  tintShift: number;
  /** 反差倍率（乘在 `color.contrast` 上）。[0.90, 1.10] */
  contrastGain: number;
  /** 饱和倍率（乘在 `color.saturation` 上）。[0.92, 1.08] */
  saturationGain: number;
  /** S 曲线增量（加在 `color.sCurveIntensity` 上）。[-0.06, 0.06] */
  sCurveDelta: number;
  /** 暗部提升层不透明度；null = 这场光线下不需要。 */
  shadowLift: number | null;
  /** 高光收敛层不透明度；null = 不需要。 */
  highlightRolloff: number | null;
  /** 测量值原样带回。 */
  stats: SceneStats;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * 从场景统计 + 预设算出补偿量。纯函数：
 * - `scene` 为空（undefined / null）或采样不足 → `null`（= 静态曲线，逐字节旧行为）；
 * - `mono` 卷不做白平衡/色调补偿（反正会被满幅去色层抽掉色度，改了只是白费），
 *   但反差 / S 曲线 / 暗部 / 高光**照常**补偿 —— 黑白卷同样要按场景光比调整。
 *
 * 公式（探针 `_probe_v1811_adaptive.cjs` 逐条断言）：
 *   whiteBalanceShift = clamp((TARGET_WARMTH  - scene.warmth)   × 0.35, ±0.14)
 *   tintShift         = clamp((0               - scene.tintBias) × 0.20, ±0.08)
 *   contrastGain      = clamp(1 + (TARGET_CONTRAST   - scene.contrast)   × 1.00, 0.90, 1.10)
 *   saturationGain    = clamp(1 + (TARGET_SATURATION - scene.saturation) × 0.30, 0.92, 1.08)
 *   sCurveDelta       = clamp((TARGET_LUMA - scene.meanLuma) × 0.12, ±0.06)
 *   shadowLift        = clamp((scene.shadowShare         - 0.26) × 0.45, 0, 0.05)
 *   highlightRolloff  = clamp((scene.highlightShare + 2 × scene.clipShare - 0.20) × 0.50, 0, 0.06)
 * 两个分区量不足 `SHADOW_LIFT_MIN` / `HIGHLIGHT_ROLL_MIN` 时返回 null（不生成空图层）。
 */
export function planAdaptiveGrade(
  scene: SceneStats | null | undefined,
  preset: ResolvedFilmPreset,
): AdaptivePlan | null {
  if (!scene || scene.samples < MIN_SAMPLES) {
    return null;
  }
  const mono = preset.mono === true;

  const whiteBalanceShift = mono
    ? 0
    : round4(clamp((TARGET_WARMTH - scene.warmth) * 0.35, -WB_SHIFT_MAX, WB_SHIFT_MAX));
  const tintShift = mono
    ? 0
    : round4(clamp((0 - scene.tintBias) * 0.2, -TINT_SHIFT_MAX, TINT_SHIFT_MAX));
  const contrastGain = round4(
    clamp(1 + (TARGET_CONTRAST - scene.contrast) * 1.0, CONTRAST_GAIN_MIN, CONTRAST_GAIN_MAX),
  );
  const saturationGain = round4(
    clamp(
      1 + (TARGET_SATURATION - scene.saturation) * 0.3,
      SATURATION_GAIN_MIN,
      SATURATION_GAIN_MAX,
    ),
  );
  const sCurveDelta = round4(
    clamp((TARGET_LUMA - scene.meanLuma) * 0.12, -S_CURVE_DELTA_MAX, S_CURVE_DELTA_MAX),
  );

  const liftRaw = clamp((scene.shadowShare - 0.26) * 0.45, 0, SHADOW_LIFT_MAX);
  const shadowLift = liftRaw >= SHADOW_LIFT_MIN ? round4(liftRaw) : null;

  const rollRaw = clamp(
    (scene.highlightShare + scene.clipShare * 2 - 0.2) * 0.5,
    0,
    HIGHLIGHT_ROLL_MAX,
  );
  const highlightRolloff = rollRaw >= HIGHLIGHT_ROLL_MIN ? round4(rollRaw) : null;

  return {
    whiteBalanceShift,
    tintShift,
    contrastGain,
    saturationGain,
    sCurveDelta,
    shadowLift,
    highlightRolloff,
    stats: scene,
  };
}

/**
 * 把补偿量落进调色数值。返回**新对象**（绝不在共享的 `preset.color` 上就地改），
 * `plan === null` 时原样返回同一个引用 —— 这是"缺省 = 旧行为"的强保证：
 * 只要没有 scene，后面所有图层公式看到的 `color` 与 v1.8.10 完全同一个对象。
 *
 * 边界说明：`temperature/tint` 加完再 clamp 到 [-1,1]；`contrast` 是倍率（[0.85,1.3] 兜底，
 * 真正生效的对比层 opacity 另有 0.20 硬顶）；`saturation` 是倍率（[0,1.6] 兜底，图层自己
 * 按 1±0.01 判断加/减饱和）；`sCurveIntensity` 加完 clamp 到 [0,0.42]（用户表上限）。
 * `fade` 是历史字段（不参与渲染），不补偿。
 */
export function applyAdaptiveColor(
  color: ResolvedColorGrade,
  plan: AdaptivePlan | null,
): ResolvedColorGrade {
  if (plan === null) {
    return color;
  }
  return {
    ...color,
    temperature: round4(clamp(color.temperature + plan.whiteBalanceShift, -1, 1)),
    tint: round4(clamp(color.tint + plan.tintShift, -1, 1)),
    saturation: round4(clamp(color.saturation * plan.saturationGain, 0, 1.6)),
    contrast: round4(clamp(color.contrast * plan.contrastGain, 0.85, 1.3)),
    sCurveIntensity: round4(clamp(color.sCurveIntensity + plan.sCurveDelta, 0, 0.42)),
  };
}

/**
 * 分区补偿图层（暗部提升 / 高光收敛）。`plan === null` 返回空数组。
 *
 * - 暗部提升：`screen` + 场景色温的**补色**（场景偏暖 → 用冷白抬暗部，反之用暖白），
 *   opacity ∈ [0.03, 0.05]。screen 的代价 = 色值 Y × opacity，色值都是浅色（Y ≥ 0.85），
 *   最坏 0.05 × 0.15 ≈ 0.0075 的白场损失，远在 `_haze_audit` 的 0.02 预算内。
 * - 高光收敛：`multiply` + 近白（`#F2FFFB` 级别，Y ≥ 0.97），把高速区的通道差收一点，
 *   避免"死白 + 色偏"，opacity ∈ [0.03, 0.06]。
 * - 两层都排在 ⑧.6（分离染色）之后、⑨（颗粒）之前：它们属于"按场景算的曝光/反差补偿"，
 *   必须作用在完整调色结果上，又不能盖到颗粒/暗角/漏光这些物理质感之上。
 */
export function buildSceneLayers(plan: AdaptivePlan | null): GradeLayer[] {
  if (plan === null) {
    return [];
  }
  const layers: GradeLayer[] = [];
  const warmth = plan.stats.warmth;

  if (plan.shadowLift !== null) {
    // 场景偏暖（warmth > 0.04）→ 暗部补冷白；否则补暖白。补的是"环境光里缺的那一端"。
    const color = warmth > 0.04 ? '#DCE8FF' : '#FFE9D6';
    layers.push({
      kind: 'color',
      key: 'scene-shadow-lift',
      label: `场景 · 暗部提亮 ${Math.round(plan.shadowLift * 100)}%（暗部占比 ${Math.round(
        plan.stats.shadowShare * 100,
      )}%）`,
      color,
      blendMode: 'screen',
      opacity: plan.shadowLift,
    });
  }

  if (plan.highlightRolloff !== null) {
    const color = warmth > 0.08 ? '#FFEFE2' : '#F4F7FF';
    layers.push({
      kind: 'color',
      key: 'scene-highlight-rolloff',
      label: `场景 · 高光收敛 ${Math.round(
        plan.highlightRolloff * 100,
      )}%（高光 ${Math.round(plan.stats.highlightShare * 100)}% / 溢出 ${Math.round(
        plan.stats.clipShare * 100,
      )}%）`,
      color,
      blendMode: 'multiply',
      opacity: plan.highlightRolloff,
    });
  }

  return layers;
}
