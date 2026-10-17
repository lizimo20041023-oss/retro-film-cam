/**
 * 相纸卡纸底板 —— 材质层的**唯一**渲染实现（v1.8.3 重写）。
 *
 * ## 这一版在画什么
 *
 * 只有两样东西：
 *
 *   1. **单一平整实色**：四条"相纸 − 照片窗口"的边带各铺一块纯色 —— 四块是
 *      **同一个色值**、零分段、零混色、零晕染。材质就是一张暗房卡纸，
 *      颜色只在 `constants/frameVariants.ts` 里给一次。
 *   2. **1pt 压痕内框线**：紧贴照片窗口外侧的一圈线，颜色来自材质的
 *      `borderColor`。顶/底两条横向拉满到窗口左右各外扩 1pt（把两个角一起盖住），
 *      左右两条只填窗口高度 —— 四块拼起来恰好是一个连续闭合的矩形框，
 *      没有缺口、没有重复着色的角（重复叠色会在四角压出四个深点）。
 *
 * ## 为什么把 v1.8.0 的实现全删了
 *
 * 用户报："导出的相框顶部/底部下巴有 5~6 道像楼梯/百叶窗的水平长条色带"。
 * 病灶就是**多块色条拼接模拟渐变**：12 级 `tint` + 6 级 `bloom` + 各 4 条
 * `shade`/`cut`/`emboss`，相邻条之间的硬色阶在 300~500pt 的成片上就是百叶窗。
 * 结论：**能少画一块就绝不会出现一道接缝**。现在每个纸框固定 8 个元素
 * （4 块实色 + 4 条框线），与画幅无关，预览 / 成片的元素集合与 key 序列全等。
 *
 * ## 硬约束（延续 v1.8.0）
 *
 * · 任何元素都不许压进 `window`（照片区域），只落在边带里；
 * · 元素全部轴对齐、由 (材质, 相纸尺寸, 窗口) **确定性**推出来 —— 没有随机数、
 *   不用 `seed`（字段是冻结接口的一部分，3 个调用点都还在传，保留但本实现不读）；
 * · 退化输入（0 / 负 / NaN 尺寸、窗口铺满整纸）返回空数组，绝不抛错。
 *
 * ## 为什么保留下面的纯函数
 *
 * `marginBands` / `intersectionArea` / `isOutsideWindow` / `isRectOutsideWindow`
 * 是"相纸 − 窗口"这个几何契约的实现，也是工作区根探针（`_probe_skin_material.cjs`）
 * 直接调用的对象；`parseHexColor` / `mixHexColor` 是同一个色值工具箱（v1.8.0 起
 * 就被探针与颜色核对脚本共用）。删掉它们只会让几何契约散落到各调用点 ——
 * 那是 v1.7.0 之前的毛病，这一版不重蹈。
 */
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { findFrameMaterial } from '../constants/frameVariants';
import type { FrameMaterialSpec } from '../constants/frameVariants';
import type { FrameVariant, Rect } from '../types';

/**
 * 材质元素种类。
 *
 * v1.8.3 起只剩两种：`tint`（实色底板）与 `border`（1pt 压痕框线）。
 * 旧版那五种（tint/shade/cut/emboss/bloom）里的后四种全是"多块拼接"，
 * 已随百叶窗问题一起删除 —— 不是停用，是代码里再也搜不到。
 */
export type SkinElementKind = 'tint' | 'border';

/** 一个材质元素：绝对定位的轴对齐矩形。 */
export interface SkinElement {
  /** 页内唯一 key（`base:top` / `border:left` …）。 */
  key: string;
  kind: SkinElementKind;
  box: Rect;
  /** `#RRGGBB` 或 `rgba(...)`，直接给 `View.backgroundColor`。 */
  color: string;
  /** 0~1。实色底板与框线都用 1（颜色里的 alpha 已经写在 `color` 里）。 */
  opacity: number;
}

