/**
 * 全局设置的 Provider / Hook。
 *
 * 为什么用 Context 而不是每处各自 AsyncStorage：
 * 语言一改，取景屏幕、LCD、显影遮罩、权限提示、设置界面**五处**要同时换字。
 * 数据在 Context 里改一次，所有 `useI18n()` / `useSettings()` 自动重渲染。
 *
 * 启动时序：首帧先用默认值渲染（`locale: 'auto'` → 跟随系统，本来就是对的），
 * 异步读到用户设置后再刷一次。所以正常情况下用户看不到任何闪烁。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AppSettings,
  CaptureQuality,
  DateEngineConfig,
  FrameVariant,
  GeoLocale,
  GrainLevelId,
  LocalePreference,
  LocationMode,
  PlaceDetail,
  WatermarkLayout,
} from '../types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings } from '../utils/settingsStore';

export interface SettingsContextValue {
  settings: AppSettings;
  /** 是否已经从存储里读回来了（调试/测试用，UI 不依赖它）。 */
  hydrated: boolean;
  setLocalePreference: (next: LocalePreference) => void;
  setLocationMode: (next: LocationMode) => void;
  /** 水印版式（四选一）。 */
  setWatermarkLayout: (next: WatermarkLayout) => void;
  /** 地名详细度（精简 / 完整）。 */
  setPlaceDetail: (next: PlaceDetail) => void;
  /** 颗粒档位。原来在取景器底部那条横向滑块上，现在归设置页管。 */
  setGrainLevel: (next: GrainLevelId) => void;
  /**
   * 地名用哪种语言印（`'auto'` = 跟界面语言走）。
   * 和 `setLocalePreference` 是两件事：这个是照片上那行字，不是界面。
   */
  setGeoLocale: (next: GeoLocale | 'auto') => void;
  /** 成片画质档（v1.7.0）。只决定成片长边像素，不改构图。 */
  setCaptureQuality: (next: CaptureQuality) => void;
  /** 相框风格变体（v1.7.0）。抽屉里左右滑动调它，取景器与成片同时跟着变。 */
  setFrameVariant: (next: FrameVariant) => void;
  /**
   * 日期烙印引擎（v1.8.0）：格式 / 字形 / 机位 / 发光色四项一起改。
   *
   * 四项**不接受部分更新**：它们是同一枚烙印的四个轴，单独换一个会让
   * "数码管字形 + 白边分离机位"这种组合在中途露出半个状态。调用方要么整份
   * 传、要么用 `{ ...settings.dateEngine, spot: next }` 显式展开。
   */
  setDateEngine: (next: DateEngineConfig) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // 已经卸载就别再 setState（Expo Go 里热重载会频繁触发）。
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void loadSettings().then((loaded) => {
      if (!aliveRef.current) return;
      setSettings(loaded);
      setHydrated(true);
    });
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** 先改内存再落盘：界面立刻响应，写盘失败也不影响这次操作。 */
  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void persistSettings(next);
      return next;
    });
  }, []);

  const setLocalePreference = useCallback(
    (next: LocalePreference) => update({ locale: next }),
    [update],
  );

  const setLocationMode = useCallback(
    (next: LocationMode) => update({ locationMode: next }),
    [update],
  );

  const setWatermarkLayout = useCallback(
    (next: WatermarkLayout) => update({ watermarkLayout: next }),
    [update],
  );

  const setPlaceDetail = useCallback(
    (next: PlaceDetail) => update({ placeDetail: next }),
    [update],
  );

  const setGrainLevel = useCallback(
    (next: GrainLevelId) => update({ grainLevel: next }),
    [update],
  );

  const setGeoLocale = useCallback(
    (next: GeoLocale | 'auto') => update({ geoLocale: next }),
    [update],
  );

  const setCaptureQuality = useCallback(
    (next: CaptureQuality) => update({ captureQuality: next }),
    [update],
  );

  const setFrameVariant = useCallback(
    (next: FrameVariant) => update({ frameVariant: next }),
    [update],
  );

  const setDateEngine = useCallback(
    (next: DateEngineConfig) => update({ dateEngine: next }),
    [update],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hydrated,
      setLocalePreference,
      setLocationMode,
      setWatermarkLayout,
      setPlaceDetail,
      setGrainLevel,
      setGeoLocale,
      setCaptureQuality,
      setFrameVariant,
      setDateEngine,
    }),
    [
      settings,
      hydrated,
      setLocalePreference,
      setLocationMode,
      setWatermarkLayout,
      setPlaceDetail,
      setGrainLevel,
      setGeoLocale,
      setCaptureQuality,
      setFrameVariant,
      setDateEngine,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** 取设置与全部 setter。必须在 `<SettingsProvider>` 之内使用。 */
export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('[retro-film-cam] useSettings 必须放在 <SettingsProvider> 里');
  }
  return value;
}
