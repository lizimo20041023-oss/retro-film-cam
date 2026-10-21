/**
 * 定位水印的取数（原生模块那一层）。
 *
 * 隐私前提（写在这里也是给以后改代码的人看）：
 * - **默认关**，且关的时候连权限都不申请（`expo-location` 一行都不调）；
 * - 地名模式先用系统反查（iOS 走苹果、Android 走谷歌）；系统没有返回地名时，
 *   会把经纬度与地名语言发送给 Photon / OpenStreetMap 兜底，不会上传照片；
 * - 坐标模式是**纯本地格式化**，拿到经纬度就完事，不请求任何网络。
 *
 * 本文件只负责"拿到什么"，不负责"这一行长什么样"：
 * 字符串怎么拼在 `placeNames.ts`（纯函数、可单测），这里只做取数 + 降级。
 *
 * ⚠️ 反查、超时、缓存与限速也在这里，而且是相机拍摄与相册导入两条路共用的。
 * 两边都调用 `resolvePlaceFromCoords`，不要在导入流程再写一份网络逻辑。
 */
import * as Location from 'expo-location';
import type { LocaleId, MessageKey } from '../i18n/types';
import type {
  LocalePreference,
  LocationFailureReason,
  LocationMode,
  LocationStampOutcome,
  PlaceDetail,
  ResolvedPlace,
} from '../types';
import {
  coordsOnlyPlace,
  formatCoords,
  formatResolvedPlace,
  hasPlaceName,
  resolveGeoLocale,
  resolvePlaceFromGeocode,
  type PlaceGeocodeAddress,
} from './placeNames';

/**
 * 单次定位最长等多久。
 * 相机场景下"拍完照等定位"是纯粹的破坏体验，宁可这张照片没有定位。
 */
const FIX_TIMEOUT_MS = 6000;

/**
 * 反查地名：**单次尝试**最长等多久。
 *
 * ⚠️ 这是相机页和相册导入**共用的耐心值**：导入那条路直接调本文件的
 * `reverseGeocodeWithRetry`，所以"同一次反查在两条路上等的时间不一样"在结构上不可能发生。
 * 别再在 `importPhoto.ts` 里另写一份常量。
 *
 * 系统服务只给 2 秒：快速结果直接使用；慢或空结果由 Photon 兜底，避免单张照片
 * 在系统反查上卡住 5～10 秒。
 */
export const GEOCODE_ATTEMPT_TIMEOUT_MS = 2000;

/**
 * 反查最多发几次。
 *
 * 只尝试一次。国外地名的可靠性由 Photon 兜底解决，重复唤醒同一个系统服务只会增加
 * 等待、网络活动和发热。
 */
export const GEOCODE_MAX_ATTEMPTS = 1;

/**
 * 系统反查总预算。即使以后恢复重试，也必须受这一个总预算约束。
 */
export const GEOCODE_TOTAL_BUDGET_MS = GEOCODE_ATTEMPT_TIMEOUT_MS * GEOCODE_MAX_ATTEMPTS;

/**
 * 剩余预算少于这个数就别再发下一次尝试了。
 * 一次注定来不及的调用只会让用户多等，还会在日志里留一句没有信息量的"超时"。
 */
const GEOCODE_MIN_ATTEMPT_MS = 1000;

/** Photon 单次请求的硬超时。 */
const PHOTON_TIMEOUT_MS = 4500;
/** 公共 Photon 服务请求之间至少间隔一秒，避免批量导入形成突发流量。 */
const PHOTON_MIN_INTERVAL_MS = 1000;
const PHOTON_CACHE_LIMIT = 128;

/**
 * 超时哨兵。
 *
 * ⚠️ 它**区分不了**"超时"和"调用抛异常"（`withTimeout` 把两者都塌成它），
 * 所以地名反查那条路不用它 —— 那条路要能在日志里说清失败原因，用的是下面
 * 能返回三态的 `reverseGeocodeOnce`。这个哨兵现在只服务"取当前位置"那一步
 * （那里两种情形都只是 failed，不需要区分）。
 */
