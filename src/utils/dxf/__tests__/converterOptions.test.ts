import { describe, it, expect } from 'vitest';
import { dxfToPatternPieces } from '../converter';
import type { DXFDocument, DXFEntity } from '../types';

/** Build a minimal DXFDocument with a single rectangle (100x200) on cut layer. */
function makeRectDoc(headerEntries?: [string, string | number][]): DXFDocument {
  const header = new Map<string, string | number>(headerEntries ?? []);
  const entities: DXFEntity[] = [
    {
      type: 'LWPOLYLINE',
      layer: '1', // cut layer
      data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      },
    },
  ];
  return { header, layers: [], blocks: new Map(), entities };
}

/** Build a DXFDocument with outline + notch + grainline + dart internals. */
function makeDocWithInternals(): DXFDocument {
  const entities: DXFEntity[] = [
    // Outline (cut layer)
    {
      type: 'LWPOLYLINE',
      layer: '1',
      data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      },
    },
    // Notch (layer 4, short line)
    { type: 'LINE', layer: '4', data: { x1: 50, y1: 0, x2: 50, y2: 8 } },
    // Grainline (layer 7)
    { type: 'LINE', layer: '7', data: { x1: 50, y1: 20, x2: 50, y2: 180 } },
    // Dart (layer 8)
    { type: 'LINE', layer: '8', data: { x1: 30, y1: 50, x2: 50, y2: 100 } },
  ];
  return { header: new Map(), layers: [], blocks: new Map(), entities };
}

