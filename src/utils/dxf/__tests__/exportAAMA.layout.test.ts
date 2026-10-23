import { describe, it, expect } from 'vitest';
import { generateDXFAAMA, generateMultiSizeDXF } from '../exportAAMA';
import type { PatternPiece } from '../../../types/types';

/**
 * Where the INSERTs land. Each block writes the piece with y flipped (`-y`),
 * so the layout's y offset has to flip with it: an outline at y 500..800 is
 * -800..-500 inside the block and needs an INSERT at +500 to sit at -300..0.
 */

function rect(name: string, w: number, h: number, y0 = 0, seamAllowance = 0): PatternPiece {
  return {
    id: name, name, internals: [],
    outline: [
      { type: 'M', values: [0, y0] },
      { type: 'L', values: [w, y0] },
      { type: 'L', values: [w, y0 + h] },
      { type: 'L', values: [0, y0 + h] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

const insertYs = (dxf: string) =>
  [...dxf.matchAll(/INSERT\n5\n[^\n]+\n8\n[^\n]+\n2\n[^\n]+\n10\n[^\n]+\n20\n([^\n]+)/g)].map((m) => Number(m[1]));

describe('generateDXFAAMA — layout', () => {
  it('puts the top of a piece on y = 0 wherever its outline sits', () => {
    expect(insertYs(generateDXFAAMA([rect('P', 100, 300, 500)]))).toEqual([500]);
  });
});

describe('generateMultiSizeDXF — layout', () => {
  it('puts the top of each size row on its line wherever the outline sits', () => {
    expect(insertYs(generateMultiSizeDXF([{ size: 'S', pieces: [rect('P', 100, 300, 500)] }]))).toEqual([500]);
  });

  it('spaces the size rows by the cut-line height, so a wide seam allowance keeps the full gap', () => {
    const ys = insertYs(generateMultiSizeDXF([
      { size: 'S', pieces: [rect('Front', 200, 400, 0, 60)] },
      { size: 'M', pieces: [rect('Front', 200, 400, 0, 60)] },
    ]));
    // 400 of outline + 60 of allowance on each side, then the 100 mm SIZE_GAP.
    expect(ys[0] - ys[1]).toBeCloseTo(520 + 100);
  });
});
