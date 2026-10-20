import { File } from 'expo-file-system';

/**
 * 尽力删除由 App 自己创建的本地临时文件。
 *
 * 清理失败不能把一张已经冲印好的照片改判成失败，所以这里永远不抛；调用方只应传
 * 自己拥有生命周期的 cache/tmp URI，不要传系统相册或用户选择器返回的原始资产 URI。
 */
export function deleteLocalFilesBestEffort(
  uris: readonly (string | null | undefined)[],
  label = '临时文件',
): void {
  const unique = new Set(uris.filter((uri): uri is string => typeof uri === 'string' && uri.length > 0));
  for (const uri of unique) {
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      console.warn(`[retro-film-cam] 删除${label}失败：`, uri, error);
    }
  }
}
