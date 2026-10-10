/**
 * 定位水印的取数与格式化。
 *
 * 隐私前提（写在这里也是给以后改代码的人看）：
 * - **默认关**，且关的时候连权限都不申请（`expo-location` 一行都不调）；
 * - 地名模式会用系统反查（iOS 走苹果、Android 走谷歌），这一步是联网的，
 *   所以设置界面里必须原样告诉用户；
 * - 坐标模式是**纯本地格式化**，拿到经纬度就完事，不请求任何网络。
 *
 * 三个 helper 都能单独调用（`formatCoords` 是纯函数，测试/调试时很好用）。
 */
import * as Location from 'expo-location';
import type { MessageKey } from '../i18n/types';
import type { LocationFailureReason, LocationMode, LocationStampOutcome } from '../types';

/**
 * 单次定位最长等多久。
 * 相机场景下"拍完照等定位"是纯粹的破坏体验，宁可这张照片没有定位。
 */
const FIX_TIMEOUT_MS = 6000;

/** 反查地名最长等多久（反查要联网，比取坐标更容易卡）。 */
const GEOCODE_TIMEOUT_MS = 5000;

/** 超时哨兵，用来把「超时」和「失败」区分开。 */
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

/**
 * 经纬度 → 一行等宽字符：`31.230°N 121.474°E`。
 *
 * 为什么不用 N/E 之外的写法：度数符号 + 方位字母是胶片机 GPS 背板的通行写法，
 * 而且**不含逗号**，跟在左下角当水印时不会被误读成"两个数字"。
 */
export function formatCoords(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(3)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(3)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
}

/**
 * 反查结果 → `城市 · 国家`。
 *
 * 逐级降级是必须的：小镇、海上、机场反查出来经常没有 `city`，
 * 但一般还有 `region` / `country`。实在什么都没有才返回 `null`。
 */
export function describePlace(
  address: Location.LocationGeocodedAddress | undefined,
): string | null {
  if (!address) {
    return null;
  }
  const parts = [address.city, address.region, address.country].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );
  // 去掉相邻重复（有些地区 city 和 region 同名，比如"东京都/东京"）。
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (unique[unique.length - 1] !== trimmed) {
      unique.push(trimmed);
    }
  }
  if (unique.length === 0) {
    return null;
  }
  // 最多两级：`上海市 · 中国`，比 `上海市 · 上海市 · 中国` 好看得多。
  return unique.slice(0, 2).join(' · ');
}

/**
 * 取一次定位水印文字。
 *
 * 返回 `{ ok: false, reason }` 而不是抛异常 —— 调用方（拍照流程）只需要决定
 * "这次不写定位"，不该被异常打断出片。
 */
export async function fetchLocationStamp(mode: LocationMode): Promise<LocationStampOutcome> {
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
      return { ok: true, text: formatCoords(coords.latitude, coords.longitude) };
    }

    const places = await withTimeout(
      Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude }),
      GEOCODE_TIMEOUT_MS,
    );
    if (places === TIMEOUT) {
      return { ok: false, reason: 'failed' };
    }
    const text = describePlace(places[0]);
    return text === null ? { ok: false, reason: 'failed' } : { ok: true, text };
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
  failed: { short: 'location.failed', full: 'location.failed' },
};
