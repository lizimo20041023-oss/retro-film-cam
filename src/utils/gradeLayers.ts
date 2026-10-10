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

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把一个已解析的预设展开成有序图层数组。
 * 顺序 = 绘制顺序：调色 → 对比度自叠 → 褪色/曝光 → 颗粒 → 暗角 → 漏光。
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

  // ③ 饱和度：saturation 混合会"取颜色的饱和度、保留底图明度"
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

  // ④ 对比度：> 1 用"同一张原图再叠一层 overlay"（自叠就是提对比度），
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

  // ⑤ 褪色：lighten 只抬黑场（暗部变灰、高光不动）—— 真·过期胶片感
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

  // ⑥ 曝光：白 screen 提亮 / 黑 multiply 压暗
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

  // ⑦ 颗粒：PNG 平铺 + overlay
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

  // ⑧ 暗角：PNG 拉伸 + multiply
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

  // ⑨ 漏光：PNG 拉伸 + screen（可左右翻转换边）
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
