import { describe, it, expect } from 'vitest';
import {
  generateBodiceBack,
  generateBodiceFront,
  generateSleeve,
  generateSkirtFront,
  generateSkirtBack,
  generatePantsFront,
  generatePantsBack,
  generateCollar,
} from '../utils/patternTemplates';

const measurements = {
  height: 170,
  chest: 90,
  waist: 70,
  hips: 95,
  shoulder: 40,
  armLength: 60,
  inseam: 80,
};

describe('patternTemplates', () => {
  describe('bodice', () => {
    it('generates back bodice with valid outline', () => {
      const piece = generateBodiceBack(measurements);
      expect(piece.name).toBe('Back Bodice');
      expect(piece.outline.length).toBeGreaterThan(3);
      expect(piece.outline[0].type).toBe('M');
      expect(piece.outline[piece.outline.length - 1].type).toBe('Z');
      expect(piece.seamAllowance).toBe(10);
    });

    it('generates front bodice with valid outline', () => {
      const piece = generateBodiceFront(measurements);
      expect(piece.name).toBe('Front Bodice');
      expect(piece.outline.length).toBeGreaterThan(3);
      expect(piece.outline[0].type).toBe('M');
    });

    it('bodice dimensions scale with chest', () => {
      const small = generateBodiceBack({ ...measurements, chest: 80 });
      const large = generateBodiceBack({ ...measurements, chest: 110 });
      // Larger chest = wider piece (check bounding box)
      const widthSmall = Math.max(...small.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)));
      const widthLarge = Math.max(...large.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)));
      expect(widthLarge).toBeGreaterThan(widthSmall);
    });
  });

  describe('sleeve', () => {
    it('generates sleeve with grainline', () => {
      const piece = generateSleeve(measurements);
      expect(piece.name).toBe('Sleeve');
      expect(piece.internals.length).toBeGreaterThan(0);
      expect(piece.internals.some(l => l.type === 'grainline')).toBe(true);
    });

    it('sleeve length scales with arm length', () => {
      const short = generateSleeve({ ...measurements, armLength: 50 });
      const long = generateSleeve({ ...measurements, armLength: 70 });
      const heightShort = Math.max(...short.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)));
      const heightLong = Math.max(...long.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)));
      expect(heightLong).toBeGreaterThan(heightShort);
    });
  });

  describe('skirt', () => {
    it('generates front and back skirt', () => {
      const front = generateSkirtFront(measurements);
      const back = generateSkirtBack(measurements);
      expect(front.name).toBe('Front Skirt');
      expect(back.name).toBe('Back Skirt');
      expect(front.outline[0].type).toBe('M');
      expect(back.outline[0].type).toBe('M');
    });

    it('skirt has dart internals', () => {
      const front = generateSkirtFront(measurements);
      expect(front.internals.some(l => l.type === 'dart')).toBe(true);
    });
  });

  describe('pants', () => {
    it('generates front and back pants', () => {
      const front = generatePantsFront(measurements);
      const back = generatePantsBack(measurements);
      expect(front.name).toBe('Front Pants');
      expect(back.name).toBe('Back Pants');
    });

    it('pants height scales with inseam', () => {
      const short = generatePantsFront({ ...measurements, inseam: 70 });
      const long = generatePantsFront({ ...measurements, inseam: 90 });
      const hShort = Math.max(...short.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)));
      const hLong = Math.max(...long.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)));
      expect(hLong).toBeGreaterThan(hShort);
    });
  });

  describe('collar', () => {
    it('generates collar piece', () => {
      const piece = generateCollar(measurements);
      expect(piece.name).toBe('Collar');
      expect(piece.outline.length).toBeGreaterThan(2);
    });
  });

  describe('all templates', () => {
    const generators = [
      generateBodiceBack, generateBodiceFront, generateSleeve,
      generateSkirtFront, generateSkirtBack,
      generatePantsFront, generatePantsBack, generateCollar,
    ];

    it.each(generators.map(g => [g.name, g]))('%s returns valid PatternPiece', (_, gen: any) => {
      const piece = gen(measurements);
      expect(piece.id).toBeDefined();
      expect(piece.name).toBeTruthy();
      expect(piece.outline).toBeInstanceOf(Array);
      expect(piece.internals).toBeInstanceOf(Array);
      expect(piece.position).toEqual({ x: expect.any(Number), y: expect.any(Number) });
      expect(piece.rotation).toBe(0);
      expect(typeof piece.seamAllowance).toBe('number');
      expect(piece.createdAt).toBeInstanceOf(Date);
    });
  });
});
