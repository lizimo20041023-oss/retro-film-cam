/**
 * 合成视图 —— 整个 App 的"显影"画面，同时也是 `captureRef` 的截图目标。
 *
 * 绘制顺序（也就是最终成片的图层顺序）：
 *   ① 画面窗口（overflow: hidden）
 *        · 原照片（cover / contain）
 *        · 重曝的第二张（`overlayUri`，`overlayOpacity` 默认 0.5，叠在同一格里）
 *        · 调色图层（纯色层 / 同图自叠 / 纹理层，全部用 mixBlendMode 混合）
 *   ② 相框 PNG（resizeMode="stretch" 铺满整个合成舞台，透明处露出照片）
 *   ③ 水印。日期和定位**一起**排在最后：
 *      烧在画面内部时画在照片之上，烧在相框留白里时必须盖在相框之上，
 *      两种锚点都是"最后画"最安全 —— 所以它们共用一个 `pieces` 数组、一次渲染。
 *      ⚠️ **日期块契约（`src/utils/geometry.ts` 的 `WatermarkLine.quartz` 上另有一份）**：
 *      `piece.quartz` 存在时**必须**用 `<DateStamp/>` 画进一个固定宽度的容器，
 *      容器宽度只能用 `quartz.width` 并且不许被压缩（`flexShrink: 0`）。
 *      曾经日期就是一个普通 `<Text>`，被 `flexShrink` 压成了 `26 10...` ——
 *      这一行就是那个 bug 的修复面。
 *      而 `piece.text` 是紧挨在日期块**前面**的那一小段文字（只有 `centered` 版式非空），
 *      它才是可以被省略号收掉的一段。
 *
 * 为什么调色层要关在 `overflow: 'hidden'` 的窗口容器里？
 * RN 没有现成的 `isolation` 便捷写法可用（它是 layout prop 不是 style prop，写错会静默失效），
 * 而 `overflow: 'hidden'` 本身就建立了裁剪与合成边界：混合只发生在窗口内部、
 * 只跟底下的照片混，既不会溢出到相框上，也不会混到取景器背景。
 *
 * 一框多图（`frame.slots`，§五.3）怎么摆：每一格有自己的窗口，按 `slots` 的**并集**
 * 建立那一个裁剪 / 混合边界 —— 理由见 `src/utils/geometry.ts` 的 `slotBounds`：
 * 颗粒是"整卷洗一遍"的效果，分格各洗一次会在接缝处露出两遍。相框 PNG 依然铺满整台。
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
  FrameSlot,
  FrameSpec,
  GradeLayer,
  PlaceDetail,
  Rect,
  ResolvedPlace,
  ResolvedTimestampConfig,
  WatermarkLayout,
} from '../types';
import { formatQuartzDate } from '../utils/formatTimestamp';
import { formatResolvedPlace } from '../utils/placeNames';
import { planCapture } from '../utils/captureOptions';
import {
  computeSlotRects,
  computeWatermarkPlan,
  formatExposureCode,
  frameOrientationOfLayout,
  frameSourceOf,
  slotBounds,
} from '../utils/geometry';
import type { WatermarkQuartz } from '../utils/geometry';
import { buildGradeLayers } from '../utils/gradeLayers';
import { DateStamp } from './DateStamp';

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
  /** 字重（已按墨色解析：`window` + graphite 要 400，液晶日期要 700）。 */
  fontWeight: TextStyle['fontWeight'];
  /**
   * 阴影半径。0 = 不投影（印在相纸留白上的字不需要）。
   * 压照片上时：日期是**同色辉光**，地名 / 代号是**黑投影**。
   */
  shadowRadius: number;
  /**
   * 阴影颜色。**不填 = 同色辉光**（用 `color` 自己）；填了就是普通投影
   * （压照片上的地名 / 代号给的是黑投影）。判断逻辑全在排版层，这里不做选择。
   */
  shadowColor?: string;
  /**
   * 日期块（见 `WatermarkLine.quartz` 的契约）：有它就**必须**用 `<DateStamp/>` 画。
   * `width` 是算好的固定宽度，渲染时必须原样用、且不可压缩。
   */
  quartz?: WatermarkQuartz;
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
  /** 这一卷用的预设代号（`PR-400` / `CCD-CYBER`…），关闭定位时印在原本地名那一行。 */
  presetName: string;
  /** 这一卷拍到第几张（1 起数）。没有就只印到 `· 35MM` 为止。 */
  exposureIndex?: number;
}

