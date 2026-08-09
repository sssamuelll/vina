import { describe, it, expect } from 'vitest';
import {
  validatePiece,
  validateAllPieces,
  getViolationSummary,
  PATTERN_RULES,
  type ProjectContext,
} from '../patternRules';
import type { PatternPiece, Dart, InternalLine } from '../../types/types';

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p1',
    name: 'Test Piece',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    seamAllowance: 10,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    ...overrides,
  } as PatternPiece;
}

function makeDart(overrides: Partial<Dart> = {}): Dart {
  return {
    id: 'd1',
    intake: 20,
    apex: { x: 100, y: 100 },
    legs: [[{ x: 90, y: 0 }, { x: 100, y: 100 }], [{ x: 110, y: 0 }, { x: 100, y: 100 }]],
    foldDirection: 'toward-center',
    depth: 50,
    ...overrides,
  };
}

function ctx(pieces: PatternPiece[], fabricWeight?: 'light' | 'medium' | 'heavy'): ProjectContext {
  return { pieces, fabricWeight };
}

// #1019: pinza dibujada con la herramienta 2D o importada por DXF — vive solo
// en `internals`, nunca en `piece.darts` (ese campo lo pueblan solo los tools
// de pinzas del copilot).
function makeDartLine(path: InternalLine['path']): InternalLine {
  return { id: 'internal-dart', type: 'dart', path };
}

