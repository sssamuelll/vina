/**
 * Marker collision detection and utilization utilities.
 */

import type { PlacedPiece } from './cuttingLayout';

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Compute AABB from flat coordinate array [x0,y0,x1,y1,...] */
function getAABB(coords: number[]): AABB {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i];
    const y = coords[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** Check if two placed pieces overlap (AABB-based). */
export function checkPieceOverlap(a: PlacedPiece, b: PlacedPiece): boolean {
  const aCoords = a.seamAllowance ?? a.outline;
  const bCoords = b.seamAllowance ?? b.outline;
  if (aCoords.length < 4 || bCoords.length < 4) return false;
  return aabbOverlap(getAABB(aCoords), getAABB(bCoords));
}

/** Check if piece is within paper bounds (considering margin). */
export function isWithinBounds(
  piece: PlacedPiece,
  paperWidth: number,
  paperHeight: number,
  margin: number,
): boolean {
  const coords = piece.seamAllowance ?? piece.outline;
  if (coords.length < 2) return true;
  const bb = getAABB(coords);
  return bb.minX >= margin && bb.minY >= margin &&
    bb.maxX <= paperWidth - margin && bb.maxY <= paperHeight - margin;
}

/** Compute polygon area from flat coords using shoelace formula. */
function polygonArea(coords: number[]): number {
  const n = coords.length;
  if (n < 6) return 0; // need at least 3 points
  let area = 0;
  for (let i = 0; i < n; i += 2) {
    const x1 = coords[i];
    const y1 = coords[i + 1];
    const x2 = coords[(i + 2) % n];
    const y2 = coords[(i + 3) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** Compute fabric utilization (0-1) from placed pieces. */
export function computeUtilization(
  pieces: PlacedPiece[],
  paperWidth: number,
  paperHeight: number,
  margin: number,
): number {
  const usableWidth = paperWidth - 2 * margin;
  const usableHeight = paperHeight - 2 * margin;
  const fabricArea = usableWidth * usableHeight;
  if (fabricArea <= 0) return 0;

  let totalPieceArea = 0;
  for (const p of pieces) {
    totalPieceArea += polygonArea(p.outline);
  }
  return Math.min(1, totalPieceArea / fabricArea);
}
