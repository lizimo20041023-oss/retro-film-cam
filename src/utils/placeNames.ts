/**
 * 地名水印的「结构化 → 一行字」渲染层 —— 纯字符串逻辑，没有 React、没有原生模块、没有副作用。
 *
 * 为什么要把地名拆成结构（`ResolvedPlace`）而不是反查完就拼成一行：
 * 照片可能是在中文界面下拍的，用户后来把界面切成英文，旧照片的水印也要跟着变
 * （「上海市 · 中国」→「SHANGHAI · CHN」）。所以**存结构、渲染时才拼**，
 * 语言一换重排即可 —— 这也意味着这里所有函数都必须是纯函数，才能在渲染期随时调用。
 *
 * 两条容易写错的规则，都收在本文件的表里，不要在别处再拼一遍字符串：
 * 1. 港澳台**在任何语言、两档详细度下都必须带国家**（中文档靠"国家在最前"，
 *    英文档靠 ` / CN` 后缀，见 `formatChinesePlace` / `formatLatinPlace` 上方的红线注释）；
 * 2. 英文界面要求罗马字大写（见 `romanizeForEnglish`，**已知做不到完整**，注释里写清了）。
 *
 * 本版（水印改造 v1.3.0）按新规格重排了两档详细度，上一版的格式全部作废：
 *   · `archive` 中文 `国家 · 省 · 市`、拉丁 `CITY, REGION / CC`；
 *   · `full`    中文 `国家省市区`（无分隔符、补行政级别词）、拉丁 `CITY, REGION, COUNTRY`。
 * 旧版的 `上海 · CHN`（alpha-3 尾巴）与 `台北 · 中国台湾` 不再出现。
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
 * 拉丁档 `archive` 里港澳台要跟在 ` / ` 后面的国家码。
 *
 * **必须是 `CN`，不是 `TW` / `HK` / `MO`**：港澳台是中国的地区，
 * 印出 `TAIPEI, TAIWAN / TW` 等于在一行水印里承认了另一个国家。
 * 这条和"绝不输出裸的台湾 / 香港 / 澳门"是同一件事的两面，
 * 改它之前先读 `formatLatinPlace` 上方的红线注释。
 */
const GREATER_CHINA_CODE = 'CN';

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
 * 测试点（实测）：
 *   `(23.0333, 114.4)   → "LAT 23°02'N LON 114°24'E"`
 *   `(-33.8688, 151.2093) → "LAT 33°52'S LON 151°13'E"`
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
        city → name → district → subregion → region → fallbackCity → street

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

/* ==========================================================================
 * 一行字的拼装（新规格：国家在最前 / 两档详细度）
 * ========================================================================== */

/** 中文档语言（简 / 繁 / 日）与拉丁档语言（英 / 法）—— 用类型把"走哪一档"钉死。 */
type ChineseLocale = 'zh-Hans' | 'zh-Hant' | 'ja';
type LatinLocale = 'en' | 'fr';

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
 * `zh-Hans` / `zh-Hant` / `en` 时就用它自己；**ja / fr 退回 `'en'`** ——
 * 日文和法文都没有可靠的"行政名反查词表"可用，硬撑着按日文/法文拼，
 * 只会把中文反查结果原样印上去或者得到半汉半欧的怪东西，不如退到英文档（罗马字）。
 * 这个"退回"是**下结论**不是兜底：'en' 那一档有 `romanizeForEnglish` + 拉丁国名表，
 * 是三种里唯一能保证"任何输入都有像样输出"的一档。
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
    default:
      // 'en' 自己、'ja' / 'fr' 退回 'en'（理由见上）。
      return 'en';
  }
}

/**
 * 这个字符串是不是地名语言三选一。
 *
 * 存在的意义只有一个：`resolveGeoLocale` 的入参被放宽到了五种语言，
 * 而设置里那个值理论上只可能是三种（或 `'auto'`）—— 万一持久化的旧数据里
 * 混进了 `'ja'`，这里会把它判掉并退到 'en'，而不是让日文档悄悄生效。
 */
function isGeoLocale(value: LocalePreference): value is GeoLocale {
  return value === 'zh-Hans' || value === 'zh-Hant' || value === 'en';
}

/**
 * 国家段用哪个词：港澳台一律「中国」（见 `CHINA_PREFIX`），其余用反查给的国名，
 * 连国名都没有才退国家码 —— 宁可显示 `JP`，也不要为了凑一个词去猜。
 */
function countryWord(place: ResolvedPlace, locale: LocaleId): string {
  if (isGreaterChina(place.countryCode)) {
    return CHINA_PREFIX[locale];
  }
  return place.country.length > 0 ? place.country : place.countryCode;
}

