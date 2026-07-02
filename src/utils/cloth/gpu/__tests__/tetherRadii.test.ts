import { describe, it, expect } from 'vitest';
import { regionRadius, buildTetherRadii } from '../tetherRadii';

describe('regionRadius', () => {
  it('clings the torso/collar, loosens the skirt', () => {
    expect(regionRadius('front-torso')).toBeLessThan(regionRadius('sleeve'));
    expect(regionRadius('sleeve')).toBeLessThan(regionRadius('skirt'));
    expect(regionRadius('collar')).toBeLessThanOrEqual(regionRadius('front-torso'));
  });
  it('falls back to a moderate radius for unknown regions', () => {
    expect(regionRadius('weird-piece')).toBeGreaterThan(0);
  });
});

describe('buildTetherRadii', () => {
  it('expands per-piece region to a per-vertex radius array in piece order', () => {
    const radii = buildTetherRadii([
      { region: 'front-torso', vertexCount: 2 },
      { region: 'skirt', vertexCount: 3 },
    ]);
    expect(radii).toHaveLength(5);
    expect(radii[0]).toBe(regionRadius('front-torso'));
    expect(radii[2]).toBe(regionRadius('skirt'));
  });
});
