/**
 * Extended edge-case tests for formulaPlugin.
 *
 * Covers: NaN/Infinity inputs, unregister and re-register, listPluginFormulas
 * for nonexistent plugin, validateCustomFormula with non-array variables,
 * evaluate edge cases.
 */
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

describe('Formula Plugin — edge cases', () => {
  beforeEach(() => {
    resetCustomFormulas();
  });

  describe('validateCustomFormula — edge cases', () => {
    it('should reject non-array variables', () => {
      const result = validateCustomFormula('test', 'x + 1', 'not-array' as unknown as string[]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Variables must be an array');
    });

    it('should accept formula with no variables (constant)', () => {
      const result = validateCustomFormula('constant', '42 + 8', []);
      expect(result.valid).toBe(true);
      expect(result.testResult).toBeCloseTo(50);
    });

    it('should reject whitespace-only name', () => {
      const result = validateCustomFormula('   ', 'x + 1', ['x']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject whitespace-only expression', () => {
      const result = validateCustomFormula('test', '   ', ['x']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expression');
    });

    it('should accept formulas with built-in functions', () => {
      const result = validateCustomFormula('test', 'sqrt(x) + abs(y)', ['x', 'y']);
      expect(result.valid).toBe(true);
    });

    it('should accept formula using PI constant', () => {
      const result = validateCustomFormula('circle', 'PI * r * r', ['r']);
      expect(result.valid).toBe(true);
      expect(result.testResult).toBeCloseTo(Math.PI * 50 * 50);
    });

    it('should handle formula with extra declared variables not in expression', () => {
      // Extra declared variables that are not referenced should still work
      const result = validateCustomFormula('test', 'x + 1', ['x', 'unused']);
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate with NaN/Infinity inputs', () => {
    it('should handle NaN variable value gracefully', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      const result = evaluateCustomFormula('com.test.p1.f1', { x: NaN });
      // NaN + 1 = NaN → formula engine should report invalid number
      expect(result.error).toBeDefined();
    });

    it('should handle Infinity variable value gracefully', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      const result = evaluateCustomFormula('com.test.p1.f1', { x: Infinity });
      // Infinity + 1 = Infinity → should report invalid number
      expect(result.error).toBeDefined();
    });

    it('should handle negative Infinity gracefully', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      const result = evaluateCustomFormula('com.test.p1.f1', { x: -Infinity });
      expect(result.error).toBeDefined();
    });
  });

  describe('division by zero', () => {
    it('should detect division by zero result', () => {
      registerFormula('com.test.p1', 'div', 'x / y', ['x', 'y']);
      const result = evaluateCustomFormula('com.test.p1.div', { x: 1, y: 0 });
      // 1/0 = Infinity → formula engine rejects non-finite
      expect(result.error).toBeDefined();
    });
  });

  describe('unregister and re-register', () => {
    it('should allow re-registering a formula after unregistering its plugin', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4', ['chest']);
      expect(getCustomFormula('com.test.p1.width')).toBeDefined();

      unregisterPluginFormulas('com.test.p1');
      expect(getCustomFormula('com.test.p1.width')).toBeUndefined();

      // Re-register
      const result = registerFormula('com.test.p1', 'width', 'chest / 4', ['chest'], 'Re-registered');
      expect(result.valid).toBe(true);
      expect(getCustomFormula('com.test.p1.width')).toBeDefined();
      expect(getCustomFormula('com.test.p1.width')!.description).toBe('Re-registered');
    });

    it('should not affect formulas from other plugins when unregistering', () => {
      registerFormula('com.test.p1', 'f1', 'x + 1', ['x']);
      registerFormula('com.test.p2', 'f2', 'y + 2', ['y']);

      unregisterPluginFormulas('com.test.p1');
      expect(getCustomFormula('com.test.p1.f1')).toBeUndefined();
      expect(getCustomFormula('com.test.p2.f2')).toBeDefined();
    });
  });

  describe('listPluginFormulas for nonexistent plugin', () => {
    it('should return empty array', () => {
      expect(listPluginFormulas('nonexistent')).toEqual([]);
    });
  });

  describe('evaluateCustomFormula — comprehensive', () => {
    it('should evaluate complex multi-variable formula', () => {
      registerFormula(
        'com.test.p1',
        'armscye',
        'chest / 4 + shoulder / 2 + ease',
        ['chest', 'shoulder', 'ease'],
        'Armscye calculation',
      );
      const result = evaluateCustomFormula('com.test.p1.armscye', {
        chest: 88,
        shoulder: 40,
        ease: 2,
      });
      expect(result.value).toBeCloseTo(88 / 4 + 40 / 2 + 2);
      expect(result.error).toBeUndefined();
    });

    it('should error when providing wrong variable names', () => {
      registerFormula('com.test.p1', 'width', 'chest / 4', ['chest']);
      const result = evaluateCustomFormula('com.test.p1.width', { waist: 70 });
      expect(result.error).toContain('Missing variable');
      expect(result.error).toContain('chest');
    });

    it('should evaluate with zero variable values', () => {
      registerFormula('com.test.p1', 'calc', 'x + y', ['x', 'y']);
      const result = evaluateCustomFormula('com.test.p1.calc', { x: 0, y: 0 });
      expect(result.value).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should evaluate with negative variable values', () => {
      registerFormula('com.test.p1', 'diff', 'x - y', ['x', 'y']);
      const result = evaluateCustomFormula('com.test.p1.diff', { x: -5, y: 3 });
      expect(result.value).toBeCloseTo(-8);
    });
  });

  describe('registerFormula — description defaults', () => {
    it('should default description to empty string', () => {
      registerFormula('com.test.p1', 'noDesc', 'x + 1', ['x']);
      const formula = getCustomFormula('com.test.p1.noDesc');
      expect(formula).toBeDefined();
      expect(formula!.description).toBe('');
    });
  });

  describe('multiple formulas from multiple plugins', () => {
    it('should correctly track formulas across plugins', () => {
      registerFormula('com.p1', 'f1', 'a + 1', ['a']);
      registerFormula('com.p1', 'f2', 'a + 2', ['a']);
      registerFormula('com.p2', 'f1', 'b + 1', ['b']);
      registerFormula('com.p3', 'f1', 'c + 1', ['c']);

      expect(listCustomFormulas()).toHaveLength(4);
      expect(listPluginFormulas('com.p1')).toHaveLength(2);
      expect(listPluginFormulas('com.p2')).toHaveLength(1);
      expect(listPluginFormulas('com.p3')).toHaveLength(1);

      // Same formula name from different plugins — no conflict due to namespacing
      expect(getCustomFormula('com.p1.f1')).toBeDefined();
      expect(getCustomFormula('com.p2.f1')).toBeDefined();
      expect(getCustomFormula('com.p3.f1')).toBeDefined();
    });
  });

  describe('resetCustomFormulas', () => {
    it('should clear all formulas', () => {
      registerFormula('com.p1', 'f1', 'x + 1', ['x']);
      registerFormula('com.p2', 'f2', 'y + 1', ['y']);
      expect(listCustomFormulas()).toHaveLength(2);

      resetCustomFormulas();
      expect(listCustomFormulas()).toHaveLength(0);
    });
  });
});
