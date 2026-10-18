/**
 * 五层同源胶片管线（v1.9.0 手术：同源叠加，不再平涂色块）
 *
 * ## 为什么整层重写
 *
 * v1.8.x 的 buildGradeLayers 是「一层一个色块」的平涂思路：色温一层、饱和一层、对比度一层、
 * 分区染色两层、S 曲线一层…… 这些 layer 用的都是**与照片无关的纯色**，靠 mixBlendMode 的
 * 数学往照片上糊。结果是照片本身的高光/暗部结构没有被胶片「放大」，只是被一张张色纸盖住，
 * 出来是数码味的平灰图 —— 用户 m07595 直接把这种观感否成「HDR 感 / 塑料感」。
 *
 * ## v1.9.0：同源五层
 *
 * 新的管线只做一件事 —— **把同一张底片用不同模糊半径和混合模式叠回它自己**：
 *
 *   1. 树脂柔焦 lens-softness   photo, blurRadius 1.2, normal    —— 镜头树脂/低通的轻微晕散
 *   2. 暗部压片 shadow-crush    photo, multiply                  —— 暗部按 Y² 压下去（黑要黑死）
 *   3. 高光溢出 highlight-bloom  photo, blurRadius 14, screen     —— 高光按 1-(1-Y)² 溢出（亮要亮炸）
 *   4. 暖红光晕 halation        color, screen, #FF4028            —— 高光边缘的暖红卤化光晕
 *   5. 化学染色 color 层        shadow-tint / highlight-tint      —— 暗部偏冷、高光偏暖的化学分离
 *
 * 其中 1~3 层是 `kind:'photo'` 的「同一张照片副本」（同源），4~5 层是允许的纯色层：光晕只做
 * 暖红扩散，染色只做化学分离，都不做「提对比/拉饱和」这类本该由照片自己决定的事。另有两层
 * 纹理层（颗粒/暗角）与可选的漏光层，它们是物理介质（片基/蒙版/漏光），不是调色。
 *
 * ### 为什么 multiply 是 Y²、screen 是 1-(1-Y)²
 *
 * 设照片某像素亮度 Y（0~1 的 gamma 编码值），把它自己的副本（同源）以 multiply 叠回自己：
 *     Y × Y = Y²
 * 暗部被平方级压深：Y=0.2 → 0.04（几乎黑死），Y=0.5 → 0.25。这正是胶片暗部「密度上来」的
 * 观感；而平涂色纸不管照片暗部多亮，压下去的量是常数，所以会糊成一片。
 *
 * 以 screen 叠回自己：
 *     Y + Y - Y² = 1 - (1-Y)²
 * 高光被平方级提亮：Y=0.8 → 0.96，Y=0.5 → 0.75；且 Y=1 时恒为 1（不切断白场）。胶片高光
 * 在乳剂层饱和后向周围卤化银扩散，表现为「亮部往外鼓」，数学上就是 screen 的二次方靠近 1。
 *
 * 先 blur 再 blend 的意义：blurRadius 决定「多少能量能从亮部漏进暗部」。blur 1.2 只做轻微
 * 晕散（树脂/低通），blur 14 把高光抽成一层大范围的柔光（halation 则是更大半径的暖红版）。
 *
 * ### 为什么 view-shot 截得到真实高斯模糊
 *
 * photo 层是 `<Image blurRadius>`（RN 给 GPU 的高斯模糊）+ 外层 View 的 mixBlendMode。
 * 拍摄链路 `processFilmPhoto → FilmCompositor → react-native-view-shot 的 drawViewHierarchy`
 * 是在**原生视图树**上截图（不是 JS 像素遍历），所以合成结果里带的是真正的逐像素高斯模糊与
 * 混合结果 —— 预览看到什么，成片就是什么。这也意味着管线里**不能用任何 JS 像素级调色**
 * （会 O(n) 卡死 JS 线程），只能用 RN/原生支持的层。
 *
 * ### live（取景器）面为什么不做 photo 层
 *
 * 取景器是 30~60fps 的实时合成。photo 层每帧都要跑一次全屏高斯模糊 + 混合，是纯粹烧 GPU/CPU
 * 的负载 —— v1.8.6 的「发热纪律」要求取景器只保留最便宜的色纸/纹理层。因此 live 面：
 *   · 滤掉所有 photo 层（树脂柔焦/暗部压片/高光溢出/光晕都不进 live）；
 *   · 滤掉颗粒纹理层（v1.8.3 起取景器不画颗粒）；
 *   · 丢弃 shadow-tint / highlight-tint 两条全屏染色层（用户 m05280 降发热）；
 *   · 只把 temperature / tint / halation 三条色纸层用 liveLookOpacity 压到 0.04~0.08 做「观感示意」；
 *   · mono 去色层保留 opacity 1（黑白卷的取景器必须当场看到黑白）。
 *
 * ### 自适应增量（见 adaptiveGrade.ts）
 *
 * 有场景统计时，planAdaptiveGrade 给出四场景增量，直接叠到本管线对应层 opacity 上：
 *   shadowCrush + shadowCrushDelta    （暗部场景为负：保持暗）
 *   highlightBloom + highlightBloomDelta
 *   shadowTintOpacity × separationScale
 *   highlightTintOpacity × separationScale × colorDensityScale
 *   vignette + vignetteDelta
 *   halation + halationDelta
 * 并全部 clamp（crush 0~0.72 / bloom 0~0.60 / tint 0~0.40 / halation 0~1）。
 * 场景不可用（scene == null 或样本不足）时 plan 为 null，层表与静态预设逐字节一致。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
import type { GradeLayer, ResolvedFilmPreset } from '../types';
import { applyAdaptiveColor, planAdaptiveGrade } from './adaptiveGrade';

/* ========================================================================== *
 * 冻结常量（v1.9.0 光学配方；探针按名字逐项核对，改数值必须同步改探针）
 * ========================================================================== */

