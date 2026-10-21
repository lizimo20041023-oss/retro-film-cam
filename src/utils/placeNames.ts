/**
 * 地名水印的「结构化 → 一行字」渲染层 —— 纯字符串逻辑，没有 React、没有原生模块、没有副作用。
 *
 * 为什么要把地名拆成结构（`ResolvedPlace`）而不是反查完就拼成一行：
 * 照片可能是在中文界面下拍的，用户后来把界面切成英文，旧照片的水印也要跟着变
 * （「中国 · 上海」→「SHANGHAI · CHINA」）。所以**存结构、渲染时才拼**，
 * 语言一换重排即可 —— 这也意味着这里所有函数都必须是纯函数，才能在渲染期随时调用。
 *
 * 三条容易写错的规则，都收在本文件的表里，不要在别处再拼一遍字符串：
 * 1. 分隔符恒为 `' · '`（`PLACE_SEPARATOR`），**从大到小**：国家 · 省/州/县 · 市/区。
 *    全角逗号 `，`、`CITY, REGION / CN` 这种"中英混血"排版一律不再出现
 *    （v1.8.5 用户需求 m02760 §四）；
 * 2. 中文 / 日文档优先使用国家代码 → 多语言国名词典（`COUNTRY_NAMES`）；表外国家
 *    再走 `Intl.DisplayNames`，旧系统不支持时保留系统国名或 ISO 代码，不能把海外地址
 *    整段丢掉。英文档使用罗马字（见 `romanizeForEnglish`）；
 * 3. 港澳台在**任何语言、两档详细度**下都必须带国家（中文档靠"国家在最前"，
 *    英文档靠 `HONG KONG · CHINA` 这种"国家殿后"，见 `formatChinesePlace` /
 *    `formatLatinPlace` 上方的红线注释）。
 *
 * 本版（v1.8.5 地名纯净多语言）两档详细度：
 *   · `archive`：中文 `国家 · 省 · 市`（剥行政后缀）、日文 `国家 · 県 · 市`（保留后缀）、
 *     英文 `CITY · REGION · COUNTRY`（**小→大**，英文地址本来就这么读）；
 *   · `full`：中文补回行政级别词、仍 ` · ` 连接（`中国 · 广东省 · 梅州市`）；
 *     日文 / 英文两档同形（日文地名自带 県/市，英文没有可补的后缀）。
 * 上一版的 `上海 · CHN`（alpha-3 尾巴）与 `国家省市区`（无分隔符）格式全部作废。
 *
 * 单位说明：本文件只处理字符串，不涉及任何长度单位。
 */
import type { GeoLocale, LocalePreference, PlaceDetail, ResolvedPlace } from '../types';
import type { LocaleId } from '../i18n/types';
import { pad2 } from './formatTimestamp';

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
  /**
   * **地点名（POI）**，例如 `'熊本空港'`、`'Tower Bridge'`。
   *
   * 为什么必须收它（而不是只看行政区字段）：iOS 的 `CLPlacemark.name` 对机场 / 车站 /
   * 景点这类"不是一个行政区"的地方**常常是唯一填了的字段**，expo 的原话就是
   * "The name of the placemark, for example, 'Tower Bridge'"。少了它，这种照片的
   * 反查结果会一个可用字段都没有（`city` / `district` / `subregion` / `region` /
   * `country` / `isoCountryCode` 全空），最后一路退成坐标 —— 这正是要修的那个症状
   * （见 `resolvePlaceFromGeocode` 里它排在链上哪一格、以及为什么排在那里）。
   */
  name?: string | null;
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
  /**
   * 街道名（`'1-1 Chome'`、`'Nanjing West Road'`）。排在降级链的**最后一格**。
   *
   * ⚠️ 它一旦被用上，这张照片就算"有地名"（`hasPlaceName` 为真），会印街道而不是坐标 ——
   * 这是本轮**有意翻转**的旧判断（上一版把"系统只回了街道名"当成"没有地名"）。
   * 取舍与退回办法写在 `resolvePlaceFromGeocode` 里 `source.street` 那一项旁边。
   */
  street?: string | null;
  /**
   * Android 可能只填这一整行格式化地址，尤其是设备当前区域之外的海外坐标。
   * 不能因为 city/region 为空就把系统已经返回的地址丢掉。
   */
  formattedAddress?: string | null;
}

/** 水印里地名和日期之间的分隔符（split 版式之外也用得上）。 */
export const PLACE_SEPARATOR = ' · ';

/**
 * 三字母国家码表。
 *
 * 为什么需要它：v1.8.5 起英文档的国家段也优先用 `COUNTRY_NAMES` 的全大写英文名
 * （`JAPAN` 而不是 `JPN`），alpha-3 只在"代码和国名都认不出来"时兜底（见 `countryWord`）。
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

/** alpha-3 → alpha-2（从 `ALPHA3` 反推，不另抄一张表）。 */
const ALPHA3_TO_ALPHA2: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [alpha2, alpha3] of Object.entries(ALPHA3)) {
    out[alpha3] = alpha2;
  }
  return out;
})();

/**
 * 多语言国名词典（v1.8.5）：alpha-2 → 四种地名语言的写法。
 *
 * **为什么必须有一张表**（用户 m02760 §四 的真机痛点）：反查回来的 `country` 跟的是
 * **反查请求语言**，而地名语言是另一个设置 —— 中文界面 + 英文反查会拿到 `'Japan'`，
 * 于是「日本 · 兵庫県 · 神戸市」里混进 `JAPAN`；反过来日文档也可能拿到中文 `'美国'`。
 * 直接印 `place.country` 就是那种"中英混血"。所以国家段**只认代码**：先归一化成
 * alpha-2（`normalizeCountryCode`），再按地名语言取词。
 *
 * 覆盖范围与 `ALPHA3` 一致（都是本 App 真正会遇到的国家 / 地区）。**加地区时两张表一起加**：
 * 表外国家由 `Intl.DisplayNames` / 系统国名兜底；这里仍保留常见目的地的固定译名，避免
 * 不同 OS 版本对同一国家给出不同写法。
 *
 * 港澳台（`TW` / `HK` / `MO`）不在这张表里：它们在任何语言下都走 `CHINA_PREFIX`
 * 的「中国 / 中國 / 中国 / CHINA」前缀 + `GREATER_CHINA_LABEL` 的地区名，见红线注释。
 */
