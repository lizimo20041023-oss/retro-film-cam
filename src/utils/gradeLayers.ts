/**
 * 零模糊同源胶片管线（v1.9.3「德味高密光学曲线」）
 *
 * ## 一、v1.9.3 的手术目标（用户 m09629）
 *
 * v1.9.2「彻底去雾 + 亮白通透」把曝光提亮放到第一位、S 曲线压到 0.16~0.30，
 * 画面干净了，但也失去了胶片最值钱的东西：**浓黑、油润、层间分离**（德味）。
 * v1.9.3 反过来——**反差优先、色彩增重、提亮只留最小剂量**：
 *
 *   ① S 曲线回到 0.46~0.72（德味核心反差，先压出浓黑油润）；
 *   ② 新增 `color-burn` 光学色彩密度层（0.08~0.16，天空/绿植/颜料增重）；
 *   ③ screen 提亮收敛到 0.04~0.14（只做高光延展；**夜景由自适应强制置 0**）；
 *   ④ shadow-crush 只留给 TX-400 的 0.08；
 *   ⑤ halation 恢复最小剂量：只有 CS-800T 的 0.06；
 *   ⑥ 染色浓度抬到 0.16~0.32（上限 0.36），暗角上限 0.40。
 *
 * ## 二、三条零模糊同源 photo 层（全部 `blurRadius: 0`，严禁任何模糊）
 *
 * 设照片某像素编码值（0~1）为 Y，把**同一张底片、blurRadius=0** 的副本以不同
 * 混合模式叠回自己：
 *
 *   1. `s-curve-contrast`  overlay，opacity = clamp(sCurve + Δ, 0, 0.72)
 *        Y < 0.5：Y' = 2Y²            （暗部踩出浓黑）
 *        Y ≥ 0.5：Y' = 1 − 2(1−Y)²    （亮部往上推）
 *        f(0)=0、f(0.5)=0.5、f(1)=1 —— 黑场白场都不动。
 *   2. `exposure-lift`     screen，opacity = clamp(lift(+Δ 或置 0), 0, 0.24)
 *        Y' = 2Y − Y²                  （只做高光延展）
 *        Y=0 → 0：**黑场一个像素都不起雾**；Y=1 → 1。
 *   3. `shadow-crush`      multiply，opacity = clamp(crush, 0, 0.08)（仅 >0.005）
 *        Y' = Y²                       （黑位托底；八卷 0，仅 TX-400 0.08）
 *
 * 三条曲线的共同点：**都过 (0,0) 与 (1,1)** —— 这是零模糊管线的铁律。任何不满足这
 * 对不动点的混合（normal 色纸、模糊扩散、exclusion 等）都会在纯黑或纯白处留下偏移，
 * 也就是用户说的「雾」「脏」「乳白」。
 *
 * > 历史注：v1.9.1 的 14px 屏幕模糊正是「乳白雾」的根因（已彻底删除，本管线零模糊）；
 * > 同源层复用同一张底片副本、`blurRadius: 0`，成片合成仍走 `react-native-view-shot`
 * > 的 `drawViewHierarchy` 截帧（与 v1.9.2 口径一致）。
 *
 * ## 三、color-burn 光学色彩密度层（v1.9.3 新增，第二根支柱）
 *
 * 纯色 `colorBurnTint` 以 `color-burn` 混合，opacity = clamp(colorBurn + Δ, 0, 0.24)：
 *
 *   color-burn(cb, cs) = 1 − min(1, (1−cb) / cs)      （cb = 底图通道值，cs = 纯色通道）
 *
 *   · 纯白高光 cb = 1 ⇒ 1 − min(1, 0/cs) = 1 ⇒ **白雪/白墙绝不会被压灰**；
 *   · cb < 1 时按源色乘性加深（红通道被深色 cs 压得更多）⇒ 天空更深邃、绿植更森绿、
 *     黄墙红花带油画密度。这就是「油润」的来源；
 *   · opacity 0 → 恒等，opacity 1 → 纯 color-burn。
 *
 * ## 四、层序（v1.9.3 冻结，探针按 key 逐项核对；0 值层不出现）
 *
 *   0  base 原图（宿主渲染，不在 layers 里，100% 刀锐）
 *   1  s-curve-contrast   photo   overlay     blur 0  ≤ 0.72（德味核心反差）
 *   2  color-density      color   color-burn  ≤ 0.24  纯色 colorBurnTint
 *   3  exposure-lift      photo   screen      blur 0  ≤ 0.24（夜景强制置 0）
 *   4  temperature        color   soft-light  色温亮色纸（|v| × 0.22）
 *   5  tint               color   soft-light  色调亮色纸（|v| × 0.22）
 *   6  shadow-tint        color   soft-light|overlay  ≤ 0.36
 *   7  highlight-tint     color   soft-light|overlay  ≤ 0.36
 *   8  shadow-crush       photo   multiply    blur 0  ≤ 0.08（仅 >0.005，TX-400）
 *   9  mono-desaturate    color   color       #808080 / opacity 1（仅 mono 卷）
 *  10  halation           texture lightLeak screen  ≤ 0.06（仅 >0.005，CS-800T）
 *  11  grain              texture overlay    颗粒档位绝对不透明度（≤ 0.42）
 *  12  vignette           texture stretch multiply  ≤ 0.40
 *  13  light-leak         texture screen      ≤ 0.10（仅 >0.005）
 *
 * mono 去色层放在全部染色层之后 ⇒ 黑白卷的暗部染色与高光密度最后被抽走，
 * 得到的是**真黑白**（R=G=B），不是「带色的灰」。
 *
 * ## 五、化学染色层的铁律
 *
 * 染色层允许的模式只有 `soft-light` / `overlay`（见 `sanitizeTintBlendMode`）。
 * 它们在中灰附近温和作用、在黑场/白场附近收敛，不会像 exclusion / multiply / screen
 * 那样污染黑场白场 —— v1.9.0 的 `exclusion` 暗部染色正是「黑场发灰」的另一个来源。
 * `color-burn` 只出现在 color-density 这一层（单一出口），且数学上纯白恒为白。
 *
 * ## 六、自适应增量（见 adaptiveGrade.ts）
 *
 * 有场景统计时，planAdaptiveGrade 给出四场景增量，叠到本管线对应层：
 *   sCurveContrast + sCurveContrastDelta        （四场景只加不减，夹 [0,0.20]）
 *   colorBurn + colorBurnDelta                  （dark/hc/flat 加，夹 [0,0.08]）
 *   exposureLift：`exposureLiftTarget !== null` 时**整体覆盖**（夜景 = 0，纯黑校准）；
 *                 否则 + exposureLiftDelta（只有 bright +0.08）
 *   shadowTintOpacity × separationScale
 *   highlightTintOpacity × separationScale × colorDensityScale
 *   halation + halationDelta                    （恒 0：光晕只来自预设静态值）
 *   vignette + vignetteDelta
 * 场景不可用（scene == null 或样本不足）时 plan 为 null，层表与静态预设逐字节一致。
 *
 * ## 七、live（取景器）面为什么不做 photo 层
 *
 * 取景器是 30~60fps 的实时合成，每帧全屏混合 + 截图是纯粹烧 GPU 的负载 ——
 * v1.8.6 的「发热纪律」要求取景器只保留最便宜的色纸/纹理层。因此 live 面：
 *   · 滤掉所有 photo 层（S 曲线 / 曝光提亮 / 黑位托底都不进 live）；
 *   · 滤掉颗粒纹理层；
 *   · 丢弃 shadow-tint / highlight-tint / color-density 三条全屏染色层；
 *   · 只把 temperature / tint 两条色纸层用 liveLookOpacity 压到 0.04~0.08；
 *   · mono 去色层保留 opacity 1（黑白卷取景器必须当场看到黑白）；
 *   · halation / 暗角 / 漏光原样保留。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
import type { BlendMode, GradeLayer, ResolvedFilmPreset } from '../types';
import { applyAdaptiveColor, planAdaptiveGrade } from './adaptiveGrade';

/* ========================================================================== *
 * 冻结常量（v1.9.3 配方；探针按名字逐项核对，改数值必须同步改探针）
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
/** 卤化光晕的暖红载体（v1.9.3 光晕仍走 lightLeak 贴图；保留导出避免探针 import 断裂）。 */
export const HALATION_RED = '#FF4028';

