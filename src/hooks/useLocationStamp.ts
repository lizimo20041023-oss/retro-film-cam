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
import type { LocationStampState, ResolvedPlace } from '../types';

const IDLE_STATE: LocationStampState = { kind: 'off' };

/**
 * 按快门时最多为定位等多久。
 *
 * 2.5 秒是权衡出来的：热启动 + 有已知位置时通常 100~400ms 就回来了，
 * 而"显影中"面板超过 3 秒用户就开始怀疑卡死。宁可这张照片没有地点，
 * 也不能让快门为了一个水印多转两秒。
 */
const SHOT_DEADLINE_MS = 2500;

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

  // 关掉定位时，任何在途的结果都不许再改状态。
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

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

    void fetchLocationStamp(mode, geoLocale, detail, localeId).then((outcome) => {
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
  }, [mode, geoLocale, localeId, detail, probeToken]);

  const resolveForShot = useCallback(async (): Promise<ResolvedPlace | null> => {
    if (mode === 'off') {
      return null;
    }
    // 到这里才带截止线：LCD 上那次探测可以慢慢等，按快门这次不行。
    const outcome = await withinDeadline(
      fetchLocationStamp(mode, geoLocale, detail, localeId),
      SHOT_DEADLINE_MS,
    );
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
  }, [mode, geoLocale, localeId, detail]);

  const refresh = useCallback(() => setProbeToken((n) => n + 1), []);

  return { state, resolveForShot, refresh };
}
