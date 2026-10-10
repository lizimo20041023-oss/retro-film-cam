/**
 * 合成视图 —— 整个 App 的"显影"画面，同时也是 `captureRef` 的截图目标。
 *
 * 绘制顺序（也就是最终成片的图层顺序）：
 *   ① 画面窗口（overflow: hidden）
 *        · 原照片（cover / contain）
 *        · 调色图层（纯色层 / 同图自叠 / 纹理层，全部用 mixBlendMode 混合）
 *   ② 相框 PNG（resizeMode="stretch" 铺满整个合成舞台，透明处露出照片）
 *   ③ 日期水印（永远画在最后：烧在画面内部时相框在那里是透明的，
 *      烧在相框留白里时必须盖在相框之上，所以两种锚点都放最后最安全）
 *   ④ 定位水印（左下角，和日期同一条基线；这张没拿到定位就整块不画 ——
 *      绝不留一行"定位失败"，那是 UI 该说的话，不该烧进照片里）
 *
 * 为什么调色层要关在 `overflow: 'hidden'` 的窗口容器里？
 * RN 没有现成的 `isolation` 便捷写法可用（它是 layout prop 不是 style prop，写错会静默失效），
 * 而 `overflow: 'hidden'` 本身就建立了裁剪与合成边界：混合只发生在窗口内部、
 * 只跟底下的照片混，既不会溢出到相框上，也不会混到取景器背景。
 *
 * 关于截图尺寸：`ViewShot` 的 options 里**故意不传 width/height**，
 * 这样输出像素 = 这里的逻辑尺寸 × PixelRatio（官方原话：不传就是原始像素尺寸），
 * 也就是"屏幕上多大，成片就多清晰"，不会因为放大而变糊。
 */
import { useMemo } from 'react';
import type { RefObject } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { textureSource } from '../constants/textures';
import type { FilmStageInput, GradeLayer } from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';
import { planCapture } from '../utils/captureOptions';
import { computeLocationLayout, computeTimestampLayout, resolveTimestampAnchor } from '../utils/geometry';
import { buildGradeLayers } from '../utils/gradeLayers';

export interface FilmCompositorProps {
  /** 要合成的一切数据（由 `useFilmStage` 提供）。 */
  stage: FilmStageInput;
  /** 截图用的 ref（宿主持有，截图时直接 `ref.current.capture()`）。 */
  viewShotRef: RefObject<ViewShotRef | null>;
  /** 布局完成 → 通知宿主"可以进入就绪判断了"。 */
  onLayout: () => void;
  /** 每张图片 onLoad → 通知宿主编解码进度。**只挂在照片 / 相框 / 纹理上**。 */
  onImageLoad: () => void;
  /** 系统等宽字体兜底（预设里指定的 fontFamily 优先）。 */
  timestampFontFamily: string;
  style?: StyleProp<ViewStyle>;
}

export function FilmCompositor({
  stage,
  viewShotRef,
  onLayout,
  onImageLoad,
  timestampFontFamily,
  style,
}: FilmCompositorProps) {
  const { layout, preset, frame, rawUri, capturedAt, locationText } = stage;

  // 调色层：纯函数算出来的声明式图层，渲染层只按 kind 分发
  const layers = useMemo(() => buildGradeLayers(preset), [preset]);

  // 截图尺寸：预设的 captureLongEdge 决定成片长边有多少像素
  const captureOptions = useMemo(
    () =>
      planCapture({
        width: layout.width,
        height: layout.height,
        targetLongEdge: preset.captureLongEdge,
      }).options,
    [layout.width, layout.height, preset.captureLongEdge],
  );

  const anchor = useMemo(
    () => resolveTimestampAnchor(frame, preset.timestamp),
    [frame, preset.timestamp],
  );
  const timestampLayout = useMemo(
    () => computeTimestampLayout(layout, preset.timestamp, anchor),
    [layout, preset.timestamp, anchor],
  );
  const timestampText = preset.timestamp.enabled
    ? formatTimestamp(capturedAt, preset.timestamp.format)
    : '';

  // 定位水印：空串 / 全空格 / 没传 = 这张不写定位
  const locationLine = typeof locationText === 'string' ? locationText.trim() : '';
  const locationLayout = useMemo(
    () => computeLocationLayout(layout, preset.timestamp, anchor),
    [layout, preset.timestamp, anchor],
  );

  return (
    <ViewShot
      // 截图目标：iOS 的 renderInContext 要求视图真的在屏幕上（CameraScreen 会铺一层显影遮罩挡住它）
      ref={viewShotRef}
      options={captureOptions}
      // 不用也不能传 collapsable：ViewShot 组件内部已经写死 collapsable={false}
      // （防止 Android 展平这个视图导致截不到），而且它不透传任何未声明的 props。
      style={[styles.stage, { width: layout.width, height: layout.height }, style]}
      onLayout={onLayout}
    >
      {/* ① 画面窗口 */}
      <View
        style={[
          styles.window,
          {
            left: layout.window.left,
            top: layout.window.top,
            width: layout.window.width,
            height: layout.window.height,
          },
        ]}
      >
        <Image
          source={{ uri: rawUri }}
          style={styles.fill}
          resizeMode={frame.photoFit === 'contain' ? 'contain' : 'cover'}
          onLoad={onImageLoad}
          fadeDuration={0}
        />
        {layers.map((layer) => (
          <GradeLayerView
            key={layer.key}
            layer={layer}
            rawUri={rawUri}
            photoFit={frame.photoFit === 'contain' ? 'contain' : 'cover'}
            onImageLoad={onImageLoad}
          />
        ))}
      </View>

      {/* ② 相框 */}
      <Image
        source={frame.source}
        style={[styles.frame, { width: layout.width, height: layout.height }]}
        resizeMode="stretch"
        onLoad={onImageLoad}
        fadeDuration={0}
      />

      {/* ③ 日期水印 */}
      {timestampText.length > 0 ? (
        <Text
          allowFontScaling={false}
          style={[
            styles.timestamp,
            {
              right: timestampLayout.right,
              bottom: timestampLayout.bottom,
              color: preset.timestamp.color,
              fontSize: timestampLayout.fontSize,
              letterSpacing: timestampLayout.letterSpacing,
              fontFamily: preset.timestamp.fontFamily ?? timestampFontFamily,
              fontWeight: preset.timestamp.fontWeight,
              // 液晶辉光：同色 textShadow（比嵌套 Text 便宜）
              textShadowColor: preset.timestamp.glow ? preset.timestamp.color : 'transparent',
              textShadowRadius: preset.timestamp.glow
                ? Math.max(3, Math.round(timestampLayout.fontSize * 0.45))
                : 0,
              textShadowOffset: { width: 0, height: 0 },
            },
          ]}
        >
          {timestampText}
        </Text>
      ) : null}

      {/* ④ 定位水印（左下角） */}
      {locationLine.length > 0 ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.location,
            {
              left: locationLayout.left,
              bottom: locationLayout.bottom,
              fontSize: locationLayout.fontSize,
              letterSpacing: locationLayout.letterSpacing,
              fontFamily: preset.timestamp.fontFamily ?? timestampFontFamily,
              fontWeight: preset.timestamp.fontWeight,
            },
          ]}
        >
          {locationLine}
        </Text>
      ) : null}
    </ViewShot>
  );
}

