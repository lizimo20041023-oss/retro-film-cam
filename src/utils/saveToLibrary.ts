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

/** SDK 54 之前的老 API 形状（仅用于运行时探测）。 */
interface LegacyMediaLibrary {
  saveToLibraryAsync?: (localUri: string) => Promise<void>;
  createAssetAsync?: (localUri: string) => Promise<unknown>;
}

/**
 * 把本地文件写进系统相册。
 * `localUri` 要是本地路径（`file:///...`），来自 captureRef / ImageManipulator 的结果都满足。
 */
export async function saveToLibrary(localUri: string): Promise<SaveOutcome> {
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
      await MediaLibrary.Asset.create(localUri);
      return { ok: true, uri: localUri };
    }

    // ② 旧 API 兜底（SDK ≤ 53）
    const legacy = MediaLibrary as unknown as LegacyMediaLibrary;
    if (typeof legacy.saveToLibraryAsync === 'function') {
      await legacy.saveToLibraryAsync(localUri);
      return { ok: true, uri: localUri };
    }
    if (typeof legacy.createAssetAsync === 'function') {
      await legacy.createAssetAsync(localUri);
      return { ok: true, uri: localUri };
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
