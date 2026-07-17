import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PathCommand, PatternPiece, Seam, SemanticEdge } from '../../../types/types';

const rect = (h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, h] },
  { type: 'L', values: [0, h] },
  { type: 'Z', values: [] },
];

const edges = (): SemanticEdge[] => [
  { id: 'top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'sideSeam', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'seam' },
];

function makePiece(id: string, h: number, over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline: rect(h), internals: [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, edges: edges(), active: true, createdAt: 0, updatedAt: 0,
    ...over,
  } as PatternPiece;
}

function seam(): Seam {
  return {
    id: 's',
    pieceA: { pieceId: 'A', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'B', edgeName: 'sideSeam' },
    type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
  };
}

describe('AAMA DXF — matched corner ("Empatada") wiring', () => {
  it('emits the empatada cut line when seams are threaded; identical output without them', () => {
    const A = makePiece('A', 100, { cornerTypes: { 1: 'match' } });
    const B = makePiece('B', 140);
    const seams = [seam()];

    const withoutSeams = generateDXFAAMA([A, B]);
    const withSeams = generateDXFAAMA([A, B], undefined, seams);

    expect(withSeams).not.toBe(withoutSeams);            // match reached the generator
    expect(generateDXFAAMA([A, B])).toBe(withoutSeams);  // no-seams path stable & unchanged
  });
});
