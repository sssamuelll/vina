import { describe, it, expect } from 'vitest';
import type { PointOfMeasure, PatternPiece } from '../../../types/types';
import {
  resolveWorldPosition,
  computeStraightDistance,
  computeAlongEdgeDistance,
  computePOMValue,
  recomputeAllPOMs,
} from '../pomCompute';

// ─── Mock pieces ────────────────────────────────────────────────────────────

const pieceA = {
  id: 'p1',
  name: 'Front',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] },
    { type: 'L', values: [0, 300] },
    { type: 'Z', values: [] },
  ],
  position: { x: 100, y: 50 },
  edges: [
    { id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 200 },
    { id: 'e2', name: 'right', segmentRange: [2, 3], edgeType: 'seam', length: 300 },
  ],
} as unknown as PatternPiece;

const pieceB = {
  id: 'p2',
  name: 'Back',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] },
    { type: 'L', values: [0, 300] },
    { type: 'Z', values: [] },
  ],
  position: { x: 400, y: 50 },
  edges: [
    { id: 'e3', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 200 },
  ],
} as unknown as PatternPiece;

const pieces: PatternPiece[] = [pieceA, pieceB];

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePOM(overrides: Partial<PointOfMeasure>): PointOfMeasure {
  return {
    id: 'pom-1',
    name: 'Test POM',
    category: 'length',
    method: 'straight',
    pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
    pointB: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
    value: 0,
    tolerance: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('resolveWorldPosition', () => {
  it('returns world position by adding piece position to local position', () => {
    const pt = { pieceId: 'p1', localPosition: { x: 10, y: 20 } };
    const result = resolveWorldPosition(pt, pieces);
    expect(result).toEqual({ x: 110, y: 70 });
  });

  it('returns null for missing piece', () => {
    const pt = { pieceId: 'missing', localPosition: { x: 10, y: 20 } };
    expect(resolveWorldPosition(pt, pieces)).toBeNull();
  });
});

describe('computeStraightDistance', () => {
  it('computes Euclidean distance between two piece-local points resolved to world', () => {
    const pom = makePOM({
      method: 'straight',
      pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p1', localPosition: { x: 200, y: 0 } },
    });
    // World A = (100, 50), World B = (300, 50) → distance = 200
    const result = computeStraightDistance(pom.pointA, pom.pointB, pieces);
    expect(result).toBeCloseTo(200, 6);
  });

  it('computes distance across different pieces', () => {
    const pom = makePOM({
      method: 'straight',
      pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p2', localPosition: { x: 0, y: 0 } },
    });
    // World A = (100, 50), World B = (400, 50) → distance = 300
    const result = computeStraightDistance(pom.pointA, pom.pointB, pieces);
    expect(result).toBeCloseTo(300, 6);
  });

  it('returns null when pointA piece is missing', () => {
    const pom = makePOM({
      pointA: { pieceId: 'missing', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
    });
    expect(computeStraightDistance(pom.pointA, pom.pointB, pieces)).toBeNull();
  });

  it('returns null when pointB piece is missing', () => {
    const pom = makePOM({
      pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'missing', localPosition: { x: 0, y: 0 } },
    });
    expect(computeStraightDistance(pom.pointA, pom.pointB, pieces)).toBeNull();
  });
});

describe('computeAlongEdgeDistance', () => {
  it('returns edge.length for a named edge', () => {
    const pom = makePOM({
      method: 'alongEdge',
      pointA: { pieceId: 'p1', edgeName: 'top', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p1', edgeName: 'top', localPosition: { x: 200, y: 0 } },
    });
    const result = computeAlongEdgeDistance(pom, pieces);
    expect(result).toBe(200);
  });

  it('returns null for missing edge', () => {
    const pom = makePOM({
      method: 'alongEdge',
      pointA: { pieceId: 'p1', edgeName: 'neckline', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p1', edgeName: 'neckline', localPosition: { x: 0, y: 0 } },
    });
    expect(computeAlongEdgeDistance(pom, pieces)).toBeNull();
  });

  it('returns null when piece is missing', () => {
    const pom = makePOM({
      method: 'alongEdge',
      pointA: { pieceId: 'missing', edgeName: 'top', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'missing', edgeName: 'top', localPosition: { x: 0, y: 0 } },
    });
    expect(computeAlongEdgeDistance(pom, pieces)).toBeNull();
  });

  it('falls back to arc-length computation when edge has no cached length', () => {
    const pieceNoLength = {
      ...pieceA,
      id: 'pNoLen',
      edges: [
        { id: 'e10', name: 'topNoLen', segmentRange: [1, 2], edgeType: 'seam' },
      ],
    } as unknown as PatternPiece;
    const pom = makePOM({
      method: 'alongEdge',
      pointA: { pieceId: 'pNoLen', edgeName: 'topNoLen', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'pNoLen', edgeName: 'topNoLen', localPosition: { x: 200, y: 0 } },
    });
    const result = computeAlongEdgeDistance(pom, [...pieces, pieceNoLength]);
    // Arc length of L command from (0,0) to (200,0) = 200
    expect(result).toBeCloseTo(200, 1);
  });
});

describe('computePOMValue', () => {
  it('dispatches to straight for method=straight', () => {
    const pom = makePOM({
      method: 'straight',
      pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p1', localPosition: { x: 200, y: 0 } },
    });
    const result = computePOMValue(pom, pieces);
    expect(result).toBeCloseTo(200, 6);
  });

  it('dispatches to alongEdge for method=alongEdge', () => {
    const pom = makePOM({
      method: 'alongEdge',
      pointA: { pieceId: 'p1', edgeName: 'right', localPosition: { x: 200, y: 0 } },
      pointB: { pieceId: 'p1', edgeName: 'right', localPosition: { x: 200, y: 300 } },
    });
    const result = computePOMValue(pom, pieces);
    expect(result).toBe(300);
  });

  it('returns null for unknown method', () => {
    const pom = makePOM({ method: 'surfaceTape' });
    const result = computePOMValue(pom, pieces);
    expect(result).toBeNull();
  });
});

describe('recomputeAllPOMs', () => {
  it('returns update pairs for valid POMs', () => {
    const poms: PointOfMeasure[] = [
      makePOM({
        id: 'pom-a',
        method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', localPosition: { x: 200, y: 0 } },
      }),
      makePOM({
        id: 'pom-b',
        method: 'alongEdge',
        pointA: { pieceId: 'p1', edgeName: 'top', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', edgeName: 'top', localPosition: { x: 200, y: 0 } },
      }),
    ];
    const results = recomputeAllPOMs(poms, pieces);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'pom-a', value: 200 });
    expect(results[1]).toEqual({ id: 'pom-b', value: 200 });
  });

  it('skips orphaned POMs where compute returns null', () => {
    const poms: PointOfMeasure[] = [
      makePOM({
        id: 'pom-valid',
        method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', localPosition: { x: 100, y: 0 } },
      }),
      makePOM({
        id: 'pom-orphan',
        method: 'straight',
        pointA: { pieceId: 'missing', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      }),
    ];
    const results = recomputeAllPOMs(poms, pieces);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('pom-valid');
    expect(results[0].value).toBeCloseTo(100, 6);
  });

  it('returns empty array for empty POM list', () => {
    expect(recomputeAllPOMs([], pieces)).toEqual([]);
  });
});
