import { describe, it, expect } from 'vitest';
import {
  checkPieceOverlap,
  computeCollisionFlags,
  computeUtilization,
  isWithinBounds,
} from '../markerCollision';
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

describe('checkPieceOverlap', () => {
  it('detects overlapping pieces', () => {
    const a = rectPiece('a', 0, 0, 100, 100);
    const b = rectPiece('b', 50, 50, 100, 100);
    expect(checkPieceOverlap(a, b)).toBe(true);
  });

  it('returns false for adjacent pieces', () => {
    const a = rectPiece('a', 0, 0, 100, 100);
    const b = rectPiece('b', 100, 0, 100, 100);
    expect(checkPieceOverlap(a, b)).toBe(false);
  });

  it('returns false for far apart pieces', () => {
    const a = rectPiece('a', 0, 0, 50, 50);
    const b = rectPiece('b', 200, 200, 50, 50);
    expect(checkPieceOverlap(a, b)).toBe(false);
  });
});

describe('isWithinBounds', () => {
  it('returns true for piece inside bounds', () => {
    const p = rectPiece('a', 20, 20, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(true);
  });

  it('returns false for piece partially outside', () => {
    const p = rectPiece('a', 0, 0, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(false);
  });

  it('returns false for piece fully outside', () => {
    const p = rectPiece('a', 300, 300, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(false);
  });
});

describe('computeUtilization', () => {
  it('computes correct utilization for single piece', () => {
    // Usable area = (200 - 20) * (200 - 20) = 32400
    // Piece area = 100 * 100 = 10000
    const p = rectPiece('a', 10, 10, 100, 100);
    const util = computeUtilization([p], 200, 200, 10);
    expect(util).toBeCloseTo(10000 / 32400, 4);
  });

  it('returns 0 for no pieces', () => {
    expect(computeUtilization([], 200, 200, 10)).toBe(0);
  });

  it('caps at 1', () => {
    // Piece larger than usable area
    const p = rectPiece('a', 0, 0, 500, 500);
    const util = computeUtilization([p], 200, 200, 10);
    expect(util).toBeLessThanOrEqual(1);
  });
});

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
