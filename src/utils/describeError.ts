/**
 * 把 `unknown` 异常转成可读文案 —— 全程不用 `any`。
 * JS 里 `throw` 什么都有可能（string / Error / 原生模块的错误对象），
 * 而 TS 的 catch 变量是 `unknown`，所以统一走这里。
 *
 * 拿不到 message 时的兜底文案要翻译：这个函数的返回值会直接显示在"显影失败"面板上，
 * 而它不在 React 树里，所以用 i18n 的树外翻译 `t()`（语言快照由 `useI18n` 同步）。
 */
import { t } from '../i18n';

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || t('common.unknownError');
  }
  if (typeof error === 'string') {
    return error || t('common.unknownError');
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = error as { message?: unknown };
    if (typeof maybeMessage.message === 'string' && maybeMessage.message.length > 0) {
      return maybeMessage.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  if (typeof error === 'symbol') {
    return error.toString();
  }
  return t('common.unknownError');
}
