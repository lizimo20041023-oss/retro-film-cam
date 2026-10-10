/**
 * 手动对焦的四角框。
 *
 * 只在用户点了画面之后闪一下：快速张开（130ms）→ 停 820ms → 淡出（340ms）。
 * 为什么要淡出而不是一直留着 —— 原生那边 4 秒后会把镜头交回连续自动对焦
 * （见 `patches/expo-camera+57.0.6.patch` 里的 `manualFocusResetDelay`），
 * 一个永远亮着的框会让人以为"还锁着"，反而误导。
 *
 * 这个组件是**纯展示**：`pointerEvents="none"`，不参与任何手势，
 * 所以它跟"点画面对焦"那一层是分开的两个东西。
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { INK } from '../constants/theme';

/** 一次对焦请求。`at` 是时间戳 —— 同一个点连点两次也要重新闪一下，所以它是身份的一部分。 */
export type FocusTarget = { x: number; y: number; at: number } | null;

type FocusReticleProps = {
  target: FocusTarget;
  /** 取景器（= `CameraView`）的逻辑宽高。`target` 的 x/y 是它上面的 0~1 归一化坐标。 */
  width: number;
  height: number;
};

/** 方框边长（逻辑点）。参考 iOS 相机那种"小而不抢戏"的尺寸。 */
const SIZE = 76;
/** 每条角线的长度与粗细。 */
const CORNER = 16;
const THICK = 1.6;

export function FocusReticle({ target, width, height }: FocusReticleProps) {
  const progress = useRef(new Animated.Value(0)).current;
  // 0 表示"还没有过对焦请求"。用 `at` 而不是 `target` 当依赖：`target` 每次点击
  // 都是新对象，但只有 `at` 真的变了才需要重播动画。
  const stamp = target === null ? 0 : target.at;

  useEffect(() => {
    if (stamp === 0) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.delay(820),
      Animated.timing(progress, { toValue: 0, duration: 340, useNativeDriver: true }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [stamp, progress]);

  if (target === null) {
    return null;
  }

  // 贴着取景器边缘点的时候把框拽回来，不让它被裁掉一半。
  const left = Math.min(Math.max(target.x * width - SIZE / 2, 0), Math.max(width - SIZE, 0));
  const top = Math.min(Math.max(target.y * height - SIZE / 2, 0), Math.max(height - SIZE, 0));

  return (
    <View pointerEvents="none" style={[styles.root, { left, top }]}>
      <Animated.View
        style={[
          styles.box,
          {
            opacity: progress,
            transform: [
              {
                // 从略大缩到正常 —— "合焦"的手感就来自这个收拢动作
                scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.24, 1] }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
  },
  box: {
    width: SIZE,
    height: SIZE,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: INK.amber,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK },
  topRight: { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK },
});
