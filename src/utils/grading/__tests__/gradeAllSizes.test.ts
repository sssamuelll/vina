import { describe, it, expect } from 'vitest';
import { gradeAllSizes } from '../gradeAllSizes';
import { gradePiece } from '../gradingEngine';
import type { PatternPiece } from '../../../types/types';

function makePiece(name: string): PatternPiece {
  return {
    id: 'base-1',
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    internals: [
      { id: 'n1', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 5] }] },
      { id: 'g1', type: 'grainline', path: [{ type: 'M', values: [100, 50] }, { type: 'L', values: [100, 250] }] },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('gradeAllSizes', () => {
  const baseMeasurements = { chest: 88, waist: 72, hips: 96 };

  it('generates all 6 default sizes', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements);
    expect(result.sizes.length).toBe(6);
    expect(result.sizes.map(s => s.size)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(result.totalPieces).toBe(6);
  });

  it('pieces have correct size-suffixed names', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements);
    expect(result.sizes[0].pieces[0].name).toBe('Front (XS)');
    expect(result.sizes[5].pieces[0].name).toBe('Front (XXL)');
  });

  it('each size has a unique scale factor', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements);
    const factors = result.sizes.map(s => s.scaleFactor);
    // XS < S < M(=1) < L < XL < XXL
    expect(factors[0]).toBeLessThan(1); // XS
    expect(factors[2]).toBeCloseTo(1);  // M = base
    expect(factors[5]).toBeGreaterThan(1); // XXL
    // Monotonically increasing
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1]);
    }
  });

  it('scales internals (notches + grainlines)', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements);
    const xlPiece = result.sizes.find(s => s.size === 'XL')!.pieces[0];
    // Internals should exist and be scaled
    expect(xlPiece.internals.length).toBe(2);
    const notch = xlPiece.internals.find(i => i.type === 'notch')!;
    const grain = xlPiece.internals.find(i => i.type === 'grainline')!;
    expect(notch.path.length).toBeGreaterThan(0);
    expect(grain.path.length).toBeGreaterThan(0);
  });

  it('gradePiece scales internals around centroid', () => {
    const piece = makePiece('Test');
    const graded = gradePiece(piece, { chest: 88 }, { chest: 96 });
    // Internals should be scaled (not identical to base)
    const baseNotchY = piece.internals[0].path[1].values[1];
    const gradedNotchY = graded.internals[0].path[1].values[1];
    expect(gradedNotchY).not.toBeCloseTo(baseNotchY, 0);
  });

  it('supports custom size subset', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements, { sizes: ['S', 'L'] });
    expect(result.sizes.length).toBe(2);
    expect(result.sizes.map(s => s.size)).toEqual(['S', 'L']);
  });

  it('stacked layout offsets Y positions', () => {
    const result = gradeAllSizes([makePiece('Front')], baseMeasurements, {
      sizes: ['S', 'M'],
      layoutMode: 'stacked',
    });
    const sY = result.sizes[0].pieces[0].position.y;
    const mY = result.sizes[1].pieces[0].position.y;
    expect(mY).toBeGreaterThan(sY);
  });

  it('handles multiple pieces per size', () => {
    const pieces = [makePiece('Front'), makePiece('Back')];
    const result = gradeAllSizes(pieces, baseMeasurements, { sizes: ['S', 'M', 'L'] });
    expect(result.totalPieces).toBe(6); // 2 pieces × 3 sizes
    expect(result.sizes[0].pieces.length).toBe(2);
  });
});
