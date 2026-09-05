/**
 * Parametric notch anchoring — the geometry core of the notch-precision
 * package (`docs/superpowers/specs/2026-06-07-notch-precision-design.md`).
 *
 * A `NotchAnchor` expresses "this notch sits N mm along the outline from
 * that corner" (D-3: corners detected by angular deviation — a patternmaker
 * thinks "12cm from the armhole", not "vertex 147 of the polyline"). All
 * producers (click tool, DXF import back-fill, copilot addNotch) compute
 * anchors here; the precision modal resolves edited values back to a point
 * + inward normal via {@link resolveNotchAnchor}.
 *
 * Direction semantics: `'cw'` follows the stored vertex order of the
 * outline, `'ccw'` runs against it — deterministic regardless of the
 * outline's geometric winding (the UI communicates direction visually via
 * preview, not by label).
 */
import type { NotchAnchor, PathCommand, Point2D } from '../types/types';
import {
  buildRing,
  pointAt,
  projectToRing,
  type OutlineRing,
  type RingMetric,
} from './geometry/outlineRing';
import { flattenPath } from './seam';

/** Angular deviation (degrees) above which a vertex counts as a corner. */
export const CORNER_ANGLE_THRESHOLD_DEG = 30;

/** Snap tolerance when matching an anchor's refPoint back onto the outline. */
const REF_POINT_SNAP_TOL = 1e-3;

/**
 * Closed-ring vertices of an outline. Dedupes consecutive coincident points
 * — CLO exports double the vertex exactly at corners (curve segment
 * endpoints), and a zero-length wedge side would make the corner detector
 * skip precisely the corners it exists to find — and the Z-closing vertex.
 *
 * Ésta es LA implementación del aplanado v1, y la flecha de dependencia va
 * hacia afuera: `outlineRing.ts` la consume para su métrica v1 (:2), y
 * `notchMirror.ts` la importa en vez de tener copia. Invertirla — que ésta
 * delegara en `outlineRing` — sería un ciclo, y reimplementarla en el otro
 * lado perdería la garantía que importa: el orden algebraico del aplanado
 * decide el último bit IEEE-754, y de ese bit dependen las posiciones de los
 * piquetes que la usuaria ya tiene guardados (#1029).
 */
export function ringOf(outline: PathCommand[]): Point2D[] {
  const raw = flattenPath(outline);
  const pts: Point2D[] = [];
  for (const p of raw) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-9) pts.push(p);
  }
  if (pts.length >= 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) pts.pop();
  }
  return pts;
}

/**
 * Corners of a closed outline: vertices where the direction of travel
 * deviates by at least `thresholdDeg`. Dense curve samples (DXF imports
 * carry 200+ vertices per piece) turn a few degrees per vertex and stay
 * below any sensible threshold; true pattern corners turn sharply.
 */
export function detectCorners(
  outline: PathCommand[],
  thresholdDeg: number = CORNER_ANGLE_THRESHOLD_DEG,
): Point2D[] {
  const ring = ringOf(outline);
  const n = ring.length;
  if (n < 3) return [];

  const corners: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];

    const inX = curr.x - prev.x, inY = curr.y - prev.y;
    const outX = next.x - curr.x, outY = next.y - curr.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen < 1e-9 || outLen < 1e-9) continue;

    const cos = (inX * outX + inY * outY) / (inLen * outLen);
    const deviationDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (deviationDeg >= thresholdDeg) corners.push({ x: curr.x, y: curr.y });
  }
  return corners;
}

/**
 * Total arc length of an outline's closed ring. The precision modal uses
 * this as the distance ceiling — a typed distance beyond the perimeter
 * would otherwise wrap silently (resolveNotchAnchor wraps by design for
 * programmatic callers like scaled grading anchors).
 */
export function outlinePerimeter(outline: PathCommand[], metric: RingMetric = 1): number {
  if (metric === 2) {
    const built = buildRing(outline, 2);
    if (built.ok) return built.value.totalMm;
  }

  const ring = ringOf(outline);
  const n = ring.length;
  if (n < 2) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    acc += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return acc;
}

/** Arc position of the closest point on the ring to `pt`, plus total perimeter. */
function arcPositionOf(ring: Point2D[], pt: Point2D): { s: number; dist: number; perimeter: number } {
  const n = ring.length;
  let acc = 0;
  let best = { s: 0, dist: Infinity };
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) continue;
    let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(pt.x - px, pt.y - py);
    if (d < best.dist) best = { s: acc + t * segLen, dist: d };
    acc += segLen;
  }
  return { ...best, perimeter: acc };
}

