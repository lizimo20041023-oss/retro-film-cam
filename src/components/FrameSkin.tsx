/**
 * 相纸卡纸底板 —— 材质层的**唯一**渲染实现（v1.8.5 重写）。
 *
 * ## 这一版在画什么
 *
 * PNG 相纸素材负责"纸纹 / 片边字符 / 齿孔轮廓"这些**固定颜色**的细节，本组件只做两件事：
 *
 *   1. **四条 multiply 边带**（`buildSkinElements`）：相纸减掉照片窗口之后的四块留白，
 *      各铺一块 `material.base` 半透明合成层，`mixBlendMode: 'multiply'`。
 *      白纸 × 原白 ≈ 原白、白纸 × 暗房黑 ≈ 暗房黑 —— 纸纹与片边字符从乘法里透出来，
 *      所以相纸不再是 v1.8.3 那块"死平涂色块"。
 *   2. **程序化 3D 纸面细节**（`buildPaperDetails`）：枕形压边 / 下巴药水包压痕 /
 *      135 齿孔 / 帧号。这些是 PNG 里没有、或烘死颜色会穿帮（暗房纸齿孔变黑）的结构，
 *      所以由数据（`FrameSpec.skin`）+ 本文件纯函数算出来，画在 PNG 之上。
 *
 * ## 为什么把 v1.8.3 的不透明实色边带删了
 *
 * v1.8.3 用四块**不透明**实色把"相纸 − 窗口"整块盖住，PNG 的纸纹、齿孔、片边
 * `▷ 12A` / `PROCESS C-41` 铭文全部被盖死 —— 用户对比 Dazz #Inst C 后投诉
 * "相纸像一块纯色塑料板、135 负片连齿孔和片边字都没了"。这一版把"上色"从
 * `backgroundColor` 换成乘法混合，PNG 重新变成可见的纹理层。
 *
 * ## 硬约束（延续 v1.8.0）
 *
 * · 任何元素都不许压进 `window`（照片区域），只落在边带里；
 * · 元素全部轴对齐、由 (材质, 相纸尺寸, 窗口, skin) **确定性**推出来 —— 没有随机数。
 *   `seed` 是冻结接口的一部分（三个调用点都还在传），本实现不读；
 * · 退化输入（0 / 负 / NaN 尺寸、窗口铺满整纸）返回空数组，绝不抛错；
 * · `fullBleed`（00 NO FRAME）由三个调用点各自守卫整组早退，本组件天然返回 0 元素。
 *
 * ## 为什么保留下面的纯函数
 *
 * `marginBands` / `intersectionArea` / `isOutsideWindow` / `isRectOutsideWindow` 是
 * "相纸 − 窗口"几何契约的实现，也是工作区根质量探针（`_probe_*.cjs`）直接调用的对象；
 * `parseHexColor` / `mixHexColor` 是同一个色值工具箱。删掉它们只会让几何契约散落到
 * 各调用点 —— 那是 v1.7.0 之前的毛病，这一版不重蹈。
 */
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { findFrameMaterial } from '../constants/frameVariants';
import type { FrameMaterialSpec } from '../constants/frameVariants';
import type { FrameSkinSpec, FrameSprocketSpec, FrameVariant, Rect } from '../types';

/**
 * 材质元素种类（v1.8.5 冻结）。
 *
 * `tint` = 乘法混合边带；其余四种是画在 PNG 之上的程序化纸面细节。
 * v1.8.3 的 `border`（照片内窗深色框线）已删除 —— 内窗 1px 高光切边改由
 * `FilmCompositor` 的相纸合成层负责（PNG/颜色统一在那里叠，FrameSkin 只画纸面）。
 */
export type SkinElementKind = 'tint' | 'bevel' | 'crease' | 'sprocket' | 'frameCode';

