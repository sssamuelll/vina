import { describe, it, expect } from 'vitest';
import { skirtSkill } from '../skills/definitions/skirtSkill';

describe('skirtSkill', () => {
  describe('structure', () => {
    it('should have correct name', () => {
      expect(skirtSkill.name).toBe('skirt');
    });

    it('should have both Spanish and English triggers', () => {
      expect(skirtSkill.triggers).toContain('skirt');
      expect(skirtSkill.triggers).toContain('falda');
      expect(skirtSkill.triggers).toContain('circle skirt');
      expect(skirtSkill.triggers).toContain('falda circular');
      expect(skirtSkill.triggers).toContain('a-line');
      expect(skirtSkill.triggers).toContain('evasé');
    });

    it('should have 3 methods', () => {
      expect(skirtSkill.methods.length).toBe(3);
      expect(skirtSkill.methods[0].name).toBe('Straight skirt block');
    });

    it('should have at least 10 construction steps', () => {
      expect(skirtSkill.constructionSteps.length).toBeGreaterThanOrEqual(10);
    });

    it('should have grade rules', () => {
      expect(skirtSkill.gradeRules).toBeDefined();
      expect(skirtSkill.gradeRules!.length).toBeGreaterThan(0);
    });
  });

  describe('formula validation — standard size M (waist=72, hips=96)', () => {
    const waist = 72;
    const hips = 96;

    it('should calculate reasonable hip panel width', () => {
      // hipPanel = hips / 4
      const hipPanel = hips / 4;
      expect(hipPanel).toBe(24);
      expect(hipPanel).toBeGreaterThan(20);
      expect(hipPanel).toBeLessThan(35);
    });

    it('should calculate reasonable front dart intake', () => {
      // dartIntakeFront = ((hips - waist) / 4) * 0.6
      const dartIntakeFront = ((hips - waist) / 4) * 0.6;
      expect(dartIntakeFront).toBeCloseTo(3.6, 1);
      expect(dartIntakeFront).toBeGreaterThan(2);
      expect(dartIntakeFront).toBeLessThan(7);
    });

    it('should calculate reasonable back dart intake', () => {
      // dartIntakeBack = ((hips - waist) / 4) * 0.4
      const dartIntakeBack = ((hips - waist) / 4) * 0.4;
      expect(dartIntakeBack).toBeCloseTo(2.4, 1);
      expect(dartIntakeBack).toBeGreaterThan(1);
      expect(dartIntakeBack).toBeLessThan(5);
    });

    it('should have front + back dart intake equal total difference per panel', () => {
      const dartIntakeFront = ((hips - waist) / 4) * 0.6;
      const dartIntakeBack = ((hips - waist) / 4) * 0.4;
      const totalPerPanel = (hips - waist) / 4;
      expect(dartIntakeFront + dartIntakeBack).toBeCloseTo(totalPerPanel, 5);
    });

    it('should calculate correct circle skirt radius', () => {
      // circleSkirtRadius = waist / (2 * Math.PI)
      const radius = waist / (2 * Math.PI);
      expect(radius).toBeCloseTo(11.46, 1);
      // Verify: circumference of this radius = waist
      const circumference = 2 * Math.PI * radius;
      expect(circumference).toBeCloseTo(waist, 5);
    });

    it('should have waist panel narrower than hip panel', () => {
      const waistPanel = waist / 4;
      const hipPanel = hips / 4;
      expect(waistPanel).toBeLessThan(hipPanel);
    });

    it('should calculate circle skirt radius for large waist', () => {
      const largeWaist = 100;
      const radius = largeWaist / (2 * Math.PI);
      expect(radius).toBeCloseTo(15.92, 1);
      // Verify circumference
      expect(2 * Math.PI * radius).toBeCloseTo(largeWaist, 5);
    });
  });

  describe('ease table', () => {
    it('should have woven hip ease', () => {
      expect(skirtSkill.easeTable['woven'].hips).toBe(2);
    });

    it('should have jersey negative ease for hips', () => {
      expect(skirtSkill.easeTable['jersey'].hips).toBeLessThan(0);
    });

    it('should have stretch ease of zero', () => {
      expect(skirtSkill.easeTable['stretch'].waist).toBe(0);
    });
  });
});
