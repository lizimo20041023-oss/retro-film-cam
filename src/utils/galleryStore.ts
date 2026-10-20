/**
 * 内置相册的存储层（纯逻辑，不碰 React —— 方便单测，也方便以后换 UI）。
 *
 * ── 为什么用「新 API」而不是 legacy（已读 node_modules 核实，不是凭记忆）────────
 * `expo-file-system@57.0.7` 的 `package.json` 里 `exports` 只有两个入口：
 *     "."        → ./build/index.d.ts        （新 API：Paths / File / Directory）
 *     "./legacy" → ./build/legacy/index.d.ts （旧 API）
 * 而主入口为了"看起来兼容"还会再导出一组**同名旧函数**：`build/legacyWarnings.d.ts`
 * 里 `getInfoAsync` / `copyAsync` / `makeDirectoryAsync` / `deleteAsync` … 每一行都写着
 *     "@deprecated … This method will throw in runtime."
 * 所以在 57 上从主入口调 `copyAsync` 不是"过时警告"，是**运行时直接抛错**。
 * 结论：全程只用新 API。新 API 完整覆盖本文件的需求（建目录 / 复制 / 删除 / 判断存在 /
 * 取大小），没有任何一处需要退回 legacy。
 *
 * ── 三件必须做对的事 ───────────────────────────────────────────────────────
 * 1. **缩略图不是可选项**。网格一屏能挂二三十张，直接解码 2048px 成片的话，
 *    每张约 2048×1536×4B ≈ 12 MB 位图；缩略图长边 400 只有约 0.9 MB，差一个数量级。
 * 2. **索引坏了不能崩**。AsyncStorage 里的 JSON 可能被手改、被半截写入、或跨版本残留，
 *    一律当空相册处理，并顺手把坏数据擦掉。
 * 3. **写盘失败不抛异常**。沿用 `settingsStore.ts` 的约定：`console.warn` + 返回失败信号，
 *    调用方自己决定怎么提示，绝不让异常冒到 React 树。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { describeError } from './describeError';

/** 索引在 AsyncStorage 里的键。改它 = 老用户的相册凭空消失，非必要不动。 */
export const GALLERY_INDEX_KEY = 'fretrocam.gallery.v1';

/** 相册目录名，挂在 document 目录下（**不**是 cache —— 系统清缓存不能把用户的照片清掉）。 */
const GALLERY_DIR_NAME = 'gallery';

/**
 * 成片长边目标的**兜底值**（像素）。
 *
 * v1.7.0 起这里不再是唯一口径：`addShot` 接受可选的 `maxLongEdge`，由调用方传
 * 用户选的画质档（`resolveCaptureLongEdge(settings.captureQuality)`），
 * 否则"用户在设置里选了极致档、回 App 相册一看还是 2048px 的小图"——
 * 档位只在 OS 相册那张生效，等于白选。
 *
 * 保留 2048 作兜底：它是标准档的值，也是老调用方（以及未来任何忘了传的调用方）
 * 得到的行为，和 v1.6.x 逐字一致。
 */
const MAIN_LONG_EDGE = 2048;

/** 缩略图长边目标（像素）。够网格清晰，又不至于把内存吃满。 */
const THUMB_LONG_EDGE = 400;

/** 只有确实需要缩尺寸或调用方没声明格式时才使用；已达标的 JPEG 会原样复制。 */
const MAIN_QUALITY = 0.92;

/** 缩略图质量。反正只是网格预览，压狠一点。 */
const THUMB_QUALITY = 0.72;

/** 一条相册记录。 */
export type GalleryShot = {
  /** 唯一 id，同时是文件名前缀（`<id>.jpg` / `<id>_thumb.jpg`）。 */
  id: string;
  /** 成片在沙盒里的 `file://` 地址。 */
  uri: string;
  /**
   * 缩略图的 `file://` 地址。
   * 正常情况下是独立的 400px 小图；缩略图生成失败时会**等于 `uri`**（降级，见 `addShot`）。
   */
  thumbUri: string;
  /** 拍摄时间（ms）。列表按它倒序。 */
  createdAt: number;
  /** 成片实际像素宽（不是逻辑点）。 */
  width: number;
  /** 成片实际像素高。 */
  height: number;
  /** 拍这张时用的相框 id，便于日后按相框筛选。 */
  frameId?: string;
  /** 拍这张时用的预设 id。 */
  presetId?: string;
};

