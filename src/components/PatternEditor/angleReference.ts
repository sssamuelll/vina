import type { PathCommand, Point2D } from '../../types/types';
import { buildRing, pointAt, projectToRing, type OutlineRing } from '../../utils/geometry/outlineRing';
import { pieceLocalToPattern, patternToPieceLocal } from '../../utils/geometry/pieceSpace';
import { ringOf } from '../../utils/notchAnchor';
import { polarOf } from './polyPenGeometry';
import type { SnapIndex } from './snapIndex';

/** Presentation frame only. Paths and numerical tool operations stay absolute. */
export interface AngleReference {
  kind: 'absolute' | 'border' | 'segment';
  baseDeg: number;
}
export const ABSOLUTE_REFERENCE: AngleReference = { kind: 'absolute', baseDeg: 0 };

export function normalizeAngle(deg: number): number {
  if (deg > -180 && deg <= 180) return deg === 0 ? 0 : deg;
  const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped === 0 ? 0 : wrapped;
}
export function relativeAngle(absoluteDeg: number, reference: AngleReference): number {
  return normalizeAngle(absoluteDeg - reference.baseDeg);
}
export function absoluteAngle(relativeDeg: number, reference: AngleReference): number {
  return normalizeAngle(relativeDeg + reference.baseDeg);
}
export function angleReferenceLabel(reference: AngleReference): string {
  return reference.kind === 'border' ? 'al borde' : reference.kind === 'segment' ? 'al tramo' : 'al eje';
}

type RingSegment = OutlineRing['segments'][number];
function tangentAt(segment: RingSegment, t: number): Point2D {
  const { from, to, cp1, cp2 } = segment;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (segment.kind === 'cubic' && cp1 && cp2) {
    const u = 1 - t;
    dx = u * u * (cp1.x - from.x) + 2 * u * t * (cp2.x - cp1.x) + t * t * (to.x - cp2.x);
    dy = u * u * (cp1.y - from.y) + 2 * u * t * (cp2.y - cp1.y) + t * t * (to.y - cp2.y);
  } else if (segment.kind === 'quadratic' && cp1) {
    dx = (1 - t) * (cp1.x - from.x) + t * (to.x - cp1.x);
    dy = (1 - t) * (cp1.y - from.y) + t * (to.y - cp1.y);
  }
  // A handle can coincide with its anchor. Prefer the remaining control
  // direction before the chord; never let atan2(0,0) invent a reference.
  if (Math.hypot(dx, dy) < 1e-9) {
    const control = t >= 0.5 ? cp1 : cp2;
    dx = control ? (t >= 0.5 ? to.x - control.x : control.x - from.x) : to.x - from.x;
    dy = control ? (t >= 0.5 ? to.y - control.y : control.y - from.y) : to.y - from.y;
    if (Math.hypot(dx, dy) < 1e-9) { dx = to.x - from.x; dy = to.y - from.y; }
  }
  return { x: dx, y: dy };
}

/** Previous segment in this subpath, or the first point's attachment frame. */
export function referenceBefore(
  path: PathCommand[], commandIndex: number, firstReference: AngleReference = ABSOLUTE_REFERENCE,
): AngleReference {
  let start = commandIndex - 1;
  while (start > 0 && path[start]?.type !== 'M') start--;
  const built = buildRing(path.slice(start, commandIndex), 2);
  if (!built.ok) return firstReference;
  // buildRing also emits a synthetic closure for open paths. It is not a
  // previously drawn segment and cannot supply a heading.
  const segment = built.value.segments.filter(s => s.commandIndex < commandIndex - start).at(-1);
  if (!segment) return firstReference;
  const tangent = tangentAt(segment, 1);
  if (Math.hypot(tangent.x, tangent.y) < 1e-9) return firstReference;
  return { kind: 'segment', baseDeg: polarOf({ x: 0, y: 0 }, tangent).angleDeg };
}

/**
 * Reconstruct the first segment's reference from its actual attachment.
 * The snap index supplies visibility, draw order and the canonical rings.
 * No pixel radius: moving an origin off its edge removes the attachment.
 * At corners the ring's command order decides; cursor direction never does.
 */
export function borderReference(index: SnapIndex, world: Point2D, pieceId?: string): AngleReference {
  for (let i = index.pieces.length - 1; i >= 0; i--) {
    const piece = index.pieces[i];
    if (pieceId !== undefined && piece.id !== pieceId) continue;
    const ring = index.ringsByPiece.get(piece.id);
    if (!ring || ring.totalMm < 1e-9 || ring.subpathCount !== 1) continue;
    const local = patternToPieceLocal(world, piece);
    const projected = projectToRing(ring, local);
    if (Math.hypot(projected.point.x - local.x, projected.point.y - local.y) > 1e-5) continue;
    const at = pointAt(ring, projected.distanceMm);
    const segment = ring.segments.find(s => s.commandIndex === at.commandIndex);
    if (!segment || segment.commandIndex >= piece.outline.length) continue;
    let tangent = tangentAt(segment, at.tLocal);
    if (Math.hypot(tangent.x, tangent.y) < 1e-9) continue;
    if (piece.outline.some(c => c.type === 'Z')) {
      const points = ringOf(piece.outline);
      const area2 = points.reduce((sum, p, j) => {
        const next = points[(j + 1) % points.length];
        return sum + p.x * next.y - next.x * p.y;
      }, 0);
      // Screen y grows down. Reverse a positive shoelace traversal so the
      // math-positive quarter-turn goes into the piece, independent of winding.
      if (area2 > 0) tangent = { x: -tangent.x, y: -tangent.y };
    }
    const from = pieceLocalToPattern(local, piece);
    const to = pieceLocalToPattern({ x: local.x + tangent.x, y: local.y + tangent.y }, piece);
    return { kind: 'border', baseDeg: normalizeAngle(polarOf(from, to).angleDeg) };
  }
  return ABSOLUTE_REFERENCE;
}

/** Live and frozen readings share the same frame, independent of the cursor. */
export function referenceForNext(path: PathCommand[], index: SnapIndex, pieceId?: string): AngleReference {
  const first = path[0];
  if (!first || first.type !== 'M') return ABSOLUTE_REFERENCE;
  return referenceBefore(path, path.length,
    borderReference(index, { x: first.values[0], y: first.values[1] }, pieceId));
}
