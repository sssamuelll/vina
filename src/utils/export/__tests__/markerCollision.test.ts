import { describe, it, expect } from 'vitest';
import { checkPieceOverlap, isWithinBounds, computeUtilization } from '../markerCollision';
import type { PlacedPiece } from '../cuttingLayout';

function makePiece(x: number, y: number, w: number, h: number): PlacedPiece {
  return {
    pieceId: 'p1',
    pieceName: 'Test',
    outline: [x, y, x + w, y, x + w, y + h, x, y + h],
    rotation: 0,
    position: [x, y],
  };
}

describe('checkPieceOverlap', () => {
  it('detects overlapping pieces', () => {
    const a = makePiece(0, 0, 100, 100);
    const b = makePiece(50, 50, 100, 100);
    expect(checkPieceOverlap(a, b)).toBe(true);
  });

  it('returns false for adjacent pieces', () => {
    const a = makePiece(0, 0, 100, 100);
    const b = makePiece(100, 0, 100, 100);
    expect(checkPieceOverlap(a, b)).toBe(false);
  });

  it('returns false for far apart pieces', () => {
    const a = makePiece(0, 0, 50, 50);
    const b = makePiece(200, 200, 50, 50);
    expect(checkPieceOverlap(a, b)).toBe(false);
  });
});

describe('isWithinBounds', () => {
  it('returns true for piece inside bounds', () => {
    const p = makePiece(20, 20, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(true);
  });

  it('returns false for piece partially outside', () => {
    const p = makePiece(0, 0, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(false);
  });

  it('returns false for piece fully outside', () => {
    const p = makePiece(300, 300, 50, 50);
    expect(isWithinBounds(p, 200, 200, 10)).toBe(false);
  });
});

describe('computeUtilization', () => {
  it('computes correct utilization for single piece', () => {
    // Usable area = (200 - 20) * (200 - 20) = 32400
    // Piece area = 100 * 100 = 10000
    const p = makePiece(10, 10, 100, 100);
    const util = computeUtilization([p], 200, 200, 10);
    expect(util).toBeCloseTo(10000 / 32400, 4);
  });

  it('returns 0 for no pieces', () => {
    expect(computeUtilization([], 200, 200, 10)).toBe(0);
  });

  it('caps at 1', () => {
    // Piece larger than usable area
    const p = makePiece(0, 0, 500, 500);
    const util = computeUtilization([p], 200, 200, 10);
    expect(util).toBeLessThanOrEqual(1);
  });
});
