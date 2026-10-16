/**
 * 相框材质层（v1.8.0）—— 画在素材相框**之上**的纯 `<View>` 叠加层。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 这一版和 v1.7.0 那一版的关系
 * ─────────────────────────────────────────────────────────────────────────
 * v1.7.0 这里是"A 不画 / B 泛黄复古 / C 手绘涂鸦（波点 + 空心圈 + 笔触）"。
 * 用户否掉了 C 档那条路线（**"任何试图用几何图形模拟手绘贴纸感的行为显得极度廉价与割裂"**），
 * 于是涂鸦机制连同它的全部常量一起**删掉**（不是停用）：本文件里现在搜不到
 * `DOODLE` / 波点 / 空心圈 / 笔触任何一个标识符 —— 探针第 5 节守着这件事。
 * 现在三档都是**材质**：A 经典原白 / B 岁月暖黄 / C 暗房雅黑，配方在
 * `constants/frameVariants.ts`（**唯一配方产地**，本文件只负责把它画出来）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 为什么是一个组件，而不是"预览一套 + 成片一套"
 * ─────────────────────────────────────────────────────────────────────────
 * 三处调用（取景器实时预览 / 抽屉 96×72 迷你预览 / 成片合成）共用**同一个**实现，
 * 唯一的差别是 `width/height`。所有几何都是"相纸短边的比例"或"留白带的比例"，
 * 所以三处**逐元素等比**；探针里有一条断言专门守它（同一材质在 96×72 与 390pt
 * 画幅上渲染出的元素集合必须逐个相等）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 硬规则（改这个文件之前先读）
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **材质元素一个像素都不许压进照片窗口**（`FrameSkinProps.window`）。
 *    v1.7.0 的 B 档是一整幅乘算暖化层、连照片一起泛黄 —— 用户报的"白雾"就是这条的
 *    同类问题。所以这里连"整幅底色"都不画：底色是**四条边带**（`marginBands()` 把
 *    "相纸 − 窗口"切成的四块），窗口里干干净净。生成时每个元素都过两道闸：
 *    `isRectOutsideWindow(box, window)`（盒测，真正保证零像素压入）+ `isOutsideWindow(中心, window)`。
 * 2. 只吃四种输入：材质配方、画幅（width/height）、照片窗口（window）。（+ 可选 radius）
 *    **没有随机数、没有 seed**：材质是几何与颜色，不该"每次进来长得不一样"，
 *    也正因如此三处调用的元素集合能严格相等。
 * 3. 只用 `<View>`：不 require 素材、不画 canvas、不用 SVG。
 * 4. 厚度一律写成**相纸短边的比例**（配方里的 `ratio`），不写死 pt：
 *    写死 pt 会让 96~120pt 的预览与 300~500pt 的成片元素集合分叉（v1.7.0 踩过）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 几何约定
 * ─────────────────────────────────────────────────────────────────────────
 * · 原点 = 相纸左上角，单位 pt；调用方传进来的 width/height 就是相纸尺寸。
 * · 每个元素都是**轴对齐矩形**（材质全是横平竖直的带与线），所以 `SkinElement`
 *   只存一个 `box`，渲染就是 `position:absolute` 摆上去。
 * · 相邻元素共用**同一个边界浮点数**（第 i 条的下边就是第 i+1 条的上边）：
 *   像素取整对同一个数是同一个结果，所以既不漏缝也不叠加 —— 乘算层一旦叠上就会
 *   在接缝处变成"双倍乘算"的深色细线，那正是用户报过的那种"突兀的线"。
 */
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { findFrameMaterial } from '../constants/frameVariants';
import type { FrameMaterialSpec, MaterialBloom } from '../constants/frameVariants';
import type { BlendMode, FrameVariant, Rect } from '../types';

/**
 * 调用方要给的四个数（+ 半径）。
 *
 * ⚠️ **接口冻结**：`CameraScreen`（取景器实时预览）、`FilmCompositor`（成片合成）、
 *    `FilmDrawer`（抽屉迷你预览）都按这个签名调用。要加字段只能加成**可选**的，
 *    并且要同步告诉 Lead。
 */
