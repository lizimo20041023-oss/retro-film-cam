/**
 * 次级玻璃按钮：一枚圆形液态玻璃盘 + 一枚极细线性图标。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么不再用 PNG 底图（`dial.png` / `dial-on.png`）
 * ─────────────────────────────────────────────────────────────────────
 * 上一版是"金属滚花盘"贴图 + 图标 PNG 叠上去。改成液态玻璃之后这个组合有两处硬伤：
 *   · 滚花盘是**不透明**的，而玻璃的全部效果都来自"采到背后的画面"——垫一张不透明
 *     贴图，等于让模糊去采一块死平的金属，采出来还是那块金属；
 *   · 滚花、金属高光、"琥珀色内发光"三样都是**拟物**语言，和 iOS 26 的玻璃层
 *     摆在一起会互相打架：一边是清晰的材质，一边是半透明的层。
 * 所以底图整张删掉，外壳换成 `LiquidGlassView`，图标也改成纯 `View` 画的线框
 * （调用方传 `glyph` 进来，见下）。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 点亮态为什么改成"垫一层琥珀底色"，而不是把图标画成琥珀色
 * ─────────────────────────────────────────────────────────────────────
 * 规格要求图标**强制纯白**（`GLASS_TEXT_COLOR`）。但"设置面板正开着"这件事必须
 * 看得出来 —— 于是点亮态改由玻璃自己的 `overlay` 表达：图标保持纯白不变，
 * 玻璃底透出一层琥珀。这也更接近 iOS 26 的做法（玻璃本身变色，而不是里面的字变色）。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 关于 `glyph` 为什么是"函数"而不是"图片源"
 * ─────────────────────────────────────────────────────────────────────
 * 传函数（render prop）而不是 `ReactNode`：图标必须拿到**组件自己算出来的**颜色
 * 才能和按钮的禁用态保持一致，调用方在外面写死 `color="#FFFFFF"` 会漏掉禁用态。
 * 传函数还有一个好处 —— 图标归调用方所有，款式的差异（拨轮齿轮 / 胶卷条）
 * 不用堆进这个通用外壳里。
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import type { ReactElement } from 'react';
import { GLASS_TEXT_COLOR, LiquidGlassView } from './LiquidGlassView';

/** 点亮态垫的琥珀。用 0.22 而不是实色：玻璃要透，颜色只负责"提示"，不负责"铺满"。 */
const ACTIVE_OVERLAY = 'rgba(229, 169, 60, 0.22)';

export interface DialButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  /**
   * 盘面上的线性图标。**是函数不是节点**：颜色由按钮给（禁用时那层透明度要能作用到
   * 图标上），调用方不该自己写死一个颜色。返回的元素自己负责画成 `size` 大小。
   */
  glyph: (color: ColorValue) => ReactElement;
  /** true = 点亮态：玻璃底透一层琥珀，图标仍是纯白。 */
  active?: boolean;
  disabled?: boolean;
  /** 直径（pt）。 */
  size?: number;
}

export function DialButton({
  onPress,
  accessibilityLabel,
  glyph,
  active = false,
  disabled = false,
  size = 44,
}: DialButtonProps) {
  /*
   * 禁用态压暗整盘而不是只压暗图标：玻璃盘是这张图上唯一有面积的东西，
   * 只压图标的话背影还是亮的，看起来仍然是"能按"。
   */
  const iconColor = disabled ? 'rgba(255, 255, 255, 0.42)' : GLASS_TEXT_COLOR;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={styles.touch}
    >
      <LiquidGlassView
        radius={size / 2}
        overlay={active ? ACTIVE_OVERLAY : undefined}
        style={[styles.plate, { width: size, height: size }, disabled ? styles.disabled : null]}
      >
        <View style={styles.iconLayer} pointerEvents="none">
          {glyph(iconColor)}
        </View>
      </LiquidGlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
   * 透明度压在玻璃上，不压在 `Pressable` 上：`Pressable` 的 style 每帧都会被
   * 回调重算，把 opacity 放进来的话，模糊层的父视图每帧都在变 —— iOS 上的
   * `UIVisualEffectView` 会被迫每帧重新合成一次采样。
   *
   * 相同理由，按下态也没有压暗这一档：`Pressable` 的按下态只能从 style 回调里拿，
   * 而回调里每一次 style 变化都会让上面这件事发生一次。玻璃盘自己的触摸反馈由系统的
   * 高亮与这层玻璃的折射环给，不额外压暗 —— 这也是 `style` 是个**静态数组**而不是
   * 回调的原因（回调本身不会让模糊重采样，但它唯一存在的意义就是按下态）。
   */
  disabled: {
    opacity: 0.38,
  },
});