/**
 * 零模糊真 S 曲线层 opacity 上限（v1.9.3 回到 0.72 = 德味核心反差）。
 *
 * 九卷 0.46~0.72：overlay 在暗部 2Y² 踩出浓黑、亮部推亮，黑场/白场都不动。
 * 0.72 是最终封顶（含场景增量），超过会在欠曝区把细节压死。
 */
export const S_CURVE_OPACITY_MAX = 0.72;

/** 零模糊曝光提亮层 opacity 上限（v1.9.3 收敛到 0.24；九卷 0.04~0.14）。 */
export const EXPOSURE_LIFT_OPACITY_MAX = 0.24;

/**
 * color-burn 光学色彩密度层 opacity 上限（v1.9.3 新增；九卷 0.08~0.16）。
 *
 * color-burn 数学上纯白恒为白，所以这层不会压灰高光；夹 0.24 只防预设/自适应叠加越界。
 */
export const COLOR_BURN_OPACITY_MAX = 0.24;

/** 黑位托底层 opacity 硬上限（v1.9.3：八卷 0，仅 TX-400 保留 0.08）。 */
export const SHADOW_CRUSH_OPACITY_MAX = 0.08;

/** 暖红光晕渲染不透明度上限（v1.9.3 恢复最小剂量：只有 CS-800T 的 0.06）。 */
export const HALATION_OPACITY_MAX = 0.06;

