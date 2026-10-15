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
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Rect } from '../types';
import { UI_MONO } from '../constants/theme';
import { LiquidGlassView } from './LiquidGlassView';

/** 顶端标记离取景器上沿的距离：够近才像机身刻印，又不至于被刘海/状态栏压住。 */
const LABEL_TOP = 10;

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

/** 补间参数。150ms 上下——比换档的推拉（28/7）稍慢一点，让"画幅变大"看得出来。 */
const RESIZE_SPEED = 22;
const RESIZE_BOUNCINESS = 5;

export interface ViewfinderWindowProps {
  /** 画幅窗口在取景器坐标系里的绝对位置。 */
  window: Rect;
  /** 取景器容器的尺寸：四块玻璃要贴到它的四边。 */
  container: { width: number; height: number };
  /** 顶端居中的标记文字（规格里是固定的 `35mm`）。 */
  label: string;
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

export function ViewfinderWindow({ window: box, container, label, grid = true }: ViewfinderWindowProps) {
  const animated = useSpringRect(box);

  const right = Math.max(0, container.width - (box.left + box.width));
  const bottom = Math.max(0, container.height - (box.top + box.height));

  return (
    // 整层不吃手势：对焦、捏合、快门的触控都要能穿过去。
    <View style={styles.root} pointerEvents="none">
      {/*
        四块玻璃。每一块都关掉 `rim`：它们的边有一条是屏幕边缘，
        在那里画折射环会变成一条莫名其妙的亮线。
      */}
      <LiquidGlassView radius={0} rim={false} style={[styles.panel, { left: 0, right: 0, top: 0, height: box.top }]} />
      <LiquidGlassView
        radius={0}
        rim={false}
        style={[styles.panel, { left: 0, right: 0, top: box.top + box.height, bottom: 0 }]}
      />
      <LiquidGlassView
        radius={0}
        rim={false}
        style={[styles.panel, { left: 0, top: box.top, width: box.left, height: box.height }]}
      />
      <LiquidGlassView
        radius={0}
        rim={false}
        style={[styles.panel, { left: box.left + box.width, top: box.top, right: 0, height: box.height }]}
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
      </Animated.View>

      <View style={styles.labelRow}>
        <Text style={styles.label} allowFontScaling={false}>
          {label}
        </Text>
      </View>
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
  panel: {
    position: 'absolute',
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
  labelRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: LABEL_TOP,
    alignItems: 'center',
  },
  label: {
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 2.4,
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
});
