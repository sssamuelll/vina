import { describe, it, expect } from 'vitest';
import { extractGrainLine, classifyDirection, setGrainDirection } from '../grainLine';
import type { PatternPiece } from '../../types/types';

function makePiece(grainlinePath?: { type: string; values: number[] }[]): PatternPiece {
  return {
    id: 'test', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [400, 0] },
      { type: 'L', values: [400, 600] },
      { type: 'L', values: [0, 600] },
      { type: 'Z', values: [] },
    ],
    internals: grainlinePath ? [{
      id: 'gl-1', type: 'grainline' as const,
      path: grainlinePath as PatternPiece['internals'][0]['path'],
    }] : [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('classifyDirection', () => {
  it.each([
    [0, 'lengthwise'],
    [5, 'lengthwise'],
    [15, 'lengthwise'],
    [45, 'bias'],
    [90, 'crosswise'],
    [85, 'crosswise'],
    [30, 'custom'],
    [60, 'custom'],
  ])('classifies %d° as %s', (angle, expected) => {
    expect(classifyDirection(angle)).toBe(expected);
  });
});

describe('extractGrainLine', () => {
  it('extracts vertical grainline as lengthwise', () => {
    const piece = makePiece([
      { type: 'M', values: [200, 100] },
      { type: 'L', values: [200, 500] },
    ]);
    const gl = extractGrainLine(piece);
    expect(gl).not.toBeNull();
    expect(gl!.direction).toBe('lengthwise');
    expect(gl!.angle).toBeCloseTo(0, 0);
  });

  it('extracts horizontal grainline as crosswise', () => {
    const piece = makePiece([
      { type: 'M', values: [50, 300] },
      { type: 'L', values: [350, 300] },
    ]);
    const gl = extractGrainLine(piece);
    expect(gl).not.toBeNull();
    expect(gl!.direction).toBe('crosswise');
  });

  it('extracts diagonal grainline as bias', () => {
    const piece = makePiece([
      { type: 'M', values: [100, 100] },
      { type: 'L', values: [300, 300] },
    ]);
    const gl = extractGrainLine(piece);
    expect(gl).not.toBeNull();
    expect(gl!.direction).toBe('bias');
  });

  it('returns null for piece without grainline', () => {
    const piece = makePiece();
    expect(extractGrainLine(piece)).toBeNull();
  });
});

describe('setGrainDirection', () => {
  it('creates lengthwise grainline', () => {
    const piece = makePiece();
    const gl = setGrainDirection(piece, 'lengthwise');
    expect(gl.direction).toBe('lengthwise');
    expect(gl.angle).toBe(0);
    expect(gl.path.length).toBe(2);
  });

  it('creates crosswise grainline', () => {
    const piece = makePiece();
    const gl = setGrainDirection(piece, 'crosswise');
    expect(gl.direction).toBe('crosswise');
    expect(gl.angle).toBe(90);
  });

  it('creates bias grainline', () => {
    const piece = makePiece();
    const gl = setGrainDirection(piece, 'bias');
    expect(gl.direction).toBe('bias');
    expect(gl.angle).toBe(45);
  });
});
