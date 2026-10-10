/**
 * 胶片预设表 —— 纯数据。加预设**不需要改任何逻辑代码**。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 参数 → 图层映射（实现在 `src/utils/gradeLayers.ts`，全部是真实存在的 RN 能力）
 * ─────────────────────────────────────────────────────────────────────────
 *  iOS 上 RN 的 `filter` 只支持 brightness / opacity，做不了对比度、饱和度、色温。
 *  所以这里所有调色都是「图层 + mixBlendMode 混合」，Expo Go（新架构）原生支持：
 *
 *   temperature  -1..1  暖橙/冷蓝纯色层，mixBlendMode:'soft-light'，opacity = |v| × 0.9
 *   tint         -1..1  绿/品红纯色层，'soft-light'，opacity = |v| × 0.55
 *   saturation    0..2  < 1：中灰层 'saturation'（去色）；> 1：高饱和色层 'saturation'（加饱和）
 *   contrast      0..2  > 1：**同一个画面再叠一层** 'overlay'（自叠即提对比度）
 *                        < 1：中灰层 'normal'（把画面往灰里压）
 *   fade          0..1  深灰 '#1C1C1C' + 'lighten'：只抬黑场、不糊高光（模拟过期胶片）
 *   exposure     -1..1  > 0 白 'screen' 提亮 / < 0 黑 'multiply' 压暗
 *   grain         0..1  grain.png 平铺 + 'overlay'
 *   vignette      0..1  vignette.png 拉伸 + 'multiply'
 *   lightLeak     0..1  light-leak.png 拉伸 + 'screen'（lightLeakFlip: true 换到左边）
 *
 *  中性值不产生图层：temperature/tint/fade/lightLeak = 0、saturation/contrast = 1、
 *  exposure = 0、grain/vignette 不写就有一点点默认值（见 PRESET_DEFAULTS）。
 *  所以"少写几个字段"= 少几层合成 = 更快，不会出错。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 怎么新增一个预设
 * ─────────────────────────────────────────────────────────────────────────
 * 复制下面任意一条，改 id / name / 数值即可。id 建议英文小写短横线。
 * 想试参数？只改数字，热重载后按快门就能看到成片 —— 不用碰任何渲染代码。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type {
  FilmPreset,
  ResolvedColorGrade,
  ResolvedFilmPreset,
  ResolvedTimestampConfig,
} from '../types';

/** 调色/颗粒/暗角等参数的默认值：不写就用它。 */
export const PRESET_DEFAULTS = {
  temperature: 0,
  tint: 0,
  saturation: 1,
  contrast: 1,
  fade: 0,
  exposure: 0,
  grain: 0.08,
  vignette: 0.18,
  lightLeak: 0,
  lightLeakFlip: false,
  showGuide: true,
  /** 保存前把原图最长边压到 2048 px（省内存，肉眼几乎无损）。0 = 不压缩。 */
  normalizeMaxLongEdge: 2048,
} as const;

/** 日期水印默认值（经典橙色液晶）。 */
export const DEFAULT_TIMESTAMP: Omit<ResolvedTimestampConfig, 'fontFamily' | 'anchor'> = {
  enabled: true,
  format: 'YY MM DD',
  color: '#FF8A00',
  fontSizeRatio: 0.055,
  letterSpacingRatio: 0.14,
  glow: true,
  fontWeight: '700',
  insetRatio: 0.028,
};

