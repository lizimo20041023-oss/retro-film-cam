/**
 * 日期水印格式化 —— 纯函数，方便单测。
 *
 * 支持的 token：
 *   `YYYY` 四位年 · `YY` 两位年 · `MM` 两位月 · `M` 不补零月 · `DD` 两位日 · `D` 不补零日
 *
 * 示例（2026-10-10）：
 *   'YY MM DD'    → '26 10 10'   ← 经典傻瓜相机液晶
 *   'YY-MM-DD'    → '26-10-10'
 *   'YYYY.MM.DD'  → '2026.10.10'
 *   'YY M D'      → '26 10 10'
 *
 * 替换顺序很重要：先长后短，否则 'YY' 会把 'YYYY' 的前两个字符吃掉。
 */
export function formatTimestamp(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return format
    .replace(/YYYY/g, String(year))
    .replace(/YY/g, pad2(year % 100))
    .replace(/MM/g, pad2(month))
    .replace(/DD/g, pad2(day))
    // 剩下的单字符 token（不补零）
    .replace(/M/g, String(month))
    .replace(/D/g, String(day));
}

/** 补零到两位。 */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
