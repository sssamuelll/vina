import { describe, it, expect } from 'vitest';
import {
  offsetEdge,
  cornerMitered,
  cornerDoubleMitered,
  cornerSquared,
  cornerSlant,
  cornerEnvelope,
  cornerTrimMirrored,
  generateSeamAllowanceWithCorners,
} from '../cornerTypes';
import type { Line2D } from '../cornerTypes';
import type { PathCommand } from '../../../types/types';

// ─── Asymmetric-width corners (per-edge SA prep, step 2) ─────────────────────
//
// Per-edge seam allowance (step 3) offsets each edge to its OWN width, so a
// corner where a 40mm hem meets a 10mm armhole has its two adjacent edges
// offset by different amounts. The corner functions take (prevWidth, nextWidth)
// and resolve the join geometrically. Contract:
//   (a) prevWidth === nextWidth reproduces the legacy single-width behavior
//       EXACTLY (no regression on any existing piece).
//   (b) when they differ, the join honors the asymmetric offset edges; scalar
//       corner factors use the mean of the two widths.
//
// 90° corner at vertex (100,0):
//   prevEdge (0,0)→(100,0) going right; nextEdge (100,0)→(100,100) going down.
//   offset prev by 40 → (0,-40)→(100,-40);  offset next by 10 → (110,0)→(110,100)
//   miter = intersection of y=-40 and x=110 → (110,-40).

const vertex = { x: 100, y: 0 };
const prevEdge: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const nextEdge: Line2D = { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } };
const angle = Math.PI / 2;

const prev40 = offsetEdge(prevEdge, 40);
const next10 = offsetEdge(nextEdge, 10);
const prev10 = offsetEdge(prevEdge, 10);
const next40 = offsetEdge(nextEdge, 40);

describe('asymmetric corner widths — mitered (geometric, no scalar factor)', () => {
  it('miter lands at the intersection of the two asymmetrically-offset edges', () => {
    const pts = cornerMitered(prev40, next10, vertex, 40, 10, angle);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(110); // x = nextWidth offset (10) → 100+10
    expect(pts[0].y).toBeCloseTo(-40); // y = prevWidth offset (40) → 0-40
  });

  it('swapping the widths moves the miter accordingly (10 prev / 40 next)', () => {
    const pts = cornerMitered(prev10, next40, vertex, 10, 40, angle);
    expect(pts[0].x).toBeCloseTo(140); // 100 + nextWidth 40
    expect(pts[0].y).toBeCloseTo(-10); // 0 - prevWidth 10
  });
});

describe('asymmetric corner widths — symmetric equivalence (no regression)', () => {
  const W = 10;
  const p = offsetEdge(prevEdge, W);
  const n = offsetEdge(nextEdge, W);

  // Each function called with (W, W) must equal the same function's geometry
  // for a single width W — these mirror the legacy single-width tests.
  it('mitered(W,W) → single miter point (110,-10)', () => {
    const pts = cornerMitered(p, n, vertex, W, W, angle);
    expect(pts[0].x).toBeCloseTo(110);
    expect(pts[0].y).toBeCloseTo(-10);
  });
  it('doubleMitered(W,W) → 2 symmetric points about the vertex→miter axis', () => {
    const pts = cornerDoubleMitered(p, n, vertex, W, W, angle);
    expect(pts).toHaveLength(2);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    expect((mid.x - vertex.x) + (mid.y - vertex.y)).toBeCloseTo(0, 5);
  });
  it('squared(W,W) → 3 points, right-angle box', () => {
    const pts = cornerSquared(p, n, vertex, W, W, angle);
    expect(pts).toHaveLength(3);
    expect(pts[0].y).toBeCloseTo(-10);
    expect(pts[2].x).toBeCloseTo(110);
  });
  it('slant(W,W) → 2 points', () => {
    expect(cornerSlant(p, n, vertex, W, W, angle)).toHaveLength(2);
  });
  it('envelope(W,W) → 4 points', () => {
    expect(cornerEnvelope(p, n, vertex, W, W, angle)).toHaveLength(4);
  });
  it('trimMirrored(W,W) → trim 2*W*0.2 apart', () => {
    const pts = cornerTrimMirrored(p, n, vertex, W, W, angle);
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    expect(dist).toBeCloseTo(2 * W * 0.2, 5);
  });
});

describe('asymmetric corner widths — scalar factors use the mean width', () => {
  it('doubleMitered depth uses mean(40,10)=25 → midpoint sits 25*0.3 from the miter', () => {
    const pts = cornerDoubleMitered(prev40, next10, vertex, 40, 10, angle);
    expect(pts).toHaveLength(2);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const miter = { x: 110, y: -40 };
    const depth = Math.hypot(mid.x - miter.x, mid.y - miter.y);
    // mean 25 * 0.3 = 7.5 (would be 12 if it used prevWidth=40, 3 if nextWidth=10)
    expect(depth).toBeCloseTo(7.5, 4);
  });

  it('trimMirrored uses mean(40,10)=25 → points 2*25*0.2=10 apart', () => {
    const pts = cornerTrimMirrored(prev40, next10, vertex, 40, 10, angle);
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    expect(dist).toBeCloseTo(2 * 25 * 0.2, 4);
  });

  it('envelope uses mean(40,10)=25 → tab extends 25*0.75=18.75 past the miter', () => {
    const pts = cornerEnvelope(prev40, next10, vertex, 40, 10, angle);
    expect(pts).toHaveLength(4);
    // pts[0] is prevExtEnd = miter + prevDir*ext; its distance from the miter
    // (110,-40) is ext = mean*0.75 (would be 30 with prevWidth=40, 7.5 with 10).
    const miter = { x: 110, y: -40 };
    const ext = Math.hypot(pts[0].x - miter.x, pts[0].y - miter.y);
    expect(ext).toBeCloseTo(25 * 0.75, 4);
  });
});

describe('asymmetric corner widths — generateSeamAllowanceWithCorners stays single-width today', () => {
  // Step 2 only widens the corner-function signature; the generator still feeds
  // one width to both sides (per-edge wiring is step 3). This guards that the
  // generator keeps producing valid SA after the signature change.
  const square: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];
  it('still produces a valid mixed-corner SA outline', () => {
    const sa = generateSeamAllowanceWithCorners(square, 10, 'mitered', { 1: 'squared', 2: 'doubleMitered' });
    expect(sa.length).toBeGreaterThan(0);
    expect(sa[0].type).toBe('M');
    expect(sa[sa.length - 1].type).toBe('Z');
  });
});
