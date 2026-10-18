/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.9.4（「真·德味明度色度解耦引擎」）：九支传奇底片 + 同源显影管线
 * ─────────────────────────────────────────────────────────────────────────
 *  iOS 上 RN 的 `filter` 只支持 brightness / opacity，做不了对比度、饱和度、色温。
 *  所以所有调色都是「图层 + mixBlendMode 混合」（native compositingFilter）。
 *
 *  v1.9.3 实拍暴露出**通道撕裂**：同源 overlay 在 128 分界线上对 R/G/B 三个通道
 *  各自独立「该压压、该提提」—— 同一块浅冷灰（R118 G124 B134）里，R 走暗部公式、
 *  G/B 走亮部公式，结果被撕成剧毒青蓝/妖艳紫蓝；再叠 color-burn 提密度，
 *  彻底失控。根因不是数值，是**明度与色度被同一层混合同时操作**。
 *
 *  v1.9.4 解法 = **明度/色度解耦 + 同源 color 色度锁**：
 *    · 先把明度单独雕塑：同源 photo 副本 overlay 做真 S 曲线（f(0)=0、f(1)=1），
 *      screen 只做克制提亮（f(0)=0，夜空/黑场绝不起雾）；
 *    · 再上一张同源 photo 副本、`mixBlendMode: color` 的**色度锁**（chroma-lock）：
 *      `color` 混合 = 取底下的**明度**、取自己的**色相/饱和度** —— 于是槽 1/2 雕出的
 *      明暗 100% 保留，色度按权重锁回原图，彻底消灭 128 分界线上的通道撕裂；
 *    · 黑白卷的色度锁换成满幅 `#808080` + `color` + opacity 1.0（真去色，数学上 R=G=B）；
 *    · 彻底删除 color-burn / color-density 图层。
 *
 *  ── 现行图层（顺序 = gradeLayers.ts 渲染顺序，详见契约 §1 的 12 槽）──────────
 *   base              原图（100% 刀锐，opacity 1）
 *   exposure-lift     photo 副本, screen,  opacity 0.16~0.26（夹 0.28）
 *                     = Y' = 2Y−Y²：只提亮，f(0)=0（夜空/黑场绝不起雾）
 *   s-curve-contrast  photo 副本, overlay, opacity 0.40~0.60（夹 0.60）
 *                     = 零模糊真 S 曲线：Y<0.5 → 2Y²，Y≥0.5 → 1−2(1−Y)²，
 *                       f(0)=0、f(1)=1（白场永远到得了 255）
 *   chroma-lock       photo 副本, color,   opacity = chromaLock（0.54~0.68）
 *                     = 明度取底、色相/饱和度取原图：德味明暗 + 原色色度，解通道撕裂
 *                     黑白卷：满幅 #808080 color opacity 1.0（真黑白）
 *   temperature       高明度暖/冷亮色, soft-light（用户 WB 旋钮，≤0.20）
 *   tint              高明度绿/品红亮色, soft-light（用户 Tint 旋钮，≤0.20）
 *   shadow-tint       高明度亮色, **只 soft-light**（化学暗部偏色，≤0.20）
 *   highlight-tint    高明度亮色, **只 soft-light**（德味暖调分色，≤0.20）
 *   shadow-crush      photo 副本, multiply, 仅 TX-400 0.05（硬朗黑白脚底）
 *   halation          light-leak.png, screen, 仅 CS-800T 0.04
 *   grain             grain.png（全画幅非周期银盐板）+ soft-light，绝对不透明度（见 grain.ts）
 *   vignette          vignette.png 拉伸 + multiply（0.16~0.28，夹 0.28）
 *   light-leak        light-leak.png + screen（本代九卷全 0）
 *
 *  ── 数值纪律（v1.9.4）────────────────────────────────────────────────────
 *  · sCurveContrast ∈ [0.40, 0.60]；exposureLift ∈ [0.16, 0.26]；
 *    chromaLock ∈ [0.54, 0.68]（黑白卷不写，用 1.0 灰层）；
 *    vignette ∈ [0.16, 0.28]；shadowCrush = 0（仅 TX-400 0.05）；
 *    halation = 0（仅 CS-800T 0.04）。
 *  · 染色层（temperature / tint / shadow-tint / highlight-tint）**只允许 soft-light**，
 *    不透明度一律 ≤ 0.20；九卷化学染色色值全部高明度、以「保色不脏色」为准。
 *  · 色层纪律（v1.9.2 起不变）：非基底 photo 层一律显式 mixBlendMode；
 *    photo 副本 blurRadius 恒 0（零模糊同源自叠）。
 *  · 用户颗粒档位会在运行时无条件覆盖 `grain`（`applyGrainLevel`，绝对档
 *    0 / 0.04 / 0.075 / 0.115 / 0.16，见 constants/grain.ts）；
 *    "某卷无颗粒"用 GRAINLESS_PRESET_IDS 表达。
 *
 *  ── 防侵权纪律（用户 m06500 红线，v1.9.4 继续）────────────────────────────
 *  · 代号（name）只用字母+数字：UM-400 / GD-200 / PT-400 / CP-200 / FJ-400 /
 *    EK-100 / CS-800T / HP-400 / TX-400，**不含任何厂商名/商品名**。
 *  · 旧代号（su-200 / ri-100 / …）只活在 `LEGACY_PRESET_ID_ALIASES` 里做旧照片兼容，
 *    不进选卷 UI。
 *
 *  ── 关于 grain 的旧语义（v1.8.0~v1.8.1，仅存档，别再按那个写）───────────────
 *  v1.8.0 时它是振幅，靠 σ_贴图=0.2605 换算；v1.8.1 夹 [0.12,0.22]；v1.8.3 起
 *  档位直接给**绝对不透明度**。v1.9.4 起档位重新定标为
 *  关 0 / 轻 0.04 / 标 0.075 / 重 0.115 / 极重 0.16（见 grain.ts），
 *  `grainLayerOpacity()` 是唯一封顶入口，不要再抬；九卷 `grain` 基准值
 *  （0.025 / ek-100=0）**不参与渲染**，保留只为历史与兼容。
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
  /** 零模糊真 S 曲线（同源 overlay 自叠）强度。九卷 0.40~0.60，0 = 不出图层。 */
  sCurveContrast: 0,
  /**
   * 同源 color 色度锁（chroma-lock）强度。彩色卷 0.54~0.68；0 = 不出图层。
   * 黑白卷不写本项 —— 渲染侧用满幅 #808080 color opacity 1.0 的真去色层替代。
   */
  chromaLock: 0,
  /** 零模糊曝光提亮（同源 screen 自叠）强度。九卷 0.16~0.26，0 = 不出图层。 */
  exposureLift: 0,
  /** 黑位托底（同源 multiply 自叠）强度。v1.9.4 九卷全 0，仅 TX-400 用 0.05。 */
  shadowCrush: 0,
  /**
   * 化学冷暖分离色。空串 = 该卷没有这一层；
   * v1.9.4 起混合模式**只允许 soft-light**（渲染侧会 sanitize）。
   */
  shadowTint: '',
  shadowTintBlendMode: 'soft-light',
  shadowTintOpacity: 0,
  highlightTint: '',
  highlightTintBlendMode: 'soft-light',
  highlightTintOpacity: 0,
  /** 暖红光晕：仅 CS-800T 0.04，其余九卷 0。 */
  halation: 0,
  /**
   * 颗粒**强度**（v1.8.3 起 = 图层绝对不透明度）。
   * v1.9.4 默认 0.025 = 标准档；运行时会先被用户颗粒档位覆盖（applyGrainLevel），
   * 本字段只为历史/兼容保留，不直接参与渲染。
   */
  grain: 0.025,
  /** 灰尘与划痕（历史字段，v1.8.3 起不再产生图层）。 */
  dust: 0,
  /** 暗角贴图边缘最大不透明度（v1.9.4 九卷 0.16~0.28，渲染上限 0.28）。 */
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
 * v1.9.4 的 9 支传奇底片。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 全部参数按 v1.9.4 契约 §2「明度色度解耦」九卷冻结表落值：
 *   1 UM-400  = 高反差拍立得街拍卷（默认王牌，暖金高光 soft-light + 天青蓝暗部）
 *   2 GD-200  = 金色日光（金黄高光 soft-light）
 *   3 PT-400  = 大师人像（白皙暖桃高光 soft-light）
 *   4 CP-200  = 复古琥珀（琥珀高光 soft-light）
 *   5 FJ-400  = 日系青绿（薄荷青高光 soft-light）
 *   6 EK-100  = 反转片高密（零颗粒；暖米高光 soft-light）
 *   7 CS-800T = 电影钨丝灯（冰蓝高光 soft-light，唯一保留 0.04 光晕）
 *   8 HP-400  = 纪实人文黑白（无 chromaLock，灰层真去色）
 *   9 TX-400  = 硬朗高反差黑白（唯一保留 0.05 黑位托底）
 *
 * 彩色卷 chromaLock 必须落在 [0.54, 0.68]；黑白卷不写 chromaLock。
 * 代号不含任何厂商名/商品名（用户 m06500 红线：防商标纠纷）。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'um-400',
    name: 'UM-400',
    description: '高反差拍立得 · 街拍王牌',
    color: {
      // 解耦基准：sCurve .52 / chromaLock .62 / lift .22 / crush 0 / vignette .24
      sCurveContrast: 0.52,
      chromaLock: 0.62,
      exposureLift: 0.22,
      shadowCrush: 0,
      // 暖金高光 + 天青蓝暗部，全部 soft-light（色度锁已负责色彩密度）。
      shadowTint: '#AFD7F5',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.1,
      highlightTint: '#FFE0AA',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.16,
    },
    grain: 0.025,
    vignette: 0.24,
  },
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '金色日光 · 暖阳日常',
    color: {
      sCurveContrast: 0.46,
      chromaLock: 0.6,
      exposureLift: 0.24,
      shadowCrush: 0,
      // 金黄高光 soft-light（保色不脏色）。
      highlightTint: '#FFD78C',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.2,
    },
    grain: 0.025,
    vignette: 0.2,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '大师人像 · 奶油肤色',
    color: {
      sCurveContrast: 0.4,
      chromaLock: 0.66,
      exposureLift: 0.26,
      shadowCrush: 0,
      // 白皙暖桃高光 soft-light（人像肤色最忌色相撕裂）。
      highlightTint: '#FFE2CD',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.18,
    },
    grain: 0.025,
    vignette: 0.16,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '复古琥珀 · 九十年代',
    color: {
      sCurveContrast: 0.44,
      chromaLock: 0.62,
      exposureLift: 0.22,
      shadowCrush: 0,
      // 琥珀高光 soft-light（九十年代暖调）。
      highlightTint: '#F8D08A',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.18,
    },
    grain: 0.025,
    vignette: 0.22,
  },
  {
    id: 'fj-400',
    name: 'FJ-400',
    description: '日系青绿 · 空气感',
    color: {
      sCurveContrast: 0.46,
      chromaLock: 0.64,
      exposureLift: 0.24,
      shadowCrush: 0,
      // 薄荷青高光 soft-light（通透空气感，不再靠 overlay 暗部）。
      highlightTint: '#AFE8DC',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.16,
    },
    grain: 0.025,
    vignette: 0.18,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转片 · 浓郁高密',
    color: {
      sCurveContrast: 0.56,
      chromaLock: 0.54,
      exposureLift: 0.18,
      shadowCrush: 0,
      // 反转片级明暗反差由 sCurve 负责；高光暖米 soft-light；零颗粒。
      highlightTint: '#FFE4BE',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.14,
    },
    grain: 0,
    vignette: 0.26,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '电影钨丝 · 冷调夜戏',
    color: {
      sCurveContrast: 0.48,
      chromaLock: 0.6,
      exposureLift: 0.22,
      shadowCrush: 0,
      // 冰蓝高光 soft-light + 唯一保留的 0.04 暖红光晕。
      highlightTint: '#A5D2FA',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.18,
      halation: 0.04,
    },
    grain: 0.025,
    vignette: 0.24,
  },
  {
    id: 'hp-400',
    name: 'HP-400',
    description: '纪实黑白 · 银盐灰阶',
    mono: true,
    color: {
      sCurveContrast: 0.46,
      exposureLift: 0.22,
      shadowCrush: 0,
    },
    grain: 0.025,
    vignette: 0.2,
  },
  {
    id: 'tx-400',
    name: 'TX-400',
    description: '硬朗黑白 · 森山冲击',
    mono: true,
    color: {
      sCurveContrast: 0.6,
      exposureLift: 0.16,
      // 全库唯一保留的黑位托底（0.05）：硬朗黑白的最后一点脚底支撑。
      shadowCrush: 0.05,
    },
    grain: 0.025,
    vignette: 0.28,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.9.0 起是 ek-100 反转片，v1.9.4 不变）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v1.9.4 起仍是 UM-400 王牌卷）。 */
export const DEFAULT_PRESET_ID = 'um-400';

/**
 * 旧代号 → 新代号的兼容映射（v1.9.0 底片库换代，v1.9.1~v1.9.4 数值重做、映射不变）。
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
    chromaLock: color.chromaLock ?? PRESET_DEFAULTS.chromaLock,
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
