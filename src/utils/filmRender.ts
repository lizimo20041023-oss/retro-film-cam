/**
 * 单遍真胶片像素管线（v2.0.1 重写）
 *
 * ## 为什么推倒 v2.0.0 的四趟实现
 *
 * v2.0.0 把「LUT → halation → vignette → grain」做成四趟独立整图遍历：每趟都要把
 * 12MB 的 RGBA 再读一遍，在 Hermes（无 JIT）上是 150ms+ 的量级；halation 那趟还带着
 * `boxBlurFloat` 的浮点模糊，是 v1.9.0「乳白 CCD 柔光雾」的同一族实现。
 *
 * v2.0.1 按用户红线（m02361 四组要求）重写为**一趟全分辨率循环**：
 *
 *   1. 输入先过 `gamma` 查找表（场景自适应托起暗部/中间调；中性场景是恒等）；
 *   2. 33³ LUT 三线性插值 —— **全整型定点**（`Uint8Array` 一维下标 + `>> 16` 插值），
 *      循环内零对象、零数组分配；
 *   3. 暗角 —— 257 项 16.16 定点乘数表 + 中心 70% smoothstep 平台（−0.25~−0.55 EV）；
 *   4. 颗粒 —— 2×2 团簇哈希噪声，`w = 4Y(1−Y)+0.15`，彩卷 0.85 : 1.0 : 1.15，
 *      强度是 0/9/18/30/44 的 8bit 像素幅度；
 *   5. halation —— **只在循环里记录「Luma ≥ 0.88」的像素**，循环结束后只对这些像素的
 *      5×5 邻域做**纯 R 通道**微扩散（G/B 一个字节都不碰）。没有全屏模糊、没有 screen 叠加，
 *      所以不可能再出白雾。
 *   6. 预设强度（v2.1.0 手术二）—— 在 ② 与 ③ 之间：LUT 输出与原图按 `intensityScale`
 *      （0.35~1.60）插值/外推，`out = orig + round((lut − orig) · intensity)`，全整型 Q16。
 *      暗角 EV / 颗粒幅度 / halation 幅度也乘同一个 intensity，再各自夹到
 *      `utils`→`constants/filmRender` 里的上下限。缺省 1 = 与 v2.0.1 逐字节相同。
 *
 * 阶段回调用 `'lut' → 'halation' → 'done'`：halation 是主循环之后的小收尾（只处理高光像素），
 * 报点跟着真实工作边界走，不编造中间态。
 *
 * ⚠️ v2.1.0 起**不再有"失败兜底成声明式图层"这条路**（用户 m03050 手术三）：像素管线
 * 抛错就一路抛到 `processFilmPhoto`，由它抛给调用方 —— 绝不静默返回原图。
 */
import type { SceneStats } from '../types';
import {
  GRAIN_PIXEL_EFFECTIVE_MAX,
  GRAIN_RGB_WEIGHTS,
  GRAIN_WEIGHT_FLOOR,
  GRAIN_WEIGHT_GAIN,
  HALATION_EFFECTIVE_MAX,
  HALATION_KERNEL,
  HALATION_RADIUS,
  HALATION_THRESHOLD,
  INTENSITY_NEUTRAL,
  SCENE_GAMMA_NEUTRAL,
  VIGNETTE_CENTER_PLATEAU,
  VIGNETTE_EV_MAX,
  VIGNETTE_EV_MIN,
  VIGNETTE_RADIUS_SCALE,
  grainPixelFor,
  halationFor,
  vignetteEvFor,
} from '../constants/filmRender';
import { clampIntensityScale } from '../constants/intensity';
import { buildLutSampler } from './lut3d';
import type { Lut3D, LutSampler } from './lut3d';
import { sceneGamma } from './adaptiveGrade';

/** 像素管线阶段（进度遮罩只关心「还在显影」；不报百分比）。 */
export type FilmRenderStage = 'lut' | 'halation' | 'done';

