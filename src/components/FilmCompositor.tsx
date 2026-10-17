/**
 * 合成视图 —— 整个 App 的"显影"画面，同时也是 `captureRef` 的截图目标。
 *
 * 绘制顺序（也就是最终成片的图层顺序）：
 *   ① 画面窗口（overflow: hidden）
 *        · 原照片（cover / contain）
 *        · 重曝的第二张（`overlayUri`，`overlayOpacity` 默认 0.5，叠在同一格里）
 *        · 调色图层（纯色层 / 同图自叠 / 纹理层，全部用 mixBlendMode 混合）
 *   ② 相框 PNG（resizeMode="stretch" 铺满整个合成舞台，透明处露出照片）
 *   ②b 相框皮肤（`FrameSkin`）：画在相框 PNG **之上**、水印**之下** —— 它是"相纸上的
 *      痕迹"，该压住纸面，但不该压住日期和地名。取景器里的实时预览挂的是**同一个组件**
 *      （只是画幅小），所以预览与成片等比。
 *      v1.8.3 起删光"多色块拼接"（做旧斑点 / 涂鸦 / 渐变条带），导出图上下边带不许再有百叶窗横纹。
 *      v1.8.5（用户 m02760 · M1）起皮肤 = **4 块 multiply 实色边带**（只着色，不盖 PNG 的
 *      纸纹与印刷细节）+ 程序化相纸结构（枕形压边 / 下巴压痕 / 135 齿孔 / 帧号），
 *      数据来自 `FrameSpec.skin`；相纸圆角由 `paperCornerRadius` 在三个调用点裁在组合层上。
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
 */
import { memo, useMemo } from 'react';
import type { RefObject } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { frameSkinSeedOf } from '../constants/frames';
import {
  dateEngineFontPx,
  dateEngineTextWidth,
  formatWithDateEngine,
  shouldStampDate,
  stampsInsidePhoto,
} from '../constants/dateEngine';
import type { LocaleId } from '../i18n/types';
import type {
  DateEngineConfig,
  FilmStageInput,
  FrameLayout,
  FrameSpec,
  FrameVariant,
  GeoLocale,
  PlaceDetail,
  ResolvedPlace,
  ResolvedTimestampConfig,
  WatermarkLayout,
} from '../types';
import { compactPlace, formatResolvedPlace, watermarkPlaceFont } from '../utils/placeNames';
import { planCapture } from '../utils/captureOptions';
import {
  computeWatermarkPlan,
  formatExposureCode,
  frameOrientationOfLayout,
  frameSourceOf,
  planInnerWindowShadows,
  planPrintCushion,
  resolveDateSpot,
  roundInnerWindow,
  shouldCompactPlaceText,
  splitGutterOf,
  splitPlaceAvailableWidth,
} from '../utils/geometry';
import type { DateSpotPlacement, WatermarkLineKind, WatermarkQuartz } from '../utils/geometry';
import { DEFAULT_SETTINGS } from '../utils/settingsStore';
import { DateStamp } from './DateStamp';
import { glyphHeight } from './DateGlyphs';
import { FilmLookLayers } from './FilmLookLayers';
import { FrameSkin, mixHexColor, paperCornerRadius } from './FrameSkin';
import { LinearGradient } from 'expo-linear-gradient';
import { findFrameMaterial } from '../constants/frameVariants';

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
  /**
   * 相框风格变体（v1.7.0）。不传 = `'classic'`（不叠皮肤）——
   * 老调用方（`GalleryScreen` 的导入链路）一行不改也和 v1.6.1 逐像素一致。
   * 取景器预览与成片共用同一个 `FrameSkin`，所以两边长得一样。
   */
  frameVariant?: FrameVariant;
  /**
   * 日期引擎（v1.8.0 · 模块四）：格式 / 字形 / 机位 / 发光色。
   *
   * **不传 = `DEFAULT_SETTINGS.dateEngine`**（`MM_DD_YY` · `quartz_led` · `strip_split` ·
   * `classic_amber` = v1.7.0 观感），老调用方（`GalleryScreen` 的导入链路、
   * 探针里的裸调用）因此一行不用改。
   *
   * ⚠️ 缺省**必须**取 `DEFAULT_SETTINGS.dateEngine` 而不是在这里再写一份字面量：
   * 设置页写进去的是那一个对象，两处各写一份迟早会漂（漂了的表现是"设置里选了
   * 新机位、洗出来还是老位置"，而且只有真机点一遍才发现）。`CameraScreen` 是
   * 正常管线，它一直显式传，缺省只服务老调用方。
   */
  dateEngine?: DateEngineConfig;
  /**
   * 胶片外观种子（v1.8.0 · 模块一）：颗粒 / 微尘的分布。
   *
   * 取景器实时预览与成片**必须**用同一个值（`CameraScreen` 的 `LOOK_SEED`），
   * 否则"所见即所得"就是假的 —— 用户会看到取景器里的颗粒和洗出来的对不上。
   * 不传 = `0`（老调用方的确定性兜底：同一支卷永远同一套纹理，不用 `Math.random()`）。
   */
  lookSeed?: number;
  /**
   * 展示模式（v1.8.5 模块一 · 用户 m02760「3D 实体相纸」的导出衬底）。
   *
   * - `'preview'`（默认）= v1.8.4 行为：相纸顶满画布，无衬底、无悬浮阴影。
   *   取景器 / 抽屉的预览都不经过本组件（那边是 `FramePreviewLayer`），
   *   能走到这里的 `'preview'` 只有老调用方与裸探针。
   * - `'print'` = 成片导出：相纸内容整体等比缩进一圈窄边衬底（纸色压暗 6%），
   *   底部加真实悬浮阴影。`CameraScreen` 的快门显影与 `GalleryScreen` 的导入
   *   两个挂载点传 `'print'` —— 它们挂的这棵树**就是**要被截图存盘的成片。
   *
   * `00 NO FRAME` 没有相纸，`print` 也不套衬底（否则全幅画面被缩一圈）。
   */
  presentation?: 'preview' | 'print';
  style?: StyleProp<ViewStyle>;
}

