import { describe, it, expect } from 'vitest';
import { evaluateFormula, getFormulaVariables, validateFormula } from '../utils/formula';

describe('Formula Engine', () => {
  it('simple arithmetic: "2 + 3" → 5', () => {
    expect(evaluateFormula('2 + 3', { variables: {} }).value).toBe(5);
  });

  it('variable substitution: "chest / 4 + 2"', () => {
    const r = evaluateFormula('chest / 4 + 2', { variables: { chest: 88 } });
    expect(r.value).toBe(24);
  });

  it('multiple variables: "chest / 4 + waist / 2"', () => {
    const r = evaluateFormula('chest / 4 + waist / 2', { variables: { chest: 88, waist: 72 } });
    expect(r.value).toBe(58);
  });

  it('functions: "max(chest, waist)" → chest', () => {
    const r = evaluateFormula('max(chest, waist)', { variables: { chest: 88, waist: 72 } });
    expect(r.value).toBe(88);
  });

  it('nested: "round(chest / 4 + 0.5)"', () => {
    const r = evaluateFormula('round(chest / 4 + 0.5)', { variables: { chest: 88 } });
    expect(r.value).toBe(23);
  });

  it('PI constant: "PI * 2"', () => {
    const r = evaluateFormula('PI * 2', { variables: {} });
    expect(r.value).toBeCloseTo(6.283185, 4);
  });

  it('invalid formula: "chest +" → error', () => {
    const r = evaluateFormula('chest +', { variables: { chest: 88 } });
    expect(r.error).toBeDefined();
  });

  it('unknown variable: "unknown + 1" → error', () => {
    const r = evaluateFormula('unknown + 1', { variables: {} });
    expect(r.error).toContain('Unknown variable');
  });

  it('getFormulaVariables extracts variable names', () => {
    const vars = getFormulaVariables('chest / 4 + max(waist, hips)');
    expect(vars).toContain('chest');
    expect(vars).toContain('waist');
    expect(vars).toContain('hips');
    expect(vars).not.toContain('max');
  });

  it('validateFormula checks syntax', () => {
    const valid = validateFormula('chest / 4', { variables: { chest: 88 } });
    expect(valid.valid).toBe(true);
    const invalid = validateFormula('chest +', { variables: { chest: 88 } });
    expect(invalid.valid).toBe(false);
  });
});
