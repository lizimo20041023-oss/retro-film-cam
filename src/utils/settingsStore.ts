/**
 * 设置的读写（AsyncStorage）。
 *
 * 设计要点：
 * 1. **读永远不抛**。存储里是上次版本写的老字段、或者干脆是一坨乱码时，
 *    就退回默认值 —— 设置读不出来不该让 App 打不开。
 * 2. **逐字段校验**。只认白名单里的值，`locale: 'klingon'` 会被丢掉。
 *    这层防的是"手改存储"和"跨版本残留"，不是防用户。
 * 3. 键单独一整个 JSON 存，不拆散。以后加字段不用迁移老键。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, LocalePreference, LocationMode } from '../types';
import { LOCALES } from '../i18n/locales';

/** 存储键。改它等于清空所有老用户的设置，非必要不动。 */
const STORAGE_KEY = 'fretrocam.settings.v1';

/**
 * 出厂设置。
 * `locationMode: 'off'` 是刻意的：即使用户装了 App 就给了定位权限，
 * 也得他本人去设置里主动打开，照片才会带地点。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'auto',
  locationMode: 'off',
};

const LOCALE_IDS: readonly LocalePreference[] = ['auto', ...LOCALES.map((l) => l.id)];
const LOCATION_MODES: readonly LocationMode[] = ['off', 'place', 'coords'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 只留下认识的字段，其余丢弃。 */
function sanitize(raw: unknown): AppSettings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  const locale = LOCALE_IDS.includes(raw.locale as LocalePreference)
    ? (raw.locale as LocalePreference)
    : DEFAULT_SETTINGS.locale;
  const locationMode = LOCATION_MODES.includes(raw.locationMode as LocationMode)
    ? (raw.locationMode as LocationMode)
    : DEFAULT_SETTINGS.locationMode;
  return { locale, locationMode };
}

/** 读设置。任何异常都吞掉并返回默认值。 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_SETTINGS };
    }
    return sanitize(JSON.parse(raw) as unknown);
  } catch (error) {
    console.warn('[retro-film-cam] 读取设置失败，改用默认值：', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 写设置。**失败只警告不抛** —— 用户点一下"日语"，界面必须立刻切过去，
 * 不能因为写盘失败就弹个错误把这次操作顶掉。
 */
export async function persistSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[retro-film-cam] 保存设置失败（本次改动只在内存里生效）：', error);
  }
}
