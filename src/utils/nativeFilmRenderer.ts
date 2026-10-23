import { requireOptionalNativeModule } from 'expo-modules-core';
import type { FilmLookParams } from './filmRender';
import type { Lut3D } from './lut3d';

interface NativeFilmRenderer {
  render(uri: string, key: string, lutBase64: string, size: number,
    overlayUri: string | null, values: Record<string, number>): Promise<{
      uri: string; width: number; height: number;
    }>;
}

const native = requireOptionalNativeModule<NativeFilmRenderer>('FilmRenderer');
export const hasNativeFilmRenderer = native !== null;
const uploadedLuts = new Set<string>();

function encodeBytes(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    parts.push(alphabet[a >>> 2] + alphabet[((a & 3) << 4) | (b >>> 4)]
      + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >>> 6)] : '=')
      + (i + 2 < bytes.length ? alphabet[c & 63] : '='));
  }
  return parts.join('');
}

/** Only LUT bytes cross the bridge once per stock; full images remain native. */
export async function renderNativeFilm(sourceUri: string, stockId: string, lut: Lut3D,
  params: FilmLookParams, seed: number, overlayUri?: string, overlayOpacity?: number) {
  if (native === null) throw new Error('Native film renderer unavailable');
  const result = await native.render(sourceUri, stockId,
    uploadedLuts.has(stockId) ? '' : encodeBytes(lut.data), lut.size, overlayUri ?? null, {
      ...params, mono: params.mono ? 1 : 0, seed,
      grain: params.grain,
      overlayOpacity: overlayOpacity ?? 0.5,
    });
  uploadedLuts.add(stockId);
  return result;
}
