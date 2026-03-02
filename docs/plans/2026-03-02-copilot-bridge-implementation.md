# Copilot Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Planner + Executor + Reasoner bridge system for step-by-step copilot execution.

**Architecture:** Bridge orchestrates planning (LLM), execution (no LLM), reasoning (LLM on error), and summary (template-based).

**Tech Stack:** TypeScript, React, Zustand/Redux, Anthropic/OpenAI providers

**Design Doc:** `docs/plans/2026-03-02-copilot-bridge-architecture-design.md`

**Epic:** #203

---

## Phase 1: Bridge System

### Task 1.1: Bridge Types & Interfaces

**Files:**
- Create: `src/copilot/bridge/types.ts`
- Test: `src/copilot/bridge/__tests__/types.test.ts`

**Step 1: Create bridge directory**

```bash
mkdir -p src/copilot/bridge/__tests__
```

**Step 2: Write the type tests**

```typescript
// src/copilot/bridge/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  ExecutionPlan,
  ExecuteStep,
  EvaluateStep,
  Step,
  StepResult,
  ReasonerDecision,
  ExpandableSummary,
  ProgressState,
} from '../types';

describe('Bridge Types', () => {
  it('ExecuteStep has required fields', () => {
    const step: ExecuteStep = {
      type: 'execute',
      id: 'step1',
      tool: 'measureEdge',
      params: { pieceId: 'front', edge: 'neckline' },
      label: 'Measuring neckline',
    };
    expect(step.type).toBe('execute');
    expect(step.tool).toBe('measureEdge');
  });

  it('EvaluateStep has required fields', () => {
    const step: EvaluateStep = {
      type: 'evaluate',
      id: 'step2',
      input: '$step1.result',
      decide: 'Is the measurement acceptable?',
      label: 'Evaluating measurement',
    };
    expect(step.type).toBe('evaluate');
    expect(step.input).toBe('$step1.result');
  });

  it('Step is union of ExecuteStep | EvaluateStep', () => {
    const steps: Step[] = [
      { type: 'execute', id: 's1', tool: 'test', params: {}, label: 'Test' },
      { type: 'evaluate', id: 's2', input: '$s1', decide: 'ok?', label: 'Eval' },
    ];
    expect(steps).toHaveLength(2);
  });

  it('ExecutionPlan contains intent and steps', () => {
    const plan: ExecutionPlan = {
      intent: 'reduce_neckline',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      ],
    };
    expect(plan.intent).toBe('reduce_neckline');
    expect(plan.steps).toHaveLength(1);
  });

  it('StepResult includes optional rollback', () => {
    let rolledBack = false;
    const result: StepResult = {
      stepId: 'step1',
      success: true,
      data: { length: 314 },
      rollback: () => { rolledBack = true; },
    };
    expect(result.success).toBe(true);
    result.rollback?.();
    expect(rolledBack).toBe(true);
  });

  it('StepResult can represent failure', () => {
    const result: StepResult = {
      stepId: 'step1',
      success: false,
      error: 'Edge not found',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Edge not found');
  });

  it('ReasonerDecision retry action', () => {
    const decision: ReasonerDecision = {
      action: 'retry',
      newParams: { edge: 'front-neckline' },
    };
    expect(decision.action).toBe('retry');
  });

  it('ReasonerDecision askUser action', () => {
    const decision: ReasonerDecision = {
      action: 'askUser',
      question: 'Which edge should I modify?',
      options: ['back-neck', 'cb-curve', 'cancel'],
    };
    expect(decision.action).toBe('askUser');
    expect(decision.options).toHaveLength(3);
  });

  it('ReasonerDecision abort action', () => {
    const decision: ReasonerDecision = {
      action: 'abort',
      reason: 'Cannot find matching edge',
    };
    expect(decision.action).toBe('abort');
  });

  it('ExpandableSummary has short and details', () => {
    const summary: ExpandableSummary = {
      short: 'Neckline reduced 2cm',
      details: ['Front: 314mm → 294mm', 'Back: 253mm → 233mm'],
    };
    expect(summary.short).toContain('Neckline');
    expect(summary.details).toHaveLength(2);
  });

  it('ProgressState tracks execution', () => {
    const state: ProgressState = {
      status: 'running',
      intent: 'Reducing neckline',
      steps: [
        { id: 's1', label: 'Measure', status: 'done' },
        { id: 's2', label: 'Modify', status: 'running' },
      ],
      currentStepIndex: 1,
    };
    expect(state.status).toBe('running');
    expect(state.steps[0].status).toBe('done');
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run src/copilot/bridge/__tests__/types.test.ts
```
Expected: FAIL with "Cannot find module '../types'"