const COUNTRY_NAMES: Readonly<Record<string, Record<GeoLocale, string>>> = {
  CN: { 'zh-Hans': '中国', 'zh-Hant': '中國', ja: '中国', en: 'CHINA' },
  JP: { 'zh-Hans': '日本', 'zh-Hant': '日本', ja: '日本', en: 'JAPAN' },
  KR: { 'zh-Hans': '韩国', 'zh-Hant': '韓國', ja: '韓国', en: 'SOUTH KOREA' },
  KP: { 'zh-Hans': '朝鲜', 'zh-Hant': '北韓', ja: '北朝鮮', en: 'NORTH KOREA' },
  SG: { 'zh-Hans': '新加坡', 'zh-Hant': '新加坡', ja: 'シンガポール', en: 'SINGAPORE' },
  MY: { 'zh-Hans': '马来西亚', 'zh-Hant': '馬來西亞', ja: 'マレーシア', en: 'MALAYSIA' },
  TH: { 'zh-Hans': '泰国', 'zh-Hant': '泰國', ja: 'タイ', en: 'THAILAND' },
  VN: { 'zh-Hans': '越南', 'zh-Hant': '越南', ja: 'ベトナム', en: 'VIETNAM' },
  PH: { 'zh-Hans': '菲律宾', 'zh-Hant': '菲律賓', ja: 'フィリピン', en: 'PHILIPPINES' },
  ID: {
    'zh-Hans': '印度尼西亚',
    'zh-Hant': '印度尼西亞',
    ja: 'インドネシア',
    en: 'INDONESIA',
  },
  IN: { 'zh-Hans': '印度', 'zh-Hant': '印度', ja: 'インド', en: 'INDIA' },
  AE: {
    'zh-Hans': '阿联酋',
    'zh-Hant': '阿聯酋',
    ja: 'アラブ首長国連邦',
    en: 'UNITED ARAB EMIRATES',
  },
  TR: { 'zh-Hans': '土耳其', 'zh-Hant': '土耳其', ja: 'トルコ', en: 'TURKEY' },
  US: { 'zh-Hans': '美国', 'zh-Hant': '美國', ja: 'アメリカ', en: 'UNITED STATES' },
  CA: { 'zh-Hans': '加拿大', 'zh-Hant': '加拿大', ja: 'カナダ', en: 'CANADA' },
  MX: { 'zh-Hans': '墨西哥', 'zh-Hant': '墨西哥', ja: 'メキシコ', en: 'MEXICO' },
  BR: { 'zh-Hans': '巴西', 'zh-Hant': '巴西', ja: 'ブラジル', en: 'BRAZIL' },
  AR: { 'zh-Hans': '阿根廷', 'zh-Hant': '阿根廷', ja: 'アルゼンチン', en: 'ARGENTINA' },
  GB: { 'zh-Hans': '英国', 'zh-Hant': '英國', ja: 'イギリス', en: 'UNITED KINGDOM' },
  IE: { 'zh-Hans': '爱尔兰', 'zh-Hant': '愛爾蘭', ja: 'アイルランド', en: 'IRELAND' },
  FR: { 'zh-Hans': '法国', 'zh-Hant': '法國', ja: 'フランス', en: 'FRANCE' },
  DE: { 'zh-Hans': '德国', 'zh-Hant': '德國', ja: 'ドイツ', en: 'GERMANY' },
  IT: { 'zh-Hans': '意大利', 'zh-Hant': '義大利', ja: 'イタリア', en: 'ITALY' },
  ES: { 'zh-Hans': '西班牙', 'zh-Hant': '西班牙', ja: 'スペイン', en: 'SPAIN' },
  PT: { 'zh-Hans': '葡萄牙', 'zh-Hant': '葡萄牙', ja: 'ポルトガル', en: 'PORTUGAL' },
  NL: { 'zh-Hans': '荷兰', 'zh-Hant': '荷蘭', ja: 'オランダ', en: 'NETHERLANDS' },
  BE: { 'zh-Hans': '比利时', 'zh-Hant': '比利時', ja: 'ベルギー', en: 'BELGIUM' },
  CH: { 'zh-Hans': '瑞士', 'zh-Hant': '瑞士', ja: 'スイス', en: 'SWITZERLAND' },
  AT: { 'zh-Hans': '奥地利', 'zh-Hant': '奧地利', ja: 'オーストリア', en: 'AUSTRIA' },
  SE: { 'zh-Hans': '瑞典', 'zh-Hant': '瑞典', ja: 'スウェーデン', en: 'SWEDEN' },
  NO: { 'zh-Hans': '挪威', 'zh-Hant': '挪威', ja: 'ノルウェー', en: 'NORWAY' },
  DK: { 'zh-Hans': '丹麦', 'zh-Hant': '丹麥', ja: 'デンマーク', en: 'DENMARK' },
  FI: { 'zh-Hans': '芬兰', 'zh-Hant': '芬蘭', ja: 'フィンランド', en: 'FINLAND' },
  IS: { 'zh-Hans': '冰岛', 'zh-Hant': '冰島', ja: 'アイスランド', en: 'ICELAND' },
  PL: { 'zh-Hans': '波兰', 'zh-Hant': '波蘭', ja: 'ポーランド', en: 'POLAND' },
  CZ: { 'zh-Hans': '捷克', 'zh-Hant': '捷克', ja: 'チェコ', en: 'CZECHIA' },
  GR: { 'zh-Hans': '希腊', 'zh-Hant': '希臘', ja: 'ギリシャ', en: 'GREECE' },
  RU: { 'zh-Hans': '俄罗斯', 'zh-Hant': '俄羅斯', ja: 'ロシア', en: 'RUSSIA' },
  UA: { 'zh-Hans': '乌克兰', 'zh-Hant': '烏克蘭', ja: 'ウクライナ', en: 'UKRAINE' },
  AU: { 'zh-Hans': '澳大利亚', 'zh-Hant': '澳洲', ja: 'オーストラリア', en: 'AUSTRALIA' },
  NZ: {
    'zh-Hans': '新西兰',
    'zh-Hant': '紐西蘭',
    ja: 'ニュージーランド',
    en: 'NEW ZEALAND',
  },
  ZA: { 'zh-Hans': '南非', 'zh-Hant': '南非', ja: '南アフリカ', en: 'SOUTH AFRICA' },
  EG: { 'zh-Hans': '埃及', 'zh-Hant': '埃及', ja: 'エジプト', en: 'EGYPT' },
  MA: { 'zh-Hans': '摩洛哥', 'zh-Hant': '摩洛哥', ja: 'モロッコ', en: 'MOROCCO' },
};

/**
 * 需要加「中国」前缀的国家 / 地区代码（港澳台）。
 *
 * 单独提成一个集合而不是散在 if 里：这是**政治表述**，将来要改就只改这一处，
 * 而且 `resolveWatermarkPlan` 之外任何人都不该自己判断。
 */
const GREATER_CHINA: readonly string[] = ['TW', 'HK', 'MO'];

/**
 * 港澳台在**各种语言**里怎么写（`archive` 档的地区段、`full` 档的政区名都用它）。
 *
 * 为什么必须按语言分表：`zh-Hant` 要「台灣 / 澳門」、`ja` 要「マカオ」、
 * `en` / `fr` 要全大写拉丁（`TAIWAN` / `HONG KONG` / `MACAU`）。
 * 拿简体那一份去拼就会出现「中國 · 台湾」这种简繁混排 —— 政治上没错，排版上是坏味道。
 *
 * `Record<LocaleId, ...>` 是刻意的：加一门语言时 tsc 会在这里报错，不会悄悄少一份。
 */
const GREATER_CHINA_LABEL: Record<LocaleId, Record<string, string>> = {
  'zh-Hans': { TW: '台湾', HK: '香港', MO: '澳门' },
  'zh-Hant': { TW: '台灣', HK: '香港', MO: '澳門' },
  ja: { TW: '台湾', HK: '香港', MO: 'マカオ' },
  en: { TW: 'TAIWAN', HK: 'HONG KONG', MO: 'MACAU' },
  fr: { TW: 'TAIWAN', HK: 'HONG KONG', MO: 'MACAO' },
};

/**
 * 地区名本身的各种写法 —— 用来判断"城市那一格填的就是地区名"（`香港` / `澳門`）。
 *
 * 判成同一件事之后，那一行才不会印成「中國 · 澳門 · 澳門」：城市那一格直接升格成地区名，
 * 地区段让位（见 `formatChinesePlace` / `formatLatinPlace`）。
 * 表里同时收简繁和拉丁写法，是因为反查给的是**设备语言**的名字，不一定和界面语言一致。
 */
const TERRITORY_NAMES: Record<string, readonly string[]> = {
  TW: ['台湾', '台灣', '臺灣', 'TAIWAN'],
  HK: ['香港', 'HONG KONG'],
  MO: ['澳门', '澳門', 'マカオ', 'MACAU', 'MACAO'],
};

/**
 * 拉丁国名别名表（v1.9.2 §6 防御性归一化）：反查 `country` 是拉丁名时的兜底。
 *
 * 为什么需要它：`COUNTRY_NAMES` 的英文全名反查能覆盖 `CHINA` / `JAPAN` 这类，
 * 但真机反查会给别的写法 —— `PRC` / `Mainland China` / `Hong Kong` / `Macao` /
 * `Taiwan`。港澳台**不在** `COUNTRY_NAMES` 里（见上方红线注释），而英文系统的原生反查
 * 又可能只给 `countryName`、不给 `isoCountryCode`；中文 / 日文档这时仍必须映射出
 * 「中国 / 中國 / 日本」，否则用户会看到 `中国 · 上海 · CHINA` 这种拉丁尾巴
 * （用户 m09093 点名的真机痛点，见 `_v192_contract.md` §6）。
 *
 * **只给中文 / 日文档用**（`resolveCountryCode` 里调）：英文档的国名段本来就该是
 * 拉丁的，任何额外映射都会改变英文行，违约「英文档逐字不变」。
 *
 * 键是 `normalizeLatinAliasKey` 归一后的形态（大写、去点、空白折叠）；值必须是
 * `COUNTRY_NAMES` 的 alpha-2 或港澳台代码。`COUNTRY_NAMES` 英文名与 `ALPHA3` 反表
 * 能查到的写法**不在这里重复**（分别由 `codeFromCountryName` 的前两级覆盖）。
 */
const LATIN_COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  // 中国（英文全名 CHINA 走 COUNTRY_NAMES；这里收变体与别名）
  PRC: 'CN',
  'PR CHINA': 'CN',
  PRCHINA: 'CN',
  "PEOPLE'S REPUBLIC OF CHINA": 'CN',
  'MAINLAND CHINA': 'CN',
  'CHINA MAINLAND': 'CN',
  // 日本
  NIPPON: 'JP',
  // 港澳台：不在 COUNTRY_NAMES 里，必须显式收拉丁写法（CJK 写法在 TERRITORY_NAMES 里）
  'HONG KONG': 'HK',
  HONGKONG: 'HK',
  'HONG KONG SAR': 'HK',
  MACAU: 'MO',
  MACAO: 'MO',
  'MACAU SAR': 'MO',
  TAIWAN: 'TW',
  'CHINESE TAIPEI': 'TW',
  // 常见反查变体（COUNTRY_NAMES 英文全名之外的写法）
  USA: 'US',
  'UNITED STATES OF AMERICA': 'US',
  UK: 'GB',
  'GREAT BRITAIN': 'GB',
  'REPUBLIC OF KOREA': 'KR',
  'RUSSIAN FEDERATION': 'RU',
  'VIET NAM': 'VN',
  'CZECH REPUBLIC': 'CZ',
  HOLLAND: 'NL',
  'THE NETHERLANDS': 'NL',
  UAE: 'AE',
  TURKIYE: 'TR',
  'TÜRKIYE': 'TR',
};

