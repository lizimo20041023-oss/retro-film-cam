/**
 * v2.0.0 成片像素渲染（纯 JS，零依赖，零新原生模块）
 *
 * 顺序（与 `_v200_render_ref.py` / README §51.4 一致）：
 *   1. LUT     33³ 三线性查表（真胶片色彩，`lut3d.ts`）
 *   2. halation 高光阈值 → 降采样 box 模糊 → 暖红 screen 叠加（胶片乳剂层间的光晕）
 *   3. vignette 径向 cos⁴ 近似衰减（镜头/画幅边缘失光）
 *   4. grain    确定性哈希颗粒，中间调最强，双八度（细 + 粗团簇）
 *
 * 为什么放在 JS 里做：没有可用的原生图像库（不新增依赖），而 `expo-gl`/Skia 不可用；
 * 纯 JS 整数像素运算在 Hermes 上 3.1MP 约 1s 内，配合成片弹层的进度提示可以接受。
 *
 * 所有函数都原地改 `rgba`（Uint8ClampedArray 语义用 Uint8Array + 手动 clamp）。
 */

import {
  GRAIN_COARSE_WEIGHT,
  GRAIN_FINE_WEIGHT,
  GRAIN_SHADOW_BIAS,
  HALATION_BLUR_PASSES,
  HALATION_COLOR,
  HALATION_DOWNSCALE_TARGET,
  HALATION_RADIUS_DS,
  HALATION_THRESHOLD,
  LUT_SIZE,
  VIGNETTE_EXPONENT,
  grainAmplitudeFor,
  halationFor,
  vignetteStrengthFor,
} from '../constants/filmRender';
import { applyLut3DInPlace, Lut3D } from './lut3d';

/** 渲染阶段（成片弹层用它显示进度文案） */
export type FilmRenderStage = 'lut' | 'halation' | 'vignette' | 'grain' | 'done';

export interface FilmRenderOptions {
  lut: Lut3D;
  /** halation 强度（0..0.3，见 `halationFor`） */
  halation: number;
  /** 暗角强度（0..0.42，见 `vignetteStrengthFor`） */
  vignette: number;
  /** 颗粒幅度（0..0.18，见 `grainAmplitudeFor`；0 = 不撒颗粒） */
  grain: number;
  /** 颗粒种子：同一卷同一张照片固定，保证导出可复现 */
  seed: number;
  /** 阶段进度回调（可选，用于 UI 文案） */
  onProgress?: (stage: FilmRenderStage) => void;
}

/**
 * 整帧渲染：`rgba` 必须是 width*height*4 的 RGBA 缓冲，原地修改。
 *
 * 输入应为「已经裁成画幅比例、归一化到成片分辨率」的照片（PNG 解码结果）。
 */
export function renderFilmFrame(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: FilmRenderOptions,
): void {
  if (rgba.length !== width * height * 4) {
    throw new Error(`renderFilmFrame: 缓冲长度 ${rgba.length} 与 ${width}x${height} 不匹配`);
  }
  if (options.lut.size !== LUT_SIZE) {
    throw new Error(`renderFilmFrame: LUT 尺寸应为 ${LUT_SIZE}，实际 ${options.lut.size}`);
  }

  const { onProgress } = options;

  applyLut3DInPlace(rgba, options.lut);
  if (onProgress) {
    onProgress('lut');
  }

  if (options.halation > 0) {
    applyHalation(rgba, width, height, options.halation);
  }
  if (onProgress) {
    onProgress('halation');
  }

  if (options.vignette > 0) {
    applyVignette(rgba, width, height, options.vignette);
  }
  if (onProgress) {
    onProgress('vignette');
  }

  if (options.grain > 0) {
    applyGrain(rgba, width, height, options.grain, options.seed);
  }
  if (onProgress) {
    onProgress('grain');
    onProgress('done');
  }
}

// ─────────────────────────────────────────────────────────────
// halation
// ─────────────────────────────────────────────────────────────

