/**
 * AUTO 场景分类与选卷。自动强度在 70%–85% 之间，手动档位保持用户选择。
 * 规则只使用 SceneStats，照片像素处理由独立渲染管线完成。
 */
import type { PresetIntensityTier, SceneStats } from '../types';
import type { LutStockId } from '../constants/filmRender';
import {
  clampIntensityScale,
  intensityPercentText,
  intensityScaleForTier,
  INTENSITY_AUTO_MAX,
  INTENSITY_AUTO_MIN,
} from '../constants/intensity';

/** 场景匹配结果。 */
export interface StockRecommendation {
  /** 实际生效的胶卷 id（十一卷之一，永远不是 `'auto'`）。 */
  stockId: LutStockId;
  /** 渲染侧全局风格乘数：AUTO 模式 0.70~0.95，手动档位 0.35~1.00。 */
  intensityScale: number;
  /** 命中的场景类型，UI/探针用来解释「为什么选这卷」。 */
  sceneKind: SceneMatchSceneKind;
  /** 底片是否由 AUTO 模式选出（false = 用户手动指定了卷）。 */
  stockAuto: boolean;
  /** 强度是否由 AUTO 模式决定（false = 用户手动档位）。 */
  intensityAuto: boolean;
  /**
   * 成片左下角徽标文本（`null` = 不需要画）：
   * - AUTO 底片：`AUTO -> UM-400 · 80%`
   * - 手动底片 + AUTO 强度：`UM-400 · AUTO 80%`
   */
  label: string | null;
  /** 匹配理由（中文短句，调试/无障碍文案用）。 */
  reason: string;
}

/** 场景分类（用户 m03050 手术三的 6 大场景 + 兜底）。 */
export type SceneMatchSceneKind =
  | 'night'
  | 'bright-highkey'
  | 'backlight'
  | 'cool-green'
  | 'golden'
  | 'flat-indoor'
  | 'neutral';

/** AUTO 模式下每个场景选哪卷。 */
const AUTO_STOCK_BY_SCENE: Readonly<Record<SceneMatchSceneKind, LutStockId>> = {
  night: 'cs-800t',
  'bright-highkey': 'pt-400',
  backlight: 'ek-100',
  'cool-green': 'fg-400',
  golden: 'gd-200',
  'flat-indoor': 'um-400',
  neutral: 'pt-400',
};

/** AUTO 强度：按场景取 70%~85%（与 `INTENSITY_AUTO_MIN/MAX` 同步）。 */
const AUTO_INTENSITY_BY_SCENE: Readonly<Record<SceneMatchSceneKind, number>> = {
  night: 0.8,
  'bright-highkey': 0.7,
  backlight: 0.78,
  'cool-green': 0.74,
  golden: 0.76,
  'flat-indoor': 0.8,
  neutral: 0.72,
};

/** 场景分类的优先级（先命中先赢）。 */
const SCENE_ORDER: readonly SceneMatchSceneKind[] = [
  'night',
  'bright-highkey',
  'backlight',
  'cool-green',
  'golden',
  'flat-indoor',
];

/** 可选的彩色卷；AUTO 模式也从这里识别手动选卷。 */
const COLOR_STOCK_IDS: readonly LutStockId[] = [
  'um-400',
  'gd-200',
  'pt-400',
  'cp-200',
  'dc-200',
  'fg-400',
  'ek-100',
  'rb-100',
  'mt-500',
  'cs-800t',
];

/** 黑白卷（AUTO 不选它们，除非用户手动指定）。 */
const MONO_STOCK_IDS: readonly LutStockId[] = ['hp-400'];

function isSceneFinite(scene: SceneStats | null | undefined): scene is SceneStats {
  return (
    !!scene &&
    Number.isFinite(scene.samples) &&
    Number.isFinite(scene.meanLuma) &&
    Number.isFinite(scene.contrast) &&
    Number.isFinite(scene.shadowShare) &&
    Number.isFinite(scene.highlightShare) &&
    Number.isFinite(scene.warmth) &&
    Number.isFinite(scene.saturation)
  );
}

/** 场景分类（纯阈值判定，全部来自 `SceneStats`，样本不足 12 由调用方先行过滤）。 */
export function classifyMatchScene(
  scene: SceneStats | null | undefined,
): SceneMatchSceneKind {
  if (!isSceneFinite(scene)) {
    return 'neutral';
  }
  const dark = scene.shadowShare;
  const bright = scene.highlightShare;
  const contrast = scene.contrast;
  const warmth = scene.warmth;
  const saturation = scene.saturation;
  for (const kind of SCENE_ORDER) {
    switch (kind) {
      case 'night':
        if (dark > 0.52) {
          return kind;
        }
        break;
      case 'bright-highkey':
        if (bright > 0.48 && saturation < 0.22) {
          return kind;
        }
        break;
      case 'backlight':
        if ((bright > 0.15 && dark > 0.18) || contrast > 0.22) {
          return kind;
        }
        break;
      case 'cool-green':
        if (warmth < -0.05 && scene.meanLuma >= 0.35) {
          return kind;
        }
        break;
      case 'golden':
        if (warmth > 0.08) {
          return kind;
        }
        break;
      case 'flat-indoor':
        if (contrast < 0.18) {
          return kind;
        }
        break;
      default:
        break;
    }
  }
  return 'neutral';
}