**Step 4: Write the types implementation**

```typescript
// src/copilot/bridge/types.ts
/**
 * Bridge Types — Type definitions for the Copilot Execution Bridge.
 *
 * The bridge orchestrates:
 * - Planner: LLM generates execution plan (JSON only)
 * - Executor: Runs steps without LLM (except evaluate steps)
 * - Reasoner: Handles errors with LLM assistance
 * - Summary: Template-based result formatting
 *
 * @module bridge/types
 */

// ─── Step Types ─────────────────────────────────────────────────────────────

/**
 * A step that executes a tool without LLM involvement.
 */
export interface ExecuteStep {
  type: 'execute';
  /** Unique step identifier */
  id: string;
  /** Tool name from registry */
  tool: string;
  /** Parameters for the tool */
  params: Record<string, unknown>;
  /** Human-readable label for progress UI */
  label: string;
}

/**
 * A step that requires LLM to evaluate results and make decisions.
 * Used for simulation analysis, fit evaluation, etc.
 */
export interface EvaluateStep {
  type: 'evaluate';
  /** Unique step identifier */
  id: string;
  /** Reference to previous step result, e.g., "$step1.result" */
  input: string;
  /** Question for LLM to decide */
  decide: string;
  /** Human-readable label for progress UI */
  label: string;
}

/**
 * Union type for all step types.
 */
export type Step = ExecuteStep | EvaluateStep;

// ─── Execution Plan ─────────────────────────────────────────────────────────

/**
 * Execution plan generated by the Planner.
 * Contains the intent and ordered steps to execute.
 */
export interface ExecutionPlan {
  /** High-level intent, e.g., "reduce_neckline" */
  intent: string;
  /** Ordered list of steps to execute */
  steps: Step[];
}

// ─── Step Results ───────────────────────────────────────────────────────────

/**
 * Result of executing a single step.
 */
export interface StepResult {
  /** ID of the step that produced this result */
  stepId: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Result data (tool-specific) */
  data?: unknown;
  /** Error message if success is false */
  error?: string;
  /** Function to rollback this step's changes */
  rollback?: () => void;
}

// ─── Reasoner Types ─────────────────────────────────────────────────────────

/**
 * Decision made by the Reasoner when a step fails.
 */
export interface ReasonerDecision {
  /** Action to take */
  action: 'retry' | 'alternative' | 'askUser' | 'abort';
  /** New parameters for retry action */
  newParams?: Record<string, unknown>;
  /** Alternative step for alternative action */
  newStep?: Step;
  /** Question to ask user for askUser action */
  question?: string;
  /** Options for user to choose from */
  options?: string[];
  /** Reason for abort action */
  reason?: string;
}

/**
 * Input provided to the Reasoner for error analysis.
 */
export interface ReasonerInput {
  /** The step that failed */
  failedStep: Step;
  /** Error message from the failure */
  error: string;
  /** Results from successfully completed steps */
  resultsSoFar: StepResult[];
  /** Original user intent */
  originalIntent: string;
}

// ─── Summary Types ──────────────────────────────────────────────────────────

/**
 * Expandable summary shown in chat after completion.
 */
export interface ExpandableSummary {
  /** Short one-line summary */
  short: string;
  /** Detailed breakdown (shown when expanded) */
  details: string[];
}

// ─── Progress State ─────────────────────────────────────────────────────────

/**
 * Status of an individual step in progress.
 */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * Step state for progress UI.
 */
export interface ProgressStep {
  /** Step ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Current status */
  status: StepStatus;
  /** Preview of result (e.g., "314mm") */
  resultPreview?: string;
}

/**
 * Overall progress state for the execution.
 */
export interface ProgressState {
  /** Overall execution status */
  status: 'planning' | 'running' | 'asking' | 'done' | 'failed';
  /** Intent being executed */
  intent: string;
  /** All steps with their status */
  steps: ProgressStep[];
  /** Index of currently executing step */
  currentStepIndex: number;
  /** Question from Reasoner (when status is 'asking') */
  question?: string;
  /** Options for user (when status is 'asking') */
  options?: string[];
  /** Summary (when status is 'done') */
  summary?: ExpandableSummary;
  /** Error message (when status is 'failed') */
  error?: string;
}

// ─── Bridge Events ──────────────────────────────────────────────────────────

/**
 * Events emitted by the ExecutionBridge.
 */
export type BridgeEvent =
  | { type: 'plan:start' }
  | { type: 'plan:done'; plan: ExecutionPlan }
  | { type: 'step:start'; stepId: string; label: string }
  | { type: 'step:done'; stepId: string; result: StepResult }
  | { type: 'step:failed'; stepId: string; error: string }
  | { type: 'ask:user'; question: string; options: string[] }
  | { type: 'execution:done'; summary: ExpandableSummary }
  | { type: 'execution:failed'; error: string; canRollback: boolean }
  | { type: 'rollback:start' }
  | { type: 'rollback:done' };

/**
 * Callback for bridge events.
 */
export type BridgeEventHandler = (event: BridgeEvent) => void;

// ─── Bridge Configuration ───────────────────────────────────────────────────

/**
 * Configuration for the ExecutionBridge.
 */
export interface BridgeConfig {
  /** Maximum retry attempts per step */
  maxRetries: number;
  /** Timeout for individual steps (ms) */
  stepTimeout: number;
  /** Whether to enable rollback on abort */
  enableRollback: boolean;
}

/**
 * Default bridge configuration.
 */
export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  maxRetries: 2,
  stepTimeout: 30000,
  enableRollback: true,
};

// ─── Type Guards ────────────────────────────────────────────────────────────

/**
 * Type guard for ExecuteStep.
 */
export function isExecuteStep(step: Step): step is ExecuteStep {
  return step.type === 'execute';
}

/**
 * Type guard for EvaluateStep.
 */
export function isEvaluateStep(step: Step): step is EvaluateStep {
  return step.type === 'evaluate';
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/copilot/bridge/__tests__/types.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/copilot/bridge/
git commit -m "feat(bridge): add type definitions for execution bridge

- ExecutionPlan, Step, ExecuteStep, EvaluateStep
- StepResult with rollback support
- ReasonerDecision for error recovery
- ProgressState for UI
- BridgeEvent for event-driven updates
- Type guards for step types

Part of Epic #203"
```

