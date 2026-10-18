/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.9.3（用户「反差优先 + 零模糊」手术）：九支传奇底片 + 同源显影管线
 * ─────────────────────────────────────────────────────────────────────────
 *  iOS 上 RN 的 `filter` 只支持 brightness / opacity，做不了对比度、饱和度、色温。
 *  所以所有调色都是「图层 + mixBlendMode 混合」（native compositingFilter）。
 *
 *  v1.9.2 实拍暴露新问题：**先 screen 提亮后 overlay 拉反差**把高光压扁了 ——
 *  screen 先把亮部推满，overlay 再想拉反差时高光已经贴顶，结果「亮而平、反差不够」。
 *  v1.9.3 把顺序倒过来：**先立反差（s-curve overlay），再用 color-burn 上色彩密度，
 *  最后才用克制的小量 screen 提亮**。三个光学层都是"同一张原图"的自叠
 *  （photo 副本 + mixBlendMode，blurRadius 恒 0），没有任何模糊/发光滤镜。
 *
 *  ── 现行图层（顺序 = gradeLayers.ts 渲染顺序，全部物理层见契约 §3.1）────────
 *   base              原图（100% 刀锐，opacity 1）
 *   sCurveContrast    Image 副本, overlay,  opacity 0.46~0.72
 *                     = 零模糊真 S 曲线：Y<0.5 → 2Y²，Y≥0.5 → 1−2(1−Y)²，
 *                       f(0)=0、f(1)=1（白场永远到得了 255）
 *   colorDensity      colorBurnTint 色层, color-burn, opacity 0.08~0.16（渲染 ≤0.24）
 *                     = 色彩密度/染色料厚度；白场 1−... 恒不变（纯白不动）
 *   exposureLift      Image 副本, screen,   opacity 0.04~0.14
 *                     = Y' = 2Y−Y²：只提亮，f(0)=0（夜空/黑场绝不起雾）；量克制
 *   temperature       高明度暖/冷亮色, soft-light（用户 WB 旋钮）
 *   tint              高明度绿/品红亮色, soft-light（用户 Tint 旋钮）
 *   shadowTint*       高明度亮色, soft-light / overlay（化学暗部偏色，≤0.36）
 *   highlightTint*    高明度亮色, soft-light / overlay（色彩密度，≤0.36）
 *   shadowCrush       Image 副本, multiply, 仅 TX-400 0.08（硬朗黑白脚底）
 *   monoDesaturate    #808080 满幅, color, opacity 1（仅 HP/TX 真黑白）
 *   halation          light-leak.png, screen, ≤0.06（仅 CS-800T）
 *   grain             grain.png（全透明背景）+ overlay，绝对不透明度（见 grain.ts）
 *   vignette          vignette.png 拉伸 + multiply（≤0.40）
 *   lightLeak         light-leak.png + screen（本代九卷全 0）
 *
 *  ── 数值纪律（v1.9.3）────────────────────────────────────────────────────
 *  · sCurveContrast ∈ [0.46, 0.72]；colorBurn ∈ [0.08, 0.18]（渲染上限 0.24）；
 *    exposureLift ∈ [0.04, 0.14]；vignette ∈ [0.22, 0.38]；
 *    shadowCrush = 0（仅 TX-400 0.08）；halation = 0（仅 CS-800T 0.06）。
 *  · 化学分离色只允许 soft-light / overlay：overlay 用于"要色彩密度"的卷
 *    （UM 暗部 / GD·CP·FJ·EK 高光 / CS 高光），其余 soft-light。
 *  · 三档染色不透明度：shadow ∈ [0.16, 0.30]、highlight ∈ [0.26, 0.32]。
 *  · 色层纪律（v1.9.2 起不变）：非基底 photo 层一律显式 mixBlendMode；
 *    染色亮色尽量高明度；halation 仅 CS 0.06。
 *  · 用户颗粒档位会在运行时覆盖 `grain`（`applyGrainLevel`，绝对档
 *    0 / 0.10 / 0.18 / 0.30 / 0.42，见 constants/grain.ts）；
 *    "某卷无颗粒"用 GRAINLESS_PRESET_IDS 表达。
 *
 *  ── 防侵权纪律（用户 m06500 红线，v1.9.3 继续）────────────────────────────
 *  · 代号（name）只用字母+数字：UM-400 / GD-200 / PT-400 / CP-200 / FJ-400 /
 *    EK-100 / CS-800T / HP-400 / TX-400，**不含任何厂商名/商品名**。
 *  · 旧代号（su-200 / ri-100 / …）只活在 `LEGACY_PRESET_ID_ALIASES` 里做旧照片兼容，
 *    不进选卷 UI。
 *
 *  ── 关于 grain 的旧语义（v1.8.0~v1.8.1，仅存档，别再按那个写）───────────────
 *  v1.8.0 时它是振幅，靠 σ_贴图=0.2605 换算；v1.8.1 夹 [0.12,0.22]；v1.8.3 起
 *  档位直接给**绝对不透明度**。v1.9.3 起档位重新定标为
 *  关 0 / 轻 0.10 / 标 0.18 / 重 0.30 / 极重 0.42（见 grain.ts），
 *  `grainLayerOpacity()` 是唯一封顶入口，不要再抬。
 *
 *  ─────────────────────────────────────────────────────────────────────────
 * 怎么新增一个预设
 * ─────────────────────────────────────────────────────────────────────────
 * 复制下面任意一条，改 id / name / 数值即可。id 建议英文小写短横线。
 * 旧版持久化的 presetId 先过 `LEGACY_PRESET_ID_ALIASES` 落到性格最接近的新卷；
 * 表里没有的陌生 id 才回落到 0 = 默认卷，不会崩。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type {
  FilmPreset,
  ResolvedColorGrade,
  ResolvedFilmPreset,
  ResolvedTimestampConfig,
} from '../types';
import { DEFAULT_CAPTURE_QUALITY, resolveCaptureLongEdge } from './captureQuality';

