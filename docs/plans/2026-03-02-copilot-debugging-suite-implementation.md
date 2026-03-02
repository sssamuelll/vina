# Copilot Debugging Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a middleware pipeline that captures full copilot bridge execution data (LLM prompts, step params, variable resolution, retries, timings) and outputs structured console logs + IndexedDB persistence.

**Architecture:** Decorator-pattern middleware wrapping Planner, Executor, and Reasoner. An ExecutionRecorder aggregates data per run. ConsoleLogger formats to DevTools. DebugStore persists to IndexedDB. All gated behind `openclo-debug-bridge` localStorage flag.

**Tech Stack:** TypeScript, Vitest, IndexedDB (via idb-keyval or raw API), console formatting APIs

---

## Context for the Implementing Engineer

The copilot bridge lives in `src/copilot/reasoning/bridge/`. It has 3 core components:

- **Planner** (`Planner.ts`): Has `buildSystemPrompt(tools)` and `parsePlan(response)`. The LLM call itself happens in ExecutionBridge via `plannerLLM(userRequest)`.
- **Executor** (`Executor.ts`): Has `execute(plan)`. Internally resolves `$stepId.result.field` variable references via `ResultStore.resolve()`.
- **Reasoner** (`Reasoner.ts`): Has `analyze(input: ReasonerInput)`. Returns `ReasonerDecision` with action: retry/alternative/askUser/abort.

The **ExecutionBridge** (`ExecutionBridge.ts`) orchestrates them. It creates Planner and Reasoner internally in the constructor. The tools registry and LLM functions are passed via `BridgeOptions`.

Tests use **Vitest** with `vi.fn()` mocks. Pattern: `describe('Component', () => { beforeEach(() => vi.clearAllMocks()); it('does X', ...) })`.

The debug directory will be: `src/copilot/debug/`

---

### Task 1: Debug Types

**Files:**
- Create: `src/copilot/debug/types.ts`

**Step 1: Create the debug types file**

```typescript
import type {
  ExecutionPlan,
  ExpandableSummary,
  ReasonerInput,
  ReasonerDecision,
} from '../reasoning/bridge/types';

export interface ExecutionRecord {
  id: string;
  timestamp: number;
  userRequest: string;
  duration: number;
  success: boolean;

  planning: PlanningRecord;
  steps: StepRecord[];
  summary?: ExpandableSummary;
  error?: string;
}

export interface PlanningRecord {
  systemPrompt: string;
  toolsProvided: string[];
  rawResponse: string;
  parsedPlan: ExecutionPlan | null;
  parseError?: string;
  duration: number;
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface VariableResolution {
  variable: string;
  resolvedValue: unknown;
}

export interface RetryRecord {
  attempt: number;
  error: string;
  reasonerInput: ReasonerInput;
  reasonerDecision: ReasonerDecision;
  reasonerDuration: number;
  reasonerTokenUsage?: TokenUsage;
}

export interface StepRecord {
  stepId: string;
  tool: string;
  label: string;

  rawParams: Record<string, unknown>;
  resolvedParams: Record<string, unknown>;
  variableResolutions: VariableResolution[];

  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;

  retries: RetryRecord[];
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors related to `src/copilot/debug/types.ts`

**Step 3: Commit**

```bash
git add src/copilot/debug/types.ts
git commit -m "feat(debug): add ExecutionRecord and StepRecord types"
```

---

### Task 2: Extract Interfaces from Bridge Components

The middleware pattern requires interfaces for Planner, Executor, and Reasoner so decorators can wrap them. Currently these are concrete classes — we need to extract the public API into interfaces.

**Files:**
- Modify: `src/copilot/reasoning/bridge/types.ts`
- Modify: `src/copilot/reasoning/bridge/Planner.ts`
- Modify: `src/copilot/reasoning/bridge/Reasoner.ts`

**Step 1: Write the failing test for IPlanner**

Create: `src/copilot/debug/__tests__/interfaces.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { IPlanner, IReasoner } from '../../reasoning/bridge/types';
import { Planner } from '../../reasoning/bridge/Planner';
import { Reasoner } from '../../reasoning/bridge/Reasoner';

