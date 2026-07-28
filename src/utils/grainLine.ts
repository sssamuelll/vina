/**
 * GrainLine Semantics — extract, classify, and set grain direction.
 *
 * @module grainLine
 */

import type { PatternPiece, GrainLine, GrainDirection, InternalLine, PathCommand, Point2D } from '../types/types';
import { newId } from './ids';

// B11-state: thin wrapper. Previous `let _glCounter = 0` removed.
// Tests use hardcoded fixture IDs (`gl-1`, etc.); they don't call glId()
// and assert its output — so format change is invisible to those tests.
function glId(): string { return newId(); }

/**
 * Extract grainline from piece's InternalLines.
 * Returns null if no grainline internal found.
 */
export function extractGrainLine(piece: PatternPiece): GrainLine | null {
  const glLine = piece.internals.find(l => l.type === 'grainline');
  if (!glLine || glLine.path.length < 2) return null;

  const angle = computeAngle(glLine);
  const direction = classifyDirection(angle);

  // Try to find reference edge
  let referenceEdge: string | undefined;
  if (piece.edges) {
    if (direction === 'lengthwise') {
      const fold = piece.edges.find(e => e.edgeType === 'fold');
      if (fold) referenceEdge = `parallel to ${fold.name}`;
    }
  }

  return {
    id: glId(),
    direction,
    angle: Math.round(angle * 100) / 100,
    referenceEdge,
    path: glLine.path,
  };
}

/**
 * Compute angle of a grainline path in degrees.
 * 0° = vertical (lengthwise), 90° = horizontal (crosswise), 45° = bias.
 */
function computeAngle(line: InternalLine): number {
  const points = samplePath(line.path);
  if (points.length < 2) return 0;

  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;

  // atan2 gives angle from positive x-axis
  // We want angle from vertical (y-axis), so rotate 90°
  const angle = Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI;
  return angle;
}

/**
 * The `piece.rotation` (degrees, SVG `rotate()` convention) that makes the
 * piece's grainline vertical — i.e. grain-aligns the piece. Returns 0 when the
 * piece has no usable grainline (nothing to align to). A grainline is an
 * undirected line, so the result is the minimal turn in (-90, 90].
 *
 * SVG `rotate(R)` maps a vector (x, y) → (x·cosR − y·sinR, …); zeroing the
 * grainline's x-component gives R = atan2(dx, dy). Non-destructive: callers set
 * `piece.rotation`, which the renderer/export/nesting/3D already honor.
 */
export function grainAlignmentRotation(piece: Pick<PatternPiece, 'internals'>): number {
  const gl = piece.internals.find(l => l.type === 'grainline');
  if (!gl) return 0;
  const pts = samplePath(gl.path);
  if (pts.length < 2) return 0;
  const dx = pts[pts.length - 1].x - pts[0].x;
  const dy = pts[pts.length - 1].y - pts[0].y;
  if (dx === 0 && dy === 0) return 0;
  let deg = Math.atan2(dx, dy) * 180 / Math.PI;
  // Fold into (-90, 90] — up and down are the same grain line.
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return Math.round(deg * 100) / 100;
}

/**
 * Arrowhead wings for a grainline, as triangles `[tip, wingA, wingB]` in the
 * same coord space as the path. `size` is the wing length in that space (canvas
 * passes px/zoom; DXF passes mm). Degenerate line → [].
 *
 * SINGLE-headed, at the path's end (nota de María #169): the grainline says
 * which way the piece gets cut, and a napped or directional fabric does not
 * behave the same cut top-to-bottom as bottom-to-top. Two heads state the axis
 * and hide the answer. The direction is the path's own order — the drag that
 * drew it, or the vertex order the source DXF emitted — so it is already
 * stored; use {@link reverseGrainline} to flip it.
 *
 * Returns an array (not one triangle) because both consumers map over it and
 * the shape predates the single-head decision.
 */
