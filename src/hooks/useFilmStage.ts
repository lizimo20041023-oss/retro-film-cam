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
 *
 * v1.8.6 加固（契约 §2，只加护栏、不动计数口径与兜底语义）：
 * - `mount()` **挂载互斥**：上一轮还没 `unmount` 就又 mount（两条显影链路撞车），
 *   先幂等收掉上一轮再开新轮，不抛错；
 * - `unmount()` **幂等**：正常路径、异常 finally、相册页卸载兜底三处都会调，
 *   重复调用必须零副作用；
 * - 1500ms 兜底超时改为 `console.warn`（仅 `__DEV__`）—— 仍然放行，但不再静默；
 * - `capture()` 截图前补两帧 rAF（见 `nextFrame` 的注释）。
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
 * 等两帧（rAF，v1.8.6 · 契约 §2）。
 *
 * 为什么截图前必须等：`whenReady()` 只保证 RN 侧的 `onLayout` 与每张图的 `onLoad`
 * 都回调了，但 iOS 的**图层提交**（`CATransaction` commit → CA render server 拿到
 * 新纹理）发生在下一次 VSync。`capture()` 走的是 `drawViewHierarchyInRect`，抓的是
 * "已经提交的图层树"——在同一个 runloop tick 里连截，最容易抓到上一帧的空舞台
 * 或者只解码了一半的图（真机表现是"偶尔洗出一张黑片/半张图"，模拟器永远复现不了）。
 *
 * 为什么是**两帧**而不是一帧：一帧只跨过"RN commit → UIView 布局"，
 * 相框 PNG / 纹理层的解码结果要再等一次 VSync 才真正进纹理缓存。
 * 两帧合计 ~32ms（60Hz），相对整条显影管线（数百 ms）可以忽略。
 *
 * 嵌套写法（而不是调两次返回 Future 的 helper）是为了让"两帧"这件事在**一个函数里
 * 闭合**，调用点只有一句 `await nextFrame()`，不会出现"少写一次 await"的形态。
 */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

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
  /** 是否有一轮已经 `mount`、还没 `unmount`（v1.8.6 · 挂载互斥的判据）。 */
  const mountedRef = useRef(false);
  /**
   * 当前挂着的 stage（v1.8.6）：`capture()` 在 `controller` 的 `useMemo(..., [])` 里，
   * 闭包里读不到最新的 state，只能经这个 ref 判断"现在到底挂没挂"。
   */
  const stageRef = useRef<FilmStageInput | null>(null);
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

    /**
     * 收掉当前这一轮（v1.8.6 · 契约 §2）。
     *
     * **幂等**是它的核心语义：已经 settle / `stage` 已经 null 时再调一次，
     * 只是 `clearTimer()` 的两行空判断 + 一次 React 的 `setState(null)` bailout，
     * 不抛错、不产生额外渲染。`unmount()` 与 `mount()` 的互斥分支都走这里，
     * 保证"收轮"只有一份实现。
     */
    const teardown = (): void => {
      clearTimer();
      settle();
      mountedRef.current = false;
      stageRef.current = null;
      // 已经 null 时 React 会 bailout（同值不同引用也一样），不会多渲染一次。
      setStage(null);
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
        /*
         * v1.8.6 · 挂载互斥（契约 §2）：上一轮还没 `unmount` 就又 mount，
         * 说明两条显影链路撞在了一起（例如相册导入还没走完、用户又按了快门）。
         * 旧实现会把上一轮的 ready promise 永远晾着、还把旧 timeout 攥在手里；
         * 这里先**幂等收掉上一轮**再开新轮 —— 不抛错，语义是"后来者接管舞台"。
         * 注意必须先 teardown 再重置下面那批 ref：teardown 里的 settle() 要结算
         * 的是**上一轮**的 promise。
         */
        if (mountedRef.current) {
          teardown();
        }
        clearTimer();
        layoutDoneRef.current = false;
        loadedCountRef.current = 0;
        expectedCountRef.current =
          countStageImages(input.preset) + countExtraStageImages(input) - countMissingStageImages(input);
        settledRef.current = false;
        mountedRef.current = true;
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
        stageRef.current = staged;
        setStage(staged);
        // 兜底：宁可截到"可能差一张图"，也不能永远不出片。
        // v1.8.6 · 契约 §2：超时不再静默 —— 静默兜底的代价是"每张都白等 1.5s，
        // 而且没人知道有一张图没 onLoad"。这里只**发声**（仅 __DEV__），行为不变：仍然放行。
        timeoutRef.current = setTimeout(() => {
          if (__DEV__) {
            console.warn(
              `[filmStage] whenReady() 兜底超时 ${READY_TIMEOUT_MS}ms（READY_TIMEOUT_MS）：` +
                `layout=${layoutDoneRef.current ? 'done' : 'pending'}，` +
                `images=${loadedCountRef.current}/${expectedCountRef.current}。` +
                '仍有图片没 onLoad，按契约放行截图（成片可能缺一张图）。',
            );
          }
          settle();
        }, READY_TIMEOUT_MS);
      },
      unmount(): void {
        /*
         * v1.8.6 · 幂等卸载（契约 §2）：正常显影路径（`processFilmPhoto` 的 finally）、
         * 异常路径、以及 `GalleryScreen` 卸载时的兜底都会调它 —— 重复调用必须无副作用。
         * `teardown()` 里 settle 已经 settled 时直接 return，`setStage(null)` 已 null 时
         * React 会 bailout，所以这里不需要额外判重。
         */
        teardown();
      },
      whenReady(): Promise<void> {
        return readyPromiseRef.current ?? Promise.resolve();
      },
      async capture(): Promise<string> {
        const target = viewShotRef.current;
        /*
         * 两条都要判（v1.8.6）：`target` 为空沿用原来的"还没挂载"语义；
         * `stage` 为空则是"视图已经收掉了"—— 同一个 host 被复用（挂载互斥收轮）时，
         * 旧链路可能在这个时刻才走到 capture，必须抛错而不是截一张空舞台。
         */
        if (!target || stageRef.current === null) {
          throw new Error('合成视图还没挂载，无法截图');
        }
        /*
         * react-native-view-shot 5.1.0 的 `capture()` **不接受参数**：它内部读的是
         * `optionsRef.current`（= `<ViewShot options={...}>` 这个 prop 的最新值，
         * 见 `node_modules/react-native-view-shot/lib/index.js:143-149`）。
         * 所以尺寸口径只有一个注入点 —— `FilmCompositor` 用 `planCapture().options`
         * 算好 `width/height/quality` 传给 `<ViewShot options>`，这里直接 `capture()` 即可。
         * 不要再改成 `captureRef(ref, options)`：那个签名要求显式传 view handle，
         * 5.1.0 的 ref 上挂的 `capture` 才是"用组件 options"的官方路径。
         */
        /*
         * v1.8.6 · 契约 §2：`processFilmPhoto` 已经先 `await host.whenReady()`，
         * 但那只等到 onLoad/onLayout —— iOS 的图层提交要下一次 VSync。
         * 真正 `target.capture()` 之前补两帧（见模块级 `nextFrame` 的注释），
         * 否则真机上偶发截到空舞台/半张图。
         */
        await nextFrame();
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
