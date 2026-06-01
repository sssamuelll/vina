import { describe, it, expect } from 'vitest';
import { computeGridTiers, minorGridOpacity, subGridOpacity } from '../gridTiers';

describe('gridTiers', () => {
  describe('minorGridOpacity', () => {
    it('is 0 when zoomed far out', () => {
      expect(minorGridOpacity(0.2)).toBe(0);
      expect(minorGridOpacity(0.4)).toBe(0);
    });
    it('is fully on at and above 0.7x', () => {
      expect(minorGridOpacity(0.7)).toBeCloseTo(1);
      expect(minorGridOpacity(1)).toBe(1);
    });
    it('ramps in between', () => {
      const mid = minorGridOpacity(0.55);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });
  });

  describe('subGridOpacity', () => {
    it('is 0 at or below 2x', () => {
      expect(subGridOpacity(1)).toBe(0);
      expect(subGridOpacity(2)).toBe(0);
    });
    it('appears past 2x and caps at 0.6', () => {
      expect(subGridOpacity(2.5)).toBeGreaterThan(0);
      expect(subGridOpacity(3)).toBeCloseTo(0.6);
      expect(subGridOpacity(10)).toBeCloseTo(0.6);
    });
  });

  describe('computeGridTiers', () => {
    it('major is always visible and 10x the minor spacing', () => {
      const tiers = computeGridTiers(10, 1);
      const major = tiers.find(t => t.key === 'major')!;
      const minor = tiers.find(t => t.key === 'minor')!;
      expect(major.opacity).toBe(1);
      expect(major.spacingPx).toBeCloseTo(minor.spacingPx * 10);
    });

    it('subgrid is half the minor spacing', () => {
      const tiers = computeGridTiers(10, 4);
      const minor = tiers.find(t => t.key === 'minor')!;
      const sub = tiers.find(t => t.key === 'subgrid')!;
      expect(sub.spacingPx).toBeCloseTo(minor.spacingPx / 2);
    });

    it('zoomed out: minor + subgrid hidden, major shown', () => {
      const tiers = computeGridTiers(10, 0.3);
      expect(tiers.find(t => t.key === 'minor')!.opacity).toBe(0);
      expect(tiers.find(t => t.key === 'subgrid')!.opacity).toBe(0);
      expect(tiers.find(t => t.key === 'major')!.opacity).toBe(1);
    });

    it('zoomed in: subgrid revealed', () => {
      const tiers = computeGridTiers(10, 3);
      expect(tiers.find(t => t.key === 'subgrid')!.opacity).toBeGreaterThan(0);
      expect(tiers.find(t => t.key === 'minor')!.opacity).toBe(1);
    });

    it('scales spacing with zoom', () => {
      expect(computeGridTiers(10, 2).find(t => t.key === 'minor')!.spacingPx).toBe(20);
    });
  });
});
