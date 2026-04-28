/**
 * Preference Learner — Detects and learns user formula preferences.
 *
 * Responsibilities:
 * - Detect deltas between expected (formula) and actual (user-edited) values
 * - Create SkillOverride objects for learned preferences
 * - Merge preferences into LLM context
 *
 * @module copilot/perception/preferenceLearner
 */

import type { SkillOverride } from './types';

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

// ─── Override Creation ──────────────────────────────────────────────────────

/**
 * Input for creating a SkillOverride.
 */
export interface OverrideCreationInput {
  /** Skill ID (e.g., 'core:bodice') */
  skillId: string;
  /** Formula name */
  formulaName: string;
  /** Original formula expression */
  originalExpression: string;
  /** Detected delta */
  delta: FormulaDelta;
  /** Optional reason for the override */
  reason?: string;
}

// B11-state: format-asserted by tests (`preferenceLearner.test.ts:117`
// `toContain('override-')`; `designLog.test.ts:91,95` asserts specific
// sequential IDs `override-2`, `override-3`). Class B per B11-state
// methodology — preserved as-is. See B10-state RFC for resolution.
let overrideIdCounter = 0;

/**
 * Generate a unique override ID.
 */
export function generateOverrideId(): string {
  overrideIdCounter++;
  return `override-${Date.now()}-${overrideIdCounter}`;
}

/**
 * Create a SkillOverride from a detected delta.
 */
export function createSkillOverride(input: OverrideCreationInput): SkillOverride {
  const { skillId, formulaName, originalExpression, delta, reason } = input;

  // Create adjusted expression
  const sign = delta.difference >= 0 ? '+' : '-';
  const absValue = Math.abs(delta.difference);
  const overrideValue = `${originalExpression} ${sign} ${absValue}`;

  // Generate reason if not provided
  const defaultReason = `Formula ${formulaName} adjusted by ${delta.difference > 0 ? '+' : ''}${delta.difference}mm (${delta.percentageDiff.toFixed(1)}%)`;

  return {
    id: generateOverrideId(),
    skillId,
    formulaName,
    originalValue: originalExpression,
    overrideValue,
    reason: reason || defaultReason,
    createdAt: Date.now(),
  };
}

// ─── Batch Detection ────────────────────────────────────────────────────────

/**
 * A formula with expected and actual values for comparison.
 */
export interface FormulaWithValues {
  /** Formula name */
  name: string;
  /** Original formula expression */
  expression: string;
  /** Expected value from formula calculation */
  expectedValue: number;
  /** Actual value from piece geometry */
  actualValue: number;
}

/**
 * Input for comparing multiple formulas on a piece.
 */
export interface PieceFormulaComparison {
  /** Piece ID */
  pieceId: string;
  /** Skill ID that generated this piece */
  skillId: string;
  /** List of formulas to compare */
  formulas: FormulaWithValues[];
  /** Optional tolerance (default: 2mm) */
  tolerance?: number;
}

/**
 * Extended delta with formula expression.
 */
export interface FormulaDeltaWithExpression extends FormulaDelta {
  /** Original formula expression */
  expression: string;
}

/**
 * Detect deltas across multiple formulas for a piece.
 */
export function detectMultipleDeltas(
  comparison: PieceFormulaComparison,
): FormulaDeltaWithExpression[] {
  const { formulas, tolerance } = comparison;
  const deltas: FormulaDeltaWithExpression[] = [];

  for (const formula of formulas) {
    const delta = detectFormulaDelta({
      formulaName: formula.name,
      expectedValue: formula.expectedValue,
      actualValue: formula.actualValue,
      tolerance,
    });

    if (delta) {
      deltas.push({
        ...delta,
        expression: formula.expression,
      });
    }
  }

  return deltas;
}

// ─── Preference Learner Class ───────────────────────────────────────────────

/**
 * Manages learned user preferences for formula overrides.
 */
export class PreferenceLearner {
  /** Map of skillId:formulaName -> SkillOverride */
  private overrides: Map<string, SkillOverride> = new Map();

  /**
   * Generate a key for the override map.
   */
  private getKey(skillId: string, formulaName: string): string {
    return `${skillId}:${formulaName}`;
  }

  /**
   * Record a new override, replacing any existing one for the same skill+formula.
   */
  recordOverride(input: OverrideCreationInput): SkillOverride {
    const override = createSkillOverride(input);
    const key = this.getKey(input.skillId, input.formulaName);
    this.overrides.set(key, override);
    return override;
  }

  /**
   * Get all recorded overrides.
   */
  getOverrides(): SkillOverride[] {
    return Array.from(this.overrides.values());
  }

  /**
   * Get overrides for a specific skill.
   */
  getOverridesForSkill(skillId: string): SkillOverride[] {
    return this.getOverrides().filter(o => o.skillId === skillId);
  }

  /**
   * Check if an override exists for a skill+formula.
   */
  hasOverride(skillId: string, formulaName: string): boolean {
    return this.overrides.has(this.getKey(skillId, formulaName));
  }

  /**
   * Get a specific override.
   */
  getOverride(skillId: string, formulaName: string): SkillOverride | undefined {
    return this.overrides.get(this.getKey(skillId, formulaName));
  }

  /**
   * Clear all overrides.
   */
  clear(): void {
    this.overrides.clear();
  }

  /**
   * Get the number of recorded overrides.
   */
  get size(): number {
    return this.overrides.size;
  }
}

// ─── Context Integration ────────────────────────────────────────────────────

/**
 * Format overrides for inclusion in LLM system prompt.
 */
export function formatOverridesForPrompt(overrides: SkillOverride[]): string {
  if (overrides.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## User Formula Preferences',
    '',
    'The user has the following formula overrides that should be applied:',
    '',
  ];

  for (const override of overrides) {
    lines.push(`### ${override.skillId} - ${override.formulaName}`);
    lines.push(`- Original: \`${override.originalValue}\``);
    lines.push(`- Preferred: \`${override.overrideValue}\``);
    lines.push(`- Reason: ${override.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}