describe('PatternRules', () => {
  it('has at least 20 rules', () => {
    expect(PATTERN_RULES.length).toBeGreaterThanOrEqual(20);
  });

  it('all rules have required fields', () => {
    for (const rule of PATTERN_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(rule.severity).toBeTruthy();
      expect(typeof rule.check).toBe('function');
    }
  });

  describe('GRAIN_EXISTS', () => {
    it('warns when no grainline', () => {
      const piece = makePiece();
      const v = validatePiece(piece, ctx([piece]), ['construction']);
      expect(v.some(r => r.ruleId === 'GRAIN_EXISTS')).toBe(true);
    });

    it('passes with grainline', () => {
      const piece = makePiece({
        grainLine: {
          id: 'gl1',
          direction: 'lengthwise',
          angle: 90,
          path: [
            { type: 'M', values: [100, 0] },
            { type: 'L', values: [100, 300] },
          ],
        },
      });
      const v = validatePiece(piece, ctx([piece]));
      expect(v.some(r => r.ruleId === 'GRAIN_EXISTS')).toBe(false);
    });
  });

  describe('DART_APEX_DISTANCE', () => {
    it('warns when dart depth < 15mm on bodice', () => {
      const piece = makePiece({
        category: 'bodice',
        darts: [makeDart({ depth: 10 })],
      });
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_APEX_DISTANCE')).toBe(true);
    });

    it('passes on non-bodice', () => {
      const piece = makePiece({
        category: 'sleeve',
        darts: [makeDart({ depth: 10 })],
      });
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_APEX_DISTANCE')).toBe(false);
    });

    it('warns on a dart that lives only in internals (no piece.darts)', () => {
      const piece = makePiece({
        category: 'bodice',
        internals: [makeDartLine([
          { type: 'M', values: [95, 400] },
          { type: 'L', values: [100, 392] },
          { type: 'L', values: [105, 400] },
        ])],
      });
      expect(piece.darts).toBeUndefined();
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_APEX_DISTANCE')).toBe(true);
    });
  });

  describe('DART_ANGLE_RANGE', () => {
    it('warns on very narrow dart', () => {
      const piece = makePiece({
        darts: [makeDart({ intake: 2, depth: 100 })], // angle ≈ 1.1°
      });
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_ANGLE_RANGE')).toBe(true);
    });

    it('warns on very wide dart', () => {
      const piece = makePiece({
        darts: [makeDart({ intake: 80, depth: 50 })], // angle ≈ 77°
      });
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_ANGLE_RANGE')).toBe(true);
    });

    // Criterio de éxito de #1019: pieza dibujada con la herramienta 2D, sin
    // pasar por ningún tool del copilot, dispara DART_ANGLE_RANGE.
    it('dispara con una pinza dibujada en la herramienta 2D, sin piece.darts (#1019)', () => {
      const piece = makePiece({
        internals: [makeDartLine([
          { type: 'M', values: [99, 400] },
          { type: 'L', values: [100, 300] }, // angle ≈ 1.1°
          { type: 'L', values: [101, 400] },
        ])],
      });
      expect(piece.darts).toBeUndefined();
      const v = validatePiece(piece, ctx([piece]), ['fit']);
      expect(v.some(r => r.ruleId === 'DART_ANGLE_RANGE')).toBe(true);
    });
  });

  describe('DART_LEGS_EQUAL', () => {
    // Pin de precedencia: `piece.darts` manda sobre `internals` cuando existe.
    // Sin este test, quitarle el `piece.darts ??` a ESTA regla no lo atrapa
    // nada (las otras tres sí lo tienen pinneado por sus tests viejos).
    it('lee piece.darts cuando existe, no lo deriva de internals', () => {
      const piece = makePiece({
        darts: [makeDart({ legs: [[{ x: 0, y: 0 }, { x: 0, y: 100 }], [{ x: 50, y: 0 }, { x: 0, y: 100 }]] })],
        internals: [],
      });
      const v = validatePiece(piece, ctx([piece]), ['construction']);
      expect(v.some(r => r.ruleId === 'DART_LEGS_EQUAL')).toBe(true);
    });

    it('warns on uneven legs read from internals (no piece.darts, no prior test coverage at all)', () => {
      const piece = makePiece({
        internals: [makeDartLine([
          { type: 'M', values: [100, 400] },
          { type: 'L', values: [110, 300] },
          { type: 'L', values: [200, 400] }, // leg2 ≈ 34% longer than leg1
        ])],
      });
      const v = validatePiece(piece, ctx([piece]), ['construction']);
      expect(v.some(r => r.ruleId === 'DART_LEGS_EQUAL')).toBe(true);
    });
  });

  describe('SEAM_ALLOWANCE_RANGE', () => {
    it('warns on very narrow SA', () => {
      const piece = makePiece({ seamAllowance: 3 });
      const v = validatePiece(piece, ctx([piece]), ['construction']);
      expect(v.some(r => r.ruleId === 'SEAM_ALLOWANCE_RANGE')).toBe(true);
    });

    it('passes standard SA', () => {
      const piece = makePiece({ seamAllowance: 10 });
      const v = validatePiece(piece, ctx([piece]), ['construction']);
      expect(v.some(r => r.ruleId === 'SEAM_ALLOWANCE_RANGE')).toBe(false);
    });
  });

  describe('PIECE_HAS_OUTLINE', () => {
    it('errors on empty outline', () => {
      const piece = makePiece({ outline: [] });
      const v = validatePiece(piece, ctx([piece]));
      expect(v.some(r => r.ruleId === 'PIECE_HAS_OUTLINE' && r.severity === 'error')).toBe(true);
    });
  });

  describe('OUTLINE_CLOSED', () => {
    it('errors when outline not closed', () => {
      const piece = makePiece({
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 100] },
          { type: 'L', values: [50, 100] },
        ],
      });
      const v = validatePiece(piece, ctx([piece]));
      expect(v.some(r => r.ruleId === 'OUTLINE_CLOSED')).toBe(true);
    });
  });

  describe('PIECE_MIN_SIZE', () => {
    it('errors on tiny piece', () => {
      const piece = makePiece({
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [5, 0] },
          { type: 'L', values: [5, 5] },
          { type: 'Z', values: [] },
        ],
      });
      const v = validatePiece(piece, ctx([piece]));
      expect(v.some(r => r.ruleId === 'PIECE_MIN_SIZE')).toBe(true);
    });
  });

  describe('BIAS_GRAIN_ACKNOWLEDGED', () => {
    it('informs about bias grain', () => {
      const piece = makePiece({
        grainLine: {
          id: 'gl1',
          direction: 'bias',
          angle: 45,
          path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 100] }],
        },
      });
      const v = validatePiece(piece, ctx([piece]), ['fabric']);
      expect(v.some(r => r.ruleId === 'BIAS_GRAIN_ACKNOWLEDGED')).toBe(true);
    });
  });

  describe('DUPLICATE_PIECE_NAMES', () => {
    it('warns on duplicate names', () => {
      const p1 = makePiece({ id: 'a', name: 'Front' });
      const p2 = makePiece({ id: 'b', name: 'Front' });
      const v = validateAllPieces(ctx([p1, p2]));
      expect(v.filter(r => r.ruleId === 'DUPLICATE_PIECE_NAMES').length).toBe(2);
    });
  });

  describe('FABRIC_WEIGHT_DART', () => {
    it('informs about darts in heavy fabric', () => {
      const piece = makePiece({
        darts: [makeDart()],
      });
      const v = validatePiece(piece, ctx([piece], 'heavy'), ['fabric']);
      expect(v.some(r => r.ruleId === 'FABRIC_WEIGHT_DART')).toBe(true);
    });

    it('informs about a dart that lives only in internals (no piece.darts)', () => {
      const piece = makePiece({
        internals: [makeDartLine([
          { type: 'M', values: [100, 400] },
          { type: 'L', values: [110, 300] },
          { type: 'L', values: [120, 400] },
        ])],
      });
      const v = validatePiece(piece, ctx([piece], 'heavy'), ['fabric']);
      expect(v.some(r => r.ruleId === 'FABRIC_WEIGHT_DART')).toBe(true);
    });
  });

  describe('getViolationSummary', () => {
    it('returns clean message for no violations', () => {
      expect(getViolationSummary([])).toBe('✅ No issues found');
    });

    it('formats violations', () => {
      const piece = makePiece({ seamAllowance: 0 });
      const v = validateAllPieces(ctx([piece]));
      const summary = getViolationSummary(v);
      expect(summary.length).toBeGreaterThan(20);
    });
  });

  describe('category filtering', () => {
    it('filters to fit rules only', () => {
      const piece = makePiece();
      const all = validatePiece(piece, ctx([piece]));
      const fitOnly = validatePiece(piece, ctx([piece]), ['fit']);
      expect(fitOnly.length).toBeLessThanOrEqual(all.length);
      expect(fitOnly.every(v => v.category === 'fit')).toBe(true);
    });
  });
});
