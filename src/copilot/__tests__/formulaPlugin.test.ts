import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerFormula,
  unregisterPluginFormulas,
  getCustomFormula,
  listCustomFormulas,
  listPluginFormulas,
  evaluateCustomFormula,
  validateCustomFormula,
  resetCustomFormulas,
} from '../plugins/formulaPlugin';

describe('Formula Plugin', () => {
  beforeEach(() => {
    resetCustomFormulas();
  });

  describe('validateCustomFormula', () => {
    it('should validate a correct formula', () => {
      const result = validateCustomFormula('testFormula', 'chest / 4 + ease', ['chest', 'ease']);
      expect(result.valid).toBe(true);
      expect(result.testResult).toBeDefined();
      expect(result.testResult).toBeCloseTo(62.5); // 50/4 + 50
    });

    it('should reject empty name', () => {
      const result = validateCustomFormula('', 'chest / 4', ['chest']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject empty expression', () => {
      const result = validateCustomFormula('test', '', ['chest']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expression');
    });

    it('should reject undeclared variables', () => {
      const result = validateCustomFormula('test', 'chest + waist', ['chest']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('waist');
    });

    it('should accept formulas with math functions', () => {
      const result = validateCustomFormula('test', 'max(chest, waist) + 2', ['chest', 'waist']);
      expect(result.valid).toBe(true);
    });

    it('should reject formulas that fail evaluation', () => {
      const result = validateCustomFormula('test', '/', ['x']);
      expect(result.valid).toBe(false);
    });
  });

  describe('registerFormula', () => {
    it('should register a valid formula', () => {
      const result = registerFormula('com.test.p1', 'bodyWidth', 'chest / 4', ['chest'], 'Body width calc');
      expect(result.valid).toBe(true);
      expect(getCustomFormula('com.test.p1.bodyWidth')).toBeDefined();
    });

    it('should namespace formula name', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4', ['chest']);
      expect(getCustomFormula('com.test.p1.width')).toBeDefined();
      expect(getCustomFormula('width')).toBeUndefined();
    });

    it('should reject duplicate formula names', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4', ['chest']);
      const result = registerFormula('com.test.p1', 'width', 'chest / 2', ['chest']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should reject invalid formulas', () => {
      const result = registerFormula('com.test.p1', '', 'chest / 4', ['chest']);
      expect(result.valid).toBe(false);
    });
  });

  describe('unregisterPluginFormulas', () => {
    it('should remove all formulas from a plugin', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      registerFormula('com.test.p1', 'f2', 'x + 2', ['x']);
      registerFormula('com.test.p2', 'f3', 'x + 3', ['x']);

      const removed = unregisterPluginFormulas('com.test.p1');
      expect(removed).toBe(2);
      expect(listCustomFormulas()).toHaveLength(1);
      expect(getCustomFormula('com.test.p2.f3')).toBeDefined();
    });

    it('should return 0 when no formulas from plugin', () => {
      const removed = unregisterPluginFormulas('nonexistent');
      expect(removed).toBe(0);
    });
  });

  describe('listCustomFormulas / listPluginFormulas', () => {
    it('should list all formulas', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      registerFormula('com.test.p2', 'f2', 'y + 2', ['y']);
      expect(listCustomFormulas()).toHaveLength(2);
    });

    it('should list formulas for a specific plugin', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      registerFormula('com.test.p1', 'f2', 'x + 2', ['x']);
      registerFormula('com.test.p2', 'f3', 'y + 1', ['y']);
      expect(listPluginFormulas('com.test.p1')).toHaveLength(2);
      expect(listPluginFormulas('com.test.p2')).toHaveLength(1);
    });
  });

  describe('evaluateCustomFormula', () => {
    it('should evaluate with provided variables', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4 + ease', ['chest', 'ease']);
      const result = evaluateCustomFormula('com.test.p1.width', { chest: 88, ease: 2 });
      expect(result.value).toBeCloseTo(24);
      expect(result.error).toBeUndefined();
    });

    it('should error on unknown formula', () => {
      const result = evaluateCustomFormula('nonexistent.formula', {});
      expect(result.error).toContain('Unknown formula');
    });

    it('should error on missing variables', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4', ['chest']);
      const result = evaluateCustomFormula('com.test.p1.width', {});
      expect(result.error).toContain('Missing variable');
    });
  });
});
