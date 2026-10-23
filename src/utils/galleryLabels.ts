import { PRESETS, findPresetIndex } from '../constants/presets';

/** Label the recorded stock, never the most recent photo or a guessed default. */
export function galleryFilmLabel(presetId: string | undefined): string {
  if (!presetId) return '—';
  const index = findPresetIndex(presetId);
  const preset = PRESETS[index];
  // Known retired IDs intentionally resolve through the existing migration map.
  const known = PRESETS.some((item) => item.id === presetId)
    || ['fj-400', 'tx-400', 'tx-400-bw', 'sl-400-bw', 'nz-400'].includes(presetId);
  return known && preset ? preset.name : presetId.toUpperCase();
}
