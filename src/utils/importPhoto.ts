/**
 * 老照片导入与重冲印（§八）。
 *
 * 一件事：**让用户从系统相册挑几张旧照片 → 按"现在这套设置"重新冲印一遍**。
 * 不是"把原图塞进相册"，而是重新走一遍完整的显影管线（相框裁切 → 胶卷色彩曲线
 * → 单色颗粒 → 相纸内阴影 → 日期/地名水印），所以导入的老照片和当场拍的成片
 * 看起来是同一批底片。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 三条不能违反的规矩
 * ─────────────────────────────────────────────────────────────────────────────
 * ① **拍摄时间优先用原图的**。EXIF 里有 `DateTimeOriginal` 就把那一刻当作"拍摄时间"
 *    烧进水印（`'22 08 14` 而不是今天）。解析不出来才退回今天，并让调用方提示用户。
 * ② **绝不把当前设备位置给老照片**。这是整个 §八 里最容易做错、后果也最难看的一条
 *    —— 一张 2014 年在巴黎拍的照片，被印上"上海"比什么都不印糟糕得多。
 *    `fetchLocationStamp`**，位置**只**来自原图 EXIF 的 GPS 标签，拿不到就是 `null`。
 *    **本轮修订（用户拍板）**：拿到 EXIF GPS 之后允许反查（`Location.reverseGeocodeAsync`）
 *    把坐标变成城市 / 国家，这样老照片也能印出地名而不是一串坐标（`resolvePlaceFromExifGps`）。
 *    ⚠️ 红线没有动，只是换了个更严格的写法：**反查的入参只可能是原图 EXIF 里那对坐标**。
 *    **本轮修订**：反查住在 `locationStamp.ts` 的 `resolvePlaceFromCoords` 里
 *    （两条路共用同一份重试 + 网络兜底逻辑，见下面那段补充）：那个函数**只接一对坐标**，
 *    内部**只**调 `reverseGeocodeAsync`（失败时再打一次免 Key 的公开 HTTPS 接口）。
 *    本文件从头到尾没有任何一行能读到设备当前位置
 *    （`getCurrentPositionAsync` / `getLastKnownPositionAsync` / `watchPositionAsync`
 *    在这个文件里一次都不出现），所以"退化成当前设备位置"在代码结构上不可能发生
 *    （不是"记得别这么写"，是"这里没有被允许这么写的 API 调用"）。
 *    ⚠️ **'place' 档反查失败不再退回坐标**（本轮改）：反查失败就是"这张不印地名那一行"，
 *    因为地名档里出现 `LAT 23°02'N …` 等于把"我没查到"伪装成"我查到了"。
 *    只有用户在设置里**显式选了「只印坐标」档**（`locationMode === 'coords'`）才会印坐标
 *    （见 `importAndDevelop` 里 `place` 那一段）。
 *    **任何一条路失败都不会让这张照片冲印失败**（见 `resolvePlaceFromExifGps`）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 为什么要给反查加超时和重试（② 的补充，别把这一条删了）
 * ─────────────────────────────────────────────────────────────────────────────
 * `reverseGeocodeAsync` 是**网络调用**（iOS 走 Apple 的地理编码服务），可能几百毫秒，
 * 也可能在没网的时候一直不 resolve。而本文件是**串行**导入的：一次选 12 张，
 * 每张都干等就是"进度条卡在第 3 张"的经典体验。
 *
 * 所以这条路**不自己发明一套**：直接调 `locationStamp.ts` 的 `resolvePlaceFromCoords`
 * ——相机页那条路用的是同一个函数、同一组常量。原生通道一次尝试 5s，超时 / 抛异常就再试一次，
 * 总预算 10s 封顶；**原生两次都没成**才会再发一次公开接口（一次 4s）。
 * 也就是**单张最坏 14s**（10s + 4s），这个数写在 `locationStamp.ts` 的
 * `GEOCODE_NETWORK_TIMEOUT_MS` 注释里（**毫秒数只写在那一个文件**，这里一个数都不写，
 * 免得两边的耐心值又漂开）。空数组不重试（系统明确答"这个点我查不到"）。
 * 超时、抛异常、返回空数组、返回的对象里一个字段都没有，**四种都只是"这次没地名"**，
 * 每一种都会 `console.warn` 记一笔（原因 + 坐标在老照片那条路上由共享 helper 统一记），
 * **绝不向上抛** —— 抛出去会被
 * `importAndDevelop` 的 per-photo catch 记成 `failed += 1`，把一张本来能出片的照片
 * 算成失败，那是比没有地名严重得多的错。
 * ③ **不复用取景器**。相机页那个合成舞台（`useFilmStage`）在这里只当"截图工位"用：
 *    调用方把宿主传进来，本文件负责"挂 → 等就绪 → 截 → 卸"，做完一张再下一张。
 *    串行而不是并行，因为宿主只有一块屏幕位置，同时挂两张会截到彼此。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXIF 的实际形状（这一条决定了下面所有解析函数的写法）
 * ─────────────────────────────────────────────────────────────────────────────
 * `expo-image-picker` 在 **iOS 上不是把 `kCGImagePropertyExifDictionary` 原样返回**：
 * 它把三本字典**拍平合并**成一层（`node_modules/expo-image-picker/ios/ImageUtils.swift`
 * 的 `readExifFrom(imageMetadata:)`）：
 *   · `{Exif}`   → 顶层：`DateTimeOriginal` / `LensModel` / `FNumber` …
 *   · `{GPS}`    → **加前缀**后进顶层：`GPSLatitude` / `GPSLongitude` / `GPSAltitude` …
 *   · `{TIFF}`   → 合并进顶层：`Make` / `Model` / `DateTime` …
 * 也就是说 iOS 上**不存在** `{GPS}` 这个嵌套键。但任务书要求两种键名都试，Android
 * 侧与历史版本确实出现过 `'{DateTimeOriginal}'` / `'{GPS}'` 这种带花括号的嵌套形态，
 * 而且 `exif` 在类型上是 `Record<string, any>`（不承诺形状）—— 所以下面每个取值
 * 都走"先拍平键、再嵌套键"两级尝试，两种形状都能吃。
 *
 * 需要网络：**只有反查地名那一步**（`resolvePlaceFromCoords` → 原生
 * `Location.reverseGeocodeAsync`，失败后 `fetch` 公开接口，见上面那段补充）。
 * 没网不是错误 —— 那张照片要么不印地名、要么（用户显式选了坐标档时）退回"只有坐标"，
 * 照常出片（`resolvePlaceFromExifGps`）。
 *
 * 需要权限：选照片由 `launchImageLibraryAsync` 自己处理（iOS 14+ 是
 * `PHPickerViewController`，选中即授权，不需要预先申请整库读取权限）。
 * 反查地名**不额外申请**定位权限：本文件从头到尾不调
 * `requestForegroundPermissionsAsync` —— 用户没给定位权限时反查就失败，
 * **失败即不印地名那一行**（老版这里写的是"失败即退回坐标"，本轮已改：
 * 只有用户显式选了 `'coords'` 档才印坐标，见 `ImportAndDevelopOptions.locationMode`）。
 * **不去要一个这个功能本来不需要的权限**，这是刻意的。
 */