/** 一卷预设解析出来的像素参数（`renderFilmToFile` / 探针共用的唯一口径）。 */
export interface FilmLookParams {
  /** halation 强度 0~1（只有 cs-800t 0.22、um-400/gd-200 0.03，其余 0）。 */
  halation: number;
  /** 角部 EV magnitude（0 / 0.25~0.55），见 `vignetteEvFor`。 */
  vignette: number;
  /** 8bit 颗粒幅度（0 / 9 / 18 / 30 / 44），见 `grainPixelFor`。 */
  grain: number;
  /** 场景自适应输入 gamma（0.88~1.06，无场景时 1）。 */
  gamma: number;
  /** 黑白卷：颗粒三通道同步。 */
  mono: boolean;
  /**
   * 预设强度乘数（v2.1.0，0.35~1.60；缺省 1）。
   *
   * `filmLookParamsFor` 只给中性 1（预设数据里没有强度）；真正生效的值由
   * `filmLookWithIntensity` 算出、写回这里，所以 `RenderedFilmFile.params` 带的是
   * **实际生效**的那一份（日志/探针直接读，不用再乘一次）。
   */
  intensity: number;
}

/** `renderFilmFrame` 的入参。 */
export interface FilmRenderOptions {
  /** 33³ LUT；`null` = 恒等（兜底路径/探针）。 */
  lut: Lut3D | null;
  /** halation 强度 0~1（缺省 0）。 */
  halation: number;
  /** 角部 EV magnitude（0 = 不做暗角）。 */
  vignette: number;
  /** 8bit 颗粒幅度 0~44（0 = 无颗粒）。 */
  grain: number;
  /** 确定性种子：同一 seed + 同一输入 → 逐字节一致的输出。 */
  seed: number;
  /** 输入 gamma（缺省 1 = 恒等）。 */
  gamma?: number;
  /**
   * 预设强度乘数（v2.1.0，0.35~1.60；缺省 1 = 100%，逐字节等于 v2.0.1）。
   *
   * 生效方式（全整型）：LUT 输出与原图按 Q16 定点插值/外推；
   * 暗角 EV、颗粒幅度、halation 幅度乘同一个数后再夹 `VIGNETTE_EV_MIN/MAX`、
   * `GRAIN_PIXEL_EFFECTIVE_MAX`、`HALATION_EFFECTIVE_MAX`。
   */
  intensity?: number;
  /** 黑白卷：颗粒三通道用同一个 delta。 */
  mono?: boolean;
  /** 阶段回调（'lut' 开始 → 'halation' 收尾 → 'done'）。 */
  onProgress?: (stage: FilmRenderStage) => void;
}

/** 由预设解析像素管线参数（`scene` 用于自适应 gamma；`mono` 只影响颗粒通道权重）。 */
export function filmLookParamsFor(preset: {
  id: string;
  grain: number;
  vignette?: number;
  mono?: boolean;
  scene?: SceneStats | null;
}): FilmLookParams {
  return {
    halation: halationFor(preset.id),
    vignette: vignetteEvFor(preset.vignette ?? 0),
    grain: grainPixelFor(preset.grain),
    gamma: sceneGamma(preset.scene ?? null),
    mono: preset.mono === true,
    intensity: INTENSITY_NEUTRAL,
  };
}

/** 强度缩放后的三个观感量（`filmLookWithIntensity` 与 `renderFilmFrame` 共用的唯一实现）。 */
interface ScaledFilmLook {
  halation: number;
  vignette: number;
  grain: number;
  intensity: number;
}

/**
 * 把「基础观感量」乘上预设强度（v2.1.0 手术二）。
 *
 *   intensity 缺省 / 非法 → 1（`clampIntensityScale` 的口径：≤0 或非有限数回中性）；
 *   halation = clamp(base · intensity, 0, HALATION_EFFECTIVE_MAX)
 *   vignette = base <= 0 ? 0 : clamp(base · intensity, VIGNETTE_EV_MIN, VIGNETTE_EV_MAX)
 *   grain    = round(clamp(base · intensity, 0, GRAIN_PIXEL_EFFECTIVE_MAX))
 *
 * ⚠️ 暗角的 0.15 下限只对"本来就有暗角"的卷生效：预设 `vignette = 0` 的恒等用例
 * （v2.0.1 探针 S1.8/S1.31）不能被强度"无中生有"出一个暗角。
 */
