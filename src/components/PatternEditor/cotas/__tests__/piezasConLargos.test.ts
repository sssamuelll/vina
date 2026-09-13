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
    ['none', null, false, []],
    ['none', 'a', false, []],
    ['all', null, false, ['a', 'b']],
    ['all', 'a', false, ['a', 'b']],
    ['creation', null, false, []],
    ['creation', 'a', false, ['a']],
    ['creation', 'missing', false, []],
    ['creation', 'b', false, ['b']],
    ['none', 'a', true, []],
    ['all', 'a', true, []],
    ['creation', 'a', true, []],
  ] as const)('%s, sujeto %s, suppress=%s → %j', (mode, hotPieceId, suppress, expected) => {
    const result = piezasConLargos(pieces, mode, { hotPieceId, suppress });
    expect(result.map(piece => piece.id)).toEqual(expected);
    for (const piece of result) expect(pieces).toContain(piece);
  });
});
