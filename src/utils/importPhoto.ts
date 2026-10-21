/**
 * 从系统相册选择旧照片，按当前胶片设置重新冲印。
 *
 * 拍摄时间先读原图 EXIF。位置只读用户所选照片的 EXIF GPS；选择器未给 GPS 时，
 * 可在用户授予相册读取权限后查询 iOS Photos 或 Android MediaStore 资产的原拍摄位置。
 * 绝不把当前手机的位置印到旧照片上。
 *
 * 只有显式选择「地名」且水印版式包含地点时，才把原图坐标转换成地名：先用系统
 * 原生服务，失败后把经纬度与地名语言发送给 Photon / OpenStreetMap；不上传照片。
 * Android 的系统反查要求前台定位权限，导入时按需请求一次。
 * 用户选「坐标」时离线格式化原图坐标；关闭定位或只印日期时不读取位置。
 *
 * 多张照片共用一块合成舞台，逐张冲印。EXIF 缺失、授权拒绝或反查失败均不会
 * 让可处理的照片失效；结果会分别报告未读到原图 GPS 和地名反查失败。
 */
import * as ImagePicker from 'expo-image-picker';
// 本文件不调用设备当前位置 API；导入权限与照片资产位置只由 importLocation 处理。
import { grainLevelAt, findGrainLevelIndex, applyGrainLevel } from '../constants/grain';
import type { LocaleId } from '../i18n/types';
import type {
  FilmPreset,
  FilmStageHost,
  FrameSpec,
  LocationMode,
  NoFrameAspect,
  PlaceDetail,
  ResolvedPlace,
  Size,
  WatermarkAlign,
  WatermarkLayout,
  WatermarkZone,
} from '../types';
import { deleteLocalFilesBestEffort } from './fileCleanup';
import { readExifGps as parseExifGps } from './exifGps';
import { addShot } from './galleryStore';
import { canReverseGeocodeImportedPhoto, createPhotoAssetGpsReader } from './importLocation';
// 反查（含超时 / 重试 / 失败措辞）从 `locationStamp.ts` 引：相机页和相册导入
// 必须是同一份逻辑、同一组毫秒数，这个文件里**不许**再出现任何"反查超时"的常量或实现。
// 地名解析只认 `resolvePlaceFromCoords` 这一个入口（它内部统一管理系统反查、
// Photon 兜底、限速与缓存），所以这里连
// `reverseGeocodeWithRetry` / `describeGeocodeFailure` 都不再直接引。
import { resolvePlaceFromCoords } from './locationStamp';
// `formatCoords` 不再从这里引：本文件从本轮起不再自己拼坐标串（坐标只在
// `'coords'` 档经由 `toResolvedPlace` → `coordsOnlyPlace` 生成，日志里的坐标由
// `locationStamp.resolvePlaceFromCoords` 统一负责）。
import { coordsOnlyPlace, hasPlaceName, resolvePlaceFromGeocode } from './placeNames';
import { processFilmPhoto } from './processFilmPhoto';

/* ==========================================================================
 * 一、对外契约
 * ========================================================================== */

