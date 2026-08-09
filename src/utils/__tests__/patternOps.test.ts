import { describe, it, expect } from 'vitest';
import { splitPiece, addFullness, addFacing, slashAndSpread, transferDart, measureEdgeLength, findCutEdgePair, offsetPieceOutline, extendEdge, trimEdgeAtPoint, unfoldPiece, optimizeCurvePoints, optimizePieceCurves, offsetInternalLine, replaceAsPatternOutline } from '../patternOps';
import type { PatternPiece, SemanticEdge, PathCommand } from '../../types/types';

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

// #1009: las ops que modifican en sitio tienen que conservar el id. Si lo
// pierden, el `updatePiece(result)` del tool del copilot no matchea ninguna
// pieza y se traga el cambio en silencio, respondiendo success igual.
describe('identidad de las ops en sitio', () => {
  it('addFullness conserva el id de la pieza', () => {
    const piece = makeRect('Skirt', 300, 500);
    expect(addFullness(piece, 'bottom', 100, 'gather').id).toBe(piece.id);
  });

  it('transferDart conserva el id de la pieza', () => {
    const piece = makeRect('Front Bodice', 400, 600);
    piece.darts = [{
      id: 'dart-1', intake: 25, apex: { x: 200, y: 300 },
      legs: [[{ x: 188, y: 0 }, { x: 200, y: 300 }], [{ x: 200, y: 300 }, { x: 212, y: 0 }]],
      foldDirection: 'toward-center', depth: 300,
    }];
    piece.edges = [{ id: 'e2', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' }];
    expect(transferDart(piece, 'dart-1', 'sideSeam').id).toBe(piece.id);
  });

  it('extendEdge y trimEdgeAtPoint también', () => {
    const piece = makeRect('Panel', 400, 600);
    expect(extendEdge(piece, 1, 'end', 50).id).toBe(piece.id);
    expect(trimEdgeAtPoint(piece, 1, { x: 200, y: 0 }, 'before').id).toBe(piece.id);
  });
});

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
    // Return includes detected edges
    expect(result!.edgesA).toBeDefined();
    expect(result!.edgesA.length).toBeGreaterThan(0);
    expect(result!.edgesB).toBeDefined();
    expect(result!.edgesB.length).toBeGreaterThan(0);
    // Input pieces NOT mutated (pure function)
    expect(pieceA.edges).toBeUndefined();
    expect(pieceB.edges).toBeUndefined();
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

  it('preserves the original piece ID', () => {
    const piece = makeRect('Panel', 200, 200);
    const result = extendEdge(piece, 1, 'end', 50);
    expect(result.id).toBe(piece.id);
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

  it('preserves the original piece ID', () => {
    const piece = makeRect('Panel', 200, 200);
    const result = trimEdgeAtPoint(piece, 1, { x: 100, y: 0 }, 'before');
    expect(result.id).toBe(piece.id);
  });
});

function makeBezierPiece(): PatternPiece {
  return {
    id: 'test-bezier', name: 'BezierPiece',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [50, -30, 150, -30, 200, 0] }, // cubic bezier top edge
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('extendEdge — Bezier', () => {
  it('extends end of cubic bezier along cp2→end tangent', () => {
    const piece = makeBezierPiece();
    const result = extendEdge(piece, 1, 'end', 50);
    // Tangent at end: end(200,0) - cp2(150,-30) = (50,30), normalized
    expect(result.outline[1].type).toBe('C');
    expect(result.outline[1].values[4]).toBeGreaterThan(200); // extended X
  });

  it('extends start of cubic bezier along start-cp1 tangent', () => {
    const piece = makeBezierPiece();
    const result = extendEdge(piece, 1, 'start', 50);
    // Tangent at start: start(0,0) - cp1(50,-30) = (-50,30)
    // M command should move in (-50,30) direction
    expect(result.outline[0].values[0]).toBeLessThan(0); // moved left
  });

  it('preserves piece ID on Bezier extend', () => {
    const piece = makeBezierPiece();
    const result = extendEdge(piece, 1, 'end', 50);
    expect(result.id).toBe(piece.id);
  });
});

describe('trimEdgeAtPoint — Bezier', () => {
  it('trims cubic bezier keeping before portion', () => {
    const piece = makeBezierPiece();
    const result = trimEdgeAtPoint(piece, 1, { x: 100, y: -30 }, 'before');
    expect(result.outline[1].type).toBe('L'); // simplified to line
    expect(result.outline[1].values[0]).toBeCloseTo(100, 0);
  });

  it('trims cubic bezier keeping after portion', () => {
    const piece = makeBezierPiece();
    const result = trimEdgeAtPoint(piece, 1, { x: 100, y: -30 }, 'after');
    // M should move to trim point
    expect(result.outline[0].values[0]).toBeCloseTo(100, 0);
  });

  it('preserves piece ID on Bezier trim', () => {
    const piece = makeBezierPiece();
    const result = trimEdgeAtPoint(piece, 1, { x: 100, y: -30 }, 'before');
    expect(result.id).toBe(piece.id);
  });
});

// ─── unfoldPiece ─────────────────────────────────────────────────────────────

function makeHalfRect(name: string): PatternPiece {
  return {
    id: `test-${name}`, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 600] },
      { type: 'L', values: [0, 600] },
      { type: 'Z', values: [] },
    ],
    internals: [
      {
        id: 'fold-1',
        type: 'fold' as const,
        path: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [0, 600] },
        ],
      },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('unfoldPiece', () => {
  it('mirrors half-rect into full rect', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    const xs = full.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
    const minX = Math.min(...xs.filter(isFinite));
    const maxX = Math.max(...xs.filter(isFinite));
    expect(maxX - minX).toBeCloseTo(400, 0);
  });

  it('preserves piece ID', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    expect(full.id).toBe(half.id);
  });

  it('removes fold line from internals', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    expect(full.internals.find(l => l.id === 'fold-1')).toBeUndefined();
  });

  it('mirrors internals when outlineOnly is false', () => {
    const half = makeHalfRect('Front');
    half.internals.push({
      id: 'dart-1', type: 'dart',
      path: [{ type: 'M', values: [100, 100] }, { type: 'L', values: [100, 200] }],
    });
    const full = unfoldPiece(half, 'fold-1');
    const darts = full.internals.filter(l => l.type === 'dart');
    expect(darts.length).toBe(2);
  });

  it('does not mirror internals when outlineOnly is true', () => {
    const half = makeHalfRect('Front');
    half.internals.push({
      id: 'dart-1', type: 'dart',
      path: [{ type: 'M', values: [100, 100] }, { type: 'L', values: [100, 200] }],
    });
    const full = unfoldPiece(half, 'fold-1', { outlineOnly: true });
    const darts = full.internals.filter(l => l.type === 'dart');
    expect(darts.length).toBe(1);
  });

  it('throws if fold line not found', () => {
    const half = makeHalfRect('Front');
    expect(() => unfoldPiece(half, 'nonexistent')).toThrow();
  });

  it('throws if line is not type fold', () => {
    const half = makeHalfRect('Front');
    half.internals[0].type = 'dart';
    expect(() => unfoldPiece(half, 'fold-1')).toThrow();
  });

  it('should handle fold line ending with Z without crashing', () => {
    const pieceWithZFold: PatternPiece = {
      ...makeHalfRect('Front'),
      internals: [{
        id: 'zfold', type: 'fold' as const,
        path: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [0, 600] },
          { type: 'Z', values: [] },
        ],
      }],
    };
    // Should either succeed or throw a clear error, NOT a TypeError
    expect(() => unfoldPiece(pieceWithZFold, 'zfold')).not.toThrow(TypeError);
  });
});

