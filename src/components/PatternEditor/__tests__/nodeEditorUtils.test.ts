import { describe, it, expect } from 'vitest';
import {
  extractNodes,
  hitTestNode,
  nearestSegment,
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
  applyNodeMove,
} from '../nodeEditorUtils';
import type { PatternPiece, PathCommand } from '../../../types/types';

// ─── Test Helpers ───

const makeSquarePiece = (): PatternPiece => ({
  id: 'p1',
  name: 'Square',
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
});

const makeCurvePiece = (): PatternPiece => ({
  id: 'p2',
  name: 'Curve',
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [33, -20, 66, -20, 100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
});

// ─── extractNodes ───

describe('extractNodes', () => {
  it('extracts 4 anchors from a square (M, L, L, L, Z)', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    expect(nodes).toHaveLength(4);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position).toEqual({ x: 100, y: 0 });
    expect(nodes[2].position).toEqual({ x: 100, y: 100 });
    expect(nodes[3].position).toEqual({ x: 0, y: 100 });
  });

  it('assigns correct commandIndex to each node', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    expect(nodes[0].ref.commandIndex).toBe(0); // M
    expect(nodes[1].ref.commandIndex).toBe(1); // L
    expect(nodes[2].ref.commandIndex).toBe(2); // L
    expect(nodes[3].ref.commandIndex).toBe(3); // L
  });

  it('extracts cubic bezier node with cp1 from a curve piece', () => {
    const piece = makeCurvePiece();
    const nodes = extractNodes(piece);

    expect(nodes).toHaveLength(4);

    // The C command node: anchor at (100,0), cp1 at (66,-20)
    const curveNode = nodes[1];
    expect(curveNode.position).toEqual({ x: 100, y: 0 });
    expect(curveNode.cp1).toEqual({ x: 66, y: -20 });
    expect(curveNode.ref.commandIndex).toBe(1);
    expect(curveNode.ref.pointType).toBe('anchor');
  });

  it('skips Z commands', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    // No node should have commandIndex 4 (the Z command)
    const zNodes = nodes.filter(n => n.ref.commandIndex === 4);
    expect(zNodes).toHaveLength(0);
  });

  it('all nodes have pieceId set', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    for (const node of nodes) {
      expect(node.ref.pieceId).toBe('p1');
    }
  });

  // maria-203: el handle de salida (v[0],v[1] del C siguiente) no existía para
  // render ni hit-test — el bezier era inmodelable (solo medio par de handles).
  it('exposes the outgoing handle as cp2 on the node BEFORE a C command', () => {
    const piece = makeCurvePiece();
    const nodes = extractNodes(piece);

    // node[0] (M at 0,0) precede al C: su handle de salida es v[0],v[1] del C
    expect(nodes[0].cp2).toEqual({ x: 33, y: -20 });
    // …y arrastrarlo escribe cp1 del comando SIGUIENTE
    expect(nodes[0].cp2Ref).toEqual({ pieceId: 'p2', commandIndex: 1, pointType: 'cp1' });
  });

  it('keeps the incoming handle as cp1 with a ref that maps to cp2 of the C', () => {
    const piece = makeCurvePiece();
    const nodes = extractNodes(piece);

    expect(nodes[1].cp1).toEqual({ x: 66, y: -20 });
    expect(nodes[1].cp1Ref).toEqual({ pieceId: 'p2', commandIndex: 1, pointType: 'cp2' });
  });

  it('maps a Q command handle to pointType cp1 (not the C mapping)', () => {
    // applyNodeMove sobre Q ignora 'cp2' en silencio: el mapeo duro a 'cp2'
    // hacía el handle de una Q inarrastrable.
    const piece: PatternPiece = {
      ...makeSquarePiece(),
      id: 'pq',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'Q', values: [50, -30, 100, 0] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    };
    const nodes = extractNodes(piece);

    expect(nodes[1].cp1).toEqual({ x: 50, y: -30 });
    expect(nodes[1].cp1Ref).toEqual({ pieceId: 'pq', commandIndex: 1, pointType: 'cp1' });
  });
});

