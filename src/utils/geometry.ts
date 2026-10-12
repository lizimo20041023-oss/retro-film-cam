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
 *
 * ④ **七段日期**：日期行不再是一串文字，而是 `SegmentDate` 画出来的石英数码管。
 *    宽度由 `segmentDateWidth()` **精确算出**、写进 `WatermarkLine.quartz`，
 *    渲染层把这一行当**固定宽度**容器画 —— 这就是"时间被截断成 `26 10...`"的根治办法
 *    （文字行会被 `flexShrink` 压，固定宽度压不动）。字宽 / 格距的比例常量也放在这里
 *    （`QUARTZ_*`），和 `SegmentDate.tsx` 共用同一份，两边不会漂。
 */
import type { LocaleId } from '../i18n/types';
import { CENTERED_SEPARATOR, pad2, timestampTracking } from './formatTimestamp';
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

/**
 * 水印里的一行是哪一块内容。
 *
 * `'code'` 是"关闭定位时印摄影代号"那一行（`PR-400 // ISO 400 · 35MM · EXP.07`）：
 * 它占的正是地名那一行的位置，字号比地名再小一档、颜色与墨色一致。
 * 单独给一个 kind 而不是复用 `'place'`，是为了在调试和单测输出里一眼看出
 * "这一行不是地名，是机器代号"。
 */
export type WatermarkLineKind = 'place' | 'date' | 'code';

/* ==========================================================================
 * 七段数码管（Quartz Date）的字宽
 * ========================================================================== */

/**
 * 一位数字的宽度 ÷ 数码管高度。
 *
 * 0.55 是七段数码管的经典字宽比（比等宽字体的 0.6 窄一点）：
 * 横段够长才像"管子"，再宽就会像三个方块拼起来的方格纸。
 */
export const QUARTZ_DIGIT_WIDTH_RATIO = 0.55;
/** 窄格（引号 / 空格 / 小数点）宽度 ÷ 高度。规格给的 0.2。 */
export const QUARTZ_MARK_WIDTH_RATIO = 0.2;
/** 相邻两格之间的空档 ÷ 高度。 */
export const QUARTZ_CELL_GAP_RATIO = 0.06;
/** 段与段之间的缝宽（逻辑点），也是 `SegmentDate` 的 `gap` 默认值。 */
export const QUARTZ_SEGMENT_GAP = 0.5;

/** 石英日期里的一个格子。 */
export interface QuartzCell {
  /** 这格里是哪个字符（数字走七段，其余走窄格）。 */
  char: string;
  /** 距整串左沿的距离（逻辑点）。 */
  left: number;
  /** 格宽（逻辑点）：数字 ≈ `height * 0.55`，窄格 `height * 0.2`。 */
  width: number;
}

/** 一整串石英日期的格子排布。渲染层**只照着画**，不再自己算宽度。 */
export interface QuartzCellLayout {
  /** 整串宽度 —— 这就是 `WatermarkLine.quartz.width` 的来源。 */
  width: number;
  height: number;
  gap: number;
  cells: QuartzCell[];
}

/** 两位小数。水印全链路的"精度收敛点"，免得 `0.55 * 10` 的浮点尾巴跑到宽度上。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 数字格 / 窄格各占多宽。 */
function quartzCellWidth(char: string, height: number): number {
  const ratio = char >= '0' && char <= '9' ? QUARTZ_DIGIT_WIDTH_RATIO : QUARTZ_MARK_WIDTH_RATIO;
  return round2(height * ratio);
}

/** 格与格之间的空档：至少一个缝宽，免得相邻数字挤在一起。 */
function quartzCellGap(height: number, gap: number): number {
  return round2(Math.max(gap, height * QUARTZ_CELL_GAP_RATIO));
}