/** 调色/颗粒/暗角等参数的默认值：不写就用它。 */
export const PRESET_DEFAULTS = {
  /** 色温：用户旋钮直接加减这一项；九卷静态值全 0（色温人格交给化学分离色）。 */
  temperature: 0,
  /** 色调：同上，九卷静态值全 0。 */
  tint: 0,
  /** 零模糊真 S 曲线（同源 overlay 自叠）强度。九卷 0.46~0.72，0 = 不出图层。 */
  sCurveContrast: 0,
  /** 色彩密度（color-burn 色层）强度。九卷 0.08~0.16，0 = 不出图层。 */
  colorBurn: 0,
  /** 色彩密度的色值；空串 = 该卷没有这一层。 */
  colorBurnTint: '',
  /** 零模糊曝光提亮（同源 screen 自叠）强度。九卷 0.04~0.14，0 = 不出图层。 */
  exposureLift: 0,
  /** 黑位托底（同源 multiply 自叠）强度。v1.9.3 九卷全 0，仅 TX-400 用 0.08。 */
  shadowCrush: 0,
  /**
   * 化学冷暖分离色。空串 = 该卷没有这一层；
   * 混合模式只允许 soft-light / overlay（渲染侧会 sanitize）。
   */
  shadowTint: '',
  shadowTintBlendMode: 'soft-light',
  shadowTintOpacity: 0,
  highlightTint: '',
  highlightTintBlendMode: 'soft-light',
  highlightTintOpacity: 0,
  /** 暖红光晕：仅 CS-800T 0.06，其余九卷 0。 */
  halation: 0,
  /**
   * 颗粒**强度**（v1.8.3 起 = 图层绝对不透明度）。
   * v1.9.3 默认 0.025 = 标准档；运行时会先被用户颗粒档位覆盖（applyGrainLevel）。
   */
  grain: 0.025,
  /** 灰尘与划痕（历史字段，v1.8.3 起不再产生图层）。 */
  dust: 0,
  /** 暗角贴图边缘最大不透明度（v1.9.3 九卷 0.22~0.38，渲染上限 0.40）。 */
  vignette: 0.3,
  lightLeak: 0,
  lightLeakFlip: false,
  /** 真黑白：满幅 #808080 + 'color' 混合 = 数学上 R=G=B 的真去色。 */
  mono: false,
  showGuide: true,
  /**
   * 保存前把原图最长边压到多少像素。**0 = 不压缩**（用相机原图，约 12 MP）。
   * 注意：0 会让合成期间多占约 48 MB 内存，但成片画质只受 captureLongEdge 限制。
   */
  normalizeMaxLongEdge: 0,
  /**
   * 成片的长边目标像素数。**默认值来自画质档**：`resolveCaptureLongEdge(DEFAULT_CAPTURE_QUALITY)`
   * —— 三档与内存口径见 `captureQuality.ts`，当前默认 = 2048（standard）。
   */
  captureLongEdge: resolveCaptureLongEdge(DEFAULT_CAPTURE_QUALITY),
} as const;

