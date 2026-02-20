import type { PatternPiece, Point2D, PathCommand } from '../../types/types';
import type { NestingOptions, NestingResult, PlacedPiece, SkylineSegment } from './types';
import { flattenPath } from '../seam/index';

// ─── Geometry Helpers ───

/**
 * Compute the axis-aligned bounding box of a set of 2D points.
 *
 * @param points - Array of 2D points
 * @returns Object with `minX`, `minY`, `maxX`, `maxY`, `width`, and `height`
 */
export function computeBBox(points: Point2D[]): {
  minX: number; minY: number; maxX: number; maxY: number; width: number; height: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the area of a pattern piece outline using the shoelace formula.
 *
 * The outline path commands are first flattened to discrete points.
 *
 * @param outline - Path commands defining the piece outline
 * @returns Absolute area in square units (always positive)
 */
export function computeArea(outline: PathCommand[]): number {
  const pts = flattenPath(outline);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    sum += (curr.x * next.y) - (next.x * curr.y);
  }
  return Math.abs(sum) / 2;
}

function rotatePoints(points: Point2D[], angleDeg: number): Point2D[] {
  if (angleDeg === 0) return points;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Rotate around origin (we only care about bbox dimensions)
  return points.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}

function mirrorPoints(points: Point2D[]): Point2D[] {
  return points.map(p => ({ x: -p.x, y: p.y }));
}

/**
 * Compute the bounding box dimensions of a set of points after rotation.
 *
 * @param points - Original 2D points
 * @param angleDeg - Rotation angle in degrees
 * @returns Width, height, and min-corner offsets of the rotated bounding box
 */
export function rotateBBox(points: Point2D[], angleDeg: number): {
  width: number; height: number; offsetX: number; offsetY: number;
} {
  const rotated = rotatePoints(points, angleDeg);
  const bbox = computeBBox(rotated);
  return { width: bbox.width, height: bbox.height, offsetX: bbox.minX, offsetY: bbox.minY };
}

// ─── Skyline Algorithm ───

/**
 * Find the best placement position for a piece on the skyline.
 *
 * Scans all skyline segments to find the leftmost, lowest position where
 * the piece fits within sheet bounds (respecting margin and gap).
 *
 * @param skyline - Current skyline segments representing occupied vertical space
 * @param pieceW - Width of the piece bounding box
 * @param pieceH - Height of the piece bounding box
 * @param sheetW - Total sheet width
 * @param sheetH - Total sheet height
 * @param margin - Sheet edge margin
 * @param gap - Minimum gap between pieces
 * @returns Best position `{ x, y, score }` or `null` if the piece doesn't fit
 */
export function findBestPosition(
  skyline: SkylineSegment[],
  pieceW: number,
  pieceH: number,
  sheetW: number,
  sheetH: number,
  margin: number,
  gap: number,
): { x: number; y: number; score: number } | null {
  const maxX = sheetW - margin;
  const maxY = sheetH - margin;
  let best: { x: number; y: number; score: number } | null = null;

  for (let i = 0; i < skyline.length; i++) {
    const seg = skyline[i];
    const px = seg.x;
    const pxEnd = px + pieceW;

    if (pxEnd > maxX + 0.001) continue;

    // Find max Y across all overlapping segments
    let maxSegY = 0;
    let fits = true;
    let widthCovered = 0;

    for (let j = i; j < skyline.length && widthCovered < pieceW - 0.001; j++) {
      const s = skyline[j];
      // Check overlap
      const overlapStart = Math.max(px, s.x);
      const overlapEnd = Math.min(pxEnd, s.x + s.width);
      if (overlapEnd <= overlapStart + 0.001) {
        fits = false;
        break;
      }
      if (s.y > maxSegY) maxSegY = s.y;
      widthCovered = skyline[j].x + skyline[j].width - px;
    }

    if (!fits) continue;
    if (widthCovered < pieceW - 0.001) continue;

    const py = maxSegY + gap;
    if (py + pieceH > maxY + 0.001) continue;

    const score = py + pieceH;
    if (!best || score < best.score) {
      best = { x: px, y: py, score };
    }
  }

  return best;
}

