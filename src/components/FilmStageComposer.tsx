/**
 * 合成舞台的**按需挂载门**（v1.8.6 · 契约 §2）。
 *
 * ── 它解决什么问题 ────────────────────────────────────────────────────────
 * 离屏合成器 `<FilmCompositor>` 只在"真的要洗一张照片"时才存在。以前两个挂载点
 * （`CameraScreen` 的快门显影 / `GalleryScreen` 的导入冲印）各自写
 * `stage !== null ? <FilmCompositor/> : null`，门控本身是对的，但它是**调用方的自觉**：
 * 任何一次重构成"无条件渲染"都会多挂一棵常驻的合成视图
 * （`ViewShot` + 相框 PNG + 整条图层栈），真机上持续占内存和图层。
 *
 * 这个组件把门控收进**类型与实现**：`stage: FilmStageInput | null`，
 * `null` 时直接 `return null` —— 不渲染任何原生节点（连一个 `<View>` 都不会有）。
 * 两处挂载点只要把 `stage` 原样递进来，"没在显影就不挂合成器"就不再依赖调用方。
 *
 * ── 为什么固定成片（print）展示 ───────────────────────────────────────────
 * 能走到这两个挂载点的只有"会被截进成片"的路径（快门显影 / 相册导入冲印），
 * 它们都必须走 `'print'` 展示（相纸缩进一圈衬底 + 底部悬浮阴影）。`FilmCompositor`
 * 的 `'preview'` 缺省只服务老调用方与裸探针，不该在这里被误传 —— 所以这一项
 * **不开放为 prop**，由本组件写死。
 *
 * ── 为什么外面还要 `memo` ───────────────────────────────────────────────
 * 它挂在相机屏的渲染树里（`DevelopOverlay` 的 children），相机屏顶层 state 多，
 * 一次参数滑动就会重渲染；`stage` 还是同一份引用时不该重建这棵合成树。
 *
 * ⚠️ **memo 的失效条件**（如实写在这里，别以为包了就万事大吉）：
 * `viewShotRef` / `onLayout` / `onImageLoad` 三个 prop 只要有一个每次渲染都新建，
 * 浅比较就必失败，memo 就退化成普通组件。它们必须来自 `useFilmStage`
 * 的稳定引用（`controller` 是 `useMemo(..., [])`，已经是稳定的）。
 */
import { memo } from 'react';
import type { RefObject } from 'react';
import type { ViewShotRef } from 'react-native-view-shot';
import type { DateEngineConfig, FilmStageInput, FrameVariant } from '../types';
import { SYSTEM_MONO_FAMILY } from '../hooks/useFilmFonts';
import { FilmCompositor } from './FilmCompositor';

export interface FilmStageComposerProps {
  /** 当前要渲染的合成数据（`useFilmStage().stage`）；`null` = 没在显影。 */
  stage: FilmStageInput | null;
  /** 截图用的 ref（`useFilmStage().viewShotRef`）。 */
  viewShotRef: RefObject<ViewShotRef | null>;
  /** 传给 `<FilmCompositor onLayout={...}>`（`useFilmStage().handleStageLayout`）。 */
  onLayout: () => void;
  /** 传给合成视图里每一张 `<Image onLoad={...}>`（`useFilmStage().handleStageImageLoad`）。 */
  onImageLoad: () => void;
  /**
   * 日期水印的等宽字体族。不传 = 系统等宽（`SYSTEM_MONO_FAMILY`）——
   * 与 `useFilmFonts().fontFamily` 是同一个值（v1.4.1 起不再加载自定义字体），
   * 这里的兜底只是为了让这个 prop 保持可选，不改变任何一个真实调用点的字形。
   */
  timestampFontFamily?: string;
  /** 相框风格变体（v1.7.0）。两个挂载点都必须显式传，缺省会让导入与拍摄长得不一样。 */
  frameVariant: FrameVariant;
  /** 日期引擎（v1.8.0 · 模块四）。同上，显式传，避免导入链路落到老缺省。 */
  dateEngine: DateEngineConfig;
  /** 胶片外观种子（v1.8.0 · 模块一）。不传 = `FilmCompositor` 的确定性缺省 0。 */
  lookSeed?: number;
}

export const FilmStageComposer = memo(function FilmStageComposer({
  stage,
  viewShotRef,
  onLayout,
  onImageLoad,
  timestampFontFamily = SYSTEM_MONO_FAMILY,
  frameVariant,
  dateEngine,
  lookSeed,
}: FilmStageComposerProps) {
  /*
   * 结构性硬保证（契约 §2）：`stage === null` 时**直接 return null**。
   * 这一行不是优化，是"任何路径下都不得渲染 `<FilmCompositor>`"的守卫 ——
   * 别把它改成一个空的 `<View>` 或者 `opacity: 0` 的容器：那同样会挂载原生节点。
   */
  if (stage === null) {
    return null;
  }

  /*
   * v2.0.1 起**只有一遍**：照片像素层由 `ImageManipulator` + `filmRender.ts` 在挂载前
   * 就洗好（就是 `stage.lutUri`），这里一次挂载只负责把「照片 + 相框 + 日期 + 水印」
   * 拼成成片再截一次图。v2.0.0 的 `stageMode: 'photo'`（`<FilmPhotoStage>`）分支已删除。
   */
  return (
    <FilmCompositor
      stage={stage}
      viewShotRef={viewShotRef}
      onLayout={onLayout}
      onImageLoad={onImageLoad}
      // 固定成片导出模式：能走到这里的两个挂载点都是"要被截图存盘"的路径。
      presentation="print"
      timestampFontFamily={timestampFontFamily}
      frameVariant={frameVariant}
      dateEngine={dateEngine}
      lookSeed={lookSeed}
    />
  );
});
