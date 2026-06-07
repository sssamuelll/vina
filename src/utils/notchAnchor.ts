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
 */
function ringOf(outline: PathCommand[]): Point2D[] {
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
export function outlinePerimeter(outline: PathCommand[]): number {
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
export function computeNotchAnchor(outline: PathCommand[], snapPoint: Point2D): NotchAnchor | null {
  const ring = ringOf(outline);
  if (ring.length < 3) return null;
  const corners = detectCorners(outline);
  if (corners.length === 0) return null;

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
 * Resolve an anchor back to a point on the outline + inward unit normal.
 * Returns null when the refPoint no longer lies on the outline (edited
 * geometry) — callers fall back to the frozen path (D-2: path manda).
 */
export function resolveNotchAnchor(
  outline: PathCommand[],
  anchor: NotchAnchor,
): { point: Point2D; normal: Point2D } | null {
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
      return { point: { x: a.x + t * dx, y: a.y + t * dy }, normal: inward };
    }
    acc += segLen;
  }
  return null;
}
