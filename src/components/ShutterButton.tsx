/**
 * 快门按钮：多层同心圆 + 径向渐变内盘，做成"物理按键"而不是扁平圆点。
 *
 * 结构（由外到内）：
 *   1. 外圈    —— hairline 细灰环，只是"圈住"这块区域，几乎不占视觉重量；
 *   2. 中圈    —— 2pt 亮环，按键的"金属包边"；
 *   3. 内盘    —— `shutter-disc.png`：左上偏移的径向渐变 + 底缘内阴影
 *                （高光和阴影烘进图片里，这样缩放时不会有渐变断层）。
 *
 * 防连点分两层：
 * 1. 这里：`disabled` / `busy` 直接禁用 Pressable；
 * 2. 上层：CameraScreen 里还有一个 `shotLockRef` 同步锁（异步流程不会被 disabled 立刻挡住）。
 */
import { useRef } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { UI_ASSETS } from '../constants/uiAssets';
import { useI18n } from '../i18n';

export interface ShutterButtonProps {
  onPress: () => void;
  /** 相机没就绪 / 没有权限时禁用。 */
  disabled?: boolean;
  /** 正在显影：显示菊花并禁用。 */
  busy?: boolean;
  /** 外径（pt）。 */
  size?: number;
}

const RING_GAP = 7; // 外圈与中圈的间距
const DISC_MARGIN = 6; // 中圈与内盘的间距

export function ShutterButton({ onPress, disabled = false, busy = false, size = 82 }: ShutterButtonProps) {
  const { t } = useI18n();
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

  const midSize = size - RING_GAP * 2;
  const discSize = midSize - DISC_MARGIN * 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? t('camera.shutter.busy') : t('camera.shutter.a11y')}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      hitSlop={12}
      onPressIn={() => animateTo(0.92)}
      onPressOut={() => animateTo(1)}
      onPress={onPress}
      style={styles.touch}
    >
      <Animated.View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: inactive ? 0.35 : 1,
            transform: [{ scale }],
          },
        ]}
      >
        <View
          style={[
            styles.midRing,
            { width: midSize, height: midSize, borderRadius: midSize / 2 },
          ]}
        >
          <Image
            source={UI_ASSETS.shutterDisc}
            style={{ width: discSize, height: discSize }}
            resizeMode="contain"
            fadeDuration={0}
          />
          {busy ? (
            <View style={styles.busyLayer} pointerEvents="none">
              <ActivityIndicator color="#3A342B" />
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(236, 232, 224, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  midRing: {
    borderWidth: 2,
    borderColor: 'rgba(244, 240, 232, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyLayer: {
    // 注意：RN 0.86 已移除 StyleSheet.absoluteFillObject，只能用 absoluteFill
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
