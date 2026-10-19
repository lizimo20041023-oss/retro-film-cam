/**
 * 3D LUT 查表（v2.0.1 · 全整型定点版）
 *
 * 数据结构刻意做成「扁平 Uint8Array」：
 *   `data[((rIndex * size + gIndex) * size + bIndex) * 3 + channel]`
 * 也就是 **r 最慢、b 最快**（= numpy C 序的 `lut[r, g, b, c]`），这样 Python 侧
 * `lut.reshape(-1, 3)` 直接就是同一串字节，生成与消费不会各说各话。
 *
 * LUT 资产以 PNG 图集形式随包（见 `src/constants/lutAtlas.ts` + `_v201_gen_atlas.py`）：
 * 33³ 表 = 35,937 个像素，排成 256×141 的 RGBA 图，角标 = 表下标；
 * 用包内已有的 `pngCodec.decodePng` 解出来再抽出 RGB 三个通道。
 *
 * ## v2.0.1 为什么多了 `buildLutSampler`
 *
 * v2.0.0 的内层循环用 `size³` 加法索引 + 三通道共用下标 + 每次乘 255 权重再除 16581375，
 * 在 Hermes（无 JIT）上是整条管线的瓶颈（实测 2.43MP 单趟 63~66ms，四趟合计 150ms+）。
 * v2.0.1 预编译成 `LutSampler`：
 *
 *   · 三个**通道平面** `rPlane/gPlane/bPlane`（各 35,937 字节，共 108KB，L1 友好）；
 *   · `i0/i1`（每个 8bit 输入对应的 LUT 下标，`Uint8Array`）与 `frac`（0~256 的
 *     `Uint16Array` 权重）；
 *   · 内层插值全部定点：`((v0·(256−f) + v1·f)·(256−g) + …) >> 16`，一次 `>>> 16` 出结果。
 *
 * 与浮点参考的误差 ≤1 个 8bit 级（`+32768` 四舍五入），和 LUT 自身的量化误差同量级。
 */
import type { PngImage } from './pngCodec';

/** 一卷的 3D LUT。`size` 是每轴采样数（33）。 */
export interface Lut3D {
  size: number;
  /** 长度 = size³ × 3，顺序 r,g,b。 */
  data: Uint8Array;
}

/** 预编译的 LUT 采样器（通道平面 + 下标/权重表）；`buildLutSampler` 按对象缓存。 */
export interface LutSampler {
  /** 每轴采样数（33）。 */
  size: number;
  /** R/G/B 三个通道平面，各 size³ 字节（下标 = r·size² + g·size + b）。 */
  rPlane: Uint8Array;
  gPlane: Uint8Array;
  bPlane: Uint8Array;
  /** 每个 8bit 输入值对应的下采样点 LUT 下标。 */
  i0: Uint8Array;
  /** 每个 8bit 输入值对应的上采样点 LUT 下标（端点时夹到 size−1）。 */
  i1: Uint8Array;
  /** 每个 8bit 输入值的小数权重（0~256 定点）。 */
  frac: Uint16Array;
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

const samplerCache = new WeakMap<Lut3D, LutSampler>();

/**
 * 把一卷 LUT 预编译成采样器（同一对象只算一次，WeakMap 缓存，不阻止 GC）。
 *
 * 下标表用 16bit 权重：`x = v·(size−1)/255`，`i0 = floor(x)`、`i1 = min(i0+1, size−1)`、
 * `frac = round((x−i0)·256)`（端点 255 → frac 256 会被夹成 255 吗？不会：x 恰为整数，
 * `frac = 0`，因此端点插值权重为 0、不会越界读取）。
 */
export function buildLutSampler(lut: Lut3D): LutSampler {
  const cached = samplerCache.get(lut);
  if (cached !== undefined) return cached;

  const { size, data } = lut;
  const count = size * size * size;
  if (size < 2) throw new Error(`lut3d: size 至少为 2（实际 ${size}）`);
  if (data.length !== count * 3) {
    throw new Error(`lut3d: 数据长度 ${data.length} 与 ${size}³×3 不符`);
  }

  const rPlane = new Uint8Array(count);
  const gPlane = new Uint8Array(count);
  const bPlane = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i += 1, p += 3) {
    rPlane[i] = data[p];
    gPlane[i] = data[p + 1];
    bPlane[i] = data[p + 2];
  }

  const i0 = new Uint8Array(256);
  const i1 = new Uint8Array(256);
  const frac = new Uint16Array(256);
  const scale = size - 1;
  for (let v = 0; v < 256; v += 1) {
    const x = (v * scale) / 255;
    let lo = Math.floor(x);
    if (lo < 0) lo = 0;
    if (lo > scale) lo = scale;
    const hi = lo + 1 <= scale ? lo + 1 : scale;
    i0[v] = lo;
    i1[v] = hi;
    frac[v] = Math.min(255, Math.round((x - lo) * 256));
  }

  const sampler: LutSampler = { size, rPlane, gPlane, bPlane, i0, i1, frac };
  samplerCache.set(lut, sampler);
  return sampler;
}

/** 定点 lerp：`(a·(256−f) + b·f) / 256`，四舍五入。 */
function lerpFixed(a: number, b: number, f: number): number {
  return (a * (256 - f) + b * f + 128) >>> 8;
}

