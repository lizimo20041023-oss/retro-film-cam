/**
 * 对焦框 + 垂直曝光滑块：取景器上唯一一处"自己接管手势"的层。
 *
 * 为什么滑块是竖的、而且紧贴框右侧：手指按在画面上时，自然的调节方向就是上下；
 * 横向滑动会和捏合变焦抢手势。离框 8pt 是为了让"对焦"和"调光"看起来是同一次操作的
 * 两个部分，而不是两个互不相干的控件。
 *
 * 为什么 3 秒后整层自己淡出、并且要回调父级清掉 `focusTarget`：常驻的滑块会一直挡着
 * 右上角那块画面的点按对焦。只淡出不清状态，等于把一个看不见却仍然吃触摸的层留在屏幕上。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useI18n } from '../i18n';
import { useTheme } from '../constants/theme';
import { FocusReticle, RETICLE_SIZE, reticleOrigin } from './FocusReticle';
import type { FocusTarget } from './FocusReticle';

export const EXPOSURE_MIN = -2;
export const EXPOSURE_MAX = 2;

/**
 * 步进取 1/3 档而不是 0.1。
 *
 * 相机上的曝光补偿就是一格 1/3 EV，13 格正好铺满 -2 ~ +2；而原生 `setExposureTargetBias`
 * 收的是连续量，标 0.1 只是一种"看起来很精确"的假象 —— 用户多滑一下就发现步进对不上手感。
 */
export const EXPOSURE_STEP = 1 / 3;

/** 半程（滑块长度的一半）对应整个正向区间，所以总行程 = 2 EV。 */
const STEP_LIMIT = Math.round(EXPOSURE_MAX / EXPOSURE_STEP);

/**
 * 把 EV 量化到 1/3 档。
 *
 * 用除法而不是乘 `0.3333…`：`6 * (1/3)` 在浮点里是 `1.9999999999999998`，
 * 写进 state 之后 `=== 2` 之类的判断会莫名其妙不成立（`factorToZoom` 里踩过同一个坑）。
 */
export function quantizeExposure(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const steps = Math.max(-STEP_LIMIT, Math.min(STEP_LIMIT, Math.round(value / EXPOSURE_STEP)));
  return Number((steps / 3).toFixed(3));
}

