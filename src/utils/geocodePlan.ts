/**
 * 地名反查的"取数策略"层：语言候选、Photon 请求候选链、缓存键 / TTL / 距离校验 / 序列化。
 *
 * 为什么单独一个文件（v2.3.2 · 海外地名）：
 * 1. **零 `expo-*` / `react-native` import**。门禁脚本
 *    `scripts/check-overseas-location.cjs` 用 `typescript.transpileModule` 把它和
 *    `locationStamp.ts` 直接加载进 Node 跑断言；往里引一个原生模块，那条路当场就断。
 * 2. 这些规则以前散在 `locationStamp.ts` 里（有的还没有），现在收口成纯函数：
 *    语言怎么选、失败后怎么重发、缓存多久算新鲜、两个坐标算不算"同一个地方"、
 *    落盘 JSON 长什么样。改这类规则不该碰网络代码，改网络代码也不该误伤缓存格式。
 *
 * ⚠️ 本文件里**没有** `fetch`、没有 `AsyncStorage`、没有 `Date.now()` 的隐藏副作用
 * （时间一律由调用方作为 `now` 传进来，测试才好钉死）。持久化归 `useLocationStamp`，
 * 网络归 `locationStamp`。
 */
import type { LocalePreference } from '../types';

/**
 * 成功结果的缓存寿命：10 分钟。
 *
 * 为什么不是更久：地名跟人走。拍完照走出两个街区、十分钟后再按快门，10 分钟前的
 * 地名基本还是对的；放一天就会把"早上在 A 城、晚上在 B 城"的照片印成同一个地名。
 */
export const GEOCODE_SUCCESS_TTL_MS = 10 * 60_000;

/**
 * 失败结果的缓存寿命（**负缓存**）：120 秒。
 *
 * 海外断网时的真实体验是"每次按快门都等一遍超时再放弃"——同一片区域 2 分钟内
 * 连续拍 5 张，就是 5 轮注定失败的联网。120 秒足够覆盖一次持续拍摄，又短到
 * 用户走出电梯 / 连上 Wi-Fi 后不会一直被上一次的失败挡着。
 */
export const GEOCODE_FAILURE_TTL_MS = 120_000;

/** 两个坐标相距不超过这个距离，就认为命中同一条缓存（≈ 一个街区级别）。 */
export const CACHE_MATCH_KM = 2;

/** 缓存键保留几位小数：2 位 ≈ 1.1km。 */
export const GEOCODE_KEY_DECIMALS = 2;

/** 缓存条数上限（内存与落盘共用），超出按 `savedAt` 丢最旧的。 */
export const GEOCODE_CACHE_LIMIT = 128;

/** 落盘格式版本。格式不兼容时整份丢弃，而不是猜测字段。 */
const GEOCODE_CACHE_VERSION = 1;

/** 单个地址字段的长度上限：反查给的是地名，不该有长文本；超长视为坏数据。 */
const MAX_FIELD_LENGTH = 256;

/** 缓存条目状态：`ok` 有结构化地名；`failed` 是负缓存（这次没拿到，先别再问）。 */
export type GeocodeCacheStatus = 'ok' | 'failed';

/**
 * 缓存里存的结构化地址。
 *
 * 字段与可空性和 `placeNames.PlaceGeocodeAddress` **完全一致**（`string | null`）：
 * 这样反查结果可以原样塞进来、读出来也能原样交给 `resolvePlaceFromGeocode`，
 * 中间不需要任何类型断言（项目零 `as any`）。多写的字段在序列化时被白名单丢掉。
 */
export interface CachedGeocodeAddress {
  city?: string | null;
  name?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  country?: string | null;
  isoCountryCode?: string | null;
  street?: string | null;
  formattedAddress?: string | null;
}

/** 一条缓存记录。`key` 由坐标 2 位小数生成，反查时再用 `CACHE_MATCH_KM` 做邻近匹配。 */
export interface GeocodeCacheEntry {
  /** `geocodeCacheKey(latitude, longitude)` 的结果，落盘后作为去重 / 覆盖的键。 */
  key: string;
  latitude: number;
  longitude: number;
  /**
   * 这次请求实际用的语言：`'en'` / `'fr'` / `'de'`，或空串表示"没带 `lang`"。
   * 只作诊断信息 —— 地名结构本身与语言无关（渲染时才拼字）。
   */
  language: string;
  status: GeocodeCacheStatus;
  /** `ok` 时一定有内容；`failed` 恒为 `null`。 */
  address: CachedGeocodeAddress | null;
  /** 写入时刻（`Date.now()` 毫秒）。 */
  savedAt: number;
}

