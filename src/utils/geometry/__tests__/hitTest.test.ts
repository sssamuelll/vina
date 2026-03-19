// src/utils/geometry/__tests__/hitTest.test.ts
import { describe, it, expect } from 'vitest';
import { hitTestPieceBBox, findNearestPiece } from '../hitTest';
import type { PatternPiece } from '../../../types/types';

function makePiece(id: string, x: number, y: number, size: number): PatternPiece {
  return {
    id,
    name: id,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [size, 0] },
      { type: 'L', values: [size, size] },
      { type: 'L', values: [0, size] },
      { type: 'Z', values: [] },
    ],
    position: { x, y },
    rotation: 0,
    mirrored: false,
    internals: [],
    seamAllowance: 0,
    layer: 1,
    sublayer: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('hitTestPieceBBox', () => {
  const pieces = [makePiece('A', 0, 0, 100), makePiece('B', 200, 200, 50)];
  it('returns piece when point is inside bbox', () => {
    expect(hitTestPieceBBox({ x: 50, y: 50 }, pieces)?.id).toBe('A');
  });
  it('returns null when point is outside all bboxes', () => {
    expect(hitTestPieceBBox({ x: 150, y: 150 }, pieces)).toBeNull();
  });
  it('returns first matching piece', () => {
    expect(hitTestPieceBBox({ x: 210, y: 210 }, pieces)?.id).toBe('B');
  });
});

describe('findNearestPiece', () => {
  const pieces = [makePiece('A', 0, 0, 100), makePiece('B', 200, 200, 50)];
  it('returns nearest piece within margin', () => {
    expect(findNearestPiece({ x: 50, y: 50 }, pieces)).toBe('A');
  });
  it('returns null when outside margin', () => {
    expect(findNearestPiece({ x: 500, y: 500 }, pieces, 10)).toBeNull();
  });
});