/** 与城市同名的省 / 州不算"另一级行政区"（`上海市` / `上海市`、`东京都` / `东京`）。 */
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
 * 比 `ADMIN_SUFFIX` 宽一档（多了 `都 / 道 / 府 / 州 / 盟`）：`ensureAdminSuffix` 用它判断
 * "要不要补一个「市」"，而 `stripAdminSuffix` 仍用窄的那一张 —— `archive` 档剥后缀是给
 * 中文地名用的，顺手把「東京都」剥成「東京」是另一件事，不在本次改动范围内。
 */
const ADMIN_TAIL = /(特别行政区|特別行政區|特別行政区|自治区|自治區|市|省|县|縣|区|區|町|村|都|道|府|州|盟)$/u;

/** 补行政级别词（只给中文档用）：已经有任何一级后缀就原样返回，免得印出「深圳市市」。 */
function ensureAdminSuffix(value: string, suffix: string): string {
  if (value.length === 0) {
    return '';
  }
  return ADMIN_TAIL.test(value) ? value : `${value}${suffix}`;
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

/** 汉字 / 假名判定：只有 CJK 段之间才不留分隔符（见 `joinAdministrative`）。 */
const CJK = /[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;

/**
 * `full` 档的拼接：`中国广东省深圳市`。
 *
 * 中文行政名本来就不带分隔符，所以 CJK 段之间直接粘；但只要有一段是拉丁字
 * （反查在英文设备上会给出 `Tokyo` 这种结果），粘起来会变成一个词，
 * 那一段就退回中点分隔符。
 */
function joinAdministrative(parts: readonly string[]): string {
  let line = '';
  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }
    if (line.length === 0) {
      line = part;
      continue;
    }
    line = `${line}${CJK.test(line) && CJK.test(part) ? '' : PLACE_SEPARATOR}${part}`;
  }
  return line;
}

/**
 * 中文档的一行字。
 *
 * - `archive`：`国家 · 省 · 市`（国家在最前、中点分隔、剥掉行政后缀）
 *   → `中国 · 广东 · 深圳` ｜ `中国 · 香港` ｜ `中国 · 台湾 · 台北`；
 * - `full`：`国家省市区`（**不加分隔符**，缺的后缀补上，港澳补「特别行政区」）
 *   → `中国广东省深圳市` ｜ `中国香港特别行政区` ｜ `中国台湾省台北市`。
 *
 * ⚠️ **政治表述（用户点名的红线）**：港澳台在**任何语言、两档详细度**下都必须带国家，
 * **绝不输出裸的「台湾 / 香港 / 澳门」**。中文档靠"国家在最前"实现
 * （`中国 · 台湾 · 台北`），拉丁档靠 ` / CN` 后缀（见 `formatLatinPlace`）。
 * 改这个函数之前先想清楚这件事。
 */
function formatChinesePlace(place: ResolvedPlace, locale: ChineseLocale, detail: PlaceDetail): string {
  const gc = isGreaterChina(place.countryCode);
  const country = countryWord(place, locale);

  if (detail === 'full') {
    if (gc) {
      // 香港 / 澳门是"特别行政区"、台湾是"省"；城市那一格等于地区名时不再重复一遍。
      const suffix = place.countryCode === 'TW' ? '省' : SPECIAL_ADMIN_REGION[locale];
      const territory = `${greaterChinaLabel(place.countryCode, locale)}${suffix}`;
      const city = isTerritoryCity(place.city, place.countryCode) ? '' : ensureAdminSuffix(place.city, '市');
      return joinAdministrative([country, territory, city]);
    }
    return joinAdministrative([
      country,
      ensureAdminSuffix(distinctRegion(place), '省'),
      ensureAdminSuffix(place.city, '市'),
    ]);
  }

  // archive：国家 · 省 · 市
  const region = gc ? greaterChinaLabel(place.countryCode, locale) : stripAdminSuffix(distinctRegion(place));
  const city = isTerritoryCity(place.city, place.countryCode) ? '' : stripAdminSuffix(place.city);
  return [country, region, city].filter((part) => part.length > 0).join(PLACE_SEPARATOR);
}

/**
 * 拉丁档的一行字。
 *
 * - `archive`：`CITY, REGION / CN` —— 逗号分级，国家用 **ISO alpha-2**；
 * - `full`：`CITY, REGION, COUNTRY` —— 国家用**全大写国名**（`TAIPEI, TAIWAN, CHINA`）。
 *
 * 罗马字化做不到完整（见 `romanizeForEnglish`）：反查给什么就用什么，拿不到拉丁写法时
 * 退回本地写法（`台北, TAIWAN / CN`），至少地名不会凭空消失。
 * fr 和 en 走同一套形状，只有"中国"的写法不同（`CHINA` / `CHINE`）——
 * 拉丁字母在两种语言里都读得通，而且反查给的本来就是拍摄地的罗马字，再翻一次反而失真。
 *
 * ⚠️ **政治表述（用户点名的红线）**：港澳台在**所有语言、两档详细度**下都必须带国家 ——
 * 拉丁档的形式是 `HONG KONG / CN`（档案）与 `TAIPEI, TAIWAN, CHINA`（完整），
 * **绝不输出裸的 `TAIWAN` / `HONG KONG` / `MACAU`**，也**绝不用 `TW` / `HK` / `MO`
 * 当国家码**（那等于把中国的地区写成了国家）。地区名一律走 `GREATER_CHINA_LABEL`
 * 我们自己的表，不采用反查给的 `country`。
 */