/**
 * 各语言里「中国」怎么写 —— 中文档的国家段，也是拉丁档 `full` 的国家全称。
 *
 * 为什么国家段要按语言取词而不是永远写「中国」：英文界面出「台北 · 中国台湾」会非常怪，
 * 那一行的其余部分全是拉丁字母。所以写法跟着界面语言走，**但用哪个词由我们说了算**：
 * 中文两档是「中国 / 中國」，日文用新字体「中国」，拉丁语言一律**全大写**
 * （`CHINA` / `CHINE`）—— 因为 `full` 档的拉丁形状是 `TAIPEI, TAIWAN, CHINA`。
 *
 * `Record<LocaleId, string>` 是刻意的：**加一门语言时 tsc 会在这里报错**，
 * 不会出现"新语言下港澳台悄悄丢了国家"。
 *
 * 上一版还有一张同形的 `CHINA_COUNTRY_NAME`（"前缀"与"国名"分家），本版并成一张：
 * 新规格里这两处用的是同一个词，两张同值表只会互相漂移。
 */
const CHINA_PREFIX: Record<LocaleId, string> = {
  'zh-Hans': '中国',
  'zh-Hant': '中國',
  ja: '中国',
  en: 'CHINA',
  fr: 'CHINE',
};

/**
 * 一个坐标分量 → `23°02'N`。
 *
 * 分是**四舍五入到整分**的，而且**先算总分数再拆度/分**：这样 `59.6 分` 会自己
 * 进位成下一度的 `00 分`；先拆度再对分做舍入就会印出 `23°60'` 这种不存在的坐标。
 *
 * 单位：入参是 WGS-84 **度**。
 */
function coordPart(value: number, positive: string, negative: string): string {
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${degrees}°${pad2(minutes)}'${value >= 0 ? positive : negative}`;
}

/**
 * 经纬度 → `LAT 23°02'N LON 114°24'E`（度分档，秒舍入到分）。
 *
 * 规则：
 * - 度不补零（`23°` / `151°`），分补两位（`02'`）；
 * - 秒四舍五入到整分，`59.6 分` 进位到度（见 `coordPart`）；
 * - 纬度在前、经度在后，中间一个空格，前面分别加 `LAT ` / `LON `；
 * - 北纬 / 东经 `N` / `E`，南纬 / 西经 `S` / `W`。
 *
 * 测试点（实测，度与方向之间**没有空格**）：
 *   `(23.0333, 114.4)   → "LAT 23°02'N LON 114°24'E"`
 *   `(-33.8688, 151.2093) → "LAT 33°52'S LON 151°13'E"`
 *
 * ⚠️ 本文件早先的注释与任务书里把这两条写成 `LAT 23°02' N`（度与方向之间带空格），
 * 与 `coordPart` 的模板串不符；全仓库从未有过带空格的实现，探针按真实输出断言。
 *
 * ⚠️ 规格给的第二组测试点写的是 `LON 151°12'E`，但 0.2093° = 12.558 分，
 * 按"四舍五入到整分"是 `13'`（要得到 `12'` 必须改成截断，那样第一组又会变成 `23°01'`）。
 * 这里**按写在规格里的规则**实现；要改成截断，把 `coordPart` 里的 `Math.round`
 * 换成 `Math.floor` 一处即可。结论已写进报告。
 *
 * 为什么放这里而不是 `locationStamp.ts`：`ResolvedPlace.coords` 是**离线算**的，
 * 和反查（联网）不是一回事；放纯字符串模块里，测试和调试都不需要 mock 原生模块。
 */
export function formatCoords(latitude: number, longitude: number): string {
  return `LAT ${coordPart(latitude, 'N', 'S')} LON ${coordPart(longitude, 'E', 'W')}`;
}

/**
 * 不带 `LAT ` / `LON ` 前缀的纯坐标：`23°02'N 114°24'E`。
 *
 * 留给"自己已经拼好前缀"的调用方（例如想把坐标接在地名后面），
 * 和 `formatCoords` 共用同一套舍入规则，不会出现两种精度。
 */
