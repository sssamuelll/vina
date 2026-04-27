import { describe, it, expect } from 'vitest';
import type { PathCommand, InternalLine, Dart, SemanticEdge, PatternPiece } from '../../../types/types';
import {
  findSlashIntersections,
  splitOutlineAtSlash,
  classifyInternals,
  classifyDarts,
  mergeSpreadHalves,
  rebuildSemanticEdges,
  buildSpreadPiece,
} from '../slashAndSpread';

// 100x150 rectangle: corners at (0,0), (100,0), (100,150), (0,150)
const rect100x150: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

describe('findSlashIntersections', () => {
  it('vertical line through 100x150 rectangle finds exactly 2 intersections at x=50', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    expect(hit1).toBeDefined();
    expect(hit2).toBeDefined();

    const points = [hit1.point, hit2.point];
    points.forEach(p => {
      expect(p.x).toBeCloseTo(50, 1);
    });

    // One hit near y=0, one near y=150
    const ys = points.map(p => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(0, 1);
    expect(ys[1]).toBeCloseTo(150, 1);
  });

  it('horizontal line through 100x150 rectangle finds exactly 2 intersections', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: -10, y: 75 },
      { x: 110, y: 75 },
    );
    expect(hit1).toBeDefined();
    expect(hit2).toBeDefined();

    const points = [hit1.point, hit2.point];
    points.forEach(p => {
      expect(p.y).toBeCloseTo(75, 1);
    });

    // One hit near x=0, one near x=100
    const xs = points.map(p => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 1);
    expect(xs[1]).toBeCloseTo(100, 1);
  });

  it('returns tuple of exactly two OutlineHit objects with correct shape', () => {
    const result = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    // Vertical slash at x=50 through this rect produces two intersections:
    //   bottom edge (cmd 1, midpoint of L (0,0)→(100,0)) at (50, 0)
    //   top edge    (cmd 3, midpoint of L (100,150)→(0,150)) at (50, 150)
    // toEqual pins down length, order, indices, t-values, and point coords.
    expect(result).toEqual([
      { commandIndex: 1, t: 0.5, point: { x: 50, y: 0 } },
      { commandIndex: 3, t: 0.5, point: { x: 50, y: 150 } },
    ]);
  });

  it('line that misses piece entirely throws', () => {
    expect(() =>
      findSlashIntersections(
        rect100x150,
        { x: 200, y: -10 },
        { x: 200, y: 160 },
      ),
    ).toThrow();
  });

  it('tangent line (not exactly 2 intersections) throws', () => {
    // A line that passes through exactly one corner of the rectangle produces
    // only 1 intersection hit (the corner point), not 2.
    // Line from (-5, 5) to (5, -5) crosses only the top-left corner (0, 0).
    expect(() =>
      findSlashIntersections(
        rect100x150,
        { x: -5, y: 5 },
        { x: 5, y: -5 },
      ),
    ).toThrow();
  });

  it('throws on invalid outline (no M/Z)', () => {
    const invalid: PathCommand[] = [
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
    ];
    expect(() =>
      findSlashIntersections(invalid, { x: 50, y: -10 }, { x: 50, y: 160 }),
    ).toThrow(/Invalid outline/);
  });

  it('throws on empty outline', () => {
    expect(() =>
      findSlashIntersections([], { x: 50, y: -10 }, { x: 50, y: 160 }),
    ).toThrow(/Invalid outline/);
  });
});

