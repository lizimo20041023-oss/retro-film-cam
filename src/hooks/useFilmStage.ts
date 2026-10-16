/**
 * "合成舞台"宿主实现（对应 `src/types/index.ts` 里的 `FilmStageHost`）。
 *
 * 职责：
 * 1. `mount(input)` → 把 `<FilmCompositor />` 挂到屏幕上（setState 一次，不引起风暴）；
 * 2. `whenReady()` → 等 **onLayout 完成 + 所有图片 onLoad 完成**（两个条件都满足才能截图，
 *    否则 captureRef 会截到半张图或者空白）；
 * 3. `capture()` → 调 react-native-view-shot（Expo Go 内置）截取合成视图。
 *
 * 保守设计：
 * - 有 1500ms 兜底超时：万一某张图没触发 onLoad，也绝不会让用户卡在"显影中"；
 * - `unmount()` 会立刻 settle，避免 `await whenReady()` 永久挂住。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ViewShotRef } from 'react-native-view-shot';
import type { FilmStageHost, FilmStageInput } from '../types';
import { countStageImages } from '../utils/gradeLayers';
import { resolveGeoLocale } from '../utils/placeNames';
import { useI18n } from '../i18n';
import { useSettings } from './useSettings';

/** 兜底超时（ms）。正常情况 200~600ms 就绪。 */
const READY_TIMEOUT_MS = 1500;

/**
 * 这次合成会**多**渲染一张参与就绪计数的图（§五.3 的重曝）。
 *
 * 为什么必须在这里补上：`countStageImages`（`gradeLayers.ts`）数的是
 * "底板照片 1 张 + 相框 1 张 + 每个 `texture` 层 1 张 + 每个 `photo` 层 1 张"，
 * 而重曝是**第二张照片**（`overlayUri`），不在那个函数的知识里。
 * **计数少了不会死等**（`whenReady` 的判据是 `loadedCount >= expectedCount`，
 * 欠着也能被 1500ms 兜底放行），但那正是最坏的情况：
 * 截到只解码了一半的第二张图，成片上出现半黑的一格。
 *
 * v1.8.0 口径（本条注释原来写的"不在本次改动范围内"已过时）：
 * `countStageImages` 的 `2 + …` 里那 2 仍是"底板照片 + 相框"，但叠图份数从
 * "每个纹理层 1 张"扩展成"每个 `texture` 层 1 张 **+ 每个 `photo` 层 1 张**"——
 * 微柔焦 / 提对比 / 真泛光都是 `kind:'photo'` 的自叠层，各要一张 `<Image>`。
 * 那条口径与 `FilmLookLayers` 的渲染逐层对齐（**谁渲染谁负责报就绪**），
 * 所以这里只需要 `+ overlayUri` 这一项，没有别的要补。
 *
 * 判据必须和渲染层**逐字一致**（空串不算），否则计数和实际节点数会错开 ——
 * 多了会白等到超时，少了会截早。
 *
 * ⚠️ v1.6.1 之前这里还数"一框多图的第二格"（判据是 `frame.slots` 至少两格）。
 * 那款半格双联框已随精简相框库下线、`slots` 机制整条摘除，所以这条分支也删掉了。
 */
function countExtraStageImages(input: FilmStageInput): number {
  let extra = 0;
  if (typeof input.overlayUri === 'string' && input.overlayUri.length > 0) {
    extra += 1;
  }
  return extra;
}

/**
 * 渲染层**故意不画**的 `<Image onLoad>` 有几张（v1.8.1：目前只有无相框那一张）。
 *
 * `00 NO FRAME` 下 `FilmCompositor` 整组跳过了相纸 `<Image>`（见那边 `fullBleed`
 * 那段注释），而 `countStageImages` 的 `2 + …` 里那份"相框 1 张"是**按纸框写死**的。
 * 不减这一下，`expectedCount` 就永远比实际节点数多 1：`whenReady()` 的判据是
 * `loadedCount >= expectedCount`，于是每一次快门都要白等到 `READY_TIMEOUT_MS`
 * （1500ms）才被兜底放行 —— 功能不算坏，但每一张都慢一拍半。
 *
 * 判据必须与渲染层**逐字一致**（`frame.fullBleed === true`，不是"窗口是否铺满"），
 * 两边任何一处改了口径，这里就得跟着改。
 */
function countMissingStageImages(input: FilmStageInput): number {
  return input.frame.fullBleed === true ? 1 : 0;
}

export interface FilmStageController {
  /** 交给 `processFilmPhoto` 的宿主。 */
  host: FilmStageHost;
  /** 当前要渲染的合成数据；`null` = 没在显影。 */
  stage: FilmStageInput | null;
  /** 挂到 `<ViewShot ref={viewShotRef}>`。 */
  viewShotRef: RefObject<ViewShotRef | null>;
  /** 传给 `<FilmCompositor onLayout={...}>`。 */
  handleStageLayout: () => void;
  /** 传给合成视图里**每一张** `<Image onLoad={...}>`（照片 / 相框 / 纹理都要接）。 */
  handleStageImageLoad: () => void;
}