describe('Bridge Interfaces', () => {
  it('Planner satisfies IPlanner', () => {
    const planner = new Planner();
    const asInterface: IPlanner = planner;
    expect(asInterface.buildSystemPrompt).toBeDefined();
    expect(asInterface.parsePlan).toBeDefined();
  });

  it('Reasoner satisfies IReasoner', () => {
    const reasoner = new Reasoner(async () => ({ action: 'abort' as const }));
    const asInterface: IReasoner = reasoner;
    expect(asInterface.analyze).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/interfaces.test.ts`
Expected: FAIL — `IPlanner` and `IReasoner` are not exported from types.

**Step 3: Add interfaces to bridge types**

In `src/copilot/reasoning/bridge/types.ts`, add before the `// ─── Configuration` section:

```typescript
// ─── Component Interfaces ──────────────────────────────────────────────────

import type { ToolSchema } from './Planner';

export interface IPlanner {
  buildSystemPrompt(tools: ToolSchema[]): string;
  parsePlan(response: string): ExecutionPlan;
}

export interface IReasoner {
  analyze(input: ReasonerInput): Promise<ReasonerDecision>;
}
```

**Step 4: Verify Planner and Reasoner classes satisfy the interfaces**

The classes already have these methods. The test should now compile and pass.

Run: `npx vitest run src/copilot/debug/__tests__/interfaces.test.ts`
Expected: PASS

**Step 5: Run all bridge tests to ensure no regressions**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/copilot/reasoning/bridge/types.ts src/copilot/debug/__tests__/interfaces.test.ts
git commit -m "feat(debug): extract IPlanner and IReasoner interfaces"
```

---

### Task 3: ExecutionRecorder

The recorder collects debug data as middleware calls feed it. It builds up an `ExecutionRecord` during a run, then `finalize()` produces the complete record.

**Files:**
- Create: `src/copilot/debug/ExecutionRecorder.ts`
- Create: `src/copilot/debug/__tests__/ExecutionRecorder.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { ExecutionPlan, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';

describe('ExecutionRecorder', () => {
  let recorder: ExecutionRecorder;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
  });

  it('starts a new recording with user request', () => {
    recorder.start('reduce neckline 2cm');
    const record = recorder.finalize();
    expect(record.userRequest).toBe('reduce neckline 2cm');
    expect(record.id).toBeDefined();
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('records planning phase', () => {
    recorder.start('test');
    recorder.recordPlanningStart('system prompt text', ['modifyEdge', 'measureEdge']);

    const plan: ExecutionPlan = { intent: 'test', steps: [] };
    recorder.recordPlanningEnd('{"intent":"test","steps":[]}', plan);

    const record = recorder.finalize();
    expect(record.planning.systemPrompt).toBe('system prompt text');
    expect(record.planning.toolsProvided).toEqual(['modifyEdge', 'measureEdge']);
    expect(record.planning.rawResponse).toBe('{"intent":"test","steps":[]}');
    expect(record.planning.parsedPlan).toEqual(plan);
    expect(record.planning.duration).toBeGreaterThanOrEqual(0);
  });

  it('records planning error', () => {
    recorder.start('test');
    recorder.recordPlanningStart('prompt', []);
    recorder.recordPlanningError('Invalid JSON');

    const record = recorder.finalize();
    expect(record.planning.parseError).toBe('Invalid JSON');
    expect(record.planning.parsedPlan).toBeNull();
  });

  it('records step execution with variable resolution', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    recorder.recordStepStart('s1', 'measureEdge', 'Measure neckline');
    recorder.recordStepParams(
      's1',
      { pieceId: '$p1.result.id', edge: 'neckline' },
      { pieceId: 'front-bodice', edge: 'neckline' },
      [{ variable: '$p1.result.id', resolvedValue: 'front-bodice' }]
    );
    recorder.recordStepEnd('s1', true, { length: 24.5 });

    const record = recorder.finalize();
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].rawParams).toEqual({ pieceId: '$p1.result.id', edge: 'neckline' });
    expect(record.steps[0].resolvedParams).toEqual({ pieceId: 'front-bodice', edge: 'neckline' });
    expect(record.steps[0].variableResolutions).toHaveLength(1);
    expect(record.steps[0].success).toBe(true);
    expect(record.steps[0].result).toEqual({ length: 24.5 });
    expect(record.steps[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('records step failure with retry', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    recorder.recordStepStart('s1', 'modifyEdge', 'Modify edge');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepError('s1', 'Constraint violation');

    const reasonerInput: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: {}, label: '' },
      error: 'Constraint violation',
      resultsSoFar: [],
      originalIntent: 'test',
    };
    const decision: ReasonerDecision = { action: 'retry', newParams: { delta: -1 } };
    recorder.recordRetry('s1', 1, 'Constraint violation', reasonerInput, decision, 340);

    recorder.recordStepEnd('s1', true, { newLength: 23 });

    const record = recorder.finalize();
    expect(record.steps[0].retries).toHaveLength(1);
    expect(record.steps[0].retries[0].attempt).toBe(1);
    expect(record.steps[0].retries[0].reasonerDecision.action).toBe('retry');
    expect(record.steps[0].retries[0].reasonerDuration).toBe(340);
    expect(record.steps[0].success).toBe(true);
  });

  it('finalize computes total duration and success', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    recorder.recordStepStart('s1', 'tool', 'Step 1');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepEnd('s1', true, null);

    const record = recorder.finalize();
    expect(record.success).toBe(true);
    expect(record.duration).toBeGreaterThanOrEqual(0);
  });

  it('marks record as failed when any step fails', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    recorder.recordStepStart('s1', 'tool', 'Step 1');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepError('s1', 'boom');

    const record = recorder.finalize();
    expect(record.success).toBe(false);
  });

  it('reset clears state for next recording', () => {
    recorder.start('first');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'first', steps: [] });
    recorder.finalize();

    recorder.reset();
    recorder.start('second');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'second', steps: [] });
    const record = recorder.finalize();
    expect(record.userRequest).toBe('second');
    expect(record.steps).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/ExecutionRecorder.test.ts`
Expected: FAIL — `ExecutionRecorder` module not found.

**Step 3: Implement ExecutionRecorder**

```typescript
import type {
  ExecutionPlan,
  ReasonerInput,
  ReasonerDecision,
} from '../reasoning/bridge/types';
import type {
  ExecutionRecord,
  PlanningRecord,
  StepRecord,
  VariableResolution,
  TokenUsage,
} from './types';

export class ExecutionRecorder {
  private id = '';
  private startTime = 0;
  private userRequest = '';
  private planning: PlanningRecord = this.emptyPlanning();
  private steps: Map<string, StepRecord> = new Map();
  private stepOrder: string[] = [];
  private planningStartTime = 0;
  private stepStartTimes: Map<string, number> = new Map();

  start(userRequest: string): void {
    this.id = crypto.randomUUID();
    this.startTime = Date.now();
    this.userRequest = userRequest;
  }

  recordPlanningStart(systemPrompt: string, toolNames: string[]): void {
    this.planningStartTime = performance.now();
    this.planning.systemPrompt = systemPrompt;
    this.planning.toolsProvided = toolNames;
  }

  recordPlanningEnd(rawResponse: string, parsedPlan: ExecutionPlan): void {
    this.planning.rawResponse = rawResponse;
    this.planning.parsedPlan = parsedPlan;
    this.planning.duration = performance.now() - this.planningStartTime;
  }

  recordPlanningError(error: string): void {
    this.planning.parseError = error;
    this.planning.parsedPlan = null;
    this.planning.duration = performance.now() - this.planningStartTime;
  }

  recordPlanningTokens(usage: TokenUsage): void {
    this.planning.tokenUsage = usage;
  }

  recordStepStart(stepId: string, tool: string, label: string): void {
    this.stepStartTimes.set(stepId, performance.now());
    const record: StepRecord = {
      stepId,
      tool,
      label,
      rawParams: {},
      resolvedParams: {},
      variableResolutions: [],
      success: false,
      duration: 0,
      retries: [],
    };
    this.steps.set(stepId, record);
    this.stepOrder.push(stepId);
  }

  recordStepParams(
    stepId: string,
    rawParams: Record<string, unknown>,
    resolvedParams: Record<string, unknown>,
    variableResolutions: VariableResolution[]
  ): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.rawParams = rawParams;
      step.resolvedParams = resolvedParams;
      step.variableResolutions = variableResolutions;
    }
  }

  recordStepEnd(stepId: string, success: boolean, result: unknown): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.success = success;
      step.result = result;
      const startTime = this.stepStartTimes.get(stepId) ?? performance.now();
      step.duration = performance.now() - startTime;
    }
  }

  recordStepError(stepId: string, error: string): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.success = false;
      step.error = error;
      const startTime = this.stepStartTimes.get(stepId) ?? performance.now();
      step.duration = performance.now() - startTime;
    }
  }

  recordRetry(
    stepId: string,
    attempt: number,
    error: string,
    reasonerInput: ReasonerInput,
    reasonerDecision: ReasonerDecision,
    reasonerDuration: number,
    reasonerTokenUsage?: TokenUsage
  ): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.retries.push({
        attempt,
        error,
        reasonerInput,
        reasonerDecision,
        reasonerDuration,
        reasonerTokenUsage,
      });
    }
  }

  finalize(): ExecutionRecord {
    const orderedSteps = this.stepOrder
      .map(id => this.steps.get(id))
      .filter((s): s is StepRecord => s !== undefined);

    const allStepsSucceeded = orderedSteps.length > 0
      ? orderedSteps.every(s => s.success)
      : true;
    const hasFailedStep = orderedSteps.some(s => !s.success);

    return {
      id: this.id,
      timestamp: this.startTime,
      userRequest: this.userRequest,
      duration: Date.now() - this.startTime,
      success: !hasFailedStep && orderedSteps.length >= 0 && !this.planning.parseError,
      planning: { ...this.planning },
      steps: orderedSteps,
    };
  }

  reset(): void {
    this.id = '';
    this.startTime = 0;
    this.userRequest = '';
    this.planning = this.emptyPlanning();
    this.steps.clear();
    this.stepOrder = [];
    this.planningStartTime = 0;
    this.stepStartTimes.clear();
  }

  private emptyPlanning(): PlanningRecord {
    return {
      systemPrompt: '',
      toolsProvided: [],
      rawResponse: '',
      parsedPlan: null,
      duration: 0,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/ExecutionRecorder.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/ExecutionRecorder.ts src/copilot/debug/__tests__/ExecutionRecorder.test.ts
git commit -m "feat(debug): add ExecutionRecorder for collecting execution data"
```

---

### Task 4: PlannerMiddleware

Wraps the planning phase of ExecutionBridge. Since `ExecutionBridge.generatePlan()` is private and calls `plannerLLM` then `planner.parsePlan()`, the middleware wraps the `plannerLLM` function and the `Planner` instance.

**Files:**
- Create: `src/copilot/debug/middleware/PlannerMiddleware.ts`
- Create: `src/copilot/debug/__tests__/PlannerMiddleware.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerMiddleware } from '../middleware/PlannerMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import { Planner } from '../../reasoning/bridge/Planner';
import type { IPlanner } from '../../reasoning/bridge/types';

describe('PlannerMiddleware', () => {
  let recorder: ExecutionRecorder;
  let innerPlanner: Planner;
  let middleware: PlannerMiddleware;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    innerPlanner = new Planner();
    middleware = new PlannerMiddleware(innerPlanner, recorder);
  });

  it('delegates buildSystemPrompt to inner planner', () => {
    const tools = [{ name: 'modifyEdge', description: 'Modify', parameters: { type: 'object', properties: {} } }];
    const prompt = middleware.buildSystemPrompt(tools);
    expect(prompt).toContain('modifyEdge');
  });

  it('records system prompt and tool names on buildSystemPrompt', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);

    const tools = [
      { name: 'modifyEdge', description: 'Modify', parameters: { type: 'object', properties: {} } },
      { name: 'measureEdge', description: 'Measure', parameters: { type: 'object', properties: {} } },
    ];
    middleware.buildSystemPrompt(tools);

    // The middleware should have stored the prompt and tool names in recorder
    // We verify via finalize
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    const record = recorder.finalize();
    expect(record.planning.toolsProvided).toEqual(['modifyEdge', 'measureEdge']);
    expect(record.planning.systemPrompt).toContain('modifyEdge');
  });

  it('delegates parsePlan to inner planner and records response', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);

    const response = '{"intent":"measure","steps":[{"type":"execute","id":"s1","tool":"t","params":{},"label":"L"}]}';
    const plan = middleware.parsePlan(response);

    expect(plan.intent).toBe('measure');
    expect(plan.steps).toHaveLength(1);

    const record = recorder.finalize();
    expect(record.planning.rawResponse).toBe(response);
    expect(record.planning.parsedPlan?.intent).toBe('measure');
    expect(record.planning.duration).toBeGreaterThanOrEqual(0);
  });

  it('records parse error on invalid JSON', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);

    expect(() => middleware.parsePlan('not json')).toThrow();

    const record = recorder.finalize();
    expect(record.planning.parseError).toBeDefined();
    expect(record.planning.parsedPlan).toBeNull();
  });

  it('satisfies IPlanner interface', () => {
    const asInterface: IPlanner = middleware;
    expect(asInterface.buildSystemPrompt).toBeDefined();
    expect(asInterface.parsePlan).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/PlannerMiddleware.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement PlannerMiddleware**

```typescript
import type { ExecutionPlan } from '../../reasoning/bridge/types';
import type { IPlanner } from '../../reasoning/bridge/types';
import type { ToolSchema } from '../../reasoning/bridge/Planner';
import { ExecutionRecorder } from '../ExecutionRecorder';

export class PlannerMiddleware implements IPlanner {
  private lastPrompt = '';
  private lastToolNames: string[] = [];

  constructor(
    private inner: IPlanner,
    private recorder: ExecutionRecorder
  ) {}

  buildSystemPrompt(tools: ToolSchema[]): string {
    const prompt = this.inner.buildSystemPrompt(tools);
    this.lastPrompt = prompt;
    this.lastToolNames = tools.map(t => t.name);

    // Update the recorder with system prompt and tools
    this.recorder.recordPlanningStart(prompt, this.lastToolNames);

    return prompt;
  }

  parsePlan(response: string): ExecutionPlan {
    try {
      const plan = this.inner.parsePlan(response);
      this.recorder.recordPlanningEnd(response, plan);
      return plan;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recorder.recordPlanningError(message);
      throw error;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/PlannerMiddleware.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/middleware/PlannerMiddleware.ts src/copilot/debug/__tests__/PlannerMiddleware.test.ts
git commit -m "feat(debug): add PlannerMiddleware for recording planning phase"
```

---

### Task 5: ReasonerMiddleware

Wraps Reasoner.analyze() to capture input, decision, and duration.

**Files:**
- Create: `src/copilot/debug/middleware/ReasonerMiddleware.ts`
- Create: `src/copilot/debug/__tests__/ReasonerMiddleware.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReasonerMiddleware } from '../middleware/ReasonerMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { IReasoner, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';

describe('ReasonerMiddleware', () => {
  let recorder: ExecutionRecorder;
  let mockReasoner: IReasoner;
  let middleware: ReasonerMiddleware;

  const sampleInput: ReasonerInput = {
    failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: { delta: -2 }, label: 'Modify' },
    error: 'Constraint violation',
    resultsSoFar: [],
    originalIntent: 'reduce neckline',
  };

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'modifyEdge', 'Modify');
    recorder.recordStepParams('s1', {}, {}, []);

    mockReasoner = {
      analyze: vi.fn<[ReasonerInput], Promise<ReasonerDecision>>().mockResolvedValue({
        action: 'retry',
        newParams: { delta: -1 },
        reason: 'Try smaller delta',
      }),
    };

    middleware = new ReasonerMiddleware(mockReasoner, recorder);
  });

  it('delegates analyze to inner reasoner', async () => {
    const decision = await middleware.analyze(sampleInput);
    expect(decision.action).toBe('retry');
    expect(mockReasoner.analyze).toHaveBeenCalledWith(sampleInput);
  });

  it('records retry with duration', async () => {
    await middleware.analyze(sampleInput);

    const record = recorder.finalize();
    const step = record.steps.find(s => s.stepId === 's1');
    expect(step?.retries).toHaveLength(1);
    expect(step?.retries[0].reasonerDecision.action).toBe('retry');
    expect(step?.retries[0].reasonerDuration).toBeGreaterThanOrEqual(0);
    expect(step?.retries[0].error).toBe('Constraint violation');
  });

  it('tracks retry attempt count across multiple calls', async () => {
    await middleware.analyze(sampleInput);
    await middleware.analyze(sampleInput);

    const record = recorder.finalize();
    const step = record.steps.find(s => s.stepId === 's1');
    expect(step?.retries).toHaveLength(2);
    expect(step?.retries[0].attempt).toBe(1);
    expect(step?.retries[1].attempt).toBe(2);
  });

  it('satisfies IReasoner interface', () => {
    const asInterface: IReasoner = middleware;
    expect(asInterface.analyze).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/ReasonerMiddleware.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement ReasonerMiddleware**

```typescript
import type { IReasoner, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';
import { ExecutionRecorder } from '../ExecutionRecorder';

export class ReasonerMiddleware implements IReasoner {
  private retryCounters: Map<string, number> = new Map();

  constructor(
    private inner: IReasoner,
    private recorder: ExecutionRecorder
  ) {}

  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    const startTime = performance.now();
    const stepId = input.failedStep.id;

    const decision = await this.inner.analyze(input);

    const duration = performance.now() - startTime;
    const currentCount = (this.retryCounters.get(stepId) ?? 0) + 1;
    this.retryCounters.set(stepId, currentCount);

    this.recorder.recordRetry(
      stepId,
      currentCount,
      input.error,
      input,
      decision,
      duration
    );

    return decision;
  }

  resetCounters(): void {
    this.retryCounters.clear();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/ReasonerMiddleware.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/middleware/ReasonerMiddleware.ts src/copilot/debug/__tests__/ReasonerMiddleware.test.ts
git commit -m "feat(debug): add ReasonerMiddleware for recording error recovery"
```

---

### Task 6: ExecutorMiddleware

This is the most critical middleware. It needs to intercept the Executor's step execution to capture raw params, resolved params, and variable resolutions. Since `Executor.execute()` handles the full plan, the middleware wraps the tool functions passed to the bridge.

Instead of wrapping the Executor class directly (its internals handle resolveParams privately), we wrap the `ToolRegistry` passed to the bridge so that every tool call gets recorded.

**Files:**
- Create: `src/copilot/debug/middleware/ExecutorMiddleware.ts`
- Create: `src/copilot/debug/__tests__/ExecutorMiddleware.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInstrumentedTools } from '../middleware/ExecutorMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { ToolRegistry } from '../../reasoning/bridge/Executor';

describe('ExecutorMiddleware (createInstrumentedTools)', () => {
  let recorder: ExecutionRecorder;
  let mockTools: ToolRegistry;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    mockTools = {
      measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
      modifyEdge: vi.fn().mockResolvedValue({ success: true, data: { newLength: 23 } }),
      failingTool: vi.fn().mockResolvedValue({ success: false, error: 'boom' }),
    };
  });

  it('wraps tools and delegates calls', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);

    const result = await instrumented.measureEdge({ edge: 'neckline' });
    expect(result).toEqual({ success: true, data: { length: 24.5 } });
    expect(mockTools.measureEdge).toHaveBeenCalledWith({ edge: 'neckline' });
  });

  it('records step start and end on tool call', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);

    await instrumented.measureEdge({ edge: 'neckline' });

    const record = recorder.finalize();
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[0].resolvedParams).toEqual({ edge: 'neckline' });
    expect(record.steps[0].success).toBe(true);
    expect(record.steps[0].result).toEqual({ length: 24.5 });
    expect(record.steps[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('records tool failure', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);

    await instrumented.failingTool({ x: 1 });

    const record = recorder.finalize();
    expect(record.steps[0].success).toBe(false);
    expect(record.steps[0].error).toBe('boom');
  });

  it('records exception from tool', async () => {
    mockTools.crashingTool = vi.fn().mockRejectedValue(new Error('crash'));
    const instrumented = createInstrumentedTools(mockTools, recorder);

    await expect(instrumented.crashingTool({})).rejects.toThrow('crash');

    const record = recorder.finalize();
    expect(record.steps[0].success).toBe(false);
    expect(record.steps[0].error).toBe('crash');
  });

  it('handles multiple tool calls in sequence', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);

    await instrumented.measureEdge({ edge: 'neckline' });
    await instrumented.modifyEdge({ edge: 'neckline', delta: -2 });

    const record = recorder.finalize();
    expect(record.steps).toHaveLength(2);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[1].tool).toBe('modifyEdge');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/ExecutorMiddleware.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement ExecutorMiddleware**

