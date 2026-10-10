/**
 * 相框排版计算 —— 全部是纯函数，输入相框数据 + 可用空间，输出逻辑点坐标。
 *
 * 关键点：取景器里的相框预览、以及最终成片的合成舞台，**用的是同一个函数**，
 * 所以"所见即所得"不是靠调参数凑出来的，而是结构上保证的。
 *
 * ⚠️ 这里算出来的坐标是**逻辑点**。成片的像素数由预设的 `captureLongEdge` 决定：
 *    截图时会把这些点按比例放大后交给 `captureRef`（见 `src/utils/captureOptions.ts`），
 *    所以相框和日期在大尺寸成片里依然是矢量/源图重绘，不会因为放大而变糊。
 */
import type {
  FrameLayout,
  FrameSpec,
  Rect,
  ResolvedTimestampConfig,
  Size,
  TimestampAnchor,
  TimestampLayout,
} from '../types';

function clamp(value: number, min: number, max: number): number {
  const hi = Math.max(min, max);
  return Math.min(Math.max(value, min), hi);
}

/**
 * 在 maxWidth × maxHeight 里塞下一个 aspect（宽/高）的盒子，保持比例。
 * 先按宽度试，超高了再按高度收缩 —— 两个方向都能贴边。
 */
export function fitBox(aspect: number, maxWidth: number, maxHeight: number): Size {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeMaxWidth = Math.max(1, maxWidth);
  const safeMaxHeight = Math.max(1, maxHeight);

  let width = Math.floor(safeMaxWidth);
  let height = Math.round(width / safeAspect);
  if (height > safeMaxHeight) {
    height = Math.floor(safeMaxHeight);
    width = Math.round(height * safeAspect);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * 把相框归一化窗口换算成绝对坐标，并顺带算出"下留白高度 / 右边距"。
 * 后两者是日期水印定位的基础：拍立得的下白边、35mm 的下黑边都靠它。
 */
export function computeFrameLayout(frame: FrameSpec, maxWidth: number, maxHeight: number): FrameLayout {
  const box = fitBox(frame.aspect, maxWidth, maxHeight);

  const left = clamp(Math.round(frame.window.x * box.width), 0, box.width - 1);
  const top = clamp(Math.round(frame.window.y * box.height), 0, box.height - 1);
  const width = clamp(Math.round(frame.window.width * box.width), 1, box.width - left);
  const height = clamp(Math.round(frame.window.height * box.height), 1, box.height - top);
  const window: Rect = { left, top, width, height };

  return {
    width: box.width,
    height: box.height,
    aspect: box.width / box.height,
    window,
    // 窗口下沿 → 相框底边
    bottomStripHeight: Math.max(0, box.height - (top + height)),
    // 窗口右沿 → 相框右边
    rightMargin: Math.max(0, box.width - (left + width)),
  };
}

/**
 * 日期烧在哪：预设指定 > 相框自带默认 > 画面内部（window）。
 */
export function resolveTimestampAnchor(
  frame: FrameSpec,
  timestamp: ResolvedTimestampConfig,
): TimestampAnchor {
  return timestamp.anchor ?? frame.defaultTimestampAnchor ?? 'window';
}

/**
 * 日期水印的位置与字号。
 *
 * - 字号跟**画面宽度**绑定（不是跟屏幕宽度）：这样换相框、换手机都不会比例失衡；
 * - `inset` 跟相框宽度绑定，留白随图放大缩小；
 * - 锚点 `frame` 时垂直居中于下留白（数码管基线偏低，用 0.62 修正）；
 * - 锚点 `window` 时贴在画面内部右下角，退到下留白之上 inset 的位置。
 */
export function computeTimestampLayout(
  layout: FrameLayout,
  config: ResolvedTimestampConfig,
  anchor: TimestampAnchor,
): TimestampLayout {
  const fontSize = Math.round(clamp(layout.window.width * config.fontSizeRatio, 8, 96));
  const letterSpacing = Math.round(fontSize * config.letterSpacingRatio * 100) / 100;
  const inset = Math.max(2, Math.round(layout.width * config.insetRatio));

  if (anchor === 'frame') {
    const rawBottom = Math.round(layout.bottomStripHeight / 2 - fontSize * 0.62);
    // 下留白很窄时（比如白边框），min/max 会自己收敛，不会把日期推出画面
    const minBottom = inset;
    const maxBottom = Math.max(inset, layout.bottomStripHeight - Math.round(fontSize * 1.05));
    return {
      right: layout.rightMargin + inset,
      bottom: clamp(rawBottom, minBottom, maxBottom),
      fontSize,
      letterSpacing,
    };
  }

  return {
    right: layout.rightMargin + inset,
    // 画面内部：从相框底部往上数，先跨过下留白，再留 inset
    bottom: layout.bottomStripHeight + inset,
    fontSize,
    letterSpacing,
  };
}
