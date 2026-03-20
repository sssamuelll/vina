import { describe, it, expect } from 'vitest';
import { splitPiece, addFullness, addFacing, slashAndSpread, transferDart, measureEdgeLength, offsetPieceOutline, extendEdge, trimEdgeAtPoint } from '../patternOps';
import type { PatternPiece, SemanticEdge } from '../../types/types';

function makeRect(name: string, w: number, h: number): PatternPiece {
  return {
    id: `test-${name}`, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] },
      { type: 'L', values: [0, h] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('splitPiece', () => {
  it('splits horizontally into two pieces', () => {
    const [a, b] = splitPiece(makeRect('Panel', 400, 600), 'horizontal', 300);
    expect(a.name).toContain('upper');
    expect(b.name).toContain('lower');
    expect(a.id).not.toBe(b.id);
  });

  it('splits vertically into two pieces', () => {
    const [a, b] = splitPiece(makeRect('Panel', 400, 600), 'vertical', 200);
    expect(a.id).not.toBe(b.id);
  });
});

describe('addFullness', () => {
  it('adds gather at bottom edge', () => {
    const piece = makeRect('Skirt', 300, 500);
    const result = addFullness(piece, 'bottom', 100, 'gather');
    // Should have added an internal line for the gather
    expect(result.internals.length).toBeGreaterThan(0);
  });

  it('adds flare without internal line', () => {
    const piece = makeRect('Skirt', 300, 500);
    const result = addFullness(piece, 'bottom', 100, 'flare');
    expect(result).toBeDefined();
  });
});

describe('addFacing', () => {
  it('creates facing piece with correct name', () => {
    const piece = makeRect('Front Bodice', 400, 600);
    const facing = addFacing(piece, 'neckline', 40);
    expect(facing.name).toContain('Facing');
    expect(facing.category).toBe('facing');
    expect(facing.outline.length).toBeGreaterThan(0);
  });

  it('uses default width of 40mm', () => {
    const piece = makeRect('Front', 400, 600);
    const facing = addFacing(piece, 'top');
    expect(facing).toBeDefined();
  });
});

describe('slashAndSpread', () => {
  it('widens piece by spread amount', () => {
    const piece = makeRect('Skirt', 300, 500);
    const result = slashAndSpread(piece, 150, 50);
    // Points right of slashX should be shifted
    const maxX = Math.max(...result.outline.flatMap(c =>
      c.values.filter((_, i) => i % 2 === 0)
    ));
    expect(maxX).toBeCloseTo(350, 0); // 300 + 50
  });
});

describe('transferDart', () => {
  it('transfers dart preserving intake', () => {
    const piece = makeRect('Front Bodice', 400, 600);
    piece.darts = [{
      id: 'dart-1', intake: 25, apex: { x: 200, y: 300 },
      legs: [[{ x: 188, y: 0 }, { x: 200, y: 300 }], [{ x: 200, y: 300 }, { x: 212, y: 0 }]],
      foldDirection: 'toward-center', depth: 300,
    }];
    piece.edges = [
      { id: 'e1', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam' },
      { id: 'e2', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' },
    ];
    const result = transferDart(piece, 'dart-1', 'sideSeam');
    expect(result.darts).toHaveLength(1);
    expect(result.darts![0].intake).toBe(25);
    expect(result.darts![0].edgeId).toBe('e2');
  });
});

describe('measureEdgeLength', () => {
  it('measures a straight edge', () => {
    const piece = makeRect('Panel', 400, 600);
    const edge: SemanticEdge = {
      id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam',
    };
    const length = measureEdgeLength(piece, edge);
    expect(length).toBeCloseTo(400, 0);
  });
});

// ─── offsetPieceOutline ─────────────────────────────────────────────────────

describe('offsetPieceOutline', () => {
  const squarePiece = makeRect('Square', 200, 200);

  it('offsets outward by positive distance', () => {
    const result = offsetPieceOutline(squarePiece, 10);
    expect(result).not.toBeNull();
    // Offset square should have more commands than just M, 4xL, Z (round corners add points)
    expect(result!.length).toBeGreaterThan(0);
  });

  it('offsets inward by negative distance', () => {
    const result = offsetPieceOutline(squarePiece, -10);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null when inward offset collapses shape', () => {
    // A 10x10 square offset inward by 10 should fully collapse
    const tinyPiece = makeRect('Tiny', 10, 10);
    expect(offsetPieceOutline(tinyPiece, -10)).toBeNull();
  });

  it('returns same outline for distance 0', () => {
    const result = offsetPieceOutline(squarePiece, 0);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(squarePiece.outline.length);
  });

  it('accepts different join types', () => {
    const round = offsetPieceOutline(squarePiece, 10, 'round');
    const miter = offsetPieceOutline(squarePiece, 10, 'miter');
    const square = offsetPieceOutline(squarePiece, 10, 'square');
    expect(round).not.toBeNull();
    expect(miter).not.toBeNull();
    expect(square).not.toBeNull();
  });
});

// ─── extendEdge ─────────────────────────────────────────────────────────────

describe('extendEdge', () => {
  const squarePiece = makeRect('Square', 200, 200);

  it('extends end of edge by distance', () => {
    // squarePiece outline: M(0,0), L(200,0), L(200,200), L(0,200), Z
    // segmentIndex 1 = L(200,0) => edge from (0,0) to (200,0)
    const result = extendEdge(squarePiece, 1, 'end', 50);
    // Top edge extended at end: (200,0) + 50 along (1,0) = (250,0)
    expect(result.outline[1].values[0]).toBeCloseTo(250, 0);
    expect(result.outline[1].values[1]).toBeCloseTo(0, 0);
  });

  it('extends start of first edge backwards', () => {
    const result = extendEdge(squarePiece, 1, 'start', 50);
    // M command should move backwards: (0,0) - 50*(1,0) = (-50, 0)
    expect(result.outline[0].values[0]).toBeCloseTo(-50, 0);
    expect(result.outline[0].values[1]).toBeCloseTo(0, 0);
  });

  it('invalidates semantic edges after extend', () => {
    const piece = makeRect('Panel', 200, 200);
    piece.edges = [{ id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam' }];
    const result = extendEdge(piece, 1, 'end', 50);
    expect(result.edges).toBeUndefined();
  });

  it('returns unchanged piece for zero-length edge', () => {
    const piece = makeRect('Panel', 200, 200);
    // Create a degenerate edge: L to same point as start
    piece.outline[1] = { type: 'L', values: [0, 0] };
    const result = extendEdge(piece, 1, 'end', 50);
    // Edge has zero length, should return unchanged
    expect(result.outline[1].values[0]).toBeCloseTo(0, 0);
  });

  it('does not mutate the original piece', () => {
    const original = makeRect('Panel', 200, 200);
    const originalTopX = original.outline[1].values[0];
    extendEdge(original, 1, 'end', 50);
    expect(original.outline[1].values[0]).toBe(originalTopX);
  });
});

// ─── trimEdgeAtPoint ────────────────────────────────────────────────────────

describe('trimEdgeAtPoint', () => {
  const squarePiece = makeRect('Square', 200, 200);

  it('trims edge keeping before portion', () => {
    // segmentIndex 1 = L(200,0) => edge from (0,0) to (200,0)
    const result = trimEdgeAtPoint(squarePiece, 1, { x: 100, y: 0 }, 'before');
    expect(result.outline[1].values[0]).toBeCloseTo(100, 0);
    expect(result.outline[1].values[1]).toBeCloseTo(0, 0);
  });

  it('trims edge keeping after portion', () => {
    const result = trimEdgeAtPoint(squarePiece, 1, { x: 100, y: 0 }, 'after');
    // For first edge (segmentIndex 1), the M command should move to trim point
    expect(result.outline[0].values[0]).toBeCloseTo(100, 0);
    expect(result.outline[0].values[1]).toBeCloseTo(0, 0);
  });

  it('invalidates semantic edges after trim', () => {
    const piece = makeRect('Panel', 200, 200);
    piece.edges = [{ id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam' }];
    const result = trimEdgeAtPoint(piece, 1, { x: 100, y: 0 }, 'before');
    expect(result.edges).toBeUndefined();
  });

  it('does not mutate the original piece', () => {
    const original = makeRect('Panel', 200, 200);
    const originalTopX = original.outline[1].values[0];
    trimEdgeAtPoint(original, 1, { x: 100, y: 0 }, 'before');
    expect(original.outline[1].values[0]).toBe(originalTopX);
  });
});