/** 一个材质元素：绝对定位的轴对齐矩形（`frameCode` 是文字，其余是色块）。 */
export interface SkinElement {
  /** 页内唯一 key（`base:top` / `bevel:left` / `sprocket:3` …）。 */
  key: string;
  kind: SkinElementKind;
  box: Rect;
  /** `#RRGGBB` 或 `rgba(...)`，直接给 `View.backgroundColor` / `Text.color`。 */
  color: string;
  /** 0~1。tint 与程序化细节都用 1（颜色里的 alpha 已经写在 `color` 里）。 */
  opacity: number;
  /** 仅 `tint` 使用：`multiply` 让下层 PNG 的纸纹 / 铭文透出来。 */
  blendMode?: 'multiply';
  /** 仅 `sprocket` 使用：孔圆角（pt）。 */
  borderRadius?: number;
  /** 仅 `frameCode` 使用：要印的文字。 */
  text?: string;
  /** 仅 `frameCode` 使用：字号（pt）。 */
  fontSize?: number;
  /** 仅 `frameCode` 使用：字重。 */
  fontWeight?: TextStyle['fontWeight'];
}

/** 画在 PNG 之上的纸面细节种类（tint 是"着色本身"，不算细节）。 */
export type PaperDetailKind = Exclude<SkinElementKind, 'tint'>;

/** 一条纸面细节。字段集与 `SkinElement` 相同，kind 收窄到四种细节。 */
export interface PaperDetail extends SkinElement {
  kind: PaperDetailKind;
}

