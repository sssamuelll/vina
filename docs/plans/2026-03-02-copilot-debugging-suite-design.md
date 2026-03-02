# Copilot Debugging Suite — Design Document

> **Date**: 2026-03-02
> **Status**: Approved
> **Approach**: Middleware Pipeline (Approach B)

## Problem

The copilot bridge (Planner → Executor → Reasoner) has zero observability:

- Can't see what the Planner LLM generated (prompt, raw response, parsed plan)
- Can't trace step failures (exact params, tool state, Reasoner decisions)
- No execution history — after a run completes, everything is gone
- No timing metrics, no token usage tracking, no variable resolution tracing

The bridge emits 13 event types but nothing consumes them for debugging. ResultStore is cleared between runs. There is no persistent log or structured output.

## Target User

Developer (Samuel) during local development. Not end-user-facing.

## Architecture

```
User Request
     │
     ▼
┌─────────────────────────────────────────┐
│ DebugMiddleware                         │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Planner   │  │ Executor │  │Reasoner││
│  │Middleware │  │Middleware │  │Middlewr ││
│  └─────┬─────┘  └─────┬────┘  └───┬────┘│
│        │              │            │     │
│        ▼              ▼            ▼     │
│  ┌───────────────────────────────────┐   │
│  │        ExecutionRecorder          │   │
│  │  (collects all debug data)        │   │
│  └──────────────┬────────────────────┘   │
│                 │                        │
│     ┌───────────┼───────────┐           │
│     ▼           ▼           ▼           │
│  Console    IndexedDB    Export          │
│  Logger     Store        (JSON)          │
└─────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|---------------|
| `PlannerMiddleware` | Captures: prompt sent to LLM, raw response, parsed plan, parse errors, duration, token count |
| `ExecutorMiddleware` | Captures: per-step params (before + after variable resolution), tool call I/O, duration, retry attempts |
| `ReasonerMiddleware` | Captures: failure context sent to LLM, decision returned, duration |
| `ExecutionRecorder` | Aggregates all data into a single `ExecutionRecord` per run |
| `ConsoleLogger` | Formats records with `console.group`/`console.table` in DevTools |
| `DebugStore` | Persists records to IndexedDB with 7-day TTL cleanup |

### Integration Pattern

Decorator pattern wrapping existing components. Requires extracting interfaces from Planner, Executor, Reasoner.

```typescript
function createDebugBridge(config: BridgeConfig): ExecutionBridge {
  const bridge = new ExecutionBridge(config);

  if (isDebugEnabled()) {
    const recorder = new ExecutionRecorder();
    const logger = new ConsoleLogger();
    const store = new DebugStore();

    bridge.planner = new PlannerMiddleware(bridge.planner, recorder);
    bridge.executor = new ExecutorMiddleware(bridge.executor, recorder);
    bridge.reasoner = new ReasonerMiddleware(bridge.reasoner, recorder);

    bridge.on((event) => {
      if (event.type === 'execution:complete') {
        const record = recorder.finalize();
        logger.log(record);
        store.save(record);
        recorder.reset();
      }
    });

    if (import.meta.env.DEV) {
      (window as any).__openclo_debug = createDebugAPI(store);
    }
  }

  return bridge;
}
```

## Data Model

### ExecutionRecord

```typescript
interface ExecutionRecord {
  id: string;                          // UUID
  timestamp: number;                   // Date.now()
  userRequest: string;                 // Original user message
  duration: number;                    // Total ms
  success: boolean;

  planning: {
    systemPrompt: string;              // Full prompt sent to LLM
    toolsProvided: string[];           // Tool names in context
    rawResponse: string;               // Raw LLM output
    parsedPlan: ExecutionPlan | null;
    parseError?: string;
    duration: number;
    tokenUsage?: { input: number; output: number };
  };

  steps: StepRecord[];
  summary?: ExpandableSummary;
  error?: string;
}
```

### StepRecord

```typescript
interface StepRecord {
  stepId: string;
  tool: string;
  label: string;

  rawParams: Record<string, unknown>;     // Before variable resolution
  resolvedParams: Record<string, unknown>; // After resolution
  variableResolutions: Array<{
    variable: string;
    resolvedValue: unknown;
  }>;

  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;

