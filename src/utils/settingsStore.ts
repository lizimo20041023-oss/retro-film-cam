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
  NoFrameAspect,
  PlaceDetail,
  PresetIntensityTier,
  StockMode,
  WatermarkAlign,
  WatermarkLayout,
  WatermarkZone,
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
  /*
   * 水印落点（v1.8.11）：纵向 `'auto'` + 横向 `'auto'` = 完全沿用版式自带的落点，
   * 也就是 v1.8.10 的成片。老用户升级上来视觉不变，只有主动去设置里改
   * 才会覆盖 —— 不迁移、不猜测，和上面 `watermarkLayout` 一个原则。
   */
  watermarkZone: 'auto',
  watermarkAlign: 'auto',
  /*
   * 场景自适应冲印（v1.8.11）：默认开。按画面亮度 / 对比 / 色偏微调冲印参数，
   * 暗光或偏色的照片比"一刀切的固定曲线"好看；关掉则回到预设的固定冲印。
   */
  adaptiveGrade: true,
  placeDetail: 'archive',
  grainLevel: DEFAULT_GRAIN_LEVEL_ID,
  /*
   * 底片模式与预设强度（v2.1.0 用户 m03050 手术二/三）。
   *
   * `stockMode: 'manual'` 是必须的默认值：老用户升级上来仍按"自己挑的那一卷"拍，
   * 不会被场景引擎悄悄换卷 —— 想让它接管，要用户自己点底片库顶部的 AUTO 入口。
   *
   * `presetIntensity: 'rich'`（130%）是用户点名的默认值：默认拍出来就要有强烈的
   * 胶片味。v2.0.x 的旧观感（100%）落在 `'standard'` 档，想回去的人自己选。
   */
  stockMode: 'manual',
  presetIntensity: 'rich',
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
   * 无相框画幅（v1.8.1）。只有选中 `00 NO FRAME` 时才会被读到 ——
   * 出厂相框是 `polaroid-600`，所以这个新字段对老用户的成片零影响，
   * 不需要迁移代码（老 JSON 里没有它，`pick` 直接给默认值）。
   *
   * `'3:4'` 是竖幅里最"像手机"的一档，也是 v1.6.1 全屏预览的老比例；
   * `'1:1'` 会明显裁掉上下，不适合当出厂值。
   */
  noFrameAspect: '3:4',
  /*
   * 日期引擎出厂设置：美式日期 + 石英液晶 + 白边下巴左右分列 + 钨丝琥珀橙。
   *
   * `quartz_led` 是 v1.8.3 的新默认档，继承 v1.7.0 那行橙色液晶日期的观感；
   * `spot: 'strip_split'` 与 `glow: 'classic_amber'` 也是刻意选的 —— 它们合起来
   * 和 v1.7.0 的成片（下巴左地名右日期、#FF8A00 点阵）**视觉等价**，
   * 老用户升级上来不会发现自己照片上的日期换了地方。
   */
  dateEngine: {
    format: 'MM_DD_YY',
    glyphStyle: 'quartz_led',
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
/**
 * 水印纵向落点白名单（v1.8.11）：`'paper'` = 落在相纸留白，
 * `'photo-top'` / `'photo-bottom'` = 压在画面内部的上下沿。
 *
 * 和 `WATERMARK_LAYOUTS` 一样手写字面量而不 import 常量模块：
 * 这里只判断"认不认这个字符串"，不比几何。
 */
const WATERMARK_ZONES: readonly WatermarkZone[] = [
  'auto',
  'paper',
  'photo-top',
  'photo-bottom',
];
/** 水印横向对齐白名单（v1.8.11）：auto 跟版式，其余三档是显式覆盖。 */
const WATERMARK_ALIGNS: readonly WatermarkAlign[] = ['auto', 'left', 'center', 'right'];
const PLACE_DETAILS: readonly PlaceDetail[] = ['archive', 'full'];
/**
 * 底片模式 / 预设强度档位白名单（v2.1.0）。
 *
 * 和 `CAPTURE_QUALITIES` / `FRAME_VARIANTS` 同一个理由**故意不 import
 * `constants/intensity.ts`**：这里只判断"认不认这个字符串"，不读档位数值；
 * 两边不同步时 `pick<T>` 的泛型会在 `tsc` 上先炸，不会静默跑偏。
 *
 * 老存储里没有这两个键 → `pick` 直接给默认值，不需要写迁移代码
 *（这正是"键单独一整个 JSON 存、以后加字段不用迁移"那条设计的收益）。
 */
const STOCK_MODES: readonly StockMode[] = ['manual', 'auto'];
const PRESET_INTENSITY_TIERS: readonly PresetIntensityTier[] = [
  'subtle',
  'soft',
  'standard',
  'rich',
  'max',
  'auto',
];
const GRAIN_IDS: readonly GrainLevelId[] = GRAIN_LEVELS.map((level) => level.id);
/** 地名语言四种（v1.8.5 起含 ja），外加一个"跟界面语言走"。 */
const GEO_LOCALES: readonly (GeoLocale | 'auto')[] = ['auto', 'zh-Hans', 'zh-Hant', 'ja', 'en'];
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
/**
 * 无相框画幅白名单（v1.8.1）。
 *
 * 与 `FRAME_VARIANTS` 同一个理由**故意不 import `constants/frames.ts`**：那份
 * `NO_FRAME_ASPECTS` 会连带拉起 6 张相框素材的 `require`，而本模块在启动最早的
 * 一帧就要被求值。这里只重复三个字面量；`NoFrameAspect` 联合类型仍然是真源，
 * 两边不同步时 `tsc` 会在 `pick<T>` 的泛型上先炸。
 */
const NO_FRAME_ASPECT_IDS: readonly NoFrameAspect[] = ['1:1', '3:4', '3:2'];
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
  'quartz_led',
  'ccd_osd',
  'lab_inkjet',
  'archival_steel',
];
/**
 * v1.8.2 及更早持久化的两支像素字形 id → `quartz_led` 的**读时迁移表**。
 *
 * v1.8.3 把 7 段（`led_7seg`）与 5×7 点阵（`led_dot_matrix`）合并成石英液晶
 * 一支新档 `quartz_led`：两者原本就是同一台石英机背的两种笔画。老存档里若还是
 * 旧 id，读设置时在这里就地映射，用户不改设置也永远不会看到档位"消失"；
 * 映射目标是新默认档，也是旧观感最接近的一支。
 */