/** `addShot` 的入参。 */
export interface AddShotInput {
  /** 成片的临时文件地址（`processFilmPhoto` 返回的那个 uri）。 */
  sourceUri: string;
  /** 源图像素宽。只用来判断该缩哪条边 —— 最终记录的尺寸以实际产物为准。 */
  width: number;
  /** 源图像素高。 */
  height: number;
  /** 拍摄时间；默认取当前时间。显式传入便于单测。 */
  createdAt?: number;
  frameId?: string;
  presetId?: string;
  /**
   * 调用方确认的源文件编码。`'jpeg'` 且尺寸已在上限内时直接复制，避免整张成片再解码、
   * 再有损编码一次；不传则保持保守路径，仍交给 ImageManipulator 统一转 JPEG。
   */
  sourceFormat?: 'jpeg';
  /**
   * App 内相册这份副本的长边上限（像素）。不传用 `MAIN_LONG_EDGE`（2048，标准档）。
   *
   * 调用方应传用户选的画质档长边。只会**缩**不会放：源图本来就比它小的时候
   * `planResize` 返回 `null`，只做一次格式转换，不会凭空上采样。
   */
  maxLongEdge?: number;
}

/** 读相册的结果：列表 + 诊断信息。 */
export interface GalleryReadResult {
  shots: GalleryShot[];
  /** 读存储失败时的原因（供 UI 诊断）。内容坏掉不算失败 —— 那种情况按空相册处理。 */
  error: string | null;
}

/* ==========================================================================
 * 串行队列：所有索引读写的唯一入口
 * ========================================================================== */

/**
 * 模块级的 promise 串行队列。
 *
 * 为什么连**读**也要排队：读取时如果发现索引脏了（坏条目 / 文件已消失），要顺手回写一次
 * 干净的索引。假如这次回写不和写操作排在同一条队上，就可能出现：
 *     listShots 读到旧索引 → 用户此时 addShot 存进新照片 → listShots 的"修复写"把新照片覆盖掉
 * 排进同一条队列后，"读→修复写"是原子的，中间插不进任何写者。
 */
let queueTail: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  // 两个分支都挂 task：前一个任务失败也必须继续跑下一个，否则一次失败就把队列卡死
  const result = queueTail.then(task, task);
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/* ==========================================================================
 * 小工具
 * ========================================================================== */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 补齐 `file://` 前缀。
 * `react-native-view-shot` 在部分 Android 版本上返回的是不带 scheme 的绝对路径，
 * 而新 API 的 `File` 构造器要的是 URI。顺手抹平这个差异，省得在 Android 上炸。
 */
function toLocalFileUri(uri: string): string {
  if (uri.startsWith('data:')) return uri;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(uri) ? uri : `file://${uri}`;
}

