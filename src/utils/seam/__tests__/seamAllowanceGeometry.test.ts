import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { generateSeamAllowanceWithCorners } from '../cornerTypes';

/**
 * maria-190: "los márgenes de costura no se crean bien en un rectángulo y
 * debería ser lo más fácil".
 *
 * The pre-existing SA tests only asserted a BOUNDING BOX, which a scrambled
 * self-intersecting contour still satisfies — that is how a broken cut line
 * shipped to the 2D view AND to the export pipeline. These assert the contour
 * itself: point count, vertex positions, and enclosed area.
 */

const ptsOf = (cmds: PathCommand[]): Point2D[] =>
  cmds.filter(c => c.type === 'M' || c.type === 'L').map(c => ({ x: c.values[0], y: c.values[1] }));

/** Shoelace. A correct outward offset must ENCLOSE the original, so |area| grows. */
function area(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

/** True when `pts` has a point within `tol` of (x, y). */
const hasPoint = (pts: Point2D[], x: number, y: number, tol = 0.01) =>
  pts.some(p => Math.hypot(p.x - x, p.y - y) <= tol);

const bbox = (pts: Point2D[]) => ({
  minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
  minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
});

/** Rectangle exactly as useRectangleTool emits it: M, L, L, L, Z. */
function rect(x: number, y: number, w: number, h: number): PathCommand[] {
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'Z', values: [] },
  ];
}

