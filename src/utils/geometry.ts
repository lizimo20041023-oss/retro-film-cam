/**
 * 相框排版计算 —— 全部是纯函数，输入相框数据 + 可用空间，输出逻辑点坐标。
 *
 * 关键点：取景器里的相框预览、以及最终成片的合成舞台，**用的是同一个函数**，
 * 所以"所见即所得"不是靠调参数凑出来的，而是结构上保证的。
 *
 * ⚠️ 这里算出来的坐标是**逻辑点**。成片的像素数由预设的 `captureLongEdge` 决定：
 *    截图时会把这些点按比例放大后交给 `captureRef`（见 `src/utils/captureOptions.ts`），
 *    所以相框和日期在大尺寸成片里依然是矢量/源图重绘，不会因为放大而变糊。
 *
 * ── 水印是怎么排出来的（读这一节就不用再猜四种版式的关系）─────────────────────
 * ① **水印区**：一块矩形，由 `frame.watermark?.anchor` 决定 ——
 *    `'window'` 时是画面内部下缘（贴照片底边），`'frame'` 时是相框的下留白。
 *    它的水平边界是 `window.left + inset` ~ `width - rightMargin - inset`，
 *    垂直基线由 `resolveBaseline` 统一给出（下留白里垂直居中，带 0.62 基线修正）。
 * ② **版式**：`WatermarkLayout` 只是把"地名"和"日期"两块内容在这块矩形里摆成不同样子。
 *    四种版式共用同一套字号 / 边距 / 基线规则，所以加版式不用改相框，加相框不用改版式。
 * ③ **墨色**：`tone` 不参与任何垂直定位，只改变颜色、字重、字号系数与字距
 *    （见 `TONE_STYLE`）—— 打字机体是印在相纸上的小字，本来就比点阵液晶小一圈。
 *
 * 三条从上一版保留下来的规则，别顺手改掉：
 *   1. 字号是**画面宽度**的比例（不是屏幕宽度）：换相框、换手机都不会比例失衡；
 *   2. 边距是**相框宽度**的比例：留白随图放大缩小；
 *   3. `frame` 锚点在**下留白里垂直居中**，用 0.62 修正基线（数码管字面偏上）。
 */
