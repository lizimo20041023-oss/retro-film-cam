/**
 * 零模糊同源胶片管线（v1.9.1「去雾斩 CCD · Zero-Blur」）
 *
 * ## 为什么整层重写
 *
 * v1.9.0 的「同源五层」方向是对的（把同一张底片用混合模式叠回自己），但数值与模糊半径
 * 全错：实拍 8 张样片被用户 m08443 判成「又糊、又暗、又蒙一层廉价 CCD 柔光雾」。病根：
 *
 *   ① `highlight-bloom` 用了 14px 高斯 + screen：模糊把高光能量摊进**黑场**，
 *      screen 再把这份能量加回每个像素 —— 黑场 Y=0 变成 Y=bloom×0.36，整图乳白起雾；
 *   ② dark 场景 halation 再 +0.50，夜景被泼了一层牛奶；
 *   ③ `lens-softness` 用 1.2px normal 把原图本身抹糊了一层，刀锐尽失；
 *   ④ `shadow-crush` multiply 0.35~0.50，Y² 把白雪/樱花压成脏灰。
 *
 * v1.9.1 的唯一目标：**零模糊（Zero-Blur）纯正胶片反差管线**。整条管线不再出现任何
 * `blurRadius > 0` 的图层，也不再用任何「平涂色纸」假装反差 —— 反差全部由**同一张底片的
 * 无模糊副本**经 overlay / screen / multiply 数学叠回自己产生。
 *
 * ## 三条同源无模糊 photo 层（v1.9.1 光学核心）
 *
 * 设照片某像素亮度 Y ∈ [0,1]（gamma 编码值），把**同一张底片、blurRadius=0** 的副本
 * 以不同混合模式叠回自己：
 *
 *   1. `s-curve-contrast`  overlay，opacity ≤ 0.72
 *        Y < 0.5：Y' = 2Y²            （暗部往下踩实）
 *        Y ≥ 0.5：Y' = 1 − 2(1−Y)²    （亮部往上提亮）
 *        中灰 Y=0.5 是不动点，黑场/白场也不动 → f(0)=0、f(1)=1，**黑不死、白不脏**。
 *
 *   2. `exposure-lift`    screen，opacity ≤ 0.5
 *        Y' = Y + Y − Y² = 2Y − Y²   （中间调/高光干净提亮）
 *        Y=0 → 0：**黑色显示器、夜空、黑场一个像素都不起雾**；Y=1 → 1，白场不切断。
 *
 *   3. `shadow-crush`     multiply，opacity ≤ 0.12（硬上限，v1.9.0 的 0.72 已作废）
 *        Y' = Y²                      （黑位托底：暗部密度上来，黑要黑死）
 *        只允许 0.04~0.12 的轻压：v1.9.0 的 0.25~0.55 会把高调雪景压成脏灰。
 *
 * 三条曲线的共同点：**都过 (0,0) 与 (1,1)** —— 这是零模糊管线的铁律。任何不满足这对
 * 不动点的混合（normal 色纸、screen 大面积漫射、exclusion 等）都会在纯黑或纯白处留下
 * 偏移，也就是用户说的「雾」「脏」「乳白」。
 *
 * ### 为什么 14px screen 一定会起雾（数学）
 *
 * screen 的公式是 `C = 1 − (1−A)(1−B)`。若 B 是**被模糊过的高光副本**，在原本纯黑的
 * 区域 B ≈ 平均高光亮度 × 核面积占比 > 0，于是 C > 0：屏幕黑场不再是 0，而是被薄薄地
 * 加了一层灰白。模糊半径越大，漏进黑场的能量越多，整图观感就越「乳白」。v1.9.1 直接
 * 删除 blurRadius，B = A（同源像素），screen 的黑场保持 `1−(1−0)(1−0)=0`。
 *
 * ### 为什么 view-shot 截得到真实混合
 *
 * photo 层是 `<Image blurRadius={0}>` + 外层 View 的 `mixBlendMode`。拍摄链路
 * `processFilmPhoto → FilmCompositor → react-native-view-shot 的 drawViewHierarchy`
 * 是在**原生视图树**上截图（不是 JS 像素遍历），所以合成结果里带的是真正的原生混合 ——
 * 预览看到什么，成片就是什么。这也意味着管线里**不能用任何 JS 像素级调色**
 * （会 O(n) 卡死 JS 线程），只能用 RN/原生支持的层。
 *
 * ### 12 层顺序（v1.9.1 冻结，探针按 key 逐项核对）
 *
 *   1  temperature        color   overlay          色温色纸（|v| × 0.22）
 *   2  tint               color   overlay          色调色纸（|v| × 0.22）
 *   3  s-curve-contrast   photo   overlay  blur 0  零模糊真 S 曲线（2Y² / 1−2(1−Y)²）
 *   4  exposure-lift      photo   screen   blur 0  零模糊曝光提亮（2Y−Y²）
 *   5  shadow-crush       photo   multiply blur 0  黑位轻托底（Y²，≤ 0.12）
 *   6  mono-desaturate    color   color            真黑白去色（仅 mono 卷，#808080）
 *   7  shadow-tint        color   soft-light|overlay  暗部化学染色（≤ 0.28）
 *   8  highlight-tint     color   soft-light|overlay  高光色彩密度（≤ 0.30）
 *   9  halation           color   screen           暖红光晕（#FF4028，opacity ≤ 0.06）
 *  10  grain              texture overlay          颗粒
 *  11  vignette           texture multiply         暗角（≤ 0.32）
 *  12  light-leak         texture screen           漏光
 *
 * 0 值层不出现在数组里；但投影顺序必须与上表一致。
 *
 * ### 化学染色层的铁律
 *
 * 染色层允许的模式只有 `soft-light` / `overlay`（见 `sanitizeTintBlendMode`）。
 * 它们在中灰附近温和作用、在黑场/白场附近收敛，不会像 exclusion / multiply / screen
 * 那样污染黑场白场 —— v1.9.0 的 `exclusion` 暗部染色正是「黑场发灰」的另一个来源。
 *
 * ### 自适应增量（见 adaptiveGrade.ts）
 *
 * 有场景统计时，planAdaptiveGrade 给出四场景增量，叠到本管线对应层：
 *   sCurveContrast + sCurveContrastDelta   （暗/平/亮/高反差都加，靠 S 曲线拉反差）
 *   exposureLift + exposureLiftDelta       （暗部场景 +0.21 补偿曝光）
 *   shadowCrushTarget ?? shadowCrush       （高反差/平光目标 0.08；dark/bright 目标 0）
 *   shadowTintOpacity × separationScale
 *   highlightTintOpacity × separationScale × colorDensityScale
 *   vignette + vignetteDelta
 *   halation + halationDelta（v1.9.1 恒 0：光晕不再当反差工具）
 * 并全部 clamp。场景不可用（scene == null 或样本不足）时 plan 为 null，
 * 层表与静态预设逐字节一致。
 *
 * ### live（取景器）面为什么不做 photo 层
 *
 * 取景器是 30~60fps 的实时合成，每帧全屏混合 + 截图是纯粹烧 GPU 的负载 ——
 * v1.8.6 的「发热纪律」要求取景器只保留最便宜的色纸/纹理层。因此 live 面：
 *   · 滤掉所有 photo 层（S 曲线/曝光提亮/黑位托底都不进 live）；
 *   · 滤掉颗粒纹理层；
 *   · 丢弃 shadow-tint / highlight-tint 两条全屏染色层；
 *   · 只把 temperature / tint / halation 三条色纸层用 liveLookOpacity 压到 0.04~0.08；
 *   · mono 去色层保留 opacity 1（黑白卷取景器必须当场看到黑白）；
 *   · 暗角 / 漏光原样保留。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
import type { BlendMode, GradeLayer, ResolvedFilmPreset } from '../types';
import { applyAdaptiveColor, planAdaptiveGrade } from './adaptiveGrade';

/* ========================================================================== *
 * 冻结常量（v1.9.1 零模糊配方；探针按名字逐项核对，改数值必须同步改探针）
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
export const HALATION_RED = '#FF4028';

/**
 * 零模糊真 S 曲线层 opacity 上限（v1.9.1 手术一）。
 *
 * overlay 自叠在 Y<0.5 走 2Y²、Y≥0.5 走 1−2(1−Y)²；opacity 只是这条曲线的「浓度」。
 * 0.72 已经足够把九卷的 sCurveContrast（0.24~0.48）+ 场景增量推到胶片级反差，
 * 再高就会在中间调出现数码味的分层（用户 m08443 明令禁止的重口反差）。
 */