export function grainlineArrowheads(path: PathCommand[], size: number): Point2D[][] {
  const ends = grainlineEndpoints(path);
  if (!ends) return [];
  const [a, b] = ends;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const ux = dx / len, uy = dy / len;
  const base = { x: b.x - ux * size, y: b.y - uy * size };
  return [[
    { x: b.x, y: b.y },
    { x: base.x + uy * size * 0.5, y: base.y - ux * size * 0.5 },
    { x: base.x - uy * size * 0.5, y: base.y + ux * size * 0.5 },
  ]];
}

/**
 * Start and end of a grainline — the only two points that carry meaning on a
 * line that is straight by definition. Every consumer (arrowheads, angle,
 * alignment, DXF shaft) reads exactly these. Degenerate path → null.
 */
export function grainlineEndpoints(path: PathCommand[]): [Point2D, Point2D] | null {
  const pts = samplePath(path);
  if (pts.length < 2) return null;
  return [pts[0], pts[pts.length - 1]];
}

/**
 * The same grainline pointing the other way. An imported piece carries whatever
 * vertex order its source CAD wrote, and a drag can go the wrong way — without
 * this, a backwards arrow is unfixable from the UI, and a backwards grain arrow
 * is a piece cut backwards.
 *
 * Always comes back as a single M→L segment: a straight line needs no
 * intermediate vertices, and a multi-vertex grainline is what makes the DXF
 * shaft and its arrowhead disagree. Paths shorter than two points are returned
 * untouched.
 */
export function reverseGrainline(path: PathCommand[]): PathCommand[] {
  const ends = grainlineEndpoints(path);
  if (!ends) return path;
  const [start, end] = ends;
  return [
    { type: 'M', values: [end.x, end.y] },
    { type: 'L', values: [start.x, start.y] },
  ];
}

function samplePath(path: PathCommand[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let cx = 0, cy = 0;
  for (const cmd of path) {
    switch (cmd.type) {
      case 'M': cx = cmd.values[0]; cy = cmd.values[1]; pts.push({ x: cx, y: cy }); break;
      case 'L': cx = cmd.values[0]; cy = cmd.values[1]; pts.push({ x: cx, y: cy }); break;
      case 'C': cx = cmd.values[4]; cy = cmd.values[5]; pts.push({ x: cx, y: cy }); break;
      default: break;
    }
  }
  return pts;
}

/**
 * Classify grain direction from angle.
 * 0°±15° = lengthwise, 90°±15° = crosswise, 45°±10° = bias, else custom.
 */
export function classifyDirection(angleDeg: number): GrainDirection {
  const a = angleDeg % 180;
  if (a <= 15 || a >= 165) return 'lengthwise';
  if (a >= 75 && a <= 105) return 'crosswise';
  if (a >= 35 && a <= 55) return 'bias';
  return 'custom';
}

/**
 * Create a grainline path (vertical line centered in piece bbox).
 */
export function createGrainLinePath(
  piece: PatternPiece,
  direction: GrainDirection,
): PathCommand[] {
  // Compute piece bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cmd of piece.outline) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      const x = cmd.values[i], y = cmd.values[i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfLen = (maxY - minY) * 0.3; // 30% of piece height

  let angle = 0; // lengthwise default
  if (direction === 'crosswise') angle = 90;
  else if (direction === 'bias') angle = 45;

  const rad = angle * Math.PI / 180;
  const dx = Math.sin(rad) * halfLen;
  const dy = Math.cos(rad) * halfLen;

  return [
    { type: 'M', values: [cx - dx, cy - dy] },
    { type: 'L', values: [cx + dx, cy + dy] },
  ];
}

/**
 * Set grain direction on a piece, creating/updating the grainline.
 */
export function setGrainDirection(
  piece: PatternPiece,
  direction: GrainDirection,
): GrainLine {
  const path = createGrainLinePath(piece, direction);
  const angle = direction === 'lengthwise' ? 0 : direction === 'crosswise' ? 90 : direction === 'bias' ? 45 : 0;

  return {
    id: piece.grainLine?.id ?? glId(),
    direction,
    angle,
    path,
  };
}