function scaleFilmLook(
  halation: number,
  vignette: number,
  grain: number,
  intensity?: number,
): ScaledFilmLook {
  const scale = clampIntensityScale(intensity ?? INTENSITY_NEUTRAL);
  const baseHalation = Number.isFinite(halation) ? Math.min(1, Math.max(0, halation)) : 0;
  const baseVignette = Number.isFinite(vignette) ? Math.max(0, vignette) : 0;
  const baseGrain = Number.isFinite(grain) ? Math.min(255, Math.max(0, grain)) : 0;
  return {
    halation: Math.min(HALATION_EFFECTIVE_MAX, Math.max(0, baseHalation * scale)),
    vignette:
      baseVignette <= 0
        ? 0
        : Math.min(VIGNETTE_EV_MAX, Math.max(VIGNETTE_EV_MIN, baseVignette * scale)),
    grain: Math.round(Math.min(GRAIN_PIXEL_EFFECTIVE_MAX, Math.max(0, baseGrain * scale))),
    intensity: scale,
  };
}

/**
 * 预设基础参数 + 强度 → **实际生效**的 `FilmLookParams`。
 *
 * `RenderedFilmFile.params` 用它回报（日志里看到的就是像素里真正用的数）；
 * `renderFilmFrame` 内部也走同一个 `scaleFilmLook`，两处不会各算一套公式。
 */
export function filmLookWithIntensity(
  params: FilmLookParams,
  intensity?: number,
): FilmLookParams {
  const scaled = scaleFilmLook(params.halation, params.vignette, params.grain, intensity);
  return {
    halation: scaled.halation,
    vignette: scaled.vignette,
    grain: scaled.grain,
    gamma: params.gamma,
    mono: params.mono,
    intensity: scaled.intensity,
  };
}

/** 亮度权重（BT.601，0~255 定点）：0.299 / 0.587 / 0.114 → 77 / 150 / 29（和恰 256）。 */
const LUMA_R = 77;
const LUMA_G = 150;
const LUMA_B = 29;
const LUMA_SHIFT = 8;

/** halation 触发的 Luma 阈值（0~255 定点，`round(0.88 × 255) = 224`）。 */
const HALATION_LUMA_CUTOFF = Math.round(HALATION_THRESHOLD * 255);

/** 定点 lerp 的权重刻度（0~256）。 */
const LERP_ONE = 256;

/** 0~255 钳位。 */
function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

/**
 * 输入 gamma 查找表：`out = 255 · (v/255)^gamma`。
 *
 * gamma < 1 提亮暗部与中间调（暗光/逆光场景），gamma > 1 略压中间调（高调防过曝）。
 * 端点固定：0 → 0、255 → 255，所以不会动黑位/白场。
 */
function buildGammaWarp(gamma: number): Uint8Array | null {
  if (!Number.isFinite(gamma) || Math.abs(gamma - 1) < 1e-6) return null;
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    table[v] = clampByte(Math.round(255 * Math.pow(v / 255, gamma)));
  }
  table[0] = 0;
  table[255] = 255;
  return table;
}

/**
 * 暗角乘数表（257 项，16.16 定点）。
 *
 * 自变量是 `dx² + dy²` 的定点值：`dx² ∈ [0,1]` 按 `×128` 量化，两者的和落在 `[0, 256]`。
 * 于是内层循环只需要两次 `Uint8Array` 读 + 一次加法 + 一次表查找，**没有 sqrt、没有 pow**。
 *
 * 曲线：径向距离 ≤ 70% 平台（乘数恰 1）；之后 smoothstep 到角部的 `2^(−EV)`。
 */
