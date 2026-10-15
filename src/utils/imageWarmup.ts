/**
 * 成片的"预热"—— 点开大图之前先把那张 2048px 的成片喂给原生图片缓存。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 大图那一屏（`Lightbox.tsx`）目前是**纯黑底 + 一张异步解码的 `<Image>`**：
 * 点击的瞬间屏幕上什么都没有，要等原生把长边 2048 的 JPEG 读盘、解码完
 * （约 2048×1536×4B ≈ 12 MB 位图）才"蹦"出来。用户报的"先黑屏约 1 秒"
 * 主要就是这一段。
 *
 * 缩略图那条路不会有这个问题，因为 400px 的缩略图**早就在屏幕上渲染过**
 * （`AlbumThumb` / `StripView`），原生缓存里已经有了。成片没有这个运气：
 * 它只在点开大图的那一刻才第一次被请求。所以这里的全部工作就是
 * **把那一次请求提前**，让点开时缓存里已经有货。
 *
 * ── 为什么放在 `utils/` 而不是做成 hook ────────────────────────────────────
 * `CameraScreen` 和 `GalleryScreen` 是两个屏幕，预热要**跨屏幕**发生，
 * 所以状态必须挂在模块上；而 React hook 是按组件实例走的，放进去反而要多写
 * 一层 Context。这里只导出两个纯函数，调用方各自用 `useEffect` 决定"什么时候调"。
 *
 * ── 诚实记录的边界 ────────────────────────────────────────────────────────
 * `Image.prefetch` 到底往哪一层缓存写（内存 / 磁盘 / 只写 URL 缓存）、
 * iOS 在内存告警时会不会把它清掉，都不由我们决定，各版本 RN 行为也不同。
 * 所以它只当**加速**用：缓存命中就白赚一次即时出图，没命中也不比现在更糟。
 * 真正兜住黑屏的是 `Lightbox` 里那层缩略图垫底（见那个文件）。
 */
import { Image } from 'react-native';

/** 正在预热的 uri。用来吃掉重复请求 —— 同一张图连续预热两次纯属白烧 CPU。 */
const inFlight = new Set<string>();

/**
 * 预热失败过的 uri（含"这个 uri 文件已经不在了"）。
 * 记下来是为了不再重试：文件被删掉之后，每次进相册都重试一遍只会一直失败。
 */
const failed = new Set<string>();

/**
 * 预热。
 *
 * `uris` 按**紧迫程度**排序：最可能马上被看的那张放最前面，后面的当作"相邻的几张"。
 * 只取前 `limit` 个（默认 3）—— 每张成片解码后是约 12 MB 的位图，
 * 一次预热太多张等于把内存直接交给系统去回收。3 张 = 当前 + 左右各一张，
 * 已经覆盖"点开之后往两边翻"这件事。
 *
 * **刻意不 await、也不返回 Promise**：预热是后台行为，调用方没有任何结果要处理。
 * 原生那边的查找与解码都在别的线程上跑，所以这里连发几个不会卡住当前这一帧。
 */
export function warmImageCache(uris: readonly string[], limit = 3): void {
  let started = 0;
  for (const uri of uris) {
    if (started >= limit) {
      return;
    }
    if (uri.length === 0 || inFlight.has(uri) || failed.has(uri)) {
      continue;
    }
    inFlight.add(uri);
    started += 1;
    Image.prefetch(uri)
      .then((ok) => {
        // `prefetch` 是"尽力而为"：文件不在了、格式解不开都会走到 false。
        // 只有明确的 false 才记进 failed；异常和 true 都只把 in-flight 标记撤掉，
        // 让下一次还有机会再试（异常多半是暂时的，记死反而会把能用的图片永久拉黑）。
        if (!ok) {
          failed.add(uri);
        }
      })
      .catch(() => {
        // 预热失败对用户是**完全不可见**的：真正的 `<Image>` 到点还是会去加载它。
        // 所以这里不弹提示、不打日志，只把标记清掉。
      })
      .finally(() => {
        inFlight.delete(uri);
      });
  }
}

/**
 * 把预热推到"当前这一帧画完之后"再开始。
 *
 * 为什么需要：`Image.prefetch` 里原生那一段 `RCTImageCache` 查找是**同步**的，
 * 在刚点完缩略图、正要挂载相册页的那一帧里连发三个，会把这一帧往后推。
 * 延后 0ms 已经足够让浏览器先提交这一帧 —— 这里要的从来不是"更早开始解码"，
 * 而是"别挡着点击之后那一帧"。
 *
 * 返回取消函数：调用方在 `useEffect` 的清理里调它，避免组件已经卸载了
 * 还去预热一批没人要看的图。
 */
export function scheduleWarmImageCache(uris: readonly string[], limit = 3): () => void {
  const timer = setTimeout(() => {
    warmImageCache(uris, limit);
  }, 0);
  return () => {
    clearTimeout(timer);
  };
}