/** 色温暖端色纸（overlay 提亮暖色）。 */
const WARM_OVERLAY = '#FF641A';
/** 色温冷端色纸（overlay 提亮冷色）。 */
const COOL_OVERLAY = '#1393FF';
/** 色调偏绿端色纸。 */
const TINT_GREEN = '#1AA81A';
/** 色调偏品红端色纸。 */
const TINT_MAGENTA = '#E657E6';
/** 真黑白去色载体（color 混合模式只取它 0 饱和度的色相）。 */
const NEUTRAL_GRAY = '#808080';
/** 卤化光晕的暖红载体（screen）。 */
const HALATION_RED = '#FF4028';

/** 树脂柔焦的高斯半径（px）。 */
export const LENS_SOFTNESS_BLUR_PX = 1.2;
/** 高光溢出的高斯半径（px）。 */
export const HIGHLIGHT_BLOOM_BLUR_PX = 14;
/** 暖红光晕的渲染上限系数：最浓 opacity = 0.18。 */
export const HALATION_RENDER_CAP = 0.18;

/** 色温层每 1.0 强度对应的 opacity（|temperature| × 0.38）。 */
const TEMPERATURE_GAIN = 0.38;
/** 色调层每 1.0 强度对应的 opacity（|tint| × 0.24）。 */
const TINT_GAIN = 0.24;

/** 自适应叠加后的压暗上限。 */
const SHADOW_CRUSH_MAX = 0.72;
/** 自适应叠加后的高光溢出上限。 */
const HIGHLIGHT_BLOOM_MAX = 0.6;
/** 化学染色层 opacity 上限（自适应缩放后）。 */
const TINT_OPACITY_MAX = 0.4;
/** 光晕值上限（opacity = 值 × 0.18）。 */
const HALATION_VALUE_MAX = 1;
/** 暗角 opacity 上限（自适应加 vignetteDelta 后）。 */
export const VIGNETTE_OPACITY_MAX = 0.72;
/** 漏光层 opacity 上限。 */
export const LIGHT_LEAK_OPACITY_MAX = 0.1;
/** 漏光层增益。 */
export const LIGHT_LEAK_GAIN = 0.29;

/* ========================================================================== *
 * 小工具
 * ========================================================================== */

/** 卡到 [0,1]；NaN → 0。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 卡到 [lo,hi]；NaN → lo。 */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** 保留 2 位小数（label 展示用；-0 归一为 0）。 */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 保留 4 位小数（层表数值稳定用；-0 归一为 0）。 */
function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/* ========================================================================== *
 * buildGradeLayers —— 五层同源管线 + 化学染色 + 物理介质
 * ========================================================================== */