export interface FrameSkinProps {
  /** 相纸宽（pt）。取景器里是预览尺寸，成片里是 `layout.width`。 */
  width: number;
  /** 相纸高（pt）。 */
  height: number;
  /** 照片窗口在相纸里的位置（pt，绝对坐标）—— 材质绝不画进这个矩形。 */
  window: Rect;
  /** 相纸圆角（pt）。素材相框是直角就传 0 / 不传。 */
  radius?: number;
  /** 材质。配方见 `constants/frameVariants.ts`。 */
  variant: FrameVariant;
  /**
   * 图案种子。**v1.8.0 起本层不使用它**（材质是纯几何，没有随机图案），
   * 但字段保留：三个调用点都还在传，而且接口是冻结的。
   */
  seed: string;
}

/**
 * 材质元素的种类。
 * · `tint`   底色 / 渐变切条（乘算，纸的纹路会透出来）
 * · `shade`  相纸外沿的接触阴影（贴边的一圈）
 * · `cut`    外沿的金属高光切边（暗色材质专用）
 * · `emboss` 窗口内侧的内凹压痕（暗在上/左、亮在下/右）
 * · `bloom`  暗房晕染（从外沿往里逐级变淡）
 */
export type SkinElementKind = 'tint' | 'shade' | 'cut' | 'emboss' | 'bloom';

/** 一个待绘制的元素（纯数据，渲染层只按它摆一个 `<View>`）。 */
export interface SkinElement {
  key: string;
  kind: SkinElementKind;
  /** 轴对齐矩形（pt，相对相纸左上角）。 */
  box: Rect;
  /**
   * 颜色。`tint`/`shade`/`cut`/`emboss` 用 hex + `opacity`；
   * `bloom` 把 alpha 写在 `rgba(...)` 色串里、`opacity: 1`（晕染本来就是"墨水的浓淡"）。
   */
  color: string;
  opacity: number;
  blendMode?: BlendMode;
}

/** 四条边带之一（相纸留白的一部分）。 */
export interface SkinBand {
  side: 'top' | 'bottom' | 'left' | 'right';
  left: number;
  top: number;
  width: number;
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────
// 纯几何
// ─────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function rgba(r: number, g: number, b: number, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** `#RRGGBB` → `{r,g,b}`；认不出来返回 null（探针断言配方色值格式用得到）。 */
export function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (match === null) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** 两个 `#RRGGBB` 之间线性插值（`t` 已夹到 0~1）；解析失败时返回 `from`。 */
export function mixHexColor(from: string, to: string, t: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  if (a === null || b === null) {
    return from;
  }
  const ratio = clamp(t, 0, 1);
  // 输出统一大写：配方表里写的是 `#F2E9D5`，渐变中途大小写跳变会让调试和设备端色串对不上号。
  const channel = (x: number, y: number): string =>
    Math.round(x + (y - x) * ratio)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
}

/**
 * 点 `(x, y)` 是否落在照片窗口**之外**。
 *
 * ⚠️ 贴边算"没出去"（返回 `false`）—— 宁可少画一条，也不赌那半个像素。
 */
export function isOutsideWindow(x: number, y: number, window: Rect): boolean {
  return (
    x < window.left ||
    x > window.left + window.width ||
    y < window.top ||
    y > window.top + window.height
  );
}

/**
 * 矩形 `box` 是否与照片窗口**完全不相交**（贴边算不相交 —— 交集面积为 0）。
 *
 * 这是"一个像素都不许压进照片"的**硬闸**：点测只能证明四个角在外面，
 * 一个横贯整幅的大盒子可以四角都在外面、中间却把窗口整个吞掉。
 */
export function isRectOutsideWindow(box: Rect, window: Rect): boolean {
  return (
    box.left + box.width <= window.left ||
    box.left >= window.left + window.width ||
    box.top + box.height <= window.top ||
    box.top >= window.top + window.height
  );
}

/** 两个矩形的交集面积（探针用来断言"零侵入"，渲染层不用）。 */
export function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (!(width > 0) || !(height > 0)) {
    return 0;
  }
  return width * height;
}