/** 生成 id：时间戳（保证大致有序）+ 随机后缀（保证同一毫秒内不撞）。只用 base36，天然是合法文件名。 */
function createShotId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${time}-${random}`;
}

function galleryDirectory(): Directory {
  return new Directory(Paths.document, GALLERY_DIR_NAME);
}

function ensureGalleryDirectory(): Directory {
  const dir = galleryDirectory();
  if (!dir.exists) {
    // idempotent 让"另一个瞬间也有别人建了"这种情况不算失败
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    // 索引里存了个非法路径（手改 / 跨平台迁移）：当作不存在，让它被过滤掉
    return false;
  }
}

function fileSize(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

/** 尽力删除一批文件。删不掉只警告 —— 顶多留个孤儿文件，`clearGallery` 会扫掉。 */
async function removeFiles(uris: readonly string[]): Promise<void> {
  const unique = new Set(uris);
  for (const uri of unique) {
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      console.warn('[retro-film-cam] 删除相册文件失败：', uri, error);
    }
  }
}

/* ==========================================================================
 * 图片处理
 * ========================================================================== */

/**
 * 决定该缩哪条边。返回 `null` = 不用缩放（源图已经够小，或源尺寸不可信），只转格式。
 *
 * 只给一个维度、另一个由 expo-image-manipulator 按比例算出来 —— 给两个维度会**拉伸变形**。
 * 所以必须知道源图哪条边长；这也正是 `addShot` 要求传宽高的原因。
 */
function planResize(
  width: number,
  height: number,
  target: number,
): { width?: number; height?: number } | null {
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    return null;
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= target) {
    return null;
  }
  const scale = target / longEdge;
  return width >= height
    ? { width: Math.max(1, Math.round(width * scale)) }
    : { height: Math.max(1, Math.round(height * scale)) };
}

interface RenderedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * 用 expo-image-manipulator 的**新 API** 把图片转成 jpg 并压到目标长边以内。
 * 旧的 `manipulateAsync` 在 57.0.21 的 `build/ImageManipulator.d.ts` 里明确标了
 * `@deprecated`（"replaced by the new, contextual and object-oriented API"），
 * 所以走 `manipulate` → `renderAsync` → `saveAsync` 这条链 ——
 * 和项目里既有的 `normalizePhoto.ts` 完全一致。
 *
 * 产物落在 **cache** 目录，调用方负责搬进相册目录；这里失败会直接抛，由 `addShot` 兜。
 */
async function renderToCache(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  targetLongEdge: number,
  quality: number,
): Promise<RenderedImage> {
  const context = ImageManipulator.manipulate(sourceUri);
  const resize = planResize(sourceWidth, sourceHeight, targetLongEdge);
  if (resize !== null) {
    context.resize(resize);
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/* ==========================================================================
 * 索引读写（"unsafe" = 必须在串行队列内调用，自己不能再加锁）
 * ========================================================================== */

/**
 * 把一条来路不明的数据校验成 `GalleryShot`；不合格返回 `null`。
 * 逐字段校验，而不是 `as GalleryShot` —— 索引是磁盘上的数据，随时可能是任意形状。
 */
function parseShot(value: unknown): GalleryShot | null {
  if (!isRecord(value)) return null;

  const { id, uri, thumbUri, createdAt, width, height, frameId, presetId } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof uri !== 'string' || uri.length === 0) return null;
  if (typeof thumbUri !== 'string' || thumbUri.length === 0) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) return null;

  const shot: GalleryShot = { id, uri, thumbUri, createdAt, width, height };
  // 可选字段只在确实是字符串时带上，避免把 undefined / null 塞进 JSON
  if (typeof frameId === 'string') shot.frameId = frameId;
  if (typeof presetId === 'string') shot.presetId = presetId;
  return shot;
}

interface IndexSnapshot {
  shots: GalleryShot[];
  /** 索引被清理过（有坏条目 / 有文件消失），调用方应回写一次干净版本。 */
  dirty: boolean;
  /** 读存储本身失败（区别于"内容坏了"）。 */
  error: string | null;
}

/**
 * 读索引 + 校验 + 剔除幽灵条目。**不抛异常**：
 * JSON 坏了、不是数组、字段类型不对 —— 一律当空相册，并标记 `dirty` 让调用方回写。
 */
async function readIndexUnsafe(): Promise<IndexSnapshot> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(GALLERY_INDEX_KEY);
  } catch (error) {
    console.warn('[retro-film-cam] 读取相册索引失败：', error);
    return { shots: [], dirty: false, error: describeError(error) };
  }

  if (raw === null) {
    return { shots: [], dirty: false, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('[retro-film-cam] 相册索引不是合法 JSON，已按空相册处理：', error);
    return { shots: [], dirty: true, error: null };
  }

  if (!Array.isArray(parsed)) {
    console.warn('[retro-film-cam] 相册索引不是数组，已按空相册处理');
    return { shots: [], dirty: true, error: null };
  }

  const seen = new Set<string>();
  const kept: GalleryShot[] = [];
  let dropped = false;
  for (const entry of parsed) {
    const shot = parseShot(entry);
    if (shot === null) {
      dropped = true;
      continue;
    }
    if (seen.has(shot.id)) {
      // 重复 id 会让 React key 撞车、删除时也删不干净，只留第一条
      dropped = true;
      continue;
    }
    seen.add(shot.id);
    kept.push(shot);
  }

  // 用户清了缓存 / 手动删了文件之后，索引里的记录就成了"幽灵条目"：
  // 网格里会渲染出一块永远裂开的图。读的时候就剔掉，并让调用方回写。
  const alive = kept.filter(
    (shot) => fileExists(shot.uri) && (shot.thumbUri === shot.uri || fileExists(shot.thumbUri)),
  );
  if (alive.length !== kept.length) {
    dropped = true;
  }

  alive.sort((a, b) => b.createdAt - a.createdAt);

  return { shots: alive, dirty: dropped, error: null };
}

/** 写索引。失败只警告并返回 `false` —— 由调用方决定要不要回滚。 */
async function writeIndexUnsafe(shots: readonly GalleryShot[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(shots));
    return true;
  } catch (error) {
    console.warn('[retro-film-cam] 保存相册索引失败（本次改动只在内存里生效）：', error);
    return false;
  }
}

/* ==========================================================================
 * 对外 API
 * ========================================================================== */

/**
 * 读相册，附带诊断信息。相比 `listShots` 多一个 `error` 字段，
 * 给 `useGallery` 填 `error` 状态用（`listShots` 本身永远返回数组，没地方放错因）。
 */
export async function readGallery(): Promise<GalleryReadResult> {
  try {
    return await enqueue(async () => {
      const snapshot = await readIndexUnsafe();
      if (snapshot.dirty) {
        // 在队列内回写：此刻没有并发写者，不会覆盖掉别人刚加的照片
        await writeIndexUnsafe(snapshot.shots);
      }
      return { shots: snapshot.shots, error: snapshot.error };
    });
  } catch (error) {
    console.warn('[retro-film-cam] 读取相册失败：', error);
    return { shots: [], error: describeError(error) };
  }
}

/** 相册列表，最新的在前。任何异常都被吞掉，最差返回空数组。 */
export async function listShots(): Promise<GalleryShot[]> {
  const { shots } = await readGallery();
  return shots;
}

/**
 * 把一张成片存进内置相册：复制进沙盒 → 生成缩略图 → 插到索引最前面 → 持久化。
 *
 * 返回 `null` 表示失败（**注意：签名比"只返回 GalleryShot"多了 `null`**）。
 * 这是刻意的：约定要求写盘失败绝不抛异常，而"失败"又必须让调用方看得见，
 * 那就只能把失败编码进返回值。`useGallery().add` 原样把它透出去。
 *
 * `captureRef` 当前输出 JPEG。调用方明确声明 `sourceFormat: 'jpeg'` 且真实像素尺寸已经
 * 不超过上限时，成片只复制一次；需要缩图或来源未知时才走 ImageManipulator。缩略图
 * 始终单独生成，避免网格直接解码全尺寸成片。
 */
export async function addShot(input: AddShotInput): Promise<GalleryShot | null> {
  try {
    return await enqueue(async () => {
      const sourceUri = toLocalFileUri(input.sourceUri);
      if (sourceUri.length === 0) {
        console.warn('[retro-film-cam] 存进内置相册失败：sourceUri 为空');
        return null;
      }

      const id = createShotId();
      /** 已经写进沙盒的文件；任何一步失败都要按相反顺序清掉，不留孤儿。 */
      const copied: string[] = [];
      /**
       * image-manipulator 的产物一律落在 cache 目录，而且它不会自己回收。
       * 我们把这些文件拷进相册之后就再也用不到了，不删的话用户每拍一张就永久多留两份
       * （相册里看不见，只能等系统在存储吃紧时才动手清 cache）。所以在 finally 里统一删。
       */
      const cacheFiles: string[] = [];

      try {
        const dir = ensureGalleryDirectory();
        const mainTarget = new File(dir, `${id}.jpg`);
        const thumbTarget = new File(dir, `${id}_thumb.jpg`);

        /*
         * ① 成片：长边压到「用户画质档」以内（不传就是标准档 2048）。
         * ViewShot 已经给出质量 0.98 的 JPEG；尺寸达标时直接复制，既省一次全图解码/编码，
         * 也避免再压成 0.92。只有要缩尺寸或来源格式未知时才转码。
         */
        const mainLongEdge = isPositiveNumber(input.maxLongEdge) ? input.maxLongEdge : MAIN_LONG_EDGE;
        const sourceDimensionsKnown = isPositiveNumber(input.width) && isPositiveNumber(input.height);
        const canCopyOriginal =
          input.sourceFormat === 'jpeg' &&
          sourceDimensionsKnown &&
          planResize(input.width, input.height, mainLongEdge) === null;
        let main: RenderedImage;
        if (canCopyOriginal) {
          await new File(sourceUri).copy(mainTarget, { overwrite: true });
          main = { uri: mainTarget.uri, width: input.width, height: input.height };
        } else {
          main = await renderToCache(
            sourceUri,
            input.width,
            input.height,
            mainLongEdge,
            MAIN_QUALITY,
          );
          cacheFiles.push(main.uri);
          await new File(main.uri).copy(mainTarget, { overwrite: true });
        }
        copied.push(mainTarget.uri);

        // ② 缩略图：从 ① 的产物再缩，而不是再解一次原图 —— 更快也更省内存
        let thumbUri = mainTarget.uri;
        try {
          const thumb = await renderToCache(
            main.uri,
            main.width,
            main.height,
            THUMB_LONG_EDGE,
            THUMB_QUALITY,
          );
          cacheFiles.push(thumb.uri);
          await new File(thumb.uri).copy(thumbTarget, { overwrite: true });
          copied.push(thumbTarget.uri);
          thumbUri = thumbTarget.uri;
        } catch (error) {
          // 缩略图只是为了让网格省内存。它失败就退回拿成片当缩略图 ——
          // 这一格会重一些，但"用户拍了照却在相册里看不见"是更糟的结果。
          console.warn('[retro-film-cam] 缩略图生成失败，改用成片充当缩略图：', error);
        }

        const shot: GalleryShot = {
          id,
          uri: mainTarget.uri,
          thumbUri,
          createdAt:
            typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
              ? input.createdAt
              : Date.now(),
          // 尺寸以实际产物为准，不信任调用方传进来的值
          width: main.width,
          height: main.height,
        };
        if (input.frameId) shot.frameId = input.frameId;
        if (input.presetId) shot.presetId = input.presetId;

        // ③ 索引：读最新的再插到最前面（队列保证这里没有并发写者）
        const snapshot = await readIndexUnsafe();
        const persisted = await writeIndexUnsafe([shot, ...snapshot.shots]);
        if (!persisted) {
          // 索引没写进去 = 下次启动这张照片就找不到了，等于没存成功。
          // 把刚复制的文件删掉（别留孤儿），然后明确返回失败。
          await removeFiles(copied);
          return null;
        }
        return shot;
      } catch (error) {
        console.warn('[retro-film-cam] 存进内置相册失败：', error);
        await removeFiles(copied);
        return null;
      } finally {
        // 成功、失败、提前 return 都要走这里：cache 里的中间产物一个不留
        await removeFiles(cacheFiles);
      }
    });
  } catch (error) {
    console.warn('[retro-film-cam] 存进内置相册失败：', error);
    return null;
  }
}

/**
 * 删掉一条记录和它的两个文件。成功（含本来就不存在）返回 true，失败返回 false；永远不抛。
 *
 * 顺序是**先落索引、再删文件**：反过来的话，"文件已删但索引没更新"会留下一条
 * 指向不存在文件的幽灵记录（网格里一块裂图）；而现在最坏情况只是一个孤儿文件，
 * 界面上完全看不出来，`clearGallery` 会顺手扫掉。
 */
export async function deleteShot(id: string): Promise<boolean> {
  try {
    return await enqueue(async () => {
      const snapshot = await readIndexUnsafe();
      const target = snapshot.shots.find((shot) => shot.id === id);
      if (target === undefined) {
        // 索引里本来就没有这条（可能已经删过）：只把顺手发现的脏数据回写掉
        if (snapshot.dirty) {
          return await writeIndexUnsafe(snapshot.shots);
        }
        return true;
      }
      const persisted = await writeIndexUnsafe(snapshot.shots.filter((shot) => shot.id !== id));
      if (!persisted) {
        // 索引没写成时绝不能删文件，否则下次启动会留下一条指向空文件的幽灵记录。
        return false;
      }
      await removeFiles([target.uri, target.thumbUri]);
      return true;
    });
  } catch (error) {
    console.warn('[retro-film-cam] 删除相册照片失败：', error);
    return false;
  }
}

/**
 * 清空内置相册。永远不抛。
 * 先清索引（用户看到的相册立刻是空的），再按**目录列表**删文件 ——
 * 按目录删能把"存到一半崩了"留下的孤儿文件一起扫干净，只按索引删就漏了。
 */
export async function clearGallery(): Promise<void> {
  try {
    await enqueue(async () => {
      await writeIndexUnsafe([]);
      try {
        const dir = galleryDirectory();
        if (!dir.exists) return;
        for (const entry of dir.list()) {
          try {
            entry.delete();
          } catch (error) {
            console.warn('[retro-film-cam] 清空相册时删除条目失败：', error);
          }
        }
      } catch (error) {
        console.warn('[retro-film-cam] 清空相册目录失败：', error);
      }
    });
  } catch (error) {
    console.warn('[retro-film-cam] 清空相册失败：', error);
  }
}

/**
 * 相册占用情况：条数 + 字节数。
 * 只统计**索引里还在的**文件，所以它和 `listShots()` 报出来的内容总是对得上
 * （孤儿文件不计入，但它们确实占空间 —— 要清就 `clearGallery`）。
 */
export async function getGalleryUsage(): Promise<{ count: number; bytes: number }> {
  try {
    return await enqueue(async () => {
      const snapshot = await readIndexUnsafe();
      let bytes = 0;
      for (const shot of snapshot.shots) {
        bytes += fileSize(shot.uri);
        if (shot.thumbUri !== shot.uri) {
          bytes += fileSize(shot.thumbUri);
        }
      }
      return { count: snapshot.shots.length, bytes };
    });
  } catch (error) {
    console.warn('[retro-film-cam] 统计相册占用失败：', error);
    return { count: 0, bytes: 0 };
  }
}