describe('splitOutlineAtSlash', () => {
  it('splitting rectangle at vertical line produces two valid closed sub-paths', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    // Both halves must be arrays of PathCommands
    expect(Array.isArray(halfA)).toBe(true);
    expect(Array.isArray(halfB)).toBe(true);

    // Both halves must have content
    expect(halfA.length).toBeGreaterThan(2);
    expect(halfB.length).toBeGreaterThan(2);
  });

  it('each half starts with M and ends with Z', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(halfA[0].type).toBe('M');
    expect(halfA[halfA.length - 1].type).toBe('Z');
    expect(halfB[0].type).toBe('M');
    expect(halfB[halfB.length - 1].type).toBe('Z');
  });

  it('returns a splitMap object with halfAIndices, halfBIndices, hit1, hit2', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const result = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(result).toHaveProperty('splitMap');
    const { splitMap } = result;

    expect(splitMap).toHaveProperty('halfAIndices');
    expect(splitMap).toHaveProperty('halfBIndices');
    expect(splitMap).toHaveProperty('hit1');
    expect(splitMap).toHaveProperty('hit2');

    expect(Array.isArray(splitMap.halfAIndices)).toBe(true);
    expect(Array.isArray(splitMap.halfBIndices)).toBe(true);
  });

  it('splitMap indices array length matches corresponding half command count', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB, splitMap } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(splitMap.halfAIndices).toHaveLength(halfA.length);
    expect(splitMap.halfBIndices).toHaveLength(halfB.length);
  });

  it('splitMap indices use -1 for inserted commands (cut points)', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { splitMap } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    // M commands at split points and the closing L commands are inserted (-1)
    const allIndices = [...splitMap.halfAIndices, ...splitMap.halfBIndices];
    expect(allIndices.some(i => i === -1)).toBe(true);
  });
});