/* ==========================================================================
 * 一、水印排布（纯函数）
 * ========================================================================== */

/** 一块要印的字：印什么、印在哪、什么颜色。 */
/**
 * 地名行的字体语言（v1.8.5 模块四）。
 *
 * `stage.locale` 在 `useFilmStage` 里已经过一次 `resolveGeoLocale(geoLocale, uiLocale)`，
 * 正常情况就是 GeoLocale 四值之一；这里只是把 `LocaleId` 里多出来的 `'fr'` 等钉回 `'en'`，
 * 保证**永远不会把界面语言当地名语言**去挑字体（日文界面 + 英文地名 = Menlo，不是明朝体）。
 */
function placeFontLocaleOf(locale: LocaleId | undefined): GeoLocale {
  if (locale === 'zh-Hant' || locale === 'ja' || locale === 'en') return locale;
  if (locale === 'fr') return 'en';
  return 'zh-Hans';
}

export interface WatermarkPiece {
  key: string;
  /**
   * 行种类（v1.8.5）。`place` / `code` 行要按**地名语言**换字体
   * （日文 `Hiragino Mincho ProN`、英文 `Menlo`），`date` 行保持日期字体 ——
   * 两类字体的来源不同，渲染层不能再"一个 fontFamily 画到底"。
   */
  kind: WatermarkLineKind;
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
  /**
   * 日期引擎（v1.8.0 · 模块四）：决定日期的**文字**（`format`）、**字号**（`glyphStyle`）、
   * **落点**（`spot`）与**发光色**（`glow`）。
   *
   * 为什么日期串也归它管：v1.7.0 用的是写死的石英字模 `'YY  MM  DD`，
   * 而引擎的 13 档格式里有 `YYYY.MM.DD` / `YYYY年M月D日` 这种七段管画不出来的串 ——
   * "格式"与"字形"必须同进同退，否则会出现"选了汉字格式、画出来还是一串数字"。
   */
  dateEngine: DateEngineConfig;
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
  const { layout, frame, timestamp, capturedAt, locationText, place, locale, dateEngine } = input;

  /*
    日期走**日期引擎**（v1.8.0 · 模块四）。

    ⚠️ 行为变更：`preset.timestamp.format` 不再参与**成片水印** ——
    七段数码管只能画 0-9 和引号 / 空格 / 小数点这几个窄格，`'YYYY.MM.DD'` 那种掩码画不出来。
    相机页 LCD 上的日期预览仍然用 `formatTimestamp(date, preset.timestamp.format)`，两者互不影响。
    现在这条格式来自 `settings.dateEngine.format`（13 档，见 `constants/dateEngine.ts`），
    它在取景器预览、成片、设置页三处是**同一个值**，所以才不会再出现"设置里换了格式、
    洗出来还是老的"。
  */
  const engineText = timestamp.enabled ? formatWithDateEngine(capturedAt, dateEngine.format) : '';
  const hasDate = shouldStampDate(engineText);
  /*
   * 画内机位（`in_*` 六档）：日期**不属于白边那一行**了 —— 合成层把它画进照片窗口，
   * 落点由 `resolveDateSpot()` 算（见下面的 `planInPhotoDate`）。
   *
   * 所以这里把日期**从版式里摘掉**，而不是"照排然后不画"：`split` 版式里日期那一栏
   * 的宽度（`dateStampWidth` 算出来的整块）本来是要从地名嘴里扣掉的，
   * 摘掉之后地名才能拿回整条宽度 —— 否则用户把日期挪进画内，地名反而被精简了一档，
   * 而它旁边根本没有东西再跟它抢位置。
   *
   * 这也正是"白边下巴只印地名"那条规则的落点：画内机位下，白边这一层只排地名 / 代号。
   */
  const dateInPhoto = hasDate && stampsInsidePhoto(dateEngine.spot);
  const dateText = dateInPhoto ? '' : engineText;
  /*
    有结构就用结构按**当前界面语言**重排（切语言后旧照片也能重排）。
    `locationText` 只是向后兼容的兜底：相机页现在一律传 `place`
    —— 经纬度档也走 `place`（`locationStamp.ts` 会返回一个"只有坐标、
    城市和国别都是空串"的结构，`formatResolvedPlace` 现在会退回坐标本身），
    所以正常管线里走不到下面那个分支。
  */
  let placeText = place
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
  let plan = computeWatermarkPlan(
    layout,
    timestamp,
    frame,
    placeText,
    dateText,
    locale,
    input.watermarkLayout,
    codeText,
    dateEngine.glyphStyle,
  );

  /*
    用户 m07186 的硬要求：「左侧地名超出就自动精简成国家 + 城市，右侧日期绝不被挤压」。
    判定与重排都走 `geometry.ts` 里那一套唯一算术，这里只负责"发现放不下就再排一次"：

    1. 先按**完整地名**排一次版。这一版里的 `region.width` 与日期行的 `quartz.width`
       就是"留白区里到底还剩多少宽度给地名"的真值 —— `splitPlaceAvailableWidth()` 抽出来
       就是给这里用的，它和 `computeWatermarkPlan` 内部的 `split` 分支是同一行算术，
       所以"算出来的可用宽"与"画出来的可用宽"永远是同一个数，不会漂移。
    2. 只有**真的放不下**（估算上界 > 可用宽 × 0.98）才用 `compactPlace` 去掉省/州一级，
       然后用精简后的地名重排一次。重排后仍落在同一条 `place` 行、仍走
       `formatResolvedPlace`，所以港澳台前置规则、多语言、详细度档全部自动继承，
       **不存在第二套格式化**。

    为什么不做"截断 + 省略号"：`上海市 · 黄浦…` 比 `中国 · 上海` 更没用 ——
    后者至少是个完整地名。

    为什么只重排一次、不做迭代：精简形已经是这一版式下最短的有意义形态，
    反复精简没有下一档可去，多迭代只会白算版式。

    为什么 `compactText === placeText` 就跳过：坐标档走的是 `coordsOnlyPlace`，
    它的 `region` 本来就是空串，`compactPlace` 会原样返回；跳过能省一次整版重算。
    顺带这也是"坐标档绝不被精简逻辑动到"的守卫。

    为什么只在 `split` 版式里做：只有这一版式才是"地名与日期左右并排抢同一条宽度"。
    其余三种版式里日期要么独占一行、要么和地名分两层叠放，不存在挤压。
  */
  if (place !== null && placeText.length > 0 && plan.layout === 'split') {
    const placeLine = plan.lines.find((line) => line.kind === 'place');
    const dateQuartzWidth = plan.lines.find((line) => line.kind === 'date')?.quartz?.width;
    if (placeLine !== undefined && dateQuartzWidth !== undefined) {
      const available = splitPlaceAvailableWidth(
        plan.region.width,
        dateQuartzWidth,
        splitGutterOf(layout.width),
      );
      if (
        shouldCompactPlaceText(
          placeLine.text,
          placeLine.fontSize,
          placeLine.letterSpacing,
          available,
        )
      ) {
        const compactText = formatResolvedPlace(
          compactPlace(place),
          locale,
          input.placeDetail,
        ).trim();
        if (compactText.length > 0 && compactText !== placeText) {
          placeText = compactText;
          plan = computeWatermarkPlan(
            layout,
            timestamp,
            frame,
            placeText,
            dateText,
            locale,
            input.watermarkLayout,
            codeText,
            dateEngine.glyphStyle,
          );
        }
      }
    }
  }

