import { describe, it, expect } from 'vitest';
import { checkPieceOverlap, computeCollisionFlags } from '../markerCollision';
import type { PlacedPiece } from '../cuttingLayout';

function rectPiece(id: string, x: number, y: number, w: number, h: number): PlacedPiece {
  return {
    pieceId: id,
    pieceName: id,
    outline: [x, y, x + w, y, x + w, y + h, x, y + h],
    rotation: 0,
    position: [x, y],
  };
}

describe('computeCollisionFlags', () => {
  it('marks overlaps and boundary violations consistently', () => {
    const pieces: PlacedPiece[] = [
      rectPiece('a', 10, 10, 40, 40),
      rectPiece('b', 35, 30, 30, 30), // overlaps with a
      rectPiece('c', 120, 120, 20, 20), // no overlap
      rectPiece('d', 185, 20, 30, 30), // out of bounds on right
    ];

    const flags = computeCollisionFlags(pieces, 200, 200, 10);

    expect(flags).toEqual([true, true, false, true]);
  });

  it('matches pairwise overlap behavior for interior pieces', () => {
    const pieces: PlacedPiece[] = [
      rectPiece('a', 20, 20, 30, 30),
      rectPiece('b', 60, 20, 30, 30),
      rectPiece('c', 45, 20, 20, 30),
    ];

    const flags = computeCollisionFlags(pieces, 200, 200, 0);

    const expected = pieces.map((piece, i) =>
      pieces.some((other, j) => i !== j && checkPieceOverlap(piece, other)),
    );

    expect(flags).toEqual(expected);
  });
});