/*
 * 墨色**和阴影**都不在这里定：`computeWatermarkPlan` 已经按"压在照片上 / 印在相纸留白上"
 * 两种情形把每行的 `color`、`fontWeight`、`glowRadius` 和数码管的 `shadowColor/Radius`
 * 算好了，这里只负责画。
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

  /*
    日期走**石英字模** `'YY  MM  DD`。
    ⚠️ 行为变更：`preset.timestamp.format` 不再参与**成片水印** ——
    七段数码管只能画 0-9 和引号 / 空格 / 小数点这几个窄格，`'YYYY.MM.DD'` 那种掩码画不出来。
    相机页 LCD 上的日期预览仍然用 `formatTimestamp(date, preset.timestamp.format)`，两者互不影响。
  */
  const dateText = timestamp.enabled ? formatQuartzDate(capturedAt) : '';
  /*
    有结构就用结构按**当前界面语言**重排（切语言后旧照片也能重排）。
    `locationText` 只是向后兼容的兜底：相机页现在一律传 `place`
    —— 经纬度档也走 `place`（`locationStamp.ts` 会返回一个"只有坐标、
    城市和国别都是空串"的结构，`formatResolvedPlace` 现在会退回坐标本身），
    所以正常管线里走不到下面那个分支。
  */
  const placeText = place
    ? formatResolvedPlace(place, locale, input.placeDetail).trim()
    : locationText.trim();

  /*
    关闭定位（地名与降级文本都空）时印**摄影代号**：它顶替地名那一行，
    字号再小一档（排版层会乘 0.9）。这里只负责把代号拼出来，
    摆在哪儿由 `computeWatermarkPlan` 的 slot 决定。
  */
  const codeText = placeText.length === 0 ? formatExposureCode(input.presetName, input.exposureIndex) : '';

  if (dateText.length === 0 && placeText.length === 0 && codeText.length === 0) {
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
    codeText,
  );

  // `centered` 与 `split` 的行由 geometry 给了 `maxWidth`（要避让对面那块字）；
  // `dateOnly` / `stacked` 的靠边行没有对立面，退回"整幅减两侧 inset"。
  const fullWidth = Math.max(
    24,
    layout.width - Math.max(2, Math.round(layout.width * timestamp.insetRatio)) * 2,
  );

  return plan.lines.map((line) => ({
    // 四种版式里同一份 plan 不会出现两个同 kind 的行，所以 kind 本身就是稳定的 key
    key: line.kind,
    text: line.text,
    ...(line.align.left === undefined ? {} : { left: line.align.left }),
    ...(line.align.right === undefined ? {} : { right: line.align.right }),
    bottom: line.bottom,
    maxWidth: line.align.maxWidth ?? fullWidth,
    ...(line.align.textAlign === undefined ? {} : { textAlign: line.align.textAlign }),
    fontSize: line.fontSize,
    letterSpacing: line.letterSpacing,
    color: line.color,
    fontWeight: line.fontWeight,
    // geometry 只在"压在照片上"时给阴影；印在相纸留白上的是 0（白纸上围一圈阴影
    // 看着像蹭脏了）。半径与颜色都直接搬过来，不再自己按锚点猜。
    shadowRadius: line.glowRadius,
    ...(line.shadowColor === undefined ? {} : { shadowColor: line.shadowColor }),
    // 七段日期原样带过来（宽度 / 管高 / 缝宽 / 阴影都由 geometry 定）
    ...(line.quartz === undefined ? {} : { quartz: line.quartz }),
  }));
}

/* ==========================================================================
 * 二、渲染
 * ========================================================================== */

/**
 * 重曝那一张的默认不透明度（§五.3）。
 *
 * 为什么是 0.5 而不是 1：两张都全量叠上去等于"后一张盖住前一张"，那是替换不是重曝；
 * 一半一半才对得上"同一格底片曝光两次"的物理直觉（也才有"鬼影"可看）。
 */
const OVERLAY_DEFAULT_OPACITY = 0.5;

/** 空数组常量：没有开槽时复用同一个引用，免得每次渲染都新建一个数组。 */
const NO_SLOTS: readonly Rect[] = [];