---

### Task 1.2: ResultStore Module

**Files:**
- Create: `src/copilot/bridge/ResultStore.ts`
- Test: `src/copilot/bridge/__tests__/ResultStore.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/copilot/bridge/__tests__/ResultStore.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ResultStore } from '../ResultStore';
import type { StepResult } from '../types';

describe('ResultStore', () => {
  it('starts empty', () => {
    const store = new ResultStore();
    expect(store.getAll()).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('adds and retrieves results', () => {
    const store = new ResultStore();
    const result: StepResult = {
      stepId: 'step1',
      success: true,
      data: { length: 314 },
    };
    store.add(result);
    expect(store.get('step1')).toEqual(result);
    expect(store.size).toBe(1);
  });

  it('returns undefined for unknown step', () => {
    const store = new ResultStore();
    expect(store.get('unknown')).toBeUndefined();
  });

  it('resolves variable references', () => {
    const store = new ResultStore();
    store.add({ stepId: 'step1', success: true, data: { length: 314 } });
    store.add({ stepId: 'step2', success: true, data: { width: 100 } });

    expect(store.resolve('$step1.result')).toEqual({ length: 314 });
    expect(store.resolve('$step2.result.width')).toBe(100);
    expect(store.resolve('literal')).toBe('literal');
  });

  it('resolves nested paths', () => {
    const store = new ResultStore();
    store.add({
      stepId: 'sim',
      success: true,
      data: { fitMap: { shoulder: { tension: 0.8 } } },
    });

    expect(store.resolve('$sim.result.fitMap.shoulder.tension')).toBe(0.8);
  });

  it('returns undefined for invalid reference', () => {
    const store = new ResultStore();
    store.add({ stepId: 'step1', success: true, data: { x: 1 } });
    expect(store.resolve('$step1.result.y')).toBeUndefined();
    expect(store.resolve('$unknown.result')).toBeUndefined();
  });

  it('tracks rollback functions', () => {
    const store = new ResultStore();
    const rollback1 = vi.fn();
    const rollback2 = vi.fn();

    store.add({ stepId: 's1', success: true, rollback: rollback1 });
    store.add({ stepId: 's2', success: true, rollback: rollback2 });
    store.add({ stepId: 's3', success: true }); // no rollback

    expect(store.hasRollbacks()).toBe(true);
  });

  it('rollbackAll calls rollbacks in reverse order', () => {
    const store = new ResultStore();
    const order: string[] = [];

    store.add({ stepId: 's1', success: true, rollback: () => order.push('s1') });
    store.add({ stepId: 's2', success: true, rollback: () => order.push('s2') });
    store.add({ stepId: 's3', success: true, rollback: () => order.push('s3') });

    store.rollbackAll();
    expect(order).toEqual(['s3', 's2', 's1']);
  });

  it('clear removes all results', () => {
    const store = new ResultStore();
    store.add({ stepId: 's1', success: true });
    store.add({ stepId: 's2', success: true });
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  it('getSuccessful returns only successful results', () => {
    const store = new ResultStore();
    store.add({ stepId: 's1', success: true, data: { a: 1 } });
    store.add({ stepId: 's2', success: false, error: 'fail' });
    store.add({ stepId: 's3', success: true, data: { b: 2 } });

    const successful = store.getSuccessful();
    expect(successful).toHaveLength(2);
    expect(successful.map(r => r.stepId)).toEqual(['s1', 's3']);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/copilot/bridge/__tests__/ResultStore.test.ts
```
Expected: FAIL with "Cannot find module '../ResultStore'"