import * as ImagePicker from 'expo-image-picker';
// ⚠️ 规矩② 的 import 纪律换了个写法（原文是"这里只用 `reverseGeocodeAsync`"）：
// 反查这一步整个搬到了 `locationStamp.ts` 的 `resolvePlaceFromCoords`（两条路共用），
// 所以本文件现在**连 `expo-location` 都不 import** —— 连它的类型都不需要。
// 于是"读设备当前位置"的 API（`getCurrentPositionAsync` / `getLastKnownPositionAsync` /
// `watchPositionAsync`）在这个文件里不但**不许**出现，而且**根本拿不到**：规矩② 见文件头。
import { grainLevelAt, findGrainLevelIndex, applyGrainLevel } from '../constants/grain';
import type { LocaleId } from '../i18n/types';
import type {
  FilmPreset,
  FilmStageHost,
  FrameSpec,
  LocationMode,
  PlaceDetail,
  ResolvedPlace,
  Size,
  WatermarkLayout,
} from '../types';
import { addShot } from './galleryStore';
// 反查（含超时 / 重试 / 网络兜底 / 失败措辞）从 `locationStamp.ts` 引：相机页和相册导入
// 必须是同一份逻辑、同一组毫秒数，这个文件里**不许**再出现任何"反查超时"的常量或实现。
// 本项目 v1.5.1 之后只认 `resolvePlaceFromCoords` 这一个入口（它内部会先走原生
// `reverseGeocodeWithRetry`，失败再走免 Key 的公开接口），所以这里连
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
  /** 地名详细度；不传 = `'archive'`。 */
  placeDetail?: PlaceDetail;
  /**
   * 设置页的定位档位（`AppSettings.locationMode`）。
   *
   * ⚠️ **只有 `'place'` 会联网反查地名**，不传 = `'place'`（保持老调用方的行为）：
   *   · `'place'` —— 用户要的就是地名。每张最多等 14s 去反查（原生 10s + 公开接口 4s），
   *     **反查失败就是"这张不印地名那一行"**，不会退回坐标；
   *   · `'coords'` —— 用户明确选了"只印坐标"。相机页那条路（`locationStamp.ts` 的
   *     `mode === 'coords'` 分支）**根本不发反查**，导入这条路也必须一样，
   *     否则同一张坐标在两条路上会得到两种结果。**这是唯一会印坐标的档位**；
   *   · `'off'` —— 地名那一行压根不会印（`planWatermark` 挡住），
   *     为一个注定被丢掉的结果把 EXIF 坐标发给系统地理编码服务，
   *     既白等 14s 也是隐私问题。
   *
   * 换句话说：**这个字段存在是为了让导入这条路和相机页对"什么时候该联网"给出同一个答案。**
   *
   * ⚠️ 本轮补的一句：它也决定了**能不能出现坐标**。三档里只有 `'coords'` 能印坐标，
   * 而 `'coords'` 只能来自用户在设置里的显式选择 —— 见文件头 ② 与 `importAndDevelop`。
   */
  locationMode?: LocationMode;
  /**
   * 颗粒档位 id（`AppSettings.grainLevel`）。
   * 不传 = 标准档。相机页是 `applyGrainLevel(preset, grainLevelAt(...).scale)`，
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

/** 数字 / 数字字符串 → 有限数；其余（含 `''`、`'NaN'`、对象）→ `null`。 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

/**
 * 原图的坐标。拿不到（或者只有一半）返回 `null`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 为什么不读 `GPSLatitudeRef` / `GPSLongitudeRef`（**这是有证据的结论，不是省事**）
 * ─────────────────────────────────────────────────────────────────────────────
 * EXIF 规范里经纬度是"无符号的度分秒三元组 + 一个 N/S、E/W 的 Ref 标签"，所以
 * **直接读原始 EXIF 写入值**的实现必须自己按 Ref 取负 —— 那种实现在这里确实会错。
 * 但 `expo-image-picker` 给我们的**不是**原始 EXIF 写入值，这两条都已在本仓库的
 * `node_modules` 里逐行核对过：
 *
 * · **iOS**（`expo-image-picker/ios/ImageUtils.swift` 的 `readExifFrom(imageMetadata:)`，
 *   该函数在 259 / 277 / 302 行三处被调用，覆盖"从相册选 / 从 data 解 / 从 PHAsset 拿"）：
 *   `if let gps = imageMetadata[kCGImagePropertyGPSDictionary as String] as? [String: Any]`
 *   之后 `exif["GPS\(key)"] = value` —— 它把 `kCGImagePropertyGPSDictionary` 里
 *   **CoreGraphics 已经解析好的键值对**整体加了 `GPS` 前缀搬进顶层。
 *   那本字典里的 `kCGImagePropertyGPSLatitude` 是 `CLLocationDegrees`（**带符号的 double**），
 *   苹果在解析时就已经把 `GPSLatitudeRef === 'S'` 折成了负号，
 *   并把度分秒三元组折成了十进制度。Ref 的语义已经被消费掉了。
 *
 * · **Android**（`expo-image-picker/android/.../exporters/ImageExporter.kt` 的 `exif()`）：
 *   `exifInterface.latLong?.let { latLong -> putDouble(TAG_GPS_LATITUDE, latLong[0]) … }`
 *   —— 用的是 `androidx.exifinterface` 的 `getLatLong()`。它在文档里明说
 *   "returns the latitude and longitude as **double values** … in degrees"，
 *   同样已经是**带符号的十进制度数**（南半球 / 西半球为负），并且**优先取
 *   TAG_GPS_LATITUDE 而不是 LATITUDE_REF**（Ref 只在缺少数值标签时才被拿来兜底）。
 *
 * 所以在这里补读 Ref 并再次取负 = **双重取负**：一张南半球（悉尼）或西半球（旧金山）
 * 的照片会被翻到地球另一面 —— 从"修 bug"变成"引 bug"，而且症状（地名跑到反方向）
 * 比原来难查得多。下面的 `latitude < -90 || > 90` 区间校验也印证了同一个前提：
 * **上游给的已经是带符号度数**，否则那个下界永远不可能被触发。
 *
 * 万一将来换了图片选择库（拿到的是原始 EXIF 写入值），判断依据是同一个：
 * 先看它给的是不是带符号十进制度数；**只有拿到的是"值 + Ref 两个字段"时才需要取负**，
 * 而且那时两个都要读（Ref 缺失时按 N/E 处理）。
 */