export function formatCoordsPlain(latitude: number, longitude: number): string {
  return `${coordPart(latitude, 'N', 'S')} ${coordPart(longitude, 'E', 'W')}`;
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
 * **它为什么不吃语言参数**（§五.2 的"让 resolvePlaceFromGeocode 走它"该怎么理解）：
 * 这个函数只做"反查结果 → 结构"，一行字都不拼，所以它对语言**真的没有可判之处**；
 * 给它加一个 `geoLocale` 只会得到一个装饰性参数（而且 `ResolvedPlace` 也没有地方存语言 ——
 * 存了就违背本文件开头"存结构、渲染时才拼"那条原则）。所以地名语言在这里的落点是
 * **调用点上一行**：`locationStamp.ts` 是先 `const locale = resolveGeoLocale(geoSettings, uiLocale)`
 * 再调本函数、然后把同一个 `locale` 交给 `formatResolvedPlace`。
 * 判断只有 `resolveGeoLocale` 一处。
 *
 * ⚠️ **相册导入那条路（`importPhoto.ts`）不调 `resolveGeoLocale`**，这是有意的：
 * 反查出来的 `ResolvedPlace` 要一路带到渲染层，中间隔着一次串行导入（用户可能改设置、
 * 也可能切界面语言）—— 在这里把语言**定死**就等于"按导入那一刻的语言印"，
 * 而项目里其他地方都是"按看到那一刻的语言印"。所以它只把界面语言原样交下去，
 * 由渲染层（`FilmCompositor` → `formatResolvedPlace`）调用 `resolveGeoLocale` 定语言。
 */
export function resolvePlaceFromGeocode(
  address: PlaceGeocodeAddress | null | undefined,
  latitude: number,
  longitude: number,
  fallbackCity?: string,
): ResolvedPlace {
  const source = address ?? {};
  return {
    /*
      逐级降级（顺序 = 优先级，"离拍摄点最近的那一档"优先）：
        city → name → district → subregion → region → fallbackCity → street → formattedAddress

      为什么 `name`（POI 名）排在 `city` **之后**、却排在 `district` 之前：
      · 排 `city` 之后 —— 真行政市名更稳、更"像个地名"，而 POI 名可能是店名
        （`'スターバックス'`）、也可能改名字；只要城市名在，就该用城市名。
        iOS 对城市里的地址一般都给得出 `city`，所以 `name` 真正生效的场景是
        "城里查不到名字"的地方：机场、车站、山顶、荒野 —— 恰好是这次出问题的那类照片。
      · 排 `district` 之前 —— `name` 是"我站在哪个具体地方"，`district` 只是"我在哪个区"。
        相机页那行字要的是"这是哪儿"，具体地点比更大的行政区更接近答案。
      ⚠️ 已知代价（本轮**不动**它）：`full` 档位会把行政级别词直接粘在名字后面
      （`resolvePlaceFromGeocode` 的结果进 `formatChinesePlace` 时走 `ensureAdminSuffix`），
      于是 POI 在 `city` 槽里会渲染成 `熊本空港市` / `Kumamoto Airport市`。
      这是 `ensureAdminSuffix` 的既有行为（对非中文名也照样粘"市"），
      不是这一行引入的；修它要改渲染层，属于另一件事。

      为什么 `street` 排在最末（连调用方给的 `fallbackCity` 都优先于它）：
      一条孤零零的街道名（`'1-1 Chome'`）是这一行里上下文最少的东西，
      而 `fallbackCity` 至少是"别处已知的城市名"，城市名永远比街道名更像地名。
      ⚠️ 但 `street` 一旦被用上，这张照片就算"有地名"（`hasPlaceName` 判的是这个槽位非空），
      会印街道而不是坐标 —— 这是本轮**有意翻转**的旧判断（上一版把"系统只回了街道名"
      当成"没有地名"，直接退坐标）。翻转的理由：用户喷的是"只印了坐标"，
      而街道名哪怕只有一条，也是"这张照片在哪儿"的真实信息，比坐标可读。
      要退回旧行为：把下面这一项 `source.street` 删掉即可，别的都不用动。

      ⚠️ 港澳台那条红线**不在这一行**：`region` / `country` / `isoCountryCode`
      取哪一格、怎么拼、前缀怎么加，一个字都没动（见下面四行和 `GREATER_CHINA`）。
    */
    city: firstNonEmpty(
      source.city,
      source.name,
      source.district,
      source.subregion,
      source.region,
      fallbackCity,
      source.street,
      source.formattedAddress,
    ),
    // `region` 单独留一份：`full` 档位在"没有城市"时要拿它顶上（见 `pickBaseName`）。
    region: firstNonEmpty(source.region, source.subregion),
    country: clean(source.country),
    countryCode: clean(source.isoCountryCode).toUpperCase(),
    coords: formatCoords(latitude, longitude),
  };
}

/**
 * 只有坐标、没有任何地名的结构（`city` / `region` / `country` / `countryCode` 全是空串）。
 *
 * **两个调用点共用它，一个字都不许各写一份**：
 * - `locationStamp.ts` 的"坐标档"（用户明确选了"只印坐标"）；
 * - `importPhoto.ts` 的反查失败兜底（老照片拿不到地名，退成坐标）。
 *
 * ⚠️ **不许**用 `resolvePlaceFromGeocode(null, lat, lng)` 来省这一行 —— 那个函数
 * 走的是"逐级降级"（`city → name → district → subregion → region → fallbackCity → street`），
 * 传 `null` 进去照样会从兜底里取出非空值，形状和"只有坐标"**不一样**。
 * 这个形状只有一个来源，所以"坐标档"在成片、
 * 在相机页 LCD、在导入的老照片上永远是同一个样子。
 *
 * 渲染出来是什么：`formatResolvedPlace` 逐级降级到最后一档，返回的就是 `coords`
 * 本身（`LAT 23°02'N LON 114°24'E`）。
 */
export function coordsOnlyPlace(latitude: number, longitude: number): ResolvedPlace {
  return {
    city: '',
    region: '',
    country: '',
    countryCode: '',
    coords: formatCoords(latitude, longitude),
  };
}

/**
 * 这个结构里**有没有任何一个地名**（只看四个名字字段，不看 `coords`）。
 *
 * 为什么不能拿 `formatResolvedPlace(...).trim().length > 0` 来代替：那个渲染器在
 * 一个字段都没有时会**退回坐标串**，于是"什么都没解析出来"和"解析出了一个城市"
 * 一样都是非空 —— 也就是永远判成"有地名"。
 *
 * 调用点：反查"成功"但一个字段都没给（海上、极地、iOS 回了个空对象 `{}`），
 * 这一行没有任何信息量，调用方据此退回"只有坐标"（和 `locationStamp.ts` 里
 * `text.trim().length > 0 ? ok : failed` 对同一种情形的判断是同一个意思）。
 *
 * ⚠️ 反过来说：**只有街道名**（`street`）的那种结果算"有地名" —— 它落在 `city` 槽里，
 * 所以这里判真、成片会印那条街。这是本轮有意翻转的旧判断，
 * 取舍写在 `resolvePlaceFromGeocode` 里 `source.street` 那一项旁边。
 */
export function hasPlaceName(place: ResolvedPlace): boolean {
  return (
    place.city.trim().length > 0 ||
    place.region.trim().length > 0 ||
    place.country.trim().length > 0 ||
    place.countryCode.trim().length > 0
  );
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
 * `中国 · 广东 · 梅州` 里的「市 / 省」是行政区划层级，下一段的国名已经说明了这是哪一级。
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

/* ==========================================================================
 * 一行字的拼装（新规格：国家在最前 / 两档详细度）
 * ========================================================================== */

/** 中文档语言（简 / 繁 / 日）—— 用类型把"走哪一档"钉死。 */
type ChineseLocale = 'zh-Hans' | 'zh-Hant' | 'ja';

/** 中文档语言判定，顺带把类型收窄（`formatResolvedPlace` 靠它分流，所以不用断言）。 */
function isChineseLocale(locale: LocaleId): locale is ChineseLocale {
  return locale !== 'en' && locale !== 'fr';
}

/**
 * 地名语言 → 真正拿去拼字的那种语言（§五.2 的收口函数）。
 *
 * 为什么需要它：**界面语言**和**地名语言**是两件事。界面是日文、地名要印英文
 * （`geoLocale: 'en'`）是完全合理的组合；反过来界面法语、地名印简中也一样。
 * 界面语言回答"按钮上写什么字"，地名语言回答"反查回来的行政名该按哪套词表排"。
 *
 * `'auto'` 的语义（按规格，也是这里唯一有判断的地方）：界面语言本身就是
 * `zh-Hans` / `zh-Hant` / `ja` / `en` 时就用它自己；**只有 fr 退回 `'en'`** ——
 * v1.8.5 起 ja 是地名语言的一等公民（日语有可靠的汉字 + 假名词表，能撑起自己那一档），
 * 法语仍然没有可用的行政名词表，硬撑着拼只会得到半汉半欧的怪东西。
 * 这个"退回"是**下结论**不是兜底：'en' 那一档有 `romanizeForEnglish` + 拉丁国名表，
 * 是唯一能保证"任何输入都有像样输出"的一档。
 *
 * 入参故意收 `LocalePreference | undefined` 而不是只收 `GeoLocale | 'auto'`：
 * 调用方手里可能只有"当前界面语言"这一个值（它自己也可能是 ja / fr），
 * 多一层类型体操不如让这一个函数把五种语言全接住、在内部判掉。
 */
export function resolveGeoLocale(geoLocale: LocalePreference | undefined, uiLocale: LocaleId): GeoLocale {
  if (geoLocale !== undefined && geoLocale !== 'auto') {
    return isGeoLocale(geoLocale) ? geoLocale : 'en';
  }
  switch (uiLocale) {
    case 'zh-Hans':
      return 'zh-Hans';
    case 'zh-Hant':
      return 'zh-Hant';
    case 'ja':
      return 'ja';
    default:
      // 'en' 自己、'fr' 退回 'en'（理由见上）。
      return 'en';
  }
}

/**
 * 这个字符串是不是地名语言四选一。
 *
 * 存在的意义只有一个：`resolveGeoLocale` 的入参被放宽到了五种界面语言，
 * 而设置里那个值理论上只可能是四种（或 `'auto'`）—— 万一持久化的旧数据里
 * 混进了 `'fr'`，这里会把它判掉并退到 'en'，而不是让法文档悄悄生效。
 */
function isGeoLocale(value: LocalePreference): value is GeoLocale {
  return value === 'zh-Hans' || value === 'zh-Hant' || value === 'ja' || value === 'en';
}

/**
 * 把反查给的国家代码归一成 alpha-2（`CN` / `JP` / `HKG` / `JPN` 都要认）。
 *
 * 三级判据，顺序不能换：
 * 1. 已经是 alpha-2（`ALPHA3` 的键）→ 原样；
 * 2. 是 alpha-3（`ALPHA3` 的值）→ 查反表换回 alpha-2；
 * 3. 没有可用代码、只有国名：拿 `COUNTRY_NAMES` 的英文名反查（`country` 字段跟
 *    反查语言走，中文反查给「日本」时前两级都救不了它 —— 这一级是给**英文档**兜底的，
 *    中文档反正按界面地名语言自己出词，不依赖 `place.country`）。
 *
 * 代码形态但不在 `ALPHA3` 里的值（`'XX'` / `'XYZ'`）原样返回，供运行时地区名和最终
 * ISO 代码兜底使用。**没有代码且国名也反查不到**才返回空串。
 *
 * 归一化的意义见 `COUNTRY_NAMES` 上方：国家段只认代码，不认反查语言。
 */
function normalizeCountryCode(place: ResolvedPlace): string {
  const raw = place.countryCode.trim().toUpperCase();
  if (raw.length > 0) {
    if (/^[A-Z]{2}$/.test(raw) && ALPHA3[raw] !== undefined) {
      return raw;
    }
    return ALPHA3_TO_ALPHA2[raw] ?? raw;
  }
  // 没有代码，只有国名：用英文名反查（见上，只对英文档有意义）。
  if (place.country.trim().length > 0) {
    const wanted = place.country.trim().toUpperCase();
    for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
      if (names.en === wanted) {
        return code;
      }
    }
  }
  return '';
}

/** 拉丁国名比较键：大写、去点、空白折叠（`' P.R. China '` → `'PR CHINA'`）。 */
function normalizeLatinAliasKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

/**
 * 国名 → alpha-2 反查（v1.9.2 §6）：把反查给的国名（四语词 + 拉丁别名）翻回代码。
 *
 * 三级判据：`COUNTRY_NAMES` 四语词（反查语言可能是中文 / 日文，代码缺失时也得救）
 * → 港澳台本地写法（`TERRITORY_NAMES`：`香港` / `澳門` / `TAIWAN` …）→ 拉丁别名表
 * （大小写 / 空白 / 尾点不敏感，alpha-3 由 `ALPHA3` 反表兜底）。查不到返回空串。
 *
 * **没有副作用、也不改英文档**：只会被 `resolveCountryCode` 在「中文 / 日文档」里调用。
 */
function codeFromCountryName(country: string): string {
  const raw = country.trim();
  if (raw.length === 0) {
    return '';
  }
  for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
    if (
      names.en === raw.toUpperCase() ||
      names['zh-Hans'] === raw ||
      names['zh-Hant'] === raw ||
      names.ja === raw
    ) {
      return code;
    }
  }
  for (const [code, names] of Object.entries(TERRITORY_NAMES)) {
    if (names.includes(raw) || names.includes(raw.toUpperCase())) {
      return code;
    }
  }
  const key = normalizeLatinAliasKey(raw);
  const alias = LATIN_COUNTRY_ALIASES[key];
  if (alias !== undefined) {
    return alias;
  }
  // alpha-3 / 小写 alpha-2 塞进国名槽：`JPN` / `CHN` / `cn`。
  const fromAlpha3 = ALPHA3_TO_ALPHA2[key];
  if (fromAlpha3 !== undefined) {
    return fromAlpha3;
  }
  if (/^[A-Z]{2}$/.test(key) && ALPHA3[key] !== undefined) {
    return key;
  }
  return '';
}