**Step 3: Write the implementation**

```typescript
// src/copilot/bridge/ResultStore.ts
/**
 * ResultStore — Accumulates step results during execution.
 *
 * Features:
 * - Store and retrieve results by step ID
 * - Resolve variable references like "$step1.result.field"
 * - Track rollback functions for each step
 * - Execute rollbacks in reverse order
 *
 * @module bridge/ResultStore
 */

import type { StepResult } from './types';

/**
 * Stores results from executed steps and provides variable resolution.
 */
export class ResultStore {
  private results: Map<string, StepResult> = new Map();
  private order: string[] = []; // Tracks insertion order for rollback

  /**
   * Add a result to the store.
   */
  add(result: StepResult): void {
    this.results.set(result.stepId, result);
    this.order.push(result.stepId);
  }

  /**
   * Get a result by step ID.
   */
  get(stepId: string): StepResult | undefined {
    return this.results.get(stepId);
  }

  /**
   * Get all results in insertion order.
   */
  getAll(): StepResult[] {
    return this.order.map(id => this.results.get(id)!);
  }

  /**
   * Get only successful results.
   */
  getSuccessful(): StepResult[] {
    return this.getAll().filter(r => r.success);
  }

  /**
   * Number of stored results.
   */
  get size(): number {
    return this.results.size;
  }

  /**
   * Resolve a variable reference to its value.
   *
   * Format: "$stepId.result.path.to.field"
   * - "$step1.result" → data from step1
   * - "$step1.result.length" → data.length from step1
   * - "literal" → returns "literal" unchanged
   *
   * @param ref - Variable reference or literal string
   * @returns Resolved value or undefined if not found
   */
  resolve(ref: string): unknown {
    // If not a variable reference, return as-is
    if (!ref.startsWith('$')) {
      return ref;
    }

    // Parse reference: $stepId.result.path.to.field
    const withoutDollar = ref.slice(1);
    const parts = withoutDollar.split('.');

    if (parts.length < 2) {
      return undefined;
    }

    const stepId = parts[0];
    const result = this.results.get(stepId);

    if (!result) {
      return undefined;
    }

    // parts[1] should be "result"
    if (parts[1] !== 'result') {
      return undefined;
    }

    // Start with result.data
    let value: unknown = result.data;

    // Navigate path: parts[2], parts[3], ...
    for (let i = 2; i < parts.length; i++) {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value !== 'object') {
        return undefined;
      }
      value = (value as Record<string, unknown>)[parts[i]];
    }

    return value;
  }

  /**
   * Check if any stored results have rollback functions.
   */
  hasRollbacks(): boolean {
    for (const result of this.results.values()) {
      if (result.rollback) {
        return true;
      }
    }
    return false;
  }

  /**
   * Execute all rollback functions in reverse order.
   * Clears the store after rollback.
   */
  rollbackAll(): void {
    // Reverse order for proper undo
    const reversed = [...this.order].reverse();

    for (const stepId of reversed) {
      const result = this.results.get(stepId);
      if (result?.rollback) {
        result.rollback();
      }
    }

    this.clear();
  }

  /**
   * Clear all stored results.
   */
  clear(): void {
    this.results.clear();
    this.order = [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/copilot/bridge/__tests__/ResultStore.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/bridge/ResultStore.ts src/copilot/bridge/__tests__/ResultStore.test.ts
git commit -m "feat(bridge): add ResultStore for step result accumulation

- Store results by step ID
- Resolve variable references (\$step1.result.field)
- Track and execute rollbacks in reverse order
- Filter successful results

Part of Epic #203"
```

