/**
 * 零模糊同源胶片管线（v1.9.4「真·德味明度色度解耦引擎」）
 *
 * ## 一、v1.9.4 的手术目标（用户 m10195 实拍翻车）
 *
 * v1.9.3 的 `color-burn` 色彩密度层 + 同源 overlay S 曲线把「浓黑油润」做出来了，
 * 但 overlay 在 128 分界线对 R/G/B 通道**各自独立**压暗/提亮：中性浅灰（R118 G124 B134）
 * 被撕裂成剧毒青蓝/妖艳紫蓝，color-burn 再叠一层后彻底失控。根因不是剂量，是
 * **明度与色度没有解耦**。
 *
 * v1.9.4 的解法：
 *   ① screen 提亮先托高光（槽 1）；
 *   ② overlay S 曲线做刀刻明暗雕塑（槽 2）——这一步会改色相；
 *   ③ **新增同源 `color` 色度锁**（槽 3）：100% 保留槽 1/2 得到的明度，把色相/饱和度
 *      按权重重锁回原图（彩色卷 opacity 0.54~0.68；黑白卷 = `#808080 color 1.0`）；
 *   ④ 染色层只许 `soft-light`（槽 4~7）；
 *   ⑤ 最后才是 multiply 暗角（中心 74% 透明）。
 *
 * 同时**彻底删除** `color-burn` / `color-density` 图层与 `mono-desaturate` 独立层：
 * 黑白不再靠「最后抽色」，而是由槽 3 的 0 饱和度色度锁直接承担（层序在全部染色之后 ⇒
 * 暗部染色与高光分色都被中性化 ⇒ 真黑白 R=G=B）。
 *
 * ## 二、零模糊 photo 层（全部 `blurRadius: 0`，严禁任何模糊）
 *
 * 把**同一张底片、blurRadius=0** 的副本以不同混合模式叠回自己（Y 为 0~1 编码值）：
 *
 *   1. `exposure-lift`  screen，opacity = clamp(lift(+Δ 或 target), 0, 0.28)
 *        Y' = 2Y − Y²                  Y=0 → 0：黑场一个像素都不起雾；Y=1 → 1。
 *   2. `s-curve-contrast` overlay，opacity = clamp(sCurve(+Δ), 0, 0.60)
 *        Y < 0.5：Y' = 2Y²；Y ≥ 0.5：Y' = 1 − 2(1−Y)²
 *        f(0)=0、f(0.5)=0.5、f(1)=1 —— 黑场白场都不动。
 *   3. `chroma-lock`   color，opacity = chromaLock 夹 [0.10, 0.22]（v2.1.0 下调）
 *        color(cb, cs) = 用 cb 的明度 + cs 的色相/饱和度。
 *        cs 与 cb 是同一张底片 ⇒ 明度来自「槽 1/2 雕塑后的自己」，色度来自**原图**。
 *        这就是明度/色度解耦：overlay 撕裂色相的问题被这一步按权重锁回原图。
 *   4. `shadow-crush`  multiply，opacity = clamp(crush, 0, 0.12)（仅 TX-400 0.10）
 *        Y' = Y²                       黑位托底。
 *
 * 共同点：都过 (0,0) 与 (1,1) —— 零模糊管线铁律。任何不满足这对不动点的混合
 * （normal 色纸、模糊扩散、exclusion 等）都会在纯黑或纯白处留下偏移（雾/脏/乳白）。
 *
 * > 历史注：v1.9.1 的 14px 屏幕模糊正是「乳白雾」的根因（已彻底删除，本管线零模糊）；
 * > 同源层复用同一张底片副本、`blurRadius: 0`，成片合成仍走 `react-native-view-shot`
 * > 的 `drawViewHierarchy` 截帧（与 v1.9.2 口径一致）。
 *
 * ## 三、层序（v1.9.4 冻结层序；v2.1.0 只上调封顶，不改层序；0 值层不出现）
 *
 *   0  base 原图（宿主渲染，不在 layers 里，100% 刀锐）
 *   1  exposure-lift      photo   screen      blur 0  ≤ 0.28（夜景 target 0.06 覆盖）
 *   2  s-curve-contrast   photo   overlay     blur 0  ≤ 0.62（v2.1.0 上调；德味核心反差）
 *   3  chroma-lock        photo   color       blur 0  彩色夹 [0.10,0.22]
 *                         color   color       #808080 / opacity 1（mono 卷）
 *   4  temperature        color   soft-light  色温亮色纸（|v| × 0.22 ≤ 0.50）
 *   5  tint               color   soft-light  色调亮色纸（|v| × 0.22 ≤ 0.50）
 *   6  shadow-tint        color   soft-light  ≤ 0.50
 *   7  highlight-tint     color   soft-light  ≤ 0.50
 *   8  shadow-crush       photo   multiply    blur 0  ≤ 0.12（仅 >0.005，TX-400 0.10）
 *   9  halation           texture lightLeak screen  ≤ 0.04（仅 >0.005，CS-800T）
 *  10  grain              texture grain       soft-light  stretch  档位绝对不透明度 ≤ 0.16
 *  11  vignette           texture stretch     multiply  ≤ 0.28（中心 74% 全透明）
 *  12  light-leak         texture             screen    ≤ 0.10（九卷 0）
 *
 * ## 四、化学染色层的铁律
 *
 * 染色层（槽 4~7）只允许 `soft-light`（`sanitizeTintBlendMode` 恒返回它）。
 * soft-light 在中灰附近温和作用、在黑场/白场附近收敛，不会像 exclusion / multiply /
 * screen 那样污染黑场白场 —— v1.9.0 的 `exclusion` 暗部染色正是「黑场发灰」的来源。
 * `color-burn` / `color-density` 在 v1.9.4 已彻底删除；`color` 模式只出现在 chroma-lock。
 *
 * ## 五、自适应增量（见 adaptiveGrade.ts）
 *
 * 有场景统计时，planAdaptiveGrade 给出四场景增量，叠到本管线对应层：
 *   sCurveContrast + sCurveContrastDelta        （四场景只加不减，夹 [0,0.20]，再夹 0.62）
 *   exposureLift：`exposureLiftTarget !== null` 时**整体覆盖**（dark = 0.06）；
 *                 否则 + exposureLiftDelta（只有 bright +0.06），再夹 0.28
 *   vignette + vignetteDelta                    （再夹 0.28）
 *   halation + halationDelta                    （恒 0：光晕只来自预设静态值）
 *   chromaLock / shadow·highlight 染色不乘任何场景倍率（契约 §1 逐字口径）
 * 场景不可用（scene == null 或样本不足）时 plan 为 null，层表与静态预设逐字节一致。
 *
 * ## 六、live（取景器）面为什么不做 photo 层
 *
 * 取景器是 30~60fps 的实时合成，每帧全屏混合 + 截图是纯粹烧 GPU 的负载 ——
 * v1.8.6 的「发热纪律」要求取景器只保留最便宜的色纸/纹理层。因此 live 面：
 *   · 滤掉所有 photo 层（含彩色卷的 chroma-lock；S 曲线/曝光提亮/黑位托底同样不进 live）；
 *   · 滤掉颗粒纹理层；
 *   · 丢弃 shadow-tint / highlight-tint 两条全屏染色层；
 *   · 彩卷把 temperature / tint 合并为一条卷色纸；EK-100 原本没有这两层，补一条；
 *   · mono 卷的 `#808080 color` 色度锁层保留 opacity 1（黑白卷取景器必须当场看到黑白）；
 *   · halation / 暗角 / 漏光原样保留。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
import type { BlendMode, GradeLayer, ResolvedFilmPreset } from '../types';
import { applyAdaptiveColor, planAdaptiveGrade } from './adaptiveGrade';

/* ========================================================================== *
 * 冻结常量（v1.9.4 配方；探针按名字逐项核对，改数值必须同步改探针）
 * ========================================================================== */