import type { LocaleId } from '../i18n/types';
import { joinPlaceAndDate, timestampTracking } from './formatTimestamp';
import type {
  FontWeight,
  FrameLayout,
  FrameSpec,
  LocationLayout,
  Rect,
  ResolvedTimestampConfig,
  Size,
  TimestampAnchor,
  TimestampLayout,
  WatermarkLayout,
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
 * 日期烧在哪：预设指定 > 相框自带 > 画面内部（window）。
 *
 * 预设里那个 `anchor` 是"用户这一卷想印哪儿"，相框里的是"这个相框物理上适合哪儿"，
 * 所以前者优先、后者兜底。
 */
export function resolveTimestampAnchor(
  frame: WatermarkFrameSpec,
  timestamp: ResolvedTimestampConfig,
): TimestampAnchor {
  return timestamp.anchor ?? frame.watermark?.anchor ?? 'window';
}

/* ==========================================================================
 * 水印排版（四种版式的唯一入口）
 * ========================================================================== */

/** 水印里的一行是哪一块内容。 */
export type WatermarkLineKind = 'place' | 'date';

/** 一段水印文字的水平贴边方式。 */
export interface WatermarkTextAlign {
  /** 贴左时用：距合成舞台左沿的距离（逻辑点）。 */
  left?: number;
  /** 贴右时用：距合成舞台右沿的距离（逻辑点）。 */
  right?: number;
  /**
   * 居中时用：`textAlign: 'center'` + 这里的宽度。
   * **必须给**：居中的行不带 `left` / `right`，不给宽度它就会按内容撑开、
   * 长地名直接冲出相框。
   */
  maxWidth?: number;
  /** 居中时写 `'center'`，靠边时留空（RN 的默认值就是靠边对齐）。 */
  textAlign?: 'center';
}

/** 水印里的一行：位置 + 可直接塞进 `<Text style>` 的排版属性。 */
export interface WatermarkLine {
  /** React key、调试标识。 */
  kind: WatermarkLineKind;
  /** 这一行画什么字。 */
  text: string;
  /** 基线：距合成舞台**底边**的距离（逻辑点）。 */
  bottom: number;
  /** 水平定位，见 `WatermarkTextAlign`。 */
  align: WatermarkTextAlign;
  /** 字号（逻辑点）。 */
  fontSize: number;
  /** 字距（逻辑点，已按语言 / 墨色收紧或放宽）。 */
  letterSpacing: number;
  /** 颜色，已按墨色解析好。 */
  color: string;
  /** 字重，已按墨色解析好。 */
  fontWeight: FontWeight;
  /** 同色辉光半径；0 = 不发光。 */
  glowRadius: number;
}

/**
 * 一次水印事件的完整排版方案 —— 合成层拿到它只需要照着画，不再做任何判断。
 *
 * 四种版式最终都归约成 `lines` 这个数组，所以 `FilmCompositor` 里
 * **一个 switch 都不需要**：加第五种版式 = 只改 `computeWatermarkPlan` 一处。
 */
export interface WatermarkPlan {
  /** 这次实际生效的锚点。 */
  anchor: TimestampAnchor;
  /** 这次实际生效的版式。 */
  layout: WatermarkLayout;
  /** 这次实际生效的墨色。 */
  tone: 'amber' | 'graphite';
  /** 相框 / 语言要求的强制大写（只有拉丁文字界面才为真）。 */
  uppercase: boolean;
  /** 水印区矩形（相对合成舞台左上角），调试与将来做"点击擦除"时会用到。 */
  region: Rect;
  /**
   * 实际要画的行，**已经过滤掉画不下的**：
   * 地名缺失时只有日期那一行；下留白窄到放不下两行时 `stacked` 会丢掉地名行。
   * 数组空 = 这张不烧水印。
   */
  lines: WatermarkLine[];
}

/**
 * 排版真正会读的相框字段。
 *
 * 为什么不用整个 `FrameSpec`：排版只关心"烧在哪、什么墨、贴哪边"，
 * 不需要 PNG、不需要 id。收窄到这里有两个好处：
 * 1. 单测 / 调试可以手搓一个两行的假相框，不用准备图片资源；
 * 2. `computeTimestampLayout` 这类旧接口能复用它，不必伪造一张不存在的 `FrameSpec`。
 *
 * 从 `FrameSpec['watermark']` 取类型而不是重写一遍：字段一多，重写的那份迟早和
 * 真实相框定义漂移（多一个字段就少一处能编译出来的提示）。
 */
export interface WatermarkFrameSpec {
  watermark?: FrameSpec['watermark'];
}

/** 墨色 → 颜色 / 字重 / 字号系数 / 字距系数。`tone` 只影响这些，不影响任何定位。 */
interface ToneStyle {
  /** 墨色本身的颜色。 */
  color: string;
  fontWeight: FontWeight;
  /** 乘在预设 `fontSizeRatio` 上。 */
  fontScale: number;
  /** 乘在预设 `letterSpacingRatio` 上（语言那一层倍数在 `timestampTracking` 里再乘）。 */
  trackingScale: number;
}

/**
 * 两种墨色。
 *
 * - `amber` 是经典橙色点阵液晶：颜色**听预设的**（预设可以把它调成黑白卷的浅灰），
 *   不透明、偏粗、带辉光；
 * - `graphite` 是打字机体小字：字号 0.82 倍、字距 0.8 倍、字重 400，发光关掉 ——
 *   打字机不发光。
 *
 * 这里的 `color` 只用于**压在照片上**（浅色 + 投影）。印在相纸留白上的深色是下面
 * 两个常量 —— 同一张相框的 `tone` 是常量，但"烧在照片上"和"印在留白上"要的是
 * 两种完全相反的颜色，见 `resolveInk`。
 */
const TONE_STYLE: Record<'amber' | 'graphite', ToneStyle> = {
  amber: { color: '#FF8A00', fontWeight: '700', fontScale: 1, trackingScale: 1 },
  graphite: { color: 'rgba(236, 232, 224, 0.88)', fontWeight: '400', fontScale: 0.82, trackingScale: 0.8 },
};

/**
 * 印在**相纸留白**上的两种墨。
 *
 * 纸是白的，所以这一支必须反过来取深色：
 * - `#5F6368` 打字机灰 —— 若沿用 `TONE_STYLE.graphite.color`（接近纸白）就是**隐形字**；
 * - `#B45309` 印字橙 —— 比液晶琥珀 `#FF8A00` 暗一档，白底上才压得住。
 */
const ON_PAPER_GRAPHITE = '#5F6368';
const ON_PAPER_AMBER = '#B45309';

/** 日期字号的上下限（逻辑点）。下限 8 是为了再小的相框也不会糊成一团。 */
const MIN_DATE_FONT = 8;
const MAX_DATE_FONT = 96;

/**
 * 地名相对日期的字号系数。
 *
 * 0.62 是视觉权重排出来的：地点是"附注"，日期才是主角；而且 35mm 那种窄幅相框里，
 * 等大的两行会显得很挤。这个系数**不跟墨色走** —— 墨色已经缩过一次了，
 * 再叠一次会让灰色小字变成不可读的 5pt。
 */
const PLACE_FONT_SCALE = 0.62;

/**
 * 下留白里的基线修正（0.62）。
 *
 * 数码管的字面在行盒里偏上，直接按"留白中心"摆会看起来偏低。
 * 0.62 是拿真实相框比出来的经验值，改它之前先在取景器里量一遍。
 */
const BASELINE_CORRECTION = 0.62;

/** `stacked` 版式里，地名行相对日期行的行距系数（× 日期字号）。 */
const STACKED_LEADING = 1.32;

/**
 * 水印区矩形的垂直几何。
 *
 * `top` / `bottom` 都是**逻辑点**，相对合成舞台左上角；`height` 是可用的竖向空间。
 * 之所以要单独算，是因为"多高才算放不下"这件事在 `window` 和 `frame` 两种锚点下
 * 完全是两回事：前者上界是照片顶边，后者上界是相框顶边。混用会让 35mm 那种
 * 上下都留白的相框算错。
 */
interface RegionVertical {
  top: number;
  bottom: number;
  height: number;
}

function regionVertical(layout: FrameLayout, anchor: TimestampAnchor, inset: number): RegionVertical {
  if (anchor === 'frame') {
    const top = layout.window.top + layout.window.height;
    return { top, bottom: layout.height - inset, height: Math.max(0, layout.bottomStripHeight - inset) };
  }
  return { top: 0, bottom: layout.bottomStripHeight, height: Math.max(0, layout.bottomStripHeight) };
}

/**
 * 基线与水印区矩形。
 *
 * 两种锚点唯一的区别就在这里，所以四种版式全部复用它 —— 想调"日期上下位置"
 * 只改这一个函数，四种版式一起动，不会出现某一种跑偏。
 */
function resolveBaselineAndRegion(
  layout: FrameLayout,
  config: ResolvedTimestampConfig,
  anchor: TimestampAnchor,
  fontSize: number,
): { bottom: number; region: Rect } {
  const inset = Math.max(2, Math.round(layout.width * config.insetRatio));
  const regionLeft = layout.window.left + inset;
  const regionRight = layout.rightMargin + inset;
  const regionWidth = Math.max(1, layout.width - regionLeft - regionRight);

  if (anchor === 'frame') {
    const rawBottom = Math.round(layout.bottomStripHeight / 2 - fontSize * BASELINE_CORRECTION);
    // 下留白很窄时（比如白边框），min/max 会自己收敛，不会把日期推出画面
    const minBottom = inset;
    const maxBottom = Math.max(inset, layout.bottomStripHeight - Math.round(fontSize * 1.05));
    const bottom = clamp(rawBottom, minBottom, maxBottom);
    const mat = regionVertical(layout, 'frame', inset);
    return {
      bottom,
      region: { left: regionLeft, top: mat.top, width: regionWidth, height: Math.max(0, bottom + fontSize - mat.top) },
    };
  }

  const bottom = layout.bottomStripHeight + inset;
  const inner = regionVertical(layout, 'window', inset);
  return {
    bottom,
    region: { left: regionLeft, top: inner.top, width: regionWidth, height: Math.max(0, bottom + fontSize - inner.top) },
  };
}

/**
 * 把预设定好的颜色 / 字重与墨色合并成最终样式。
 *
 * **颜色由锚点决定，不能只看 `tone`**：同一张相框的 `tone` 是常量，
 * 但"压在照片上"要浅色（底下可能是雪地、白墙、过曝天空），
 * "印在相纸留白上"要深色（纸是白的）。只按 `tone` 取色必然有一边看不见。
 */
function resolveInk(
  tone: 'amber' | 'graphite',
  config: ResolvedTimestampConfig,
  anchor: TimestampAnchor,
): { color: string; fontWeight: FontWeight } {
  if (anchor === 'window') {
    // 压在照片上：amber 听预设（预设可以把它调成黑白卷的浅灰），graphite 固定纸白。
    return tone === 'amber'
      ? { color: config.color, fontWeight: config.fontWeight }
      : { color: TONE_STYLE.graphite.color, fontWeight: TONE_STYLE.graphite.fontWeight };
  }
  // 印在相纸留白上。graphite 刻意**忽略**预设颜色：它不是"液晶换个颜色"，
  // 而是另一种印刷工艺。
  return tone === 'amber'
    ? { color: ON_PAPER_AMBER, fontWeight: config.fontWeight }
    : { color: ON_PAPER_GRAPHITE, fontWeight: TONE_STYLE.graphite.fontWeight };
}

/**
 * 四种版式的排版方案 —— 合成层只需要照着 `lines` 画。
 *
 * 输入输出单位：`layout` 是逻辑点；返回的 `bottom` / `left` / `right` / `maxWidth` /
 * `fontSize` / `letterSpacing` **全部是逻辑点**，交给 `<Text style>` 直接用，
 * 不要在这里乘 `PixelRatio`（成片像素由 `captureOptions` 统一决定）。
 *
 * 退化情形都在这里处理完（合成层不做任何判断）：
 * - 没有地名 → 只剩日期行，四种版式都成立；
 * - 下留白窄到放不下两行 → `stacked` 丢掉地名行，日期照常画；
 * - 地名过长 → 给靠边 / 居中两种情形都算出 `maxWidth`，配合 `numberOfLines={1}`
 *   由 RN 省略号收尾，而不是让文字冲出相框。
 */
export function computeWatermarkPlan(
  layout: FrameLayout,
  config: ResolvedTimestampConfig,
  frame: WatermarkFrameSpec,
  placeText: string,
  dateText: string,
  locale: LocaleId,
  layoutId: WatermarkLayout = 'split',
): WatermarkPlan {
  const anchor = resolveTimestampAnchor(frame, config);
  const tone: 'amber' | 'graphite' = frame.watermark?.tone ?? 'amber';
  const toneStyle = TONE_STYLE[tone];
  const tracking = timestampTracking(locale, tone === 'graphite', frame.watermark?.uppercase === true);
  const ink = resolveInk(tone, config, anchor);

  const dateFont = Math.round(
    clamp(layout.window.width * config.fontSizeRatio * toneStyle.fontScale, MIN_DATE_FONT, MAX_DATE_FONT),
  );
  const placeFont = Math.max(6, Math.round(dateFont * PLACE_FONT_SCALE));
  const inset = Math.max(2, Math.round(layout.width * config.insetRatio));
  const { bottom, region } = resolveBaselineAndRegion(layout, config, anchor, dateFont);
  const vertical = regionVertical(layout, anchor, inset);

  // 字距直接由"预设比例 × 墨色 × 语言"算出来，不再往下传三个乘数。
  const spacingOf = (fontSize: number): number =>
    Math.round(fontSize * config.letterSpacingRatio * toneStyle.trackingScale * tracking.letterSpacingScale * 100) /
    100;
  // RN 会在每个字符**后面**加字距，最后一个字符后面那一点也被算进文本宽度，
  // 靠右的行于是看着比边距远了半个字距。加宽字距的英文尤其明显，所以补回来。
  const flushRightOffset = (spacing: number): number => Math.round((layout.rightMargin + inset + spacing) * 100) / 100;

  // 辉光 / 投影只解决一个问题：让压在照片上的字从杂乱背景里浮出来。
  // 印在留白上的字**不加** —— 白纸上围一圈阴影看着像蹭脏了。
  // 下限 2 是因为 graphite 没有辉光配置，但它压在照片上同样需要投影才看得见。
  const glowRadius =
    anchor === 'window'
      ? Math.max(2, config.glow && tone === 'amber' ? Math.round(dateFont * 0.45) : 0)
      : 0;

  const dateLine = (overrides: Partial<WatermarkLine>): WatermarkLine => {
    const letterSpacing = spacingOf(dateFont);
    return {
      kind: 'date',
      text: dateText,
      bottom,
      align: { right: flushRightOffset(letterSpacing) },
      fontSize: dateFont,
      letterSpacing,
      color: ink.color,
      fontWeight: ink.fontWeight,
      glowRadius,
      ...overrides,
    };
  };

  const placeLine = (overrides: Partial<WatermarkLine>): WatermarkLine => {
    const letterSpacing = spacingOf(placeFont);
    return {
      kind: 'place',
      text: placeText,
      bottom,
      align: { left: Math.round((region.left - letterSpacing) * 100) / 100 },
      fontSize: placeFont,
      letterSpacing,
      color: ink.color,
      fontWeight: ink.fontWeight,
      // 地名不发光：辉光只属于液晶日期，地点是印在纸上的字。
      glowRadius: 0,
      ...overrides,
    };
  };

  const lines: WatermarkLine[] = [];
  const hasPlace = placeText.trim().length > 0;
  const hasDate = dateText.trim().length > 0;
  // 相框说贴哪边。`centered` 不看它（居中本身就是"两边都不贴"）。
  const side: 'left' | 'right' = frame.watermark?.align ?? 'right';

  if (layoutId === 'dateOnly') {
    if (hasDate) {
      // 没有地名可贴，"贴哪边"就由相框说了算：左对齐的相框（拍立得下巴）日期也在左。
      lines.push(dateLine(side === 'left' ? { align: { left: region.left } } : {}));
    }
  } else if (layoutId === 'centered') {
    const text = joinPlaceAndDate(hasPlace ? placeText : '', hasDate ? dateText : '');
    if (text.length > 0) {
      const letterSpacing = spacingOf(dateFont);
      lines.push({
        kind: hasPlace ? 'place' : 'date',
        text,
        bottom,
        // 居中的行不贴边，必须给宽度，否则长地名会按内容撑开、冲出相框。
        align: { left: region.left, maxWidth: region.width, textAlign: 'center' },
        fontSize: dateFont,
        letterSpacing,
        color: ink.color,
        fontWeight: ink.fontWeight,
        glowRadius,
      });
    }
  } else if (layoutId === 'stacked') {
    // 地名在上、日期在下，两行都贴同一边。地名行被顶出水印区就丢掉它 ——
    // 宁可少印一行，也不要让地名压到照片或相框边框上。
    const placeBottom = bottom + dateFont * STACKED_LEADING;
    const placeTop = placeBottom + placeFont;
    if (hasPlace && vertical.top + placeTop <= vertical.bottom) {
      const letterSpacing = spacingOf(placeFont);
      lines.push(
        placeLine(
          side === 'left'
            ? { bottom: placeBottom, align: { left: Math.round((region.left - letterSpacing) * 100) / 100 } }
            : {
                bottom: placeBottom,
                align: { right: flushRightOffset(letterSpacing) },
              },
        ),
      );
    }
    if (hasDate) {
      lines.push(dateLine(side === 'left' ? { align: { left: region.left } } : {}));
    }
  } else {
    // split：地名贴左、日期贴右，共用同一条基线。
    // 两行各分一半宽度：谁长谁自己省略号，绝不互相压字。
    const half = Math.round(region.width * 0.52);
    if (hasPlace) {
      const spacing = spacingOf(placeFont);
      lines.push(
        placeLine({
          align: {
            // 复用 placeLine 默认的左偏移，只补一个宽度上限。
            left: Math.round((region.left - spacing) * 100) / 100,
            maxWidth: half,
          },
        }),
      );
    }
    if (hasDate) {
      const spacing = spacingOf(dateFont);
      lines.push(
        dateLine({
          align: { right: flushRightOffset(spacing), maxWidth: region.width - half },
        }),
      );
    }
  }

  return {
    anchor,
    layout: layoutId,
    tone,
    uppercase: tracking.uppercase,
    region,
    lines,
  };
}

/* ==========================================================================
 * 单块排版（旧接口，保留给只画日期 / 只画地名的调用方，行为与上一版一致）
 * ========================================================================== */

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
  // 旧接口只需要"日期那一行"，所以借道新版式算一次 `dateOnly`：
  // 两边的字号 / 边距 / 基线修正因此**不可能对不上**（这正是留这个壳子的原因）。
  const frame: WatermarkFrameSpec = { watermark: { anchor } };
  const plan = computeWatermarkPlan(layout, config, frame, '', '1', 'en', 'dateOnly');
  const line = plan.lines[0];
  const fallbackFont = Math.round(clamp(layout.window.width * config.fontSizeRatio, MIN_DATE_FONT, MAX_DATE_FONT));
  return {
    right: line?.align.right ?? layout.rightMargin + Math.max(2, Math.round(layout.width * config.insetRatio)),
    bottom: line?.bottom ?? Math.max(2, Math.round(layout.width * config.insetRatio)),
    fontSize: line?.fontSize ?? fallbackFont,
    letterSpacing: line?.letterSpacing ?? Math.round(fallbackFont * config.letterSpacingRatio * 100) / 100,
  };
}

