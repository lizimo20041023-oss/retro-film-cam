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
    contrast: 0.3,
    black: 0.012,
    white: 0.965,
    saturation: 0.9,
    matrix: [1.05, -0.025, -0.025, -0.015, 1.035, -0.02, 0.025, -0.02, 0.995],
    shadows: [-0.016, 0.002, 0.022],
    highlights: [0.022, 0.012, -0.008],
    grainScale: 0.9,
  },
  'gd-200': {
    gamma: 0.96,
    contrast: 0.12,
    black: 0.018,
    white: 0.98,
    saturation: 0.96,
    matrix: [1.055, 0.01, -0.025, 0.005, 1.025, -0.02, -0.015, 0.005, 0.965],
    shadows: [0.018, 0.005, -0.018],
    highlights: [0.032, 0.018, -0.03],
    grainScale: 0.65,
  },
  'pt-400': {
    gamma: 0.9,
    contrast: -0.18,
    black: 0.045,
    white: 0.965,
    saturation: 0.78,
    matrix: [1.025, 0.015, -0.01, -0.01, 1.015, 0.005, 0.01, 0.01, 0.99],
    shadows: [-0.006, 0.008, 0.012],
    highlights: [0.026, 0.004, -0.004],
    grainScale: 0.5,
  },
  'cp-200': {
    gamma: 1,
    contrast: 0.18,
    black: 0.026,
    white: 0.945,
    saturation: 0.82,
    matrix: [1.07, 0.015, -0.025, 0.015, 1.005, -0.02, -0.02, 0.015, 0.94],
    shadows: [0.024, 0.006, -0.018],
    highlights: [0.032, 0.018, -0.026],
    grainScale: 0.8,
  },
  'fj-400': {
    gamma: 0.93,
    contrast: -0.04,
    black: 0.028,
    white: 0.975,
    saturation: 0.84,
    matrix: [0.97, 0.015, -0.005, -0.02, 1.045, 0.01, -0.005, 0.035, 1.015],
    shadows: [-0.018, 0.016, 0.018],
    highlights: [-0.012, 0.012, 0.02],
    grainScale: 0.58,
  },
  'ek-100': {
    gamma: 1.02,
    contrast: 0.3,
    black: 0.004,
    white: 0.99,
    saturation: 1.1,
    matrix: [1.0375, -0.0175, -0.01, -0.0125, 1.0375, -0.0075, -0.005, -0.0175, 1.0425],
    shadows: [-0.008, 0.002, 0.012],
    highlights: [0.004, 0.006, 0.012],
    grainScale: 0,
  },
  'cs-800t': {
    gamma: 1.04,
    contrast: 0.2,
    black: 0.012,
    white: 0.955,
    saturation: 0.92,
    matrix: [1.035, -0.015, -0.02, -0.02, 1.025, 0.005, -0.025, 0.025, 1.09],
    shadows: [-0.026, -0.006, 0.05],
    highlights: [0.035, 0.012, -0.022],
    grainScale: 1,
  },
  'hp-400': {
    gamma: 0.94,
    contrast: -0.08,
    black: 0.045,
    white: 0.96,
    saturation: 0,
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
    const tone = toneLuma(luma, profile);
    const shadowWeight = 1 - smoothstep(0.12, 0.62, tone);
    const highlightWeight = smoothstep(0.48, 0.94, tone);

    let red = tone + (mixedR - luma) * profile.saturation
      + profile.shadows[0] * shadowWeight + profile.highlights[0] * highlightWeight;
    let green = tone + (mixedG - luma) * profile.saturation
      + profile.shadows[1] * shadowWeight + profile.highlights[1] * highlightWeight;
    let blue = tone + (mixedB - luma) * profile.saturation
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
