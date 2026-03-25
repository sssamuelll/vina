import type { Point2D } from '../../types/types';

/**
 * Compute pixels-per-mm from two calibration points and a known real-world distance.
 * Used for reference image scale calibration.
 *
 * @param point1 - First calibration point (in image pixel coordinates)
 * @param point2 - Second calibration point (in image pixel coordinates)
 * @param realWorldMm - Known distance between the points in millimeters
 * @returns pixels per millimeter
 * @throws if pixel distance is zero or realWorldMm is not positive
 */
export function computePixelsPerMm(
  point1: Point2D,
  point2: Point2D,
  realWorldMm: number,
): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) throw new Error('Calibration points must be at different positions');
  if (realWorldMm <= 0) throw new Error('Real-world distance must be a positive number');
  return pixelDist / realWorldMm;
}