```typescript
import type { ToolRegistry, ToolFunction } from '../../reasoning/bridge/Executor';
import { ExecutionRecorder } from '../ExecutionRecorder';

let stepCounter = 0;

export function createInstrumentedTools(
  tools: ToolRegistry,
  recorder: ExecutionRecorder
): ToolRegistry {
  stepCounter = 0;
  const instrumented: ToolRegistry = {};

  for (const [name, tool] of Object.entries(tools)) {
    instrumented[name] = createInstrumentedTool(name, tool, recorder);
  }

  return instrumented;
}

function createInstrumentedTool(
  toolName: string,
  tool: ToolFunction,
  recorder: ExecutionRecorder
): ToolFunction {
  return async (params: Record<string, unknown>) => {
    stepCounter++;
    const stepId = `debug_step_${stepCounter}`;

    recorder.recordStepStart(stepId, toolName, `${toolName} call`);
    recorder.recordStepParams(stepId, params, params, []);

    try {
      const result = await tool(params);

      if (result.success) {
        recorder.recordStepEnd(stepId, true, result.data);
      } else {
        recorder.recordStepError(stepId, result.error ?? 'Unknown error');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recorder.recordStepError(stepId, message);
      throw error;
    }
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/ExecutorMiddleware.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/middleware/ExecutorMiddleware.ts src/copilot/debug/__tests__/ExecutorMiddleware.test.ts
git commit -m "feat(debug): add ExecutorMiddleware for recording tool calls"
```

