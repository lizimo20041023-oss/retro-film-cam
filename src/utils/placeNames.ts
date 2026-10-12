/**
 * 地名水印的「结构化 → 一行字」渲染层 —— 纯字符串逻辑，没有 React、没有原生模块、没有副作用。
 *
 * 为什么要把地名拆成结构（`ResolvedPlace`）而不是反查完就拼成一行：
 * 照片可能是在中文界面下拍的，用户后来把界面切成英文，旧照片的水印也要跟着变
 * （「上海市 · 中国」→「SHANGHAI · CHN」）。所以**存结构、渲染时才拼**，
 * 语言一换重排即可 —— 这也意味着这里所有函数都必须是纯函数，才能在渲染期随时调用。
 *
 * 两条容易写错的规则，都收在本文件的表里，不要在别处再拼一遍字符串：
 * 1. 港澳台必须带「中国」前缀（见 `CHINA_PREFIX` / `GREATER_CHINA`）；
 * 2. 英文界面要求罗马字大写（见 `romanizeForEnglish`，**已知做不到完整**，注释里写清了）。
 *
 * 单位说明：本文件只处理字符串，不涉及任何长度单位。
 */
import type { PlaceDetail, ResolvedPlace } from '../types';
import type { LocaleId } from '../i18n/types';

/**
 * `expo-location` 的 `reverseGeocodeAsync` 结果里我们真正会读的字段。
 *
 * 为什么自己声明一个结构而不是直接用 `Location.LocationGeocodedAddress`：
 * 1. 那几个字段在该类型上是可选的，而且各平台（iOS 苹果反查 / Android 谷歌反查）
 *    填的字段并不一致，自己声明能一眼看出"我们到底依赖什么"；
 * 2. **结构上兼容** —— 真实的 geocode 结果可以直接传进来，不需要任何断言。
 *    所以可空写法必须跟着 expo 的声明走（`string | null`，字段本身可能整个不存在）；
 *    真拿到 `null` 由 `clean()` 兜住。
 */
export interface PlaceGeocodeAddress {
  /** 城市，例如 `'上海市'`。乡镇 / 海上 / 机场常常没有。 */
  city?: string | null;
  /** 区 / 县，例如 `'黄浦区'`。 */
  district?: string | null;
  /** 次一级行政区（美国是县，日本是支厅级别）。 */
  subregion?: string | null;
  /** 省 / 州 / 大区，例如 `'上海市'`、`'California'`。 */
  region?: string | null;
  /** 国家或地区的本地语言名，例如 `'中国'`、`'日本'`。 */
  country?: string | null;
  /** ISO 3166-1 alpha-2 代码（`'CN'` / `'TW'` / `'HK'` / `'MO'`），平台一般都会给。 */
  isoCountryCode?: string | null;
}

/** 水印里地名和日期之间的分隔符（split 版式之外也用得上）。 */
export const PLACE_SEPARATOR = ' · ';

/**
 * 三字母国家码表。
 *
 * 为什么需要它：`reverseGeocodeAsync` 只给 alpha-2（`CN`），而档案风要的是 alpha-3（`CHN`）。
 * 只收录本 App 真正会遇到的地区，**查不到时按 `countryCode` 推一个**（见 `alpha3Of`）——
 * 与其为了一个水印内嵌一张 250 行的 ISO 表，不如让"没收录的地区"退化成
 * "三位代码 = 国家码本身"，档案风看起来依然成立。
 */
const ALPHA3: Record<string, string> = {
  CN: 'CHN',
  TW: 'TWN',
  HK: 'HKG',
  MO: 'MAC',
  JP: 'JPN',
  KR: 'KOR',
  KP: 'PRK',
  SG: 'SGP',
  MY: 'MYS',
  TH: 'THA',
  VN: 'VNM',
  PH: 'PHL',
  ID: 'IDN',
  IN: 'IND',
  AE: 'ARE',
  TR: 'TUR',
  US: 'USA',
  CA: 'CAN',
  MX: 'MEX',
  BR: 'BRA',
  AR: 'ARG',
  GB: 'GBR',
  IE: 'IRL',
  FR: 'FRA',
  DE: 'DEU',
  IT: 'ITA',
  ES: 'ESP',
  PT: 'PRT',
  NL: 'NLD',
  BE: 'BEL',
  CH: 'CHE',
  AT: 'AUT',
  SE: 'SWE',
  NO: 'NOR',
  DK: 'DNK',
  FI: 'FIN',
  IS: 'ISL',
  PL: 'POL',
  CZ: 'CZE',
  GR: 'GRC',
  RU: 'RUS',
  UA: 'UKR',
  AU: 'AUS',
  NZ: 'NZL',
  ZA: 'ZAF',
  EG: 'EGY',
  MA: 'MAR',
};

