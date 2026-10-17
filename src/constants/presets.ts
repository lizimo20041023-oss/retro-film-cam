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
 *                        （零模糊！），opacity = clamp01(v) × 0.08 ≤ 0.08
 *                        （v1.8.7 模块三把上限从 0.06 抬到 0.08）。旧 `bloom` 的两层
 *                        （模糊原图 + 暖红色偏）已按用户红线删除
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
 *  ── 数值纪律（v1.8.5 M2 起，v1.8.10 重做底片库时原样保留）──────────────────
 *  · 彩色卷**每个 color 层 opacity 必须落在 [0.03, 0.06]**：色温/色调/分离色调/饱和度/
 *    halation 全部按这个窗配值，靠暗角、阴影倾向、颗粒区分性格，不靠浓遮罩。
 *    推论：temperature 的 |v| ∈ [0.079, 0.158]、tint 的 |v| ∈ [0.125, 0.25]、
 *    splitTone ≥ 0.10、saturation ∈ {1} ∪ [0.94, 0.97] ∪ [1.035, 1.070] 之外的数值
 *    会产生"低于/高于窗口"的色层（宁可写中性 1.0 也不写 0.02 这种半层）。
 *  · 严禁任何整幅**浅白/米色**图层，也严禁 `lighten` / `'screen'` 的白色层
 *    （halation 暖红 screen ≤ 0.08、漏光 screen ≤ 0.10 是仅有的两处例外）。
 *  · 严禁在原图上叠模糊副本：本代不产生任何 `kind:'photo'` + `blurRadius` 层。
 *  · s-curve（同源自叠）opacity ≤ 0.42、soft-light/overlay；分离染色
 *    shadowTint ≤ 0.12 / highlightTint ≤ 0.30（v1.8.7 声明上限，`_haze_audit` 按此判）。
 *
 *  ── v1.8.10 底片库重做（用户 m06500）──────────────────────────────────────
 *  · 旧九支卷（gd-200 / pt-400 / …）整套换掉：新代号 + 按九种经典胶卷重新仿色。
 *  · **代号与文案里不含任何厂商名/商品名**（用户红线：防商标纠纷）；旧代号只剩
 *    `LEGACY_PRESET_ID_ALIASES` 里的兼容映射（旧照片回放用，不参与选卷 UI）。
 *  · 九支卷：su-200 暖阳日光 / vl-400 丝绒人像 / vx-400 鲜活日常 / am-200 琥珀怀旧 /
 *    nz-400 自然清透 / ri-100 浓郁反转（无颗粒）/ nt-800t 夜色钨丝 /
 *    mn-400-bw 纪实黑白 / sl-400-bw 硬朗银盐。文案 = name（代号）+ description（中文副标题），
 *    不改 i18n。
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
 * 旧版持久化的 presetId（gd-200 / pt-400 / …）先过 `LEGACY_PRESET_ID_ALIASES`
 * 落到性格最接近的新卷；表里没有的陌生 id 才回落到 0 = 默认卷，不会崩。
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
  /** 光晕（halation）：暖红纯色 screen，opacity ≤ 0.08。0 = 关。 */
  halation: 0,
  /**
   * v1.8.7 模块二：自混合 S-Curve（同源副本）强度与混合模式。0 = 关。
   * 具体数值由每支卷给出（0.22~0.42），这里只是"没写就不产生图层"的锚点。
   */
  sCurveIntensity: 0,
  curveBlendMode: 'soft-light',
  /**
   * v1.8.7 模块二/三：分离染色两层（暗部 + 柔光）。空串 = 该卷没有这一层；
   * 混合模式与不透明度都按用户给的数值表（不是半透明平涂）。
   */
  shadowTint: '',
  shadowTintBlendMode: 'multiply',
  shadowTintOpacity: 0,
  highlightTint: '',
  highlightTintBlendMode: 'soft-light',
  highlightTintOpacity: 0,
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
 * v1.8.10 重做的 9 支卷。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 数值只做"性格"：色层全部压在 0.03~0.06（硬上限 0.06），
 * 画面差异主要来自色相倾向（temperature/tint/splitTone）、反差、分离染色与暗角。
 * 新代号一律不含厂商名/商品名（用户 m06500 红线：防商标纠纷）；旧代号只在
 * `LEGACY_PRESET_ID_ALIASES` 里做兼容，不进这张表。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'su-200',
    name: 'SU-200',
    description: '暖阳日光 · 通透日常',
    color: {
      temperature: 0.14,
      tint: -0.13,
      saturation: 1,
      contrast: 1.05,
      splitTone: 0.12,
      // v1.8.10：暖阳负片 —— 暖橙 + 金色高光 + 暖棕暗部；暗角轻。
      // 颗粒列统一 0.045（G02 冻结：颗粒粗细归用户档位，不靠数据分家）。
      sCurveIntensity: 0.3,
      curveBlendMode: 'soft-light',
      shadowTint: '#2C1B0A',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.09,
      highlightTint: '#FFC85F',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.21,
    },
    grain: 0.045,
    vignette: 0.24,
  },
  {
    id: 'vl-400',
    name: 'VL-400',
    description: '丝绒人像 · 肤色自然',
    color: {
      temperature: 0.09,
      tint: -0.13,
      saturation: 0.95,
      contrast: 1,
      splitTone: 0.1,
      // v1.8.10：人像负片 —— 低对比、轻微暖调、暗部冷蓝 exclusion；高光柔桃色。
      sCurveIntensity: 0.22,
      curveBlendMode: 'soft-light',
      shadowTint: '#0A1623',
      shadowTintBlendMode: 'exclusion',
      shadowTintOpacity: 0.07,
      highlightTint: '#FFD8C0',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.17,
    },
    grain: 0.045,
    vignette: 0.16,
  },
  {
    id: 'vx-400',
    name: 'VX-400',
    description: '鲜活色彩 · 万能日常',
    color: {
      temperature: -0.08,
      tint: 0.13,
      saturation: 1.06,
      contrast: 1.14,
      splitTone: 0.12,
      // v1.8.10：高饱和负片 —— 饱和抬头 + 硬 overlay 曲线 + 冷蓝柔光，街拍/旅行通用。
      sCurveIntensity: 0.3,
      curveBlendMode: 'overlay',
      highlightTint: '#124B8C',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.16,
    },
    grain: 0.045,
    vignette: 0.3,
  },
  {
    id: 'am-200',
    name: 'AM-200',
    description: '琥珀怀旧 · 黄昏暖调',
    color: {
      temperature: 0.15,
      tint: -0.14,
      saturation: 1,
      contrast: 1.06,
      splitTone: 0.15,
      // v1.8.10：复古暖调负片 —— 琥珀暗部 multiply + 暖金高光，配轻微漏光。
      sCurveIntensity: 0.26,
      curveBlendMode: 'soft-light',
      shadowTint: '#3A2612',
      shadowTintBlendMode: 'multiply',
      shadowTintOpacity: 0.11,
      highlightTint: '#F5B964',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.19,
    },
    grain: 0.045,
    vignette: 0.27,
    lightLeak: 0.12,
  },
  {
    id: 'nz-400',
    name: 'NZ-400',
    description: '自然清透 · 日系冷调',
    color: {
      temperature: -0.1,
      tint: 0.18,
      saturation: 0.97,
      contrast: 1,
      splitTone: 0.12,
      // v1.8.10：自然负片 —— 冷青绿倾向 + 低对比 + 青绿暗部 exclusion，日常记录舒服。
      sCurveIntensity: 0.28,
      curveBlendMode: 'soft-light',
      shadowTint: '#082026',
      shadowTintBlendMode: 'exclusion',
      shadowTintOpacity: 0.1,
      highlightTint: '#146E5F',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.15,
    },
    grain: 0.045,
    vignette: 0.2,
  },
  {
    id: 'ri-100',
    name: 'RI-100',
    description: '浓郁反转 · 零雾高饱和',
    color: {
      temperature: 0,
      tint: 0,
      saturation: 1.06,
      contrast: 1.18,
      splitTone: 0.11,
      // v1.8.10：反转片 —— 高饱和 + 硬 overlay 曲线 + 极淡冷黑 color-burn 压暗部；
      // 零颗粒（见 GRAINLESS_PRESET_IDS），风景/建筑的高反差表现靠这条曲线。
      sCurveIntensity: 0.34,
      curveBlendMode: 'overlay',
      shadowTint: '#141923',
      shadowTintBlendMode: 'color-burn',
      shadowTintOpacity: 0.06,
    },
    grain: 0,
    vignette: 0.36,
  },
  {
    id: 'nt-800t',
    name: 'NT-800T',
    description: '夜色钨丝 · 霓虹光晕',
    color: {
      temperature: -0.13,
      tint: 0,
      saturation: 1.05,
      contrast: 1.1,
      splitTone: 0.13,
      // v1.8.10：钨丝灯电影卷 —— 冷蓝柔光 + 暖红光晕（screen ≤0.08）+ 漏光。
      sCurveIntensity: 0.26,
      curveBlendMode: 'overlay',
      highlightTint: '#125596',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.26,
      halation: 1,
    },
    grain: 0.045,
    vignette: 0.24,
    lightLeak: 0.16,
  },
  {
    id: 'mn-400-bw',
    name: 'MN-400 BW',
    description: '纪实黑白 · 中灰层次',
    mono: true,
    color: {
      temperature: 0,
      tint: 0,
      saturation: 0,
      contrast: 1.1,
      splitTone: 0,
      // v1.8.10：纪实黑白 —— 先去色再 soft-light 自混合，保住中灰层次。
      sCurveIntensity: 0.3,
      curveBlendMode: 'soft-light',
    },
    grain: 0.045,
    vignette: 0.22,
  },
  {
    id: 'sl-400-bw',
    name: 'SL-400 BW',
    description: '硬朗银盐 · 高反差',
    mono: true,
    color: {
      temperature: 0,
      tint: 0,
      saturation: 0,
      contrast: 1.24,
      splitTone: 0,
      // v1.8.10：硬朗银盐 —— 去色后 overlay 自混合（更硬的 S 曲线）+ 重暗角。
      // 颗粒列与其他卷一样是 0.045（G02 冻结：颗粒粗细归用户档位，不靠数据分家）。
      sCurveIntensity: 0.42,
      curveBlendMode: 'overlay',
    },
    grain: 0.045,
    vignette: 0.42,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.8.10 起是 ri-100 反转片）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ri-100']);

/** 冷启动用哪个预设（= 列表第一项，v1.8.10 起是 SU-200）。 */
export const DEFAULT_PRESET_ID = 'su-200';

/**
 * 旧代号 → 新代号的兼容映射（v1.8.10 底片库重做）。
 *
 * 用途**只有一处**：v1.8.9 及更早拍下的照片在 `galleryStore` 里记着旧 `presetId`
 * （gd-200 / pt-400 / …），重新冲印/回放时 `findPresetIndex()` 先查这张表，让旧照片
 * 还能落到"性格最接近"的新卷上，而不是默默回落到默认第一支。
 *
 * 选卷 UI / 胶片抽屉**不读这张表** —— 表里没有旧卷的卡片，旧代号也不会出现在任何
 * 界面上。这张表是只读的历史账本，新代号不再迭代时不要往里加。
 */
export const LEGACY_PRESET_ID_ALIASES: Readonly<Record<string, string>> = {
  'gd-200': 'su-200',
  'pt-400': 'vl-400',
  'um-400': 'vx-400',
  'cp-200': 'am-200',
  'fj-400': 'nz-400',
  'ek-100': 'ri-100',
  'cs-800t': 'nt-800t',
  'hp-400-bw': 'mn-400-bw',
  'tx-400-bw': 'sl-400-bw',
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
    saturation: color.saturation ?? PRESET_DEFAULTS.saturation,
    contrast: color.contrast ?? PRESET_DEFAULTS.contrast,
    fade: color.fade ?? PRESET_DEFAULTS.fade,
    exposure: color.exposure ?? PRESET_DEFAULTS.exposure,
    splitTone: color.splitTone ?? PRESET_DEFAULTS.splitTone,
    halation: color.halation ?? PRESET_DEFAULTS.halation,
    // v1.8.7 模块二：S-Curve 自混合 + 分离染色两层（暗部/柔光）
    sCurveIntensity: color.sCurveIntensity ?? PRESET_DEFAULTS.sCurveIntensity,
    curveBlendMode: color.curveBlendMode ?? PRESET_DEFAULTS.curveBlendMode,
    shadowTint: color.shadowTint ?? PRESET_DEFAULTS.shadowTint,
    shadowTintBlendMode: color.shadowTintBlendMode ?? PRESET_DEFAULTS.shadowTintBlendMode,
    shadowTintOpacity: color.shadowTintOpacity ?? PRESET_DEFAULTS.shadowTintOpacity,
    highlightTint: color.highlightTint ?? PRESET_DEFAULTS.highlightTint,
    highlightTintBlendMode: color.highlightTintBlendMode ?? PRESET_DEFAULTS.highlightTintBlendMode,
    highlightTintOpacity: color.highlightTintOpacity ?? PRESET_DEFAULTS.highlightTintOpacity,
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
