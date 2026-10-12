/**
 * 预设数值 → 合成图层（纯函数，零依赖，可以直接单测）。
 *
 * 这里是整个 App 唯一"把调色参数翻译成 RN 能力"的地方。
 * 换滤镜风格 = 改数值；加新维度（比如高光染色）= 在这里多 push 一层。
 *
 * RN 能力边界（已核实）：
 * - `mixBlendMode` 在 New Architecture 上 iOS/Android 都可用（Expo Go 只跑新架构）；
 * - `filter` 在 iOS 上**只有 brightness / opacity**，所以对比度/饱和度不能靠它；
 * - 因此对比度用"同一画面再叠一层 overlay"实现（自叠 = 提对比），
 *   饱和度用"中灰/高饱和色 + saturation 混合"实现，色温色调用 soft-light 色层实现。
 *
 * 图层顺序（= 绘制顺序，改顺序会改结果）：
 *   ① 色温 ② 色调 ③ 分离色调 ④ 饱和度 ⑤ 对比度 ⑥ 褪色 ⑦ 曝光
 *   ⑧ 光晕 ⑨ 颗粒 ⑩ 灰尘 ⑪ 暗角 ⑫ 漏光
 * 前七层负责"色"，后五层负责"质"。
 * （曾经在 ⑧ 和 ⑨ 之间还有一层 `chroma-noise` 彩噪贴图，已在 2026-10-12 彻底删除，
 *   理由见下面 ⑨ 处的注释 —— 那一层是满屏紫绿伪色的唯一来源。）
 */
import type { GradeLayer, ResolvedFilmPreset } from '../types';

/* 色层用的基准色（都是半透明混出去，所以色值本身可以写得比较浓） */
/** 暖色（色温 > 0）。 */
const WARM = '#FF9640';
/** 冷色（色温 < 0）。 */
const COOL = '#4C8DFF';
/** 绿（tint > 0）。 */
const TINT_GREEN = '#38A85C';
/** 品红（tint < 0）。 */
const TINT_MAGENTA = '#C05BD8';
/** 中灰：saturation 混合时用来去色。 */
const NEUTRAL_GRAY = '#808080';
/** 高饱和红：saturation 混合时用来加饱和。 */
const SATURATE_ACCENT = '#FF3B30';
/** 抬黑场用的深灰（不是纯黑，避免死黑）。 */
const FADE_LIFT = '#1C1C1C';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
/**
 * 分离色调的暗部色：极深的青蓝。配 lighten 混合 → 只把**比它更暗**的像素抬成这个色，
 * 所以中间调和高光完全不受影响。
 */
const COOL_SHADOW = '#182E3E';
/** 分离色调的高光色：暖白。配 darken 混合 → 只把比它更亮的像素压成暖白。 */
const WARM_HIGHLIGHT = '#FFF2D9';
/**
 * 光晕用的深暖色。配 color-dodge：`out = base / (1 - src)`，
 * 于是偏移量正比于 base —— 暗部几乎不动、高光被推暖推亮，正是 halation 的样子。
 * （RN 的 Image 没有 blurRadius，所以用不了"模糊后叠回去"那种真泛光；
 *   色层版只保留"高光变暖发亮"这个最关键的观感。）
 */