/**
 * Anchor a point on the outline to its nearest detected corner (by arc
 * distance, either direction). Returns null when the outline has no
 * corners (e.g. a circle) — such notches stay anchor-less, which the
 * model allows (`notchAnchor` is optional).
 */
export function computeNotchAnchor(
  outline: PathCommand[],
  snapPoint: Point2D,
  metric: RingMetric = 2,
): NotchAnchor | null {
  const ring = ringOf(outline);
  if (ring.length < 3) return null;
  const corners = detectCorners(outline);
  if (corners.length === 0) return null;

  if (metric === 2) {
    const built = buildRing(outline, 2);
    if (built.ok) {
      const exactRing = built.value;
      const s = projectToRing(exactRing, snapPoint).distanceMm;
      const perimeter = exactRing.totalMm;
      if (perimeter < 1e-9) return null;

      let best: NotchAnchor | null = null;
      let bestDist = Infinity;
      for (const corner of corners) {
        const sc = projectToRing(exactRing, corner).distanceMm;
        const forward = (s - sc + perimeter) % perimeter;
        const backward = (sc - s + perimeter) % perimeter;
        if (forward <= backward && forward < bestDist) {
          bestDist = forward;
          best = {
            refPoint: { x: corner.x, y: corner.y },
            direction: 'cw',
            distanceMm: forward,
            metric: 2,
          };
        } else if (backward < forward && backward < bestDist) {
          bestDist = backward;
          best = {
            refPoint: { x: corner.x, y: corner.y },
            direction: 'ccw',
            distanceMm: backward,
            metric: 2,
          };
        }
      }
      return best;
    }
  }

  const { s, perimeter } = arcPositionOf(ring, snapPoint);
  if (perimeter < 1e-9) return null;

  let best: NotchAnchor | null = null;
  let bestDist = Infinity;
  for (const corner of corners) {
    const { s: sc } = arcPositionOf(ring, corner);
    const forward = (s - sc + perimeter) % perimeter;  // corner → point along vertex order
    const backward = (sc - s + perimeter) % perimeter; // corner → point against vertex order
    if (forward <= backward && forward < bestDist) {
      bestDist = forward;
      best = { refPoint: { x: corner.x, y: corner.y }, direction: 'cw', distanceMm: forward };
    } else if (backward < forward && backward < bestDist) {
      bestDist = backward;
      best = { refPoint: { x: corner.x, y: corner.y }, direction: 'ccw', distanceMm: backward };
    }
  }
  return best;
}

/**
 * Igual que {@link resolveNotchAnchor} para la métrica 2, pero con el anillo
 * ya construido. Exportado porque `resolveNotchAnchor` lo construye por dentro
 * en cada llamada, y quien resuelve un ancla por movimiento de ratón —el hover
 * del piquete— no puede permitirse aplanar el contorno sesenta veces por
 * segundo teniendo el anillo memoizado a mano.
 */
