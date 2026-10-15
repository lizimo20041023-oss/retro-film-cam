/**
 * 取景器底部那一条参数栏的**样子**：收拢态是三颗并排胶囊，展开态是一把刻度尺。
 *
 * 为什么手势和外观要拆成两个文件：这个文件里 **没有一行手势代码**。三颗胶囊的点击、
 * 长按、拖动全部由 `ParameterScrubBar` 的 `PanResponder` 在捕获阶段统一接管
 * （见那个文件第一段注释）。于是这里剩下的只有"某一刻该长什么样"，改视觉不会碰到
 * 手感、改手感不会碰到视觉。这条分界也是为什么这里没有 `Pressable` 的点击逻辑——
 * 真实触摸到不了它们（被上层响应器先接走），保留下来的 `onPress` 只服务 VoiceOver
 * 的"双击激活"通道。
 *
 * 为什么要保留三颗胶囊原来的图标与排版：液态玻璃改版是上一轮刚定的口径
 * （"玻璃要的是厚度，胶囊要的是浮在实时取景上"），这一轮只加交互、不换壳。
 * 三枚纯 View 画的线框图标（温度计 / 镜头 / 太阳）一个都没动。
 *
 * 两个状态为什么能"原地过渡"而不是各占一块地方：外壳（`ParameterScrubBar` 里的
 * `styles.shell`）**恒定 48pt 高、恒定 86% 屏宽**，两个状态都在这块区域里，靠
 * `opacity` + `scale` 交叉淡化切换（只动这两样，可以交给原生驱动，也不触发重排）。
 * 收拢态那三颗胶囊本来就只有 274pt 宽，放在 86% 的透明容器里居中，看起来与"自己撑开"
 * 完全一样——但换来了"展开时不会有任何东西上下跳一格"。
 */
import { memo, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { GLASS_TEXT_COLOR, glassTextShadow, LiquidGlassView } from './LiquidGlassView';
import { UI_MONO, useTheme } from '../constants/theme';
import { useI18n } from '../i18n';
import {
  CAPSULE_GAP,
  CAPSULE_HEIGHT,
  CAPSULE_WIDTH,
  DIAL_HEIGHT,
  MARK_GAP,
  MARK_MAJOR,
  MARK_MAJOR_ALPHA,
  MARK_MINOR,
  MARK_MINOR_ALPHA,
  POINTER_HEIGHT,
  POINTER_WIDTH,
  RULER_RANGE_PX,
  RULER_VIEWPORT_HEIGHT,
  formatScrubExposure,
  formatScrubTemperature,
} from './ParameterScrubBar';
import type { ScrubbableParameter } from './ParameterScrubBar';

/**
 * 展开用 160ms、收拢用 180ms。
 *
 * 为什么展开比收拢快：展开是对"用户按住不放"的即时回应，慢一点就会让人以为没按上；
 * 收拢前面已经等了 350ms（`COLLAPSE_DELAY_MS`），那 350ms 就是给"看清楚读数"的，
 * 之后的动效不该再拖——180ms 是"看得出是过渡、又不排队"的量级。
 * 两者都远短于 350ms，所以整条时间线永远是"手指先停、读数还看得见、然后才收"。
 */
const EXPAND_MS = 160;
const COLLAPSE_MS = 180;

/**
 * 刻度表铺多少根：`RULER_RANGE_PX / MARK_GAP` = 1600 / 8 = 200 根。
 *
 * 每 5 根一个主刻度（5 × 8 = 40px 一个周期）：40px 在 48pt 高的尺子里大约对应
 * "食指宽度的一半"，扫一眼就能数出自己在第几个周期，数太密会糊、太疏会失去位置感。
 */
const MARK_COUNT = Math.round(RULER_RANGE_PX / MARK_GAP);
const MARKS: readonly { readonly index: number; readonly x: number; readonly major: boolean }[] = Array.from(
  { length: MARK_COUNT + 1 },
  (_, index) => ({ index, x: index * MARK_GAP, major: index % 5 === 0 }),
);

/**
 * 刻度阵列。**单独成组件并且 `memo` 是本文件性能上最要紧的一处**：
 * 它唯一的 prop 是那个 `Animated.Value`（引用恒定），所以父级因为读数变化每 25ms
 * 重渲染一次时，这 200 根刻度一根都不会重新创建——否则 40Hz 下每秒会重建 8000 个
 * View，那就把"节流上报"省下来的预算又全花回去了。
 *
 * 用 `Animated.View` 的 `translateX` 绑 `scroll`：位移走原生/驱动层，不经过 React 的
 * 渲染，所以尺子本身是跟手的 60fps，而顶部那行数字是 40Hz——两条路径各按自己的
 * 需要跑，这正是规格要求的"刻度尺滚动与参数值同步分开"。
 */
const RulerStrip = memo(function RulerStrip({
  scroll,
  pointerColor,
}: {
  scroll: Animated.Value;
  pointerColor: string;
}) {
  return (
    <View style={styles.rulerClip}>
      <Animated.View style={[styles.marks, { transform: [{ translateX: scroll }] }]}>
        {MARKS.map((mark) => (
          <View
            key={mark.index}
            style={[styles.mark, mark.major ? styles.markMajor : styles.markMinor, { left: mark.x }]}
          />
        ))}
      </Animated.View>
      <View style={[styles.pointer, { backgroundColor: pointerColor }]} />
    </View>
  );
});

/** 温度计：一根管 + 一个球，纯 View 线框画法（不用 SVG，项目里没有这个依赖）。 */
function ThermoGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.thermoStem, { borderColor: color }]} />
      <View style={[styles.thermoBulb, { borderColor: color }]} />
      <View style={[styles.thermoCore, { backgroundColor: color }]} />
    </View>
  );
}

