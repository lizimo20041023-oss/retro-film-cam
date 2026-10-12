/**
 * 合成视图 —— 整个 App 的"显影"画面，同时也是 `captureRef` 的截图目标。
 *
 * 绘制顺序（也就是最终成片的图层顺序）：
 *   ① 画面窗口（overflow: hidden）
 *        · 原照片（cover / contain）
 *        · 调色图层（纯色层 / 同图自叠 / 纹理层，全部用 mixBlendMode 混合）
 *   ② 相框 PNG（resizeMode="stretch" 铺满整个合成舞台，透明处露出照片）
 *   ③ 水印。日期和定位**一起**排在最后：
 *      烧在画面内部时画在照片之上，烧在相框留白里时必须盖在相框之上，
 *      两种锚点都是"最后画"最安全 —— 所以它们共用一个 `pieces` 数组、一次渲染。
 *
 * 为什么调色层要关在 `overflow: 'hidden'` 的窗口容器里？
 * RN 没有现成的 `isolation` 便捷写法可用（它是 layout prop 不是 style prop，写错会静默失效），
 * 而 `overflow: 'hidden'` 本身就建立了裁剪与合成边界：混合只发生在窗口内部、
 * 只跟底下的照片混，既不会溢出到相框上，也不会混到取景器背景。
 *
 * 关于截图尺寸：`ViewShot` 的 options 里**故意不传 width/height**，
 * 这样输出像素 = 这里的逻辑尺寸 × PixelRatio（官方原话：不传就是原始像素尺寸），
 * 也就是"屏幕上多大，成片就多清晰"，不会因为放大而变糊。
 *
 * 关于水印版式：这个组件**不认识"预设"和"版式"的语义**，它只做两件事 ——
 * 把"这次要印什么字、印在哪"算成一份 `WatermarkPiece[]`（纯函数，见 `planWatermark`），
 * 然后照着画。加第五种版式 = 改那一个 switch，渲染这一段一行都不用动。
 */
import { useMemo } from 'react';
import type { RefObject } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { textureSource } from '../constants/textures';
import type { LocaleId } from '../i18n/types';
import type {
  FilmStageInput,
  FrameLayout,
  FrameSpec,
  GradeLayer,
  PlaceDetail,
  ResolvedPlace,
  ResolvedTimestampConfig,
  WatermarkLayout,
} from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';
import { formatResolvedPlace } from '../utils/placeNames';
import { planCapture } from '../utils/captureOptions';
import { computeWatermarkPlan } from '../utils/geometry';
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

/* ==========================================================================
 * 一、水印排布（纯函数）
 * ========================================================================== */

/** 一块要印的字：印什么、印在哪、什么颜色。 */
export interface WatermarkPiece {
  key: string;
  text: string;
  /** 距舞台左沿（不填 = 由 `right` 决定水平位置）。 */
  left?: number;
  /** 距舞台右沿。 */
  right?: number;
  /** 距舞台下沿。日期用 `TimestampLayout.bottom`，定位行与它齐平或叠在它上方。 */
  bottom: number;
  /** 超长时的截断宽度。 */
  maxWidth: number;
  textAlign?: TextStyle['textAlign'];
  fontSize: number;
  letterSpacing: number;
  color: string;
  /** 投影半径。0 = 不投影（印在相纸留白上的字不需要）。 */
  shadowRadius: number;
}

export interface WatermarkPlanInput {
  layout: FrameLayout;
  frame: FrameSpec;
  timestamp: ResolvedTimestampConfig;
  /** 按快门那一刻。 */
  capturedAt: Date;
  /**
   * 已经拼好的定位行（经纬度档，或拿不到结构时的降级文本）。
   * 只有 `place` 为 `null` 时才用它 —— 见下面的注释。
   */
  locationText: string;
  place: ResolvedPlace | null;
  locale: LocaleId;
  watermarkLayout: WatermarkLayout;
  placeDetail: PlaceDetail;
}

/*
 * 墨色不在这里定：`computeWatermarkPlan` 已经按"压在照片上 / 印在相纸留白上"
 * 两种情形把每行的 `color` 和 `glowRadius` 算好了，这里只负责画。
 */

/**
 * 「这次水印要印哪几块字」。
 *
 * 四种版式（`split` / `stacked` / `centered` / `dateOnly`）**只决定地名和日期怎么摆**，
 * 摆在哪个矩形里由相框的 `watermark.anchor` 决定 —— 所以加版式不用改相框，
 * 加相框也不用改版式。两块内容永远是"日期为主、地名为附注"：
 * 地名比日期小一档（几何那边已经算好 0.62 倍），墨色也更淡。
 */
