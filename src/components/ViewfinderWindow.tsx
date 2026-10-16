/**
 * 液态玻璃镂空取景窗 —— 取景器里"看得见的那一块"。
 *
 * ## 这一版和上一版的根本区别
 *
 * 上一版（`AspectGuide.tsx`）只在整屏相机预览上画一条 1px 白线，**线以外的画面照样可见**。
 * 后果是用户按"整屏所见"构图，成片却只保留窗口里那一块 —— 也就是用户报的
 * "取景器与成片画幅不符、边缘被误裁"。线画得再准也治不了这个：**能看见 ≠ 会被拍到**。
 *
 * 这一版把线**以外**的全部盖成液态玻璃，窗口内 100% 透明。用户视野里只剩
 * "会被拍进成片的那一块"，取景与出片在几何上就不可能不一致。
 *
 * ## 为什么用四块玻璃而不是一张挖洞的遮罩
 *
 * 见 `LiquidGlassView.tsx` 文件头：挖洞需要 `MaskedView`（一个原生依赖），
 * 而窗口本来就是矩形，四块矩形围出来的洞和挖出来的洞是同一个洞。
 * 四块的边分别贴住取景器四边，窗口的矩形就是它们的内边界。
 *
 * ## 为什么四周是**哑光**而不是玻璃（v1.5.1 的性能修正）
 *
 * 上一版这四块走的是 `LiquidGlassView`（真正的高斯模糊），于是同屏出现四块
 * 贴着屏幕四边、总面积约占整屏 60% 的 `UIVisualEffectView`，而它们背后是
 * **正在出帧的相机预览层**：每一帧都要把 AVCaptureVideoPreviewLayer 重新模糊一遍。
 * 真机实测表现为整屏僵硬掉帧。
 *
 * 修法是把"模糊"和"玻璃"这两件事分开：
 *   - **遮罩要的是"看不见"**，不是"看得见但虚化"。一块 84% 不透明的哑光面
 *     足以完成这件事，而且它一帧只画一次，与背后有没有相机无关。
 *   - **玻璃要的是"厚度"**，那是顶栏、控制台、胶囊、抽屉的事 —— 它们面积小得多，
 *     而且用的是同一个 `LiquidGlassView`，材质的定义仍然只有一处。
 *
 * 代价是遮罩失去了"透出背后画面"的质感。这恰恰是这一层**本来就不该有**的性质：
 * 能看见的每一寸画面都在暗示"这也会被拍进去"。
 *
 * ## 为什么哑光底是深色、而且不跟随机身深浅色
 *
 * 和 `StripView` 的暗房面同一条规矩：这一层的职责是**让窗口以外退到后面去**。
 * 浅色机身上换成浅色遮罩的话，取景框四周会变成一圈比画面还亮的白边，
 * 构图时眼睛先看到边框而不是画面。深色在两种机身下都只做一件事：消失。
 *
 * ## 画幅切换的弹性缩放
 *
 * 换相纸（1:1 → 3:4 → 3:2）时窗口要跟着变。这里用 RN 自带的 `Animated.spring`
 * 补间四个布局量（left/top/width/height），**不是** `react-native-reanimated` ——
 * 这个项目没有装它，而为了一个 150ms 的补间引入一个原生重依赖（还要改 babel 配置）
 * 不划算。代价是布局量只能用 `useNativeDriver: false`（原生驱动不支持布局属性），
 * 这一屏本来也没有跑满帧的压力。
 *
 * 补间的起点是**动画中途的当前值**而不是上一个目标值：连续快速切三档时，
 * 从当前位置接着弹才不会跳。
 *
 * ⚠️ 四块遮罩也必须用**同一组动画值**（`Animated.add` 拼出右下两条边）：
 * 只让窗口框线弹、遮罩硬跳的话，切换画幅的那 150ms 里白线和遮罩边是错开的，
 * 看起来像框线在遮罩上滑动。上一版就是这样。
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Rect } from '../types';

/**
 * 四周哑光遮罩的底色。**刻意不跟随机身深浅色**（理由见文件头）。
 *
 * 0.84 是"彻底看不见背后"与"还能感到背后有个发亮的画面"之间的取值：
 * 再低会透出预览的轮廓，用户又会开始按轮廓构图；再高就成了一块死黑，
 * 取景框看起来像贴在黑洞上，失去"这台机器在取景"的感觉。
 */
