/**
 * LiquidGlassView —— iOS 26「液态玻璃」材质的**唯一**实现。
 *
 * ## 为什么只有一个组件
 *
 * 这份材质有三层，缺一层就不是液态玻璃而是"半透明方块"：
 *
 *   1. **底层实时模糊** `BlurView`（`UIVisualEffectView`）+ 一层通透底色；
 *   2. **边缘折射环**：45° 斜向的水滴透镜折射，左上受光最亮、右下反光次之；
 *   3. **顶部内高光** 0.5px 的内发光线 —— 它才是"这块玻璃有厚度"的那一笔。
 *
 * 三个胶囊、工具栏、镂空遮罩、次级按钮全部走这一个组件，是为了让"玻璃的厚度"
 * 在整屏里**只有一个定义**。上一版的问题是每一处各写各的 `rgba(255,255,255,0.08)`
 * 加一条 1px 描边，结果四块面板的透明度和描边亮度各不相同，看上去像四种材料。
 *
 * ## 为什么不用 `MaskedView`
 *
 * 规格允许「MaskedView 或四周拼接」。这里选**四周拼接**，因为它不需要
 * `@react-native-masked-view/masked-view` 这个原生依赖 —— 少一个依赖就少一次
 * 原生构建失败的机会，而效果完全一样：镂空区本来就是一块矩形，
 * 用四块玻璃围出来和用一张挖了洞的遮罩没有区别。
 *
 * ## 边缘折射环怎么画成"只有 1px"
 *
 * 没有遮罩就没法把渐变只留在边上。这里的办法是**两层错位**：
 * 外层铺满整块渐变，内层（玻璃本体）向内缩 `RIM`，于是渐变只在最外一圈露出来。
 * 好处是连带圆角一起天然正确 —— 内层的圆角半径写 `radius - RIM`，两条弧线同心。
 *
 * ## 两种机身怎么适配
 *
 * 模糊材质与通透底色跟着 `useTheme()` 走（深色机身配 `...MaterialDark` + 深底，
 * 浅色机身配 `...MaterialLight` + 浅底）。**折射环永远是白的**，不跟随机身 ——
 * 它模拟的是玻璃边缘对**背后画面**的折射，而取景器背后永远是相机实拍画面，
 * 深浅色主题改变不了那束光。
 *
 * ## ⚠️ 一条没能在本机验证的风险
 *
 * `UIVisualEffectView` 是否真的会采样 `AVCaptureVideoPreviewLayer`（相机预览）在
 * iOS 上是有争议的：预览层是硬件合成路径，模糊视图有可能采到一片黑。
 * 所以 `overlay` 的默认透明度是按「**模糊完全不生效也要好看**」定的 ——
 * 0.42 的深底压在实时画面上，即使模糊退化成纯色，胶囊与遮罩依然是可读的深玻璃，
 * 而不是一块黑洞。真机确认模糊生效之后可以再往下调这个值。
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ColorValue, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../constants/theme';

/** 边缘折射环的线宽。规格写的是 1px。 */
const RIM = 1;

/**
 * 顶部内高光的线宽。规格写的是 0.5px。
 * RN 的尺寸是逻辑点，0.5pt 在 3x 屏上正好落成 1.5 个物理像素 ——
 * 比 1pt（3 物理像素）更像"一条发光线"而不是"一条边"。
 */
const HIGHLIGHT = 0.5;

/**
 * 45° 斜向折射的三个色标：左上受光面、中段过渡、右下反光面。
 * 与 `start={{x:0,y:0}} end={{x:1,y:1}}` 一起构成"左上打光"的水滴透镜。
 */
const RIM_COLORS = [
  'rgba(255, 255, 255, 0.6)',
  'rgba(255, 255, 255, 0.1)',
  'rgba(255, 255, 255, 0.32)',
] as const;

/** 顶部内高光的颜色。 */
const HIGHLIGHT_COLOR = 'rgba(255, 255, 255, 0.4)';

/** 深色机身的通透底色（规格给的 18,18,22）。 */
const OVERLAY_DARK = 'rgba(18, 18, 22, 0.42)';

/**
 * 浅色机身的通透底色。
 * 刻意**不是**深底配浅字的镜像 —— 浅色机身下玻璃浮在浅色界面上，
 * 用深底会让底下的炭黑文字变成黑底黑字。用白底 + 稍高的不透明度保住对比度。
 */
const OVERLAY_LIGHT = 'rgba(255, 255, 255, 0.52)';

/** 玻璃面上的文字颜色。规格要求强制纯白。 */
export const GLASS_TEXT_COLOR = '#FFFFFF';

/**
 * 玻璃面上文字的暗底阴影。
 *
 * 为什么必须有：文字浮在**实时取景画面**上，背景亮度不可控 ——
 * 白色小字压在一片过曝的天空上会直接消失。加一层 2pt 的暗晕之后，
 * 无论背后是雪地还是夜景，"焦段 26mm"都能读出来。
 */
