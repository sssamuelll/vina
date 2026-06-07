import { describe, it, expect } from 'vitest';
import {
  offsetEdge,
  lineIntersection,
  interiorAngle,
  bisectorDirection,
  cornerMitered,
  cornerDoubleMitered,
  cornerSquared,
  cornerSlant,
  cornerEnvelope,
  cornerMatch,
  cornerTrimMirrored,
  getCornerFunction,
  shiftCornerTypes,
  generateSeamAllowanceWithCorners,
} from '../cornerTypes';
import type { Line2D } from '../cornerTypes';
import { flattenPathWithSource } from '../index';
import type { CornerType, PathCommand } from '../../../types/types';

// ─── flattenPathWithSource (the corner-index fix's core) ─────────────────────

describe('flattenPathWithSource', () => {
  it('tags straight M/L points with their own command index', () => {
    const square: PathCommand[] = [
      { type: 'M', values: [0, 0] },     // cmd 0
      { type: 'L', values: [10, 0] },    // cmd 1
      { type: 'L', values: [10, 10] },   // cmd 2
      { type: 'Z', values: [] },
    ];
    const pts = flattenPathWithSource(square);
    // On a straight piece, flattened index == command index — the historic
    // coincidence that hid the bug.
    expect(pts[0].cmd).toBe(0);
    expect(pts[1].cmd).toBe(1);
    expect(pts[2].cmd).toBe(2);
  });

  it('tags the endpoint of a command AFTER a curve with its own command index, not its flattened position', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },                       // cmd 0 → flattened 0
      { type: 'C', values: [-20, 30, -20, 70, 0, 100] },   // cmd 1 → flattened 1..12
      { type: 'L', values: [100, 100] },                   // cmd 2 → flattened 13
      { type: 'L', values: [100, 0] },                      // cmd 3 → flattened 14
      { type: 'Z', values: [] },
    ];
    const pts = flattenPathWithSource(curved);
    // The 12 curve samples all carry the C command's index (1) — none of them
    // can receive an L/M corner override.
    for (let i = 1; i <= 12; i++) expect(pts[i].cmd).toBe(1);
    // The corner (100,100) is at flattened index 13 but must carry command index 2.
    expect(pts[13]).toMatchObject({ x: 100, y: 100, cmd: 2 });
    expect(pts[14]).toMatchObject({ x: 100, y: 0, cmd: 3 });
  });
});

// ─── offsetEdge ──────────────────────────────────────────────────────────────

describe('offsetEdge', () => {
  it('offsets horizontal edge upward (negative y) by saWidth', () => {
    // Edge going right: (0,0)→(100,0). Perpendicular to the left is (0,-1).
    const edge: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(0);
    expect(result.start.y).toBeCloseTo(-10);
    expect(result.end.x).toBeCloseTo(100);
    expect(result.end.y).toBeCloseTo(-10);
  });

  it('offsets vertical edge rightward by saWidth', () => {
    // Edge going up: (0,0)→(0,100). Perpendicular to the left is (1,0).
    const edge: Line2D = { start: { x: 0, y: 0 }, end: { x: 0, y: 100 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(10);
    expect(result.start.y).toBeCloseTo(0);
    expect(result.end.x).toBeCloseTo(10);
    expect(result.end.y).toBeCloseTo(100);
  });

  it('zero-length edge returns same edge', () => {
    const edge: Line2D = { start: { x: 5, y: 5 }, end: { x: 5, y: 5 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(5);
    expect(result.start.y).toBeCloseTo(5);
    expect(result.end.x).toBeCloseTo(5);
    expect(result.end.y).toBeCloseTo(5);
  });
});

// ─── lineIntersection ────────────────────────────────────────────────────────

describe('lineIntersection', () => {
  it('finds intersection of perpendicular lines', () => {
    // Horizontal line through y=5 and vertical line through x=5 meet at (5,5)
    const horiz: Line2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    const vert: Line2D = { start: { x: 5, y: 0 }, end: { x: 5, y: 10 } };
    const result = lineIntersection(horiz, vert);
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5);
    expect(result!.y).toBeCloseTo(5);
  });

  it('returns null for parallel lines', () => {
    const a: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const b: Line2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    expect(lineIntersection(a, b)).toBeNull();
  });

  it('handles diagonal lines', () => {
    // y=x and y=-x+2 intersect at (1,1)
    const a: Line2D = { start: { x: 0, y: 0 }, end: { x: 2, y: 2 } };
    const b: Line2D = { start: { x: 0, y: 2 }, end: { x: 2, y: 0 } };
    const result = lineIntersection(a, b);
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(1);
    expect(result!.y).toBeCloseTo(1);
  });
});

// ─── interiorAngle ────────────────────────────────────────────────────────────

describe('interiorAngle', () => {
  it('returns PI/2 for right angle', () => {
    // prev: going right, next: going up — 90° between directions
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI / 2);
  });

  it('returns PI/4 for 45-degree angle', () => {
    // prev: going right (1,0), next: going at 45° (1,1) normalized
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 20, y: 10 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI / 4);
  });

  it('returns PI for antiparallel edges (180 degrees between direction vectors)', () => {
    // prev going right (1,0) and next going left (-1,0) → angle between directions = PI
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 0, y: 0 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI);
  });
});