  // `centered` 与 `split` 的行由 geometry 给了 `maxWidth`（要避让对面那块字）；
  // `dateOnly` / `stacked` 的靠边行没有对立面，退回"整幅减两侧 inset"。
  const fullWidth = Math.max(
    24,
    layout.width - Math.max(2, Math.round(layout.width * timestamp.insetRatio)) * 2,
  );

  return plan.lines.map((line) => ({
    // 四种版式里同一份 plan 不会出现两个同 kind 的行，所以 kind 本身就是稳定的 key
    key: line.kind,
    // v1.8.5：行种类带到渲染层 —— 地名 / 代号行要按地名语言换字体，日期行不换。
    kind: line.kind,
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
 * 一之二、画内机位（日期印进照片里）
 * ========================================================================== */

/** 画内日期的落点结果。 */
export interface InPhotoDatePlan {
  /** 日期块参数：与白边路径**同一份**算术算出来的（见下面的注释）。 */
  quartz: WatermarkQuartz;
  /** 墨色（已按锚点 / 墨色解析好，直接用）。 */
  color: string;
  /** `geometry.resolveDateSpot()` 算好的盒子与内缩后的外接矩形。 */
  placement: DateSpotPlacement;
}

/**
 * 画内机位（`in_bl_v` / `in_bl_h` / `in_br_h` / `in_br_v` / `in_tr_v` / `in_cb_h`）
 * 的日期落点。白边两档（`strip_*`）或这次不烧日期时返回 `null`。
 *
 * 为什么要单独一个函数、而不是塞进 `planWatermark` 的返回值：
 * `planWatermark` 返回的是"白边那一行要画的字"（`WatermarkPiece[]`），而画内日期
 * **不排在文档流里** —— 它的坐标是 `resolveDateSpot` 按照片窗口算出来的绝对盒子。
 * 两者的坐标空间不同，混进同一个数组会让渲染层必须靠"有没有 quartz"去猜用哪套坐标。
 *
 * ⚠️ 画内日期**不缩字号**：贴边机位放不下时由 `resolveDateSpot` 负责换位置 / 退到白边
 * （`placement.degraded === true`），"塞不下就缩小"会让日期像素高不再恒定 ——
 * 那正是 v1.8.0 模块四要消灭的东西。
 */
export function planInPhotoDate(input: WatermarkPlanInput): InPhotoDatePlan | null {
  const { layout, frame, timestamp, capturedAt, locale, dateEngine } = input;
  const text = timestamp.enabled ? formatWithDateEngine(capturedAt, dateEngine.format) : '';
  if (!shouldStampDate(text) || !stampsInsidePhoto(dateEngine.spot)) {
    return null;
  }

  /*
   * 日期块的宽度 / 字号 / 字距 / 阴影**不在这里另算**，而是借道整版排版的 `dateOnly`
   * 版式取那一行 —— 与白边路径同一份 `dateStampWidth` 算术，
   * 所以"同一个日期换个机位就换个大小 / 换个字距"在结构上不可能发生。
   */
  const plan = computeWatermarkPlan(
    layout,
    timestamp,
    frame,
    '',
    text,
    locale,
    'dateOnly',
    '',
    dateEngine.glyphStyle,
  );
  const line = plan.lines.find((entry) => entry.kind === 'date');
  if (line?.quartz === undefined) {
    return null;
  }

  /*
   * 盒高必须与 `DateStamp` 真正渲染出来的高度**逐点相等** —— `glyphHeight` 是字形层
   * 唯一的高度来源，这里跟着它取，竖排机位旋转 90° 之后的外接矩形才不会差一截
   * （差一截的表现是"贴边的竖排日期压出了照片窗口"，而 `resolveDateSpot` 会以为还放得下）。
   */
  const fontPx = dateEngineFontPx(dateEngine.glyphStyle, layout.width);
  const boxHeight = glyphHeight(dateEngine.glyphStyle, fontPx);
  const inset = Math.max(2, Math.round(layout.width * timestamp.insetRatio));
  const placement = resolveDateSpot(
    dateEngine.spot,
    layout,
    { width: line.quartz.width, height: boxHeight },
    inset,
  );

  return { quartz: line.quartz, color: line.color, placement };
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

/*
 * v1.8.6 · 契约 §2：组件本体改名 `FilmCompositorImpl`，外面用 `memo` 导出同名
 * `FilmCompositor`（**导出名不变**，调用方一行不用改；`FilmCompositorProps` /
 * `planWatermark` / `planInPhotoDate` 等导出也保持原样）。
 *
 * 为什么必须改名：`memo()` 包的是"组件实现"，导出的是"记忆化后的组件"，
 * 两者是两个值，得分开命名 —— 否则只能 `export function` 之后再 `export const`
 * 重名赋值，类型上绕不过去。
 *
 * **函数体一行没动**：本版只在外面加这一层包装（父级重渲染时 `stage` 等 props
 * 引用没变就整棵合成树 bailout）。注意既有探针里有按文本搜
 * `function FilmCompositor` 的锚点 —— `FilmCompositorImpl` 仍然包含这个前缀，
 * 但如果哪天改成别的名字，那些探针会一起报红。
 */
function FilmCompositorImpl({
  stage,
  viewShotRef,
  onLayout,
  onImageLoad,
  timestampFontFamily,
  frameVariant = 'archival',
  /*
   * 日期引擎缺省 = 设置层那一份（**不是**再写一遍字面量）：老调用方（导入链路、
   * 探针）一行不改就和 v1.7.0 逐像素一致，而设置页与成片永远是同一个对象。
   */
  dateEngine = DEFAULT_SETTINGS.dateEngine,
  /*
   * 外观种子缺省 0：老调用方拿到的仍然是一套**确定**的颗粒 / 微尘分布
   * （绝不用 `Math.random()` 兜底 —— 那会让同一张照片每次显影都不一样）。
   */
  lookSeed = 0,
  presentation = 'preview',
  style,
}: FilmCompositorProps) {
  const { layout, preset, frame, rawUri, capturedAt } = stage;

  /*
   * 渲染只读这里算好的结果，不再自己判断：
   * - `overlayUri`：重曝的第二张，空串 / null 都当没有；
   * - `windowRect`：照片与整条调色 / 颗粒 / 暗角管线的裁剪边界，就是相框的镂空窗口。
   *   （名字不叫 `window` 是为了不遮蔽 RN 里的全局 `window`。）
   */
  const overlayUri = nonEmptyUri(stage.overlayUri);
  const overlayOpacity = overlayOpacityOf(stage.overlayOpacity);
  const windowRect = layout.window;
  /*
   * v1.8.1 无相框（`00 NO FRAME`）：相纸与材质整组不画。
   *
   * 这一档的 `layout.window` 就是整块画布（全铺窗口），照片自己填满 `layout`，
   * 再叠一张纸 PNG 等于在画面外圈一圈白边 —— 那就不是"无相框"。
   * 判据只看 `frame.fullBleed`：窗口是否全铺**不能**当判据（老相框的窗口
   * 在某些比例下也会几乎铺满），这个标志位是 `frames.ts` 里写死的契约。
   *
   * ⚠️ 计数联动：相纸那张 `<Image>` 是 `countStageImages()` 里 `2 + …` 的一份，
   * 这里不画它就少一次 `onLoad`，`useFilmStage.mount` 必须同步 −1，
   * 否则每次快门都白等到 `READY_TIMEOUT_MS`。
   */
  const fullBleed = frame.fullBleed === true;

  /*
   * ── v1.8.5 模块一（用户 m02760）：黑边根治 / 内窗立体投影 / 成片导出衬底 ──────
   *
   * 1. `innerWindow`：内窗容器矩形**取整**。照片是整像素位图，容器带小数时
   *    iOS 的亚像素布局会让右侧 / 底侧漏出容器底色 1~2px —— 老实现底色是黑，
   *    成片上就是一条突兀的黑线。取整 + 图片外扩 2px + 纸色底，三件事一起做。
   * 2. `innerShadows`：相纸厚度投在照片上的微阴影（顶部 6px / 左侧 4px，358pt 基准等比）。
   * 3. `printCushion` + `cushionColor`：成片导出时相纸外围的窄边衬底与底部悬浮阴影，
   *    让相纸"像一张真正拿在手里的塑料卡纸"（颜色 = 相纸 base 压暗 6%）。
   */
  const frameMaterial = useMemo(() => findFrameMaterial(frameVariant), [frameVariant]);
  const innerWindow = roundInnerWindow(windowRect);
  const innerShadows = planInnerWindowShadows(Math.min(layout.width, layout.height));
  const printCushion = planPrintCushion(layout.width, layout.height);
  const cushionColor = mixHexColor(frameMaterial.base, '#000000', 0.06);
  /*
   * 展示模式（v1.8.5 模块一）：只有成片导出（'print'）才套衬底 + 悬浮阴影。
   * 缺省 'preview' 保持 v1.8.4 观感（相纸顶满画布）——老调用方与裸探针逐像素不变；
   * `00 NO FRAME` 没有相纸，print 也不套（否则全幅画面被缩一圈）。
   */
  const printMode = presentation === 'print' && !fullBleed;
  /*
   * ── v1.8.8（用户 m05280「成片糊」）：底板照片的渲染盒，必须由照片与自叠层共用 ────
   *
   * `kind:'photo'` 的调色层（对比度自叠 / S-Curve）是"同一张原图再画一遍 + 混合"，
   * 所以副本与底板必须逐点重合。以前副本直接用 `StyleSheet.absoluteFill`（= 窗口容器
   * 内容盒，比照片盒小 1pt、少 2px），两层之间就有了 ≈1.2% 的缩放差：在 2268px 的成片
   * 画布上，窗口边缘的重影约 10px。v1.8.7 的 S-Curve 在 9 卷全开（0.24~0.42），
   * 于是每个预设的成片都糊成一片；取景器滤掉 photo 层，所以看着还是锐的。
   * 现在两边共用同一个 style 对象 —— 一个像素都不许差。
   * `00 NO FRAME` 没有内窗，照片照旧铺满舞台，自叠层也铺满。
   *
   * 照片向外冗余 2px（left/top −1、宽高 +2）是 v1.8.5 的防黑边保险
   * （内窗容器取整后的亚像素误差由照片自己盖住），这里原样保留；自叠层跟着同盒，
   * 所以它也同样盖住那 1px —— 不会再出现"副本比底板小一圈"的重影。
   */
  const photoBoxStyle: ImageStyle = fullBleed
    ? { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }
    : {
        position: 'absolute',
        left: -1,
        top: -1,
        width: innerWindow.width + 2,
        height: innerWindow.height + 2,
      };
  /**
   * 相纸圆角（v1.8.5 模块一）：`FrameSpec.skin.cornerRadius` 按短边 358pt 基准换算，
   * 内层内容层（缩放前坐标系）与外层衬底（缩放后坐标系）各算一次 ——
   * 等比缩放不改变「圆角随短边等比」的观感，两层算出来的视觉半径一致。
   * `00 NO FRAME` / 非 print 展示没有衬底，半径恒 0。
   */
  const paperRadius = printMode ? paperCornerRadius(layout.width, layout.height, frame.skin) : 0;
  const paperOuterRadius = printMode
    ? paperCornerRadius(printCushion.width, printCushion.height, frame.skin)
    : 0;
  /** 相纸包装层的定位与阴影；非 print 展示只是铺满画布的透明容器（不改任何相位）。 */
  const paperBoxStyle: ViewStyle = printMode
    ? {
        left: printCushion.left,
        top: printCushion.top,
        width: printCushion.width,
        height: printCushion.height,
        // 阴影需要一层不透明背景才在 iOS 上成立：这里铺衬底色，纸 PNG 盖在上面。
        backgroundColor: cushionColor,
        // 衬底的圆角跟着纸走（缩放后坐标系），否则纸角是圆的、垫底的方角露在下面。
        borderRadius: paperOuterRadius,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      }
    : { left: 0, top: 0, width: layout.width, height: layout.height };
  /** 相纸内容层：print 时按 `printCushion.scale` 绕左上角等比缩放，其它情况原样铺满。 */
  const paperContentStyle: ViewStyle = printMode
    ? {
        width: layout.width,
        height: layout.height,
        transform: [{ scale: printCushion.scale }],
        transformOrigin: 'left top',
        /*
         * 圆角必须**连相框 PNG 一起**裁：只给外层衬底圆角，PNG 的直角会从上面盖回来，
         * 成片四角仍是方的。内容层（缩放前坐标）带圆角 + overflow:hidden，
         * 缩放后视觉半径正好再乘 `printCushion.scale`，与取景器 `FramePreviewLayer`
         * 同一口径（两边都调 `paperCornerRadius`）。
         */
        borderRadius: paperRadius,
        overflow: 'hidden',
      }
    : { width: layout.width, height: layout.height };

  // 截图尺寸：预设的 captureLongEdge 决定成片长边有多少像素。
  /*
   * 这是 `captureRef` 尺寸的**唯一注入点**：react-native-view-shot 5.1.0 的
   * `ViewShotRef.capture()` 不接受参数，组件内部读 `optionsRef.current`
   * （`lib/index.js:143-149`），所以尺寸只能经由这个 `options` prop 传下去。
   * `planCapture().options` 里的 `width/height` 单位是**点**（= 目标像素 ÷ PixelRatio，
   * 见 `captureOptions.ts`），iOS `UIGraphicsImageRendererFormat.scale = 0` 会按真像素重绘
   * —— 照片重采样、日期矢量、相框 PNG 都是 1:1，不存在 ViewShot 侧的额外降采样。
   */
  const captureOptions = useMemo(
    () =>
      planCapture({
        width: layout.width,
        height: layout.height,
        targetLongEdge: preset.captureLongEdge,
      }).options,
    [layout.width, layout.height, preset.captureLongEdge],
  );

  /*
   * 排版的输入先收成一个对象，再由**两个**纯函数消费：
   * - `planWatermark` → 白边那一行的字（地名 / 代号，画内机位下日期已被摘掉）；
   * - `planInPhotoDate` → 画内机位的日期盒子（白边机位下返回 `null`）。
   * 两者共用同一份输入与同一份算术，所以"日期字号 / 字距在两处对不上"不可能发生。
   */
  const watermarkInput = useMemo<WatermarkPlanInput>(
    () => ({
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
      dateEngine,
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
      dateEngine,
    ],
  );

  const pieces = useMemo(() => planWatermark(watermarkInput), [watermarkInput]);
  const inPhotoDate = useMemo(() => planInPhotoDate(watermarkInput), [watermarkInput]);

  return (
    <ViewShot
      // 截图目标：iOS 的 renderInContext 要求视图真的在屏幕上（CameraScreen 会铺一层显影遮罩挡住它）
      ref={viewShotRef}
      options={captureOptions}
      // 不用也不能传 collapsable：ViewShot 组件内部已经写死 collapsable={false}
      // （防止 Android 展平这个视图导致截不到），而且它不透传任何未声明的 props。
      style={[
        styles.stage,
        {
          width: layout.width,
          height: layout.height,
          // 成片导出的"桌面"：相纸外圈衬底色（相纸 base 压暗 6%）。
          // 无相框（00 NO FRAME）与 preview 展示仍是 v1.8.1 的黑舞台。
          backgroundColor: printMode ? cushionColor : '#000000',
        },
        style,
      ]}
      onLayout={onLayout}
    >
      {/*
        ④ 导出衬底包装层（v1.8.5，用户 m02760「3D 实体相纸」的最后一块）：
        相纸不再顶满画布 —— 外面留一圈窄边衬底，底部打真实悬浮阴影。
        用**等比缩放整张相纸内容**（照片窗口 / 相框 PNG / 皮肤 / 水印全在里面）实现，
        所以照片与文字的相位一起缩放，不会出现"纸小了、字没跟着小"。
      */}
      <View pointerEvents="box-none" style={[styles.paper, paperBoxStyle]}>
        <View style={paperContentStyle}>
      {/* ① 画面：照片铺进相框的镂空窗口，调色 / 颗粒 / 暗角都关在这个窗口里 */}
      <View
        style={[
          styles.window,
          {
            /*
             * v1.8.5 内窗黑边根治（用户 m02760 第一条投诉）：
             * · 四值取整 —— 位图整像素 vs 容器亚像素的黑缝从结构上消失；
             * · 底色 = 相纸色（**严禁 #000**）—— 万一还有 1px 偏差，漏出的是纸不是黑线；
             * · 1px 极柔和纸张高光切边（顶/左/底/右同一圈），删除深色内框线。
             * `fullBleed`（00 NO FRAME）没有相纸：不铺相纸色、不画切边、不取整。
             */
            left: fullBleed ? windowRect.left : innerWindow.left,
            top: fullBleed ? windowRect.top : innerWindow.top,
            width: fullBleed ? windowRect.width : innerWindow.width,
            height: fullBleed ? windowRect.height : innerWindow.height,
            ...(fullBleed
              ? null
              : {
                  backgroundColor: frameMaterial.base,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.65)',
                }),
          },
        ]}
      >
        <Image
          source={{ uri: rawUri }}
          style={photoBoxStyle}
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
            /*
             * v1.8.8（用户 m05280）：第二张底片与第一张用**同一个盒**。
             * 以前这里是 `styles.fill`（窗口容器的内容盒，比照片盒小 2pt），
             * 两张底片叠在一起时就会有 ≈1.2% 的缩放差 —— 重曝成片整体发虚。
             * 语义上它本来就是"两张底片叠在同一格上晒一次"，盒必须逐点相同。
             */
            style={[photoBoxStyle, { opacity: overlayOpacity }]}
            resizeMode={frame.photoFit === 'contain' ? 'contain' : 'cover'}
            onLoad={onImageLoad}
            fadeDuration={0}
          />
        ) : null}
        {/*
          调色 / 质感 / 光学管线（v1.8.0）：**整条交给 `FilmLookLayers`**。

          以前这里是自己 `layers.map(GradeLayerView)`，那条分支只认 `kind`，画不出
          `blurRadius`（微柔焦）与 `offsetX/offsetY`（真泛光），`photo` 层也不挂 `onLoad`。
          结果是"预设里配了柔焦 / 泛光，成片上一点变化都没有"，而且
          `countStageImages()` 按 `2 + texture + photo` 开的等待门会少一张图。
          现在渲染只有一个主人：`planFilmLooks(preset, 'composite')` 与
          `buildGradeLayers(preset)` 是同一份图层（见 `utils/gradeLayers.ts`），
          所以色层 / 质感层的画面与之前逐点相同，而 photo 层终于按参数生效。

          `surface="composite"` 才包含 `kind:'photo'` 层与微尘；取景器那边传的是 `'live'`。
          `seed={lookSeed}` 必须与取景器实时预览传同一个值（`CameraScreen` 的 `LOOK_SEED`），
          否则颗粒相位与微尘位置对不上 —— "取景器里看到的和洗出来的不是同一张"。
          `onPlateLoad` 接到宿主同一个就绪计数器上：每一张叠图恰好报一次，
          绝不能出现第二个计数源（口径见 `countStageImages()` 的注释）。
        */}
        <FilmLookLayers
          preset={preset}
          width={windowRect.width}
          height={windowRect.height}
          surface="composite"
          seed={lookSeed}
          photoUri={rawUri}
          photoFit={frame.photoFit === 'contain' ? 'contain' : 'cover'}
          /*
           * v1.8.8（用户 m05280）：自叠副本必须与底板照片同盒 —— 传照片自己的样式，
           * 而不是让它退回 `StyleSheet.absoluteFill`（那会差 ≈1.2% 缩放 + 1pt 偏移，
           * 在成片上就是窗口边缘 ≈10px 的重影 = "成片糊"）。
           */
          photoBoxStyle={photoBoxStyle}
          onPlateLoad={onImageLoad}
        />
        {!fullBleed ? (
          <>
            {/*
              内窗立体投影（v1.8.5，用户 m02760 §一.2）：相纸厚度投在照片上的微阴影。
              v1.8.7 模块二修正：顶部原来是 6pt、0.28 的黑灰渐变 —— 在成片上就是一条
              "照片顶部的生硬黑灰带"（用户明确要删掉）。现在缩到 **≤2pt、0.12**，
              只留一丝"纸压着照片"的立体感，不再压暗画面顶部。
              左侧 4px 0.16 保留：它不是用户投诉的那条带，且只在左边缘 4pt 内。
              按 358pt 参考短边等比缩放（`planInnerWindowShadows`）。
              画在窗口容器最上层 —— 它是"纸压着照片"的光，不是滤镜，所以必须在调色/颗粒之后。
              没有相纸（00 NO FRAME）就没有这道投影。
            */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0, 0, 0, 0.12)', 'rgba(0, 0, 0, 0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.innerShadowTop, { height: Math.min(2, innerShadows.top) }]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0, 0, 0, 0.16)', 'rgba(0, 0, 0, 0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.innerShadowLeft, { width: innerShadows.left }]}
            />
          </>
        ) : null}
      </View>

      {/*
        ② 相框：PNG 与 layout 必须同版。朝向**从 `layout` 反推**，不在这里重判一次横竖：
        `stage` 里没有原图像素尺寸（`rawUri` 只是字符串），而布局是上游按同一次选择算好的
        —— 判两次就可能出现"布局按横版算、PNG 铺了竖版"的错位。

        ⚠️ 这段注释以前写的是"横构图（原图 width > height）且相框有横版变体时换成横版 PNG…
        这一行对现有四款相框（都还没有 `landscape`）是零行为变化"，**两句都已不成立**，留着会
        误导下一轮排查：
        · 现有 5 款相框里有 **4 款真的带 `landscape` 变体**（`polaroid-600` / `instax-mini` /
          `neg-135` / `slide-mount`，见 `constants/frames.ts`；只有 `fp100c` 没有），
          "都还没有"是当时凭印象写的；
        · 上游 `resolveFrameOrientation` 现在**恒返回 `'portrait'`**，所以**永远走不到横版分支**。
        · 真机上"横图缩在相纸一角、另一侧一条大白边"正是这里选错版的后果：横版 PNG 是竖版
          纸转 90° 出来的，窗口坐标跟着转，`polaroid-600-landscape` 的 `window.x = 0.219626`
          意味着画面区被推到纸的右侧、左边留一条 376px 竖白边 —— 和"宽下巴转到侧边"是同一个病。
          朝向钉死之后这条路径不可达，但**相框数组仍保留横版变体**：所以这里不能顺手改成直接
          `frame.source`，否则哪天朝向开关被放开，PNG 与 layout 又会各走一边。反推逻辑留着，
          它现在是"永远推出竖版"的保险丝，而不是死代码。

        v1.8.1：整块（相纸 + ②b 皮肤）挂在 `!fullBleed` 这个渲染门后面 —— 无相框模式下
        没有纸可贴，画了反而是"照片外面多一圈白边"。守卫在**第一个** `<FrameSkin` 之前。
      */}
      {!fullBleed && (
        <>
          <Image
            source={frameSourceOf(frame, frameOrientationOfLayout(frame, layout))}
            style={[styles.frame, { width: layout.width, height: layout.height }]}
            resizeMode="stretch"
            onLoad={onImageLoad}
            fadeDuration={0}
          />

          {/*
            ②b 相框皮肤（v1.7.0；v1.8.5 扩成程序化相纸）。挂在相框 PNG **之后** = 盖在纸面上；
            水印在它之后画，所以日期与地名永远压在皮肤之上。
            · `window` 必须是 `windowRect`（不是相框数据里的归一化窗口）——
              皮肤要严格对齐**已经取整过的**那一个矩形，否则边上会露半像素照片。
            · `seed` 仍按 `frameSkinSeedOf(frame)` 传，但 v1.8.3 起皮肤不读随机；v1.8.5 仍不读，
              保留是为了不动三个调用点的冻结契约。
            · `skin` 是 v1.8.5 的程序化数据（圆角 / 枕形压边 / 下巴压痕 / 齿孔 / 帧号）。
              预览 `FramePreviewLayer` 与抽屉 `FilmDrawer` 喂的是同一份 `frame.skin`。
            · v1.8.1：`fullBleed` 下与相纸一起不画 —— 没有纸，皮肤画上去就是
              "花纹印在画面上"。同一个渲染门，不另开一处判断。
          */}
          <FrameSkin
            width={layout.width}
            height={layout.height}
            window={windowRect}
            variant={frameVariant}
            seed={frameSkinSeedOf(frame)}
            /* v1.8.5：程序化相纸细节（圆角 / 枕形压边 / 下巴压痕 / 135 齿孔 / 帧号）。
               与 `FramePreviewLayer` 喂同一份 `frame.skin`，预览与成片共用同一批纯函数。 */
            skin={frame.skin}
          />
        </>
      )}

      {/* ③ 水印（日期 + 定位，一次画完） */}
      {pieces.map((piece) => {
        const fontFamily = preset.timestamp.fontFamily ?? timestampFontFamily;
        /*
         * v1.8.5 模块四：地名 / 代号行按**地名语言**换字体 —— 日文 = iOS 明朝体
         * `Hiragino Mincho ProN`（写真集韵味）、英文 = `Menlo`、中文 = 日期字体
         * `undefined`（走预设 / 系统等宽兜底）。日期行**不换**：日期字形是灯丝管线，
         * 换字体等于换一套发光几何，不能跟着地名语言走。
         */
        const pieceFontFamily =
          piece.kind === 'place' || piece.kind === 'code'
            ? watermarkPlaceFont(placeFontLocaleOf(stage.locale)) ?? fontFamily
            : fontFamily;
        /*
         * 文字行的辉光仍看预设那一栏（`preset.timestamp.glow`）：它管的是**地名 / 代号**
         * 压照片时要不要发同色光。日期的发光色**不在这里** —— 那是日期引擎的 `glow`
         * （`dateEngine.glow`，5 档灯丝配方），由 `<DateStamp/>` 自己读，
         * 两种"发光"是两件事：一个是文字投影，一个是像素字形的灯丝 / 晕染层。
         */
        const text = stampTextStyle(piece, pieceFontFamily, preset.timestamp.glow);

        // 纯文字行（地名 / 摄影代号 / 日期关掉时的纯文字）
        if (piece.quartz === undefined) {
          /** 三个片段共用的定位：两层文字必须**逐字相同**，否则会出现重影。 */
          const position = {
            left: piece.left,
            right: piece.right,
            bottom: piece.bottom,
            maxWidth: piece.maxWidth,
            textAlign: piece.textAlign,
          } as const;
          if (!fullBleed) {
            return (
              <Text
                key={piece.key}
                allowFontScaling={false}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.stamp, position, text]}
              >
                {piece.text}
              </Text>
            );
          }
          /*
            00 NO FRAME：地名 / 代号是**白字压在照片上**，浅色画面里根本读不出来。
            v1.8.7 模块四：叠两层 —— 底层只负责"全向暗影"（大半径黑晕 + 微小下偏），
            顶层是白字本体 + 一圈贴边实影。
            RN 的一个 `<Text>` 只能带一组 `textShadow*`，所以"双层"必须真的是两个
            `<Text>`；两层共用同一个 `position`（绝对定位 + 同一个 maxWidth），
            因此文字逐像素重合，暗影只从字边渗出来。
          */
          return [
            <Text
              key={`${piece.key}-halo`}
              allowFontScaling={false}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.stamp, position, noFrameHaloStyle(piece, text)]}
            >
              {piece.text}
            </Text>,
            <Text
              key={piece.key}
              allowFontScaling={false}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.stamp, position, noFrameFaceStyle(piece, text)]}
            >
              {piece.text}
            </Text>,
          ];
        }

        /*
          只有七段日期（split / stacked / dateOnly）：**固定宽度的独立容器**。
          宽度来自 `dateStampWidth()`（`utils/watermarkTypography.ts`，v1.7.0 起字宽
          算术的唯一归口），不是量出来的 —— 这就是"日期再也不会被截断"
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
              <QuartzPiece
                piece={piece}
                fontFamily={fontFamily}
                dateEngine={dateEngine}
                canvasWidth={layout.width}
                haloShadow={fullBleed}
              />
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
            <QuartzPiece
              piece={piece}
              fontFamily={fontFamily}
              dateEngine={dateEngine}
              canvasWidth={layout.width}
              haloShadow={fullBleed}
            />
          </View>
        );
      })}

      {/*
        ③b 画内机位的日期（v1.8.0 · 模块四）。

        它**不进** `pieces` 数组：那个数组里的每一块都是"贴着白边 / 水印区边缘摆的字"，
        而画内日期的坐标是 `resolveDateSpot()` 按照片窗口算出来的绝对盒子
        （含竖排档的 90° 旋转），两套坐标空间不同。

        为什么画在**舞台层**而不是塞进 ① 的窗口容器里：窗口容器是 `overflow: hidden`
        的，塞进去要多做一次坐标减法，而且一旦 `resolveDateSpot` 把日期放到窗口外
        （只有"退化到白边"那一档，那时 `region === 'strip'`），裁剪会把它整个吃掉。
        画在舞台层 + `resolveDateSpot` 的边界内缩保证 = 它永远落在照片窗口内。

        `box` 给的是**未旋转**文本盒的左上角，旋转角由 `<DateStamp/>` 自己按 `spot` 转
        （绕中心），所以"竖排日期贴左下角"的几何与 `resolveDateSpot` 算出的
        `placement.bounds` 是同一份数据算出来的两个视角。
      */}
      {inPhotoDate !== null ? (
        <DateStamp
          key="date-in-photo"
          quartz={inPhotoDate.quartz}
          color={inPhotoDate.color}
          fontFamily={preset.timestamp.fontFamily ?? timestampFontFamily}
          glyphStyle={dateEngine.glyphStyle}
          glow={dateEngine.glow}
          spot={dateEngine.spot}
          canvasWidth={layout.width}
          box={{ left: inPhotoDate.placement.box.left, top: inPhotoDate.placement.box.top }}
        />
      ) : null}
        </View>
      </View>
    </ViewShot>
  );
}

