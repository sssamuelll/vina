import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece, PathCommand } from '../../../types/types';

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
    it('writes fabricCode when present', () => {
      const dxf = generateDXFAAMA([makePiece({ fabricCode: 'LINING' } as Partial<PatternPiece>)]);
      expect(dxf).toContain('LINING');
      // On layer 13
      expect(dxf).toContain('8\n13');
    });

    it('writes SELF when fabricCode is absent', () => {
      const dxf = generateDXFAAMA([makePiece()]);
      expect(dxf).toContain('SELF');
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

  describe('multi-anchor internal line polylines (línea interna unificada, 2026-08-29)', () => {
    // Zigzag with 4 anchors and no curve — arc length 50 + 30 + 50 = 130.
    const ZIGZAG_PATH: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [50, 30] },
      { type: 'L', values: [0, 30] },
    ];

    it('exports a fold with more than two anchors as one full LWPOLYLINE on DRAW, not just the first tramo', () => {
      const dxf = generateDXFAAMA([
        makePiece({ internals: [{ id: 'f4', type: 'fold', path: ZIGZAG_PATH }] }),
      ]);
      // Layer 8 (DRAW), open (70=0), 4 vertices — distinct from the piece's
      // own closed 4-vertex outline (70=1), also on layer 8.
      expect(dxf).toMatch(/0\nLWPOLYLINE\n5\n[0-9A-F]+\n8\n8\n90\n4\n70\n0\n/);
      // Vertices 3 and 4 (y negated in DXF) only land in the file if the
      // whole path is walked — the old code stopped at vertex 2 with a lone LINE.
      expect(dxf).toContain('50.0000\n20\n-30.0000');
      expect(dxf).toContain('0.0000\n20\n-30.0000');
    });

    it('places the MTN annotation at the midpoint of the arc of the whole polyline, not the first segment', () => {
      const dxf = generateDXFAAMA([
        makePiece({ internals: [{ id: 'f5', type: 'fold', path: ZIGZAG_PATH }] }),
      ]);
      // Arc = 130 → half = 65 → walking from (0,0) lands at (50,15); DXF
      // negates y. First-tramo placement would give (25,0) instead.
      const m = dxf.match(/10\n(-?[\d.]+)\n20\n(-?[\d.]+)\n40\n[\d.]+\n1\nMTN\n/);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('50.0000');
      expect(m![2]).toBe('-15.0000');
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
