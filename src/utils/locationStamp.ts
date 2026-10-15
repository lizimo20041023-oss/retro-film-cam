/**
 * 定位水印的取数（原生模块那一层）。
 *
 * 隐私前提（写在这里也是给以后改代码的人看）：
 * - **默认关**，且关的时候连权限都不申请（`expo-location` 一行都不调）；
 * - 地名模式会用系统反查（iOS 走苹果、Android 走谷歌），这一步是联网的，
 *   所以设置界面里必须原样告诉用户；
 * - 坐标模式是**纯本地格式化**，拿到经纬度就完事，不请求任何网络。
 *
 * 本文件只负责"拿到什么"，不负责"这一行长什么样"：
 * 字符串怎么拼在 `placeNames.ts`（纯函数、可单测），这里只做取数 + 降级。
 *
 * ⚠️ 反查（含超时重试）也在这里，而且是**两条路共用**的：相册导入
 * （`importPhoto.ts` 的 `resolvePlaceFromExifGps`）从这个文件 import
 * `reverseGeocodeWithRetry`，就为了让"相机页现场拍"和"导入一张老照片"对同一次反查
 * 有完全一样的耐心值、一样的重试次数 —— 别在那边再写一份（历史上就是各写一份的）。
 */
import * as Location from 'expo-location';
import type { LocaleId, MessageKey } from '../i18n/types';
import type {
  GeoLocale,
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
 * 为什么还是 5000（逐字保留旧值）：它是**一次尝试**的窗口，不是总时长。
 * 今天能在 5s 内返回的反查，改动之后第一次尝试仍然在同样的窗口里成功 ——
 * 不存在"为了加重试反而把一次本来能成功的等待切短了"的风险。
 * 多出来的那份等待只花在"第一次已经失败"的照片上（本来就没有地名、只能退坐标）。
 */
export const GEOCODE_ATTEMPT_TIMEOUT_MS = 5000;

/**
 * 反查最多发几次。
 *
 * 为什么是 2：反查第一次调用常常撞上"系统刚把这个服务唤醒 / 正在握手 / 刚切网"，
 * 第二次往往几百毫秒就回来了；而"一次失败就放弃、直接退回坐标"正是这次要修的症状
 * （带 GPS 的机场照片只印了经纬度）。再加不划算：每多一次就多 5s 的最坏等待，
 * 而相册导入是**串行**的，这份等待按张累加（12 张就是 12 次）。
 *
 * 只有"超时 / 抛异常"才算一次失败；系统明确答"这个点我查不到"（空数组）**不重试**，
 * 理由见 `reverseGeocodeWithRetry`。
 */
export const GEOCODE_MAX_ATTEMPTS = 2;

/**
 * 一遍反查（含重试）的总预算：10000ms = 2 × 5000ms。
 *
 * 单独写成一个常量，而不是让重试次数随便乘：将来有人把 `GEOCODE_MAX_ATTEMPTS`
 * 调成 5，这道闸门会先把总时长按在 10s 上 —— 否则"导入 12 张照片卡住 3 分钟"
 * 是迟早的事。预算按**已经过去的时间**算：发下一次之前先看还剩多少。
 */
export const GEOCODE_TOTAL_BUDGET_MS = GEOCODE_ATTEMPT_TIMEOUT_MS * GEOCODE_MAX_ATTEMPTS;

/**
 * 剩余预算少于这个数就别再发下一次尝试了。
 * 一次注定来不及的调用只会让用户多等，还会在日志里留一句没有信息量的"超时"。
 */
const GEOCODE_MIN_ATTEMPT_MS = 1000;

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
 * `'ok'` 里的 `address` 可能是 `undefined`：系统答了，但数组是空的（海上、极地、
 * 刚开盘的新楼盘）。那不是"调用失败"，所以不重试 —— 但调用方仍然要退回坐标，
 * 只是日志里得说清是哪一种（`resolvePlaceFromExifGps` 就是这么做的）。
 */
export type ReverseGeocodeOutcome =
  | { status: 'ok'; address: Location.LocationGeocodedAddress | undefined; attempts: number }
  | { status: 'timeout'; attempts: number }
  | { status: 'error'; attempts: number; error: unknown };

/** 失败的两种结局（`describeGeocodeFailure` 只接这两种，所以它没有"无话可说"的分支）。 */
export type ReverseGeocodeFailure = Extract<ReverseGeocodeOutcome, { status: 'timeout' | 'error' }>;

/**
 * 反查地名（**联网**）：超时 / 抛异常就再试一次，总共最多 `GEOCODE_MAX_ATTEMPTS` 次。
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
 * 空数组**不重试**：那是系统明确回答"这个点我查不到"，再问一次不会有新答案，
 * 只白烧一次网络请求（还要多占用户的时间）。
 */
export async function reverseGeocodeWithRetry(coords: {
  latitude: number;
  longitude: number;
}): Promise<ReverseGeocodeOutcome> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastFailure: 'timeout' | 'error' = 'timeout';
  let lastError: unknown = null;

  while (attempts < GEOCODE_MAX_ATTEMPTS) {
    const remaining = GEOCODE_TOTAL_BUDGET_MS - (Date.now() - startedAt);
    // 第一次一定发（只有 `attempts > 0` 才看预算）：预算管的是**重试**，
    // 不是"开局就可能没时间"。`GEOCODE_MAX_ATTEMPTS` 被调大时，闸门就在这一行。
    if (attempts > 0 && remaining < GEOCODE_MIN_ATTEMPT_MS) break;
    attempts += 1;

    const result = await reverseGeocodeOnce(coords, Math.min(GEOCODE_ATTEMPT_TIMEOUT_MS, remaining));
    if (result.status === 'ok') {
      // 空数组 → `address` 是 `undefined`。`Array.isArray` 是防原生回一个怪东西（不是数组）。
      const address = Array.isArray(result.addresses) ? result.addresses[0] : undefined;
      return { status: 'ok', address, attempts };
    }
    lastFailure = result.status;
    lastError = result.status === 'error' ? result.error : null;
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

/* ==========================================================================
 * 第二条通道：免 Key 的公开反查（BigDataCloud）
 * ========================================================================== */

/**
 * 网络兜底这条通道**总共**最长等多久（毫秒）。
 *
 * ## 为什么是 4000，以及"最坏要等多久"到底是多少
 *
 * 这条通道只在**原生反查已经失败之后**才会发出去，所以它花的时间是**加在**原生那一段
 * 后面的（`reverseGeocodeWithRetry` 已经开始计时）。把两段加起来才是用户真正在等的：
 *
 *   原生：最多 2 次 × 5000ms            = 10000ms（`GEOCODE_TOTAL_BUDGET_MS`，硬闸门）
 *   网络：最多 1 次 × 4000ms            =  4000ms（本常量，**不重试**）
 *   ────────────────────────────────────────────
 *   单张照片最坏等待                    = 14000ms ≈ 14 秒
 *
 * 这个数**必须**在注释里写死并保持可核（用户最烦的就是导入一张照片卡半天）：
 * 加这条通道之前是 10s，之后是 14s，**多出来的 4s 只花在"原生两次都没成"的照片上** ——
 * 也就是那些本来就已经退成坐标的照片。正常照片（几百毫秒回来的）一秒都不会多等。
 *
 * 为什么**不给网络这一条加重试**：重试的收益在"偶尔抽风"的服务上，而这条通道的失败
 * 几乎都是"没网"（重试还是没网）。多一次就多 4s，串行导入 12 张就是 48s ——
 * 那是比"没有地名"严重得多的体验问题。一次不成就退坐标。
 *
 * 为什么比原生单次的 5000ms 还小 1000：它是**最后一道**兜底，前面的 10s 已经把
 * "网络慢"这件事充分暴露过了；再给 5s 等于承认总时长可以到 15s。
 */
export const GEOCODE_NETWORK_TIMEOUT_MS = 4000;

/**
 * 免 Key 的公开反查接口。
 *
 * 为什么用它（而不是再加一个原生 SDK）：`Location.reverseGeocodeAsync` 在 iOS 上走
 * 苹果自己的服务，失败时我们**没有任何补救手段**；这条 HTTPS 接口不需要任何 Key、
 * 不需要额外权限、也不需要新增依赖（`fetch` 是 RN 内置的）。
 *
 * ⚠️ 隐私：这是把**照片里的坐标**发给第三方。所以它只在
 *   ① 设置里明确选了「地名」档（`locationMode === 'place'`）、且
 *   ② 原生反查已经失败
 * 之后才会发出 —— 见 `resolvePlaceFromCoords`。用户选「只印坐标」或「关闭」时，
 * 这个函数在整个进程里一次都不会被调用。
 */
const BIGDATACLOUD_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/**
 * BigDataCloud 的响应里我们真正会读的字段（其余字段一律不声明，见下）。
 *
 * 为什么**不**用 `interface` + 索引签名去"完整描述"这个接口：它的响应里有一个很大的
 * `localityInfo.administrative[]` 数组（实测香港那一次回了 7 条、每条带 description /
 * wikidataId / geonameId），既没必要读、也不该让它进入我们的类型。
 * 只声明要用的五个字段，其余用不着。
 *
 * ⚠️ 全部按"可能缺失 / 可能是空串"处理（`?` + `string`）：接口没有版本承诺，
 * 而且 `principalSubdivision` 在港澳这种城市型地区**实测就是空串**。
 */
interface BigDataCloudReverse {
  /** 国家 / 地区名，**已经按 `localityLanguage` 本地化**（实测香港回「香港」）。 */
  countryName?: string;
  /** ISO 3166-1 alpha-2（实测香港回 `'HK'`，**不是 `'CN'`** —— 红线靠我们自己的表）。 */
  countryCode?: string;
  /** 一级行政区（省 / 州）。实测巴黎回 `'Ile-de-France'`，香港回 `''`。 */
  principalSubdivision?: string;
  /** 城市。 */
  city?: string;
  /** 城市下面的区（实测香港回 `'油尖旺區'`、巴黎回 `'Saint-Merri'`）。 */
  locality?: string;
}

/**
 * 网络通道的结局。**三态**，而且刻意只判 `ok` / 其余：
 * 超时、HTTP 非 200、畸形 JSON 在**日志措辞**上不值得分成三句 —— 它们对用户是同一件事
 * （"网络这条路也没成"），分得越细，日志里越多没有信息量的行。
 * 真正需要区分的是"原生失败"与"网络也失败"这两段，那由调用方（`resolvePlaceFromCoords`）拼。
 */
type NetworkGeocodeAttempt =
  | { status: 'ok'; address: PlaceGeocodeAddress }
  | { status: 'failed'; reason: string };

/**
 * 超时 / `AbortController` 版的取值。
 *
 * 为什么不能复用上面的 `withTimeout`：那一个拿不到 `AbortController`，
 * 超时之后 `fetch` **还在跑**（连接不释放，用户切页面时它还在耗电）。
 * 这里把 `abort()` 和"resolve 成哨兵"绑在同一个计时器上。
 *
 * ⚠️ 两个细节都踩过坑：
 * 1. `abortPromise.catch(() => undefined)` **必须写**：`abort()` 触发时
 *    `fetch` 那一侧的拒绝会由 `Promise.race` 消费掉，但这个 `catch` 分支也要有人接，
 *    否则 Hermes 会在控制台抛一个 `AbortError` 的未处理拒绝；
 * 2. 无论成功失败都 `clearTimeout`：`fetch` 正常回来之后还留着计时器的话，
 *    它会在 4s 后调一次没有意义的 `abort()`。
 */
async function fetchWithAbortTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abortPromise = new Promise<null>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(null), { once: true });
  });
  try {
    return await Promise.race([fetch(url, { signal: controller.signal }), abortPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把 BigDataCloud 的响应体变成 `PlaceGeocodeAddress`；一个可用地名都没有时返回 `undefined`。
 *
 * ⚠️ **不做任何"猜"的降级**：这个接口给的字段就那五个，缺了就是缺了。
 * 尤其**不许**拿 `localityInfo.administrative[]` 里的名字来顶 ——
 * 那一堆是"这个点周边有哪些行政区"（实测还混着「南海」「粵港澳大灣區」这种非行政区），
 * 顺序和层级都没有承诺，用它等于把地名交给运气。
 */
function parseBigDataCloudAddress(body: BigDataCloudReverse): PlaceGeocodeAddress | undefined {
  const countryName = typeof body.countryName === 'string' ? body.countryName.trim() : '';
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim() : '';
  const subdivision = typeof body.principalSubdivision === 'string' ? body.principalSubdivision.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const locality = typeof body.locality === 'string' ? body.locality.trim() : '';

  // 国家名、国家码、城市全空 —— 这个响应没有任何可用的地名（204 / 空对象 / 纯坐标都走这里）。
  if (countryName.length === 0 && countryCode.length === 0 && city.length === 0 && subdivision.length === 0) {
    return undefined;
  }

  return {
    /*
     * 三个字段的映射（**顺序有意义**）：
     *   · `country` 用 `countryName`（已本地化）；缺失时才退 `countryCode`，
     *     让 `formatResolvedPlace` 的国名段不至于空着（`countryWord` 本来就有这条降级）；
     *   · `region` 用 `principalSubdivision`（省 / 州）；
     *   · `city` 用 `city`，缺失时退 `locality`（区）—— 和 `resolvePlaceFromGeocode`
     *     自带的降级链方向一致（越靠近拍摄点的越优先）。
     *
     * ⚠️ `resolvePlaceFromGeocode` 才是"反查结果 → 结构"的唯一入口，本函数只负责
     * **把形状摆正**（字段名对齐），一行字符串都不拼 —— 拼接和红线判别全在 `placeNames.ts`。
     * 这样这条通道和原生通道最后走的是**同一个渲染器**，不存在"网络回来的地名少一个「中国」"。
     */
    country: countryName.length > 0 ? countryName : countryCode,
    isoCountryCode: countryCode.length > 0 ? countryCode : null,
    region: subdivision.length > 0 ? subdivision : null,
    city: city.length > 0 ? city : locality.length > 0 ? locality : null,
  };
}

/**
 * 第二条通道：发一次公开反查（**含 4s 超时**）。本函数**绝不抛**。
 *
 * 契约与原生那条完全一致（这是刻意的，两条路必须能放进同一个 `??` 里）：
 * · 超时 / 非 2xx / 畸形 JSON / 网络异常 → 统一的失败结局，原因写进 `reason`；
 * · **一个字段都没解析出来**（204、`null`、空对象）→ 也是失败，因为"没有地名"和
 *   "调用失败"对调用方的下场一样（退坐标），但对日志有意义，所以 reason 分开写。
 * · 失败一律只 `console.warn`，**绝不向上抛** —— 抛出去会变成
 *   `importAndDevelop` 的 `failed += 1`，把一张本来能出片的照片算成失败。
 */
async function reverseGeocodeViaNetwork(
  coords: { latitude: number; longitude: number },
  language: GeoLocale,
): Promise<NetworkGeocodeAttempt> {
  const url =
    `${BIGDATACLOUD_ENDPOINT}?latitude=${encodeURIComponent(String(coords.latitude))}` +
    `&longitude=${encodeURIComponent(String(coords.longitude))}` +
    // `localityLanguage` 只收两种写法（实测可用：'zh' / 'en'）；'zh-Hans' / 'zh-Hant'
    // 统一折成 'zh'，因为接口不做简繁区分（香港那次简繁回的都是「油尖旺區」）。
    `&localityLanguage=${language === 'en' ? 'en' : 'zh'}`;

  let response: Response | null;
  try {
    response = await fetchWithAbortTimeout(url, GEOCODE_NETWORK_TIMEOUT_MS);
  } catch (error) {
    // 网络层异常（DNS / TLS / 断网 / 请求被 abort）。**只 warn**，不抛。
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[retro-film-cam] 公开反查接口请求失败：${reason}`);
    return { status: 'failed', reason };
  }

  if (response === null) {
    // 计时器先到：`fetchWithAbortTimeout` resolve 成 null（同时已经把请求 abort 掉）。
    console.warn(
      `[retro-film-cam] 公开反查接口超时（超过 ${GEOCODE_NETWORK_TIMEOUT_MS}ms，请求已中止）`,
    );
    return { status: 'failed', reason: `超时（${GEOCODE_NETWORK_TIMEOUT_MS}ms）` };
  }

  if (!response.ok) {
    console.warn(`[retro-film-cam] 公开反查接口返回 HTTP ${response.status}`);
    return { status: 'failed', reason: `HTTP ${response.status}` };
  }

  /*
   * 解析这一步单独包 try：畸形 JSON（网关回了 HTML 错误页 / 被中间设备改写）抛的是
   * `SyntaxError`，和"网络异常"是两回事，但下场一样。**不许让它冒到调用方**
   * （调用方在 `importAndDevelop` 的 per-photo try 里，冒出去就是一张照片被算成失败）。
   */
  let body: BigDataCloudReverse;
  try {
    body = (await response.json()) as BigDataCloudReverse;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[retro-film-cam] 公开反查接口回了不是 JSON 的内容：${reason}`);
    return { status: 'failed', reason };
  }

  if (body === null || typeof body !== 'object') {
    console.warn('[retro-film-cam] 公开反查接口回了一个空响应（不是对象）');
    return { status: 'failed', reason: '响应为空' };
  }

  const address = parseBigDataCloudAddress(body);
  if (address === undefined) {
    console.warn('[retro-film-cam] 公开反查接口没有给出任何可用地名（国家 / 行政区 / 城市全空）');
    return { status: 'failed', reason: '没有可用地名' };
  }

  return { status: 'ok', address };
}

/* ==========================================================================
 * 两条通道的编排：原生优先 → 公开接口兜底
 * ========================================================================== */

/** 两条通道都走完之后的结局。`ok` 里**一定有**一个可用的地名（没有地名的情形算失败）。 */
export type ResolvePlaceOutcome =
  | { status: 'ok'; address: PlaceGeocodeAddress; place: ResolvedPlace; channel: 'native' | 'network' }
  | {
      status: 'failed';
      /** 原生那一段的结局（超时 / 抛异常 / 空数组 / 字段全空）。 */
      native: ReverseGeocodeOutcome;
      /** 网络那一段为什么也没成（`null` = 没走到那一步）。 */
      network: string | null;
      /** 两段合计发了几次请求（原生 1~2 次 + 网络 0~1 次）。 */
      attempts: number;
    };

/**
 * 坐标 → 结构化地名：**原生反查失败时自动走第二条通道**。
 *
 * 这是"相机页现场拍"和"相册导入"**唯一**的地名入口，两条路必须从这里拿
 * （耐心值 / 重试 / 兜底顺序 / 日志措辞都只在本文件里定义一次，见文件头）。
 *
 * ## 最坏等待时间（用户最在意的一条，改动时**必须**同步更新这里和 `GEOCODE_NETWORK_TIMEOUT_MS`）
 *
 * ```
 *   原生：2 次 × 最多 5000ms  = 10000ms   ← GEOCODE_TOTAL_BUDGET_MS 是硬闸门
 *   网络：1 次 × 最多 4000ms  =  4000ms   ← GEOCODE_NETWORK_TIMEOUT_MS，不重试
 *   ─────────────────────────────────────
 *   最坏                      ≈ 14000ms（14 秒）
 * ```
 * 这 14s 只发生在"原生两次都没成**且**公开接口也卡住"的照片上。正常照片几百毫秒，
 * 原生一次就成的照片**一秒都不会多等**（网络那段根本不会发）。历史基线是 5s 单次、
 * 后来是 10s 两次；本轮加兜底后是 14s —— 用户拍板的取舍是"宁可多等 4 秒换来地名"，
 * 但**不许**再往上加（要加压在 `GEOCODE_NETWORK_TIMEOUT_MS`，那一个数就是总闸门）。
 *
 * ## 什么时候**不**发网络请求
 *
 * 原生"答了但没名字"（空数组 / 字段全空）也走网络通道 —— 这正是要做兜底的那类点
 * （海上、极地、刚开盘的新楼盘、机场 / 车站这类 POI）。两种通道的组合结果是：
 * 原生成功 → 一次网络都不发；原生失败 → 恰好一次。
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
): Promise<ResolvePlaceOutcome> {
  const placeLocale = resolveGeoLocale(geoLocale, uiLocale);

  const native = await reverseGeocodeWithRetry(coords);
  if (native.status === 'ok' && native.address !== undefined) {
    const place = resolvePlaceFromGeocode(native.address, coords.latitude, coords.longitude);
    if (hasPlaceName(place)) {
      return { status: 'ok', address: native.address, place, channel: 'native' };
    }
  }

  /*
   * 走到这里有两种原因，日志里必须分得清：
   *   · 原生根本没答成（超时 / 抛异常）→ 用 `describeGeocodeFailure` 的原话；
   *   · 原生答了，但地址对象里一个可用字段都没有（空数组或 `{}`）→ 另说一句。
   * 措辞沿用 `resolvePlaceFromExifGps` 里那几句的用词（"退回坐标"），
   * 免得同一种失败在两条路上被描述成两件事。
   */
  const nativeReason =
    native.status === 'ok'
      ? '原生反查返回空数组 / 结果里没有任何可用地名'
      : describeGeocodeFailure(native);

  const network = await reverseGeocodeViaNetwork(coords, placeLocale);
  if (network.status === 'ok') {
    const place = resolvePlaceFromGeocode(network.address, coords.latitude, coords.longitude);
    if (hasPlaceName(place)) {
      return { status: 'ok', address: network.address, place, channel: 'network' };
    }
    console.warn(
      '[retro-film-cam] 公开反查接口的结果里也没有可用地名，这张退回坐标：' +
        `${formatCoords(coords.latitude, coords.longitude)}`,
    );
    return {
      status: 'failed',
      native,
      network: '结果里没有可用地名',
      attempts: native.attempts + 1,
    };
  }

  // 两条都没成：**一条日志说清全过程**（原生为什么失败 + 网络为什么失败 + 坐标），
  // 这是"这张照片为什么只印坐标"唯一的事后线索。
  console.warn(
    `[retro-film-cam] 两条反查通道都没拿到地名（原生：${nativeReason}；公开接口：${network.reason}），` +
      `这张退回坐标：${formatCoords(coords.latitude, coords.longitude)}`,
  );
  return {
    status: 'failed',
    native,
    network: network.reason,
    attempts: native.attempts + 1,
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
      // 相册导入那条路（`importPhoto.ts` 的反查失败兜底）用的是同一个函数，
      // 两边的"只有坐标"必须逐字段一致，否则同一张照片从相机出来和从相册导入出来
      // 会印出不一样的字。
      const place: ResolvedPlace = coordsOnlyPlace(coords.latitude, coords.longitude);
      // 坐标模式下"要显示的那一行"就是坐标本身：文件名 / 相册条目里没有城市可写。
      return { ok: true, text: formatResolvedPlace(place, placeLocale, detail), place };
    }

    /*
     * 反查地名：原生两次没成就自动走公开接口兜底（耐心值 / 顺序 / 日志措辞全部
     * 收在 `resolvePlaceFromCoords` 里，相册导入走的是**同一个函数** ——
     * 两条路的等待时间与兜底行为必须一模一样）。
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
      // 坐标与两条通道的失败原因都已经在 `resolvePlaceFromCoords` 里 warn 过了，
      // 这里只补一句"相机页这一次没有地名"，避免日志里出现两份坐标。
      console.warn(
        `[retro-film-cam] 相机页这一张没有地名（原生发了 ${resolved.native.attempts} 次，` +
          `公开接口${resolved.network === null ? '未走' : `：${resolved.network}`}）`,
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
