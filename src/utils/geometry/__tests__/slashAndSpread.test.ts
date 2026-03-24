import { describe, it, expect } from 'vitest';
import type { PathCommand, InternalLine, Dart } from '../../../types/types';
import {
  findSlashIntersections,
  splitOutlineAtSlash,
  classifyInternals,
  classifyDarts,
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
    expect(result).toHaveLength(2);
    for (const hit of result) {
      expect(hit).toHaveProperty('commandIndex');
      expect(hit).toHaveProperty('t');
      expect(hit).toHaveProperty('point');
      expect(typeof hit.commandIndex).toBe('number');
      expect(typeof hit.t).toBe('number');
      expect(hit.t).toBeGreaterThanOrEqual(0);
      expect(hit.t).toBeLessThanOrEqual(1);
      expect(hit.point).toHaveProperty('x');
      expect(hit.point).toHaveProperty('y');
    }
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