/**
 * 浮点边缘容差（1e-9 pt，远小于一个像素，也远小于任何可见误差）。
 *
 * 为什么需要它：晕染的最外那一级是**贴着相纸边**画的，它的上下边由
 * `depth - thickness` 与 `+ thickness` 两次浮点运算凑出来，`(d - t) + t` 有大约
 * 1e-15 的概率比 `d` 大一个 ulp。若边界判定用严格的 `>`，这一级会因为"超出相纸
 * 1e-15 pt"被整条丢掉 —— 于是同样的材质在 11pt 与 36pt 的带深上画出不同的元素集合，
 * 迷你预览与成片的元素数就对不上了（探针抓出来的就是这一类）。
 * 注意：这条容差**只放宽相纸边界**，与照片窗口的相交判定始终是严格的。
 */
const EDGE_EPSILON = 1e-9;

/**
 * 与照片窗口的相交判定用同量级的容差（1e-9 pt）。
 *
 * 理由和上面一样：压痕的下沿与晕染最内侧那一级的边**就是**窗口的边，它们是
 * "窗口边 − 一个厚度，再加回这个厚度"算出来的，浮点尾巴大约 1e-14 pt。
 * 真正的侵入最小也在 1e-3 pt 量级（55pt 相纸上最细的一条），容差跟它差六个数量级，
 * 所以放宽这一下不会放过任何看得见的压盖 —— 但能让元素集合在
 * 96×72 预览与整幅成片上严格一致（否则同一份材质会在两个画幅上少画一条边）。
 */
const WINDOW_EPSILON = 1e-9;

/** 盒子是否真的压到了照片窗口（重叠宽高都超过容差才算）。 */
function overlapsWindow(box: Rect, window: Rect): boolean {
  const overlapWidth = Math.min(box.left + box.width, window.left + window.width) - Math.max(box.left, window.left);
  const overlapHeight = Math.min(box.top + box.height, window.top + window.height) - Math.max(box.top, window.top);
  return overlapWidth > WINDOW_EPSILON && overlapHeight > WINDOW_EPSILON;
}

/** 元素在相纸内、且不与照片窗口相交。生成器每一步都过这一遍。 */
function isUsable(box: Rect, width: number, height: number, window: Rect): boolean {
  if (!(box.width > 0) || !(box.height > 0)) {
    return false;
  }
  if (
    box.left < -EDGE_EPSILON ||
    box.top < -EDGE_EPSILON ||
    box.left + box.width > width + EDGE_EPSILON ||
    box.top + box.height > height + EDGE_EPSILON
  ) {
    return false;
  }
  if (overlapsWindow(box, window)) {
    return false;
  }
  return isOutsideWindow(box.left + box.width / 2, box.top + box.height / 2, window);
}

/**
 * 把"相纸留白"切成**四条互不重叠**的边带：上、下两条横贯整幅，
 * 左、右两条只占窗口所在的那一段 —— 四条带拼起来正好是"相纸 − 窗口"，
 * 不多不少、不互相重叠（重叠会让半透明层在接缝处叠出更深的边）。
 * 窗口贴边（留白为 0）的那条带不生成。
 *
 * 这是材质**唯一**允许落笔的地方：底色、渐变、贴边阴影、晕染全在这四块里，
 * 所以"材质不覆盖照片"是几何上的必然，而不是靠事后过滤。
 */
export function marginBands(width: number, height: number, window: Rect): SkinBand[] {
  const left = clamp(window.left, 0, width);
  const top = clamp(window.top, 0, height);
  const right = clamp(window.left + window.width, left, width);
  const bottom = clamp(window.top + window.height, top, height);
  const bands: SkinBand[] = [];
  if (top > 0) {
    bands.push({ side: 'top', left: 0, top: 0, width, height: top });
  }
  if (height - bottom > 0) {
    bands.push({ side: 'bottom', left: 0, top: bottom, width, height: height - bottom });
  }
  const bodyHeight = bottom - top;
  if (bodyHeight > 0 && left > 0) {
    bands.push({ side: 'left', left: 0, top, width: left, height: bodyHeight });
  }
  if (bodyHeight > 0 && width - right > 0) {
    bands.push({ side: 'right', left: right, top, width: width - right, height: bodyHeight });
  }
  return bands;
}