const MATTE_COLOR = 'rgba(10, 10, 14, 0.84)';

/** 窗口框线：高反差亮白，用来在明亮画面上也钉住边界。 */
const WINDOW_BORDER = 1;
const WINDOW_BORDER_COLOR = 'rgba(255, 255, 255, 0.75)';

/** 四角 L 型角标：比框线粗，专门对抗"画面本身有亮边"时的边界糊掉。 */
const CORNER_ARM = 16;
const CORNER_THICK = 2;
const CORNER_COLOR = 'rgba(255, 255, 255, 0.92)';

/** 九宫格线。刻意比框线淡一档：它是辅助构图的，不该和画幅边界抢注意力。 */
const GRID_COLOR = 'rgba(255, 255, 255, 0.28)';
const GRID_THICK = 1;

/**
 * 中央十字。构图时"画面正中心在哪"要有个东西钉住，否则手持取景全凭感觉。
 *
 * 颜色比九宫格再亮一档：它只有一个点，淡到 0.28 会在明亮画面上直接消失。
 * 臂长是**固定点值**而不是百分比 —— 窗口在手机上永远在 150~350pt 之间，
 * 按比例算出来的值区间只有几 pt，不值得为它引入百分比定位的不确定性。
 */
const CENTRE_ARM = 16;
const CENTRE_COLOR = 'rgba(255, 255, 255, 0.5)';

/** 补间参数。150ms 上下——比换档的推拉（28/7）稍慢一点，让"画幅变大"看得出来。 */
const RESIZE_SPEED = 22;
const RESIZE_BOUNCINESS = 5;

export interface ViewfinderWindowProps {
  /** 画幅窗口在取景器坐标系里的绝对位置。 */
  window: Rect;
  /** 关掉九宫格。占满整屏的构图辅助线在窄画幅下会把画面切得很碎。 */
  grid?: boolean;
}

/**
 * 把一个会跳变的矩形补间成动画值。
 *
 * 四个布局量各用一个 `Animated.Value`，`spring` 的目标是**本次**的矩形，
 * 起点用 `setValue` 钉到上一次的中间值。
 */
function useSpringRect(target: Rect) {
  const left = useRef(new Animated.Value(target.left)).current;
  const top = useRef(new Animated.Value(target.top)).current;
  const width = useRef(new Animated.Value(target.width)).current;
  const height = useRef(new Animated.Value(target.height)).current;
  const applied = useRef<Rect>(target);

  const { left: tl, top: tt, width: tw, height: th } = target;

  useEffect(() => {
    const from = applied.current;
    if (from.left === tl && from.top === tt && from.width === tw && from.height === th) {
      return;
    }
    applied.current = { left: tl, top: tt, width: tw, height: th };

    const track = (value: Animated.Value, next: number) =>
      Animated.spring(value, {
        toValue: next,
        speed: RESIZE_SPEED,
        bounciness: RESIZE_BOUNCINESS,
        // 布局属性（left/top/width/height）过不了原生驱动，只能走 JS 线程。
        useNativeDriver: false,
      });

    Animated.parallel([track(left, tl), track(top, tt), track(width, tw), track(height, th)]).start();
  }, [tl, tt, tw, th, left, top, width, height]);

  return { left, top, width, height };
}

