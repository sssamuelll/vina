import { describe, it, expect } from 'vitest';
import { detectFormulaDelta, createSkillOverride, detectMultipleDeltas, PreferenceLearner, type OverrideCreationInput, type PieceFormulaComparison } from '../preferenceLearner';

describe('Preference Learner - Formula Delta Detection', () => {
  it('should detect no delta when values match', () => {
    const delta = detectFormulaDelta({
      formulaName: 'backWidth',
      expectedValue: 100,
      actualValue: 100,
      tolerance: 2,
    });

    expect(delta).toBeNull();
  });

  it('should detect no delta within tolerance', () => {
    const delta = detectFormulaDelta({
      formulaName: 'backWidth',
      expectedValue: 100,
      actualValue: 101.5,
      tolerance: 2,
    });

    expect(delta).toBeNull();
  });

  it('should detect delta when value exceeds tolerance', () => {
    const delta = detectFormulaDelta({
      formulaName: 'backWidth',
      expectedValue: 100,
      actualValue: 105,
      tolerance: 2,
    });

    expect(delta).not.toBeNull();
    expect(delta?.formulaName).toBe('backWidth');
    expect(delta?.expectedValue).toBe(100);
    expect(delta?.actualValue).toBe(105);
    expect(delta?.difference).toBe(5);
    expect(delta?.percentageDiff).toBe(5); // 5% increase
  });

  it('should detect negative delta', () => {
    const delta = detectFormulaDelta({
      formulaName: 'armholeDepth',
      expectedValue: 50,
      actualValue: 45,
      tolerance: 2,
    });

    expect(delta).not.toBeNull();
    expect(delta?.difference).toBe(-5);
  });

  it('should use default tolerance of 2mm', () => {
    const delta = detectFormulaDelta({
      formulaName: 'test',
      expectedValue: 100,
      actualValue: 101,
    });

    expect(delta).toBeNull(); // Within default 2mm tolerance
  });

  it('should return null at exact boundary (actualValue = expectedValue + tolerance)', () => {
    const delta = detectFormulaDelta({
      formulaName: 'boundaryTest',
      expectedValue: 100,
      actualValue: 102,
      tolerance: 2,
    });

    expect(delta).toBeNull(); // At exact boundary, within tolerance
  });

  it('should handle expectedValue of 0 and return percentageDiff of 0', () => {
    const delta = detectFormulaDelta({
      formulaName: 'zeroExpected',
      expectedValue: 0,
      actualValue: 5,
      tolerance: 2,
    });

    expect(delta).not.toBeNull();
    expect(delta?.expectedValue).toBe(0);
    expect(delta?.actualValue).toBe(5);
    expect(delta?.difference).toBe(5);
    // percentageDiff is 0 when expectedValue is 0 to avoid Infinity/NaN
    expect(delta?.percentageDiff).toBe(0);
  });
});

describe('Preference Learner - SkillOverride Creation', () => {
  it('should create a SkillOverride from delta', () => {
    const input: OverrideCreationInput = {
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest / 4) + 1',
      delta: {
        formulaName: 'backWidth',
        expectedValue: 100,
        actualValue: 105,
        difference: 5,
        percentageDiff: 5,
      },
      reason: 'User prefers wider back',
    };

    const override = createSkillOverride(input);

    expect(override.skillId).toBe('core:bodice');
    expect(override.formulaName).toBe('backWidth');
    expect(override.originalValue).toBe('(chest / 4) + 1');
    expect(override.overrideValue).toBe('(chest / 4) + 1 + 5'); // Adds difference
    expect(override.reason).toBe('User prefers wider back');
    expect(override.id).toContain('override-');
    expect(override.createdAt).toBeGreaterThan(0);
  });

  it('should handle negative delta in override expression', () => {
    const input: OverrideCreationInput = {
      skillId: 'core:bodice',
      formulaName: 'armholeDepth',
      originalExpression: '(height * 0.12) + 5',
      delta: {
        formulaName: 'armholeDepth',
        expectedValue: 50,
        actualValue: 45,
        difference: -5,
        percentageDiff: -10,
      },
    };

    const override = createSkillOverride(input);

    expect(override.overrideValue).toBe('(height * 0.12) + 5 - 5');
  });

  it('should generate default reason if not provided', () => {
    const input: OverrideCreationInput = {
      skillId: 'core:sleeve',
      formulaName: 'sleeveLength',
      originalExpression: 'arm_length - 2',
      delta: {
        formulaName: 'sleeveLength',
        expectedValue: 60,
        actualValue: 63,
        difference: 3,
        percentageDiff: 5,
      },
    };

    const override = createSkillOverride(input);

    expect(override.reason).toContain('adjusted by');
    expect(override.reason).toContain('3');
  });
});

