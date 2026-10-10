/**
 * 全项目共享类型。
 *
 * 设计原则：
 * - 只有"纯数据"结构，没有类、没有副作用 —— 方便单测，也方便你丢一张 PNG / 改几个数字就扩展。
 * - 不出现 `any`：需要"RN 支持的混合模式"这类联合类型时，直接从 RN 自带类型反推。
 */
import type { ImageSourcePropType, TextStyle, ViewStyle } from 'react-native';

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
 * 一个相框 = 一张透明 PNG + 一个归一化镂空窗口。
 * 新增相框只需要往 `src/constants/frames.ts` 的数组里加一条，核心逻辑一行都不用改。
 */
export interface FrameSpec {
  /** 唯一 id（英文小写短横线），用于持久化 / 调试。 */
  id: string;
  /** 显示名，会出现在切换提示里。 */
  name: string;
  /** 相框 PNG；透明区域 = 照片可见窗口。 */
  source: ImageSourcePropType;
  /** 相框整体宽高比 = 宽 / 高，**必须与 PNG 实际像素比一致**。 */
  aspect: number;
  /** 镂空窗口的归一化位置（0~1，相对相框整体）。 */
  window: NormalizedRect;
  /** 照片填窗口的方式：`cover`（默认，裁切填满）/ `contain`（完整放入，可能留黑边）。 */
  photoFit?: 'cover' | 'contain';
  /** 该相框默认把日期烧在哪（`preset.timestamp.anchor` 优先于它）。 */
  defaultTimestampAnchor?: TimestampAnchor;
  /** PNG 的设计像素尺寸，仅用于文档与自检提示。 */
  designSize?: Size;
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
  /** 自定义字体族：需先用 `useFilmFonts` 加载本地 ttf；不填 = 系统等宽字体兜底。 */
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
  /** null = 用相框的 `defaultTimestampAnchor`。 */
  anchor: TimestampAnchor | null;
  insetRatio: number;
}

/** 一个胶片预设（用户可读可改的原始数据，字段都可选，缺省值见 presets.ts）。 */
export interface FilmPreset {
  id: string;
  name: string;
  description?: string;
  color: ColorGradeConfig;
  /** 颗粒强度 0~1。 */
  grain?: number;
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
  /** 保存前把原图最长边压到多少像素（默认 2048；0 = 跳过归一化）。 */
  normalizeMaxLongEdge?: number;
}

/** 填满默认值之后的预设，合成管线只认这个。 */
export interface ResolvedFilmPreset {
  id: string;
  name: string;
  description: string;
  color: ResolvedColorGrade;
  grain: number;
  vignette: number;
  lightLeak: number;
  lightLeakFlip: boolean;
  timestamp: ResolvedTimestampConfig;
  showGuide: boolean;
  normalizeMaxLongEdge: number;
}

/* ==========================================================================
 * 4. 合成图层（声明式调色）
 * ========================================================================== */

/** 纹理贴图 id。 */
export type TextureId = 'grain' | 'vignette' | 'lightLeak';

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
