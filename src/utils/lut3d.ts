/**
 * 3D LUT 查表（v2.0.0 · 真 LUT 成片管线的像素级核心）。
 *
 * 数据结构刻意做成「扁平 Uint8Array」：
 *   `data[((rIndex * size + gIndex) * size + bIndex) * 3 + channel]`
 * 也就是 **r 最慢、b 最快**（= numpy C 序的 `lut[r, g, b, c]`），这样 Python 侧
 * `lut.reshape(-1, 3)` 直接就是同一串字节，生成与消费不会各说各话。
 *
 * LUT 资产以 PNG 图集形式随包（见 `src/constants/lutAtlas.ts` + `scripts/gen_lut_atlas.py`）：
 * 33³ 表 = 35,937 个像素，排成 256×141 的 RGBA 图，角标 = 表下标；
 * 用包内已有的 `pngCodec.decodePng` 解出来再抽出 RGB 三个通道 —— 比 base64 原始字节
 * 小 5 倍（189KB vs 1.26MB），而解码只在第一次用到某卷时发生一次。
 */
import type { PngImage } from './pngCodec';

/** 一卷的 3D LUT。`size` 是每轴采样数（33）。 */
export interface Lut3D {
  size: number;
  /** 长度 = size³ × 3，顺序 r,g,b。 */
  data: Uint8Array;
}

/**
 * 从图集 PNG 里抽出 LUT 字节。
 *
 * 图集约定：第 i 个像素（行主序）= 表第 i 项，像素的 R/G/B 即该表项输出；
 * alpha 不用（生成时写 255）。图集多出来的像素直接忽略。
 */
export function extractLutFromAtlas(image: PngImage, size: number): Lut3D {
  const count = size * size * size;
  if (image.rgba.length < count * 4) {
    throw new Error(`lutAtlas: 像素不足（需要 ${count}，实际 ${image.rgba.length / 4}）`);
  }
  const data = new Uint8Array(count * 3);
  for (let i = 0, src = 0, dst = 0; i < count; i += 1, src += 4, dst += 3) {
    data[dst] = image.rgba[src];
    data[dst + 1] = image.rgba[src + 1];
    data[dst + 2] = image.rgba[src + 2];
  }
  return { size, data };
}

let cachedChannelTable: { size: number; i0: Uint8Array; i1: Uint8Array; frac: Uint8Array } | null =
  null;

/**
 * 预计算每个 8bit 输入值的「下采样点 / 上采样点 / 小数权重」。
 * 三线性插值里 90% 的 CPU 花在这三个表上，提前算好就能把内层循环写成纯整数运算。
 */
function channelTable(size: number): {
  i0: Uint8Array;
  i1: Uint8Array;
  frac: Uint8Array;
} {
  if (cachedChannelTable !== null && cachedChannelTable.size === size) return cachedChannelTable;
  const i0 = new Uint8Array(256);
  const i1 = new Uint8Array(256);
  const frac = new Uint8Array(256);
  const scale = size - 1;
  for (let v = 0; v < 256; v += 1) {
    const x = (v * scale) / 255;
    const lo = Math.floor(x);
    const hi = lo + 1 <= scale ? lo + 1 : scale;
    i0[v] = lo;
    i1[v] = hi;
    frac[v] = Math.min(255, Math.round((x - lo) * 255));
  }
  cachedChannelTable = { size, i0, i1, frac };
  return cachedChannelTable;
}

/**
 * 对整张 RGBA 图做 33³ 三线性查表，返回**新的** RGBA 缓冲（不改入参）。
 *
 * 用整数 lerp（权重 0..255，`(a*(255-f) + b*f) / 255 ≈ (a*(255-f)+b*f)>>8` 的近似）
 * 而不是浮点：Hermes 上整数通道快约 2 倍，而误差 ≤1/255 —— 与 8bit LUT 本身的量化
 * 误差同量级，肉眼不可见。
 *
 * 一次处理一整张：3.1MP 在 Hermes 上约 0.3–0.6s，正好落在「显影」遮罩的等待预算内。
 */