function buildVignetteTable(evMagnitude: number): Uint32Array | null {
  if (!Number.isFinite(evMagnitude) || evMagnitude <= 0) return null;
  // 16.16 定点；用 Uint32Array 是因为「平台乘数恰为 1」要能存成 65536（Uint16 会溢出）。
  const table = new Uint32Array(257);
  for (let i = 0; i <= 256; i += 1) {
    const p = Math.sqrt(i / 256);
    let factor = 1;
    if (p > VIGNETTE_CENTER_PLATEAU) {
      const t = (p - VIGNETTE_CENTER_PLATEAU) / (1 - VIGNETTE_CENTER_PLATEAU);
      const smooth = t * t * (3 - 2 * t);
      factor = Math.pow(2, -evMagnitude * smooth);
    }
    table[i] = Math.round(factor * 65536);
  }
  return table;
}

/** 颗粒亮度权重表：`w(Y) = 4·Y·(1−Y) + 0.15`（Y = luma/255）。 */
function buildGrainWeightTable(): Float32Array {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const y = i / 255;
    table[i] = GRAIN_WEIGHT_GAIN * y * (1 - y) + GRAIN_WEIGHT_FLOOR;
  }
  return table;
}

/** 径向距离平方表：`round(((i − c)/c)² · 128)`，c = (n−1)/2。 */
function buildRadiusSquares(length: number): Uint8Array {
  const table = new Uint8Array(length);
  const center = (length - 1) / 2;
  if (center <= 0) return table;
  for (let i = 0; i < length; i += 1) {
    const d = (i - center) / center;
    table[i] = Math.min(VIGNETTE_RADIUS_SCALE, Math.round(d * d * VIGNETTE_RADIUS_SCALE));
  }
  return table;
}

/**
 * 2×2 团簇哈希噪声，返回 [-1, 1]。
 *
 * 同一团簇（`cx/cy` 相同）的 4 个像素取同一个值，颗粒才成「盐粒」；纯逐像素白噪在
 * 高分辨率下会被缩放糊成均匀灰。`seed` 进去抖一下，保证每张照片的颗粒不重复。
 */
export function hashNoise(cx: number, cy: number, seed: number): number {
  let h = Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cy, 0x165667b1) ^ seed;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2b);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/**
 * 渲染一帧：原地改写 `rgba`（长度 = width × height × 4，RGBA8888）。
 *
 * 这是成片的**唯一**像素处理入口：LUT、强度、暗角、颗粒在同一趟里完成，halation 只在
 * 主循环结束后对「已记录的高光像素」做一次 5×5 纯 R 扩散。任何阶段失败都直接抛错
 * （v2.1.0 起不再往声明式调色层兜底），由 `processFilmPhoto` 转成用户可见的失败提示。
 */