// ─── hitTestNode ───

describe('hitTestNode', () => {
  it('returns matching NodeRef within threshold', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    // Click near (100, 0) — within threshold of node[1]
    const result = hitTestNode({ x: 103, y: 2 }, nodes, 5);

    expect(result).not.toBeNull();
    expect(result!.commandIndex).toBe(1);
    expect(result!.pointType).toBe('anchor');
  });

  it('returns null when no node is within threshold', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    // Click far from any node
    const result = hitTestNode({ x: 50, y: 50 }, nodes, 5);
    expect(result).toBeNull();
  });

  it('returns closest node when multiple are within threshold', () => {
    const piece = makeSquarePiece();
    const nodes = extractNodes(piece);

    // Click near (0, 0) with large threshold that also covers (100, 0)
    // but (0, 0) should be closer
    const result = hitTestNode({ x: 1, y: 1 }, nodes, 200);
    expect(result).not.toBeNull();
    expect(result!.commandIndex).toBe(0); // M at (0,0)
  });
});

// ─── nearestSegment ───

describe('nearestSegment', () => {
  it('finds closest segment to a point (returns commandIndex)', () => {
    const outline = makeSquarePiece().outline;

    // Point near the top edge (segment from (0,0) to (100,0))
    const hit = nearestSegment({ x: 50, y: 2 }, outline);

    expect(hit).not.toBeNull();
    expect(hit!.commandIndex).toBe(1); // L from M(0,0) to L(100,0)
    expect(hit!.distance).toBeLessThan(5);
  });

  it('computes t parameter along segment (midpoint ~ 0.5)', () => {
    const outline = makeSquarePiece().outline;

    // Point at midpoint of top edge
    const hit = nearestSegment({ x: 50, y: 0 }, outline);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 1);
  });

  it('returns projected point on the segment', () => {
    const outline = makeSquarePiece().outline;

    // Point slightly above midpoint of top edge
    const hit = nearestSegment({ x: 50, y: -5 }, outline);

    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(50, 0);
    expect(hit!.point.y).toBeCloseTo(0, 0);
  });

  it('detects closing segment (last point back to first)', () => {
    const outline = makeSquarePiece().outline;

    // Point near the left edge (segment from (0,100) back to (0,0))
    // This is the closing segment
    const hit = nearestSegment({ x: -2, y: 50 }, outline);

    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeLessThan(5);
  });
});

// ─── splitSegmentAt ───

describe('splitSegmentAt', () => {
  it('splits L segment into two L commands', () => {
    const outline = makeSquarePiece().outline;
    // Split the first L segment (index 1: from (0,0) to (100,0)) at midpoint
    const result = splitSegmentAt(outline, 1, 0.5);

    // Original had 5 commands, now should have 6
    expect(result).toHaveLength(6);

    // The new point should be at midpoint (50, 0)
    expect(result[1].type).toBe('L');
    expect(result[1].values[0]).toBeCloseTo(50);
    expect(result[1].values[1]).toBeCloseTo(0);

    // The original endpoint should still be there
    expect(result[2].type).toBe('L');
    expect(result[2].values[0]).toBeCloseTo(100);
    expect(result[2].values[1]).toBeCloseTo(0);
  });

  it('splits C segment using de Casteljau (two C commands)', () => {
    const outline = makeCurvePiece().outline;
    // Split the C segment (index 1) at t=0.5
    const result = splitSegmentAt(outline, 1, 0.5);

    // Original had 5 commands, now should have 6
    expect(result).toHaveLength(6);

    // Both new segments should be cubic beziers
    expect(result[1].type).toBe('C');
    expect(result[2].type).toBe('C');

    // The endpoint of the first C and the anchor of the original should be valid
    // First C should end at the midpoint of the curve
    const c1 = result[1].values;
    const c2 = result[2].values;

    // The anchor of the first C (endpoint) should equal start of second C's implicit start
    // For t=0.5 on the original C from (0,0) to (100,0) with CPs at (33,-20) and (66,-20):
    // Midpoint anchor should be at approximately (50, -15)
    expect(c1[4]).toBeCloseTo(50, 0);
    expect(c1[5]).toBeCloseTo(-15, 0);

    // Second C should end at original endpoint (100, 0)
    expect(c2[4]).toBeCloseTo(100, 0);
    expect(c2[5]).toBeCloseTo(0, 0);
  });

  it('preserves other commands when splitting', () => {
    const outline = makeSquarePiece().outline;
    const result = splitSegmentAt(outline, 1, 0.5);

    // M command unchanged
    expect(result[0]).toEqual({ type: 'M', values: [0, 0] });
    // Z still at the end
    expect(result[result.length - 1].type).toBe('Z');
  });
});