const TIMEOUT = Symbol('timeout');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        // 失败也走 TIMEOUT 之外的分支：统一当成"没拿到"。
        resolve(TIMEOUT);
      },
    );
  });
}

/** 一次反查尝试的结局。三态**必须可区分**，否则日志里说不出"为什么没有地名"。 */
type GeocodeAttempt =
  | { status: 'ok'; addresses: Location.LocationGeocodedAddress[] }
  | { status: 'timeout' }
  | { status: 'error'; error: unknown };

/**
 * 发一次反查，最多给它 `ms` 毫秒。本函数**不抛**：三种结局都从返回值出来。
 *
 * 为什么不复用上面的 `withTimeout`：它把"超时"和"reject"压成同一个哨兵，
 * 而这轮要求"这张照片为什么没有地名"在 `console.warn` 里看得出来 ——
 * 超时（网络慢）和抛异常（服务出错）是两回事，得分开报。
 */
function reverseGeocodeOnce(
  coords: { latitude: number; longitude: number },
  ms: number,
): Promise<GeocodeAttempt> {
  return new Promise((resolve) => {
    // `settled` 用来丢掉"超时之后原生才回话"的那一次结果：
    // 没有它，迟到的回话会二次 resolve（无害），但计时器会一直挂着没人清。
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'timeout' });
    }, ms);

    let raw: Promise<Location.LocationGeocodedAddress[]>;
    try {
      raw = Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
    } catch (error) {
      // 原生模块缺失/没链接时的**同步**抛错：也算一次失败的尝试，不许漏出去。
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'error', error });
      return;
    }

    raw.then(
      (addresses) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: 'ok', addresses });
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: 'error', error });
      },
    );
  });
}

/**
 * 一遍（含重试）反查的结局。
 *
 * `'ok'` 里的 `address` 可能是 `undefined`：系统答了空数组（海上、极地、
 * 刚开盘的新楼盘）。
 */
export type ReverseGeocodeOutcome =
  | { status: 'ok'; address: Location.LocationGeocodedAddress | undefined; attempts: number }
  | { status: 'timeout'; attempts: number }
  | { status: 'error'; attempts: number; error: unknown };

/** 失败的两种结局（`describeGeocodeFailure` 只接这两种，所以它没有"无话可说"的分支）。 */
export type ReverseGeocodeFailure = Extract<ReverseGeocodeOutcome, { status: 'timeout' | 'error' }>;

/**
 * 系统反查地名（**可能联网**），总共最多 `GEOCODE_MAX_ATTEMPTS` 次。
 *
 * 这是**两条路唯一的反查入口**：
 * · 相机页 —— `fetchLocationStamp` 的 `mode === 'place'` 分支；
 * · 相册导入 —— `importPhoto.resolvePlaceFromExifGps`（入参是原图 EXIF 里那对坐标，
 *   不碰设备当前位置）。
 * 耐心值 / 重试次数 / 总预算只在上面三个常量里定义一次；调用方**不许**再自己包一层
 * timeout（那等于把总预算乘上第二次）。
 *
 * 契约：**本函数绝不抛**，三类结局都从返回值出来。为什么这么强调：
 * 导入那条路上抛出去会被 `importAndDevelop` 的 per-photo catch 记成 `failed += 1` ——
 * 一张本来能出片的照片会因为"没网"算成失败，比没有地名严重得多。
 *
 * 空数组 / 空地址直接交给 Photon 兜底，不再重复请求系统服务。
 */
function geocodeAddressScore(address: Location.LocationGeocodedAddress): number {
  const present = (value: string | null | undefined): boolean =>
    typeof value === 'string' && value.trim().length > 0;
  return (
    (present(address.city) ? 100 : 0) +
    (present(address.district) ? 80 : 0) +
    (present(address.name) ? 70 : 0) +
    (present(address.subregion) ? 60 : 0) +
    (present(address.region) ? 50 : 0) +
    (present(address.street) ? 20 : 0) +
    (present(address.formattedAddress) ? 15 : 0) +
    (present(address.country) ? 10 : 0) +
    (present(address.isoCountryCode) ? 10 : 0)
  );
}