/**
 * 高光光晕：把高于阈值的高光提出来 → 降采样到长边 512 → 3 遍 box 模糊（等效 ~16px 全分辨率）
 * → 双线性放大 → warm screen 叠加。
 *
 * 降采样的目的：模糊半径是「光晕扩散范围」，物理上与分辨率无关，降采样后计算量降到 1/16。
 */
export function applyHalation(
  rgba: Uint8Array,
  width: number,
  height: number,
  strength: number,
): void {
  const ds = Math.max(1, Math.round(Math.max(width, height) / HALATION_DOWNSCALE_TARGET));
  const dw = Math.max(1, Math.ceil(width / ds));
  const dh = Math.max(1, Math.ceil(height / ds));

  // 1) 降采样 + 高光提取（每通道都保留，光晕颜色才不是死板的红）
  const bright = new Float32Array(dw * dh * 3);
  const invRange = 1 / (1 - HALATION_THRESHOLD);
  for (let y = 0; y < dh; y += 1) {
    const y0 = y * ds;
    const y1 = Math.min(height, y0 + ds);
    for (let x = 0; x < dw; x += 1) {
      const x0 = x * ds;
      const x1 = Math.min(width, x0 + ds);
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        let p = (yy * width + x0) * 4;
        for (let xx = x0; xx < x1; xx += 1) {
          sr += rgba[p];
          sg += rgba[p + 1];
          sb += rgba[p + 2];
          p += 4;
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const inv = 1 / (count * 255);
      const r = sr * inv;
      const g = sg * inv;
      const b = sb * inv;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let t = (luma - HALATION_THRESHOLD) * invRange;
      if (t <= 0) {
        t = 0;
      } else if (t > 1) {
        t = 1;
      }
      const q = (y * dw + x) * 3;
      bright[q] = r * t;
      bright[q + 1] = g * t;
      bright[q + 2] = b * t;
    }
  }

  // 2) 3 遍 box 模糊（可分离：先横后纵，滑窗求和）
  boxBlurFloat(bright, dw, dh, HALATION_RADIUS_DS, HALATION_BLUR_PASSES);

  // 3) 双线性放大 + warm screen
  const [wr, wg, wb] = HALATION_COLOR;
  const invDs = 1 / ds;
  for (let y = 0; y < height; y += 1) {
    const fy = Math.max(0, (y + 0.5) * invDs - 0.5);
    const y0 = Math.floor(fy);
    const y1 = Math.min(dh - 1, y0 + 1);
    const ty = fy - y0;
    const rowBase = (y * width) * 4;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.max(0, (x + 0.5) * invDs - 0.5);
      const x0 = Math.floor(fx);
      const x1 = Math.min(dw - 1, x0 + 1);
      const tx = fx - x0;
      const q00 = (y0 * dw + x0) * 3;
      const q01 = (y0 * dw + x1) * 3;
      const q10 = (y1 * dw + x0) * 3;
      const q11 = (y1 * dw + x1) * 3;
      const p = rowBase + x * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const top = bright[q00 + ch] * (1 - tx) + bright[q01 + ch] * tx;
        const bottom = bright[q10 + ch] * (1 - tx) + bright[q11 + ch] * tx;
        const bloom = (top * (1 - ty) + bottom * ty) * strength;
        if (bloom > 0.001) {
          const weight = ch === 0 ? wr : ch === 1 ? wg : wb;
          const add = bloom * weight;
          const src = rgba[p + ch];
          // screen: 1 − (1 − a)(1 − b)，在 0..255 上等价于 a + b − a*b/255
          const sum = src + add * 255;
          const mixed = sum - (src * add * 255) / 255;
          rgba[p + ch] = mixed > 255 ? 255 : mixed < 0 ? 0 : mixed;
        }
      }
    }
  }
}

/**
 * 3 通道 Float32 图像的可分离 box 模糊（滑窗求和，边缘 clamp）。
 * `radius` 为降采样空间里的半径；`passes` 遍依次横/纵，多遍近似高斯。
 */