/** 一条边带：相纸减掉照片窗口之后的四块留白之一。 */
export interface SkinBand extends Rect {
  side: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 短边参考尺寸（pt）。`FrameSkinSpec` 里所有"设计像素"都以它为基准换算：
 * 358pt ≈ iPhone 逻辑宽度，成片按更长的短边等比放大。
 */
export const SKIN_REFERENCE_SHORT_EDGE = 358;

/**
 * 浮点边界容差。真实几何都是整数 pt（`computeFrameLayout` 取整过），
 * 这里只兜"窗口边 − 线宽"这类减法的浮点尾巴，量级 1e-9。
 */
const EDGE_EPSILON = 1e-9;

/** 枕形压边厚度（设计像素，短边 358pt 基准）。 */
const BEVEL_DESIGN_PX = 2;

/** 枕形压边：顶 / 左内缘是受光面，底 / 右内缘是背光面。 */
const BEVEL_LIGHT_COLOR = 'rgba(255, 255, 255, 0.85)';
const BEVEL_SHADE_COLOR = 'rgba(0, 0, 0, 0.10)';

/** 下巴药水包压痕：位于下巴上部 18% 处，上沿暗线 + 下沿亮线各 1px。 */
const CHIN_CREASE_RATIO = 0.18;
const CREASE_LINE_WIDTH = 1;
const CREASE_SHADE_COLOR = 'rgba(0, 0, 0, 0.035)';
const CREASE_LIGHT_COLOR = 'rgba(255, 255, 255, 0.6)';

/**
 * "宽下巴"判定的下限：下巴高度 ≥ 顶留白 × 该值才画压痕。
 *
 * 拍立得系（polaroid-600 顶 72 / 下巴 376、instax-mini 顶 90 / 下巴 406、
 * fp100c 顶 48 / 下巴 696）都远大于 2；幻灯卡（顶 403 / 下巴 285）与 135
 * （顶 280 / 下巴 281）都过不了 —— 这两款本来也没有"药水包"这个结构。
 * 数据侧 `skin.chinCrease === false` 是另一道闸（显式关掉的无条件不画）。
 */
const CHIN_CREASE_MIN_TOP_RATIO = 2;

/** 齿孔默认值（`FrameSprocketSpec` 的可选字段兜底，见 types/index.ts）。 */
const SPROCKET_COLOR_DEFAULT = 'rgba(255, 255, 255, 0.92)';
const SPROCKET_CORNER_RATIO_DEFAULT = 0.32;
const SPROCKET_PITCH_RATIO_DEFAULT = 2;
const SPROCKET_INSET_RATIO_DEFAULT = 0.021;

/** 帧号默认值（`FrameSkinSpec.frameCode*` 的可选字段兜底）。 */
const FRAME_CODE_COLOR_DEFAULT = 'rgba(229, 169, 60, 0.88)';
const FRAME_CODE_RATIO_DEFAULT = 0.032;
/** 帧号离纸左上角的位置（相框宽度的比例）。 */
const FRAME_CODE_LEFT_RATIO = 0.04;
const FRAME_CODE_TOP_RATIO = 0.018;
/** 帧号盒子的估算宽度 / 高度系数（文字自身按内容排版，盒子只用于自检与探针）。 */
const FRAME_CODE_BOX_WIDTH_RATIO = 0.5;
const FRAME_CODE_LINE_HEIGHT_RATIO = 1.2;
const FRAME_CODE_FONT_WEIGHT: TextStyle['fontWeight'] = '700';

/** 保留两位小数：纯函数输出要逐字节可对拍，不能让浮点尾巴进渲染。 */
function snap(value: number): number {
  return Math.round(value * 100) / 100;
}

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

/** 点是否在照片窗口外（窗口边界算"外"：贴边画的东西本来就压着边界）。 */
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

/** 把矩形夹到相纸范围内（窗口贴着纸边时，细节盒可能有一截在纸外）。 */
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

/**
 * 相纸短边比例尺：短边 358pt 基准 → 当前渲染尺寸。
 * 退化尺寸返回 0（调用方据此整组不画设计像素相关的细节）。
 */
export function paperScale(width: number, height: number): number {
  const shortEdge = Math.min(width, height);
  if (!Number.isFinite(shortEdge) || shortEdge <= 0) {
    return 0;
  }
  return shortEdge / SKIN_REFERENCE_SHORT_EDGE;
}

/**
 * 相纸外框圆角（pt）：`skin.cornerRadius × 短边比例尺`，取到 0.01pt。
 *
 * 调用点（`FramePreviewLayer` 的相纸层、将来的合成器）拿它做 `borderRadius` +
 * `overflow: 'hidden'`，才能把 PNG 的四角一起切圆 —— `FrameSkin` 自己只能裁它画的层。
 */
export function paperCornerRadius(width: number, height: number, skin: FrameSkinSpec | undefined): number {
  if (skin === undefined) {
    return 0;
  }
  const designRadius = skin.cornerRadius;
  if (designRadius === undefined || !Number.isFinite(designRadius) || designRadius <= 0) {
    return 0;
  }
  const scale = paperScale(width, height);
  if (!(scale > 0)) {
    return 0;
  }
  const shortEdge = Math.min(width, height);
  return snap(Math.min(designRadius * scale, shortEdge / 2));
}

/**
 * 一组材质元素 = 4 块 multiply 边带（贴边/零留白时自动减少）。
 *
 * 这个函数是**纯函数**：同样的 (材质, 相纸尺寸, 窗口) 永远得到逐字节相同的数组，
 * 取景器预览与成片截图因此长得一模一样。**只返回 `tint`** —— 内窗框线已删除
 * （v1.8.5 起由合成层画 1px 高光切边），纸面细节走 `buildPaperDetails`。
 *
 * ⚠️ `mixBlendMode` 需要下层有像素才能相乘：PNG 必须由调用点铺在本组件**下面**
 * （`FilmCompositor` / `FramePreviewLayer` / `FilmDrawer` 都是这个顺序）。
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

  // 四条边带各一块 multiply 色：颜色只给一次（material.base），纹理从下层 PNG 透出。
  for (const band of bands) {
    const box: Rect = { left: band.left, top: band.top, width: band.width, height: band.height };
    if (!isUsableBox(box, width, height, window)) {
      continue;
    }
    elements.push({
      key: `base:${band.side}`,
      kind: 'tint',
      box,
      color: material.base,
      opacity: 1,
      blendMode: 'multiply',
    });
  }
  return elements;
}

/**
 * 135 齿孔阵列的几何（纯函数，确定性）。返回**孔矩形**列表，不含颜色。
 *
 * 参数全部来自 `skin.sprockets`（见 `types/index.ts` 的 `FrameSprocketSpec`）：
 * 尺寸相对相框宽度、数量固定、孔间距 = 孔高 × `pitchRatio`、整列在相纸上居中。
 * `left-right` 时一行两个（左右胶片边带各一个）依次向下排；`top-bottom` 相反。
 *
 * 不裁不筛：只负责几何。调用方用 `isUsableBox` 过滤（本文件就是这样做的），
 * 探针也可以直接拿它验证数量 / 对称性 / 居中。退化输入返回 `[]`。
 */
export function frameSprocketBoxes(width: number, height: number, skin: FrameSkinSpec | undefined): Rect[] {
  if (skin === undefined || skin.sprockets === undefined) {
    return [];
  }
  return sprocketBoxesOf(width, height, skin.sprockets);
}

function sprocketBoxesOf(width: number, height: number, spec: FrameSprocketSpec): Rect[] {
  const boxes: Rect[] = [];
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return boxes;
  }
  const count = Number.isFinite(spec.count) ? Math.max(0, Math.floor(spec.count)) : 0;
  if (count === 0) {
    return boxes;
  }
  const holeWidth = spec.holeWidth * width;
  const holeHeight = spec.holeHeight * width;
  if (!(holeWidth > 0) || !(holeHeight > 0) || !Number.isFinite(holeWidth) || !Number.isFinite(holeHeight)) {
    return boxes;
  }
  const pitchRatio =
    spec.pitchRatio !== undefined && spec.pitchRatio > 0 ? spec.pitchRatio : SPROCKET_PITCH_RATIO_DEFAULT;
  const insetRatio =
    spec.insetRatio !== undefined && spec.insetRatio > 0 ? spec.insetRatio : SPROCKET_INSET_RATIO_DEFAULT;
  const pitch = holeHeight * pitchRatio;
  const inset = insetRatio * width;