export const S_CURVE_OPACITY_MAX = 0.72;

/** 零模糊曝光提亮层 opacity 上限（screen 自叠 2Y−Y²；0 黑场不动、1 白场不动）。 */
export const EXPOSURE_LIFT_OPACITY_MAX = 0.5;

/**
 * 黑位托底层 opacity 硬上限（v1.9.1 手术一.4）。
 *
 * v1.9.0 的 0.72（实际配置到 0.25~0.55）已作废：Y² 在低不透明度下已经是「密度上来」的
 * 油润黑，再高会把白雪/樱花压成用户投诉的「脏灰」。
 */
export const SHADOW_CRUSH_OPACITY_MAX = 0.12;

/** 暖红光晕渲染不透明度上限（v1.9.1：直接 clamp(value,0,0.06)，不再 ×0.18）。 */
export const HALATION_OPACITY_MAX = 0.06;

/** 暗角 opacity 上限（自适应加 vignetteDelta 后；九卷静态值全部落在 0.18~0.32）。 */
export const VIGNETTE_OPACITY_MAX = 0.32;

/** 色温层每 1.0 强度对应的 opacity（|temperature| × 0.22）。 */
const TEMPERATURE_GAIN = 0.22;
/** 色调层每 1.0 强度对应的 opacity（|tint| × 0.22）。 */
const TINT_GAIN = 0.22;

