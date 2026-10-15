/**
 * 取景器上的双指捏合变焦。
 *
 * 为什么要用 `onStartShouldSetPanResponderCapture`
 * ---------------------------------------------------------------------------
 * 取景器里铺着一整层 `FrameSwitcher`（`StyleSheet.absoluteFill`），专门接管
 * 「左右滑动换相框」。它的 `onStartShouldSetPanResponder` 恒为 false，只在
 * `onMoveShouldSetPanResponder` 里判断横向位移，所以：
 *   - 第二根手指按下时，**捕获阶段（父 → 子）先问到这里**，
 *     `touches.length === 2` 就地接管，比 FrameSwitcher 快一步；
 *   - 唯一漏网的场景是"先横向滑了再放第二根手指" —— 那时 FrameSwitcher
 *     已经拿到响应权，而它的 `onPanResponderTerminationRequest` 恒为 false。
 *     属于可接受边界：想捏合就两根手指一起放下去。
 *
 * 为什么是"起始值 + log2 增量"而不是"起始值 × 倍数"
 * ---------------------------------------------------------------------------
 * `zoom` 是 0~1 的刻度，不是倍数（见 `src/constants/zoom.ts` 的文件头），
 * 而它本身已经是指数刻度（原生 `videoZoomFactor = M^zoom`）。所以手指间距
 * 翻倍 = `zoom` 加一个固定量，直接线性叠加就对了。
 * 注意不能写成 `start.zoom * k`：起始值是 0 时乘任何数还是 0，永远捏不动。
 *
 * 视觉反馈由焦段胶囊上的等效焦距读数负责 —— 捏合走的是同一个 `onChange`，
 * 读数会跟着连续变。捏合不落在任何一档上，所以胶囊上的倍率文字是"连续变焦"的读数，
 * 而不是档位标签。
 *
 * ⚠️ 捏合是**唯一**会临时造出 `zoom > 0` 的入口，而这条行程只对主摄成立
 * （`src/constants/zoom.ts` 文件头「这条行程只属于主摄」）。所以捏合的接收方
 * 有义务先把镜头钉回主摄 —— 见 `CameraScreen.handleZoomChange`。
 */
import { useMemo, useRef } from 'react';
import { PanResponder, type NativeTouchEvent } from 'react-native';

/** 两指间距翻倍时，`zoom`（0~1 刻度）加多少。 */
const PINCH_PER_OCTAVE = 0.5;

type PinchZoomOptions = {
  /** 相机没就绪 / 正在显影时为 false。 */
  enabled: boolean;
  /** 当前值（0~1 的刻度，不是倍数）。 */
  zoom: number;
  /** 量程上限（`ZOOM_MAX`）。 */
  maxZoom: number;
  onChange: (next: number) => void;
};

function distanceBetween(a: NativeTouchEvent, b: NativeTouchEvent): number {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function usePinchZoom({ enabled, zoom, maxZoom, onChange }: PinchZoomOptions) {
  /**
   * PanResponder 一次性建好（空依赖），所以回调里不能再闭包捕获 props ——
   * 拖动过程中 props 一变，手势就停在旧闭包里了。统一走 ref，每次渲染同步。
   */
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const maxRef = useRef(maxZoom);
  maxRef.current = maxZoom;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** 手势开始时的两指间距与当时的 zoom。 */
  const startRef = useRef<{ distance: number; zoom: number } | null>(null);

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (event) =>
          enabledRef.current && event.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponderCapture: (event) =>
          enabledRef.current && event.nativeEvent.touches.length === 2,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          if (touches.length < 2) {
            startRef.current = null;
            return;
          }
          startRef.current = {
            distance: distanceBetween(touches[0], touches[1]),
            zoom: zoomRef.current,
          };
        },
        onPanResponderMove: (event) => {
          const start = startRef.current;
          const touches = event.nativeEvent.touches;
          if (start === null || touches.length < 2) {
            return;
          }
          const distance = distanceBetween(touches[0], touches[1]);
          // 间距塌到 0 附近时 log2 会炸，直接忽略这一帧。
          if (start.distance < 1 || distance < 1) {
            return;
          }
          const next = start.zoom + Math.log2(distance / start.distance) * PINCH_PER_OCTAVE;
          onChangeRef.current(Math.min(Math.max(next, 0), maxRef.current));
        },
        onPanResponderRelease: () => {
          startRef.current = null;
        },
        onPanResponderTerminate: () => {
          startRef.current = null;
        },
      }).panHandlers,
    [],
  );
}
