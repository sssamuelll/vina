import { describe, it, expect } from 'vitest';
import { deriveDimensions } from '../../garmentPlacement';
import type { BodyMeasurements } from '../../../../types/types';

const base: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 };

describe('deriveDimensions anatomical radii', () => {
  it('derives neckR/armR from circumference when present', () => {
    const d = deriveDimensions({ ...base, neckCirc: 36, upperArmCirc: 28 });
    expect(d.neckR).toBeCloseTo(0.36 / (2 * Math.PI), 4); // 36cm → 0.36m / 2π
    expect(d.armR).toBeCloseTo(0.28 / (2 * Math.PI), 4);
  });
  it('falls back when circumferences are absent', () => {
    const d = deriveDimensions(base);
    expect(d.neckR).toBeCloseTo(d.chestRadius * 0.4, 4);
    expect(d.armR).toBeCloseTo(0.05, 4);
  });
});
