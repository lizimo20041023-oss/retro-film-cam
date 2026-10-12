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

/**
 * `centered` 版式里"文字 · 日期"之间的分隔符。
 *
 * 为什么导出：日期改走七段数码管之后，那一行要拆成「文字片段」和「数码管片段」
 * 两次渲染（见 `geometry.ts` 的 `WatermarkLine.quartz`），分隔符得由几何层拼在文字尾巴上，
 * 不能再把两者先粘成一整串。
 */
export const CENTERED_SEPARATOR = `${THIN_SPACE}·${THIN_SPACE}`;

/** 英文界面下罗马字地名的额外字距倍数（见 `timestampTracking`）。 */
const ENGLISH_TRACKING_SCALE = 1.65;

/**
 * 把"地名"和"日期"合成一行：`上海 · CHN · 26 10 10`。
 *
 * ⚠️ 成片水印**已经不走它了**：日期换成七段数码管之后，`centered` 那一行是
 * 「文字 + 分隔符」与「数码管」两个独立片段（见 `geometry.ts` 的 `WatermarkLine.quartz`）。
 * 留在这里是给"要一整行字符串"的调用方（LCD、导出、日志）用的，
 * 分隔符和 `CENTERED_SEPARATOR` 共用同一个常量，形状不会漂。
 *
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

/**
 * 石英后背（Quartz Date）的固定字模：`'YY  MM  DD`。
 *
 * - 最前面那个单引号是**真实字符**，它是石英后背上的"年"标记（不是引号语法糖）；
 * - 年月日之间是**两个空格**：一个空格在 10pt 这个字号下分不开组；
 * - 它就是一个普通的 `format` 掩码 —— 非 token 字符原样保留，所以它走的是同一套替换逻辑。
 */
export const QUARTZ_DATE_FORMAT = "'YY  MM  DD";

/**
 * 石英后背日期：`'26  10  12`。
 *
 * 和 `formatTimestamp(date, format)` 的关系（两者并存，都在用）：
 * - `formatTimestamp` 是**通用**文本日期，预设 `timestamp.format` 想印什么都行，
 *   相机页 LCD 上的日期预览也还是它；
 * - `formatQuartzDate` 是**成片水印专用**的固定字模。为什么不由预设决定格式：
 *   这一行是成片右下角那个"石英后背"，格式换了整行的宽度、分组读法就全变了，
 *   而宽度是 `dateStampWidth()` 提前算死给排版用的。它内部就是
 *   `formatTimestamp(date, QUARTZ_DATE_FORMAT)`，不是第二套实现。
 *
 * ⚠️ 名字里的 "Quartz" 留着了（改它会牵动 `geometry.ts` / `FilmCompositor.tsx`
 * 好几处，收益只是好看一点）。但要说清楚：**它现在印的是等宽粗体，不是七段数码管**——
 * 七段那套在 v1.4.1 已经删掉，理由见 `src/components/DateStamp.tsx` 顶部。
 */
export function formatQuartzDate(date: Date): string {
  return formatTimestamp(date, QUARTZ_DATE_FORMAT);
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
