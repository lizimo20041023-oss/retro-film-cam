/**
 * 「照片 pass」合成视图 —— v2.0.0 真胶片管线的**第一遍截图**目标。
 *
 * 背景：v1.9.x 的调色是声明式图层（`mixBlendMode` 叠色纸 / 自叠 S-Curve），
 * 它在数学上只能做"可分离混合"，永远做不出胶片的染料串色、片基灰与肩部压缩
 * （见 `_v200_contract.md` §0）。v2.0.0 改成：先把**照片单独**截成 PNG，
 * 在 JS 里查 33³ LUT + 加 halation/grain/vignette，得到"已经洗好的照片"，
 * 再让 `<FilmCompositor>` 把它当普通照片画进相框、压日期水印，最后截第二遍。
 *
 * 本组件只负责第一遍：把照片区（相框镂空窗口那块）按**成片同等像素尺寸**画出来。
 *
 * ── 为什么尺寸要算得这么麻烦 ───────────────────────────────────────────
 * pass2 里照片显示尺寸 = 相框内窗（`roundInnerWindow(window)` 取整后外扩 2px）
 * × 相纸衬底缩放（`planPrintCushion().scale`，print 展示才套）× 成片像素/点比。
 * pass1 如果跟它对不上，pass2 的 `<Image resizeMode="cover">` 会再插值一次 ——
 * 等于把辛苦渲染的颗粒又糊一遍。所以这里用**同一个 `planCapture`** 反推：
 *   成片每逻辑点的像素 = `plan.pixelWidth / layout.width`
 *   → 照片窗口像素 = 窗口逻辑尺寸 × 相纸缩放 × 每点像素
 *   → 传给 ViewShot 的点尺寸 = 像素 / `PixelRatio.get()`
 * 这样两遍的像素 1:1 对齐（允许 ±1px 取整误差）。
 *
 * ── 与 FilmCompositor 的职责边界 ────────────────────────────────────────
 * - 这里**不画**相框 / 日期 / 水印 / 颗粒纹理 / 调色层：那些在 pass2；
 * - 这里只画 `<Image>`：主照片 + 重曝第二张（`overlayUri`，按 `overlayOpacity` 叠）。
 *   重曝必须在这一遍烘进去，否则 pass2 再叠一张原图会绕过 LUT，颜色对不上。
 *
 * 就绪计数（`useFilmStage.mount` 的 `expectedCountRef`）：
 *   photo 模式 = 1（主照片）+ (有 overlayUri ? 1 : 0)
 * 错一个都会白等 `READY_TIMEOUT_MS`，见 `useFilmStage.ts` 里 `countStageImages` 的注释。
 */
import { memo, useMemo } from 'react';
import type { RefObject } from 'react';
import { Image, PixelRatio, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import type { FilmStageInput } from '../types';
import { planCapture } from '../utils/captureOptions';
import { planPrintCushion, roundInnerWindow } from '../utils/geometry';

export interface FilmPhotoStageProps {
  /** 当前这一轮的合成数据（`useFilmStage().stage`）。 */
  stage: FilmStageInput;
  /** 截图 ref（`useFilmStage().viewShotRef`）。 */
  viewShotRef: RefObject<ViewShotRef | null>;
  /** 布局完成回调（`useFilmStage().handleStageLayout`）。 */
  onLayout: () => void;
  /** 每张图加载完成（`useFilmStage().handleStageImageLoad`）。 */
  onImageLoad: () => void;
}

/** 重曝默认不透明度（与 `FilmCompositor.tsx` 的 `OVERLAY_DEFAULT_OPACITY` 同一语义）。 */
const OVERLAY_DEFAULT_OPACITY = 0.5;

function nonEmptyUri(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function overlayOpacityOf(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return OVERLAY_DEFAULT_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

function FilmPhotoStageImpl({ stage, viewShotRef, onLayout, onImageLoad }: FilmPhotoStageProps) {
  const { layout, frame, rawUri } = stage;
  const overlayUri = nonEmptyUri(stage.overlayUri);
  const overlayOpacity = overlayOpacityOf(stage.overlayOpacity);

  /*
   * 像素几何：与 `FilmCompositor` 完全同源的 `planCapture` 输入（没传 sourceLongEdge，
   * 因为那边也没传 —— 两遍必须用同一口径，否则像素比会差一档）。
   */
  const geometry = useMemo(() => {
    const plan = planCapture({
      width: layout.width,
      height: layout.height,
      targetLongEdge: stage.preset.captureLongEdge,
    });
    const fullBleed = frame.fullBleed === true;
    /** print 展示才把相纸缩一圈衬底（`00 NO FRAME` 全幅，不套衬底）。 */
    const paperScale = fullBleed ? 1 : planPrintCushion(layout.width, layout.height).scale;
    const window = roundInnerWindow(layout.window);
    /*
     * 照片盒：fullBleed = 铺满舞台；否则 = 内窗 + 每边 1px 外扩（防亚像素黑缝，
     * 与 `FilmCompositor` 的 `photoBoxStyle` 同一口径）。
     */
    const logicalWidth = fullBleed ? layout.width : window.width + 2;
    const logicalHeight = fullBleed ? layout.height : window.height + 2;
    const pixelRatio = PixelRatio.get();
    const pixelsPerPoint = plan.pixelWidth / layout.width;
    const pixelWidth = Math.max(1, Math.round(logicalWidth * paperScale * pixelsPerPoint));
    const pixelHeight = Math.max(1, Math.round(logicalHeight * paperScale * pixelsPerPoint));
    return {
      width: pixelWidth / pixelRatio,
      height: pixelHeight / pixelRatio,
      pixelWidth,
      pixelHeight,
    };
  }, [frame.fullBleed, layout.height, layout.width, layout.window, stage.preset.captureLongEdge]);

  /*
   * `format: 'png'` 是有意的：JPEG 会在"查表之前"先丢一次色度采样，
   * 33³ LUT 对色度敏感（尤其染料串色），必须无损进渲染。质量传 1（PNG 忽略该值，
   * 但 ViewShot 的选项类型要求）。
   */
  const options = useMemo(
    () => ({
      format: 'png' as const,
      quality: 1,
      result: 'tmpfile' as const,
      width: geometry.width,
      height: geometry.height,
    }),
    [geometry.height, geometry.width],
  );

  return (
    <ViewShot
      ref={viewShotRef}
      options={options}
      style={[styles.stage, { width: geometry.width, height: geometry.height }]}
      onLayout={onLayout}
    >
      <Image
        source={{ uri: rawUri }}
        style={styles.photo}
        resizeMode="cover"
        onLoad={onImageLoad}
        fadeDuration={0}
      />
      {overlayUri !== null ? (
        <Image
          source={{ uri: overlayUri }}
          style={[styles.photo, { opacity: overlayOpacity }]}
          resizeMode="cover"
          onLoad={onImageLoad}
          fadeDuration={0}
        />
      ) : null}
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  stage: {
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  photo: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
});

/**
 * 外面套 `memo` 的理由与 `FilmStageComposer` 相同：它挂在相机屏渲染树里，
 * 顶层 state（电量/定位/滑块）每变一次都会重渲染；`stage` 引用不变时不该重建截图树。
 */
export const FilmPhotoStage = memo(FilmPhotoStageImpl);
