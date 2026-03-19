import { describe, it, expect } from 'vitest';
import { generateMultiSizeDXF } from '../exportAAMA';

function makePiece(name: string, w: number, h: number) {
  return {
    id: name.toLowerCase().replace(/\s/g, '-'),
    name,
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [w, 0] },
      { type: 'L' as const, values: [w, h] },
      { type: 'L' as const, values: [0, h] },
      { type: 'Z' as const, values: [] },
    ],
    seamAllowance: 10,
    grainAngle: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    internals: [],
    notches: [],
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('generateMultiSizeDXF', () => {
  it('produces valid DXF with BLOCK per piece per size', () => {
    const gradedSets = [
      { size: 'S', pieces: [makePiece('Front', 200, 400)] },
      { size: 'M', pieces: [makePiece('Front', 220, 420)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('Front_S');
    expect(dxf).toContain('Front_M');
  });

  it('contains INSERT per block', () => {
    const gradedSets = [
      { size: 'S', pieces: [makePiece('Front', 200, 400), makePiece('Back', 200, 350)] },
      { size: 'L', pieces: [makePiece('Front', 240, 440), makePiece('Back', 240, 390)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    const insertMatches = dxf.match(/^INSERT$/gm);
    expect(insertMatches).not.toBeNull();
    expect(insertMatches!.length).toBe(4);
  });

  it('handles single size', () => {
    const gradedSets = [
      { size: 'M', pieces: [makePiece('Front', 220, 420)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    expect(dxf).toContain('Front_M');
    expect(dxf).toContain('EOF');
  });
});
