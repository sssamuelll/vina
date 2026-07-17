import { describe, it, expect } from 'vitest';
import { extractGrainLine, classifyDirection, setGrainDirection, grainlineArrowheads } from '../grainLine';
import type { PatternPiece, PathCommand } from '../../types/types';

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
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('grainlineArrowheads (nota de María #169)', () => {
  const vertical: PathCommand[] = [
    { type: 'M', values: [100, 50] },
    { type: 'L', values: [100, 150] },
  ];

  it('returns one arrowhead per end (grainlines are double-headed)', () => {
    const heads = grainlineArrowheads(vertical, 6);
    expect(heads).toHaveLength(2);
    expect(heads.every(tri => tri.length === 3)).toBe(true);
  });

  it('points each wing outward from its own tip', () => {
    const heads = grainlineArrowheads(vertical, 6);
    // Tip of head 0 = the end point (100,150); head 1 = the start (100,50).
    expect(heads[0][0]).toEqual({ x: 100, y: 150 });
    expect(heads[1][0]).toEqual({ x: 100, y: 50 });
    // The end wing sits back toward the line (y < 150); the start wing y > 50.
    expect(heads[0][1].y).toBeLessThan(150);
    expect(heads[1][1].y).toBeGreaterThan(50);
  });

  it('returns nothing for a degenerate (zero-length) grainline', () => {
    expect(grainlineArrowheads([{ type: 'M', values: [10, 10] }, { type: 'L', values: [10, 10] }], 6)).toEqual([]);
    expect(grainlineArrowheads([{ type: 'M', values: [10, 10] }], 6)).toEqual([]);
  });
});

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
