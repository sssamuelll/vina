// src/utils/geometry/__tests__/coords.test.ts
import { describe, it, expect } from 'vitest';
import { screenToPattern, screenToPatternLength } from '../coords';

describe('screenToPattern', () => {
  it('converts with no zoom/pan', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 0, y: 0 });
    expect(result).toEqual({ x: 100, y: 200 });
  });
  it('accounts for zoom', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 2, { x: 0, y: 0 });
    expect(result).toEqual({ x: 50, y: 100 });
  });
  it('accounts for pan', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 10, y: 20 });
    expect(result).toEqual({ x: 90, y: 180 });
  });
  it('accounts for svgRect offset', () => {
    const result = screenToPattern(100, 200, { left: 50, top: 100 }, 1, { x: 0, y: 0 });
    expect(result).toEqual({ x: 50, y: 100 });
  });
});

describe('screenToPatternLength', () => {
  it('identity at zoom 1', () => {
    expect(screenToPatternLength(8, 1)).toBe(8);
  });
  it('halves at zoom 2', () => {
    expect(screenToPatternLength(10, 2)).toBe(5);
  });
  it('zero stays zero', () => {
    expect(screenToPatternLength(0, 1)).toBe(0);
  });
  it('handles fractional zoom', () => {
    expect(screenToPatternLength(10, 0.5)).toBe(20);
  });
});

// Regression: usePolyPenTool had divergent formula `(screen - rect)/zoom - pan`
// (pan after zoom) that was mathematically incorrect for the SVG transform
// `translate(pan) scale(zoom)`. C5 commit 12 fixed it by adopting screenToPattern.
// These tests pin the canonical formula at the 4 cases that exercise the bug
// boundary (zero/non-zero pan × identity/non-identity zoom).
describe('screenToPattern (regression for usePolyPenTool divergent formula, C5 #642)', () => {
  it('identity case: zoom=1, pan=(0,0)', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 0, y: 0 });
    expect(result).toEqual({ x: 100, y: 200 });
  });
  it('zoom only: zoom=2, pan=(0,0)', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 2, { x: 0, y: 0 });
    expect(result).toEqual({ x: 50, y: 100 });
  });
  it('pan only: zoom=1, pan=(10,20)', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 10, y: 20 });
    expect(result).toEqual({ x: 90, y: 180 });
  });
  it('combined pan + zoom: zoom=2, pan=(50,100), screen=(200,300) → (75,100)', () => {
    // The bug case: divergent formula would compute (50, 50) here.
    // Canonical formula: (200 - 0 - 50) / 2 = 75, (300 - 0 - 100) / 2 = 100.
    const result = screenToPattern(200, 300, { left: 0, top: 0 }, 2, { x: 50, y: 100 });
    expect(result).toEqual({ x: 75, y: 100 });
  });
});
