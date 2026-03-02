# Copilot Architecture Cleanup - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Consolidate copilot architecture by eliminating legacy code, reorganizing into cognitive layers, adding security validation, and unifying tool execution.

**Architecture:** 4-phase sequential cleanup (DELETE → REORGANIZE → SECURE → UNIFY) that leaves the system functional after each phase.

**Epic Issue:** Architecture Cleanup Audit

---

## Problem Statement

Current copilot has 4 major issues identified in audit:

1. **Fragmentation**: Two execution systems (`agentLoop.ts` deprecated + `bridge/`) running in parallel
2. **Directory Entropy**: 18+ subdirectories with overlapping concepts (intelligence/, knowledge/, vision/, llm/, planner/)
3. **Naive Security**: API keys in localStorage, only 1 file uses Zod validation
4. **Tool Duplication**: 3 different tool execution systems (commandExecutor, toolExecutor, bridge/Executor)

## Solution: 4-Phase Sequential Cleanup

```
Phase 1: DELETE    → Remove legacy code (agentLoop, commandExecutor, feature flag)
Phase 2: REORGANIZE → Restructure into cognitive layers (perception/, reasoning/, action/)
Phase 3: SECURE    → Add Zod validation + SecureStorage for API keys
Phase 4: UNIFY     → Single ToolRegistry used by all components
```

---

## Phase 1: DELETE Legacy Code

### Files to Delete
```
src/copilot/agentLoop.ts
src/copilot/commandExecutor.ts
src/copilot/features.ts
src/copilot/__tests__/agentLoop.test.ts
src/__tests__/commandExecutor.test.ts
```

### Files to Modify
```typescript
// src/components/CopilotPanel/CopilotPanel.tsx
// Remove:
// - import { runAgentLoop } from '../../copilot/agentLoop';
// - import { executeCommands } from '../../copilot/commandExecutor';
// - import { isBridgeModeEnabled } from '../../copilot/features';
// - All code paths using these imports
// Keep: useBridge hook only
```

### Validation
- Build passes
- All 2600+ tests pass
- Copilot functions via bridge mode only

---

## Phase 2: REORGANIZE Directory Structure

### New Structure
```
src/copilot/
├── perception/           # "See" - understand context
│   ├── geometryClassifier.ts    (← from vision/)
│   ├── spatialDescriber.ts      (← from vision/)
│   ├── contextBuilder.ts        (← from root)
│   ├── languageDetection.ts     (← from root)
│   ├── designLog.ts             (← from vision/)
│   └── types.ts
│
├── reasoning/            # "Think" - plan and decide
│   ├── bridge/                  (← keep as-is)
│   │   ├── ExecutionBridge.ts
│   │   ├── Planner.ts
│   │   ├── Reasoner.ts
│   │   ├── Executor.ts
│   │   ├── ResultStore.ts
│   │   ├── SummaryGenerator.ts
│   │   └── types.ts
│   ├── intelligence/            (← keep as-is)
│   │   ├── SemanticResolver.ts
│   │   ├── ContextEnricher.ts
│   │   ├── GarmentKnowledge.ts
│   │   ├── MeasurementCalculator.ts
│   │   ├── PieceClassifier.ts
│   │   └── types.ts
│   └── proactiveAnalysis.ts     (← from root)
│
├── action/               # "Act" - execute changes
│   ├── tools/                   (← keep structure)
│   │   ├── registry.ts
│   │   ├── executor.ts          (← rename from toolExecutor.ts)
│   │   ├── validation.ts        (← new, Phase 3)
│   │   └── definitions/
│   └── skills/                  (← keep as-is)
│
├── providers/            # LLM providers (keep as-is)
│   ├── anthropic.ts
│   ├── openai.ts
│   ├── deepseek.ts
│   ├── ollama.ts
│   ├── claudeBridge.ts
│   ├── secureStorage.ts         (← new, Phase 3)
│   └── types.ts
│
├── memory/               # Persistence
│   └── ProjectMemory.ts         (← from memory.ts)
│
├── hooks/                # React hooks (keep as-is)
│   └── useBridge.ts
│
└── index.ts              # Public barrel export
```

### Directories to Delete (after moving contents)
```
src/copilot/vision/       → contents to perception/
src/copilot/context/      → contents to perception/
src/copilot/llm/          → merge useful parts to providers/
src/copilot/planner/      → if exists, merge to reasoning/bridge/
src/copilot/knowledge/    → merge to reasoning/intelligence/
```