// ─────────────────────────────────────────────────────────────────────────
// 生成（纯函数：同一份输入一定给出同一串元素）
// ─────────────────────────────────────────────────────────────────────────

/** 往元素表里放一个矩形；几何不合法就丢掉（返回是否放进去）。 */
function pushBox(
  elements: SkinElement[],
  kind: SkinElementKind,
  key: string,
  box: Rect,
  color: string,
  opacity: number,
  width: number,
  height: number,
  window: Rect,
  blendMode?: BlendMode,
): boolean {
  if (!isUsable(box, width, height, window)) {
    return false;
  }
  const element: SkinElement = { key, kind, box, color, opacity };
  if (blendMode !== undefined) {
    element.blendMode = blendMode;
  }
  elements.push(element);
  return true;
}

/**
 * ① 底色 / 竖向渐变。
 *
 * 每条边带沿纵轴切成 `gradientSteps` 条（平色材质就是 1 条），条的**颜色按它在整块
 * 相纸上的高度**取 —— 不是按它在带里的相对位置。这一点很关键：带与带之间
 * （上带 ↔ 左带）接着的地方，颜色必须接得上，否则窗口四角会出现"上下两块色"的硬边。
 *
 * 切条的边界用**同一个浮点数**（第 i 条的下边 = 第 i+1 条的上边），所以像素取整后
 * 既不漏缝也不重叠；乘算层重叠会在接缝处变成双倍乘算的深色线。
 */
function buildTintLines(
  material: FrameMaterialSpec,
  bands: readonly SkinBand[],
  width: number,
  height: number,
  window: Rect,
  elements: SkinElement[],
): void {
  const flat = material.gradientSteps <= 1 || material.gradientTop === material.gradientBottom;
  const steps = flat ? 1 : material.gradientSteps;
  for (const band of bands) {
    for (let index = 0; index < steps; index += 1) {
      const top = band.top + (band.height * index) / steps;
      const bottom = band.top + (band.height * (index + 1)) / steps;
      const midRatio = height > 0 ? (top + bottom) / 2 / height : 0;
      const color = flat
        ? material.gradientTop
        : mixHexColor(material.gradientTop, material.gradientBottom, midRatio);
      pushBox(
        elements,
        'tint',
        `tint-${band.side}-${index}`,
        { left: band.left, top, width: band.width, height: bottom - top },
        color,
        1,
        width,
        height,
        window,
        'multiply',
      );
    }
  }
}

/**
 * ② 相纸外沿的接触阴影：相纸**内侧**贴边的一圈。
 *
 * 为什么画在里面：`FrameSkin` 的根容器是 `overflow: hidden` 的（圆角要裁），
 * 画到纸外面会被裁掉；真实的相纸边缘阴影本来也就是"贴着纸沿那一圈变暗"。
 * 素材 PNG 四边都是不透明的纸面，所以这一圈落在纸上，不会盖到别的层。
 */
function buildShadeLines(
  material: FrameMaterialSpec,
  width: number,
  height: number,
  window: Rect,
  elements: SkinElement[],
): void {
  const thickness = material.shade.ratio * Math.min(width, height);
  if (!(thickness > 0)) {
    return;
  }
  const ink = material.shade.color;
  const alpha = material.shade.alpha;
  pushBox(elements, 'shade', 'shade-top', { left: 0, top: 0, width, height: thickness }, ink, alpha, width, height, window);
  pushBox(
    elements,
    'shade',
    'shade-bottom',
    { left: 0, top: height - thickness, width, height: thickness },
    ink,
    alpha,
    width,
    height,
    window,
  );
  pushBox(elements, 'shade', 'shade-left', { left: 0, top: 0, width: thickness, height }, ink, alpha, width, height, window);
  pushBox(
    elements,
    'shade',
    'shade-right',
    { left: width - thickness, top: 0, width: thickness, height },
    ink,
    alpha,
    width,
    height,
    window,
  );
}

/**
 * ③ 边缘切边：外沿一道极细的线，四边明暗不同（顶最亮、底最暗）——
 * 光从上面打下来，金属边就是"上亮下暗"的一条。只有配方里有 `cut` 的材质才画。
 */
