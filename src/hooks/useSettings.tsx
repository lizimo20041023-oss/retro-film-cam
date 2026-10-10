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
import type { AppSettings, LocalePreference, LocationMode } from '../types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings } from '../utils/settingsStore';

export interface SettingsContextValue {
  settings: AppSettings;
  /** 是否已经从存储里读回来了（调试/测试用，UI 不依赖它）。 */
  hydrated: boolean;
  setLocalePreference: (next: LocalePreference) => void;
  setLocationMode: (next: LocationMode) => void;
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

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, hydrated, setLocalePreference, setLocationMode }),
    [settings, hydrated, setLocalePreference, setLocationMode],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** 取设置与两个 setter。必须在 `<SettingsProvider>` 之内使用。 */
export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('[retro-film-cam] useSettings 必须放在 <SettingsProvider> 里');
  }
  return value;
}
