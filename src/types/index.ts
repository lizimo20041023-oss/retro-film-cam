/**
 * 全项目共享类型。
 *
 * 设计原则：
 * - 只有"纯数据"结构，没有类、没有副作用 —— 方便单测，也方便你丢一张 PNG / 改几个数字就扩展。
 * - 不出现 `any`：需要"RN 支持的混合模式"这类联合类型时，直接从 RN 自带类型反推。
 */
import type { ImageSourcePropType, TextStyle, ViewStyle } from 'react-native';
// 只借两个**类型**：显示名怎么翻译、界面语言是谁。`import type` 编译后整行消失，
// 所以 types ↔ i18n 之间不会产生任何运行时循环依赖。
import type { LocaleId, MessageKey } from '../i18n/types';

/* ==========================================================================
 * 1. 基础几何
 * ========================================================================== */

/**
 * RN 支持的混合模式（mixBlendMode）。
 * 用 `ViewStyle['mixBlendMode']` 反推，而不是手写 union：RN 版本升级时自动跟上。
 * 注意：mixBlendMode 只在 New Architecture 生效，而 Expo Go 只跑新架构，所以可用。
 */
export type BlendMode = NonNullable<ViewStyle['mixBlendMode']>;

/** 归一化矩形：0~1，坐标相对"相框 PNG 自身"的左上角。 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 逻辑点尺寸（iOS pt / Android dp）。**不是像素**。 */
export interface Size {
  width: number;
  height: number;
}

/** 绝对矩形（逻辑点，相对"合成舞台"左上角）。 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 文本字重。 */
export type FontWeight = NonNullable<TextStyle['fontWeight']>;

/* ==========================================================================
 * 2. 相框（frames）
 * ========================================================================== */

/**
 * 时间戳锚点：
 * - `window`：烧在照片画面内部右下角（常见于傻瓜相机/数码相机）。
 * - `frame`：烧在相框留白里（拍立得下白边那种）。
 */
export type TimestampAnchor = 'window' | 'frame';

/**
 * 成片水印的四种版式（设置里四选一）。
 *
 * 注意"水印区"是**按相框算出来的一块矩形**：`anchor === 'frame'` 时是整个下留白，
 * `anchor === 'window'` 时是画面内部的下缘。四种版式只是把"地名"和"日期"两块内容
 * 在这块矩形里排成不同样子 —— 所以加版式不用改任何相框，加相框也不用改任何版式。
 *
 * - `split`    地名贴左、日期贴右，同一条基线（默认，最像傻瓜相机的后背印字）
 * - `stacked`  地名在上、日期在下，两行都靠右
 * - `centered` 合成一行 `地名 · 'YY MM DD'`，整行居中
 * - `dateOnly` 只烧日期，靠右（不想暴露位置时用）
 */
export type WatermarkLayout = 'split' | 'stacked' | 'centered' | 'dateOnly';

/**
 * 地名详细度：
 * - `archive` 精简档案风 —— `上海 · CHN`（城市 + 三字母代码，克制）
 * - `full`    完整行政层级 —— `上海市 · 中国`（省/州 + 国家全称）
 */
export type PlaceDetail = 'archive' | 'full';

/**
 * 成片画质档（v1.7.0）。
 *
 * 它不是"相机要拍多大"——iOS 上 `takePictureAsync` 的输出尺寸由
 * `AVCaptureSession.sessionPreset` 决定，expo-camera 57 没有任何接口能改它
 * （详见 `captureQuality.ts` 顶部的长篇说明）。它管的是**合成舞台截屏时要把
 * 成片画到多长边**，也就是 `ResolvedFilmPreset.captureLongEdge` 的取值来源。
 *
 * 三档刻意只差在这一个数上：舞台上的一切（水印字号、相框比例、颗粒强度）
 * 都是逻辑点，成片像素 = 点尺寸 × 缩放，所以画质档只影响清晰度、不影响构图。
 */
export type CaptureQuality = 'standard' | 'high' | 'max';

/**
 * 相框材质变体（v1.8.0）：A 经典原白 / B 岁月暖黄 / C 暗房雅黑。
 *
 * v1.7.0 的 `'classic' | 'aged' | 'doodle'` 已**作废**：`'doodle'`（手绘几何贴纸）
 * 被用户点名删除，取而代之的是三种**真实暗房卡纸材质**（配方见
 * `constants/frameVariants.ts`）。老存储里残留的 `'classic'` / `'aged'` / `'doodle'`
 * 由 `settingsStore` 的白名单兜底成 `'archival'` —— 白名单之外的字符串一律回默认值。
 */
export type FrameVariant = 'archival' | 'baryta' | 'obsidian';