// ─── optimizeCurvePoints ─────────────────────────────────────────────────────

describe('optimizeCurvePoints', () => {
  it('preserves M and Z commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    expect(result[0].type).toBe('M');
    expect(result[result.length - 1].type).toBe('Z');
  });

  it('ratio 1.0 is a passthrough (returns copy)', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 1.0);
    expect(result).toHaveLength(cmds.length);
    expect(result[0]).not.toBe(cmds[0]); // should be a copy
    expect(result[0].values[0]).toBe(0);
  });

  it('merges collinear line segments', () => {
    // Three collinear points: (0,0) → (50,0) → (100,0)
    // The middle segment is redundant
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    // The (50,0) L command should have been merged away
    const ls = result.filter(c => c.type === 'L');
    // Should have fewer L commands than the original 3
    expect(ls.length).toBeLessThan(3);
  });

  it('reduces bezier curve to fewer commands', () => {
    // A path with a cubic bezier
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [50, -30, 150, -30, 200, 0] },
      { type: 'L', values: [200, 200] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    // Result should start with M and end with Z
    expect(result[0].type).toBe('M');
    expect(result[result.length - 1].type).toBe('Z');
    // Should still have at least M + 1 geo command + Z
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('handles path with no Z', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    expect(result[0].type).toBe('M');
    expect(result[result.length - 1].type).not.toBe('Z');
  });

  it('does not mutate original commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'Z', values: [] },
    ];
    optimizeCurvePoints(cmds, 0.5);
    expect(cmds[1].values[0]).toBe(100);
  });
});

