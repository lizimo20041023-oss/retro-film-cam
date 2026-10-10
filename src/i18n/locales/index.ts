/**
 * 语言清单 —— 加一门语言只需要：① 新建 `xx.ts` ② 在这里 import 并加一行。
 * `tsc` 会逼你把所有键补齐，不会出现"忘翻了所以在界面上是空白"。
 */
import type { LocaleId, LocaleMeta } from '../types';
import { en } from './en';
import { fr } from './fr';
import { ja } from './ja';
import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';

export { en, fr, ja, zhHans, zhHant };

/** 数组顺序 = 设置界面里的显示顺序。 */
export const LOCALES: readonly LocaleMeta[] = [
  { id: 'zh-Hans', label: '简体中文', messages: zhHans },
  { id: 'zh-Hant', label: '繁體中文', messages: zhHant },
  { id: 'ja', label: '日本語', messages: ja },
  { id: 'en', label: 'English', messages: en },
  { id: 'fr', label: 'Français', messages: fr },
];

/**
 * 系统语言不在上面 5 种里时用哪种。
 * 刻意选英文而不是中文：一个德国用户打开 App，英文至少能猜，中文只能卸载。
 */
export const FALLBACK_LOCALE_ID: LocaleId = 'en';

/** 按 id 取语言包；找不到返回 `undefined`（调用方决定兜底策略）。 */
export function findLocale(id: string): LocaleMeta | undefined {
  return LOCALES.find((locale) => locale.id === id);
}

/**
 * 按 id 取语言包，取不到直接抛。
 * 只用于**常量初始化**（列表里声明的 id 一定存在），不用在用户输入路径上。
 */
export function requireLocale(id: LocaleId): LocaleMeta {
  const found = findLocale(id);
  if (!found) {
    throw new Error(`[retro-film-cam] i18n: 未注册的语言 "${id}"`);
  }
  return found;
}

/** 兜底语言包（键齐全，任何键在它这里都能取到）。 */
export const FALLBACK_LOCALE: LocaleMeta = requireLocale(FALLBACK_LOCALE_ID);