/**
 * 无相框模式的画幅比（v1.8.1）。
 *
 * 用户原话是"照片按当前取景长宽比（1:1 / 3:4 / 3:2）全屏铺展"，所以这是一个**三选一**，
 * 不是连续量：三个值就是三个真正常用的构图比例（正方形 / 竖 4:3 / 横 3:2）。
 *
 * ⚠️ 字符串是**真源**：它同时是持久化进 `settingsStore` 的字面量、i18n 键名后缀
 * （`frame.noFrame.aspect11` / `.aspect34` / `.aspect32`）与 `NO_FRAME_ASPECTS` 里的
 * `id`。改这里的字符串 = 老存档回落默认值 + 三个语言包键名全部失配，别改。
 */
export type NoFrameAspect = '1:1' | '3:4' | '3:2';

/**
 * 相框自带的水印偏好。
 *
 * 为什么水印样式挂在**相框**上而不是预设上：纸是什么颜色、留白多宽、有没有印字，
 * 是相框的物理属性；同一张相框换任何胶卷，该给它配什么墨色都不变。
 */
export interface FrameWatermarkStyle {
  /** 烧在照片画面内（`window`）还是相框留白里（`frame`）。 */
  anchor: TimestampAnchor;
  /**
   * 墨色：
   * - `amber`    经典橙色点阵液晶，`#FF8A00`；
   * - `graphite` 极细灰色打字机体，给拍立得/幻灯卡这类"下巴默认纯留白"的相框用。
   */
  tone?: 'amber' | 'graphite';
  /** 水印区里贴哪一边（`anchor === 'frame'` 时才有意义）。 */
  align?: 'left' | 'right';
  /** 强制大写（打字机体英文小字）。 */
  uppercase?: boolean;
}

/**
 * 相框的**横向变体**：同一款相框在横拍时改用的那一套 PNG + 窗口。
 *
 * 为什么需要它：窗口的宽高比是钉死的（拍立得是正方形、135 是 3:2），
 * 把一张横照片 `cover` 进竖版窗口会切掉两边大半，把竖照片硬塞进横版窗口同理。
 * 与其在合成时做几何体操，不如让相框自己提供一套横版 PNG —— 纸还是那张纸，
 * 只是转了个方向。
 */
export interface FrameOrientationVariant {
  /** 横向相框 PNG。 */
  source: ImageSourcePropType;
  /** 横向 PNG 的整体宽高比（宽 / 高），**必须与 PNG 实际像素比一致**。 */
  aspect: number;
  /** 横向 PNG 里的镂空窗口（归一化，相对横向 PNG 整体）。 */
  window: NormalizedRect;
  /** 横向 PNG 的设计像素尺寸，仅用于文档与自检提示。 */
  designSize?: Size;
}

/**
 * 一个相框 = 一张透明 PNG + 一个归一化镂空窗口。
 * 新增相框只需要往 `src/constants/frames.ts` 的数组里加一条，核心逻辑一行都不用改。
 */
export interface FrameSpec {
  /** 唯一 id（英文小写短横线），用于持久化 / 调试。 */
  id: string;
  /** 显示名。没有 `nameKey` 时它就是最终显示的文字。 */
  name: string;
  /**
   * 显示名的翻译键。有它时界面显示 `t(nameKey)`，否则原样显示 `name`。
   *
   * 内置相框都带键（界面得跟着语言走）；**你自己加的相框只写 `name` 就够了** ——
   * 五种语言里都显示你写的那句原文。这是刻意的：配置文件不该逼你同时改 5 个语言包。
   */
  nameKey?: MessageKey;
  /**
   * 顶栏徽标上的**相框代号**：纯 ASCII 大写短名，例如 `'INSTANT SQ'` /
   * `'INSTANT MINI'` / `'135 NEG'` / `'SLIDE'`。
   *
   * 它**不翻译**，和胶卷预设的 `RT-400` / `PR-400` 是同一类东西 ——
   * 机器印在机身和片基上的代号，五种语言里都该长一样。
   * 顶栏那枚胶囊徽标显示的就是 `▌ {code} · {n}/{N}`。
   *
   * ⚠️ **不许写厂商商标**：这个字符串会渲染在用户看得见的顶栏徽标上，把别人的
   * 注册商标当成自己 App 的画幅名是最弱的用法（完整理由见 `src/constants/frames.ts`）。
   * 只描述**介质与画幅**：`INSTANT SQ` = 一次成像方形、`INSTANT MINI` = 一次成像迷你。
   * 长度也有预算 —— 见 `FrameBadge` 的 `maxWidth: '42%'` 那段核算。
   */
  code: string;
  /** 相框 PNG；透明区域 = 照片可见窗口。 */
  source: ImageSourcePropType;
  /** 相框整体宽高比 = 宽 / 高，**必须与 PNG 实际像素比一致**。 */
  aspect: number;
  /** 镂空窗口的归一化位置（0~1，相对相框整体）。 */
  window: NormalizedRect;
  /** 照片填窗口的方式：`cover`（默认，裁切填满）/ `contain`（完整放入，可能留黑边）。 */
  photoFit?: 'cover' | 'contain';
  /**
   * **无相框纯净全屏**（v1.8.1）：这张"相框"其实没有纸 —— 照片铺满整个画布，
   * 不画卡纸 PNG、不画皮肤、不留白边、不烧纸面铭文。
   *
   * 语义只此一条，渲染层与几何层都只读它：
   *   · `window` 必须是 `{ x: 0, y: 0, width: 1, height: 1 }`（铺满自己的画布）；
   *   · 画幅比不写死在 `aspect` 里，由 `resolveFrame(frame, aspect)` 按用户在设置里
   *     选的那一档（`NoFrameAspect`）现算 —— 见 `constants/frames.ts` 的 `resolveFrame`；
   *   · `computeFrameLayout` 因此给出 `window === { 0, 0, layout.width, layout.height }`、
   *     `bottomStripHeight === 0`、`rightMargin === 0`（白边/下巴的概念不存在）。
   *
   * 不写 = 普通相框（有纸）。**渲染层遇到它必须整组早退**：相纸 `Image`、`FrameSkin`、
   * 以及"取景器相纸外的幕布"都不许画（幕布是 100% 不透明的，画了会把预览涂成黑屏）。
   */
  fullBleed?: boolean;
  /**
   * 该相框默认的水印样式。`preset.timestamp.anchor` 只覆盖它的 `anchor`，
   * 墨色 / 对齐 / 大写始终听相框的。
   */
  watermark?: FrameWatermarkStyle;
  /** PNG 的设计像素尺寸，仅用于文档与自检提示。 */
  designSize?: Size;
  /**
   * 横拍变体。**当前不可达**：`geometry.ts` 的 `resolveFrameOrientation()` 自 v1.6.0 起
   * 恒返回 `'portrait'`（理由写在那边的注释里 —— 横版 PNG 是把竖版纸整体转 90° 生成的，
   * 窗口跟着转，导致画面被挤到纸的一侧），所以 `frameSourceOf()` 永远给竖版 `source`。
   *
   * 字段与 4 款已有变体**仍然保留**：将来若真为横构图独立设计横版纸，只要把那一个开关
   * 改回按比例判就能重新启用这条路径。**不要**为了让它们"活起来"去改 `frameSourceOf`
   * 或绕过 `resolveFrameOrientation`。
   * 不写 = 这款相框本来就只有竖版（`fp100c`）。
   */
  landscape?: FrameOrientationVariant;
  /** 一句话说明。 */
  description?: string;
}

