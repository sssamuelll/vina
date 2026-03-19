import { describe, it, expect } from 'vitest';
import { generateDXF } from '../utils/exportDXF';
import { PatternPiece } from '../types/types';

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'test-piece',
    name: 'Test Piece',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('exportDXF', () => {
  it('generates valid DXF header and footer', () => {
    const dxf = generateDXF([makePiece()]);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('includes all layers', () => {
    const dxf = generateDXF([makePiece()]);
    expect(dxf).toContain('CUT');
    expect(dxf).toContain('SEAM');
    expect(dxf).toContain('NOTCH');
    expect(dxf).toContain('GRAINLINE');
    expect(dxf).toContain('LABEL');
  });

  it('includes LWPOLYLINE for piece outline', () => {
    const dxf = generateDXF([makePiece()]);
    expect(dxf).toContain('LWPOLYLINE');
  });

  it('includes piece label text', () => {
    const dxf = generateDXF([makePiece({ name: 'Back Bodice' })]);
    expect(dxf).toContain('Back Bodice');
  });

  it('handles cubic bezier curves', () => {
    const piece = makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [10, 20, 30, 40, 50, 60] },
        { type: 'Z', values: [] },
      ],
    });
    const dxf = generateDXF([piece]);
    // Bezier should be approximated into polyline points
    expect(dxf).toContain('LWPOLYLINE');
    // Should have many points from bezier approximation
    const pointCount = (dxf.match(/\n10\n/g) || []).length;
    expect(pointCount).toBeGreaterThan(5);
  });

  it('handles multiple pieces with spacing', () => {
    const dxf = generateDXF([makePiece({ name: 'A' }), makePiece({ name: 'B' })]);
    expect(dxf).toContain('A');
    expect(dxf).toContain('B');
    // Two LWPOLYLINE entities (one per piece outline)
    const polyCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    expect(polyCount).toBeGreaterThanOrEqual(2);
  });

  it('includes internal lines as LINE entities', () => {
    const piece = makePiece({
      internals: [{
        id: 'gl-1',
        type: 'grainline',
        path: [
          { type: 'M', values: [50, 10] },
          { type: 'L', values: [50, 90] },
        ],
      }],
    });
    const dxf = generateDXF([piece]);
    expect(dxf).toContain('LINE');
  });

  it('handles empty pieces array', () => {
    const dxf = generateDXF([]);
    expect(dxf).toContain('EOF');
  });

  it('sets units to millimeters', () => {
    const dxf = generateDXF([makePiece()]);
    // $INSUNITS 4 = millimeters
    expect(dxf).toContain('$INSUNITS');
  });
});