export function renderFilmFrame(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: FilmRenderOptions,
): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`filmRender: 非法尺寸 ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`filmRender: 缓冲长度 ${rgba.length} 与 ${width}×${height}×4 不符`);
  }

  // 强度（v2.1.0）：把 halation / 暗角 EV / 颗粒幅度一次算成「实际生效」的整型口径
  const look = scaleFilmLook(options.halation, options.vignette, options.grain, options.intensity);
  const halation = look.halation;
  const grain = look.grain;
  const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 0;
  const progress = options.onProgress;

  progress?.('lut');

  const sampler: LutSampler | null = options.lut === null ? null : buildLutSampler(options.lut);
  const warp = buildGammaWarp(options.gamma ?? 1);
  const vignette = buildVignetteTable(look.vignette);
  const grainWeight = grain > 0 ? buildGrainWeightTable() : null;
  /*
   * 强度定点（Q16）：0 = 中性（100%），循环里整段跳过 —— 这是"缺省逐字节等于 v2.0.1"
   * 的结构保证，不是靠浮点乘法碰巧算出同一个整数。
   */
  const intensityQ = look.intensity === INTENSITY_NEUTRAL ? 0 : Math.round(look.intensity * 65536);
  const radiusX = buildRadiusSquares(width);
  const radiusY = buildRadiusSquares(height);

  /** 九卷 LUT 的通道平面（局部常量，循环里直接按名字读，命中单态优化）。 */
  const lutR = sampler === null ? null : sampler.rPlane;
  const lutG = sampler === null ? null : sampler.gPlane;
  const lutB = sampler === null ? null : sampler.bPlane;
  const lutI0 = sampler === null ? null : sampler.i0;
  const lutI1 = sampler === null ? null : sampler.i1;
  const lutFrac = sampler === null ? null : sampler.frac;
  const lutSize = sampler === null ? 0 : sampler.size;
  const lutSizeSq = lutSize * lutSize;

  const blockShift = 1; // 2×2 团簇（GRAIN_CLUSTER_SIZE = 2）
  const blocksPerRow = (width + (1 << blockShift) - 1) >>> blockShift;
  const blockNoise = grain > 0 ? new Float32Array(Math.max(1, blocksPerRow)) : null;
  const mono = options.mono === true;
  const ampR = mono ? grain : grain * GRAIN_RGB_WEIGHTS[0];
  const ampG = grain;
  const ampB = mono ? grain : grain * GRAIN_RGB_WEIGHTS[2];

  /*
   * halation（用户红线②）：**半分辨率高光掩膜**。
   *
   * 为什么不在循环里直接对每个高光像素散 5×5：一张有天空/雪地的照片，Luma≥0.88 的
   * 像素能到几十万个，逐点散核就是 2500 万次写 —— 实测单这一项就 +80~180ms，
   * 是 v2.0.0 四趟实现里「慢」的主因之一。
   *
   * 现在只做两件事：
   *   ① 主循环里，命中阈值的像素把它超过阈值的比例累进 2×2 一格的小掩膜（一次写）；
   *   ② 循环结束后对这张 1/2 分辨率掩膜做可分离 5×5（与 `HALATION_KERNEL` 同一组权重），
   *      再一趟只加 **R 通道**。
   * 结果与"逐点散 5×5"在视觉上等价（软邻域略宽、强度守恒），但 G/B 一个字节都不碰，
   * 也绝没有全屏模糊 / screen 图层 —— 不可能再出 v1.9.0 的乳白柔光雾。
   */
  const halationOn = halation > 0;
  const maskShift = 1;
  const maskWidth = halationOn ? (width + (1 << maskShift) - 1) >>> maskShift : 0;
  const maskHeight = halationOn ? (height + (1 << maskShift) - 1) >>> maskShift : 0;
  const mask = halationOn ? new Float32Array(maskWidth * maskHeight) : null;
  const maskTmp = halationOn ? new Float32Array(maskWidth * maskHeight) : null;

  const total = width * height;
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    if (blockNoise !== null && (y & 1) === 0) {
      const cy = y >>> blockShift;
      for (let b = 0; b < blocksPerRow; b += 1) blockNoise[b] = hashNoise(b, cy, seed);
    }
    const dy = radiusY[y];
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      // ① 输入 gamma（暗光/逆光托起暗部与中间调；中性场景没有这张表）
      let r0 = rgba[o];
      let g0 = rgba[o + 1];
      let b0 = rgba[o + 2];
      if (warp !== null) {
        r0 = warp[r0];
        g0 = warp[g0];
        b0 = warp[b0];
      }

      // ② 33³ LUT 全整型三线性插值
      let red: number;
      let green: number;
      let blue: number;
      if (sampler === null) {
        red = r0;
        green = g0;
        blue = b0;
      } else {
        const i0 = lutI0 as Uint8Array;
        const i1 = lutI1 as Uint8Array;
        const fracTable = lutFrac as Uint16Array;
        const ri0 = i0[r0];
        const ri1 = i1[r0];
        const gi0 = i0[g0];
        const gi1 = i1[g0];
        const bi0 = i0[b0];
        const bi1 = i1[b0];
        const fr = fracTable[r0];
        const fg = fracTable[g0];
        const fb = fracTable[b0];
        const ifr = LERP_ONE - fr;
        const ifg = LERP_ONE - fg;
        const ifb = LERP_ONE - fb;
        const base = ri0 * lutSizeSq + gi0 * lutSize + bi0;
        const dR = (ri1 - ri0) * lutSizeSq;
        const dG = (gi1 - gi0) * lutSize;
        const dB = bi1 - bi0;
        const c000 = base;
        const c001 = base + dB;
        const c010 = base + dG;
        const c011 = base + dG + dB;
        const c100 = base + dR;
        const c101 = base + dR + dB;
        const c110 = base + dR + dG;
        const c111 = base + dR + dG + dB;
        const rp = lutR as Uint8Array;
        // R 通道（每一级都在 /256 之后落回 0~255，才不会把 8bit 值爆成 2^32 溢出）
        let v000 = rp[c000];
        let v001 = rp[c001];
        let v010 = rp[c010];
        let v011 = rp[c011];
        let v100 = rp[c100];
        let v101 = rp[c101];
        let v110 = rp[c110];
        let v111 = rp[c111];
        let x00 = (v000 * ifb + v001 * fb + 128) >>> 8;
        let x01 = (v010 * ifb + v011 * fb + 128) >>> 8;
        let x10 = (v100 * ifb + v101 * fb + 128) >>> 8;
        let x11 = (v110 * ifb + v111 * fb + 128) >>> 8;
        let y0 = (x00 * ifg + x01 * fg + 128) >>> 8;
        let y1 = (x10 * ifg + x11 * fg + 128) >>> 8;
        red = (y0 * ifr + y1 * fr + 128) >>> 8;
        // G 通道
        const gp = lutG as Uint8Array;
        v000 = gp[c000];
        v001 = gp[c001];
        v010 = gp[c010];
        v011 = gp[c011];
        v100 = gp[c100];
        v101 = gp[c101];
        v110 = gp[c110];
        v111 = gp[c111];
        x00 = (v000 * ifb + v001 * fb + 128) >>> 8;
        x01 = (v010 * ifb + v011 * fb + 128) >>> 8;
        x10 = (v100 * ifb + v101 * fb + 128) >>> 8;
        x11 = (v110 * ifb + v111 * fb + 128) >>> 8;
        y0 = (x00 * ifg + x01 * fg + 128) >>> 8;
        y1 = (x10 * ifg + x11 * fg + 128) >>> 8;
        green = (y0 * ifr + y1 * fr + 128) >>> 8;
        // B 通道
        const bp = lutB as Uint8Array;
        v000 = bp[c000];
        v001 = bp[c001];
        v010 = bp[c010];
        v011 = bp[c011];
        v100 = bp[c100];
        v101 = bp[c101];
        v110 = bp[c110];
        v111 = bp[c111];
        x00 = (v000 * ifb + v001 * fb + 128) >>> 8;
        x01 = (v010 * ifb + v011 * fb + 128) >>> 8;
        x10 = (v100 * ifb + v101 * fb + 128) >>> 8;
        x11 = (v110 * ifb + v111 * fb + 128) >>> 8;
        y0 = (x00 * ifg + x01 * fg + 128) >>> 8;
        y1 = (x10 * ifg + x11 * fg + 128) >>> 8;
        blue = (y0 * ifr + y1 * fr + 128) >>> 8;
      }

      // ②.5 预设强度（v2.1.0）：LUT 输出与「进 LUT 前的原图」插值/外推，全整型 Q16
      /*
       * `out = orig + round((lut − orig) · intensity)`，intensity 用 Q16 定点表示：
       *   · 整型乘 + `+32768 >> 16` 恰好等价于 `Math.round`（含负数：算术右移 = floor，
       *     floor(x + 0.5) 就是 JS 的 round 语义），单像素零分配；
       *   · intensity = 1 时整段被 `intensityQ === 0` 跳过，输出与 v2.0.1 逐字节相同；
       *   · intensity > 1 是外推（色相偏移/通道反差一起放大），< 1 是向原图回插。
       */
      if (intensityQ !== 0) {
        red = clampByte(r0 + (((red - r0) * intensityQ + 32768) >> 16));
        green = clampByte(g0 + (((green - g0) * intensityQ + 32768) >> 16));
        blue = clampByte(b0 + (((blue - b0) * intensityQ + 32768) >> 16));
      }

      // ③ 暗角：16.16 定点乘数（平台恰为 1.0 时逐字节不变），257 项表，无 sqrt/pow
      if (vignette !== null) {
        const mul = vignette[radiusX[x] + dy];
        red = (red * mul + 32768) >>> 16;
        green = (green * mul + 32768) >>> 16;
        blue = (blue * mul + 32768) >>> 16;
      }

      // ④ 颗粒：2×2 团簇、Y 权重、彩卷 0.85:1.0:1.15
      if (grainWeight !== null) {
        const luma = (red * LUMA_R + green * LUMA_G + blue * LUMA_B) >>> LUMA_SHIFT;
        const cluster = (blockNoise as Float32Array)[x >>> blockShift];
        const weight = (grainWeight as Float32Array)[luma];
        const baseDelta = cluster * weight;
        red = clampByte(red + ((baseDelta * ampR) | 0));
        green = clampByte(green + ((baseDelta * ampG) | 0));
        blue = clampByte(blue + ((baseDelta * ampB) | 0));
      }

      // ⑤ halation：只把高光比例累进半分辨率掩膜（真正的扩散在循环之后）
      if (mask !== null) {
        const luma = (red * LUMA_R + green * LUMA_G + blue * LUMA_B) >>> LUMA_SHIFT;
        if (luma >= HALATION_LUMA_CUTOFF) {
          const level = (luma - HALATION_LUMA_CUTOFF) / (255 - HALATION_LUMA_CUTOFF);
          mask[((y >>> maskShift) * maskWidth) + (x >>> maskShift)] += level;
        }
      }

      rgba[o] = red;
      rgba[o + 1] = green;
      rgba[o + 2] = blue;
      o += 4;
    }
  }

  // ⑥ halation：半分辨率掩膜 → 可分离 5×5 → 只加 R 通道（G/B 严格 0）
  if (mask !== null && maskTmp !== null) {
    progress?.('halation');
    const radius = HALATION_RADIUS;
    const span = radius * 2 + 1;
    const kernel = HALATION_KERNEL;
    // 水平可分离（权重取核的中央行）
    for (let y = 0; y < maskHeight; y += 1) {
      const row = y * maskWidth;
      for (let x = 0; x < maskWidth; x += 1) {
        let sum = 0;
        for (let k = 0; k < span; k += 1) {
          const sx = x + k - radius;
          if (sx < 0 || sx >= maskWidth) continue;
          sum += mask[row + sx] * kernel[radius * span + k];
        }
        maskTmp[row + x] = sum;
      }
    }
    // 垂直可分离（权重取核的中央列），顺便把「每格 2×2 像素的累加」归一化成均值
    for (let y = 0; y < maskHeight; y += 1) {
      for (let x = 0; x < maskWidth; x += 1) {
        let sum = 0;
        for (let k = 0; k < span; k += 1) {
          const sy = y + k - radius;
          if (sy < 0 || sy >= maskHeight) continue;
          sum += maskTmp[sy * maskWidth + x] * kernel[k * span + radius];
        }
        mask[y * maskWidth + x] = sum * 0.25;
      }
    }
    // 纯 R 叠加：按半分辨率最近邻取值（视觉上就是一圈软辉，不产生白雾）
    const strength = halation * 255;
    for (let y = 0; y < height; y += 1) {
      const maskRow = (y >>> maskShift) * maskWidth;
      let q = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const add = (mask[maskRow + (x >>> maskShift)] * strength) | 0;
        if (add > 0) {
          const value = rgba[q] + add;
          rgba[q] = value > 255 ? 255 : value;
        }
        q += 4;
      }
    }
  }

  progress?.('done');
}

/** 总和校验用的类型收窄（旧探针可能拿 `FilmRenderOptions['lut']` 当 `Lut3D` 用）。 */
export type { Lut3D };

/** v2.0.0 遗留的 `applyHalation` / `boxBlurFloat` 已彻底删除：用户红线②禁止任何全屏模糊光晕。 */
