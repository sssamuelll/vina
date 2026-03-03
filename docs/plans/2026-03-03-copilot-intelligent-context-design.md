# Copilot Intelligent Context — Design Document

> **Date**: 2026-03-03
> **Status**: Approved
> **Approach**: Agentic Planner + Structured Execution (OpenClaw-inspired)
> **Related**: Issue #209 (Intelligent Context Generation)

## Problem

The copilot bridge has two critical bugs and no context awareness:

1. **Bug 1**: `ExecutionBridge.generatePlan()` never calls `planner.buildSystemPrompt(tools)` — the Planner LLM receives only the user request text, with no tool schemas. It generates invalid JSON because it doesn't know what tools exist.

2. **Bug 2**: `ExecutionBridge.executeExecuteStep()` passes `step.params` directly to tools without resolving `$stepId.field` variable references. All variable-dependent parameters arrive as `undefined`.

3. **No context awareness**: The Planner doesn't know what pieces exist in the garment, what edges they have, or their current measurements. It can't map user language ("escote", "manga") to internal identifiers ("neckline", "sleeve").

## Target User

Developer (Samuel) during local development. Improving copilot reliability for end-user interactions.

## Design Principles

- **Non-deterministic semantic mapping**: No hardcoded dictionaries per language. The LLM naturally maps any language to internal identifiers when given proper context (tool schemas + garment state).
- **On-demand context gathering**: The Planner calls meta-tools to gather exactly the context it needs, rather than injecting everything upfront.
- **Structured execution**: Write operations stay in the Executor for observability, progress UI, rollback, and debug logging.

## Architecture

### Two-Phase Architecture

```
Phase 1: AGENTIC PLANNING (OpenClaw-inspired)
─────────────────────────────────────────────
User Request
    ↓
┌─────────────────────────────────────────────┐
│ AgenticPlanner                              │
│                                             │
│  System Prompt:                             │
│  ├─ Domain bootstrap (garment vocabulary)   │
│  ├─ Tool schemas (from registry)            │
│  ├─ Meta-tool schemas (read-only queries)   │
│  └─ Output format instructions              │
│                                             │
│  LLM Loop (tool_use API):                   │
│  ├─ Call 1: getGarmentState() → pieces...   │
│  ├─ Call 2: getPieceDetails("front") → ...  │
│  ├─ Call 3: measureEdge(...) → 24.5cm       │
│  └─ Final: output ExecutionPlan JSON        │
│                                             │
└─────────────────┬───────────────────────────┘
                  ↓
Phase 2: STRUCTURED EXECUTION (existing)
─────────────────────────────────────────
┌─────────────────────────────────────────────┐
│ Executor (no LLM, deterministic)            │
│  ├─ Step 1: modifyEdge({concrete params})   │
│  ├─ Step 2: ...                             │
│  └─ On error → EnhancedReasoner             │
└─────────────────────────────────────────────┘
```

### Key Difference from Current Architecture

The Planner is no longer a single-shot LLM call. It's an agentic loop that can call read-only meta-tools to gather context before outputting the execution plan. Plans have **concrete parameters** because the Planner already gathered the information it needs.

## Components

### AgenticPlanner

Replaces the current single-shot `generatePlan()` with an agentic loop:

```typescript
class AgenticPlanner {
  private llm: LLMClient;
  private metaTools: MetaTool[];
  private domainContext: string;
  private toolSchemas: ToolSchema[];

  async plan(userRequest: string): Promise<ExecutionPlan> {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.llm.chat(messages, {
        tools: this.metaToolSchemas,
        stopReason: ['end_turn', 'tool_use'],
      });

      if (response.stopReason === 'end_turn') {
        return this.parsePlan(response.content);
      }

      for (const toolCall of response.toolCalls) {
        const result = await this.executeMetaTool(toolCall);
        messages.push(
          { role: 'assistant', content: response.content, toolCalls: [toolCall] },
          { role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(result) },
        );
      }
    }
  }
}
```

**Safeguards**:
- Max 5 meta-tool calls per planning phase
- Token usage tracked per call for debugging
- Reuses existing `Planner.parsePlan()` for JSON validation

### Context Injection (3 Layers)

#### Layer 1: Domain Bootstrap (static)

```typescript
const DOMAIN_CONTEXT = `
You are a garment CAD copilot. You modify pattern pieces.

Available piece types: bodice, sleeve, skirt, collar, cuff, waistband...
Available edge types: neckline, armhole, sideSeam, hemline, shoulder...
Operations: modify edges, measure, move points, add seam allowance...

When the user speaks in any language, map their terms to internal identifiers.
Examples: "escote" = neckline, "manga" = sleeve, "costado" = sideSeam
`;
```

#### Layer 2: Tool Schemas (auto-generated from registry)

```typescript
tools.getSchemas().map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.schema,
}));
```

#### Layer 3: Meta-Tools (read-only, callable during planning)

