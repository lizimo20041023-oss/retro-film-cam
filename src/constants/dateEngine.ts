/**
 * 日期烙印引擎（v1.8.0 模块四）—— 13 格式 × 4 光学字形 × 5 发光色，
 * 加上"三层绝对对齐叠影"的**层配方**。纯数据 + 纯函数，`import` 里没有 `react-native`，
 * 也没有 React：探针脚本可以 `transpileModule` 之后直接跑（和 `watermarkTypography.ts` 同规矩）。
 *
 * ── 这个文件回答三个问题 ──────────────────────────────────────────────────────
 * 1. **印什么**：`DATE_FORMAT_TEMPLATES`（13 档模板串）+ `formatWithDateEngine()` 的 token 引擎；
 * 2. **怎么发光**：`DATE_GLOW_PALETTE`（5 档四层色）+ `hazeSpread()/hazeLayers()` 的**有界**扩散；
 * 3. **每一档长什么样 / 多宽**：`DATE_GLYPH_STYLES`（4 档字重·字距·发光强度）+
 *    `dateEngineTextWidth()`；三层叠影的实际绘制在 `DateGlyphs.tsx` 的 `OpticalDateText`，
 *    但"字号从哪来"唯一地从 `canvasBase.absoluteFontPx()` 换算，这里只负责把两侧接上。
 *
 * ── 为什么不在这里算坐标 ──────────────────────────────────────────────────────
 * 8 机位的坐标归 `geometry.resolveDateSpot()`（geo-stamp 写域）。这个文件只产出
 * "文本要多宽、光要扩多远"，一个字的位置都不碰 —— 当年水印漂移就是因为
 * 排版层和渲染层各算一遍宽度，两边慢慢就散了。
 */

import type { DateFormatId, DateGlowId, DateGlyphStyleId, DateStampSpot } from '../types';
import { DATE_DESIGN_PX, absoluteFontPx } from './canvasBase';

// ─────────────────────────────────────────────────────────────────────────────
// 一、13 档格式：模板串 + token 引擎
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 13 档格式的**模板串**（唯一产地）。
 *
 * 模板里可以是任意字面量（空格 `.` `/` `:` `'` `年`），token 只认
 * `YYYY YY MM M DD D MMM W HH mm ss` 这几种。替换**长 token 优先**，
 * 否则 `MMM` 会被 `MM` 先吃掉、`YYYY` 会被 `YY` 咬掉前两位。
 *
 * ## 空格为什么是两个
 * 石英后背（`'26  10  12`）上分组之间是**两个空格**：一个空格在这个字号下分不开组，
 * 整串看上去是一条糊在一起的亮线。这条规矩从 v1.4.0 的 `QUARTZ_DATE_FORMAT`
 * 一路沿用到这里，用户给的两个样例也都是双空格：
 * `MM_DD_YY → 10  17  '26`、`DAY_HH_MM → 17  01:39`。
 *
 * ## 两种分组风格（有意为之，不是笔误）
 * - **双空格**（`MM_DD_YY` / `YY_MM_DD` / `DD_MM_YY` / `DAY_HH_MM` / `YY_MM_DD_TIME`）：
 *   用户逐字给定的石英机背排版，必须逐字命中；
 * - **紧凑标点**（`.` `/` `:` `-`）：带标点的档位如 `YYYY.MM.DD` 里再塞双空格会变成
 *   `2026.  10.  17`，点和空格挤在一起非常脏，所以这几档标点两侧**不留空格**。
 *
 * `MMM`（英文月份三字母）与 `W`（英文星期三字母）**刻意不跟界面语言走**：
 * 真机背印的就是英文缩写，而且这样 13 档格式化不需要 13 组 i18n 词条（见 `types/index.ts`
 * 上 `DateFormatId` 的注释）。
 */
/**
 * 转义符。
 *
 * 为什么必须有它：模板是**掩码**，字面量里只要出现 token 的首字母（`M` 最阴险——
 * 任何英文单词里的 M 都会变成月份）就会被吃掉。`FRAME_DATE` 的字面前缀 `FRAME`
 * 就撞上了：`M` → 月份，于是 `FRAME` 渲染成 `FRA10E`。
 *
 * 规则：`\` 后面的**一个字符**原样输出，不参与 token 匹配。`\\` 输出一个反斜杠。
 * 为什么不用"双写"或"引号包裹"那种转义：单个反斜杠是最不容易和日期本身的字符
 * （`'`、`.`、`:`、`/`、`-`）混淆的写法，而且 `\` 在日期串里本来就是非法字符。
 */
