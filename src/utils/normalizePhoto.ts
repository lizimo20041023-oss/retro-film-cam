/**
 * 原图归一化：把最长边压到 `maxLongEdge`。**默认（预设里的 `normalizeMaxLongEdge: 0`）是关掉的。**
 *
 * 为什么要留这一步？
 * 12MP 的 iPhone 照片解码成位图约 4000×3000×4B ≈ 48 MB。合成阶段照片要被 draw 两次
 * （一次原图、一次"自叠加提对比度"），峰值直接翻倍。老机器上如果觉得拍照后偶发闪退，
 * 把预设里的 `normalizeMaxLongEdge` 改回 2048 就能把峰值压到约 12 MB —— 代价是照片被降采样。
 * 默认不压缩，是为了让成片尽量吃到原图细节（成片像素数另由 `captureLongEdge` 决定）。
 *
 * 用 `expo-image-manipulator` 的**新 API**（`manipulate` → `renderAsync` → `saveAsync`）；
 * 旧的 `manipulateAsync` 已被官方标为 Deprecated。
 *
 * 失败必须降级：归一化只是省内存的优化，绝不能因此拍不出照片，所以整体 try/catch 退回原图。
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CapturedPhoto, NormalizedPhoto } from '../types';
import { describeError } from './describeError';

/**
 * @param photo `takePictureAsync` 的结果
 * @param maxLongEdge 目标最长边（像素）；<= 0 或非有限数 = 跳过归一化
 */
export async function normalizePhoto(
  photo: CapturedPhoto,
  maxLongEdge: number,
): Promise<NormalizedPhoto> {
  if (!Number.isFinite(maxLongEdge) || maxLongEdge <= 0) {
    return { ...photo, resized: false, note: 'normalizeMaxLongEdge <= 0，跳过归一化' };
  }

  const longEdge = Math.max(photo.width, photo.height);
  if (longEdge <= maxLongEdge) {
    return { ...photo, resized: false, note: `原图长边 ${longEdge}px 未超过 ${maxLongEdge}px` };
  }

  try {
    const scale = maxLongEdge / longEdge;
    const context = ImageManipulator.manipulate(photo.uri);
    // 只给一个维度，另一个维度自动按比例缩放（不会变形）
    if (photo.width >= photo.height) {
      context.resize({ width: Math.round(photo.width * scale) });
    } else {
      context.resize({ height: Math.round(photo.height * scale) });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    return {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      resized: true,
    };
  } catch (error) {
    return {
      ...photo,
      resized: false,
      note: `归一化失败，已退回原图：${describeError(error)}`,
    };
  }
}