---

### Task 1.3: SummaryGenerator Module

**Files:**
- Create: `src/copilot/bridge/SummaryGenerator.ts`
- Test: `src/copilot/bridge/__tests__/SummaryGenerator.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/copilot/bridge/__tests__/SummaryGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { SummaryGenerator } from '../SummaryGenerator';
import type { StepResult } from '../types';

describe('SummaryGenerator', () => {
  it('generates short summary from intent', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      { stepId: 's1', success: true, data: { oldValue: 314, newValue: 294 } },
    ];

    const summary = generator.generate('reduce_neckline', results);
    expect(summary.short).toContain('reduce_neckline');
  });

  it('generates details from measurement results', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      {
        stepId: 'measure_front',
        success: true,
        data: { pieceId: 'front', measurement: 314, unit: 'mm' },
      },
      {
        stepId: 'modify_front',
        success: true,
        data: { pieceId: 'front', oldValue: 314, newValue: 294, unit: 'mm' },
      },
      {
        stepId: 'modify_back',
        success: true,
        data: { pieceId: 'back', oldValue: 253, newValue: 233, unit: 'mm' },
      },
    ];

    const summary = generator.generate('reduce_neckline', results);
    expect(summary.details.length).toBeGreaterThan(0);
  });

  it('formats before/after values', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      {
        stepId: 's1',
        success: true,
        data: { pieceId: 'front', oldValue: 314, newValue: 294, unit: 'mm' },
      },
    ];

    const summary = generator.generate('modify', results);
    const detail = summary.details.find(d => d.includes('front'));
    expect(detail).toContain('314');
    expect(detail).toContain('294');
  });

  it('handles empty results', () => {
    const generator = new SummaryGenerator();
    const summary = generator.generate('test', []);
    expect(summary.short).toBeTruthy();
    expect(summary.details).toEqual([]);
  });

  it('includes step count and time', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      { stepId: 's1', success: true },
      { stepId: 's2', success: true },
      { stepId: 's3', success: true },
    ];

    const summary = generator.generate('test', results, 1234);
    expect(summary.details.some(d => d.includes('3'))).toBe(true);
    expect(summary.details.some(d => d.includes('1.2'))).toBe(true);
  });

  it('formats intent into readable text', () => {
    const generator = new SummaryGenerator();

    expect(generator.formatIntent('reduce_neckline')).toBe('Reduce neckline');
    expect(generator.formatIntent('add_seam_allowance')).toBe('Add seam allowance');
    expect(generator.formatIntent('measureEdge')).toBe('Measure edge');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/copilot/bridge/__tests__/SummaryGenerator.test.ts
```
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/copilot/bridge/SummaryGenerator.ts
/**
 * SummaryGenerator — Template-based summary generation from step results.
 *
 * Generates concise, expandable summaries without LLM involvement.
 * All data comes from actual tool results.
 *
 * @module bridge/SummaryGenerator
 */