const LEGACY_DATE_GLYPH_STYLES: Readonly<Record<string, DateGlyphStyleId | undefined>> = {
  led_7seg: 'quartz_led',
  led_dot_matrix: 'quartz_led',
};
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
 * 为什么不像别的字段那样逐项兜底：这四个轴是配套的（比如"画内竖排"配"石英液晶"
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
    glyphStyle: pickGlyphStyle(raw.glyphStyle, fallback.glyphStyle),
    spot: pick(raw.spot, DATE_SPOTS, fallback.spot),
    glow: pick(raw.glow, DATE_GLOWS, fallback.glow),
  };
}

/** 字形档：先过旧 id 迁移表，再走通用白名单（其余字段仍只有白名单一条路）。 */
function pickGlyphStyle(
  raw: unknown,
  fallback: DateGlyphStyleId,
): DateGlyphStyleId {
  if (typeof raw === 'string') {
    const migrated = LEGACY_DATE_GLYPH_STYLES[raw];
    if (migrated !== undefined) {
      return migrated;
    }
  }
  return pick(raw, DATE_GLYPH_STYLES, fallback);
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

/**
 * 布尔字段：只认真正的布尔。
 * 存储里出现 `'true'` / `1` 这类"手改残留"时一律回落默认值，
 * 不学和 JS 真值转换 —— 设置项的值必须能被 `tsc` 逐字对上。
 */
function pickBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
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
    watermarkZone: pick(
      raw.watermarkZone,
      WATERMARK_ZONES,
      DEFAULT_SETTINGS.watermarkZone,
    ),
    watermarkAlign: pick(
      raw.watermarkAlign,
      WATERMARK_ALIGNS,
      DEFAULT_SETTINGS.watermarkAlign,
    ),
    adaptiveGrade: pickBoolean(raw.adaptiveGrade, DEFAULT_SETTINGS.adaptiveGrade),
    placeDetail: pick(raw.placeDetail, PLACE_DETAILS, DEFAULT_SETTINGS.placeDetail),
    grainLevel: pick(raw.grainLevel, GRAIN_IDS, DEFAULT_SETTINGS.grainLevel),
    stockMode: pick(raw.stockMode, STOCK_MODES, DEFAULT_SETTINGS.stockMode),
    presetIntensity: pick(
      raw.presetIntensity,
      PRESET_INTENSITY_TIERS,
      DEFAULT_SETTINGS.presetIntensity,
    ),
    geoLocale: pick(raw.geoLocale, GEO_LOCALES, DEFAULT_SETTINGS.geoLocale),
    captureQuality: pick(
      raw.captureQuality,
      CAPTURE_QUALITIES,
      DEFAULT_SETTINGS.captureQuality,
    ),
    frameVariant: pick(raw.frameVariant, FRAME_VARIANTS, DEFAULT_SETTINGS.frameVariant),
    noFrameAspect: pick(
      raw.noFrameAspect,
      NO_FRAME_ASPECT_IDS,
      DEFAULT_SETTINGS.noFrameAspect,
    ),
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
