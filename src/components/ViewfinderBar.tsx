/**
 * 悬浮胶囊行：色温 / 焦段 / 曝光。
 *
 * 为什么这三颗放在取景器里面，而不是下面的控制台：它们回答的是"这一张会拍成什么样"
 * （风格、视场、亮度），视线不必离开画面；下面的图标行回答的是"我要做什么动作"。
 * 把"看结果"和"做动作"混在同一排，用户每次调曝光都要先把视线移到屏幕外。
 *
 * 为什么曝光胶囊的调节长在胶囊自己身上、而不是"拖进 §二 的滑块"：那个滑块只在点按对焦
 * 之后的 3 秒里存在。胶囊若依赖它，绝大部分时间按上去是没有反应的死键。
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useI18n } from '../i18n';
import { UI_MONO, useTheme } from '../constants/theme';
import { EXPOSURE_MAX, EXPOSURE_MIN, EXPOSURE_STEP, formatExposure } from './FocusExposure';

/** 在胶囊上拖满整个 -2 ~ +2 需要的手指行程（pt）。太短会一碰就到底，太长则一次调不完。 */
const DRAG_SPAN = 150;
/** 超过这个位移才算"在拖"：否则手指的天然抖动会把轻点（归零）吃掉。 */
const DRAG_THRESHOLD = 4;
const STEP_LIMIT = Math.round(EXPOSURE_MAX / EXPOSURE_STEP);

/**
 * 色温倾向：带符号的两位小数。
 *
 * 为什么不做成"暖/冷"这种词：语言包里根本没有这两个词（只有 `gradeLayers.ts` 里一句写死的
 * 中文调试标签），而新增 i18n 键不归我。数字是语言中立的，而且和胶卷本身一样是"参数"。
 */
export function formatTemperature(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  const clamped = Math.max(-1, Math.min(1, value));
  if (Math.abs(clamped) < 0.005) {
    return '0.00';
  }
  return `${clamped > 0 ? '+' : '-'}${Math.abs(clamped).toFixed(2)}`;
}

export interface ViewfinderBarProps {
  /** 当前胶卷的色温倾向（-1 ~ 1，正数偏暖）。 */
  temperature: number;
  /** 当前等效焦距（毫米）。 */
  focalMm: number;
  exposure: number;
  onPickFilm: () => void;
  onCycleFocal: () => void;
  onExposure: (exposure: number) => void;
}

