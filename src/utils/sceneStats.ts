/**
 * 场景统计（v1.8.11 自适应调色的「测量层」）。
 *
 * 输入是 `utils/jpegSample.ts` 的 `sampleJpegDc()` 输出：一张只由 baseline-JPEG DC 系数
 * 还原出来的分块均值网格（亮度 + Cb/Cr，同网格）。本文件把网格算成 `SceneStats`：
 * 亮度分区占比（暗部/中间调/高光/溢出）、反差（亮度标准差）、色温倾向、绿-品红倾向、
 * 平均饱和度 —— 也就是用户 m06849 说的「明部暗部要根据拍摄场景自己去计算」的那份数据。
 *
 * ── 纪律（与 `jpegSample.ts` / `adaptiveGrade.ts` 同一套）─────────────────────
 *   · **只测量，不补偿**：这里不产生任何调色参数，也不改 `ResolvedColorGrade`；
 *     怎么补偿是 `adaptiveGrade.ts` 里 `planAdaptiveGrade()` 的事。
 *   · **纯函数、零依赖、零 RN 引用**：Node 探针可以用 typescript 转译直接装载断言。
 *   · **采样格 ≠ 像素**：每个采样格是源图里一整块（8×8 或 16×16）的均值，
 *     所以亮度用格子值算即可；阈值占比的统计单位是「格」，不是像素
 *     （契约 `_v1811_contract.md` §2 明确 `samples` = 实际参与的块数）。
 *   · 空/畸形输入返回 `null`（`samples` 永远 ≥ 1），调用方据此逐字节退化回静态曲线。
 *
 * ── 冻结公式（契约 §2，一个字都不许改）──────────────────────────────────────
 *   BT.601 full-range YCbCr → RGB（电平偏移 128，RGB 各自 clamp 到 0~255）：
 *     r = y + 1.402·(cr − 128)
 *     g = y − 0.344136·(cb − 128) − 0.714136·(cr − 128)
 *     b = y + 1.772·(cb − 128)
 *   亮度：l = (0.299·r + 0.587·g + 0.114·b) / 255
 *   meanLuma = mean(l)；contrast = √mean((l − meanLuma)²)
 *   分区：shadow l < 0.25；mid 0.25 ≤ l < 0.70；highlight 0.70 ≤ l < 0.995；clip l ≥ 0.995
 *   warmth   = (meanR − meanB) / (meanR + meanB + 1e-6)，clamp [−1, 1]
 *   tintBias = (meanG − (meanR + meanB)/2) / (meanLuma + 1e-6)，clamp [−1, 1]
 *   saturation = mean((max − min) / max)，max = 0 的格记 0
 *   meanR/G/B 是 0~1（RGB/255）；所有统计量 round4（4 位小数）；samples = 格数。
 */
import type { SceneStats } from '../types';
import type { SampledLuma } from './jpegSample';

/** 分区阈值（冻结）。 */
const SHADOW_MAX = 0.25;
const MID_MAX = 0.7;
const HIGHLIGHT_MAX = 0.995;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** round4：契约要求所有统计量保留 4 位小数（与 `adaptiveGrade.round4` 同实现）。 */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** RGB 通道 clamp 到 0~255（BT.601 反变换会轻微越界）。 */
function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value;
}

/**
 * 把 DC 采样网格算成场景统计；网格为空/畸形（长度与 cols×rows 不符、维度非整数）返回 `null`。
 *
 * 注意：`contrast` 按定义**两遍**计算（先 meanLuma，再 mean((l−mean)²)），
 * 不用 E[l²]−mean² 的展开式 —— 后者在纯灰面这种方差≈0 的场景会有相消误差。
 */
export function analyzeScene(sample: SampledLuma): SceneStats | null {
  if (!sample) return null;
  const { luma, cb, cr, cols, rows } = sample;
  if (!luma || !cb || !cr) return null;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
  if (cols <= 0 || rows <= 0) return null;
  const count = cols * rows;
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  if (luma.length !== count || cb.length !== count || cr.length !== count) {
    return null;
  }

  /* 第一遍：亮度总和 + RGB 均值 + 分区占比 + 饱和度；亮度逐格存入临时数组供第二遍求反差。 */
  const lumaValues = new Float64Array(count);
  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let shadow = 0;
  let mid = 0;
  let highlight = 0;
  let clip = 0;
  let sumSaturation = 0;
  for (let i = 0; i < count; i += 1) {
    const y = luma[i];
    const cbv = cb[i];
    const crv = cr[i];
    const r = clampByte(y + 1.402 * (crv - 128));
    const g = clampByte(y - 0.344136 * (cbv - 128) - 0.714136 * (crv - 128));
    const b = clampByte(y + 1.772 * (cbv - 128));
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lumaValues[i] = l;
    sumL += l;
    sumR += r;
    sumG += g;
    sumB += b;
    if (l < SHADOW_MAX) shadow += 1;
    else if (l < MID_MAX) mid += 1;
    else if (l < HIGHLIGHT_MAX) highlight += 1;
    else clip += 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sumSaturation += max === 0 ? 0 : (max - min) / max;
  }

  const meanLuma = sumL / count;
  const meanR = sumR / count / 255;
  const meanG = sumG / count / 255;
  const meanB = sumB / count / 255;

  /* 第二遍：按定义算亮度标准差。 */
  let sumSquaredDeviation = 0;
  for (let i = 0; i < count; i += 1) {
    const deviation = lumaValues[i] - meanLuma;
    sumSquaredDeviation += deviation * deviation;
  }
  const contrast = Math.sqrt(sumSquaredDeviation / count);

  const warmth = clamp((meanR - meanB) / (meanR + meanB + 1e-6), -1, 1);
  const tintBias = clamp(
    (meanG - (meanR + meanB) / 2) / (meanLuma + 1e-6),
    -1,
    1,
  );

  return {
    meanLuma: round4(meanLuma),
    contrast: round4(contrast),
    shadowShare: round4(shadow / count),
    midShare: round4(mid / count),
    highlightShare: round4(highlight / count),
    clipShare: round4(clip / count),
    warmth: round4(warmth),
    tintBias: round4(tintBias),
    saturation: round4(sumSaturation / count),
    samples: count,
  };
}