/** 只认"非空的字符串 uri"：`null` / `undefined` / `''` 都表示这次没有这一张。 */
function nonEmptyUri(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 重曝的不透明度：缺省 0.5，越界值夹回 `[0, 1]`（`NaN` 也走缺省）。 */
function overlayOpacityOf(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return OVERLAY_DEFAULT_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

/** 某一格画哪张底片：0 = 第一张（`rawUri`），1 = 第二张；再多的槽位没有底片。 */
function slotPhotoUri(slotIndex: number, rawUri: string, secondUri: string | null): string | null {
  if (slotIndex === 0) {
    return rawUri;
  }
  return slotIndex === 1 ? secondUri : null;
}

/** 某一格的填充方式：格子自己没写就沿用相框的 `photoFit`（`FrameSlot` 上没有这一项）。 */
function slotPhotoFit(frame: FrameSpec, slot: FrameSlot | undefined): 'cover' | 'contain' {
  const fit = slot?.photoFit ?? frame.photoFit;
  return fit === 'contain' ? 'contain' : 'cover';
}

export function FilmCompositor({
  stage,
  viewShotRef,
  onLayout,
  onImageLoad,
  timestampFontFamily,
  style,
}: FilmCompositorProps) {
  const { layout, preset, frame, rawUri, capturedAt } = stage;

  /*
   * §五.3 的三块渲染输入，在这里一次算清（渲染段只读结果，不再自己判断）：
   * - `overlayUri`：重曝的第二张，空串 / null 都当没有；
   * - `secondUri`：一框多图的右格；
   * - `slotRects`：开槽的绝对坐标；空数组 = 相框没有开槽，走 v1.3.0 的单窗口老路。
   *
   * `mixing`（混合边界）取所有开槽的**并集**：调色 / 颗粒 / 暗角盖在这一块上，
   * 而不是每格各盖一遍 —— 分格各洗一遍会在接缝两侧露出两遍颗粒。
   */
  const overlayUri = nonEmptyUri(stage.overlayUri);
  const secondUri = nonEmptyUri(stage.secondUri);
  const overlayOpacity = overlayOpacityOf(stage.overlayOpacity);
  const slots = frame.slots;
  const slotRects = slots !== undefined && slots.length > 0 ? computeSlotRects(layout, slots) : NO_SLOTS;
  const mixing: Rect = slotRects.length > 0 ? slotBounds(slotRects) : layout.window;

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
        // 关闭定位时印摄影代号：代号取预设名，第几张取 `exposureIndex`（1 起数）
        presetName: preset.name,
        exposureIndex: stage.exposureIndex,
      }),
    [
      layout,
      frame,
      preset.timestamp,
      preset.name,
      capturedAt,
      stage.locationText,
      stage.place,
      stage.locale,
      stage.watermarkLayout,
      stage.placeDetail,
      // ⚠️ 这一项必须留着：`processFilmPhoto` 的注释里还写着"全项目没有任何组件读
      // `exposureIndex`"，那是因为当时 `planWatermark` 既不读它、依赖表里也没有它 ——
      // 少了这一项，连拍第二张起代号里的 `EXP.xx` 就不会重算。
      stage.exposureIndex,
    ],
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
      {/* ① 画面：单格 = 一个窗口；一框多图 = 每格一个窗口，共用一块裁剪 / 混合边界 */}
      <View
        style={[
          styles.window,
          {
            left: mixing.left,
            top: mixing.top,
            width: mixing.width,
            height: mixing.height,
          },
        ]}
      >
        {slotRects.length > 0 ? (
          slotRects.map((rect, index) => {
            const uri = slotPhotoUri(index, rawUri, secondUri);
            if (uri === null) {
              /*
               * 这一格没有底片（相框有两个槽位但调用方没给第二张）：**什么都不画**，
               * 露出舞台底色（黑）。不要拿第一张去填第二格 —— 半格空着是真实的
               * 半格相机结果，用同一张图填满反而像成了"两张一样的"。
               */
              return null;
            }
            return (
              <View
                key={`slot-${index}`}
                style={[
                  styles.slot,
                  {
                    // `computeSlotRects` 给的是相对舞台的坐标，这里换算成相对并集容器的。
                    left: rect.left - mixing.left,
                    top: rect.top - mixing.top,
                    width: rect.width,
                    height: rect.height,
                  },
                ]}
              >
                <Image
                  source={{ uri }}
                  style={styles.fill}
                  resizeMode={slotPhotoFit(frame, slots?.[index])}
                  onLoad={onImageLoad}
                  fadeDuration={0}
                />
                {/* 重曝只叠在**第一格**上：第二格是另一半格，本来就没有第二次曝光 */}
                {index === 0 && overlayUri !== null ? (
                  <Image
                    source={{ uri: overlayUri }}
                    style={[styles.fill, { opacity: overlayOpacity }]}
                    resizeMode={slotPhotoFit(frame, slots?.[0])}
                    onLoad={onImageLoad}
                    fadeDuration={0}
                  />
                ) : null}
              </View>
            );
          })
        ) : (
          <>
            <Image
              source={{ uri: rawUri }}
              style={styles.fill}
              resizeMode={frame.photoFit === 'contain' ? 'contain' : 'cover'}
              onLoad={onImageLoad}
              fadeDuration={0}
            />
            {/*
              重曝（§五.3）：第二张底片叠在**同一个窗口内**、叠在原片之上、
              叠在调色层之下 —— 顺序就是这个功能的全部语义：
              "两张底片叠在同一格上晒一次"，所以下面那条调色 / 颗粒 / 暗角管线
              作用的是合成结果，而不是各洗一遍再叠（后者会得到两道暗角和双份颗粒）。
            */}
            {overlayUri !== null ? (
              <Image
                source={{ uri: overlayUri }}
                style={[styles.fill, { opacity: overlayOpacity }]}
                resizeMode={frame.photoFit === 'contain' ? 'contain' : 'cover'}
                onLoad={onImageLoad}
                fadeDuration={0}
              />
            ) : null}
          </>
        )}
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

      {/*
        ② 相框：横构图（原图 width > height）且相框有横版变体时换成横版 PNG。
        朝向**从 `layout.aspect` 反推**，不在这里重判一次横竖：`stage` 里没有原图像素尺寸
        （`rawUri` 只是字符串），而布局是上游按同一次选择算好的 —— 判两次就可能出现
        "布局按横版算、PNG 铺了竖版"的错位。没有横版变体时 `frameSourceOf` 返回原 PNG，
        所以这一行对现有四款相框（都还没有 `landscape`）是零行为变化。
      */}
      <Image
        source={frameSourceOf(frame, frameOrientationOfLayout(frame, layout))}
        style={[styles.frame, { width: layout.width, height: layout.height }]}
        resizeMode="stretch"
        onLoad={onImageLoad}
        fadeDuration={0}
      />

      {/* ③ 水印（日期 + 定位，一次画完） */}
      {pieces.map((piece) => {
        const fontFamily = preset.timestamp.fontFamily ?? timestampFontFamily;
        const text = stampTextStyle(piece, fontFamily, preset.timestamp.glow);

        // 纯文字行（地名 / 摄影代号 / 日期关掉时的纯文字）
        if (piece.quartz === undefined) {
          return (
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
                },
                text,
              ]}
            >
              {piece.text}
            </Text>
          );
        }

        /*
          只有七段日期（split / stacked / dateOnly）：**固定宽度的独立容器**。
          宽度来自 `segmentDateWidth()`，不是量出来的 —— 这就是"日期再也不会被截断"
          的落点。RN 的 flexShrink 默认就是 0，这里显式再写一遍：
          这条契约值得被后来的人看见（曾经就是被压成了 `26 10...`）。
        */
        if (piece.text.length === 0) {
          return (
            <View
              key={piece.key}
              style={[
                styles.stamp,
                {
                  left: piece.left,
                  right: piece.right,
                  bottom: piece.bottom,
                  width: piece.quartz.width,
                  flexShrink: 0,
                },
              ]}
            >
              <QuartzPiece piece={piece} fontFamily={fontFamily} />
            </View>
          );
        }

        /*
          居中版式：一行里两个片段 ——「地名 + 窄空格中点」可以省略号收掉（`flexShrink: 1`），
          数码管整块让位（宽度是算好的，不参与压缩）。
          `alignItems: 'flex-end'` 之后再用 marginBottom 把管子抬到文字的基线上：
          管子没有降部，直接对齐下沿会显得往下掉。
        */
        return (
          <View
            key={piece.key}
            style={[
              styles.stamp,
              styles.centeredRow,
              {
                left: piece.left,
                right: piece.right,
                bottom: piece.bottom,
                maxWidth: piece.maxWidth,
                // 居中那一行的宽度就是水印区宽度：`textAlign: 'center'` 与
                // `justifyContent: 'center'` 都要靠一个确定的盒子才成立。
                width: piece.textAlign === 'center' ? piece.maxWidth : undefined,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.centeredText, text]}
            >
              {piece.text}
            </Text>
            {/*
              日期块与旁边的文字**下沿对齐**（`centeredRow` 的 `alignItems: 'flex-end'`）。
              老实现还要在这里补一个 `marginBottom: fontSize × 0.21`，因为那时日期是画出来的
              管子、没有降部，直接对齐下沿会显得往下掉。现在日期就是一行 `<Text>`，
              降部本来就在行盒里 —— 再补一次反而会把它抬高一截。
            */}
            <QuartzPiece piece={piece} fontFamily={fontFamily} />
          </View>
        );
      })}
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

