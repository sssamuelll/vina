import { describe, it, expect } from 'vitest';
import { generateBOM } from '../bomExport';

function makePiece(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Front Bodice',
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [100, 0] },
      { type: 'L' as const, values: [100, 200] },
      { type: 'L' as const, values: [0, 200] },
      { type: 'Z' as const, values: [] },
    ],
    seamAllowance: 10,
    grainAngle: 0,
    fabricId: 'cotton-twill',
    mirrored: false,
    ...overrides,
  };
}

describe('generateBOM', () => {
  it('returns CSV with header row and one piece row', () => {
    const csv = generateBOM([makePiece()], [], [{ id: 'cotton-twill', name: 'Cotton Twill' }]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Piece Name');
    expect(lines[0]).toContain('Fabric');
    expect(lines[0]).toContain('Area');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('Front Bodice');
    expect(lines[1]).toContain('Cotton Twill');
  });

  it('computes area in cm2 from outline', () => {
    // 100mm x 200mm rectangle = 20000mm2 = 200cm2
    const csv = generateBOM([makePiece()], [], []);
    const dataLine = csv.trim().split('\n')[1];
    expect(dataLine).toContain('200.0');
  });

  it('includes summary rows at bottom', () => {
    const csv = generateBOM(
      [makePiece(), makePiece({ id: 'p2', name: 'Back Bodice' })],
      [],
      [{ id: 'cotton-twill', name: 'Cotton Twill' }],
    );
    expect(csv).toContain('TOTAL');
  });

  it('groups by fabric', () => {
    const csv = generateBOM(
      [
        makePiece({ id: 'p1', fabricId: 'silk' }),
        makePiece({ id: 'p2', fabricId: 'cotton' }),
        makePiece({ id: 'p3', fabricId: 'silk' }),
      ],
      [],
      [{ id: 'silk', name: 'Silk' }, { id: 'cotton', name: 'Cotton' }],
    );
    const lines = csv.trim().split('\n');
    const silkIndices = lines.map((l, i) => l.includes('Silk') ? i : -1).filter(i => i > 0);
    const cottonIndices = lines.map((l, i) => l.includes('Cotton') ? i : -1).filter(i => i > 0);
    expect(silkIndices.length).toBe(2);
    expect(cottonIndices.length).toBe(1);
  });

  it('handles empty pieces array', () => {
    const csv = generateBOM([], [], []);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});