/** 暗部染色 opacity 上限（自适应分离度缩放后）。 */
const SHADOW_TINT_OPACITY_MAX = 0.28;
/** 高光染色 opacity 上限（自适应分离度 × 密度缩放后）。 */
const HIGHLIGHT_TINT_OPACITY_MAX = 0.3;

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
 * 染色层混合模式消毒
 * ========================================================================== */

/**
 * 把预设里写来的染色混合模式消毒成 v1.9.1 白名单：**只允许 soft-light / overlay**。
 *
 * 为什么必须消毒（不是「建议」）：exclusion / multiply / screen / difference 这些模式
 * 在纯黑或纯白处不收敛 —— 暗部染色用 exclusion 会把黑场抬成灰，用 multiply 会把白场
 * 压脏。用户 m08443 的「蒙一层廉价 CCD 柔光雾」有相当一部分来自这两条染色层。
 *
 * 规则：mode === 'overlay' 保留；其余（含 undefined / 脏字符串）一律回 'soft-light'。
 */
export function sanitizeTintBlendMode(mode: BlendMode): 'soft-light' | 'overlay' {
  return mode === 'overlay' ? 'overlay' : 'soft-light';
}

/* ========================================================================== *
 * buildGradeLayers —— 零模糊 12 层管线
 * ========================================================================== */