export function readExifGps(exif: ExifBag | null | undefined): { latitude: number; longitude: number } | null {
  if (!exif) {
    return null;
  }
  const latitude = toFiniteNumber(
    pickValue(exif, ['GPSLatitude', 'latitude'], ['{GPS}', 'GPS', '{Exif}']),
  );
  const longitude = toFiniteNumber(
    pickValue(exif, ['GPSLongitude', 'longitude'], ['{GPS}', 'GPS', '{Exif}']),
  );
  if (latitude === null || longitude === null) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
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
 * EXIF 坐标 → 结构化地名（**可能联网，两条通道**）。这是规矩② 在代码里的落点，改动前先读文件头。
 *
 * 三种结局，**只有第一种会带地名**：
 *   1. 两条通道里任意一条成功、且解析出至少一个名字字段 → `resolvePlaceFromCoords` 的结果；
 *   2. 两条都失败（原生超时 / 抛异常 / 空数组 + 公开接口超时 / HTTP 错 / 畸形 JSON）→ `null`；
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
 * 耐心值 / 重试 / 网络兜底：全部委托给 `locationStamp.resolvePlaceFromCoords`
 * （两条路共用同一个函数），本文件**不写任何毫秒数** —— 历史上这里自己抄过一份
 * `withTimeout` 加 5000，于是"同一张照片从相机出来和从相册导入出来耐心不一样"
 * 在结构上成为可能，别再走回头路（文件头的补充里写了理由）。
 *
 * 留痕：失败时 `resolvePlaceFromCoords` 已经 warn 过一次（含两条通道各自的原因 + 坐标），
 * 这里补一句**分得清是四种里的哪一种**的话（措辞沿用以前的四句），但**不再重复坐标**。
 *
 * ⚠️ **绝不抛**。这是整条路上最重要的契约：它是"锦上添花"的一步，
 * 抛出去会被 `importAndDevelop` 的 per-photo catch 记成 `failed += 1`，
 * 于是一张本来能出片的照片因为"没网"被算成失败。共享 helper 的契约同样是"绝不抛"
 * （连"原生模块缺失"那种同步抛错都被它收进返回值），所以这里连 `try` 都不需要。
 *
 * ⚠️ **入参只有坐标**：唯一的调用点是 `readExifGps(exif)` 的结果。这个函数里没有
 * 任何"取当前位置"的调用，也不可能拿到 —— 规矩② 不是靠自觉，是靠这一点。
 */
async function resolvePlaceFromExifGps(gps: {
  latitude: number;
  longitude: number;
}): Promise<ResolvedPlace | null> {
  const resolved = await resolvePlaceFromCoords(gps);

  if (resolved.status !== 'ok') {
    const nativeAttempts = resolved.native.attempts;
    const network = resolved.network;
    if (resolved.native.status !== 'ok') {
      console.warn(
        `[retro-film-cam] 导入照片没拿到地名（原生反查发了 ${nativeAttempts} 次仍未成功，` +
          `公开接口${network === null ? '未走' : `也没成：${network}`}）`,
      );
    } else if (resolved.native.address === undefined) {
      // 系统答了"这个点我查不到"（空数组：海上、极地、刚开盘的新楼盘）。
      // 这不算失败，也不重试，只是没有名字 —— 但日志里要和上面那种分开说。
      console.warn(
        '[retro-film-cam] 导入照片的反查返回空数组（系统查不到这个点），' +
          `公开接口${network === null ? '未走' : `也没成：${network}`}`,
      );
    } else {
      console.warn(
        `[retro-film-cam] 导入照片的反查结果里没有任何可用地名` +
          `（原生 1 次 + 公开接口 1 次都没给出名字，累计 ${nativeAttempts + 1} 次）`,
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
    };
  }

  if (picked.canceled) {
    return { ok: false, uris: [], failed: 0, reason: 'cancelled', missingExifDate: false };
  }

  /*
   * 只留 `type === 'image'` 的项（`type` 可能是 `null`：系统没判定出来时按图片处理，
   * 因为选择器本来就只要了 `mediaTypes: 'images'`）。
   * 过滤掉视频是为了堵一个真实的坑：多选时用户能滑到"视频"标签页，
   * 而 `processFilmPhoto` 拿到视频 uri 只会在截图那一步得到一张空图。
   */
  const assets = picked.assets.filter((asset) => asset.type === 'image' || asset.type == null);
  if (assets.length === 0) {
    return { ok: false, uris: [], failed: 0, reason: 'cancelled', missingExifDate: false };
  }

  // ---- 2. 颗粒档位：和相机页走同一对纯函数，力度不漂移 --------------------
  const grainLevel = grainLevelAt(findGrainLevelIndex(options.grainLevel ?? 'std'));
  const effectivePreset = applyGrainLevel(preset, grainLevel.scale);

  const exposureBase = Math.max(1, Math.floor(options.exposureIndex ?? 1));
  const uris: string[] = [];
  let failed = 0;
  let missingExifDate = false;
  let lastError: string | null = null;

  // ---- 3. 逐张冲印（**串行**：宿主只有一块屏幕位置） ----------------------
  for (let index = 0; index < assets.length; index += 1) {
    options.onProgress?.({ index, total: assets.length });
    const asset = assets[index];
    const exif = isBag(asset.exif) ? asset.exif : null;

    try {
      // EXIF 拍摄时间：拿不到就是 `null` —— 明确告诉管线"我找过了，没有"，
      // 管线会落成"今天"（`input.capturedAt ?? new Date()`），并让我们记一笔提示。
      const capturedAt = readExifCapturedAt(exif);
      if (capturedAt === null) {
        missingExifDate = true;
      }

      /*
       * 位置**只**来自原图 GPS。没有 GPS 就是 `null`（没有坐标可反查，也就没有地名）；
       * 有 GPS 时按用户选的档位决定印什么，两条路的输入都是这一对 EXIF 坐标 ——
       * 严禁退化成"当前设备位置"（规矩②，见文件头）。
       *
       * **三档的分工（本轮改的就是这里）**：
       *   · `'off'`            → 不印地名那一行（`null`）。连反查都不发，省一次联网与隐私面。
       *   · `'place'`（默认）  → 反查（原生 → 公开接口兜底）；**失败就是 `null`**，
       *                         不会退回坐标。这条是用户点名的红线：地名档里出现
       *                         `LAT 23°02'N …` 等于把"我没查到"伪装成"我查到了"。
       *   · `'coords'`         → 不反查，直接 `coordsOnlyPlace` 印坐标。这是**唯一**
       *                         允许出现坐标的档位，而且必须是用户显式选的。
       *
       * 反查这一步是**本文件唯一的网络调用**，也是最可能卡住的一步，所以：
       *   · 只有"地名"档才真的联网（`wantsPlace`，理由见 `ImportAndDevelopOptions.locationMode`
       *     的注释：`'coords'` / `'off'` 两条路要的结果都不需要反查，发出去纯属白等加隐私风险）；
       *   · 它自带超时**和一次重试**（`resolvePlaceFromExifGps` → `locationStamp` 的
       *     `resolvePlaceFromCoords`：原生单次最多 5s、最多两次、总预算 10s；原生两次
       *     都没成再打一次免 Key 的公开接口，一次最多 4s）；
       *   · 所以**单张照片最坏多等 14s**（10s + 4s），而且只有"原生两次都没成"的照片
       *     才会走到那多出来的 4s。失败原因会进 `console.warn`（带坐标），不再静默；
       *   · 它**不抛**（同上）—— 一张照片能不能出片，绝不由"有没有网"决定。
       * 串行导入时这就是"每张最多多等 14s、但一定能等到下一张"的那道闸门
       * （只有这一步真的失败时才会等满，正常几百毫秒就回来了）。
       */
      const gps = readExifGps(exif);
      const mode: LocationMode = options.locationMode ?? 'place';
      const wantsPlace = mode === 'place';
      const geocoded = gps !== null && wantsPlace ? await resolvePlaceFromExifGps(gps) : null;
      /*
       * `null` 在三种档位下分别是"不印地名"（off）/ "这次没查到，不印地名"（place）/
       * "没有 GPS 可印"（coords 且 gps 为 null）—— 三种的下场一模一样，就是 `null`。
       * 所以这里不再是以前那个 `geocoded ?? toResolvedPlace(gps)`：
       * 那个写法在**地名档反查失败**时也会印出坐标，正是本轮要消掉的行为。
       */
      const place =
        geocoded ?? (gps !== null && mode === 'coords' ? toResolvedPlace(gps) : null);

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
        preset: effectivePreset,
        stage,
        host,
        capturedAt,
        place,
        locale: options.locale,
        watermarkLayout: options.watermarkLayout,
        placeDetail: options.placeDetail,
        exposureIndex: exposureBase + index,
      });

      uris.push(photo.uri);

      /*
       * 存进 App 内相册。`addShot` 按约定**不抛**（失败返回 `null`），所以这里
       * 单独判一次 null 只记日志 —— 成片已经截出来、也在 `uris` 里了，
       * 不能因为"索引没更新成"就把它算作失败。
       */
      const shot = await addShot({
        sourceUri: photo.uri,
        width: photo.width,
        height: photo.height,
        frameId: frame.id,
        presetId: effectivePreset.id,
      });
      if (shot === null) {
        console.warn('[retro-film-cam] 导入的成片没能写进 App 相册（索引未更新）。');
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
    };
  }

  return { ok: true, uris, failed, missingExifDate };
}

/** 错误 → 一行给用户看的文字（拿不到 message 就用 `String(error)`）。 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}
