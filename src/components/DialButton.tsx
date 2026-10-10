/**
 * 机械拨轮按钮：一张"金属滚花盘"底图 + 一枚极细线性图标，直径默认 44pt。
 *
 * 设计意图（替代原先的圆角高亮胶囊）：
 *   · 不用任何高亮填充色 —— 点亮态靠**拨轮自身的琥珀色内发光**表达，
 *     所以整个界面里只有"正在生效的开关"会亮，其他一律是暗色金属；
 *   · 按下时只有整盘轻微变暗 + 缩小，不做涟漪/阴影动画，
 *     保持"机械"而不是"Material"的手感。
 *
 * 无障碍：`accessibilityState.selected` 反映点亮态，读屏会念成"已选中/未选中"。
 */
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { UI_ASSETS } from '../constants/uiAssets';

export interface DialButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** 盘面上的线性图标（本来就已经是点亮/未点亮两套图，这里传对应的那张）。 */
  icon: ImageSourcePropType;
  /** true = 琥珀色点亮态（用 dial-on.png 底图）。 */
  active?: boolean;
  disabled?: boolean;
  /** 直径（pt）。 */
  size?: number;
}

export function DialButton({
  onPress,
  accessibilityLabel,
  icon,
  active = false,
  disabled = false,
  size = 44,
}: DialButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.touch,
        { width: size, height: size },
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Image
        source={active ? UI_ASSETS.dialOn : UI_ASSETS.dial}
        style={[styles.plate, { width: size, height: size }]}
        resizeMode="contain"
        fadeDuration={0}
      />
      <View style={styles.iconLayer} pointerEvents="none">
        <Image
          source={icon}
          style={{ width: size * 0.48, height: size * 0.48 }}
          resizeMode="contain"
          fadeDuration={0}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    position: 'absolute',
  },
  iconLayer: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.32,
  },
  pressed: {
    opacity: 0.62,
  },
});