/** 一条边带：相纸减掉照片窗口之后的四块留白之一。 */
export interface SkinBand extends Rect {
  side: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 浮点边界容差。真实几何都是整数 pt（`computeFrameLayout` 取整过），
 * 这里只兜"窗口边 − 线宽"这类减法的浮点尾巴，量级 1e-9。
 */
const EDGE_EPSILON = 1e-9;

/** 两个矩形的交集面积（0 = 不相交或只擦边）。 */
export function intersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (!(right > left) || !(bottom > top)) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

/** 点是否在照片窗口外（窗口边界算"外"：压痕线本来就贴着边界画）。 */
export function isOutsideWindow(x: number, y: number, window: Rect): boolean {
  return (
    x <= window.left + EDGE_EPSILON ||
    x >= window.left + window.width - EDGE_EPSILON ||
    y <= window.top + EDGE_EPSILON ||
    y >= window.top + window.height - EDGE_EPSILON
  );
}

/** 矩形是否完全在照片窗口外（含只擦边的情况）。 */
export function isRectOutsideWindow(box: Rect, window: Rect): boolean {
  return (
    box.left + box.width <= window.left + EDGE_EPSILON ||
    box.left >= window.left + window.width - EDGE_EPSILON ||
    box.top + box.height <= window.top + EDGE_EPSILON ||
    box.top >= window.top + window.height - EDGE_EPSILON
  );
}

/** `#RRGGBB` → `{ r, g, b }`；不是合法 6 位 hex 返回 `null`。 */
export function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (match === null) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

/**
 * 两个 `#RRGGBB` 之间线性插值，`t` 会被夹到 [0, 1]，返回 `#RRGGBB`（大写）。
 *
 * 这一版渲染色不再需要混色，但它是色值工具箱的一部分：调整配方时用它算
 * "深一档 / 浅一档"，探针也直接验它的四则运算。
 */
export function mixHexColor(from: string, to: string, t: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  if (a === null || b === null) {
    return from;
  }
  const clamped = Math.min(1, Math.max(0, t));
  const channel = (start: number, end: number): number => Math.round(start + (end - start) * clamped);
  const hex = (value: number): string => value.toString(16).padStart(2, '0').toUpperCase();
  return `#${hex(channel(a.r, b.r))}${hex(channel(a.g, b.g))}${hex(channel(a.b, b.b))}`;
}

/**
 * 把"相纸 − 照片窗口"切成四条边带。
 *
 * 返回顺序固定为 top / bottom / left / right（与元素 key 序列绑定）；
 * 相纸某一侧没有留白（窗口贴边或铺满整纸）时该条不返回 —— 窗口铺满整纸
 * 就是 `[]`（成片没有纸可画，调用点据此渲染 0 个元素）。
 */
export function marginBands(width: number, height: number, window: Rect): SkinBand[] {
  const bands: SkinBand[] = [];
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return bands;
  }
  // 窗口可能被脏数据推出相纸：先夹回纸内，负留白一律按 0 处理。
  const innerTop = Math.max(0, Math.min(window.top, height));
  const innerBottom = Math.max(0, Math.min(window.top + window.height, height));
  const innerLeft = Math.max(0, Math.min(window.left, width));
  const innerRight = Math.max(0, Math.min(window.left + window.width, width));
  const top = innerTop;
  const bottom = height - innerBottom;
  const left = innerLeft;
  const right = width - innerRight;
  if (top > 0) {
    bands.push({ side: 'top', left: 0, top: 0, width, height: top });
  }
  if (bottom > 0) {
    bands.push({ side: 'bottom', left: 0, top: innerBottom, width, height: bottom });
  }
  if (left > 0 && innerBottom > innerTop) {
    bands.push({ side: 'left', left: 0, top: innerTop, width: left, height: innerBottom - innerTop });
  }
  if (right > 0 && innerBottom > innerTop) {
    bands.push({ side: 'right', left: innerRight, top: innerTop, width: right, height: innerBottom - innerTop });
  }
  return bands;
}

/** 元素必须：正面积、在相纸内、不压照片窗口。 */
function isUsableBox(box: Rect, width: number, height: number, window: Rect): boolean {
  if (!(box.width > 0) || !(box.height > 0)) {
    return false;
  }
  const insidePaper =
    box.left >= -EDGE_EPSILON &&
    box.top >= -EDGE_EPSILON &&
    box.left + box.width <= width + EDGE_EPSILON &&
    box.top + box.height <= height + EDGE_EPSILON;
  return insidePaper && intersectionArea(box, window) === 0;
}