/**
 * 由预设构造成片/合成的完整层栈（composite 面）。
 *
 * 层序（v1.9.0 冻结，探针按 key 逐项核对）：
 *   1 temperature         color  overlay     白平衡色温色纸
 *   2 tint                color  overlay     白平衡色调色纸
 *   3 lens-softness       photo  normal      树脂柔焦（blur 1.2）
 *   4 mono-desaturate     color  color       真黑白去色（仅 mono 卷，#808080）
 *   5 shadow-crush        photo  multiply    暗部压片（同源 Y²）
 *   6 highlight-bloom     photo  screen      高光溢出（同源 1-(1-Y)²，blur 14）
 *   7 shadow-tint         color  预设混合模式  暗部化学染色
 *   8 highlight-tint      color  预设混合模式  高光化学染色
 *   9 halation            color  screen      暖红光晕（#FF4028，opacity = 值 × 0.18）
 *  10 grain               texture overlay    颗粒
 *  11 vignette            texture multiply   暗角
 *  12 light-leak          texture screen     漏光
 *
 * 第 3/5/6 层是 `kind:'photo'` 的同源照片副本（由 FilmLookLayers 用 photoUri 渲染，
 * blurRadius 交给 RN Image）；第 7/8 层的模式由预设决定；第 10~12 层是物理介质纹理。
 *
 * 自适应：planAdaptiveGrade(preset.scene, preset) 命中时把四场景增量叠进层 opacity，
 * 并把 applyAdaptiveColor 的白平衡偏移应用到第 1/2 层的输入色温/色调上。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  // 自适应计划：scene 不可用时为 null（applyAdaptiveColor 原样返回，层表 == 静态预设）。
  const adaptive = planAdaptiveGrade(preset.scene, preset);
  const color = applyAdaptiveColor(preset.color, adaptive);

  const layers: GradeLayer[] = [];

  /* 1 色温 · overlay 色纸 ------------------------------------------------- */
  const temperature = color.temperature;
  if (Math.abs(temperature) > 0.01) {
    layers.push({
      kind: 'color',
      key: 'temperature',
      label: `色温 ${temperature > 0 ? '暖' : '冷'} ${round2(Math.abs(temperature))}（overlay）`,
      color: temperature > 0 ? WARM_OVERLAY : COOL_OVERLAY,
      blendMode: 'overlay',
      opacity: round4(clamp01(Math.abs(temperature) * TEMPERATURE_GAIN)),
    });
  }

  /* 2 色调 · overlay 色纸 ------------------------------------------------- */
  const tint = color.tint;
  if (Math.abs(tint) > 0.01) {
    // 与 v1.8.x 方向一致：tint > 0 = 偏绿，tint < 0 = 偏品红。
    layers.push({
      kind: 'color',
      key: 'tint',
      label: `色调 ${tint > 0 ? '绿' : '品红'} ${round2(Math.abs(tint))}（overlay）`,
      color: tint > 0 ? TINT_GREEN : TINT_MAGENTA,
      blendMode: 'overlay',
      opacity: round4(clamp01(Math.abs(tint) * TINT_GAIN)),
    });
  }

  /* 3 树脂柔焦 · photo normal blur 1.2 ----------------------------------- */
  const lensSoftness = clamp01(color.lensSoftness);
  if (lensSoftness > 0.01) {
    layers.push({
      kind: 'photo',
      key: 'lens-softness',
      label: `树脂柔焦 ${round2(lensSoftness)}（1.2px 高斯 · normal）`,
      blendMode: 'normal',
      opacity: round4(lensSoftness),
      blurRadius: LENS_SOFTNESS_BLUR_PX,
    });
  }

  /* 4 真黑白去色 · color #808080（仅 mono 卷） ---------------------------- */
  if (preset.mono) {
    layers.push({
      kind: 'color',
      key: 'mono-desaturate',
      label: '真黑白去色（#808080 · color · opacity 1）',
      color: NEUTRAL_GRAY,
      blendMode: 'color',
      opacity: 1,
    });
  }

  /* 5 暗部压片 · photo multiply（同源 Y²） -------------------------------- */
  const crushBase = clamp01(color.shadowCrush) + (adaptive === null ? 0 : adaptive.shadowCrushDelta);
  const shadowCrush = clamp(crushBase, 0, SHADOW_CRUSH_MAX);
  layers.push({
    kind: 'photo',
    key: 'shadow-crush',
    label: `暗部压片 ${round2(shadowCrush)}（同源 multiply · Y²）`,
    blendMode: 'multiply',
    opacity: round4(shadowCrush),
  });

  /* 6 高光溢出 · photo screen blur 14（同源 1-(1-Y)²） -------------------- */
  const bloomBase =
    clamp01(color.highlightBloom) + (adaptive === null ? 0 : adaptive.highlightBloomDelta);
  const highlightBloom = clamp(bloomBase, 0, HIGHLIGHT_BLOOM_MAX);
  layers.push({
    kind: 'photo',
    key: 'highlight-bloom',
    label: `高光溢出 ${round2(highlightBloom)}（14px blur · screen · 1-(1-Y)²）`,
    blendMode: 'screen',
    opacity: round4(highlightBloom),
    blurRadius: HIGHLIGHT_BLOOM_BLUR_PX,
  });

  /* 7 暗部化学染色 -------------------------------------------------------- */
  const separationScale = adaptive === null ? 1 : adaptive.separationScale;
  const shadowTintOpacity = clamp01(color.shadowTintOpacity);
  if (color.shadowTint.length > 0 && shadowTintOpacity > 0.01) {
    const opacity = clamp(shadowTintOpacity * separationScale, 0, TINT_OPACITY_MAX);
    layers.push({
      kind: 'color',
      key: 'shadow-tint',
      label: `暗部染色 ${color.shadowTintBlendMode} ${round2(opacity)}`,
      color: color.shadowTint,
      blendMode: color.shadowTintBlendMode,
      opacity: round4(opacity),
    });
  }

  /* 8 高光化学染色 -------------------------------------------------------- */
  const densityScale = adaptive === null ? 1 : adaptive.colorDensityScale;
  const highlightTintOpacity = clamp01(color.highlightTintOpacity);
  if (color.highlightTint.length > 0 && highlightTintOpacity > 0.01) {
    const opacity = clamp(
      highlightTintOpacity * separationScale * densityScale,
      0,
      TINT_OPACITY_MAX,
    );
    layers.push({
      kind: 'color',
      key: 'highlight-tint',
      label: `柔光染色 ${color.highlightTintBlendMode} ${round2(opacity)}`,
      color: color.highlightTint,
      blendMode: color.highlightTintBlendMode,
      opacity: round4(opacity),
    });
  }

  /* 9 暖红光晕 · color screen（opacity = 值 × 0.18） ---------------------- */
  const halationValue = clamp(
    clamp01(color.halation) + (adaptive === null ? 0 : adaptive.halationDelta),
    0,
    HALATION_VALUE_MAX,
  );
  if (halationValue > 0.01) {
    const opacity = clamp01(halationValue) * HALATION_RENDER_CAP;
    layers.push({
      kind: 'color',
      key: 'halation',
      label: `暖红光晕 ${round2(opacity)}（#FF4028 · screen）`,
      color: HALATION_RED,
      blendMode: 'screen',
      opacity: round4(opacity),
    });
  }

  /* 10 颗粒 --------------------------------------------------------------- */
  // v1.8.3 语义保留：颗粒档位由全局设置写进预设 grain，clamp 上限 0.11；ek-100 永不产颗粒。
  if (preset.grain > 0.01 && !GRAINLESS_PRESET_IDS.has(preset.id)) {
    const opacity = grainLayerOpacity(preset.grain);
    layers.push({
      kind: 'texture',
      key: 'grain',
      label: `颗粒 ${round2(preset.grain)}`,
      textureId: 'grain',
      resizeMode: 'repeat',
      blendMode: 'overlay',
      opacity,
    });
  }

  /* 11 暗角 --------------------------------------------------------------- */
  const vignetteBase = preset.vignette + (adaptive === null ? 0 : adaptive.vignetteDelta);
  const vignette = clamp(vignetteBase, 0, VIGNETTE_OPACITY_MAX);
  if (vignette > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'vignette',
      label: `暗角 ${round2(vignette)}`,
      textureId: 'vignette',
      resizeMode: 'stretch',
      blendMode: 'multiply',
      opacity: round4(vignette),
    });
  }

  /* 12 漏光 --------------------------------------------------------------- */
  const lightLeak = clamp01(preset.lightLeak);
  if (lightLeak > 0.01) {
    const opacity = Math.min(LIGHT_LEAK_OPACITY_MAX, lightLeak * LIGHT_LEAK_GAIN);
    const flipSuffix = preset.lightLeakFlip ? ' · 镜像' : '';
    layers.push({
      kind: 'texture',
      key: 'light-leak',
      label: `漏光 ${round2(opacity)}（screen${flipSuffix}）`,
      textureId: 'lightLeak',
      resizeMode: 'stretch',
      blendMode: 'screen',
      opacity: round4(opacity),
      flipX: preset.lightLeakFlip,
    });
  }

  return layers;
}