export function resolveNotchAnchorV2(
  outline: PathCommand[],
  anchor: NotchAnchor,
  ring: OutlineRing,
): { point: Point2D; normal: Point2D; distanceMm: number } | null {
  const flatRing = ringOf(outline);
  const n = flatRing.length;
  if (n < 3 || !(anchor.distanceMm >= 0) || !Number.isFinite(anchor.distanceMm)) return null;

  const projectedRef = projectToRing(ring, anchor.refPoint);
  const refDistance = Math.hypot(
    anchor.refPoint.x - projectedRef.point.x,
    anchor.refPoint.y - projectedRef.point.y,
  );
  const tol = Math.max(REF_POINT_SNAP_TOL, ring.totalMm * 1e-6);
  if (refDistance > tol) return null;

  const d = anchor.distanceMm % ring.totalMm;
  const target = anchor.direction === 'cw'
    ? (projectedRef.distanceMm + d) % ring.totalMm
    : (projectedRef.distanceMm - d + ring.totalMm) % ring.totalMm;
  const point = pointAt(ring, target).point;

  const epsilonMm = 1e-3;
  const before = pointAt(ring, target - epsilonMm).point;
  const after = pointAt(ring, target + epsilonMm).point;
  const tangentX = after.x - before.x;
  const tangentY = after.y - before.y;
  const tangentLength = Math.hypot(tangentX, tangentY);
  if (tangentLength < 1e-9) return null;
  const tx = tangentX / tangentLength;
  const ty = tangentY / tangentLength;

  let area2 = 0;
  for (let index = 0; index < n; index++) {
    const a = flatRing[index];
    const b = flatRing[(index + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  const normal = area2 > 0
    ? { x: -ty, y: tx }
    : { x: ty, y: -tx };
  return { point, normal, distanceMm: d };
}

/** Index of the entry in `pts` closest to `pt`, or -1 for an empty list. */
function nearestIndex(pts: Point2D[], pt: Point2D): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pt.x, pts[i].y - pt.y);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Follow a reference corner that was itself dragged, so an anchor keeps
 * pointing at "the armhole corner" rather than at the coordinates the armhole
 * corner used to have (nota de María #171).
 *
 * `detectCorners` returns corners in ring order, so a corner that merely moved
 * keeps its ordinal — that ordinal survives the coordinate change which makes
 * {@link resolveNotchAnchor} fail. The ordinal match must ALSO be the nearest
 * corner to the old position: two independent signals, and disagreement means
 * the shape changed in a way ordinals can't describe. Returns null then, and
 * whenever the corner count changed (the corner was deleted, or an edit made a
 * new vertex sharp enough to count), because relocating a notch to the wrong
 * reference is worse than leaving it frozen (D-2: path manda).
 */
export function trackMovedCorner(
  prevOutline: PathCommand[],
  outline: PathCommand[],
  refPoint: Point2D,
): Point2D | null {
  const prev = detectCorners(prevOutline);
  const next = detectCorners(outline);
  if (prev.length === 0 || prev.length !== next.length) return null;

  const ordinal = nearestIndex(prev, refPoint);
  // Guard against anchors that never pointed at a corner in the first place:
  // refPoint is copied verbatim out of detectCorners, so an honest one matches
  // exactly and this tolerance only absorbs float noise.
  if (Math.hypot(prev[ordinal].x - refPoint.x, prev[ordinal].y - refPoint.y) > REF_POINT_SNAP_TOL) {
    return null;
  }
  if (nearestIndex(next, refPoint) !== ordinal) return null;
  return next[ordinal];
}

/**
 * Resolve an anchor back to a point on the outline + inward unit normal.
 * Returns null when the refPoint no longer lies on the outline (edited
 * geometry) — callers re-identify the corner via {@link trackMovedCorner}, or
 * fall back to the frozen path (D-2: path manda).
 */
export function resolveNotchAnchor(
  outline: PathCommand[],
  anchor: NotchAnchor,
): { point: Point2D; normal: Point2D; distanceMm: number } | null {
  if (anchor.metric === 2) {
    const built = buildRing(outline, 2);
    if (built.ok) return resolveNotchAnchorV2(outline, anchor, built.value);
  }

  const ring = ringOf(outline);
  const n = ring.length;
  if (n < 3 || !(anchor.distanceMm >= 0)) return null;

  const ref = arcPositionOf(ring, anchor.refPoint);
  if (ref.perimeter < 1e-9) return null;
  // refPoint must actually sit on the outline (tolerance scales with size)
  const tol = Math.max(REF_POINT_SNAP_TOL, ref.perimeter * 1e-6);
  if (ref.dist > tol) return null;

  const offset = anchor.distanceMm % ref.perimeter;
  const target = anchor.direction === 'cw'
    ? (ref.s + offset) % ref.perimeter
    : (ref.s - offset + ref.perimeter) % ref.perimeter;

  // Winding via shoelace: interior is left of travel for CCW (positive
  // area), right for CW — picks the inward normal deterministically.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }

  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) continue;
    if (target <= acc + segLen + 1e-9) {
      const t = Math.max(0, Math.min(1, (target - acc) / segLen));
      const tx = dx / segLen, ty = dy / segLen;
      // Left normal of travel = (-ty, tx); inward depends on winding.
      const inward = area2 > 0
        ? { x: -ty, y: tx }
        : { x: ty, y: -tx };
      return { point: { x: a.x + t * dx, y: a.y + t * dy }, normal: inward, distanceMm: offset };
    }
    acc += segLen;
  }
  return null;
}
