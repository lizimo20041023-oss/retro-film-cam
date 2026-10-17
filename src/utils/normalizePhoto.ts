/**
 * 原图归一化：把最长边压到 `maxLongEdge`。**默认关（`presets.ts` 里 `normalizeMaxLongEdge: 0`）。**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 它和"画质档"是两件事（v1.7.0）
 * ─────────────────────────────────────────────────────────────────────────
 * · 画质档（`constants/captureQuality.ts`）管**成片**的长边像素：合成舞台截屏时画多大。
 * · 这一步管**源图**（相机原图）在内存里留多大。归一化发生在合成之前，减的是"解码位图"
 *   的内存，**不改成片像素数** —— 成片像素另由 `captureLongEdge` 决定，而源图不够大时
 *   `captureOptions.ts` 的 `clampedToSource` 会把目标如实夹回源长边（不凭空插值）。
 *
 * 所以两者要配对看：档位选 standard（成片长边 2048px）却留着 12MP 的源图，纯属白占内存 ——
 * 这时把 `normalizeMaxLongEdge` 设成源长边 ≥ 档位长边（2048~4032）是划算的，清晰度一点不损失。
 * 反过来说，源长边小于档位长边，成片就只能插值 —— 那正是 `clampedToSource` 要挡的事。
 *
 * 为什么默认还是关：12MP 的 iPhone 照片解码成位图约 4000×3000×4B ≈ 48 MB。合成阶段照片要被
 * draw 两次（一次原图、一次"自叠加提对比度"），峰值直接翻倍。默认不压缩 = 让成片尽量吃到原图
 * 细节，代价是老机器上偶发闪退的风险；真出这个问题，把预设里的 `normalizeMaxLongEdge` 改回
 * 2048 就能把峰值压到约 12 MB。归一化只缩像素、**不裁切**，所以它永远不该改变构图。
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
 * @param maxLongEdge 目标最长边（像素）；`<= 0` 或非有限数 = 跳过归一化（**默认路径**，
 *   由 `preset.normalizeMaxLongEdge` 决定，开机默认 0）
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
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.98 });
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
