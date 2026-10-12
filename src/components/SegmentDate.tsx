/**
 * 石英后背 7 段数码管（Quartz Date）—— 纯 RN `View` 手绘，不引字体、不引 SVG、不用 `Text`。
 *
 * ── 为什么自己画七段，而不是加载一个 DSEG7 之类的数码管字体 ──────────────────
 * 1. **版权与体积**：DSEG7 这类字体大多是 OFL / CC 授权，商用要逐份核对授权文本；
 *    而且为了 10 个字形要塞进一份几十 KB 的 ttf，还得走 `expo-font` 在冷启动时异步加载，
 *    加载失败就退化成系统字体 —— 那正是"严禁使用系统默认无衬线黑体"要避免的结果。
 * 2. **只有 10 个字形**：0-9 的段码就是一张十行的表（下面 `SEGMENT_MASK`），
 *    画出来是十几行的事，比"加一个依赖 + 一份字体 + 一条加载失败分支"便宜得多。
 * 3. **任何缩放下都不会糊**：段是矢量矩形 / 梯形。成片由 `react-native-view-shot` 按
 *    PixelRatio 重绘（见 `src/utils/captureOptions.ts`），放大到 2048 长边也是原生分辨率
 *    重画，不像位图字体那样在大尺寸成片里露像素边。
 *
 * ── 形状：斜切梯形（不是直角矩形，也不是圆角）────────────────────────────────
 * 每段用"一条不透明边框 + 两条透明边框"凑成梯形（`borderLeft/RightWidth` 是斜切量）：
 *   · 横段（a / g / d）用 `borderBottomWidth` / `borderTopWidth` 当段厚，左右透明边框当斜切；
 *   · 竖段（f / b / e / c）用 `borderLeftWidth` / `borderRightWidth` 当段厚，上下透明边框当斜切。
 * 直角矩形看起来像方格纸（规格点名不要）；圆角在 8~11pt 这个尺寸下会糊成一团棉花；
 * 斜切既像真管子，又是"没有 SVG 也能画出来"的唯一带角度形状。
 * 每段**朝向字心**的那条边更长（外角被切掉），所以整个数字的外轮廓是"切角矩形"，
 * 段与段之间留的是斜缝 —— 这正是石英后背的观感。
 * 灭段**不画**（石英后背的灭段是看不见的，不是暗红残影）。
 *
 * ── 两个必须守住的约束 ────────────────────────────────────────────────────────
 * 1. `memo` 包装：`FilmCompositor` 每次重排都会重建这棵子树，日期串没变就不该重画。
 * 2. **不能用 `Animated`**：成片是 `react-native-view-shot` 抓的**静态帧**，
 *    动画可能停在中间状态（管子半亮），而且 `Animated` 的初值要等一帧才落到原生层，
 *    抓早一拍就是一片空白。所以这里只有普通 `View`。
 *
 * ── 契约（和 `FilmCompositor.tsx` 各写一份）──────────────────────────────────
 * 命中 `WatermarkLine.quartz` 的行**必须**交给这个组件画，不能退回 `<Text>`：
 * 那正是"时间被截断成 `26 10...`"的老 bug 的根 —— 文字行会被 `flexShrink` 压，
 * 而这里的根容器宽度 = `segmentDateWidth()` 算出来的**确定值**（还显式 `flexShrink: 0`），
 * 压不动。宽度算法住在 `src/utils/geometry.ts`（纯函数、能在 Node 里跑单测），
 * 这里**再导出**一次，调用方从组件模块拿也一样，两边共用同一组比例常量，不会漂移。
 */
import { memo } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { QUARTZ_SEGMENT_GAP, quartzCellLayout, segmentDateWidth } from '../utils/geometry';
import type { QuartzCell, QuartzCellLayout } from '../utils/geometry';

export { segmentDateWidth };
export type { QuartzCell, QuartzCellLayout };

export interface SegmentDateProps {
  /** 已经格式化好的字符串，例如 `"'26  10  12"`。非数字字符（引号、空格、点）按窄格渲染。 */
  text: string;
  /** 一位数字的高度（pt）。宽度由 7 段的经典比例推出来（≈ `height * 0.55`）。 */
  height: number;
  /** 亮段颜色。 */
  color: string;
  /** 段与段之间的缝宽（pt），默认 0.5。 */
  gap?: number;
  /**
   * 管子外那一圈阴影的颜色。
   *
   * 压在照片上是**琥珀辉光**（`rgba(255, 144, 0, 0.45)`，见 `FilmCompositor` 的
   * `QUARTZ_GLOW_COLOR`）；印在相纸留白上是**极淡的暗边** —— 白纸上亮橙会"发飘"，
   * 不描一圈边就看不出管子在哪。不传 = 不画阴影。
   */
  shadowColor?: string;
  /** 阴影半径（pt）。不传 / ≤ 0 = 不画。 */
  shadowRadius?: number;
}