/** 日期水印默认值（经典橙色液晶）。 */
export const DEFAULT_TIMESTAMP: Omit<ResolvedTimestampConfig, 'fontFamily' | 'anchor'> = {
  enabled: true,
  format: 'YY MM DD',
  color: '#FF8A00',
  fontSizeRatio: 0.055,
  letterSpacingRatio: 0.14,
  glow: true,
  fontWeight: '700',
  insetRatio: 0.028,
};

/**
 * v1.9.3 的 9 支传奇底片。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 全部参数按用户「反差优先 + 零模糊」九卷冻结表落值：
 *   1 UM-400  = 高反差拍立得街拍卷（默认王牌，天青蓝暗部 overlay + 暖金高光）
 *   2 GD-200  = 金色日光（金黄 overlay 高光）
 *   3 PT-400  = 大师人像（白皙暖桃高光）
 *   4 CP-200  = 复古琥珀（琥珀 overlay 高光）
 *   5 FJ-400  = 日系青绿（薄荷青 overlay 暗部）
 *   6 EK-100  = 反转片高密（零颗粒；暗部/高光双 overlay）
 *   7 CS-800T = 电影钨丝灯（冰蓝 overlay 高光，唯一保留 0.06 光晕）
 *   8 HP-400  = 纪实人文黑白
 *   9 TX-400  = 硬朗高反差黑白（唯一保留 0.08 黑位托底）
 *
 * 代号不含任何厂商名/商品名（用户 m06500 红线：防商标纠纷）。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'um-400',
    name: 'UM-400',
    description: '高反差拍立得 · 街拍王牌',
    color: {
      // 反差优先基准：sCurve .62 / burn .14 / lift .08 / crush 0 / vignette .34
      sCurveContrast: 0.62,
      colorBurn: 0.14,
      colorBurnTint: '#235F9E',
      exposureLift: 0.08,
      shadowCrush: 0,
      // 天青蓝暗部走 overlay（色彩密度），暖金高光 soft-light。
      shadowTint: '#2373C3',
      shadowTintBlendMode: 'overlay',
      shadowTintOpacity: 0.24,
      highlightTint: '#FFCD6E',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.26,
    },
    grain: 0.025,
    vignette: 0.34,
  },
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '金色日光 · 暖阳日常',
    color: {
      sCurveContrast: 0.52,
      colorBurn: 0.12,
      colorBurnTint: '#B46E32',
      exposureLift: 0.1,
      shadowCrush: 0,
      // 金黄 overlay 高光（色彩密度）。
      highlightTint: '#FFBE4B',
      highlightTintBlendMode: 'overlay',
      highlightTintOpacity: 0.28,
    },
    grain: 0.025,
    vignette: 0.26,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '大师人像 · 奶油肤色',
    color: {
      sCurveContrast: 0.46,
      colorBurn: 0.08,
      colorBurnTint: '#C08A5A',
      exposureLift: 0.14,
      shadowCrush: 0,
      // 白皙暖桃高光 soft-light + 极轻冷蓝暗部。
      shadowTint: '#A8C4E0',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.16,
      highlightTint: '#FFD0AF',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.3,
    },
    grain: 0.025,
    vignette: 0.22,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '复古琥珀 · 九十年代',
    color: {
      sCurveContrast: 0.5,
      colorBurn: 0.14,
      colorBurnTint: '#B77A2E',
      exposureLift: 0.08,
      shadowCrush: 0,
      // 琥珀 overlay 高光（九十年代色彩密度）。
      highlightTint: '#EBAF50',
      highlightTintBlendMode: 'overlay',
      highlightTintOpacity: 0.28,
    },
    grain: 0.025,
    vignette: 0.3,
  },
  {
    id: 'fj-400',
    name: 'FJ-400',
    description: '日系青绿 · 空气感',
    color: {
      sCurveContrast: 0.54,
      colorBurn: 0.12,
      colorBurnTint: '#2F7F6E',
      exposureLift: 0.1,
      shadowCrush: 0,
      // 薄荷青 overlay 暗部（通透空气感）。
      shadowTint: '#1E917D',
      shadowTintBlendMode: 'overlay',
      shadowTintOpacity: 0.26,
    },
    grain: 0.025,
    vignette: 0.26,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转片 · 浓郁高密',
    color: {
      sCurveContrast: 0.68,
      colorBurn: 0.16,
      colorBurnTint: '#8C2F26',
      exposureLift: 0.06,
      shadowCrush: 0,
      // 反转片级色彩密度：暗部冰蓝 overlay + 高光暖红 overlay；零颗粒。
      shadowTint: '#1B3A6B',
      shadowTintBlendMode: 'overlay',
      shadowTintOpacity: 0.3,
      highlightTint: '#D2452F',
      highlightTintBlendMode: 'overlay',
      highlightTintOpacity: 0.26,
    },
    grain: 0,
    vignette: 0.36,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '电影钨丝 · 冷调夜戏',
    color: {
      sCurveContrast: 0.56,
      colorBurn: 0.12,
      colorBurnTint: '#1A4F8C',
      exposureLift: 0.06,
      shadowCrush: 0,
      // 电影钨丝：冰蓝 overlay 高光 + 唯一保留的 0.06 暖红光晕。
      highlightTint: '#196ECD',
      highlightTintBlendMode: 'overlay',
      highlightTintOpacity: 0.32,
      halation: 0.06,
    },
    grain: 0.025,
    vignette: 0.32,
  },
  {
    id: 'hp-400',
    name: 'HP-400',
    description: '纪实黑白 · 银盐灰阶',
    mono: true,
    color: {
      sCurveContrast: 0.54,
      colorBurn: 0.1,
      colorBurnTint: '#6B5A45',
      exposureLift: 0.08,
      shadowCrush: 0,
    },
    grain: 0.025,
    vignette: 0.28,
  },
  {
    id: 'tx-400',
    name: 'TX-400',
    description: '硬朗黑白 · 森山冲击',
    mono: true,
    color: {
      sCurveContrast: 0.72,
      colorBurn: 0.18,
      colorBurnTint: '#5A4632',
      exposureLift: 0.04,
      // 全库唯一保留的黑位托底（0.08）：硬朗黑白的最后一点脚底支撑。
      shadowCrush: 0.08,
    },
    grain: 0.025,
    vignette: 0.38,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.9.0 起是 ek-100 反转片，v1.9.3 不变）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v1.9.3 起仍是 UM-400 王牌卷）。 */