/**
 * v1.8.6 · 契约 §2：导出的就是这层 `memo`（默认浅比较）。
 *
 * 浅比较意味着：只有 `stage` 引用、`viewShotRef`、`onLayout` / `onImageLoad`、
 * 那几个配置项（字体族 / 相框变体 / 日期引擎 / 种子 / 展示模式 / style）里
 * 任何**一个引用**变了才会重渲染。`stage` 每次 mount 都是新对象（必须重渲染）；
 * 三个回调来自 `useFilmStage` 的稳定 `useMemo`，不会白白让 memo 失效。
 */
export const FilmCompositor = memo(FilmCompositorImpl);

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

/** 00 NO FRAME 地名暗影色（v1.8.7 模块四，与用户规范逐字一致）。 */
const NO_FRAME_HALO_COLOR = 'rgba(0, 0, 0, 0.82)';

/**
 * 00 NO FRAME 地名的**底层**：只负责全向暗影。
 *
 * 半径按排版字号等比放大（0.75 em）：用户在设备预览上要的是「radius 6」，而画布
 * 宽度从 358pt 到 2048pt 都走同一段代码 —— 写死 6 在成片上等于没阴影，所以换算
 * 成字号比例，`max(6, …)` 保证小画布上也真的有 6。
 */
function noFrameHaloStyle(piece: WatermarkPiece, text: TextStyle): TextStyle {
  return {
    ...text,
    textShadowColor: NO_FRAME_HALO_COLOR,
    textShadowRadius: Math.max(6, Math.round(piece.fontSize * 0.75)),
    textShadowOffset: { width: 0, height: Math.max(1, Math.round(piece.fontSize * 0.125)) },
  };
}