export const glassTextShadow = {
  textShadowColor: 'rgba(0, 0, 0, 0.65)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 2,
} as const;

export interface LiquidGlassViewProps extends ViewProps {
  /** 圆角半径。胶囊传高度的一半。 */
  radius?: number;
  /** 强制指定模糊材质。不传则跟随机身深浅色。 */
  tint?: BlurTint;
  /** 模糊强度 1~100。 */
  intensity?: number;
  /**
   * 通透底色。不传则跟随机身。
   * 传 `'transparent'` 可以只要模糊、不要底色（只在真机确认模糊生效之后再这么用）。
   */
  overlay?: ColorValue;
  /**
   * 关掉边缘折射环。
   * 大面积遮罩用不着 —— 一块 400×600 的面上画 1px 的环，环会缩到看不见，
   * 却要多画一次全屏渐变。工具栏那种贴边的地方也建议关掉，避免和屏幕边缘打架。
   */
  rim?: boolean;
  /** 关掉顶部内高光。视觉上"没有厚度"的薄片（比如分隔条）才关。 */
  highlight?: boolean;
  /**
   * 显式描边色（v1.8.3 · D1）。不传 = 不画描边。
   *
   * 为什么需要它：工具行那六枚圆盘要有一条**不随系统深浅色变**的 1pt 白描边
   * （规格 `rgba(255, 255, 255, 0.28)`）。折射环虽然也是白的，但它从左上到右下
   * 亮度不均、宽度只有 1pt，浅色系统下会被白底吃掉 —— 这条描边是保证"圆盘永远有界"的方案。
   */
  borderColor?: ColorValue;
  /** 描边线宽，默认 1pt（规格写的是 1px）。 */
  borderWidth?: number;
}

function LiquidGlassViewInner({
  radius = 0,
  tint,
  intensity = 75,
  overlay,
  rim = true,
  highlight = true,
  borderColor,
  borderWidth = 1,
  style,
  children,
  ...rest
}: LiquidGlassViewProps) {
  const theme = useTheme();
  const dark = theme.scheme === 'dark';

  const resolvedTint: BlurTint = tint ?? (dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight');
  const resolvedOverlay: ColorValue = overlay ?? (dark ? OVERLAY_DARK : OVERLAY_LIGHT);

  /** 玻璃本体向内缩 RIM，给折射环让出那 1px。 */
  const inset = rim ? RIM : 0;
  const innerRadius = Math.max(0, radius - inset);

  return (
    <View style={[style, { borderRadius: radius }]} {...rest}>
      {rim ? (
        // 整块铺满渐变。真正露出来的只有被内层让出来的那一圈 —— 见文件头"两层错位"。
        <LinearGradient
          colors={RIM_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
      ) : null}

      <View
        style={[styles.glassLayer, { top: inset, left: inset, right: inset, bottom: inset, borderRadius: innerRadius }]}
        pointerEvents="none"
      >
        <BlurView tint={resolvedTint} intensity={intensity} style={styles.fill} />
        <View style={[styles.fill, { backgroundColor: resolvedOverlay }]} />
        {highlight ? (
          // 左右各让开 60% 的圆角半径：不让的话这条线会画到圆弧外面去，
          // 在胶囊上表现为两个凸出来的小白点。
          <View
            style={[
              styles.highlight,
              { left: radius * 0.6, right: radius * 0.6, backgroundColor: HIGHLIGHT_COLOR },
            ]}
          />
        ) : null}
      </View>

      {children}

      {/*
        显式描边画在**内容之上**：它是一条"盘子边界"，不该被盘里的图标/色块盖住。
        铺满整块玻璃 + 同样的圆角，把 border 全落在最外圈 —— 与 `rim` 的折射环
        叠在一起时，环在内、描边在外，两道都在最外 1pt 里，不会把盘子撑大。
      */}
      {borderColor === undefined ? null : (
        <View
          style={[styles.border, { borderRadius: radius, borderWidth, borderColor }]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

export const LiquidGlassView = memo(LiquidGlassViewInner);

/*
 * RN 0.86 移除了 `StyleSheet.absoluteFillObject`（只剩注册过的 `absoluteFill`，
 * 那是个不能展开的数字 ID），所以"铺满父容器"这四个属性只能自己写。
 * 全仓同一个坑已经在 DialButton / ShutterButton / FilmDrawer / SettingsScreen /
 * GalleryScreen 各踩过一次，别再写 `...StyleSheet.absoluteFillObject`。
 */
const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  fill: FILL,
  border: FILL,
  glassLayer: {
    position: 'absolute',
    // 玻璃本体自己裁圆角：模糊和底色都是矩形，不裁的话四个角会露出方形色块。
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    height: HIGHLIGHT,
  },
});