/** 计算后的相框排版，全部是逻辑点。 */
export interface FrameLayout {
  /** 相框整体尺寸（= 合成舞台尺寸）。 */
  width: number;
  height: number;
  aspect: number;
  /** 照片窗口（相对舞台左上角）。 */
  window: Rect;
  /** 窗口下沿 → 相框底边的高度（拍立得下白边、35mm 黑边靠它定位）。 */
  bottomStripHeight: number;
  /** 窗口右沿 → 相框右边距。 */
  rightMargin: number;
}

/** 时间戳排版（相对舞台左上角）。 */
export interface TimestampLayout {
  right: number;
  bottom: number;
  fontSize: number;
  letterSpacing: number;
}

/**
 * 定位水印排版。
 * 和日期**共用同一条基线**（`bottom` 相同），但贴左边 —— 右下角归日期、
 * 左下角归地名/坐标，两者永远不会撞在一起，也不用为"谁更长"做避让。
 */
export interface LocationLayout {
  left: number;
  bottom: number;
  fontSize: number;
  letterSpacing: number;
}

/* ==========================================================================
 * 3. 预设（presets）
 * ========================================================================== */

/**
 * 调色参数。每个值都有"中性点"，中性点 = 不产生任何图层 = 零开销。
 * 具体映射见 `src/utils/gradeLayers.ts` 顶部注释。
 */
export interface ColorGradeConfig {
  /** 色温：-1 冷（偏蓝）~ 0 中性 ~ +1 暖（偏橙）。 */
  temperature?: number;
  /** 色调：-1 品红 ~ 0 中性 ~ +1 偏绿。 */
  tint?: number;
  /** 饱和度：0 灰度 ~ 1 原样 ~ 2 浓艳。 */
  saturation?: number;
  /** 对比度：0 平 ~ 1 原样 ~ 2 硬。 */
  contrast?: number;
  /** 褪色：0 无 ~ 1 极重（只抬黑场，模拟过期胶片）。 */
  fade?: number;
  /** 曝光：-1 压暗 ~ 0 原样 ~ +1 提亮。 */
  exposure?: number;
  /**
   * 分离色调：0 无 ~ 1 极强。暗部压成青蓝、高光提成暖白，中间调基本不动。
   * 这是"数码味 → 胶片味"最有效的一层，老 CCD 小 DC 尤其明显。
   */
  splitTone?: number;
  /**
   * 光晕 / 泛光：0 无 ~ 1 极强。把画面自身的亮部模糊后叠回去，
   * 模拟高光在胶片乳剂层里散射（halation）。
   */
  bloom?: number;
}

/** 填满默认值之后的调色参数。 */
export type ResolvedColorGrade = Required<ColorGradeConfig>;