/** 段厚 ÷ 管高。0.14 是拿真实石英表比出来的：再粗就糊成一块，再细就断成虚线。 */
const STROKE_RATIO = 0.14;
/** 斜切量 ÷ 段厚。0.35 ≈ 19° 的斜角：看得出是斜的，又不会让短段收成一个尖。 */
const CHAMFER_RATIO = 0.35;
/** 窄格里"点"的边长 ÷ 管高（规格给的 0.18）。 */
const MARK_DOT_RATIO = 0.18;
/** 竖段最短长度：低于这个值就不画（极端小字号下会退化成看不见的碎屑）。 */
const MIN_VERTICAL_SEGMENT = 0.2;

/**
 * 七段段码：键是数字，值是亮了哪几段。
 *
 * a 上横 · b 右上竖 · c 右下竖 · d 下横 · e 左上竖 · f 左下竖 · g 中横。
 * 顺序就是下面 `digitViews` 里的绘制顺序（先横后竖），不是电气顺序。
 */
const SEGMENT_MASK: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

interface BarProps {
  left: number;
  top: number;
  /** 横段是长度，竖段是盒宽（= 段厚）。 */
  width: number;
  /** 竖段是长度。 */
  height: number;
  thickness: number;
  chamfer: number;
  color: string;
  /** 长边朝哪一侧：横段 `top` / `bottom`，竖段 `left` / `right`。 */
  long: 'top' | 'bottom' | 'left' | 'right';
  shadow: ViewStyle | null;
}

/**
 * 一段管子。
 *
 * 关键在读法：RN 的尺寸是 **border-box**（`width` / `height` 含边框），
 * 所以"段厚"写成对应那条边的 `borderWidth` 之后，内容盒正好退化成 0 ——
 * 于是那条不透明的边就是一个**梯形**：外侧边 = 盒子边（长边），内侧边 = 内容盒边（短边，
 * 两端各被 `chamfer` 切掉一块），左右 / 上下两条透明边就是斜切本身。
 */
function bar({ left, top, width, height, thickness, chamfer, color, long, shadow }: BarProps): ViewStyle {
  const edge: ViewStyle =
    long === 'bottom'
      ? { borderBottomWidth: thickness, borderBottomColor: color }
      : long === 'top'
        ? { borderTopWidth: thickness, borderTopColor: color }
        : long === 'right'
          ? { borderRightWidth: thickness, borderRightColor: color }
          : { borderLeftWidth: thickness, borderLeftColor: color };
  const slant: ViewStyle =
    long === 'top' || long === 'bottom'
      ? { borderLeftWidth: chamfer, borderRightWidth: chamfer, borderLeftColor: 'transparent', borderRightColor: 'transparent' }
      : { borderTopWidth: chamfer, borderBottomWidth: chamfer, borderTopColor: 'transparent', borderBottomColor: 'transparent' };

  return { position: 'absolute', left, top, width, height, ...slant, ...edge, ...shadow };
}

/** 一个数字格的七段。灭段直接不生成节点。 */
function digitViews(
  cell: QuartzCell,
  index: number,
  height: number,
  color: string,
  seam: number,
  shadow: ViewStyle | null,
  mask: string,
): ReactElement[] {
  const width = cell.width;
  const t = height * STROKE_RATIO;
  const chamfer = t * CHAMFER_RATIO;
  const mid = height / 2;
  // 竖段的"长边"（朝向字心那条）长度：上边让开一个段厚 + 一条缝，下边让开中横段的一半 + 一条缝。
  const stem = mid - t * 1.5 - seam * 2;
  const views: ReactElement[] = [];
  const add = (key: string, style: ViewStyle): void => {
    views.push(<View key={`${index}${key}`} style={style} />);
  };

  if (mask.includes('a')) {
    // 上横段：长边在下（朝字心），外角被切掉
    add('a', bar({ left: 0, top: 0, width, height: t, thickness: t, chamfer, color, long: 'bottom', shadow }));
  }
  if (mask.includes('d')) {
    add('d', bar({ left: 0, top: height - t, width, height: t, thickness: t, chamfer, color, long: 'top', shadow }));
  }
  if (mask.includes('g')) {
    // 中横段画成上下两条梯形拼的对称六边形：单条梯形会一边斜一边平，一眼假
    add('g1', bar({ left: 0, top: mid - t / 2, width, height: t / 2, thickness: t / 2, chamfer, color, long: 'bottom', shadow }));
    add('g2', bar({ left: 0, top: mid, width, height: t / 2, thickness: t / 2, chamfer, color, long: 'top', shadow }));
  }
  if (stem > MIN_VERTICAL_SEGMENT) {
    const upperTop = t + seam;
    const lowerTop = mid + t / 2 + seam;
    // 左侧两根的长边在右（朝字心），右侧两根的长边在左
    if (mask.includes('f')) {
      add('f', bar({ left: 0, top: upperTop, width: t, height: stem, thickness: t, chamfer, color, long: 'right', shadow }));
    }
    if (mask.includes('b')) {
      add('b', bar({ left: 0, top: lowerTop, width: t, height: stem, thickness: t, chamfer, color, long: 'right', shadow }));
    }
    if (mask.includes('e')) {
      add('e', bar({ left: width - t, top: upperTop, width: t, height: stem, thickness: t, chamfer, color, long: 'left', shadow }));
    }
    if (mask.includes('c')) {
      add('c', bar({ left: width - t, top: lowerTop, width: t, height: stem, thickness: t, chamfer, color, long: 'left', shadow }));
    }
  }
  return views;
}

