/**
 * 对焦框：只画一个黄框，不含手势、不含计时。
 *
 * 为什么把"框"和"手指"拆成两个文件：曝光滑块的触摸区必须压在这一层之上，而框本身
 * 必须 `pointerEvents: 'none'` —— 否则它会吃掉自己身下那一点面积的"点按对焦"。
 * 两种触摸语义塞进同一个组件，迟早有人给它挂上 panHandlers 而悄悄弄坏别处的点按；
 * 拆开之后，这个错误在结构上就写不出来了。
 *
 * 为什么脉冲用 `Animated.spring` 而不是 `timing`：镜头合焦是机械动作，收束要有过冲。
 * 匀速的 timing 看起来像普通 UI 动画，不像对焦。
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../constants/theme';

/** 点击落点：`x` / `y` 是以取景器为参照的 0~1 归一化坐标，`at` 是时间戳（毫秒）。 */
export type FocusTarget = { x: number; y: number; at: number } | null;

/**
 * 框的边长。取景器上唯一一个"手指大小"的标记：76 与旧版一致，
 * 换尺寸会让老用户觉得对焦"变小了/变大了"，而它并没有。
 */
export const RETICLE_SIZE = 76;

const STROKE = 1;
const RADIUS = 2;
/** 按下瞬间的放大倍数：1.18 看得出来"被按到了"，又不会盖住旁边刚落下的手指。 */
const PULSE_SCALE = 1.18;
const PULSE_SPEED = 20;
const PULSE_BOUNCINESS = 9;

/**
 * 把归一化落点换算成框左上角的像素坐标，并把它按在取景器内。
 *
 * 为什么必须夹紧：手指点到画面最边缘时，框会有一半落在取景器外面 —— 看起来像被裁掉了；
 * 而且曝光滑块要贴着框右侧 8pt，框越界会把滑块一起推出画面。
 */
export function reticleOrigin(
  target: { x: number; y: number },
  width: number,
  height: number,
): { left: number; top: number } {
  return {
    left: Math.min(Math.max(target.x * width - RETICLE_SIZE / 2, 0), Math.max(width - RETICLE_SIZE, 0)),
    top: Math.min(Math.max(target.y * height - RETICLE_SIZE / 2, 0), Math.max(height - RETICLE_SIZE, 0)),
  };
}

export interface FocusReticleProps {
  target: FocusTarget;
  width: number;
  height: number;
  /** 整层透明度由父级驱动：3 秒无操作时它要和曝光滑块一起淡出，所以不能各淡各的。 */
  opacity: Animated.Value;
}

export function FocusReticle({ target, width, height, opacity }: FocusReticleProps) {
  const { focus } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  /**
   * 用时间戳而不是 target 对象当依赖：每次点击 target 都是新对象，拿它比较等于每次必跑动画；
   * 而父级因别的原因（拖 EV、切镜头）重渲染时时间戳没变，动画就不该重跑。
   */
  const stamp = target === null ? 0 : target.at;

  useEffect(() => {
    if (stamp === 0) {
      return;
    }
    scale.setValue(PULSE_SCALE);
    const pulse = Animated.spring(scale, {
      toValue: 1,
      speed: PULSE_SPEED,
      bounciness: PULSE_BOUNCINESS,
      useNativeDriver: true,
    });
    pulse.start();
    return () => pulse.stop();
  }, [stamp, scale]);

  if (target === null) {
    return null;
  }

  const origin = reticleOrigin(target, width, height);

  return (
    <Animated.View
      style={[
        styles.box,
        { left: origin.left, top: origin.top, borderColor: focus, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

// 这里只放几何：颜色一律现取，放模块级会把首次渲染时的配色冻住，切深浅色就不跟手了。
const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderWidth: STROKE,
    borderRadius: RADIUS,
    pointerEvents: 'none',
  },
});