/** 镜头：同心圆。 */
function LensGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.lensRing, { borderColor: color }]} />
      <View style={[styles.lensCore, { backgroundColor: color }]} />
    </View>
  );
}

/** 太阳：圆 + 四根短线。 */
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

export interface ViewfinderBarProps {
  /** 当前展开着哪把尺子（null = 三颗胶囊）。由 `ParameterScrubBar` 的手势状态机给。 */
  active: ScrubbableParameter | null;
  /** 展开态顶部那行实时读数（已格式化好，如 `+0.28` / `35mm` / `-0.3`）。 */
  reading: string;
  /** 色温当前值（收拢态那颗胶囊自己显示，所以这里也要）。 */
  temperature: number;
  /** 当前等效焦距读数（毫米）。 */
  focalMm: number;
  /** 当前曝光补偿（EV）。 */
  exposure: number;
  /** 尺子位移。同一份 `Animated.Value` 由手势层写入、由 `RulerStrip` 读取。 */
  scroll: Animated.Value;
  /** 焦段胶囊的双击语义：跳到下一个标准位。 */
  onCycleFocal: () => void;
  /** 色温/曝光胶囊的双击语义：归零（与手指短按同一套规则）。 */
  onReset: (dial: 'wb' | 'ev') => void;
  /** 无障碍的 increment / decrement（每次一格）。 */
  onAdjust: (dial: ScrubbableParameter, direction: 1 | -1) => void;
}

