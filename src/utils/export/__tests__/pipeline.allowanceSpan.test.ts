import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { preparePiece } from '../pipeline';

describe('preparePiece — tramo de margen en pieza neta', () => {
  it('lleva al corte exportado el tramo aunque el margen base sea cero', () => {
    const piece: PatternPiece = {
      id: 'net-piece',
      name: 'Neta',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 0,
      edges: [{
        id: 'net-piece:top',
        name: 'top',
        segmentRange: [1, 2],
        edgeType: 'seam',
        seamAllowanceSpans: [{ tStart: 0.25, tEnd: 0.75, width: 20 }],
      }],
      active: true,
      createdAt: 0,
      updatedAt: 0,
    };

    const prepared = preparePiece(piece);
    expect(prepared.seamOutline).toContainEqual({ type: 'L', values: [25, -20] });
    expect(prepared.seamOutline).toContainEqual({ type: 'L', values: [75, -20] });
  });
});
