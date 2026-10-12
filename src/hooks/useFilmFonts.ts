/**
 * 日期水印用的等宽字体。
 *
 * ── 为什么这里**不再**加载任何第三方字体（v1.4.1 的核心改动）────────────────────
 * 老版本留了一条"把 `CUSTOM_FONT` 换成一份 ttf 就能上数码管字体"的口子。这条路已经
 * 被证明只有坏处：
 *
 * 1. **它没有任何兜底**。Metro 只认静态 `require`，字体一旦没被 link 进原生工程，
 *    iOS 就取不到字形 —— 画面上会掉成一串方框 / 虚线。而日期是**成片上的字**，
 *    印错的那张照片是不可撤销的，用户往往几天后翻相册才发现。
 * 2. **它从来就不是乱码的原因**。工程里 `CUSTOM_FONT` 一直是 `null`，
 *    一次 ttf 都没加载过；日期的字形也不是字体给的，是 `SegmentDate` 用 `View` 手绘的。
 *    真正的病因是**字号**：v1.4.0 按"画布短边 2%"把日期收口到 8pt 之后，七段管的管高
 *    只剩 6pt，竖段 0.74pt **比段厚 0.84pt 还短**，整串退化成横虚线（详见
 *    `src/components/DateStamp.tsx` 顶部的推导）。换字体的处方治不了这个病。
 *
 * 所以现在只剩一条路：**系统内置的等宽粗体**。
 * - iOS：`CourierNewPS-BoldMT` —— Courier New Bold 的 PostScript 名，iOS 3.0 起自带，
 *   **不可能加载失败**（它不是"有没有 link 进来"的问题，是系统字体表里的一项）。
 * - Android：`monospace`（Roboto Mono / Droid Sans Mono）。
 *
 * 两边都是 **0.6 em 等宽**，所以 `geometry.ts` 里那条宽度公式不需要分平台 ——
 * 这也是这个选择的一个隐性好处：算出来的宽度在 iOS 和 Android 上逐点相同。
 * 将来要换字体（或换字重），**必须先确认新字体也是 0.6 em**，否则宽度会对不上。
 */
import { Platform } from 'react-native';
import type { FilmFontsState } from '../types';

/** 日期用的等宽字体族。两平台都是 0.6 em 等宽。 */
export const DATE_MONO_FAMILY =
  Platform.select({ ios: 'CourierNewPS-BoldMT', android: 'monospace', default: 'monospace' }) ?? 'monospace';

/**
 * 旧名字，保留是为了不动 `CameraScreen` / `GalleryScreen` 的调用点。
 *
 * 两个名字现在指同一个值 —— 但**语义不同**：`DATE_MONO_FAMILY` 说的是"日期用哪个族"，
 * `SYSTEM_MONO_FAMILY` 说的是"没有自定义字体时的兜底"。自定义字体这条路已经拆了，
 * 于是两者重合。新代码请用 `DATE_MONO_FAMILY`。
 */
export const SYSTEM_MONO_FAMILY = DATE_MONO_FAMILY;

/**
 * 仍然是 hook（而不是一个常量导出），因为两个调用点都是
 * `const fonts = useFilmFonts(); ... fontFamily={fonts.fontFamily}`。
 *
 * `ready` 恒为 `true`：系统字体从第一帧就在，没有任何异步加载需要等 ——
 * 这也顺手消掉了"字体没加载完时日期空一拍"的概率。
 * `source` 恒为 `'system'`，留着是为了让调试面板还能区分"字体来自哪"。
 */
export function useFilmFonts(): FilmFontsState {
  return { ready: true, customLoaded: false, fontFamily: DATE_MONO_FAMILY, source: 'system' };
}