function boxBlurFloat(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes: number,
): void {
  if (radius <= 0 || passes <= 0) {
    return;
  }
  const window = radius * 2 + 1;
  const invWindow = 1 / window;
  const temp = new Float32Array(data.length);

  for (let pass = 0; pass < passes; pass += 1) {
    // 横向
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let ch = 0; ch < 3; ch += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const x = k < 0 ? 0 : k >= width ? width - 1 : k;
          sum += data[(row + x) * 3 + ch];
        }
        for (let x = 0; x < width; x += 1) {
          temp[(row + x) * 3 + ch] = sum * invWindow;
          const outX = x - radius;
          const inX = x + radius + 1;
          const outClamped = outX < 0 ? 0 : outX >= width ? width - 1 : outX;
          const inClamped = inX >= width ? width - 1 : inX;
          sum += data[(row + inClamped) * 3 + ch] - data[(row + outClamped) * 3 + ch];
        }
      }
    }
    // 纵向
    for (let x = 0; x < width; x += 1) {
      for (let ch = 0; ch < 3; ch += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const y = k < 0 ? 0 : k >= height ? height - 1 : k;
          sum += temp[(y * width + x) * 3 + ch];
        }
        for (let y = 0; y < height; y += 1) {
          data[(y * width + x) * 3 + ch] = sum * invWindow;
          const outY = y - radius;
          const inY = y + radius + 1;
          const outClamped = outY < 0 ? 0 : outY >= height ? height - 1 : outY;
          const inClamped = inY >= height ? height - 1 : inY;
          sum += temp[(inClamped * width + x) * 3 + ch] - temp[(outClamped * width + x) * 3 + ch];
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// vignette
// ─────────────────────────────────────────────────────────────

/**
 * 暗角：半径平方按 `r2n = (x² + y²) / 2` 归一（中心 0、角 1），衰减 `1 − s·r2n^1.4`。
 * 幂函数先量化成 256 项查表（每像素只剩一次乘加，避免 3M 次 Math.pow）。
 */
export function applyVignette(
  rgba: Uint8Array,
  width: number,
  height: number,
  strength: number,
): void {
  const bins = 256;
  const table = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const r2 = i / (bins - 1);
    table[i] = 1 - strength * Math.pow(r2, VIGNETTE_EXPONENT);
  }

  const colX = new Float32Array(width);
  const spanX = width > 1 ? width - 1 : 1;
  for (let x = 0; x < width; x += 1) {
    const nx = (x / spanX) * 2 - 1;
    colX[x] = (nx * nx) / 2;
  }
  const spanY = height > 1 ? height - 1 : 1;

  for (let y = 0; y < height; y += 1) {
    const ny = (y / spanY) * 2 - 1;
    const rowY = (ny * ny) / 2;
    let p = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const r2 = colX[x] + rowY;
      let bin = (r2 * (bins - 1) + 0.5) | 0;
      if (bin < 0) {
        bin = 0;
      } else if (bin >= bins) {
        bin = bins - 1;
      }
      const factor = table[bin];
      rgba[p] = rgba[p] * factor;
      rgba[p + 1] = rgba[p + 1] * factor;
      rgba[p + 2] = rgba[p + 2] * factor;
      p += 4;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// grain
// ─────────────────────────────────────────────────────────────

/**
 * 颗粒：确定性哈希白噪（细）+ 2×2 聚合双线性放大（粗团簇），乘以亮度响应 4L(1−L)。
 *
 * 为什么要确定性：同一张照片重复渲染必须逐字节一致（门禁可复现、用户重试不闪）。
 * 幅度单位是 0..255 像素增量：mid 灰处 σ ≈ amplitude × 255 × 0.85 量级。
 */
export function applyGrain(
  rgba: Uint8Array,
  width: number,
  height: number,
  amplitude: number,
  seed: number,
): void {
  const cw = Math.max(1, (width + 1) >> 1);
  const chh = Math.max(1, (height + 1) >> 1);
  const coarse = new Float32Array(cw * chh);
  const coarseSeed = seed ^ 0x5f3759df;
  for (let y = 0; y < chh; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = y * cw + x;
      coarse[i] =
        (hashNoise(x * 2, y * 2, coarseSeed) +
          hashNoise(x * 2 + 1, y * 2, coarseSeed) +
          hashNoise(x * 2, y * 2 + 1, coarseSeed) +
          hashNoise(x * 2 + 1, y * 2 + 1, coarseSeed)) *
        0.25;
    }
  }

  const fineScale = amplitude * 255 * GRAIN_FINE_WEIGHT;
  const coarseScale = amplitude * 255 * GRAIN_COARSE_WEIGHT;

  for (let y = 0; y < height; y += 1) {
    const cyF = Math.max(0, y * 0.5 - 0.25);
    const cy0 = Math.min(chh - 1, cyF | 0);
    const cy1 = Math.min(chh - 1, cy0 + 1);
    const ty = cyF - cy0;
    let p = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const resp = 4 * luma * (1 - luma) * (1 - GRAIN_SHADOW_BIAS * luma);
      const cxF = Math.max(0, x * 0.5 - 0.25);
      const cx0 = Math.min(cw - 1, cxF | 0);
      const cx1 = Math.min(cw - 1, cx0 + 1);
      const tx = cxF - cx0;
      const top = coarse[cy0 * cw + cx0] * (1 - tx) + coarse[cy0 * cw + cx1] * tx;
      const bottom = coarse[cy1 * cw + cx0] * (1 - tx) + coarse[cy1 * cw + cx1] * tx;
      const coarseValue = top * (1 - ty) + bottom * ty;
      const noise = hashNoise(x, y, seed) * fineScale + coarseValue * coarseScale;
      const delta = noise * resp;
      if (delta !== 0) {
        const r2 = r + delta;
        const g2 = g + delta;
        const b2 = b + delta;
        rgba[p] = r2 < 0 ? 0 : r2 > 255 ? 255 : r2;
        rgba[p + 1] = g2 < 0 ? 0 : g2 > 255 ? 255 : g2;
        rgba[p + 2] = b2 < 0 ? 0 : b2 > 255 ? 255 : b2;
      }
      p += 4;
    }
  }
}

/**
 * 确定性哈希噪声：返回 [-1, 1)。
 * 用 imul 保证 32 位整数乘法（Hermes 上 `*` 会退化成浮点）。
 */
function hashNoise(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 362437)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}

