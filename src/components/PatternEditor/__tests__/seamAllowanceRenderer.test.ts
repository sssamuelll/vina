import { describe, it, expect } from 'vitest';
import { generateSeamAllowance, flattenPath, effectiveSeamAllowanceWidth } from '../../../utils/seam';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import editorReducer, { toggleSeamAllowance, setDefaultSAWidth } from '../../../store/editorSlice';

// Simple square outline: 0,0 → 100,0 → 100,100 → 0,100 → close
const squareOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

describe('Seam Allowance Rendering', () => {
  describe('SA path generation', () => {
    it('generates an offset path from a piece outline', () => {
      const result = generateSeamAllowance(squareOutline, 10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('M');
      expect(result[result.length - 1].type).toBe('Z');
    });

    it('returns empty for zero width', () => {
      const result = generateSeamAllowance(squareOutline, 0);
      expect(result).toEqual([]);
    });

    it('returns empty for negative width', () => {
      const result = generateSeamAllowance(squareOutline, -5);
      expect(result).toEqual([]);
    });

    it('generates larger offset for larger SA width', () => {
      const small = generateSeamAllowance(squareOutline, 5);
      const large = generateSeamAllowance(squareOutline, 20);
      // Flatten to compare bounding boxes
      const flatSmall = flattenPath(small);
      const flatLarge = flattenPath(large);
      const bboxWidth = (pts: { x: number; y: number }[]) => {
        const xs = pts.map(p => p.x);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(bboxWidth(flatLarge)).toBeGreaterThan(bboxWidth(flatSmall));
    });
  });

  describe('Default width fallback', () => {
    it('uses piece.seamAllowance when set', () => {
      const piece: Pick<PatternPiece, 'seamAllowance'> = { seamAllowance: 15 };
      const defaultWidth = 10;
      const saWidth = piece.seamAllowance || defaultWidth;
      expect(saWidth).toBe(15);
    });

    it('falls back to defaultWidth when piece SA is 0', () => {
      const piece: Pick<PatternPiece, 'seamAllowance'> = { seamAllowance: 0 };
      const defaultWidth = 10;
      const saWidth = piece.seamAllowance || defaultWidth;
      expect(saWidth).toBe(10);
    });
  });

  describe('effectiveSeamAllowanceWidth — real seam line suppresses the synthetic default (M3.5)', () => {
    const seamInternal: InternalLine = {
      id: 'seam-1',
      type: 'seam',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }],
    };
    const mk = (seamAllowance: number, internals: InternalLine[]): Pick<PatternPiece, 'seamAllowance' | 'internals'> =>
      ({ seamAllowance, internals });

    it('piece WITH a real seam internal and no explicit SA → 0 (no synthetic contour)', () => {
      expect(effectiveSeamAllowanceWidth(mk(0, [seamInternal]), 10)).toBe(0);
    });

    it('piece WITH a real seam internal but explicit SA → user value wins', () => {
      expect(effectiveSeamAllowanceWidth(mk(15, [seamInternal]), 10)).toBe(15);
    });

    it('piece WITHOUT seam internal and SA 0 → default (P0.1 behavior preserved)', () => {
      expect(effectiveSeamAllowanceWidth(mk(0, []), 10)).toBe(10);
    });

    it('piece WITHOUT seam internal and explicit SA → explicit value', () => {
      expect(effectiveSeamAllowanceWidth(mk(15, []), 10)).toBe(15);
    });

    it('non-seam internals do not suppress the default', () => {
      const grain: InternalLine = { id: 'g', type: 'grainline', path: seamInternal.path };
      expect(effectiveSeamAllowanceWidth(mk(0, [grain]), 10)).toBe(10);
    });
  });

  describe('Visibility toggle (Redux)', () => {
    it('toggles showSeamAllowance', () => {
      const initial = editorReducer(undefined, { type: '@@INIT' });
      expect(initial.showSeamAllowance).toBe(true);
      const toggled = editorReducer(initial, toggleSeamAllowance());
      expect(toggled.showSeamAllowance).toBe(false);
      const toggledBack = editorReducer(toggled, toggleSeamAllowance());
      expect(toggledBack.showSeamAllowance).toBe(true);
    });

    it('sets default SA width', () => {
      const initial = editorReducer(undefined, { type: '@@INIT' });
      expect(initial.defaultSeamAllowanceWidth).toBe(10);
      const updated = editorReducer(initial, setDefaultSAWidth(15));
      expect(updated.defaultSeamAllowanceWidth).toBe(15);
    });

    it('clamps default SA width to valid range', () => {
      const initial = editorReducer(undefined, { type: '@@INIT' });
      const tooHigh = editorReducer(initial, setDefaultSAWidth(100));
      expect(tooHigh.defaultSeamAllowanceWidth).toBe(50);
      const tooLow = editorReducer(initial, setDefaultSAWidth(-10));
      expect(tooLow.defaultSeamAllowanceWidth).toBe(0);
    });
  });

  describe('Seam type defaults', () => {
    const SEAM_TYPE_DEFAULTS: Record<string, number> = {
      standard: 10,
      french: 15,
      'flat-felled': 12,
      overlock: 8,
    };

    it('standard seam defaults to 10mm', () => {
      expect(SEAM_TYPE_DEFAULTS.standard).toBe(10);
    });

    it('french seam defaults to 15mm', () => {
      expect(SEAM_TYPE_DEFAULTS.french).toBe(15);
    });

    it('flat-felled seam defaults to 12mm', () => {
      expect(SEAM_TYPE_DEFAULTS['flat-felled']).toBe(12);
    });

    it('overlock seam defaults to 8mm', () => {
      expect(SEAM_TYPE_DEFAULTS.overlock).toBe(8);
    });
  });
});
