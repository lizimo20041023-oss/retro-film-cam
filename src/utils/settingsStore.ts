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
import type {
  AppSettings,
  CaptureQuality,
  DateEngineConfig,
  DateFormatId,
  DateGlowId,
  DateGlyphStyleId,
  DateStampSpot,
  FrameVariant,
  GeoLocale,
  GrainLevelId,
  LocalePreference,
  LocationMode,
  PlaceDetail,
  WatermarkLayout,
} from '../types';
import { LOCALES } from '../i18n/locales';
import { DEFAULT_GRAIN_LEVEL_ID, GRAIN_LEVELS } from '../constants/grain';

/** 存储键。改它等于清空所有老用户的设置，非必要不动。 */
const STORAGE_KEY = 'fretrocam.settings.v1';

/**
 * 出厂设置。
 * `locationMode: 'off'` 是刻意的：即使用户装了 App 就给了定位权限，
 * 也得他本人去设置里主动打开，照片才会带地点。
 *
 * `watermarkLayout: 'split'`（地名左 / 日期右）是上一版就有的排版，
 * 老用户升级上来视觉不变 —— 换默认值等于偷偷改所有人的成片。
 *
 * `geoLocale: 'auto'`（跟界面语言走）也是刻意的：它是个新设置项，
 * 默认值必须让老用户"什么都不用做"，而不是把他照片上的地名换成另一种语言。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'auto',
  locationMode: 'off',
  watermarkLayout: 'split',
  placeDetail: 'archive',
  grainLevel: DEFAULT_GRAIN_LEVEL_ID,
  geoLocale: 'auto',
  /*
   * `captureQuality: 'standard'` 是**必须**的默认值：`high` / `max` 会把成片
   * 长边从 2048 抬到 3024 / 4032，截屏上下文的内存代价从约 12 MB 涨到约 27 / 48 MB
   * （`captureOptions.ts` 头注释里有实测口径）。老用户升级上来不该被悄悄加内存。
   */
  captureQuality: 'standard',
  /* 相框材质默认 A 档（经典原白）：升级上来的第一眼不发黄、不压暗。 */
  frameVariant: 'archival',
  /*
   * 日期引擎出厂设置：美式日期 + 7 段数码管 + 白边下巴左右分列 + 钨丝琥珀橙。
   *
   * `spot: 'strip_split'` 与 `glow: 'classic_amber'` 是刻意选的 —— 它们合起来
   * 和 v1.7.0 的成片（下巴左地名右日期、#FF8A00 点阵）**视觉等价**，
   * 老用户升级上来不会发现自己照片上的日期换了地方。
   */
  dateEngine: {
    format: 'MM_DD_YY',
    glyphStyle: 'led_7seg',
    spot: 'strip_split',
    glow: 'classic_amber',
  },
};

const LOCALE_IDS: readonly LocalePreference[] = ['auto', ...LOCALES.map((l) => l.id)];
const LOCATION_MODES: readonly LocationMode[] = ['off', 'place', 'coords'];
const WATERMARK_LAYOUTS: readonly WatermarkLayout[] = [
  'split',
  'stacked',
  'centered',
  'dateOnly',
];
const PLACE_DETAILS: readonly PlaceDetail[] = ['archive', 'full'];
const GRAIN_IDS: readonly GrainLevelId[] = GRAIN_LEVELS.map((level) => level.id);
/** 地名语言只有三种，外加一个"跟界面语言走"。 */
const GEO_LOCALES: readonly (GeoLocale | 'auto')[] = ['auto', 'zh-Hans', 'zh-Hant', 'en'];
/**
 * 画质档与相框风格变体的白名单。
 *
 * 这两条**故意不 import 常量模块**（`constants/captureQuality.ts` / `constants/frameVariants.ts`）：
 * `settingsStore` 在启动最早的一帧就要被求值，而那两个模块会连带拉起相框素材与
 * 皮肤组件。这里只是"字符串认不认"，重复一份字面量比多一条启动期依赖划算；
 * 两边不同步时 `tsc` 会先在 `pick<T>` 的泛型上炸掉，不会静默跑偏。
 */