/** 日期水印配置。 */
export interface TimestampConfig {
  /** 是否烧录日期。 */
  enabled: boolean;
  /**
   * 格式串，支持 token：`YYYY` `YY` `MM` `M` `DD` `D`。
   * 例：`'YY MM DD'` / `'YY-MM-DD'` / `'YYYY.MM.DD'` / `'YY M D'`。
   */
  format?: string;
  /** 颜色，经典橙色液晶为 `'#FF8A00'`。 */
  color?: string;
  /** 字号 = 照片窗口宽度 × 该比例（默认 0.055）。 */
  fontSizeRatio?: number;
  /** 字距 = 字号 × 该比例（默认 0.14，数码管建议留大一点）。 */
  letterSpacingRatio?: number;
  /** 是否加同色辉光（液晶背光感）。 */
  glow?: boolean;
  /** 字重，默认 `'700'`。 */
  fontWeight?: FontWeight;
  /**
   * 自定义字体族。**v1.4.1 起不要再用了** —— 自定义字体这条路已经拆掉
   * （见 `src/hooks/useFilmFonts.ts` 顶部：Metro 只认静态 `require`，字体没 link 进
   * 原生工程时 iOS 取不到字形，而日期是成片上的字、印错不可撤销）。
   * 留字段是为了不改老预设的数据，填了也会被系统等宽字体覆盖。
   */
  fontFamily?: string;
  /** 覆盖相框自带的锚点。 */
  anchor?: TimestampAnchor;
  /** 距照片窗口右下角的留白 = 相框宽度 × 该比例（默认 0.028）。 */
  insetRatio?: number;
}

/** 填满默认值之后的日期水印配置。 */
export interface ResolvedTimestampConfig {
  enabled: boolean;
  format: string;
  color: string;
  fontSizeRatio: number;
  letterSpacingRatio: number;
  glow: boolean;
  fontWeight: FontWeight;
  /** null = 用系统等宽字体兜底。 */
  fontFamily: string | null;
  /** null = 用相框的 `watermark.anchor`。 */
  anchor: TimestampAnchor | null;
  insetRatio: number;
}

/** 一个胶片预设（用户可读可改的原始数据，字段都可选，缺省值见 presets.ts）。 */
export interface FilmPreset {
  id: string;
  name: string;
  description?: string;
  color: ColorGradeConfig;
  /**
   * 颗粒强度 0~1。
   *
   * **全项目只有一种颗粒：单色亮度颗粒。** 每个像素只取一个灰度随机标量，
   * 同一个偏量同时加到 R / G / B 上（`assets/textures/grain.png` 三通道逐像素恒等）。
   * 曾经还有一个 `grainChroma`（预烘焙的品红↔绿块状彩噪贴图），
   * 它会在 CCD / DIGI 两款上糊出满屏紫绿斑点，已彻底删除 —— **不要再加回来**。
   */
  grain?: number;
  /** 灰尘与划痕强度 0~1（胶片扫描件的"不干净"感）。 */
  dust?: number;
  /** 暗角强度 0~1。 */
  vignette?: number;
  /** 漏光强度 0~1。 */
  lightLeak?: number;
  /** 漏光左右翻转（同一张贴图出两种效果）。 */
  lightLeakFlip?: boolean;
  /** 日期水印配置（部分覆盖默认值）。 */
  timestamp?: Partial<TimestampConfig>;
  /** 取景器是否显示九宫格 + 水平仪。 */
  showGuide?: boolean;
  /** 保存前把原图最长边压到多少像素（默认 0 = 不压缩，直接用相机原图）。 */
  normalizeMaxLongEdge?: number;
  /**
   * 成片长边目标像素数（默认 2048）；0 = 用屏幕原生分辨率。
   * 见 `presets.ts` 里 `PRESET_DEFAULTS.captureLongEdge` 的说明。
   */
  captureLongEdge?: number;
}

/** 填满默认值之后的预设，合成管线只认这个。 */
export interface ResolvedFilmPreset {
  id: string;
  name: string;
  description: string;
  color: ResolvedColorGrade;
  grain: number;
  dust: number;
  vignette: number;
  lightLeak: number;
  lightLeakFlip: boolean;
  timestamp: ResolvedTimestampConfig;
  showGuide: boolean;
  normalizeMaxLongEdge: number;
  captureLongEdge: number;
}

/** 颗粒强度档位 id（数据在 `src/constants/grain.ts`）。 */
export type GrainLevelId = 'off' | 'light' | 'std' | 'heavy' | 'max';

/**
 * 一档颗粒强度 —— 设置页里那排分段按钮的一项。
 *
 * 注意它**不覆盖**预设的 grain，而是**乘上去**（见 `constants/grain.ts` 顶部说明），
 * 这样每个预设的颗粒性格都还在，只是整体浓淡可拧。
 */
