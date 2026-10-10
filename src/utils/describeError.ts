/**
 * 把 `unknown` 异常转成可读文案 —— 全程不用 `any`。
 * JS 里 `throw` 什么都有可能（string / Error / 原生模块的错误对象），
 * 而 TS 的 catch 变量是 `unknown`，所以统一走这里。
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || '未知错误';
  }
  if (typeof error === 'string') {
    return error || '未知错误';
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
  return '未知错误';
}