export const DEFAULT_PRESET_ID = 'um-400';

/**
 * 旧代号 → 新代号的兼容映射（v1.9.0 底片库换代，v1.9.1~v1.9.3 数值重做、映射不变）。
 *
 * 用途**只有一处**：旧版本拍下的照片在 `galleryStore` 里记着旧 `presetId`
 * （v1.8.9 的 gd-200/… 以及 v1.8.10~v1.8.11 的 su-200/…），重新冲印/回放时
 * `findPresetIndex()` 先查这张表，让旧照片还能落到"性格最接近"的新卷上。
 *
 * 选卷 UI / 胶片抽屉**不读这张表** —— 新九卷的卡片直接来自 PRESETS。
 * 这张表是只读的历史账本，新代号不再迭代时不要往里加。
 */
export const LEGACY_PRESET_ID_ALIASES: Readonly<Record<string, string>> = {
  // v1.8.0 ~ v1.8.9 的旧黑白代号（彩色卷代号现在就是 PRESETS 的 id，不需要自己映射自己）
  'hp-400-bw': 'hp-400',
  'tx-400-bw': 'tx-400',
  // v1.8.10 ~ v1.8.11 的中代号（旧照片回放用）
  'su-200': 'gd-200',
  'vl-400': 'pt-400',
  'vx-400': 'um-400',
  'am-200': 'cp-200',
  'nz-400': 'fj-400',
  'ri-100': 'ek-100',
  'nt-800t': 'cs-800t',
  'mn-400-bw': 'hp-400',
  'sl-400-bw': 'tx-400',
};

/**
 * 按 id 找预设下标；找不到返回 0。
 * 旧代号先过 `LEGACY_PRESET_ID_ALIASES`（旧照片兼容），再查表；都不中才回落默认卷。
 */