export interface GrainLevel {
  id: GrainLevelId;
  /** 分段按钮上的短标签（1~2 个字，再窄的屏也不会换行）。没有 `labelKey` 时用它。 */
  label: string;
  /** 短标签的翻译键。自己加的档位不写它，就显示 `label` 原文。 */
  labelKey?: MessageKey;
  /** LCD 状态条里的机器打印缩写。 */
  code: string;
  /** 乘在预设 `grain` 上的系数。0 = 关，1 = 预设原本的量。 */
  scale: number;
  /** 一句话说明，写在配置里方便日后改。 */
  description: string;
}

/* ==========================================================================
 * 4. 合成图层（声明式调色）
 * ========================================================================== */

/**
 * 纹理贴图 id。
 *
 * **只有这四种。** 曾经有一个 `'chromaNoise'`（预烘焙的品红↔绿块状彩噪），
 * 它是满屏紫绿伪色的唯一来源，已连同 `assets/textures/chroma-noise.png` 一起删除。
 * 颗粒只能走 `'grain'`，而 `grain.png` 的三通道逐像素恒等 —— 这就是"绝无红绿紫伪色"的保证。
 */
export type TextureId = 'grain' | 'dust' | 'vignette' | 'lightLeak';

/** 纹理铺法：`repeat` 平铺（颗粒）/ `stretch` 拉伸（暗角、漏光）。 */
export type TextureResizeMode = 'repeat' | 'stretch';

/**
 * 一个合成图层。
 * `FilmCompositor` 只按 `kind` 渲染，完全不认识"胶片预设"这个概念 ——
 * 所以任何调色参数都只是"多一个图层"，不需要改渲染代码。
 */
export type GradeLayer =
  | {
      kind: 'color';
      /** 稳定 key，用作 React key 与调试标识。 */
      key: string;
      /** 人肉可读的说明，出问题时一眼看出是哪一层。 */
      label: string;
      color: string;
      blendMode: BlendMode;
      opacity: number;
    }
  | {
      kind: 'photo';
      key: string;
      label: string;
      /** 用原照片自身再叠一层（自叠 = 提对比度）。 */
      blendMode: BlendMode;
      opacity: number;
      /**
       * 高斯模糊半径（逻辑点）。RN 的 `<Image blurRadius>` 在 iOS 上是**真的**把
       * UIImage 模糊掉（`node_modules/react-native/Libraries/Image/RCTImageView.mm:158`
       * 的 `setBlurRadius:` → `RCTBlurredImageWithRadius`），不是即时滤镜、
       * 也不是 `UIVisualEffectView` 那种背景采样 —— 所以它**能被 captureRef 截进成片**，
       * 这正是微柔焦（去数码锐化）需要的那一层。
       *
       * ⚠️ v1.6.0 时代 `gradeLayers.ts` 顶部写着"RN 的 Image 没有 blurRadius"，
       * 那句是错的（v1.8.0 核实并订正），别再照着它绕路。
       */
      blurRadius?: number;
      /** 叠图偏移（逻辑点）。微柔焦要的"向右下 0.5px"就靠它。 */
      offsetX?: number;
      offsetY?: number;
    }
  | {
      kind: 'texture';
      key: string;
      label: string;
      textureId: TextureId;
      resizeMode: TextureResizeMode;
      blendMode: BlendMode;
      opacity: number;
      /** 水平镜像（漏光换边）。 */
      flipX?: boolean;
    };

/** 纹理贴图的注册信息。 */
export interface TextureSpec {
  id: TextureId;
  name: string;
  source: ImageSourcePropType;
  defaultResizeMode: TextureResizeMode;
  /** 替换规范提示。 */
  note: string;
}

/* ==========================================================================
 * 5. 拍摄 → 显影 → 保存 流程
 * ========================================================================== */

/** `takePictureAsync` 的原始结果（只保留管线需要的字段）。 */
export interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** 归一化（缩小到 maxLongEdge）之后的结果。 */
export interface NormalizedPhoto extends CapturedPhoto {
  /** 是否真的做了缩放；false = 原图直接透传。 */
  resized: boolean;
  /** 未缩放的原因，便于排查。 */
  note?: string;
}

/** 显影阶段，用于 UI 文案。 */
export type DevelopStage = 'normalizing' | 'capturing' | 'saving';

/** 拍摄流程状态机。 */
export type DevelopStatus =
  | { kind: 'idle' }
  | { kind: 'developing'; stage: DevelopStage }
  | { kind: 'done'; uri: string; saved: boolean }
  | { kind: 'error'; message: string };

