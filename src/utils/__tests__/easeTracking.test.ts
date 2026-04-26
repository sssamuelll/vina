import { describe, it, expect } from 'vitest';
import { computeEase, compareToStandard, classifyFit, EASE_STANDARDS } from '../easeTracking';
import type { PatternPiece } from '../../types/types';

function makeBodicePiece(name: string, width: number, height: number): PatternPiece {
  return {
    id: `test-${name}`, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [width, 0] },
      { type: 'L', values: [width, height] },
      { type: 'L', values: [0, height] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
    category: 'bodice', side: 'front',
  };
}

const body = { chest: 96, waist: 82, hip: 96, shoulder: 44 };

describe('computeEase', () => {
  it('computes bust ease from bodice pieces', () => {
    const front = makeBodicePiece('Front', 260, 600);
    const back = makeBodicePiece('Back', 260, 600);
    back.side = 'back';
    const ease = computeEase([front, back], body);
    // 2 bodices, scanline at 30% on a 260×600 rect → 260 mm width per piece.
    // total = 520 mm; body chest = 96 cm = 960 mm; ease = round(520 − 960).
    expect(ease.bust).toBe(-440);
  });

  it('doubles measurement for single piece (front only)', () => {
    const front = makeBodicePiece('Front', 500, 600);
    const ease = computeEase([front], body);
    // Single piece: 500mm × 2 = 1000mm, body = 960mm → ease = 40mm
    expect(ease.bust).toBeDefined();
    expect(ease.bust).toBeCloseTo(40, -1); // ±10mm tolerance
  });

  it('returns empty for no pieces', () => {
    const ease = computeEase([], body);
    expect(ease.bust).toBeUndefined();
    expect(ease.waist).toBeUndefined();
  });
});

describe('compareToStandard', () => {
  it('compares against all standards', () => {
    const ease = { bust: 60, waist: 40, hip: 60 };
    const results = compareToStandard(ease);
    expect(results.length).toBe(EASE_STANDARDS.length);
    expect(results[0].analysis.bust).toBeDefined();
  });

  it('filters by standard name', () => {
    const ease = { bust: 60 };
    const results = compareToStandard(ease, 'T-Shirt');
    expect(results.length).toBe(1);
    expect(results[0].standard.name).toBe('T-Shirt');
  });

  it('classifies tight/ok/loose correctly', () => {
    const ease = { bust: 10, waist: 150 };
    const results = compareToStandard(ease, 'Woven Fitted');
    expect(results[0].analysis.bust?.status).toBe('tight');  // 10 < 25
    expect(results[0].analysis.waist?.status).toBe('loose'); // 150 > 40
  });
});

describe('classifyFit', () => {
  it.each([
    [{ bust: -10 }, 'skin-tight'],
    [{ bust: 30 }, 'fitted'],
    [{ bust: 60 }, 'semi-fitted'],
    [{ bust: 100 }, 'loose'],
    [{ bust: 150 }, 'oversized'],
  ] as const)('classifies bust=%d as %s', (ease, expected) => {
    expect(classifyFit(ease)).toBe(expected);
  });
});