export function findPresetIndex(id: string): number {
  const target = LEGACY_PRESET_ID_ALIASES[id] ?? id;
  const index = PRESETS.findIndex((preset) => preset.id === target);
  return index >= 0 ? index : 0;
}

/** 循环取下标（左下角那排预设胶囊用它左右翻）。 */
export function wrapPresetIndex(index: number): number {
  const length = PRESETS.length;
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

/**
 * 把"用户写的预设"补全成"管线要用的预设"。
 * 纯函数、无副作用 —— 这是 `processFilmPhoto` 的第一行，也是单测的第一个断言点。
 */
export function resolvePreset(preset: FilmPreset): ResolvedFilmPreset {
  const color = preset.color;
  const resolvedColor: ResolvedColorGrade = {
    temperature: color.temperature ?? PRESET_DEFAULTS.temperature,
    tint: color.tint ?? PRESET_DEFAULTS.tint,
    sCurveContrast: color.sCurveContrast ?? PRESET_DEFAULTS.sCurveContrast,
    colorBurn: color.colorBurn ?? PRESET_DEFAULTS.colorBurn,
    colorBurnTint: color.colorBurnTint ?? PRESET_DEFAULTS.colorBurnTint,
    exposureLift: color.exposureLift ?? PRESET_DEFAULTS.exposureLift,
    shadowCrush: color.shadowCrush ?? PRESET_DEFAULTS.shadowCrush,
    shadowTint: color.shadowTint ?? PRESET_DEFAULTS.shadowTint,
    shadowTintBlendMode: color.shadowTintBlendMode ?? PRESET_DEFAULTS.shadowTintBlendMode,
    shadowTintOpacity: color.shadowTintOpacity ?? PRESET_DEFAULTS.shadowTintOpacity,
    highlightTint: color.highlightTint ?? PRESET_DEFAULTS.highlightTint,
    highlightTintBlendMode: color.highlightTintBlendMode ?? PRESET_DEFAULTS.highlightTintBlendMode,
    highlightTintOpacity: color.highlightTintOpacity ?? PRESET_DEFAULTS.highlightTintOpacity,
    halation: color.halation ?? PRESET_DEFAULTS.halation,
  };

  const timestamp = preset.timestamp;
  const resolvedTimestamp: ResolvedTimestampConfig = {
    enabled: timestamp?.enabled ?? DEFAULT_TIMESTAMP.enabled,
    format: timestamp?.format ?? DEFAULT_TIMESTAMP.format,
    color: timestamp?.color ?? DEFAULT_TIMESTAMP.color,
    fontSizeRatio: timestamp?.fontSizeRatio ?? DEFAULT_TIMESTAMP.fontSizeRatio,
    letterSpacingRatio: timestamp?.letterSpacingRatio ?? DEFAULT_TIMESTAMP.letterSpacingRatio,
    glow: timestamp?.glow ?? DEFAULT_TIMESTAMP.glow,
    fontWeight: timestamp?.fontWeight ?? DEFAULT_TIMESTAMP.fontWeight,
    // null = 交给 useFilmFonts 决定系统等宽字体
    fontFamily: timestamp?.fontFamily ?? null,
    // null = 用相框自带的 watermark.anchor
    anchor: timestamp?.anchor ?? null,
    insetRatio: timestamp?.insetRatio ?? DEFAULT_TIMESTAMP.insetRatio,
  };

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? '',
    color: resolvedColor,
    grain: preset.grain ?? PRESET_DEFAULTS.grain,
    dust: preset.dust ?? PRESET_DEFAULTS.dust,
    vignette: preset.vignette ?? PRESET_DEFAULTS.vignette,
    lightLeak: preset.lightLeak ?? PRESET_DEFAULTS.lightLeak,
    lightLeakFlip: preset.lightLeakFlip ?? PRESET_DEFAULTS.lightLeakFlip,
    mono: preset.mono ?? PRESET_DEFAULTS.mono,
    timestamp: resolvedTimestamp,
    showGuide: preset.showGuide ?? PRESET_DEFAULTS.showGuide,
    normalizeMaxLongEdge: preset.normalizeMaxLongEdge ?? PRESET_DEFAULTS.normalizeMaxLongEdge,
    captureLongEdge: preset.captureLongEdge ?? PRESET_DEFAULTS.captureLongEdge,
  };
}