/**
 * 定位水印（地名 / 经纬度）的位置与字号。
 *
 * 三条刻意定死的规则：
 * 1. **和日期共用同一条基线**（直接复用 `computeTimestampLayout` 的 `bottom`）：
 *    一行在左下、一行在右下，永远齐平，也永远撞不上 —— 不用为"谁更长"做避让；
 * 2. 左边距 = `window.left + inset`，正好是日期右边距的镜像（日期是
 *    `rightMargin + inset`，而 `rightMargin` 就是窗口右沿到相框右沿的距离）；
 * 3. 字号是日期的 **0.62 倍**：地点是"附注"，日期才是主角，
 *    而且 35mm 那种窄幅相框里，等大的两行会显得很挤。
 */
export function computeLocationLayout(
  layout: FrameLayout,
  config: ResolvedTimestampConfig,
  anchor: TimestampAnchor,
): LocationLayout {
  const timestamp = computeTimestampLayout(layout, config, anchor);
  const inset = Math.max(2, Math.round(layout.width * config.insetRatio));
  return {
    left: layout.window.left + inset,
    bottom: timestamp.bottom,
    fontSize: Math.max(6, Math.round(timestamp.fontSize * PLACE_FONT_SCALE)),
    letterSpacing: timestamp.letterSpacing,
  };
}
