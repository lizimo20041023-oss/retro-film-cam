import type { LutStockId } from '../constants/filmRender';
import type { Lut3D } from './lut3d';

/**
 * 一卷胶片不应只是白平衡偏移。这里把每卷的趾部、肩部、反差、通道串色和
 * 阴影/高光染色烘进 33³ LUT。处理只在某卷第一次载入时运行约 3.6 万次，
 * 拍照的逐像素热路径仍然只查一张 LUT，不增加持续发热。
 */
interface FilmPersonality {
  readonly gamma: number;
  readonly contrast: number;
  readonly black: number;
  readonly white: number;
  readonly saturation: number;
  /** Red, yellow, green, cyan, blue, magenta sensitivity, baked once into the LUT. */
  readonly hueSaturation: readonly [number, number, number, number, number, number];
  /** Optional hue-selective density: keeps a blue sky deep without tinting skin. */
  readonly hueExposure?: readonly [number, number, number, number, number, number];
  readonly matrix: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
  readonly shadows: readonly [number, number, number];
  readonly highlights: readonly [number, number, number];
  readonly monoMix?: readonly [number, number, number];
  readonly grainScale: number;
}

const IDENTITY_MATRIX: FilmPersonality['matrix'] = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

const FILM_PERSONALITIES: Record<LutStockId, FilmPersonality> = {
  'um-400': {
    gamma: 1.02,
    contrast: 0.42,
    black: 0.008,
    white: 0.985,
    saturation: 0.94,
    hueSaturation: [1.1, 0.98, 0.82, 0.9, 1.04, 0.96],
    matrix: [1.07, -0.04, -0.03, -0.015, 1.04, -0.025, 0.025, -0.015, 0.99],
    shadows: [-0.034, -0.005, 0.034],
    highlights: [0.035, 0.018, -0.015],
    grainScale: 0.9,
  },
  'gd-200': {
    gamma: 0.88,
    contrast: 0.07,
    black: 0.03,
    white: 0.99,
    saturation: 0.97,
    hueSaturation: [1.05, 1.08, 0.82, 0.72, 0.74, 0.95],
    matrix: [1.09, 0, -0.045, 0.01, 1.03, -0.025, -0.025, 0, 0.94],
    shadows: [0.035, 0.015, -0.025],
    highlights: [0.05, 0.025, -0.04],
    grainScale: 0.65,
  },
  'pt-400': {
    gamma: 0.84,
    contrast: -0.28,
    black: 0.075,
    white: 0.99,
    saturation: 0.86,
    hueSaturation: [1.08, 0.9, 0.88, 0.95, 0.85, 1.08],
    matrix: [1.04, 0.01, -0.02, -0.015, 1, 0.015, 0.015, 0.005, 0.985],
    shadows: [0.004, 0.016, 0.018],
    highlights: [0.04, 0.012, -0.012],
    grainScale: 0.5,
  },
  'cp-200': {
    gamma: 1.01,
    contrast: 0.25,
    black: 0.035,
    white: 0.94,
    saturation: 0.75,
    hueSaturation: [1.03, 1.02, 0.62, 0.75, 0.62, 0.87],
    matrix: [1.095, 0.01, -0.045, 0.018, 1.04, -0.045, -0.03, 0, 0.93],
    shadows: [0.025, 0.01, -0.025],
    highlights: [0.04, 0.023, -0.03],
    grainScale: 0.8,
  },
  'fj-400': {
    gamma: 0.9,
    contrast: -0.12,
    black: 0.035,
    white: 0.985,
    saturation: 0.94,
    hueSaturation: [0.9, 0.86, 1.07, 1.1, 0.94, 0.88],
    matrix: [0.955, 0.018, -0.008, -0.035, 1.065, 0.01, -0.025, 0.045, 1.02],
    shadows: [-0.035, 0.024, 0.01],
    highlights: [-0.016, 0.005, 0.032],
    grainScale: 0.58,
  },
  'fg-400': {
    // Consumer-negative separation: cyan-green toe, faint magenta shoulder,
    // firm contrast and restrained color. Greens have their own density.
    gamma: 1.02,
    contrast: 0.32,
    black: 0.014,
    white: 0.97,
    saturation: 0.83,
    hueSaturation: [1.08, 0.92, 0.84, 0.91, 0.86, 0.96],
    hueExposure: [1, 1, 0.91, 0.97, 1, 1],
    matrix: [1.035, -0.01, -0.025, -0.025, 1.055, -0.005, -0.015, 0.025, 1.015],
    shadows: [-0.033, 0.025, 0.018],
    highlights: [0.032, -0.014, 0.024],
    grainScale: 0.83,
  },
  'ek-100': {
    gamma: 1.05,
    contrast: 0.38,
    black: 0.002,
    white: 0.995,
    saturation: 1.15,
    hueSaturation: [1.02, 1.02, 1.06, 1.06, 1.08, 1.04],
    matrix: [1.0375, -0.0175, -0.01, -0.0125, 1.0375, -0.0075, -0.005, -0.0175, 1.0425],
    shadows: [-0.008, 0.002, 0.012],
    highlights: [0.004, 0.006, 0.012],
    grainScale: 0,
  },
  'rb-100': {
    // Positive-film density with a selective blue/cyan sky response. Warm
    // subjects stay warm; there is deliberately no blanket blue wash.
    gamma: 0.9,
    contrast: 0.34,
    black: 0.008,
    white: 0.985,
    saturation: 1.2,
    hueSaturation: [1.07, 1.04, 0.95, 1.18, 1.26, 1.06],
    hueExposure: [1, 1, 0.98, 0.83, 0.68, 1],
    matrix: [1.04, -0.02, -0.02, -0.01, 0.98, 0.03, -0.01, 0.02, 0.99],
    shadows: [-0.005, 0.002, 0.014],
    highlights: [0.013, 0.009, -0.006],
    grainScale: 0.45,
  },
  'cs-800t': {
    gamma: 1.1,
    contrast: 0.28,
    black: 0.003,
    white: 0.97,
    saturation: 0.96,
    hueSaturation: [1.1, 1, 0.72, 0.9, 1.12, 0.92],
    matrix: [1.02, -0.02, -0.04, -0.025, 1.015, 0, -0.04, 0.035, 1.12],
    shadows: [-0.052, -0.012, 0.075],
    highlights: [0.055, 0.027, -0.032],
    grainScale: 1,
  },
  'hp-400': {
    gamma: 0.94,
    contrast: -0.08,
    black: 0.045,
    white: 0.96,
    saturation: 0,
    hueSaturation: [1, 1, 1, 1, 1, 1],
    matrix: IDENTITY_MATRIX,
    shadows: [0, 0, 0],
    highlights: [0, 0, 0],
    monoMix: [0.24, 0.67, 0.09],
    grainScale: 0.85,
  },
  'tx-400': {
    gamma: 1.08,
    contrast: 0.52,
    black: 0,
    white: 0.955,
    saturation: 0,
    hueSaturation: [1, 1, 1, 1, 1, 1],
    matrix: IDENTITY_MATRIX,
    shadows: [0, 0, 0],
    highlights: [0, 0, 0],
    monoMix: [0.34, 0.56, 0.1],
    grainScale: 1,
  },
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Film dye layers respond differently to foliage, skin, and sky. Evaluate this
 * only while building the 33³ LUT; the full-size photo still uses one lookup.
 * Fade the sector correction around neutral colors so near-grey skies and skin
 * shadows cannot jump between hue sectors as exposure changes by one byte.
 */
function hueResponse(
  r: number,
  g: number,
  b: number,
  responseBySector: readonly [number, number, number, number, number, number],
): number {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const chroma = hi - lo;
  if (chroma < 0.025) return 1;
  let sector: number;
  if (hi === r) sector = ((g - b) / chroma + 6) % 6;
  else if (hi === g) sector = (b - r) / chroma + 2;
  else sector = (r - g) / chroma + 4;
  const first = Math.floor(sector) % 6;
  const blend = sector - Math.floor(sector);
  const response = responseBySector[first] * (1 - blend)
    + responseBySector[(first + 1) % 6] * blend;
  return 1 + (response - 1) * smoothstep(0.025, 0.16, chroma);
}

function toneLuma(value: number, profile: FilmPersonality): number {
  const gammaValue = Math.pow(clamp01(value), profile.gamma);
  const amount = 1 + profile.contrast;
  const contrasted = gammaValue < 0.5
    ? 0.5 * Math.pow(gammaValue * 2, amount)
    : 1 - 0.5 * Math.pow((1 - gammaValue) * 2, amount);
  return profile.black + clamp01(contrasted) * (profile.white - profile.black);
}

function isStockId(stockId: string): stockId is LutStockId {
  return Object.prototype.hasOwnProperty.call(FILM_PERSONALITIES, stockId);
}

/** 把胶片人格一次性烘进 LUT；返回新表，不改生成资产。 */
export function applyFilmPersonalityToLut(lut: Lut3D, stockId: string): Lut3D {
  if (!isStockId(stockId)) return lut;
  const profile = FILM_PERSONALITIES[stockId];
  const source = lut.data;
  const data = new Uint8Array(source.length);
  const m = profile.matrix;

  for (let i = 0; i < source.length; i += 3) {
    const sourceR = source[i] / 255;
    const sourceG = source[i + 1] / 255;
    const sourceB = source[i + 2] / 255;

    if (profile.monoMix !== undefined) {
      const mono = sourceR * profile.monoMix[0]
        + sourceG * profile.monoMix[1]
        + sourceB * profile.monoMix[2];
      const value = Math.round(clamp01(toneLuma(mono, profile)) * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      continue;
    }

    const mixedR = sourceR * m[0] + sourceG * m[1] + sourceB * m[2];
    const mixedG = sourceR * m[3] + sourceG * m[4] + sourceB * m[5];
    const mixedB = sourceR * m[6] + sourceG * m[7] + sourceB * m[8];
    const luma = clamp01(mixedR * 0.2126 + mixedG * 0.7152 + mixedB * 0.0722);
    const density = profile.hueExposure === undefined
      ? 1
      : hueResponse(mixedR, mixedG, mixedB, profile.hueExposure);
    const tone = clamp01(toneLuma(luma, profile) * density);
    const saturation = profile.saturation
      * hueResponse(mixedR, mixedG, mixedB, profile.hueSaturation);
    const shadowWeight = 1 - smoothstep(0.12, 0.62, tone);
    const highlightWeight = smoothstep(0.48, 0.94, tone);

    let red = tone + (mixedR - luma) * saturation
      + profile.shadows[0] * shadowWeight + profile.highlights[0] * highlightWeight;
    let green = tone + (mixedG - luma) * saturation
      + profile.shadows[1] * shadowWeight + profile.highlights[1] * highlightWeight;
    let blue = tone + (mixedB - luma) * saturation
      + profile.shadows[2] * shadowWeight + profile.highlights[2] * highlightWeight;

    /*
     * 反转片的高饱和色不能靠逐通道硬裁切，否则霓虹、花朵和蓝天会被压成色块。
     * 这里只在 LUT 首次烘焙时，以 tone 为轴等比例收短 RGB 色度向量：色相不变，
     * 并给 8-bit 量化各留一级头房。轻微软膝让刚触边的颜色不会突然贴死边界。
     */
    if (stockId === 'ek-100') {
      const gamutLow = 1 / 255;
      const gamutHigh = 254 / 255;
      const deltaR = red - tone;
      const deltaG = green - tone;
      const deltaB = blue - tone;
      let gamutScale = 1;
      const limitDelta = (delta: number): void => {
        if (delta > 0) gamutScale = Math.min(gamutScale, (gamutHigh - tone) / delta);
        else if (delta < 0) gamutScale = Math.min(gamutScale, (tone - gamutLow) / -delta);
      };
      limitDelta(deltaR);
      limitDelta(deltaG);
      limitDelta(deltaB);
      if (gamutScale < 1) {
        const safeScale = Math.max(0, gamutScale) * (0.9 + Math.max(0, gamutScale) * 0.1);
        red = tone + deltaR * safeScale;
        green = tone + deltaG * safeScale;
        blue = tone + deltaB * safeScale;
      }
    }

    data[i] = Math.round(clamp01(red) * 255);
    data[i + 1] = Math.round(clamp01(green) * 255);
    data[i + 2] = Math.round(clamp01(blue) * 255);
  }

  return { size: lut.size, data };
}

/** 同一全局颗粒档下，不同乳剂仍有不同的银盐颗粒量。 */
export function filmGrainScaleFor(stockId: string | undefined): number {
  if (stockId === undefined || !isStockId(stockId)) return 1;
  return FILM_PERSONALITIES[stockId].grainScale;
}