/** 单点查表（测试/探针用；成片走整图版本）。与 `applyLut3DInPlace` 用**同一套整数运算**。 */
export function sampleLut3D(lut: Lut3D, r: number, g: number, b: number): [number, number, number] {
  const sampler = buildLutSampler(lut);
  const { size, rPlane, gPlane, bPlane, i0, i1, frac } = sampler;
  const sizeSq = size * size;
  const ri0 = i0[r];
  const ri1 = i1[r];
  const gi0 = i0[g];
  const gi1 = i1[g];
  const bi0 = i0[b];
  const bi1 = i1[b];
  const fr = frac[r];
  const fg = frac[g];
  const fb = frac[b];
  const base = ri0 * sizeSq + gi0 * size + bi0;
  const dR = (ri1 - ri0) * sizeSq;
  const dG = (gi1 - gi0) * size;
  const dB = bi1 - bi0;
  const c000 = base;
  const c001 = base + dB;
  const c010 = base + dG;
  const c011 = base + dG + dB;
  const c100 = base + dR;
  const c101 = base + dR + dB;
  const c110 = base + dR + dG;
  const c111 = base + dR + dG + dB;
  const out: [number, number, number] = [0, 0, 0];
  const planes = [rPlane, gPlane, bPlane];
  for (let ch = 0; ch < 3; ch += 1) {
    const plane = planes[ch];
    const x00 = lerpFixed(plane[c000], plane[c001], fb);
    const x01 = lerpFixed(plane[c010], plane[c011], fb);
    const x10 = lerpFixed(plane[c100], plane[c101], fb);
    const x11 = lerpFixed(plane[c110], plane[c111], fb);
    const y0 = lerpFixed(x00, x01, fg);
    const y1 = lerpFixed(x10, x11, fg);
    out[ch] = lerpFixed(y0, y1, fr);
  }
  return out;
}

/** 对整张 RGBA 图做 33³ 三线性查表，返回**新的** RGBA 缓冲（不改入参）。 */
export function applyLut3D(rgba: Uint8Array, lut: Lut3D): Uint8Array {
  const out = new Uint8Array(rgba);
  applyLut3DInPlace(out, lut);
  return out;
}

/**
 * 原地版本（成片管线的兜底/探针用）：把表结果写回 `rgba`，省一次 12MB 的分配与拷贝。
 * 与 `sampleLut3D` / 单遍管线共用同一套定点运算。
 */
export function applyLut3DInPlace(rgba: Uint8Array, lut: Lut3D): void {
  const sampler = buildLutSampler(lut);
  const { size, rPlane, gPlane, bPlane, i0, i1, frac } = sampler;
  const sizeSq = size * size;
  for (let p = 0; p < rgba.length; p += 4) {
    const ri0 = i0[rgba[p]];
    const ri1 = i1[rgba[p]];
    const gi0 = i0[rgba[p + 1]];
    const gi1 = i1[rgba[p + 1]];
    const bi0 = i0[rgba[p + 2]];
    const bi1 = i1[rgba[p + 2]];
    const fr = frac[rgba[p]];
    const fg = frac[rgba[p + 1]];
    const fb = frac[rgba[p + 2]];
    const base = ri0 * sizeSq + gi0 * size + bi0;
    const dR = (ri1 - ri0) * sizeSq;
    const dG = (gi1 - gi0) * size;
    const dB = bi1 - bi0;
    const c000 = base;
    const c001 = base + dB;
    const c010 = base + dG;
    const c011 = base + dG + dB;
    const c100 = base + dR;
    const c101 = base + dR + dB;
    const c110 = base + dR + dG;
    const c111 = base + dR + dG + dB;
    const x00 = lerpFixed(rPlane[c000], rPlane[c001], fb);
    const x01 = lerpFixed(rPlane[c010], rPlane[c011], fb);
    const x10 = lerpFixed(rPlane[c100], rPlane[c101], fb);
    const x11 = lerpFixed(rPlane[c110], rPlane[c111], fb);
    const y0 = lerpFixed(x00, x01, fg);
    const y1 = lerpFixed(x10, x11, fg);
    rgba[p] = lerpFixed(y0, y1, fr);

    const gx00 = lerpFixed(gPlane[c000], gPlane[c001], fb);
    const gx01 = lerpFixed(gPlane[c010], gPlane[c011], fb);
    const gx10 = lerpFixed(gPlane[c100], gPlane[c101], fb);
    const gx11 = lerpFixed(gPlane[c110], gPlane[c111], fb);
    const gy0 = lerpFixed(gx00, gx01, fg);
    const gy1 = lerpFixed(gx10, gx11, fg);
    rgba[p + 1] = lerpFixed(gy0, gy1, fr);

    const bx00 = lerpFixed(bPlane[c000], bPlane[c001], fb);
    const bx01 = lerpFixed(bPlane[c010], bPlane[c011], fb);
    const bx10 = lerpFixed(bPlane[c100], bPlane[c101], fb);
    const bx11 = lerpFixed(bPlane[c110], bPlane[c111], fb);
    const by0 = lerpFixed(bx00, bx01, fg);
    const by1 = lerpFixed(bx10, bx11, fg);
    rgba[p + 2] = lerpFixed(by0, by1, fr);
  }
}
