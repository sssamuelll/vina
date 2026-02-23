import { describe, it, expect } from 'vitest';
import { evaluateFormula, resolveVariables, type FormulaContext } from '../formulaEvaluator';

describe('evaluateFormula', () => {
  const baseContext: FormulaContext = {
    measurements: { bust_circ: 92, waist_circ: 74, hip_circ: 98, height: 168 },
    variables: {},
  };

  it('evaluates simple arithmetic with measurement', () => {
    expect(evaluateFormula('bust_circ/10+12', baseContext)).toBeCloseTo(21.2);
  });

  it('evaluates plain numbers', () => {
    expect(evaluateFormula('42', baseContext)).toBe(42);
    expect(evaluateFormula('3.14', baseContext)).toBeCloseTo(3.14);
  });

  it('evaluates compound arithmetic', () => {
    expect(evaluateFormula('(bust_circ/10+12)+5', baseContext)).toBeCloseTo(26.2);
  });

  it('evaluates ternary expressions', () => {
    // bust_circ=92 < 100, so takes first branch: 92/5-1 = 17.4, +3 = 20.4
    const result = evaluateFormula(
      '(bust_circ < 100 ? bust_circ/5-1 : bust_circ/10+10.5)+3',
      baseContext,
    );
    expect(result).toBeCloseTo(20.4);
  });

  it('evaluates ternary with false branch', () => {
    const ctx: FormulaContext = {
      measurements: { bust_circ: 120 },
      variables: {},
    };
    // 120 < 100 is false, so: 120/10+10.5 = 22.5, +3 = 25.5
    const result = evaluateFormula(
      '(bust_circ < 100 ? bust_circ/5-1 : bust_circ/10+10.5)+3',
      ctx,
    );
    expect(result).toBeCloseTo(25.5);
  });

  it('resolves #Variable references', () => {
    const ctx: FormulaContext = {
      measurements: {},
      variables: { '#BackWidth': 20.4 },
    };
    expect(evaluateFormula('#BackWidth + 5', ctx)).toBeCloseTo(25.4);
  });

  it('throws on unknown variables', () => {
    expect(() => evaluateFormula('#Unknown', baseContext)).toThrow('Unknown variable');
  });

  it('handles nested ternary from real patterns', () => {
    const ctx: FormulaContext = {
      measurements: { bust_circ: 92 },
      variables: {},
    };
    // #SD formula: CG/10+(CG<116?11:10.5)
    const result = evaluateFormula('bust_circ/10+(bust_circ<116?11:10.5)', ctx);
    expect(result).toBeCloseTo(20.2);
  });
});

describe('resolveVariables', () => {
  it('resolves variables in dependency order', () => {
    const variables = {
      '#A': { formula: '10' },
      '#B': { formula: '#A + 5' },
      '#C': { formula: '#A + #B' },
    };
    const result = resolveVariables(variables, {});
    expect(result['#A']).toBe(10);
    expect(result['#B']).toBe(15);
    expect(result['#C']).toBe(25);
  });

  it('resolves variables referencing measurements', () => {
    const variables = {
      '#SD': { formula: 'bust_circ/10+11' },
      '#BWL': { formula: 'height/4-1' },
      '#HD': { formula: '#SD+#BWL' },
    };
    const result = resolveVariables(variables, { bust_circ: 92, height: 168 });
    expect(result['#SD']).toBeCloseTo(20.2);
    expect(result['#BWL']).toBe(41);
    expect(result['#HD']).toBeCloseTo(61.2);
  });

  it('handles cycles gracefully', () => {
    const variables = {
      '#X': { formula: '#Y + 1' },
      '#Y': { formula: '#X + 1' },
    };
    // Should not throw
    const result = resolveVariables(variables, {});
    expect(typeof result['#X']).toBe('number');
    expect(typeof result['#Y']).toBe('number');
  });
});
