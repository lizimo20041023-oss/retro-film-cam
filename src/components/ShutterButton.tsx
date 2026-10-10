/**
 * 快门按钮：外白环 + 内实心圆，按下有轻微缩放（Animated，原生驱动）。
 *
 * 防连点分两层：
 * 1. 这里：`disabled` / `busy` 直接禁用 Pressable；
 * 2. 上层：CameraScreen 里还有一个 `shotLockRef` 同步锁（异步流程不会被 disabled 立刻挡住）。
 */
import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

export interface ShutterButtonProps {
  onPress: () => void;
  /** 相机没就绪 / 没有权限时禁用。 */
  disabled?: boolean;
  /** 正在显影：显示菊花并禁用。 */
  busy?: boolean;
  /** 外径（pt）。 */
  size?: number;
}

export function ShutterButton({ onPress, disabled = false, busy = false, size = 78 }: ShutterButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || busy;

  const animateTo = (toValue: number): void => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? '正在显影' : '拍照'}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      hitSlop={12}
      onPressIn={() => animateTo(0.9)}
      onPressOut={() => animateTo(1)}
      onPress={onPress}
      style={styles.touch}
    >
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: inactive ? 0.4 : 1,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={styles.inner}>{busy ? <ActivityIndicator color="#111111" /> : null}</View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 3,
    borderColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    margin: 5,
    borderRadius: 999,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