/** 多结果时不要盲取第一项：海外反查的第一项在部分 Android 设备上只有邮编。 */
export function pickBestGeocodedAddress(
  addresses: readonly Location.LocationGeocodedAddress[],
): Location.LocationGeocodedAddress | undefined {
  let best: Location.LocationGeocodedAddress | undefined;
  let bestScore = 0;
  for (const address of addresses) {
    const score = geocodeAddressScore(address);
    if (score > bestScore) {
      best = address;
      bestScore = score;
    }
  }
  return best;
}

export async function reverseGeocodeWithRetry(coords: {
  latitude: number;
  longitude: number;
}): Promise<ReverseGeocodeOutcome> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastFailure: 'timeout' | 'error' = 'timeout';
  let lastError: unknown = null;
  let successfulEmptyResponse = false;
  let lastAttemptWasEmpty = false;

  while (attempts < GEOCODE_MAX_ATTEMPTS) {
    const remaining = GEOCODE_TOTAL_BUDGET_MS - (Date.now() - startedAt);
    // 第一次一定发（只有 `attempts > 0` 才看预算）：预算管的是**重试**，
    // 不是"开局就可能没时间"。`GEOCODE_MAX_ATTEMPTS` 被调大时，闸门就在这一行。
    if (attempts > 0 && remaining < GEOCODE_MIN_ATTEMPT_MS) break;
    attempts += 1;

    const result = await reverseGeocodeOnce(coords, Math.min(GEOCODE_ATTEMPT_TIMEOUT_MS, remaining));
    if (result.status === 'ok') {
      // 海外反查可能返回多项且第一项为空；选字段最完整的一项。全空则在预算内再试一次。
      const address = Array.isArray(result.addresses)
        ? pickBestGeocodedAddress(result.addresses)
        : undefined;
      if (address !== undefined) {
        return { status: 'ok', address, attempts };
      }
      successfulEmptyResponse = true;
      lastAttemptWasEmpty = true;
      continue;
    }
    lastAttemptWasEmpty = false;
    lastFailure = result.status;
    lastError = result.status === 'error' ? result.error : null;
  }

  if (successfulEmptyResponse && lastAttemptWasEmpty) {
    return { status: 'ok', address: undefined, attempts };
  }
  // 报**最后一次**尝试的原因："第一次超时、第二次抛错"记抛错，更接近真相。
  return lastFailure === 'error'
    ? { status: 'error', attempts, error: lastError }
    : { status: 'timeout', attempts };
}

/**
 * 一次失败的反查 → 一句给日志看的话。
 *
 * 两条路（相机页 / 相册导入）共用它，免得同一种失败在两个文件里被写成两句不一样的话。
 * 故意**不带坐标**：坐标由调用方拼，因为只有调用方手里才有那一刻的坐标。
 */
export function describeGeocodeFailure(outcome: ReverseGeocodeFailure): string {
  if (outcome.status === 'timeout') {
    return `反查地名超时（发了 ${outcome.attempts} 次，每次最多 ${GEOCODE_ATTEMPT_TIMEOUT_MS}ms）`;
  }
  const reason = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
  return `反查地名抛异常（发了 ${outcome.attempts} 次）：${reason}`;
}

type PhotonFeature = {
  properties?: {
    name?: unknown;
    street?: unknown;
    locality?: unknown;
    district?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    country?: unknown;
    countrycode?: unknown;
  };
};

type PhotonResponse = { features?: PhotonFeature[] };

const photonCache = new Map<string, Promise<PlaceGeocodeAddress | undefined>>();
let photonQueue: Promise<void> = Promise.resolve();
let photonLastStartedAt = 0;

function cleanPhotonValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function photonAddressOf(feature: PhotonFeature | undefined): PlaceGeocodeAddress | undefined {
  const source = feature?.properties;
  if (source === undefined) return undefined;

  const city =
    cleanPhotonValue(source.city) ??
    cleanPhotonValue(source.locality) ??
    cleanPhotonValue(source.district) ??
    cleanPhotonValue(source.name);
  const district = cleanPhotonValue(source.district);
  const region = cleanPhotonValue(source.state);
  const country = cleanPhotonValue(source.country);
  const parts = [
    city,
    district !== city ? district : undefined,
    region !== city && region !== district ? region : undefined,
    country,
  ].filter((part): part is string => part !== undefined);

  return {
    city,
    name: cleanPhotonValue(source.name),
    district,
    subregion: cleanPhotonValue(source.county),
    region,
    country,
    isoCountryCode: cleanPhotonValue(source.countrycode)?.toUpperCase(),
    street: cleanPhotonValue(source.street),
    formattedAddress: parts.length > 0 ? parts.join(', ') : undefined,
  };
}

function photonLanguage(locale: LocalePreference, uiLocale: LocaleId): string {
  const resolved = resolveGeoLocale(locale, uiLocale);
  return resolved === 'zh-Hans' || resolved === 'zh-Hant' ? 'zh' : resolved;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestPhotonAddress(
  coords: { latitude: number; longitude: number },
  language: string,
): Promise<PlaceGeocodeAddress | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
  try {
    const query = new URLSearchParams({
      lat: String(coords.latitude),
      lon: String(coords.longitude),
      limit: '1',
      lang: language,
    });
    const response = await fetch(`https://photon.komoot.io/reverse?${query.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/geo+json, application/json',
        'X-Requested-With': 'com.canyerylee.fretrocam',
      },
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as PhotonResponse;
    const address = photonAddressOf(payload.features?.[0]);
    if (address === undefined) return undefined;
    const place = resolvePlaceFromGeocode(address, coords.latitude, coords.longitude);
    return hasPlaceName(place) ? address : undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[retro-film-cam] Photon 地名反查失败：${reason}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function photonAddressFor(
  coords: { latitude: number; longitude: number },
  locale: LocalePreference,
  uiLocale: LocaleId,
): Promise<PlaceGeocodeAddress | undefined> {
  const language = photonLanguage(locale, uiLocale);
  // 四位小数约为 11 米：同一拍摄点直接复用，又不会把相邻街区错误合并。
  const key = `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)},${language}`;
  const cached = photonCache.get(key);
  if (cached !== undefined) return cached;

  const queued = photonQueue.then(async () => {
    const remaining = PHOTON_MIN_INTERVAL_MS - (Date.now() - photonLastStartedAt);
    if (remaining > 0) await delay(remaining);
    photonLastStartedAt = Date.now();
    return requestPhotonAddress(coords, language);
  });
  photonQueue = queued.then(() => undefined, () => undefined);
  photonCache.set(key, queued);
  // 网络临时失败不能在整个 App 生命周期里永久缓存；成功结果才长期复用。
  void queued.then((address) => {
    if (address === undefined && photonCache.get(key) === queued) photonCache.delete(key);
  });
  if (photonCache.size > PHOTON_CACHE_LIMIT) {
    const oldest = photonCache.keys().next().value as string | undefined;
    if (oldest !== undefined) photonCache.delete(oldest);
  }
  return queued;
}

type NativePlaceResult = {
  native: ReverseGeocodeOutcome;
  address?: PlaceGeocodeAddress;
  place?: ResolvedPlace;
};

async function resolveNativePlace(coords: {
  latitude: number;
  longitude: number;
}): Promise<NativePlaceResult> {
  const native = await reverseGeocodeWithRetry(coords);
  if (native.status !== 'ok' || native.address === undefined) return { native };
  const place = resolvePlaceFromGeocode(native.address, coords.latitude, coords.longitude);
  return hasPlaceName(place) ? { native, address: native.address, place } : { native };
}

/** 系统与全球兜底反查的结局。`ok` 里一定有一个可用地名。 */
export type ResolvePlaceOutcome =
  | { status: 'ok'; address: PlaceGeocodeAddress; place: ResolvedPlace; channel: 'native' | 'photon' }
  | {
      status: 'failed';
      /** 原生那一段的结局（超时 / 抛异常 / 空数组 / 字段全空）。 */
      native: ReverseGeocodeOutcome;
      /** 系统原生反查一共尝试了几次。 */
      attempts: number;
    };

/**
 * 坐标 → 结构化地名：系统反查优先，失败后使用 Photon / OpenStreetMap 全球兜底。
 *
 * 这是"相机页现场拍"和"相册导入"**唯一**的地名入口，两条路必须从这里拿
 * （耐心值 / 重试 / 失败语义 / 日志措辞都只在本文件里定义一次，见文件头）。
 *
 * ## 最坏等待时间
 *
 * ```
 *   系统原生：最多 2000ms；Photon：最多 4500ms
 * ```
 * Photon 只会在系统明确失败或超过 2 秒后启动，不会在系统成功时外发坐标。
 *
 * ## 绝不抛
 *
 * 全部失败时返回 `status: 'failed'`，**不抛异常**：调用方（`importAndDevelop`）
 * 的 per-photo catch 会把抛出去的东西记成 `failed += 1`，一张本来能出片的照片
 * 会因为"没网"被算成失败。
 */
export async function resolvePlaceFromCoords(
  coords: { latitude: number; longitude: number },
  geoLocale: LocalePreference = 'zh-Hans',
  uiLocale: LocaleId = 'zh-Hans',
  nativeAllowed = true,
): Promise<ResolvePlaceOutcome> {
  // Android 导入旧照片时，系统反查需要前台定位权限；用户拒绝后仍可直接使用已经
  // 授权的 Photon 兜底，且不会为了旧照片去读取设备当前位置。
  const nativeResult: NativePlaceResult = nativeAllowed
    ? await resolveNativePlace(coords)
    : {
        native: {
          status: 'error',
          attempts: 0,
          error: new Error('系统反查不可用'),
        },
      };
  if (nativeResult.address !== undefined && nativeResult.place !== undefined) {
    return {
      status: 'ok',
      address: nativeResult.address,
      place: nativeResult.place,
      channel: 'native',
    };
  }

  const photonAddress = await photonAddressFor(coords, geoLocale, uiLocale);
  if (photonAddress !== undefined) {
    const place = resolvePlaceFromGeocode(photonAddress, coords.latitude, coords.longitude);
    if (hasPlaceName(place)) {
      return { status: 'ok', address: photonAddress, place, channel: 'photon' };
    }
  }

  const native = nativeResult.native;

  /*
   * 走到这里有两种原因，日志里必须分得清：
   *   · 原生根本没答成（超时 / 抛异常）→ 用 `describeGeocodeFailure` 的原话；
   *   · 原生答了，但地址对象里一个可用字段都没有（空数组或 `{}`）→ 另说一句。
   * 同一种失败在相机与导入两条路上必须得到相同结果。
   */
  const nativeReason =
    native.status === 'ok'
      ? '原生反查返回空数组 / 结果里没有任何可用地名'
      : describeGeocodeFailure(native);

  /*
   * 用户选择「地名」时已授权 Photon 兜底；日志不记录精确坐标。
   */
  console.warn(`[retro-film-cam] 系统与 Photon 地名反查均失败，本次不提供地名：${nativeReason}`);
  return {
    status: 'failed',
    native,
    attempts: native.attempts,
  };
}

/**
 * 经纬度 → `31.230°N 121.474°E`。
 *
 * 实现已经搬到 `placeNames.ts`（它是纯字符串逻辑，和"要不要联网"无关），
 * 这里**重新导出**只是为了不打断已有的 import 路径 —— 新代码请直接从 `placeNames` 引。
 */
export { formatCoords };

/**
 * 反查结果 → 给 LCD / 日志看的一行字。
 *
 * 已经不需要它来做水印了（水印消费的是结构化地名，见 `fetchLocationStamp`）。
 * 保留是因为两处仍然有用：排查"反查到底给了什么"，以及日志打点。
 * 内部直接复用新的渲染器，所以它和成片里的那行字**永远一致**。
 *
 * `locale` 现在可以是设置里的地名语言（含 `'auto'`）：那样必须把**界面语言**
 * 一起传进来（第 4 个参数），`'auto'` 才知道该参照谁。不传就按简中算 ——
 * 和这个函数以前"默认 zh-Hans"的行为一致。
 *
 * 单位：无（纯字符串）。
 */
export function describePlace(
  address: Location.LocationGeocodedAddress | undefined,
  locale: LocalePreference = 'zh-Hans',
  detail: PlaceDetail = 'archive',
  uiLocale?: LocaleId,
): string | null {
  if (!address) {
    return null;
  }
  const placeLocale = resolveGeoLocale(locale, uiLocale ?? 'zh-Hans');
  const text = formatResolvedPlace(resolvePlaceFromGeocode(address, 0, 0), placeLocale, detail);
  return text.length > 0 ? text : null;
}

/**
 * 取一次定位水印。
 *
 * 返回 `{ ok: false, reason }` 而不是抛异常 —— 调用方（拍照流程）只需要决定
 * "这次不写定位"，不该被异常打断出片。
 *
 * 成功时同时给出两样东西：
 * - `place`：结构化地名，**成片水印只认它**（这样切语言后旧照片能重排）；
 * - `text`：已经拼好的一行，给 LCD 状态条直接显示。
 *
 * 坐标模式下 `place` 是"只有坐标、没有国家"的结构化结果：城市和国别都是空串，
 * 渲染出来就是坐标本身 —— 调用方不需要为两种模式写两套分支。
 *
 * `locale` 收的是**地名语言**（§五.2）：既可以直接给三种之一，也可以给设置里的
 * `'auto'`；后者必须把界面语言放进 `uiLocale`，否则只能按简中算。
 * 解析只在这里做一次（两条返回分支共用），所以"坐标档按界面语言、地名档按地名语言"
 * 这种半对半错的情况不可能出现。
 */
export async function fetchLocationStamp(
  mode: LocationMode,
  locale: LocalePreference = 'zh-Hans',
  detail: PlaceDetail = 'archive',
  uiLocale?: LocaleId,
): Promise<LocationStampOutcome> {
  // 语言在这里就定下来：下面无论走"坐标档"还是"反查档"，用的都是同一个值。
  const placeLocale = resolveGeoLocale(locale, uiLocale ?? 'zh-Hans');
  if (mode === 'off') {
    return { ok: false, reason: 'services-off' };
  }

  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { ok: false, reason: 'services-off' };
    }

    /**
     * 权限：只在"还能问"的时候才弹窗。
     * 用户已经拒绝过（`canAskAgain === false`）就别再问了 —— iOS 上那一问
     * 不会有任何弹窗，只是白白闪一下状态，还会让日志里堆满假请求。
     */
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
    }
    if (!granted) {
      return { ok: false, reason: 'denied' };
    }

    // 先试"最近一次已知位置"：相机 App 里这一下几乎是瞬时的，
    // 而且大多数时候精度足够写个城市名。
    let coords =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 5000 }))
        ?.coords ?? null;

    if (coords === null) {
      const fresh = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        FIX_TIMEOUT_MS,
      );
      if (fresh === TIMEOUT) {
        return { ok: false, reason: 'failed' };
      }
      coords = fresh.coords;
    }

    if (mode === 'coords') {
      // 这个形状的**唯一构造点**是 `placeNames.coordsOnlyPlace`，别处不许再手写一份：
      // 相册导入那条路（`importPhoto.ts` 的显式坐标模式）用的是同一个函数，
      // 两边的"只有坐标"必须逐字段一致，否则同一张照片从相机出来和从相册导入出来
      // 会印出不一样的字。
      const place: ResolvedPlace = coordsOnlyPlace(coords.latitude, coords.longitude);
      // 坐标模式下"要显示的那一行"就是坐标本身：文件名 / 相册条目里没有城市可写。
      return { ok: true, text: formatResolvedPlace(place, placeLocale, detail), place };
    }

    /*
     * 反查地名：系统服务优先，失败后用 Photon / OpenStreetMap 兜底；调度、缓存与日志全部收在
     * `resolvePlaceFromCoords` 里；相册导入走的是**同一个函数**，两条路的等待时间
     * 与失败行为必须一模一样。Photon 只收到经纬度与地名语言，不会收到照片。
     *
     * ⚠️ 这一段与上面 `mode === 'coords'` 那一段有一条硬边界：
     * **地名档绝不允许输出坐标**。用户选了「地名」却看到一串 `LAT 23°02'N …`
     * 等于把"我没有地名"这件事伪装成"我查到了" —— 用户点名的红线。
     * 所以这里失败就返回 `{ ok: false }`，让调用方走"这一张不烧定位"，
     * 而不是退回 `coordsOnlyPlace`（那是 `mode === 'coords'` 的专属行为）。
     */
    const resolved = await resolvePlaceFromCoords(coords, locale, uiLocale ?? 'zh-Hans');
    if (resolved.status !== 'ok') {
      // 留痕：以前这里静默退坐标，"这张照片为什么没有地名"事后完全查不出来。
      // 系统反查的失败原因已经在 `resolvePlaceFromCoords` 里 warn 过了，
      // 这里只补一句"相机页这一次没有地名"。
      console.warn(
        `[retro-film-cam] 相机页这一张没有地名（系统反查尝试 ${resolved.native.attempts} 次）`,
      );
      return { ok: false, reason: 'failed' };
    }

    // 语言用的是上面解析好的 `placeLocale`，不是原始的 `locale`：
    // 原始值可能是 'auto'，直接传下去会落到 `formatResolvedPlace` 的默认档（简中），
    // 于是"界面英文 + 地名 auto"就会印出中文 —— 这正是 §五.2 要避免的那种错。
    const text = formatResolvedPlace(resolved.place, placeLocale, detail);
    // 反查"成功"但一个字都没印出来：这一行没有任何信息量，与其烧一串空字符串，
    // 不如老老实实报"这次没拿到"（`resolvePlaceFromCoords` 已经用 `hasPlaceName` 判过
    // 一次，这里是渲染层的第二道 —— 两档详细度在某些组合下仍可能只剩分隔符）。
    return text.trim().length > 0
      ? { ok: true, text, place: resolved.place }
      : { ok: false, reason: 'failed' };
  } catch (error) {
    console.warn('[retro-film-cam] 取定位失败：', error);
    return { ok: false, reason: 'failed' };
  }
}