interface GradeLayerViewProps {
  layer: GradeLayer;
  rawUri: string;
  photoFit: 'cover' | 'contain';
  onImageLoad: () => void;
}

/** 单个调色图层：只按 `kind` 分发，不认识"预设"这个概念。 */
function GradeLayerView({ layer, rawUri, photoFit, onImageLoad }: GradeLayerViewProps) {
  if (layer.kind === 'color') {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.fill,
          {
            backgroundColor: layer.color,
            mixBlendMode: layer.blendMode,
            opacity: layer.opacity,
          },
        ]}
      />
    );
  }

  if (layer.kind === 'photo') {
    // 同图自叠：提对比度。（**不挂 onImageLoad**：它和底图是同一张，不参与就绪计数）
    //
    // 为什么用 View 包一层而不是把 mixBlendMode 写在 Image 上：
    // RN 0.86 把 mixBlendMode 只声明在 ViewStyle 里，ImageStyle 没有这个属性。
    // 而混合的语义是"这一层跟底下已有的东西怎么合"，外面套一个同尺寸的容器，
    // 容器把自己那一层整体合下去，单张不透明子图的结果是完全一样的。
    return (
      <View
        pointerEvents="none"
        style={[styles.fill, { mixBlendMode: layer.blendMode, opacity: layer.opacity }]}
      >
        <Image
          source={{ uri: rawUri }}
          style={styles.fill}
          resizeMode={photoFit}
          fadeDuration={0}
        />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.fill,
        {
          mixBlendMode: layer.blendMode,
          opacity: layer.opacity,
          transform: layer.flipX ? FLIP_X : undefined,
        },
      ]}
    >
      <Image
        source={textureSource(layer.textureId)}
        style={styles.fill}
        resizeMode={layer.resizeMode === 'repeat' ? 'repeat' : 'stretch'}
        onLoad={onImageLoad}
        fadeDuration={0}
      />
    </View>
  );
}

const FLIP_X = [{ scaleX: -1 }];

/** 定位水印的纸白（比 UI 的 INK.paper 略暗一点，免得在相纸上显得发亮）。 */
const LOCATION_INK = 'rgba(236, 232, 224, 0.88)';

const styles = StyleSheet.create({
  stage: {
    overflow: 'hidden',
    // 相框透明处（例如胶片齿孔）露出的就是这层黑，观感更像真实胶片
    backgroundColor: '#000000',
  },
  window: {
    position: 'absolute',
    // 关键：把混合层关在窗口里，混合只作用于底下的照片
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  frame: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  timestamp: {
    position: 'absolute',
  },
  /**
   * 定位水印。
   *
   * 颜色刻意**不用**日期那支琥珀色：琥珀是"液晶数码管"的语义，只该出现在日期上；
   * 地点是印在相纸上的小字，用略暗的纸白，和 35mm 相框上印的
   * `36 EXP · PROCESS C-41` 是同一种东西。
   *
   * 那圈黑色投影也不是装饰：白边印刷框的锚点是 `window`，左下角下面是**照片本身**，
   * 可能是白墙、雪地、过曝的天空 —— 没有投影这一行就直接消失了。
   */
  location: {
    position: 'absolute',
    color: LOCATION_INK,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
});
