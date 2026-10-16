/**
 * 对焦框 + 垂直曝光滑块：取景器上唯一一处"自己接管手势"的层。
 *
 * 为什么滑块是竖的、而且紧贴框右侧：手指按在画面上时，自然的调节方向就是上下；
 * 横向滑动会和捏合变焦抢手势。离框 8pt 是为了让"对焦"和"调光"看起来是同一次操作的
 * 两个部分，而不是两个互不相干的控件。
 *
 * 为什么 `IDLE_MS` 无操作后整层自己淡出、并且要回调父级清掉 `focusTarget`：常驻的滑块
 * 会一直挡着右上角那块画面的点按对焦。只淡出不清状态，等于把一个看不见却仍然吃触摸的
 * 层留在屏幕上。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useI18n } from '../i18n';
import type { Rect } from '../types';
import { useTheme } from '../constants/theme';
import { FocusReticle, RETICLE_SIZE, reticleOrigin, safeAreaRect } from './FocusReticle';
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

/**
 * 滑块长度：对焦框高度的 1.6 倍 —— 比框长，但不会长到戳出安全内区。
 *
 * 用户报的"高约 90px"与真值 `Math.round(76 * 1.6) = 122` 差 32pt：
 * 122 是**触摸区全高**（`styles.strip` 的 `height`），不是那根 1pt 竖线看起来的长度 ——
 * 竖线本身从 `top: 0` 拉到 `bottom: 0`，视觉上就是 122；圆点在 110pt 的行程上跑
 * （`SLIDER_LENGTH - DOT_SIZE`）。用户量到的 90 大概率是"眼睛看到的竖线 + 两端留白"
 * 的目测值，两种口径都不是错误，但**代码口径是 122**，下面所有夹紧都按它算。
 */
const SLIDER_LENGTH = Math.round(RETICLE_SIZE * 1.6);
const SLIDER_GAP = 8;
/** 触摸区宽度：细线本身只有 1pt，44pt 才是手指点得住的最小宽度。 */
const HIT_WIDTH = 44;
const DOT_SIZE = 12;
const DOT_CORE = 4;
/**
 * 无操作多久开始淡出。用户要 **2000ms**（规格 §三-2「启动 2000ms 定时器」）。
 *
 * 为什么从 3000 改到 2000：3 秒之间对焦框一直钉在画面上，用户会以为它"卡住了"；
 * 2 秒是"看完这一眼"与"它还赖着不走"之间的分界。淡出本身仍是 `FADE_OUT_MS`，
 * 所以"最后一次操作 → 完全消失"总共 2260ms。
 */
const IDLE_MS = 2000;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 260;

export interface FocusExposureProps {
  target: FocusTarget;
  width: number;
  height: number;
  /**
   * 镂空取景窗矩形（与 `width` / `height` 同一个坐标系）。
   *
   * 对焦框和曝光竖条都只许出现在这一块**再内缩 `SAFE_INSET`(48)** 之后的安全内区里 ——
   * 真机实测报的"黄色对焦框卡在取景框最下边缘，一半在框内一半漏到框外的遮罩区"
   * 就是没有它导致的。不传 = 退回整块画布（内缩照旧）。
   */
  bounds?: Rect;
  /** 当前曝光补偿（EV）。 */
  exposure: number;
  onExposure: (exposure: number) => void;
  /** 3 秒无操作、并且淡出动画真的放完了 → 请父级清掉 `focusTarget`。 */
  onIdle: () => void;
}

