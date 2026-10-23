import type { FrameLayout, Rect } from '../types';

export interface PlacedWatermark {
  left?: number;
  right?: number;
  bottom: number;
  maxWidth: number;
  fontSize: number;
}

/** Date owns its selected rectangle; annotations move into a free rectangle.
 * Uses conservative line boxes, including the text shadow, for all date sizes.
 */
export function avoidDateCollision<T extends PlacedWatermark>(
  pieces: readonly T[], layout: FrameLayout, date: Rect | null,
): T[] {
  if (date === null) return [...pieces];
  const gap = Math.max(3, layout.width * 0.012);
  const inset = Math.max(3, layout.width * 0.025);
  return pieces.map((piece) => {
    const h = piece.fontSize * 1.6;
    const w = Math.min(piece.maxWidth, layout.width - inset * 2);
    const x = piece.left ?? layout.width - (piece.right ?? inset) - w;
    const y = layout.height - piece.bottom - h;
    const collides = x < date.left + date.width + gap && x + w > date.left - gap
      && y < date.top + date.height + gap && y + h > date.top - gap;
    if (!collides) return piece;
    // A vertical date can be a long rail. Keep the annotation beside it.
    if (date.height > date.width) {
      const rightStart = date.left + date.width + gap;
      const leftWidth = date.left - gap - inset;
      const rightWidth = layout.width - inset - rightStart;
      if (Math.max(leftWidth, rightWidth) >= Math.min(w, layout.width * 0.4)) {
        return { ...piece, left: rightWidth >= leftWidth ? rightStart : inset,
          right: undefined, maxWidth: Math.min(w, Math.max(leftWidth, rightWidth)) };
      }
    }
    // Horizontal dates stack naturally. Clamp inside the canvas with a real gap.
    const aboveBottom = layout.height - date.top + gap;
    if (aboveBottom + h <= layout.height - inset) {
      return { ...piece, bottom: aboveBottom };
    }
    const belowBottom = layout.height - date.top - date.height - gap - h;
    if (belowBottom >= inset) return { ...piece, bottom: belowBottom };
    // Extremely narrow layouts: allocate the largest free horizontal interval.
    const rightStart = date.left + date.width + gap;
    const rightWidth = layout.width - inset - rightStart;
    const leftWidth = date.left - gap - inset;
    return { ...piece, left: rightWidth >= leftWidth ? rightStart : inset,
      right: undefined, maxWidth: Math.max(0, Math.min(w, Math.max(leftWidth, rightWidth))) };
  });
}