/*
 * v1.4.1 删掉了 `TEXT_DESCENT_RATIO`（0.21）。
 * 那时 `centered` 版式要把画出来的七段管抬高"一个降部"，好和旁边的文字坐在同一条基线上；
 * 日期换成真实 `<Text>` 之后降部本来就在行盒里，抬高反而错位。
 */

/**
 * 一行文字的样式。普通文字行与居中版式的文字片段共用一套。
 *
 * 为什么抽出来：这两处曾经各写一遍，改一处忘一处就会出现"居中那行不发光"。
 * 注意字重是**听排版层的**（`piece.fontWeight`）：`anchor === 'window'` + graphite
 * 时墨色要的是 400，预设里那一栏（700）是给液晶日期留的。
 */
function stampTextStyle(piece: WatermarkPiece, fontFamily: string, glowEnabled: boolean): TextStyle {
  return {
    color: piece.color,
    fontSize: piece.fontSize,
    letterSpacing: piece.letterSpacing,
    fontFamily,
    fontWeight: piece.fontWeight,
    // 阴影：颜色由排版层给（缺省 = 同色辉光，液晶日期压在照片上要的那圈橙光）；
    // 半径 0 就是完全不投影 —— 印在相纸留白上的字一个阴影都不带。
    textShadowColor:
      piece.shadowRadius > 0 ? (piece.shadowColor ?? (glowEnabled ? piece.color : 'rgba(0, 0, 0, 0.55)')) : 'transparent',
    textShadowRadius:
      piece.shadowRadius > 0 && glowEnabled ? Math.max(3, Math.round(piece.fontSize * 0.45)) : piece.shadowRadius,
    textShadowOffset: { width: 0, height: piece.shadowRadius > 0 ? 1 : 0 },
  };
}