export function ViewfinderWindow({ window: box, grid = true }: ViewfinderWindowProps) {
  const animated = useSpringRect(box);

  /*
   * 四条内边界。右下两块遮罩要从窗口的右沿/下沿开始铺，而那两条边的位置是
   * `left + width` 与 `top + height` —— `Animated.Value` 不能直接相加，
   * 必须用 `Animated.add` 组合成一个新的动画值，否则弹簧动画期间遮罩会跟窗口错开。
   */
  const edgeRight = Animated.add(animated.left, animated.width);
  const edgeBottom = Animated.add(animated.top, animated.height);

  return (
    // 整层不吃手势：对焦、捏合、快门的触控都要能穿过去。
    <View style={styles.root} pointerEvents="none">
      {/*
        四块哑光遮罩。**这里刻意不用 `LiquidGlassView`** —— 理由是性能，
        详见文件头"为什么四周是哑光而不是玻璃"。它们的边分别贴着取景器四边，
        窗口矩形就是它们的内边界；四条内边界全部走同一组弹簧动画值。
      */}
      <Animated.View style={[styles.mat, { left: 0, right: 0, top: 0, height: animated.top }]} />
      <Animated.View style={[styles.mat, { left: 0, right: 0, top: edgeBottom, bottom: 0 }]} />
      <Animated.View
        style={[styles.mat, { left: 0, top: animated.top, width: animated.left, height: animated.height }]}
      />
      <Animated.View
        style={[styles.mat, { left: edgeRight, top: animated.top, right: 0, height: animated.height }]}
      />

      {/* 窗口本体：只有框线与辅助线，中间完全不透明地"空着" */}
      <Animated.View
        style={[styles.window, { left: animated.left, top: animated.top, width: animated.width, height: animated.height }]}
      >
        {grid ? (
          <>
            <View style={[styles.gridV, { left: '33.333%' }]} />
            <View style={[styles.gridV, { left: '66.666%' }]} />
            <View style={[styles.gridH, { top: '33.333%' }]} />
            <View style={[styles.gridH, { top: '66.666%' }]} />
          </>
        ) : null}

        {/* 四角 L 型角标：两条短边拼出来，比画一个带边框的方块少两次绘制 */}
        <View style={[styles.corner, { left: 0, top: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK }]} />
        <View style={[styles.corner, { right: 0, top: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK }]} />
        <View style={[styles.corner, { left: 0, bottom: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK }]} />
        <View style={[styles.corner, { right: 0, bottom: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK }]} />

        {/*
          中央十字。**必须画在这一层里面**：它的位置就是窗口中心，窗口一弹它就得跟着弹。
          上一版它在 `CameraScreen` 的 `FocusBrackets` 里单独定位，切画幅时窗口在弹、
          十字硬跳，看起来像两个互不相关的东西在动。
        */}
        <View style={[styles.centreBar, styles.centreH]} />
        <View style={[styles.centreBar, styles.centreV]} />
      </Animated.View>

      {/*
        这里曾有一行写死的 `35mm` 丝印（旧版规格：这台机器的视场恒按 35mm 参照标定）。

        v1.8.0 起真实焦段在 13/26/35/52mm 之间可切，而这行字永远说 `35mm` ——
        它就是用户报告的『旧版残留的鬼影/残字』：与其留一个会说谎的刻印，不如删掉。
        当前焦段读数在底部胶囊上（可切的那一处），那里才是它该在的地方。
      */}
    </View>
  );
}

// 只放几何：颜色全是固定的半透明白（它必须能在任何画面上"淡淡地存在"，
// 跟着机身深浅色走反而会在浅色机身上消失），所以没有一处需要现取主题。
const styles = StyleSheet.create({
  // RN 0.86 移除了 `StyleSheet.absoluteFillObject`，展开不了，只能手写（同 LiquidGlassView）
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  /** 四周的哑光遮罩。位置与尺寸全部由 JSX 现算（要走弹簧动画）。 */
  mat: {
    position: 'absolute',
    backgroundColor: MATTE_COLOR,
  },
  window: {
    position: 'absolute',
    borderWidth: WINDOW_BORDER,
    borderColor: WINDOW_BORDER_COLOR,
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: GRID_THICK,
    backgroundColor: GRID_COLOR,
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: GRID_THICK,
    backgroundColor: GRID_COLOR,
  },
  corner: {
    position: 'absolute',
    width: CORNER_ARM,
    height: CORNER_ARM,
    borderColor: CORNER_COLOR,
  },
  /*
   * 中央十字的两根臂。用"`left/top: 50%` + 负 margin"而不是 `alignItems/justifyContent`
   * 居中：窗口的宽高是**动画值**，绝对定位百分比在 Yoga 里解析得最直接，
   * 不依赖"绝对定位子节点是否继承父级对齐属性"这种容易记错的行为。
   */
  centreBar: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    backgroundColor: CENTRE_COLOR,
  },
  centreH: {
    width: CENTRE_ARM,
    height: GRID_THICK,
    marginLeft: -CENTRE_ARM / 2,
    marginTop: -GRID_THICK / 2,
  },
  centreV: {
    width: GRID_THICK,
    height: CENTRE_ARM,
    marginLeft: -GRID_THICK / 2,
    marginTop: -CENTRE_ARM / 2,
  },
});
