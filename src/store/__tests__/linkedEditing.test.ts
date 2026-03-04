import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../types/types';

describe('PatternPiece linked editing fields', () => {
  it('supports optional linkedPieceId and linkMode', () => {
    const piece: PatternPiece = {
      id: 'p1',
      name: 'Front Left',
      outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] }],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedPieceId: 'p2',
      linkMode: 'symmetry',
    };
    expect(piece.linkedPieceId).toBe('p2');
    expect(piece.linkMode).toBe('symmetry');
  });

  it('allows omitting linked fields', () => {
    const piece: PatternPiece = {
      id: 'p1',
      name: 'Collar',
      outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [50, 0] }, { type: 'Z', values: [] }],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(piece.linkedPieceId).toBeUndefined();
    expect(piece.linkMode).toBeUndefined();
  });
});