const CAPTURE_QUALITIES: readonly CaptureQuality[] = ['standard', 'high', 'max'];
/**
 * 相框材质白名单。
 *
 * ⚠️ 这里**故意不含** v1.7.0 的 `'classic'` / `'aged'` / `'doodle'`：
 * 涂鸦变体已被用户点名删除，三档材质全部换新。老存储里的那三个字符串
 * 落在白名单之外 → `pick` 自动回落到 `DEFAULT_SETTINGS.frameVariant`（`'archival'`）。
 * 这是"读永远不抛、认不出就用默认值"那条设计的直接收益，不需要写迁移代码。
 */
const FRAME_VARIANTS: readonly FrameVariant[] = ['archival', 'baryta', 'obsidian'];
const DATE_FORMATS: readonly DateFormatId[] = [
  'MM_DD_YY',
  'YY_MM_DD',
  'DD_MM_YY',
  'DAY_HH_MM',
  'YY_MM_DD_TIME',
  'YYYY_DOT_MM_DD',
  'YYYY_SLASH_TIME',
  'ENG_MMM_DD_YY',
  'YYYY_MM_DD_WEEK',
  'CJK_KANJI',
  'EXIF_TECH',
  'FRAME_DATE',
  'OFF',
];
const DATE_GLYPH_STYLES: readonly DateGlyphStyleId[] = [
  'led_7seg',
  'led_dot_matrix',
  'ccd_osd',
  'lab_inkjet',
  'archival_steel',
];
const DATE_SPOTS: readonly DateStampSpot[] = [
  'in_bl_v',
  'in_bl_h',
  'in_br_h',
  'in_br_v',
  'in_tr_v',
  'in_cb_h',
  'strip_split',
  'strip_center',
];
const DATE_GLOWS: readonly DateGlowId[] = [
  'coral_red',
  'classic_amber',
  'warm_gold',
  'ccd_green',
  'cyber_cyan',
];

/**
 * 日期引擎是**四个字段一起认**：只要有一项不认识，整个对象退回出厂设置。
 *
 * 为什么不像别的字段那样逐项兜底：这四个轴是配套的（比如"画内竖排"配"5×7 点阵"
 * 才有那台机器的味道），混搭一个默认值会让 UI 显示的档位和实际渲染的档位对不上 ——
 * 那比整组回默认更难排查。
 */
function pickDateEngine(raw: unknown): DateEngineConfig {
  const fallback = DEFAULT_SETTINGS.dateEngine;
  if (!isRecord(raw)) {
    return { ...fallback };
  }
  return {
    format: pick(raw.format, DATE_FORMATS, fallback.format),
    glyphStyle: pick(raw.glyphStyle, DATE_GLYPH_STYLES, fallback.glyphStyle),
    spot: pick(raw.spot, DATE_SPOTS, fallback.spot),
    glow: pick(raw.glow, DATE_GLOWS, fallback.glow),
  };
}

/**
 * 白名单里挑一个，挑不到就用默认值。
 *
 * 抽出来是因为下面已经有 5 个字段要做同一件事，而这里每个字段多写一行
 * 就意味着将来加第 6 个字段时多一处会忘记校验的地方。
 */
function pick<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 只留下认识的字段，其余丢弃。 */
function sanitize(raw: unknown): AppSettings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    locale: pick(raw.locale, LOCALE_IDS, DEFAULT_SETTINGS.locale),
    locationMode: pick(raw.locationMode, LOCATION_MODES, DEFAULT_SETTINGS.locationMode),
    watermarkLayout: pick(
      raw.watermarkLayout,
      WATERMARK_LAYOUTS,
      DEFAULT_SETTINGS.watermarkLayout,
    ),
    placeDetail: pick(raw.placeDetail, PLACE_DETAILS, DEFAULT_SETTINGS.placeDetail),
    grainLevel: pick(raw.grainLevel, GRAIN_IDS, DEFAULT_SETTINGS.grainLevel),
    geoLocale: pick(raw.geoLocale, GEO_LOCALES, DEFAULT_SETTINGS.geoLocale),
    captureQuality: pick(
      raw.captureQuality,
      CAPTURE_QUALITIES,
      DEFAULT_SETTINGS.captureQuality,
    ),
    frameVariant: pick(raw.frameVariant, FRAME_VARIANTS, DEFAULT_SETTINGS.frameVariant),
    dateEngine: pickDateEngine(raw.dateEngine),
  };
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