/**
 * 中文 / 日文档的国家代码归一（v1.9.2 §6 防御性归一化）。
 *
 * `normalizeCountryCode` 的英文档口径**原样保留**；本函数只在它的结果"中文档根本
 * 印不出国家段"时再兜一次：
 * 1. 代码归一后是 `COUNTRY_NAMES` / 港澳台认识的代码 → 直接用；
 * 2. 否则拿 `place.country` 反查（`CHINA` / `Japan` / `中国` / `香港` …）；
 * 3. 再否则拿 `countryCode` 槽本身当国名反查（真机见过把 `'CHINA'` 塞进代码槽的）；
 * 4. 都失败才退回 1 的原始归一值，让运行时地区名或 ISO 代码兜底。
 *
 * 英文档不走这里（`formatLatinPlace` / `countryWord('en')` 继续用
 * `normalizeCountryCode`），所以「英文档逐字不变」是结构性保证。
 */
function resolveCountryCode(place: ResolvedPlace): string {
  const direct = normalizeCountryCode(place);
  if (direct.length > 0 && (COUNTRY_NAMES[direct] !== undefined || isGreaterChina(direct))) {
    return direct;
  }
  const viaCountry = codeFromCountryName(place.country);
  if (viaCountry.length > 0) {
    return viaCountry;
  }
  const viaCodeSlot = codeFromCountryName(place.countryCode);
  if (viaCodeSlot.length > 0) {
    return viaCodeSlot;
  }
  return direct;
}

/**
 * 国家段用哪个词 —— **这条是 v1.8.5 的核心修正**。
 *
 * 为什么不能再用旧实现「`place.country` 有值就原样印」：`country` 字段跟的是**反查请求
 * 的语言**，而地名语言是另一个设置。中文界面 + 英文反查会拿到 `'Japan'`，直接印就是
 * 「日本 · 兵庫県 · JAPAN」这种中英混血（用户 m02760 §四 的真机痛点）。所以：
 *
 * - 港澳台：一律 `CHINA_PREFIX[locale]`（简/繁/日 = 中国/中國/中国，en = CHINA）；
 * - 有国家代码：查 `COUNTRY_NAMES`，取**地名语言**那一列；
 * - 代码和固定词典都认不出来：尝试运行时地区名；旧系统再保留原始国名或 ISO 代码，
 *   确保任何国家都不会因为词典覆盖不足而消失。
 *
 * `locale` 参数故意收 `GeoLocale` 而不是 `LocaleId`：法文界面永远走英文档
 * （`resolveGeoLocale` 已经判掉 fr），多给一种语言只会让表里多一列没人用的「国名」。
 */
function countryWord(place: ResolvedPlace, locale: GeoLocale): string {
  // v1.9.2 §6：英文档保持原归一（逐字不变）；中文 / 日文档走防御性代码归一，
  // 保证 `place.country` 是 `CHINA` / `JAPAN` 这类拉丁名（代码缺失 / 不认识）时
  // 也能映射成「中国 / 中國 / 日本」，而不是把拉丁尾巴漏到行尾。
  const code = locale === 'en' ? normalizeCountryCode(place) : resolveCountryCode(place);
  if (isGreaterChina(code)) {
    return CHINA_PREFIX[locale];
  }
  const names = code.length > 0 ? COUNTRY_NAMES[code] : undefined;
  if (names !== undefined) {
    return names[locale];
  }
  /*
   * 词典只收了常见旅行目的地，但系统反查支持全部 ISO 地区。以前表外国家在
   * 中文/日文档会被直接丢掉；当系统又只回 country/countryCode 时，整行最终
   * 退成坐标，看起来就像“国外定位识别不出来”。优先用运行时 Intl 的地区名，
   * Hermes / iOS 不支持 DisplayNames 时再保留系统国名或 ISO 代码，保证信息不消失。
   */
  if (/^[A-Z]{2}$/.test(code)) {
    try {
      const displayNamesConstructor = (
        Intl as typeof Intl & {
          DisplayNames?: new (
            locales: string | readonly string[],
            options: { type: 'region' },
          ) => { of(regionCode: string): string | undefined };
        }
      ).DisplayNames;
      if (displayNamesConstructor !== undefined) {
        const displayLocale: Record<GeoLocale, string> = {
          'zh-Hans': 'zh-CN',
          'zh-Hant': 'zh-TW',
          ja: 'ja-JP',
          en: 'en-US',
        };
        const displayed = new displayNamesConstructor(displayLocale[locale], { type: 'region' }).of(code);
        if (displayed !== undefined && displayed.trim().length > 0 && displayed.toUpperCase() !== code) {
          return locale === 'en' ? displayed.toUpperCase() : displayed;
        }
      }
    } catch {
      // 部分旧系统只有基础 Intl；下面仍会保留系统返回的国名或国家码。
    }
  }
  if (locale === 'en') {
    // 英文档兜底：拉丁国名大写（反查给 `Japan` 也算），再不然 alpha-3。
    return LATIN_ONLY.test(place.country) ? place.country.toUpperCase() : alpha3Of(code, place.country);
  }
  return place.country.trim() || code;
}

/**
 * `region` 与城市不同名时返回它，否则返回空串。
 *
 * ⚠️ **`compactPlace` 也用它**：精简（把 `region` 置空）只能动"真的另有一级行政区"的那种
 * region。`region === city` 的那些（香港 / 澳门，反查两边给的都是地区名本身）一旦被置空，
 * `full` 档就会少掉「香港」这半截、又给城市补一个「市」—— 变成 `中国市` 这种既缺字
 * 又荒谬的串（`isTerritoryCity` 只在 city 还在时才认得出升格）。所以两处共用同一个判据，
 * 别在 `compactPlace` 里重写一遍。
 *
 * 实测（探针 `.probe-geo/hk-check.js`，走真函数）：`region` 空或等于 `city` 时，
 * 香港 `full` 档都是 `中国 · 香港特别行政区` —— 这是 v1.5.0 起的现状，
 * **不是本轮引入的**；`compactPlace` 在这两种形状下都原样返回、一个字段都不动。
 */
function distinctRegion(place: ResolvedPlace): string {
  return place.region.length > 0 && place.region !== place.city ? place.region : '';
}

/** 城市那一格填的是不是**地区名本身**（`香港` / `澳門`）—— 是的话城市直接升格成地区名。 */
function isTerritoryCity(city: string, countryCode: string): boolean {
  const names = TERRITORY_NAMES[countryCode];
  if (names === undefined || city.length === 0) {
    return false;
  }
  const stripped = stripAdminSuffix(city).toUpperCase();
  return names.some((name) => name.toUpperCase() === stripped);
}

/** 港澳台在某种语言里的地区名（`台湾` / `台灣` / `TAIWAN`）。 */
function greaterChinaLabel(countryCode: string, locale: LocaleId): string {
  return GREATER_CHINA_LABEL[locale][countryCode] ?? '';
}

/**
 * 已经有行政级别词的尾巴。
 *
 * 比 `ADMIN_SUFFIX` 宽一档（多了 `都 / 道 / 府 / 州 / 盟 / 県`）：`ensureAdminSuffix` 用它判断
 * "要不要补一个「市」"，而 `stripAdminSuffix` 仍用窄的那一张 —— `archive` 档剥后缀是给
 * 中文地名用的，顺手把「東京都」剥成「東京」是另一件事，不在本次改动范围内。
 * `県` 是 v1.8.5 加日文档时补的：日文地名 `兵庫県` / `長野県` 必须被认成"已带级别词"，
 * 否则 `full` 档会补成「兵庫県市」（`ja` 两档都保后缀，撞上这条就会出洋相）。
 */
const ADMIN_TAIL = /(特别行政区|特別行政區|特別行政区|自治区|自治區|市|省|县|縣|区|區|町|村|都|道|府|州|盟|県)$/u;

/** 补行政级别词（只给中文档用）：已经有任何一级后缀就原样返回，免得印出「深圳市市」。 */
function ensureAdminSuffix(value: string, suffix: string): string {
  if (value.length === 0) {
    return '';
  }
  // 海外反查常给 Paris / California，中文界面的“完整”档不能拼成 Paris市 / California省。
  const containsHan = /\p{Script=Han}/u.test(value);
  return ADMIN_TAIL.test(value) || !containsHan ? value : `${value}${suffix}`;
}

/**
 * 「特别行政区」在三种中文档里的写法（简 / 繁 / 日）。
 *
 * 日文用新字体「特別行政区」：拿繁体的「特別行政區」去印日文界面就是简繁混排。
 */
const SPECIAL_ADMIN_REGION: Record<ChineseLocale, string> = {
  'zh-Hans': '特别行政区',
  'zh-Hant': '特別行政區',
  ja: '特別行政区',
};