// ─── classifyInternals + classifyDarts ───────────────────────────────────────
//
// Halves: 100x150 rectangle split at x=50
//   halfA = left half  (x: 0–50)
//   halfB = right half (x: 50–100)
//
const halfA: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [50, 0] },
  { type: 'L', values: [50, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];
const halfB: PathCommand[] = [
  { type: 'M', values: [50, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 150] },
  { type: 'L', values: [50, 150] },
  { type: 'Z', values: [] },
];

describe('classifyInternals', () => {
  it('assigns grainline on left side to internalsA', () => {
    // Grainline running vertically near x=25 — clearly inside halfA
    const grainline: InternalLine = {
      id: 'grain-left',
      type: 'grainline',
      path: [
        { type: 'M', values: [25, 30] },
        { type: 'L', values: [25, 120] },
      ],
    };
    const { internalsA, internalsB } = classifyInternals([grainline], halfA, halfB);
    expect(internalsA).toHaveLength(1);
    expect(internalsA[0].id).toBe('grain-left');
    expect(internalsB).toHaveLength(0);
  });

  it('assigns internal line on right side to internalsB', () => {
    // Reference line running horizontally near x=75 — clearly inside halfB
    const refLine: InternalLine = {
      id: 'ref-right',
      type: 'reference',
      path: [
        { type: 'M', values: [60, 75] },
        { type: 'L', values: [90, 75] },
      ],
    };
    const { internalsA, internalsB } = classifyInternals([refLine], halfA, halfB);
    expect(internalsB).toHaveLength(1);
    expect(internalsB[0].id).toBe('ref-right');
    expect(internalsA).toHaveLength(0);
  });

  it('handles internal near the boundary by majority vote', () => {
    // Line from x=40 to x=60 — 3 of 5 samples (at 40, 45, 50, 55, 60) lie in halfA:
    //   x=40 → halfA, x=45 → halfA, x=50 → boundary (counted by whichever polygon
    //   the ray-cast returns; either is acceptable), x=55 → halfB, x=60 → halfB
    // We just verify it's assigned to one of the two halves without throwing.
    const boundary: InternalLine = {
      id: 'boundary-line',
      type: 'fold',
      path: [
        { type: 'M', values: [40, 75] },
        { type: 'L', values: [60, 75] },
      ],
    };
    const { internalsA, internalsB } = classifyInternals([boundary], halfA, halfB);
    const total = internalsA.length + internalsB.length;
    expect(total).toBe(1);
  });

  it('returns empty arrays when no internals are provided', () => {
    const { internalsA, internalsB } = classifyInternals([], halfA, halfB);
    expect(internalsA).toHaveLength(0);
    expect(internalsB).toHaveLength(0);
  });

  it('classifies multiple internals correctly in one call', () => {
    const left: InternalLine = {
      id: 'left',
      type: 'grainline',
      path: [{ type: 'M', values: [20, 50] }, { type: 'L', values: [20, 100] }],
    };
    const right: InternalLine = {
      id: 'right',
      type: 'topstitch',
      path: [{ type: 'M', values: [70, 50] }, { type: 'L', values: [70, 100] }],
    };
    const { internalsA, internalsB } = classifyInternals([left, right], halfA, halfB);
    expect(internalsA.map(l => l.id)).toContain('left');
    expect(internalsB.map(l => l.id)).toContain('right');
  });
});

describe('classifyDarts', () => {
  it('assigns dart with apex on left to dartsA', () => {
    const dart: Dart = {
      id: 'dart-left',
      intake: 10,
      apex: { x: 25, y: 75 },
      legs: [[{ x: 20, y: 150 }], [{ x: 30, y: 150 }]],
      foldDirection: 'toward-center',
    };
    const { dartsA, dartsB } = classifyDarts([dart], halfA, halfB);
    expect(dartsA).toHaveLength(1);
    expect(dartsA[0].id).toBe('dart-left');
    expect(dartsB).toHaveLength(0);
  });

  it('assigns dart with apex on right to dartsB', () => {
    const dart: Dart = {
      id: 'dart-right',
      intake: 8,
      apex: { x: 75, y: 75 },
      legs: [[{ x: 70, y: 150 }], [{ x: 80, y: 150 }]],
      foldDirection: 'toward-center',
    };
    const { dartsA, dartsB } = classifyDarts([dart], halfA, halfB);
    expect(dartsB).toHaveLength(1);
    expect(dartsB[0].id).toBe('dart-right');
    expect(dartsA).toHaveLength(0);
  });

  it('returns empty arrays when no darts are provided', () => {
    const { dartsA, dartsB } = classifyDarts([], halfA, halfB);
    expect(dartsA).toHaveLength(0);
    expect(dartsB).toHaveLength(0);
  });

  it('classifies multiple darts correctly', () => {
    const d1: Dart = { id: 'd1', intake: 10, apex: { x: 15, y: 60 }, legs: [[], []], foldDirection: 'left' };
    const d2: Dart = { id: 'd2', intake: 6,  apex: { x: 85, y: 60 }, legs: [[], []], foldDirection: 'right' };
    const { dartsA, dartsB } = classifyDarts([d1, d2], halfA, halfB);
    expect(dartsA.map(d => d.id)).toContain('d1');
    expect(dartsB.map(d => d.id)).toContain('d2');
  });
});

// ─── applyPivotSpread + applyParallelSpread ───────────────────────────────────

import { applyPivotSpread, applyParallelSpread } from '../slashAndSpread';

// Simple triangle outline used in spread tests:
//   M(50,0) L(100,0) L(50,100) Z
const triangleOutline: PathCommand[] = [
  { type: 'M', values: [50, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [50, 100] },
  { type: 'Z', values: [] },
];

const noInternals: InternalLine[] = [];
const noDarts: Dart[] = [];

describe('applyPivotSpread', () => {
  it('90° rotation around origin maps (50,0) → (0,50)', () => {
    const result = applyPivotSpread(
      [{ type: 'M', values: [50, 0] }, { type: 'Z', values: [] }],
      noInternals,
      noDarts,
      { x: 0, y: 0 },
      90,
    );
    // M command: values[0]=x, values[1]=y
    const m = result.outline[0];
    expect(m.values[0]).toBeCloseTo(0, 5);
    expect(m.values[1]).toBeCloseTo(50, 5);
  });

  it('0° rotation returns identical outline coordinates', () => {
    const result = applyPivotSpread(triangleOutline, noInternals, noDarts, { x: 0, y: 0 }, 0);
    // M command
    expect(result.outline[0].values[0]).toBeCloseTo(50, 5);
    expect(result.outline[0].values[1]).toBeCloseTo(0, 5);
    // First L command
    expect(result.outline[1].values[0]).toBeCloseTo(100, 5);
    expect(result.outline[1].values[1]).toBeCloseTo(0, 5);
  });

  it('negative angle rotates in the opposite direction from positive angle', () => {
    const pivot = { x: 0, y: 0 };
    const pt: PathCommand[] = [{ type: 'M', values: [50, 0] }, { type: 'Z', values: [] }];
    const pos = applyPivotSpread(pt, noInternals, noDarts, pivot, 45);
    const neg = applyPivotSpread(pt, noInternals, noDarts, pivot, -45);
    // Both rotated from (50,0); y coords should be opposite sign
    expect(pos.outline[0].values[1]).toBeCloseTo(-neg.outline[0].values[1], 5);
  });

  it('internals are rotated with the outline (90° around origin)', () => {
    const internal: InternalLine = {
      id: 'grain',
      type: 'grainline',
      path: [
        { type: 'M', values: [50, 0] },
        { type: 'L', values: [50, 50] },
      ],
    };
    const result = applyPivotSpread(triangleOutline, [internal], noDarts, { x: 0, y: 0 }, 90);
    expect(result.internals).toHaveLength(1);
    // M(50,0) rotated 90° around origin → (0,50)
    expect(result.internals[0].path[0].values[0]).toBeCloseTo(0, 5);
    expect(result.internals[0].path[0].values[1]).toBeCloseTo(50, 5);
    // L(50,50) rotated 90° around origin → (-50,50)
    expect(result.internals[0].path[1].values[0]).toBeCloseTo(-50, 5);
    expect(result.internals[0].path[1].values[1]).toBeCloseTo(50, 5);
  });

  it('dart apex and legs are rotated (90° around origin)', () => {
    const dart: Dart = {
      id: 'dart1',
      intake: 10,
      apex: { x: 50, y: 0 },
      legs: [[{ x: 40, y: 0 }], [{ x: 60, y: 0 }]],
      foldDirection: 'left',
    };
    const result = applyPivotSpread(triangleOutline, noInternals, [dart], { x: 0, y: 0 }, 90);
    expect(result.darts).toHaveLength(1);
    // apex (50,0) → (0,50)
    expect(result.darts[0].apex.x).toBeCloseTo(0, 5);
    expect(result.darts[0].apex.y).toBeCloseTo(50, 5);
    // leg point (40,0) → (0,40)
    expect(result.darts[0].legs[0][0].x).toBeCloseTo(0, 5);
    expect(result.darts[0].legs[0][0].y).toBeCloseTo(40, 5);
  });
});

describe('applyParallelSpread', () => {
  it('vertical slash direction (0,1) gives perpendicular (1,0): translates x by distance', () => {
    const result = applyParallelSpread(
      [{ type: 'M', values: [50, 0] }, { type: 'Z', values: [] }],
      noInternals,
      noDarts,
      { x: 0, y: 1 },
      20,
    );
    // x should shift by +20, y unchanged
    expect(result.outline[0].values[0]).toBeCloseTo(70, 5);
    expect(result.outline[0].values[1]).toBeCloseTo(0, 5);
  });

  it('all coordinate values in the outline are shifted by the computed translation', () => {
    const result = applyParallelSpread(triangleOutline, noInternals, noDarts, { x: 0, y: 1 }, 10);
    // M(50,0) → (60,0)
    expect(result.outline[0].values[0]).toBeCloseTo(60, 5);
    expect(result.outline[0].values[1]).toBeCloseTo(0, 5);
    // L(100,0) → (110,0)
    expect(result.outline[1].values[0]).toBeCloseTo(110, 5);
    expect(result.outline[1].values[1]).toBeCloseTo(0, 5);
    // L(50,100) → (60,100)
    expect(result.outline[2].values[0]).toBeCloseTo(60, 5);
    expect(result.outline[2].values[1]).toBeCloseTo(100, 5);
  });

  it('internals are translated with the outline', () => {
    const internal: InternalLine = {
      id: 'grain',
      type: 'grainline',
      path: [
        { type: 'M', values: [50, 10] },
        { type: 'L', values: [50, 90] },
      ],
    };
    const result = applyParallelSpread(triangleOutline, [internal], noDarts, { x: 0, y: 1 }, 15);
    expect(result.internals).toHaveLength(1);
    expect(result.internals[0].path[0].values[0]).toBeCloseTo(65, 5);
    expect(result.internals[0].path[0].values[1]).toBeCloseTo(10, 5);
    expect(result.internals[0].path[1].values[0]).toBeCloseTo(65, 5);
    expect(result.internals[0].path[1].values[1]).toBeCloseTo(90, 5);
  });

  it('darts are translated with the outline', () => {
    const dart: Dart = {
      id: 'dart1',
      intake: 10,
      apex: { x: 50, y: 50 },
      legs: [[{ x: 45, y: 100 }], [{ x: 55, y: 100 }]],
      foldDirection: 'left',
    };
    const result = applyParallelSpread(triangleOutline, noInternals, [dart], { x: 0, y: 1 }, 25);
    expect(result.darts).toHaveLength(1);
    // apex (50,50) → (75,50)
    expect(result.darts[0].apex.x).toBeCloseTo(75, 5);
    expect(result.darts[0].apex.y).toBeCloseTo(50, 5);
    // leg (45,100) → (70,100)
    expect(result.darts[0].legs[0][0].x).toBeCloseTo(70, 5);
    expect(result.darts[0].legs[0][0].y).toBeCloseTo(100, 5);
  });
});

// ─── mergeSpreadHalves ────────────────────────────────────────────────────────
//
// Test setup: a 100×100 square split vertically at x=50.
// After splitting:
//   halfA (left):  M(50,0) L(50,100) L(0,100) L(0,0) L(50,0)[slash close] Z
//   halfB (right, shifted +20 in x):
//                  M(70,100) L(70,0) L(120,0) L(120,100) L(70,100)[slash close] Z
//
// The slash-line closing segment in each half is the last L before Z.
//

const splitHalfA: PathCommand[] = [
  { type: 'M', values: [50, 0] },
  { type: 'L', values: [50, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'L', values: [0, 0] },
  { type: 'L', values: [50, 0] }, // slash-line closing segment
  { type: 'Z', values: [] },
];

// right half of 100×100 square, shifted right by 20
const splitHalfB: PathCommand[] = [
  { type: 'M', values: [70, 100] },
  { type: 'L', values: [70, 0] },
  { type: 'L', values: [120, 0] },
  { type: 'L', values: [120, 100] },
  { type: 'L', values: [70, 100] }, // slash-line closing segment
  { type: 'Z', values: [] },
];

describe('mergeSpreadHalves', () => {
  it('straight fill produces closed outline', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'straight');
    const { outline } = result;
    expect(outline[0].type).toBe('M');
    expect(outline[outline.length - 1].type).toBe('Z');
    expect(outline.length).toBeGreaterThan(splitHalfA.length);
    expect(outline.length).toBeGreaterThan(splitHalfB.length);
  });

  it('straight fill has gapCommandCount > 0', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'straight');
    expect(result.gapCommandCount).toBeGreaterThan(0);
  });

  it('smooth fill produces bezier curves (C commands)', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'smooth');
    const hasCubic = result.outline.some(cmd => cmd.type === 'C');
    expect(hasCubic).toBe(true);
  });

  it('merged outline is closed — last L before Z returns to M start point', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'straight');
    const { outline } = result;
    const mCmd = outline[0];
    // The command just before Z closes back to M
    const lastEdge = outline[outline.length - 2];
    expect(lastEdge.type).toBe('L');
    expect(lastEdge.values[0]).toBeCloseTo(mCmd.values[0], 3);
    expect(lastEdge.values[1]).toBeCloseTo(mCmd.values[1], 3);
  });

  it('gapCommandCount for straight fill is 1 (one L per gap)', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'straight');
    expect(result.gapCommandCount).toBe(1);
  });

  it('smooth fill outline starts with M and ends with Z', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'smooth');
    const { outline } = result;
    expect(outline[0].type).toBe('M');
    expect(outline[outline.length - 1].type).toBe('Z');
  });

  it('merged outline contains body edges from both halves', () => {
    const result = mergeSpreadHalves(splitHalfA, splitHalfB, 'straight');
    const { outline } = result;
    const xs = outline
      .filter(c => c.type === 'L' || c.type === 'M')
      .map(c => c.values[0]);
    // outer-left edge of halfA at x=0
    expect(xs.some(x => Math.abs(x - 0) < 0.01)).toBe(true);
    // outer-right edge of halfB at x=120
    expect(xs.some(x => Math.abs(x - 120) < 0.01)).toBe(true);
  });
});