export function applyLut3D(rgba: Uint8Array, lut: Lut3D): Uint8Array {
  const out = new Uint8Array(rgba);
  applyLut3DInPlace(out, lut);
  return out;
}

/**
 * 原地版本（成片管线用）：直接把表结果写回 `rgba`，省一次 12MB 的分配与拷贝。
 * 与 `applyLut3D` 共用同一套整数运算（探针逐字节比对两者）。
 */
export function applyLut3DInPlace(rgba: Uint8Array, lut: Lut3D): void {
  const { size, data } = lut;
  const { i0, i1, frac } = channelTable(size);
  const sizeSq = size * size;
  const stride = sizeSq * 3;
  const rStride = stride;

  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const r0 = i0[r] * rStride;
    const r1 = i1[r] * rStride;
    const g0 = i0[g] * size * 3;
    const g1 = i1[g] * size * 3;
    const b0 = i0[b] * 3;
    const b1 = i1[b] * 3;
    const fr = frac[r];
    const fg = frac[g];
    const fb = frac[b];
    const ifr = 255 - fr;
    const ifg = 255 - fg;
    const ifb = 255 - fb;

    const c000 = r0 + g0 + b0;
    const c001 = r0 + g0 + b1;
    const c010 = r0 + g1 + b0;
    const c011 = r0 + g1 + b1;
    const c100 = r1 + g0 + b0;
    const c101 = r1 + g0 + b1;
    const c110 = r1 + g1 + b0;
    const c111 = r1 + g1 + b1;

    for (let ch = 0; ch < 3; ch += 1) {
      const v000 = data[c000 + ch];
      const v001 = data[c001 + ch];
      const v010 = data[c010 + ch];
      const v011 = data[c011 + ch];
      const v100 = data[c100 + ch];
      const v101 = data[c101 + ch];
      const v110 = data[c110 + ch];
      const v111 = data[c111 + ch];
      const x00 = v000 * ifb + v001 * fb;
      const x01 = v010 * ifb + v011 * fb;
      const x10 = v100 * ifb + v101 * fb;
      const x11 = v110 * ifb + v111 * fb;
      const y0 = x00 * ifg + x01 * fg;
      const y1 = x10 * ifg + x11 * fg;
      const z = y0 * ifr + y1 * fr;
      rgba[p + ch] = (z / 16581375) | 0;
    }
  }
}

/** 单点查表（测试/探针用；成片走整图版本）。与 `applyLut3D` 用**同一套整数运算**，逐值可比。 */
export function sampleLut3D(lut: Lut3D, r: number, g: number, b: number): [number, number, number] {
  const { size, data } = lut;
  const table = channelTable(size);
  const r0 = table.i0[r] * size * size * 3;
  const r1 = table.i1[r] * size * size * 3;
  const g0 = table.i0[g] * size * 3;
  const g1 = table.i1[g] * size * 3;
  const b0 = table.i0[b] * 3;
  const b1 = table.i1[b] * 3;
  const fr = table.frac[r];
  const fg = table.frac[g];
  const fb = table.frac[b];
  const ifr = 255 - fr;
  const ifg = 255 - fg;
  const ifb = 255 - fb;
  const result: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const v000 = data[r0 + g0 + b0 + ch];
    const v001 = data[r0 + g0 + b1 + ch];
    const v010 = data[r0 + g1 + b0 + ch];
    const v011 = data[r0 + g1 + b1 + ch];
    const v100 = data[r1 + g0 + b0 + ch];
    const v101 = data[r1 + g0 + b1 + ch];
    const v110 = data[r1 + g1 + b0 + ch];
    const v111 = data[r1 + g1 + b1 + ch];
    const x00 = v000 * ifb + v001 * fb;
    const x01 = v010 * ifb + v011 * fb;
    const x10 = v100 * ifb + v101 * fb;
    const x11 = v110 * ifb + v111 * fb;
    const y0 = x00 * ifg + x01 * fg;
    const y1 = x10 * ifg + x11 * fg;
    const z = y0 * ifr + y1 * fr;
    result[ch] = (z / 16581375) | 0;
  }
  return result;
}

export { channelTable as __channelTableForTest };
