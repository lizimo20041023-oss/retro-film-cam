/**
 * 零模糊同源胶片管线（v1.9.2「彻底去雾 + 亮白通透」）
 *
 * ## v1.9.1 为什么还翻车
 *
 * v1.9.1 砍掉了 14px 模糊与 halation，方向对；但实拍十张样片（用户 m09093）仍两通病：
 * **整体欠曝 0.7~1.0 EV**（白衬衫/斑马线/白云/白雪变暗灰）与**仍有灰雾**。四条数学原因：
 *
 *   ① **层序反了**：`s-curve-contrast`(overlay) 在前、`exposure-lift`(screen) 在后，
 *      先把中间调踩实再提亮，提亮又被 S 曲线压回去 —— 先压后提，曝光永远不够；
 *   ② **平涂深色 soft-light**：`WARM_OVERLAY '#FF641A'` / `TINT_GREEN '#1AA81A'` 这类
 *      深色（RGB 均值 <128）做 soft-light 时等价一块**减光镜**，等于给画面里塞灰；
 *   ③ **shadow-crush multiply 全局使用**：九卷都在 Y² 踩黑，雪景/白墙被压成脏灰；
 *   ④ **halation screen 仍存在**：cs-800t 那层暖红 screen 在高光区加光，也是雾源之一。
 *
 * ## v1.9.2 的四条铁律（用户原文冻结）
 *
 * 1. **先提亮、后拉反差**：`exposure-lift`(screen, 2Y−Y²) 紧贴原图，`s-curve-contrast`
 *    (overlay, 2Y²/1−2(1−Y)²) 紧随其后。exposureLift 基准翻倍到 0.34~0.46。
 * 2. **废除 shadowCrush multiply**：九卷全部 0，仅 TX-400 保留 0.03（黑白卷的密度感）。
 * 3. **染色色值全部高明度**：soft-light 色纸 RGB 均值 ≥170（原深色会减光）。WB/Tint/
 *    化学冷暖分离 100% soft-light；唯一例外 EK-100 高光暖金按用户明文用 overlay。
 * 4. **halation 全 0 并删层**；暗角中心 80% 半径 100% 透明、上限 0.15。
 *
 * ## 两层同源无模糊 photo 层（v1.9.2 光学核心）
 *
 * 设照片某像素亮度 Y ∈ [0,1]（gamma 编码值），把**同一张底片、blurRadius=0** 的副本
 * 以不同混合模式叠回自己：
 *
 *   1. `exposure-lift`     screen，opacity = clamp(lift + Δ, 0, 0.62)
 *        Y' = Y + Y − Y² = 2Y − Y²   （先提亮：中间调/高光干净地抬起来）
 *        Y=0 → 0：**黑场一个像素都不起雾**；Y=1 → 1：白场不切断。
 *   2. `s-curve-contrast`  overlay，opacity = clamp(sCurve + Δ, 0, 0.30)
 *        Y < 0.5：Y' = 2Y²            （提亮之后再踩实暗部）
 *        Y ≥ 0.5：Y' = 1 − 2(1−Y)²    （亮部继续往上提）
 *        中灰 Y=0.5 是不动点，黑场/白场也不动 → f(0)=0、f(1)=1，**黑不死、白不脏**。
 *   3. `shadow-crush`      multiply，opacity = clamp(crush, 0, 0.03)（仅 crush > 0.005）
 *        Y' = Y²                      （唯一保留的黑位密度，只有 TX-400 的 0.03）
 *
 * 两条主曲线的共同点：**都过 (0,0) 与 (1,1)** —— 这是零模糊管线的铁律。任何不满足这对
 * 不动点的混合（normal 色纸、screen 大面积漫射、exclusion 等）都会在纯黑或纯白处留下
 * 偏移，也就是用户说的「雾」「脏」「乳白」。
 *
 * ### 为什么 14px screen 一定会起雾（v1.9.1 已删，留作教训）
 *
 * screen 的公式是 `C = 1 − (1−A)(1−B)`。若 B 是**被模糊过的高光副本**，在原本纯黑
 * 的区域 B ≈ 平均高光亮度 × 核面积占比 > 0，于是 C > 0：屏幕黑场不再是 0，而是被薄薄地
 * 加了一层灰白。模糊半径越大，漏进黑场的能量越多，整图观感就越「乳白」。v1.9.2 的
 * 合成层全部 `blurRadius: 0`，screen 的黑场保持 `1−(1−0)(1−0)=0`。
 *
 * ### 高明度 soft-light 色纸为什么不再压暗
 *
 * soft-light 的公式对源色 cs 是「以 0.5 为中心的有符号调整」：cs > 0.5 提亮、cs < 0.5
 * 压暗。深色纸（RGB 均值 <128 ⇒ cs < 0.5）做 soft-light 等价于整层减光，画面自然发灰。
 * v1.9.2 把色纸全部换成高明度亮色（RGB 均值 ≥170），soft-light 只会「轻微提亮 + 上色」，
 * 不再当减光镜。唯一例外是 EK-100 的高光暖金 `overlay` —— 用户明文的配方。
 *
 * ### 为什么 view-shot 截得到真实混合
 *
 * photo 层是 `<Image blurRadius={0}>` + 外层 View 的 `mixBlendMode`。拍摄链路
 * `processFilmPhoto → FilmCompositor → react-native-view-shot 的 drawViewHierarchy`
 * 是在**原生视图树**上截图（不是 JS 像素遍历），所以合成结果里带的是真正的原生混合 ——
 * 预览看到什么，成片就是什么。这也意味着管线里**不能用任何 JS 像素级调色**
 * （会 O(n) 卡死 JS 线程），只能用 RN/原生支持的层。
 *
 * ### 层序（v1.9.2 冻结 11 个槽位，探针按 key 逐项核对）
 *
 *   1  exposure-lift      photo   screen   blur 0  先提亮（2Y−Y²，≤ 0.62）
 *   2  s-curve-contrast   photo   overlay  blur 0  再拉反差（2Y²/1−2(1−Y)²，≤ 0.30）
 *   3  temperature        color   soft-light      色温亮色纸（|v| × 0.22）
 *   4  tint               color   soft-light      色调亮色纸（|v| × 0.22）
 *   5  shadow-crush       photo   multiply blur 0  黑位密度（Y²，≤ 0.03，仅 TX-400）
 *   6  mono-desaturate    color   color            真黑白去色（仅 mono 卷，#808080）
 *   7  shadow-tint        color   soft-light       暗部化学染色（≤ 0.28）
 *   8  highlight-tint     color   soft-light       高光色彩密度（≤ 0.30；EK-100 overlay）
 *   9  grain              texture overlay          颗粒（透明背景 RGBA，alpha 为载体）
 *  10  vignette           texture multiply         暗角（中心 80% 透明，≤ 0.15）
 *  11  light-leak         texture screen           漏光
 *
 * 0 值层不出现在数组里（正片层另加 >0.01 的发射门），但投影顺序必须与上表一致。
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
 *   exposureLift + exposureLiftDelta         （dark +0.15 / flat +0.12：**只加不减**）
 *   sCurveContrast + sCurveContrastDelta     （四场景都加，夹 [0,0.15]）
 *   shadowTintOpacity × separationScale
 *   highlightTintOpacity × separationScale × colorDensityScale
 *   vignette + vignetteDelta
 * v1.9.2 不再有 shadowCrushTarget 分支（crush 只来自预设静态值），也没有 halation 层。
 * 场景不可用（scene == null 或样本不足）时 plan 为 null，层表与静态预设逐字节一致。
 *
 * ### live（取景器）面为什么不做 photo 层
 *
 * 取景器是 30~60fps 的实时合成，每帧全屏混合 + 截图是纯粹烧 GPU 的负载 ——
 * v1.8.6 的「发热纪律」要求取景器只保留最便宜的色纸/纹理层。因此 live 面：
 *   · 滤掉所有 photo 层（曝光提亮 / S 曲线 / 黑位托底都不进 live）；
 *   · 滤掉颗粒纹理层；
 *   · 丢弃 shadow-tint / highlight-tint 两条全屏染色层；
 *   · 只把 temperature / tint 两条色纸层用 liveLookOpacity 压到 0.04~0.08；
 *   · mono 去色层保留 opacity 1（黑白卷取景器必须当场看到黑白）；
 *   · 暗角 / 漏光原样保留。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
import type { BlendMode, GradeLayer, ResolvedFilmPreset } from '../types';
import { applyAdaptiveColor, planAdaptiveGrade } from './adaptiveGrade';

/* ========================================================================== *
 * 冻结常量（v1.9.2 配方；探针按名字逐项核对，改数值必须同步改探针）
 * ========================================================================== */

