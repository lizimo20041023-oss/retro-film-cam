/**
 * 内置相册的 React 层：把 `utils/galleryStore.ts` 那套"永不抛异常"的返回值
 * 翻译成组件好用的状态 + 动作。
 *
 * 两个刻意的设计：
 *
 * 1. **乐观更新 + 静默对账**。`add` 拿到 store 返回的记录后立刻插进内存列表，
 *    用户不用等一次重新读盘就能在网格里看到新照片；随后再静默地和磁盘对一次账
 *    （`silent` 重载不会把 `loading` 翻起来，所以网格不会闪一下）。
 *    `remove` / `clear` 同理先改内存。这样"加了照片网格里却没有"这件事不可能发生 ——
 *    即便乐观更新那一步出了岔子，紧随其后的对账也会把它捞回来。
 *
 * 2. **`error` 是诊断信息，不是给最终用户看的文案**。store 层保证不抛异常，
 *    失败只会体现为 `null` / 空列表，所以这里把失败翻译成一句话存进 `error`。
 *    界面要显示给用户看时，自己按"操作是否返回 null"用 i18n 组织文案更好
 *    （本文件不改 i18n 词条，所以这里不假装它是本地化文案）。
 *
 * 关于共享状态：这个 hook 每个调用点各自持有一份列表。相机屏幕和相册网格如果
 * 同时挂着，各自 `useGallery()` 不会自动同步（但下一次 `silent` 对账会收敛）。
 * 真需要跨屏幕实时同步时，再像 `useSettings` 那样套一层 Context。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addShot, clearGallery, deleteShot, readGallery } from '../utils/galleryStore';
import type { AddShotInput, GalleryShot } from '../utils/galleryStore';
import { describeError } from '../utils/describeError';

/** store 层用 `null` 表示失败，这里补一句人能看懂的原因（诊断用）。 */
const SAVE_FAILED = '保存到内置相册失败';
const DELETE_FAILED = '删除相册照片失败';
const CLEAR_FAILED = '清空内置相册失败';

export interface GalleryController {
  /** 相册内容，最新的在前。 */
  shots: GalleryShot[];
  /** 是否正在读盘（只覆盖初次加载和显式 `refresh`，不含 `add` / `remove` / `clear`）。 */
  loading: boolean;
  /** 最近一次失败的原因（诊断用）；一切正常时为 `null`。 */
  error: string | null;
  /** 重新从存储读一次（用户下拉刷新时调）。 */
  refresh: () => Promise<void>;
  /** 存一张成片。返回新记录；失败返回 `null`（**不抛异常**）。 */
  add: (input: AddShotInput) => Promise<GalleryShot | null>;
  /** 删掉一张。永远不抛。 */
  remove: (id: string) => Promise<void>;
  /** 清空整个相册。永远不抛。 */
  clear: () => Promise<void>;
}

export function useGallery(): GalleryController {
  const [shots, setShots] = useState<GalleryShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 卸载后一律不再 setState（Expo Go 热重载会频繁触发）
  const aliveRef = useRef(true);
  /**
   * 只有"最新那次读"的结果允许落地。
   * 没有它的话，一次慢的读回来晚了，会把刚 add 进去的照片从列表里抹掉 —— 看起来就像"没存上"。
   */
  const requestRef = useRef(0);

  const load = useCallback(async (silent: boolean): Promise<void> => {
    const token = requestRef.current + 1;
    requestRef.current = token;
    if (!silent) {
      setLoading(true);
    }
    try {
      const result = await readGallery();
      if (!aliveRef.current || requestRef.current !== token) return;
      setShots(result.shots);
      setError(result.error);
    } catch (caught) {
      // readGallery 自己不会抛；这里是最后一道保险，绝不让异常冒到 React 树
      if (!aliveRef.current || requestRef.current !== token) return;
      setError(describeError(caught));
    } finally {
      // 被更新的请求顶掉时不要收 loading，留给那次请求去收
      if (aliveRef.current && requestRef.current === token) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load(false);
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  const refresh = useCallback(async (): Promise<void> => {
    await load(false);
  }, [load]);

  const add = useCallback(
    async (input: AddShotInput): Promise<GalleryShot | null> => {
      try {
        const shot = await addShot(input);
        if (shot === null) {
          if (aliveRef.current) setError(SAVE_FAILED);
          return null;
        }
        if (aliveRef.current) {
          // 乐观插入：先按 id 去重，防止重复调用把自己插两遍
          setShots((prev) => [shot, ...prev.filter((item) => item.id !== shot.id)]);
          setError(null);
          // 再和磁盘对账（别处可能也加了照片）；静默进行，不闪 loading
          void load(true);
        }
        return shot;
      } catch (caught) {
        if (aliveRef.current) setError(describeError(caught));
        return null;
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        // 先改内存：用户点了删除，那一格必须马上消失
        if (aliveRef.current) {
          setShots((prev) => prev.filter((shot) => shot.id !== id));
        }
        await deleteShot(id);
        if (aliveRef.current) {
          setError(null);
          void load(true);
        }
      } catch (caught) {
        if (aliveRef.current) setError(describeError(caught));
      }
    },
    [load],
  );

  const clear = useCallback(async (): Promise<void> => {
    try {
      if (aliveRef.current) setShots([]);
      await clearGallery();
      if (aliveRef.current) {
        setError(null);
        void load(true);
      }
    } catch (caught) {
      if (aliveRef.current) setError(describeError(caught));
    }
  }, [load]);

  return { shots, loading, error, refresh, add, remove, clear };
}