describe('seam allowance geometry (maria-190)', () => {
  it('a drafted rectangle offsets to exactly four corners', () => {
    const sa = ptsOf(generateSeamAllowanceWithCorners(rect(100, 100, 300, 150), 10, 'mitered', {}));

    expect(sa).toHaveLength(4);
    expect(hasPoint(sa, 90, 90)).toBe(true);
    expect(hasPoint(sa, 410, 90)).toBe(true);
    expect(hasPoint(sa, 410, 260)).toBe(true);
    expect(hasPoint(sa, 90, 260)).toBe(true);
    // 320 x 170
    expect(area(sa)).toBeCloseTo(54400, 0);
  });

  it('the offset grows the piece — never shrinks it', () => {
    // The signature failure of the broken Clipper offset: outward offset of a
    // many-vertex polygon came back SMALLER than the input.
    const poly: PathCommand[] = [];
    const N = 40;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      poly.push({
        type: i === 0 ? 'M' : 'L',
        values: [500 + 200 * Math.cos(t), 500 + 200 * Math.sin(t)],
      });
    }
    poly.push({ type: 'Z', values: [] });

    const inArea = area(ptsOf(poly));
    const outArea = area(ptsOf(generateSeamAllowanceWithCorners(poly, 10, 'mitered', {})));

    expect(outArea).toBeGreaterThan(inArea);
    // A + P*d is the first-order growth; corner wedges add a little on top.
    const perimeter = 2 * N * 200 * Math.sin(Math.PI / N);
    expect(outArea).toBeGreaterThanOrEqual(inArea + perimeter * 10 - 1);
  });

  it('every SA vertex sits at least the SA width away from the piece centre-out', () => {
    // Cheap containment proxy for a convex piece: no SA point may fall inside
    // the original outline. A zigzagging contour violates this immediately.
    const sa = ptsOf(generateSeamAllowanceWithCorners(rect(0, 0, 200, 100), 15, 'mitered', {}));
    for (const p of sa) {
      const inside = p.x > 0.01 && p.x < 199.99 && p.y > 0.01 && p.y < 99.99;
      expect(inside).toBe(false);
    }
  });

  // ── Winding independence ────────────────────────────────────────────────
  // `offsetEdge` shifts along the left-perpendicular of the edge direction, so
  // which side is "outward" is decided by how the outline is wound. Before
  // buildOffsetEdges normalised it, a negatively-wound piece got its seam
  // allowance generated INWARD — silently, and differently per piece depending
  // on how it was authored (the rectangle tool winds one way, some imports the
  // other). The margin ended up on the wrong side of the cloth.

  /** Same rectangle, wound the other way round. */
  function rectReversed(x: number, y: number, w: number, h: number): PathCommand[] {
    return [
      { type: 'M', values: [x, y] },
      { type: 'L', values: [x, y + h] },
      { type: 'L', values: [x + w, y + h] },
      { type: 'L', values: [x + w, y] },
      { type: 'Z', values: [] },
    ];
  }

  it('a reversed-wound piece still grows its seam allowance outward', () => {
    const sa = ptsOf(generateSeamAllowanceWithCorners(rectReversed(100, 100, 300, 150), 10, 'mitered', {}));
    expect(sa).toHaveLength(4);
    expect(area(sa)).toBeCloseTo(54400, 0);
    expect(hasPoint(sa, 90, 90)).toBe(true);
    expect(hasPoint(sa, 410, 260)).toBe(true);
  });

  it('winding does not change the cut line', () => {
    const forward = ptsOf(generateSeamAllowanceWithCorners(rect(0, 0, 200, 100), 12, 'mitered', {}));
    const reverse = ptsOf(generateSeamAllowanceWithCorners(rectReversed(0, 0, 200, 100), 12, 'mitered', {}));
    expect(area(forward)).toBeCloseTo(area(reverse), 6);
    // Same four corners, whatever order they come out in.
    for (const [x, y] of [[-12, -12], [212, -12], [212, 112], [-12, 112]] as const) {
      expect(hasPoint(forward, x, y), `forward missing (${x},${y})`).toBe(true);
      expect(hasPoint(reverse, x, y), `reverse missing (${x},${y})`).toBe(true);
    }
  });

  it('a reversed-wound CURVED piece grows too', () => {
    // The shape the corner-type fixtures use, which turned out to be wound
    // negatively: its cut line came back INSIDE the piece.
    //
    // Asserted on the bounding box, not the area: `ptsOf` drops the C command,
    // so an area comparison here would silently measure a triangle and pass
    // either way. The straight corners sit at x=100, so an outward 10mm margin
    // must reach past it and an inward one must fall short.
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [-20, 30, -20, 70, 0, 100] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [100, 0] },
      { type: 'Z', values: [] },
    ];
    const sa = ptsOf(generateSeamAllowanceWithCorners(curved, 10, 'mitered', {}));
    const b = bbox(sa);
    expect(b.maxX).toBeCloseTo(110, 1);
    expect(b.minY).toBeCloseTo(-10, 1);
    expect(b.maxY).toBeCloseTo(110, 1);
    // The curved left edge bulges to about x=-15, so its margin goes past -20.
    expect(b.minX).toBeLessThan(-20);
  });

  // ── Self-intersection ───────────────────────────────────────────────────

  /** Proper intersection between two open segments (shared endpoints ignored). */
  function segmentsCross(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
    const d = (p: Point2D, q: Point2D, r: Point2D) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = d(b1, b2, a1), d2 = d(b1, b2, a2), d3 = d(a1, a2, b1), d4 = d(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** Every non-adjacent pair of edges in a simple closed polygon misses. */
  function isSimple(pts: Point2D[]): boolean {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent across the closure
        if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  /** 200x200 square with a slot cut up from the bottom edge, `w` mm wide. */
  function slotted(w: number): PathCommand[] {
    const half = w / 2;
    return [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [100 + half, 200] },
      { type: 'L', values: [100 + half, 60] },
      { type: 'L', values: [100 - half, 60] },
      { type: 'L', values: [100 - half, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
  }

  it('a margin narrower than the slot leaves the slot open', () => {
    const sa = ptsOf(generateSeamAllowanceWithCorners(slotted(40), 10, 'mitered', {}));
    expect(isSimple(sa)).toBe(true);
    // The cut line still dips into the slot: points survive above the opening.
    expect(sa.some(p => p.y < 100 && p.x > 80 && p.x < 120)).toBe(true);
    expect(sa.length).toBeGreaterThan(4);
  });

  it('a margin wider than half the slot fills it in', () => {
    // 25mm of allowance on each wall of a 40mm slot leaves no slot — the cloth
    // is continuous across it. The cut line has to become the plain outer
    // rectangle. This is the boolean Union doing the work: simplifyPaths keeps
    // the degenerate inverted slot exactly as the edge-walk emitted it.
    const sa = ptsOf(generateSeamAllowanceWithCorners(slotted(40), 25, 'mitered', {}));
    expect(sa).toHaveLength(4);
    expect(isSimple(sa)).toBe(true);
    const b = bbox(sa);
    expect(b.minX).toBeCloseTo(-25, 1);
    expect(b.maxX).toBeCloseTo(225, 1);
    expect(b.minY).toBeCloseTo(-25, 1);
    expect(b.maxY).toBeCloseTo(225, 1);
  });

  it('the crossing checker actually detects a crossing', () => {
    const sa = ptsOf(generateSeamAllowanceWithCorners(rect(0, 0, 200, 100), 10, 'mitered', {}));
    expect(isSimple(sa)).toBe(true);
    expect(isSimple([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
  });

  it('a curved outline still closes into a single simple contour', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [-20, 30, -20, 70, 0, 100] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [100, 0] },
      { type: 'Z', values: [] },
    ];
    const cmds = generateSeamAllowanceWithCorners(curved, 10, 'mitered', {});
    expect(cmds[0].type).toBe('M');
    expect(cmds[cmds.length - 1].type).toBe('Z');
    // Exactly one subpath — a scrambled result gets split by simplifyPaths.
    expect(cmds.filter(c => c.type === 'M')).toHaveLength(1);
    expect(area(ptsOf(cmds))).toBeGreaterThan(area(ptsOf(curved)));
  });
});