---

### Task 7: ConsoleLogger

Formats `ExecutionRecord` into structured console output with groups, tables, and colors.

**Files:**
- Create: `src/copilot/debug/ConsoleLogger.ts`
- Create: `src/copilot/debug/__tests__/ConsoleLogger.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger } from '../ConsoleLogger';
import type { ExecutionRecord } from '../types';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const makeRecord = (overrides?: Partial<ExecutionRecord>): ExecutionRecord => ({
    id: 'test-id',
    timestamp: Date.now(),
    userRequest: 'reduce neckline 2cm',
    duration: 1243,
    success: true,
    planning: {
      systemPrompt: 'You are a pattern assistant...',
      toolsProvided: ['modifyEdge', 'measureEdge'],
      rawResponse: '{"intent":"reduce","steps":[]}',
      parsedPlan: { intent: 'reduce neckline', steps: [] },
      duration: 823,
    },
    steps: [],
    ...overrides,
  });

  it('logs a successful run with console.group', () => {
    logger.log(makeRecord());
    expect(console.group).toHaveBeenCalled();
    expect(console.groupEnd).toHaveBeenCalled();
  });

  it('uses console.error for failed runs', () => {
    logger.log(makeRecord({ success: false, error: 'Plan failed' }));
    expect(console.error).toHaveBeenCalled();
  });

  it('logs planning phase details', () => {
    logger.log(makeRecord());
    // Should log tools provided
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allLogs = logCalls.map(c => String(c)).join(' ');
    expect(allLogs).toContain('modifyEdge');
  });

  it('logs step details with params', () => {
    logger.log(makeRecord({
      steps: [{
        stepId: 's1',
        tool: 'measureEdge',
        label: 'Measure neckline',
        rawParams: { pieceId: '$p1.result.id' },
        resolvedParams: { pieceId: 'front-bodice' },
        variableResolutions: [{ variable: '$p1.result.id', resolvedValue: 'front-bodice' }],
        success: true,
        result: { length: 24.5 },
        duration: 89,
        retries: [],
      }],
    }));

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allLogs = logCalls.map(c => String(c)).join(' ');
    expect(allLogs).toContain('measureEdge');
  });

  it('logs retries with console.warn', () => {
    logger.log(makeRecord({
      steps: [{
        stepId: 's1',
        tool: 'modifyEdge',
        label: 'Modify',
        rawParams: {},
        resolvedParams: {},
        variableResolutions: [],
        success: true,
        result: null,
        duration: 500,
        retries: [{
          attempt: 1,
          error: 'Constraint violation',
          reasonerInput: {
            failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: {}, label: '' },
            error: 'Constraint violation',
            resultsSoFar: [],
            originalIntent: 'test',
          },
          reasonerDecision: { action: 'retry', newParams: { delta: -1 } },
          reasonerDuration: 340,
        }],
      }],
    }));

    expect(console.warn).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/ConsoleLogger.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement ConsoleLogger**

```typescript
import type { ExecutionRecord, StepRecord, RetryRecord } from './types';