/** 色温暖端亮色纸（soft-light，RGB 均值 226.3）。 */
const WARM_SOFT = '#FFE2C2';
/** 色温冷端亮色纸（soft-light，RGB 均值 232.0）。 */
const COOL_SOFT = '#C9E6FF';
/** 色调偏绿端亮色纸（soft-light，RGB 均值 232.0）。 */
const TINT_GREEN_SOFT = '#D2F6C8';
/** 色调偏品红端亮色纸（soft-light，RGB 均值 233.3）。 */
const TINT_MAGENTA_SOFT = '#FFD1F2';
/** 真黑白色度锁载体（`color` 混合模式只取它 0 饱和度的色相）。 */
const NEUTRAL_GRAY = '#808080';
/** 卤化光晕的暖红载体（v1.9.4 光晕仍走 lightLeak 贴图；保留导出避免探针 import 断裂）。 */
export const HALATION_RED = '#FF4028';

/**
 * 零模糊真 S 曲线层 opacity 上限（v1.9.4 = 0.60；**v2.1.0 = 0.62**）。
 *
 * 九卷 0.30~0.62：overlay 在暗部 2Y² 踩出浓黑、亮部推亮，黑场/白场都不动。
 * 0.62 是 v2.1.0 手术一（强性格预设）的最终封顶（含场景增量），与
 * `PRESET_INTENSITY_LIMITS.sCurveContrast` 必须逐字一致；再往上会把暗部细节压死
 * 且撕裂色相更狠。
 */