/** 按场景取 AUTO 强度，夹在 70%~85%。 */
export function autoIntensityForScene(sceneKind: SceneMatchSceneKind): number {
  const base = AUTO_INTENSITY_BY_SCENE[sceneKind];
  return Math.min(INTENSITY_AUTO_MAX, Math.max(INTENSITY_AUTO_MIN, base));
}

/** 黄金时刻细分：暖得很重 → GD-200；暖但偏中等 → CP-200（复古琥珀）。 */
function goldenStockFor(scene: SceneStats | null | undefined): LutStockId {
  if (isSceneFinite(scene) && scene.warmth > 0.22) {
    return 'gd-200';
  }
  return 'cp-200';
}

function isColorStock(stockId: string): stockId is LutStockId {
  return (COLOR_STOCK_IDS as readonly string[]).includes(stockId);
}

function isKnownStock(stockId: string | null | undefined): stockId is LutStockId {
  if (!stockId) {
    return false;
  }
  return (
    (COLOR_STOCK_IDS as readonly string[]).includes(stockId) ||
    (MONO_STOCK_IDS as readonly string[]).includes(stockId)
  );
}

/** `recommendStockAndIntensity` 的输入。 */
export interface RecommendOptions {
  /** AUTO 底片模式传 `'auto'`；手动模式传用户选的卷 id。 */
  stockMode?: 'manual' | 'auto';
  /** 用户当前挂着的卷（`stockMode === 'manual'` 时生效；AUTO 下忽略）。 */
  manualStockId?: string | null;
  /** 强度档位；`'auto'` = 智能强度，其余档用固定倍率。 */
  intensityTier?: PresetIntensityTier | null;
}

/**
 * 场景智能匹配主入口（纯函数）。
 *
 * @param scene 成片链路采到的 `SceneStats`；`null` / 样本不足 = 中性兜底。
 * @param options 底片模式 + 强度档位 + 手动卷 id。
 */
export function recommendStockAndIntensity(
  scene: SceneStats | null | undefined,
  options: RecommendOptions = {},
): StockRecommendation {
  const stockAuto = options.stockMode === 'auto';
  const intensityAuto = (options.intensityTier ?? null) === 'auto';
  const sceneKind = classifyMatchScene(scene);
  const auto = AUTO_STOCK_BY_SCENE[sceneKind];

  // ① 底片：AUTO 用规则表；手动保持用户那卷（非法 id 回落 UM-400）。
  let stockId: LutStockId;
  if (stockAuto) {
    stockId = sceneKind === 'golden' ? goldenStockFor(scene) : auto;
  } else if (isKnownStock(options.manualStockId)) {
    stockId = options.manualStockId;
  } else {
    stockId = 'um-400';
  }

  // ② 强度：手动档位优先；AUTO 强度按场景取 70%~85%。
  //    两者都缺 = 100%。手动档位**不套** AUTO 的下限，否则 subtle 35% 会被抬到 70%
  //    （v2.1.2 用户 m00001：档位表本身已经是 0.35~1.00 的合法值）。
  let intensityScale: number;
  if (intensityAuto) {
    intensityScale = autoIntensityForScene(sceneKind);
  } else {
    intensityScale = clampIntensityScale(intensityScaleForTier(options.intensityTier) ?? 1);
  }

  // ③ 徽标：只有「AUTO 参与」时才印，格式按用户 m03050 的示例。
  const percent = intensityPercentText(intensityScale);
  let label: string | null = null;
  if (stockAuto) {
    label = `AUTO -> ${stockId.toUpperCase()} · ${percent}`;
  } else if (intensityAuto) {
    label = `${stockId.toUpperCase()} · AUTO ${percent}`;
  }

  return {
    stockId,
    intensityScale,
    sceneKind,
    stockAuto,
    intensityAuto,
    label,
    reason: describeSceneMatch(sceneKind, stockAuto, intensityAuto, stockId, percent),
  };
}

function describeSceneMatch(
  sceneKind: SceneMatchSceneKind,
  stockAuto: boolean,
  intensityAuto: boolean,
  stockId: LutStockId,
  percent: string,
): string {
  const sceneText: Record<SceneMatchSceneKind, string> = {
    night: '夜景/暗光',
    'bright-highkey': '高调明亮',
    backlight: '逆光/大光比',
    'cool-green': '冷色/青绿',
    golden: '暖调/黄金时刻',
    'flat-indoor': '室内静物/平光',
    neutral: '中性光线',
  };
  const target = `${stockId.toUpperCase()} · ${percent}`;
  if (stockAuto) {
    return `${sceneText[sceneKind]} → 自动底片 ${target}`;
  }
  if (intensityAuto) {
    return `${sceneText[sceneKind]} → 自动强度 ${target}`;
  }
  return `${sceneText[sceneKind]} → 手动 ${target}`;
}

/** 供探针/测试使用：当前哪些卷是彩色卷。 */
export const AUTO_COLOR_STOCK_IDS = COLOR_STOCK_IDS;