/** 合成视图需要的一切数据（宿主把它渲染成 `<FilmCompositor />`）。 */
export interface FilmStageInput {
  /** 已归一化的原图 uri。 */
  rawUri: string;
  /** 排版结果。 */
  layout: FrameLayout;
  /** 已填满默认值的预设。 */
  preset: ResolvedFilmPreset;
  /** 相框。 */
  frame: FrameSpec;
  /** 拍摄时间（烧进照片的日期）。 */
  capturedAt: Date;
  /**
   * 定位水印那一行字（例如 `'上海市 · 中国'` / `'31.230°N 121.474°E'`）。
   * `null` / 不填 = 这次不烧定位 —— 拍照前没拿到定位时就是这个样子。
   */
  locationText?: string | null;
  /**
   * 结构化地名。**有它时合成层自己按当前语言渲染**（这样切换语言后旧照片也能重排），
   * 只有 `locationText` 没有它时才回退成"直接印那一行字"。
   */
  place?: ResolvedPlace | null;
  /**
   * 拍这张照片时的**界面语言**。合成层用它把 `place` 拼成那一行字
   * （中文写「上海市 · 中国」、英文写 `SHANGHAI · CHN`）。
   * 不填 = 合成层按简体中文渲染，宁可有一个确定的行为，也不要半对的状态。
   */
  locale?: LocaleId;
  /** 水印版式（四选一）。不填 = `'split'`。 */
  watermarkLayout?: WatermarkLayout;
  /** 地名详细度。不填 = `'archive'`。 */
  placeDetail?: PlaceDetail;
  /**
   * 这一卷拍到第几张（1 起数），给"关闭定位时代替地名那一行"的摄影代号用：
   * `PR-400 // ISO 400 · 35MM · EXP.07`。
   * 不填 = 不印 `EXP.` 段，只印 `PR-400 // ISO 400 · 35MM`。
   */
  exposureIndex?: number;
  /**
   * **重曝**的第二张原片 uri。有它时合成层把两张在**同一个画面窗口内**叠起来
   * （上面那张的透明度由 `overlayOpacity` 决定），然后整条调色 / 颗粒 / 相框管线
   * 作用在**合成结果**上 —— 等价于在底片上叠两次曝光，物理上是对的。
   *
   * 为什么不先合成再交给管线：那样就得再截一次图、多一轮编解码，
   * 而且两张的颗粒会各自独立、叠完还是"两张数码图"，不像同一次曝光。
   */
  overlayUri?: string | null;
  /** 重曝上面那张的不透明度（0~1），不填 = 0.5。只有 `overlayUri` 有值时才有意义。 */
  overlayOpacity?: number;
}

/**
 * 反查出来的结构化地名。
 *
 * 为什么不在 hook 里就拼成一整行字符串：地名要跟**当前界面语言**走
 * （中文写「上海市 · 中国」、英文写「Shanghai · CHN」），而照片可能是在另一种
 * 语言下拍的。存结构、渲染时才拼，语言一换旧照片也能重排。
 */
export interface ResolvedPlace {
  /** 城市 / 一级地名，例如 `'上海市'`、`'Shanghai'`。 */
  city: string;
  /** 省 / 州 / 大区，例如 `'上海市'`、`'California'`。拿不到就空串。 */
  region: string;
  /** 国家或地区的本地语言名，例如 `'中国'`。 */
  country: string;
  /** ISO 3166-1 alpha-2 代码，例如 `'CN'`、`'TW'`、`'HK'`、`'MO'`。 */
  countryCode: string;
  /** 已格式化好的经纬度，例如 `'31.230°N 121.474°E'`。纯离线算的。 */
  coords: string;
}

/**
 * "合成舞台"宿主：负责把 `<FilmCompositor />` 挂到屏幕上的某处，并提供截图能力。
 *
 * 为什么用这种依赖注入而不是直接在管线里 captureRef：
 * 1. 要截图的视图必须**真的被渲染在屏幕上**（离屏 / opacity:0 的视图在 iOS 上截出来是空的），
 *    所以"渲染"这件事必须由 UI 层（`useFilmStage`）负责；
 * 2. `processFilmPhoto` 因此不依赖任何原生模块，单测时传一个假 host 即可。
 */
export interface FilmStageHost {
  /** 请求 UI 层挂载合成视图。 */
  mount(input: FilmStageInput): void;
  /** 请求 UI 层卸载。 */
  unmount(): void;
  /** 视图完成布局 **且** 所有图片解码完成后 resolve（UI 层在 onLayout / onLoad 里触发）。 */
  whenReady(): Promise<void>;
  /** 截取合成视图，返回临时文件 uri。 */
  capture(): Promise<string>;
}

/** 成片信息。 */
export interface ProcessedPhoto {
  /** 成片临时文件 uri（系统可能清理，务必另存或马上写入相册）。 */
  uri: string;
  /** 合成舞台的逻辑尺寸（pt）。 */
  width: number;
  height: number;
  /** 设备像素比。captureRef 未传 width/height，所以输出像素 = 逻辑尺寸 × pixelRatio。 */
  pixelRatio: number;
  pixelWidth: number;
  pixelHeight: number;
  frameId: string;
  presetId: string;
  /** 烧进照片里的那个日期。 */
  capturedAtIso: string;
  /** 归一化后的原图 uri（调试用）。 */
  rawUri: string;
  durationMs: number;
  /**
   * 实际生效的调色图层说明（例如 `['色温 暖 0.28', '提对比度 1.12', '颗粒 0.16']`）。
   * 改预设后对不上预期时，看这个数组最快。
   */
  layers: string[];
  /** 非致命问题，例如"归一化失败已退回原图"。 */
  warnings: string[];
}

