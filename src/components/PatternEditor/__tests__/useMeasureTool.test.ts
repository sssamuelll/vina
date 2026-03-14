import { describe, it, expect } from 'vitest';
import { snapToOutline, calculatePathLength, findEdgeForSegment, buildEdgeInfo, buildOutlineInfo } from '../useMeasureTool';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

describe('snapToOutline', () => {
  const piece: PatternPiece = {
    id: 'p1',
    name: 'Test',
    position: { x: 0, y: 0 },
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [100, 0] },
      { type: 'L' as const, values: [100, 100] },
      { type: 'L' as const, values: [0, 100] },
      { type: 'Z' as const, values: [] },
    ],
    internals: [],
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: 0,
    updatedAt: 0,
  };

  it('snaps to nearest point on outline within threshold', () => {
    const result = snapToOutline({ x: 50, y: 2 }, piece, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(0, 1);
    expect(result!.point.x).toBeCloseTo(50, 1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToOutline({ x: 50, y: 50 }, piece, 1.0);
    expect(result).toBeNull();
  });

  it('handles piece position offset', () => {
    const offsetPiece: PatternPiece = { ...piece, position: { x: 200, y: 300 } };
    const result = snapToOutline({ x: 250, y: 302 }, offsetPiece, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(300, 1);
    expect(result!.point.x).toBeCloseTo(250, 1);
  });
});

describe('calculatePathLength', () => {
  it('calculates straight line length', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(calculatePathLength(points)).toBeCloseTo(100, 1);
  });

  it('calculates polyline length (sum of segments)', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(calculatePathLength(points)).toBeCloseTo(200, 1);
  });

  it('returns 0 for single point', () => {
    expect(calculatePathLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calculatePathLength([])).toBe(0);
  });
});

// ─── Along-curve helpers ───

const pieceWithEdges: PatternPiece = {
  id: 'p1',
  name: 'Test',
  position: { x: 10, y: 20 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },   // segment 1
    { type: 'L' as const, values: [100, 80] },  // segment 2
    { type: 'L' as const, values: [0, 80] },    // segment 3
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'e1', name: 'top', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'e2', name: 'right', segmentRange: [2, 3] as [number, number], edgeType: 'seam' },
    { id: 'e3', name: 'bottom', segmentRange: [3, 4] as [number, number], edgeType: 'hem' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  createdAt: 0,
  updatedAt: 0,
};

describe('findEdgeForSegment', () => {
  it('returns the edge containing the segment index', () => {
    const edge = findEdgeForSegment(pieceWithEdges, 1);
    expect(edge).not.toBeNull();
    expect(edge!.name).toBe('top');
  });

  it('returns the correct edge for segment 2', () => {
    const edge = findEdgeForSegment(pieceWithEdges, 2);
    expect(edge).not.toBeNull();
    expect(edge!.name).toBe('right');
  });

  it('returns null for a segment with no edge', () => {
    const edge = findEdgeForSegment(pieceWithEdges, 0); // M command, no edge
    expect(edge).toBeNull();
  });

  it('returns null for piece without edges', () => {
    const noEdgePiece = { ...pieceWithEdges, edges: undefined };
    const edge = findEdgeForSegment(noEdgePiece as PatternPiece, 1);
    expect(edge).toBeNull();
  });
});

describe('buildEdgeInfo', () => {
  const topEdge = pieceWithEdges.edges![0];

  it('computes correct arc-length for straight edge', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 50);
    // top edge: (0,0)→(100,0) = 100mm
    expect(info.arcLength).toBeCloseTo(100, 1);
  });

  it('offsets path points by piece position', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 50);
    // piece position is (10, 20), edge starts at local (0,0) → world (10,20)
    expect(info.pathPoints[0].x).toBeCloseTo(10, 0);
    expect(info.pathPoints[0].y).toBeCloseTo(20, 0);
  });

  it('offsets walk points by piece position', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 50);
    expect(info.walkPoints[0].x).toBeCloseTo(10, 0);
    expect(info.walkPoints[0].y).toBeCloseTo(20, 0);
  });

  it('returns markers at requested interval', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 25);
    // 100mm edge at 25mm interval → 5 markers (0, 25, 50, 75, 100)
    expect(info.markers.length).toBe(5);
  });

  it('walk points are denser than path points', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 50);
    // walkPoints at 3mm resolution vs pathPoints at 50mm
    expect(info.walkPoints.length).toBeGreaterThan(info.pathPoints.length);
  });

  it('preserves piece and edge references', () => {
    const info = buildEdgeInfo(pieceWithEdges, topEdge, 50);
    expect(info.pieceId).toBe('p1');
    expect(info.piece).toBe(pieceWithEdges);
    expect(info.edge).toBe(topEdge);
  });
});

describe('buildOutlineInfo', () => {
  it('uses full outline length', () => {
    const info = buildOutlineInfo(pieceWithEdges, 50);
    // Full outline: (0,0)→(100,0)→(100,80)→(0,80) = 100+80+100 = 280mm (Z is 0-length)
    expect(info.arcLength).toBeCloseTo(280, 0);
  });

  it('creates synthetic edge with __outline__ id', () => {
    const info = buildOutlineInfo(pieceWithEdges, 50);
    expect(info.edge.id).toBe('__outline__');
    expect(info.edge.name).toBe('outline');
    expect(info.edge.edgeType).toBe('unknown');
  });

  it('synthetic edge segmentRange spans full outline', () => {
    const info = buildOutlineInfo(pieceWithEdges, 50);
    expect(info.edge.segmentRange[0]).toBe(0);
    expect(info.edge.segmentRange[1]).toBe(pieceWithEdges.outline.length);
  });
});
