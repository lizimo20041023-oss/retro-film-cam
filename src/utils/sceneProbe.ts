/**
 * 成片场景采样 —— v1.9.0「极速测光」（用户 m07595 的第二道手术）。
 *
 * 这里只做一件事：把成片链路**已经裁切好**的那张底片，用 expo-image-manipulator 的
 * **原生**缩放压到 64×64、存成 JPEG（base64，compress 0.75），再用纯 JS 只解 DC
 * 得到场景统计（`sceneStats.ts`），喂给 `adaptiveGrade.planAdaptiveGrade()`。
 *
 * ── 为什么测光不需要全图 ─────────────────────────────────────────────────
 * `sceneStats.ts` 要的是 10 个低阶矩（分区占比 / 反差 / 色温倾向 / 饱和度 / …），
 * 不是像素。64×64 = 4096 个像素，各统计量的抽样噪声量级约 1/√4096 ≈ 1.6%，而自适应
 * 判定的阈值间距是 0.08~0.26 —— 再多一千万像素只是把同一个均值算得更精确，对「这张是
 * 逆光还是平光」没有增量信息。反过来说，把 12MP 原图整段搬进 JS 正是 v1.8.11 单次
 * 5~7 秒卡顿与发热的来源。所以这里让原生侧完成缩放/编码（0 次 JS 解码、0 个全尺寸
 * 位图进 JS 堆），JS 只处理那张 64×64 的缩略图。
 *
 * ── 64×64 的 4:2:0 每 MCU 怎样落到 64 个 Y DC 样本 ───────────────────────
 * ImageManipulator 的 JPEG 编码器对彩色图默认 4:2:0：Y 全采样、Cb/Cr 各 2×2 下采样。
 * 一个 MCU = 16×16 像素 = 4 个 8×8 的 Y 块 + 1 个 Cb 块 + 1 个 Cr 块（每块一个 DC）。
 * 64×64 = 4×4 = **16 个 MCU** ⇒ 解码器一共读到 16 × 4 = **64 个 Y 的 DC 样本**
 * （外加 16 个 Cb / 16 个 Cr DC）。按 `jpegSample.ts` 的 `SampledLuma` 契约，同一 MCU
 * 的 4 个 Y DC 取平均成 **1 格**，于是 `analyzeScene` 看到的是 4×4 = 16 格、blockPx=16
 * —— 16 ≥ `MIN_SAMPLES`（12），刚好够判四类场景。编码器若选 4:4:4（1 格 = 1 个 8×8
 * Y 块）或灰度（1 分量），网格是 8×8 = 64 格；三种布局都远高于采样下限，
 * `_probe_v190_meter.mjs` 用生成好的三张布局夹具分别断言。
 *
 * ── <5ms 预算 ────────────────────────────────────────────────────────────
 * 全链路只有两段真花时间：① 原生侧 64×64 缩图 + JPEG 编码（几十微秒到百微秒级）；
 * ② JS 侧解 64×64 JPEG 的 DC（文件约 0.5~2 KB、约 300~800 个熵字节、只做整数加法，
 * 不解 IDCT、不建位图）。node 上用与生产同尺寸的夹具实测：DC 解码 + 统计的中位数远低于
 * 0.1ms，iOS 低端机也留有两个数量级余量（探针把实测值打印出来供 README 引用）。
 *
 * ── 唯一的实现路径（契约 v1.9.0 §5）─────────────────────────────────────
 *   `ImageManipulator.manipulate(uri)` → `resize({ width: 64, height: 64 })` →
 *   `renderAsync()` → `saveAsync({ format: JPEG, compress: 0.75, base64: true })` →
 *   `base64ToBytes` → `sampleJpegDc` → `analyzeScene`。
 * **没有**第二条路：不读原图字节、不尝试其它尺寸、失败就返回 null（回退全图等于把
 * 5~7 秒卡顿重新装回来）。裁切/归一化/画质档全是成片链路上游的事，这里只负责「量光」。
 *
 * ── 失败语义 ──────────────────────────────────────────────────────────────
 * 任何一步失败（uri 读不到、原生缩图/编码抛错、base64 不合法、不是 baseline JPEG）
 * → 返回 `null`，**绝不抛**。上游 `planAdaptiveGrade(null, …)` 返回 null，调色层逐字节
 * 回到静态预设：测光是锦上添花，不能挡住一张照片出片。
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { SceneStats } from '../types';
import { sampleJpegDc } from './jpegSample';
import { analyzeScene } from './sceneStats';

/** 快速测光的采样边长（像素）：64×64 已足够稳定 10 个低阶矩，见文件头。 */
export const FAST_SAMPLE_EDGE = 64;

/**
 * 快速测光的 JPEG 压缩质量（`saveAsync({ compress })`，0~1）。
 *
 * 0.75 是「体积/保真」的平衡点：64×64 的 JPEG 落在 0.5~2 KB（远低于 4096 B 预算），
 * 而亮度 DC 在 quality≈75 下的量化步长只有个位数 —— 分区占比的阈值判定不会被压缩噪声
 * 推翻（探针用同质量夹具验证过四类场景）。再高只是让每张图多几百字节，再低开始影响
 * 暗部占比的边界判定。
 */