/* ========================================================================== *
 * live 面（取景器实时预览）—— v1.8.6 发热纪律
 * ========================================================================== */

/** 胶片外观要投到哪个面：成片合成（composite）还是取景器实时预览（live）。 */
export type FilmLookSurface = 'composite' | 'live';

/** live 面色纸层 opacity 缩放系数。 */
export const LIVE_LOOK_OPACITY_SCALE = 0.4;
/** live 面色纸层 opacity 下限。 */
export const LIVE_LOOK_OPACITY_MIN = 0.04;
/** live 面色纸层 opacity 上限。 */
export const LIVE_LOOK_OPACITY_MAX = 0.08;

/**
 * live 面色纸层 opacity：把成片 opacity 乘 0.4 并压到 [0.04, 0.08]。
 *
 * 「示意而非还原」：取景器只需要用户看见「这张卷偏暖/偏绿/有点光晕」，不需要承受整条管线。
 */
export function liveLookOpacity(opacity: number): number {
  return round4(clamp(opacity * LIVE_LOOK_OPACITY_SCALE, LIVE_LOOK_OPACITY_MIN, LIVE_LOOK_OPACITY_MAX));
}

/** live 面被丢弃的全屏染色层（用户 m05280 降发热）。 */
const LIVE_DROPPED_COLOR_LAYER_KEYS = new Set(['shadow-tint', 'highlight-tint']);