// ─── deletePoint ───

describe('deletePoint', () => {
  it('removes point and reconnects', () => {
    const outline = makeSquarePiece().outline;
    // Delete the second L (index 2: the point at (100, 100))
    const result = deletePoint(outline, 2);

    // Original had 5 commands (M, L, L, L, Z) -> now 4 (M, L, L, Z)
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ type: 'M', values: [0, 0] });
    expect(result[1]).toEqual({ type: 'L', values: [100, 0] });
    expect(result[2]).toEqual({ type: 'L', values: [0, 100] });
    expect(result[3].type).toBe('Z');
  });

  it('throws when piece would have fewer than 3 points', () => {
    // Triangle: M, L, L, Z (3 anchor points)
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];

    expect(() => deletePoint(outline, 1)).toThrow();
  });

  it('handles deleting the M command by promoting next to M', () => {
    const outline = makeSquarePiece().outline;
    // Delete the M command (index 0)
    const result = deletePoint(outline, 0);

    // First command should be M
    expect(result[0].type).toBe('M');
    // It should have the values of what was the first L
    expect(result[0].values).toEqual([100, 0]);
  });

  it('ensures Z at the end', () => {
    const outline = makeSquarePiece().outline;
    const result = deletePoint(outline, 2);
    expect(result[result.length - 1].type).toBe('Z');
  });
});

// ─── convertToCurve ───

describe('convertToCurve', () => {
  it('converts L to C with control points at 1/3 and 2/3', () => {
    const outline = makeSquarePiece().outline;
    // Convert first L (index 1: line from (0,0) to (100,0))
    const result = convertToCurve(outline, 1);

    expect(result[1].type).toBe('C');
    const v = result[1].values;

    // Control point 1 at 1/3 of the way: (33.33, 0)
    expect(v[0]).toBeCloseTo(100 / 3, 1);
    expect(v[1]).toBeCloseTo(0, 1);

    // Control point 2 at 2/3 of the way: (66.67, 0)
    expect(v[2]).toBeCloseTo(200 / 3, 1);
    expect(v[3]).toBeCloseTo(0, 1);

    // Anchor preserved at (100, 0)
    expect(v[4]).toBeCloseTo(100, 1);
    expect(v[5]).toBeCloseTo(0, 1);
  });

  it('preserves other commands when converting', () => {
    const outline = makeSquarePiece().outline;
    const result = convertToCurve(outline, 1);

    expect(result).toHaveLength(outline.length);
    expect(result[0]).toEqual({ type: 'M', values: [0, 0] });
    expect(result[2]).toEqual({ type: 'L', values: [100, 100] });
    expect(result[result.length - 1].type).toBe('Z');
  });

  it('does not modify already-curve commands', () => {
    const outline = makeCurvePiece().outline;
    // Index 1 is already a C — should be unchanged
    const result = convertToCurve(outline, 1);
    expect(result[1]).toEqual(outline[1]);
  });
});

// ─── convertToLine ───