/** 一个经纬度点。用结构而不是数组：调用点很多，别让顺序成为隐藏约定。 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Photon 支持的 `lang` 取值（官方只支持 default / de / en / fr）。 */
const PHOTON_LANGUAGES: readonly string[] = ['de', 'en', 'fr'];

/** Photon 兼容语言之外的偏好（zh-Hans / zh-Hant / ja / auto / 未知）统一退成英文。 */
const PHOTON_FALLBACK_LANGUAGE = 'en';

/** 把 BCP-47 风格的 locale 归一成小写 + 连字符（`zh_Hant` → `zh-hant`）。 */
function normalizeLocale(locale: string | undefined | null): string {
  return typeof locale === 'string' ? locale.trim().toLowerCase().replace(/_/g, '-') : '';
}

/**
 * 地名语言 → Photon 能接受的 `lang` 候选（**按优先级**，通常只有一项）。
 *
 * 根因（v2.3.2）：过去把 `zh` / `ja` 直接当 `lang` 发出去，Photon 返回 HTTP 400，
 * 而调用方把这个 400 静默吞成 `undefined` —— 于是中文 / 日文用户在海外永远只剩坐标。
 *
 * 口径：
 * - `fr` / `de` / `en`（含 `fr-FR` 这类）→ 原样用；
 * - `zh-Hans` / `zh-Hant` / `ja` / `'auto'` / 未知 → `['en']`。
 *   英文不是"降级凑合"：Photon 的英文档对全球地名都有像样的拉丁拼写，
 *   而中文 / 日文档它根本不提供 —— 继续发 zh/ja 只会 400。
 * - 调用方拿到这个数组后**必须再追加一个"不带 lang"的候选**（见 `photonUrlCandidates`）：
 *   不带 lang 时 Photon 返回当地语言名字，对中日用户其实常常更接近想要的写法。
 */
export function photonLanguagePlan(locale: string | undefined | null): string[] {
  const base = normalizeLocale(locale).split('-')[0] ?? '';
  return [PHOTON_LANGUAGES.includes(base) ? base : PHOTON_FALLBACK_LANGUAGE];
}

/** Photon 反查端点。抽出来是为了门禁脚本能断言"所有请求都打到这一个地址"。 */
export const PHOTON_REVERSE_ENDPOINT = 'https://photon.komoot.io/reverse';

/**
 * 拼一条 Photon 反查 URL。
 *
 * `language` 为空串 / undefined 时**不带 `lang` 参数** —— 那就是 Photon 的 default 档，
 * 返回地名的当地写法（东京写成「東京都」而不是 `Tokyo`）。
 */
export function photonUrl(coords: LatLng, language?: string): string {
  const query = new URLSearchParams({
    lat: String(coords.latitude),
    lon: String(coords.longitude),
    limit: '1',
  });
  if (language !== undefined && language.length > 0) {
    query.set('lang', language);
  }
  return `${PHOTON_REVERSE_ENDPOINT}?${query.toString()}`;
}

/**
 * 完整候选链：先按语言偏好（通常一条），最后补一条**不带 `lang`** 的兜底。
 *
 * 为什么"不带 lang"必须进候选链而不是放在 catch 里：它不仅是网络失败时的重试，
 * 更是语言不受支持时（HTTP 400）唯一还能拿到地名的请求 —— 这条就是 v2.3.2 修的那个洞。
 * 去重是为了"偏好本来就是英文"时不会出现两条完全相同的 URL。
 */
export function photonUrlCandidates(coords: LatLng, locale: LocalePreference | string | undefined | null): string[] {
  const urls: string[] = [];
  for (const language of photonLanguagePlan(locale)) {
    urls.push(photonUrl(coords, language));
  }
  urls.push(photonUrl(coords));
  return urls.filter((url, index) => urls.indexOf(url) === index);
}

