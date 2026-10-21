/**
 * 写入相册 + 权限。
 *
 * ⚠️ 重要 API 变更（已核实官方文档 / 迁移指南）：
 * `expo-media-library` 现在的主入口是**类式新 API**：`Asset.create(uri)`。
 * 旧的 `saveToLibraryAsync` / `createAssetAsync` 只在 `expo-media-library/legacy` 里，
 * 从主入口调用**会在运行时抛错**（官方原文："This method will throw in runtime."）。
 *
 * 权限 API：`requestPermissionsAsync(writeOnly, granularPermissions)` 新旧版本都有，
 * 所以直接用它是安全的；只用 writeOnly 是因为我们只写不读。
 *
 * SDK 54 之前的兜底：运行时探测 legacy 的 `saveToLibraryAsync`。
 * 这是全项目**唯一**的类型断言（旧 API 已不在当前类型里，不探测就没法兼容），
 * 并且没有出现 `any`。
 *
 * ── 为什么还要往专属相簿里存（本次改动）────────────────────────────────────
 * 目标是"照片落进一个叫 RETRO CAM 的相簿"，不是一个更花哨的返回值：
 * 用户在**系统「照片」App** 里看到的必须是同一个相簿。相簿名由 i18n 的
 * `album.name` 提供 —— 它在五种语言里是**同一串字符**（`'RETRO CAM'`），
 * 因为那是给系统看的稳定标识，不是给人读的文案。
 *
 * ⚠️ 任务书写的是 `getAlbumAsync` / `createAlbumAsync` / `addAssetsToAlbumAsync`，
 * 但那三个名字在本仓库装的 57.0.5 里**已经废弃**，主入口调用会运行时抛错
 * （见 `node_modules/expo-media-library/build/legacyWarnings.d.ts:42` / `:46` / `:22`，
 * 每个都标着 "This method will throw in runtime."）。当前等价物是类静态方法：
 *   · `Album.get(title): Promise<Album | null>`   ← 取代 getAlbumAsync
 *   · `Album.create(name, refs, moveAssets?)`      ← 取代 createAlbumAsync
 *   · `album.add(assets)`                          ← 取代 addAssetsToAlbumAsync
 * （`build/types/Album.d.ts:133` / `:105` / `:72`）
 *
 * iOS 先创建资产，再加入专属相簿；后一步失败仍可如实回报相机胶卷保存成功。
 * Android 直接写目标目录，首张照片用 `Album.create(name, [uri])` 建相簿；
 * 若原生调用失败，不自动重试写相机胶卷，避免已写入但回传失败时产生重复照片。
 */
import * as MediaLibrary from 'expo-media-library';
import { AppState, Platform } from 'react-native';
import { t } from '../i18n';
import type { SaveOutcome } from '../types';
import { describeError } from './describeError';

export interface WritePermissionState {
  granted: boolean;
  /** false = 系统不再弹窗（iOS/Android 都可能是"拒绝且不再询问"），此时要给"去设置"引导。 */
  canAskAgain: boolean;
}

/**
 * 这张照片最后落在了哪。
 *
 * 为什么要多一个字段而不是只靠文案：调用方要能**按结果决定说什么**
 * （`gallery.saved` 要填 `{album}`，相机胶卷兜底就不能填），
 * 而不是去正则匹配一句已经翻译好的话。
 */
export type SaveDestination = 'album' | 'camera-roll';

/**
 * `SaveOutcome` 的**加宽版**：成功分支多一个必有的 `destination`，
 * 相簿那一支还带 `album`（相簿名，用来填 `gallery.saved` 的 `{album}`）。
 *
 * 为什么不是改 `src/types/index.ts`：那个文件不在本 agent 的写入范围里，
 * 而且 `processAndSaveFilmPhoto()` 的返回类型是 `ProcessAndSaveResult.save: SaveOutcome`
 * —— 加宽只会**收窄**这里的返回类型，对既有调用方（`CameraScreen` 只看 `.ok`）
 * 完全向后兼容，不需要动那些文件。
 */