describe('convertToLine', () => {
  it('converts C to L keeping only the anchor', () => {
    const outline = makeCurvePiece().outline;
    // Convert C (index 1) to L
    const result = convertToLine(outline, 1);

    expect(result[1].type).toBe('L');
    // Anchor of original C was at (100, 0)
    expect(result[1].values).toEqual([100, 0]);
  });

  it('preserves other commands when converting', () => {
    const outline = makeCurvePiece().outline;
    const result = convertToLine(outline, 1);

    expect(result).toHaveLength(outline.length);
    expect(result[0]).toEqual({ type: 'M', values: [0, 0] });
    expect(result[2]).toEqual({ type: 'L', values: [100, 100] });
  });

  it('does not modify already-line commands', () => {
    const outline = makeSquarePiece().outline;
    // Index 1 is already an L — should be unchanged
    const result = convertToLine(outline, 1);
    expect(result[1]).toEqual(outline[1]);
  });
});

// ─── nearestSegment – bezier accuracy ───

describe('nearestSegment – bezier accuracy', () => {
  it('detects click on curved bezier arc far from chord', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 50, 100, 50, 100, 0] },
      { type: 'Z', values: [] },
    ];
    // Click near the apex of the arc (~50, 37.5)
    const hit = nearestSegment({ x: 50, y: 37.5 }, outline);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeLessThan(2);
    expect(hit!.commandIndex).toBe(1);
  });

  it('returns accurate t parameter for bezier hit', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 50, 100, 50, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const hit = nearestSegment({ x: 50, y: 37.5 }, outline);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThan(0.3);
    expect(hit!.t).toBeLessThan(0.7);
  });

  it('detects click on quadratic bezier arc', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'Q', values: [50, 80, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const hit = nearestSegment({ x: 50, y: 40 }, outline);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeLessThan(2);
    expect(hit!.commandIndex).toBe(1);
  });

  it('still works for straight line segments', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    const hit = nearestSegment({ x: 50, y: 0 }, outline);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeLessThan(1);
  });
});

// ─── applyNodeMove ───

describe('applyNodeMove', () => {
  it('moves an M anchor', () => {
    const outline = makeSquarePiece().outline;
    const result = applyNodeMove(outline, 0, 'anchor', { x: 10, y: 10 });

    expect(result[0].values).toEqual([10, 10]);
    // Other commands unchanged
    expect(result[1].values).toEqual([100, 0]);
  });

  it('moves an L anchor', () => {
    const outline = makeSquarePiece().outline;
    const result = applyNodeMove(outline, 1, 'anchor', { x: 120, y: 5 });

    expect(result[1].values).toEqual([120, 5]);
  });

  it('moves a C anchor and drags cp2 with it', () => {
    const outline = makeCurvePiece().outline;
    // Move C anchor from (100, 0) to (110, 10)
    const result = applyNodeMove(outline, 1, 'anchor', { x: 110, y: 10 });

    // Anchor moved
    expect(result[1].values[4]).toBe(110);
    expect(result[1].values[5]).toBe(10);

    // cp2 (incoming handle at v[2], v[3]) should be shifted by same delta
    // Original cp2 was (66, -20), delta is (10, 10) -> (76, -10)
    expect(result[1].values[2]).toBe(76);
    expect(result[1].values[3]).toBe(-10);
  });

  it('moves a C cp1 (outgoing handle)', () => {
    const outline = makeCurvePiece().outline;
    const result = applyNodeMove(outline, 1, 'cp1', { x: 40, y: -30 });

    expect(result[1].values[0]).toBe(40);
    expect(result[1].values[1]).toBe(-30);
    // Anchor unchanged
    expect(result[1].values[4]).toBe(100);
    expect(result[1].values[5]).toBe(0);
  });

  it('does not mutate the original outline', () => {
    const outline = makeSquarePiece().outline;
    const originalValues = [...outline[0].values];
    applyNodeMove(outline, 0, 'anchor', { x: 999, y: 999 });

    expect(outline[0].values).toEqual(originalValues);
  });
});