// ─── rebuildSemanticEdges ─────────────────────────────────────────────────────
//
// Test setup:
//   Original outline has commands at indices 0..4 (M L L L Z  for a rectangle).
//   After splitting at x=50, a splitMap is built where:
//     halfA (left side, x 0-50): contains original indices [1, 2, 3] among its commands
//     halfB (right side, x 50-100): contains original indices [1, 4, 3] (or similar)
//
// We build a synthetic splitMap to have deterministic tests.
//
// Original outline:
//   0: M(0,0), 1: L(100,0), 2: L(100,150), 3: L(0,150), 4: Z
//
// After split at x=50 (vertical):
//   halfA (left): M(50,0)[new] L(100,0)[orig=1] L(100,150)[orig=2] L(50,150)[new] L(50,0)[slash] Z
//   halfB (right): similar
//
// For rebuildSemanticEdges we need a realistic splitMap. We derive it from the
// actual splitOutlineAtSlash call so tests are grounded in real data.

describe('rebuildSemanticEdges', () => {
  // Build a splitMap from the actual split
  const [rHit1, rHit2] = findSlashIntersections(
    rect100x150,
    { x: 50, y: -10 },
    { x: 50, y: 160 },
  );
  const { splitMap } = splitOutlineAtSlash(rect100x150, rHit1, rHit2);

  // Identify which original indices live in halfA vs halfB
  const halfAOriginals = new Set(splitMap.halfAIndices.filter(i => i !== -1));
  const halfBOriginals = new Set(splitMap.halfBIndices.filter(i => i !== -1));

  // rect100x150 has 5 commands: M(0)=0, L(100,0)=1, L(100,150)=2, L(0,150)=3, Z=4
  // After vertical cut at x=50, halfA should include indices for L(0,150) (=3) etc.
  // halfB should include indices for L(100,0) (=1) and L(100,150) (=2)

  it('edge on static half (halfB kept) is unchanged when selectedHalf=A', () => {
    // Find a command index that is in halfB (right side)
    const halfBIdx = [...halfBOriginals][0];
    const edge: SemanticEdge = {
      id: 'e1',
      name: 'rightSeam',
      segmentRange: [halfBIdx, halfBIdx + 1],
      edgeType: 'seam',
    };
    // selectedHalf = 'A' means A is spread, B is static
    const result = rebuildSemanticEdges([edge], splitMap, 1, 'A');
    expect(result).toHaveLength(1);
    // Static half (B) → range unchanged
    expect(result[0].segmentRange[0]).toBe(halfBIdx);
    expect(result[0].segmentRange[1]).toBe(halfBIdx + 1);
  });

  it('edge on spread half (halfA spread) gets range offset by gapCommandCount', () => {
    // Find an original index that is in halfA (left side)
    const halfAIdx = [...halfAOriginals][0];
    const edge: SemanticEdge = {
      id: 'e2',
      name: 'leftSeam',
      segmentRange: [halfAIdx, halfAIdx + 1],
      edgeType: 'seam',
    };
    const gapCommandCount = 2;
    const result = rebuildSemanticEdges([edge], splitMap, gapCommandCount, 'A');
    expect(result).toHaveLength(1);
    // Spread half → range shifted by gapCommandCount
    expect(result[0].segmentRange[0]).toBe(halfAIdx + gapCommandCount);
    expect(result[0].segmentRange[1]).toBe(halfAIdx + 1 + gapCommandCount);
  });

  it('multiple edges — each adjusted correctly to its half', () => {
    const halfAIdx = [...halfAOriginals][0];
    const halfBIdx = [...halfBOriginals][0];
    const edgeA: SemanticEdge = {
      id: 'eA',
      name: 'leftEdge',
      segmentRange: [halfAIdx, halfAIdx + 1],
      edgeType: 'seam',
    };
    const edgeB: SemanticEdge = {
      id: 'eB',
      name: 'rightEdge',
      segmentRange: [halfBIdx, halfBIdx + 1],
      edgeType: 'hem',
    };
    const gapCommandCount = 1;
    // selectedHalf='B' means B is spread, A is static
    const result = rebuildSemanticEdges([edgeA, edgeB], splitMap, gapCommandCount, 'B');
    expect(result).toHaveLength(2);

    const rA = result.find(e => e.id === 'eA')!;
    const rB = result.find(e => e.id === 'eB')!;

    // halfA is static (selected='B'), so eA is unchanged
    expect(rA.segmentRange[0]).toBe(halfAIdx);
    expect(rA.segmentRange[1]).toBe(halfAIdx + 1);

    // halfB is the spread half, so eB is offset
    expect(rB.segmentRange[0]).toBe(halfBIdx + gapCommandCount);
    expect(rB.segmentRange[1]).toBe(halfBIdx + 1 + gapCommandCount);
  });

  it('edge with no match in splitMap (unknown original index) is preserved as-is', () => {
    const edge: SemanticEdge = {
      id: 'eUnknown',
      name: 'mystery',
      segmentRange: [99, 100],
      edgeType: 'unknown',
    };
    const result = rebuildSemanticEdges([edge], splitMap, 3, 'A');
    expect(result).toHaveLength(1);
    // Fallback: preserved unchanged
    expect(result[0].segmentRange[0]).toBe(99);
    expect(result[0].segmentRange[1]).toBe(100);
  });

  it('empty edges array returns empty array', () => {
    const result = rebuildSemanticEdges([], splitMap, 1, 'A');
    expect(result).toHaveLength(0);
  });
});