/**
 * 00 NO FRAME 地名的**顶层**：白字本体 + 一圈贴边实影 —— 让字在亮照片上仍有轮廓。
 * 底层已经给了大黑晕，这一层只补锐度，不重复加粗。
 */
function noFrameFaceStyle(piece: WatermarkPiece, text: TextStyle): TextStyle {
  return {
    ...text,
    textShadowColor: 'rgba(0, 0, 0, 0.92)',
    textShadowRadius: Math.max(1, Math.round(piece.fontSize * 0.08)),
    textShadowOffset: { width: 0, height: Math.max(1, Math.round(piece.fontSize * 0.125)) },
  };
}

/**
 * 日期片段。参数**全部**来自 `piece.quartz` 与 `piece.color`，
 * 这里不做任何判断（阴影该不该发、发什么颜色都由 `geometry.ts` 定好了）。
 *
 * 字体族是单独的参数、不塞进 `quartz`：`quartz` 装的是"排版算出来的数"，
 * 字体是"这台机器上装了哪个族" —— 混在一起会让 `geometry.ts` 那个纯函数
 * 不得不认识 `Platform`。
 *
 * 日期引擎的三个字段（`glyphStyle` / `glow` / `spot`）在这里**原样透传**：
 * 它们不参与排版（字号与机位坐标已经算进 `quartz` 和 `placement`），
 * 只决定"用哪套字形画、发什么颜色的光、要不要转 90°"。
 */