export function planWatermark(input: WatermarkPlanInput): WatermarkPiece[] {
  const { layout, frame, timestamp, capturedAt, locationText, place, locale } = input;

  const dateText = timestamp.enabled ? formatTimestamp(capturedAt, timestamp.format).trim() : '';
  /*
    有结构就用结构按**当前界面语言**重排（切语言后旧照片也能重排）。
    `locationText` 只是向后兼容的兜底：相机页现在一律传 `place`
    —— 经纬度档也走 `place`（`locationStamp.ts` 会返回一个"只有坐标、
    城市和国别都是空串"的结构，拼出来正好是坐标本身），
    所以正常管线里走不到下面那个分支。
  */
  const placeText = place
    ? formatResolvedPlace(place, locale, input.placeDetail).trim()
    : locationText.trim();

  if (dateText.length === 0 && placeText.length === 0) {
    return [];
  }

  /*
   * 排版**全部**交给 `computeWatermarkPlan` —— 它是四种版式的唯一实现。
   *
   * 这里曾经是第二套实现（自己挑墨色、自己乘 `tracking.letterSpacingScale`、
   * 自己算叠行位置），代价是两边互相漂移。最典型的一处是字距被乘了两次：
   * `computeTimestampLayout` 内部走的就是 `computeWatermarkPlan(..., 'en', 'dateOnly')`，
   * 它返回的 `letterSpacing` **已经**乘过一次倍数；这里再乘一次，英文 + graphite
   * 相框（拍立得 / 幻灯卡）的字距就被放大到约 1.66 倍。
   * 现在这里只做一件事：把 `WatermarkLine[]` 原样翻译成渲染层要的 `WatermarkPiece[]`。
   */
  const plan = computeWatermarkPlan(
    layout,
    timestamp,
    frame,
    placeText,
    dateText,
    locale,
    input.watermarkLayout,
  );

  // `centered` 与 `split` 的行由 geometry 给了 `maxWidth`（要避让对面那块字）；
  // `dateOnly` / `stacked` 的靠边行没有对立面，退回"整幅减两侧 inset"。
  const fullWidth = Math.max(
    24,
    layout.width - Math.max(2, Math.round(layout.width * timestamp.insetRatio)) * 2,
  );

  return plan.lines.map((line) => ({
    key: line.kind === 'date' ? 'timestamp' : 'place',
    text: line.text,
    ...(line.align.left === undefined ? {} : { left: line.align.left }),
    ...(line.align.right === undefined ? {} : { right: line.align.right }),
    bottom: line.bottom,
    maxWidth: line.align.maxWidth ?? fullWidth,
    ...(line.align.textAlign === undefined ? {} : { textAlign: line.align.textAlign }),
    fontSize: line.fontSize,
    letterSpacing: line.letterSpacing,
    color: line.color,
    // geometry 只在"压在照片上"时给辉光；印在相纸留白上的是 0（白纸上围一圈阴影
    // 看着像蹭脏了）。直接搬过来，不再自己按锚点猜。
    shadowRadius: line.glowRadius,
  }));
}

/* ==========================================================================
 * 二、渲染
 * ========================================================================== */

export function FilmCompositor({
  stage,
  viewShotRef,
  onLayout,
  onImageLoad,
  timestampFontFamily,
  style,
}: FilmCompositorProps) {
  const { layout, preset, frame, rawUri, capturedAt } = stage;

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

  const pieces = useMemo(
    () =>
      planWatermark({
        layout,
        frame,
        timestamp: preset.timestamp,
        capturedAt,
        locationText: typeof stage.locationText === 'string' ? stage.locationText : '',
        place: stage.place ?? null,
        // 宿主没给语言时按简体中文渲染。宁可有一个确定的行为，
        // 也不要出现"英文界面下地名是中文"这种半对的状态。
        locale: stage.locale ?? 'zh-Hans',
        watermarkLayout: stage.watermarkLayout ?? 'split',
        placeDetail: stage.placeDetail ?? 'archive',
      }),
    [layout, frame, preset.timestamp, capturedAt, stage.locationText, stage.place, stage.locale, stage.watermarkLayout, stage.placeDetail],
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

      {/* ③ 水印（日期 + 定位，一次画完） */}
      {pieces.map((piece) => (
        <Text
          key={piece.key}
          allowFontScaling={false}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.stamp,
            {
              left: piece.left,
              right: piece.right,
              bottom: piece.bottom,
              maxWidth: piece.maxWidth,
              textAlign: piece.textAlign,
              color: piece.color,
              fontSize: piece.fontSize,
              letterSpacing: piece.letterSpacing,
              fontFamily: preset.timestamp.fontFamily ?? timestampFontFamily,
              fontWeight: preset.timestamp.fontWeight,
              // 液晶辉光：同色 textShadow（比嵌套 Text 便宜）。
              // 只在压在照片上、且预设开了 glow 时才有 —— 相纸上不发光。
              textShadowColor:
                piece.shadowRadius > 0
                  ? preset.timestamp.glow
                    ? piece.color
                    : 'rgba(0, 0, 0, 0.55)'
                  : 'transparent',
              textShadowRadius:
                piece.shadowRadius > 0 && preset.timestamp.glow
                  ? Math.max(3, Math.round(piece.fontSize * 0.45))
                  : piece.shadowRadius,
              textShadowOffset: { width: 0, height: piece.shadowRadius > 0 ? 1 : 0 },
            },
          ]}
        >
          {piece.text}
        </Text>
      ))}
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
  stamp: {
    position: 'absolute',
  },
});