export const PRESETS: FilmPreset[] = [
  {
    id: 'retro-400',
    name: 'RETRO 400',
    description: '默认。微暖、中等颗粒、明显暗角，橙色液晶日期（YY MM DD）',
    color: {
      temperature: 0.28,
      tint: -0.04,
      saturation: 0.92,
      contrast: 1.12,
      fade: 0.18,
      exposure: 0.02,
    },
    grain: 0.16,
    vignette: 0.28,
    timestamp: { enabled: true, format: 'YY MM DD', color: '#FF8A00' },
    showGuide: true,
  },
  {
    id: 'gold-200',
    name: 'GOLD 200',
    description: '暖黄日光卷 + 右上角漏光，适合下午逆光人像',
    color: {
      temperature: 0.42,
      tint: -0.06,
      saturation: 1.12,
      contrast: 1.08,
      fade: 0.08,
      exposure: 0.06,
    },
    grain: 0.12,
    vignette: 0.16,
    lightLeak: 0.22,
    lightLeakFlip: false,
    timestamp: { enabled: true, format: 'YY MM DD', color: '#FF8A00' },
  },
  {
    id: 'superia-x',
    name: 'SUPERIA X',
    description: '冷调偏绿，像阴天街拍；饱和度略降',
    color: {
      temperature: -0.24,
      tint: 0.16,
      saturation: 0.98,
      contrast: 1.06,
      fade: 0.1,
      exposure: -0.02,
    },
    grain: 0.14,
    vignette: 0.2,
    timestamp: { enabled: true, format: 'YY MM DD', color: '#FF8A00' },
  },
  {
    id: 'tri-x-400',
    name: 'TRI-X 400',
    description: '黑白：饱和度归零 + 高对比 + 重颗粒；日期改浅灰（演示颜色可配）',
    color: {
      temperature: 0,
      tint: 0,
      saturation: 0,
      contrast: 1.22,
      fade: 0.06,
      exposure: 0.02,
    },
    grain: 0.3,
    vignette: 0.4,
    timestamp: { enabled: true, format: 'YY MM DD', color: '#E6E6E6' },
    showGuide: true,
  },
  {
    id: 'expired-64',
    name: 'EXPIRED 64',
    description: '过期卷：重褪色 + 漏光 + 紫调，日期格式改成 YY-MM-DD',
    color: {
      temperature: 0.15,
      tint: -0.12,
      saturation: 0.78,
      contrast: 0.92,
      fade: 0.42,
      exposure: 0.1,
    },
    grain: 0.24,
    vignette: 0.36,
    lightLeak: 0.34,
    lightLeakFlip: true,
    timestamp: { enabled: true, format: 'YY-MM-DD', color: '#FF8A00' },
  },
  // ↓↓↓ 在这里继续加你的预设 ↓↓↓
];

/** 冷启动用哪个预设。 */
export const DEFAULT_PRESET_ID = 'retro-400';

/** 按 id 找预设下标；找不到返回 0。 */
export function findPresetIndex(id: string): number {
  const index = PRESETS.findIndex((preset) => preset.id === id);
  return index >= 0 ? index : 0;
}

/** 循环取下标（左下角那排预设胶囊用它左右翻）。 */
export function wrapPresetIndex(index: number): number {
  const length = PRESETS.length;
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

/**
 * 把"用户写的预设"补全成"管线要用的预设"。
 * 纯函数、无副作用 —— 这是 `processFilmPhoto` 的第一行，也是单测的第一个断言点。
 */
export function resolvePreset(preset: FilmPreset): ResolvedFilmPreset {
  const color = preset.color;
  const resolvedColor: ResolvedColorGrade = {
    temperature: color.temperature ?? PRESET_DEFAULTS.temperature,
    tint: color.tint ?? PRESET_DEFAULTS.tint,
    saturation: color.saturation ?? PRESET_DEFAULTS.saturation,
    contrast: color.contrast ?? PRESET_DEFAULTS.contrast,
    fade: color.fade ?? PRESET_DEFAULTS.fade,
    exposure: color.exposure ?? PRESET_DEFAULTS.exposure,
  };

  const timestamp = preset.timestamp;
  const resolvedTimestamp: ResolvedTimestampConfig = {
    enabled: timestamp?.enabled ?? DEFAULT_TIMESTAMP.enabled,
    format: timestamp?.format ?? DEFAULT_TIMESTAMP.format,
    color: timestamp?.color ?? DEFAULT_TIMESTAMP.color,
    fontSizeRatio: timestamp?.fontSizeRatio ?? DEFAULT_TIMESTAMP.fontSizeRatio,
    letterSpacingRatio: timestamp?.letterSpacingRatio ?? DEFAULT_TIMESTAMP.letterSpacingRatio,
    glow: timestamp?.glow ?? DEFAULT_TIMESTAMP.glow,
    fontWeight: timestamp?.fontWeight ?? DEFAULT_TIMESTAMP.fontWeight,
    // null = 交给 useFilmFonts 决定系统等宽字体
    fontFamily: timestamp?.fontFamily ?? null,
    // null = 用相框自带的 defaultTimestampAnchor
    anchor: timestamp?.anchor ?? null,
    insetRatio: timestamp?.insetRatio ?? DEFAULT_TIMESTAMP.insetRatio,
  };

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? '',
    color: resolvedColor,
    grain: preset.grain ?? PRESET_DEFAULTS.grain,
    vignette: preset.vignette ?? PRESET_DEFAULTS.vignette,
    lightLeak: preset.lightLeak ?? PRESET_DEFAULTS.lightLeak,
    lightLeakFlip: preset.lightLeakFlip ?? PRESET_DEFAULTS.lightLeakFlip,
    timestamp: resolvedTimestamp,
    showGuide: preset.showGuide ?? PRESET_DEFAULTS.showGuide,
    normalizeMaxLongEdge: preset.normalizeMaxLongEdge ?? PRESET_DEFAULTS.normalizeMaxLongEdge,
  };
}