import type { StepResult, ExpandableSummary } from './types';

/**
 * Generates summaries from execution results.
 */
export class SummaryGenerator {
  /**
   * Generate an expandable summary from execution results.
   *
   * @param intent - The original intent (e.g., "reduce_neckline")
   * @param results - All step results
   * @param durationMs - Optional execution duration in milliseconds
   */
  generate(
    intent: string,
    results: StepResult[],
    durationMs?: number,
  ): ExpandableSummary {
    const successfulResults = results.filter(r => r.success);
    const details: string[] = [];

    // Extract modification details
    for (const result of successfulResults) {
      const detail = this.formatResultDetail(result);
      if (detail) {
        details.push(detail);
      }
    }

    // Add step count and duration
    if (successfulResults.length > 0) {
      let meta = `${successfulResults.length} step${successfulResults.length > 1 ? 's' : ''}`;
      if (durationMs !== undefined) {
        meta += ` in ${(durationMs / 1000).toFixed(1)}s`;
      }
      details.push(meta);
    }

    return {
      short: `${this.formatIntent(intent)} completed`,
      details,
    };
  }

  /**
   * Format a step result into a detail string.
   */
  private formatResultDetail(result: StepResult): string | null {
    const data = result.data as Record<string, unknown> | undefined;
    if (!data) return null;

    // Handle modification with before/after
    if ('oldValue' in data && 'newValue' in data) {
      const piece = data.pieceId || data.piece || 'item';
      const unit = data.unit || '';
      return `${piece}: ${data.oldValue}${unit} → ${data.newValue}${unit}`;
    }

    // Handle measurement
    if ('measurement' in data) {
      const piece = data.pieceId || data.piece || 'item';
      const unit = data.unit || '';
      return `${piece}: ${data.measurement}${unit}`;
    }

    // Handle generic success with message
    if ('message' in data && typeof data.message === 'string') {
      return data.message;
    }

    return null;
  }

  /**
   * Format an intent string into readable text.
   *
   * @example
   * formatIntent('reduce_neckline') // 'Reduce neckline'
   * formatIntent('addSeamAllowance') // 'Add seam allowance'
   */
  formatIntent(intent: string): string {
    // Convert snake_case or camelCase to words
    const words = intent
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

    // Capitalize first letter
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/copilot/bridge/__tests__/SummaryGenerator.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/bridge/SummaryGenerator.ts src/copilot/bridge/__tests__/SummaryGenerator.test.ts
git commit -m "feat(bridge): add SummaryGenerator for template-based summaries

- Generate short summary from intent
- Format before/after values from results
- Include step count and duration
- No LLM involvement - pure template

Part of Epic #203"
```

---

### Task 1.4: Planner Module

**Files:**
- Create: `src/copilot/bridge/Planner.ts`
- Test: `src/copilot/bridge/__tests__/Planner.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/copilot/bridge/__tests__/Planner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Planner, PlannerError } from '../Planner';
import type { ExecutionPlan } from '../types';

describe('Planner', () => {
  it('builds system prompt for JSON-only output', () => {
    const planner = new Planner();
    const prompt = planner.buildSystemPrompt([
      { name: 'measureEdge', description: 'Measure edge length', parameters: { type: 'object', properties: {} } },
    ]);

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('measureEdge');
    expect(prompt).not.toContain('explain');
  });

  it('parses valid execution plan', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'reduce_neckline',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      ],
    });

