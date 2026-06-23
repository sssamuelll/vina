import { describe, it, expect } from 'vitest';
import { refineSeamsInWorld } from '../worldRefine';
import type { PatternPiece, Seam } from '../../../types/types';
import type { PlacementWithFrame } from '../../cloth/arrangement/arrangementBinding';
import { DEFAULT_WRAP } from '../../cloth/arrangement/wrapParams';

// A same-piece (self) seam must pass through refineSeamsInWorld untouched —
// it must NOT be cross-paired with another piece's same-role self-seam, and
// its `reversed` flag (set by the self-close pass) must be preserved.
describe('refineSeamsInWorld — same-piece self-seam pass-through', () => {
  const frame = { point: [0, 0, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [1, 0, 0], radius: 0.05 } as PlacementWithFrame['frame'];
  const pwf = (): PlacementWithFrame => ({
    placement: { position: [0, 0, 0], rotation: [0, 0, 0] },
    frame,
    flip: false,
    wrapParams: DEFAULT_WRAP,
  });
  const piece = (id: string): PatternPiece => ({ id, edges: [], outline: [] } as unknown as PatternPiece);

  it('returns a same-piece seam verbatim (reversed preserved, not re-paired)', () => {
    const seam: Seam = {
      id: 's1',
      pieceA: { pieceId: 'L', edgeName: 'underarmSeam', tStart: 0, tEnd: 1 },
      pieceB: { pieceId: 'L', edgeName: 'underarmSeam-2', tStart: 0, tEnd: 1, reversed: true },
      type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
    };
    const out = refineSeamsInWorld([seam], [piece('L'), piece('R')], [pwf(), pwf()]);
    expect(out).toHaveLength(1);
    expect(out[0].pieceA).toEqual(seam.pieceA);
    expect(out[0].pieceB).toEqual(seam.pieceB); // reversed:true kept, edgeName not swapped
  });
});
