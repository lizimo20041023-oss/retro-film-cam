/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v2.1.0（「九卷强性格」+ 预设强度缩放）：声明式预览/兜底路径一眼分九卷
 * ─────────────────────────────────────────────────────────────────────────
 *  用户反馈「九卷换预设几乎没区别」（m03050）。根因是旧表 `chromaLock`
 *  0.54~0.68 太强：同源 `color` 色度锁按 86%~100% 权重把染色层的色相锁回
 *  原图 → 化学染色被原图色度洗掉，九卷只剩明度差异。v2.1.0 手术一把它
 *  **下调到 0.10~0.22**（保留"防通道撕裂"作用，但不再压掉染色），同时把染色
 *  层不透明度提到 0.18~0.34、允许九卷写静态 `temperature`/`tint`，让九卷在
 *  同一场景下必须一眼分辨：
 *    UM-400  极强 S 曲线 + 深普鲁士青黑暗部 + 奶油暖白高光 + 0.28 暗角
 *    GD-200  全画面暖金：金黄高光 / 琥珀棕暗部（temperature +0.22）
 *    PT-400  低反差高通透：暗部微提清透青灰，高光/中间调桃粉（黄色减淡）
 *    CP-200  中间调橄榄琥珀 + 茶褐暗部，对比度适中
 *    FJ-400  冷翠青绿（temperature -0.20 + 绿 tint），翡翠暗部 / 冷青高光
 *    EK-100  全库最高反差与饱和度，黑位深，零颗粒
 *    CS-800T 强冷蓝影调（temperature -0.24 + 冷蓝暗部），保留 0.04 光晕
 *    HP-400  纯黑白 + 温柔宽容灰阶
 *    TX-400  纯黑白 + 极端高反差（shadowCrush 0.10）
 *
 *  渲染侧强度旋钮消费 `applyPresetIntensity()`：把本表的声明式参数整体乘
 *  `intensityScale`（0.35~1.00，v2.1.2 起禁止 >1 外推）后各自夹回合法上限。
 *  取景器实时预览与成片兜底路径走这条声明式缩放；成片主链路（LUT + 像素
 *  管线）另有一套强度实现。
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
 *   exposure-lift     photo 副本, screen,  opacity 0.06~0.28（夹 0.28；九卷全有，HP-400 = 0.10）
 *                     = Y' = 2Y−Y²：只提亮，f(0)=0（夜空/黑场绝不起雾）
 *   s-curve-contrast  photo 副本, overlay, opacity 0.30~0.62（夹 0.62）
 *                     = 零模糊真 S 曲线：Y<0.5 → 2Y²，Y≥0.5 → 1−2(1−Y)²，
 *                       f(0)=0、f(1)=1（白场永远到得了 255）
 *   chroma-lock       photo 副本, color,   opacity = chromaLock（0.10~0.22）
 *                     = 明度取底、色相/饱和度取原图：德味明暗 + 原色色度，解通道撕裂
 *                     v2.1.0 下调权重（旧 0.54~0.68 会把化学染色洗掉），只留防撕裂作用
 *                     黑白卷：满幅 #808080 color opacity 1.0（真黑白）
 *   temperature       卷静态色温 + 用户 WB 旋钮, soft-light（夹 0.30）
 *   tint              卷静态色调 + 用户 Tint 旋钮, soft-light（夹 0.30）
 *   shadow-tint       化学暗部偏色, **只 soft-light**（0.18~0.34，夹 0.50）
 *   highlight-tint    化学高光/中间调分色, **只 soft-light**（0.18~0.34，夹 0.50）
 *   shadow-crush      photo 副本, multiply, 仅 TX-400 0.10（硬朗黑白脚底）
 *   halation          light-leak.png, screen, 仅 CS-800T 0.04
 *   grain             grain.png（全画幅非周期银盐板）+ soft-light，绝对不透明度（见 grain.ts）
 *   vignette          vignette.png 拉伸 + multiply（0.10~0.28，夹 0.28）
 *   light-leak        light-leak.png + screen（本代九卷全 0）
 *
 *  ── 数值纪律（v2.1.0）────────────────────────────────────────────────────
 *  · sCurveContrast ∈ [0.30, 0.62]；exposureLift ∈ [0.06, 0.28]（九卷全有，最小 0.06）；
 *    chromaLock ∈ [0.10, 0.22]（黑白卷不写，用 1.0 灰层）；
 *    vignette ∈ [0.10, 0.28]；shadowCrush = 0（仅 TX-400 0.10）；
 *    halation = 0（仅 CS-800T 0.04）。
 *  · 静态 temperature / tint 只在非零时取 ±0.10~0.26 量级（渲染侧夹 ±0.30）；
 *    v2.1.0 起它们是九卷性格的一部分（GD 暖金 / FJ 冷翠 / CS 冷蓝…），
 *    不再由「化学分离色」单独承担色温。
 *  · 染色层（temperature / tint / shadow-tint / highlight-tint）**只允许 soft-light**；
 *    shadow-tint / highlight-tint 不透明度 0.18~0.34（渲染侧夹 ≤ 0.50）。
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
import { clampIntensityScale } from './intensity';
import { DEFAULT_CAPTURE_QUALITY, resolveCaptureLongEdge } from './captureQuality';