function ViewfinderBarInner({
  temperature,
  focalMm,
  exposure,
  onPickFilm,
  onCycleFocal,
  onExposure,
}: ViewfinderBarProps) {
  const { glass, glassBorder, ink } = useTheme();
  const { t } = useI18n();
  const startExposure = useRef(0);
  const lastStep = useRef(0);

  // PanResponder 只建一次，读不到最新 props —— 和 `usePinchZoom` 一样镜像进 ref
  const latest = useRef({ exposure, onExposure });
  useEffect(() => {
    latest.current = { exposure, onExposure };
  });

  const drag = useMemo(
    () =>
      PanResponder.create({
        // 按下不接管：轻点是"归零"，那是 Pressable 的活
        onStartShouldSetPanResponder: () => false,
        /**
         * 明确在上下走了才抢，而且必须在**捕获**阶段抢：胶囊里面是 Pressable，
         * 等冒泡上来时它已经把这次触摸认领成"点击"了，一次拖动就会变成一次误触的归零。
         */
        onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > DRAG_THRESHOLD,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startExposure.current = latest.current.exposure;
          lastStep.current = Math.round(latest.current.exposure / EXPOSURE_STEP);
        },
        onPanResponderMove: (_event, gesture) => {
          const raw = startExposure.current - (gesture.dy / DRAG_SPAN) * (EXPOSURE_MAX - EXPOSURE_MIN);
          const steps = Math.max(-STEP_LIMIT, Math.min(STEP_LIMIT, Math.round(raw / EXPOSURE_STEP)));
          if (steps === lastStep.current) {
            return;
          }
          lastStep.current = steps;
          void Haptics.selectionAsync();
          latest.current.onExposure(Number((steps / 3).toFixed(3)));
        },
      }),
    [],
  );

  const handleReset = useCallback(() => {
    if (latest.current.exposure === 0) {
      return;
    }
    void Haptics.selectionAsync();
    latest.current.onExposure(0);
  }, []);

  const adjust = useCallback((direction: 1 | -1) => {
    void Haptics.selectionAsync();
    latest.current.onExposure(
      Math.max(
        EXPOSURE_MIN,
        Math.min(EXPOSURE_MAX, Number(((Math.round(latest.current.exposure / EXPOSURE_STEP) + direction) / 3).toFixed(3))),
      ),
    );
  }, []);

  const temperatureText = formatTemperature(temperature);
  const focalText = `${Math.round(focalMm)}mm`;
  const exposureText = formatExposure(exposure);
  const capsule = [styles.capsule, { backgroundColor: glass, borderColor: glassBorder }];

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPickFilm}
        accessibilityRole="button"
        accessibilityLabel={t('camera.bar.temp.a11y', { label: temperatureText })}
        style={({ pressed }) => [capsule, pressed && styles.pressed]}
      >
        <ThermoGlyph color={ink.paperDim} />
        <Text style={[styles.value, { color: ink.paper }]} allowFontScaling={false}>
          {temperatureText}
        </Text>
        <Text style={[styles.word, { color: ink.paperDim }]} allowFontScaling={false}>
          {t('camera.bar.temp')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onCycleFocal}
        accessibilityRole="button"
        accessibilityLabel={t('camera.bar.focal.a11y', { label: focalText })}
        style={({ pressed }) => [capsule, pressed && styles.pressed]}
      >
        <LensGlyph color={ink.paperDim} />
        <Text style={[styles.value, { color: ink.paper }]} allowFontScaling={false}>
          {focalText}
        </Text>
        <Text style={[styles.word, { color: ink.paperDim }]} allowFontScaling={false}>
          {t('camera.bar.focal')}
        </Text>
      </Pressable>

      <View {...drag.panHandlers}>
        <Pressable
          onPress={handleReset}
          accessibilityRole="adjustable"
          accessibilityLabel={t('camera.bar.ev.a11y', { value: exposureText })}
          accessibilityHint={t('camera.bar.ev.hint')}
          accessibilityValue={{ text: exposureText }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName;
            if (action === 'increment') {
              adjust(1);
            } else if (action === 'decrement') {
              adjust(-1);
            }
          }}
          style={({ pressed }) => [capsule, pressed && styles.pressed]}
        >
          <SunGlyph color={ink.paperDim} />
          <Text style={[styles.value, { color: ink.paper }]} allowFontScaling={false}>
            {exposureText}
          </Text>
          <Text style={[styles.word, { color: ink.paperDim }]} allowFontScaling={false}>
            {t('camera.bar.ev')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * `memo`：拖 EV 会每秒几十次地更新父级 state，这一排的 props 全是原始值 + 稳定回调，
 * 不该跟着重渲染（重渲染三颗胶囊就是三次 Yoga 布局）。
 */
export const ViewfinderBar = memo(ViewfinderBarInner);

/* ---------------------------------------------------------------------------
 * 图标：语言包之外的东西用线条画。用 emoji（🌡️ / ☀️）会在 iOS 上渲染成彩色图形，
 * 和这套"安静的等宽仪表"完全不是一个世界，所以全部拆成 1pt 的框和线。
 * ------------------------------------------------------------------------ */

function ThermoGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.thermoStem, { borderColor: color }]} />
      <View style={[styles.thermoBulb, { borderColor: color }]} />
      <View style={[styles.thermoCore, { backgroundColor: color }]} />
    </View>
  );
}

function LensGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.lensRing, { borderColor: color }]} />
      <View style={[styles.lensCore, { backgroundColor: color }]} />
    </View>
  );
}

function SunGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.sunRing, { borderColor: color }]} />
      <View style={[styles.sunRayTop, { backgroundColor: color }]} />
      <View style={[styles.sunRayBottom, { backgroundColor: color }]} />
      <View style={[styles.sunRayLeft, { backgroundColor: color }]} />
      <View style={[styles.sunRayRight, { backgroundColor: color }]} />
    </View>
  );
}

// 只放几何：颜色现取，模块级配色会把深浅色切换冻在首次渲染那一刻。
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
  },
  value: {
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 0.4,
    marginLeft: 5,
  },
  word: {
    fontSize: 9,
    letterSpacing: 1,
    marginLeft: 5,
  },
  pressed: {
    opacity: 0.6,
  },
  glyph: {
    width: 13,
    height: 13,
  },
  thermoStem: {
    position: 'absolute',
    left: 4.5,
    top: 0,
    width: 4,
    height: 10,
    borderWidth: 1,
    borderRadius: 2,
  },
  thermoBulb: {
    position: 'absolute',
    left: 3,
    top: 5,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderRadius: 3.5,
  },
  thermoCore: {
    position: 'absolute',
    left: 5.5,
    top: 7.5,
    width: 2,
    height: 2,
    borderRadius: 1,
  },
  lensRing: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 9,
    height: 9,
    borderWidth: 1,
    borderRadius: 4.5,
  },
  lensCore: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  sunRing: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderRadius: 3.5,
  },
  sunRayTop: { position: 'absolute', left: 6, top: 0, width: 1, height: 2 },
  sunRayBottom: { position: 'absolute', left: 6, top: 11, width: 1, height: 2 },
  sunRayLeft: { position: 'absolute', left: 0, top: 6, width: 2, height: 1 },
  sunRayRight: { position: 'absolute', left: 11, top: 6, width: 2, height: 1 },
});
