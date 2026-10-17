/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 参数 → 图层映射（实现在 `src/utils/gradeLayers.ts`，全部是真实存在的 RN 能力）
 * ─────────────────────────────────────────────────────────────────────────
 *  iOS 上 RN 的 `filter` 只支持 brightness / opacity，做不了对比度、饱和度、色温。
 *  所以这里所有调色都是「图层 + mixBlendMode 混合」，Expo Go（新架构）原生支持：
 *
 *   temperature  -1..1  暖橙/冷蓝纯色层，'overlay'，opacity = |v| × 0.38（色亮度恰好 0.5）
 *   tint         -1..1  绿/品红纯色层，'overlay'，opacity = |v| × 0.24（同上）
 *   saturation    0..2  < 1：中灰层 'saturation'（去色）；> 1：高饱和色层 'saturation'（加饱和）
 *                        `mono:true` 的卷这一项不产生图层（由 ⑧ 的满幅去色层接管）
 *   contrast      0..2  > 1：**同一个画面再叠一层** 'soft-light'（自叠即提对比度）
 *                        opacity 硬夹 0.20；**v1.8.5 起这一层没有任何模糊**（不是模糊副本）
 *                        < 1：v1.8.0 起**不再产生图层**（中灰 normal 层 = 白雾来源）
 *   fade          0..1  **历史字段**：v1.8.3 起不再产生图层（原 lighten 托黑层已删）
 *   exposure     -1..1  > 0：v1.8.0 起**不再产生图层**（原纯白 screen 是白雾来源）
 *                        < 0：黑 'multiply' 压暗，opacity = |v| × 0.30
 *   splitTone     0..1  两层 overlay：暗部青蓝 × 0.35 + 高光暖调 × 0.30
 *   halation      0..1  **v1.8.5 新语义**：一层暖红 '#FF4028' **纯色** 'screen'
 *                        （零模糊！），opacity = clamp01(v) × 0.06 ≤ 0.06。
 *                        旧 `bloom` 的两层（模糊原图 + 暖红色偏）已按用户红线删除
 *   mono         bool   **v1.8.5 新增**：真黑白。true 时在所有彩色层之后、颗粒/纹理之前
 *                        叠一层满幅 `#808080` + 'saturation' + opacity 1 ——
 *                        这是"取颜色的饱和度"混合，数学上输出 R=G=B，是**真去色**，
 *                        不是半透明灰罩（灰罩只会把画面抬灰，不会去色）。
 *   grain         0..1  grain.png 平铺 + 'overlay'（单色亮度颗粒，无任何色度噪声）
 *                        **v1.8.1 起这一列是"强度"，v1.8.3 起 `grainLayerOpacity()` 把它当
 *                        绝对不透明度并硬夹进 [0, 0.11]（见 constants/grain.ts）**
 *                        注意：用户颗粒档位会在运行时覆盖这里（`applyGrainLevel`），
 *                        所以"某卷颗粒更粗"不能只靠这一列 —— 特例见 `GRAINLESS_PRESET_IDS`
 *   dust          0..1  **历史字段**：v1.8.3 起不再产生图层（白尘改由成片上 1~2 颗点表现）
 *   vignette      0..1  vignette.png 拉伸 + **'normal'**（v1.8.5 起，旧版是 overlay）
 *                        opacity = 预设值 = **边缘最大不透明度**；贴图中心 65% 半径 alpha=0
 *                        ⇒ 画面中心零遮挡，只有外圈压向深青黑（光学暗角）
 *   lightLeak     0..1  light-leak.png 拉伸 + 'screen'，opacity = min(0.10, × 0.29)
 *                        （lightLeakFlip: true 换到左边）
 *
 *  ── v1.8.5 M2 数值纪律（用户 m02760 + 契约 §3）────────────────────────────
 *  · 彩色卷**每个 color 层 opacity 必须落在 [0.03, 0.06]**：色温/色调/分离色调/饱和度/
 *    halation 全部按这个窗配值，靠暗角、阴影倾向、颗粒区分性格，不靠浓遮罩。
 *  · 严禁任何整幅**浅白/米色**图层，也严禁 `lighten` / `'screen'` 的白色层
 *    （halation 暖红 screen ≤ 0.06、漏光 screen ≤ 0.10 是仅有的两处例外）。
 *  · 严禁在原图上叠模糊副本：本代不产生任何 `kind:'photo'` + `blurRadius` 层。
 *  · 9 支卷：gd-200 金色日光 / pt-400 柔和人像 / um-400 浓郁街拍 / cp-200 复古琥珀 /
 *    fj-400 日系青绿 / ek-100 反转锐利（无颗粒）/ cs-800t 电影钨丝灯 / hp-400-bw 纪实黑白 /
 *    tx-400-bw 硬朗银盐。文案 = name（代号）+ description（中文副标题），不改 i18n。
 *
 *  ── 关于 grain 的旧语义（v1.8.0~v1.8.1，仅存档，别再按那个写）───────────────
 *  v1.8.0 时它是振幅，靠 σ_贴图=0.2605 换算；v1.8.1 夹 [0.12,0.22]；v1.8.3 起
 *  档位直接给**绝对不透明度**（关 0 / 轻 0.022 / 标 0.045 / 重 0.075 / 极重 0.11），
 *  `grainLayerOpacity()` 是唯一封顶入口，不要再抬。
 *
 *  中性值不产生图层：temperature/tint/fade/lightLeak/halation = 0、saturation/contrast = 1、
 *  exposure = 0；grain/vignette 不写就有一点点默认值（见 PRESET_DEFAULTS）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么新增一个预设
 * ─────────────────────────────────────────────────────────────────────────
 * 复制下面任意一条，改 id / name / 数值即可。id 建议英文小写短横线。
 * 注意保持数值纪律（色层 opacity ∈ [0.03,0.06]，不加白层/模糊层）。
 * 旧版持久化的 presetId（retro-400 / portra-400 / …）不在表里，`findPresetIndex()`
 * 会安全回落到 0 = 默认卷，不会崩。
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
  temperature: 0,
  tint: 0,
  saturation: 1,
  contrast: 1,
  fade: 0,
  exposure: 0,
  /** 分离色调：暗部青蓝 + 高光暖调。0 = 关。 */
  splitTone: 0,
  /** 光晕（halation）：暖红纯色 screen，opacity ≤ 0.06。0 = 关。 */
  halation: 0,
  /**
   * 颗粒**强度**（v1.8.3 起 = 图层绝对不透明度，硬上限 0.11）。
   * 默认 0.045 = 标准档；运行时会先被用户颗粒档位覆盖（applyGrainLevel）。
   */
  grain: 0.045,
  /** 灰尘与划痕（历史字段，v1.8.3 起不再产生图层）。 */
  dust: 0,
  /** 暗角贴图边缘最大不透明度。 */
  vignette: 0.18,
  lightLeak: 0,
  lightLeakFlip: false,
  /** 真黑白：饱和度为 0 + 满幅 saturation 去色层。 */
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
   * 单支卷想永远更大/更小，就自己写一个数；`resolvePreset` 里的 `??` 会给它让路。
   * 0 = 不指定，用屏幕原生分辨率（舞台逻辑尺寸 × 设备像素比，约 1119×1488）。
   *
   * 为什么要有这个旋钮：调色全部靠 `mixBlendMode`（= iOS 的 `layer.compositingFilter`），
   * 而截图走的是 `drawViewHierarchyInRect`，默认只按"视图在屏幕上的逻辑尺寸 × 设备像素比"出图。
   * 传给 `captureRef` 一个更大的 `width/height`（单位是**点**）会让 iOS 把整棵图层树
   * 重绘到更大的画布上 —— 照片、相框 PNG、日期文字都会从各自的源图重新采样，
   * 所以只要源图分辨率够（相框已生成到 2700×3600），就能真的拿到更多像素。
   * 代价是内存：2048 约 +12 MB，3024 约 +30 MB。
   *
   * v1.7.0：这一档现在**由用户在设置页里选**（标准/高清/极致），并实时生效；
   * 这里给的只是"用户还没选过"的默认锚点，不再是唯一真相。
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
 * v1.8.5 M2 的 9 支卷。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 数值只做"性格"：色层全部压在 0.03~0.06（硬上限 0.06），
 * 画面差异主要来自色相倾向（temperature/tint/splitTone）、反差与暗角。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '金色日光 · 暖调通透',
    color: {
      temperature: 0.12,
      tint: -0.14,
      saturation: 1,
      contrast: 1.06,
      splitTone: 0.13,
    },
    grain: 0.045,
    vignette: 0.22,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '柔和人像 · 肤色微暖',
    color: {
      temperature: 0.1,
      tint: -0.13,
      saturation: 0.95,
      contrast: 1,
      splitTone: 0.12,
    },
    grain: 0.045,
    vignette: 0.18,
  },
  {
    id: 'um-400',
    name: 'UM-400',
    description: '浓郁街拍 · 高反差',
    color: {
      temperature: -0.1,
      tint: 0.16,
      saturation: 1.06,
      contrast: 1.18,
      splitTone: 0.14,
    },
    grain: 0.045,
    vignette: 0.26,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '复古琥珀 · 黄昏暖调',
    color: {
      temperature: 0.15,
      tint: -0.16,
      saturation: 1,
      contrast: 1.08,
      splitTone: 0.16,
    },
    grain: 0.045,
    vignette: 0.28,
    lightLeak: 0.14,
  },
  {
    id: 'fj-400',
    name: 'FJ-400',
    description: '日系青绿 · 冷调通透',
    color: {
      temperature: -0.12,
      tint: 0.21,
      saturation: 0.95,
      contrast: 1,
      splitTone: 0.12,
    },
    grain: 0.045,
    vignette: 0.22,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转锐利 · 零雾高对比',
    color: {
      temperature: 0,
      tint: 0,
      saturation: 1.04,
      contrast: 1.2,
      splitTone: 0.11,
    },
    // 反转片零颗粒：即使运行时把用户档位覆盖成 0.11，buildGradeLayers 也会按
    // GRAINLESS_PRESET_IDS 跳过这一层（见 gradeLayers.ts ⑨）。
    grain: 0,
    vignette: 0.32,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '电影钨丝灯 · 冷蓝 + 暖红光晕',
    color: {
      temperature: -0.15,
      tint: 0,
      saturation: 1,
      contrast: 1.1,
      splitTone: 0.13,
      // 暖红 halation 纯色 screen：0.85 × 0.06 = 0.051 ≤ 0.06，零模糊。
      halation: 0.85,
    },
    grain: 0.045,
    vignette: 0.26,
    lightLeak: 0.18,
  },
  {
    id: 'hp-400-bw',
    name: 'HP-400 BW',
    description: 'BW · 纪实黑白 · 中灰层次',
    mono: true,
    color: {
      temperature: 0,
      tint: 0,
      saturation: 0,
      contrast: 1.12,
      splitTone: 0,
    },
    grain: 0.045,
    vignette: 0.24,
  },
  {
    id: 'tx-400-bw',
    name: 'TX-400 BW',
    description: 'BW · 硬朗银盐 · 高反差',
    mono: true,
    color: {
      temperature: 0,
      tint: 0,
      saturation: 0,
      contrast: 1.25,
      splitTone: 0,
    },
    grain: 0.045,
    vignette: 0.38,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v1.8.5 起是 GD-200）。 */
export const DEFAULT_PRESET_ID = 'gd-200';

/** 按 id 找预设下标；找不到返回 0。旧版持久化的 10 个老 id 走的就是这条回落。 */
export function findPresetIndex(id: string): number {
  const index = PRESETS.findIndex((preset) => preset.id === id);
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
    saturation: color.saturation ?? PRESET_DEFAULTS.saturation,
    contrast: color.contrast ?? PRESET_DEFAULTS.contrast,
    fade: color.fade ?? PRESET_DEFAULTS.fade,
    exposure: color.exposure ?? PRESET_DEFAULTS.exposure,
    splitTone: color.splitTone ?? PRESET_DEFAULTS.splitTone,
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