/**
 * Update the skyline after placing a piece, splitting and merging segments as needed.
 *
 * @param skyline - Current skyline segments
 * @param x - X position of the placed piece
 * @param width - Width of the placed piece
 * @param newY - New Y height at the placed region (top of the piece)
 * @returns Updated skyline segments, sorted by X and merged where adjacent segments share the same Y
 */
export function updateSkyline(
  skyline: SkylineSegment[],
  x: number,
  width: number,
  newY: number,
): SkylineSegment[] {
  const result: SkylineSegment[] = [];
  const xEnd = x + width;

  for (const seg of skyline) {
    const segEnd = seg.x + seg.width;

    if (segEnd <= x + 0.001 || seg.x >= xEnd - 0.001) {
      // No overlap
      result.push({ ...seg });
      continue;
    }

    // Left portion (before placement)
    if (seg.x < x - 0.001) {
      result.push({ x: seg.x, width: x - seg.x, y: seg.y });
    }

    // Right portion (after placement)
    if (segEnd > xEnd + 0.001) {
      result.push({ x: xEnd, width: segEnd - xEnd, y: seg.y });
    }
  }

  // Add the new segment for the placed piece
  result.push({ x, width, y: newY });

  // Sort by x
  result.sort((a, b) => a.x - b.x);

  // Merge adjacent segments with same y
  const merged: SkylineSegment[] = [result[0]];
  for (let i = 1; i < result.length; i++) {
    const last = merged[merged.length - 1];
    if (Math.abs(last.y - result[i].y) < 0.001 &&
        Math.abs((last.x + last.width) - result[i].x) < 0.001) {
      last.width += result[i].width;
    } else {
      merged.push(result[i]);
    }
  }

  return merged;
}

// ─── Main Nesting Function ───

interface PreparedPiece {
  id: string;
  points: Point2D[];
  area: number;
  bboxW: number;
  bboxH: number;
}

/**
 * Nest (bin-pack) pattern pieces onto rectangular sheets using a skyline algorithm.
 *
 * Pieces are sorted by the chosen strategy, then placed one by one onto sheets.
 * Each piece is tried at multiple rotation angles (and optionally mirrored) to
 * find the most compact placement. New sheets are added as needed.
 *
 * @remarks
 * Uses a bottom-left skyline heuristic: for each piece variant (rotation × mirror),
 * the algorithm finds the lowest Y position across all skyline segments where the
 * piece bounding box fits within the sheet.
 *
 * @param pieces - Pattern pieces to nest
 * @param options - Nesting options (sheet size, gap, rotation step, sort strategy, etc.)
 * @returns A {@link NestingResult} with placements, sheet count, utilization ratio, and unplaced piece IDs
 *
 * @example
 * ```ts
 * const result = nestPieces(pieces, {
 *   sheet: { width: 150, height: 300, margin: 1 },
 *   gap: 0.5,
 *   rotationStep: 90,
 *   allowMirror: false,
 *   sortStrategy: 'area-desc',
 * });
 * ```
 */