/**
 * 日期片段。参数**全部**来自 `piece.quartz` 与 `piece.color`，
 * 这里不做任何判断（阴影该不该发、发什么颜色都由 `geometry.ts` 定好了）。
 *
 * 字体族是单独的参数、不塞进 `quartz`：`quartz` 装的是"排版算出来的数"，
 * 字体是"这台机器上装了哪个族" —— 混在一起会让 `geometry.ts` 那个纯函数
 * 不得不认识 `Platform`。
 */
function QuartzPiece({ piece, fontFamily }: { piece: WatermarkPiece; fontFamily: string }) {
  const quartz = piece.quartz;
  if (quartz === undefined) {
    return null;
  }
  return <DateStamp quartz={quartz} color={piece.color} fontFamily={fontFamily} />;
}

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
  /**
   * 一框多图里的**一格**。相对并集容器绝对定位，而且自己也是一层裁剪边界 ——
   * 每格各自 `overflow: hidden`，`cover` 才只裁自己那一格，不会盖住邻居。
   */
  slot: {
    position: 'absolute',
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
  /** 居中版式那一行：文字在左、数码管在右，两个片段一起居中。 */
  centeredRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  /** 居中版式里可被省略号收掉的那一半（数码管那一半不参与压缩）。 */
  centeredText: {
    flexShrink: 1,
  },
});