export const S_CURVE_OPACITY_MAX = 0.62;

/** 零模糊曝光提亮层 opacity 上限（v1.9.4 = 0.28；九卷 0~0.28，HP-400 = 0 不出层）。 */
export const EXPOSURE_LIFT_OPACITY_MAX = 0.28;

/**
 * 同源 color 色度锁的 opacity 下限（彩色卷，v2.1.0 = 0.10）。
 *
 * v1.9.4 时代 0.54 是「必须锁住」的最低剂量；v2.1.0 手术一把九卷化学染色
 * 加重到 opacity 0.18~0.34 后，0.54 的色度锁会把染色整体洗回原图色度 ——
 * 所以**下调到 0.10~0.22**：只保留「防 128 分界线通道撕裂」的作用，不再洗染色。
 * 下限 0.10 = 仍能压住 overlay 撕裂的最小剂量；上限 0.22 =
 * 与 `PRESET_INTENSITY_LIMITS.chromaLock` 一致的引擎硬上限。
 */
export const CHROMA_LOCK_OPACITY_MIN = 0.1;
/** 同源 color 色度锁的 opacity 上限（彩色卷，v2.1.0 = 0.22）。 */
export const CHROMA_LOCK_OPACITY_MAX = 0.22;

/**
 * 色温/色调/暗部染色/高光染色四条 color 层共用的 opacity 上限。
 *
 * v1.9.4 = 0.20；**v2.1.0 = 0.50**（九卷化学染色提到 0.18~0.34，旧 0.20 封顶
 * 会把暗部/高光分色削平，九卷"换卷没区别"的根因之一）。
 * 与 `PRESET_INTENSITY_LIMITS.tintOpacity` 逐字一致。
 */
export const TINT_OPACITY_MAX = 0.5;

/** 黑位托底层 opacity 硬上限（v1.9.4 = 0.05；**v2.1.0 = 0.12**，仅 TX-400 = 0.10）。 */
export const SHADOW_CRUSH_OPACITY_MAX = 0.12;

/** 暖红光晕渲染不透明度上限（v1.9.4：只有 CS-800T 的 0.04）。 */
export const HALATION_OPACITY_MAX = 0.04;

/** 暗角 opacity 上限（自适应加 vignetteDelta 后；九卷静态值 0.16~0.28）。 */
export const VIGNETTE_OPACITY_MAX = 0.28;

