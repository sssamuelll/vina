/**
 * Preference Learner — Detects and learns user formula preferences.
 *
 * Responsibilities:
 * - Detect deltas between expected (formula) and actual (user-edited) values
 * - Create SkillOverride objects for learned preferences
 * - Merge preferences into LLM context
 *
 * @module copilot/vision/preferenceLearner
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default tolerance for formula deviation detection (in mm) */
export const DEFAULT_TOLERANCE_MM = 2;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Input for detecting a formula delta.
 */
export interface FormulaComparisonInput {
  /** Name of the formula being compared */
  formulaName: string;
  /** Value calculated from the original formula */
  expectedValue: number;
  /** Value from user-edited geometry */
  actualValue: number;
  /** Tolerance in mm (default: 2mm) */
  tolerance?: number;
}

/**
 * A detected deviation between formula and actual value.
 */
export interface FormulaDelta {
  /** Name of the formula */
  formulaName: string;
  /** Expected value from formula */
  expectedValue: number;
  /** Actual value from user edit */
  actualValue: number;
  /** Difference (actual - expected) */
  difference: number;
  /** Percentage difference */
  percentageDiff: number;
}

// ─── Delta Detection ────────────────────────────────────────────────────────

/**
 * Detect if a formula value has deviated beyond tolerance.
 * Returns null if within tolerance, FormulaDelta if exceeded.
 */
export function detectFormulaDelta(input: FormulaComparisonInput): FormulaDelta | null {
  const { formulaName, expectedValue, actualValue, tolerance = DEFAULT_TOLERANCE_MM } = input;

  const difference = actualValue - expectedValue;
  const absDiff = Math.abs(difference);

  if (absDiff <= tolerance) {
    return null;
  }

  // When expectedValue is 0, we return 0 for percentageDiff to avoid Infinity/NaN.
  // This is intentional: percentage change from zero is undefined mathematically,
  // so we default to 0 to keep the delta object valid and usable.
  const percentageDiff = expectedValue !== 0
    ? (difference / expectedValue) * 100
    : 0;

  return {
    formulaName,
    expectedValue,
    actualValue,
    difference,
    percentageDiff,
  };
}