describe('dxfToPatternPieces with DXFImportOptions', () => {
  // ─── Backwards compatibility ───

  it('works without options (backwards compatible)', () => {
    const pieces = dxfToPatternPieces(makeRectDoc());
    expect(pieces).toHaveLength(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });

  // ─── Scale ───

  describe('scale option', () => {
    it('applies 200% scale to outline coordinates', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const scaled = dxfToPatternPieces(makeRectDoc(), { scale: 200 });

      // Get all non-M-or-Z values from the outlines
      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const scaledValues = scaled[0].outline.flatMap(c => c.values);

      expect(scaledValues.length).toBe(baseValues.length);
      for (let i = 0; i < baseValues.length; i++) {
        expect(scaledValues[i]).toBeCloseTo(baseValues[i] * 2, 5);
      }
    });

    it('applies 50% scale to internals', () => {
      const baseline = dxfToPatternPieces(makeDocWithInternals());
      const scaled = dxfToPatternPieces(makeDocWithInternals(), { scale: 50 });

      // Check grainline internal
      const baseGrain = baseline[0].internals.find(i => i.type === 'grainline')!;
      const scaledGrain = scaled[0].internals.find(i => i.type === 'grainline')!;
      const baseGrainVals = baseGrain.path.flatMap(c => c.values);
      const scaledGrainVals = scaledGrain.path.flatMap(c => c.values);

      for (let i = 0; i < baseGrainVals.length; i++) {
        expect(scaledGrainVals[i]).toBeCloseTo(baseGrainVals[i] * 0.5, 5);
      }
    });

    it('100% scale leaves coordinates unchanged', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const same = dxfToPatternPieces(makeRectDoc(), { scale: 100 });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const sameValues = same[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(sameValues[i]).toBeCloseTo(baseValues[i], 5);
      }
    });
  });

  // ─── Unit conversion ───

  describe('unit option', () => {
    it('cm unit multiplies coordinates by 10', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const cm = dxfToPatternPieces(makeRectDoc(), { unit: 'cm' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const cmValues = cm[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(cmValues[i]).toBeCloseTo(baseValues[i] * 10, 5);
      }
    });

    it('inch unit multiplies coordinates by 25.4', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const inch = dxfToPatternPieces(makeRectDoc(), { unit: 'inch' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const inchValues = inch[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(inchValues[i]).toBeCloseTo(baseValues[i] * 25.4, 5);
      }
    });

    it('mm unit leaves coordinates unchanged', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const mm = dxfToPatternPieces(makeRectDoc(), { unit: 'mm' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const mmValues = mm[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(mmValues[i]).toBeCloseTo(baseValues[i], 5);
      }
    });

    it('auto unit reads $INSUNITS header (code 5 = cm)', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const auto = dxfToPatternPieces(makeRectDoc([['$INSUNITS', 5]]), { unit: 'auto' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const autoValues = auto[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(autoValues[i]).toBeCloseTo(baseValues[i] * 10, 5);
      }
    });

    it('auto unit reads $INSUNITS header (code 1 = inch)', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const auto = dxfToPatternPieces(makeRectDoc([['$INSUNITS', 1]]), { unit: 'auto' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const autoValues = auto[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(autoValues[i]).toBeCloseTo(baseValues[i] * 25.4, 5);
      }
    });

    it('auto unit defaults to mm when $INSUNITS is absent', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const auto = dxfToPatternPieces(makeRectDoc(), { unit: 'auto' });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const autoValues = auto[0].outline.flatMap(c => c.values);

      for (let i = 0; i < baseValues.length; i++) {
        expect(autoValues[i]).toBeCloseTo(baseValues[i], 5);
      }
    });
  });

  // ─── Combined scale + unit ───

  describe('combined scale and unit', () => {
    it('applies both scale and unit together', () => {
      const baseline = dxfToPatternPieces(makeRectDoc());
      const combined = dxfToPatternPieces(makeRectDoc(), { unit: 'cm', scale: 200 });

      const baseValues = baseline[0].outline.flatMap(c => c.values);
      const combinedValues = combined[0].outline.flatMap(c => c.values);

      // cm (10x) * 200% (2x) = 20x
      for (let i = 0; i < baseValues.length; i++) {
        expect(combinedValues[i]).toBeCloseTo(baseValues[i] * 20, 5);
      }
    });
  });

  // ─── Import filters ───

  describe('import filters', () => {
    it('filters out notches when importNotches is false', () => {
      const withNotches = dxfToPatternPieces(makeDocWithInternals());
      const without = dxfToPatternPieces(makeDocWithInternals(), { importNotches: false });

      expect(withNotches[0].internals.some(i => i.type === 'notch')).toBe(true);
      expect(without[0].internals.some(i => i.type === 'notch')).toBe(false);
    });

    it('filters out grainlines when importGrainlines is false', () => {
      const withGrain = dxfToPatternPieces(makeDocWithInternals());
      const without = dxfToPatternPieces(makeDocWithInternals(), { importGrainlines: false });

      expect(withGrain[0].internals.some(i => i.type === 'grainline')).toBe(true);
      expect(without[0].internals.some(i => i.type === 'grainline')).toBe(false);
    });

    it('filters out darts when importInternalLines is false', () => {
      const withDarts = dxfToPatternPieces(makeDocWithInternals());
      const without = dxfToPatternPieces(makeDocWithInternals(), { importInternalLines: false });

      expect(withDarts[0].internals.some(i => i.type === 'dart')).toBe(true);
      expect(without[0].internals.some(i => i.type === 'dart')).toBe(false);
    });

    it('keeps all internals when no filter options are set', () => {
      const pieces = dxfToPatternPieces(makeDocWithInternals(), { scale: 100 });
      expect(pieces[0].internals.some(i => i.type === 'notch')).toBe(true);
      expect(pieces[0].internals.some(i => i.type === 'grainline')).toBe(true);
      expect(pieces[0].internals.some(i => i.type === 'dart')).toBe(true);
    });

    it('can filter multiple types at once', () => {
      const pieces = dxfToPatternPieces(makeDocWithInternals(), {
        importNotches: false,
        importGrainlines: false,
        importInternalLines: false,
      });
      expect(pieces[0].internals).toHaveLength(0);
    });
  });
});
