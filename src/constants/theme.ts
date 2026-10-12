/**
 * 机身视觉常量 —— 取景屏幕、设置界面、相册共用同一套"墨色"。
 *
 * 为什么单独抽一个文件：设置界面和取景屏幕必须是同一台机器的两块面板，
 * 配色一旦分家，两边就会慢慢漂移成两个 App 的样子。
 *
 * ---- v1.4.0：从"模块级常量"改成 `useTheme()` ----
 *
 * 以前这里是一组 `export const`，几十个组件在**模块作用域**就
 * `StyleSheet.create({ color: INK.paper })` —— 那等于把颜色烧死在模块加载那一刻，
 * 系统切换深浅色时一行都不会变。要让机身跟着系统走，只能把这些值挪进组件里，
 * 而组件里能拿到的只有 hook。所以：
 *
 * - `useTheme()` 是**新的唯一正路**；
 * - `INK` / `BODY_COLOR` 仍然导出，值等于**深色**那一套，只为还没迁移的组件兜底，
 *   新代码不要再引它们（`grep -n "INK\\." src` 的剩余命中都是待迁移项）。
 *
 * 两套机身：
 * - 深色 = **暗夜黑钛**：机身 #151518、琥珀 #E5A93C 指示；
 * - 浅色 = **经典徕卡银**：机身 #E5E5E2、炭黑蚀刻刻度、朱红 #D32F2F 指示灯。
 */
import { Platform, useColorScheme } from 'react-native';

/**
 * UI 专用等宽字体：微标签 / 预设卡 / 设置界面都用它。
 * 刻意不走 `useFilmFonts` —— 那个字体可能被换成七段数码管（中文会缺字），
 * 这里的机器印刷感需要的是"系统等宽 + 宽字距"，不是"德味数码管"。
 */
export const UI_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export interface ThemeInk {
  /** 主文字与图标 */
  paper: string;
  /** 次要说明 */
  paperDim: string;
  /** 分隔线级别的极淡内容 */
  paperFaint: string;
  /**
   * 指示色。深色机身下是琥珀橙，浅色机身下是朱红。
   * 名字保留 `amber` 是历史原因 —— 它一直是"这台机器上唯一会发光的东西"。
   */
  amber: string;
  amberSoft: string;
  amberDeep: string;
  /** 面板上的 1px 描边 */
  hairline: string;
}

export interface Theme {
  scheme: 'dark' | 'light';
  /** 机身底色（皮革 tile 加载不出来时的兜底）。 */
  body: string;
  /** 浮在机身上的面板底色（右下角状态条、抽屉、卡片）。 */
  panel: string;
  /** 全屏遮罩：盖住取景器时用。它必须**接近不透明**，否则会透出实时预览。 */
  scrim: string;
  /** 磨砂胶囊 / 次级按钮的底。 */
  glass: string;
  glassBorder: string;
  /** 对焦方框与对焦脉冲。两套机身都用真黄 —— 它是"相机在看你"的信号，不该跟着机身变色。 */
  focus: string;
  /** 曝光滑块的轨道色。 */
  sliderTrack: string;
  ink: ThemeInk;
}

/** 深色 = 暗夜黑钛。 */
const DARK_INK: ThemeInk = {
  paper: 'rgba(232, 228, 220, 0.92)',
  paperDim: 'rgba(226, 222, 214, 0.42)',
  paperFaint: 'rgba(226, 222, 214, 0.20)',
  amber: '#E5A93C',
  amberSoft: '#D39E59',
  amberDeep: '#C27A30',
  hairline: 'rgba(255, 255, 255, 0.07)',
};

/** 浅色 = 经典徕卡银：刻度是蚀刻出来的炭黑，唯一亮起来的是朱红指示灯。 */
const LIGHT_INK: ThemeInk = {
  paper: 'rgba(28, 28, 30, 0.92)',
  paperDim: 'rgba(38, 38, 41, 0.52)',
  paperFaint: 'rgba(38, 38, 41, 0.26)',
  amber: '#D32F2F',
  amberSoft: '#C0524F',
  amberDeep: '#A82626',
  hairline: 'rgba(0, 0, 0, 0.10)',
};

export const DARK_THEME: Theme = {
  scheme: 'dark',
  body: '#151518',
  panel: '#101013',
  scrim: 'rgba(14, 15, 17, 0.985)',
  glass: 'rgba(255, 255, 255, 0.08)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  focus: '#FFD60A',
  sliderTrack: 'rgba(255, 255, 255, 0.55)',
  ink: DARK_INK,
};

export const LIGHT_THEME: Theme = {
  scheme: 'light',
  body: '#E5E5E2',
  panel: '#F2F2EF',
  /**
   * 浅色机身下遮罩也必须是浅的 —— 遮罩底下压着的是设置/相册面板，
   * 面板文字已经是炭黑，配一块深色遮罩就成了深底黑字。
   * 「挡住取景器」靠的是 0.98 的不透明度，不是靠颜色深浅。
   */
  scrim: 'rgba(237, 236, 232, 0.985)',
  glass: 'rgba(0, 0, 0, 0.06)',
  glassBorder: 'rgba(0, 0, 0, 0.10)',
  focus: '#FFC400',
  sliderTrack: 'rgba(0, 0, 0, 0.45)',
  ink: LIGHT_INK,
};

/**
 * 当前机身。
 *
 * `useColorScheme()` 在 iOS 上返回 `'light' | 'dark' | null`；`null`（取值失败 /
 * 老系统）按深色处理 —— 这个 App 的主场景本来就是暗房，深色是安全的那一侧。
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? LIGHT_THEME : DARK_THEME;
}

/** 不依赖 hook 的取法，给 `Alert` 之类没有组件上下文的地方用。 */
export function themeFor(scheme: 'dark' | 'light' | null | undefined): Theme {
  return scheme === 'light' ? LIGHT_THEME : DARK_THEME;
}

/**
 * @deprecated 旧名。值等于深色那一套，只为还没迁移的组件兜底。
 * 新代码一律 `const { ink } = useTheme();`
 */
export const INK = DARK_INK;

/** @deprecated 旧名，等于深色机身底。新代码用 `useTheme().body`。 */
export const BODY_COLOR = DARK_THEME.body;

/** 0.16 → ".16"。LCD 条里的紧凑数值写法（省掉前导 0，一行能多放两个参数）。 */
export function compact(value: number): string {
  return `.${String(Math.round(value * 100)).padStart(2, '0')}`;
}
