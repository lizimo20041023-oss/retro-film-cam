import type { SaveOutcome } from '../types';

export interface BatchPhoto { id: string; uri: string }
export interface BatchSaveResult { savedIds: string[]; failedIds: string[]; cancelled: boolean; message?: string }

/** Sequential native writes bound memory, report partial success, and never retry
 * an ambiguous failed write automatically (which could duplicate a photo).
 */
export async function savePhotoBatch(photos: readonly BatchPhoto[],
  save: (uri: string) => Promise<SaveOutcome>,
  options: { shouldCancel?: () => boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<BatchSaveResult> {
  const result: BatchSaveResult = { savedIds: [], failedIds: [], cancelled: false };
  for (const [index, photo] of photos.entries()) {
    if (options.shouldCancel?.()) { result.cancelled = true; break; }
    let outcome: SaveOutcome;
    try { outcome = await save(photo.uri); }
    catch (error) { outcome = { ok: false, reason: 'failed', message: String(error) }; }
    if (outcome.ok) result.savedIds.push(photo.id);
    else {
      result.failedIds.push(photo.id);
      result.message = outcome.message;
      // Repeated permission prompts cannot fix a denied batch.
      if (outcome.reason === 'permission-denied') {
        result.failedIds.push(...photos.slice(index + 1).map((item) => item.id));
        break;
      }
    }
    options.onProgress?.(index + 1, photos.length);
  }
  return result;
}
