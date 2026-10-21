/**
 * 定位水印的 React 层：把「谁在什么时候去取定位」和「取到了什么」分开。
 *
 * 关键行为：**按下快门时同步取一次定位**（`resolveForShot`），取到就烧进这张照片，
 * 取不到就这张不烧 —— 不影响出片，也不阻塞快门。
 * 之所以不"进屏幕就取一次然后一直用"：那样烧进照片的可能是一小时前在另一个地方
 * 拿到的坐标，比没有定位更糟。
 *
 * 这个 hook 只做三件事：读设置（模式 / 语言 / 地名档位）、加截止线、把结果分别交给
 * 「LCD 显示」和「成片水印」。字符串怎么拼、结构长什么样全在 `utils/placeNames.ts`。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useSettings } from './useSettings';
import { fetchLocationStamp, trimLocationText } from '../utils/locationStamp';
import type { LocationStampOutcome, LocationStampState, ResolvedPlace } from '../types';

const IDLE_STATE: LocationStampState = { kind: 'off' };

/**
 * 定位结果的复用窗口：3 分钟。
 *
 * 为什么以前"每张都重新取一次 fix"是发热源：`fetchLocationStamp` 在 `mode === 'place'`
 * 时会走 CoreLocation 取坐标和地名反查，
 * 连拍五张就是五轮 GPS 无线电唤醒 + 五次网络请求 —— 而 200ms 前刚拿到的坐标，
 * 和下一张照片需要的那个地方，通常就是同一个点（用户没长腿）。
 *
 * 3 分钟覆盖一次短途拍摄，避免每分钟重复唤醒 GPS 与地名网络；仍短于预览地名的
 * 15 分钟刷新窗口。这个窗口**只影响烧进照片的
 * 地名**，不影响 LCD 上的显示（LCD 仍按设置变化即时刷新）。
 */
const LOCATION_CACHE_TTL_MS = 3 * 60_000;

/** 一次定位结局的缓存条目：键里带全部会改变取数结果的设置。 */
interface LocationFixCache {
  key: string;
  at: number;
  outcome: LocationStampOutcome;
}

/**
 * 按快门时最多为定位等多久。
 *
 * 1.5 秒覆盖热启动与缓存命中；冷启动地名请求会继续在后台完成并进入缓存，
 * 但当前照片不再为了定位额外等待 2.5 秒。
 */
const SHOT_DEADLINE_MS = 1500;

/**
 * 给 promise 加一道硬截止线，超时返回 `null`。
 * 用它而不是 `AbortController`：`expo-location` 的那几个 API 不接受 signal。
 */
function withinDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export interface LocationStampController {
  /** 当前状态，只用于 LCD 显示。 */
  state: LocationStampState;
  /**
   * 按当前设置取一次定位，返回要烧进照片的**结构化地名**。
   * `off` / 失败 / 用户没给权限时都返回 `null`。
   *
   * 为什么返回结构而不是拼好的字符串：成片水印要按**当前语言**重排
   * （见 `types.ResolvedPlace` 的说明）。LCD 上那行字由本 hook 顺手拼好，
   * 因为 LCD 只认"现在这一刻的语言"，不需要重排。
   */
  resolveForShot: () => Promise<ResolvedPlace | null>;
  /** 重新探测一次（用户刚从设置里打开定位时调）。 */
  refresh: () => void;
}