const ESCAPE = '\\';

/**
 * token 的所有可能首字符：只有它们需要转义（其余字符天然是字面量）。
 *
 * ⚠️ 这个集合**内联写出**，不写成 `DATE_TOKEN_ORDER.map(t => t[0])`：
 * `DATE_FORMAT_TEMPLATES` 在模块顶层就调用了 `escapeTemplateLiteral()`，
 * 而 `DATE_TOKEN_ORDER` 声明在它下面 —— 引用它会撞上暂时性死区
 * （`ReferenceError: Cannot access 'DATE_TOKEN_ORDER' before initialization`）。
 * 探针里有一条断言把这个集合与 `DATE_TOKEN_ORDER` 的首字符集逐项核对，
 * 所以"内联"不会带来分叉风险。
 */
const TOKEN_INITIALS = new Set(['Y', 'M', 'D', 'W', 'H', 'm', 's']);

/**
 * 把一段**字面量**转义成"走 `renderDateTemplate` 时原样输出"的写法。
 *
 * 13 档模板里凡是含英文单词的字面量（目前只有 `FRAME_DATE` 的 `FRAME`）都必须过它，
 * 否则某一天改词就会静默变成一串数字。探针逐档断言"渲染结果里含预期字面量"。
 */
export function escapeTemplateLiteral(literal: string): string {
  let out = '';
  for (const ch of literal) {
    // 反斜杠自己也要转义，否则 `\F` 后面跟着的字符会被吃掉
    out += ch === ESCAPE || TOKEN_INITIALS.has(ch) ? ESCAPE + ch : ch;
  }
  return out;
}

export const DATE_FORMAT_TEMPLATES: Record<DateFormatId, string> = {
  /** 美式石英机背：`10  17  '26`（用户原话样例一）。 */
  MM_DD_YY: "MM  DD  'YY",
  /** 欧式年打头：`26  10  17`。 */
  YY_MM_DD: 'YY  MM  DD',
  /** 欧式日打头：`17  10  26`。 */
  DD_MM_YY: 'DD  MM  YY',
  /** 日 + 时刻：`17  01:39`（用户原话样例二）。 */
  DAY_HH_MM: 'DD  HH:mm',
  /** 年月日 + 时刻：`26  10  17  01:39`。 */
  YY_MM_DD_TIME: 'YY  MM  DD  HH:mm',
  /** 档案点分：`2026.10.17`。 */
  YYYY_DOT_MM_DD: 'YYYY.MM.DD',
  /** 档案斜分带秒（EXIF 风格的时间）：`2026/10/17 01:39`。 */
  YYYY_SLASH_TIME: 'YYYY/MM/DD HH:mm',
  /** 英文月份：`OCT 17  '26`。 */
  ENG_MMM_DD_YY: "MMM DD  'YY",
  /** 年月日 + 星期：`2026 10 17 SAT`。 */
  YYYY_MM_DD_WEEK: 'YYYY MM DD W',
  /** 汉字档：`2026年10月17日`（用户 §原文的写法）。 */
  CJK_KANJI: 'YYYY年M月D日',
  /** 技术档：`2026:10:17 01:39:07`。 */
  EXIF_TECH: 'YYYY:MM:DD HH:mm:ss',
  /**
   * 画幅档：`FRAME 2026-10-17`。
   *
   * ⚠️ 字面量 `FRAME` **必须转义**（`\M`）：不转义的话那个 `M` 会被当成月份 token，
   * 渲染成 `FRA10E 2026-10-17`。这里不写字面反斜杠，而是过 `escapeTemplateLiteral()`，
   * 让"哪些字符需要转义"由 token 表决定 —— 以后加了新 token（比如 `YYY`、`EEE`），
   * 这个字面量会自动跟着转义，不需要有人记得回来手改。
   */
  FRAME_DATE: `${escapeTemplateLiteral('FRAME')} YYYY-MM-DD`,
  /** 关掉日期烙印。模板是空串，`formatWithDateEngine` 会返回空串。 */
  OFF: '',
};