/** 水印文字 → 一行显示（超长时截断，避免顶到右边的时间戳）。 */
export function trimLocationText(text: string, maxLength = 26): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

/**
 * 失败原因 → 两个 i18n 键。
 *
 * 为什么是两句话而不是一句：
 * 设置界面有两行位置，放得下完整句子（"定位权限被拒绝，请到 系统设置 → …"）；
 * 而取景器底部那条 LCD 是 `numberOfLines={1}` 的单行等宽小字，
 * 塞 30 个字进去会被省略号截成"定位权限被拒绝，请到 系统设…"，非常难看。
 * 所以 `short` 给 LCD，`full` 给设置界面。
 *
 * 标成 `MessageKey` 而不是 `string`：键名拼错时 `tsc` 立刻报错。
 */
export const LOCATION_FAILURE_COPY: Record<
  LocationFailureReason,
  { short: MessageKey; full: MessageKey }
> = {
  'services-off': { short: 'lcd.location.servicesOff', full: 'location.servicesOff' },
  denied: { short: 'lcd.location.denied', full: 'location.denied' },
  // 注意 `short` 复用长句的 `location.failed`：五个语言包里都没有 `lcd.location.failed`
  // 这个键（"定位失败"本来就是四个字，LCD 一行放得下，没必要为它单独造一个短版）。
  failed: { short: 'location.failed', full: 'location.failed' },
};