export function nestPieces(
  pieces: PatternPiece[],
  options: NestingOptions,
): NestingResult {
  if (pieces.length === 0) {
    return { placements: [], sheetsUsed: 0, utilization: 0, unplaced: [] };
  }

  const { sheet, gap, rotationStep, allowMirror, sortStrategy } = options;
  const { width: sheetW, height: sheetH, margin } = sheet;

  // Prepare pieces
  const prepared: PreparedPiece[] = pieces.map(p => {
    const pts = flattenPath(p.outline);
    const area = computeArea(p.outline);
    const bbox = computeBBox(pts);
    return { id: p.id, points: pts, area, bboxW: bbox.width, bboxH: bbox.height };
  });

  // Sort
  switch (sortStrategy) {
    case 'area-desc':
      prepared.sort((a, b) => b.area - a.area);
      break;
    case 'height-desc':
      prepared.sort((a, b) => b.bboxH - a.bboxH);
      break;
    case 'width-desc':
      prepared.sort((a, b) => b.bboxW - a.bboxW);
      break;
  }

  // Sheets: each has a skyline
  const usableW = sheetW - 2 * margin;
  const sheets: SkylineSegment[][] = [];
  const placements: PlacedPiece[] = [];
  const unplaced: string[] = [];

  // Generate rotation angles
  const angles: number[] = [0];
  if (rotationStep > 0) {
    for (let a = rotationStep; a < 360; a += rotationStep) {
      angles.push(a);
    }
  }

  for (const piece of prepared) {
    let placed = false;

    // Try each existing sheet
    for (let si = 0; si < sheets.length && !placed; si++) {
      const result = tryPlaceOnSheet(
        piece, sheets[si], sheetW, sheetH, margin, gap, angles, allowMirror,
      );
      if (result) {
        sheets[si] = result.skyline;
        placements.push({
          pieceId: piece.id,
          sheetIndex: si,
          x: result.x,
          y: result.y,
          rotation: result.rotation,
          mirrored: result.mirrored,
        });
        placed = true;
      }
    }

    if (!placed) {
      // Try new sheet
      const newSkyline: SkylineSegment[] = [{ x: margin, width: usableW, y: margin }];
      const result = tryPlaceOnSheet(
        piece, newSkyline, sheetW, sheetH, margin, gap, angles, allowMirror,
      );
      if (result) {
        sheets.push(result.skyline);
        placements.push({
          pieceId: piece.id,
          sheetIndex: sheets.length - 1,
          x: result.x,
          y: result.y,
          rotation: result.rotation,
          mirrored: result.mirrored,
        });
        placed = true;
      }
    }

    if (!placed) {
      unplaced.push(piece.id);
    }
  }

  // Calculate utilization
  const totalPieceArea = prepared
    .filter(p => !unplaced.includes(p.id))
    .reduce((sum, p) => sum + p.area, 0);
  const totalSheetArea = sheets.length * sheetW * sheetH;
  const utilization = totalSheetArea > 0 ? totalPieceArea / totalSheetArea : 0;

  return {
    placements,
    sheetsUsed: sheets.length,
    utilization,
    unplaced,
  };
}

function tryPlaceOnSheet(
  piece: PreparedPiece,
  skyline: SkylineSegment[],
  sheetW: number,
  sheetH: number,
  margin: number,
  gap: number,
  angles: number[],
  allowMirror: boolean,
): { x: number; y: number; rotation: number; mirrored: boolean; skyline: SkylineSegment[] } | null {
  let best: { x: number; y: number; rotation: number; mirrored: boolean; w: number; h: number; score: number } | null = null;

  const variants: { angle: number; mirrored: boolean }[] = [];
  for (const angle of angles) {
    variants.push({ angle, mirrored: false });
    if (allowMirror) {
      variants.push({ angle, mirrored: true });
    }
  }

  for (const { angle, mirrored } of variants) {
    let pts = piece.points;
    if (mirrored) pts = mirrorPoints(pts);
    const rbbox = rotateBBox(pts, angle);

    const pos = findBestPosition(skyline, rbbox.width, rbbox.height, sheetW, sheetH, margin, gap);
    if (pos && (!best || pos.score < best.score)) {
      best = { x: pos.x, y: pos.y, rotation: angle, mirrored, w: rbbox.width, h: rbbox.height, score: pos.score };
    }
  }

  if (!best) return null;

  const newSkyline = updateSkyline(skyline, best.x, best.w, best.y + best.h);
  return { x: best.x, y: best.y, rotation: best.rotation, mirrored: best.mirrored, skyline: newSkyline };
}