  retries: Array<{
    attempt: number;
    error: string;
    reasonerInput: ReasonerInput;
    reasonerDecision: ReasonerDecision;
    reasonerDuration: number;
    reasonerTokenUsage?: { input: number; output: number };
  }>;
}
```

## Console Output Format

All logging gated behind `localStorage.getItem('openclo-debug-bridge') === 'true'`.

```
▶ [Bridge] "reduce el ancho de escote 2cm"  (1,243ms) ✓
  ├─ 📋 Planning (823ms, 1.2k tokens)
  │   System prompt: [collapsed]
  │   Tools: [modifyEdge, measureEdge, getPiece, ...]
  │   Raw response: [collapsed]
  │   Parsed plan: { intent: "...", steps: [...] }
  │
  ├─ ⚡ Step 1: measureEdge (89ms) ✓
  │   Params (raw):     { pieceId: "$piece1.id", edgeName: "neckline" }
  │   Params (resolved): { pieceId: "front-bodice", edgeName: "neckline" }
  │   Variables: $piece1.id → "front-bodice"
  │   Result: { length: 24.5, unit: "cm" }
  │
  ├─ ⚡ Step 2: modifyEdge (156ms) ✗ → retry
  │   Params: { ... }
  │   Error: "Edge modification exceeds constraint bounds"
  │   ├─ 🔄 Retry 1:
  │   │   Reasoner decision: { action: "retry", newParams: { delta: -1.5 } }
  │   │   Duration: 340ms
  │   └─ Result: { success: true, newLength: 23.0 }
  │
  └─ Summary: "Neckline reduced from 24.5cm to 23.0cm"
```

Uses `console.group`/`console.groupEnd`, `console.table`, `console.warn`/`console.error`, and `%c` CSS color coding.

## Persistence

### DebugStore (IndexedDB)

```typescript
class DebugStore {
  save(record: ExecutionRecord): Promise<void>;
  getAll(): Promise<ExecutionRecord[]>;
  getById(id: string): Promise<ExecutionRecord | null>;
  getRecent(limit: number): Promise<ExecutionRecord[]>;
  getFailures(): Promise<ExecutionRecord[]>;
  clear(): Promise<void>;
  pruneOlderThan(days: number): Promise<void>;  // Default: 7 days
  exportAsJSON(): Promise<string>;
}
```

### Console Debug API

Exposed on `window.__openclo_debug` in dev mode:

```javascript
window.__openclo_debug = {
  getRecords: () => debugStore.getAll(),
  getFailures: () => debugStore.getFailures(),
  getRecord: (id) => debugStore.getById(id),
  exportJSON: () => debugStore.exportAsJSON(),
  clear: () => debugStore.clear(),
  enable: () => localStorage.setItem('openclo-debug-bridge', 'true'),
  disable: () => localStorage.setItem('openclo-debug-bridge', 'false'),
};
```

## Activation

- **Feature flag**: `localStorage.setItem('openclo-debug-bridge', 'true')`
- **Console API**: `__openclo_debug.enable()` / `__openclo_debug.disable()`
- **Default**: Disabled in production, disabled in dev (opt-in)

## File Structure

```
src/copilot/debug/
├── types.ts                 # ExecutionRecord, StepRecord interfaces
├── ExecutionRecorder.ts     # Aggregates debug data during a run
├── ConsoleLogger.ts         # Structured console output
├── DebugStore.ts            # IndexedDB persistence
├── middleware/
│   ├── PlannerMiddleware.ts
│   ├── ExecutorMiddleware.ts
│   └── ReasonerMiddleware.ts
├── createDebugBridge.ts     # Factory function
├── debugAPI.ts              # window.__openclo_debug helpers
└── __tests__/
    ├── ExecutionRecorder.test.ts
    ├── ConsoleLogger.test.ts
    ├── DebugStore.test.ts
    ├── PlannerMiddleware.test.ts
    ├── ExecutorMiddleware.test.ts
    └── ReasonerMiddleware.test.ts
```

## Interface Extraction

Requires extracting interfaces from existing bridge components:

- `IPlanner` from `Planner.ts`
- `IExecutor` from `Executor.ts`
- `IReasoner` from `Reasoner.ts`

These interfaces enable the decorator pattern without modifying the original classes.

## Non-Goals

- No debug UI panel (console only for now)
- No execution replay (log format supports it for future)
- No end-user-facing error transparency
- No production logging (dev-only)