/** 调色/颗粒/暗角等参数的默认值：不写就用它。 */
export const PRESET_DEFAULTS = {
  /**
   * 色温：用户 WB 旋钮直接加减这一项。
   * v2.1.0 起九卷可以写静态色温当性格（GD +0.22 暖金 / FJ -0.20 冷翠 / CS -0.24 冷蓝），
   * 不写才落 0；渲染侧把「静态值 + 旋钮」一起夹 ±0.30。
   */
  temperature: 0,
  /** 色调：同上，九卷非零值取 ±0.10~0.26 量级（FJ 绿 / CS 品红）。 */
  tint: 0,
  /** 零模糊真 S 曲线（同源 overlay 自叠）强度。九卷 0.30~0.62，0 = 不出图层。 */
  sCurveContrast: 0,
  /**
   * 同源 color 色度锁（chroma-lock）强度。彩色卷 0.10~0.22；0 = 不出图层。
   * v2.1.0 从 0.54~0.68 下调——旧权重会把化学染色整体洗回原图色度，九卷趋同。
   * 黑白卷不写本项 —— 渲染侧用满幅 #808080 color opacity 1.0 的真去色层替代。
   */
  chromaLock: 0,
  /** 零模糊曝光提亮（同源 screen 自叠）强度。九卷 0.06~0.28，0 = 不出图层。 */
  exposureLift: 0,
  /** 黑位托底（同源 multiply 自叠）强度。v2.1.0 九卷全 0，仅 TX-400 用 0.10。 */
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
 * v2.1.0 的 9 支传奇底片「强性格」表。顺序 = 胶片抽屉里的卡片顺序，第一支是默认卷。
 *
 * 全部参数按用户 m03050 手术一（九卷强性格）落值 —— 同一场景下九卷必须一眼分辨：
 *   1 UM-400  = 极强 S 曲线 + 深普鲁士青黑暗部 + 奶油暖白高光 + 0.28 暗角（默认王牌）
 *   2 GD-200  = 全画面暖金（temperature +0.22）：金黄高光 / 琥珀棕暗部
 *   3 PT-400  = 低反差高通透：暗部微提清透青灰 + 蜜桃高光（黄色减淡）
 *   4 CP-200  = 九十年代橄榄琥珀：茶褐暗部，对比度适中
 *   5 FJ-400  = 冷翠青绿（temperature -0.20 + 绿 tint）：翡翠暗部 / 冷青高光
 *   6 EK-100  = 全库最高反差与饱和度，黑位深，零颗粒
 *   7 CS-800T = 强冷蓝电影夜戏（temperature -0.24 + 冷蓝暗部），保留 0.04 光晕
 *   8 HP-400  = 纯黑白温柔宽容灰阶（无 chromaLock，灰层真去色）
 *   9 TX-400  = 纯黑白极端高反差（唯一 shadowCrush 0.10）
 *
 * 关键纪律（v2.1.0）：
 *   · 彩色卷 chromaLock ∈ [0.10, 0.22]（旧 0.54~0.68 会把染色洗掉），黑白卷不写；
 *   · 化学染色层只 soft-light，shadow/highlight 不透明度 0.18~0.34；
 *   · 静态 temperature / tint 非零时取 ±0.10~0.26 量级；
 *   · photo 副本 blurRadius 恒 0、12 槽层 id/label 不变（探针按层 id 断结构）。
 * 代号不含任何厂商名/商品名（用户 m06500 红线：防商标纠纷）。
 */
export const PRESETS: FilmPreset[] = [
  {
    id: 'um-400',
    name: 'UM-400',
    description: '青黑暖光 · 高反差街拍',
    color: {
      // 极强反差（0.62 上限）+ 微暖色温把高光推成奶油白；暗角拉满让街头更"拍立得"。
      temperature: 0.1,
      sCurveContrast: 0.62,
      // v2.1.0：色度锁只留防撕裂的 0.14，把画面交给高浓度化学染色。
      chromaLock: 0.14,
      exposureLift: 0.22,
      shadowCrush: 0,
      // 深普鲁士青黑压暗部（红/蓝通道饱和度靠它拉开）+ 奶油暖白高光。
      shadowTint: '#061C2C',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.32,
      highlightTint: '#F2E8D5',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.3,
    },
    grain: 0.025,
    vignette: 0.28,
  },
  {
    id: 'gd-200',
    name: 'GD-200',
    description: '暖金日光 · 柔亮高光',
    color: {
      // 全画面暖金：静态 +0.22 色温 + 金黄高光 + 琥珀棕暗部，和 FJ 形成强冷暖反差。
      temperature: 0.22,
      sCurveContrast: 0.52,
      chromaLock: 0.16,
      exposureLift: 0.24,
      shadowCrush: 0,
      shadowTint: '#2E1608',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.26,
      highlightTint: '#FFC346',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.32,
    },
    grain: 0.025,
    vignette: 0.24,
  },
  {
    id: 'pt-400',
    name: 'PT-400',
    description: '柔粉人像 · 低反差浅黑',
    color: {
      // 低反差 + 高提亮 = 通透空气感；轻微冷色温把黄压下去，肤色走桃粉。
      temperature: -0.12,
      sCurveContrast: 0.3,
      chromaLock: 0.2,
      exposureLift: 0.28,
      shadowCrush: 0,
      // 暗部微提清透青灰（不是压黑），高光/中间调蜜桃粉。
      shadowTint: '#D8E4E6',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.24,
      highlightTint: '#FFDAC3',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.28,
    },
    grain: 0.025,
    vignette: 0.1,
  },
  {
    id: 'cp-200',
    name: 'CP-200',
    description: '橄榄茶褐 · 旧日街景',
    color: {
      // 九十年代暖调：中间调橄榄琥珀，暗部茶褐，反差中等偏上。
      temperature: 0.16,
      sCurveContrast: 0.48,
      chromaLock: 0.15,
      exposureLift: 0.18,
      shadowCrush: 0,
      shadowTint: '#3A2416',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.3,
      highlightTint: '#EBB44B',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.3,
    },
    grain: 0.025,
    vignette: 0.22,
  },
  {
    id: 'fj-400',
    name: 'FJ-400',
    description: '清亮青绿 · 空气感',
    color: {
      // 冷翠青绿人格：静态 -0.20 色温 + 绿 tint，与 GD 的金色完全对立。
      temperature: -0.2,
      tint: 0.12,
      sCurveContrast: 0.5,
      chromaLock: 0.12,
      exposureLift: 0.2,
      shadowCrush: 0,
      // 暗部/中间调翡翠青绿，高光冷青（通透但不发灰）。
      shadowTint: '#0C735F',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.32,
      highlightTint: '#D7ECF2',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.26,
    },
    grain: 0.025,
    vignette: 0.2,
  },
  {
    id: 'fg-400',
    name: 'FG-400',
    description: '富士绿 · 青影品红高光',
    color: {
      // 偏硬的消费负片：墨绿植被，青绿色暗部与一点品红高光。
      temperature: -0.08,
      tint: 0.1,
      sCurveContrast: 0.55,
      chromaLock: 0.14,
      exposureLift: 0.13,
      shadowCrush: 0,
      shadowTint: '#185B55',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.32,
      highlightTint: '#EACDDD',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.27,
    },
    grain: 0.025,
    vignette: 0.23,
  },
  {
    id: 'ek-100',
    name: 'EK-100',
    description: '反转片 · 强彩深黑',
    color: {
      // 全库最高反差与饱和度：sCurve 上限 + 最高色度锁（0.22），提亮压低换更深的黑位。
      temperature: 0,
      sCurveContrast: 0.62,
      chromaLock: 0.22,
      exposureLift: 0.14,
      shadowCrush: 0,
      // 中性高饱和：暗部压成冷墨青，高光保持干净冷白（不发黄）。
      shadowTint: '#16303C',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.2,
      highlightTint: '#EEF3FA',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.22,
      // 反转片零颗粒由 GRAINLESS_PRESET_IDS 保证。
    },
    grain: 0,
    vignette: 0.26,
  },
  {
    id: 'rb-100',
    name: 'RB-100',
    description: '理光蓝 · 深蓝正片',
    color: {
      // 蓝天的密度和饱和度在 LUT 里按色相单独雕塑，暖色主体不整体蒙蓝。
      temperature: -0.09,
      sCurveContrast: 0.58,
      chromaLock: 0.21,
      exposureLift: 0.13,
      shadowCrush: 0,
      shadowTint: '#233C50',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.25,
      highlightTint: '#F2E9D6',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.21,
    },
    grain: 0.015,
    vignette: 0.23,
  },
  {
    id: 'cs-800t',
    name: 'CS-800T',
    description: '钨丝夜色 · 蓝影暖灯',
    color: {
      // 强冷蓝影调：静态 -0.24 色温 + 品红 tint 压绿，暗部直接沉进冷蓝。
      temperature: -0.24,
      tint: -0.1,
      sCurveContrast: 0.44,
      chromaLock: 0.18,
      exposureLift: 0.16,
      shadowCrush: 0,
      shadowTint: '#145FB9',
      shadowTintBlendMode: 'soft-light',
      shadowTintOpacity: 0.32,
      highlightTint: '#C9E4FF',
      highlightTintBlendMode: 'soft-light',
      highlightTintOpacity: 0.24,
      // 唯一保留的 0.04 暖红光晕（电影冷夜里的灯丝溢出）。
      halation: 0.04,
    },
    grain: 0.025,
    vignette: 0.26,
  },
  {
    id: 'hp-400',
    name: 'HP-400',
    description: '纪实黑白 · 银盐灰阶',
    mono: true,
    color: {
      // 温柔宽容灰阶：中等 S 曲线 + 轻微提亮，暗部不死黑（与 TX 的极端反差拉开）。
      sCurveContrast: 0.42,
      exposureLift: 0.1,
      shadowCrush: 0,
    },
    grain: 0.025,
    vignette: 0.16,
  },
  {
    id: 'tx-400',
    name: 'TX-400',
    description: '硬朗黑白 · 森山冲击',
    mono: true,
    color: {
      // 极端高反差：S 曲线顶格 + 压低提亮 + 全库唯一 0.10 黑位托底。
      sCurveContrast: 0.62,
      exposureLift: 0.06,
      shadowCrush: 0.1,
    },
    grain: 0.025,
    vignette: 0.28,
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/**
 * 该 id 的卷**永不产生颗粒纹理层**（v1.8.5 M2；v1.9.0 起是 ek-100 反转片，v2.1.0 不变）。
 *
 * 为什么不是只把 `grain: 0` 写进数据：用户颗粒档位是全局设置，`applyGrainLevel()`
 * 会在运行时**无条件覆盖** `preset.grain`（CameraScreen / importPhoto / GalleryScreen
 * 三个入口都调它），所以"这款卷天生无颗粒"只能按 id 表达。
 * 消费方：`gradeLayers.buildGradeLayers`（跳过 grain 层）+ `FilmLookLayers.planDustSpecks`
 *  （跳过白尘点）。
 */
export const GRAINLESS_PRESET_IDS: ReadonlySet<string> = new Set(['ek-100']);

/** 冷启动用哪个预设（= 列表第一项，v2.1.0 起仍是 UM-400 王牌卷）。 */
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

/**
 * 预设强度缩放（v2.1.0 用户 m03050 手术二的**声明式侧**）。
 *
 * 渲染侧只认 `intensityScale`（0.35~1.00 的全局风格乘数，档位数据见
 * `constants/intensity.ts`）：取景器实时预览与成片兜底路径
 * 都是「预设图层 + 不透明度」，所以强度在这里就是**把声明式参数整体乘一下**。
 *
 * 规则（与契约 v2.1.0 §2 一致）：
 *   · sCurveContrast / exposureLift / chromaLock / shadowCrush 乘 scale 后各自夹回
 *     合法上限（0.62 / 0.28 / 0.22 / 0.12）—— v2.1.2 起 scale 上限 1.00，
 *     不再做 >1 外推，避免通道截断与伪色；
 *   · shadowTintOpacity / highlightTintOpacity 乘 scale 后夹 `[0, 0.5]`；
 *   · temperature / tint 乘 scale 后夹 `±0.3`（用户 WB 旋钮另有自己的夹取）；
 *   · vignette 乘 scale 后夹 `0.28`；grain **不缩放**（颗粒由用户档位独立控制）；
 *   · scale 非法（NaN / ±Infinity / ≤ 0）一律回落 0.92（与 `clampIntensityScale`
 *     同一口径 = 默认 rich 档），保证调用方传错不崩；
 *   · 其余字段（id/name/description/dust/lightLeak/mono/timestamp/scene…）原样。
 *
 * 纯函数、**不修改入参**：返回一份新的 `ResolvedFilmPreset`，旧对象可以安全复用
 * （`PRESETS` 经过 `resolvePreset()` 后常被缓存，若原地改会污染下一次渲染）。
 */
export function applyPresetIntensity(
  preset: ResolvedFilmPreset,
  intensityScale: number,
): ResolvedFilmPreset {
  const scale = clampIntensityScale(intensityScale);
  const color = preset.color;

  return {
    ...preset,
    color: {
      ...color,
      temperature: clampSignedIntensity(color.temperature * scale, TEMPERATURE_LIMIT),
      tint: clampSignedIntensity(color.tint * scale, TEMPERATURE_LIMIT),
      sCurveContrast: clampIntensity(color.sCurveContrast * scale, S_CURVE_LIMIT),
      chromaLock: clampIntensity(color.chromaLock * scale, CHROMA_LOCK_LIMIT),
      exposureLift: clampIntensity(color.exposureLift * scale, EXPOSURE_LIFT_LIMIT),
      shadowCrush: clampIntensity(color.shadowCrush * scale, SHADOW_CRUSH_LIMIT),
      shadowTintOpacity: clampIntensity(color.shadowTintOpacity * scale, TINT_LIMIT),
      highlightTintOpacity: clampIntensity(color.highlightTintOpacity * scale, TINT_LIMIT),
    },
    vignette: clampIntensity(preset.vignette * scale, VIGNETTE_LIMIT),
  };
}

/** `applyPresetIntensity` 的引擎硬上限（调用方不应绕过这些数字，探针按它们断值）。 */
export const PRESET_INTENSITY_LIMITS = {
  /** 零模糊 S 曲线上限（旧引擎 0.60，v2.1.0 手术一抬到 0.62）。 */
  sCurveContrast: 0.62,
  /** 曝光提亮上限（不变）。 */
  exposureLift: 0.28,
  /** 色度锁上限（v2.1.0 从 0.68 下调到 0.22）。 */
  chromaLock: 0.22,
  /** 黑位托底上限（v2.1.0 从 0.05 抬到 0.12，TX-400 用 0.10）。 */
  shadowCrush: 0.12,
  /** 化学染色层不透明度上限（v2.1.0 从 0.20 抬到 0.50，九卷用 0.18~0.34）。 */
  tintOpacity: 0.5,
  /** 静态色温 / 色调上限（用户 WB 旋钮量 ±0.30）。 */
  temperature: 0.3,
  /** 暗角上限（不变）。 */
  vignette: 0.28,
} as const;

const S_CURVE_LIMIT = PRESET_INTENSITY_LIMITS.sCurveContrast;
const EXPOSURE_LIFT_LIMIT = PRESET_INTENSITY_LIMITS.exposureLift;
const CHROMA_LOCK_LIMIT = PRESET_INTENSITY_LIMITS.chromaLock;
const SHADOW_CRUSH_LIMIT = PRESET_INTENSITY_LIMITS.shadowCrush;
const TINT_LIMIT = PRESET_INTENSITY_LIMITS.tintOpacity;
const TEMPERATURE_LIMIT = PRESET_INTENSITY_LIMITS.temperature;
const VIGNETTE_LIMIT = PRESET_INTENSITY_LIMITS.vignette;

/** 把缩放后的值夹回 `[0, upper]`（NaN 兜底 0）。 */
function clampIntensity(value: number, upper: number): number {
  if (Number.isNaN(value) || value <= 0) {
    return 0;
  }
  return value > upper ? upper : value;
}

/** 把缩放后的值夹回 `[-upper, upper]`（色温/色调可以负向）。 */
function clampSignedIntensity(value: number, upper: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value > upper) {
    return upper;
  }
  return value < -upper ? -upper : value;
}