/**
 * 由预设构造成片/合成的完整层栈（composite 面）。
 *
 * 层序见文件头「12 层顺序」（v1.9.1 冻结，探针按 key 逐项核对）。
 * 第 3/4/5 层是 `kind:'photo'` 的同源零模糊照片副本（由 FilmLookLayers 用 photoUri
 * 渲染，`blurRadius` 显式 0）；第 7/8 层的模式由预设决定（消毒后）；
 * 第 10~12 层是物理介质纹理。
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
    // 方向：tint > 0 = 偏绿，tint < 0 = 偏品红。
    layers.push({
      kind: 'color',
      key: 'tint',
      label: `色调 ${tint > 0 ? '绿' : '品红'} ${round2(Math.abs(tint))}（overlay）`,
      color: tint > 0 ? TINT_GREEN : TINT_MAGENTA,
      blendMode: 'overlay',
      opacity: round4(clamp01(Math.abs(tint) * TINT_GAIN)),
    });
  }

  /* 3 零模糊真 S 曲线 · photo overlay blur 0（2Y² / 1−2(1−Y)²） ------------ */
  const sCurveBase = clamp01(color.sCurveContrast) + (adaptive === null ? 0 : adaptive.sCurveContrastDelta);
  const sCurveContrast = clamp(sCurveBase, 0, S_CURVE_OPACITY_MAX);
  if (sCurveContrast > 0.01) {
    layers.push({
      kind: 'photo',
      key: 's-curve-contrast',
      label: `零模糊 S 曲线 ${round2(sCurveContrast)}（同源 overlay · 2Y²/1−2(1−Y)²）`,
      blendMode: 'overlay',
      opacity: round4(sCurveContrast),
      blurRadius: 0,
    });
  }

  /* 4 零模糊曝光提亮 · photo screen blur 0（2Y−Y²） ------------------------ */
  const exposureBase =
    clamp01(color.exposureLift) + (adaptive === null ? 0 : adaptive.exposureLiftDelta);
  const exposureLift = clamp(exposureBase, 0, EXPOSURE_LIFT_OPACITY_MAX);
  if (exposureLift > 0.01) {
    layers.push({
      kind: 'photo',
      key: 'exposure-lift',
      label: `零模糊曝光提亮 ${round2(exposureLift)}（同源 screen · 2Y−Y²）`,
      blendMode: 'screen',
      opacity: round4(exposureLift),
      blurRadius: 0,
    });
  }

  /* 5 黑位托底 · photo multiply blur 0（Y²，硬上限 0.12） ------------------ */
  const crushBase =
    adaptive !== null && adaptive.shadowCrushTarget !== null
      ? adaptive.shadowCrushTarget
      : clamp01(color.shadowCrush);
  const shadowCrush = clamp(crushBase, 0, SHADOW_CRUSH_OPACITY_MAX);
  if (shadowCrush > 0.01) {
    layers.push({
      kind: 'photo',
      key: 'shadow-crush',
      label: `黑位托底 ${round2(shadowCrush)}（同源 multiply · Y²）`,
      blendMode: 'multiply',
      opacity: round4(shadowCrush),
      blurRadius: 0,
    });
  }

  /* 6 真黑白去色 · color #808080（仅 mono 卷） ---------------------------- */
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

  /* 7 暗部化学染色（只允许 soft-light / overlay） -------------------------- */
  const separationScale = adaptive === null ? 1 : adaptive.separationScale;
  const shadowTintOpacity = clamp01(color.shadowTintOpacity);
  if (color.shadowTint.length > 0 && shadowTintOpacity > 0.01) {
    const blendMode = sanitizeTintBlendMode(color.shadowTintBlendMode);
    const opacity = clamp(shadowTintOpacity * separationScale, 0, SHADOW_TINT_OPACITY_MAX);
    layers.push({
      kind: 'color',
      key: 'shadow-tint',
      label: `暗部染色 ${blendMode} ${round2(opacity)}`,
      color: color.shadowTint,
      blendMode,
      opacity: round4(opacity),
    });
  }

  /* 8 高光色彩密度（只允许 soft-light / overlay） -------------------------- */
  const densityScale = adaptive === null ? 1 : adaptive.colorDensityScale;
  const highlightTintOpacity = clamp01(color.highlightTintOpacity);
  if (color.highlightTint.length > 0 && highlightTintOpacity > 0.01) {
    const blendMode = sanitizeTintBlendMode(color.highlightTintBlendMode);
    const opacity = clamp(
      highlightTintOpacity * separationScale * densityScale,
      0,
      HIGHLIGHT_TINT_OPACITY_MAX,
    );
    layers.push({
      kind: 'color',
      key: 'highlight-tint',
      label: `柔光染色 ${blendMode} ${round2(opacity)}`,
      color: color.highlightTint,
      blendMode,
      opacity: round4(opacity),
    });
  }

  /* 9 暖红光晕 · color screen（v1.9.1：opacity = clamp(value,0,0.06)） ----- */
  const halationBase = clamp01(color.halation) + (adaptive === null ? 0 : adaptive.halationDelta);
  const halation = Math.min(HALATION_OPACITY_MAX, clamp01(halationBase));
  if (halation > 0.01) {
    layers.push({
      kind: 'color',
      key: 'halation',
      label: `暖红光晕 ${round2(halation)}（#FF4028 · screen）`,
      color: HALATION_RED,
      blendMode: 'screen',
      opacity: round4(halation),
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

  /* 11 暗角（v1.9.1 上限 0.32；v1.9.0 的 0.72 作废） ---------------------- */
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
 * - live：滤掉**所有** `kind:'photo'` 同源层（零模糊 S 曲线/曝光提亮/黑位托底都不进
 *   取景器 —— 每帧全屏混合 + 截图是纯烧 GPU，v1.8.6 发热纪律）+ 颗粒纹理层 +
 *   shadow-tint/highlight-tint 两条全屏染色层；剩余色纸层 temperature/tint/halation
 *   走 liveLookOpacity 压到 0.04~0.08；mono 去色层保留 opacity 1（黑白卷取景器必须
 *   当场是黑白）；暗角/漏光保留原 opacity。
 */
export function planFilmLooks(
  preset: ResolvedFilmPreset,
  surface: FilmLookSurface = 'composite',
): GradeLayer[] {
  const layers = buildGradeLayers(preset);
  if (surface === 'composite') return layers;

  const liveLayers: GradeLayer[] = [];
  for (const layer of layers) {
    // 同源 photo 层：取景器一律不画（每帧全屏混合 = 发热）。
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
 * 才算「就绪」，所以都需要计入。v1.9.1 契约：um-400 = 7、ek-100 = 6、hp-400 = 7。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const layers = buildGradeLayers(preset);
  const imageLayers = layers.filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + imageLayers;
}
