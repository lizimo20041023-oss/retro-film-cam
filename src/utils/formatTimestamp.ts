/**
 * 日期水印的格式化 —— 纯函数，方便单测。
 *
 * 支持的 token：
 *   `YYYY` 四位年 · `YY` 两位年 · `MM` 两位月 · `M` 不补零月 · `DD` 两位日 · `D` 不补零日
 *
 * 示例（2026-10-10）：
 *   'YY MM DD'    → '26 10 10'   ← 经典傻瓜相机液晶（默认）
 *   'YY-MM-DD'    → '26-10-10'
 *   'YYYY.MM.DD'  → '2026.10.10'
 *   'YY M D'      → '26 10 10'
 *
 * 替换顺序很重要：先长后短，否则 'YY' 会把 'YYYY' 的前两个字符吃掉。
 */
import type { LocaleId } from '../i18n/types';

/**
 * 合成一行用的「中点 + 窄空格」。
 *
 * 为什么不是普通的 `' · '`：`centered` 版式整行居中，普通空格在这个字号下
 * 会让中点和两侧文字显得松散；窄空格（U+2009）在 iOS / Android 的等宽字体里
 * 都有真实字宽，紧一档但不粘连，和底片边缘的时间戳观感一致。
 *
 * 用 `\u2009` 转义而不是直接打一个窄空格字符：后者在编辑器里和普通空格无法区分，
 * 以后有人"顺手格式化"就会把它吃掉。
 */
const THIN_SPACE = '\u2009';
const CENTERED_SEPARATOR = `${THIN_SPACE}·${THIN_SPACE}`;

/** 英文界面下罗马字地名的额外字距倍数（见 `timestampTracking`）。 */
const ENGLISH_TRACKING_SCALE = 1.65;

/**
 * 把"地名"和"日期"合成一行：`上海 · CHN · 26 10 10`。
 *
 * 只给 `centered` 版式用（其它三种版式里两者各自成段，不拼字符串）。
 * 地名缺失时**只返回日期**，不会留下一个孤零零的分隔符。
 *
 * 单位：无（纯字符串）。
 */
export function joinPlaceAndDate(placeText: string, dateText: string): string {
  const place = placeText.trim();
  const date = dateText.trim();
  if (place.length === 0) {
    return date;
  }
  if (date.length === 0) {
    return place;
  }
  return `${place}${CENTERED_SEPARATOR}${date}`;
}

/**
 * 版式 / 语言 / 墨色三者决定的**排版提示**。
 *
 * 为什么不把大写和字距直接焊进 `computeWatermarkPlan`：
 * 它们由「相框要求 `uppercase` · 语言（英文要宽字距）· 墨色（打字机体要窄字距）」
 * 三个互不相干的输入交叉决定，散在版式计算里必然写漏一种组合。
 * 收成一张表、返回一个提示对象，几何那边只负责**乘上去**。
 */
export interface StampTracking {
  /**
   * 是否强制大写。
   *
   * 只有相框声明了 `watermark.uppercase`、**且当前是拉丁文字界面**时才为真：
   * 对 `'上海市'` 调 `toUpperCase()` 是空操作，但中文界面下"预期大写"这件事本身
   * 就不该成立，交出一个诚实的 `false` 比交出一个碰巧无害的 `true` 好。
   */
  uppercase: boolean;
  /** 字距倍数：直接乘在预设的 `letterSpacingRatio` 上。1 = 不动。 */
  letterSpacingScale: number;
}

/**
 * 排版提示。
 *
 * - 英文界面里地名是罗马字，全大写的短词需要**明显加宽**才像液晶印字（×1.65），
 *   中文地名加宽只会散架，所以中文一律 ×1；
 * - 打字机体（`graphite`）本来就比点阵液晶小一圈，字距再收紧一档才不显松散。
 *
 * 单位：`letterSpacingScale` 是无量纲倍数。
 */
export function timestampTracking(
  locale: LocaleId,
  graphite: boolean,
  frameUppercase: boolean,
): StampTracking {
  const wide = locale === 'en' ? ENGLISH_TRACKING_SCALE : 1;
  return {
    uppercase: frameUppercase && locale === 'en',
    letterSpacingScale: graphite ? wide * 0.78 : wide,
  };
}

/** 补零到两位。 */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** 日期文字。`format` 为空串时返回空串（调用方据此决定"这次不烧日期"）。 */
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