export type AlbumSaveOutcome =
  | { ok: true; uri: string; destination: 'album'; album: string }
  | { ok: true; uri: string; destination: 'camera-roll' }
  | { ok: false; reason: 'permission-denied' | 'unsupported-api' | 'failed'; message: string };

/** 成功授权后本次进程内复用；写入失败时清空，下一次会重新向系统核对。 */
let writePermissionGranted = false;
/** 相簿名固定，复用原生 Album 实例，避免每张都查询系统相册。 */
let cachedAlbum: MediaLibrary.Album | null = null;
let albumLookup: Promise<MediaLibrary.Album | null> | null = null;
let albumCacheGeneration = 0;

function clearAlbumCache(): void {
  albumCacheGeneration += 1;
  cachedAlbum = null;
  albumLookup = null;
}

// 用户从系统设置返回时权限或相簿可能已变化；下一张重新查询一次即可。
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    writePermissionGranted = false;
    clearAlbumCache();
  }
});

/** 只申请"写入相册"权限（不给读取权限，符合最小权限原则）。 */
export async function requestSavePermission(): Promise<WritePermissionState> {
  const response = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  writePermissionGranted = response.granted;
  return {
    granted: response.granted,
    // 拿不到 canAskAgain 时按"还能问"处理，用户至少还能再试一次
    canAskAgain: response.canAskAgain !== false,
  };
}

/** 只查询当前权限状态，不弹窗（App 回到前台时刷新用）。 */
export async function getSavePermission(): Promise<WritePermissionState> {
  const response = await MediaLibrary.getPermissionsAsync(true, ['photo']);
  writePermissionGranted = response.granted;
  if (!response.granted) clearAlbumCache();
  return {
    granted: response.granted,
    canAskAgain: response.canAskAgain !== false,
  };
}

/**
 * 相簿名（`'RETRO CAM'`）。
 *
 * 走 i18n 而不是写死字面量，是为了让"相簿叫什么"只有**一个**真源：
 * 五个语言文件里这一条刻意保持同一串字符（见 `zh-Hans.ts:83` 上方那行注释）。
 * 取不到时兜底成同一串 —— 那说明翻译层出了问题，但相簿名不能因此变成空串
 * （空名字要么被原生拒绝，要么建出一个用户在系统相册里认不出来的相簿）。
 */
function albumName(): string {
  const name = t('album.name');
  return name.length > 0 ? name : 'RETRO CAM';
}

/** SDK 54 之前的老 API 形状（仅用于运行时探测）。 */
interface LegacyMediaLibrary {
  saveToLibraryAsync?: (localUri: string) => Promise<void>;
  createAssetAsync?: (localUri: string) => Promise<unknown>;
}

/**
 * 取到（或建出）目标相簿。
 *
 * iOS 可建空相簿，之后创建照片资产、关联相簿；Android 的系统相簿是有照片的
 * 目录，不能传空数组创建，所以首次保存由调用方用 `Album.create(name, [uri])`。
 *
 * 查询失败返回 null。iOS 会退回相机胶卷；Android 首张照片尝试直接创建相簿。
 */
async function resolveAlbum(): Promise<MediaLibrary.Album | null> {
  if (cachedAlbum !== null) return cachedAlbum;
  if (albumLookup === null) {
    const generation = albumCacheGeneration;
    albumLookup = (async () => {
      try {
        const found = await MediaLibrary.Album.get(albumName());
        // Android 的系统相册以有照片的目录表示相簿，空数组创建会失败。
        // 第一张照片由调用方用 Album.create(name, [uri]) 一次建相簿并写入。
        const album = found ?? (Platform.OS === 'android'
          ? null
          : await MediaLibrary.Album.create(albumName(), []));
        if (generation === albumCacheGeneration) cachedAlbum = album;
        return album;
      } catch {
        return null;
      } finally {
        if (generation === albumCacheGeneration) albumLookup = null;
      }
    })();
  }
  return albumLookup;
}

