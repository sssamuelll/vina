import { describe, it, expect } from 'vitest';
import { detectFormulaDelta } from '../preferenceLearner';

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