/** 色温层每 1.0 强度对应的 opacity（|temperature| × 0.22）。 */
export const TEMPERATURE_GAIN = 0.22;
/** 色调层每 1.0 强度对应的 opacity（|tint| × 0.22）。 */
export const TINT_GAIN = 0.22;

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
 * 把预设里写来的染色混合模式消毒成 v1.9.4 白名单：**恒 `soft-light`**。
 *
 * 为什么必须消毒（不是「建议」）：exclusion / multiply / screen / difference 这些模式
 * 在纯黑或纯白处不收敛 —— 暗部染色用 exclusion 会把黑场抬成灰，用 multiply 会把白场
 * 压脏。用户 m08443 的「蒙一层廉价 CCD 柔光雾」有相当一部分来自这两条染色层。
 *
 * v1.9.4：`overlay` 也从染色层白名单里移除（overlay 在 128 分界线撕裂 R/G/B 通道，
 * 正是本次实拍翻车的根因之一）；`color` 只属于 chroma-lock 层，不参与染色消毒。
 */
export function sanitizeTintBlendMode(_mode: BlendMode): 'soft-light' {
  return 'soft-light';
}

/* ========================================================================== *
 * buildGradeLayers —— v1.9.4 明度/色度解耦管线
 * ========================================================================== */

/**
 * 由预设构造成片/合成的完整层栈（composite 面）。
 *
 * 层序见文件头「层序」（v1.9.4 冻结，探针按 key 逐项核对）。
 * 槽 1/2/3/8 是 `kind:'photo'` 的同源零模糊照片副本（由 FilmLookLayers 用 photoUri
 * 渲染，`blurRadius` 显式 0）；槽 4~7 是 soft-light 色纸；槽 9~12 是物理介质纹理。
 *
 * 自适应：planAdaptiveGrade(preset.scene, preset) 命中时把场景增量叠进层 opacity
 * （dark 的 exposureLift 被 `exposureLiftTarget = 0.06` 整体覆盖），并把
 * applyAdaptiveColor 的白平衡偏移应用到槽 4/5 的输入色温/色调上。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  // 自适应计划：scene 不可用时为 null（applyAdaptiveColor 原样返回，层表 == 静态预设）。
  const adaptive = planAdaptiveGrade(preset.scene, preset);
  const color = applyAdaptiveColor(preset.color, adaptive);

  const layers: GradeLayer[] = [];

  /* 1 零模糊曝光提亮 · photo screen blur 0（2Y−Y²，只在高光做延展） ------------- */
  // dark 场景：exposureLiftTarget 非 null 时整体覆盖（0.06，略托高光但绝不起雾）。
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

  /* 2 零模糊真 S 曲线 · photo overlay blur 0（2Y² / 1−2(1−Y)²，德味核心反差） --- */
  const sCurveBase =
    clamp01(color.sCurveContrast) + (adaptive === null ? 0 : adaptive.sCurveContrastDelta);
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

  /* 3 同源色度锁 · photo color blur 0（保留槽 1/2 明度，色相/饱和度锁回原图） ----- */
  // 彩色卷：photo 副本 + `color` 混合（明度取底图、色度取源图 —— 同源即原始色度）。
  // 黑白卷：`#808080 color 1.0`（源图 0 饱和度 ⇒ 只留明度 ⇒ 真黑白）。
  if (preset.mono) {
    layers.push({
      kind: 'color',
      key: 'chroma-lock',
      label: '真黑白色度锁（#808080 · color · opacity 1）',
      color: NEUTRAL_GRAY,
      blendMode: 'color',
      opacity: 1,
    });
  } else {
    const chromaLock = clamp(color.chromaLock, CHROMA_LOCK_OPACITY_MIN, CHROMA_LOCK_OPACITY_MAX);
    layers.push({
      kind: 'photo',
      key: 'chroma-lock',
      label: `色度锁 ${round2(chromaLock)}（同源 color · 保留明度/锁回色度）`,
      blendMode: 'color',
      opacity: round4(chromaLock),
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
      opacity: round4(clamp(Math.abs(temperature) * TEMPERATURE_GAIN, 0, TINT_OPACITY_MAX)),
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
      opacity: round4(clamp(Math.abs(tint) * TINT_GAIN, 0, TINT_OPACITY_MAX)),
    });
  }

  /* 6 暗部化学染色（v1.9.4：只允许 soft-light） ---------------------------- */
  const shadowTintOpacity = clamp01(color.shadowTintOpacity);
  if (color.shadowTint.length > 0 && shadowTintOpacity > 0.01) {
    const blendMode = sanitizeTintBlendMode(color.shadowTintBlendMode);
    const opacity = clamp(shadowTintOpacity, 0, TINT_OPACITY_MAX);
    layers.push({
      kind: 'color',
      key: 'shadow-tint',
      label: `暗部染色 ${blendMode} ${round2(opacity)}`,
      color: color.shadowTint,
      blendMode,
      opacity: round4(opacity),
    });
  }

  /* 7 高光化学染色（v1.9.4：只允许 soft-light） ---------------------------- */
  const highlightTintOpacity = clamp01(color.highlightTintOpacity);
  if (color.highlightTint.length > 0 && highlightTintOpacity > 0.01) {
    const blendMode = sanitizeTintBlendMode(color.highlightTintBlendMode);
    const opacity = clamp(highlightTintOpacity, 0, TINT_OPACITY_MAX);
    layers.push({
      kind: 'color',
      key: 'highlight-tint',
      label: `高光染色 ${blendMode} ${round2(opacity)}`,
      color: color.highlightTint,
      blendMode,
      opacity: round4(opacity),
    });
  }

  /* 8 黑位托底 · photo multiply blur 0（Y²，仅 TX-400 的 0.10；封顶 0.12） --- */
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

  /* 9 卤化光晕 · texture lightLeak screen（v1.9.4 只有 CS-800T 的 0.04） ----- */
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

  /* 10 颗粒（v1.9.4：全画幅非周期单张银盐板 soft-light；档位见 grain.ts） --- */
  // 档位由全局设置写进预设 grain（0.04/0.075/0.115/0.16），clamp 上限 0.16；ek-100 永不产颗粒。
  // v1.9.4：禁止平铺 —— 单张贴图 resizeMode 'stretch' 铺满全画幅。
  if (preset.grain > 0 && !GRAINLESS_PRESET_IDS.has(preset.id)) {
    const opacity = grainLayerOpacity(preset.grain);
    if (opacity > 0) {
      layers.push({
        kind: 'texture',
        key: 'grain',
        label: `颗粒 ${round2(preset.grain)}`,
        textureId: 'grain',
        resizeMode: 'stretch',
        blendMode: 'soft-light',
        opacity,
      });
    }
  }

  /* 11 暗角（v1.9.4 上限 0.28；贴图中心 74% 半径透明，Lead 重烤） ---------- */
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

  /* 12 漏光（screen，排最后；九卷 lightLeak 仍为 0 → 不出层） ---------------- */
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
 * v1.9.4：color-density 已随图层一起删除；shadow-tint / highlight-tint 两条全屏
 * 染色层仍只用于成片路径，取景器用一条卷色纸示意。
 */