### Import Update Strategy
- Update all imports incrementally
- Use IDE refactoring tools where possible
- Run tests after each major move

---

## Phase 3: SECURE - Add Validation

### 3.1 Zod Validation for Tools

```typescript
// src/copilot/action/tools/validation.ts
import { z } from 'zod';

export const ModifyDimensionSchema = z.object({
  pieceId: z.string().min(1, 'pieceId required'),
  edgeName: z.string().min(1, 'edgeName required'),
  delta: z.number(),
});

export const CreatePieceSchema = z.object({
  name: z.string().min(1),
  outline: z.array(z.object({
    type: z.enum(['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']),
    values: z.array(z.number()),
  })),
});

// Generic validator
export function validateToolParams<T>(
  schema: z.ZodSchema<T>,
  params: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    return { success: false, error: result.error.issues.map(i => i.message).join(', ') };
  }
  return { success: true, data: result.data };
}
```

### 3.2 SecureStorage for API Keys

```typescript
// src/copilot/providers/secureStorage.ts
export class SecureStorage {
  private static PREFIX = 'openclo-secure-';

  static set(key: string, value: string): void {
    // Use sessionStorage (cleared on tab close) + base64 obfuscation
    sessionStorage.setItem(this.PREFIX + key, btoa(value));
  }

  static get(key: string): string | null {
    const val = sessionStorage.getItem(this.PREFIX + key);
    return val ? atob(val) : null;
  }

  static remove(key: string): void {
    sessionStorage.removeItem(this.PREFIX + key);
  }

  static clear(): void {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(this.PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
  }
}
```

### 3.3 Update AgentSettings

```typescript
// Provider config in localStorage (no secrets)
interface StoredProviderConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  // NO apiKey here
}

// API key in SecureStorage (separate)
SecureStorage.set(`${provider}-apikey`, apiKey);
```

---

## Phase 4: UNIFY Tool Execution

### Single ToolRegistry Interface

```typescript
// src/copilot/action/tools/registry.ts
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  schema?: z.ZodSchema;                  // Zod schema for validation
  execute: ToolExecuteFn;
}

export type ToolExecuteFn = (
  params: Record<string, unknown>,
  dispatch: AppDispatch,
  getState: () => RootState
) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  rollback?: () => void;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private dispatch: AppDispatch;
  private getState: () => RootState;

  constructor(dispatch: AppDispatch, getState: () => RootState) {
    this.dispatch = dispatch;
    this.getState = getState;
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    // Validate with Zod if schema exists
    if (tool.schema) {
      const validated = validateToolParams(tool.schema, params);
      if (!validated.success) {
        return { success: false, error: validated.error };
      }
      params = validated.data;
    }

    return tool.execute(params as Record<string, unknown>, this.dispatch, this.getState);
  }
}
```

### Bridge Uses Unified Registry

```typescript
// src/copilot/reasoning/bridge/Executor.ts
// BEFORE: Has its own ToolRegistry type
// AFTER: Import from action/tools/registry

import { ToolRegistry, ToolResult } from '../../action/tools/registry';

export class Executor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry, evaluator: Evaluator) {
    this.registry = registry;
    // ...
  }

  private async executeStep(step: ExecuteStep): Promise<StepResult> {
    const result = await this.registry.execute(step.tool, step.params);
    // ...
  }
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Legacy files deleted | 5 files |
| Directory count in src/copilot/ | ≤8 (from 18+) |
| Tool execution systems | 1 (from 3) |
| Files using Zod validation | All tool definitions |
| API keys in localStorage | 0 |
| Build passing | Yes |
| Tests passing | 2600+ |

---

## Migration Order

1. **Phase 1 (DELETE)**: Can be done independently
2. **Phase 2 (REORGANIZE)**: Depends on Phase 1 completion
3. **Phase 3 (SECURE)**: Can run parallel to Phase 2
4. **Phase 4 (UNIFY)**: Depends on Phase 2 completion

Recommended: Sequential execution to minimize merge conflicts.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking imports after reorganization | Run `tsc` and tests after each move |
| Lost functionality in agentLoop | Bridge mode already covers all features |
| Zod adding bundle size | Tree-shaking, Zod is small (~12kb) |
| SessionStorage cleared on tab close | User re-enters API key once per session (acceptable trade-off) |

---

## Related Issues

- Original audit findings
- #209 - Intelligent Context Generation (depends on this cleanup)
- #203 - Copilot Bridge Architecture