/** live 面需要压缩到 liveLookOpacity 的色纸层。 */
const LIVE_COMPRESSED_COLOR_LAYER_KEYS = new Set(['temperature', 'tint', 'halation']);

/**
 * 构造某个面（composite / live）实际要渲染的层表。
 *
 * - composite：`buildGradeLayers` 原样返回（成片/合成/贴纸截图用）。
 * - live：滤掉**所有** `kind:'photo'` 同源层（v1.9.0 起树脂柔焦/暗部压片/高光溢出/光晕都不进
 *   取景器，v1.8.6 发热纪律）+ 颗粒纹理层 + shadow-tint/highlight-tint 两条全屏染色层；
 *   剩余色纸层 temperature/tint/halation 走 liveLookOpacity 压到 0.04~0.08；
 *   mono 去色层保留 opacity 1（黑白卷取景器必须当场是黑白）；暗角/漏光保留原 opacity。
 */
export function planFilmLooks(
  preset: ResolvedFilmPreset,
  surface: FilmLookSurface = 'composite',
): GradeLayer[] {
  const layers = buildGradeLayers(preset);
  if (surface === 'composite') return layers;

  const liveLayers: GradeLayer[] = [];
  for (const layer of layers) {
    // 同源 photo 层：取景器一律不画（每帧全屏高斯模糊 = 发热）。
    if (layer.kind === 'photo') continue;
    // 颗粒：v1.8.3 起取景器不画。
    if (layer.kind === 'texture' && layer.textureId === 'grain') continue;
    // 全屏化学染色层：live 丢弃（降发热）。
    if (layer.kind === 'color' && LIVE_DROPPED_COLOR_LAYER_KEYS.has(layer.key)) continue;
    if (layer.kind === 'color' && LIVE_COMPRESSED_COLOR_LAYER_KEYS.has(layer.key)) {
      liveLayers.push({ ...layer, opacity: liveLookOpacity(layer.opacity) });
      continue;
    }
    // mono-desaturate / 暗角 / 漏光：原样保留。
    liveLayers.push(layer);
  }
  return liveLayers;
}

/**
 * 这张卷在「曝光/画质流水线」里需要预热的图片数：背景 2 张 + 纹理层数 + 同源 photo 层数。
 *
 * 背景 2 = 相框皮肤 + 漏光/纸纹底（见 useFilmStage）；纹理层和 photo 层都要等图片 onLoad
 * 才算「就绪」，所以都需要计入。v1.9.0 契约不变：um-400 = 7、ek-100 = 6、hp-400 = 7。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const layers = buildGradeLayers(preset);
  const imageLayers = layers.filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + imageLayers;
}
