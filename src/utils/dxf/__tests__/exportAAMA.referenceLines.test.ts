import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece, PathCommand } from '../../../types/types';

function pieceWithReference(path: PathCommand[]): PatternPiece {
  return {
    id: 'p1',
    name: 'Ref',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    seamAllowance: 0,
    grainAngle: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    internals: [{ id: 'ref1', type: 'reference', path }],
    notches: [],
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as PatternPiece;
}

/** Closed flag (group 70) of the LWPOLYLINE whose vertices include xCoord. */
function closedFlagOfPolylineWith(dxf: string, xCoord: string): string | null {
  for (const block of dxf.split('LWPOLYLINE')) {
    if (block.includes(`\n${xCoord}\n`)) {
      const m = block.match(/70\n([01])/);
      return m ? m[1] : null;
    }
  }
  return null;
}

const OPEN: PathCommand[] = [
  { type: 'M', values: [200, 200] },
  { type: 'L', values: [240, 200] },
  { type: 'L', values: [240, 260] },
  { type: 'L', values: [215, 285] },
];

describe('generateDXFAAMA — reference internal lines (Forma interna)', () => {
  it('emits the full polyline, not just the first segment', () => {
    const dxf = generateDXFAAMA([pieceWithReference(OPEN)]);
    // Vertices 3 and 4 only appear if the whole path is emitted (y is negated in DXF).
    expect(dxf).toContain('240.0000');
    expect(dxf).toContain('-260.0000');
    expect(dxf).toContain('215.0000');
    expect(dxf).toContain('-285.0000');
  });

  it('emits a closed reference polyline as a closed LWPOLYLINE', () => {
    const closed: PathCommand[] = [...OPEN, { type: 'Z', values: [] }];
    const dxf = generateDXFAAMA([pieceWithReference(closed)]);
    expect(closedFlagOfPolylineWith(dxf, '215.0000')).toBe('1');
  });
});