export function useLocationStamp(): LocationStampController {
  const { settings } = useSettings();
  const { localeId } = useI18n();
  const mode = settings.locationMode;
  const detail = settings.placeDetail;
  /*
   * 地名语言（§五.2）：直接把手里的设置值交给取数层，由它内部的 `resolveGeoLocale` 解析。
   * 为什么不在这个 hook 里先解析成具体语言再传下去：LCD 这行字和成片水印是同一套词表，
   * 解析规则必须只有一处（`placeNames.resolveGeoLocale`）—— 在这里再写一遍 switch，
   * 以后加语言就会出现"LCD 印英文、水印印中文"的错位。
   * `localeId`（界面语言）单独传：`geoLocale === 'auto'` 时它就是参照物。
   */
  const geoLocale = settings.geoLocale;

  const [state, setState] = useState<LocationStampState>(IDLE_STATE);
  const [probeToken, setProbeToken] = useState(0);

  /**
   * 最近一次成功定位（v1.8.6 · 契约 §5）。**只缓存成功**：失败路径必须每次重试，
   * 否则用户刚走出地下室、打开 App 想拍一张，会被 60 秒前那次 `no-network`
   * 一直挡着。
   */
  const fixCacheRef = useRef<LocationFixCache | null>(null);
  /**
   * 在途请求复用（v1.8.6）：LCD 探测和快门几乎同时发起时（进屏 400ms 内按快门），
   * 两次 `fetchLocationStamp` 会各自唤醒一遍 GPS。同 key 的第二次调用直接等第一次 ——
   * 返回的结局对两者都成立，因为它只取决于设置与设备位置。
   */
  const inflightRef = useRef<{ key: string; promise: Promise<LocationStampOutcome> } | null>(null);

  // 关掉定位时，任何在途的结果都不许再改状态。
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * 取一次定位结局，带 60s 缓存 + 在途复用（v1.8.6 · 契约 §5）。
   *
   * `force` 只在用户主动"重新探测"时用（设置页打开定位 / 手动刷新）：
   * 那条路径的语义是"我不信你手里的旧坐标，现在就重取"。
   *
   * 缓存键带上 `localeId` / `geoLocale` / `detail`：这三个一变，反查出来的
   * **字符串**就完全不同（换语言/换详细度），不能拿旧结局顶替。
   */
  const fetchFix = useCallback(
    (force: boolean): Promise<LocationStampOutcome> => {
      const key = `${mode}|${geoLocale}|${detail}|${localeId}`;
      const now = Date.now();
      const cached = fixCacheRef.current;
      if (!force && cached !== null && cached.key === key && now - cached.at < LOCATION_CACHE_TTL_MS) {
        return Promise.resolve(cached.outcome);
      }
      const inflight = inflightRef.current;
      if (!force && inflight !== null && inflight.key === key) {
        return inflight.promise;
      }

      const promise = fetchLocationStamp(mode, geoLocale, detail, localeId).then((outcome) => {
        if (outcome.ok) {
          fixCacheRef.current = { key, at: Date.now(), outcome };
        }
        return outcome;
      });
      inflightRef.current = { key, promise };
      const clear = (): void => {
        if (inflightRef.current?.promise === promise) {
          inflightRef.current = null;
        }
      };
      void promise.then(clear, clear);
      return promise;
    },
    [mode, geoLocale, detail, localeId],
  );

  /**
   * 总开关关掉就立刻复位；打开时先显示"定位中"，再异步探测一次用于 LCD 预览。
   * 这一步纯粹是给用户看的反馈（LCD 上会从"定位 关"变成地名），
   * 真正烧进照片的值永远走 `resolveForShot`。
   *
   * `localeId` / `geoLocale` / `detail` 进依赖数组是有意的：在设置里切换界面语言、
   * 地名语言或地名档位后，LCD 上那行预览必须立刻跟着变，否则用户会以为设置没生效。
   */
  useEffect(() => {
    if (mode === 'off') {
      setState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    setState({ kind: 'locating' });

    void fetchFix(false).then((outcome) => {
      if (cancelled || !aliveRef.current) return;
      if (outcome.ok) {
        setState({ kind: 'ready', text: trimLocationText(outcome.text) });
      } else {
        setState({ kind: 'error', reason: outcome.reason });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, geoLocale, localeId, detail, probeToken, fetchFix]);

  const resolveForShot = useCallback(async (): Promise<ResolvedPlace | null> => {
    if (mode === 'off') {
      return null;
    }
    // 到这里才带截止线：LCD 上那次探测可以慢慢等，按快门这次不行。
    // v1.8.6：走 fetchFix 的 60s 缓存 —— 连拍第二张不再重新唤醒 GPS（契约 §5）。
    const outcome = await withinDeadline(fetchFix(false), SHOT_DEADLINE_MS);
    if (outcome === null) {
      return null;
    }
    if (aliveRef.current) {
      if (outcome.ok) {
        setState({ kind: 'ready', text: trimLocationText(outcome.text) });
      } else {
        setState({ kind: 'error', reason: outcome.reason });
      }
    }
    return outcome.ok ? outcome.place : null;
  }, [fetchFix, mode]);

  const refresh = useCallback(() => {
    // 手动刷新必须绕开缓存：用户点这个按钮的语义就是"现在就重取一次"。
    fixCacheRef.current = null;
    setProbeToken((n) => n + 1);
  }, []);

  return { state, resolveForShot, refresh };
}
