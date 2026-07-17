import { describe, it, expect } from 'vitest';
import { preparePieces } from '../pipeline';
import type { PathCommand, PatternPiece, Seam, SemanticEdge } from '../../../types/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// 100×h rectangle, CW screen-Y-down. SemanticEdges partition command space:
//   top [1,2)   sideSeam(right) [2,3)   bottom [3,4).
// Vertex cmd1 = (100,0) is the joint of `top` and `sideSeam`.

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

const minY = (cmds: PathCommand[]) =>
  Math.min(...cmds.flatMap((c) => c.values.filter((_, i) => i % 2 === 1)));

describe('preparePieces — matched corner ("Empatada") wiring', () => {
  it('threads seams so a match corner extends the sewn border; without seams identical to mitered', () => {
    // A: 100×100, vertex cmd1 = match. B: 100×140 → its sideSeam mitered cut
    // length (160) > A's own (120) ⇒ A's sewn border endpoint extends outward.
    const A = makePiece('A', 100, { cornerTypes: { 1: 'match' } });
    const B = makePiece('B', 140);
    const seams = [seam()];

    const without = preparePieces([A, B]);
    const withS = preparePieces([A, B], { seams });

    // A differs — empatada slides the endpoint outward (smaller min Y).
    expect(withS[0].seamOutline).not.toEqual(without[0].seamOutline);
    expect(minY(withS[0].seamOutline)).toBeLessThan(minY(without[0].seamOutline) - 5);

    // B has no match corner → seams change nothing for it.
    expect(withS[1].seamOutline).toEqual(without[1].seamOutline);
  });
});