const HALATION = '#1A0A00';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把一个已解析的预设展开成有序图层数组。
 * 顺序 = 绘制顺序：调色 → 密度 → 质感（颗粒/灰尘）→ 光学（暗角/漏光）。
 * 中性参数不会产生图层，所以"没调的项"零开销。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  const layers: GradeLayer[] = [];
  const color = preset.color;

  // ① 色温：暖橙 / 冷蓝，soft-light 混一层就够了
  if (Math.abs(color.temperature) > 0.01) {
    const warm = color.temperature > 0;
    layers.push({
      kind: 'color',
      key: 'temperature',
      label: `色温 ${warm ? '暖' : '冷'} ${round2(Math.abs(color.temperature))}`,
      color: warm ? WARM : COOL,
      blendMode: 'soft-light',
      opacity: clamp01(Math.abs(color.temperature) * 0.9),
    });
  }

  // ② 色调：偏绿 / 偏品红
  if (Math.abs(color.tint) > 0.01) {
    const green = color.tint > 0;
    layers.push({
      kind: 'color',
      key: 'tint',
      label: `色调 ${green ? '绿' : '品红'} ${round2(Math.abs(color.tint))}`,
      color: green ? TINT_GREEN : TINT_MAGENTA,
      blendMode: 'soft-light',
      opacity: clamp01(Math.abs(color.tint) * 0.55),
    });
  }

  // ③ 分离色调：暗部压青蓝（lighten 只碰暗部）+ 高光提暖白（darken 只碰高光）。
  //    这一层是"数码味 → 胶片/CCD 味"性价比最高的一步，中间调几乎不动。
  if (color.splitTone > 0.01) {
    const tone = clamp01(color.splitTone);
    layers.push({
      kind: 'color',
      key: 'split-shadow',
      label: `暗部青蓝 ${round2(tone)}`,
      color: COOL_SHADOW,
      blendMode: 'lighten',
      opacity: clamp01(tone),
    });
    layers.push({
      kind: 'color',
      key: 'split-highlight',
      label: `高光暖白 ${round2(tone)}`,
      color: WARM_HIGHLIGHT,
      blendMode: 'darken',
      opacity: clamp01(tone * 0.9),
    });
  }

  // ④ 饱和度：saturation 混合会"取颜色的饱和度、保留底图明度"
  if (color.saturation < 0.99) {
    layers.push({
      kind: 'color',
      key: 'desaturate',
      label: `去饱和 ${round2(1 - color.saturation)}`,
      color: NEUTRAL_GRAY,
      blendMode: 'saturation',
      opacity: clamp01(1 - color.saturation),
    });
  } else if (color.saturation > 1.01) {
    layers.push({
      kind: 'color',
      key: 'saturate',
      label: `加饱和 ${round2(color.saturation - 1)}`,
      color: SATURATE_ACCENT,
      blendMode: 'saturation',
      opacity: clamp01((color.saturation - 1) * 0.85),
    });
  }

  // ⑤ 对比度：> 1 用"同一张原图再叠一层 overlay"（自叠就是提对比度），
  //    < 1 用中灰 normal 把画面往灰里压
  if (color.contrast > 1.01) {
    layers.push({
      kind: 'photo',
      key: 'contrast-boost',
      label: `提对比度 ${round2(color.contrast)}`,
      blendMode: 'overlay',
      opacity: clamp01(color.contrast - 1),
    });
  } else if (color.contrast < 0.99) {
    layers.push({
      kind: 'color',
      key: 'contrast-soften',
      label: `压对比度 ${round2(color.contrast)}`,
      color: NEUTRAL_GRAY,
      blendMode: 'normal',
      opacity: clamp01((1 - color.contrast) * 0.9),
    });
  }

  // ⑥ 褪色：lighten 只抬黑场（暗部变灰、高光不动）—— 真·过期胶片感
  if (color.fade > 0.01) {
    layers.push({
      kind: 'color',
      key: 'fade',
      label: `褪色 ${round2(color.fade)}`,
      color: FADE_LIFT,
      blendMode: 'lighten',
      opacity: clamp01(color.fade),
    });
  }

  // ⑦ 曝光：白 screen 提亮 / 黑 multiply 压暗
  if (color.exposure > 0.01) {
    layers.push({
      kind: 'color',
      key: 'exposure-up',
      label: `曝光 +${round2(color.exposure)}`,
      color: WHITE,
      blendMode: 'screen',
      opacity: clamp01(color.exposure * 0.35),
    });
  } else if (color.exposure < -0.01) {
    layers.push({
      kind: 'color',
      key: 'exposure-down',
      label: `曝光 ${round2(color.exposure)}`,
      color: BLACK,
      blendMode: 'multiply',
      opacity: clamp01(-color.exposure * 0.45),
    });
  }

  // ⑧ 光晕：深暖色 + color-dodge，只在高光显形（见 HALATION 注释）
  if (color.bloom > 0.01) {
    layers.push({
      kind: 'color',
      key: 'bloom',
      label: `光晕 ${round2(color.bloom)}`,
      color: HALATION,
      blendMode: 'color-dodge',
      opacity: clamp01(color.bloom),
    });
  }

  // ⑨ 颗粒：PNG 平铺 + overlay（overlay 在中间调最强、暗部高光自然变弱，和胶片一致）
  //
  // ⚠️ 这里曾经在它前面放过一层预烘焙的彩噪贴图（`chroma-noise.png`，品红↔绿交替的块状色斑），
  // 只被 CCD-CYBER / DIGI-02 两款用 `grainChroma` 打开。它就是"画面严重彩噪与紫绿噪波"的元凶：
  // 那张贴图 `|R-G| = 49.3`、`|G-B| = 34.6`，平铺 + overlay 之后满屏紫绿伪色，用户一眼就看出来了。
  // 已**彻底删除**（不是调小）：颗粒只走 `grain`，而 `grain.png` 三通道逐像素恒等
  // （实测 |R-G| = |R-B| = |G-B| = 0）—— 这就是绝无红绿紫伪色的保证。
  // 想再要"CCD 味"，请用 `splitTone` + `bloom` + 高对比，不要往合成栈里塞彩色噪声。
  if (preset.grain > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'grain',
      label: `颗粒 ${round2(preset.grain)}`,
      textureId: 'grain',
      resizeMode: 'repeat',
      blendMode: 'overlay',
      opacity: clamp01(preset.grain),
    });
  }

  // ⑩ 灰尘与划痕：screen 只加亮点，暗部什么都不加 —— 老扫描件那种"不干净"
  if (preset.dust > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'dust',
      label: `灰尘 ${round2(preset.dust)}`,
      textureId: 'dust',
      resizeMode: 'repeat',
      blendMode: 'screen',
      opacity: clamp01(preset.dust),
    });
  }

  // ⑪ 暗角：PNG 拉伸 + multiply
  if (preset.vignette > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'vignette',
      label: `暗角 ${round2(preset.vignette)}`,
      textureId: 'vignette',
      resizeMode: 'stretch',
      blendMode: 'multiply',
      opacity: clamp01(preset.vignette),
    });
  }

  // ⑫ 漏光：PNG 拉伸 + screen（可左右翻转换边）
  if (preset.lightLeak > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'light-leak',
      label: `漏光 ${round2(preset.lightLeak)}${preset.lightLeakFlip ? '（镜像）' : ''}`,
      textureId: 'lightLeak',
      resizeMode: 'stretch',
      blendMode: 'screen',
      opacity: clamp01(preset.lightLeak),
      flipX: preset.lightLeakFlip,
    });
  }

  return layers;
}

/**
 * 合成视图需要单独等几张图片 onLoad（决定什么时候可以截图）。
 * 照片 1 张 + 相框 1 张 + 每个纹理层 1 张。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  return 2 + buildGradeLayers(preset).filter((layer) => layer.kind === 'texture').length;
}