/** 写入相册的结果。 */
export type SaveFailureReason =
  /** 用户拒绝相册写入权限。 */
  | 'permission-denied'
  /** 当前 expo-media-library 版本没有可用的保存 API。 */
  | 'unsupported-api'
  /** 调用抛错。 */
  | 'failed';

export type SaveOutcome =
  | { ok: true; uri: string }
  | { ok: false; reason: SaveFailureReason; message: string };

/* ==========================================================================
 * 6. 用户设置（持久化在 AsyncStorage，见 `src/utils/settingsStore.ts`）
 * ========================================================================== */

/**
 * 界面语言偏好。`'auto'` = 跟随系统；其余值必须和 `src/i18n/locales/index.ts`
 * 里注册的 id 一一对应（`LocaleId` 就是 `Exclude<LocalePreference, 'auto'>`）。
 */
export type LocalePreference = 'auto' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'en' | 'fr';

/**
 * **地名**用的语言，只影响逆地理编码拼出来的那一行字。
 *
 * 为什么和界面语言分开：界面可以是日语，但用户可能就想要地名的英文拼写；
 * 反过来界面是英文、地名想印中文也合理。所以这是一个独立设置项。
 *
 * 只有三种取值 —— 地名要么印中文（简/繁），要么印拉丁字母，中间态没有意义。
 */
export type GeoLocale = 'zh-Hans' | 'zh-Hant' | 'en';

/**
 * 定位水印模式：
 * - `off`    不写定位（**默认**，即使用户给了权限也要他主动开）；
 * - `place`  写地名（城市 · 国家），走系统反查，苹果/谷歌会联网解析；
 * - `coords` 写经纬度，纯离线计算，不联网也不上传。
 */
export type LocationMode = 'off' | 'place' | 'coords';

/* ==========================================================================
 * 4.5 全能复古日期/时间烙印引擎（v1.8.0，模块四）
 * ========================================================================== */

/**
 * 日期格式化档（13 档，最后一个是"不烧日期"）。
 *
 * 每一档对应 `utils/formatTimestamp.ts` 里一条**模板串**，由那套 token 引擎渲染：
 * 支持 `YYYY YY MM M DD D HH mm ss MMM W`，模板里可以出现任意字面量
 * （`年` `月` `日` `.` `/` `:` 空格 `'`）并逐字输出。
 *
 * `MMM`（英文月份三字母）与 `W`（英文星期三字母）**刻意不跟界面语言走**：
 * 真石英机背/点阵后背印的就是英文缩写，而且这样 13 档格式化不需要 13 组 i18n 词条。
 */
export type DateFormatId =
  | 'MM_DD_YY'
  | 'YY_MM_DD'
  | 'DD_MM_YY'
  | 'DAY_HH_MM'
  | 'YY_MM_DD_TIME'
  | 'YYYY_DOT_MM_DD'
  | 'YYYY_SLASH_TIME'
  | 'ENG_MMM_DD_YY'
  | 'YYYY_MM_DD_WEEK'
  | 'CJK_KANJI'
  | 'EXIF_TECH'
  | 'FRAME_DATE'
  | 'OFF';

/**
 * 硬件视觉渲染风格（5 档）。
 *
 * 前两档是**手绘几何字形**：`led_7seg` 用 7 段数码管笔画、`led_dot_matrix` 用 5×7
 * 针式圆点矩阵，两者都由纯 `View` 摆出来（不依赖任何字体、不依赖 react-native-svg），
 * 所以任何机型、任何语言下字形都逐像素一致。后三档是文本 + 不同的机器外观。
 */
export type DateGlyphStyleId =
  | 'led_7seg'
  | 'led_dot_matrix'
  | 'ccd_osd'
  | 'lab_inkjet'
  | 'archival_steel';

/**
 * 烙印机位（8 档）：画内 6 + 相纸白边 2。
 *
 * - `in_*` 六个机位把日期烧在**照片画面内部**，后缀是"贴哪一角 + 竖排还是横排"：
 *   `in_bl_v` 左下竖排（90°，Dazz 经典同款）/ `in_bl_h` 左下横排 /
 *   `in_br_h` 右下横排 / `in_br_v` 右下竖排 / `in_tr_v` 右上竖排 /
 *   `in_cb_h` 画面底部居中横排。
 * - `strip_*` 两个机位把日期放在**相纸白边**：`strip_split` 下巴左右分列
 *   （左地名·右日期）、`strip_center` 居中一体式。
 *
 * **协同规则**（由 `FilmCompositor.planWatermark` 执行）：日期一旦印在画内，
 * 白边下巴就**只印地名**，绝不重复印日期。
 */
export type DateStampSpot =
  | 'in_bl_v'
  | 'in_bl_h'
  | 'in_br_h'
  | 'in_br_v'
  | 'in_tr_v'
  | 'in_cb_h'
  | 'strip_split'
  | 'strip_center';

