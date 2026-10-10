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
import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ViewShotRef } from 'react-native-view-shot';
import type { FilmStageHost, FilmStageInput } from '../types';
import { countStageImages } from '../utils/gradeLayers';

/** 兜底超时（ms）。正常情况 200~600ms 就绪。 */
const READY_TIMEOUT_MS = 1500;

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
        expectedCountRef.current = countStageImages(input.preset);
        settledRef.current = false;
        readyPromiseRef.current = new Promise<void>((resolve) => {
          resolveReadyRef.current = resolve;
        });
        setStage(input);
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