  if (spec.side === 'left-right') {
    // 孔列沿高度方向排：整列（含首末孔）在相纸上垂直居中。
    const span = (count - 1) * pitch + holeHeight;
    const start = span > 0 && span <= height ? (height - span) / 2 : 0;
    for (let index = 0; index < count; index += 1) {
      const top = snap(start + index * pitch);
      const leftBox: Rect = {
        left: snap(inset - holeWidth / 2),
        top,
        width: snap(holeWidth),
        height: snap(holeHeight),
      };
      const rightBox: Rect = {
        left: snap(width - inset - holeWidth / 2),
        top,
        width: snap(holeWidth),
        height: snap(holeHeight),
      };
      boxes.push(leftBox, rightBox);
    }
    return boxes;
  }

  // top-bottom：孔列沿宽度方向排，上下两条胶片边带各一个。
  const span = (count - 1) * pitch + holeWidth;
  const start = span > 0 && span <= width ? (width - span) / 2 : 0;
  for (let index = 0; index < count; index += 1) {
    const left = snap(start + index * pitch);
    const topBox: Rect = {
      left,
      top: snap(inset - holeHeight / 2),
      width: snap(holeWidth),
      height: snap(holeHeight),
    };
    const bottomBox: Rect = {
      left,
      top: snap(height - inset - holeHeight / 2),
      width: snap(holeWidth),
      height: snap(holeHeight),
    };
    boxes.push(topBox, bottomBox);
  }
  return boxes;
}

