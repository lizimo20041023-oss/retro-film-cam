/**
 * 变焦轨道 —— 取景器右缘那根竖条。
 *
 * 为什么放在取景器上而不是底部控制区
 * ---------------------------------------------------------------------------
 * 变焦是**边看边调**的动作：手指按住往上推、眼睛盯着画面变大，一松手就停。
 * 把它放到屏幕底部，视线要在「画面」和「滑块」之间来回跳两次，手感全没了。
 * 放在取景器右缘，手指压住的位置离画面只有几毫米，视线不用离开取景器。
 *
 * 为什么是竖的
 * ---------------------------------------------------------------------------
 * 取景器本身已经有一个**横向**的 PanResponder（`FrameSwitcher`，左右滑动换相框）。
 * 竖直方向是空的 —— 这一点是刻意的：真实变焦环就是转，不是推。
 * 手指落在轨道上时由这里先取到响应权（`onStartShouldSetPanResponder`），
 * 所以竖条上的横滑不会误触发换相框；轨道只有 24pt 宽，不会挡住正常滑动。
 *
 * 读数为什么是百分比而不是「×N 倍」——见 `src/constants/zoom.ts` 的文件头。
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { INK, UI_MONO } from '../constants/theme';
import {
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_TICKS,
  clampZoom,
  toCameraZoom,
  zoomPercent,
  zoomTickRatios,
} from '../constants/zoom';
import { useI18n } from '../i18n';

type ZoomRailProps = {
  /** 当前值（`CameraScreen` 里那个 state，已经是量化过的）。 */
  value: number;
  onChange: (next: number) => void;
  /** 相机没就绪 / 正在显影时为 false。 */
  enabled?: boolean;
};

const TRACK_WIDTH = 24;
const TRACK_HEIGHT = 128;
/** 刻度的归一化位置算一次就够了。 */
const TICK_RATIOS = zoomTickRatios();

export function ZoomRail({ value, onChange, enabled = true }: ZoomRailProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);

  const heightRef = useRef(TRACK_HEIGHT);
  /**
   * PanResponder 是一次性建好的（`useMemo` 空依赖链），所以回调不能再闭包捕获
   * `enabled` / `onChange` —— 那样拖动过程中 props 一变，手势还停在旧闭包里。
   * 统一走 ref，每次渲染同步一次。
   */
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** 上一次跨到第几格，用来只在跨刻度时给一次震动。 */
  const segmentRef = useRef(-1);

  const applyRatio = useCallback((ratio: number) => {
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const segment = Math.round(clamped * (ZOOM_TICKS + 1));
    if (segment !== segmentRef.current) {
      segmentRef.current = segment;
      void Haptics.selectionAsync();
    }
    onChangeRef.current(toCameraZoom(clamped * ZOOM_MAX));
  }, []);

  /** 屏幕 y（相对轨道顶部）→ 值。越往上越大，和真实变焦环一致。 */
  const applyY = useCallback(
    (y: number) => {
      applyRatio(1 - y / (heightRef.current || TRACK_HEIGHT));
    },
    [applyRatio],
  );

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 1) {
      heightRef.current = height;
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: (event) => {
          setDragging(true);
          applyY(event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          applyY(event.nativeEvent.locationY);
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [applyY],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      const current = clampZoom(value);
      if (actionName === 'increment') {
        onChangeRef.current(toCameraZoom(current + ZOOM_STEP));
      } else if (actionName === 'decrement') {
        onChangeRef.current(toCameraZoom(current - ZOOM_STEP));
      }
    },
    [value],
  );

  const percent = zoomPercent(value);
  const ratio = percent / 100;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Text style={styles.label} numberOfLines={1}>
        {t('zoom.label')}
      </Text>

      <View
        style={[styles.track, dragging ? styles.trackActive : null]}
        onLayout={handleTrackLayout}
        pointerEvents="auto"
        accessibilityRole="adjustable"
        accessibilityLabel={t('zoom.a11y', { percent })}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        {...pan.panHandlers}
      >
        {/* 所有子节点都不吃触摸：这样手势的 target 永远是轨道本身，
            `nativeEvent.locationY` 才是相对轨道的坐标。 */}
        <View pointerEvents="none" style={[styles.fill, { height: ratio * TRACK_HEIGHT }]} />
        {TICK_RATIOS.map((tickRatio) => (
          <View
            key={tickRatio}
            pointerEvents="none"
            style={[styles.tick, { bottom: tickRatio * TRACK_HEIGHT }]}
          />
        ))}
        <View
          pointerEvents="none"
          style={[styles.edge, { bottom: Math.max(0, ratio * TRACK_HEIGHT - 1) }]}
        />
      </View>

      <Text style={[styles.value, percent > 0 ? styles.valueOn : null]} numberOfLines={1}>
        {`${percent}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_WIDTH / 2,
    backgroundColor: 'rgba(10, 10, 11, 0.34)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    overflow: 'hidden',
  },
  trackActive: {
    borderColor: 'rgba(210, 139, 42, 0.55)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(210, 139, 42, 0.20)',
  },
  tick: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(226, 222, 214, 0.22)',
  },
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: INK.amber,
  },
  value: {
    color: INK.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  valueOn: {
    color: INK.amberSoft,
  },
});