/**
 * 需要加「中国」前缀的国家 / 地区代码（港澳台）。
 *
 * 单独提成一个集合而不是散在 if 里：这是**政治表述**，将来要改就只改这一处，
 * 而且 `resolveWatermarkPlan` 之外任何人都不该自己判断。
 */
const GREATER_CHINA: readonly string[] = ['TW', 'HK', 'MO'];

/** 各地区在 `full` 档位下的地区名。**故意用简体**：它是"地区名"不是"翻译文案"。 */
const GREATER_CHINA_NAME: Record<string, string> = {
  TW: '台湾',
  HK: '香港',
  MO: '澳门',
};

/**
 * 各语言里「中国」这两个字怎么写。
 *
 * 为什么前缀要按语言取词而不是永远写「中国」：英文界面出「台北 · 中国台湾」会非常怪，
 * 那一行的其余部分全是拉丁字母。所以前缀跟着界面语言走，写法仍是我们说了算
 * （en 用 `China`，法文用 `Chine`，日文用 `中国`）。
 *
 * `Record<LocaleId, string>` 是刻意的：**加一门语言时 tsc 会在这里报错**，
 * 不会出现"新语言下港澳台悄悄丢了前缀"。
 */
const CHINA_PREFIX: Record<LocaleId, string> = {
  'zh-Hans': '中国',
  'zh-Hant': '中國',
  ja: '中国',
  en: 'China',
  fr: 'Chine',
};

/**
 * 各语言里「中国」作为**国家全称**的写法（`full` 档位用）。
 *
 * 中日同形词是巧合：中文写「中国」、日文写「中国」（新字体），
 * 所以这张表和 `CHINA_PREFIX` 看着像重复，语义却不同 —— 一个是前缀，一个是国名。
 */
const CHINA_COUNTRY_NAME: Record<LocaleId, string> = {
  'zh-Hans': '中国',
  'zh-Hant': '中國',
  ja: '中国',
  en: 'China',
  fr: 'Chine',
};

/**
 * 经纬度 → `31.230°N 121.474°E`（三位小数 + 方位字母）。
 *
 * 单位：`latitude` / `longitude` 是 WGS-84 **度**；返回的是纯字符串。
 * 为什么放这里而不是 `locationStamp.ts`：`ResolvedPlace.coords` 是**离线算**的，
 * 和反查（联网）不是一回事；放纯字符串模块里，测试和调试都不需要 mock 原生模块。
 */
export function formatCoords(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(3)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(3)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
}

/** 去掉首尾空白；拿到的不是字符串时返回空串（平台会给 `null`）。 */
function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 第一个非空值。 */
function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = clean(value);
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return '';
}

/**
 * 反查结果 → 结构化地名。
 *
 * `fallbackCity` 给"反查拿不到 `city` 的小地方"用：调用方通常会在反查**之前**
 * 先拿坐标，所以最差也能退化成坐标那一行的城市位（见 `locationStamp.ts`）。
 * 传 `undefined` 就表示没有兜底。
 *
 * 单位：`latitude` / `longitude` 是**度**（WGS-84）。
 */
export function resolvePlaceFromGeocode(
  address: PlaceGeocodeAddress | null | undefined,
  latitude: number,
  longitude: number,
  fallbackCity?: string,
): ResolvedPlace {
  const source = address ?? {};
  return {
    // 行政层级逐级降级：城市 → 区 → 次行政区 → 省/州。
    // 顺序是"离用户最近的那一级优先"，和地图 App 的显示习惯一致。
    city: firstNonEmpty(source.city, source.district, source.subregion, source.region, fallbackCity),
    // `region` 单独留一份：`full` 档位在"没有城市"时要拿它顶上（见 `pickBaseName`）。
    region: firstNonEmpty(source.region, source.subregion),
    country: clean(source.country),
    countryCode: clean(source.isoCountryCode).toUpperCase(),
    coords: formatCoords(latitude, longitude),
  };
}

/** 港澳台判定。集中在这一处，别处不要自己比较国家码。 */
function isGreaterChina(countryCode: string): boolean {
  return GREATER_CHINA.includes(countryCode);
}