export function useFilmStage(): FilmStageController {
  const [stage, setStage] = useState<FilmStageInput | null>(null);
  const viewShotRef = useRef<ViewShotRef | null>(null);

  const { settings } = useSettings();
  const { localeId } = useI18n();

  /*
   * 地名语言（§五.2）在这里收口 —— 相机拍摄与相册导入重冲印**两条路径**都经过
   * `host.mount`，所以只改这一处，成片水印、就绪计数、`locale` 派生出的字距全都对齐。
   *
   * 为什么经 ref 转一手，而不是让下面的 `mount` 直接读 `settings`：
   * `controller` 是 `useMemo(..., [])` —— 稳定引用是这套就绪信号的命脉
   * （`handleStageLayout` / `handleStageImageLoad` 要跨渲染保持同一个函数）。
   * 闭包里的 `settings` 会永远停在第一帧，用户改了地名语言之后所有底片都按老语言烧字，
   * 而且这种错不报任何警告。ref 每次渲染同步一次，`mount` 读到的永远是按快门那一刻的值。
   */
  const geoLocaleRef = useRef(settings.geoLocale);
  const uiLocaleRef = useRef(localeId);
  useEffect(() => {
    geoLocaleRef.current = settings.geoLocale;
    uiLocaleRef.current = localeId;
  }, [settings.geoLocale, localeId]);

  const layoutDoneRef = useRef(false);
  const loadedCountRef = useRef(0);
  const expectedCountRef = useRef(0);
  const settledRef = useRef(false);
  const resolveReadyRef = useRef<(() => void) | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全部只操作 ref + setState（都是稳定引用），所以依赖数组为空是安全的
  const controller = useMemo(() => {
    const clearTimer = (): void => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const settle = (): void => {
      if (settledRef.current) {
        return;
      }
      settledRef.current = true;
      clearTimer();
      const resolve = resolveReadyRef.current;
      resolveReadyRef.current = null;
      if (resolve) {
        resolve();
      }
    };

    const maybeSettle = (): void => {
      if (settledRef.current) {
        return;
      }
      if (!layoutDoneRef.current) {
        return;
      }
      if (loadedCountRef.current < expectedCountRef.current) {
        return;
      }
      settle();
    };

    const host: FilmStageHost = {
      mount(input: FilmStageInput): void {
        clearTimer();
        layoutDoneRef.current = false;
        loadedCountRef.current = 0;
        expectedCountRef.current =
          countStageImages(input.preset) + countExtraStageImages(input) - countMissingStageImages(input);
        settledRef.current = false;
        readyPromiseRef.current = new Promise<void>((resolve) => {
          resolveReadyRef.current = resolve;
        });
        /*
         * 地名语言只在这里改写一次：`input.locale` 原本是**界面语言**，
         * 而水印要印的是**地名语言**（§五.2，界面日文 + 地名英文这种组合必须成立）。
         *
         * 为什么敢整份换掉（而不是另开一个字段）：`stage.locale` 在整棵树里只有
         * `FilmCompositor.planWatermark` 一个消费点，而它消费的正是"这行地名该怎么排"——
         * 地名档位（`formatResolvedPlace`）与拉丁档的字距 / 大写（`timestampTracking`）
         * 本来就是同一件事的两面。日期是七段数码管，与语言无关，不受影响。
         */
        const staged: FilmStageInput = {
          ...input,
          locale: resolveGeoLocale(geoLocaleRef.current, uiLocaleRef.current),
        };
        setStage(staged);
        // 兜底：宁可截到"可能差一张图"，也不能永远不出片
        timeoutRef.current = setTimeout(settle, READY_TIMEOUT_MS);
      },
      unmount(): void {
        clearTimer();
        settle();
        setStage(null);
      },
      whenReady(): Promise<void> {
        return readyPromiseRef.current ?? Promise.resolve();
      },
      async capture(): Promise<string> {
        const target = viewShotRef.current;
        if (!target) {
          throw new Error('合成视图还没挂载，无法截图');
        }
        return target.capture();
      },
    };

    return {
      host,
      viewShotRef,
      handleStageLayout: (): void => {
        layoutDoneRef.current = true;
        maybeSettle();
      },
      handleStageImageLoad: (): void => {
        loadedCountRef.current += 1;
        maybeSettle();
      },
    };
  }, []);

  return {
    host: controller.host,
    stage,
    viewShotRef: controller.viewShotRef,
    handleStageLayout: controller.handleStageLayout,
    handleStageImageLoad: controller.handleStageImageLoad,
  };
}
