/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v1.9.0（用户 m07595 手术二/四）：九支传奇底片 + 5 层同源光学显影管线
 * ─────────────────────────────────────────────────────────────────────────
 *  iOS 上 RN 的 `filter` 只支持 brightness / opacity，做不了对比度、饱和度、色温。
 *  所以所有调色都是「图层 + mixBlendMode 混合」（native compositingFilter）。
 *  v1.9.0 把旧的"半透明色纸"逻辑整套废除，换成**同一张底片的多份副本自叠**：
 *
 *   base            原图（opacity 1）
 *   lensSoftness    Image 副本 blurRadius=1.2,  normal,     opacity 0.22~0.34
 *                   = 树脂镜头去锐化，抹平 Smart HDR 的数码锐化白边
 *   shadowCrush     Image 副本,                 multiply,   opacity 0.25~0.55
 *                   = Y' = Y²，暗部浓墨重压（树荫/柏油/深色车体沉成油润黑）
 *   highlightBloom  Image 副本 blurRadius=14,   screen,     opacity 0.20~0.48
 *                   = Y' = 1-(1-Y)²，只提亮高光 + 明暗交界奶油 Bloom
 *   shadowTint*     纯色,   multiply / exclusion, opacity 0.12~0.28（化学暗部偏色）
 *   highlightTint*  纯色,   soft-light / overlay / screen, opacity 0.18~0.36（色彩密度）
 *   halation        纯色 '#FF4028', screen, opacity = clamp01(v) × 0.18
 *   grain           grain.png 平铺 + overlay，绝对不透明度（见 constants/grain.ts）
 *   vignette        vignette.png 拉伸 + multiply，贴图中心 56% 半径 alpha=0
 *   lightLeak       light-leak.png + screen，opacity ≤ 0.10
 *
 *  ── 数值纪律（v1.9.0）────────────────────────────────────────────────────
 *  · 九支卷全部来自用户 m07595 指定的光学配方，**不再靠 ±0.05 的微弱数值区分性格**。
 *  · 所有 photo 层只由倍率决定：`blurRadius` 固定 1.2 / 14，不要拿别的模糊半径。
 *  · 色层不透明度上限：shadowTint ≤ 0.28、highlightTint ≤ 0.36、halation × 0.18 ≤ 0.18。
 *  · 严禁整幅浅白/米色 normal 层（会变成白雾）；彩色层必须走 multiply/soft-light/overlay/screen。
 *  · 用户颗粒档位会在运行时覆盖 `grain`（`applyGrainLevel`），"某卷无颗粒"用 GRAINLESS_PRESET_IDS。
 *
 *  ── 防侵权纪律（用户 m06500 红线，v1.9.0 继续）────────────────────────────
 *  · 代号（name）只用字母+数字：UM-400 / GD-200 / PT-400 / CP-200 / FJ-400 /
 *    EK-100 / CS-800T / HP-400 / TX-400，**不含任何厂商名/商品名**。
 *  · 旧代号（su-200 / ri-100 / …）只活在 `LEGACY_PRESET_ID_ALIASES` 里做旧照片兼容，
 *    不进选卷 UI。
 *
 *  ── 关于 grain 的旧语义（v1.8.0~v1.8.1，仅存档，别再按那个写）───────────────
 *  v1.8.0 时它是振幅，靠 σ_贴图=0.2605 换算；v1.8.1 夹 [0.12,0.22]；v1.8.3 起
 *  档位直接给**绝对不透明度**（关 0 / 轻 0.022 / 标 0.045 / 重 0.075 / 极重 0.11），
 *  `grainLayerOpacity()` 是唯一封顶入口，不要再抬。
 *
 * ─────────────────────────────────────────────────────────────────────────
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
  /** Layer 1 树脂柔焦强度。0 = 不出图层。 */
  lensSoftness: 0,
  /** Layer 2 暗部浓墨重压强度。0 = 不出图层。 */
  shadowCrush: 0,
  /** Layer 3 高光奶油提亮强度。0 = 不出图层。 */
  highlightBloom: 0,
  /**
   * Layer 4a/4b：化学冷暖分离色。空串 = 该卷没有这一层；
   * 混合模式与不透明度都由每支卷按用户 m07595 的配方给出。
   */
  shadowTint: '',
  shadowTintBlendMode: 'multiply',
  shadowTintOpacity: 0,
  highlightTint: '',
  highlightTintBlendMode: 'soft-light',
  highlightTintOpacity: 0,
  /** Layer 4c 暖红光晕：渲染不透明度 = clamp01(v) × 0.18。 */
  halation: 0,
  /**
   * 颗粒**强度**（v1.8.3 起 = 图层绝对不透明度，硬上限 0.11）。
   * 默认 0.045 = 标准档；运行时会先被用户颗粒档位覆盖（applyGrainLevel）。
   */
  grain: 0.045,
  /** 灰尘与划痕（历史字段，v1.8.3 起不再产生图层）。 */
  dust: 0,
  /** 暗角贴图边缘最大不透明度（v1.9.0 贴图中心 56% 半径 alpha=0）。 */
  vignette: 0.18,
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
 * v1.9.0 的 9 支传奇底片。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 全部参数按用户 m07595 的手术四配方表落值：
 *   1 UM-400  = 高反差拍立得街拍卷（默认王牌，对标 Dazz #Inst C 气质）
 *   2 GD-200  = 金色日光
 *   3 PT-400  = 大师人像
 *   4 CP-200  = 复古琥珀
 *   5 FJ-400  = 日系青绿
 *   6 EK-100  = 反转片高密（无颗粒）
 *   7 CS-800T = 电影钨丝灯
 *   8 HP-400  = 纪实人文黑白
 *   9 TX-400  = 硬朗高反差黑白
 *
 * 代号不含任何厂商名/商品名（用户 m06500 红线：防商标纠纷）。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'um-400',
    name: 'UM-400',
    description: '高反差拍立得 · 街拍王牌',
    color: {
      // 基准：lensSoftness .30 / shadowCrush .42 / highlightBloom .36 / vignette .46
      lensSoftness: 0.3,
      shadowCrush: 0.42,
      highlightBloom: 0.36,
      // 暗部深普鲁士青黑 multiply；高光/天空钴青 soft-light。
      shadowTint: '#061626',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.22,
      highlightTint: '#125FA5',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.28,
    },
    grain: 0.045,
    vignette: 0.46,
  },
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '金色日光 · 暖阳日常',
    color: {
      lensSoftness: 0.24,
      shadowCrush: 0.34,
      highlightBloom: 0.32,
      // 暗部暖琥珀棕 multiply；高光浓郁金黄 soft-light。
      shadowTint: '#301A0A',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.18,
      highlightTint: '#FFC655',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.3,
    },
    grain: 0.045,
    vignette: 0.36,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '大师人像 · 奶油肤色',
    color: {
      lensSoftness: 0.26,
      shadowCrush: 0.28,
      highlightBloom: 0.34,
      // 暗部通透微青灰 exclusion；肤色与高光奶油暖桃 soft-light。
      shadowTint: '#0E1C24',
      shadowTintBlendMode: 'exclusion',
      shadowTintOpacity: 0.12,
      highlightTint: '#FFD7BC',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.26,
    },
    grain: 0.045,
    vignette: 0.28,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '复古琥珀 · 九十年代',
    color: {
      lensSoftness: 0.28,
      shadowCrush: 0.32,
      highlightBloom: 0.28,
      // 90 年代怀旧茶褐暗部 multiply；复古米黄暖调 soft-light。
      shadowTint: '#37240E',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.2,
      highlightTint: '#F5B65C',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.28,
    },
    grain: 0.045,
    vignette: 0.38,
  },
  {
    id: 'fj-400',
    name: 'FJ-400',
    description: '日系青绿 · 空气感',
    color: {
      lensSoftness: 0.24,
      shadowCrush: 0.35,
      highlightBloom: 0.34,
      // 暗部与树叶注入标志性翡翠青绿 multiply；高光清透冷白微青 soft-light。
      shadowTint: '#08342E',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.22,
      highlightTint: '#A0EBE1',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.24,
    },
    grain: 0.045,
    vignette: 0.34,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转片 · 高密红蓝',
    color: {
      lensSoftness: 0.15,
      shadowCrush: 0.46,
      highlightBloom: 0.3,
      // 反转片级色彩密度：overlay 红蓝加强；零颗粒（见 GRAINLESS_PRESET_IDS）。
      highlightTint: '#B03A48',
      highlightTintBlendMode: 'overlay',
      highlightTintOpacity: 0.32,
    },
    grain: 0,
    vignette: 0.44,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '电影钨丝 · 霓虹光晕',
    color: {
      lensSoftness: 0.28,
      shadowCrush: 0.34,
      highlightBloom: 0.42,
      // 全局好莱坞钨丝灯冷翠蓝 soft-light（色彩密度层）；暖红除碳光晕走 halation。
      highlightTint: '#0C4E94',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.32,
      halation: 1,
    },
    grain: 0.045,
    vignette: 0.4,
  },
  {
    id: 'hp-400',
    name: 'HP-400',
    description: '纪实黑白 · 银盐灰阶',
    mono: true,
    color: {
      lensSoftness: 0.26,
      shadowCrush: 0.32,
      highlightBloom: 0.3,
    },
    grain: 0.045,
    vignette: 0.35,
  },
  {
    id: 'tx-400',
    name: 'TX-400',
    description: '硬朗黑白 · 森山冲击',
    mono: true,
    color: {
      lensSoftness: 0.24,
      shadowCrush: 0.5,
      highlightBloom: 0.38,
    },
    grain: 0.045,
    vignette: 0.48,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.9.0 起是 ek-100 反转片）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v1.9.0 起是 UM-400 王牌卷）。 */
export const DEFAULT_PRESET_ID = 'um-400';

/**
 * 旧代号 → 新代号的兼容映射（v1.9.0 底片库换代）。
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
    lensSoftness: color.lensSoftness ?? PRESET_DEFAULTS.lensSoftness,
    shadowCrush: color.shadowCrush ?? PRESET_DEFAULTS.shadowCrush,
    highlightBloom: color.highlightBloom ?? PRESET_DEFAULTS.highlightBloom,
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
