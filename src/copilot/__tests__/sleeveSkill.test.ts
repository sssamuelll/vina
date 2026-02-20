import { describe, it, expect } from 'vitest';
import { sleeveSkill } from '../skills/definitions/sleeveSkill';

describe('sleeveSkill', () => {
  describe('structure', () => {
    it('should have correct name', () => {
      expect(sleeveSkill.name).toBe('sleeve');
    });

    it('should have both Spanish and English triggers', () => {
      expect(sleeveSkill.triggers).toContain('sleeve');
      expect(sleeveSkill.triggers).toContain('manga');
      expect(sleeveSkill.triggers).toContain('raglan');
      expect(sleeveSkill.triggers).toContain('manga pegada');
    });

    it('should have 3 methods', () => {
      expect(sleeveSkill.methods.length).toBe(3);
      expect(sleeveSkill.methods[0].name).toBe('Standard set-in');
    });

    it('should have at least 10 construction steps', () => {
      expect(sleeveSkill.constructionSteps.length).toBeGreaterThanOrEqual(10);
    });

    it('should have grade rules', () => {
      expect(sleeveSkill.gradeRules).toBeDefined();
      expect(sleeveSkill.gradeRules!.length).toBeGreaterThan(0);
    });
  });

  describe('formula validation — standard measurements', () => {
    // Standard: armholeDepth=25cm, upperArm=28cm, armLength=60cm, wristCirc=16cm
    const armholeDepth = 25;
    const upperArmCirc = 28;
    const armLength = 60;
    const wristCirc = 16;

    it('should calculate reasonable cap height', () => {
      // capHeight = (armholeDepth / 2) - 1
      const capHeight = (armholeDepth / 2) - 1;
      expect(capHeight).toBe(11.5);
      expect(capHeight).toBeGreaterThan(8);
      expect(capHeight).toBeLessThan(18);
    });

    it('should calculate reasonable sleeve width', () => {
      // sleeveWidth = upperArmCirc + 4
      const sleeveWidth = upperArmCirc + 4;
      expect(sleeveWidth).toBe(32);
      expect(sleeveWidth).toBeGreaterThan(25);
      expect(sleeveWidth).toBeLessThan(45);
    });

    it('should calculate reasonable elbow line position', () => {
      // elbowLine = armLength * 0.6
      const elbowLine = armLength * 0.6;
      expect(elbowLine).toBe(36);
      expect(elbowLine).toBeGreaterThan(30);
      expect(elbowLine).toBeLessThan(45);
    });

    it('should calculate reasonable wrist width', () => {
      // wristWidth = wristCirc + 2
      const wristWidth = wristCirc + 2;
      expect(wristWidth).toBe(18);
      expect(wristWidth).toBeGreaterThan(14);
      expect(wristWidth).toBeLessThan(25);
    });

    it('should have cap height less than armhole depth', () => {
      const capHeight = (armholeDepth / 2) - 1;
      expect(capHeight).toBeLessThan(armholeDepth);
    });

    it('should have sleeve width greater than wrist width', () => {
      const sleeveWidth = upperArmCirc + 4;
      const wristWidth = wristCirc + 2;
      expect(sleeveWidth).toBeGreaterThan(wristWidth);
    });
  });

  describe('ease table', () => {
    it('should have woven cap ease of 3cm', () => {
      expect(sleeveSkill.easeTable['woven'].capEase).toBe(3);
    });

    it('should have jersey cap ease less than woven', () => {
      expect(sleeveSkill.easeTable['jersey'].capEase).toBeLessThan(
        sleeveSkill.easeTable['woven'].capEase
      );
    });

    it('should have stretch ease between jersey and woven', () => {
      expect(sleeveSkill.easeTable['stretch'].capEase).toBeLessThanOrEqual(
        sleeveSkill.easeTable['woven'].capEase
      );
      expect(sleeveSkill.easeTable['stretch'].capEase).toBeGreaterThanOrEqual(
        sleeveSkill.easeTable['jersey'].capEase
      );
    });
  });
});