function buildCutLines(
  material: FrameMaterialSpec,
  width: number,
  height: number,
  window: Rect,
  elements: SkinElement[],
): void {
  const cut = material.cut;
  if (cut === null) {
    return;
  }
  const thickness = cut.ink.ratio * Math.min(width, height);
  if (!(thickness > 0)) {
    return;
  }
  const ink = cut.ink.color;
  const alpha = cut.ink.alpha;
  pushBox(
    elements,
    'cut',
    'cut-top',
    { left: 0, top: 0, width, height: thickness },
    cut.topHighlight.color,
    cut.topHighlight.alpha,
    width,
    height,
    window,
  );
  pushBox(
    elements,
    'cut',
    'cut-bottom',
    { left: 0, top: height - thickness, width, height: thickness },
    cut.bottomShadow.color,
    cut.bottomShadow.alpha,
    width,
    height,
    window,
  );
  pushBox(elements, 'cut', 'cut-left', { left: 0, top: 0, width: thickness, height }, ink, alpha, width, height, window);
  pushBox(
    elements,
    'cut',
    'cut-right',
    { left: width - thickness, top: 0, width: thickness, height },
    ink,
    alpha,
    width,
    height,
    window,
  );
}

/**
 * ④ 窗口内侧的内凹压痕：一圈极细的明暗对比 —— 暗在上/左、亮在下/右，
 * 读出来就是"这块纸被压进去了一档"（光从上方来，凹口的上沿背光、下沿迎光）。
 *
 * 四条线各自向两端各多伸出一个厚度，把四个角接上（不留缺口）；伸出量再夹回相纸内。
 * 它们贴着窗口边、但**不与窗口相交**（交集面积为 0）—— 这正是"压痕"该在的位置。
 */
function buildEmbossLines(
  material: FrameMaterialSpec,
  width: number,
  height: number,
  window: Rect,
  elements: SkinElement[],
): void {
  const thickness = material.emboss.ratio * Math.min(width, height);
  if (!(thickness > 0)) {
    return;
  }
  const { light, dark } = material.emboss;
  const frame = window;
  const left = clamp(frame.left, 0, width);
  const top = clamp(frame.top, 0, height);
  const right = clamp(frame.left + frame.width, left, width);
  const bottom = clamp(frame.top + frame.height, top, height);
  const spanX = Math.min(thickness, left);
  const spanY = Math.min(thickness, top);

  // 上（暗）：横贯窗口宽度，再向左右各伸出一个厚度
  pushBox(
    elements,
    'emboss',
    'emboss-top',
    { left: left - spanX, top: top - thickness, width: right - left + spanX * 2, height: thickness },
    dark.color,
    dark.alpha,
    width,
    height,
    window,
  );
  // 左（暗）：竖贯窗口高度，再向上下各伸出一个厚度
  pushBox(
    elements,
    'emboss',
    'emboss-left',
    { left: left - thickness, top: top - spanY, width: thickness, height: bottom - top + spanY * 2 },
    dark.color,
    dark.alpha,
    width,
    height,
    window,
  );
  // 下（亮）
  pushBox(
    elements,
    'emboss',
    'emboss-bottom',
    { left: left - spanX, top: bottom, width: right - left + spanX * 2, height: thickness },
    light.color,
    light.alpha,
    width,
    height,
    window,
  );
  // 右（亮）
  pushBox(
    elements,
    'emboss',
    'emboss-right',
    { left: right, top: top - spanY, width: thickness, height: bottom - top + spanY * 2 },
    light.color,
    light.alpha,
    width,
    height,
    window,
  );
}

/**
 * ⑤ 暗房晕染：每条边带由外向内逐级铺，越靠边越深（药水从边上渗进来）。
 *
 * `steps` 之和恒为 1（配方保证），所以每一级刚好占满带深；**不设最小可见尺寸过滤** ——
 * 材质是确定性几何，滤掉细条会让 96×72 的迷你预览与整幅成片的元素集合分叉，
 * 那正是 v1.7.0 探针抓出来的那类失败。极细的条子在小预览上等价于"更柔的过渡"。
 */