export function FocusExposure({
  target,
  width,
  height,
  bounds,
  exposure,
  onExposure,
  onIdle,
}: FocusExposureProps) {
  const { focus, panel, sliderTrack } = useTheme();
  const { t } = useI18n();
  const fade = useRef(new Animated.Value(0)).current;
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startExposure = useRef(0);
  const lastStep = useRef(0);
  const lastIdleReset = useRef(0);
  /** 节流窗口内挂起的"补偿重排"计时器；`clearIdle` 不管它，它由 `resetIdleTimer` 自己管。 */
  const pendingReset = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /**
   * 拖动过程中把淡出计时器往后推 —— 用户的规格原文是"拖动期间重置计时器"。
   *
   * 为什么不能只靠上面那条 `useEffect([stamp, …])`：拖动曝光只改 `exposure`，`stamp`
   * （= `target.at`）从头到尾不变，那条 effect 不会重跑，于是"按下时清掉的计时器"再也
   * 没被排回来 —— 实测手指按住不放超过 `IDLE_MS`，对焦框会在指头底下自己开始淡出。
   *
   * 为什么要节流：`onPanResponderMove` 一次拖动可以触发上百次，而 `scheduleIdle` 每次
   * 都会重排 `setTimeout`；不节流就等于用几十赫兹的频率在后面排队建/毁计时器，还全程占着
   * JS 线程（这条路径上还有震动和 setState）。间隔取 `IDLE_MS / 4 = 500ms`：计时器永远
   * 被推到"离超时至少 3/4 个周期"的地方，用户感知到的行为与逐次重置完全一致，代价只有
   * 每 500ms 一次。
   *
   * ⚠️ 但节流**不能**做成"没到点就直接 return"：那样手指连续移动时，`onPanResponderMove`
   * 里那次 `clearIdle()` 已经把在飞的计时器取消了，而节流又拒绝补新的，
   * 于是"一个计时器都没有"的空档会一直拖到下一次节流窗口才结束（旧写法实测 400ms）。
   * 所以这里在"还不能重排"时挂一个**补偿计时器**，把重排补上，空档的上界锁死在 `IDLE_MS / 4`。
   *
   * 不节流 `Animated.timing` 也是同一个理由：`Animated.Value` 上只有一个在跑的动画，
   * 每次 `scheduleIdle` 都会用一条新的淡出动画顶掉旧的（这也正是它不该按移动频率跑的原因）。
   */
  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastIdleReset.current;
    if (elapsed >= IDLE_MS / 4) {
      lastIdleReset.current = now;
      if (pendingReset.current !== null) {
        clearTimeout(pendingReset.current);
        pendingReset.current = null;
      }
      scheduleIdle();
      return;
    }
    if (pendingReset.current !== null) {
      return;
    }
    // 补偿计时器只负责"把重排补上"，不参与节流记账：它的到点时间恰好是节流窗口的剩余量
    pendingReset.current = setTimeout(() => {
      pendingReset.current = null;
      lastIdleReset.current = Date.now();
      scheduleIdle();
    }, IDLE_MS / 4 - elapsed);
  }, [scheduleIdle]);

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
          // 按下 = 一次操作：清掉旧计时器后**立刻**重排一个，别留一段"没有任何计时器"的空档
          clearIdle();
          resetIdleTimer();
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
          // 手指还在动 = 用户还在操作，把淡出往后推（内部已按 IDLE_MS/4 节流）。
          // 先无条件 `clearIdle()` 再节流重排：节流只允许推迟"重排"，不允许丢掉"取消" ——
          // 否则 500ms 窗口内那几次移动会走到不重置的分支，而按下时清掉的计时器还没排回来，
          // 中间就出现一段"没有任何计时器"的空档（探针会断言这段空档不存在）。
          clearIdle();
          resetIdleTimer();
          // 每跨一格震一次：连续震会变成噪音，完全不震又不知道自己走没走
          void Haptics.selectionAsync();
          latest.current.onExposure(Number((steps / 3).toFixed(3)));
        },
        onPanResponderRelease: scheduleIdle,
        onPanResponderTerminate: scheduleIdle,
      }),
    [clearIdle, resetIdleTimer, scheduleIdle],
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

  /*
   * 竖条的位置。四步，都只为了解决"越界穿模"：
   *   0. 先把窗口矩形内缩成**安全内区** —— 这是用户要的 48pt 行为要求（规格 §三-1）。
   *      对焦框和滑条用的是**同一个** `safe` 矩形，两条几何口径不许各算一遍：
   *      各算一遍就迟早会在某台机器上出现"框在安全区、条在安全区外"。
   *   1. 竖直方向按 `safe` 夹，不再按整块画布 —— 否则滑条会伸到遮罩区里去；
   *   2. 横向优先放在框右侧；右侧放不下（框已经贴着安全区右沿）时**翻到左侧**，
   *      而不是硬挤在窗口外；
   *   3. 翻转之后夹一次 —— 夹的是**触摸区**（`HIT_WIDTH` 44pt 手指宽度），不是那 1pt
   *      的细线：只夹细线等于留了一个伸到窗口外、看不见却点得着的热区。
   *
   * 第 3 步为什么要两个上界取小：正常窗口里 `safe.right - HIT_WIDTH` 就是正确上界；
   * 但窗口本身比 `HIT_WIDTH` 还窄、或比 `RETICLE_SIZE + SLIDER_GAP + HIT_WIDTH` 还窄时，
   * `safe` 会被 `safeAreaRect` 收缩成一条线，仅按 `safe` 夹出来的条会整根挂在窗口右边
   * 之外（探针里 60pt 宽的窗口：条右沿 74 > 窗口右沿 60）。所以在
   * 「安全区右沿」与「窗口右沿」里取更靠左的那个当分界：安全区永远是窗口的子集，
   * 于是这个取小不改变正常窗口的任何结果，只在退化窗口里多挡住一次外溢。
   * 上界本身再与下界取 `max`，保证极窄窗口下宽度仍为正（`HIT_WIDTH`），不出现负宽元素。
   *
   * 退化说明：窗口比 `SLIDER_LENGTH` 矮时，第 1 步的夹紧会把条顶在 `safe.top`，
   * 条的**下沿**会超出安全区 —— 这在真实机型 + 现有画幅下取不到（最矮的 `fp100c`
   * 窗口在 360×800 上也有 ~199pt > 122），只有人为构造的极窄窗口才会触发；
   * 那种窗口下"条有 122pt 的可拖长度"和"像素级不越界"不能同时满足，优先保住前者。
   */
  const safe = safeAreaRect(bounds ?? { left: 0, top: 0, width, height });
  const origin = reticleOrigin(target, width, height, bounds);
  const centreY = origin.top + RETICLE_SIZE / 2;
  const stripTop = Math.min(
    Math.max(centreY - SLIDER_LENGTH / 2, safe.top),
    Math.max(safe.top, safe.top + safe.height - SLIDER_LENGTH),
  );
  const safeRight = safe.left + safe.width;
  const windowRight = bounds ? bounds.left + bounds.width : width;
  const rightBound = Math.min(safeRight, windowRight) - HIT_WIDTH;
  const stripRightLimit = Math.max(safe.left, rightBound);
  const rightSide = origin.left + RETICLE_SIZE + SLIDER_GAP;
  const leftSide = origin.left - SLIDER_GAP - HIT_WIDTH;
  const preferred = rightSide + HIT_WIDTH <= safeRight ? rightSide : leftSide;
  const stripLeft = Math.min(Math.max(preferred, safe.left), stripRightLimit);
  const value = quantizeExposure(exposure);
  // 圆点跟着 EV 走：0 EV 停在正中。固定不动的圆点等于没有反馈
  const ratio = (value - EXPOSURE_MIN) / (EXPOSURE_MAX - EXPOSURE_MIN);
  const dotBottom = ratio * (SLIDER_LENGTH - DOT_SIZE);

  return (
    <>
      {/*
        传 `safe` 而不是 `bounds`：`reticleOrigin` 内部也会走 `safeAreaRect`，两次结果完全相同
        （纯函数、同一输入），显式传是为了让 JSX 上就能看出"框和条共享同一个安全矩形"。
      */}
      <FocusReticle target={target} width={width} height={height} bounds={safe} opacity={fade} />
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