/** 坐标归一成缓存键用的数值：先按位数取整，再把 `-0` 变成 `0`（否则键会分裂）。 */
function roundCoord(value: number): number {
  const rounded = Number(value.toFixed(GEOCODE_KEY_DECIMALS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 坐标 → 缓存键（2 位小数 ≈ 1.1km）。
 *
 * 2 位而不是更细：同一次拍摄里 GPS 抖动几十米是常态，按米级建键等于没有缓存；
 * 2 位再配合 `CACHE_MATCH_KM` 的邻近匹配，既复用得上又不会把隔壁街区混成一条。
 */
export function geocodeCacheKey(latitude: number, longitude: number): string {
  return `${roundCoord(latitude).toFixed(GEOCODE_KEY_DECIMALS)},${roundCoord(longitude).toFixed(GEOCODE_KEY_DECIMALS)}`;
}

/** 地球平均半径（km）。 */
const EARTH_RADIUS_KM = 6371;

/** 两点球面距离（km）。缓存邻近匹配用；只求"够近"，不追求测量级精度。 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = toRad(b.latitude - a.latitude);
  const deltaLon = toRad(b.longitude - a.longitude);
  const latA = toRad(a.latitude);
  const latB = toRad(b.latitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 这条缓存现在还算数吗（成功 10 分钟 / 失败 120 秒两种寿命）。 */
export function isEntryFresh(entry: GeocodeCacheEntry, now: number): boolean {
  const ttl = entry.status === 'ok' ? GEOCODE_SUCCESS_TTL_MS : GEOCODE_FAILURE_TTL_MS;
  return now - entry.savedAt < ttl;
}

/** 构造一条缓存记录（`key` 由坐标自己算，调用方不手写，避免两份坐标不一致）。 */
export function makeGeocodeCacheEntry(params: {
  latitude: number;
  longitude: number;
  language: string;
  status: GeocodeCacheStatus;
  address?: CachedGeocodeAddress | null;
  savedAt: number;
}): GeocodeCacheEntry {
  const { latitude, longitude, language, status, savedAt } = params;
  return {
    key: geocodeCacheKey(latitude, longitude),
    latitude,
    longitude,
    language,
    status,
    address: status === 'ok' ? params.address ?? null : null,
    savedAt,
  };
}

/**
 * 在缓存里找一条"新鲜且足够近"的记录。
 *
 * 排序口径（"有地名"优先于"负缓存"，然后看谁更近、谁更新）：
 * · `ok` 永远优先 —— 同一片区域里可能既有 2 分钟前的一次失败、也有 8 分钟前的一次成功，
 *   这时候当然用成功的那个，不能因为失败那次更近就退回坐标；
 * · 同为 `ok` 时距离优先（更靠近拍摄点的那条更可信），距离相同再取更新的。
 *
 * 找不到返回 `undefined`（调用方自己去联网）。
 */
export function findFreshGeocodeEntry(
  entries: readonly GeocodeCacheEntry[],
  coords: LatLng,
  now: number,
): GeocodeCacheEntry | undefined {
  let best: GeocodeCacheEntry | undefined;
  let bestScore = -Infinity;
  for (const entry of entries) {
    if (!isEntryFresh(entry, now)) continue;
    const distance = haversineKm({ latitude: entry.latitude, longitude: entry.longitude }, coords);
    if (distance > CACHE_MATCH_KM) continue;
    // `ok` 加一个大于所有距离差的常数：保证"成功"永远赢过同一片区域里的"失败"。
    const score = (entry.status === 'ok' ? 100 : 0) - distance + entry.savedAt / 1e15;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

/**
 * 写入一条记录后的新缓存数组：覆盖同键、丢掉过期、按新旧排序、截到上限。
 *
 * 返回新数组而不是原地修改：`useLocationStamp` 会把快照写进 AsyncStorage，
 * 原地改会让"什么时候变了"变得难追。
 */
export function withGeocodeEntry(
  entries: readonly GeocodeCacheEntry[],
  entry: GeocodeCacheEntry,
  now: number,
): GeocodeCacheEntry[] {
  const merged: GeocodeCacheEntry[] = [];
  for (const existing of entries) {
    if (existing.key === entry.key) continue;
    if (!isEntryFresh(existing, now)) continue;
    merged.push(existing);
  }
  merged.push(entry);
  merged.sort((a, b) => b.savedAt - a.savedAt);
  return merged.slice(0, GEOCODE_CACHE_LIMIT);
}

/** 地址字段白名单：序列化 / 反序列化只认这些（多写的字段一律丢掉）。 */
const ADDRESS_FIELDS: readonly (keyof CachedGeocodeAddress)[] = [
  'city',
  'name',
  'district',
  'subregion',
  'region',
  'country',
  'isoCountryCode',
  'street',
  'formattedAddress',
];

/** 地址里的字段个数（0 表示"只有空对象"，等同于没有地名）。 */
function addressFieldCount(address: CachedGeocodeAddress): number {
  let count = 0;
  for (const field of ADDRESS_FIELDS) {
    const value = address[field];
    if (typeof value === 'string' && value.trim().length > 0) count += 1;
  }
  return count;
}

/** 只保留白名单里的非空字符串字段；全空返回 `null`（负缓存本来就没有地址）。 */
function compactAddress(address: CachedGeocodeAddress | null): Record<string, string> | null {
  if (address === null) return null;
  const compact: Record<string, string> = {};
  for (const field of ADDRESS_FIELDS) {
    const value = address[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      compact[field] = value;
    }
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

/**
 * 缓存数组 → 落盘字符串。
 *
 * 只存"反查结果 + 时间"这两样：渲染用的字符串不存（地名要按**当前语言**重排，
 * 存字符串等于把拍摄那一刻的语言钉死 —— 那是项目里反复避免的坑）。
 */
export function serializeGeocodeCache(entries: readonly GeocodeCacheEntry[]): string {
  const payload = {
    v: GEOCODE_CACHE_VERSION,
    entries: entries.map((entry) => ({
      key: entry.key,
      lat: entry.latitude,
      lon: entry.longitude,
      lang: entry.language,
      status: entry.status,
      at: entry.savedAt,
      address: compactAddress(entry.address),
    })),
  };
  return JSON.stringify(payload);
}

/** 取一个"短的、非空的、长度合规的"字符串字段；不合格返回 `undefined`。 */
function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > MAX_FIELD_LENGTH ? undefined : trimmed;
}

/** 解析一条地址：`undefined` = 整条记录坏掉；`null` = 没有地址（负缓存）。 */
function parseAddress(value: unknown): CachedGeocodeAddress | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const address: CachedGeocodeAddress = {};
  for (const field of ADDRESS_FIELDS) {
    const parsed = readString(record[field]);
    if (parsed !== undefined) address[field] = parsed;
  }
  return addressFieldCount(address) > 0 ? address : null;
}

/** 解析一条缓存记录；任何字段不自洽就整条丢弃（宁可少用缓存，也别把脏数据喂给渲染层）。 */
function parseEntry(value: unknown): GeocodeCacheEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;

  const latitude = typeof record.lat === 'number' ? record.lat : Number.NaN;
  const longitude = typeof record.lon === 'number' ? record.lon : Number.NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;

  const status = record.status;
  if (status !== 'ok' && status !== 'failed') return undefined;

  const savedAt = record.at;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0) return undefined;

  const language = typeof record.lang === 'string' && record.lang.length <= 8 ? record.lang.trim().toLowerCase() : '';

  const address = parseAddress(record.address);
  if (address === undefined) return undefined;
  // 成功却没有地址 = 自相矛盾；失败却带着地址 = 来源不明。两种都丢掉。
  if (status === 'ok' && address === null) return undefined;
  if (status === 'failed' && address !== null) return undefined;

  const key = geocodeCacheKey(latitude, longitude);
  if (typeof record.key === 'string' && record.key.length > 0 && record.key !== key) {
    // 键与坐标不自洽：说明这份数据被谁改过，整条丢弃。
    return undefined;
  }

  return {
    key,
    latitude,
    longitude,
    language,
    status,
    address,
    savedAt,
  };
}

/**
 * 落盘字符串 → 缓存数组。**坏数据全部静默丢弃**（返回空数组即可，不让 App 启动路径抛异常）：
 * 版本不对 / 不是 JSON / 字段类型错 / 键与坐标不一致 / 重复键 —— 逐条丢，不整份报错。
 *
 * 不在这里做 TTL 过滤：加载后由 `seedGeocodeCache` 再过一遍 `isEntryFresh`
 * （时间由调用方给，测试才能造"过期条目"的场景）。
 */
export function parseGeocodeCache(raw: string | null | undefined): GeocodeCacheEntry[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const record = parsed as Record<string, unknown>;
  if (record.v !== GEOCODE_CACHE_VERSION) return [];
  const rawEntries = Array.isArray(record.entries) ? record.entries : [];

  const seen = new Set<string>();
  const entries: GeocodeCacheEntry[] = [];
  for (const value of rawEntries) {
    const entry = parseEntry(value);
    if (entry === undefined || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  entries.sort((a, b) => b.savedAt - a.savedAt);
  return entries.slice(0, GEOCODE_CACHE_LIMIT);
}
