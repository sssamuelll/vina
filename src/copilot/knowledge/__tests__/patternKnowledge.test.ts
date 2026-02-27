/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for patternKnowledge
 */

import { describe, it, expect } from 'vitest';
import {
  EASE_STANDARDS,
  SEAM_ALLOWANCES,
  GRADING_RULES,
  FABRIC_PROPERTIES,
  CONSTRUCTION_TECHNIQUES,
  INDUSTRY_STANDARDS,
  getRecommendedEase,
  getRecommendedSeamAllowance,
  calculateGradedMeasurement,
  getFabricEaseAdjustment,
  queryKnowledge,
} from '../patternKnowledge';

describe('patternKnowledge', () => {
  describe('EASE_STANDARDS', () => {
    it('should have body ease values', () => {
      expect(EASE_STANDARDS.body.bust).toBeDefined();
      expect(EASE_STANDARDS.body.waist).toBeDefined();
      expect(EASE_STANDARDS.body.hip).toBeDefined();
    });

    it('should have garment ease values', () => {
      expect(EASE_STANDARDS.garment.tshirt).toBeDefined();
      expect(EASE_STANDARDS.garment.dress_fitted).toBeDefined();
    });

    it('should have standard fit values', () => {
      expect(EASE_STANDARDS.body.bust.standard).toBe(7.5);
    });
  });

  describe('SEAM_ALLOWANCES', () => {
    it('should have standard seam allowances', () => {
      expect(SEAM_ALLOWANCES.standard.general).toBe(10);
      expect(SEAM_ALLOWANCES.standard.hem).toBe(25);
    });

    it('should have seam type allowances', () => {
      expect(SEAM_ALLOWANCES.byType.french).toBe(12);
      expect(SEAM_ALLOWANCES.byType.flat_felled).toBe(15);
    });
  });

  describe('GRADING_RULES', () => {
    it('should have size increments', () => {
      expect(GRADING_RULES.increments.bust).toBe(4.0);
      expect(GRADING_RULES.increments.waist).toBe(4.0);
    });

    it('should have size ranges', () => {
      expect(GRADING_RULES.sizeRanges.us).toContain('M');
      expect(GRADING_RULES.sizeRanges.eu).toContain('38');
    });
  });

  describe('FABRIC_PROPERTIES', () => {
    it('should have stretch categories', () => {
      expect(FABRIC_PROPERTIES.stretch.none.stretchPercent).toBe(0);
      expect(FABRIC_PROPERTIES.stretch.four_way.stretchPercent).toBe(50);
    });

    it('should have fabric types', () => {
      expect(FABRIC_PROPERTIES.types.cotton_woven).toBeDefined();
      expect(FABRIC_PROPERTIES.types.denim).toBeDefined();
    });
  });

  describe('CONSTRUCTION_TECHNIQUES', () => {
    it('should have dart types', () => {
      expect(CONSTRUCTION_TECHNIQUES.darts.bust).toBeDefined();
      expect(CONSTRUCTION_TECHNIQUES.darts.waist).toBeDefined();
    });

    it('should have seam types', () => {
      expect(CONSTRUCTION_TECHNIQUES.seams.plain).toBeDefined();
      expect(CONSTRUCTION_TECHNIQUES.seams.french).toBeDefined();
    });

    it('should have closure types', () => {
      expect(CONSTRUCTION_TECHNIQUES.closures.zipper_invisible).toBeDefined();
      expect(CONSTRUCTION_TECHNIQUES.closures.buttons).toBeDefined();
    });
  });

  describe('INDUSTRY_STANDARDS', () => {
    it('should have base measurements', () => {
      expect(INDUSTRY_STANDARDS.base_measurements.bust).toBe(88);
      expect(INDUSTRY_STANDARDS.base_measurements.waist).toBe(70);
    });

    it('should have notch standards', () => {
      expect(INDUSTRY_STANDARDS.notches.single).toBe('front');
      expect(INDUSTRY_STANDARDS.notches.double).toBe('back');
    });
  });

  describe('getRecommendedEase', () => {
    it('should return ease for body area', () => {
      expect(getRecommendedEase('bust', 'standard')).toBe(7.5);
      expect(getRecommendedEase('waist', 'fitted')).toBe(2.5);
    });

    it('should return default for unknown area', () => {
      expect(getRecommendedEase('unknown' as any)).toBe(5.0);
    });

    it('should use standard fit by default', () => {
      expect(getRecommendedEase('bust')).toBe(7.5);
    });
  });

  describe('getRecommendedSeamAllowance', () => {
    it('should return seam allowance for application', () => {
      expect(getRecommendedSeamAllowance('general')).toBe(10);
      expect(getRecommendedSeamAllowance('neckline')).toBe(6);
      expect(getRecommendedSeamAllowance('hem')).toBe(25);
    });

    it('should return default for unknown application', () => {
      expect(getRecommendedSeamAllowance('unknown' as any)).toBe(10);
    });

    it('should use general by default', () => {
      expect(getRecommendedSeamAllowance()).toBe(10);
    });
  });

  describe('calculateGradedMeasurement', () => {
    it('should calculate graded measurement', () => {
      // Base size M (let's say index 3), going to L (index 4)
      const result = calculateGradedMeasurement(88, 3, 4, 'bust');
      expect(result).toBe(92); // 88 + 4
    });

    it('should grade down for smaller sizes', () => {
      const result = calculateGradedMeasurement(88, 3, 2, 'bust');
      expect(result).toBe(84); // 88 - 4
    });

    it('should use correct increment for each area', () => {
      const bustResult = calculateGradedMeasurement(88, 0, 1, 'bust');
      const shoulderResult = calculateGradedMeasurement(40, 0, 1, 'shoulder');

      expect(bustResult).toBe(92); // +4
      expect(shoulderResult).toBe(41); // +1
    });
  });

  describe('getFabricEaseAdjustment', () => {
    it('should return ease adjustment for stretch level', () => {
      expect(getFabricEaseAdjustment('none')).toBe(0);
      expect(getFabricEaseAdjustment('medium')).toBe(2.5);
      expect(getFabricEaseAdjustment('four_way')).toBe(7.5);
    });
  });

  describe('queryKnowledge', () => {
    it('should return ease knowledge', () => {
      const result = queryKnowledge({ topic: 'ease' });
      expect(result).toContain('Ease');
      expect(result).toContain('cm');
    });

    it('should return ease for specific garment type', () => {
      const result = queryKnowledge({ topic: 'ease', garmentType: 'tshirt' });
      expect(result).toContain('tshirt');
    });

    it('should return seam allowance knowledge', () => {
      const result = queryKnowledge({ topic: 'seam_allowance' });
      expect(result).toContain('Seam Allowance');
      expect(result).toContain('mm');
    });

    it('should return grading knowledge', () => {
      const result = queryKnowledge({ topic: 'grading' });
      expect(result).toContain('Grading');
      expect(result).toContain('per size');
    });

    it('should return fabric knowledge', () => {
      const result = queryKnowledge({ topic: 'fabric' });
      expect(result).toContain('Fabric');
    });

    it('should return fabric knowledge for specific type', () => {
      const result = queryKnowledge({ topic: 'fabric', fabricType: 'denim' });
      expect(result).toContain('denim');
    });

    it('should return construction knowledge', () => {
      const result = queryKnowledge({ topic: 'construction' });
      expect(result).toContain('Construction');
      expect(result).toContain('Seam types');
    });

    it('should return standards knowledge', () => {
      const result = queryKnowledge({ topic: 'standards' });
      expect(result).toContain('Standards');
      expect(result).toContain('Size M');
    });

    it('should return fallback for unknown topic', () => {
      const result = queryKnowledge({ topic: 'unknown' as any });
      expect(result).toContain('No knowledge');
    });
  });
});
