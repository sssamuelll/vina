// src/utils/geometry/coords.ts
import type { Point2D } from '../../types/types';

/** Convert screen coordinates to pattern space (pure — no React deps). */
export function screenToPattern(
  screenX: number,
  screenY: number,
  svgRect: { left: number; top: number },
  zoom: number,
  pan: Point2D,
): Point2D {
  return {
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  };
}
