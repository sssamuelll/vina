# Copilot Bridge Architecture - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign copilot to execute step-by-step with Bridge control, eliminate hallucinations, and provide minimal UI verbosity.

**Architecture:** Planner + Executor + Reasoner pattern with inline progress UI.

**Epic Issue:** #203

---

## Problem Statement

Current copilot has critical issues:

1. **Hallucination**: LLM invents measurements ("40.61mm" when actual is "314mm")
2. **Incomplete Execution**: 5-round limit causes tasks to stop mid-operation
3. **Verbose Chat**: Unnecessary explanations fill the conversation
4. **LLM Controls Flow**: Agent decides when to stop, not the system

## Solution Overview

**Planner + Executor + Reasoner** architecture:

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ PLANNER (LLM)                                           │
│ - Single call to generate execution plan                │
│ - Output: JSON tool sequence (no prose)                 │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ EXECUTOR (Bridge - no LLM)                              │
│ - Runs steps sequentially                               │
│ - Emits progress events                                 │
│ - Collects results                                      │
│                                                         │
│ Step types:                                             │
│ - execute: Run tool, no LLM                             │
│ - evaluate: LLM interprets results (simulation, etc.)   │
└─────────────────────────────────────────────────────────┘
     │
     ▼ (on error)
┌─────────────────────────────────────────────────────────┐
│ REASONER (LLM - only on error)                          │
│ - Analyzes failure                                      │
│ - Decides: retry / alternative / ask user / abort       │
│ - If abort: rollback all completed steps                │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ SUMMARY (Template - no LLM)                             │
│ - Generate concise summary from actual results          │
│ - Expandable details on demand                          │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Plan-then-Execute | Minimizes hallucination risk |
| Progress UI | Inline in chat | No layout changes, simple |
| Error handling | Intelligent retry + rollback | Learn from errors, clean recovery |
| Response format | Expandable | Minimal by default, details on demand |
| Implementation | Full rewrite | No users yet, clean slate |

## Data Flow

### Phase 1: Planning

```typescript
// Planner receives
interface PlannerInput {
  userRequest: string;
  context: CopilotContext;      // from contextBuilder
  availableTools: ToolSchema[]; // from registry
}

// Planner outputs (JSON only, no prose)
interface ExecutionPlan {
  intent: string;               // "reduce_neckline"
  steps: Step[];
}
```

### Phase 2: Execution

```typescript
type Step = ExecuteStep | EvaluateStep;

interface ExecuteStep {
  type: 'execute';
  id: string;
  tool: string;
  params: Record<string, unknown>;
  label: string;  // for progress UI
}

interface EvaluateStep {
  type: 'evaluate';
  id: string;
  input: string;      // "$step1.result"
  decide: string;     // "Is fit acceptable?"
  label: string;
}
```

### Phase 3: Error Recovery

```typescript
interface ReasonerInput {
  failedStep: Step;
  error: string;
  resultsSoFar: StepResult[];
  originalIntent: string;
}

interface ReasonerDecision {
  action: 'retry' | 'alternative' | 'askUser' | 'abort';
  newParams?: Record<string, unknown>;
  newStep?: Step;
  question?: string;
  options?: string[];
  reason?: string;
}
```

### Phase 4: Summary

```typescript
interface ExpandableSummary {
  short: string;      // "Neckline reduced 2cm"
  details: string[];  // ["Front: 314→294mm", "Back: 253→233mm"]
}

// Generated from actual StepResult data, not LLM
```

## UI Components

### Inline Progress Message

```
┌─────────────────────────────────────────────────────┐
│ While running:                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📋 Reducing neckline 2cm                        │ │
│ │ ├─ ✓ Analyzing pieces                          │ │
│ │ ├─ ✓ Measuring Front (314mm)                   │ │
│ │ ├─ ● Modifying Front...                        │ │
│ │ └─ ○ Modifying Back                            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ When done (collapsed):                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ Neckline reduced 2cm                 [▼] [↺] │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ When expanded:                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ Neckline reduced 2cm                 [▲] [↺] │ │
│ │ ───────────────────────────────────────────────│ │
│ │ • Front: 314mm → 294mm                         │ │
│ │ • Back: 253mm → 233mm                          │ │
│ │ • 4 steps in 1.2s                              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ On error with question:                             │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⚠️ Reducing neckline 2cm                       │ │
│ │ ├─ ✓ Analyzing pieces                          │ │
│ │ ├─ ✗ Edge "neckline" not found                 │ │
│ │ │                                               │ │
│ │ │ Which edge should I modify?                  │ │
│ │ │ [back-neck] [cb-curve] [cancel]              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
src/copilot/
├── bridge/                      # NEW
│   ├── ExecutionBridge.ts       # Main orchestrator
│   ├── Planner.ts               # LLM planning
│   ├── Executor.ts              # Step execution
│   ├── Reasoner.ts              # Error recovery
│   ├── ResultStore.ts           # Result accumulation
│   ├── SummaryGenerator.ts      # Template-based summary
│   └── types.ts                 # All bridge types
│
├── components/
│   └── ProgressMessage/         # NEW
│       ├── ProgressMessage.tsx
│       ├── ProgressSteps.tsx
│       ├── ProgressQuestion.tsx
│       ├── ExpandableSummary.tsx
│       └── ProgressMessage.css
│
├── tools/                       # MODIFY - add rollback
├── providers/                   # KEEP
├── memory.ts                    # KEEP
├── contextBuilder.ts            # KEEP
├── vision/                      # KEEP
├── costManager.ts               # KEEP
├── errorRecovery.ts             # KEEP
│
├── agentLoop.ts                 # DELETE (Phase 4)
├── toolExecutor.ts              # DELETE (Phase 4)
├── commandExecutor.ts           # DELETE (Phase 4)
├── agentConnector.ts            # DELETE (Phase 4)
└── protocol.ts                  # CLEANUP (Phase 4)
```

## Migration Phases

### Phase 1: Create New System
- Create bridge/ directory with all components
- Create ProgressMessage/ UI components
- No changes to existing code

### Phase 2: Integrate
- Update CopilotPanel to use ExecutionBridge
- Keep old runAgentLoop() as fallback
- Add feature flag for switching

### Phase 3: Switch Default
- ExecutionBridge becomes default path
- Old path available via flag
- Full testing

### Phase 4: Cleanup
- Remove deprecated files
- Clean up protocol.ts
- Update tests

## Rollback System

Tools return rollback functions:

```typescript
interface StepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  rollback?: () => void;  // How to undo this step
}

// Example tool implementation
const modifyEdgeTool = {
  execute: (params, dispatch, getState) => {
    const original = getState().project.pieces[params.pieceId];

    dispatch(modifyEdge(params));

    return {
      success: true,
      data: { newLength: 294 },
      rollback: () => dispatch(restorePiece(params.pieceId, original))
    };
  }
};
```

## Anti-Hallucination Guarantees

1. **Planner outputs JSON only** - no prose, no invented data
2. **Executor has no LLM** - just runs tools, collects results
3. **Summary from results** - template-based, data from tool outputs
4. **Reasoner scoped** - only activated on error, structured output

## Success Metrics

1. **Completion rate**: 95%+ tasks complete (vs ~20% current)
2. **Accuracy**: 100% reported measurements are correct
3. **UX**: <3 lines in chat for typical operations
4. **Performance**: Progress visible in <500ms

## Related Issues

- #199 - Action limit → Resolved by Bridge control
- #200 - Claims without execution → Resolved by mandatory verification
- #201 - False measurements → Resolved by data from tools only
- #202 - Execution graph → Incorporated in this architecture
