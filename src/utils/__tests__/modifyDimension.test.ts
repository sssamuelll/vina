import { describe, it, expect } from 'vitest';
import { modifyDimension } from '../modifyDimension';
import type { PatternPiece, SemanticEdge } from '../../types/types';

function makeSkirt(): PatternPiece {
  // Simple skirt: rectangle wider at bottom
  return {
    id: 'skirt-1',
    name: 'Skirt Front',
    outline: [
      { type: 'M', values: [0, 0] },       // 0: waist left
      { type: 'L', values: [200, 0] },      // 1: waist right
      { type: 'L', values: [220, 500] },    // 2: side seam right (top to bottom)
      { type: 'L', values: [220, 500] },    // 3: hem right
      { type: 'L', values: [-20, 500] },    // 4: hem (bottom edge)
      { type: 'L', values: [-20, 0] },      // 5: side seam left (bottom to top)
      { type: 'Z', values: [] },            // 6: close
    ],
    edges: [
      { id: 'e1', name: 'waistline', segmentRange: [1, 2], edgeType: 'seam', length: 200 },
      { id: 'e2', name: 'sideSeam-right', segmentRange: [2, 3], edgeType: 'seam', length: 500 },
      { id: 'e3', name: 'hemline', segmentRange: [3, 5], edgeType: 'hem', length: 240 },
      { id: 'e4', name: 'sideSeam-left', segmentRange: [5, 6], edgeType: 'seam', length: 500 },
    ] as SemanticEdge[],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('modifyDimension', () => {
  it('lengthens skirt by pushing hem down', () => {
    const result = modifyDimension(makeSkirt(), {
      direction: 'lengthen',
      amount: 50, // 5cm
    });
    expect(result.edgeName).toBe('hemline');
    expect(result.direction).toBe('lengthen');
    expect(result.amountMm).toBe(50);

    // Hem nodes (indices 3,4) should have Y increased by 50
    const hemRight = result.piece.outline[3];
    const hemLeft = result.piece.outline[4];
    expect(hemRight.values[1]).toBe(550); // was 500
    expect(hemLeft.values[1]).toBe(550);  // was 500
  });

  it('shortens skirt by pulling hem up', () => {
    const result = modifyDimension(makeSkirt(), {
      direction: 'shorten',
      amount: 30,
    });
    const hemRight = result.piece.outline[3];
    expect(hemRight.values[1]).toBe(470); // was 500, -30
  });

  it('widens by pushing side edge outward', () => {
    const result = modifyDimension(makeSkirt(), {
      direction: 'widen',
      amount: 20,
      targetEdge: 'sideSeam-right',
    });
    expect(result.edgeName).toBe('sideSeam-right');
    // Side seam right node at index 2 should have X increased
    const sideNode = result.piece.outline[2];
    expect(sideNode.values[0]).toBe(240); // was 220
  });

  it('narrows by pulling side edge inward', () => {
    const result = modifyDimension(makeSkirt(), {
      direction: 'narrow',
      amount: 10,
      targetEdge: 'sideSeam-right',
    });
    const sideNode = result.piece.outline[2];
    expect(sideNode.values[0]).toBe(210); // was 220, -10
  });

  it('throws when no matching edge found', () => {
    const piece = makeSkirt();
    piece.edges = [];
    // With no edges, detectSemanticEdges will be called but may not find 'hem'
    // on a simple rectangle. The error should be informative.
    expect(() =>
      modifyDimension({ ...piece, edges: undefined }, {
        direction: 'lengthen',
        amount: 50,
        targetEdge: 'nonexistent-edge',
      }),
    ).toThrow(/No suitable edge/);
  });

  it('returns correct nodesAffected count', () => {
    const result = modifyDimension(makeSkirt(), {
      direction: 'lengthen',
      amount: 50,
    });
    // hemline range is [3, 5) = 2 nodes
    expect(result.nodesAffected).toBe(2);
  });

  it('does not modify non-target nodes', () => {
    const skirt = makeSkirt();
    const result = modifyDimension(skirt, {
      direction: 'lengthen',
      amount: 50,
    });
    // Waist (index 1) should be unchanged
    expect(result.piece.outline[1].values[0]).toBe(skirt.outline[1].values[0]);
    expect(result.piece.outline[1].values[1]).toBe(skirt.outline[1].values[1]);
  });
});