/** 曝光读数：0 不带符号（"0.0" 比 "+0.0" 更像仪表），其余带符号一位小数。 */
export function formatExposure(value: number): string {
  const rounded = quantizeExposure(value);
  if (rounded === 0) {
    return '0.0';
  }
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}`;
}

/** 滑块长度：对焦框高度的 1.6 倍 —— 比框长，但不会长到戳出取景器。 */
const SLIDER_LENGTH = Math.round(RETICLE_SIZE * 1.6);
const SLIDER_GAP = 8;
/** 触摸区宽度：细线本身只有 1pt，44pt 才是手指点得住的最小宽度。 */
const HIT_WIDTH = 44;
const DOT_SIZE = 12;
const DOT_CORE = 4;
const IDLE_MS = 3000;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 260;

export interface FocusExposureProps {
  target: FocusTarget;
  width: number;
  height: number;
  /** 当前曝光补偿（EV）。 */
  exposure: number;
  onExposure: (exposure: number) => void;
  /** 3 秒无操作、并且淡出动画真的放完了 → 请父级清掉 `focusTarget`。 */
  onIdle: () => void;
}

export function FocusExposure({ target, width, height, exposure, onExposure, onIdle }: FocusExposureProps) {
  const { focus, panel, sliderTrack } = useTheme();
  const { t } = useI18n();
  const fade = useRef(new Animated.Value(0)).current;
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startExposure = useRef(0);
  const lastStep = useRef(0);

  /**
   * PanResponder 只建一次（依赖数组为空），所以它读不到最新的 props。
   * 和 `usePinchZoom` 用同一套办法：把 props 镜像进 ref，手势里只读 ref。
   * 不用 state：手势回调里读 state 会读到闭包建立那一刻的旧值。
   */
  const latest = useRef({ exposure, onExposure, onIdle });
  useEffect(() => {
    latest.current = { exposure, onExposure, onIdle };
  });

  const clearIdle = useCallback(() => {
    if (idle.current !== null) {
      clearTimeout(idle.current);
      idle.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearIdle();
    idle.current = setTimeout(() => {
      idle.current = null;
      // 先淡完再清状态：反过来会"啪"地消失，而镜头里的东西不会瞬间不见
      Animated.timing(fade, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          latest.current.onIdle();
        }
      });
    }, IDLE_MS);
  }, [clearIdle, fade]);

  const stamp = target === null ? 0 : target.at;

  useEffect(() => {
    if (stamp === 0) {
      // 被父级清掉（翻转相机、换镜头）时立刻收起，别留一个看不见却还在计时的手势层
      clearIdle();
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();
    scheduleIdle();
    return clearIdle;
  }, [stamp, fade, clearIdle, scheduleIdle]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // 按下即接管：这是取景器上唯一一块拖动区，抢手势不会影响别处的点按对焦
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // 接管后不许被抢走：拖到一半被父级捏合接管，会出现"手指还在动、读数不动"
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          clearIdle();
          startExposure.current = latest.current.exposure;
          lastStep.current = Math.round(latest.current.exposure / EXPOSURE_STEP);
        },
        onPanResponderMove: (_event, gesture) => {
          // 手指往上 = 加曝光：和相机上"把曝光补偿轮往上推"是同一个方向
          const raw = startExposure.current - (gesture.dy / (SLIDER_LENGTH / 2)) * EXPOSURE_MAX;
          const steps = Math.max(-STEP_LIMIT, Math.min(STEP_LIMIT, Math.round(raw / EXPOSURE_STEP)));
          if (steps === lastStep.current) {
            return;
          }
          lastStep.current = steps;
          // 每跨一格震一次：连续震会变成噪音，完全不震又不知道自己走没走
          void Haptics.selectionAsync();
          latest.current.onExposure(Number((steps / 3).toFixed(3)));
        },
        onPanResponderRelease: scheduleIdle,
        onPanResponderTerminate: scheduleIdle,
      }),
    [clearIdle, scheduleIdle],
  );

  const bump = useCallback(
    (direction: 1 | -1) => {
      void Haptics.selectionAsync();
      latest.current.onExposure(quantizeExposure(latest.current.exposure + direction * EXPOSURE_STEP));
      scheduleIdle();
    },
    [scheduleIdle],
  );

  if (target === null) {
    return null;
  }

  const origin = reticleOrigin(target, width, height);
  const centreY = origin.top + RETICLE_SIZE / 2;
  const stripTop = Math.min(Math.max(centreY - SLIDER_LENGTH / 2, 0), Math.max(height - SLIDER_LENGTH, 0));
  const stripLeft = Math.min(
    Math.max(origin.left + RETICLE_SIZE + SLIDER_GAP, 0),
    Math.max(width - HIT_WIDTH, 0),
  );
  const value = quantizeExposure(exposure);
  // 圆点跟着 EV 走：0 EV 停在正中。固定不动的圆点等于没有反馈
  const ratio = (value - EXPOSURE_MIN) / (EXPOSURE_MAX - EXPOSURE_MIN);
  const dotBottom = ratio * (SLIDER_LENGTH - DOT_SIZE);

  return (
    <>
      <FocusReticle target={target} width={width} height={height} opacity={fade} />
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={t('camera.exposure.a11y')}
        accessibilityValue={{ text: formatExposure(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'increment') {
            bump(1);
          } else if (action === 'decrement') {
            bump(-1);
          }
        }}
        style={[styles.strip, { left: stripLeft, top: stripTop, opacity: fade }]}
      >
        <View style={[styles.track, { backgroundColor: sliderTrack }]} />
        <View style={[styles.dot, { bottom: dotBottom, borderColor: focus, backgroundColor: panel }]}>
          <View style={[styles.dotCore, { backgroundColor: focus }]} />
        </View>
      </Animated.View>
    </>
  );
}

// 只放几何：颜色现取，模块级配色会把深浅色切换冻在首次渲染那一刻。
const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    width: HIT_WIDTH,
    height: SLIDER_LENGTH,
    alignItems: 'center',
  },
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  dot: {
    position: 'absolute',
    left: (HIT_WIDTH - DOT_SIZE) / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCore: {
    width: DOT_CORE,
    height: DOT_CORE,
    borderRadius: DOT_CORE / 2,
  },
});
