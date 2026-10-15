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
  resolveGeoLocale,
  resolvePlaceFromGeocode,
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

    // 反查地名：超时 / 抛异常会自动再试一次（常量、重试逻辑、日志措辞都在本文件，
    // 相册导入走的是同一个 `reverseGeocodeWithRetry` —— 两条路的耐心值必须一模一样）。
    const outcome = await reverseGeocodeWithRetry(coords);
    if (outcome.status !== 'ok') {
      // 留痕：以前这里静默退坐标，"这张照片为什么没有地名"事后完全查不出来。
      // 带上坐标是为了能对着那张照片复现；只 warn，绝不抛
      // （相机页抛出去只会白丢一帧水印，不如老老实实退成坐标）。
      console.warn(
        `[retro-film-cam] 相机页没拿到地名（${describeGeocodeFailure(outcome)}）：` +
          `${formatCoords(coords.latitude, coords.longitude)}`,
      );
      return { ok: false, reason: 'failed' };
    }

    const place = resolvePlaceFromGeocode(outcome.address, coords.latitude, coords.longitude);
    // 语言用的是上面解析好的 `placeLocale`，不是原始的 `locale`：
    // 原始值可能是 'auto'，直接传下去会落到 `formatResolvedPlace` 的默认档（简中），
    // 于是"界面英文 + 地名 auto"就会印出中文 —— 这正是 §五.2 要避免的那种错。
    const text = formatResolvedPlace(place, placeLocale, detail);
    // 反查"成功"但一个字都没解析出来（海上、极地）：这一行没有任何信息量，
    // 与其烧一串空字符串，不如老老实实报"这次没拿到"。
    return text.trim().length > 0 ? { ok: true, text, place } : { ok: false, reason: 'failed' };
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