// ─── bisectorDirection ────────────────────────────────────────────────────────

describe('bisectorDirection', () => {
  it('returns unit vector along bisector for right angle', () => {
    // prev going right (1,0), next going up (0,1) — bisector is (1,1)/sqrt(2)
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
    const result = bisectorDirection(prev, next);
    expect(result.x).toBeCloseTo(1 / Math.SQRT2);
    expect(result.y).toBeCloseTo(1 / Math.SQRT2);
  });

  it('length is approximately 1', () => {
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 5 } };
    const next: Line2D = { start: { x: 10, y: 5 }, end: { x: 20, y: 0 } };
    const result = bisectorDirection(prev, next);
    const len = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(len).toBeCloseTo(1);
  });
});

// ─── Shared test fixtures ─────────────────────────────────────────────────────
//
// 100×100 square, top-right corner at vertex (100, 0).
//   Previous edge: (0,0)→(100,0)  — going right
//   Next edge:     (100,0)→(100,100) — going down
//
// offsetEdge for saWidth=10:
//   prevOffsetEdge: (0,-10)→(100,-10)   (shifted up by 10)
//   nextOffsetEdge: (110,0)→(110,100)   (shifted right by 10)
//
// Miter intersection: horizontal y=-10 ∩ vertical x=110 → (110,-10)

const SA = 10;
const vertex90 = { x: 100, y: 0 };

// 90° corner (standard square corner)
const prevEdge90: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const nextEdge90: Line2D = { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } };
const prevOffset90 = offsetEdge(prevEdge90, SA); // (0,-10)→(100,-10)
const nextOffset90 = offsetEdge(nextEdge90, SA); // (110,0)→(110,100)
const angle90 = interiorAngle(prevEdge90, nextEdge90); // PI/2

// 45° corner: prev going right, next going at 45° down-right
const prevEdge45: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const nextEdge45: Line2D = { start: { x: 100, y: 0 }, end: { x: 200, y: 100 } };
const prevOffset45 = offsetEdge(prevEdge45, SA);
const nextOffset45 = offsetEdge(nextEdge45, SA);
const angle45 = interiorAngle(prevEdge45, nextEdge45); // PI/4
const vertex45 = { x: 100, y: 0 };

// 135° corner: prev going right, next going at 135° (up-right)
const prevEdge135: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const nextEdge135: Line2D = { start: { x: 100, y: 0 }, end: { x: 200, y: -100 } };
const prevOffset135 = offsetEdge(prevEdge135, SA);
const nextOffset135 = offsetEdge(nextEdge135, SA);
const angle135 = interiorAngle(prevEdge135, nextEdge135); // 3*PI/4
const vertex135 = { x: 100, y: 0 };

// ─── cornerMitered ───────────────────────────────────────────────────────────

