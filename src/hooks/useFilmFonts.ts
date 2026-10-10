/**
 * 日期水印用的数码管字体。
 *
 * 核实结论（官方文档）：
 * - Expo Go 里**不能**用 expo-font 的 config plugin 嵌字体 —— 那需要 prebuild / 自定义原生工程；
 * - 只能用运行时 `useFonts()` 加载 ttf/otf；
 * - 没有自定义字体时的兜底：iOS 系统等宽 `'Menlo'`、Android `'monospace'`。
 *   这是"数码管"观感的第一近似，零依赖、零风险。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 想要真·数码管（推荐免费的 DSEG7 / DSEG14，SIL OFL 协议）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 下载 `DSEG7Classic-Bold.ttf`（或 DSEG14）放进 `assets/fonts/`；
 * 2. 把下面 `CUSTOM_FONT` 那一行改成（保留注释掉的示例格式）：
 *      const CUSTOM_FONT = require('../../assets/fonts/DSEG7Classic-Bold.ttf');
 *    ⚠️ 千万别留一个指向**不存在文件**的 require：Metro 打包会直接失败，
 *       所以仓库里默认是 `null`（注释掉）。
 * 3. 热重载后日期就会自动换成数码管字体；想只让某个预设用，改
 *    `preset.timestamp.fontFamily`（会覆盖这里的全局兜底）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useFonts } from 'expo-font';
import { Platform } from 'react-native';
import type { FilmFontsState } from '../types';

/** 自定义字体的家族名（同时是 useFonts 的 key 和 fontFamily 的值）。 */
export const CUSTOM_FONT_FAMILY = 'DSEG7Classic-Bold';

/**
 * 自定义字体资源。
 * `null` = 用系统等宽字体。注意类型标成 `number | null`：RN 里 require 图片/字体返回资源 id。
 */
const CUSTOM_FONT: number | null = null;

/** 系统等宽兜底字体（各平台都有）。 */
export const SYSTEM_MONO_FAMILY =
  Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace';

/** 其它可考虑的系统等宽字体：iOS 'Courier' / 'Courier New'、Android 'monospace'。 */
export const MONO_FALLBACK_HINTS = ['Menlo', 'Courier', 'monospace'] as const;

export function useFilmFonts(): FilmFontsState {
  // 空 map 是安全的（官方 useFonts 支持），加载完 loaded 会变 true
  const [loaded, error] = useFonts(CUSTOM_FONT === null ? {} : { [CUSTOM_FONT_FAMILY]: CUSTOM_FONT });

  const customLoaded = CUSTOM_FONT !== null && loaded && error == null;

  return {
    // ready = 加载结束（成功或失败都算结束，失败就降级用系统字体，不能卡住 UI）
    ready: loaded || error != null,
    customLoaded,
    fontFamily: customLoaded ? CUSTOM_FONT_FAMILY : SYSTEM_MONO_FAMILY,
    source: customLoaded ? 'custom' : 'system',
  };
}
