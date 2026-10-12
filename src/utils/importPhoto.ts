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
 *    所以本文件**不 import `expo-location`，也不调用 `useLocationStamp` /
 *    `fetchLocationStamp`**，位置**只**来自原图 EXIF 的 GPS 标签，拿不到就是 `null`。
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
 * 需要网络：否。需要权限：由 `launchImageLibraryAsync` 自己处理（iOS 14+ 是
 * `PHPickerViewController`，选中即授权，不需要预先申请整库读取权限）。
 */
import * as ImagePicker from 'expo-image-picker';
import { grainLevelAt, findGrainLevelIndex, applyGrainLevel } from '../constants/grain';
import type { LocaleId } from '../i18n/types';
import type {
  FilmPreset,
  FilmStageHost,
  FrameSpec,
  PlaceDetail,
  ResolvedPlace,
  Size,
  WatermarkLayout,
} from '../types';
import { addShot } from './galleryStore';
import { formatCoords } from './placeNames';
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
  /** 当前界面语言。水印里的地名按它渲染（老照片也要跟着界面语言走）。 */
  locale?: LocaleId;
  /** 水印版式；不传 = `'split'`。 */
  watermarkLayout?: WatermarkLayout;
  /** 地名详细度；不传 = `'archive'`。 */
  placeDetail?: PlaceDetail;
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

/** 原图的坐标。拿不到（或者只有一半）返回 `null`。 */
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
 * 坐标 → `ResolvedPlace`。
 *
 * **只填 `coords`，其余四个字段留空串** —— 这是刻意的：我们只有坐标，没有"城市/国家"
 * 这种结论，编不出来。而空串在渲染层是安全的：`formatResolvedPlace` 会逐级降级，
 * 结果是那一行**只剩坐标**（和相机页"坐标档"输出的形状完全一致，
 * 见 `locationStamp.ts` 里同样这么构造）。
 *
 * ⚠️ 实测结论：这里**不能**用 `resolvePlaceFromGeocode(null, lat, lng)`
 * —— 那个函数在拿不到 `city` 时会逐级降级到 `source.country` / `countryCode`，
 * 传 `null` 进去它照样会从兜底里取出非空值，形状和"只有坐标"不一样。
 *
 * ⚠️ 另一个实测结论（别被"坐标档"三个字骗了）：坐标**只在
 * `settings.locationMode === 'coords'` 时才有机会被印出来** —— 合成层
 * （`FilmCompositor.planWatermark`）会把 `place` 按**它的** `watermarkLayout`
 * 重排，而 `placeNames.formatResolvedPlace` 对"只有坐标"的结构返回的是坐标串本身，
 * 所以坐标不会丢；但整条定位水印受设置里的定位档位控制，关掉定位就不印。
 * 详见报告"拿不准"一节。
 */
function toResolvedPlace(coords: { latitude: number; longitude: number }): ResolvedPlace {
  return {
    city: '',
    region: '',
    country: '',
    countryCode: '',
    coords: formatCoords(coords.latitude, coords.longitude),
  };
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
       * 位置**只**来自原图 GPS。没有就是 `null` —— 严禁退化成"当前设备位置"。
       * 这条路径不 import expo-location，也不碰 useLocationStamp，
       * 所以物理上不可能拿到当前定位。
       */
      const gps = readExifGps(exif);
      const place = gps === null ? null : toResolvedPlace(gps);

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
