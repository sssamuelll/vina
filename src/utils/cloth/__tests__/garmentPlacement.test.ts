/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { detectBodyRegion, computePlacement, placeGarmentPieces } from '../garmentPlacement';
import type { PatternPiece, BodyMeasurements } from '../../../types/types';

const MEAS: BodyMeasurements = {
  height: 168, chest: 88, waist: 72, hips: 96,
  shoulder: 40, armLength: 60, inseam: 80,
} as BodyMeasurements;

function makePiece(name: string, category?: string, side?: string): PatternPiece {
  return {
    id: '1', name,
    category: category as any,
    side: side as any,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('detectBodyRegion', () => {
  it('uses category when available', () => {
    expect(detectBodyRegion(makePiece('xyz', 'bodice', 'front'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('xyz', 'bodice', 'back'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('xyz', 'sleeve', 'left'))).toBe('left-sleeve');
    expect(detectBodyRegion(makePiece('xyz', 'sleeve', 'right'))).toBe('right-sleeve');
    expect(detectBodyRegion(makePiece('xyz', 'skirt', 'front'))).toBe('front-skirt');
    expect(detectBodyRegion(makePiece('xyz', 'collar'))).toBe('collar');
    expect(detectBodyRegion(makePiece('xyz', 'hood'))).toBe('hood');
  });

  it('falls back to name when no category', () => {
    expect(detectBodyRegion(makePiece('Front Panel'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Espalda'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Manga'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Cuello'))).toBe('collar');
    expect(detectBodyRegion(makePiece('Falda Front'))).toBe('front-skirt');
  });

  it('supports multiple languages', () => {
    // German
    expect(detectBodyRegion(makePiece('Vorderteil'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Rückteil'))).toBe('back-torso');
    // French
    expect(detectBodyRegion(makePiece('Devant'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Dos principal'))).toBe('back-torso');
    // Italian
    expect(detectBodyRegion(makePiece('Davanti'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Dietro'))).toBe('back-torso');
  });

  it('returns unknown for unrecognized names', () => {
    expect(detectBodyRegion(makePiece('Piece_42'))).toBe('unknown');
  });
});

describe('computePlacement', () => {
  it('front-torso is in front of body (negative Z)', () => {
    const p = computePlacement('front-torso', MEAS, { widthMm: 200, heightMm: 300 });
    expect(p.position[2]).toBeLessThan(0); // front = -Z
  });

  it('back-torso is behind body (positive Z)', () => {
    const p = computePlacement('back-torso', MEAS, { widthMm: 200, heightMm: 300 });
    expect(p.position[2]).toBeGreaterThan(0);
  });

  it('sleeves are to the sides (X offset)', () => {
    const left = computePlacement('left-sleeve', MEAS, { widthMm: 200, heightMm: 300 });
    const right = computePlacement('right-sleeve', MEAS, { widthMm: 200, heightMm: 300 });
    expect(left.position[0]).toBeLessThan(0);
    expect(right.position[0]).toBeGreaterThan(0);
  });

  it('skirt is at waist height', () => {
    const p = computePlacement('front-skirt', MEAS, { widthMm: 200, heightMm: 500 });
    const waistH = 168 * 0.55 / 100; // ~0.924
    expect(p.position[1]).toBeLessThan(waistH + 0.1);
  });

  it('collar is at neck height', () => {
    const p = computePlacement('collar', MEAS, { widthMm: 100, heightMm: 50 });
    expect(p.position[1]).toBeGreaterThan(1.3); // neck > 1.3m for 168cm person
  });
});

describe('placeGarmentPieces', () => {
  it('places all pieces', () => {
    const pieces = [
      makePiece('Front', 'bodice', 'front'),
      makePiece('Back', 'bodice', 'back'),
      makePiece('Sleeve', 'sleeve'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);
    expect(placements.length).toBe(3);
    // Front in front, back behind
    expect(placements[0].position[2]).toBeLessThan(0);
    expect(placements[1].position[2]).toBeGreaterThan(0);
  });

  it('distributes unknowns in a circle', () => {
    const pieces = [
      makePiece('A'),
      makePiece('B'),
      makePiece('C'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);
    // All should have positions, none at exact same spot
    const positions = placements.map(p => p.position.join(','));
    const unique = new Set(positions);
    expect(unique.size).toBe(3);
  });

  it('unknown pieces include X rotation to stand upright', () => {
    const pieces = [makePiece('A'), makePiece('B')];
    const placements = placeGarmentPieces(pieces, MEAS);
    for (const p of placements) {
      // X rotation must be -π/2 to stand the piece up from horizontal XZ plane
      expect(p.rotation[0]).toBeCloseTo(-Math.PI / 2, 5);
    }
  });

  it('does not double-toggle sleeve assignment', () => {
    const pieces = [
      makePiece('Sleeve One', 'sleeve'),
      makePiece('Sleeve Two', 'sleeve'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);
    // First sleeve should be left, second right (toggle alternation)
    expect(placements[0].position[0]).toBeLessThan(0); // left = -X
    expect(placements[1].position[0]).toBeGreaterThan(0); // right = +X
  });
});
