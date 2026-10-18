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
 * 水印的**纵向位置**（v1.8.11，用户 m06849 第二条：「设置里水印版式无法改地名/坐标在整幅图里的位置」）。
 *
 * 版式（`WatermarkLayout`）只决定"地名和日期在同一块区域里怎么排"；区域本身以前是**相框写死的**
 * （纸框在相纸下留白、全铺帧在画面内下缘），用户没有任何旋钮。这里补的就是"区域"这一维：
 * - `auto`         跟随相框原有的 `watermark.anchor`（= v1.8.10 及以前的行为，逐字节不变）
 * - `paper`        相纸下留白（纸框才有高度；全铺帧退化成画面下缘）
 * - `photo-top`    照片窗口上缘（压在画面上，ink 自动换成画面上的浅色）
 * - `photo-bottom` 照片窗口下缘（压在画面上，ink 同上）
 *
 * ⚠️ 字符串是真源：持久化字面量 + i18n 键名后缀（`settings.watermarkZone.*`）都靠它，别改。
 */
export type WatermarkZone = 'auto' | 'paper' | 'photo-top' | 'photo-bottom';

/**
 * 水印的**横向对齐**（v1.8.11）。
 * - `auto`   跟随相框 `watermark.align`（= 旧行为）
 * - `left` / `right` 贴左 / 贴右
 * - `center` 居中（`split` 版式会降级成 `stacked`，否则左右分列永远对齐不成居中）
 *
 * ⚠️ 字符串同样是持久化与 i18n 键名（`settings.watermarkAlign.*`）的真源。
 */
export type WatermarkAlign = 'auto' | 'left' | 'center' | 'right';

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
 * 135 底片的齿孔阵列（v1.8.5）。
 *
 * 为什么不再画进 PNG：相框 PNG 是**固定颜色**的，而相纸材质有三档（原白 / 暖黄 /
 * 暗房黑），把齿孔烘进白底 PNG 后，暗房黑那张纸的齿孔就一起变黑了 —— 用户看到的
 * 是"齿孔丢了"。齿孔改由 `FrameSkin` 按这里的参数**程序化**画在相纸图层最上面，
 * 颜色跟着材质走，任何一档纸都能看见洞。
 *
 * 所有尺寸都是**相对相框宽度**的比例（0~1），渲染层再乘 `width` —— 这样同一份数据
 * 在 358pt 预览和 3024px 成片上比例一致。
 */
export interface FrameSprocketSpec {
  /** 齿孔排在**哪两条边**上。135 底片 = 左右两条长边。 */
  side: 'left-right' | 'top-bottom';
  /** 每条边上的齿孔数量（固定数量，不随长宽比变 —— 少一颗多一颗都是穿帮）。 */
  count: number;
  /** 单孔宽 = 相框宽度 × 该比例。 */
  holeWidth: number;
  /** 单孔高 = 相框宽度 × 该比例。 */
  holeHeight: number;
  /** 相邻两孔的中心距 = 孔高 × 该比例（默认 2.0）。 */
  pitchRatio?: number;
  /** 齿孔中心线距纸边 = 相框宽度 × 该比例（默认 0.021）。 */
  insetRatio?: number;
  /** 孔圆角 = 孔高 × 该比例（默认 0.32）。 */
  cornerRatio?: number;
  /** 孔的颜色。默认 `rgba(255,255,255,0.92)`（黑片基上的透明齿孔）。 */
  color?: string;
  /** 孔下方 1px 的描边 / 阴影色，默认 `'rgba(0,0,0,0.18)'`。 */
  shadeColor?: string;
}

/**
 * 相纸的程序化皮肤细节（v1.8.5）。
 *
 * 这些是"相片本身的物理结构"，必须画在相框 PNG **之上**（PNG 只当着色纹理）；
 * 与材质无关的几何数据放这里，材质颜色由 `constants/frameVariants.ts` 决定。
 * 不写 = 不画任何程序化细节（老相框行为不变）。
 */