/**
 * 两个行政名是不是"同一个地方"（同名去重）。
 *
 * 用在三处：`東京都` 与城市 `東京`（反查给的两级名字本来就会重叠）、`新加坡` 这种
 * 城国（国家与城市同名）、以及港澳台城市名与地区名相同。判据是**剥掉行政后缀再比**：
 * `東京都` 剥「都」= `東京`，与城市 `東京` 相等 → 城市段让位，避免
 * `日本 · 東京都 · 東京` / `TOKYO · TOKYO · JAPAN` 这种把同一级印两遍的行。
 */
function isSameAdministrativeName(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const coreA = a.replace(ADMIN_TAIL, '');
  const coreB = b.replace(ADMIN_TAIL, '');
  return coreA.length > 0 && coreA === coreB;
}

/* ==========================================================================
 * 汉字简繁归一（v1.9.3 §5.1）
 *
 * 目的：`zh-Hant` 档整行必须繁体（`中國 · 雲南省 · 麗江市`），`zh-Hans` 档整行必须
 * 简体（`中国 · 云南省 · 丽江市`）。系统反查回填的
 * `country` / `region` / `city` 是**另一套字形**（繁体 → 简中档、简中 → 繁中档、
 * 混排）时，渲染前按目标档位做一次确定性归一；`ja` / `en` 一个字节都不动。
 *
 * 约束（`_probe_v185_place.cjs` §⑭ 逐条钉）：
 * - 表只收行政区划 / 地名里真会出现的字（约 190 对），不做通用简繁转换；
 * - 不在表里的字**原样保留**（未知字不崩不丢）；
 * - 「台」只有「台湾 / 台北 / 台中 / 台南 / 台东 / 台西」这些**短语**在 `zh-Hant`
 *   档写成「臺」，其余「台」保持原样（`台州` 不写成 `臺州`，`烟台` 不写成 `煙臺`）。
 * ========================================================================== */

/** 简 → 繁对照（只覆盖行政区划 / 地名字，含「臺灣」相关短语的单字）。 */
const HAN_SIMPLIFIED_TO_TRADITIONAL: ReadonlyArray<readonly [string, string]> = [
  // ── 行政级别词 / 通用后缀 ──
  ['别', '別'], ['区', '區'], ['县', '縣'], ['乡', '鄉'], ['镇', '鎮'], ['庄', '莊'], ['场', '場'],
  ['团', '團'], ['营', '營'], ['队', '隊'], ['组', '組'], ['师', '師'], ['军', '軍'], ['农', '農'],
  ['垦', '墾'], ['业', '業'], ['机', '機'], ['线', '線'], ['处', '處'], ['会', '會'], ['众', '眾'],
  ['图', '圖'], ['园', '園'], ['圆', '圓'], ['国', '國'], ['库', '庫'], ['坛', '壇'], ['观', '觀'],
  ['览', '覽'], ['庙', '廟'], ['阁', '閣'], ['楼', '樓'], ['桥', '橋'], ['铺', '鋪'], ['窑', '窯'],
  ['砖', '磚'], ['闸', '閘'], ['坝', '壩'], ['沟', '溝'], ['滩', '灘'], ['湾', '灣'], ['岛', '島'],
  ['屿', '嶼'], ['峡', '峽'], ['岭', '嶺'], ['冈', '岡'], ['岗', '崗'], ['关', '關'], ['门', '門'],
  ['阳', '陽'], ['阴', '陰'], ['东', '東'], ['滨', '濱'], ['边', '邊'], ['头', '頭'], ['远', '遠'],
  ['连', '連'], ['长', '長'], ['运', '運'], ['临', '臨'], ['绥', '綏'], ['兴', '興'], ['双', '雙'],
  ['鲜', '鮮'], ['达', '達'], ['独', '獨'], ['诺', '諾'], ['邮', '郵'], ['围', '圍'], ['户', '戶'],
  ['雾', '霧'], ['岚', '嵐'],
  // ── 山川 / 物产类地名字 ──
  ['马', '馬'], ['车', '車'], ['鸟', '鳥'], ['鱼', '魚'], ['龙', '龍'], ['凤', '鳳'], ['鹤', '鶴'],
  ['鸡', '雞'], ['鸭', '鴨'], ['鹅', '鵝'], ['鹰', '鷹'], ['树', '樹'], ['桦', '樺'], ['杨', '楊'],
  ['兰', '蘭'], ['莲', '蓮'], ['芦', '蘆'], ['华', '華'], ['矿', '礦'], ['铁', '鐵'], ['钢', '鋼'],
  ['铜', '銅'], ['银', '銀'], ['铅', '鉛'], ['锌', '鋅'], ['锡', '錫'], ['铝', '鋁'],
  // ── 省级行政区名称里的字 ──
  ['庆', '慶'], ['广', '廣'], ['宁', '寧'], ['辽', '遼'], ['苏', '蘇'], ['贵', '貴'], ['云', '雲'],
  ['陕', '陝'], ['肃', '肅'], ['内', '內'], ['乌', '烏'], ['鲁', '魯'], ['齐', '齊'], ['维', '維'],
  ['尔', '爾'], ['壮', '壯'], ['丰', '豐'], ['复', '復'], ['冲', '沖'], ['汉', '漢'], ['满', '滿'],
  ['纳', '納'], ['颇', '頗'],
  // ── 地级市 / 县 / 姓氏类常见字 ──
  ['张', '張'], ['陈', '陳'], ['刘', '劉'], ['赵', '趙'], ['孙', '孫'], ['吴', '吳'], ['郑', '鄭'],
  ['韩', '韓'], ['吕', '呂'], ['罗', '羅'], ['陆', '陸'], ['饶', '饒'], ['郸', '鄲'], ['沧', '滄'],
  ['晋', '晉'], ['应', '應'], ['义', '義'], ['宝', '寶'], ['实', '實'], ['寻', '尋'], ['乐', '樂'],
  ['荣', '榮'], ['盘', '盤'], ['抚', '撫'], ['顺', '順'], ['锦', '錦'], ['伦', '倫'], ['贝', '貝'],
  ['彦', '彥'], ['温', '溫'], ['绍', '紹'], ['盐', '鹽'], ['扬', '揚'], ['迁', '遷'], ['丽', '麗'],
  ['芜', '蕪'], ['厦', '廈'], ['赣', '贛'], ['济', '濟'], ['枣', '棗'], ['潍', '濰'], ['泽', '澤'],
  ['开', '開'], ['顶', '頂'], ['许', '許'], ['驻', '駐'], ['随', '隨'], ['潜', '潛'], ['怀', '懷'],
  ['娄', '婁'], ['钦', '欽'], ['贺', '賀'], ['亚', '亞'], ['贡', '貢'], ['泸', '瀘'], ['绵', '綿'],
  ['宾', '賓'], ['资', '資'], ['凉', '涼'], ['毕', '畢'], ['红', '紅'], ['萨', '薩'], ['则', '則'],
  ['陇', '隴'], ['离', '離'], ['玛', '瑪'], ['后', '後'], ['恒', '恆'], ['蓟', '薊'],
];

/**
 * 「臺」系短语（只给 `zh-Hant` 方向用）。
 *
 * 「台」在简体里同时是「臺」「檯」「颱」的简化字，单字映射无法判断：「台湾 / 台北」
 * 在繁体里写「臺灣 / 臺北」，而「台州 / 烟台 / 台山」里的「台」本来就是正字。
 * 所以只对这几个固定短语做「台 → 臺」，其余「台」原样保留。
 */
const HAN_TRADITIONAL_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['台湾', '臺灣'],
  ['台灣', '臺灣'],
  ['台北', '臺北'],
  ['台中', '臺中'],
  ['台南', '臺南'],
  ['台东', '臺東'],
  ['台西', '臺西'],
];

const SIMPLIFIED_TO_TRADITIONAL: ReadonlyMap<string, string> = new Map(HAN_SIMPLIFIED_TO_TRADITIONAL);

/**
 * 只出现在「臺」系短语里的字：单字表不能收「台」（否则 `台州 / 烟台` 会被误转），
 * 但繁 → 简方向必须能把「臺」收回来，所以反向表单独补这一条。
 */
const HAN_TRADITIONAL_ONLY_EXTRAS: ReadonlyArray<readonly [string, string]> = [['臺', '台']];

const TRADITIONAL_TO_SIMPLIFIED: ReadonlyMap<string, string> = new Map([
  ...HAN_SIMPLIFIED_TO_TRADITIONAL.map(([simplified, traditional]) => [traditional, simplified] as const),
  ...HAN_TRADITIONAL_ONLY_EXTRAS,
]);

const TRADITIONAL_PHRASES: ReadonlyMap<string, string> = new Map(HAN_TRADITIONAL_PHRASES);

/** 短语表里最长的键（当前全是两字；写成变量免得以后加三字地名要改循环）。 */
const HAN_PHRASE_MAX_LENGTH = HAN_TRADITIONAL_PHRASES.reduce(
  (max, [phrase]) => Math.max(max, phrase.length),
  2,
);

/**
 * 逐字过表；命中短语优先（最长匹配）。
 *
 * 命中不了的字 `原样` 输出（未知字保底），这也是「不崩不丢」的实现方式。
 */
