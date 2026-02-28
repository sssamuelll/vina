# Preference Learner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a preference learner that detects formula deviations when users modify AI-generated geometry, creates SkillOverride objects, and merges preferences into the LLM context.

**Architecture:** Pure functions in `src/copilot/vision/preferenceLearner.ts`. Detects deltas between expected (formula) and actual (user-edited) values. Uses existing SkillOverride type and integrates with DesignLogManager.

**Tech Stack:** TypeScript, Vitest, existing vision types

---

## Task 1: Create Core Formula Delta Detection

**Files:**
- Create: `src/copilot/vision/preferenceLearner.ts`
- Create: `src/copilot/vision/__tests__/preferenceLearner.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/vision/__tests__/preferenceLearner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectFormulaDelta, type FormulaDelta } from '../preferenceLearner';

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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/preferenceLearner.test.ts`

**Step 3: Write minimal implementation**

Create `src/copilot/vision/preferenceLearner.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add src/copilot/vision/preferenceLearner.ts src/copilot/vision/__tests__/preferenceLearner.test.ts
git commit -m "feat(vision): add formula delta detection

- detectFormulaDelta compares expected vs actual values
- Returns FormulaDelta when deviation exceeds tolerance
- Default tolerance of 2mm

Part of #184"
```

---

## Task 2: Add SkillOverride Creation

**Files:**
- Modify: `src/copilot/vision/preferenceLearner.ts`
- Modify: `src/copilot/vision/__tests__/preferenceLearner.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { createSkillOverride, type OverrideCreationInput } from '../preferenceLearner';

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
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `preferenceLearner.ts`:

```typescript
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

/** Counter for generating unique override IDs */
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
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add SkillOverride creation from delta

- createSkillOverride generates override with adjusted expression
- Handles positive and negative adjustments
- Auto-generates reason if not provided

Part of #184"
```

---

## Task 3: Add Batch Delta Detection

**Files:**
- Modify: `src/copilot/vision/preferenceLearner.ts`
- Modify: `src/copilot/vision/__tests__/preferenceLearner.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { detectMultipleDeltas, type PieceFormulaComparison } from '../preferenceLearner';