export const FAST_SAMPLE_COMPRESS = 0.75;

/** base64 字母表（标准 RFC 4648，含 `+` `/`，ImageManipulator 用的就是这版）。 */
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 字符码 → 6bit 值的查表（-1 = 非法字符）。用 `Int16Array` 而不是 `Map`
 * 是为了纯整数索引：64×64 的 base64 只有 1~3 KB，这张表是常量、零分配。
 */
const BASE64_LOOKUP: Int16Array = (() => {
  const table = new Int16Array(256);
  table.fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** 空白与换行：编码器不会产生，但调试/粘贴时常带，契约要求跳过。 */
function isBase64Whitespace(code: number): boolean {
  return (
    code === 0x20 || // 空格
    code === 0x09 || // \t
    code === 0x0a || // \n
    code === 0x0d || // \r
    code === 0x0b || // \v
    code === 0x0c // \f
  );
}

/**
 * 标准 base64 → 字节（纯函数，无 Buffer / atob / DOM 依赖，RN Hermes 上同样可用）。
 *
 * 契约（v1.9.0 §5）：跳过换行/空白；**任何非法字符都返回 `null`**，不抛。
 * 这里同时拒绝「非规范 base64」（长度不是 4 的倍数、`=` 出现在中间、填充数量不对、
 * 填充位非零）—— 原生编码器产出的永远是规范形式，严一点能把静默解出错图挡在门外。
 * 空串返回空 `Uint8Array`（0 字节没有任何非法字符）；空字节在下游会被 JPEG 解析器拒绝。
 */
export function base64ToBytes(base64: string): Uint8Array | null {
  if (typeof base64 !== 'string') {
    return null;
  }
  const length = base64.length;

  // 一次扫描：跳过空白、校验字符、记录数据字符数量与尾部填充数。
  // `values` 按最坏情况（全是数据字符）分配，实际只填前 dataCount 个。
  const values = new Uint8Array(length);
  let dataCount = 0;
  let padding = 0;
  for (let i = 0; i < length; i += 1) {
    const code = base64.charCodeAt(i);
    if (isBase64Whitespace(code)) {
      continue;
    }
    if (code === 0x3d) {
      // '='：只能在尾部，最多两个。
      padding += 1;
      if (padding > 2) {
        return null;
      }
      continue;
    }
    if (code > 0xff) {
      return null;
    }
    const value = BASE64_LOOKUP[code];
    if (value < 0) {
      return null;
    }
    if (padding > 0) {
      return null; // '=' 之后不允许再出现数据字符
    }
    values[dataCount] = value;
    dataCount += 1;
  }

  // 规范形式：数据字符 + 填充必须是 4 的倍数（即「有填充的 base64」）。
  if ((dataCount + padding) % 4 !== 0) {
    return null;
  }
  // 填充位必须为 0（否则同一个字节串有多个 base64 写法）。
  if (padding === 1 && (values[dataCount - 1] & 0x03) !== 0) {
    return null;
  }
  if (padding === 2 && (values[dataCount - 1] & 0x0f) !== 0) {
    return null;
  }

  const remainder = dataCount % 4;
  const byteLength =
    (dataCount >> 2) * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
  const bytes = new Uint8Array(byteLength);

  let out = 0;
  let i = 0;
  for (; i + 4 <= dataCount; i += 4) {
    const a = values[i];
    const b = values[i + 1];
    const c = values[i + 2];
    const d = values[i + 3];
    bytes[out] = (a << 2) | (b >> 4);
    bytes[out + 1] = ((b & 0x0f) << 4) | (c >> 2);
    bytes[out + 2] = ((c & 0x03) << 6) | d;
    out += 3;
  }
  if (remainder === 2) {
    bytes[out] = (values[i] << 2) | (values[i + 1] >> 4);
  } else if (remainder === 3) {
    const a = values[i];
    const b = values[i + 1];
    const c = values[i + 2];
    bytes[out] = (a << 2) | (b >> 4);
    bytes[out + 1] = ((b & 0x0f) << 4) | (c >> 2);
  }
  return bytes;
}

/**
 * 从一张（已裁切的）底片 uri 采样场景统计。**永不抛**，失败返回 `null`。
 *
 * 这是本文件唯一的对外入口：`processFilmPhoto` 在裁切之后调它一次，把结果挂到
 * `preset.scene` 上。实现见文件头「唯一的实现路径」——64×64 原生缩图 + JPEG base64，
 * 再交给纯 JS 的 DC 解码器；任何一步失败都退化回「没有场景数据」。
 */
export async function probeScene(uri: string): Promise<SceneStats | null> {
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: FAST_SAMPLE_EDGE, height: FAST_SAMPLE_EDGE });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: FAST_SAMPLE_COMPRESS,
      base64: true,
    });
    const bytes = saved.base64 ? base64ToBytes(saved.base64) : null;
    if (bytes === null) {
      return null;
    }
    const sample = sampleJpegDc(bytes);
    return sample === null ? null : analyzeScene(sample);
  } catch {
    // 采样失败绝不能影响出片：uri 读不了 / 原生缩图抛错 / base64 非法 / 不是 baseline JPEG，
    // 一律当作「没有场景数据」，上游退化成静态预设。
    return null;
  }
}