/**
 * 三字母国家码。
 *
 * 三步：常见地区查表 → 拿到的本来就是三位就直接用 → 都不是则退化成 `countryCode` 自己。
 * 最后一步是刻意的：宁可显示 `XX`，也不要为了凑三位去猜一个错的国家。
 */
function alpha3Of(countryCode: string, country: string): string {
  const known = ALPHA3[countryCode];
  if (known !== undefined) {
    return known;
  }
  if (countryCode.length === 3) {
    return countryCode;
  }
  // 从国家**名**里凑三位（`'Japan'` → `'JAP'`）；非拉丁国名走不通，就退回国家码。
  const latin = country.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (latin.length >= 3) {
    return latin.slice(0, 3);
  }
  return countryCode;
}

/**
 * 行政区后缀：英文界面下先剥掉它，剩下的中文才有一点点可能被 `place` 字段救回来。
 */
const ADMIN_SUFFIX = /(特别行政区|特別行政區|自治区|自治區|市|省|县|縣|区|區|町|村)$/u;

/**
 * 去掉结尾的行政区后缀（`'上海市'` → `'上海'`、`'California'` 原样）。
 *
 * 只在 `'archive'` 档位用。这一档要的是**标签**，不是地址：
 * `上海 · CHN` 里的「市」是行政区划层级，国家的三字母码已经说明了这是哪一级。
 * 全部由后缀组成时（`'市'`）返回空串，让调用方换字段 / 退国家码，
 * 而不是印出一个单字的「市」。
 */
function stripAdminSuffix(value: string): string {
  return value.replace(ADMIN_SUFFIX, '').trim();
}

/** 拉丁字母判定：ASCII 之外的带音标拉丁（é / ü / ø）也算，它们本来就该原样显示。 */
const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u;

/**
 * 罗马字化（**已知做不到完整，这是诚实的说明，不是待办**）。
 *
 * 流程：剥掉行政区后缀 → 还是纯拉丁就大写返回 → 否则交出 `null`，
 * 由调用方决定换字段还是退回本地写法。
 *
 * 为什么不做完整罗马字化：`'上海市'` → `'Shanghai'` 需要一张汉字→拼音表（几万行），
 * `'東京都'` → `'Tokyo'` 还要训令式 / Hepburn 规则，`'台北'` 更是要先判是不是国语罗马字。
 * 为一行水印内嵌这种表不划算，所以这里**只处理反查本来就给了拉丁名的情形**
 * （港澳、新加坡、以及英语区的反查结果），其余一律走"退回本地写法"。
 */
function romanizeForEnglish(value: string): string | null {
  const stripped = stripAdminSuffix(value);
  if (stripped.length === 0) {
    return null;
  }
  return LATIN_ONLY.test(stripped) ? stripped.toUpperCase() : null;
}

/** 英文界面用哪个字段名：从一组候选里挑第一个能罗马字化的。 */
function pickRomanized(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (candidate.length === 0) {
      continue;
    }
    const romanized = romanizeForEnglish(candidate);
    if (romanized !== null) {
      return romanized;
    }
  }
  return null;
}

/**
 * `'archive'` 的国家部分：`CN` → `CHN`，其余地区照常。
 *
 * 港澳台返回 `undefined` —— **不是"没有国家"**，而是"这一行已经写着国家了，
 * 别再缀一遍"。它们的地名主体一定是 `<中国前缀><地区名>`（见 `pickBaseName`），
 * 后面再跟一个 `TWN` 就变成 `台北 · 中国台湾 · TWN`，同一条信息印了两遍。
 *
 * 用 `undefined` 而不是另一个对象形状来表达这件事，是为了让"台港澳只有两段"
 * 这条规则在 `formatResolvedPlace` 里变成一个 `??`，而不是散开的 if。
 */
function archiveCountry(place: ResolvedPlace, locale: LocaleId): string | undefined {
  return isGreaterChina(place.countryCode) ? undefined : alpha3Of(place.countryCode, place.country);
}

/**
 * 港澳台在地名那一格里怎么写：`中国台湾` / `中國香港` / `中国澳门`；非港澳台返回 `undefined`。
 *
 * 前缀按界面语言取词（`CHINA_PREFIX`），地区名用我们自己的表 —— 理由见
 * `withGreaterChinaPrefix` 的注释（这是同一件事的另一半，改一处必须看另一处）。
 */
