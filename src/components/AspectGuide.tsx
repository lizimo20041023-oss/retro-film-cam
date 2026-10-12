/**
 * 画幅参考线 + 顶端的等宽标记。
 *
 * 为什么实时取景里只画一条 1px 半透明白线，而不是贴相框贴图：贴图一上屏，用户就会
 * 以为自己拍到的就是那个相框（拍立得的白边不可能出现在负片里）；真正的相框只在冲印
 * 阶段由 `FilmCompositor` 合成。这条线唯一的职责是回答"传感器上哪一块会被裁进照片"。
 *
 * 为什么线画在 `window` 上而不是整个相框外框上：`computeFrameLayout().window` 就是
 * 窗口相对相框的位置，合成阶段用的是同一个函数 —— 取景时看到的窗口 == 出片时的窗口。
 */
import { StyleSheet, Text, View } from 'react-native';
import type { Rect } from '../types';
import { UI_MONO, useTheme } from '../constants/theme';

/** 顶端标记离取景器上沿的距离：够近才像机身刻印，又不至于被刘海/状态栏压住。 */
const LABEL_TOP = 10;

export interface AspectGuideProps {
  /** 画幅窗口在取景器坐标系里的绝对位置。 */
  window: Rect;
  /** 顶端居中的标记文字（规格里是固定的 `35mm`）。 */
  label: string;
}

export function AspectGuide({ window: box, label }: AspectGuideProps) {
  const { ink } = useTheme();

  return (
    <>
      <View
        style={[
          styles.frame,
          { left: box.left, top: box.top, width: box.width, height: box.height },
        ]}
      />
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: ink.paperDim }]} allowFontScaling={false}>
          {label}
        </Text>
      </View>
    </>
  );
}

// 只放几何与排版：参考线颜色是固定的半透明白（它必须能在任何画面上"淡淡地存在"），
// 标记文字的颜色跟主题走，所以在组件里现取。
const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 2,
    pointerEvents: 'none',
  },
  labelRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: LABEL_TOP,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  label: {
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 2.4,
    opacity: 0.9,
  },
});