/**
 * 窄格（引号 / 空格 / 小数点 / 冒号 / 连字符）里的墨。
 *
 * 规格把这几个字符一起写成"用 `height * 0.18` 的小方点表示，宽 `height * 0.2`"，
 * 唯一一处**刻意的偏离**是**空格不落墨**：石英日期里的两个空格是"年月日分组"的空档
 * （`'26  10  12`），画成点会变成 `'26..10..12`，那不是石英后背，是乱码。
 * 要让空格也落点，只需把下面 `case ' '` 改成 `default` 那一支。
 */
function markViews(cell: QuartzCell, index: number, height: number, color: string, shadow: ViewStyle | null): ReactElement[] {
  const dot = height * MARK_DOT_RATIO;
  const left = (cell.width - dot) / 2;
  // 点与上下横段的中心齐平：引号（石英后背的"年"标记）看着才是"贴在数字上"的
  const nearTop = height * STROKE_RATIO * 0.5;
  const nearBottom = height - dot - nearTop;
  const base: ViewStyle = { position: 'absolute', width: dot, height: dot, backgroundColor: color, ...shadow };

  switch (cell.char) {
    case "'":
      // 年标记：顶部一点
      return [<View key={`${index}q`} style={[base, { left, top: nearTop }]} />];
    case '.':
      return [<View key={`${index}p`} style={[base, { left, top: nearBottom }]} />];
    case ':':
      return [
        <View key={`${index}c1`} style={[base, { left, top: nearTop }]} />,
        <View key={`${index}c2`} style={[base, { left, top: nearBottom }]} />,
      ];
    case '-':
    case '_':
      // 窄条而不是点：连字符在液晶上是横杠，画成点会被读成小数点
      return [
        <View
          key={`${index}h`}
          style={[base, { left: 0, top: height / 2 - dot / 2, width: cell.width, height: Math.max(0.5, height * 0.09) }]}
        />,
      ];
    case ' ':
      return [];
    default:
      // 其它没预料的符号：正中一点，好歹让人看出这里有个分隔符
      return [<View key={`${index}m`} style={[base, { left, top: (height - dot) / 2 }]} />];
  }
}

/**
 * 一段石英日期。
 *
 * 根容器的宽度**只能**来自 `segmentDateWidth()`（也就是 `quartzCellLayout` 的宽度），
 * 并且显式 `flexShrink: 0` —— 上面那条"压不动"的契约就落在这一行上。
 */
function SegmentDateImpl({
  text,
  height,
  color,
  gap = QUARTZ_SEGMENT_GAP,
  shadowColor,
  shadowRadius,
}: SegmentDateProps): ReactElement {
  // 缝不会宽过段本身：外面万一传了离谱的 gap，段也不会被缝吃光。
  const seam = Math.min(gap, height * STROKE_RATIO * 0.75);
  const layout = quartzCellLayout(text, height, gap);
  const shadow: ViewStyle | null =
    shadowColor !== undefined && shadowRadius !== undefined && shadowRadius > 0
      ? // shadowOffset 为 0 = 四周均匀发光；shadowOpacity 交给颜色自带的 alpha（0.45 / 0.28）
        { shadowColor, shadowOpacity: 1, shadowRadius, shadowOffset: { width: 0, height: 0 } }
      : null;

  return (
    <View pointerEvents="none" style={[styles.root, { width: layout.width, height: layout.height }]}>
      {layout.cells.map((cell, index) => (
        <View key={String(index)} style={[styles.cell, { left: cell.left, width: cell.width, height: layout.height }]}>
          {SEGMENT_MASK[cell.char] === undefined
            ? markViews(cell, index, height, color, shadow)
            : digitViews(cell, index, height, color, seam, shadow, SEGMENT_MASK[cell.char])}
        </View>
      ))}
    </View>
  );
}

/**
 * 石英后背日期（`'26  10  12`）。
 *
 * 类型上是 `memo` 组件而不是普通函数：调用方写 `<SegmentDate ... />`；
 * 规格里"`SegmentDate(props): React.ReactElement`"指的就是它的渲染结果。
 * 每个格子的位置由 `quartzCellLayout` 算好（纯函数，见 `src/utils/geometry.ts`），
 * 这里只负责"把数字画成管子"，不参与任何排版决策。
 */
export const SegmentDate = memo(SegmentDateImpl);

const styles = StyleSheet.create({
  /** 根容器只是坐标系：宽度由 `segmentDateWidth()` 定死，压不动。 */
  root: { position: 'relative', flexShrink: 0 },
  cell: { position: 'absolute', top: 0 },
});
