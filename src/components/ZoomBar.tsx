/**
 * 变焦条 —— 快门上方那一行：三个常用焦段 + 一根横向轨道 + 百分比读数。
 *
 * 为什么从取景器里的竖条挪到这里（用户要求）
 * ---------------------------------------------------------------------------
 * 竖版是放在取景器右缘的，理由是"变焦是边看边调的动作"。但取景器右缘同时
 * 承接着「左右滑动换相框」和「双指捏合变焦」两个手势，三个手势挤在同一块
 * 玻璃上，误触率比手感收益大。挪到快门正上方之后：
 *   - 滑动换相框、捏合变焦留在取景器上（都是"对着画面做"的动作）；
 *   - 精确微调留在轨道上（"看着读数做"的动作）；
 *   - 三者互不抢手势，因为轨道已经完全不在 `FrameSwitcher` 的覆盖范围内。
 *
 * 为什么是横的
 * ---------------------------------------------------------------------------
 * 轨道现在是页面流里的一行，横向和它所在的那一行同向；而且 13/26/35 三个档
 * 按数字从小到大从左往右排，滑块从左往右递增，读起来和刻度是一致的。
 * （竖条的"越往上越大"在页面流里反而会让人下意识往上推整页。）
 *
 * 读数为什么是百分比而不是「×N 倍」——见 `src/constants/zoom.ts` 的文件头。
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
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

/** 焦段按钮的展示数据。`CameraScreen` 负责把 `lenses.ts` 里的档位翻成这个形状。 */
export type ZoomStopView = {
  /** 稳定 id（`FOCAL_STOPS` 里那个）。 */
  id: string;
  /** 按钮上的短标签，例如 `13`。 */
  short: string;
  /** 无障碍标签，例如「13mm 超广角」。 */
  a11y: string;
  /** 这台设备 / 当前这颗摄像头没有这个档位。 */
  disabled?: boolean;
};

type ZoomBarProps = {
  /** 当前值（`CameraScreen` 里那个 state，已经是量化过的）。 */
  value: number;
  onChange: (next: number) => void;
  /** 相机没就绪 / 正在显影时为 false。 */
  enabled?: boolean;
  /** 常用焦段快选。传空数组就只剩轨道。 */
  stops?: readonly ZoomStopView[];
  /** 当前点亮的档位 id（手动拖动过轨道后由 `CameraScreen` 置空）。 */
  activeStopId?: string | null;
  onStopPress?: (id: string) => void;
};

const TRACK_HEIGHT = 26;
const KNOB_WIDTH = 4;
const KNOB_HEIGHT = 18;
/** 刻度的归一化位置算一次就够了。 */
const TICK_RATIOS = zoomTickRatios();

export function ZoomBar({
  value,
  onChange,
  enabled = true,
  stops = [],
  activeStopId = null,
  onStopPress,
}: ZoomBarProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);

  const widthRef = useRef(0);
  /**
   * PanResponder 是一次性建好的（`useRef` 空依赖），所以回调不能再闭包捕获
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

  /** 轨道内的 x → 值。从左往右递增。 */
  const applyX = useCallback(
    (x: number) => {
      applyRatio(x / (widthRef.current || 1));
    },
    [applyRatio],
  );

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 1) {
      widthRef.current = width;
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: (event) => {
          setDragging(true);
          applyX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          applyX(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [applyX],
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
    <View style={styles.root}>
      <Text style={styles.label} numberOfLines={1} allowFontScaling={false}>
        {t('zoom.label')}
      </Text>

      {stops.map((stop) => {
        const active = stop.id === activeStopId;
        const disabled = !enabled || stop.disabled === true;
        return (
          <Pressable
            key={stop.id}
            accessibilityRole="button"
            accessibilityLabel={stop.a11y}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => {
              void Haptics.selectionAsync();
              onStopPress?.(stop.id);
            }}
            hitSlop={4}
            style={({ pressed }) => [
              styles.stop,
              active ? styles.stopOn : null,
              disabled ? styles.stopOff : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text
              style={[styles.stopText, active ? styles.stopTextOn : null]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {stop.short}
            </Text>
          </Pressable>
        );
      })}

      <View
        style={styles.trackBox}
        onLayout={handleTrackLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={t('zoom.a11y', { percent })}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        {...pan.panHandlers}
      >
        {/* 所有子节点都不吃触摸：这样手势的 target 永远是这条轨道本身，
            `nativeEvent.locationX` 才是相对轨道的坐标。 */}
        <View pointerEvents="none" style={[styles.rail, dragging ? styles.railActive : null]} />
        <View
          pointerEvents="none"
          style={[styles.fill, { width: `${ratio * 100}%` }]}
        />
        {TICK_RATIOS.map((tickRatio) => (
          <View
            key={tickRatio}
            pointerEvents="none"
            style={[styles.tick, { left: `${tickRatio * 100}%` }]}
          />
        ))}
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            { left: `${ratio * 100}%`, backgroundColor: ratio > 0 ? INK.amber : INK.paperDim },
          ]}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 6,
  },
  label: {
    color: INK.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 0.8,
    marginRight: 6,
  },
  stop: {
    minWidth: 30,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  stopOn: {
    borderColor: 'rgba(210, 139, 42, 0.72)',
    backgroundColor: 'rgba(210, 139, 42, 0.16)',
  },
  stopOff: {
    opacity: 0.35,
  },
  stopText: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  stopTextOn: {
    color: INK.amberSoft,
  },
  pressed: {
    opacity: 0.6,
  },
  trackBox: {
    flex: 1,
    height: TRACK_HEIGHT,
    marginLeft: 4,
    justifyContent: 'center',
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(10, 10, 11, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
  },
  railActive: {
    borderColor: 'rgba(210, 139, 42, 0.55)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(210, 139, 42, 0.34)',
  },
  tick: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
    height: 9,
    backgroundColor: 'rgba(226, 222, 214, 0.22)',
  },
  knob: {
    position: 'absolute',
    width: KNOB_WIDTH,
    height: KNOB_HEIGHT,
    borderRadius: KNOB_WIDTH / 2,
    marginLeft: -KNOB_WIDTH / 2,
  },
  value: {
    width: 34,
    textAlign: 'right',
    color: INK.paperFaint,
    fontFamily: UI_MONO,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  valueOn: {
    color: INK.amberSoft,
  },
});