export interface FrameSkinSpec {
  /** 外框圆角（相框设计像素，短边 358pt 基准，渲染层按短边缩放）。默认 0。 */
  cornerRadius?: number;
  /** 四周 2px 塑料枕形压边：顶/左内缘亮、底/右内缘暗。默认 true。 */
  paddedBevel?: boolean;
  /** 宽下巴上部约 18% 处的药水包横向压痕。默认 true（拍立得系）。 */
  chinCrease?: boolean;
  /** 135 底片齿孔阵列。 */
  sprockets?: FrameSprocketSpec;
  /** 片基上的帧号（如 `'▷ 04A'`），画在左上角。 */
  frameCode?: string;
  /** 帧号颜色，默认 `'rgba(229,169,60,0.88)'`（琥珀）。 */
  frameCodeColor?: string;
  /** 帧号字号 = 相框宽度 × 该比例（默认 0.032）。 */
  frameCodeRatio?: number;
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
  /**
   * 相纸的程序化皮肤细节（v1.8.5）：圆角 / 枕形压边 / 下巴药水包压痕 /
   * 135 齿孔阵列 / 帧号。PNG 退居"着色纹理 + 纸纹"层，这些真实结构由
   * `FrameSkin.tsx` 按本字段画在 PNG 之上。不写 = 不画。
   */
  skin?: FrameSkinSpec;
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
 *
 * v1.9.0（用户 m07595 手术二）起，这套参数描述的是 **5 层同源拍立得光学显影管线**：
 *   base 原图 → 树脂镜微柔焦 → 暗部浓墨重压 → 高光奶油提亮 → 化学冷暖分离 + 四角显影黑角
 * 字段不再是"半透明色纸"的挡位，而是"光学层"的强度：
 *   `lensSoftness` / `shadowCrush` / `highlightBloom` 三层全部由**同一张底片**的
 *   `Image` 副本（blurRadius + mixBlendMode）叠加实现，不做任何像素级 JS 计算。
 */
export interface ColorGradeConfig {
  /** 色温：-1 冷（偏蓝）~ 0 中性 ~ +1 暖（偏橙）。用户色温旋钮直接加减这一项。 */
  temperature?: number;
  /** 色调：-1 品红 ~ 0 中性 ~ +1 偏绿。 */
  tint?: number;
  /**
   * v1.9.0 手术二 · Layer 1 **拍立得树脂镜头微柔焦**：同一张底片的 `Image` 副本
   * `blurRadius={1.2}` 以 normal 混合叠在基底上，opacity = 本值（0.22~0.34）。
   * 作用 = 抹平 iPhone Smart HDR 在树叶/水面/砖墙上的数码锐化白边，还原 Dazz `#Inst C`
   * 的柔润光学肌理。0 = 关（不出图层）。
   */
  lensSoftness?: number;
  /**
   * v1.9.0 手术二 · Layer 2 **暗部浓墨重压**：同一张底片以 'multiply' 自叠
   * （数学上 Y' = Y²），opacity = 本值（0.25~0.55）。
   * 作用 = 把灰蒙蒙的树荫/柏油路/深色车体压成深邃油润的胶片暗部，而不是蒙灰。
   */
  shadowCrush?: number;
  /**
   * v1.9.0 手术二 · Layer 3 **高光奶油提亮 + 溢出**：同一张底片经 `blurRadius={14}`
   * 高斯柔化后以 'screen' 叠加（数学上 Y' = 1-(1-Y)²），opacity = 本值（0.20~0.48）。
   * 作用 = 只提亮高光（白云/白石/水面反光），并在明暗交界产生拍立得奶油 Bloom，
   * 根除"高光发灰发闷"。
   */
  highlightBloom?: number;
  /**
   * Layer 4a **暗部化学偏色**：空串 = 该卷没有这一层。整幅纯色 + `shadowTintBlendMode`。
   * 深普鲁士蓝 / 墨绿 / 暖褐这类相乘色把暗部拉出化学显影的色相分离。
   */
  shadowTint?: string;
  /** 暗部化学偏色的混合模式（缺省 `multiply`；可用 `exclusion` 做轻薄冷调）。 */
  shadowTintBlendMode?: BlendMode;
  /** 暗部化学偏色的不透明度（v1.9.0 值域 0.12~0.28）。 */
  shadowTintOpacity?: number;
  /**
   * Layer 4b **高光/中间调色彩密度**：空串 = 该卷没有这一层。整幅纯色 + `highlightTintBlendMode`。
   * 钴青天空、金色阳光、暖桃肤色、钨丝灯蓝、硬反差红蓝密度都靠这一层。
   */
  highlightTint?: string;
  /** 色彩密度层的混合模式（缺省 `soft-light`；可用 `overlay`/`screen`）。 */
  highlightTintBlendMode?: BlendMode;
  /** 色彩密度层的不透明度（v1.9.0 值域 0.18~0.36）。 */
  highlightTintOpacity?: number;
  /**
   * Layer 4c **暖红光晕（halation）**：一层 `#FF4028` 纯色 'screen'。
   * 渲染不透明度 = clamp01(本值) × 0.18（v1.9.0 上限；CS-800T 这类要浓光晕的卷写 1）。
   * 字段原名 `bloom`，v1.8.5 更名并改语义；v1.9.0 起不再用模糊副本实现，纯色层不铺白。
   */
  halation?: number;
}

/** 填满默认值之后的调色参数。 */
export type ResolvedColorGrade = Required<ColorGradeConfig>;

/**
 * 场景统计（v1.8.11 引入，v1.9.0 手术一重做采集链路）。
 *
 * 来源：**成片链路**在归一化 + 裁切之后，用 `expo-image-manipulator` 原生（C++）
 * 把底片缩到 **64×64 的 JPEG**（compress 0.75），再把这张 ~2 KB 的微型 JPEG
 * （base64）交给 `utils/sceneStats.ts` 的 baseline-JPEG DC 解码器采样（不做 IDCT、
 * 不跑滤镜，一次快门只算一次，单次测光 CPU 必须 < 5 ms）。结果挂在
 * `ResolvedFilmPreset.scene` 上传给 `utils/adaptiveGrade.ts` 做反 HDR 场景策略。
 *
 * ⚠️ 取景器实时预览**没有**这份数据（也不许为了它去解码任何图 —— 发热纪律 v1.8.6），
 * 所以 `scene === undefined | null` 时调色必须逐字节回到静态预设层表。
 *
 * 全部字段都是「测量值」，不在这层做任何补偿；怎么补偿是 `planAdaptiveGrade()` 的事。
 */
export interface SceneStats {
  /** 平均亮度 0~1（BT.601 亮度权重 0.299/0.587/0.114，对 0~255 RGB 归一化）。 */
  meanLuma: number;
  /** 亮度标准差 0~1（场景反差：低 = 平光，高 = 硬光/大光比）。 */
  contrast: number;
  /** 暗部占比 0~1（亮度 < 0.25 的采样块比例）。 */
  shadowShare: number;
  /** 中间调占比 0~1（0.25 ≤ 亮度 < 0.70）。 */
  midShare: number;
  /** 高光占比 0~1（0.70 ≤ 亮度 < 0.995）。 */
  highlightShare: number;
  /** 高光溢出占比 0~1（亮度 ≥ 0.995，即已成片该处是死白）。 */
  clipShare: number;
  /** 色温倾向 -1~1（(meanR-meanB)/(meanR+meanB)，正 = 暖 / 负 = 冷）。 */
  warmth: number;
  /** 绿-品红倾向 -1~1（正 = 偏绿，负 = 偏品红）。 */
  tintBias: number;
  /** 平均饱和度 0~1（mean((max-min)/max)）。 */
  saturation: number;
  /** 实际参与统计的采样块数（≥ 1）。 */
  samples: number;
}


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
  /**
   * 真·黑白（v1.8.5）：合成时在全画面叠一层 `mixBlendMode:'saturation'` +
   * 中性灰 `#808080` 的**满幅实色层**，数学上把每个像素压成纯灰度（保留亮度），
   * 不是半透明灰罩。数据层只写这个开关，怎么画归 `utils/gradeLayers.ts`。
   */
  mono?: boolean;
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
  /** 真黑白开关（见 `FilmPreset.mono`）。 */
  mono: boolean;
  timestamp: ResolvedTimestampConfig;
  showGuide: boolean;
  normalizeMaxLongEdge: number;
  captureLongEdge: number;
  /**
   * 场景统计（v1.8.11 自适应调色）：**只有成片链路**会填 —— `processFilmPhoto` 在裁切后
   * 采样底片、把结果挂到这里，`buildGradeLayers()` 据此补偿白平衡/反差/暗部与高光。
   * 取景器实时预览、`resolvePreset()` 直接产物、18 道零依赖探针都没有它，
   * 缺省（`undefined`）或 `null` = 静态曲线，逐字节回到 v1.8.10 的渲染结果。
   */
  scene?: SceneStats | null;
}

