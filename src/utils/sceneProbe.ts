/**
 * 成片场景采样（v1.8.11，用户 m06849 第一条）。
 *
 * 用户要的是「根据光线变化而改变、明部暗部按拍摄场景自己算」—— 那就必须真的**读 pixels**，
 * 而不是再叠一层固定色偏。这里的做法刻意选了整条链里最便宜的一条：
 *
 *   1. 底片在 `processFilmPhoto` 里已经归一化 + 居中裁切成窗口比例（JPEG，质量 0.98）；
 *   2. 把这份 JPEG 的**字节**读进来（`expo-file-system` 的 `File.bytes()`，不缩放、不重编码
 *      —— 缩放要再走一次原生 ImageManipulator，既慢又可能改变直方图）；
 *   3. `jpegSample.ts` 只用 baseline JPEG 的 **DC 系数**采样出按 MCU 分块的亮度网格
 *      （4:2:0 一格 16×16px、4:4:4 一格 8×8px；不解 IDCT、不解 AC、不建全尺寸位图）；
 *   4. `sceneStats.ts` 把块亮度换成 `SceneStats`（分区占比 / 反差 / 色温倾向 / 饱和度）。
 *
 * 为什么不在**取景器**里做同样的事：v1.8.6 的发热纪律（用户 m03551）把实时预览的每帧开销
 * 卡死了 —— 取景器只允许"已烘焙的静态层 + 一次截图"。所以场景分析**只在按下快门之后**
 * 跑一次，是"每张成片一次"的量级，不是每帧。
 *
 * 失败语义：任何一步不是 baseline JPEG / 读文件失败 / 解码器不认 → 返回 `null`。
 * `null` 在上游等于"不做自适应"（`buildGradeLayers` 逐字节回到 v1.8.10 静态曲线），
 * **绝不抛** —— 采样是锦上添花，不能让它挡住一张照片的出片。
 */
import { File } from 'expo-file-system';

import type { SceneStats } from '../types';
import { sampleJpegDc } from './jpegSample';
import { analyzeScene } from './sceneStats';

/**
 * 采样上限：超过这个字节数的 JPEG 直接放弃（不是不认识，而是"不划算"）。
 *
 * 单张底片在正常链路里是 3024×4032 @ q0.98 ≈ 3~5MB；这个上限只用来挡住"用户导入了一张
 * 100MB 的扫描件"这种极端情况 —— 读进内存 + 扫 DC 也会成功，但那几秒不值得。
 * 超限返回 null = 不做自适应，成片照出。
 */
export const SCENE_PROBE_MAX_BYTES = 6 * 1024 * 1024;

/**
 * 从一张 JPEG 文件 uri 采样场景统计。永不抛，失败返回 `null`。
 *
 * 这是本文件唯一的对外入口（`processFilmPhoto` 在裁切之后调它一次）。
 */
export async function probeScene(uri: string): Promise<SceneStats | null> {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return null;
    }
    if (file.size > SCENE_PROBE_MAX_BYTES) {
      return null;
    }
    const bytes = await file.bytes();
    if (bytes.byteLength === 0) {
      return null;
    }
    const sample = sampleJpegDc(bytes);
    if (sample === null) {
      return null;
    }
    return analyzeScene(sample);
  } catch {
    // 采样失败绝不能影响出片：读文件失败 / 不是 JPEG / 解码器不认，一律当作"没有场景数据"。
    return null;
  }
}
