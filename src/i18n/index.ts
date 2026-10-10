/**
 * i18n 运行时 —— 极简自研，不引 i18n-js / i18next。
 *
 * 为什么自己写：全项目其实只需要三件事 —— 查表、填占位符、跟随系统语言。
 * 而"跟随系统"必须用 `expo-localization` 的 `useLocales()`
 * （它是 hook，系统改语言会重渲染），第三方库反而要多写一层桥接。
 *
 * 语言从哪来：`useSettings()` 里用户选的偏好（`'auto'` = 跟随系统）。
 * 所以这个模块依赖设置层，而不是反过来。
 */
import { getLocales, useLocales } from 'expo-localization';
import { useCallback, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import type { LocalePreference } from '../types';
import { FALLBACK_LOCALE, FALLBACK_LOCALE_ID, LOCALES, findLocale } from './locales';
import type {
  LocaleId,
  LocaleMeta,
  MessageKey,
  TranslateFn,
  TranslateParams,
} from './types';

export type { LocaleId, LocaleMeta, MessageKey, Messages, TranslateFn, TranslateParams } from './types';
export { FALLBACK_LOCALE_ID, LOCALES, findLocale } from './locales';

/**
 * 把一个 BCP-47 标签映射到我们支持的语言，认不出返回 `null`。
 *
 * 繁体判定要按**地区**而不是只看 `Hant`：iOS 上台湾用户的 `languageTag` 可能是
 * `zh-TW`、香港是 `zh-HK`、澳门是 `zh-MO`，只有少数情况才写 `zh-Hant`。
 */
export function matchSupportedLocale(tag: string | null | undefined): LocaleId | null {
  if (typeof tag !== 'string' || tag.length === 0) {
    return null;
  }
  const lower = tag.toLowerCase().replace(/_/g, '-');
  const [primary, ...rest] = lower.split('-');
  const subtags = rest.join('-');

  if (primary === 'zh') {
    if (subtags.includes('hant') || /(^|-)tw($|-)|(^|-)hk($|-)|(^|-)mo($|-)/.test(subtags)) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }
  if (primary === 'ja') return 'ja';
  if (primary === 'fr') return 'fr';
  if (primary === 'en') return 'en';
  return null;
}

/**
 * 系统语言 → 语言 id。按用户的语言偏好列表逐个试，第一个认识的就是它。
 * 一个都不认识才回退到英文。
 */
export function detectSystemLocaleId(): LocaleId {
  for (const locale of getLocales()) {
    const hit =
      matchSupportedLocale(locale.languageTag) ?? matchSupportedLocale(locale.languageCode);
    if (hit !== null) {
      return hit;
    }
  }
  return FALLBACK_LOCALE_ID;
}

/** 把 `{name}` 占位符填成实参。缺失的占位符原样保留（便于一眼看出拼错了）。 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined ? whole : String(value);
  });
}

/** 单条翻译（脱离 React 也能用，比如写进日志）。 */
export function translateWith(
  locale: LocaleMeta,
  key: MessageKey,
  params?: TranslateParams,
): string {
  // 类型上 `messages[key]` 一定是 string；这里再兜一层是因为
  // 用户手改语言文件时可能出现 `{ ...en, foo: undefined }` 这种运行时缺口。
  const template = locale.messages[key] ?? FALLBACK_LOCALE.messages[key] ?? key;
  return interpolate(template, params);
}

/**
 * 当前生效语言的**模块级快照**。
 *
 * 为什么要这份全局态：`describeError` / `saveToLibrary` / `normalizePhoto` 这些纯函数
 * 不在 React 树里，拿不到 `useI18n()`，可它们产出的文案会直接显示给用户
 * （"未知错误"、"没有相册写入权限…"）。这里留一份快照给它们用。
 *
 * 只由 `useI18n` 的 effect 写；组件里翻译请仍然用 `useI18n().t`
 * —— 那个跟着 re-render 走，切语言会立刻刷新，这里的快照只是给"树外代码"兜底。
 */
let activeLocale: LocaleMeta = FALLBACK_LOCALE;

/** 树外代码（工具函数 / 事件回调）用的翻译。组件内请优先用 `useI18n().t`。 */
export function t(key: MessageKey, params?: TranslateParams): string {
  return translateWith(activeLocale, key, params);
}

export interface I18n {
  /** 当前实际生效的语言（`'auto'` 已经解析成了具体语言）。 */
  localeId: LocaleId;
  /** 当前语言的自我称呼（`'日本語'`），显示在设置界面里。 */
  localeLabel: string;
  /** 用户在设置里选的（可能是 `'auto'`）。 */
  preference: LocalePreference;
  t: TranslateFn;
  setLocalePreference: (next: LocalePreference) => void;
}

/** 取当前语言与翻译函数。任何要显示文案的组件都用它。 */
export function useI18n(): I18n {
  const { settings, setLocalePreference } = useSettings();
  const systemLocales = useLocales();

  const localeId = useMemo<LocaleId>(() => {
    if (settings.locale !== 'auto') {
      return settings.locale;
    }
    for (const locale of systemLocales) {
      const hit =
        matchSupportedLocale(locale.languageTag) ?? matchSupportedLocale(locale.languageCode);
      if (hit !== null) {
        return hit;
      }
    }
    return FALLBACK_LOCALE_ID;
  }, [settings.locale, systemLocales]);

  const locale = useMemo<LocaleMeta>(() => findLocale(localeId) ?? FALLBACK_LOCALE, [localeId]);

  const t = useCallback<TranslateFn>(
    (key, params) => translateWith(locale, key, params),
    [locale],
  );

  // 给树外代码（describeError / saveToLibrary 等）同步一份快照。
  useEffect(() => {
    activeLocale = locale;
  }, [locale]);

  return {
    localeId,
    localeLabel: locale.label,
    preference: settings.locale,
    t,
    setLocalePreference,
  };
}