/** 相纸四周 2pt 枕形压边：顶/左亮、底/右暗；四角不重叠（左右两条夹在上下两条之间）。 */
function buildBevelDetails(width: number, height: number, window: Rect): PaperDetail[] {
  const details: PaperDetail[] = [];
  const thickness = Math.max(1, snap(BEVEL_DESIGN_PX * paperScale(width, height)));
  const left = Math.max(0, Math.min(window.left, width));
  const right = Math.max(left, Math.min(window.left + window.width, width));
  const top = Math.max(0, Math.min(window.top, height));
  const bottom = Math.max(top, Math.min(window.top + window.height, height));

  // 上下两条横贯整宽；高度被窗口上/下沿夹住（窗口贴顶/贴底时自动变薄或消失）。
  const topBox = clampToPaper({ left: 0, top: 0, width, height: Math.min(thickness, top) }, width, height);
  if (isUsableBox(topBox, width, height, window)) {
    details.push({ key: 'bevel:top', kind: 'bevel', box: topBox, color: BEVEL_LIGHT_COLOR, opacity: 1 });
  }
  const bottomBox = clampToPaper(
    { left: 0, top: Math.max(height - thickness, bottom), width, height: Math.min(thickness, height - bottom) },
    width,
    height,
  );
  if (isUsableBox(bottomBox, width, height, window)) {
    details.push({ key: 'bevel:bottom', kind: 'bevel', box: bottomBox, color: BEVEL_SHADE_COLOR, opacity: 1 });
  }

  // 左右两条只画在上下两条之间（圆角处不让同色 alpha 叠两次，否则四角会发脏）。
  const sideTop = topBox.height;
  const sideBottom = Math.max(sideTop, height - bottomBox.height);
  const sideHeight = sideBottom - sideTop;
  const leftBox = clampToPaper(
    { left: 0, top: sideTop, width: Math.min(thickness, left), height: sideHeight },
    width,
    height,
  );
  if (isUsableBox(leftBox, width, height, window)) {
    details.push({ key: 'bevel:left', kind: 'bevel', box: leftBox, color: BEVEL_LIGHT_COLOR, opacity: 1 });
  }
  const rightBox = clampToPaper(
    {
      left: Math.max(width - thickness, right),
      top: sideTop,
      width: Math.min(thickness, width - right),
      height: sideHeight,
    },
    width,
    height,
  );
  if (isUsableBox(rightBox, width, height, window)) {
    details.push({ key: 'bevel:right', kind: 'bevel', box: rightBox, color: BEVEL_SHADE_COLOR, opacity: 1 });
  }
  return details;
}

/** 拍立得宽下巴的药水包压痕：下巴上部 18% 处，上沿 1px 暗线 + 下沿 1px 亮线。 */
function buildChinCreaseDetails(width: number, height: number, window: Rect): PaperDetail[] {
  const details: PaperDetail[] = [];
  const windowTop = Math.max(0, Math.min(window.top, height));
  const windowBottom = Math.max(windowTop, Math.min(window.top + window.height, height));
  const chinHeight = height - windowBottom;
  if (!(chinHeight > 0)) {
    return details;
  }
  // 宽下巴判定：下巴至少是顶部留白的 2 倍（拍立得系过，幻灯卡 / 135 不过）。
  if (!(windowTop > 0) || chinHeight < windowTop * CHIN_CREASE_MIN_TOP_RATIO) {
    return details;
  }
  const lineWidth = Math.max(1, snap(CREASE_LINE_WIDTH * paperScale(width, height)));
  const creaseTop = snap(windowBottom + chinHeight * CHIN_CREASE_RATIO);

  const shadeBox = clampToPaper({ left: 0, top: creaseTop, width, height: lineWidth }, width, height);
  if (isUsableBox(shadeBox, width, height, window)) {
    details.push({
      key: 'crease:shade',
      kind: 'crease',
      box: shadeBox,
      color: CREASE_SHADE_COLOR,
      opacity: 1,
    });
  }
  const lightBox = clampToPaper({ left: 0, top: creaseTop + lineWidth, width, height: lineWidth }, width, height);
  if (isUsableBox(lightBox, width, height, window)) {
    details.push({
      key: 'crease:light',
      kind: 'crease',
      box: lightBox,
      color: CREASE_LIGHT_COLOR,
      opacity: 1,
    });
  }
  return details;
}