/**
 * 把一串石英日期摊成格子：`'26  10  12` → 11 格（引号 1 + 数字 6 + 空格 4）。
 *
 * 空格也占格：它是"年月日分组"的空档，宽度和引号 / 小数点一样是窄格
 * （`SegmentDate.tsx` 里写了为什么空格不落墨）。
 */
export function quartzCellLayout(text: string, height: number, gap: number = QUARTZ_SEGMENT_GAP): QuartzCellLayout {
  const cellGap = quartzCellGap(height, gap);
  const cells: QuartzCell[] = [];
  let left = 0;
  for (const char of text) {
    const width = quartzCellWidth(char, height);
    cells.push({ char, left: round2(left), width });
    left += width + cellGap;
  }
  return {
    // 最后一个格子后面没有空档
    width: cells.length === 0 ? 0 : round2(left - cellGap),
    height,
    gap,
    cells,
  };
}

/**
 * 石英日期的总宽度（逻辑点）。
 *
 * **这是"日期行宽度"的唯一定义**：`computeWatermarkPlan` 用它算 `quartz.width`，
 * `SegmentDate` 用它算容器宽度和每个格子的落点。两边共用同一个函数，
 * "算出来的宽度"和"画出来的宽度"在结构上不可能不一致 ——
 * 这正是"日期被截断"那个 bug（宽度由文字排版挤出来）的修复方式。
 */
export function segmentDateWidth(text: string, height: number, gap: number = QUARTZ_SEGMENT_GAP): number {
  return quartzCellLayout(text, height, gap).width;
}

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
  /** 阴影半径；0 = 不投影。数值取多少见 `dateLine` / `placeLine` 里的注释。 */
  glowRadius: number;
  /**
   * 阴影颜色。**不填 = 同色辉光**（液晶日期压在照片上时要的那圈橙光，
   * 颜色就是这一行的 `color`）；填了就是一块普通投影（地名 / 代号压在照片上时的黑投影）。
   */
  shadowColor?: string;
  /**
   * 这一行是**石英数码管**而不是文字（不填 = 普通 `<Text>` 行）。
   *
   * ⚠️ **契约（和 `FilmCompositor.tsx` 里各写一份）**：给了 `quartz` 就必须用
   * `<SegmentDate .../>` 渲染，**不能**退回 `<Text>` —— 文字行会被 `flexShrink` 压缩，
   * 一压就成了 `26 10...`，那正是要修掉的 bug。同时：
   * - 容器的宽度**只能**用 `quartz.width`，而且不许被任何 flex 规则改小；
   * - `text` 是紧挨在数码管**前面**的那一小段文字（`centered` 版式里的"地名 + 分隔符"，
   *   其它版式是空串），它才是可以被省略号收掉的那一段。
   */
  quartz?: WatermarkQuartz;
}