const LIVE_DROPPED_COLOR_LAYER_KEYS = new Set(['shadow-tint', 'highlight-tint']);

/** live 面需要压缩到 liveLookOpacity 的色纸层。 */
const LIVE_COMPRESSED_COLOR_LAYER_KEYS = new Set(['temperature', 'tint']);

/**
 * A single stock dye replaces the old faint white-balance paper in the live
 * view. It gives each color stock a recognizable cue without asking iOS to
 * composite a photo copy, and keeps live color layers at one. The final
 * photograph still gets its full 33³ LUT in the file renderer.
 */
const LIVE_STOCK_DYES: Readonly<Record<string, string>> = {
  'um-400': '#8795A8',
  'gd-200': '#E5C56C',
  'pt-400': '#E8B7AD',
  'cp-200': '#A88D5C',
  'fj-400': '#73B6A2',
  'fg-400': '#639589',
  'ek-100': '#B39EAA',
  'rb-100': '#83A4BA',
  'cs-800t': '#638EC2',
};

function liveStockDye(preset: ResolvedFilmPreset, hex: string): GradeLayer {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const temperature = preset.color.temperature ?? 0;
  const tint = preset.color.tint ?? 0;
  const byte = (value: number): string => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  const color = `#${byte(red + temperature * 48 - tint * 10)}${byte(green + tint * 42)}${byte(blue - temperature * 48 - tint * 10)}`;
  return {
    kind: 'color',
    key: 'live-stock-dye',
    label: `取景器卷色 ${preset.name}`,
    color,
    blendMode: 'soft-light',
    opacity: round4(clamp((preset.color.shadowTintOpacity ?? 0) * 0.8, 0.06, 0.28)),
  };
}