export class ConsoleLogger {
  log(record: ExecutionRecord): void {
    const status = record.success ? '\u2713' : '\u2717';
    const color = record.success ? 'color: green' : 'color: red';

    console.group(
      `%c[Bridge] "${record.userRequest}" (${record.duration}ms) ${status}`,
      `font-weight: bold; ${color}`
    );

    this.logPlanning(record);
    this.logSteps(record.steps);

    if (record.error) {
      console.error('Error:', record.error);
    }

    if (record.summary) {
      console.log('Summary:', record.summary.short);
    }

    console.groupEnd();
  }

  private logPlanning(record: ExecutionRecord): void {
    const planning = record.planning;

    console.groupCollapsed(
      `%c\ud83d\udccb Planning (${Math.round(planning.duration)}ms${planning.tokenUsage ? `, ${planning.tokenUsage.input + planning.tokenUsage.output} tokens` : ''})`,
      'color: #6366f1'
    );

    console.log('Tools:', planning.toolsProvided.join(', '));

    console.groupCollapsed('System prompt');
    console.log(planning.systemPrompt);
    console.groupEnd();

    console.groupCollapsed('Raw response');
    console.log(planning.rawResponse);
    console.groupEnd();

    if (planning.parsedPlan) {
      console.log('Parsed plan:', planning.parsedPlan);
    }

    if (planning.parseError) {
      console.error('Parse error:', planning.parseError);
    }

    console.groupEnd();
  }