function ViewfinderBarInner({
  active,
  reading,
  temperature,
  focalMm,
  exposure,
  scroll,
  onCycleFocal,
  onReset,
  onAdjust,
}: ViewfinderBarProps) {
  const { t } = useI18n();
  const { ink } = useTheme();

  /**
   * 交叉淡化的进度：0 = 三颗胶囊，1 = 一把尺子。
   *
   * 初值直接按当前状态给，避免"首帧先淡入一次"——首帧做动画在真机上就是一个可见的闪。
   */
  const expand = useRef(new Animated.Value(active === null ? 0 : 1)).current;
  /**
   * 尺子是否挂在树上。
   *
   * 为什么要单独一个 state：200 根刻度在收拢态是纯粹的白开销（每一帧都要走一遍布局），
   * 所以收拢完成后就把它整个摘掉；但收拢动画的 180ms 里它必须还在（否则会"啪"地消失）。
   * 于是它由动画的完成回调来关，而不是由 `active` 直接决定。
   */
  const [dialMounted, setDialMounted] = useState(active !== null);

  useEffect(() => {
    if (active !== null) {
      setDialMounted(true);
      Animated.timing(expand, {
        toValue: 1,
        duration: EXPAND_MS,
        // 出场用 ease-out：开头快、结尾稳，读起来像"东西就位了"
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(expand, {
      toValue: 0,
      duration: COLLAPSE_MS,
      // 收场用 ease-in：慢慢离开视线，不抢注意力
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      // `finished` 为 false 说明这不是终点（又被展开了），那就不要摘
      if (finished) {
        setDialMounted(false);
      }
    });
  }, [active, expand]);

  const collapsedOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // 缩到 0.94 而不是 0.6：胶囊是"原地让位"，不是"飞走"
  const collapsedScale = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  // 尺子从 1.03 收到 1：1.03 的起点刚好让"玻璃从胶囊里长出来"这句读得通
  const dialScale = expand.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });

  const temperatureText = formatScrubTemperature(temperature);
  const focalText = `${focalMm}mm`;
  const exposureText = formatScrubExposure(exposure);

  const dialName = active === 'wb' ? t('camera.bar.temp') : active === 'ev' ? t('camera.bar.ev') : t('camera.bar.focal');
  // `EV` 这个单位不放进格式化函数里：`formatScrubExposure` 与 `FocusExposure.formatExposure`
  // 是同一个口径（纯数值），单位属于"这一行怎么展示"，归视图层管
  const readingText = active === 'ev' ? `${reading} EV` : reading;

  /**
   * 三颗胶囊共用的外壳属性：定宽、玻璃圆角、按下反馈。
   *
   * 色温与曝光的"轻点"都是**一键归零**（规格 §1）。色温这颗在本轮之前是"点开底片抽屉"，
   * 现在让位给归零：底片抽屉的主入口一直是控制台右侧那颗底片按钮
   * （`CameraScreen.tsx` 的 `DialButton`，`onPress={handleOpenFilmDrawer}`），胶囊只是重复了一遍；
   * 而"拧歪了色温想回到中性"在旧版无路可走 —— 短按一下就到，还能顺着 0.00 的磁吸找到它。
   *
   * `hint` 一律不传：现有键 `camera.bar.ev.hint` 写的是"上下滑动调整曝光"，那是**旧版竖直拖**
   * 的说法，与本轮"长按展开刻度尺后横向滑"完全不是一回事。宁可不给提示，也不给一句错的提示
   * ——缺的那句提示（"长按滑动调整，轻点归零"）已写进交付报告，等 i18n 补键。
   */
  const capsules: readonly {
    readonly dial: ScrubbableParameter;
    readonly glyph: ReactElement;
    readonly value: string;
    readonly label: string;
    readonly onPress: () => void;
  }[] = [
    {
      dial: 'wb',
      glyph: <ThermoGlyph color={GLASS_TEXT_COLOR} />,
      value: temperatureText,
      label: t('camera.bar.temp.a11y', { label: temperatureText }),
      onPress: () => onReset('wb'),
    },
    {
      dial: 'zoom',
      glyph: <LensGlyph color={GLASS_TEXT_COLOR} />,
      value: focalText,
      label: t('camera.bar.focal.a11y', { label: focalText }),
      onPress: onCycleFocal,
    },
    {
      dial: 'ev',
      glyph: <SunGlyph color={GLASS_TEXT_COLOR} />,
      value: exposureText,
      label: t('camera.bar.ev.a11y', { value: exposureText }),
      onPress: () => onReset('ev'),
    },
  ];

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.collapsedLayer, { opacity: collapsedOpacity, transform: [{ scale: collapsedScale }] }]}
        pointerEvents="box-none"
      >
        <View style={styles.row}>
          {capsules.map((capsule) => (
            <LiquidGlassView
              key={capsule.dial}
              radius={CAPSULE_HEIGHT / 2}
              style={styles.capsule}
              accessible
              accessibilityRole="button"
              accessibilityLabel={capsule.label}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => {
                const action = event.nativeEvent.actionName;
                if (action === 'increment') {
                  onAdjust(capsule.dial, 1);
                } else if (action === 'decrement') {
                  onAdjust(capsule.dial, -1);
                }
              }}
            >
              {/*
                真实触摸由上层响应器在捕获阶段接走，所以这里的 `onPress` 实际上只服务
                VoiceOver 的"双击激活"那条通道；`pressed` 的 0.6 反馈在手指路径上看不到，
                但 VoiceOver 聚焦时仍然有用。
              */}
              <Pressable style={({ pressed }) => [styles.press, pressed ? styles.pressed : null]} onPress={capsule.onPress}>
                {capsule.glyph}
                <Text style={[styles.value, { color: GLASS_TEXT_COLOR }]} allowFontScaling={false}>
                  {capsule.value}
                </Text>
              </Pressable>
            </LiquidGlassView>
          ))}
        </View>
      </Animated.View>

      {dialMounted ? (
        <Animated.View style={[styles.dialLayer, { opacity: expand, transform: [{ scale: dialScale }] }]}>
          <LiquidGlassView
            radius={DIAL_HEIGHT / 2}
            style={styles.dial}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={dialName}
            accessibilityValue={{ text: readingText }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => {
              if (active === null) {
                return;
              }
              const action = event.nativeEvent.actionName;
              if (action === 'increment') {
                onAdjust(active, 1);
              } else if (action === 'decrement') {
                onAdjust(active, -1);
              }
            }}
          >
            <View style={styles.head}>
              <Text style={[styles.name, { color: ink.amber }]} allowFontScaling={false}>
                {dialName}
              </Text>
              <Text style={[styles.reading, { color: ink.amber }]} allowFontScaling={false}>
                {readingText}
              </Text>
            </View>
            <RulerStrip scroll={scroll} pointerColor={ink.amber} />
          </LiquidGlassView>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * `memo` 的理由：父级为了 25ms 一次地把参数同步出去会频繁重渲染，而本组件的 props
 * 全是原始值 + 稳定回调 + 一个引用恒定的 `Animated.Value`——参数没变的那些次渲染
 * 全都可以直接跳过（三颗胶囊的玻璃、200 根刻度都不该跟着重建）。
 */
export const ViewfinderBar = memo(ViewfinderBarInner);

const styles = StyleSheet.create({
  /** 铺满外壳那块 86% × 48 的区域：收拢态在里面居中，展开态整块被玻璃占满。 */
  root: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 收拢态绝对定位：这样它不参与展开态的布局，两个状态互不挤压。 */
  collapsedLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: CAPSULE_GAP,
  },
  /**
   * 胶囊本体只给几何，圆角与底色归玻璃（`radius` 传 `CAPSULE_HEIGHT / 2`）。
   * 定宽见 `ParameterScrubBar.CAPSULE_WIDTH` 的注释：命中区要靠它静态算出来。
   */
  capsule: {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    paddingHorizontal: 8,
  },
  press: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  dialLayer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  /**
   * 展开态那块玻璃：高 48（`DIAL_HEIGHT`），上下各 5pt 内边距，中间一行读数 + 一条尺子。
   * 不写圆角 —— 圆角是 `LiquidGlassView` 的 `radius` 参数，写在这里会多一层没人读的样式。
   */
  dial: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: 'space-between',
  },
  head: {
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /** 名称：小字号、宽字距，起"标签"作用（与旧胶囊的 `styles.word` 同一口径）。 */
  name: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    ...glassTextShadow,
  },
  /** 读数：等宽字体，跟着手势每 25ms 变一次，所以字号比名称大一档好读。 */
  reading: {
    fontFamily: UI_MONO,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    ...glassTextShadow,
  },
  /** 尺窗：裁掉阵列多出来的部分。指针在里面自由站着，所以不用 `overflow` 之外的技巧。 */
  rulerClip: {
    height: RULER_VIEWPORT_HEIGHT,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  /**
   * 刻度阵列：一行绝对定位的细线。宽 `RULER_RANGE_PX`（1600），被 `scroll` 推着走。
   * 位置全部写死成 `left`，因为它们的 x 在模块加载时就算好了（`MARKS`）。
   */
  marks: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: RULER_RANGE_PX,
  },
  mark: {
    position: 'absolute',
    bottom: 0,
    width: 1,
  },
  /**
   * 主/次刻度：只有高度与透明度不同，颜色都是纯白（`GLASS_TEXT_COLOR`）。
   * 白色不走 `useTheme()` 是有意的：刻度是"浮在实时取景上的白线"，
   * 与机身深浅无关（与 `DialButton` / `ToolRow` 里那些图标同一个理由）。
   * 琥珀色的那两个（指针、读数）才必须是主题色 —— 它们要传达"当前参数"这层语义。
   */
  markMajor: {
    height: MARK_MAJOR,
    opacity: MARK_MAJOR_ALPHA,
    backgroundColor: GLASS_TEXT_COLOR,
  },
  markMinor: {
    height: MARK_MINOR,
    opacity: MARK_MINOR_ALPHA,
    backgroundColor: GLASS_TEXT_COLOR,
  },
  /** 静止基准针：钉在尺窗正中，颜色由调用方给（`ink.amber`）。 */
  pointer: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -POINTER_WIDTH / 2,
    width: POINTER_WIDTH,
    height: POINTER_HEIGHT,
  },
  /** 图标外的 2pt 暗晕：白线压在天空这类亮背景上时靠它保命（与旧版一致）。 */
  glyph: {
    width: 13,
    height: 13,
    shadowColor: 'rgba(0, 0, 0, 0.65)',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 2,
    shadowOpacity: 1,
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
  /** 胶囊里的读数：11pt 等宽 + 0.4 字距，正好塞进 86pt 定宽（`+0.28` 约 33pt）。 */
  value: {
    fontFamily: UI_MONO,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginLeft: 5,
    ...glassTextShadow,
  },
});