function greaterChinaName(place: ResolvedPlace, locale: LocaleId): string | undefined {
  if (!isGreaterChina(place.countryCode)) {
    return undefined;
  }
  const region = GREATER_CHINA_NAME[place.countryCode] ?? place.country;
  return `${CHINA_PREFIX[locale]}${region}`;
}

/**
 * `'full'` 的国家部分：国名全称。
 *
 * 国家全称没法本地化（反查给的就是**拍摄地语言**的国名），所以这里只保证两件事：
 * 港澳台改用地名那一格已经写过的政区名（`中国台湾`）；其余情况用反查给的国名，
 * 实在没有才退国家码。
 */
function fullCountry(place: ResolvedPlace, locale: LocaleId): string {
  const gc = greaterChinaName(place, locale);
  if (gc !== undefined) {
    return gc;
  }
  if (place.country.length > 0) {
    return place.country;
  }
  return alpha3Of(place.countryCode, place.country);
}

/**
 * 一行水印里地名部分的**主体**（城市 / 一级地名）。港澳台由 `formatResolvedPlace` 另行套政区名。
 *
 * 两种档位（`detail`）的差别只体现在**有多级行政区可写**的时候：
 * `'full'` 补成 `城市（省/州）`，`'archive'` 剥掉行政区后缀只留城市 —— 档案标签越短越好。
 */
function pickBaseName(place: ResolvedPlace, locale: LocaleId, detail: PlaceDetail): string {
  const region = place.region;
  // `region` 和 `city` 同名是常态（东京都/东京、上海市/上海市），同名就不重复写。
  const distinctRegion = region.length > 0 && region !== place.city ? region : '';
  const code = alpha3Of(place.countryCode, place.country);

  if (locale === 'en') {
    const city = pickRomanized([place.city]);
    const extra = distinctRegion.length > 0 ? pickRomanized([distinctRegion]) : null;
    if (city === null) {
      // 罗马字化失败（汉字地名走不通）：退回本地写法。真的连本地名都没有才退国家码。
      const local = place.city || distinctRegion;
      return detail === 'archive' ? stripAdminSuffix(local) || code : local || code;
    }
    // `full` 补一级行政区：只在两级都能罗马字化时才补，
    // 否则会出现 `SHANGHAI（上海市）` 这种一行里两种文字的情况。
    if (detail === 'full' && extra !== null && extra !== city) {
      return `${city}（${extra}）`;
    }
    return city;
  }

  const local = place.city || distinctRegion;
  if (detail === 'full') {
    return place.city.length > 0 && distinctRegion.length > 0 ? `${local}（${distinctRegion}）` : local;
  }
  return stripAdminSuffix(local);
}

/**
 * 结构化地名 → 一行显示文本。
 *
 * - `'archive'`：`上海 · CHN`、`台北 · 中国台湾`（城市 + 三字母码；港澳台换成带前缀的政区名）
 * - `'full'`：`上海市 · 中国`、`台北 · 中国台湾`（城市 + 国家全称）
 *
 * 港澳台的整体形状是 `城市 · <中国前缀><地区名>` —— 港台**不是** `城市 · 台湾`，
 * 所以它们在这里就返回，不走下面"主体 + 国家"的通用拼接（见 `greaterChinaName`）。
 *
 * 单位：无（纯字符串）。`locale` 必须传**当前界面语言**而不是拍摄时的语言 ——
 * 这正是存结构（`ResolvedPlace`）而不是存字符串的意义所在。
 */
export function formatResolvedPlace(
  place: ResolvedPlace,
  locale: LocaleId,
  detail: PlaceDetail,
): string {
  const base = pickBaseName(place, locale, detail);
  const gc = greaterChinaName(place, locale);
  if (gc !== undefined) {
    // 反查只给了省 / 地区、连城市都没有时（`base` 会等于政区名），不要印成 `中国台湾 · 中国台湾`。
    return base.length === 0 || base === gc ? gc : `${base}${PLACE_SEPARATOR}${gc}`;
  }
  const country = detail === 'archive' ? archiveCountry(place, locale) : fullCountry(place, locale);
  // 三处空值合成时的收敛点：宁可少一段，也不要在行里留下孤零零的分隔符。
  if (base.length === 0) {
    return country ?? '';
  }
  if (country === undefined || country.length === 0) {
    return base;
  }
  return `${base}${PLACE_SEPARATOR}${country}`;
}

/** 坐标 / 地名都没拿到时，这一行是否还有意义（空串 = 这次不烧定位）。 */
export function isEmptyPlaceLine(text: string): boolean {
  return text.trim().length === 0;
}