  private logSteps(steps: StepRecord[]): void {
    for (let i = 0; i < steps.length; i++) {
      this.logStep(steps[i], i);
    }
  }

  private logStep(step: StepRecord, index: number): void {
    const status = step.success ? '\u2713' : '\u2717';
    const color = step.success ? 'color: green' : 'color: red';
    const retryNote = step.retries.length > 0 ? ` (${step.retries.length} retries)` : '';

    console.group(
      `%c\u26a1 Step ${index + 1}: ${step.tool} (${Math.round(step.duration)}ms) ${status}${retryNote}`,
      color
    );

    // Params comparison
    if (step.variableResolutions.length > 0) {
      console.log('Params (raw):', step.rawParams);
      console.log('Params (resolved):', step.resolvedParams);
      console.table(
        step.variableResolutions.map(v => ({
          variable: v.variable,
          resolved: JSON.stringify(v.resolvedValue),
        }))
      );
    } else {
      console.log('Params:', step.resolvedParams);
    }

    // Result
    if (step.success) {
      console.log('Result:', step.result);
    } else {
      console.error('Error:', step.error);
    }

    // Retries
    for (const retry of step.retries) {
      this.logRetry(retry);
    }

    console.groupEnd();
  }

  private logRetry(retry: RetryRecord): void {
    console.warn(
      `\ud83d\udd04 Retry ${retry.attempt}: ${retry.error}`
    );
    console.log('  Reasoner decision:', retry.reasonerDecision);
    console.log(`  Reasoner duration: ${Math.round(retry.reasonerDuration)}ms`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/ConsoleLogger.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/ConsoleLogger.ts src/copilot/debug/__tests__/ConsoleLogger.test.ts
git commit -m "feat(debug): add ConsoleLogger for structured DevTools output"
```

---

### Task 8: DebugStore (IndexedDB Persistence)

**Files:**
- Create: `src/copilot/debug/DebugStore.ts`
- Create: `src/copilot/debug/__tests__/DebugStore.test.ts`

**Step 1: Write the failing tests**

Note: IndexedDB tests need `fake-indexeddb` or similar. Vitest's jsdom environment may provide it. If not, mock the store interface.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DebugStore } from '../DebugStore';
import type { ExecutionRecord } from '../types';

const makeRecord = (id: string, success = true, daysAgo = 0): ExecutionRecord => ({
  id,
  timestamp: Date.now() - daysAgo * 86400000,
  userRequest: `request-${id}`,
  duration: 1000,
  success,
  planning: {
    systemPrompt: '',
    toolsProvided: [],
    rawResponse: '',
    parsedPlan: null,
    duration: 0,
  },
  steps: [],
});

describe('DebugStore', () => {
  let store: DebugStore;

  beforeEach(() => {
    store = new DebugStore();
    store.clear();
  });

  it('saves and retrieves a record', () => {
    const record = makeRecord('r1');
    store.save(record);

    const retrieved = store.getById('r1');
    expect(retrieved?.id).toBe('r1');
    expect(retrieved?.userRequest).toBe('request-r1');
  });

  it('returns null for non-existent record', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('getAll returns all records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));

    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('getRecent returns most recent N records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));
    store.save(makeRecord('r3'));

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
  });

  it('getFailures returns only failed records', () => {
    store.save(makeRecord('r1', true));
    store.save(makeRecord('r2', false));
    store.save(makeRecord('r3', false));

    const failures = store.getFailures();
    expect(failures).toHaveLength(2);
    expect(failures.every(r => !r.success)).toBe(true);
  });

  it('clear removes all records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));

    store.clear();
    expect(store.getAll()).toHaveLength(0);
  });

  it('pruneOlderThan removes old records', () => {
    store.save(makeRecord('old', true, 10));
    store.save(makeRecord('recent', true, 1));

    store.pruneOlderThan(7);
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('recent');
  });

  it('exportAsJSON returns valid JSON string', () => {
    store.save(makeRecord('r1'));

    const json = store.exportAsJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('r1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/DebugStore.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement DebugStore**

Start with an in-memory implementation backed by localStorage for simplicity. IndexedDB can be added later for larger datasets.

```typescript
import type { ExecutionRecord } from './types';

const STORAGE_KEY = 'openclo-debug-records';
const MAX_RECORDS = 100;

export class DebugStore {
  private records: ExecutionRecord[] = [];
  private loaded = false;

  private ensureLoaded(): void {
    if (this.loaded) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.records = raw ? JSON.parse(raw) : [];
    } catch {
      this.records = [];
    }
    this.loaded = true;
  }

  private persist(): void {
    try {
      // Keep only the most recent MAX_RECORDS
      if (this.records.length > MAX_RECORDS) {
        this.records = this.records.slice(-MAX_RECORDS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // localStorage may be full or unavailable
    }
  }

  save(record: ExecutionRecord): void {
    this.ensureLoaded();
    this.records.push(record);
    this.persist();
  }

  getById(id: string): ExecutionRecord | null {
    this.ensureLoaded();
    return this.records.find(r => r.id === id) ?? null;
  }

  getAll(): ExecutionRecord[] {
    this.ensureLoaded();
    return [...this.records];
  }

  getRecent(limit: number): ExecutionRecord[] {
    this.ensureLoaded();
    return this.records.slice(-limit);
  }

  getFailures(): ExecutionRecord[] {
    this.ensureLoaded();
    return this.records.filter(r => !r.success);
  }

  clear(): void {
    this.records = [];
    this.loaded = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  pruneOlderThan(days: number): void {
    this.ensureLoaded();
    const cutoff = Date.now() - days * 86400000;
    this.records = this.records.filter(r => r.timestamp >= cutoff);
    this.persist();
  }

  exportAsJSON(): string {
    this.ensureLoaded();
    return JSON.stringify(this.records, null, 2);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/DebugStore.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/copilot/debug/DebugStore.ts src/copilot/debug/__tests__/DebugStore.test.ts
git commit -m "feat(debug): add DebugStore for persistent execution records"
```

---

### Task 9: Debug API and Factory Function

Wire everything together: `createDebugBridge` factory and `window.__openclo_debug` console API.

**Files:**
- Create: `src/copilot/debug/debugAPI.ts`
- Create: `src/copilot/debug/createDebugBridge.ts`
- Create: `src/copilot/debug/index.ts`
- Create: `src/copilot/debug/__tests__/createDebugBridge.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDebugBridge, isDebugEnabled } from '../createDebugBridge';
import type { BridgeOptions, BridgeResult } from '../../reasoning/bridge/ExecutionBridge';

describe('createDebugBridge', () => {
  const mockOptions: BridgeOptions = {
    plannerLLM: vi.fn().mockResolvedValue('{"intent":"test","steps":[{"type":"execute","id":"s1","tool":"measureEdge","params":{"edge":"neckline"},"label":"Measure"}]}'),
    evaluator: vi.fn().mockResolvedValue({ success: true, data: {} }),
    reasonerLLM: vi.fn().mockResolvedValue({ action: 'abort' }),
    tools: {
      measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('openclo-debug-bridge');
  });

  it('isDebugEnabled returns false by default', () => {
    expect(isDebugEnabled()).toBe(false);
  });

  it('isDebugEnabled returns true when localStorage flag is set', () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    expect(isDebugEnabled()).toBe(true);
  });

  it('creates a working bridge', async () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { bridge } = createDebugBridge(mockOptions);

    const result = await bridge.run('test');
    expect(result.success).toBe(true);
  });

  it('returns debug store when debug is enabled', () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { store } = createDebugBridge(mockOptions);
    expect(store).toBeDefined();
  });

  it('returns null store when debug is disabled', () => {
    const { store } = createDebugBridge(mockOptions);
    expect(store).toBeNull();
  });

  it('persists execution records when debug is enabled', async () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { bridge, store } = createDebugBridge(mockOptions);

    await bridge.run('test request');

    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].userRequest).toBe('test request');
    expect(records[0].success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/createDebugBridge.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement debugAPI.ts**

```typescript
import type { DebugStore } from './DebugStore';

export interface DebugAPI {
  getRecords: () => ReturnType<DebugStore['getAll']>;
  getFailures: () => ReturnType<DebugStore['getFailures']>;
  getRecord: (id: string) => ReturnType<DebugStore['getById']>;
  getRecent: (limit?: number) => ReturnType<DebugStore['getRecent']>;
  exportJSON: () => ReturnType<DebugStore['exportAsJSON']>;
  clear: () => void;
  enable: () => void;
  disable: () => void;
}

export function createDebugAPI(store: DebugStore): DebugAPI {
  return {
    getRecords: () => store.getAll(),
    getFailures: () => store.getFailures(),
    getRecord: (id: string) => store.getById(id),
    getRecent: (limit = 10) => store.getRecent(limit),
    exportJSON: () => store.exportAsJSON(),
    clear: () => store.clear(),
    enable: () => localStorage.setItem('openclo-debug-bridge', 'true'),
    disable: () => localStorage.setItem('openclo-debug-bridge', 'false'),
  };
}
```

**Step 4: Implement createDebugBridge.ts**

```typescript
import { ExecutionBridge, type BridgeOptions } from '../reasoning/bridge/ExecutionBridge';
import { PlannerMiddleware } from './middleware/PlannerMiddleware';
import { ReasonerMiddleware } from './middleware/ReasonerMiddleware';
import { createInstrumentedTools } from './middleware/ExecutorMiddleware';
import { ExecutionRecorder } from './ExecutionRecorder';
import { ConsoleLogger } from './ConsoleLogger';
import { DebugStore } from './DebugStore';
import { createDebugAPI } from './debugAPI';

export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('openclo-debug-bridge') === 'true';
  } catch {
    return false;
  }
}

export interface DebugBridgeResult {
  bridge: ExecutionBridge;
  store: DebugStore | null;
}

export function createDebugBridge(options: BridgeOptions): DebugBridgeResult {
  if (!isDebugEnabled()) {
    return {
      bridge: new ExecutionBridge(options),
      store: null,
    };
  }

  const recorder = new ExecutionRecorder();
  const logger = new ConsoleLogger();
  const store = new DebugStore();

  // Wrap the plannerLLM to record the raw LLM response
  const originalPlannerLLM = options.plannerLLM;
  const wrappedPlannerLLM = async (userRequest: string) => {
    recorder.start(userRequest);
    const response = await originalPlannerLLM(userRequest);
    return response;
  };

  // Instrument tools to record step execution
  const instrumentedTools = createInstrumentedTools(
    options.tools as Record<string, (params: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>>,
    recorder
  );

  // Create bridge with instrumented components
  const bridge = new ExecutionBridge({
    ...options,
    plannerLLM: wrappedPlannerLLM,
    tools: instrumentedTools,
  });

  // Listen for execution:complete to finalize and persist
  bridge.on((event) => {
    if (event.type === 'plan:start') {
      // Record planning info from the plan event
      const toolNames = event.plan.steps
        .filter(s => s.type === 'execute')
        .map(s => (s as { tool: string }).tool);
      recorder.recordPlanningStart('', [...new Set(toolNames)]);
      recorder.recordPlanningEnd('', event.plan);
    }

    if (event.type === 'execution:complete') {
      const record = recorder.finalize();
      record.success = event.success;
      record.summary = event.summary;
      logger.log(record);
      store.save(record);
      recorder.reset();
    }

    if (event.type === 'plan:error') {
      const record = recorder.finalize();
      record.success = false;
      record.error = event.error;
      logger.log(record);
      store.save(record);
      recorder.reset();
    }
  });

  // Expose debug API in dev mode
  if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__openclo_debug = createDebugAPI(store);
  }

  return { bridge, store };
}
```

**Step 5: Implement index.ts**

```typescript
export { createDebugBridge, isDebugEnabled } from './createDebugBridge';
export { DebugStore } from './DebugStore';
export { ConsoleLogger } from './ConsoleLogger';
export { ExecutionRecorder } from './ExecutionRecorder';
export { createDebugAPI } from './debugAPI';
export type { ExecutionRecord, StepRecord, PlanningRecord, RetryRecord, VariableResolution, TokenUsage } from './types';
export type { DebugAPI } from './debugAPI';
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run src/copilot/debug/__tests__/createDebugBridge.test.ts`
Expected: All PASS

**Step 7: Run ALL debug tests**

Run: `npx vitest run src/copilot/debug/`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/copilot/debug/
git commit -m "feat(debug): add createDebugBridge factory, debugAPI, and barrel exports"
```

---

### Task 10: Integration with useBridge Hook

Wire `createDebugBridge` into the existing `useBridge` hook so that when the debug flag is set, the hook automatically uses the instrumented bridge.

**Files:**
- Modify: `src/copilot/hooks/useBridge.ts`

**Step 1: Read the current hook implementation**

File: `src/copilot/hooks/useBridge.ts`
The key is the `getBridge` callback that lazily creates the ExecutionBridge. We need to replace `new ExecutionBridge(...)` with `createDebugBridge(...)`.

**Step 2: Modify getBridge to use createDebugBridge**

In `useBridge.ts`, add import:
```typescript
import { createDebugBridge } from '../debug';
```

Then in `getBridge`, replace:
```typescript
bridgeRef.current = new ExecutionBridge({ ... });
```
with:
```typescript
const { bridge } = createDebugBridge({ ... });
bridgeRef.current = bridge;
```

**Step 3: Run all tests**

Run: `npx vitest run src/copilot/`
Expected: All tests pass.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/copilot/hooks/useBridge.ts
git commit -m "feat(debug): integrate createDebugBridge into useBridge hook"
```

---

### Task 11: Full Integration Test

Test the complete flow end-to-end: user request → debug recording → console output → persistence.

**Files:**
- Create: `src/copilot/debug/__tests__/integration.test.ts`

**Step 1: Write the integration test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDebugBridge } from '../createDebugBridge';
import type { BridgeOptions } from '../../reasoning/bridge/ExecutionBridge';

describe('Debug Suite Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('openclo-debug-bridge', 'true');
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('records a full successful execution', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'measure neckline',
        steps: [{
          type: 'execute',
          id: 's1',
          tool: 'measureEdge',
          params: { edge: 'neckline' },
          label: 'Measure neckline edge',
        }],
      })),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn(),
      tools: {
        measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
      },
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('measure the neckline');

    expect(result.success).toBe(true);

    // Verify record was persisted
    const records = store!.getAll();
    expect(records).toHaveLength(1);

    const record = records[0];
    expect(record.userRequest).toBe('measure the neckline');
    expect(record.success).toBe(true);
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[0].success).toBe(true);

    // Verify console was called
    expect(console.group).toHaveBeenCalled();
  });

  it('records a failed execution with error', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'modify neckline',
        steps: [{
          type: 'execute',
          id: 's1',
          tool: 'modifyEdge',
          params: { delta: -2 },
          label: 'Modify neckline',
        }],
      })),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn().mockResolvedValue({ action: 'abort', reason: 'Cannot recover' }),
      tools: {
        modifyEdge: vi.fn().mockResolvedValue({ success: false, error: 'Constraint violation' }),
      },
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('reduce neckline 2cm');

    expect(result.success).toBe(false);

    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].success).toBe(false);
  });

  it('records planning failure', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue('not valid json at all'),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn(),
      tools: {},
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('anything');

    expect(result.success).toBe(false);

    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].success).toBe(false);
  });
});
```

**Step 2: Run integration test**

Run: `npx vitest run src/copilot/debug/__tests__/integration.test.ts`
Expected: All PASS

**Step 3: Run ALL project tests**

Run: `npm run test`
Expected: All tests pass, no regressions.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/copilot/debug/__tests__/integration.test.ts
git commit -m "test(debug): add full integration test for debugging suite"
```

---

### Task 12: Final Verification and Cleanup

**Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Verify file structure**

Expected structure:
```
src/copilot/debug/
├── types.ts
├── ExecutionRecorder.ts
├── ConsoleLogger.ts
├── DebugStore.ts
├── debugAPI.ts
├── createDebugBridge.ts
├── index.ts
├── middleware/
│   ├── PlannerMiddleware.ts
│   ├── ExecutorMiddleware.ts
│   └── ReasonerMiddleware.ts
└── __tests__/
    ├── interfaces.test.ts
    ├── ExecutionRecorder.test.ts
    ├── PlannerMiddleware.test.ts
    ├── ReasonerMiddleware.test.ts
    ├── ExecutorMiddleware.test.ts
    ├── ConsoleLogger.test.ts
    ├── DebugStore.test.ts
    ├── createDebugBridge.test.ts
    └── integration.test.ts
```

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(debug): final cleanup for copilot debugging suite"
```