/** 一行石英数码管的渲染参数。宽度来自 `segmentDateWidth()`，渲染层照抄，不再自己算。 */
export interface WatermarkQuartz {
  /** 数码管本身要画的串：`formatQuartzDate()` 的输出（例如 `'26  10  12`）。 */
  text: string;
  /** 整串宽度（逻辑点）：容器宽度必须是它，且不可压缩。 */
  width: number;
  /** 一位数字的高度（逻辑点）。 */
  height: number;
  /** 段与段之间的缝宽（逻辑点）。 */
  gap: number;
  /** 管外那圈阴影的颜色（见 `quartzShadow`）。 */
  shadowColor: string;
  /** 阴影半径（逻辑点）。 */
  shadowRadius: number;
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

/**
 * 压在照片上的**印字**墨色（规格 §六.4 里管它叫 `OVER_PHOTO_INK`）。
 *
 * 值和 `TONE_STYLE.graphite.color` 是同一个，这里再起一个名字不是重复定义，而是因为
 * 它在这个语境下有更窄的含义：**任何压在照片上的地名 / 代号都用它**，
 * 不跟 `tone` 走。日期那一行是"液晶"，可以按 tone 用琥珀橙；地名是"印在画面上的字"，
 * 照片亮部（雪地 / 白墙 / 过曝天空）一样会把橙色吃掉 —— 所以两行在照片上不同色。
 */
const OVER_PHOTO_INK = TONE_STYLE.graphite.color;
/** 压在照片上的印字投影：小半径纯黑。这是**投影**不是辉光 —— 辉光只给液晶日期。 */
const OVER_PHOTO_SHADOW = 'rgba(0, 0, 0, 0.6)';

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
 * 石英数码管的管高 ÷ 日期字号。
 *
 * 为什么不 1:1：规格要的是"字号缩小至精致克制的 10pt ~ 11pt"，而这个 App 的日期字号
 * 是**跟画面窗口宽度成比例**的（上面规则 1，不许改），典型手机上算出来是 14~20pt。
 * 取 0.58 之后：18pt → 10.4（四舍五入 10，正好落在规格那一档）、17pt → 10、14pt → 8。
 * 也就是说"大画幅的手机"落在 10~11pt，"窄窗口的相框（35mm / 幻灯卡）"会小到 8pt ——
 * 这是**故意**的：宁可守住比例规则，也不给某几个相框开小灶。
 */
const QUARTZ_HEIGHT_SCALE = 0.58;
/**
 * 数码管最小管高（逻辑点）。
 *
 * 再小下去段厚只剩 0.8pt、缝 0.5pt，管子和缝会糊成一片。
 * 日期字号下限 `MIN_DATE_FONT = 8` 乘 0.58 是 4.64，所以这条兜底真的会被用到
 * （窄幅相框 + 小屏）。
 */
const MIN_QUARTZ_HEIGHT = 6;
/**
 * 文字行盒高度 ÷ 字号（iOS 默认行高 ≈ 1.16 × 字号）。
 *
 * 用来把数码管摆在**原来那一行文字的位置上垂直居中**：`bottom` 是给文字行盒算的，
 * 直接把管子的下沿放到 `bottom` 会显得偏下（管子没有降部）。
 * 0.62 基线修正那套规则一个字没动，这里只是把"文字行盒的中心"换算成"管子的下沿"。
 */
const QUARTZ_LINE_BOX_RATIO = 1.16;
/** 摄影代号行字号 ÷ 地名行字号（规格：代号比地名再小一档）。 */
const CODE_FONT_SCALE = 0.9;
/** `split` 版式里地名与日期之间至少留的空档（逻辑点），免得两段字贴在一起。 */
const SPLIT_GUTTER = 12;
/** 石英管的辉光色：规格给的 `rgba(255, 144, 0, 0.45)`，就是琥珀橙 `#FF9000` 的 45%。 */
const QUARTZ_GLOW_COLOR = 'rgba(255, 144, 0, 0.45)';
/** 压在照片上的辉光半径（逻辑点）。规格给的 3 —— 管子细，半径一大就糊成一根亮棒。 */
const QUARTZ_GLOW_RADIUS = 3;
/** 印在相纸留白上时描的极淡暗边：白纸上的亮橙会"发飘"，不描边就看不出管子在哪。 */
const QUARTZ_EDGE_COLOR = 'rgba(0, 0, 0, 0.28)';
/** 暗边半径（逻辑点）。 */
const QUARTZ_EDGE_RADIUS = 1;

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
 * 关闭定位时要印的**摄影代号**行：`PR-400 // ISO 400 · 35MM · EXP.07`。
 *
 * 规则：
 * - 代号就是 `preset.name`（现成的工业代号：`PR-400` / `CCD-CYBER` / `800-T`…）；
 * - ISO 从代号里**解析** —— 取**最后一段连续数字**：`PR-400`→`400`、`VV-50`→`50`、
 *   `800-T`→`800`、`DIGI-02`→`02`（保留前导零）、`EXP-64`→`64`；
 *   解析不出来时（`CCD-CYBER` 这种纯字母）**整段 `ISO xxx` 丢掉**，不猜、不编；
 * - `35MM` 是固定字面量（这个 App 的成片一律按 35mm 记）；
 * - `EXP.` 后面是这一卷拍到第几张（1 起数，补两位）；
 * - 没有 `exposureIndex`（或不是 ≥1 的有限数）就印到 `· 35MM` 为止；
 * - `preset.name` 本身是空串 → 返回空串，这一行整个不印。
 *
 * 纯函数：只吃一个字符串和一个数字，不读 `Date`、不读 `Stage`，所以能在 Node 里直接跑单测。
 */
export function formatExposureCode(presetName: string, exposureIndex?: number): string {
  const name = presetName.trim();
  if (name.length === 0) {
    return '';
  }
  // 最后一段连续数字：`800-T` 的 800 在中间，所以不能用"结尾数字"那种写法
  const digits = /(\d+)(?!.*\d)/.exec(name);
  const parts: string[] = [];
  if (digits !== null) {
    parts.push(`ISO ${digits[1]}`);
  }
  parts.push('35MM');
  if (typeof exposureIndex === 'number' && Number.isFinite(exposureIndex) && exposureIndex >= 1) {
    parts.push(`EXP.${pad2(Math.floor(exposureIndex))}`);
  }
  return `${name} // ${parts.join(' · ')}`;
}

/**
 * 石英管外那圈阴影。
 *
 * 为什么和文字行的 `glowRadius` 分开算：两者要的"发光"不是一回事 ——
 * 文字是压在照片上的浅色小字，要大半径的彩色辉光才浮得出来；管子是**细线**，
 * 半径一大就糊成一根亮棒，所以规格给的也是固定的 3。
 * 印在相纸留白上的管子不发辉光，但要描一圈极淡的暗边：白纸上的亮橙会"发飘"，
 * 没有边就看不出管子在哪（这就是 `SegmentDate` 那个 `shadowColor` 参数的用途）。
 */
function quartzShadow(
  anchor: TimestampAnchor,
  tone: 'amber' | 'graphite',
  config: ResolvedTimestampConfig,
): Pick<WatermarkQuartz, 'shadowColor' | 'shadowRadius'> {
  if (anchor === 'frame') {
    return { shadowColor: QUARTZ_EDGE_COLOR, shadowRadius: QUARTZ_EDGE_RADIUS };
  }
  if (tone === 'amber' && config.glow) {
    return { shadowColor: QUARTZ_GLOW_COLOR, shadowRadius: QUARTZ_GLOW_RADIUS };
  }
  // 压在照片上的 graphite（或用户把辉光关了）：黑色投影，和文字行的规则保持一致
  return { shadowColor: 'rgba(0, 0, 0, 0.55)', shadowRadius: QUARTZ_EDGE_RADIUS + 1 };
}

/**
 * 四种版式的排版方案 —— 合成层只需要照着 `lines` 画。
 *
 * 输入输出单位：`layout` 是逻辑点；返回的 `bottom` / `left` / `right` / `maxWidth` /
 * `fontSize` / `letterSpacing` / `quartz.*` **全部是逻辑点**，交给 `<Text style>` 或
 * `<SegmentDate>` 直接用，不要在这里乘 `PixelRatio`（成片像素由 `captureOptions` 统一决定）。
 *
 * 退化情形都在这里处理完（合成层不做任何判断）：
 * - 没有地名 → 只剩日期行，四种版式都成立；
 * - 没有地名但有摄影代号（关了定位）→ 代号顶替地名那一行，字号再小一档；
 * - 下留白窄到放不下两行 → `stacked` 丢掉地名行，日期照常画；
 * - 地名过长 → 靠边 / 居中两种情形都算出 `maxWidth`，配合 `numberOfLines={1}`
 *   由 RN 省略号收尾；**日期行相反**：宽度是算出来的确定值，谁也不许压它。
 */
export function computeWatermarkPlan(
  layout: FrameLayout,
  config: ResolvedTimestampConfig,
  frame: WatermarkFrameSpec,
  placeText: string,
  dateText: string,
  locale: LocaleId,
  layoutId: WatermarkLayout = 'split',
  /** 关闭定位时要印的摄影代号行（`PR-400 // ISO 400 · 35MM · EXP.07`）；空串 = 没有。 */
  codeText: string = '',
): WatermarkPlan {
  const anchor = resolveTimestampAnchor(frame, config);
  const tone: 'amber' | 'graphite' = frame.watermark?.tone ?? 'amber';
  const toneStyle = TONE_STYLE[tone];
  const tracking = timestampTracking(locale, tone === 'graphite', frame.watermark?.uppercase === true);
  const ink = resolveInk(tone, config, anchor);
  /**
   * 地名 / 代号那一行的墨色。
   *
   * ⚠️ 压在照片上时**一律**换成浅灰白（规格 §六.4 的墨色规则）：日期是液晶，可以按
   * `tone` 走琥珀橙；地名是"印在画面上的字"，照片亮部会把橙色吃掉。
   * 印在相纸留白上时两行同色 —— 纸是白的，深色一定看得见，没必要分开。
   */
  const placeInk =
    anchor === 'window' ? { color: OVER_PHOTO_INK, fontWeight: TONE_STYLE.graphite.fontWeight } : ink;

  const dateFont = Math.round(
    clamp(layout.window.width * config.fontSizeRatio * toneStyle.fontScale, MIN_DATE_FONT, MAX_DATE_FONT),
  );
  const placeFont = Math.max(6, Math.round(dateFont * PLACE_FONT_SCALE));
  const inset = Math.max(2, Math.round(layout.width * config.insetRatio));
  const { bottom, region } = resolveBaselineAndRegion(layout, config, anchor, dateFont);
  const vertical = regionVertical(layout, anchor, inset);
  /** 水印区右沿（距舞台右沿的距离）。文字行要补一个尾字距，数码管不补。 */
  const regionRight = layout.rightMargin + inset;

  // 字距直接由"预设比例 × 墨色 × 语言"算出来，不再往下传三个乘数。
  const spacingOf = (fontSize: number): number =>
    Math.round(fontSize * config.letterSpacingRatio * toneStyle.trackingScale * tracking.letterSpacingScale * 100) /
    100;
  // RN 会在每个字符**后面**加字距，最后一个字符后面那一点也被算进文本宽度，
  // 靠右的行于是看着比边距远了半个字距。加宽字距的英文尤其明显，所以补回来。
  // ⚠️ 数码管**不做**这个补偿：它的宽度是 `segmentDateWidth` 算出来的，没有尾字距。
  const flushRightOffset = (spacing: number): number => Math.round((layout.rightMargin + inset + spacing) * 100) / 100;

  // 辉光 / 投影只解决一个问题：让压在照片上的字从杂乱背景里浮出来。
  // 印在留白上的字**不加** —— 白纸上围一圈阴影看着像蹭脏了。
  // 下限 2 是因为 graphite 没有辉光配置，但它压在照片上同样需要投影才看得见。
  // ⚠️ 这一支是**文字行**的规则（`centered` 版式里那半行文字仍然用它）；
  // 数码管的阴影是另一套，见 `quartzShadow`。
  const glowRadius =
    anchor === 'window'
      ? Math.max(2, config.glow && tone === 'amber' ? Math.round(dateFont * 0.45) : 0)
      : 0;

  const hasDate = dateText.trim().length > 0;
  /*
   * 石英日期：宽度**先算出来**，再交给渲染层当固定宽度用。
   * 这是"时间被截断"的根治点 —— 老实现里日期行的宽度是 `<Text>` 排出来的，
   * 被 `flexShrink` 一压就成了 `26 10...`；现在它是一个算好的数，压不动。
   */
  const quartzText = dateText.trim();
  const quartzHeight = Math.max(MIN_QUARTZ_HEIGHT, Math.round(dateFont * QUARTZ_HEIGHT_SCALE));
  const quartz: WatermarkQuartz = {
    text: quartzText,
    width: hasDate ? segmentDateWidth(quartzText, quartzHeight, QUARTZ_SEGMENT_GAP) : 0,
    height: quartzHeight,
    gap: QUARTZ_SEGMENT_GAP,
    ...quartzShadow(anchor, tone, config),
  };
  // 管子在"原来那一行文字"的位置上垂直居中：`bottom` 是给文字行盒算的，管子没有降部。
  const quartzBottom = round2(bottom + (dateFont * QUARTZ_LINE_BOX_RATIO - quartzHeight) / 2);

  const dateLine = (overrides: Partial<WatermarkLine>): WatermarkLine => ({
    kind: 'date',
    // 七段日期不是文字：`text` 留空，内容在 `quartz.text` 里（见 `WatermarkLine.quartz`）
    text: '',
    bottom: quartzBottom,
    // 靠右时**不补**尾字距：数码管的右沿就是水印区右沿
    align: { right: regionRight },
    fontSize: dateFont,
    // 数码管没有字距（格宽已经算进字形里）；这个字段只对 `centered` 那半行文字有意义
    letterSpacing: 0,
    color: ink.color,
    fontWeight: ink.fontWeight,
    glowRadius,
    quartz,
    ...overrides,
  });

  const placeLine = (overrides: Partial<WatermarkLine>): WatermarkLine => {
    const letterSpacing = spacingOf(placeFont);
    // 阴影按**这一行自己的**字号算：代号行比地名行再小一档（`overrides.fontSize`）
    const size = overrides.fontSize ?? placeFont;
    return {
      kind: 'place',
      text: placeText,
      bottom,
      align: { left: Math.round((region.left - letterSpacing) * 100) / 100 },
      fontSize: placeFont,
      letterSpacing,
      color: placeInk.color,
      fontWeight: placeInk.fontWeight,
      /*
       * 阴影分两种情形：
       * - 压在照片上：一圈**小黑投影**（半径 ≈ 0.35 字号，下限 1）。地名 / 代号只有
       *   8~9pt，浅灰白的小字没有投影就会被照片的花纹吃掉；但它不是辉光，
       *   所以半径小、颜色是黑的 —— 一发光就变成"第二块液晶"了。
       * - 印在相纸留白上：不投影。白纸上围一圈阴影看着像蹭脏了。
       */
      glowRadius: anchor === 'window' ? Math.max(1, Math.round(size * 0.35)) : 0,
      ...(anchor === 'window' ? { shadowColor: OVER_PHOTO_SHADOW } : {}),
      ...overrides,
    };
  };

  const lines: WatermarkLine[] = [];
  const hasPlace = placeText.trim().length > 0;
  /*
   * 关闭定位时印摄影代号：它**顶替地名那一行**（规格 §六.3），
   * 不是在日期那一行旁边再加一段 —— 所以"地名 / 代号"合成一个 slot，
   * 四种版式里凡是原来摆地名的地方，摆的都是这个 slot。
   */
  const code = codeText.trim();
  const slotText = hasPlace ? placeText : code;
  const slotKind: WatermarkLineKind = hasPlace ? 'place' : 'code';
  const hasSlot = slotText.trim().length > 0;
  // 代号行字号比地名行再小一档（× 0.9），颜色与墨色一致（`placeLine` 会给）
  const slotFont = hasPlace ? placeFont : Math.max(6, Math.round(placeFont * CODE_FONT_SCALE));
  // 相框说贴哪边。`centered` 不看它（居中本身就是"两边都不贴"）。
  const side: 'left' | 'right' = frame.watermark?.align ?? 'right';

  if (layoutId === 'dateOnly') {
    if (hasDate) {
      // 没有地名可贴，"贴哪边"就由相框说了算：左对齐的相框（拍立得下巴）日期也在左。
      lines.push(
        dateLine(
          side === 'left'
            ? { align: { left: region.left, maxWidth: quartz.width } }
            : { align: { right: regionRight, maxWidth: quartz.width } },
        ),
      );
    }
  } else if (layoutId === 'centered') {
    if (hasDate) {
      /*
       * 底部正中等宽单行：`[ 地名 · 'YY MM DD ]`。
       * 这一行是**两个片段**：文字（带分隔符）+ 数码管。分隔符挂在文字尾巴上，
       * 数码管是独立的一段，所以这里不用 `joinPlaceAndDate`
       * —— 见 `formatTimestamp.ts` 里对那个函数现状的说明。
       */
      const slotSpacing = spacingOf(slotFont);
      lines.push({
        kind: hasSlot ? slotKind : 'date',
        text: hasSlot ? `${slotText}${CENTERED_SEPARATOR}` : '',
        bottom,
        // 居中的行不贴边，必须给宽度，否则长地名会按内容撑开、冲出相框。
        align: { left: region.left, maxWidth: region.width, textAlign: 'center' },
        fontSize: hasSlot ? slotFont : dateFont,
        letterSpacing: hasSlot ? slotSpacing : 0,
        color: ink.color,
        fontWeight: ink.fontWeight,
        glowRadius,
        quartz,
      });
    } else if (hasSlot) {
      // 日期整个关掉时这一行就是纯文字，没有数码管（合成层照旧渲染 `<Text>`）。
      lines.push(
        placeLine({
          kind: slotKind,
          text: slotText,
          fontSize: slotFont,
          letterSpacing: spacingOf(slotFont),
          align: { left: region.left, maxWidth: region.width, textAlign: 'center' },
        }),
      );
    }
  } else if (layoutId === 'stacked') {
    // 地名在上、日期在下，两行都贴同一边。地名行被顶出水印区就丢掉它 ——
    // 宁可少印一行，也不要让地名压到照片或相框边框上。
    const placeBottom = bottom + dateFont * STACKED_LEADING;
    const placeTop = placeBottom + slotFont;
    if (hasSlot && vertical.top + placeTop <= vertical.bottom) {
      const letterSpacing = spacingOf(slotFont);
      lines.push(
        placeLine({
          kind: slotKind,
          text: slotText,
          fontSize: slotFont,
          bottom: placeBottom,
          align:
            side === 'left'
              ? { left: Math.round((region.left - letterSpacing) * 100) / 100 }
              : { right: flushRightOffset(letterSpacing) },
        }),
      );
    }
    if (hasDate) {
      lines.push(
        dateLine(
          side === 'left'
            ? { align: { left: region.left, maxWidth: quartz.width } }
            : { align: { right: regionRight, maxWidth: quartz.width } },
        ),
      );
    }
  } else {
    // split：地名贴左、日期贴右，共用同一条基线。
    // ⚠️ 两行**不再是各分一半宽度**：日期那一行的宽度是 `segmentDateWidth` 算出来的确定值，
    // 剩下的宽度全部留给地名（可压缩的那一行），所以窄幅相框也不会再挤掉日期。
    const slotMaxWidth = hasDate ? Math.max(24, region.width - quartz.width - SPLIT_GUTTER) : region.width;
    if (hasSlot) {
      const spacing = spacingOf(slotFont);
      lines.push(
        placeLine({
          kind: slotKind,
          text: slotText,
          fontSize: slotFont,
          align: {
            // 复用 placeLine 默认的左偏移，只补一个宽度上限。
            left: Math.round((region.left - spacing) * 100) / 100,
            maxWidth: slotMaxWidth,
          },
        }),
      );
    }
    if (hasDate) {
      lines.push(dateLine({ align: { right: regionRight, maxWidth: quartz.width } }));
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