/** 发光色（5 档）：珊瑚暖红 / 钨丝琥珀橙 / 香槟金 / 千禧绿 / 赛博青。 */
export type DateGlowId =
  | 'coral_red'
  | 'classic_amber'
  | 'warm_gold'
  | 'ccd_green'
  | 'cyber_cyan';

/**
 * 日期引擎的四个轴。**是全局设置，不挂在预设上** ——
 * 它回答的是"我这台机器装了什么后背"，和装什么胶卷无关。
 */
export interface DateEngineConfig {
  /** 格式化档，默认 `'MM_DD_YY'`（美式 `10  17  '26`）。 */
  format: DateFormatId;
  /** 字形风格，默认 `'led_7seg'`。 */
  glyphStyle: DateGlyphStyleId;
  /** 烙印机位，默认 `'strip_split'`（= v1.7.0 的白边下巴左右分列，升级上来视觉不变）。 */
  spot: DateStampSpot;
  /** 发光色，默认 `'classic_amber'`（钨丝琥珀橙 = `#FF8A00`，与 v1.6.1 同色）。 */
  glow: DateGlowId;
}

/** 全部用户设置。**加字段必须同步改 `settingsStore.ts` 的默认值**。 */
export interface AppSettings {
  locale: LocalePreference;
  locationMode: LocationMode;
  /** 成片水印版式（四选一），默认 `'split'`。 */
  watermarkLayout: WatermarkLayout;
  /** 地名详细度，默认 `'archive'`。只影响 `locationMode === 'place'`。 */
  placeDetail: PlaceDetail;
  /** 颗粒档位（原来在取景器底部那条横向滑块上，现在挪进设置）。 */
  grainLevel: GrainLevelId;
  /**
   * 地名用哪种语言印。**和界面语言刻意分开** —— 界面可以是日语，但地名仍想印简体。
   * `'auto'` = 跟界面语言走：界面语言是 `zh-Hans` / `zh-Hant` / `en` 就用它，
   * 其余（ja / fr）退回 `'en'`，因为反查回来的行政名在日法两种语言下没有可靠的对应词表。
   */
  geoLocale: GeoLocale | 'auto';
  /**
   * 成片画质档（v1.7.0），默认 `'standard'`。只决定成片长边像素，不改构图。
   * 三档取值与内存代价见 `constants/captureQuality.ts`。
   */
  captureQuality: CaptureQuality;
  /**
   * 相框材质变体，默认 `'archival'`。**全局一份**，不是"每款相框各记一份"：
   * 用户滑到"暖黄"是想看所有相框暖黄起来的样子，而不是给五款相框维护五份记忆。
   */
  frameVariant: FrameVariant;
  /**
   * 无相框模式（`00 NO FRAME`）的画幅比，默认 `'3:4'`。
   *
   * 为什么是一个设置项而不是固定值：无相框时**没有纸**，画幅比就没有物理依据了 ——
   * 纸的窗口比例是相框数据的一部分（拍立得是 1:1、135 是 3:2），而无相框只剩"用户
   * 想拍成什么形状"。所以它归设置，和"这台机器装着什么相框"分开：切回有纸的相框时
   * 这个值原样留着，下次再切回 `00` 还是同一档。
   *
   * 只在 `frame.fullBleed === true` 时被 `resolveFrame` 读取（普通相框完全不受影响）。
   */
  noFrameAspect: NoFrameAspect;
  /**
   * 日期烙印引擎（v1.8.0）：格式 / 字形 / 机位 / 发光色四个轴，默认值见
   * `DateEngineConfig` 的字段注释与 `settingsStore.DEFAULT_SETTINGS`。
   */
  dateEngine: DateEngineConfig;
}

/** 写字机里定位这一格的状态（只影响 LCD 显示，不影响能否拍照）。 */
export type LocationStampState =
  | { kind: 'off' }
  | { kind: 'locating' }
  | { kind: 'ready'; text: string }
  | { kind: 'error'; reason: LocationFailureReason };

/** 定位失败的原因，UI 层再翻译成文案。 */
export type LocationFailureReason =
  /** 系统"定位服务"总开关没开。 */
  | 'services-off'
  /** 用户拒绝了权限（或拒绝且不再询问）。 */
  | 'denied'
  /** 有权限但拿不到坐标 / 反查失败 / 超时。 */
  | 'failed';

/** 取一次定位水印的结果。 */
export type LocationStampOutcome =
  /** `text` 给 LCD 状态条直接显示；`place` 给成片水印按语言重排。 */
  | { ok: true; text: string; place: ResolvedPlace }
  | { ok: false; reason: LocationFailureReason };

/** 字体就绪状态。 */
export interface FilmFontsState {
  /** `useFonts` 是否已经跑完（无论有没有自定义字体）。 */
  ready: boolean;
  /** 自定义 ttf 是否真的加载成功。 */
  customLoaded: boolean;
  /** 最终要用的字体族名。 */
  fontFamily: string;
  /** 字体来源，写进 UI/日志便于排查。 */
  source: 'custom' | 'system';
}