function translateHan(
  text: string,
  table: ReadonlyMap<string, string>,
  phrases?: ReadonlyMap<string, string>,
): string {
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    let replaced = false;
    if (phrases !== undefined && text.length - index >= 2) {
      for (let length = HAN_PHRASE_MAX_LENGTH; length >= 2; length -= 1) {
        const chunk = text.slice(index, index + length);
        const phrase = phrases.get(chunk);
        if (phrase !== undefined) {
          output += phrase;
          index += length - 1;
          replaced = true;
          break;
        }
      }
    }
    if (replaced) {
      continue;
    }
    const current = text.charAt(index);
    const mapped = table.get(current);
    output += mapped !== undefined ? mapped : current;
  }
  return output;
}

/** 整串转繁体（`zh-Hant` 档；`臺灣 / 臺北` 等短语走单独一张表）。 */
export function toTraditionalHan(text: string): string {
  return translateHan(text, SIMPLIFIED_TO_TRADITIONAL, TRADITIONAL_PHRASES);
}

/** 整串转简体（`zh-Hans` 档；`臺灣 → 台湾` 由繁 → 简单字表负责）。 */
export function toSimplifiedHan(text: string): string {
  return translateHan(text, TRADITIONAL_TO_SIMPLIFIED);
}

/**
 * 按目标中文档位归一（`ja` 原样返回）。
 *
 * 归一必须**幂等**：已经是对应字形的名字过一遍不变（探针 §⑭ 会连跑两遍逐字比对）。
 */
export function normalizeHanVariant(text: string, locale: ChineseLocale): string {
  if (text.length === 0 || locale === 'ja') {
    return text;
  }
  return locale === 'zh-Hant' ? toTraditionalHan(text) : toSimplifiedHan(text);
}

/**
 * 中文档（简 / 繁 / 日）的一行字 —— 国家 · 省 · 市，从大到小。
 *
 * 两档详细度的差别（`detail` × `locale` 的 4×2 行为，探针逐条钉）：
 * - `zh-Hans` / `zh-Hant`：`archive` 剥行政后缀（`中国 · 广东 · 梅州`），
 *   `full` 补回后缀、仍用 ` · `（`中国 · 广东省 · 梅州市`）；
 * - `ja`：**两档同形**，后缀一律保留（`日本 · 兵庫県 · 神戸市`）—— 日文地名本来
 *   就带 県/市，剥掉不是日文；这也是用户验收矩阵给日文行的写法；
 * - 港澳台（`TW` / `HK` / `MO`）：国家恒为「中国 / 中國 / 中国」；`archive` 只写地区名
 *   （`中国 · 香港`），`full` 中文两档补政区后缀（`中国 · 香港特别行政区`、
 *   `中国 · 台湾省 · 台北市`），日文仍只写地区名（`中国 · 香港`）。
 *
 * ⚠️ **政治表述（用户点名的红线）**：港澳台在**任何语言、两档详细度**下都必须带国家，
 * **绝不输出裸的「台湾 / 香港 / 澳门」**。中文档靠"国家在最前"实现；改这个函数之前
 * 先想清楚这件事。
 */
function formatChinesePlace(
  place: ResolvedPlace,
  locale: ChineseLocale,
  detail: PlaceDetail,
): string {
  // v1.9.2 §6：中文 / 日文档的代码归一必须和 `countryWord` 用同一个（防御性）口径，
  // 否则"国家段印了 中国、港澳台分支却没进"这种自相矛盾的行会出现。
  const code = resolveCountryCode(place);
  const gc = isGreaterChina(code);
  // ja 保后缀（语言差异）；中文两档在下面按 detail 分流。
  const keepSuffix = locale === 'ja';
  // v1.9.3 §5.1：整行字形按目标档位归一（ja / en 原样；未知字保底原样）。
  const han = (value: string): string => normalizeHanVariant(value, locale);
  const country = han(countryWord(place, locale));

  let region = '';
  let city = '';
  if (gc) {
    region = han(greaterChinaLabel(code, locale));
    if (!keepSuffix && detail === 'full') {
      // 台湾是「省」、港澳是「特别行政区」；日文档不补（见上）。
      region = `${region}${code === 'TW' ? '省' : SPECIAL_ADMIN_REGION[locale]}`;
    }
    // 城市那一格填的就是地区名本身（香港 / 澳门）时，地区段已经说了，别再重复。
    if (place.city.length > 0 && !isTerritoryCity(place.city, code)) {
      const normalizedCity = han(place.city);
      city = keepSuffix
        ? normalizedCity
        : detail === 'full'
          ? ensureAdminSuffix(normalizedCity, '市')
          : stripAdminSuffix(normalizedCity);
    }
  } else {
    region = han(distinctRegion(place));
    city = han(place.city);
    if (!keepSuffix) {
      if (detail === 'full') {
        region = ensureAdminSuffix(region, '省');
        city = ensureAdminSuffix(city, '市');
      } else {
        region = stripAdminSuffix(region);
        city = stripAdminSuffix(city);
      }
    }
  }

  // 同名去重：`東京都` + `東京`、城国（新加坡）这种，别把同一级印两遍。
  if (city.length > 0) {
    if (isSameAdministrativeName(city, country) || isSameAdministrativeName(city, region)) {
      city = '';
    }
  }
  if (region.length > 0 && isSameAdministrativeName(region, country)) {
    region = '';
  }

  return [country, region, city]
    .map((part) => han(part))
    .filter((part) => part.length > 0)
    .join(PLACE_SEPARATOR);
}

/**
 * 拉丁档（只有英文——法文界面在 `resolveGeoLocale` 里已经退回 en）的一行字。
 *
 * 形状（v1.8.5，两档同形）：`CITY · REGION · COUNTRY`，**小 → 大**。
 * 与中文档的"从大到小"方向相反是刻意的：英文地址 / 水印本来就从最小单位往外写
 * （用户验收矩阵：`MEIZHOU · GUANGDONG · CHINA`、`KOBE · HYOGO · JAPAN`），
 * 翻转顺序会读成 "the US of America"-式倒装。
 *
 * `archive` 与 `full` 同形：英文没有"补行政级别词"这回事（`Guangdong` 就是
 * `Guangdong`，加 `Province` 反而多余），剥不剥后缀则取决于反查自己给不给 ——
 * `pickRomanized` 只做罗马字化，不猜行政级别。两档差异留给中文档。
 *
 * 罗马字化做不到完整（见 `romanizeForEnglish`）：反查给什么就用什么，拿不到拉丁写法时
 * 退回本地写法（`台北 · TAIWAN · CHINA`），至少地名不会凭空消失。
 *
 * ⚠️ **政治表述（用户点名的红线）**：港澳台在**所有语言、两档详细度**下都必须带国家 ——
 * 拉丁档的形式是 `HONG KONG · CHINA`、`TAIPEI · TAIWAN · CHINA`，
 * **绝不输出裸的 `TAIWAN` / `HONG KONG` / `MACAU`**，也**绝不用 `TW` / `HK` / `MO`
 * 当国家段**（那等于把中国的地区写成了国家）。地区名一律走 `GREATER_CHINA_LABEL`
 * 我们自己的表，不采用反查给的 `country`；国家段同 `countryWord`，认代码不认反查语言。
 */
function formatLatinPlace(place: ResolvedPlace, detail: PlaceDetail): string {
  void detail; // 两档同形，参数保留是为了和 formatChinesePlace 的签名对称（见上方注释）。
  const code = normalizeCountryCode(place);
  const gc = isGreaterChina(code);
  const label = gc ? greaterChinaLabel(code, 'en') : '';
  const region0 = distinctRegion(place);

  let city = pickRomanized([place.city]) ?? stripAdminSuffix(place.city);
  let region = region0.length > 0 ? pickRomanized([region0]) ?? stripAdminSuffix(region0) : '';

  if (gc) {
    // 城市那一格就是地区名本身（香港 / 澳门）时，把它升格成城市名，别再重复一段。
    if (city.length === 0 || isTerritoryCity(place.city, code)) {
      city = label;
      region = '';
    } else {
      region = label;
    }
  }

  const country = countryWord(place, 'en');
  // 同名去重：`SINGAPORE · SINGAPORE` / `TOKYO · TOKYO · JAPAN` 这种把同一级印两遍的行。
  if (region.length > 0 && isSameAdministrativeName(region, city)) {
    region = '';
  }
  if (country.length > 0 && isSameAdministrativeName(country, city)) {
    city = '';
  }
  return [city, region, country].filter((part) => part.length > 0).join(PLACE_SEPARATOR);
}

/* 上一版的 `pickBaseName`（`城市（省）` / `城市 · CHN`）已随新规格删除：
 * 两档形状现在由 `formatChinesePlace` / `formatLatinPlace` 各自完整表达，
 * 中间那一层"主体"只会让"国家写在哪一段"变得难追。 */