/** `importAndDevelop` 的入参。 */
export interface ImportAndDevelopOptions {
  /**
   * 合成舞台宿主（App 里由 `useFilmStage()` 提供）。
   *
   * ⚠️ 这个宿主所渲染的 `<FilmCompositor />` 必须**真的挂在屏幕上**：
   * iOS 的截图（`renderInContext`）对离屏 / `opacity: 0` 的视图截出来是空的。
   * 相册页的做法是把它绝对定位铺在遮罩下面（见 `GalleryScreen.tsx` 的
   * `stageLayer`），由 `styles.scrim` 挡住，用户只看到"显影中"。
   */
  host: FilmStageHost;
  /** 当前选中的相框 —— 导入的照片按它的比例**居中裁切**（合成层用 `cover` 居中）。 */
  frame: FrameSpec;
  /**
   * 无相框（`00 NO FRAME`）的画幅比（v1.8.1）。**可选**：只有 `frame.fullBleed === true`
   * 时才被读，纸框一律忽略。
   *
   * 只是原样转交给 `processFilmPhoto`（那边是"相框 → 几何"的唯一入口），
   * 导入这条路**不自己解析** —— 相机页、导入两条路必须由同一个函数解析同一份数据，
   * 否则"导入的照片按 1:1 裁、取景器按 3:4 显示"这种分叉迟早出现。
   */
  noFrameAspect?: NoFrameAspect;
  /** 当前选中的胶卷。内部会乘上颗粒档位，保证"设置里选多粗，出片就多粗"。 */
  preset: FilmPreset;
  /** 合成舞台逻辑尺寸（pt）；调用方按屏幕算好传进来，两边用同一个尺寸才"所见即所得"。 */
  stage: Size;
  /**
   * 当前界面语言。水印里的地名按它渲染（老照片也要跟着界面语言走）。
   *
   * ⚠️ 这里收的是**界面语言**（`LocaleId`），不是设置里的 `geoLocale`。两者不同：
   * `geoLocale` 是"用户**明确**指定地名用哪种语言"，只有渲染层才知道当前值，
   * 而渲染发生在导入过程的最后一跳。所以本文件**不**调 `resolveGeoLocale`、
   * 也不在这里把语言定死 —— 只把界面语言原样传下去，由 `FilmCompositor` 按
   * "看到那一刻"的设置定（和相机页同一条规则：改设置，下一张立刻生效）。
   * 反查本身是纯数据的（`resolvePlaceFromGeocode` 不吃语言参数），不受这一条影响。
   */
  locale?: LocaleId;
  /** 水印版式；不传 = `'split'`。 */
  watermarkLayout?: WatermarkLayout;
  /** 水印纵向位置（v1.8.11）；不传 = `'auto'`（= v1.8.10 行为）。 */
  watermarkZone?: WatermarkZone;
  /** 水印横向对齐（v1.8.11）；不传 = `'auto'`（旧行为）。 */
  watermarkAlign?: WatermarkAlign;
  /**
   * 场景自适应调色（v1.8.11）；不传 = **开**。
   *
   * 导入的照片同样要"按这张照片的光线自己算"：`processFilmPhoto` 会对每张底片各采样一次
   * （一张一次，不是每帧），所以一批导入里有夜景有日景，各自拿到各自的补偿。
   */
  adaptiveGrade?: boolean;
  /** 地名详细度；不传 = `'archive'`。 */
  placeDetail?: PlaceDetail;
  /**
   * 设置页的定位档位（`AppSettings.locationMode`）。
   *
   * ⚠️ **只有显式传入 `'place'` 会走地名反查**，不传 = `'off'`：
   *   · `'place'` —— 用户要的就是地名。系统快速尝试后由 Photon / OpenStreetMap 兜底，
   *     **反查失败就是"这张不印地名那一行"**，不会退回坐标；
   *   · `'coords'` —— 用户明确选了"只印坐标"。相机页那条路（`locationStamp.ts` 的
   *     `mode === 'coords'` 分支）**根本不发反查**，导入这条路也必须一样，
   *     否则同一张坐标在两条路上会得到两种结果。**这是唯一会印坐标的档位**；
   *   · `'off'` —— 地名那一行压根不会印（`planWatermark` 挡住），
   *     为一个注定被丢掉的结果把 EXIF 坐标发给系统地理编码服务，
   *     既白等时间也是隐私问题。
   *
   * 换句话说：**这个字段存在是为了让导入这条路和相机页对"什么时候该联网"给出同一个答案。**
   *
   * ⚠️ 本轮补的一句：它也决定了**能不能出现坐标**。三档里只有 `'coords'` 能印坐标，
   * 而 `'coords'` 只能来自用户在设置里的显式选择 —— 见文件头 ② 与 `importAndDevelop`。
   */
  locationMode?: LocationMode;
  /**
   * 颗粒档位 id（`AppSettings.grainLevel`）。
   * 不传 = 标准档。相机页是 `applyGrainLevel(preset, grainLevelAt(...).opacity)`，
   * 这里走同一对纯函数，两边的颗粒力度不会漂移。
   */
  grainLevel?: string;
  /**
   * 这一卷已经拍到第几张（用来给这套水印编号）。
   *
   * ⚠️ 注意语义：这里要的是"**接下来这些导入的照片算第几张**"，不是"成片总数"。
   * 导入照片并没有真的占用取景器里的胶片格，所以调用方应该传 `1`
   * （= 这批导入当成新的一卷、从 EXP.01 开始），而不是"相册里已有多少张 + 1"。
   */
  exposureIndex?: number;
  /** 进度回调：每张照片开始时报告 `{ index, total }`（**0 起数**的序号）。 */
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportProgress {
  /** 这张是这批里的第几张（0 起数）。 */
  index: number;
  /** 这批一共几张。 */
  total: number;
}

export interface ImportAndDevelopResult {
  /** 有没有照片成功冲印（**部分成功也算 `true`**）。 */
  ok: boolean;
  /** 冲印成功的新成片的**本地 uri**（沙盒里的成片，已缩到 2048 长边）。 */
  uris: string[];
  /** 冲印失败的照片张数（不含用户取消）。 */
  failed: number;
  /** `ok === false` 时才有意义：为什么什么都没成。 */
  reason?: 'permission-denied' | 'cancelled' | 'failed';
  /** 给用户看的一句话（已本地化）。 */
  message?: string;
  /**
   * 有没有照片**找不到 EXIF 拍摄时间、只能记成今天**。
   * 调用方据此提示 `gallery.import.noExif` —— 这是"提示"不是"错误"，
   * 照片本身是成功的，所以不放进 `failed`。
   */
  missingExifDate: boolean;
  /** 成功冲印的照片中，至少一张从 EXIF 和可访问的照片库资产均未读到 GPS。 */
  missingSourceGps: boolean;
  /** 成功冲印的照片中，至少一张有原图 GPS，但地名档的反查未成功。 */
  placeLookupFailed: boolean;
}

/* ==========================================================================
 * 二、EXIF 解析（纯函数，全部不抛异常、拿不到就返回 null）
 * ========================================================================== */

/** `ImagePickerAsset.exif` 的类型是 `Record<string, any>` —— 收窄成这个别名，避免 `any` 到处流。 */
type ExifBag = Record<string, unknown>;

/** 对象且不是数组。EXIF 里数组是**正常值**（`GPSLatitude` 就可能是数组），所以要先排除。 */
function isBag(value: unknown): value is ExifBag {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 按"拍平键 → 嵌套键"两级取值。
 *
 * `nestKeys` 里要带上**带花括号的写法**：那是 `exif` 拍平之前的字典名
 * （`'{Exif}'` / `'{GPS}'` / `'{TIFF}'`），Android 侧与历史版本会原样吐出来。
 */
function pickValue(exif: ExifBag, flatKeys: readonly string[], nestKeys: readonly string[]): unknown {
  for (const key of flatKeys) {
    if (Object.prototype.hasOwnProperty.call(exif, key)) {
      const value = exif[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }
  for (const nestKey of nestKeys) {
    const bag = exif[nestKey];
    if (!isBag(bag)) {
      continue;
    }
    for (const key of flatKeys) {
      const value = bag[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * `'2022:08:14 15:23:11'` → `Date`。宽容到什么程度：
 *   · 分隔符 `:` 或 `-` 或 `/` 都认（`'2022-08-14 15:23:11'`、`'2022/08/14'`）
 *   · 时分秒可以整个缺失（`'2022:08:14'` → 当天 00:00:00）
 *   · 首尾空白随便有（有些安卓机型会带）
 *   · 月份/日期不补零也认（`'2022:8:4 9:5:1'`）
 *
 * 为什么不用 `new Date('2022:08:14 15:23:11')` 直接过：那是**实现相关**的解析，
 * 在 Hermes 上会被判非法日期（`NaN`）。必须自己拆。
 *
 * ⚠️ **按本地时间构造**（`new Date(y, m - 1, d, hh, mm, ss)`），不是 UTC：
 * EXIF 的 `DateTimeOriginal` 按规范就是**相机本地时间**，没有时区信息。
 * 用 UTC 构造会让东八区的照片整体偏 8 小时，跨零点的那几张日期直接错一天。
 *
 * 合法性逐项验（不能只验 `NaN`）：`'2022:02:31'` 会被 `Date` 悄悄进位成 3 月 3 日，
 * 所以月 / 日 / 时 / 分 / 秒都要在范围内，且回读三个字段确认没被进位。
 */
export function parseExifDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /^(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(
    raw.trim(),
  );
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = match[4] === undefined ? 0 : Number(match[4]);
  const minutes = match[5] === undefined ? 0 : Number(match[5]);
  const seconds = match[6] === undefined ? 0 : Number(match[6]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  // 进位检测：`2022-02-31` 会变成 3 月 3 日，回读就能抓到
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** 原图的拍摄时间（EXIF `DateTimeOriginal`）。拿不到返回 `null`。 */
export function readExifCapturedAt(exif: ExifBag | null | undefined): Date | null {
  if (!exif) {
    return null;
  }
  const raw = pickValue(exif, ['DateTimeOriginal'], ['{Exif}', '{EXIF}', 'Exif', '{TIFF}']);
  return parseExifDate(raw);
}

/** 原图 GPS：兼容选择器拍平的十进制度与原始 EXIF 度分秒，缺失时返回 null。 */
export function readExifGps(exif: ExifBag | null | undefined): { latitude: number; longitude: number } | null {
  return parseExifGps(exif);
}

/**
 * 坐标 → `ResolvedPlace`（**只填 `coords` 的兜底形状**）。
 *
 * 实现搬到了 `placeNames.coordsOnlyPlace`：相机页"坐标档"（`locationStamp.ts`）和
 * 相册导入这条路现在**共用同一个构造点**，两边的"只有坐标"必须长得一模一样，
 * 否则同一张照片从相机出来和从相册导入出来，那一行字会不一样。
 *
 * ⚠️ 实测结论：这里**不能**用 `resolvePlaceFromGeocode(null, lat, lng)` 顶替
 * —— 那个函数在拿不到 `city` 时会逐级降级到 `source.country` / `countryCode`，
 * 传 `null` 进去它照样会从兜底里取出非空值，形状和"只有坐标"不一样。
 * 为什么这个形状必须这么讲究，见 `placeNames.coordsOnlyPlace` 的注释。
 */
function toResolvedPlace(coords: { latitude: number; longitude: number }): ResolvedPlace {
  return coordsOnlyPlace(coords.latitude, coords.longitude);
}

/**
 * 所选原照片的坐标 → 结构化地名（系统优先，Photon / OpenStreetMap 兜底）。
 *
 * 三种结局，**只有第一种会带地名**：
 *   1. 系统或 Photon 反查成功、且解析出至少一个名字字段 → `resolvePlaceFromCoords` 的结果；
 *   2. 两条反查都失败（超时 / 抛异常 / 空数组）→ `null`；
 *   3. 有一边"成功"但一个可用字段都没有（海上、极地、iOS 回了个空对象 `{}`）→ `null`。
 * 后两种都退成 `null` 而不是"只有坐标"的结构：调用方 `importAndDevelop` 拿到 `null`
 * 时会按用户选的档位决定"不印地名"还是"只印坐标"（见那个函数里 `place` 那一段）。
 *
 * ⚠️ **本轮改了这里的语义**：以前它是"反查失败就退回坐标"，现在
 * `'place'` 档反查失败是**不印地名那一行**（绝不退坐标）；只有用户显式选了
 * `'coords'` 才会印坐标。所以本函数返回 `null` 不再是"这张要印坐标"的同义词。
 *
 * 第 3 种为什么判 `hasPlaceName` 而不是 `formatResolvedPlace(...).trim().length > 0`：
 * 渲染器在一个字段都没有时会**退回坐标串**，于是"什么都没解析出来"也会非空 ——
 * 那个判据永远为真，等于没判。详见 `placeNames.hasPlaceName`。
 *
 * 耐心值 / 重试：全部委托给 `locationStamp.resolvePlaceFromCoords`
 * （两条路共用同一个函数），本文件**不写任何毫秒数** —— 历史上这里自己抄过一份
 * `withTimeout` 加 5000，于是"同一张照片从相机出来和从相册导入出来耐心不一样"
 * 在结构上成为可能，别再走回头路（文件头的补充里写了理由）。
 *
 * 留痕：失败时 `resolvePlaceFromCoords` 已经 warn 过一次原因；这里补一句导入语境的说明，
 * 但不记录精确坐标。
 *
 * ⚠️ **绝不抛**。这是整条路上最重要的契约：它是"锦上添花"的一步，
 * 抛出去会被 `importAndDevelop` 的 per-photo catch 记成 `failed += 1`，
 * 于是一张本来能出片的照片因为"没网"被算成失败。共享 helper 的契约同样是"绝不抛"
 * （连"原生模块缺失"那种同步抛错都被它收进返回值），所以这里连 `try` 都不需要。
 *
 * 入参只来自原图 EXIF 或该照片的 iOS Photos / Android MediaStore 资产；
 * 这里没有读取设备当前位置的路径。
 */
async function resolvePlaceFromSourceGps(
  gps: { latitude: number; longitude: number },
  nativeAllowed: boolean,
  locale: LocaleId = 'zh-Hans',
): Promise<ResolvedPlace | null> {
  const lookupLocale = locale === 'fr' ? 'en' : locale;
  const resolved = await resolvePlaceFromCoords(gps, lookupLocale, locale, nativeAllowed);

  if (resolved.status !== 'ok') {
    const nativeAttempts = resolved.native.attempts;
    if (resolved.native.status !== 'ok') {
      console.warn(
        `[retro-film-cam] 导入照片没拿到地名（系统反查尝试 ${nativeAttempts} 次，Photon 也未成功）`,
      );
    } else if (resolved.native.address === undefined) {
      // 系统答了"这个点我查不到"（空数组：海上、极地、刚开盘的新楼盘）。
      // 这不算失败，也不重试，只是没有名字 —— 但日志里要和上面那种分开说。
      console.warn(
        '[retro-film-cam] 导入照片的系统反查返回空数组，Photon 也没有查到地名',
      );
    } else {
      console.warn(
        `[retro-film-cam] 导入照片的系统反查结果没有可用地名，Photon 也失败（系统尝试 ${nativeAttempts} 次）`,
      );
    }
    return null;
  }

  // `resolvePlaceFromCoords` 内部走 `resolvePlaceFromGeocode` 的逐级降级
  // （city → name → district → subregion → region → fallbackCity → street），
  // 这里再判一次是**冗余但便宜**的第二道：万一将来那个函数的降级链改成"可能返回空"，
  // 这一行能挡住"印出一串坐标还当成功"。
  if (!hasPlaceName(resolved.place)) {
    console.warn('[retro-film-cam] 导入照片的反查结果里没有任何可用地名（第二道判定）。');
    return null;
  }

  return resolved.place;
}

/* ==========================================================================
 * 三、主流程
 * ========================================================================== */

/**
 * 让用户选照片 → 逐张按当前设置重新冲印 → 存进 RETRO CAM 相簿 → 返回新成片的本地 uri 列表。
 *
 * 流程（顺序 = 执行顺序）：
 *   1. `launchImageLibraryAsync({ exif: true, quality: 1, allowsMultipleSelection: true })`
 *   2. 读 EXIF：`DateTimeOriginal` → `capturedAt`；`GPSLatitude/Longitude` → `place`
 *   3. 逐张 `processFilmPhoto(...)`（相框裁切 + 胶卷色彩 + 颗粒 + 内阴影 + 水印 + 截图）
 *   4. 每张成功后 `addShot(...)` 存进 App 内相册（`addShot` 按约定不抛，失败返回 null）
 *
 * 失败语义：
 *   · 用户取消 → `{ ok: false, reason: 'cancelled' }`
 *   · 系统相册权限被拒 / 选择器起不来 → `{ ok: false, reason: 'permission-denied' }`
 *     （用 `message` 带上系统原话，调用方直接提示 `gallery.import.denied` 更友好）
 *   · 全部照片都冲印失败 → `{ ok: false, reason: 'failed', message }`
 *   · 部分成功 → `{ ok: true, uris: [...], failed: n }` —— **不因为一张坏图就丢掉其余的**
 *
 * 不做的事：不写系统相册（那是调用方拿 `uris` 自己调 `saveToLibrary` 的事）、
 * 不弹任何 UI（提示语由调用方按 `reason` / `missingExifDate` 决定）。
 */
export async function importAndDevelop(
  options: ImportAndDevelopOptions,
): Promise<ImportAndDevelopResult> {
  const { host, frame, preset, stage } = options;

  // ---- 1. 选照片 ----------------------------------------------------------
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      // 与 `allowsEditing` 互斥；我们不做系统裁切，裁切是合成层的活（按相框比例居中 cover）
      allowsMultipleSelection: true,
      // 0 = 用系统允许的最大张数。不设更小的上限，因为"一口气导十几张"是真实用法
      selectionLimit: 0,
      exif: true,
      quality: 1,
    });
  } catch (error) {
    return {
      ok: false,
      uris: [],
      failed: 0,
      reason: 'permission-denied',
      message: describeError(error),
      missingExifDate: false,
      missingSourceGps: false,
      placeLookupFailed: false,
    };
  }

  if (picked.canceled) {
    return { ok: false, uris: [], failed: 0, reason: 'cancelled', missingExifDate: false, missingSourceGps: false, placeLookupFailed: false };
  }

  /*
   * 只留 `type === 'image'` 的项（`type` 可能是 `null`：系统没判定出来时按图片处理，
   * 因为选择器本来就只要了 `mediaTypes: 'images'`）。
   * 过滤掉视频是为了堵一个真实的坑：多选时用户能滑到"视频"标签页，
   * 而 `processFilmPhoto` 拿到视频 uri 只会在截图那一步得到一张空图。
   */
  const assets = picked.assets.filter((asset) => asset.type === 'image' || asset.type == null);
  if (assets.length === 0) {
    return { ok: false, uris: [], failed: 0, reason: 'cancelled', missingExifDate: false, missingSourceGps: false, placeLookupFailed: false };
  }

  // ---- 2. 颗粒档位：和相机页走同一对纯函数，力度不漂移 --------------------
  const grainLevel = grainLevelAt(findGrainLevelIndex(options.grainLevel ?? 'std'));
  const effectivePreset = applyGrainLevel(preset, grainLevel.opacity);

  const exposureBase = Math.max(1, Math.floor(options.exposureIndex ?? 1));
  const uris: string[] = [];
  let failed = 0;
  let missingExifDate = false;
  let missingSourceGps = false;
  let placeLookupFailed = false;
  let lastError: string | null = null;
  const readPhotoAssetGps = createPhotoAssetGpsReader();
  let geocodePermission: Promise<boolean> | null = null;
  const geocodeResults = new Map<string, Promise<ResolvedPlace | null>>();

  // ---- 3. 逐张冲印（**串行**：宿主只有一块屏幕位置） ----------------------
  for (let index = 0; index < assets.length; index += 1) {
    options.onProgress?.({ index, total: assets.length });
    const asset = assets[index];
    const exif = isBag(asset.exif) ? asset.exif : null;
    const photoStartedAt = __DEV__ ? Date.now() : 0;

    try {
      // EXIF 拍摄时间：拿不到就是 `null` —— 明确告诉管线"我找过了，没有"，
      // 管线会落成"今天"（`input.capturedAt ?? new Date()`），并让我们记一笔提示。
      const capturedAt = readExifCapturedAt(exif);

      /*
       * 地点只来自所选原图：先读 EXIF，再按需读 iOS Photos / Android MediaStore 资产位置。
       * 地名档走系统反查；坐标档离线排字；关闭或只印日期时不读取位置。
       * 系统反查失败不会让照片冲印失败，也不会在地名档擅自改印坐标。
       */
      // 两个实际入口都会传用户选定的档位；没有显式选择时不读取照片位置。
      const mode: LocationMode = options.locationMode ?? 'off';
      const wantsLocation = mode !== 'off' && options.watermarkLayout !== 'dateOnly';
      let gps = wantsLocation ? readExifGps(exif) : null;
      if (gps === null && wantsLocation) {
        // 选择器交来的 EXIF 缺 GPS 时，系统照片资产可能仍保存原拍摄位置。
        // 系统照片库权限由用户授予；只查询这张所选照片，不读取设备当前坐标。
        gps = await readPhotoAssetGps(asset.assetId);
      }
      const wantsPlace = mode === 'place' && wantsLocation;
      let geocoded: ResolvedPlace | null = null;
      if (gps !== null && wantsPlace) {
        // 用户已在设置中选「地名」；resolvePlaceFromCoords 先调系统服务，再按需用 Photon。
        // Android 的原生反查额外要求前台定位权限，同批照片只申请一次。
        geocodePermission ??= canReverseGeocodeImportedPhoto();
        const nativeAllowed = await geocodePermission;
        // 只复用坐标完全相同的结果，避免把边界附近两张不同位置的照片合并。
        // 缓存仅活在本次导入中，且不记录坐标日志。Android 没有前台定位权限时
        // 跳过系统反查，直接走已在设置文案中说明的 Photon 兜底。
        const key = `${nativeAllowed}|${options.locale ?? 'zh-Hans'}|${gps.latitude},${gps.longitude}`;
        let result = geocodeResults.get(key);
        if (result === undefined) {
          result = resolvePlaceFromSourceGps(gps, nativeAllowed, options.locale);
          geocodeResults.set(key, result);
        }
        geocoded = await result;
      }
      /*
       * `null` 在三种档位下分别是"不印地名"（off）/ "这次没查到，不印地名"（place）/
       * "没有 GPS 可印"（coords 且 gps 为 null）—— 三种的下场一模一样，就是 `null`。
       * 所以这里不再是以前那个 `geocoded ?? toResolvedPlace(gps)`：
       * 那个写法在**地名档反查失败**时也会印出坐标，正是本轮要消掉的行为。
       */
      const place =
        geocoded ?? (gps !== null && mode === 'coords' ? toResolvedPlace(gps) : null);
      const sourceGpsMissingThisPhoto = wantsLocation && gps === null;
      const placeLookupFailedThisPhoto = wantsPlace && gps !== null && geocoded === null;
      const locationResolvedAt = __DEV__ ? Date.now() : 0;

      const photo = await processFilmPhoto({
        /*
         * `width` / `height` 在系统没给的时候可能是 0（见 `ImagePickerAsset` 的类型注释）。
         * 归一化那一步只按"最长边"算缩放比例，0 会让它除零，所以至少兜到 1 ——
         * 真正影响观感的是 `uri` 里的像素，这两个数只用来算比例。
         */
        photo: {
          uri: asset.uri,
          width: Math.max(1, Math.round(asset.width)),
          height: Math.max(1, Math.round(asset.height)),
        },
        frame,
        // v1.8.1：无相框的画幅比原样转交（纸框忽略它）—— 见 `ImportAndDevelopOptions` 里那段注释。
        noFrameAspect: options.noFrameAspect,
        preset: effectivePreset,
        stage,
        host,
        capturedAt,
        place,
        locale: options.locale,
        watermarkLayout: options.watermarkLayout,
        watermarkZone: options.watermarkZone,
        watermarkAlign: options.watermarkAlign,
        adaptiveGrade: options.adaptiveGrade,
        placeDetail: options.placeDetail,
        exposureIndex: exposureBase + index,
      });
      const renderedAt = __DEV__ ? Date.now() : 0;

      /*
       * 存进 App 内相册。`addShot` 按约定**不抛**（失败返回 `null`），所以这里
       * 单独判一次 null 只记日志 —— 成片已经截出来、也在 `uris` 里了，
       * 不能因为"索引没更新成"就把它算作失败。
       */
      const shot = await addShot({
        sourceUri: photo.uri,
        width: photo.pixelWidth,
        height: photo.pixelHeight,
        frameId: frame.id,
        presetId: effectivePreset.id,
        // 最终 ViewShot 已经是 JPEG；原样复制可避免每张导入照片再做一次全尺寸有损编码。
        sourceFormat: 'jpeg',
        maxLongEdge: Math.max(photo.pixelWidth, photo.pixelHeight),
      });
      if (shot === null) {
        // 持久副本没写成，只能把尚可用的 tmpfile 交还调用方，不能在这里删。
        uris.push(photo.uri);
        console.warn('[retro-film-cam] 导入的成片没能写进 App 相册（索引未更新）。');
      } else {
        // 返回持久 URI，既能让图库按 uri 自动打开，也允许安全回收 ViewShot 的 tmpfile。
        uris.push(shot.uri);
        deleteLocalFilesBestEffort([photo.uri], '导入成片缓存');
      }
      if (photo.rawUri !== asset.uri) {
        // 只删 App 自己归一化/裁切出的缓存；系统选择器交来的原始资产绝不能删除。
        deleteLocalFilesBestEffort([photo.rawUri], '导入裁切缓存');
      }
      missingSourceGps ||= sourceGpsMissingThisPhoto;
      placeLookupFailed ||= placeLookupFailedThisPhoto;
      missingExifDate ||= capturedAt === null;
      if (__DEV__) {
        console.info('[retro-film-cam] 导入耗时', {
          photo: index + 1,
          locationMs: locationResolvedAt - photoStartedAt,
          renderMs: renderedAt - locationResolvedAt,
          saveMs: Date.now() - renderedAt,
        });
      }
    } catch (error) {
      // 一张坏图不该拖垮整批：记下原因，继续下一张
      failed += 1;
      lastError = describeError(error);
      console.warn('[retro-film-cam] 导入这张失败：', lastError);
    }
  }

  // ---- 4. 汇总 -----------------------------------------------------------
  if (uris.length === 0) {
    return {
      ok: false,
      uris,
      failed,
      reason: 'failed',
      ...(lastError === null ? {} : { message: lastError }),
      missingExifDate,
      missingSourceGps,
      placeLookupFailed,
    };
  }

  return { ok: true, uris, failed, missingExifDate, missingSourceGps, placeLookupFailed };
}

/** 错误 → 一行给用户看的文字（拿不到 message 就用 `String(error)`）。 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}
