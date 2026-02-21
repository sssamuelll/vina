import { describe, it, expect } from 'vitest';
import { detectBodyRegion, computePlacement, placeGarmentPieces } from '../garmentPlacement';
import type { BodyMeasurements } from '../../../types/types';
import type { PatternPiece } from '../../../types/types';

const baseMeasurements: BodyMeasurements = {
  height: 170,
  chest: 90,
  waist: 70,
  hips: 95,
  shoulder: 42,
  armLength: 60,
  inseam: 78,
};

describe('detectBodyRegion', () => {
  it('detects EN names', () => {
    expect(detectBodyRegion('Front Bodice')).toBe('front-torso');
    expect(detectBodyRegion('Back Panel')).toBe('back-torso');
    expect(detectBodyRegion('Left Sleeve')).toBe('left-sleeve');
    expect(detectBodyRegion('Right Sleeve')).toBe('right-sleeve');
  });

  it('detects ES names', () => {
    expect(detectBodyRegion('Delantero')).toBe('front-torso');
    expect(detectBodyRegion('Manga Derecha')).toBe('right-sleeve');
    expect(detectBodyRegion('Falda')).toBe('front-skirt');
    expect(detectBodyRegion('Espalda')).toBe('back-torso');
  });

  it('returns unknown for unrecognized names', () => {
    expect(detectBodyRegion('Piece 1')).toBe('unknown');
  });

  it('detects collar, waistband, hood', () => {
    expect(detectBodyRegion('Collar Stand')).toBe('collar');
    expect(detectBodyRegion('Cuello')).toBe('collar');
    expect(detectBodyRegion('Waistband')).toBe('waistband');
    expect(detectBodyRegion('Pretina')).toBe('waistband');
    expect(detectBodyRegion('Hood Panel')).toBe('hood');
    expect(detectBodyRegion('Capucha')).toBe('hood');
  });

  it('detects back skirt', () => {
    expect(detectBodyRegion('Back Skirt')).toBe('back-skirt');
  });
});

describe('computePlacement', () => {
  it('places front-torso in front of avatar (negative Z)', () => {
    const p = computePlacement('front-torso', baseMeasurements, 0, 1);
    expect(p.position[2]).toBeLessThan(0); // in front
    expect(p.position[0]).toBeCloseTo(0);  // centered
  });

  it('places back-torso behind avatar (positive Z)', () => {
    const p = computePlacement('back-torso', baseMeasurements, 0, 1);
    expect(p.position[2]).toBeGreaterThan(0);
  });

  it('places sleeves at sides', () => {
    const left = computePlacement('left-sleeve', baseMeasurements, 0, 1);
    const right = computePlacement('right-sleeve', baseMeasurements, 0, 1);
    expect(left.position[0]).toBeLessThan(0);    // left side
    expect(right.position[0]).toBeGreaterThan(0); // right side
  });

  it('converts cm measurements to meter positions', () => {
    const p = computePlacement('front-torso', baseMeasurements, 0, 1);
    // Height 170cm → waist at ~0.935m, shoulder at ~1.394m, mid-torso ~1.16m
    expect(p.position[1]).toBeGreaterThan(0.5);
    expect(p.position[1]).toBeLessThan(2.0);
  });

  it('unknown falls back to circle arrangement', () => {
    const p = computePlacement('unknown', baseMeasurements, 0, 4);
    // Should still produce a valid position
    expect(p.position).toHaveLength(3);
    expect(p.rotation).toHaveLength(3);
  });
});

describe('placeGarmentPieces', () => {
  it('returns one result per piece', () => {
    const pieces = [
      { id: '1', name: 'Front Bodice', outline: [], position: { x: 0, y: 0 } },
      { id: '2', name: 'Back Panel', outline: [], position: { x: 0, y: 0 } },
      { id: '3', name: 'Sleeve', outline: [], position: { x: 0, y: 0 } },
    ] as unknown as PatternPiece[];

    const results = placeGarmentPieces(pieces, baseMeasurements);
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.position).toHaveLength(3);
      expect(r.rotation).toHaveLength(3);
    });
  });
});