describe('Preference Learner - Batch Detection', () => {
  it('should detect deltas across multiple formulas', () => {
    const comparison: PieceFormulaComparison = {
      pieceId: 'front-bodice',
      skillId: 'core:bodice',
      formulas: [
        { name: 'backWidth', expression: '(chest/4)+1', expectedValue: 100, actualValue: 100 },
        { name: 'frontWidth', expression: '(chest/4)+2', expectedValue: 101, actualValue: 108 },
        { name: 'armholeDepth', expression: 'height*0.12', expectedValue: 50, actualValue: 45 },
      ],
    };

    const deltas = detectMultipleDeltas(comparison);

    expect(deltas).toHaveLength(2); // backWidth within tolerance
    expect(deltas[0].formulaName).toBe('frontWidth');
    expect(deltas[1].formulaName).toBe('armholeDepth');
  });

  it('should return empty array when all within tolerance', () => {
    const comparison: PieceFormulaComparison = {
      pieceId: 'sleeve',
      skillId: 'core:sleeve',
      formulas: [
        { name: 'length', expression: 'arm_length', expectedValue: 60, actualValue: 61 },
        { name: 'width', expression: 'arm_circ', expectedValue: 30, actualValue: 30.5 },
      ],
    };

    const deltas = detectMultipleDeltas(comparison);

    expect(deltas).toHaveLength(0);
  });

  it('should use custom tolerance', () => {
    const comparison: PieceFormulaComparison = {
      pieceId: 'test',
      skillId: 'core:test',
      formulas: [
        { name: 'test', expression: 'x', expectedValue: 100, actualValue: 103 },
      ],
      tolerance: 5, // Higher tolerance
    };

    const deltas = detectMultipleDeltas(comparison);

    expect(deltas).toHaveLength(0); // 3mm within 5mm tolerance
  });
});

describe('PreferenceLearner - Aggregation', () => {
  it('should aggregate overrides by skill and formula', () => {
    const learner = new PreferenceLearner();

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest/4)+1',
      delta: { formulaName: 'backWidth', expectedValue: 100, actualValue: 105, difference: 5, percentageDiff: 5 },
    });

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest/4)+1',
      delta: { formulaName: 'backWidth', expectedValue: 100, actualValue: 106, difference: 6, percentageDiff: 6 },
    });

    const overrides = learner.getOverrides();
    expect(overrides).toHaveLength(1); // Same skill+formula, should be single entry
    expect(overrides[0].overrideValue).toContain('6'); // Latest value
  });

  it('should track different formulas separately', () => {
    const learner = new PreferenceLearner();

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest/4)+1',
      delta: { formulaName: 'backWidth', expectedValue: 100, actualValue: 105, difference: 5, percentageDiff: 5 },
    });

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'armholeDepth',
      originalExpression: 'height*0.12',
      delta: { formulaName: 'armholeDepth', expectedValue: 50, actualValue: 55, difference: 5, percentageDiff: 10 },
    });

    const overrides = learner.getOverrides();
    expect(overrides).toHaveLength(2);
  });

  it('should get overrides for specific skill', () => {
    const learner = new PreferenceLearner();

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest/4)+1',
      delta: { formulaName: 'backWidth', expectedValue: 100, actualValue: 105, difference: 5, percentageDiff: 5 },
    });

    learner.recordOverride({
      skillId: 'core:sleeve',
      formulaName: 'length',
      originalExpression: 'arm_length',
      delta: { formulaName: 'length', expectedValue: 60, actualValue: 63, difference: 3, percentageDiff: 5 },
    });

    const bodiceOverrides = learner.getOverridesForSkill('core:bodice');
    expect(bodiceOverrides).toHaveLength(1);
    expect(bodiceOverrides[0].formulaName).toBe('backWidth');
  });

  it('should clear all overrides', () => {
    const learner = new PreferenceLearner();

    learner.recordOverride({
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalExpression: '(chest/4)+1',
      delta: { formulaName: 'backWidth', expectedValue: 100, actualValue: 105, difference: 5, percentageDiff: 5 },
    });

    learner.clear();

    expect(learner.getOverrides()).toHaveLength(0);
  });
});