/** 门禁用：暴露哈希给探针做「同输入同输出」断言 */
export function grainNoiseAt(x: number, y: number, seed: number): number {
  return hashNoise(x, y, seed);
}

// ─────────────────────────────────────────────────────────────
// preset → 渲染参数
// ─────────────────────────────────────────────────────────────

/**
 * 一卷在像素管线里要用的三个观感参数（v2.0.0 起不再是"图层列表"，而是数值）。
 *
 * 与 `FilmLookLayers` 的声明式图层一一对应：
 *   - halation ← 卷 id（`HALATION_BY_STOCK`）
 *   - vignette ← `preset.vignette`（预设自身暗角，0.16~0.3）
 *   - grain    ← `preset.grain`（v1.9.4 起就是用户颗粒档位的**绝对不透明度**，
 *                0/0.04/0.075/0.115/0.16；ek-100 无颗粒卷写死 0）
 */
export interface FilmLookParams {
  halation: number;
  vignette: number;
  grain: number;
}

/**
 * 预设 → 像素管线参数。纯函数，探针直接喂假预设断言映射。
 *
 * ⚠️ 这三个数就是"画面观感的全部自由度"：改这里等于改九卷长相，
 * 必须同步 `_v200_contract.md` §3 / README §51.5 / `_probe_v200_lut.cjs`。
 */
export function filmLookParamsFor(preset: {
  id: string;
  grain: number;
  vignette?: number;
}): FilmLookParams {
  return {
    halation: halationFor(preset.id),
    vignette: vignetteStrengthFor(preset.vignette ?? 0),
    grain: grainAmplitudeFor(preset.grain),
  };
}