/** 暗角 opacity 上限（自适应加 vignetteDelta 后；九卷静态值 0.22~0.38）。 */
export const VIGNETTE_OPACITY_MAX = 0.4;

/** 色温层每 1.0 强度对应的 opacity（|temperature| × 0.22）。 */
export const TEMPERATURE_GAIN = 0.22;
/** 色调层每 1.0 强度对应的 opacity（|tint| × 0.22）。 */
export const TINT_GAIN = 0.22;

/** 暗部染色 opacity 上限（自适应分离度缩放后；九卷 0.16~0.30）。 */
export const SHADOW_TINT_OPACITY_MAX = 0.36;
/** 高光染色 opacity 上限（自适应分离度 × 密度缩放后；九卷 0.18~0.32）。 */
export const HIGHLIGHT_TINT_OPACITY_MAX = 0.36;

/** 漏光层 opacity 上限。 */
export const LIGHT_LEAK_OPACITY_MAX = 0.1;
/** 漏光层增益。 */
export const LIGHT_LEAK_GAIN = 0.29;

/** 层出层阈值：低于它的层视为「没有这一层」（photo/crush/halation/暗角/漏光）。 */
const LAYER_EPSILON = 0.005;

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
 * 把预设里写来的染色混合模式消毒成 v1.9.3 白名单：**只允许 soft-light / overlay**。
 *
 * 为什么必须消毒（不是「建议」）：exclusion / multiply / screen / difference 这些模式
 * 在纯黑或纯白处不收敛 —— 暗部染色用 exclusion 会把黑场抬成灰，用 multiply 会把白场
 * 压脏。用户 m08443 的「蒙一层廉价 CCD 柔光雾」有相当一部分来自这两条染色层。
 *
 * 规则：mode === 'overlay' 保留；其余（含 undefined / 脏字符串）一律回 'soft-light'。
 * 注意 `color-burn` 不走这里：它只属于 color-density 层（单一出口）。
 */
export function sanitizeTintBlendMode(mode: BlendMode): 'soft-light' | 'overlay' {
  return mode === 'overlay' ? 'overlay' : 'soft-light';
}

/* ========================================================================== *
 * buildGradeLayers —— v1.9.3 德味高密光学管线
 * ========================================================================== */