/** 色温暖端亮色纸（soft-light，RGB 均值 226.3）。 */
const WARM_SOFT = '#FFE2C2';
/** 色温冷端亮色纸（soft-light，RGB 均值 232.0）。 */
const COOL_SOFT = '#C9E6FF';
/** 色调偏绿端亮色纸（soft-light，RGB 均值 232.0）。 */
const TINT_GREEN_SOFT = '#D2F6C8';
/** 色调偏品红端亮色纸（soft-light，RGB 均值 233.3）。 */
const TINT_MAGENTA_SOFT = '#FFD1F2';
/** 真黑白去色载体（color 混合模式只取它 0 饱和度的色相）。 */
const NEUTRAL_GRAY = '#808080';
/** 卤化光晕的暖红载体（v1.9.2 已删除 halation 层，保留导出避免探针 import 断裂）。 */
export const HALATION_RED = '#FF4028';

/**
 * 零模糊真 S 曲线层 opacity 上限（v1.9.2 收敛到 0.30）。
 *
 * v1.9.1 的 0.72 + 预设 0.35~0.48 在实拍里「过重」：overlay 在暗部 2Y² 踩得太狠，
 * 欠曝区细节被杀。v1.9.2 预设回落到 0.16~0.30，本上限 0.30 只做最终封顶（含场景增量）。
 */