/**
 * 英文月份缩写（`MMM`）。索引 = 月份 − 1。
 *
 * 定长 3 字母是刻意的：`May` / `June` 的全称会让**同一档格式的宽度随月份变化**，
 * 而宽度是排版层提前算死、渲染层照抄的（见 `WatermarkQuartz` 的契约）——
 * 宽度一浮动，靠右的那一行就会某一月突然被裁掉一个字母。
 */
export const MONTH_ABBREV: readonly string[] = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * 英文星期缩写（`W`）。索引 = `Date.getDay()`（0 = 周日）。
 *
 * 和 `MONTH_ABBREV` 同理：三字母定长，宽度不随星期变化。
 */
export const WEEKDAY_ABBREV: readonly string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** 补零到两位（与 `formatTimestamp.pad2` 同一个语义，这里留一份免得循环依赖）。 */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * **token 优先级顺序**（长 token 必须排在前面）。
 *
 * 这张表只表达一件事：站在模板的同一个位置，**哪个 token 先被试**。
 * `renderDateTemplate()` 从左到右扫一遍模板，每个位置按本表顺序贪心取第一个命中的 token，
 * 取到就吃掉并前进它的长度（见那个函数的注释：早期"逐个 token 全局替换"的写法
 * 会把替换结果当模板继续换，`DEC` 里的 `W` 被当成星期缩写）。
 * 所以它是"优先级表"，不是"轮次表"：
 * - `YYYY` 在 `YY` 之前：否则位置 0 会先命中 `YY`，`YYYY` 变成 `2626`；
 * - `MMM` 在 `MM` 之前：否则 `MMM` 只会被吃掉前两个字符，`OCT` 变成 `10M`；
 * - `MM` 在 `M` 之前、`DD` 在 `D` 之前、`HH` 在 `mm` 之前：同理（大写 `MM` 与
 *   小写 `mm` 是两个不同 token，不会互相抢）。
 *
 * ⚠️ 不许把这里换成"一次正则 + 回调"：token 之间有**前缀包含**关系
 * （`Y` ⊂ `YY` ⊂ `YYYY`，`M` ⊂ `MM` ⊂ `MMM`），正则的 alternation 按最长匹配走，
 * 而"最长匹配"这件事必须由**这个数组的顺序**显式表达出来，否则以后有人加
 * `YYYYY`（五位年）时会静默错位。
 */
export const DATE_TOKEN_ORDER: readonly string[] = [
  'YYYY',
  'YY',
  'MMM',
  'MM',
  'M',
  'DD',
  'D',
  'W',
  'HH',
  'mm',
  'ss',
];

/**
 * 把一个 `Date` 按模板串渲染成字符串。**这是日期文本的唯一产出点。**
 *
 * 未命中任何 token 的字面量原样保留（`'` 不是转义符，它就是石英机背上那个"年"标记，
 * 见 `QUARTZ_DATE_FORMAT`）。
 *
 * ── 实现是**一次从左到右的贪心最长匹配**，不是"逐个 token 全局替换" ──────────
 * 这一点踩过真坑：早期写法是 `out = out.split(token).join(value)` 按
 * `DATE_TOKEN_ORDER` 轮着跑一遍。它会把**替换结果里的字符**当成模板继续换 ——
 * `W`（星期缩写）那一轮会把上一个 token 产出的 `DEC` 里的 `W` 换成 `SUN`，
 * 于是 `ENG_MMM_DD_YY` 渲染成 `31EC 31  '26`；`FRAME_DATE` 里的字面量 `FRAME`
 * 也会被 `M` 吃掉变成 `FRA12E`。字面量必须是字面量，产出必须是产出。
 *
 * 贪心最长匹配：站在每个位置，按 `DATE_TOKEN_ORDER` 的顺序试着匹配，
 * 第一个匹配上的就吃掉并前进它的长度 —— 顺序表只表达"优先级"，不再承担"轮次"。
 *
 * `\` 转义（见 `ESCAPE`）：`\M` 原样输出 `M`，不参与匹配。字面量里的英文单词必须靠它
 * 才能活下来（`FRAME_DATE` 的 `FRAME`）。
 */
