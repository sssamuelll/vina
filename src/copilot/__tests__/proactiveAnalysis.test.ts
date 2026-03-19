import { describe, it, expect } from 'vitest';
import {
  auditSeamAllowances,
  auditGrainlines,
  auditDartAlignment,
  auditNotches,
  runProactiveAnalysis,
  formatWarnings,
} from '../reasoning/proactiveAnalysis';
import type { PatternPiece, Seam } from '../../types/types';

function makePiece(overrides: Partial<PatternPiece> & { id: string; name: string }): PatternPiece {
  return {
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [0, 400] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('auditSeamAllowances', () => {
  it('should return no warnings for consistent SA', () => {
    const pieces = [
      makePiece({ id: '1', name: 'Front', seamAllowance: 10 }),
      makePiece({ id: '2', name: 'Back', seamAllowance: 10 }),
    ];
    expect(auditSeamAllowances(pieces)).toEqual([]);
  });

  it('should warn about missing SA (0mm)', () => {
    const pieces = [
      makePiece({ id: '1', name: 'Front', seamAllowance: 10 }),
      makePiece({ id: '2', name: 'Back', seamAllowance: 0 }),
    ];
    const warnings = auditSeamAllowances(pieces);
    expect(warnings.length).toBe(1);
    expect(warnings[0].severity).toBe('error');
    expect(warnings[0].category).toBe('seam-allowance');
    expect(warnings[0].message).toContain('Back');
  });

  it('should warn about inconsistent SA values', () => {
    const pieces = [
      makePiece({ id: '1', name: 'A', seamAllowance: 10 }),
      makePiece({ id: '2', name: 'B', seamAllowance: 7 }),
      makePiece({ id: '3', name: 'C', seamAllowance: 15 }),
    ];
    const warnings = auditSeamAllowances(pieces);
    expect(warnings.some(w => w.category === 'seam-allowance' && w.severity === 'warning')).toBe(true);
  });

  it('should return empty for no pieces', () => {
    expect(auditSeamAllowances([])).toEqual([]);
  });
});

describe('auditGrainlines', () => {
  it('should warn about missing grainlines', () => {
    const pieces = [
      makePiece({ id: '1', name: 'Front', internals: [] }),
      makePiece({
        id: '2',
        name: 'Back',
        internals: [{ id: 'gl-1', type: 'grainline', path: [{ type: 'M', values: [100, 20] }, { type: 'L', values: [100, 380] }] }],
      }),
    ];
    const warnings = auditGrainlines(pieces);
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('Front');
  });

  it('should return no warnings when all pieces have grainlines', () => {
    const pieces = [
      makePiece({
        id: '1', name: 'Front',
        internals: [{ id: 'gl-1', type: 'grainline', path: [] }],
      }),
    ];
    expect(auditGrainlines(pieces)).toEqual([]);
  });
});

describe('auditDartAlignment', () => {
  it('should warn when front has darts but matching back does not', () => {
    const pieces = [
      makePiece({
        id: '1', name: 'Delantero Corpiño',
        internals: [{ id: 'd-1', type: 'dart', path: [] }],
      }),
      makePiece({ id: '2', name: 'Espalda Corpiño', internals: [] }),
    ];
    // Note: the matching logic uses front/back/delantero/espalda keywords
    // "Delantero" maps to front, "Espalda" maps to back
    // After stripping those words, remaining base names must match
    const warnings = auditDartAlignment(pieces);
    expect(warnings.length).toBe(1);
    expect(warnings[0].category).toBe('dart-alignment');
  });

  it('should not warn when both have darts', () => {
    const pieces = [
      makePiece({
        id: '1', name: 'Delantero Corpiño',
        internals: [{ id: 'd-1', type: 'dart', path: [] }],
      }),
      makePiece({
        id: '2', name: 'Espalda Corpiño',
        internals: [{ id: 'd-2', type: 'dart', path: [] }],
      }),
    ];
    expect(auditDartAlignment(pieces)).toEqual([]);
  });
});

describe('auditNotches', () => {
  it('should warn about missing notches on connected pieces', () => {
    const pieces = [
      makePiece({ id: '1', name: 'Front', internals: [] }),
      makePiece({ id: '2', name: 'Back', internals: [] }),
    ];
    const seams: Seam[] = [{
      id: 's-1',
      pieceA: { pieceId: '1', edgeName: 'sideSeam' },
      pieceB: { pieceId: '2', edgeName: 'sideSeam' },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    }];
    const warnings = auditNotches(pieces, seams);
    expect(warnings.length).toBe(1);
    expect(warnings[0].category).toBe('notch');
  });

  it('should warn about mismatched notch counts', () => {
    const pieces = [
      makePiece({
        id: '1', name: 'Front',
        internals: [{ id: 'n-1', type: 'notch', path: [] }],
      }),
      makePiece({ id: '2', name: 'Back', internals: [] }),
    ];
    const seams: Seam[] = [{
      id: 's-1',
      pieceA: { pieceId: '1', edgeName: 'sideSeam' },
      pieceB: { pieceId: '2', edgeName: 'sideSeam' },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    }];
    const warnings = auditNotches(pieces, seams);
    expect(warnings.length).toBe(1);
    expect(warnings[0].severity).toBe('warning');
  });
});

describe('runProactiveAnalysis', () => {
  it('should return empty for empty project', () => {
    expect(runProactiveAnalysis([], [])).toEqual([]);
  });

  it('should run all checks and sort by severity', () => {
    const pieces = [
      makePiece({ id: '1', name: 'Front', seamAllowance: 0, internals: [] }),
    ];
    const warnings = runProactiveAnalysis(pieces, []);
    expect(warnings.length).toBeGreaterThan(0);
    // Errors should come first
    if (warnings.length >= 2) {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      for (let i = 1; i < warnings.length; i++) {
        expect(severityOrder[warnings[i].severity]).toBeGreaterThanOrEqual(
          severityOrder[warnings[i - 1].severity],
        );
      }
    }
  });
});

describe('formatWarnings', () => {
  it('should format warnings with icons', () => {
    const formatted = formatWarnings([
      { category: 'seam-allowance', severity: 'error', pieceIds: ['1'], message: 'Missing SA' },
      { category: 'grainline', severity: 'warning', pieceIds: ['1'], message: 'No grainline' },
    ]);
    expect(formatted).toContain('❌');
    expect(formatted).toContain('⚠️');
  });

  it('should return empty string for no warnings', () => {
    expect(formatWarnings([])).toBe('');
  });
});