/** 颗粒强度档位 id（数据在 `src/constants/grain.ts`）。 */
export type GrainLevelId = 'off' | 'light' | 'std' | 'heavy' | 'max';

/**
 * 一档颗粒强度 —— 设置页里那排分段按钮的一项。
 *
 * ⚠️ v1.8.3（用户 m01534 · 模块 C1）起，档位**不再乘在预设上**，而是直接给出
 * 颗粒层的**绝对不透明度**（0 / 0.022 / 0.045 / 0.075 / 0.110）。
 * 用户实测"颗粒开起来像脏云雾、整幅画面被灰网盖住"，要求"颗粒整体下调两档、
 * 按这张表锁死、最高封顶 0.11"。所以旧字段 `scale`（0 / 0.45 / 1 / 1.5 / 2.2 的乘积系数）
 * 已被 `opacity` 取代 —— 预设里那点 0.42~0.62 的"底味"不再参与计算，
 * 否则"预设 0.62 × 档位"必然又顶到上限。见 `constants/grain.ts` 顶部说明。
 */
export interface GrainLevel {
  id: GrainLevelId;
  /** 分段按钮上的短标签（1~2 个字，再窄的屏也不会换行）。没有 `labelKey` 时用它。 */
  label: string;
  /** 短标签的翻译键。自己加的档位不写它，就显示 `label` 原文。 */
  labelKey?: MessageKey;
  /** LCD 状态条里的机器打印缩写。 */
  code: string;
  /**
   * 颗粒层**总不透明度**（绝对值，0~0.11）。0 = 关档，整层不渲染。
   * 这是 v1.8.3 用户强制表：0 / 0.022 / 0.045 / 0.075 / 0.110。
   */
  opacity: number;
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
  /**
   * 水印纵向落在哪里（v1.8.11）：`'auto'` = 相框自己决定（旧行为）。
   * 用户在设置里选 `'paper'` / `'photo-top'` / `'photo-bottom'` 时，合成层按它覆盖
   * 默认的 baseline / region（`computeWatermarkPlan` 的 `zone` 参数）。
   */
  watermarkZone?: WatermarkZone;
  /**
   * 水印横向怎么排（v1.8.11）：`'auto'` = 旧行为（split 左地名右日期 / stacked 跟相框 side）。
   * 非 auto 时两行整体贴左 / 居中 / 贴右。
   */
  watermarkAlign?: WatermarkAlign;
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
 * v1.8.5（用户 m02760 · 模块四）起支持**四种**取值：
 * - `zh-Hans` 简体（中国 · 广东 · 梅州）
 * - `zh-Hant` 繁体（中國 · 廣東 · 梅州）
 * - `ja`      日文（日本 · 兵庫県 · 神戸市，`兵庫県/神戸市/東京都` 式后缀）
 * - `en`      英文（MEIZHOU · GUANGDONG · CHINA，唯一允许出现拉丁国名的模式）
 *
 * 中文 / 日文模式下**严禁**输出 CHINA / JPN 等拉丁国名（真机痛点：`梅州，广东，CHINA`）。
 */
export type GeoLocale = 'zh-Hans' | 'zh-Hant' | 'ja' | 'en';

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
 * 光学日期字形档（4 档）。
 *
 * 四档走**同一套 iOS 原生等宽字体 + 三层绝对对齐叠影**（见
 * `components/DateGlyphs.tsx` 的 `OpticalDateText`），v1.8.2 里那两支逐格手绘的
 * 像素字形（7 段 / 点阵）已合并进 `quartz_led`。四档的差别只在**字重、字距、
 * 发光强度**（`constants/dateEngine.DATE_GLYPH_STYLES` 是唯一参数表）：
 * `quartz_led` 石英液晶 / `ccd_osd` CCD 錄製字幕 / `lab_inkjet` 暗房噴墨 /
 * `archival_steel` 檔案鋼印。
 */
export type DateGlyphStyleId =
  | 'quartz_led'
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
  /** 字形风格，默认 `'quartz_led'`（石英液晶，v1.8.2 两支像素字形的合并继承者）。 */
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
  /**
   * 水印**纵向位置**（v1.8.11，用户 m06849 第二条：设置里改不了地名/坐标在整幅图里的位置）。
   *
   *   · `'auto'`（默认）—— 完全交给相框自己决定：纸框印在底边纸上、全铺帧印在照片底部。
   *     这就是 v1.8.10 的行为，升级上来视觉不变；
   *   · `'paper'`    —— 强制纸下巴（无纸的全铺帧退回照片底部，没有纸就没有纸下巴）；
   *   · `'photo-top'` / `'photo-bottom'` —— 印在**画面内**的顶/底（叠在照片上，走 window
   *     锚点的浅色墨水 + 投影，读得清又不抢画面）。
   *
   * 为什么要"纵向"和"横向"拆成两个设置，而不是给八个角各一个档：用户说的痛点是
   * "地名/坐标在整幅图里的位置动不了"，真正需要独立控制的只有**贴哪条边**（纵）和
   * **靠哪边**（横）。两个四档拆开 = 4×4 种落点，但每栏只有四个选项，翻起来不累。
   */
  watermarkZone: WatermarkZone;
  /**
   * 水印**横向对齐**（v1.8.11）：`'auto'`（默认）= 旧行为（split 左地名右日期、
   * stacked 跟相框 side）；`'left'` / `'center'` / `'right'` 把两行整体按这个方向排。
   * `'center'` 时 split 会自动退化成 stacked（左右分列没法居中），理由见 geometry 的
   * `computeWatermarkPlan`。
   */
  watermarkAlign: WatermarkAlign;
  /**
   * 场景自适应调色（v1.8.11，用户 m06849 第一条），默认 **true**。
   *
   * 打开：成片链路会用 `sceneProbe` 采样这张底片的亮度分区/反差/色温/饱和度，
   * 再让 `adaptiveGrade` 在预设曲线之上做**有界**补偿（白平衡、反差、S 曲线、暗部提升、
   * 高光收敛）。关闭：完全不采样、`preset.scene` 为 null，图层栈逐字节回到 v1.8.10。
   *
   * 为什么给一个开关而不是默认强制：自适应是"按这张照片算"，同一卷在不同光线下
   * 出片会有**可控的**差异。老用户如果就是要"支支一模一样"的固定数字，必须能关。
   */
  adaptiveGrade: boolean;
  /** 地名详细度，默认 `'archive'`。只影响 `locationMode === 'place'`。 */
  placeDetail: PlaceDetail;
  /** 颗粒档位（原来在取景器底部那条横向滑块上，现在挪进设置）。 */
  grainLevel: GrainLevelId;
  /**
   * 地名用哪种语言印。**和界面语言刻意分开** —— 界面可以是日语，但地名仍想印简体。
   * `'auto'` = 跟界面语言走：界面语言是 `zh-Hans` / `zh-Hant` / `ja` / `en` 就用它，
   * 只有 `fr` 退回 `'en'`（法语地名没有词表）；日文 v1.8.5 起是一等公民。
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
