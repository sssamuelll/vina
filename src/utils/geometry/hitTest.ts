// src/utils/geometry/hitTest.ts
import type { Point2D, PatternPiece } from '../../types/types';

/**
 * Bounding-box hit test: find the first piece whose bbox contains the point.
 * Iterates piece outlines to compute bbox on the fly.
 */
export function hitTestPieceBBox(pt: Point2D, pieces: PatternPiece[]): PatternPiece | null {
  for (const piece of pieces) {
    const cmds = piece.outline;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of cmds) {
      const v = cmd.values;
      for (let i = 0; i < v.length; i += 2) {
        if (i + 1 < v.length) {
          const x = v[i] + piece.position.x;
          const y = v[i + 1] + piece.position.y;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
      return piece;
    }
  }
  return null;
}

/**
 * Find the nearest piece to a point by bounding-box containment with margin,
 * then ranking by distance to bbox center.
 */
export function findNearestPiece(pt: Point2D, pieces: PatternPiece[], margin = 50): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        const px = cmd.values[i] + piece.position.x;
        const py = cmd.values[i + 1] + piece.position.y;
        minX = Math.min(minX, px); minY = Math.min(minY, py);
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      }
    }
    if (pt.x >= minX - margin && pt.x <= maxX + margin &&
        pt.y >= minY - margin && pt.y <= maxY + margin) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d < bestDist) {
        bestDist = d;
        bestId = piece.id;
      }
    }
  }
  return bestId;
}
