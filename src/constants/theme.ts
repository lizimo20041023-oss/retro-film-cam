/**
 * 机身视觉常量 —— 取景屏幕、显影遮罩、设置界面共用同一套"墨色"。
 *
 * 为什么单独抽一个文件：设置界面和取景屏幕必须是同一台机器的两块面板，
 * 配色一旦分家，两边就会慢慢漂移成两个 App 的样子。
 */
import { Platform } from 'react-native';

/**
 * UI 专用等宽字体：微标签 / 预设卡 / LCD 状态条 / 设置界面都用它。
 * 刻意不走 `useFilmFonts` —— 那个字体可能被换成七段数码管（中文会缺字），
 * 这里的机器印刷感需要的是"系统等宽 + 宽字距"，不是"德味数码管"。
 */
export const UI_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const INK = {
  /** 暗白 / 微灰：正文与图标 */
  paper: 'rgba(232, 228, 220, 0.92)',
  paperDim: 'rgba(226, 222, 214, 0.42)',
  paperFaint: 'rgba(226, 222, 214, 0.20)',
  /** 琥珀：LCD / 点亮态 / 纸质标签 */
  amber: '#D28B2A',
  amberSoft: '#D39E59',
  amberDeep: '#C27A30',
  hairline: 'rgba(255, 255, 255, 0.07)',
};

/** 机身底色（纯色兜底，皮革 tile 加载不出来时就是它）。 */
export const BODY_COLOR = '#171716';

/** 0.16 → ".16"。LCD 条里的紧凑数值写法（省掉前导 0，一行能多放两个参数）。 */
export function compact(value: number): string {
  return `.${String(Math.round(value * 100)).padStart(2, '0')}`;
}