/**
 * 构造某个面（composite / live）实际要渲染的层表。
 *
 * - composite：`buildGradeLayers` 原样返回（成片/合成/贴纸截图用）。
 * - live：滤掉**所有** `kind:'photo'` 同源层（曝光提亮/S 曲线/彩色卷色度锁/黑位托底都不进
 *   取景器 —— 每帧全屏混合 + 截图是纯烧 GPU，v1.8.6 发热纪律）+ 颗粒纹理层 +
 *   shadow-tint/highlight-tint 两条全屏染色层；彩卷将 temperature/tint 合成一条卷色纸，
 *   未定义卷色时仍走 liveLookOpacity；mono 卷的 #808080 色度锁层保留 opacity 1
 *   （黑白卷取景器必须当场是黑白）；halation / 暗角 / 漏光保留原 opacity。
 */
export function planFilmLooks(
  preset: ResolvedFilmPreset,
  surface: FilmLookSurface = 'composite',
): GradeLayer[] {
  const layers = buildGradeLayers(preset);
  if (surface === 'composite') return layers;

  const liveLayers: GradeLayer[] = [];
  const stockDye = LIVE_STOCK_DYES[preset.id];
  let dyeAdded = false;
  for (const layer of layers) {
    // 同源 photo 层：取景器一律不画（每帧全屏混合 = 发热）。
    if (layer.kind === 'photo') continue;
    // 颗粒：v1.8.3 起取景器不画。
    if (layer.kind === 'texture' && layer.textureId === 'grain') continue;
    // 全屏化学染色层：live 丢弃（降发热）。
    if (layer.kind === 'color' && LIVE_DROPPED_COLOR_LAYER_KEYS.has(layer.key)) continue;
    if (layer.kind === 'color' && LIVE_COMPRESSED_COLOR_LAYER_KEYS.has(layer.key)) {
      if (stockDye !== undefined) {
        if (!dyeAdded) {
          liveLayers.push(liveStockDye(preset, stockDye));
          dyeAdded = true;
        }
      } else {
        liveLayers.push({ ...layer, opacity: liveLookOpacity(layer.opacity) });
      }
      continue;
    }
    // chroma-lock（mono 灰层）/ halation / 暗角 / 漏光：原样保留。
    liveLayers.push(layer);
  }
  // Some stocks have no temperature/tint layer (EK-100); place their single
  // stock dye before textures so the live view still shows the selected roll.
  if (stockDye !== undefined && !dyeAdded) {
    const firstTexture = liveLayers.findIndex((layer) => layer.kind === 'texture');
    const index = firstTexture < 0 ? liveLayers.length : firstTexture;
    liveLayers.splice(index, 0, liveStockDye(preset, stockDye));
  }
  return liveLayers;
}

/**
 * 这张卷在「曝光/画质流水线」里需要预热的图片数：背景 2 张 + 纹理层数 + 同源 photo 层数。
 *
 * 背景 2 = 相框皮肤 + 漏光/纸纹底（见 useFilmStage）；纹理层和 photo 层都要等图片 onLoad
 * 才算「就绪」，所以都需要计入。v1.9.4 口径：纹理层 = 颗粒/暗角/光晕，photo 层 =
 * 曝光提亮/S 曲线/彩色卷色度锁/黑位托底。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const layers = buildGradeLayers(preset);
  const imageLayers = layers.filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + imageLayers;
}