/** 齿孔 → 可画元素：颜色 / 圆角来自 `skin.sprockets`，盒子滤掉压窗口与纸外者。 */
function buildSprocketDetails(
  width: number,
  height: number,
  window: Rect,
  skin: FrameSkinSpec,
): PaperDetail[] {
  const details: PaperDetail[] = [];
  const spec = skin.sprockets;
  if (spec === undefined) {
    return details;
  }
  const color = spec.color ?? SPROCKET_COLOR_DEFAULT;
  const cornerRatio =
    spec.cornerRatio !== undefined && spec.cornerRatio > 0
      ? spec.cornerRatio
      : SPROCKET_CORNER_RATIO_DEFAULT;
  const boxes = sprocketBoxesOf(width, height, spec);
  boxes.forEach((candidate, index) => {
    const box = clampToPaper(candidate, width, height);
    if (!isUsableBox(box, width, height, window)) {
      return;
    }
    // 圆角 = 孔高 × cornerRatio，不能超过短边的一半（否则 RN 会自己夹，数字不可对拍）。
    const radius = snap(Math.min(box.height * cornerRatio, box.width / 2, box.height / 2));
    details.push({
      key: `sprocket:${index}`,
      kind: 'sprocket',
      box,
      color,
      opacity: 1,
      borderRadius: Math.max(0, radius),
    });
  });
  return details;
}

/** 片基帧号（如 `▷ 04A`）：左上角，字号 = 相框宽度 × `frameCodeRatio`。 */
function buildFrameCodeDetail(
  width: number,
  height: number,
  window: Rect,
  skin: FrameSkinSpec,
): PaperDetail | null {
  const text = skin.frameCode;
  if (text === undefined || text.length === 0) {
    return null;
  }
  const ratio =
    skin.frameCodeRatio !== undefined && skin.frameCodeRatio > 0
      ? skin.frameCodeRatio
      : FRAME_CODE_RATIO_DEFAULT;
  const fontSize = Math.max(1, snap(width * ratio));
  const box = clampToPaper(
    {
      left: snap(width * FRAME_CODE_LEFT_RATIO),
      top: snap(width * FRAME_CODE_TOP_RATIO),
      width: snap(width * FRAME_CODE_BOX_WIDTH_RATIO),
      height: snap(fontSize * FRAME_CODE_LINE_HEIGHT_RATIO),
    },
    width,
    height,
  );
  if (!isUsableBox(box, width, height, window)) {
    return null;
  }
  return {
    key: 'frameCode',
    kind: 'frameCode',
    box,
    color: skin.frameCodeColor ?? FRAME_CODE_COLOR_DEFAULT,
    opacity: 1,
    text,
    fontSize,
    fontWeight: FRAME_CODE_FONT_WEIGHT,
  };
}

/**
 * 画在 PNG 之上的程序化纸面细节（纯函数，确定性）。
 *
 * 顺序固定：枕形压边 → 下巴压痕 → 齿孔 → 帧号（与探针断言的渲染顺序一致）。
 * 不写 `skin`、或对应开关关闭时不产生对应元素；退化尺寸返回 `[]`。
 *
 * `material` 参与签名是为了让调用点（预览 / 成片）永远传同一组参数、将来若要
 * 按纸色微调细节强度不必再改三处；v1.8.5 的压边 / 压痕色是用户验收过的固定值，
 * 材质颜色只通过 `buildSkinElements` 的 multiply 边带参与着色。
 */
export function buildPaperDetails(
  width: number,
  height: number,
  window: Rect,
  material: FrameMaterialSpec,
  skin: FrameSkinSpec | undefined,
): PaperDetail[] {
  const details: PaperDetail[] = [];
  if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0) || !(height > 0)) {
    return details;
  }
  if (skin === undefined) {
    return details;
  }
  // Raised white-paper edges read as bright plastic strips on graphite stock.
  // Keep the film-specific perforations and frame code, which belong to the
  // physical format rather than the paper finish.
  if (material.id !== 'obsidian' && skin.paddedBevel !== false) {
    details.push(...buildBevelDetails(width, height, window));
  }
  if (material.id !== 'obsidian' && skin.chinCrease !== false) {
    details.push(...buildChinCreaseDetails(width, height, window));
  }
  const sprockets = buildSprocketDetails(width, height, window, skin);
  if (sprockets.length > 0) {
    details.push(...sprockets);
  }
  const frameCode = buildFrameCodeDetail(width, height, window, skin);
  if (frameCode !== null) {
    details.push(frameCode);
  }
  return details;
}