export const S_CURVE_OPACITY_MAX = 0.3;

/** 零模糊曝光提亮层 opacity 上限（screen 自叠 2Y−Y²；容纳 0.46 + dark +0.15）。 */
export const EXPOSURE_LIFT_OPACITY_MAX = 0.62;

/** 黑位托底层 opacity 硬上限（v1.9.2：九卷废除 multiply，仅 TX-400 保留 0.03）。 */
export const SHADOW_CRUSH_OPACITY_MAX = 0.03;

/** 暖红光晕渲染不透明度上限（v1.9.2 冻结为 0：管线不再产出 halation 层）。 */
export const HALATION_OPACITY_MAX = 0;

/** 暗角 opacity 上限（自适应加 vignetteDelta 后；九卷静态值全部落在 0.08~0.15）。 */
export const VIGNETTE_OPACITY_MAX = 0.15;

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
 * 把预设里写来的染色混合模式消毒成 v1.9.2 白名单：**只允许 soft-light / overlay**。
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
 * buildGradeLayers —— v1.9.2 零模糊管线
 * ========================================================================== */

/**
 * 由预设构造成片/合成的完整层栈（composite 面）。
 *
 * 层序见文件头「层序」（v1.9.2 冻结，探针按 key 逐项核对）。
 * 第 1/2/5 层是 `kind:'photo'` 的同源零模糊照片副本（由 FilmLookLayers 用 photoUri
 * 渲染，`blurRadius` 显式 0）；第 7/8 层的模式由预设决定（消毒后）；
 * 第 9~11 层是物理介质纹理。
 *
 * 自适应：planAdaptiveGrade(preset.scene, preset) 命中时把四场景增量叠进层 opacity，
 * 并把 applyAdaptiveColor 的白平衡偏移应用到第 3/4 层的输入色温/色调上。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  // 自适应计划：scene 不可用时为 null（applyAdaptiveColor 原样返回，层表 == 静态预设）。
  const adaptive = planAdaptiveGrade(preset.scene, preset);
  const color = applyAdaptiveColor(preset.color, adaptive);

  const layers: GradeLayer[] = [];

  /* 1 零模糊曝光提亮 · photo screen blur 0（2Y−Y²，先提亮） ----------------- */
  const exposureBase = clamp01(color.exposureLift) + (adaptive === null ? 0 : adaptive.exposureLiftDelta);
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

  /* 2 零模糊真 S 曲线 · photo overlay blur 0（2Y² / 1−2(1−Y)²，后拉反差） ---- */
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

  /* 3 色温 · soft-light 高明度亮色纸 -------------------------------------- */
  const temperature = color.temperature;
  if (Math.abs(temperature) > 0.01) {
    layers.push({
      kind: 'color',
      key: 'temperature',
      label: `色温 ${temperature > 0 ? '暖' : '冷'} ${round2(Math.abs(temperature))}（soft-light 亮色）`,
      color: temperature > 0 ? WARM_SOFT : COOL_SOFT,
      blendMode: 'soft-light',
      opacity: round4(clamp01(Math.abs(temperature) * TEMPERATURE_GAIN)),
    });
  }

  /* 4 色调 · soft-light 高明度亮色纸 -------------------------------------- */
  const tint = color.tint;
  if (Math.abs(tint) > 0.01) {
    // 方向：tint > 0 = 偏绿，tint < 0 = 偏品红。
    layers.push({
      kind: 'color',
      key: 'tint',
      label: `色调 ${tint > 0 ? '绿' : '品红'} ${round2(Math.abs(tint))}（soft-light 亮色）`,
      color: tint > 0 ? TINT_GREEN_SOFT : TINT_MAGENTA_SOFT,
      blendMode: 'soft-light',
      opacity: round4(clamp01(Math.abs(tint) * TINT_GAIN)),
    });
  }

  /* 5 黑位托底 · photo multiply blur 0（Y²，仅 TX-400 的 0.03） ------------ */
  // v1.9.2：删除 adaptive.shadowCrushTarget 分支 —— crush 只来自预设静态值。
  const shadowCrush = clamp(clamp01(color.shadowCrush), 0, SHADOW_CRUSH_OPACITY_MAX);
  if (shadowCrush > 0.005) {
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

  /* 8 高光色彩密度（只允许 soft-light / overlay；EK-100 预设给 overlay） --- */
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

  /* 9 颗粒（v1.9.2：RGBA 透明背景，alpha 为载体；档位常量见 grain.ts） ---- */
  // v1.8.3 语义保留：颗粒档位由全局设置写进预设 grain，clamp 上限 0.055；ek-100 永不产颗粒。
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

  /* 10 暗角（v1.9.2 上限 0.15；贴图中心 80% 半径透明，Lead 重烤） ---------- */
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

  /* 11 漏光 --------------------------------------------------------------- */
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
 * 「示意而非还原」：取景器只需要用户看见「这张卷偏暖/偏绿」，不需要承受整条管线。
 */
export function liveLookOpacity(opacity: number): number {
  return round4(clamp(opacity * LIVE_LOOK_OPACITY_SCALE, LIVE_LOOK_OPACITY_MIN, LIVE_LOOK_OPACITY_MAX));
}

/** live 面被丢弃的全屏染色层（用户 m05280 降发热）。 */
const LIVE_DROPPED_COLOR_LAYER_KEYS = new Set(['shadow-tint', 'highlight-tint']);

/** live 面需要压缩到 liveLookOpacity 的色纸层（v1.9.2 无 halation）。 */
const LIVE_COMPRESSED_COLOR_LAYER_KEYS = new Set(['temperature', 'tint']);

/**
 * 构造某个面（composite / live）实际要渲染的层表。
 *
 * - composite：`buildGradeLayers` 原样返回（成片/合成/贴纸截图用）。
 * - live：滤掉**所有** `kind:'photo'` 同源层（曝光提亮/S 曲线/黑位托底都不进取景器 ——
 *   每帧全屏混合 + 截图是纯烧 GPU，v1.8.6 发热纪律）+ 颗粒纹理层 +
 *   shadow-tint/highlight-tint 两条全屏染色层；剩余色纸层 temperature/tint 走
 *   liveLookOpacity 压到 0.04~0.08；mono 去色层保留 opacity 1（黑白卷取景器必须
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
 * 才算「就绪」，所以都需要计入。v1.9.2 契约：um-400 = 6、ek-100 = 5、hp-400 = 6、tx-400 = 7。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const layers = buildGradeLayers(preset);
  const imageLayers = layers.filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + imageLayers;
}