/**
 * 由预设构造成片/合成的完整层栈（composite 面）。
 *
 * 层序见文件头「层序」（v1.9.3 冻结，探针按 key 逐项核对）。
 * 第 1/3/8 层是 `kind:'photo'` 的同源零模糊照片副本（由 FilmLookLayers 用 photoUri
 * 渲染，`blurRadius` 显式 0）；第 2/4~7/9/10 层的模式见契约；第 11~13 层是物理介质纹理。
 *
 * 自适应：planAdaptiveGrade(preset.scene, preset) 命中时把四场景增量叠进层 opacity
 * （夜景的 exposureLift 被 `exposureLiftTarget = 0` 整体覆盖，实现纯黑校准），
 * 并把 applyAdaptiveColor 的白平衡偏移应用到第 4/5 层的输入色温/色调上。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  // 自适应计划：scene 不可用时为 null（applyAdaptiveColor 原样返回，层表 == 静态预设）。
  const adaptive = planAdaptiveGrade(preset.scene, preset);
  const color = applyAdaptiveColor(preset.color, adaptive);

  const layers: GradeLayer[] = [];

  /* 1 零模糊真 S 曲线 · photo overlay blur 0（2Y² / 1−2(1−Y)²，德味核心反差） --- */
  const sCurveBase = clamp01(color.sCurveContrast) + (adaptive === null ? 0 : adaptive.sCurveContrastDelta);
  const sCurveContrast = clamp(sCurveBase, 0, S_CURVE_OPACITY_MAX);
  if (sCurveContrast > LAYER_EPSILON) {
    layers.push({
      kind: 'photo',
      key: 's-curve-contrast',
      label: `零模糊 S 曲线 ${round2(sCurveContrast)}（同源 overlay · 2Y²/1−2(1−Y)²）`,
      blendMode: 'overlay',
      opacity: round4(sCurveContrast),
      blurRadius: 0,
    });
  }

  /* 2 光学色彩密度 · color-burn 纯色（纯白高光不动，暗部/中间调致密增重） ------- */
  const burnTint = color.colorBurnTint;
  const colorBurnBase = clamp01(color.colorBurn) + (adaptive === null ? 0 : adaptive.colorBurnDelta);
  const colorBurn = clamp(colorBurnBase, 0, COLOR_BURN_OPACITY_MAX);
  if (burnTint.length > 0 && colorBurn > LAYER_EPSILON) {
    layers.push({
      kind: 'color',
      key: 'color-density',
      label: `色彩密度 ${round2(colorBurn)}（color-burn 光学增重）`,
      color: burnTint,
      blendMode: 'color-burn',
      opacity: round4(colorBurn),
    });
  }

  /* 3 零模糊曝光提亮 · photo screen blur 0（2Y−Y²，只在暗部之外做高光延展） ---- */
  // 夜景校准：adaptive.exposureLiftTarget 非 null 时整体覆盖（dark = 0，纯黑不起雾）。
  const liftBase = clamp01(color.exposureLift);
  let exposureBase = liftBase;
  if (adaptive !== null) {
    exposureBase =
      adaptive.exposureLiftTarget !== null
        ? adaptive.exposureLiftTarget
        : liftBase + adaptive.exposureLiftDelta;
  }
  const exposureLift = clamp(exposureBase, 0, EXPOSURE_LIFT_OPACITY_MAX);
  if (exposureLift > LAYER_EPSILON) {
    layers.push({
      kind: 'photo',
      key: 'exposure-lift',
      label: `零模糊曝光提亮 ${round2(exposureLift)}（同源 screen · 2Y−Y²）`,
      blendMode: 'screen',
      opacity: round4(exposureLift),
      blurRadius: 0,
    });
  }

  /* 4 色温 · soft-light 高明度亮色纸 -------------------------------------- */
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

  /* 5 色调 · soft-light 高明度亮色纸 -------------------------------------- */
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

  /* 6 暗部化学染色（只允许 soft-light / overlay） -------------------------- */
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

  /* 7 高光色彩密度（只允许 soft-light / overlay） -------------------------- */
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

  /* 8 黑位托底 · photo multiply blur 0（Y²，仅 TX-400 的 0.08） ------------ */
  const shadowCrush = clamp(clamp01(color.shadowCrush), 0, SHADOW_CRUSH_OPACITY_MAX);
  if (shadowCrush > LAYER_EPSILON) {
    layers.push({
      kind: 'photo',
      key: 'shadow-crush',
      label: `黑位托底 ${round2(shadowCrush)}（同源 multiply · Y²）`,
      blendMode: 'multiply',
      opacity: round4(shadowCrush),
      blurRadius: 0,
    });
  }

  /* 9 真黑白去色 · color #808080（仅 mono 卷；在所有染色层之后 = 真黑白） --- */
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

  /* 10 卤化光晕 · texture lightLeak screen（v1.9.3 只有 CS-800T 的 0.06） --- */
  const halationBase = clamp01(color.halation) + (adaptive === null ? 0 : adaptive.halationDelta);
  const halation = clamp(halationBase, 0, HALATION_OPACITY_MAX);
  if (halation > LAYER_EPSILON) {
    layers.push({
      kind: 'texture',
      key: 'halation',
      label: `暖红光晕 ${round2(halation)}（lightLeak screen · 除碳光晕）`,
      textureId: 'lightLeak',
      resizeMode: 'stretch',
      blendMode: 'screen',
      opacity: round4(halation),
    });
  }

  /* 11 颗粒（v1.9.3：RGB 不透明双极性银盐噪点；档位常量见 grain.ts） ------- */
  // 档位由全局设置写进预设 grain（0.10/0.18/0.30/0.42），clamp 上限 0.42；ek-100 永不产颗粒。
  if (preset.grain > 0 && !GRAINLESS_PRESET_IDS.has(preset.id)) {
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

  /* 12 暗角（v1.9.3 上限 0.40；贴图中心 72% 半径透明，Lead 重烤） ---------- */
  const vignetteBase = preset.vignette + (adaptive === null ? 0 : adaptive.vignetteDelta);
  const vignette = clamp(vignetteBase, 0, VIGNETTE_OPACITY_MAX);
  if (vignette > LAYER_EPSILON) {
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

  /* 13 漏光（screen，排最后；九卷 lightLeak 仍为 0 → 不出层） --------------- */
  const lightLeak = clamp01(preset.lightLeak);
  if (lightLeak > LAYER_EPSILON) {
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

/**
 * live 面被丢弃的全屏染色层（用户 m05280 降发热）。
 *
 * v1.9.3 新增 color-density：color-burn 是整幅纯色的全屏混合，取景器里只显示
 * 「卷的底色」而没有 S 曲线反差配合，观感会偏色；且同样属于每帧全屏混合 →
 * 与 shadow-tint / highlight-tint 一样丢给成片路径，取景器只留色温/色调示意。
 */
const LIVE_DROPPED_COLOR_LAYER_KEYS = new Set(['shadow-tint', 'highlight-tint', 'color-density']);

/** live 面需要压缩到 liveLookOpacity 的色纸层。 */
const LIVE_COMPRESSED_COLOR_LAYER_KEYS = new Set(['temperature', 'tint']);

/**
 * 构造某个面（composite / live）实际要渲染的层表。
 *
 * - composite：`buildGradeLayers` 原样返回（成片/合成/贴纸截图用）。
 * - live：滤掉**所有** `kind:'photo'` 同源层（S 曲线/曝光提亮/黑位托底都不进取景器 ——
 *   每帧全屏混合 + 截图是纯烧 GPU，v1.8.6 发热纪律）+ 颗粒纹理层 +
 *   shadow-tint/highlight-tint/color-density 三条全屏染色层；剩余色纸层 temperature/tint
 *   走 liveLookOpacity 压到 0.04~0.08；mono 去色层保留 opacity 1（黑白卷取景器必须
 *   当场是黑白）；halation / 暗角 / 漏光保留原 opacity。
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
    // mono-desaturate / halation / 暗角 / 漏光：原样保留。
    liveLayers.push(layer);
  }
  return liveLayers;
}

/**
 * 这张卷在「曝光/画质流水线」里需要预热的图片数：背景 2 张 + 纹理层数 + 同源 photo 层数。
 *
 * 背景 2 = 相框皮肤 + 漏光/纸纹底（见 useFilmStage）；纹理层和 photo 层都要等图片 onLoad
 * 才算「就绪」，所以都需要计入。v1.9.3 口径：纹理层 = 颗粒/暗角/光晕，photo 层 = S 曲线/
 * 曝光提亮/黑位托底。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const layers = buildGradeLayers(preset);
  const imageLayers = layers.filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + imageLayers;
}