describe('cornerMitered', () => {
  it('returns 1 point at 90° corner', () => {
    const pts = cornerMitered(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(1);
    // Intersection of horizontal y=-10 and vertical x=110
    expect(pts[0].x).toBeCloseTo(110);
    expect(pts[0].y).toBeCloseTo(-10);
  });

  it('returns 1 point at 45° corner', () => {
    const pts = cornerMitered(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(1);
  });

  it('returns 1 point at 135° corner', () => {
    const pts = cornerMitered(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(1);
  });
});

// ─── cornerDoubleMitered ─────────────────────────────────────────────────────

describe('cornerDoubleMitered', () => {
  it('returns 2 points at 90° corner', () => {
    const pts = cornerDoubleMitered(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 45° corner', () => {
    const pts = cornerDoubleMitered(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 135° corner', () => {
    const pts = cornerDoubleMitered(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(2);
  });

  it('two points are symmetric about the vertex→miter axis at 90° corner', () => {
    const pts = cornerDoubleMitered(prevOffset90, nextOffset90, vertex90, SA, angle90);
    // The outward SA bisector for this corner is vertex→miter = (1,-1)/sqrt(2).
    // The midpoint of the two blunt-cut points should lie on that axis.
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dx = mid.x - vertex90.x;
    const dy = mid.y - vertex90.y;
    // Cross product with outward bisector (1,-1)/sqrt(2) should be ~0:
    // (dx,dy) × (1,-1) = dx*(-1) - dy*(1) = 0  →  dx + dy ≈ 0
    expect(dx + dy).toBeCloseTo(0, 5);
  });
});

// ─── cornerSquared ───────────────────────────────────────────────────────────

describe('cornerSquared', () => {
  it('returns 3 points at 90° corner', () => {
    const pts = cornerSquared(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(3);
  });

  it('returns 3 points at 45° corner', () => {
    const pts = cornerSquared(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(3);
  });

  it('returns 3 points at 135° corner', () => {
    const pts = cornerSquared(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(3);
  });

  it('forms right angles at 90° corner', () => {
    const pts = cornerSquared(prevOffset90, nextOffset90, vertex90, SA, angle90);
    // pts[0] should be on the extension of prevOffsetEdge (y ≈ -10)
    expect(pts[0].y).toBeCloseTo(-10);
    // pts[2] should be on the extension of nextOffsetEdge (x ≈ 110)
    expect(pts[2].x).toBeCloseTo(110);
    // Corner point pts[1] forms a right angle with the other two
    expect(pts[1].x).toBeCloseTo(110);
    expect(pts[1].y).toBeCloseTo(-10);
  });
});

// ─── cornerSlant ─────────────────────────────────────────────────────────────

describe('cornerSlant', () => {
  it('returns 2 points at 90° corner', () => {
    const pts = cornerSlant(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 45° corner', () => {
    const pts = cornerSlant(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 135° corner', () => {
    const pts = cornerSlant(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(2);
  });

  it('slant line is perpendicular to bisector at 90° corner', () => {
    const pts = cornerSlant(prevOffset90, nextOffset90, vertex90, SA, angle90);
    // The line from pts[0] to pts[1] should be perpendicular to bisector (1,1)/sqrt(2)
    // i.e., dot product with bisector direction ≈ 0
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    // Bisector dir = (1,1)/sqrt(2); perpendicular means dot = 0
    expect(dx * 1 + dy * 1).toBeCloseTo(0, 5);
  });
});

// ─── cornerEnvelope ──────────────────────────────────────────────────────────

describe('cornerEnvelope', () => {
  it('returns 4 points at 90° corner', () => {
    const pts = cornerEnvelope(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(4);
  });

  it('returns 4 points at 45° corner', () => {
    const pts = cornerEnvelope(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(4);
  });

  it('returns 4 points at 135° corner', () => {
    const pts = cornerEnvelope(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(4);
  });

  it('envelope extends beyond miter point at 90° corner', () => {
    const miter = cornerMitered(prevOffset90, nextOffset90, vertex90, SA, angle90);
    const pts = cornerEnvelope(prevOffset90, nextOffset90, vertex90, SA, angle90);
    // At least one of the inner points should be further from vertex than miter
    const miterDist = Math.hypot(miter[0].x - vertex90.x, miter[0].y - vertex90.y);
    const maxDist = Math.max(
      ...pts.map((p) => Math.hypot(p.x - vertex90.x, p.y - vertex90.y)),
    );
    expect(maxDist).toBeGreaterThanOrEqual(miterDist - 1e-9);
  });
});

// ─── cornerMatch ─────────────────────────────────────────────────────────────

describe('cornerMatch', () => {
  it('returns 1 point at 90° corner', () => {
    const pts = cornerMatch(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(1);
  });

  it('returns 1 point at 45° corner', () => {
    const pts = cornerMatch(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(1);
  });

  it('returns 1 point at 135° corner', () => {
    const pts = cornerMatch(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(1);
  });

  it('is identical to mitered at 90° corner', () => {
    const mitered = cornerMitered(prevOffset90, nextOffset90, vertex90, SA, angle90);
    const match = cornerMatch(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(match[0].x).toBeCloseTo(mitered[0].x);
    expect(match[0].y).toBeCloseTo(mitered[0].y);
  });
});

// ─── cornerTrimMirrored ──────────────────────────────────────────────────────

describe('cornerTrimMirrored', () => {
  it('returns 2 points at 90° corner', () => {
    const pts = cornerTrimMirrored(prevOffset90, nextOffset90, vertex90, SA, angle90);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 45° corner', () => {
    const pts = cornerTrimMirrored(prevOffset45, nextOffset45, vertex45, SA, angle45);
    expect(pts).toHaveLength(2);
  });

  it('returns 2 points at 135° corner', () => {
    const pts = cornerTrimMirrored(prevOffset135, nextOffset135, vertex135, SA, angle135);
    expect(pts).toHaveLength(2);
  });

  it('two points are symmetric about the vertex→miter axis at 90° corner', () => {
    const pts = cornerTrimMirrored(prevOffset90, nextOffset90, vertex90, SA, angle90);
    // The midpoint is the miter itself; it should lie on the vertex→miter axis = (1,-1)/sqrt(2).
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dx = mid.x - vertex90.x;
    const dy = mid.y - vertex90.y;
    // Cross product with outward bisector (1,-1)/sqrt(2) should be ~0:
    // (dx,dy) × (1,-1) = dx*(-1) - dy*(1) = 0  →  dx + dy ≈ 0
    expect(dx + dy).toBeCloseTo(0, 5);
  });

  it('trim amount is saWidth * 0.2 on each side at 90° corner', () => {
    const pts = cornerTrimMirrored(prevOffset90, nextOffset90, vertex90, SA, angle90);
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    // Total distance between the two points should be 2 * saWidth * 0.2
    expect(dist).toBeCloseTo(2 * SA * 0.2, 5);
  });
});

// ─── shiftCornerTypes ────────────────────────────────────────────────────────

describe('shiftCornerTypes', () => {
  it('insert at index 2: keys >= 2 shift by +1', () => {
    const ct = { 1: 'squared' as CornerType, 3: 'envelope' as CornerType };
    expect(shiftCornerTypes(ct, 2, 1)).toEqual({ 1: 'squared', 4: 'envelope' });
  });
  it('remove at index 2: key 2 deleted, keys > 2 shift by -1', () => {
    const ct = { 1: 'squared' as CornerType, 2: 'slant' as CornerType, 4: 'envelope' as CornerType };
    expect(shiftCornerTypes(ct, 2, -1)).toEqual({ 1: 'squared', 3: 'envelope' });
  });
  it('insert at 0: all keys shift', () => {
    const ct = { 0: 'squared' as CornerType, 2: 'envelope' as CornerType };
    expect(shiftCornerTypes(ct, 0, 1)).toEqual({ 1: 'squared', 3: 'envelope' });
  });
  it('empty record returns empty', () => {
    expect(shiftCornerTypes({}, 5, 1)).toEqual({});
  });
});

// ─── generateSeamAllowanceWithCorners ────────────────────────────────────────

describe('generateSeamAllowanceWithCorners', () => {
  const square: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  it('all mitered produces valid SA outline', () => {
    const sa = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    expect(sa.length).toBeGreaterThan(0);
    expect(sa[0].type).toBe('M');
    expect(sa[sa.length - 1].type).toBe('Z');
  });

  it('mixed corner types produces valid SA outline', () => {
    const sa = generateSeamAllowanceWithCorners(square, 10, 'mitered', { 1: 'squared', 2: 'envelope' });
    expect(sa.length).toBeGreaterThan(0);
    // squared adds 2 extra points, envelope adds 3 extra points vs mitered (1 point each)
    const allMitered = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    expect(sa.length).toBeGreaterThan(allMitered.length);
  });

  it('returns empty for zero width', () => {
    expect(generateSeamAllowanceWithCorners(square, 0, 'mitered', {})).toEqual([]);
  });

  it('returns empty for negative width', () => {
    expect(generateSeamAllowanceWithCorners(square, -5, 'mitered', {})).toEqual([]);
  });

  it('returns empty for outline with < 3 vertices', () => {
    const line: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'Z', values: [] },
    ];
    expect(generateSeamAllowanceWithCorners(line, 10, 'mitered', {})).toEqual([]);
  });

  it('handles L-shape (concave corner) without crash', () => {
    const lShape: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [50, 50] },
      { type: 'L', values: [50, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const sa = generateSeamAllowanceWithCorners(lShape, 10, 'mitered', {});
    expect(sa.length).toBeGreaterThan(0);
  });

  it('all-mitered result starts with M and ends with Z', () => {
    const sa = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    expect(sa[0].type).toBe('M');
    expect(sa[sa.length - 1].type).toBe('Z');
  });

  it('per-vertex corner type overrides defaultCornerType', () => {
    // vertex 0 = squared, rest = mitered
    const saOverride = generateSeamAllowanceWithCorners(square, 10, 'mitered', { 0: 'squared' });
    const saAllMitered = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    // squared adds 2 extra pts vs 1 for miter at that vertex
    expect(saOverride.length).toBeGreaterThan(saAllMitered.length);
  });

  it('all-squared default corner type produces more points than all-mitered', () => {
    const saSquared = generateSeamAllowanceWithCorners(square, 10, 'squared', {});
    const saMitered = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    expect(saSquared.length).toBeGreaterThan(saMitered.length);
  });

  // ── Curve index-mismatch regression ──────────────────────────────────────
  // cornerTypes keys are OUTLINE COMMAND indices (findNearestVertex walks the
  // command array). The edge-walk looks them up against the FLATTENED-vertex
  // array, where each C/Q explodes into CURVE_RESOLUTION points. On a square
  // the two indices coincide; on any curved piece they diverge, and a corner
  // override lands on the wrong vertex (a point mid-curve instead of the real
  // corner). This was silent on every real garment (armholes, necklines).
  //
  // Outline: a curved LEFT edge (command 1) followed by two straight corners.
  // Command index 2 = the geometric corner (100,100); after a 12-point curve
  // its flattened index is ~13. The override must land at (100,100), not on
  // the curve at x<0.
  const curvedLeft: PathCommand[] = [
    { type: 'M', values: [0, 0] },                       // cmd 0 → corner (0,0)
    { type: 'C', values: [-20, 30, -20, 70, 0, 100] },   // cmd 1 → left-edge curve → (0,100)
    { type: 'L', values: [100, 100] },                   // cmd 2 → corner (100,100)
    { type: 'L', values: [100, 0] },                      // cmd 3 → corner (100,0)
    { type: 'Z', values: [] },
  ];

  /** Flatten an SA PathCommand[] result to its point list. */
  const ptsOf = (cmds: PathCommand[]) =>
    cmds.filter(c => c.type === 'M' || c.type === 'L').map(c => ({ x: c.values[0], y: c.values[1] }));

  it('applies a corner override at the correct geometric corner on a curved piece', () => {
    // Override 'squared' on command-index 2 = the real corner (100,100).
    const baseline = generateSeamAllowanceWithCorners(curvedLeft, 10, 'mitered', {});
    const override = generateSeamAllowanceWithCorners(curvedLeft, 10, 'mitered', { 2: 'squared' });

    const basePts = ptsOf(baseline);
    const ovrPts = ptsOf(override);
    // Points the override introduced (no nearby baseline point) localize the change.
    const changed = ovrPts.filter(p => !basePts.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 0.5));

    expect(changed.length).toBeGreaterThan(0);
    // Every changed point must sit at the (100,100) corner (right side, x>50),
    // NEVER on the left-edge curve (x<0). With the index bug the override lands
    // mid-curve and these points appear at x<0 → this assertion fails.
    for (const p of changed) {
      expect(p.x).toBeGreaterThan(50);
    }
  });

  it('an all-curve outline (no straight corners) produces valid SA with the default corner everywhere', () => {
    // A rounded blob: every command is a curve, so no flattened vertex carries
    // a straight M/L command index that could receive an override. Guards
    // against a future flattenPathWithSource edit diverging from flattenPath.
    const blob: PathCommand[] = [
      { type: 'M', values: [50, 0] },
      { type: 'C', values: [80, 0, 100, 20, 100, 50] },
      { type: 'C', values: [100, 80, 80, 100, 50, 100] },
      { type: 'C', values: [20, 100, 0, 80, 0, 50] },
      { type: 'C', values: [0, 20, 20, 0, 50, 0] },
      { type: 'Z', values: [] },
    ];
    const sa = generateSeamAllowanceWithCorners(blob, 10, 'mitered', {});
    expect(sa.length).toBeGreaterThan(0);
    expect(sa[0].type).toBe('M');
    expect(sa[sa.length - 1].type).toBe('Z');
  });

  it('a corner override does NOT bleed onto a curved edge that has no override', () => {
    // Only command-3 (corner (100,0)) is overridden; the curved left edge
    // (command 1) must remain identical to the all-mitered baseline.
    const baseline = generateSeamAllowanceWithCorners(curvedLeft, 10, 'mitered', {});
    const override = generateSeamAllowanceWithCorners(curvedLeft, 10, 'mitered', { 3: 'squared' });

    const basePts = ptsOf(baseline);
    const ovrPts = ptsOf(override);
    const changed = ovrPts.filter(p => !basePts.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 0.5));

    expect(changed.length).toBeGreaterThan(0);
    // The change belongs to corner (100,0): right side, low y. The curve lives
    // at x<0 — no changed point may appear there.
    for (const p of changed) {
      expect(p.x).toBeGreaterThan(0);
    }
  });
});

// ─── getCornerFunction ───────────────────────────────────────────────────────

describe('getCornerFunction', () => {
  it('returns cornerMitered for "mitered"', () => {
    expect(getCornerFunction('mitered')).toBe(cornerMitered);
  });

  it('returns cornerDoubleMitered for "doubleMitered"', () => {
    expect(getCornerFunction('doubleMitered')).toBe(cornerDoubleMitered);
  });

  it('returns cornerSquared for "squared"', () => {
    expect(getCornerFunction('squared')).toBe(cornerSquared);
  });

  it('returns cornerSlant for "slant"', () => {
    expect(getCornerFunction('slant')).toBe(cornerSlant);
  });

  it('returns cornerEnvelope for "envelope"', () => {
    expect(getCornerFunction('envelope')).toBe(cornerEnvelope);
  });

  it('returns cornerMatch for "match"', () => {
    expect(getCornerFunction('match')).toBe(cornerMatch);
  });

  it('returns cornerTrimMirrored for "trimMirrored"', () => {
    expect(getCornerFunction('trimMirrored')).toBe(cornerTrimMirrored);
  });
});