/** 元素 → RN 样式。只放几何、颜色、混合模式与圆角，不掺随机。 */
function elementStyle(element: SkinElement): ViewStyle {
  const style: ViewStyle = {
    position: 'absolute',
    left: element.box.left,
    top: element.box.top,
    width: element.box.width,
    height: element.box.height,
    backgroundColor: element.color,
    opacity: element.opacity,
  };
  if (element.borderRadius !== undefined) {
    style.borderRadius = element.borderRadius;
  }
  if (element.blendMode !== undefined) {
    style.mixBlendMode = element.blendMode;
  }
  return style;
}

/** 帧号文字 → RN 样式（绝对定位，不参与布局）。 */
function frameCodeStyle(element: SkinElement): TextStyle {
  const style: TextStyle = {
    position: 'absolute',
    left: element.box.left,
    top: element.box.top,
    color: element.color,
    opacity: element.opacity,
  };
  if (element.fontSize !== undefined) {
    style.fontSize = element.fontSize;
  }
  if (element.fontWeight !== undefined) {
    style.fontWeight = element.fontWeight;
  }
  return style;
}

export interface FrameSkinProps {
  /** 相纸宽（pt）。 */
  width: number;
  /** 相纸高（pt）。 */
  height: number;
  /** 照片镂空窗口（相纸坐标系）；材质只画在它外面。 */
  window: Rect;
  /**
   * 相纸圆角（pt）。v1.8.5 起优先用 `skin.cornerRadius` 按短边比例尺算
   * （见 `paperCornerRadius`）；这里保留显式传值作为兜底，只有数据没写圆角时才生效。
   */
  radius?: number;
  /** 当前材质档（A/B/C）。 */
  variant: FrameVariant;
  /**
   * 随机种子。v1.8.3 起材质是纯几何 + 纯色，本组件不读它；字段保留是因为
   * `FilmCompositor` / `FramePreviewLayer` / `FilmDrawer` 三个调用点都在传（冻结接口）。
   */
  seed: string;
  /**
   * 相纸的程序化细节数据（`FrameSpec.skin`，v1.8.5）。不传 = 只画 4 条 multiply 边带，
   * 与 v1.8.3 的"纯色纸"行为一致（老存档 / 抽屉缩略图不会崩）。
   */
  skin?: FrameSkinSpec;
}

function FrameSkinInner({ width, height, window, radius = 0, variant, skin }: FrameSkinProps) {
  const material = findFrameMaterial(variant);
  const tints = useMemo(
    () => buildSkinElements(material, width, height, window),
    [material, width, height, window],
  );
  const details = useMemo(
    () => buildPaperDetails(width, height, window, material, skin),
    [material, width, height, window, skin],
  );
  const skinRadius = paperCornerRadius(width, height, skin);
  const resolvedRadius = skinRadius > 0 ? skinRadius : radius;

  return (
    // 整层不吃手势；材质是"画上去的"，不是可点的。
    <View pointerEvents="none" style={[styles.root, { width, height, borderRadius: resolvedRadius }]}>
      {tints.map((element) => (
        <View key={element.key} style={elementStyle(element)} />
      ))}
      {details.map((element) =>
        element.kind === 'frameCode' ? (
          <Text key={element.key} allowFontScaling={false} numberOfLines={1} style={frameCodeStyle(element)}>
            {element.text ?? ''}
          </Text>
        ) : (
          <View key={element.key} style={elementStyle(element)} />
        ),
      )}
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
