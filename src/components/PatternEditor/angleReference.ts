import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { buildRing, pointAt, projectToRing, type OutlineRing } from '../../utils/geometry/outlineRing';
import { pieceLocalToPattern, patternToPieceLocal } from '../../utils/geometry/pieceSpace';
import { ringOf } from '../../utils/notchAnchor';
import { polarOf } from './polyPenGeometry';
import type { SnapIndex } from './snapIndex';

/**
 * Presentation frame only. Paths and numerical tool operations stay absolute.
 *
 * Lo que la referencia promete (firma D2, #1156) y sus límites:
 * - «Seguir el borde = 0» vale en el sentido corregido del borde: el que deja
 *   el interior de la pieza a +90°. Recorrerlo al revés lee ±180. Es inherente
 *   a una referencia con signo.
 * - En una esquina hay dos bordes: la referencia es el que se puede seguir
 *   DESDE la esquina en ese sentido; el otro queda a +90 (en un ángulo recto).
 * - Una pieza con más de un subpath (agujeros) no tiene «el borde»: cae al eje.
 */
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
  // Sin `M` inicial el parser arrancaría en (0,0) e inventaría un tramo.
  if (path[0]?.type !== 'M') return firstReference;
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
  return { kind: 'segment', baseDeg: normalizeAngle(polarOf({ x: 0, y: 0 }, tangent).angleDeg) };
}

const SAME_POINT_MM = 1e-6;
const samePoint = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) <= SAME_POINT_MM;

/**
 * Screen y grows down, so a positive shoelace traversal is clockwise on
 * screen and leaves the interior on its right — the math-positive quarter
 * turn of `polarOf` (counter-clockwise on screen) would point out. Those
 * rings get their tangent reversed so +90 goes into the piece, independent
 * of the winding the outline was saved with.
 */
function needsReversal(outline: PathCommand[]): boolean {
  if (!outline.some(c => c.type === 'Z')) return false;
  const points = ringOf(outline);
  const area2 = points.reduce((sum, p, j) => {
    const next = points[(j + 1) % points.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0);
  return area2 > 0;
}

/**
 * The border's own direction at `point`, before the winding correction.
 *
 * At a corner two segments meet. The reference is the one the user can
 * follow FROM the corner in the corrected sense: the segment that leaves it
 * when the ring already runs the right way, the one that arrives (walked
 * backwards) when the ring is going to be reversed. Any other choice reads
 * 180 for following a real edge (revisión 13-09, H4). `pointAt` alone is
 * not enough: it settles the tie by ring order, which differs between the
 * ring origin and every other corner.
 */
function borderTangent(
  segments: readonly RingSegment[], at: { commandIndex: number; tLocal: number }, point: Point2D, reversed: boolean,
): Point2D | null {
  const arriving = segments.find(s => samePoint(s.to, point));
  const leaving = segments.find(s => samePoint(s.from, point));
  if (arriving && leaving) return reversed ? tangentAt(arriving, 1) : tangentAt(leaving, 0);
  const segment = segments.find(s => s.commandIndex === at.commandIndex);
  return segment ? tangentAt(segment, at.tLocal) : null;
}

/**
 * Reconstruct the first segment's reference from its actual attachment.
 * The snap index supplies visibility, draw order and the canonical rings.
 * No pixel radius: moving an origin off its edge removes the attachment.
 * At corners the ring decides (see `borderTangent`); cursor direction never does.
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
    // The synthetic closure of an open path is not a border.
    const real = ring.segments.filter(s => s.commandIndex < piece.outline.length);
    const reversed = needsReversal(piece.outline);
    const at = pointAt(ring, projected.distanceMm);
    let tangent = borderTangent(real, at, projected.point, reversed);
    if (!tangent || Math.hypot(tangent.x, tangent.y) < 1e-9) continue;
    if (reversed) tangent = { x: -tangent.x, y: -tangent.y };
    const from = pieceLocalToPattern(local, piece);
    const to = pieceLocalToPattern({ x: local.x + tangent.x, y: local.y + tangent.y }, piece);
    return { kind: 'border', baseDeg: normalizeAngle(polarOf(from, to).angleDeg) };
  }
  return ABSOLUTE_REFERENCE;
}

/** Una dirección local como referencia en espacio de patrón: una pieza girada gira su marco. */
function referenceAlong(piece: PatternPiece, atLocal: Point2D, dirLocal: Point2D): AngleReference {
  if (Math.hypot(dirLocal.x, dirLocal.y) < 1e-9) return ABSOLUTE_REFERENCE;
  const from = pieceLocalToPattern(atLocal, piece);
  const to = pieceLocalToPattern({ x: atLocal.x + dirLocal.x, y: atLocal.y + dirLocal.y }, piece);
  return { kind: 'border', baseDeg: normalizeAngle(polarOf(from, to).angleDeg) };
}

/**
 * El lado que LLEGA a un ancla del contorno: el marco del borde al arrastrar
 * ese punto en `Q` con Shift dos veces (spec 2026-09-23 § 3.4). A 0° el lado
 * se alarga sin cambiar de inclinación; a 90° el punto sale en perpendicular a
 * él. Al ancla del `M` le llega el lado de cierre. Un tramo de largo cero
 * entre anclas gemelas no es un lado (`buildRing` ya los descarta; el filtro
 * de abajo es defensivo). Un lado curvo aporta su tangente de llegada.
 *
 * El cierre sintético de un contorno ABIERTO no es un lado, igual que en
 * `borderReference`: al punto de inicio de un contorno abierto no le llega
 * nada, y hace de marco el único lado que lo toca, el que sale — a 0° el
 * punto se desliza sobre él, como con cualquier otro. Sin lado (arcos, un
 * índice que no es ancla), el eje: Shift dos veces endereza como Shift una vez.
 */
export function arrivingReference(piece: PatternPiece, commandIndex: number): AngleReference {
  const command = piece.outline[commandIndex];
  if (!command || command.values.length < 2) return ABSOLUTE_REFERENCE;
  const anchor = { x: command.values[command.values.length - 2], y: command.values[command.values.length - 1] };
  const built = buildRing(piece.outline, 2);
  if (!built.ok) return ABSOLUTE_REFERENCE;
  const real = built.value.segments.filter(s => s.commandIndex < piece.outline.length);
  const arriving = real.find(s => samePoint(s.to, anchor) && !samePoint(s.from, anchor));
  if (arriving) return referenceAlong(piece, anchor, tangentAt(arriving, 1));
  const leaving = real.find(s => samePoint(s.from, anchor) && !samePoint(s.to, anchor));
  return leaving ? referenceAlong(piece, anchor, tangentAt(leaving, 0)) : ABSOLUTE_REFERENCE;
}

/** La recta de un lado, de su ancla de salida a la de llegada: el marco al arrastrar el lado en `Q`. */
export function chordReference(piece: PatternPiece, fromLocal: Point2D, toLocal: Point2D): AngleReference {
  return referenceAlong(piece, fromLocal, { x: toLocal.x - fromLocal.x, y: toLocal.y - fromLocal.y });
}

/** Live and frozen readings share the same frame, independent of the cursor. */
export function referenceForNext(path: PathCommand[], index: SnapIndex, pieceId?: string): AngleReference {
  const first = path[0];
  if (!first || first.type !== 'M') return ABSOLUTE_REFERENCE;
  return referenceBefore(path, path.length,
    borderReference(index, { x: first.values[0], y: first.values[1] }, pieceId));
}
