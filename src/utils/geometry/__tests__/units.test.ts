import { describe, it, expect } from 'vitest';
import { cmToM, mToCm, mmToM, mToMm, cmToMm, mmToCm } from '../units';

describe('units conversions', () => {
  describe('cmToM / mToCm', () => {
    it('cmToM divides by 100', () => {
      expect(cmToM(168)).toBe(1.68);
      expect(cmToM(100)).toBe(1);
      expect(cmToM(0)).toBe(0);
    });
    it('mToCm multiplies by 100', () => {
      expect(mToCm(1.68)).toBe(168);
      expect(mToCm(1)).toBe(100);
      expect(mToCm(0)).toBe(0);
    });
    it('round-trips cm → m → cm', () => {
      expect(mToCm(cmToM(168))).toBeCloseTo(168, 10);
    });
  });

  describe('mmToM / mToMm', () => {
    it('mmToM divides by 1000', () => {
      expect(mmToM(1700)).toBe(1.7);
      expect(mmToM(1000)).toBe(1);
      expect(mmToM(0)).toBe(0);
    });
    it('mToMm multiplies by 1000', () => {
      expect(mToMm(1.7)).toBe(1700);
      expect(mToMm(1)).toBe(1000);
      expect(mToMm(0)).toBe(0);
    });
    it('round-trips mm → m → mm', () => {
      expect(mToMm(mmToM(1700))).toBeCloseTo(1700, 10);
    });
  });

  describe('cmToMm / mmToCm', () => {
    it('cmToMm multiplies by 10', () => {
      expect(cmToMm(168)).toBe(1680);
      expect(cmToMm(0)).toBe(0);
    });
    it('mmToCm divides by 10', () => {
      expect(mmToCm(1680)).toBe(168);
      expect(mmToCm(0)).toBe(0);
    });
    it('round-trips cm → mm → cm', () => {
      expect(mmToCm(cmToMm(168))).toBeCloseTo(168, 10);
    });
  });

  describe('negative and fractional', () => {
    it('handles negatives', () => {
      expect(cmToM(-50)).toBe(-0.5);
      expect(mmToM(-1000)).toBe(-1);
    });
    it('handles fractional', () => {
      expect(cmToM(168.5)).toBe(1.685);
      expect(mmToM(2.5)).toBe(0.0025);
    });
  });
});