/** 把矩形夹到相纸范围内（窗口贴着纸边时，压痕线可能有一截在纸外）。 */
function clampToPaper(box: Rect, width: number, height: number): Rect {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(width, box.left + box.width);
  const bottom = Math.min(height, box.top + box.height);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** 照片内窗四周的 1pt 压痕框线，四条（顶/底拉满到窗口左右各外扩一线宽）。 */
function borderLines(window: Rect, lineWidth: number): { side: SkinBand['side']; box: Rect }[] {
  return [
    {
      side: 'top',
      box: {
        left: window.left - lineWidth,
        top: window.top - lineWidth,
        width: window.width + lineWidth * 2,
        height: lineWidth,
      },
    },
    {
      side: 'bottom',
      box: {
        left: window.left - lineWidth,
        top: window.top + window.height,
        width: window.width + lineWidth * 2,
        height: lineWidth,
      },
    },
    {
      side: 'left',
      box: {
        left: window.left - lineWidth,
        top: window.top,
        width: lineWidth,
        height: window.height,
      },
    },
    {
      side: 'right',
      box: {
        left: window.left + window.width,
        top: window.top,
        width: lineWidth,
        height: window.height,
      },
    },
  ];
}

/**
 * 一组材质元素 = 4 块实色边带 + 4 条压痕框线（贴边/零留白时自动减少）。
 *
 * 这个函数是**纯函数**：同样的 (材质, 相纸尺寸, 窗口) 永远得到逐字节相同的数组，
 * 取景器预览与成片截图因此长得一模一样。
 */
export function buildSkinElements(
  material: FrameMaterialSpec,
  width: number,
  height: number,
  window: Rect,
): SkinElement[] {
  const elements: SkinElement[] = [];
  if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0) || !(height > 0)) {
    return elements;
  }
  const bands = marginBands(width, height, window);
  if (bands.length === 0) {
    return elements;
  }

  // ① 单一平整实色底板：四条边带各一块，**同一个色值**，不混色、不叠半透明。
  for (const band of bands) {
    const box: Rect = { left: band.left, top: band.top, width: band.width, height: band.height };
    if (!isUsableBox(box, width, height, window)) {
      continue;
    }
    elements.push({ key: `base:${band.side}`, kind: 'tint', box, color: material.base, opacity: 1 });
  }

  // ② 照片内窗四周的 1pt 压痕内框线。
  const lineWidth = material.borderWidth;
  if (!(lineWidth > 0) || !Number.isFinite(lineWidth)) {
    return elements;
  }
  for (const line of borderLines(window, lineWidth)) {
    const box = clampToPaper(line.box, width, height);
    if (!isUsableBox(box, width, height, window)) {
      continue;
    }
    elements.push({ key: `border:${line.side}`, kind: 'border', box, color: material.borderColor, opacity: 1 });
  }
  return elements;
}

/** 元素 → RN 样式。只放几何与颜色，没有混合模式（实色不需要叠色）。 */
function elementStyle(element: SkinElement): ViewStyle {
  return {
    position: 'absolute',
    left: element.box.left,
    top: element.box.top,
    width: element.box.width,
    height: element.box.height,
    backgroundColor: element.color,
    opacity: element.opacity,
  };
}

export interface FrameSkinProps {
  /** 相纸宽（pt）。 */
  width: number;
  /** 相纸高（pt）。 */
  height: number;
  /** 照片镂空窗口（相纸坐标系）；材质只画在它外面。 */
  window: Rect;
  /** 相纸圆角。相纸素材是直角，只有随手圆角才传。 */
  radius?: number;
  /** 当前材质档（A/B/C）。 */
  variant: FrameVariant;
  /**
   * v1.8.0 之前的随机种子。**v1.8.3 起材质是纯几何 + 纯色**，本组件不读它；
   * 字段保留是因为 `FilmCompositor` / `FramePreviewLayer` / `FilmDrawer` 三个
   * 调用点都在传（冻结接口），删字段要三处一起改，不值得。
   */
  seed: string;
}

function FrameSkinInner({ width, height, window, radius = 0, variant }: FrameSkinProps) {
  const material = findFrameMaterial(variant);
  const elements = useMemo(
    () => buildSkinElements(material, width, height, window),
    [material, width, height, window],
  );

  return (
    // 整层不吃手势；材质是"画上去的"，不是可点的。
    <View pointerEvents="none" style={[styles.root, { width, height, borderRadius: radius }]}>
      {elements.map((element) => (
        <View key={element.key} style={elementStyle(element)} />
      ))}
    </View>
  );
}

/** 三个调用点共用同一个实现：取景器预览 / 抽屉迷你预览 / 成片截图。 */
export const FrameSkin = memo(FrameSkinInner);

const styles = StyleSheet.create({
  /** 铺满相纸盒。父容器已经定位好，这里只负责把材质贴上去。 */
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
});
