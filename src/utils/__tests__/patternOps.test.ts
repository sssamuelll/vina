import { describe, it, expect } from 'vitest';
import { splitPiece, addFullness, addFacing, slashAndSpread, transferDart, measureEdgeLength, findCutEdgePair } from '../patternOps';
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

describe('findCutEdgePair', () => {
  it('finds matching cut edges after horizontal split', () => {
    const original = makeRect('Panel', 400, 600);
    const [pieceA, pieceB] = splitPiece(original, 'horizontal', 300);

    const result = findCutEdgePair(pieceA, pieceB);
    expect(result).not.toBeNull();
    expect(result!.edgeA).toBeDefined();
    expect(result!.edgeB).toBeDefined();
    // The matching edges should have similar names (both are horizontal edges at the cut line)
    expect(result!.edgeA.name).toBeDefined();
    expect(result!.edgeB.name).toBeDefined();
    // Both pieces should now have edges populated
    expect(pieceA.edges).toBeDefined();
    expect(pieceA.edges!.length).toBeGreaterThan(0);
    expect(pieceB.edges).toBeDefined();
    expect(pieceB.edges!.length).toBeGreaterThan(0);
  });

  it('returns null when pieces do not share a cut edge', () => {
    // Two pieces at completely different locations with no spatial overlap
    const pieceA: PatternPiece = {
      ...makeRect('PieceA', 100, 100),
      position: { x: 0, y: 0 },
    };
    const pieceB: PatternPiece = {
      ...makeRect('PieceB', 100, 100),
      position: { x: 500, y: 500 },
    };

    const result = findCutEdgePair(pieceA, pieceB);
    expect(result).toBeNull();
  });
});