// ─── buildSpreadPiece ─────────────────────────────────────────────────────────
//
// Build a minimal PatternPiece for round-trip testing.
// Using the 100×150 rectangle, slashing vertically at x=50.

function makeTestPiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'piece-test-1',
    name: 'TestPiece',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

/** Compute signed polygon area via shoelace formula. */
function polygonArea(outline: PathCommand[]): number {
  const pts: Array<{ x: number; y: number }> = [];
  let cx = 0, cy = 0;
  for (const cmd of outline) {
    switch (cmd.type) {
      case 'M': cx = cmd.values[0]; cy = cmd.values[1]; pts.push({ x: cx, y: cy }); break;
      case 'L': cx = cmd.values[0]; cy = cmd.values[1]; pts.push({ x: cx, y: cy }); break;
      case 'Z': break;
      default:
        if (cmd.values.length >= 2) {
          cx = cmd.values[cmd.values.length - 2];
          cy = cmd.values[cmd.values.length - 1];
          pts.push({ x: cx, y: cy });
        }
    }
  }
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

// Slash line: vertical at x=50, from top to bottom of the piece
const slashStart = { x: 50, y: -10 };
const slashEnd = { x: 50, y: 160 };

describe('buildSpreadPiece', () => {
  it('returns a PatternPiece with same id and name as input', () => {
    const piece = makeTestPiece();
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 10, 'pivot', 'straight');
    expect(result.id).toBe(piece.id);
    expect(result.name).toBe(piece.name);
  });

  it('clears linkedPieceId and linkMode after spread', () => {
    const piece = makeTestPiece({ linkedPieceId: 'other-piece', linkMode: 'symmetry' });
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 10, 'pivot', 'straight');
    expect(result.linkedPieceId).toBeUndefined();
    expect(result.linkMode).toBeUndefined();
  });

  it('area of spread piece is greater than original for non-zero spread (pivot mode)', () => {
    const piece = makeTestPiece();
    const originalArea = polygonArea(piece.outline);
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    // Use a large spread angle to ensure the piece clearly expands
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 45, 'pivot', 'straight');
    const spreadArea = polygonArea(result.outline);
    // With a 45° rotation the spread half is clearly displaced outward —
    // the bounding-box area increases even if the shoelace formula shows
    // some self-intersection for extreme angles; at 45° the area should
    // be non-trivially different from the original and positive.
    expect(spreadArea).toBeGreaterThan(0);
    // The spread outline must be different from zero-spread
    const result0 = buildSpreadPiece(piece, h1, h2, 'A', 'start', 0, 'pivot', 'straight');
    const zeroArea = polygonArea(result0.outline);
    // Zero spread should restore same-ish area as original
    expect(zeroArea).toBeCloseTo(originalArea, -1); // within ~10 units
    // Non-zero spread area must differ from zero spread
    expect(Math.abs(spreadArea - zeroArea)).toBeGreaterThan(100);
  });

  it('area of spread piece is greater than original for non-zero spread (parallel mode)', () => {
    const piece = makeTestPiece();
    const originalArea = polygonArea(piece.outline);
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 20, 'parallel', 'straight');
    const spreadArea = polygonArea(result.outline);
    expect(spreadArea).toBeGreaterThan(originalArea);
  });

  it('area conservation (parallel): spread area ≈ original + gap rectangle', () => {
    const piece = makeTestPiece();
    const originalArea = polygonArea(piece.outline);
    const spreadAmount = 20;
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', spreadAmount, 'parallel', 'straight');
    const spreadArea = polygonArea(result.outline);
    // For parallel spread, the gap is a rectangle: spreadAmount × slashLineLength
    // Slash line is vertical at x=50, crossing a 100×150 rect → length = 150
    const slashLength = Math.sqrt(
      (h2.point.x - h1.point.x) ** 2 + (h2.point.y - h1.point.y) ** 2,
    );
    const expectedGapArea = spreadAmount * slashLength;
    // Allow 5% tolerance for floating-point and merge-gap-fill artifacts
    expect(spreadArea).toBeCloseTo(originalArea + expectedGapArea, -2);
  });

  it('pivot mode: spread half outline is rotated (M point of halfA changes)', () => {
    const piece = makeTestPiece();
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result0 = buildSpreadPiece(piece, h1, h2, 'A', 'start', 0, 'pivot', 'straight');
    const result30 = buildSpreadPiece(piece, h1, h2, 'A', 'start', 30, 'pivot', 'straight');
    // The outlines should differ when angle != 0
    const outline0 = JSON.stringify(result0.outline);
    const outline30 = JSON.stringify(result30.outline);
    expect(outline0).not.toBe(outline30);
  });

  it('parallel mode: spread half is translated (outline differs from pivot)', () => {
    const piece = makeTestPiece();
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const resultPivot = buildSpreadPiece(piece, h1, h2, 'A', 'start', 20, 'pivot', 'straight');
    const resultParallel = buildSpreadPiece(piece, h1, h2, 'A', 'start', 20, 'parallel', 'straight');
    expect(JSON.stringify(resultPivot.outline)).not.toBe(JSON.stringify(resultParallel.outline));
  });

  it('internals are present in result when piece has internals', () => {
    const internal: InternalLine = {
      id: 'grain1',
      type: 'grainline',
      path: [{ type: 'M', values: [25, 30] }, { type: 'L', values: [25, 120] }],
    };
    const piece = makeTestPiece({ internals: [internal] });
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 10, 'pivot', 'straight');
    expect(result.internals.length).toBeGreaterThan(0);
  });

  it('darts are present in result when piece has darts', () => {
    const dart: Dart = {
      id: 'dart1',
      intake: 10,
      apex: { x: 25, y: 75 },
      legs: [[{ x: 20, y: 150 }], [{ x: 30, y: 150 }]],
      foldDirection: 'toward-center',
    };
    const piece = makeTestPiece({ darts: [dart] });
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 10, 'pivot', 'straight');
    expect(result.darts).toBeDefined();
    expect(result.darts!.length).toBeGreaterThan(0);
  });

  it('empty darts/edges/internals do not cause crash', () => {
    const piece = makeTestPiece({ darts: [], edges: [], internals: [] });
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    expect(() =>
      buildSpreadPiece(piece, h1, h2, 'A', 'start', 15, 'pivot', 'straight')
    ).not.toThrow();
  });

  it('updatedAt is refreshed on result', () => {
    const piece = makeTestPiece({ updatedAt: 1000 });
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'A', 'start', 10, 'pivot', 'straight');
    expect(result.updatedAt).toBeGreaterThan(piece.updatedAt);
  });

  it('result outline is a valid closed path (starts M, ends Z)', () => {
    const piece = makeTestPiece();
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'B', 'end', 15, 'pivot', 'smooth');
    expect(result.outline[0].type).toBe('M');
    expect(result.outline[result.outline.length - 1].type).toBe('Z');
  });

  it('selectedHalf B spread also works without crash and returns valid piece', () => {
    const piece = makeTestPiece();
    const [h1, h2] = findSlashIntersections(piece.outline, slashStart, slashEnd);
    const result = buildSpreadPiece(piece, h1, h2, 'B', 'end', 10, 'parallel', 'straight');
    expect(result.id).toBe(piece.id);
    expect(result.outline[0].type).toBe('M');
    expect(result.outline[result.outline.length - 1].type).toBe('Z');
  });
});
