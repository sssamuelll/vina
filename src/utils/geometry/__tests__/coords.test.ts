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
