import { describe, it, expect } from 'vitest';
import type { PatternPiece, SemanticEdge, Seam } from '../../../types/types';

// Import will be created in the implementation step
import {
  findSeamForEdge,
  computeEdgeTangent,
  computeGhostTransform,
  sampleMismatch,
} from '../useWalkSeamTool';

// ─── Test Fixtures ───

const pieceA: PatternPiece = {
  id: 'pA',
  name: 'Front',
  position: { x: 0, y: 0 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },   // seg 1: top (100mm)
    { type: 'L' as const, values: [100, 80] },  // seg 2: right (80mm)
    { type: 'L' as const, values: [0, 80] },    // seg 3: bottom (100mm)
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'eA1', name: 'top', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'eA2', name: 'right', segmentRange: [2, 3] as [number, number], edgeType: 'seam' },
    { id: 'eA3', name: 'bottom', segmentRange: [3, 4] as [number, number], edgeType: 'hem' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

const pieceB: PatternPiece = {
  id: 'pB',
  name: 'Back',
  position: { x: 200, y: 0 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },   // seg 1: top (100mm)
    { type: 'L' as const, values: [100, 80] },  // seg 2: right (80mm)
    { type: 'L' as const, values: [0, 80] },    // seg 3: bottom (100mm)
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'eB1', name: 'top', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'eB2', name: 'right', segmentRange: [2, 3] as [number, number], edgeType: 'seam' },
    { id: 'eB3', name: 'bottom', segmentRange: [3, 4] as [number, number], edgeType: 'hem' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

// Piece with vertical top edge for perpendicular tests
const pieceC: PatternPiece = {
  id: 'pC',
  name: 'Sleeve',
  position: { x: 400, y: 0 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [0, 100] },   // seg 1: left-side vertical (100mm)
    { type: 'L' as const, values: [80, 100] },  // seg 2: bottom (80mm)
    { type: 'L' as const, values: [80, 0] },    // seg 3: right-side vertical (100mm)
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'eC1', name: 'left', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'eC2', name: 'bottom', segmentRange: [2, 3] as [number, number], edgeType: 'hem' },
    { id: 'eC3', name: 'right', segmentRange: [3, 4] as [number, number], edgeType: 'seam' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

const seams: Seam[] = [
  {
    id: 's1',
    pieceA: { pieceId: 'pA', edgeName: 'top' },
    pieceB: { pieceId: 'pB', edgeName: 'top' },
    type: 'standard',
    tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
  },
  {
    id: 's2',
    pieceA: { pieceId: 'pA', edgeName: 'right' },
    pieceB: { pieceId: 'pC', edgeName: 'left' },
    type: 'standard',
    tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
  },
];

// ─── findSeamForEdge ───

describe('findSeamForEdge', () => {
  it('returns seam + paired piece/edge when match exists on pieceA side', () => {
    const result = findSeamForEdge('pA', 'top', seams);
    expect(result).not.toBeNull();
    expect(result!.seam.id).toBe('s1');
    expect(result!.pairedPieceId).toBe('pB');
    expect(result!.pairedEdgeName).toBe('top');
  });

  it('returns seam + paired piece/edge when match exists on pieceB side', () => {
    const result = findSeamForEdge('pB', 'top', seams);
    expect(result).not.toBeNull();
    expect(result!.seam.id).toBe('s1');
    expect(result!.pairedPieceId).toBe('pA');
    expect(result!.pairedEdgeName).toBe('top');
  });

  it('returns null when no match', () => {
    const result = findSeamForEdge('pA', 'bottom', seams);
    expect(result).toBeNull();
  });

  it('returns null for empty seams array', () => {
    const result = findSeamForEdge('pA', 'top', []);
    expect(result).toBeNull();
  });

  it('finds seam for pieceA right → pieceC left', () => {
    const result = findSeamForEdge('pA', 'right', seams);
    expect(result).not.toBeNull();
    expect(result!.seam.id).toBe('s2');
    expect(result!.pairedPieceId).toBe('pC');
    expect(result!.pairedEdgeName).toBe('left');
  });
});

// ─── computeEdgeTangent ───

describe('computeEdgeTangent', () => {
  it('returns horizontal tangent (1,0) for horizontal line at midpoint', () => {
    // pieceA top edge: (0,0)→(100,0), horizontal
    const tangent = computeEdgeTangent(pieceA.outline, 50, 1, 2);
    expect(tangent.x).toBeCloseTo(1, 2);
    expect(tangent.y).toBeCloseTo(0, 2);
  });

  it('returns vertical tangent (0,1) for vertical line at midpoint', () => {
    // pieceC left edge: (0,0)→(0,100), vertical
    const tangent = computeEdgeTangent(pieceC.outline, 50, 1, 2);
    expect(tangent.x).toBeCloseTo(0, 2);
    expect(tangent.y).toBeCloseTo(1, 2);
  });

  it('returns a unit vector (magnitude ~ 1)', () => {
    const tangent = computeEdgeTangent(pieceA.outline, 30, 1, 2);
    const mag = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    expect(mag).toBeCloseTo(1, 2);
  });

  it('returns valid tangent at distance 0 (start of edge)', () => {
    const tangent = computeEdgeTangent(pieceA.outline, 0, 1, 2);
    const mag = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    expect(mag).toBeCloseTo(1, 2);
  });

  it('returns valid tangent at max distance (end of edge)', () => {
    // pieceA top edge is 100mm long
    const tangent = computeEdgeTangent(pieceA.outline, 100, 1, 2);
    const mag = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    expect(mag).toBeCloseTo(1, 2);
  });
});

// ─── computeGhostTransform ───

describe('computeGhostTransform', () => {
  it('returns ~0 deg rotation for two parallel horizontal edges', () => {
    // pieceA top (horizontal) vs pieceB top (horizontal)
    const transform = computeGhostTransform(
      pieceA, [1, 2] as [number, number],
      pieceB, [1, 2] as [number, number],
      50, // walkDistance at midpoint
    );
    expect(transform).not.toBeNull();
    expect(Math.abs(transform.angleDeg)).toBeLessThan(1);
  });

  it('returns ~90 deg rotation for perpendicular edges (horizontal vs vertical)', () => {
    // pieceA top (horizontal, tangent ~(1,0)) vs pieceC left (vertical, tangent ~(0,1))
    const transform = computeGhostTransform(
      pieceA, [1, 2] as [number, number],
      pieceC, [1, 2] as [number, number],
      50, // walkDistance at midpoint
    );
    expect(transform).not.toBeNull();
    // Angle should be approximately ±90 degrees
    expect(Math.abs(Math.abs(transform.angleDeg) - 90)).toBeLessThan(2);
  });

  it('clamps walkDistance to stationary arc length', () => {
    // Walk distance beyond end of stationary edge (100mm)
    const transform = computeGhostTransform(
      pieceA, [1, 2] as [number, number],
      pieceB, [1, 2] as [number, number],
      999, // way beyond edge length
    );
    expect(transform).not.toBeNull();
    // Should still produce valid transform (clamped to edge end)
    expect(isFinite(transform.tx)).toBe(true);
    expect(isFinite(transform.ty)).toBe(true);
  });

  it('returns valid transform at walkDistance 0', () => {
    const transform = computeGhostTransform(
      pieceA, [1, 2] as [number, number],
      pieceB, [1, 2] as [number, number],
      0,
    );
    expect(transform).not.toBeNull();
    expect(isFinite(transform.tx)).toBe(true);
    expect(isFinite(transform.ty)).toBe(true);
    expect(isFinite(transform.angleDeg)).toBe(true);
  });
});

// ─── sampleMismatch ───

describe('sampleMismatch', () => {
  it('returns all-green samples when both edges have equal length', () => {
    // pieceA top and pieceB top: both 100mm
    const samples = sampleMismatch(
      pieceA.outline, [1, 2] as [number, number],
      pieceB.outline, [1, 2] as [number, number],
      3, // tolerance mm
    );
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.color).toBe('green');
    }
  });

  it('returns correct count: 100mm edge / 5mm interval = 21 samples', () => {
    // pieceA top edge is 100mm. With 5mm interval: 0,5,10,...,100 = 21 samples
    const samples = sampleMismatch(
      pieceA.outline, [1, 2] as [number, number],
      pieceB.outline, [1, 2] as [number, number],
      3,
    );
    expect(samples.length).toBe(21);
  });

  it('each sample has distance, color, pointA, pointB fields', () => {
    const samples = sampleMismatch(
      pieceA.outline, [1, 2] as [number, number],
      pieceB.outline, [1, 2] as [number, number],
      3,
    );
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(typeof s.distance).toBe('number');
      expect(typeof s.color).toBe('string');
      expect(s.pointA).toBeDefined();
      expect(s.pointA.x).toBeDefined();
      expect(s.pointA.y).toBeDefined();
      expect(s.pointB).toBeDefined();
      expect(s.pointB.x).toBeDefined();
      expect(s.pointB.y).toBeDefined();
    }
  });

  it('produces yellow/red samples when edges differ in length', () => {
    // pieceA top (100mm) vs pieceA right (80mm) — 20mm difference
    const samples = sampleMismatch(
      pieceA.outline, [1, 2] as [number, number],   // 100mm
      pieceA.outline, [2, 3] as [number, number],   // 80mm
      3, // tolerance
    );
    expect(samples.length).toBeGreaterThan(0);
    // At least some samples should not be green (since lengths differ by 20mm)
    const nonGreen = samples.filter(s => s.color !== 'green');
    expect(nonGreen.length).toBeGreaterThan(0);
  });

  it('each sample has a delta field', () => {
    const samples = sampleMismatch(
      pieceA.outline, [1, 2] as [number, number],
      pieceB.outline, [1, 2] as [number, number],
      3,
    );
    for (const s of samples) {
      expect(typeof s.delta).toBe('number');
      expect(s.delta).toBeGreaterThanOrEqual(0);
    }
  });
});