describe('Preference Learner - Batch Detection', () => {
  it('should detect deltas across multiple formulas', () => {
    const comparison: PieceFormulaComparison = {
      pieceId: 'front-bodice',
      skillId: 'core:bodice',
      formulas: [
        { name: 'backWidth', expression: '(chest/4)+1', expectedValue: 100, actualValue: 100 },
        { name: 'frontWidth', expression: '(chest/4)+2', expectedValue: 101, actualValue: 108 },
        { name: 'armholeDepth', expression: 'height*0.12', expectedValue: 50, actualValue: 48 },
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
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `preferenceLearner.ts`:

```typescript
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
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add batch formula delta detection

- detectMultipleDeltas compares multiple formulas at once
- Returns only formulas with deviations
- Supports custom tolerance

Part of #184"
```

---

## Task 4: Add Preference Aggregation

**Files:**
- Modify: `src/copilot/vision/preferenceLearner.ts`
- Modify: `src/copilot/vision/__tests__/preferenceLearner.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { PreferenceLearner } from '../preferenceLearner';
import type { SkillOverride } from '../types';

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
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `preferenceLearner.ts`:

```typescript
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
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add PreferenceLearner class

- recordOverride stores overrides by skill+formula key
- Replaces existing override for same key
- getOverridesForSkill filters by skill

Part of #184"
```

---

## Task 5: Add Context Integration and Exports

**Files:**
- Modify: `src/copilot/vision/preferenceLearner.ts`
- Modify: `src/copilot/vision/__tests__/preferenceLearner.test.ts`
- Modify: `src/copilot/vision/index.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { formatOverridesForPrompt } from '../preferenceLearner';

describe('PreferenceLearner - Context Integration', () => {
  it('should format overrides for LLM prompt', () => {
    const overrides: SkillOverride[] = [
      {
        id: 'o1',
        skillId: 'core:bodice',
        formulaName: 'backWidth',
        originalValue: '(chest/4)+1',
        overrideValue: '(chest/4)+1 + 5',
        reason: 'User prefers wider back',
        createdAt: Date.now(),
      },
    ];

    const formatted = formatOverridesForPrompt(overrides);

    expect(formatted).toContain('core:bodice');
    expect(formatted).toContain('backWidth');
    expect(formatted).toContain('(chest/4)+1 + 5');
    expect(formatted).toContain('User prefers wider back');
  });

  it('should return empty string for no overrides', () => {
    const formatted = formatOverridesForPrompt([]);
    expect(formatted).toBe('');
  });

  it('should format multiple overrides', () => {
    const overrides: SkillOverride[] = [
      {
        id: 'o1',
        skillId: 'core:bodice',
        formulaName: 'backWidth',
        originalValue: 'x',
        overrideValue: 'x + 5',
        reason: 'Reason 1',
        createdAt: Date.now(),
      },
      {
        id: 'o2',
        skillId: 'core:sleeve',
        formulaName: 'length',
        originalValue: 'y',
        overrideValue: 'y + 3',
        reason: 'Reason 2',
        createdAt: Date.now(),
      },
    ];

    const formatted = formatOverridesForPrompt(overrides);

    expect(formatted).toContain('core:bodice');
    expect(formatted).toContain('core:sleeve');
    expect(formatted.split('\n').length).toBeGreaterThan(2);
  });
});

describe('PreferenceLearner - Full Integration', () => {
  it('should support full workflow: detect, record, format', () => {
    const learner = new PreferenceLearner();

    // Detect deltas
    const comparison: PieceFormulaComparison = {
      pieceId: 'front',
      skillId: 'core:bodice',
      formulas: [
        { name: 'backWidth', expression: '(chest/4)+1', expectedValue: 100, actualValue: 107 },
      ],
    };

    const deltas = detectMultipleDeltas(comparison);
    expect(deltas).toHaveLength(1);

    // Record override
    learner.recordOverride({
      skillId: comparison.skillId,
      formulaName: deltas[0].formulaName,
      originalExpression: deltas[0].expression,
      delta: deltas[0],
      reason: 'User preference',
    });

    // Format for prompt
    const formatted = formatOverridesForPrompt(learner.getOverrides());
    expect(formatted).toContain('backWidth');
    expect(formatted).toContain('+ 7');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `preferenceLearner.ts`:

```typescript
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
```

**Step 4: Update index.ts exports**

Add to `src/copilot/vision/index.ts`:

```typescript
// Preference Learner
export {
  PreferenceLearner,
  detectFormulaDelta,
  detectMultipleDeltas,
  createSkillOverride,
  generateOverrideId,
  formatOverridesForPrompt,
  DEFAULT_TOLERANCE_MM,
} from './preferenceLearner';

export type {
  FormulaComparisonInput,
  FormulaDelta,
  OverrideCreationInput,
  FormulaWithValues,
  PieceFormulaComparison,
  FormulaDeltaWithExpression,
} from './preferenceLearner';
```

**Step 5: Run all tests**

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add context integration and exports

- formatOverridesForPrompt for LLM system prompt
- Export all functions and types from index
- Full workflow integration test

Closes #184"
```

---

## Task 6: Run All Tests and Close Issue

**Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: All tests pass

**Step 2: Push changes**

```bash
git push origin main
```

**Step 3: Close issue**

```bash
gh issue close 184 --comment "Implemented Preference Learner:
- \`detectFormulaDelta\`: detects deviations between formula and actual values
- \`detectMultipleDeltas\`: batch detection across multiple formulas
- \`createSkillOverride\`: creates SkillOverride from delta
- \`PreferenceLearner\`: class for aggregating and managing overrides
- \`formatOverridesForPrompt\`: formats overrides for LLM context

All functions exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Formula delta detection | 5 |
| 2 | SkillOverride creation | 3 |
| 3 | Batch detection | 3 |
| 4 | PreferenceLearner class | 4 |
| 5 | Context integration | 4 |
| 6 | Final verification | - |

**Total new tests:** 19
**Files created:** 1 (`preferenceLearner.ts`)
**Files modified:** 2 (`index.ts`, `preferenceLearner.test.ts`)
