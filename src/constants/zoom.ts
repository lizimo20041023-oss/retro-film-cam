/**
 * 变焦行程的常量与换算。
 *
 * ## 这一层为什么存在
 *
 * `<CameraView zoom={...}>` 不是"放大 N 倍"，而是喂给原生的一段**指数行程**：
 *
 *   iOS:  device.videoZoomFactor = minZoom * pow(videoMaxZoomFactor / minZoom, zoom)
 *   And.: ratio = pow(videoMaxZoomFactor / minZoom, zoom)（源码里同一套公式）
 *
 * 也就是说 `zoom = 0` 是这颗镜头的原生视场，`zoom = 1` 才是"该格式的最大数码变焦"。
 * 这里刻意**不**把 UI 暴露成绝对倍率：`videoMaxZoomFactor` 从 JS 侧读不到
 * （expo-camera 没有暴露），只能假定一个值，任何"绝对倍率"都是假的。所以对外只有
 * 一条抽象的 0~`ZOOM_MAX` 行程，UI 上另有一个百分比读数。
 *
 * 另一个必须记住的性质：`zoom` 是**设备级**的，预览流和拍照走同一个 `videoZoomFactor`，
 * 所以"取景器里看到的构图 = 存下来的构图"，不存在按下快门瞬间跳变的问题。
 *
 * ## 为什么上限是 0.75 而不是 1
 *
 * 假定 `videoMaxZoomFactor = 16`（见 `lenses.ts` 里 `ASSUMED_MAX_ZOOM_FACTOR` 的注释），
 * 行程 1.0 意味着 16 倍数码变焦 —— 像素级糊掉，对一台"胶片相机"毫无意义。
 * 0.75 大约对应 8 倍，远超实用范围但留了余量，也给 1.4× / 2× 两档留出了空间。
 *
 * ## ⚠️ 这条行程只属于主摄
 *
 * 上面那个 16 是**主摄**的 `videoMaxZoomFactor`。超广角那支通常只有 2 上下，
 * 长焦又是另一个数 —— 所以**同一个 `zoom` 值落在不同镜头上是三种完全不同的倍率**。
 *
 * 现在五档里只有 1.4× 和 2× 会写非零 `zoom`，它们都钉在主摄上；
 * 0.5× / 1× / 长焦三档一律写 `zoom: 0`（`M^0 = 1.0`，即那支镜头的原生视场，
 * 与 M 是多少无关）。捏合是唯一会临时产生 `zoom > 0` 的入口，
 * `CameraScreen.handleZoomChange` 收到捏合值时会先把镜头切回主摄那一档。
 * 完整推导在 `lenses.ts` 文件头，别绕过它。
 *
 * ## 档位制的现状（ZoomBar → 档位表）
 *
 * 早期这里给一条可拖动的连续滑轨（`ZoomBar.tsx`）用：`ZOOM_TICKS` / `zoomTickRatios()`
 * 生成轨上的刻度比例，`ZOOM_STEP` 给无障碍的 increment / decrement 用。滑轨已经没有了
 * （v1.4.0 删掉了取景器里的档位条，现在只有焦段胶囊点按循环），五档表在 `lenses.ts` 里、
 * 每档自带换算好的 zoom 字面量，所以**刻度和步进都不再需要**，
 * 只剩"夹取 + 量化 + 百分比"这三件仍然有用：
 * 捏合手势（`usePinchZoom`）依旧是连续的，它必须经过这里的 `clampZoom` / `toCameraZoom`。
 */

/** 行程下界：0 = 当前镜头的原生视场，不做任何数码放大。 */
export const ZOOM_MIN = 0;

/** 行程上界：见文件头"为什么上限是 0.75"。 */
export const ZOOM_MAX = 0.75;

/** 默认档：开机 / 翻转镜头后回到原生视场。 */
export const DEFAULT_ZOOM = ZOOM_MIN;

/** 把任意输入收回 [ZOOM_MIN, ZOOM_MAX]；非有限值落到默认档（比落到 0 语义更明确）。 */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ZOOM;
  }
  if (value <= ZOOM_MIN) {
    return ZOOM_MIN;
  }
  if (value >= ZOOM_MAX) {
    return ZOOM_MAX;
  }
  return value;
}

/**
 * 量化到 1% 再交给原生。
 *
 * `zoom` 只在 prop 变化时才写进原生，但连续捏合会产生成百上千个中间值，
 * 每个都触发一次 `lockForConfiguration()` 是纯浪费 —— 1% 的行程差异人眼也看不出。
 * 注意这是**对外**的量化；`lenses.ts` 内部给档位写死字面量时用更高精度（1e-5），
 * 免得档位在 `toCameraZoom` 里被抹平到相邻档。
 */
export function toCameraZoom(value: number): number {
  return Math.round(clampZoom(value) * 100) / 100;
}

/** 行程 → 0~100 的读数百分比，只用于取景器右下角那个放大读数。 */
export function zoomPercent(value: number): number {
  return Math.round((clampZoom(value) / ZOOM_MAX) * 100);
}
