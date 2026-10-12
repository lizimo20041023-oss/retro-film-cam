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
 * ── 降级策略：任何一步失败都退回相机胶卷 ──────────────────────────────────
 * 相簿只是**归类**，不是保存的前提。所以相簿那一整段包在自己的 try 里：
 * 拿不到相簿 / 建不出来 / 传进去不被接受，都改用 `Asset.create(uri)`（无相簿参数）
 * 落到相机胶卷，并在返回值里如实标 `destination: 'camera-roll'`
 * —— 让界面能说"存了，但没进 RETRO CAM"，而不是谎报成功或干脆报错。
 */
import * as MediaLibrary from 'expo-media-library';
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

/** 只申请"写入相册"权限（不给读取权限，符合最小权限原则）。 */
export async function requestSavePermission(): Promise<WritePermissionState> {
  const response = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  return {
    granted: response.granted,
    // 拿不到 canAskAgain 时按"还能问"处理，用户至少还能再试一次
    canAskAgain: response.canAskAgain !== false,
  };
}

/** 只查询当前权限状态，不弹窗（App 回到前台时刷新用）。 */
export async function getSavePermission(): Promise<WritePermissionState> {
  const response = await MediaLibrary.getPermissionsAsync(true, ['photo']);
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
 * 为什么 `Album.create` 传**空数组**再 `album.add(asset)`，而不是
 * `Asset.create(uri, album)`：
 *   · `create(name, refs)` 的第二个参数语义在两端不一致 —— 文档明说 Android 上
 *     `moveAssets` 为 true 时"移动"、否则"复制"（`Album.d.ts:92`），
 *     同一个文件在 iOS/Android 上到底剩几份不好断言；
 *   · `album.add()` 是**唯一**一处"把资产放进相簿"的前进方向 API（`Album.d.ts:57`
 *     的弃用提示就是 `Use album.add()`），行为面最窄，出错也只能错在这一步。
 *
 * 任何一步失败都返回 `null`，由调用方降级到相机胶卷 —— 这里**不抛错**：
 * 相簿归类失败不该把整次保存判死。
 */
async function resolveAlbum(): Promise<MediaLibrary.Album | null> {
  try {
    const found = await MediaLibrary.Album.get(albumName());
    if (found !== null) {
      return found;
    }
    // 传空数组：这一句只负责"把相簿建出来"，资产随后由 add() 放进去。
    return await MediaLibrary.Album.create(albumName(), []);
  } catch {
    return null;
  }
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
    const permission = await requestSavePermission();
    if (!permission.granted) {
      return {
        ok: false,
        reason: 'permission-denied',
        message: permission.canAskAgain ? t('save.denied.retry') : t('save.denied.settings'),
      };
    }

    // ① 新 API（SDK 54+）：Asset.create
    if (typeof MediaLibrary.Asset?.create === 'function') {
      // ①-a 相簿优先：拿不到/建不出相簿时 album 为 null，下面走相机胶卷
      const album = await resolveAlbum();
      if (album !== null) {
        try {
          const asset = await MediaLibrary.Asset.create(localUri);
          await album.add(asset);
          return { ok: true, uri: localUri, destination: 'album', album: albumName() };
        } catch {
          // 掉进这里说明"相簿那一段"整段失败了（建相簿 / 建资产 / 放进相簿）。
          // 这里**只能**报"存了但没归到相簿"，不能返回失败：
          // `Asset.create` 很可能已经把照片写进库里了（失败的是后面的 `add`），
          // 而"到底写没写进去"从抛出的错误里判断不出来 —— 再调一次 `Asset.create`
          // 就是在赌会不会多出一份重复照片。宁可少一个相簿归类，也不能多一张重复照片。
          return { ok: true, uri: localUri, destination: 'camera-roll' };
        }
      }
      // ①-b 没有相簿可用（老 SDK / 原生模块没有 Album 类）：落到相机胶卷
      await MediaLibrary.Asset.create(localUri);
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
    return { ok: false, reason: 'failed', message: describeError(error) };
  }
}
