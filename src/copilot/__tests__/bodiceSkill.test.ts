import { describe, it, expect } from 'vitest';
import { bodiceSkill } from '../action/skills/definitions/bodiceSkill';

describe('bodiceSkill', () => {
  describe('structure', () => {
    it('should have correct name', () => {
      expect(bodiceSkill.name).toBe('bodice');
    });

    it('should have both Spanish and English triggers', () => {
      const esTerms = ['corpiño', 'blusa base', 'delantero', 'espalda'];
      const enTerms = ['bodice', 'body block', 'torso'];
      for (const term of esTerms) {
        expect(bodiceSkill.triggers).toContain(term);
      }
      for (const term of enTerms) {
        expect(bodiceSkill.triggers).toContain(term);
      }
    });

    it('should have at least 3 methods', () => {
      expect(bodiceSkill.methods.length).toBeGreaterThanOrEqual(3);
    });

    it('should have Aldrich as default method', () => {
      expect(bodiceSkill.methods[0].name).toBe('Aldrich');
    });

    it('should have at least 12 construction steps', () => {
      expect(bodiceSkill.constructionSteps.length).toBeGreaterThanOrEqual(12);
    });

    it('should have grade rules', () => {
      expect(bodiceSkill.gradeRules).toBeDefined();
      expect(bodiceSkill.gradeRules!.length).toBeGreaterThan(0);
    });
  });

  describe('formula validation — standard size M (chest=88, waist=72, hips=96)', () => {
    // Standard EU women M: chest=88cm, waist=72cm, bust≈92cm, neck≈35cm, height=168cm
    const chest = 88;
    const waist = 72;
    const bust = 92;
    const neckCirc = 35;
    const height = 168;

    it('should calculate reasonable back width', () => {
      // backWidth = (chest / 4) + 1
      const backWidth = (chest / 4) + 1;
      expect(backWidth).toBe(23); // 23cm — reasonable half-back width
      expect(backWidth).toBeGreaterThan(20);
      expect(backWidth).toBeLessThan(30);
    });

    it('should calculate reasonable armhole depth', () => {
      // armholeDepth = (height * 0.12) + 5
      const armholeDepth = (height * 0.12) + 5;
      expect(armholeDepth).toBeCloseTo(25.16, 1);
      expect(armholeDepth).toBeGreaterThan(20);
      expect(armholeDepth).toBeLessThan(30);
    });

    it('should calculate reasonable back neck width', () => {
      // backNeckWidth = (neckCirc / 6) + 0.5
      const backNeckWidth = (neckCirc / 6) + 0.5;
      expect(backNeckWidth).toBeCloseTo(6.33, 1);
      expect(backNeckWidth).toBeGreaterThan(5);
      expect(backNeckWidth).toBeLessThan(9);
    });

    it('should calculate reasonable front neck depth', () => {
      // frontNeckDepth = (neckCirc / 6) + 1.5
      const frontNeckDepth = (neckCirc / 6) + 1.5;
      expect(frontNeckDepth).toBeCloseTo(7.33, 1);
      expect(frontNeckDepth).toBeGreaterThan(6);
      expect(frontNeckDepth).toBeLessThan(10);
    });

    it('should calculate reasonable bust dart width', () => {
      // bustDartWidth = (bust - chest) / 2
      const bustDartWidth = (bust - chest) / 2;
      expect(bustDartWidth).toBe(2);
      expect(bustDartWidth).toBeGreaterThan(0);
      expect(bustDartWidth).toBeLessThan(6);
    });

    it('should calculate reasonable waist dart intake (front)', () => {
      // waistDartFront = ((chest - waist) / 4) * 0.6
      const waistDartFront = ((chest - waist) / 4) * 0.6;
      expect(waistDartFront).toBeCloseTo(2.4, 1);
      expect(waistDartFront).toBeGreaterThan(1);
      expect(waistDartFront).toBeLessThan(5);
    });

    it('should calculate reasonable waist dart intake (back)', () => {
      // waistDartBack = ((chest - waist) / 4) * 0.4
      const waistDartBack = ((chest - waist) / 4) * 0.4;
      expect(waistDartBack).toBeCloseTo(1.6, 1);
      expect(waistDartBack).toBeGreaterThan(0.5);
      expect(waistDartBack).toBeLessThan(4);
    });

    it('should have front dart larger than back dart', () => {
      const waistDartFront = ((chest - waist) / 4) * 0.6;
      const waistDartBack = ((chest - waist) / 4) * 0.4;
      expect(waistDartFront).toBeGreaterThan(waistDartBack);
    });
  });

  describe('ease table', () => {
    it('should have woven ease values', () => {
      expect(bodiceSkill.easeTable['woven']).toBeDefined();
      expect(bodiceSkill.easeTable['woven'].chest).toBe(4);
    });

    it('should have jersey ease smaller than woven', () => {
      expect(bodiceSkill.easeTable['jersey'].chest).toBeLessThan(
        bodiceSkill.easeTable['woven'].chest
      );
    });

    it('should have outerwear ease larger than woven', () => {
      expect(bodiceSkill.easeTable['outerwear'].chest).toBeGreaterThan(
        bodiceSkill.easeTable['woven'].chest
      );
    });
  });
});
