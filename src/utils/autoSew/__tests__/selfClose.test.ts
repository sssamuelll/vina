import { describe, it, expect } from 'vitest';
import { autoSew } from '../index';
import type { PatternPiece } from '../../../types/types';

// Build a minimal sleeve-like outline: a rectangle whose left and right edges
// are the two underarm edges (vertical) and whose top is the cap, bottom the
// cuff. extractEdges → detectSemanticEdges must name the two vertical edges
// 'underarmSeam'/'underarmSeam-2' (matchHint 'self-close'); the self-close
// pass must then emit ONE same-piece seam joining them.
function sleeveRect(id: string): PatternPiece {
  // 200mm wide × 300mm tall rectangle, category 'sleeve'.
  return {
    id, name: 'Sleeve', category: 'sleeve',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
  } as unknown as PatternPiece;
}

describe('autoSew self-close pass', () => {
  it('emits one same-piece underarm seam for a sleeve with two self-close edges', () => {
    const sleeve = sleeveRect('sleeve-1');
    // A second piece so autoSew runs (needs ≥2 pieces); the bodice has no
    // self-close edges and must yield no self-seam.
    const other = { id: 'bodice-1', name: 'Bodice', category: 'bodice-front',
      outline: sleeveRect('x').outline } as unknown as PatternPiece;

    const result = autoSew([sleeve, other], { minConfidence: 0.3 });
    const selfSeams = result.seams.filter(s => s.seam.pieceA.pieceId === s.seam.pieceB.pieceId);

    expect(selfSeams).toHaveLength(1);
    const s = selfSeams[0].seam;
    expect(s.pieceA.pieceId).toBe('sleeve-1');
    expect(s.pieceB.pieceId).toBe('sleeve-1');
    expect([s.pieceA.edgeName, s.pieceB.edgeName].sort())
      .toEqual(['underarmSeam', 'underarmSeam-2']);
    expect(s.type).toBe('standard');
    // The symmetric fixture makes the exact value of reversed degenerate; assert
    // type presence so the field is confirmed set by the self-close pass.
    expect(typeof s.pieceB.reversed).toBe('boolean');
    // No self-seam for the bodice (no self-close edges).
    expect(selfSeams.every(x => x.seam.pieceA.pieceId === 'sleeve-1')).toBe(true);
  });
});