function buildBloomLines(
  bloom: MaterialBloom | null,
  bands: readonly SkinBand[],
  width: number,
  height: number,
  window: Rect,
  elements: SkinElement[],
): void {
  if (bloom === null) {
    return;
  }
  for (const band of bands) {
    const horizontal = band.side === 'top' || band.side === 'bottom';
    const depth = horizontal ? band.height : band.width;
    const outerFirst = band.side === 'top' || band.side === 'left';
    let cursor = 0;
    for (let step = 0; step < bloom.steps.length; step += 1) {
      const thickness = depth * bloom.steps[step];
      // 外沿起算；下/右两条边带的"外沿"在另一头，所以要反过来摆。
      const offset = outerFirst ? cursor : depth - cursor - thickness;
      cursor += thickness;
      const box: Rect = horizontal
        ? { left: band.left, top: band.top + offset, width: band.width, height: thickness }
        : { left: band.left + offset, top: band.top, width: thickness, height: band.height };
      pushBox(
        elements,
        'bloom',
        `bloom-${band.side}-${step}`,
        box,
        rgba(bloom.ink.r, bloom.ink.g, bloom.ink.b, bloom.alphas[step]),
        1,
        width,
        height,
        window,
      );
    }
  }
}

/**
 * 一份材质配方在**相纸留白**里要画的所有元素。
 *
 * 纯函数：同一个 (配方, width, height, window) 一定给出同一串元素（没有随机数，
 * 也不吃 seed）。探针直接拿它跑断言（窗口内 0 命中、逐元素可复现、
 * 96×72 迷你预览与整幅成片逐元素相等）。
 */
export function buildSkinElements(
  material: FrameMaterialSpec,
  width: number,
  height: number,
  window: Rect,
): SkinElement[] {
  if (!(width > 0) || !(height > 0)) {
    return [];
  }
  const elements: SkinElement[] = [];
  const bands = marginBands(width, height, window);
  buildTintLines(material, bands, width, height, window, elements);
  buildShadeLines(material, width, height, window, elements);
  buildCutLines(material, width, height, window, elements);
  buildEmbossLines(material, width, height, window, elements);
  buildBloomLines(material.bloom, bands, width, height, window, elements);
  return elements;
}

// ─────────────────────────────────────────────────────────────────────────
// 渲染
// ─────────────────────────────────────────────────────────────────────────

/** 一个元素 → 一个 `<View>` 的样式（材质元素全是轴对齐矩形）。 */
function elementStyle(element: SkinElement): ViewStyle {
  const style: ViewStyle = {
    position: 'absolute',
    left: element.box.left,
    top: element.box.top,
    width: element.box.width,
    height: element.box.height,
    backgroundColor: element.color,
  };
  if (element.opacity !== 1) {
    style.opacity = element.opacity;
  }
  if (element.blendMode !== undefined) {
    style.mixBlendMode = element.blendMode;
  }
  return style;
}

function FrameSkinInner({ width, height, window: photoWindow, radius = 0, variant }: FrameSkinProps) {
  const material = findFrameMaterial(variant);
  const elements = useMemo(
    () => buildSkinElements(material, width, height, photoWindow),
    // ⚠️ 依赖里除了 material 还必须有 width/height/window：
    //   换相框、转屏都会换画幅，只认 material 的话会留着上一套几何（错位）。
    //   写成四个标量而不是 window 对象，是为了不要求调用方把 window 缓存起来。
    [
      material,
      width,
      height,
      photoWindow.left,
      photoWindow.top,
      photoWindow.width,
      photoWindow.height,
    ],
  );

  // 尺寸还没量出来的那一帧什么都不渲染（否则会在左上角贴一个点）。
  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.root, { width, height, borderRadius: radius }]}>
      {elements.map((element) => (
        <View key={element.key} style={elementStyle(element)} />
      ))}
    </View>
  );
}

/**
 * 相框材质层。`memo` 是必要的：取景器每次重排（拖动、对焦、状态变化）都会重建整棵树，
 * 而材质只跟 (variant, 画幅, 窗口) 有关 —— 没变就不该重画。
 */
export const FrameSkin = memo(FrameSkinInner);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    // 裁掉溢出：元素本来都在相纸内，但相纸圆角 + 取整可能多出半个点。
    overflow: 'hidden',
  },
});
