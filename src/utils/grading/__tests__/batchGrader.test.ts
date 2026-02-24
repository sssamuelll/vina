import { describe, it, expect } from 'vitest';
import { batchGrade, generateOverlay, getSizeColor } from '../batchGrader';
import type { SeamlyPattern } from '../../seamly2d/templateEngine';
import type { ConstructionStep } from '../../seamly2d/constructionResolver';

const mockPattern: SeamlyPattern = {
  name: 'test_bodice',
  variables: {
    '#BustWidth': { formula: 'bust_circ / 4 + 10', description: 'bust width' },
  },
  construction: [
    { type: 'point', id: 1, name: 'A', x: 0, y: 0 },
    { type: 'point', id: 2, name: 'B', x: 250, y: 0 },
    { type: 'point', id: 3, name: 'C', x: 250, y: 400 },
    { type: 'point', id: 4, name: 'D', x: 0, y: 400 },
  ] as ConstructionStep[],
  measurements: {
    defaults: { bust_circ: 920, waist_circ: 740, height: 1680 },
  },
  pieces: [
    { name: 'Main', nodes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], seamAllowance: 10 },
  ],
};

describe('batchGrade', () => {
  it('generates pieces for multiple sizes', () => {
    const result = batchGrade(mockPattern, {
      sizes: ['S', 'M', 'L'],
      baseSize: 'M',
    });

    expect(result.sizes).toHaveLength(3);
    expect(result.sizes.map(s => s.size)).toEqual(['S', 'M', 'L']);
    expect(result.totalPieces).toBeGreaterThan(0);
  });

  it('each size has a color', () => {
    const result = batchGrade(mockPattern, { sizes: ['XS', 'M', 'XL'] });
    for (const s of result.sizes) {
      expect(s.color).toBeTruthy();
      expect(s.color).toMatch(/^#/);
    }
  });

  it('pieces have size-tagged names', () => {
    const result = batchGrade(mockPattern, { sizes: ['S'] });
    for (const piece of result.sizes[0].pieces) {
      expect(piece.name).toContain('(S)');
    }
  });

  it('pieces have size-tagged IDs', () => {
    const result = batchGrade(mockPattern, { sizes: ['L'] });
    for (const piece of result.sizes[0].pieces) {
      expect(piece.id).toContain('_L');
    }
  });

  it('handles all standard sizes', () => {
    const result = batchGrade(mockPattern);
    expect(result.sizes.length).toBeGreaterThanOrEqual(6);
  });

  it('returns warnings for failed sizes', () => {
    const badPattern: SeamlyPattern = {
      name: 'broken',
      variables: {},
      construction: [],
    };
    const result = batchGrade(badPattern, { sizes: ['M'] });
    // Should still produce a result (empty pieces), not throw
    expect(result).toBeDefined();
  });
});

describe('generateOverlay', () => {
  it('generates overlay data for visualization', () => {
    const overlay = generateOverlay(mockPattern, { sizes: ['S', 'M', 'L'] });
    expect(overlay).toHaveLength(3);
    for (const entry of overlay) {
      expect(entry.color).toBeTruthy();
      expect(entry.pieces.length).toBeGreaterThan(0);
    }
  });

  it('overlay pieces have overlay-tagged IDs', () => {
    const overlay = generateOverlay(mockPattern, { sizes: ['M'] });
    for (const piece of overlay[0].pieces) {
      expect(piece.id).toContain('_overlay_');
    }
  });
});

describe('getSizeColor', () => {
  it('returns unique colors for different sizes', () => {
    const colors = new Set(['XS', 'S', 'M', 'L', 'XL'].map(s => getSizeColor(s as any)));
    expect(colors.size).toBe(5);
  });

  it('returns fallback for unknown size', () => {
    expect(getSizeColor('XXXL' as any)).toBe('#666');
  });
});
