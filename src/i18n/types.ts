/**
 * i18n 的类型层。
 *
 * 键名不是手写的 union，而是**从简体中文母本反推**出来的：
 * `zh-Hans.ts` 加了 `'foo.bar': '...'`，这里立刻就有 `'foo.bar'` 了。
 * 另外 4 个语言文件声明成 `Messages`，少一句 `npm run typecheck` 就报错。
 */
import type { LocalePreference } from '../types';
import { zhHans } from './locales/zh-Hans';

/** 全部文案键（由母本推导，全项目唯一来源）。 */
export type MessageKey = keyof typeof zhHans;

/** 一份完整字典：每个键都必须有。 */
export type Messages = Record<MessageKey, string>;

/** 占位符实参，例如 `t('lcd.location.on', { value: '上海' })`。 */
export type TranslateParams = Record<string, string | number>;

/** 翻译函数。`key` 拼错、占位符名写错，tsc 都能查出来。 */
export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;

/** 具体语言 id（不含 `'auto'`）。 */
export type LocaleId = Exclude<LocalePreference, 'auto'>;

export interface LocaleMeta {
  id: LocaleId;
  /**
   * 语言**自己**的名字，永远不参与翻译。
   * i18n 常识：语言列表里的一行必须是"用这门语言写的"，否则找不到中文界面的日本用户
   * 会在 `Chinese (Simplified)` 和 `Français` 之间瞎猜。
   */
  label: string;
  messages: Messages;
}