export function renderDateTemplate(date: Date, template: string): string {
  if (template.length === 0) {
    return '';
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  const values: Record<string, string> = {
    YYYY: String(year),
    YY: pad2(year % 100),
    MMM: MONTH_ABBREV[month - 1] ?? '',
    MM: pad2(month),
    M: String(month),
    DD: pad2(day),
    D: String(day),
    W: WEEKDAY_ABBREV[date.getDay()] ?? '',
    HH: pad2(hour),
    mm: pad2(minute),
    ss: pad2(second),
  };

  let out = '';
  let i = 0;
  while (i < template.length) {
    // 转义：吃掉一个字符原样输出，**不参与 token 匹配**
    if (template[i] === ESCAPE) {
      out += i + 1 < template.length ? template[i + 1] : ESCAPE;
      i += 2;
      continue;
    }
    let matched = false;
    for (const token of DATE_TOKEN_ORDER) {
      const value = values[token];
      if (value === undefined) {
        continue;
      }
      if (template.startsWith(token, i)) {
        out += value;
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += template[i];
      i += 1;
    }
  }
  return out;
}

/**
 * 按引擎配置把时刻渲染成要烙印的那串字。
 *
 * `format === 'OFF'` 时返回**空串**（不是 `null`）：调用方（`DateStamp`）用
 * "空串 = 这次不烧日期"这一个判据就够了，多一个 `null` 就多一条分支要记。
 */
export function formatWithDateEngine(date: Date, format: DateFormatId): string {
  return renderDateTemplate(date, DATE_FORMAT_TEMPLATES[format]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 二、5 档发光色 × 双层荧光晕染
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一档发光色的四层配方。
 *
 * ## 为什么是**四**层而不是两层
 * 用户要的"双层荧光晕染"说的是**光晕**那两层（外层扩散 + 中层暖光），但真机上一条发光
 * 笔画至少还有"灯丝本体"和"灯丝中心过曝点"两层，只有前两层的话字会像一片糊开的色块。
 * 所以这里给四层，其中 `filament` / `core` 是笔画自身的颜色，`outer` / `inner` 才是晕染。
 *
 * ## 每一层画在哪
 * - `outer`：**笔画外侧**的有界扩散（`hazeSpread()` 决定外扩多少 pt）；
 * - `inner`：**笔画本体上**盖的半透明暖色，把纯色压成"有温度的灯"；
 * - `filament`：笔画的实心色；
 * - `core`：笔画内部的过曝中心（细一档，制造"灯丝"而不是"塑料块"）。
 *
 * ## 数值口径
 * 不透明度**全部写死在这一张表里**，不许在渲染层乘系数：发光是风格的一部分，
 * 一旦散成"某处再乘 0.8"，同一种光在不同机位下就会变味，而这种漂移在真机上
 * 表现为"画内比白边暗一点"——很难被当成 bug 报上来，只会一直难看。
 */
export interface DateGlowRecipe {
  /** 外层扩散光的颜色（`rgba()` 串）。 */
  outer: string;
  /** 中层暖光的颜色（`rgba()` 串）。 */
  inner: string;
  /** 灯丝本体色（实心）。 */
  filament: string;
  /** 灯丝中心的过曝色（实心）。 */
  core: string;
  /**
   * 外层扩散的**额外**倍数。默认 1；只有要"更虚更大的光"的档位才调。
   * 上限由 `HAZE_LIMIT_RATIO` 统一兜住，单档调不出白雾。
   */
  spreadScale: number;
}

/**
 * 5 档发光色的层配方。
 *
 * `coral_red` 的 `outer` = `rgba(255,58,30,0.22)`、`core` = `#FFB4A2` 是**用户逐字给定**的，
 * 另外四档按同一套层结构推出来（同位置同不透明度，只换色相），保证"换色 = 换光，
 * 不换形状"。`classic_amber` 是默认档，也是 v1.6.1 沿用的那支琥珀橙。
 */
export const DATE_GLOW_PALETTE: Record<DateGlowId, DateGlowRecipe> = {
  /** 珊瑚暖红 —— 用户给定的基准配色。 */
  coral_red: {
    outer: 'rgba(255,58,30,0.22)',
    inner: 'rgba(255,140,96,0.30)',
    filament: '#FF4A2A',
    core: '#FFB4A2',
    spreadScale: 1,
  },
  /** 钨丝琥珀橙 —— 默认档，与 v1.6.1 的 `#FF8A00` 同色相。 */
  classic_amber: {
    outer: 'rgba(255,138,0,0.22)',
    inner: 'rgba(255,186,92,0.30)',
    filament: '#FF8A00',
    core: '#FFD9A0',
    spreadScale: 1,
  },
  /** 香槟金 —— 比琥珀更淡、更"贵"，扩散略大一点才不发灰。 */
  warm_gold: {
    outer: 'rgba(255,196,92,0.22)',
    inner: 'rgba(255,224,160,0.30)',
    filament: '#FFC45C',
    core: '#FFF0CE',
    spreadScale: 1.1,
  },
  /** 千禧绿 —— 老 CCD 取景器的荧光绿。 */
  ccd_green: {
    outer: 'rgba(58,255,122,0.22)',
    inner: 'rgba(150,255,182,0.30)',
    filament: '#3AFF7A',
    core: '#C6FFD8',
    spreadScale: 1,
  },
  /** 赛博青 —— 冷白偏青，扩散收紧一档免得压在亮部上看不见。 */
  cyber_cyan: {
    outer: 'rgba(58,232,255,0.22)',
    inner: 'rgba(150,242,255,0.30)',
    filament: '#3AE8FF',
    core: '#C6F6FF',
    spreadScale: 0.9,
  },
};

/**
 * 外层扩散相对字号的基准比例。
 *
 * 0.18 是照着"一行 44 设计像素高的日期"排出来的：44 × 0.18 ≈ 7.9 设计像素的扩散，
 * 在 1440 宽的标准画布上是 0.55% 的宽度 —— 看得见一圈光，但绝不可能连成一片白雾。
 */
export const HAZE_RATIO = 0.18;

/**
 * 扩散的**硬上限**相对字号的倍数。
 *
 * 这条线是"防白雾"的最后一道闸：`hazeSpread()` 就算被传进一个离谱的 `ratio`
 * （比如误传了画布宽），扩散也不会超过字号的 0.3 倍 —— 探针按"任何发光层的空间范围
 * ≤ 文字框外扩 `hazeSpread()` pt"逐层断言，所以这个上限同时也是断言里的那个 X。
 */
export const HAZE_LIMIT_RATIO = 0.3;

/**
 * 外层扩散（逻辑点）：从文字框边缘**再往外**扩这么多。
 *
 * 只吃 `fontPx` 一个输入，所以同一档格式在不同画布上的"光晕 ÷ 字高"是常数 ——
 * 这和水印的绝对像素锁定是同一条规矩：光晕也是烙印的一部分，不能随画布浮动。
 */
export function hazeSpread(fontPx: number, glow: DateGlowId): number {
  if (!(fontPx > 0)) {
    return 0;
  }
  const scale = DATE_GLOW_PALETTE[glow].spreadScale;
  // `round2` 就地写：这个数会进探针的等式断言，浮点尾巴会让"外扩恰好等于"变成"差 1e-15"。
  return Math.round(Math.min(HAZE_RATIO * scale, HAZE_LIMIT_RATIO) * fontPx * 100) / 100;
}

/** 晕染层里的一层：画在哪、多大、什么颜色。 */
export interface HazeLayer {
  /** 层标识（React key、调试标识）。 */
  kind: 'outer' | 'inner';
  /** 相对文字框外扩的像素（逻辑点）。v1.8.3 的 `OpticalDateText` 把它当 `textShadowRadius` 用。 */
  spread: number;
  /** 颜色（`rgba()` 串）。 */
  color: string;
  /** 圆角半径（逻辑点）：等于该层的扩散量，让它是一圈光而不是一个方框（v1.8.2 的矩形晕染层用的）。 */
  radius: number;
}

/**
 * 双层荧光晕染的**层配方**（外 + 内两层，从外到内）。
 *
 * 返回的每一层都以"文字框"为基准：`spread` 是它比文字框每边大出多少 pt，
 * 所以 `width = textWidth + 2*spread`、`height = textHeight + 2*spread`。
 * 渲染层照抄这两个数即可，不需要自己算 —— 这是"排版层算、渲染层画"那条老规矩。
 *
 * v1.8.3 起不再有实心矩形晕染层（用户强制规范：日期背景必须 100% 透明）；
 * `OpticalDateText` 改为把这份配方读成三层叠影的**颜色 + `textShadowRadius`**：
 * `spread` 仍然是扩散量，只是载体从矩形换成了字形自身的阴影。
 *
 * 为什么只有两层：用户要的就是"双层"（外层扩散 + 中层暖光）。第三层是笔画本体色，
 * 由 `DATE_GLOW_PALETTE.filament` 画在字形自己身上，不属于晕染层。
 */
export function hazeLayers(fontPx: number, glow: DateGlowId): HazeLayer[] {
  const recipe = DATE_GLOW_PALETTE[glow];
  const outer = hazeSpread(fontPx, glow);
  if (outer <= 0) {
    return [];
  }
  /**
   * 内层是外层的一半（`round2`）。
   *
   * 为什么是一半而不是"外层的 60%"：光在文字边缘处最亮、往外快速衰减，
   * 两层按 1 : 0.5 叠出来的衰减曲线在真机观感上最接近"通电的灯丝"；
   * 0.6 以上会让中层盖住外层，看上去只有一个模糊的方块。
   */
  const inner = Math.round(outer * 0.5 * 100) / 100;
  return [
    { kind: 'outer', spread: outer, color: recipe.outer, radius: outer },
    { kind: 'inner', spread: inner, color: recipe.inner, radius: inner },
  ];
}

/**
 * 晕染层允许出现的最大外扩量（逻辑点）—— 探针的判据，也是"防白雾"这条要求的**数值化**。
 *
 * 「不许铺满画幅」如果只写一句形容词，下一个改代码的人没有任何东西可对照；
 * 写成一个函数之后，探针可以对 5 档光 × 任意字号逐条断言
 * "每一层的 spread ≤ 这个数"，而且这个数本身是字号的固定比例（不随画布变化）。
 */
export function hazeLimit(fontPx: number): number {
  return Math.round(HAZE_LIMIT_RATIO * Math.max(0, fontPx) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、4 种光学字形：渲染参数的唯一参数表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一档光学字形的渲染参数（v1.8.3）。
 *
 * v1.8.2 的 `DateGlyphs.tsx` 把"字形"拆成两套完全不同的实现（7 段/点阵逐格画
 * `View`，另三档排 `<Text>`），字重/字距/发光强度散在渲染层。v1.8.3 起四档统一走
 * `OpticalDateText` 的「一行等宽文本 × 三层绝对对齐叠影」，这些参数就成了排版层与
 * 渲染层都要读的数据 —— 放在这个纯数据文件里，两边 `import` 同一张表，不可能分叉。
 *
 * ⚠️ **字号不在这里**：字号是"画布宽度 × 设计像素"的换算结果（`DATE_DESIGN_PX` +
 * `dateEngineFontPx()`），属于排版层；本表只管"同一字号下这一档长什么样"。
 */
export interface DateGlyphStyleSpec {
  /** 字重。iOS 预装字体只提供这几档可选字面（v1.8.7 加入 400：喷墨用常规体）。 */
  fontWeight: '400' | '600' | '700' | '800';
  /**
   * 字距倍数（相对 `watermarkTypography.dateLetterSpacingOf()` 的基准 8 设计像素）。
   *
   * `quartz_led` 取 1.25：基准字距在参考画布 358pt 上是 2.0pt，×1.25 ≈ 2.5pt ——
   * 就是用户给的液晶日期字距。其余三档按旧 `TextGlyph` 的 trackingScale 折算，
   * 保证"换档 = 换字面"；宽度仍由排版层按同一倍数算进 `quartz.width`，不会裁字。
   */
  trackingScale: number;
  /** 三层叠影的强度倍数：`1` = 满强度石英液晶，越小越收敛（喷墨/钢印只有极淡一圈）。 */
  glowScale: number;
  /** 行盒高 ÷ 字号。四档统一 1.16：三层叠影共用同一条基线，行盒必须逐点一致。 */
  heightRatio: number;
}

/**
 * 4 档字形的参数表（唯一产地）。
 *
 * ⚠️ **v1.8.7 口径变了**：v1.8.3 的四档只差字重/字距/光强，肉眼几乎分不出来被用户投诉；
 * v1.8.7 起字体族、几何变换、阴影/浮雕、透明度这些"材质"参数在渲染层
 * （`DateGlyphs.tsx` 的 `dateGlyphLayers()` / `GLYPH_FONT_FAMILY`），本表只保留
 * **排版层也需要的四个数**（字重、字距倍数、发光强度、行高比）—— 因为宽度是由
 * `trackingScale` 算进 `quartz.width` 的，不能分叉。
 *
 * 数值口径：
 * - `quartz_led`：石英液晶的继承者 —— 700 字重、2.5pt 级字距（1.25×）、满强度三层光；
 * - `ccd_osd`：CCD 录像字幕 —— 800 字重、**紧凑字距**（0.60×，OSD 字模挤得很紧）、
 *   0.8 光强（渲染层不再用它发光，但 `opticalGlowLayers` 仍按这个数派生历史配方）；
 * - `lab_inkjet`：暗房喷墨 —— 400 字重（`AmericanTypewriter` 只有常规/粗体两档，
 *   400 落到常规）、**中等偏宽字距**（1.10×，打字机排字的呼吸感）、0.4 强度；
 * - `archival_steel`：檔案鋼印 —— 600 字重（`Copperplate` 常规）、**超宽字距**
 *   （1.90×，钢印字距是四档最宽的；用户规范 5.5×S 在参考画布上约 3.8pt）、0.35 强度。
 */
export const DATE_GLYPH_STYLES: Record<DateGlyphStyleId, DateGlyphStyleSpec> = {
  quartz_led: { fontWeight: '700', trackingScale: 1.25, glowScale: 1, heightRatio: 1.16 },
  ccd_osd: { fontWeight: '800', trackingScale: 0.6, glowScale: 0.8, heightRatio: 1.16 },
  lab_inkjet: { fontWeight: '400', trackingScale: 1.1, glowScale: 0.4, heightRatio: 1.16 },
  archival_steel: { fontWeight: '600', trackingScale: 1.9, glowScale: 0.35, heightRatio: 1.16 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 四、字号：唯一从 canvasBase 换算
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 某个字形风格在当前画布上的字号（逻辑点）。**这是"字号从哪来"的唯一入口。**
 *
 * 它只做一件事：把 `DATE_DESIGN_PX[style]`（1440 宽标准画布上的设计像素）
 * 交给 `absoluteFontPx()` 换算。任何"短边比例""最小 pt 下限""按机型分叉"的写法
 * 都会破坏用户的绝对像素锁定硬要求（见 `canvasBase.ts` 文件头）。
 *
 * ⚠️ 注意它**不加下限**：`absoluteFontPx` 在极端小画布上会算出很小的值，
 * 那是"这块画布就这么大"的诚实结果；加下限等于让"日期像素高 ÷ 成片长边"不再是常数，
 * 而那正是 v1.7.0 修掉的那个不变式。
 */
export function dateEngineFontPx(style: DateGlyphStyleId, canvasWidth: number): number {
  return absoluteFontPx(DATE_DESIGN_PX[style], canvasWidth);
}

/**
 * 日期文本的渲染宽度（逻辑点）—— **这是"日期行宽度"在本引擎下的唯一定义**。
 *
 * 公式与 v1.7.0 的 `dateStampWidth()` 逐个字符对齐：
 *
 *     宽度 = 字符数 × (字号 × 0.6 + 字距 + 0.5)
 *
 * 三项分别是等宽字形的 advance（`MONO_ADVANCE_RATIO`）、字距、
 * 以及每个字形 0.5pt 的余量（`DATE_GLYPH_SLACK`，防 CoreText 逐字形取整把尾字挤掉）。
 *
 * ⚠️ **为什么渲染层不用"真实墨迹宽"**：排版层（`geometry.computeWatermarkPlan`）已经用
 * `dateStampWidth()` 把宽度算死并写进 `quartz.width` 了，渲染层照抄。三层叠影是同一行
 * 文本的三份拷贝，只要有一层按 CoreText 真实 advance 排字，宽度就会随字号取整漂移，
 * 而偏差的表现是"日期离白边忽远忽近"—— 极难回溯（v1.5.1 的 `26 10...` 就是这一类）。
 * 所以两个公式必须**逐项同源**。
 */
export function dateEngineTextWidth(
  text: string,
  fontPx: number,
  letterSpacing: number,
  glyphSlack: number = GLYPH_SLACK,
): number {
  if (text.length === 0 || !(fontPx > 0)) {
    return 0;
  }
  const per = fontPx * MONO_ADVANCE + letterSpacing + glyphSlack;
  return Math.round(text.length * per * 100) / 100;
}

/**
 * 等宽字形 advance ÷ 字号。**与 `watermarkTypography.MONO_ADVANCE_RATIO` 是同一个数。**
 *
 * 为什么不 import 那一个：`watermarkTypography.ts` 不许 import `react-native` 是为了探针
 * 能直接跑它 —— 那个文件本身是可以 import 的，但它的比例表里混着"预设权重"
 * "墨色系数"这类水印专属概念，日期引擎只该拿到"0.6 这个数"。所以这里**复制数值并注释来源**，
 * 探针会断言两边**逐位相等**（`dateEngine.MONO_ADVANCE === watermarkTypography.MONO_ADVANCE_RATIO`），
 * 漂了就是探针红，不可能静默分叉。
 */
export const MONO_ADVANCE = 0.6;

/** 每个字形留的余量（逻辑点）。与 `watermarkTypography.DATE_GLYPH_SLACK` 同值（探针断言相等）。 */
export const GLYPH_SLACK = 0.5;

/**
 * 空串判据：这一次到底要不要烧日期。
 *
 * `OFF` 档、或者模板渲染出空串（理论上不会，但判据要稳），都算"不烧"。
 * 渲染层（`DateStamp`）`format === 'OFF'` 时直接 `return null`，
 * **不许**渲染一个空 `<View>`：空 View 在真机上不会显示任何东西，但会让
 * `FramePreviewLayer` 里那些"有没有日期块"的判断（比如白边强制只印地名）失效。
 */
export function shouldStampDate(text: string): boolean {
  return text.trim().length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 五、8 机位：只有"角度"和"画内 / 白边"归属，坐标不在这里
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 每个机位的两个**纯属性**：是否旋转 90°、属于画内还是相纸白边。
 *
 * ⚠️ 这里**故意没有坐标**。坐标在 `geometry.resolveDateSpot()`（geo-stamp 写域），
 * 这个表只回答"这个机位要不要转、烧在哪一层"——渲染层要用它决定旋转角，
 * 合成层要用它决定"白边是不是只印地名"。
 */
export const DATE_SPOT_TRAITS: Record<
  DateStampSpot,
  { rotationDeg: 0 | 90; region: 'photo' | 'strip' }
> = {
  /** 画内左下竖排（Dazz 经典同款，90°）。 */
  in_bl_v: { rotationDeg: 90, region: 'photo' },
  /** 画内左下横排。 */
  in_bl_h: { rotationDeg: 0, region: 'photo' },
  /** 画内右下横排。 */
  in_br_h: { rotationDeg: 0, region: 'photo' },
  /** 画内右下竖排。 */
  in_br_v: { rotationDeg: 90, region: 'photo' },
  /** 画内右上竖排。 */
  in_tr_v: { rotationDeg: 90, region: 'photo' },
  /** 画面底部居中横排。 */
  in_cb_h: { rotationDeg: 0, region: 'photo' },
  /** 白边下巴左右分列（左地名 · 右日期）。 */
  strip_split: { rotationDeg: 0, region: 'strip' },
  /** 白边居中一体式。 */
  strip_center: { rotationDeg: 0, region: 'strip' },
};

/**
 * 本地别名的形状：只取 `DateStampSpot` 的成员，避免这个纯数据文件为了一个类型
 * 去 import 整个 `types/index.ts`（那个文件里有 `Date` / `ImageSourcePropType` 之类的运行时形状，
 * 探针加载它没问题，但"纯数据文件只依赖它真正需要的形状"这条规矩更值钱）。
 * 它必须与 `types/index.ts` 的 `DateStampSpot` **逐个成员相等**，探针会断言这一点。
 */
export type DateStampSpotLike = DateStampSpot;

/**
 * 画内机位下，白边下巴**只印地名**（不重复印日期）。
 *
 * 这条规则由 `FilmCompositor.planWatermark` 执行，判据就是这个函数 ——
 * 引擎把"归属"这个概念显式交出去，免得合成层再写一遍 `spot.startsWith('in_')`
 * 这种字符串判断（以后加机位就会漏）。
 */
export function stampsInsidePhoto(spot: DateStampSpotLike): boolean {
  return DATE_SPOT_TRAITS[spot].region === 'photo';
}
