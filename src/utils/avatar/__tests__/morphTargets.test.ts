/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect } from 'vitest';
import { computeMorphWeights, DEFAULT_MEASUREMENTS, aMorph } from '../morphTargets';

describe('computeMorphWeights', () => {
  it('returns ~1.0 for all weights with default measurements', () => {
    const w = computeMorphWeights(DEFAULT_MEASUREMENTS);
    expect(w.chestScale).toBeCloseTo(1.0);
    expect(w.waistScale).toBeCloseTo(1.0);
    expect(w.hipScale).toBeCloseTo(1.0);
    expect(w.shoulderScale).toBeCloseTo(1.0);
    expect(w.heightScale).toBeCloseTo(1.0);
    expect(w.armLength).toBeCloseTo(1.0);
    expect(w.legLength).toBeCloseTo(1.0);
  });

  it('larger chest → chestScale > 1.0', () => {
    const w = computeMorphWeights({ ...DEFAULT_MEASUREMENTS, chest: 110 });
    expect(w.chestScale).toBeGreaterThan(1.0);
  });

  it('smaller waist → waistScale < 1.0', () => {
    const w = computeMorphWeights({ ...DEFAULT_MEASUREMENTS, waist: 68 });
    expect(w.waistScale).toBeLessThan(1.0);
  });

  it('height scaling is proportional', () => {
    const w = computeMorphWeights({ ...DEFAULT_MEASUREMENTS, height: 190 });
    expect(w.heightScale).toBeCloseTo(190 / 180);
  });

  it('handles missing armLength/inseam with defaults', () => {
    const { armLength, inseam, ...partial } = DEFAULT_MEASUREMENTS;
    const w = computeMorphWeights(partial as any);
    expect(w.armLength).toBeCloseTo(1.0);
    expect(w.legLength).toBeCloseTo(1.0);
  });
});

describe('estirar contra la referencia del cuerpo cargado (spec § 5)', () => {
  const eu38 = { chest: 88, waist: 77.1, hip: 97, shoulderWidth: 36.1, height: 161.4, armLength: 53.7, inseam: 77.7 };

  it('un cuerpo medido contra sí mismo no se estira: todo da 1,0', () => {
    expect(Object.values(computeMorphWeights(eu38, eu38))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('sin referencia, sigue comparando contra el hombre de 180 cm', () => {
    expect(computeMorphWeights(eu38).chestScale).toBeCloseTo(88 / 96);
  });

  it('aMorph renombra las claves de BodyMeasurements a las del morph', () => {
    expect(aMorph({ height: 161.4, chest: 88, waist: 77.1, hips: 97, shoulder: 36.1, armLength: 53.7, inseam: 77.7, neckCirc: 31.6 }))
      .toEqual(eu38);
  });
});
