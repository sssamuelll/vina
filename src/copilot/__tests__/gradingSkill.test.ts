import { describe, it, expect } from 'vitest';
import { gradingSkill } from '../action/skills/definitions/gradingSkill';

describe('gradingSkill', () => {
  describe('structure', () => {
    it('should have correct name', () => {
      expect(gradingSkill.name).toBe('grading');
    });

    it('should have both Spanish and English triggers', () => {
      expect(gradingSkill.triggers).toContain('grading');
      expect(gradingSkill.triggers).toContain('gradación');
      expect(gradingSkill.triggers).toContain('escalar');
      expect(gradingSkill.triggers).toContain('tallas');
      expect(gradingSkill.triggers).toContain('size range');
      expect(gradingSkill.triggers).toContain('tabla de tallas');
    });

    it('should have 4 sizing standards', () => {
      expect(gradingSkill.methods.length).toBe(4);
      const names = gradingSkill.methods.map(m => m.name);
      expect(names).toContain('EU Women (34-48)');
      expect(names).toContain('EU Men (44-56)');
      expect(names).toContain('US Women (0-16)');
      expect(names).toContain('UK Women (6-20)');
    });

    it('should have grade rules', () => {
      expect(gradingSkill.gradeRules).toBeDefined();
      expect(gradingSkill.gradeRules!.length).toBeGreaterThan(10);
    });
  });

  describe('EU women size table validation', () => {
    const sizeTable = gradingSkill.easeTable;

    it('should have EU women sizes 34 through 48', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (const size of sizes) {
        expect(sizeTable[`EU-women-${size}`]).toBeDefined();
      }
    });

    it('should have 2cm bust increment between consecutive sizes', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (let i = 1; i < sizes.length; i++) {
        const prev = sizeTable[`EU-women-${sizes[i - 1]}`];
        const curr = sizeTable[`EU-women-${sizes[i]}`];
        const increment = curr.chest - prev.chest;
        expect(increment).toBeCloseTo(4, 0); // 4cm circumference = 2cm per half
      }
    });

    it('should have 2cm waist increment between consecutive sizes (tolerance)', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (let i = 1; i < sizes.length; i++) {
        const prev = sizeTable[`EU-women-${sizes[i - 1]}`];
        const curr = sizeTable[`EU-women-${sizes[i]}`];
        const increment = curr.waist - prev.waist;
        expect(increment).toBeCloseTo(4, 0); // 4cm circumference
      }
    });

    it('should have 2cm hip increment between consecutive sizes', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (let i = 1; i < sizes.length; i++) {
        const prev = sizeTable[`EU-women-${sizes[i - 1]}`];
        const curr = sizeTable[`EU-women-${sizes[i]}`];
        const increment = curr.hips - prev.hips;
        expect(increment).toBeCloseTo(4, 0); // 4cm circumference
      }
    });

    it('should have bust > waist for all sizes', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (const size of sizes) {
        const data = sizeTable[`EU-women-${size}`];
        expect(data.chest).toBeGreaterThan(data.waist);
      }
    });

    it('should have hips > waist for all sizes', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (const size of sizes) {
        const data = sizeTable[`EU-women-${size}`];
        expect(data.hips).toBeGreaterThan(data.waist);
      }
    });

    it('should have size 38 matching standard M measurements', () => {
      const m = sizeTable['EU-women-38'];
      expect(m.chest).toBe(88);
      expect(m.waist).toBe(72);
      expect(m.hips).toBe(96);
    });

    it('should have shoulder increment of ~0.3cm per size', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (let i = 1; i < sizes.length; i++) {
        const prev = sizeTable[`EU-women-${sizes[i - 1]}`];
        const curr = sizeTable[`EU-women-${sizes[i]}`];
        const increment = curr.shoulder - prev.shoulder;
        expect(increment).toBeCloseTo(0.3, 1);
      }
    });

    it('should have back length increment of 0.5cm per size', () => {
      const sizes = [34, 36, 38, 40, 42, 44, 46, 48];
      for (let i = 1; i < sizes.length; i++) {
        const prev = sizeTable[`EU-women-${sizes[i - 1]}`];
        const curr = sizeTable[`EU-women-${sizes[i]}`];
        const increment = curr.neckToWaistBack - prev.neckToWaistBack;
        expect(increment).toBeCloseTo(0.5, 1);
      }
    });
  });

  describe('grade rules consistency', () => {
    it('should have rules for bust, waist, and hip points', () => {
      const rules = gradingSkill.gradeRules!;
      const measurements = rules.map(r => r.measurement);
      expect(measurements).toContain('chest');
      expect(measurements).toContain('waist');
      expect(measurements).toContain('hips');
    });

    it('should have rules for shoulder and neck', () => {
      const rules = gradingSkill.gradeRules!;
      const measurements = rules.map(r => r.measurement);
      expect(measurements).toContain('shoulder');
      expect(measurements).toContain('neckCirc');
    });

    it('should have rules for arm length', () => {
      const rules = gradingSkill.gradeRules!;
      const measurements = rules.map(r => r.measurement);
      expect(measurements).toContain('armLength');
    });

    it('should have all grade rules with numeric deltas', () => {
      const rules = gradingSkill.gradeRules!;
      for (const rule of rules) {
        expect(typeof rule.deltaX).toBe('number');
        expect(typeof rule.deltaY).toBe('number');
        expect(isFinite(rule.deltaX)).toBe(true);
        expect(isFinite(rule.deltaY)).toBe(true);
      }
    });

    it('should have side-bust point shift primarily in X', () => {
      const rules = gradingSkill.gradeRules!;
      const sideBust = rules.find(r => r.point === 'side-bust');
      expect(sideBust).toBeDefined();
      expect(Math.abs(sideBust!.deltaX)).toBeGreaterThan(Math.abs(sideBust!.deltaY));
    });

    it('should have center-back-hem shift primarily in Y', () => {
      const rules = gradingSkill.gradeRules!;
      const centerHem = rules.find(r => r.point === 'center-back-hem');
      expect(centerHem).toBeDefined();
      expect(Math.abs(centerHem!.deltaY)).toBeGreaterThan(Math.abs(centerHem!.deltaX));
    });
  });
});
