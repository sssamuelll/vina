import { describe, it, expect } from 'vitest';
import type { PathCommand, CornerType, Point2D } from '../../../types/types';
import { generateSeamAllowanceWithCorners, cleanClosedContour } from '../cornerTypes';

/**
 * The corner bundle contract is prev-side first, next-side last.
 *
 * cornerDoubleMitered and cornerTrimMirrored used to emit their symmetric pair
 * in whatever order the ±perp step produced, which is unrelated to the walk
 * direction — so at some vertices the pair was reversed and the cut line
 * crossed itself in a small bowtie there. simplifyPaths preserved the crossing
 * (it is a vertex reducer, not a topology pass), so nothing downstream noticed.
 *
 * The test that catches it: run the assembled contour through the boolean Union
 * in cleanClosedContour. A simple contour survives with its geometry intact; a
 * self-crossing one has its lobes removed and collapses toward the miter.
 */

const ptsOf = (cmds: PathCommand[]): Point2D[] =>
  cmds.filter(c => c.type === 'M' || c.type === 'L').map(c => ({ x: c.values[0], y: c.values[1] }));

function ngon(n: number, r: number, cx = 500, cy = 500): PathCommand[] {
  const cmds: PathCommand[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    cmds.push({ type: i === 0 ? 'M' : 'L', values: [cx + r * Math.cos(t), cy + r * Math.sin(t)] });
  }
  cmds.push({ type: 'Z', values: [] });
  return cmds;
}

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

/** Corner types whose bundle is a symmetric pair around a centre point. */
const PAIRED: CornerType[] = ['doubleMitered', 'trimMirrored'];

describe('corner bundles walk prev-side to next-side', () => {
  for (const type of PAIRED) {
    it(`${type} produces a contour with no self-intersection (square)`, () => {
      const walked = ptsOf(generateSeamAllowanceWithCorners(square, 10, type, {}));
      const cleaned = cleanClosedContour(walked);
      // Union keeps every vertex of a simple contour. A crossed one loses its
      // lobes — before the fix this dropped from 8 points to 4.
      expect(cleaned.length).toBe(walked.length);
    });

    it(`${type} survives Union on shapes with many non-right angles`, () => {
      for (const n of [3, 5, 7, 12]) {
        const walked = ptsOf(generateSeamAllowanceWithCorners(ngon(n, 200), 12, type, {}));
        const cleaned = cleanClosedContour(walked);
        expect(cleaned.length, `${type} on a ${n}-gon`).toBe(walked.length);
      }
    });
  }

  it('doubleMitered still blunts the tip — the pair is two distinct points', () => {
    const walked = ptsOf(generateSeamAllowanceWithCorners(square, 10, 'doubleMitered', {}));
    const mitered = ptsOf(generateSeamAllowanceWithCorners(square, 10, 'mitered', {}));
    // Two points per corner instead of one, and none of them coincide.
    expect(walked.length).toBe(mitered.length * 2);
    for (let i = 0; i < walked.length; i++) {
      const j = (i + 1) % walked.length;
      expect(Math.hypot(walked[i].x - walked[j].x, walked[i].y - walked[j].y)).toBeGreaterThan(0.01);
    }
  });

  it('the blunted contour stays inside the mitered one and outside the piece', () => {
    // Blunting cuts the corner back, so its area sits between the net piece and
    // the full miter. A crossed contour breaks this ordering.
    const areaOf = (pts: Point2D[]) => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      return Math.abs(a / 2);
    };
    const net = areaOf(ptsOf(square));
    const blunt = areaOf(ptsOf(generateSeamAllowanceWithCorners(square, 10, 'doubleMitered', {})));
    const miter = areaOf(ptsOf(generateSeamAllowanceWithCorners(square, 10, 'mitered', {})));

    expect(blunt).toBeGreaterThan(net);
    expect(blunt).toBeLessThan(miter);
  });
});
