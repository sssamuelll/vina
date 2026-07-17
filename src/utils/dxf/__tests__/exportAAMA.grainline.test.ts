import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece, PathCommand } from '../../../types/types';

/** Vertical grainline from (50,100) to (50,200). */
const GRAINLINE: PathCommand[] = [
  { type: 'M', values: [50, 100] },
  { type: 'L', values: [50, 200] },
];

function pieceWithGrainline(path: PathCommand[]): PatternPiece {
  return {
    id: 'p1', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    seamAllowance: 0, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    internals: [{ id: 'gl1', type: 'grainline', path }],
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

describe('generateDXFAAMA — grainline arrowheads (nota de María #169)', () => {
  it('emits arrowhead segments at both ends of the grainline', () => {
    const dxf = generateDXFAAMA([pieceWithGrainline(GRAINLINE)]);
    // Arrowhead wing bases (Y negated in DXF): end tip 200 → base 194,
    // start tip 100 → base 106. Neither appears without the arrowheads.
    expect(dxf).toContain('-194.0000');
    expect(dxf).toContain('-106.0000');
  });

  it('does not add arrowheads to a non-grainline internal line', () => {
    const dxf = generateDXFAAMA([{
      ...pieceWithGrainline(GRAINLINE),
      internals: [{ id: 'f1', type: 'fold', path: GRAINLINE }],
    } as unknown as PatternPiece]);
    expect(dxf).not.toContain('-194.0000');
    expect(dxf).not.toContain('-106.0000');
  });
});
