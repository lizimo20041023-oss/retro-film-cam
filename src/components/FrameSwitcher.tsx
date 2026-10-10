/**
 * 相框切换手势层：左右滑动换相框 + 震感 + 过渡动画。
 *
 * 性能要点（这是本文件存在的全部理由）：
 * - 拖拽过程**只调用 `Animated.Value#setValue`，不 setState**，
 *   所以手指移动多少帧都不会触发 React 重渲染（满足"不在 onUpdate 里造成重渲染风暴"）；
 * - 提交切换时才调用一次 `onChange(next)`，App 只重渲染一次；
 * - `PanResponder` 用 `useRef` 建一次，最新 props 放 ref 里读，避免每次渲染重建手势。
 *
 * 为什么用核心 `Animated` + `PanResponder` 而不是 reanimated/gesture-handler：
 * 核心 API 零配置（不需要额外 babel 插件），且上面这两个原生库在 Expo Go 里虽然内置，
 * 但 reanimated v4 需要 `react-native-worklets/plugin`，为"一个滑动换帧"引入它不划算。
 * 注意 `useNativeDriver: false`：同一个 Animated.Value 既被 `setValue`（JS 侧拖动）
 * 又被动画驱动，混用原生驱动会抛 "Attempted to run JS driven animation on animated node
 * that has been moved to native"。
 */
import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, PanResponder, StyleSheet } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface FrameSwitcherProps {
  /** 当前相框下标（受控）。 */
  index: number;
  /** 相框总数（< 2 时手势自动失效）。 */
  count: number;
  /** 提交切换：回调里给的是**已经取模**的新下标。 */
  onChange: (nextIndex: number) => void;
  /** false = 不响应手势（正在显影 / 没权限时传 false）。 */
  enabled?: boolean;
  /** 触发切换需要的最小水平位移，按宽度比例算（默认 0.18）。 */
  thresholdRatio?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FrameSwitcher({
  index,
  count,
  onChange,
  enabled = true,
  thresholdRatio = 0.18,
  children,
  style,
}: FrameSwitcherProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);
  /** 本次手势是否已经震动过（防止一次拖动震十几次）。 */
  const armedRef = useRef(false);
  /** 过渡动画进行中，忽略新手势。 */
  const animatingRef = useRef(false);

  // 最新 props 快照：PanResponder 只创建一次，靠它读到当前值
  const latestRef = useRef({ index, count, enabled, onChange, thresholdRatio });
  latestRef.current = { index, count, enabled, onChange, thresholdRatio };

  /** 提交换帧：滑出 → 换数据 → 从另一侧滑入。 */
  const commit = useCallback(
    (direction: -1 | 1): void => {
      if (animatingRef.current) {
        return;
      }
      animatingRef.current = true;

      // direction = 1（看下一张）：当前这张往左滑出，新的从右边进来
      const exitTo = direction > 0 ? -widthRef.current : widthRef.current;

      Animated.timing(translateX, {
        toValue: exitTo,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          translateX.setValue(0);
          animatingRef.current = false;
          return;
        }

        const current = latestRef.current;
        const total = current.count;
        if (total < 1) {
          translateX.setValue(0);
          animatingRef.current = false;
          return;
        }
        const next = (((current.index + direction) % total) + total) % total;
        // 只有这一行会引起父层重渲染（一次滑动一次）
        current.onChange(next);

        // 从滑出的反方向入场，形成"连环"感
        translateX.setValue(-exitTo);
        Animated.spring(translateX, {
          toValue: 0,
          speed: 14,
          bounciness: 6,
          useNativeDriver: false,
        }).start(() => {
          animatingRef.current = false;
        });
      });
    },
    [translateX],
  );

  const responderRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => {
        const current = latestRef.current;
        if (!current.enabled || animatingRef.current || current.count < 2) {
          return false;
        }
        const horizontal = Math.abs(gesture.dx);
        const vertical = Math.abs(gesture.dy);
        // 明显偏水平才接管，避免和纵向手势打架
        return horizontal > 14 && horizontal > vertical * 1.4;
      },
      onPanResponderGrant: () => {
        armedRef.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        // 关键：只有 setValue，没有 setState
        translateX.setValue(gesture.dx);

        const current = latestRef.current;
        const limit = widthRef.current * current.thresholdRatio;
        if (!armedRef.current && limit > 0 && Math.abs(gesture.dx) > limit) {
          armedRef.current = true;
          // 越过"松手就会换"的阈值时震一下，给用户确定性
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        const limit = widthRef.current * latestRef.current.thresholdRatio;
        if (limit > 0 && Math.abs(gesture.dx) > limit) {
          commit(gesture.dx < 0 ? 1 : -1);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            speed: 18,
            bounciness: 5,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          speed: 18,
          bounciness: 5,
          useNativeDriver: false,
        }).start();
      },
      // 已经接管的手势不交出去，保证拖动顺滑
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent): void => {
    widthRef.current = event.nativeEvent.layout.width;
  };

  // 拖得越远越淡，暗示"松手就换"
  const opacity = translateX.interpolate({
    inputRange: [-240, 0, 240],
    outputRange: [0.45, 1, 0.45],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      {...responderRef.panHandlers}
      onLayout={handleLayout}
      pointerEvents={enabled ? 'auto' : 'none'}
      accessibilityRole="adjustable"
      accessibilityLabel="相框切换"
      accessibilityHint="左右滑动切换相框"
      accessibilityValue={{ text: `${index + 1} / ${count}` }}
      accessibilityActions={[
        { name: 'increment', label: '下一个相框' },
        { name: 'decrement', label: '上一个相框' },
      ]}
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName;
        if (action === 'increment') {
          commit(1);
        } else if (action === 'decrement') {
          commit(-1);
        }
      }}
      style={[styles.layer, style, { opacity, transform: [{ translateX }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
