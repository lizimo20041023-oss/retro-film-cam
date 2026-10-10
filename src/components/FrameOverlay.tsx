/**
 * 相框覆盖层：把相框 PNG 按计算好的排版画出来。
 *
 * 两种用法：
 * 1. 取景器里的**实时预览**（不参与截图，只是让你看到构图边界）；
 * 2. `FilmCompositor` 里的**成片图层**（会被 captureRef 截进去）。
 *
 * 同一个组件 + 同一个 `computeFrameLayout`，所以预览和成片必然对齐。
 */
import { Image, StyleSheet } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import type { FrameLayout, FrameSpec } from '../types';

export interface FrameOverlayProps {
  frame: FrameSpec;
  layout: FrameLayout;
  /** 首次解码完成回调（合成视图用它做就绪判断；取景器预览不需要传）。 */
  onImageLoad?: () => void;
  /** 只能是 ImageStyle：外层传 ViewStyle 会因为 overflow 取值域更宽而类型不兼容。 */
  style?: StyleProp<ImageStyle>;
}

export function FrameOverlay({ frame, layout, onImageLoad, style }: FrameOverlayProps) {
  return (
    <Image
      source={frame.source}
      style={[styles.image, { width: layout.width, height: layout.height }, style]}
      // stretch：相框必须被精确拉伸到计算出的画幅，否则窗口位置会错位
      resizeMode="stretch"
      onLoad={onImageLoad}
      // 切相框时不要淡入淡出，否则截到的是半透明的相框
      fadeDuration={0}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