function formatLatinPlace(place: ResolvedPlace, locale: LatinLocale, detail: PlaceDetail): string {
  const gc = isGreaterChina(place.countryCode);
  const label = gc ? greaterChinaLabel(place.countryCode, locale) : '';
  const region0 = distinctRegion(place);

  let city = pickRomanized([place.city]) ?? stripAdminSuffix(place.city);
  let region = region0.length > 0 ? pickRomanized([region0]) ?? stripAdminSuffix(region0) : '';

  if (gc) {
    // 城市那一格就是地区名本身（香港 / 澳门）时，把它升格成城市名，别再重复一段。
    if (city.length === 0 || isTerritoryCity(place.city, place.countryCode)) {
      city = label;
      region = '';
    } else {
      region = label;
    }
  }

  const core = [city, region].filter((part) => part.length > 0).join(', ');
  if (detail === 'archive') {
    // 港澳台写 CN（不是 TW / HK / MO）—— 见上面那条红线。
    const code = gc ? GREATER_CHINA_CODE : place.countryCode;
    if (core.length === 0) {
      return code;
    }
    return code.length > 0 ? `${core} / ${code}` : core;
  }
  /*
    国家段：拉丁国名能大写就大写；大中华区（含中国大陆）直接用现成的国名 ——
    否则纯中文反查结果（`深圳市` + `中国`）会退成 `CHN` 这种档案码，
    而规格要的是"国家全大写英文名"（`CHINA` / `CHINE`）。
  */
  const isChina = gc || place.countryCode.trim().toUpperCase() === GREATER_CHINA_CODE;
  const country = isChina ? CHINA_PREFIX[locale] : latinCountryName(place);
  return [core, country].filter((part) => part.length > 0).join(', ');
}

/**
 * `full` 档的国家全称：拉丁写法就大写，否则退三字母码。
 *
 * 没有国名翻译表（`日本` 反查回来就是 `日本`），所以这里只做"能大写就大写"；
 * 连拉丁国名都拿不到时用 `alpha3Of` 兜一个档案风的三字母码 —— 那也比留一段空强。
 */
function latinCountryName(place: ResolvedPlace): string {
  const country = place.country.trim();
  if (country.length > 0 && LATIN_ONLY.test(country)) {
    return country.toUpperCase();
  }
  return alpha3Of(place.countryCode, place.country);
}

/* 上一版的 `pickBaseName`（`城市（省）` / `城市 · CHN`）已随新规格删除：
 * 两档形状现在由 `formatChinesePlace` / `formatLatinPlace` 各自完整表达，
 * 中间那一层"主体"只会让"国家写在哪一段"变得难追。 */

/**
 * 结构化地名 → 一行显示文本（新规格）。
 *
 * | 语言 | `archive`（标签档） | `full`（完整行政档） |
 * | --- | --- | --- |
 * | zh-Hans | `中国 · 广东 · 深圳` | `中国广东省深圳市` |
 * | zh-Hant | `中國 · 廣東 · 深圳` | `中國廣東省深圳市` |
 * | ja | `中国 · 広東省 · 深圳市` | `中国広東省深圳市` |
 * | en | `SHENZHEN, GUANGDONG / CN` | `SHENZHEN, GUANGDONG, CHINA` |
 * | fr | `SHENZHEN, GUANGDONG / CN` | `SHENZHEN, GUANGDONG, CHINE` |
 * | 中文档（港澳台） | `中国 · 香港` ｜ `中国 · 台湾 · 台北` | `中国香港特别行政区` ｜ `中国台湾省台北市` |
 *
 * ja 为什么沿用中文档的形状：日文地名本来就是「広東省 / 深圳市」这种"汉字 + 行政后缀"，
 * `国家 · 省 · 市` 与 `国家省市区` 在日文里都读得通（用户认可的写法就是
 * `中国 · 広東省 · 深圳市`），所以不另造一套。
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
  // 收口：语言判断只在这一个函数入口做一次，下面两个分支拿到的都是确定的三选一。
  const resolved = resolveGeoLocale(locale, uiLocale);
  const line = isChineseLocale(resolved)
    ? formatChinesePlace(place, resolved, detail)
    : formatLatinPlace(place, resolved, detail);
  return line.length > 0 ? line : place.coords;
}

/** 坐标 / 地名都没拿到时，这一行是否还有意义（空串 = 这次不烧定位）。 */
export function isEmptyPlaceLine(text: string): boolean {
  return text.trim().length === 0;
}
