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

describe('generateDXFAAMA — grainline arrowhead (nota de María #169)', () => {
  it('emits the arrowhead at the path end only, so the file carries the direction', () => {
    const dxf = generateDXFAAMA([pieceWithGrainline(GRAINLINE)]);
    // Wing base (Y negated in DXF): end tip 200 → base 194. The start tip would
    // give 106 — its absence is what makes the arrow single-headed.
    expect(dxf).toContain('-194.0000');
    expect(dxf).not.toContain('-106.0000');
  });

  it('moves the arrowhead when the grainline points the other way', () => {
    const dxf = generateDXFAAMA([pieceWithGrainline([
      { type: 'M', values: [50, 200] },
      { type: 'L', values: [50, 100] },
    ])]);
    expect(dxf).toContain('-106.0000');
    expect(dxf).not.toContain('-194.0000');
  });

  it('runs the shaft end-to-end on a multi-vertex grainline, so the arrow is attached', () => {
    // A POLYLINE on layer 7 imports with intermediate vertices. The first-
    // segment rule would stop the shaft at -137 while the head tips at -200.
    // (137 and not 150: the piece label sits at the bbox centre, y=150.)
    const dxf = generateDXFAAMA([pieceWithGrainline([
      { type: 'M', values: [50, 100] },
      { type: 'L', values: [50, 137] },
      { type: 'L', values: [50, 200] },
    ])]);
    expect(dxf).toContain('-200.0000');
    expect(dxf).not.toContain('-137.0000');
  });

  it('does not add an arrowhead to a non-grainline internal line', () => {
    const dxf = generateDXFAAMA([{
      ...pieceWithGrainline(GRAINLINE),
      internals: [{ id: 'f1', type: 'fold', path: GRAINLINE }],
    } as unknown as PatternPiece]);
    expect(dxf).not.toContain('-194.0000');
    expect(dxf).not.toContain('-106.0000');
  });
});