// ─── optimizePieceCurves ─────────────────────────────────────────────────────

describe('optimizePieceCurves', () => {
  it('returns piece with same id', () => {
    const piece = makeRect('Opt', 200, 200);
    const result = optimizePieceCurves(piece);
    expect(result.id).toBe(piece.id);
  });

  it('optimizes outline by default (target=all)', () => {
    const piece = makeRect('Opt', 200, 200);
    const result = optimizePieceCurves(piece, { ratio: 0.5 });
    expect(result.outline.length).toBeGreaterThan(0);
    expect(result.outline[0].type).toBe('M');
  });

  it('skips outline when target=outline for internal line targeting', () => {
    const piece: PatternPiece = {
      ...makeRect('Opt', 200, 200),
      internals: [
        {
          id: 'line-1', type: 'dart',
          path: [
            { type: 'M', values: [100, 0] },
            { type: 'L', values: [100, 100] },
          ],
        },
      ],
    };
    // Target only outline
    const result = optimizePieceCurves(piece, { ratio: 0.5, target: 'outline' });
    // Internal line should be unchanged (deep copy, same values)
    expect(result.internals[0].path[1].values[1]).toBe(100);
  });

  it('targets specific internal line by id', () => {
    const piece: PatternPiece = {
      ...makeRect('Opt', 200, 200),
      internals: [
        {
          id: 'line-a', type: 'dart',
          path: [
            { type: 'M', values: [50, 0] },
            { type: 'L', values: [50, 50] },
            { type: 'L', values: [50, 100] },
          ],
        },
        {
          id: 'line-b', type: 'dart',
          path: [
            { type: 'M', values: [100, 0] },
            { type: 'L', values: [100, 100] },
          ],
        },
      ],
    };
    const result = optimizePieceCurves(piece, {
      ratio: 0.5,
      target: { internalLineId: 'line-a' },
    });
    // line-b should be untouched (same length)
    expect(result.internals[1].path).toHaveLength(2);
    // line-a may be optimized (length <= original)
    expect(result.internals[0].path.length).toBeGreaterThan(0);
  });

  it('does not mutate the original piece', () => {
    const piece = makeRect('Opt', 200, 200);
    const originalLen = piece.outline.length;
    optimizePieceCurves(piece, { ratio: 0.5 });
    expect(piece.outline.length).toBe(originalLen);
  });

  it('updates updatedAt timestamp', () => {
    const piece = makeRect('Opt', 200, 200);
    const before = piece.updatedAt;
    const result = optimizePieceCurves(piece, { ratio: 0.5 });
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('offsetInternalLine', () => {
  it('creates one offset copy', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20 });
    expect(result.internals.length).toBe(2);
  });

  it('creates multiple offset copies', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 3, distance: 10 });
    expect(result.internals.length).toBe(4);
  });

  it('reverses direction', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const normal = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20 });
    const reversed = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20, reverse: true });
    const normalX = normal.internals[1].path[1].values[0];
    const reversedX = reversed.internals[1].path[1].values[0];
    expect(normalX).not.toBeCloseTo(reversedX, 0);
  });

  it('preserves piece ID', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 10 });
    expect(result.id).toBe(piece.id);
  });

  it('throws if source line not found', () => {
    const piece = makeRect('Test', 200, 400);
    expect(() => offsetInternalLine(piece, 'nope', { count: 1, distance: 10 })).toThrow();
  });

  it('preserves source line type on offset copies', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'pleat',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 10 });
    expect(result.internals[1].type).toBe('pleat');
  });
});

describe('replaceAsPatternOutline', () => {
  it('replaces outline segment with internal line', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [66, -30, 133, -30, 200, 0] },
      ],
    }];
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    const refLines = result.internals.filter(l => l.type === 'reference');
    expect(refLines.length).toBe(1);
    expect(result.internals.find(l => l.id === 'style-1')).toBeUndefined();
  });

  it('preserves piece ID', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }],
    }];
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    expect(result.id).toBe(piece.id);
  });

  it('throws if internal line not found', () => {
    const piece = makeRect('Test', 200, 400);
    expect(() => replaceAsPatternOutline(piece, 'nope', [0, 1])).toThrow();
  });

  it('throws if endpoints too far from outline', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [{ type: 'M', values: [0, 50] }, { type: 'L', values: [200, 50] }],
    }];
    expect(() => replaceAsPatternOutline(piece, 'style-1', [0, 1])).toThrow();
  });

  it('outline is still closed after replacement', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }],
    }];
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    expect(result.outline[result.outline.length - 1].type).toBe('Z');
  });
});