/**
 * 结构化地名 → 一行显示文本（v1.8.5 地名纯净多语言）。
 *
 * **`detail` × 语言（4×2 行为，探针逐条钉）**：
 *
 * | 地名语言 | `archive`（标签档） | `full`（完整档） |
 * | --- | --- | --- |
 * | zh-Hans | `中国 · 广东 · 梅州` | `中国 · 广东省 · 梅州市` |
 * | zh-Hant | `中國 · 廣東 · 梅州` | `中國 · 廣東省 · 梅州市` |
 * | ja | `日本 · 兵庫県 · 神戸市` | 同 archive（**两档同形**，保后缀） |
 * | en | `MEIZHOU · GUANGDONG · CHINA` | 同 archive（**两档同形**） |
 * | 港澳台（简/繁/日） | `中国 · 香港` ｜ `中国 · 台湾 · 台北` | `中国 · 香港特别行政区` ｜ `中国 · 台湾省 · 台北市` |
 * | 港澳台（en） | `HONG KONG · CHINA` ｜ `TAIPEI · TAIWAN · CHINA` | 同 archive |
 *
 * 四条实现口径（为什么表长这样）：
 * - 中文两档的差别只在**行政后缀**：`archive` 剥（`广东`/`梅州`）、`full` 补
 *   （`广东省`/`梅州市`），分隔符两档都是 ` · `（v1.8.5 起不再粘成
 *   `中国广东省梅州市`，全角逗号也一并废除）；
 * - `ja` 两档同形且后缀一律保留：日文地名自带 `県 / 市`，剥了不是日文，
 *   `full` 也没有可补的级别词（`兵庫県` 已是完整写法）；
 * - `en` 两档同形：英文没有"补级别词"这回事，形状恒为 `CITY · REGION · COUNTRY`
 *   （**小→大**，与中文档方向相反，英文地址习惯如此）；
 * - 港澳台 `full` 在中文两档补政区后缀（特别行政区 / 省），`ja` / `en` 不补。
 *
 * 港澳台在任何语言、两档下都带国家 —— 这条红线的注释在 `formatChinesePlace` /
 * `formatLatinPlace` 上方各有一份，改拼接之前先读。
 *
 * **坐标档**：`ResolvedPlace` 里只有一个 `coords`（相机页"坐标档"、相册导入带 GPS 的
 * 照片）时，城市 / 省 / 国家全是空串，这里**退回坐标本身** —— 这是"坐标丢失"那个真
 * bug 的修复点：上一版拼出来是空串，坐标既进不了成片，也进不了相机页的 LCD。
 * 反查成功但一个字段都没解析出来的情形（海上、极地）走的也是这一支。
 *
 * 单位：无（纯字符串）。`locale` 必须传**当前界面语言**而不是拍摄时的语言 ——
 * 这正是存结构（`ResolvedPlace`）而不是存字符串的意义所在。
 *
 * 关于 §五.2 的那条"独立设置"：第 2 个参数现在可以收三种东西 ——
 * 已经解析好的 `LocaleId`（老调用方的写法，行为一字不变）、设置里的地名语言
 * （`GeoLocale`）、或者 `'auto'`。后两种都会先过 `resolveGeoLocale`，
 * 于是"界面 ja + 地名 en"这种组合不需要调用方自己算，也不会有人漏算一次。
 * 第 4 个参数 `uiLocale` 只在传 `'auto'`（或传了 ja/fr）时有意义：
 * 它就是 `'auto'` 要参照的那个界面语言。默认 `'zh-Hans'` 是为了让
 * "只传三个实参"的老调用方拿到和以前一样的结果。
 */
export function formatResolvedPlace(
  place: ResolvedPlace,
  locale: LocalePreference,
  detail: PlaceDetail,
  uiLocale: LocaleId = 'zh-Hans',
): string {
  // 收口：语言判断只在这一个函数入口做一次，下面两个分支拿到的都是确定的四选一。
  const resolved = resolveGeoLocale(locale, uiLocale);
  const line = isChineseLocale(resolved)
    ? formatChinesePlace(place, resolved, detail)
    : formatLatinPlace(place, detail);
  return line.length > 0 ? line : place.coords;
}

/**
 * 地名行用哪个字体族 —— 文末统一说明"为什么字体要跟地名语言走"。
 *
 * 返回值是 **React Native 字体族名**（直接喂给 `fontFamily`），`undefined` 表示
 * "不指定、沿用合成层默认字体"。
 *
 * - `ja` → `'Hiragino Mincho ProN'`：日文明朝体，与胶片相机那套复古排版最贴；
 * - `en` → `'Menlo'`：等宽无衬线，`MEIZHOU · GUANGDONG · CHINA` 这种全大写行
 *   用等宽字排开不会挤在一起，也符合"打字机 / 档案"的调性；
 * - `zh-Hans` / `zh-Hant` → `undefined`：中文行交给系统默认字体（iOS 的
 *   `PingFang SC/TC`、Android 的 `Noto Sans CJK` 都跟系统语言走，硬指定反而可能
 *   落到没有对应字重的族上，繁体还可能被简体字形覆盖）。
 *
 * **必须在渲染层用 `resolveGeoLocale` 的结果调它**，别传界面语言 —— 界面语言和
 * 地名语言是两个设置（同 `formatResolvedPlace` 的口径）。
 *
 * 单位：无。`GeoLocale` 四选一 → 字体名或 undefined。
 */
export function watermarkPlaceFont(locale: GeoLocale): string | undefined {
  switch (locale) {
    case 'ja':
      return 'Hiragino Mincho ProN';
    case 'en':
      return 'Menlo';
    default:
      // zh-Hans / zh-Hant：系统默认字体（理由见上）。
      return undefined;
  }
}

/** 坐标 / 地名都没拿到时，这一行是否还有意义（空串 = 这次不烧定位）。 */
export function isEmptyPlaceLine(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * 地名的**精简形**：只留国家 + 城市，把中间的省 / 州整个让出去。
 *
 * ## 为什么是"把 `region` 置成空串"而不是另写一套拼接
 *
 * 两条渲染路径本来就依赖"`region` 这一格有没有东西"：
 * · 中文档拼的是 `[国家, 地区, 城市]`，地区那一段来自
 *   `distinctRegion(place)`（`archive` 再剥后缀）—— `region` 一空，它自己就是空串；
 * · 英文档拼的是 `[城市, 地区, 国家]`，同样自然少一段。
 * 所以置空 `region` 之后**渲染器原样跑一遍**就得到「中国 · 上海」/「`SHANGHAI · CHINA`」，
 * 不需要在这里写第二套拼装。
 *
 * ⚠️ **红线不受影响，而且是靠"不碰"来保证的**：港澳台的「中国 / 中國 / CHINA」前置
 * 规则住在 `formatChinesePlace` / `formatLatinPlace` / `countryWord` 里，走的是
 * `countryCode` 与 `GREATER_CHINA_LABEL`，**一眼都没看 `region`**：
 * · 香港（`region` 与 `city` 都是「香港」）精简前后 `archive` 都渲染成 `中国 · 香港`
 *   （`full` 都渲染成 `中国 · 香港特别行政区`）；`distinctRegion` 本来就把
 *   "与城市同名的省"判成空串，置空等于什么都没有改变。
 * · 台北（`countryCode: TW`）精简后是 `中国 · 台湾 · 台北` —— 地区段来自
 *   `greaterChinaLabel`，不是 `place.region`，所以照样带国家。
 * 换句话说：**这个函数只影响"中国大陆 / 外国"的省名，一个字段都没动红线**。
 *
 * ## 什么时候用它
 *
 * 只在 `split` 版式里地名塞不进 `splitPlaceAvailableWidth` 时用
 * （判定见 `geometry.shouldCompactPlaceText`）。压缩是**全有或全无**的：
 * 与其把「上海市 · 黄浦…」截断，不如给一个完整的小地名。
 *
 * ⚠️ `full` 档（`中国 · 上海市`）用的是 `distinctRegion` + `ensureAdminSuffix`，
 * 置空 `region` 同样会少掉省那一段 —— 这是有意的：压缩形在两档详细度下都得"更短"，
 * 否则压缩了还是放不下。
 *
 * ⚠️ **只有 `distinctRegion` 认得的那种 region 才清**（本轮修）：`region` 与 `city` 同名的
 * （香港 / 澳门，反查两边给的都是地区名本身）**必须原样返回** —— 清了以后中文 `full`
 * 档会少掉「香港」那半截、再给空掉的城市补一个「市」，输出从
 * `中国 · 香港特别行政区` 退化成缺字的 `中国 · 市`；`archive` 档则因为地区段本来就来自
 * 城市，反而看起来"没事"，属于**只在完整档才暴露的坏味道**。用 `distinctRegion` 当判据 =
 * 与渲染器共用同一条"这算不算另一级行政区"的定义，不在两个地方各写一遍。
 * 探针逐字断言了精简前后：
 * 香港 `archive` 恒为 `中国 · 香港`、`full` 恒为 `中国 · 香港特别行政区`；
 * 台北 `archive` 恒为 `中国 · 台湾 · 台北`、`full` 恒为 `中国 · 台湾省 · 台北市`。
 */
export function compactPlace(place: ResolvedPlace): ResolvedPlace {
  const region = distinctRegion(place);
  // 没有"另一级行政区"可让 —— 原样返回，别为了"看起来精简了"去动任何字段。
  return region.length === 0 ? place : { ...place, region: '' };
}
