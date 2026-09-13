import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { piezasConLargos } from '../piezasConLargos';

const pieza = (id: string): PatternPiece => ({
  id, name: id, outline: [], internals: [], position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
});

const pieces = [pieza('a'), pieza('b')];

describe('piezasConLargos', () => {
  it.each([
    ['all', false, ['a', 'b']],
    ['all', true, []],
    ['none', false, []],
    ['none', true, []],
  ] as const)('mode=%s, suppress=%s → %j', (mode, suppress, expected) => {
    const result = piezasConLargos(pieces, mode, { suppress });
    expect(result.map(piece => piece.id)).toEqual(expected);
    for (const piece of result) expect(pieces).toContain(piece);
  });
});