    const plan = planner.parsePlan(json);
    expect(plan.intent).toBe('reduce_neckline');
    expect(plan.steps).toHaveLength(1);
  });

  it('extracts JSON from markdown code block', () => {
    const planner = new Planner();
    const response = `Here's the plan:
\`\`\`json
{
  "intent": "test",
  "steps": []
}
\`\`\`
`;
    const plan = planner.parsePlan(response);
    expect(plan.intent).toBe('test');
  });

  it('throws PlannerError for invalid JSON', () => {
    const planner = new Planner();
    expect(() => planner.parsePlan('not json')).toThrow(PlannerError);
  });

  it('throws PlannerError for missing intent', () => {
    const planner = new Planner();
    const json = JSON.stringify({ steps: [] });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('throws PlannerError for missing steps', () => {
    const planner = new Planner();
    const json = JSON.stringify({ intent: 'test' });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates step structure', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'execute' }], // missing required fields
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates execute step has tool and params', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'execute', id: 's1', label: 'Test' }], // missing tool, params
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates evaluate step has input and decide', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'evaluate', id: 's1', label: 'Test' }], // missing input, decide
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('generates unique IDs if missing', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', tool: 'test', params: {}, label: 'Test 1' },
        { type: 'execute', tool: 'test', params: {}, label: 'Test 2' },
      ],
    });
    const plan = planner.parsePlan(json);
    expect(plan.steps[0].id).toBeTruthy();
    expect(plan.steps[1].id).toBeTruthy();
    expect(plan.steps[0].id).not.toBe(plan.steps[1].id);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/copilot/bridge/__tests__/Planner.test.ts
```
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/copilot/bridge/Planner.ts
/**
 * Planner — Generates execution plans from user requests via LLM.
 *
 * The Planner:
 * - Builds a system prompt that enforces JSON-only output
 * - Parses and validates the LLM response
 * - Ensures the plan has valid structure
 *
 * @module bridge/Planner
 */

import type { ExecutionPlan, Step, ExecuteStep, EvaluateStep } from './types';

/**
 * Error thrown when plan parsing or validation fails.
 */
export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

/**
 * Tool schema for prompt building.
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown> };
}

/**
 * Generates and parses execution plans.
 */
export class Planner {
  /**
   * Build the system prompt for the planner LLM call.
   * Enforces JSON-only output with no explanatory text.
   */
  buildSystemPrompt(tools: ToolSchema[]): string {
    const toolList = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are an execution planner. Your ONLY job is to output a JSON execution plan.

RULES:
1. Output ONLY valid JSON - no explanations, no markdown, no prose
2. Never invent data - only reference tools and their parameters
3. Each step must have a unique ID and human-readable label

AVAILABLE TOOLS:
${toolList}

OUTPUT FORMAT:
{
  "intent": "brief_intent_name",
  "steps": [
    {
      "type": "execute",
      "id": "step1",
      "tool": "toolName",
      "params": { ... },
      "label": "Human readable step description"
    },
    {
      "type": "evaluate",
      "id": "step2",
      "input": "$step1.result",
      "decide": "Question for evaluation",
      "label": "Human readable step description"
    }
  ]
}

Step types:
- "execute": Run a tool (no LLM needed)
- "evaluate": LLM evaluates results to make a decision (use for simulation analysis, fit checks, etc.)

Variable references:
- Use "$stepId.result" to reference previous step's result
- Use "$stepId.result.field" to reference a specific field`;
  }

  /**
   * Parse an LLM response into an ExecutionPlan.
   * Handles JSON wrapped in markdown code blocks.
   *
   * @throws PlannerError if parsing or validation fails
   */
  parsePlan(response: string): ExecutionPlan {
    // Extract JSON from markdown code block if present
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new PlannerError(`Invalid JSON in response: ${jsonStr.slice(0, 100)}...`);
    }

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      throw new PlannerError('Response is not an object');
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.intent !== 'string' || !obj.intent) {
      throw new PlannerError('Missing or invalid "intent" field');
    }

    if (!Array.isArray(obj.steps)) {
      throw new PlannerError('Missing or invalid "steps" array');
    }

    // Validate and normalize steps
    const steps: Step[] = obj.steps.map((step, index) => {
      return this.validateStep(step, index);
    });

    return {
      intent: obj.intent,
      steps,
    };
  }

  /**
   * Validate and normalize a single step.
   */
  private validateStep(step: unknown, index: number): Step {
    if (!step || typeof step !== 'object') {
      throw new PlannerError(`Step ${index} is not an object`);
    }

    const s = step as Record<string, unknown>;

    // Validate type
    if (s.type !== 'execute' && s.type !== 'evaluate') {
      throw new PlannerError(`Step ${index} has invalid type: ${s.type}`);
    }

    // Generate ID if missing
    const id = typeof s.id === 'string' && s.id ? s.id : `step_${index + 1}`;

    // Generate label if missing
    const label = typeof s.label === 'string' && s.label
      ? s.label
      : `Step ${index + 1}`;

    if (s.type === 'execute') {
      return this.validateExecuteStep(s, id, label, index);
    } else {
      return this.validateEvaluateStep(s, id, label, index);
    }
  }

  /**
   * Validate an execute step.
   */
  private validateExecuteStep(
    s: Record<string, unknown>,
    id: string,
    label: string,
    index: number,
  ): ExecuteStep {
    if (typeof s.tool !== 'string' || !s.tool) {
      throw new PlannerError(`Execute step ${index} missing "tool" field`);
    }

    if (!s.params || typeof s.params !== 'object') {
      throw new PlannerError(`Execute step ${index} missing "params" field`);
    }

    return {
      type: 'execute',
      id,
      tool: s.tool,
      params: s.params as Record<string, unknown>,
      label,
    };
  }

  /**
   * Validate an evaluate step.
   */
  private validateEvaluateStep(
    s: Record<string, unknown>,
    id: string,
    label: string,
    index: number,
  ): EvaluateStep {
    if (typeof s.input !== 'string' || !s.input) {
      throw new PlannerError(`Evaluate step ${index} missing "input" field`);
    }

    if (typeof s.decide !== 'string' || !s.decide) {
      throw new PlannerError(`Evaluate step ${index} missing "decide" field`);
    }

    return {
      type: 'evaluate',
      id,
      input: s.input,
      decide: s.decide,
      label,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/copilot/bridge/__tests__/Planner.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/bridge/Planner.ts src/copilot/bridge/__tests__/Planner.test.ts
git commit -m "feat(bridge): add Planner for execution plan generation

- Build system prompt enforcing JSON-only output
- Parse plans from LLM response (handles markdown)
- Validate step structure (execute/evaluate)
- Generate IDs if missing
- PlannerError for validation failures

Part of Epic #203"
```

---

### Task 1.5: Create index.ts barrel export

**Files:**
- Create: `src/copilot/bridge/index.ts`

**Step 1: Create barrel export**

```typescript
// src/copilot/bridge/index.ts
/**
 * Bridge Module — Copilot Execution Bridge
 *
 * @module bridge
 */

// Types
export * from './types';

// Modules
export { ResultStore } from './ResultStore';
export { SummaryGenerator } from './SummaryGenerator';
export { Planner, PlannerError } from './Planner';
export type { ToolSchema } from './Planner';
```

**Step 2: Commit**

```bash
git add src/copilot/bridge/index.ts
git commit -m "feat(bridge): add barrel export for bridge module

Part of Epic #203"
```

---

## Checkpoint

At this point, Phase 1 Tasks 1.1-1.5 are complete:
- ✅ Types & Interfaces
- ✅ ResultStore
- ✅ SummaryGenerator
- ✅ Planner
- ✅ Barrel export

Remaining for Phase 1:
- Task 1.6: Executor
- Task 1.7: Reasoner
- Task 1.8: ExecutionBridge orchestrator

---

## Continue with Task 1.6?

The plan document is getting long. I recommend:

1. **Save this plan** as the first part
2. **Execute Tasks 1.1-1.5**
3. **Create Part 2** with Tasks 1.6-1.8 after the foundation is solid

This allows for review checkpoints and prevents overwhelming the execution.