/**
 * 把本地文件写进系统相簿。
 * `localUri` 要是本地路径（`file:///...`），来自 captureRef / ImageManipulator 的结果都满足。
 *
 * ⚠️ 返回类型写的是基类型 `SaveOutcome`：`src/types/index.ts` 不在本 agent 的写入范围内，
 * 而函数体必须能构造带 `destination` 的对象。所以真正的实现叫 `saveToLibraryDetailed`，
 * 这个对外名字只是把它**窄化**回既有契约 —— `processFilmPhoto.ts` 的
 * `ProcessAndSaveResult.save: SaveOutcome` 因此一个字都不用改。
 *
 * 需要区分落点（"进了 RETRO CAM"还是"退到相机胶卷"）的调用方直接用
 * `saveToLibraryDetailed()`，见下面的 `AlbumSaveOutcome`。
 */
export async function saveToLibrary(localUri: string): Promise<SaveOutcome> {
  return saveToLibraryDetailed(localUri);
}

/**
 * 真正干活的那个：返回带 `destination` 的加宽结果。
 * 逻辑全在这里，`saveToLibrary()` 只是它的窄化门面。
 */
export async function saveToLibraryDetailed(localUri: string): Promise<AlbumSaveOutcome> {
  try {
    const permission = writePermissionGranted
      ? { granted: true, canAskAgain: true }
      : await requestSavePermission();
    if (!permission.granted) {
      return {
        ok: false,
        reason: 'permission-denied',
        message: permission.canAskAgain ? t('save.denied.retry') : t('save.denied.settings'),
      };
    }

    // ① 新 API（SDK 54+）：Asset.create
    if (typeof MediaLibrary.Asset?.create === 'function') {
      // 原生调用失败会落到最外层 catch，绝不能伪装成保存成功。
      const album = await resolveAlbum();
      // Android 可直接写入目标目录；首张以带 URI 的 Album.create 建相簿，
      // 后续以 Asset.create(uri, album) 写入，都不再先落相机胶卷再移动/复制。
      if (Platform.OS === 'android') {
        if (album === null) {
          cachedAlbum = await MediaLibrary.Album.create(albumName(), [localUri]);
        } else {
          await MediaLibrary.Asset.create(localUri, album);
        }
        return { ok: true, uri: localUri, destination: 'album', album: albumName() };
      }
      // iOS 的 create(uri, album) 在原生侧先建资产再关联相簿；后一步失败
      // 会抛错但资产已创建，JS 若重试便会重复保存，因此保留两步安全回退。
      const asset = await MediaLibrary.Asset.create(localUri);
      if (album !== null) {
        try {
          await album.add(asset);
          return { ok: true, uri: localUri, destination: 'album', album: albumName() };
        } catch {
          clearAlbumCache();
          // 资产已经创建成功；这里只是归入专属相簿失败，所以相机胶卷里仍确实有照片。
          return { ok: true, uri: localUri, destination: 'camera-roll' };
        }
      }
      // 没有相簿可用时，刚创建的 asset 已经位于相机胶卷。
      return { ok: true, uri: localUri, destination: 'camera-roll' };
    }

    // ② 旧 API 兜底（SDK ≤ 53）：那条路径没有相簿 API 可用，如实标相机胶卷
    const legacy = MediaLibrary as unknown as LegacyMediaLibrary;
    if (typeof legacy.saveToLibraryAsync === 'function') {
      await legacy.saveToLibraryAsync(localUri);
      return { ok: true, uri: localUri, destination: 'camera-roll' };
    }
    if (typeof legacy.createAssetAsync === 'function') {
      await legacy.createAssetAsync(localUri);
      return { ok: true, uri: localUri, destination: 'camera-roll' };
    }

    return {
      ok: false,
      reason: 'unsupported-api',
      message: t('save.unsupported'),
    };
  } catch (error) {
    // 可能是系统权限被用户撤销，也可能是缓存的相簿失效；下次重新查询。
    writePermissionGranted = false;
    clearAlbumCache();
    return { ok: false, reason: 'failed', message: describeError(error) };
  }
}