| Meta-Tool | Purpose | Returns |
|-----------|---------|---------|
| `getGarmentState` | Overview of current garment | List of pieces with edges and basic measurements |
| `getPieceDetails` | Deep info on one piece | All edges, points, constraints, dimensions |
| `measureEdge` | Measure a specific edge | Length, angle, position |
| `searchPieces` | Find pieces by natural language | Matching pieces with relevance score |

### EnhancedReasoner

When a step fails, the Reasoner gets full context and can call meta-tools to find corrections:

```typescript
class EnhancedReasoner {
  private llm: LLMClient;
  private metaTools: MetaTool[];

  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    const messages = [
      { role: 'system', content: this.buildReasonerPrompt(input) },
      { role: 'user', content: 'Analyze this failure and decide how to recover.' },
    ];

    while (true) {
      const response = await this.llm.chat(messages, {
        tools: this.metaToolSchemas,
        stopReason: ['end_turn', 'tool_use'],
      });

      if (response.stopReason === 'end_turn') {
        return this.parseDecision(response.content);
      }

      for (const toolCall of response.toolCalls) {
        const result = await this.executeMetaTool(toolCall);
        messages.push(
          { role: 'assistant', content: response.content, toolCalls: [toolCall] },
          { role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(result) },
        );
      }
    }
  }
}
```

**Recovery Strategies**:

| Error Type | Reasoner Action |
|------------|----------------|
| `Unknown tool: X` | Search for correct tool name, retry |
| `Unknown piece: X` | Call `searchPieces(X)` → find match → retry |
| `Edge not found: X` | Call `getPieceDetails(pieceId)` → list edges → retry |
| `Value out of bounds` | Adjust parameter value, retry |
| `Ambiguous: multiple matches` | Ask user to clarify |
| `Unrecoverable` | Abort with explanation |

**Max retries per step**: 3 (configurable)

## Integration

### ExecutionBridge Changes

```typescript
class ExecutionBridge {
  private agenticPlanner: AgenticPlanner;
  private executor: Executor;
  private reasoner: EnhancedReasoner;

  async run(userRequest: string): Promise<ExecutionResult> {
    // Phase 1: Agentic Planning
    const plan = await this.agenticPlanner.plan(userRequest);

    // Phase 2: Structured Execution (with variable resolution fallback)
    return this.executor.execute(plan);
  }
}
```

### Debug Suite Adaptation

| Debug Component | Adaptation |
|----------------|------------|
| `PlannerMiddleware` | Wraps `AgenticPlanner.plan()` — captures each meta-tool call, duration, final plan |
| `ExecutorMiddleware` | Unchanged |
| `ReasonerMiddleware` | Wraps `EnhancedReasoner.analyze()` — captures meta-tool calls during recovery |
| `ExecutionRecorder` | New field: `planning.metaToolCalls: MetaToolCall[]` |
| `ConsoleLogger` | Shows meta-tool calls in planning section |

### Enhanced Console Output

```
▶ [Bridge] "reduce el escote 2cm"  (2,100ms) ✓
  ├─ 📋 Planning (1,200ms, 3 meta-tool calls)
  │   Meta-tool 1: getGarmentState() → 3 pieces
  │   Meta-tool 2: getPieceDetails("front-bodice") → 6 edges
  │   Meta-tool 3: measureEdge("front-bodice", "neckline") → 24.5cm
  │   Plan: 1 step (modifyEdge)
  │
  ├─ ⚡ Step 1: modifyEdge (156ms) ✓
  │   Params: { pieceId: "front-bodice", edge: "neckline", delta: -2 }
  │   Result: { newLength: 22.5 }
  │
  └─ Summary: "Neckline reduced from 24.5cm to 22.5cm"
```

## File Structure

```
src/copilot/reasoning/
├── bridge/
│   ├── ExecutionBridge.ts        # MODIFIED: Use AgenticPlanner
│   ├── AgenticPlanner.ts         # NEW: Agentic planning loop
│   ├── EnhancedReasoner.ts       # NEW: Smart retry with meta-tools
│   ├── MetaToolRegistry.ts       # NEW: Read-only meta-tool registry
│   ├── Planner.ts                # KEPT: parsePlan() reused
│   ├── Executor.ts               # KEPT: resolveParams() kept as fallback
│   └── Reasoner.ts               # KEPT: Base class
├── meta-tools/
│   ├── getGarmentState.ts        # NEW
│   ├── getPieceDetails.ts        # NEW
│   ├── measureEdge.ts            # NEW
│   └── searchPieces.ts           # NEW
└── context/
    └── domainBootstrap.ts        # NEW: Static domain knowledge prompt
```

## Non-Goals

- No deterministic language dictionaries (LLM handles semantic mapping)
- No execution replay (log format supports it for future)
- No multi-agent orchestration (single copilot agent)
- No persistent memory across sessions (future enhancement)
