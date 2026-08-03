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