function QuartzPiece({
  piece,
  fontFamily,
  dateEngine,
  canvasWidth,
  haloShadow,
}: {
  piece: WatermarkPiece;
  fontFamily: string;
  dateEngine: DateEngineConfig;
  /** 画布宽度（逻辑点）：新路径的字号唯一来源就是它（`dateEngineFontPx`）。 */
  canvasWidth: number;
  /** 00 NO FRAME 时给日期垫双层全向暗影（见 `DateGlyphs`）。 */
  haloShadow: boolean;
}) {
  const quartz = piece.quartz;
  if (quartz === undefined) {
    return null;
  }
  return (
    <DateStamp
      quartz={quartz}
      color={piece.color}
      fontFamily={fontFamily}
      glyphStyle={dateEngine.glyphStyle}
      glow={dateEngine.glow}
      spot={dateEngine.spot}
      canvasWidth={canvasWidth}
      haloShadow={haloShadow}
    />
  );
}

const styles = StyleSheet.create({
  /** 导出衬底包装层（v1.8.5）：位置/尺寸/阴影由 `paperBoxStyle` 给，这里只给定位。 */
  paper: {
    position: 'absolute',
  },
  /** 内窗顶部内阴影的定位盒（高度由 `planInnerWindowShadows` 给）。 */
  innerShadowTop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
  },
  /** 内窗左侧内阴影的定位盒（宽度由 `planInnerWindowShadows` 给）。 */
  innerShadowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
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
