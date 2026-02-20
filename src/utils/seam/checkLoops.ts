import type { Point2D } from '../../types/types';
import { lineIntersection, pointOnLine, ACCURACY } from './geometry';

/**
 * Remove self-intersecting loops from an offset polygon.
 * Port of Seamly2D's CheckLoops.
 */
export function checkLoops(points: Point2D[]): Point2D[] {
  if (points.length < 3) return [...points];

  const result: Point2D[] = [...points];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1 && !changed; i++) {
      // Check against edges j >= i+2
      for (let j = i + 2; j < result.length - 1; j++) {
        // Skip adjacent edges that share a vertex
        if (i === 0 && j === result.length - 2) continue;

        const ix = lineIntersection(result[i], result[i + 1], result[j], result[j + 1]);

        if (ix.type === 'bounded') {
          // Found a loop from i+1 to j. Remove those points and insert intersection.
          const newPoints: Point2D[] = [];
          for (let k = 0; k <= i; k++) newPoints.push(result[k]);
          newPoints.push(ix.point);
          for (let k = j + 1; k < result.length; k++) newPoints.push(result[k]);
          result.length = 0;
          result.push(...newPoints);
          changed = true;
          break;
        }

        if (ix.type === 'parallel') {
          // Check if segments overlap on the same line
          if (pointOnLine(result[j], result[i], result[i + 1], ACCURACY * 10) ||
              pointOnLine(result[j + 1], result[i], result[i + 1], ACCURACY * 10)) {
            // Overlapping parallel segments — remove loop
            const newPoints: Point2D[] = [];
            for (let k = 0; k <= i; k++) newPoints.push(result[k]);
            for (let k = j + 1; k < result.length; k++) newPoints.push(result[k]);
            result.length = 0;
            result.push(...newPoints);
            changed = true;
            break;
          }
        }
      }
    }
  }

  return result;
}
