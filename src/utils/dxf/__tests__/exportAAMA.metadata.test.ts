import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece } from '../../../types/types';

function makePiece(overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    id: 'p1',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

describe('AAMA DXF metadata layers', () => {
  describe('FABRIC_CODE layer (13)', () => {
    it('writes fabricId when present', () => {
      const dxf = generateDXFAAMA([makePiece({ fabricId: 'SILK-001' })]);
      expect(dxf).toContain('SILK-001');
      // On layer 13
      expect(dxf).toContain('8\n13');
    });

    it('writes MAIN when fabricId is absent', () => {
      const dxf = generateDXFAAMA([makePiece()]);
      // DXF TEXT entity has layer on group code 8, text on group code 1
      // The MAIN text should appear in a TEXT entity on layer 13
      expect(dxf).toContain('MAIN');
      // Layer 13 should have at least one TEXT entity
      expect(dxf).toContain('8\n13');
    });
  });

  describe('ANNOTATION layer (14)', () => {
    it('writes annotations when present', () => {
      const dxf = generateDXFAAMA([
        makePiece({
          annotations: [
            { id: 'a1', text: 'CUT ON FOLD', position: 'center', category: 'cutting' },
            { id: 'a2', text: 'CHECK GRAIN', position: 'center', category: 'qc' },
          ],
        }),
      ]);
      expect(dxf).toContain('CUT ON FOLD');
      expect(dxf).toContain('CHECK GRAIN');
      // On layer 14
      expect(dxf).toContain('8\n14');
    });

    it('skips annotations when none present', () => {
      const dxf = generateDXFAAMA([makePiece()]);
      // Layer 14 should be defined in table but no TEXT entities on it
      const textCount = (dxf.match(/\n8\n14\n/g) || []).length;
      // Only the layer definition, not TEXT entities
      expect(textCount).toBeLessThanOrEqual(1);
    });
  });

  describe('FOLD_DIR layer (15)', () => {
    it('writes MTN for mountain fold lines', () => {
      const dxf = generateDXFAAMA([
        makePiece({
          internals: [
            {
              id: 'f1',
              type: 'fold',
              path: [
                { type: 'M', values: [50, 0] },
                { type: 'L', values: [50, 150] },
              ],
              foldOptions: { direction: 'mountain', creaseAngleDeg: 180 },
            },
          ],
        }),
      ]);
      expect(dxf).toContain('MTN');
      expect(dxf).toContain('8\n15');
    });

    it('writes VAL for valley fold lines', () => {
      const dxf = generateDXFAAMA([
        makePiece({
          internals: [
            {
              id: 'f2',
              type: 'fold',
              path: [
                { type: 'M', values: [50, 0] },
                { type: 'L', values: [50, 150] },
              ],
              foldOptions: { direction: 'valley', creaseAngleDeg: 180 },
            },
          ],
        }),
      ]);
      expect(dxf).toContain('VAL');
    });

    it('defaults to MTN when foldOptions is absent', () => {
      const dxf = generateDXFAAMA([
        makePiece({
          internals: [
            {
              id: 'f3',
              type: 'fold',
              path: [
                { type: 'M', values: [50, 0] },
                { type: 'L', values: [50, 150] },
              ],
            },
          ],
        }),
      ]);
      expect(dxf).toContain('MTN');
    });
  });

  it('includes all three new layer definitions in table', () => {
    const dxf = generateDXFAAMA([makePiece()]);
    // Layer table should contain layers 13, 14, 15
    expect(dxf).toContain('2\n13\n');
    expect(dxf).toContain('2\n14\n');
    expect(dxf).toContain('2\n15\n');
  });
});
