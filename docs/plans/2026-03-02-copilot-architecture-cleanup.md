# Copilot Architecture Cleanup - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Consolidate copilot architecture by eliminating legacy code, reorganizing into cognitive layers, adding security validation, and unifying tool execution.

**Architecture:** 4-phase sequential cleanup (DELETE → REORGANIZE → SECURE → UNIFY). Each phase leaves the system functional. Total: 12 tasks.

**Tech Stack:** TypeScript, React, Zod, Vitest

---

## Phase 1: DELETE Legacy Code

### Task 1: Remove Legacy Imports from CopilotPanel

**Files:**
- Modify: `src/components/CopilotPanel/CopilotPanel.tsx`

**Step 1: Read CopilotPanel and identify legacy code paths**

The file imports these deprecated modules:
```typescript
import { executeCommands } from '../../copilot/commandExecutor';
import { runAgentLoop, type AgentLoopResult } from '../../copilot/agentLoop';
import { isBridgeModeEnabled } from '../../copilot/features';
```

**Step 2: Remove deprecated imports**

Delete these import lines:
```typescript
// DELETE these lines:
import { executeCommands } from '../../copilot/commandExecutor';
import { runAgentLoop, type AgentLoopResult } from '../../copilot/agentLoop';
import { isBridgeModeEnabled } from '../../copilot/features';
```

**Step 3: Find and remove all usages of these functions**

Search for and remove:
- All `isBridgeModeEnabled()` conditionals
- All `runAgentLoop()` calls
- All `executeCommands()` calls
- The `AgentLoopResult` type usage

The component should only use `useBridge` hook for execution.

**Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors related to removed imports

**Step 5: Commit**

```bash
git add src/components/CopilotPanel/CopilotPanel.tsx
git commit -m "refactor(copilot): remove legacy agentLoop/commandExecutor from CopilotPanel"
```

---

### Task 2: Delete Legacy Files

**Files:**
- Delete: `src/copilot/agentLoop.ts`
- Delete: `src/copilot/commandExecutor.ts`
- Delete: `src/copilot/features.ts`
- Delete: `src/copilot/__tests__/agentLoop.test.ts`
- Delete: `src/__tests__/commandExecutor.test.ts`

**Step 1: Delete the files**

```bash
rm src/copilot/agentLoop.ts
rm src/copilot/commandExecutor.ts
rm src/copilot/features.ts
rm src/copilot/__tests__/agentLoop.test.ts
rm src/__tests__/commandExecutor.test.ts
```

**Step 2: Search for any remaining imports**

Run: `grep -r "from.*agentLoop\|from.*commandExecutor\|from.*features" src --include="*.ts" --include="*.tsx"`
Expected: No results (or fix any remaining imports)

**Step 3: Run build and tests**

Run: `npm run build && npm test`
Expected: Build passes, all tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(copilot): delete deprecated agentLoop, commandExecutor, features"
```

---

## Phase 2: REORGANIZE Directory Structure

### Task 3: Create New Directory Structure

**Files:**
- Create: `src/copilot/perception/` directory
- Create: `src/copilot/reasoning/` directory
- Create: `src/copilot/action/` directory
- Create: `src/copilot/memory/` directory

**Step 1: Create directories**

```bash
mkdir -p src/copilot/perception
mkdir -p src/copilot/reasoning
mkdir -p src/copilot/action
mkdir -p src/copilot/memory
```

**Step 2: Commit empty structure**

```bash
git add -A
git commit -m "refactor(copilot): create cognitive layer directories"
```

---

### Task 4: Move Vision to Perception

**Files:**
- Move: `src/copilot/vision/*` → `src/copilot/perception/`

**Step 1: Move all vision files**

```bash
mv src/copilot/vision/geometryClassifier.ts src/copilot/perception/
mv src/copilot/vision/spatialDescriber.ts src/copilot/perception/
mv src/copilot/vision/designLog.ts src/copilot/perception/
mv src/copilot/vision/types.ts src/copilot/perception/
mv src/copilot/vision/index.ts src/copilot/perception/
mv src/copilot/vision/__tests__ src/copilot/perception/
```

**Step 2: Update imports in moved files**

Update any relative imports within the moved files.

**Step 3: Update external imports**

Run: `grep -r "from.*copilot/vision" src --include="*.ts" --include="*.tsx" -l`

Update each file to import from `copilot/perception` instead.

**Step 4: Delete empty vision directory**

```bash
rmdir src/copilot/vision
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(copilot): move vision/ to perception/"
```

---

### Task 5: Move Context Files to Perception

**Files:**
- Move: `src/copilot/contextBuilder.ts` → `src/copilot/perception/`
- Move: `src/copilot/languageDetection.ts` → `src/copilot/perception/`
- Move: `src/copilot/context/*` → `src/copilot/perception/`

**Step 1: Move contextBuilder and languageDetection**

```bash
mv src/copilot/contextBuilder.ts src/copilot/perception/
mv src/copilot/languageDetection.ts src/copilot/perception/
```

**Step 2: Move context directory contents**

```bash
mv src/copilot/context/copilotContext.ts src/copilot/perception/
mv src/copilot/context/recentActionsTracker.ts src/copilot/perception/
mv src/copilot/context/__tests__/* src/copilot/perception/__tests__/
rmdir src/copilot/context/__tests__
rmdir src/copilot/context
```

**Step 3: Update all imports**

Run: `grep -r "from.*copilot/contextBuilder\|from.*copilot/languageDetection\|from.*copilot/context" src --include="*.ts" --include="*.tsx" -l`

Update each file.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(copilot): move context files to perception/"
```

---

### Task 6: Move Bridge and Intelligence to Reasoning

**Files:**
- Move: `src/copilot/bridge/` → `src/copilot/reasoning/bridge/`
- Move: `src/copilot/intelligence/` → `src/copilot/reasoning/intelligence/`
- Move: `src/copilot/proactiveAnalysis.ts` → `src/copilot/reasoning/`

**Step 1: Move bridge directory**

```bash
mv src/copilot/bridge src/copilot/reasoning/
```

**Step 2: Move intelligence directory**

```bash
mv src/copilot/intelligence src/copilot/reasoning/
```

**Step 3: Move proactiveAnalysis**

```bash
mv src/copilot/proactiveAnalysis.ts src/copilot/reasoning/
```

**Step 4: Update all imports**

Run: `grep -r "from.*copilot/bridge\|from.*copilot/intelligence\|from.*copilot/proactiveAnalysis" src --include="*.ts" --include="*.tsx" -l`

Update each file to use new paths.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(copilot): move bridge/, intelligence/ to reasoning/"
```

---

### Task 7: Move Tools and Skills to Action

**Files:**
- Move: `src/copilot/tools/` → `src/copilot/action/tools/`
- Move: `src/copilot/skills/` → `src/copilot/action/skills/`

**Step 1: Move tools directory**

```bash
mv src/copilot/tools src/copilot/action/
```

**Step 2: Move skills directory**

```bash
mv src/copilot/skills src/copilot/action/
```

**Step 3: Update all imports**

Run: `grep -r "from.*copilot/tools\|from.*copilot/skills" src --include="*.ts" --include="*.tsx" -l`

Update each file to use new paths.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(copilot): move tools/, skills/ to action/"
```

---

### Task 8: Consolidate Memory and Cleanup

**Files:**
- Move: `src/copilot/memory.ts` → `src/copilot/memory/ProjectMemory.ts`
- Delete: `src/copilot/llm/` (if no unique content)
- Delete: `src/copilot/knowledge/` (if exists and empty)
- Delete: `src/copilot/planner/` (if exists and empty)

**Step 1: Move memory.ts**

```bash
mv src/copilot/memory.ts src/copilot/memory/ProjectMemory.ts
```

**Step 2: Create memory index**

Create `src/copilot/memory/index.ts`:
```typescript
export { ProjectMemory } from './ProjectMemory';
```

**Step 3: Update imports**

Run: `grep -r "from.*copilot/memory" src --include="*.ts" --include="*.tsx" -l`

Update to import from `copilot/memory/ProjectMemory` or `copilot/memory`.

**Step 4: Delete empty directories**

```bash
# Only if empty or contents already moved
rm -rf src/copilot/llm 2>/dev/null || true
rm -rf src/copilot/knowledge 2>/dev/null || true
rm -rf src/copilot/planner 2>/dev/null || true
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(copilot): consolidate memory/, cleanup empty directories"
```

---

## Phase 3: SECURE - Add Validation

### Task 9: Add Zod Validation Module

**Files:**
- Create: `src/copilot/action/tools/validation.ts`
- Create: `src/copilot/action/tools/__tests__/validation.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/action/tools/__tests__/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateToolParams, ModifyDimensionSchema, CreatePieceSchema } from '../validation';

describe('validateToolParams', () => {
  it('returns success with valid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateToolParams(schema, { name: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test');
    }
  });

  it('returns error with invalid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateToolParams(schema, { name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('string');
    }
  });
});

describe('ModifyDimensionSchema', () => {
  it('validates correct params', () => {
    const result = validateToolParams(ModifyDimensionSchema, {
      pieceId: 'front',
      edgeName: 'neckline',
      delta: -20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pieceId', () => {
    const result = validateToolParams(ModifyDimensionSchema, {
      edgeName: 'neckline',
      delta: -20,
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/action/tools/__tests__/validation.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

Create `src/copilot/action/tools/validation.ts`:
```typescript
/**
 * Zod validation schemas for tool parameters.
 * @module copilot/action/tools/validation
 */

import { z } from 'zod';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const ModifyDimensionSchema = z.object({
  pieceId: z.string().min(1, 'pieceId required'),
  edgeName: z.string().min(1, 'edgeName required'),
  delta: z.number(),
});

export const CreatePieceSchema = z.object({
  name: z.string().min(1, 'name required'),
  outline: z.array(z.object({
    type: z.enum(['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']),
    values: z.array(z.number()),
  })),
});

export const PieceIdSchema = z.object({
  pieceId: z.string().min(1, 'pieceId required'),
});

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Validate tool parameters against a Zod schema.
 */
export function validateToolParams<T>(
  schema: z.ZodSchema<T>,
  params: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map(i => i.message).join(', '),
    };
  }
  return { success: true, data: result.data };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/action/tools/__tests__/validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/action/tools/validation.ts src/copilot/action/tools/__tests__/validation.test.ts
git commit -m "feat(copilot): add Zod validation for tool parameters"
```

---

### Task 10: Add SecureStorage for API Keys

**Files:**
- Create: `src/copilot/providers/secureStorage.ts`
- Create: `src/copilot/providers/__tests__/secureStorage.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/providers/__tests__/secureStorage.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SecureStorage } from '../secureStorage';

describe('SecureStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and retrieves a value', () => {
    SecureStorage.set('test-key', 'secret-value');
    expect(SecureStorage.get('test-key')).toBe('secret-value');
  });

  it('returns null for missing key', () => {
    expect(SecureStorage.get('nonexistent')).toBeNull();
  });

  it('removes a value', () => {
    SecureStorage.set('test-key', 'secret-value');
    SecureStorage.remove('test-key');
    expect(SecureStorage.get('test-key')).toBeNull();
  });

  it('clears all secure values', () => {
    SecureStorage.set('key1', 'value1');
    SecureStorage.set('key2', 'value2');
    SecureStorage.clear();
    expect(SecureStorage.get('key1')).toBeNull();
    expect(SecureStorage.get('key2')).toBeNull();
  });

  it('does not affect non-prefixed sessionStorage items', () => {
    sessionStorage.setItem('other-key', 'other-value');
    SecureStorage.set('secure-key', 'secure-value');
    SecureStorage.clear();
    expect(sessionStorage.getItem('other-key')).toBe('other-value');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/providers/__tests__/secureStorage.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

Create `src/copilot/providers/secureStorage.ts`:
```typescript
/**
 * Secure storage for sensitive data like API keys.
 * Uses sessionStorage (cleared on tab close) with base64 obfuscation.
 *
 * @module copilot/providers/secureStorage
 */

export class SecureStorage {
  private static PREFIX = 'openclo-secure-';

  /**
   * Store a value securely.
   */
  static set(key: string, value: string): void {
    try {
      sessionStorage.setItem(this.PREFIX + key, btoa(value));
    } catch {
      // Ignore storage errors (e.g., private browsing)
    }
  }

  /**
   * Retrieve a stored value.
   */
  static get(key: string): string | null {
    try {
      const val = sessionStorage.getItem(this.PREFIX + key);
      return val ? atob(val) : null;
    } catch {
      return null;
    }
  }

  /**
   * Remove a stored value.
   */
  static remove(key: string): void {
    try {
      sessionStorage.removeItem(this.PREFIX + key);
    } catch {
      // Ignore
    }
  }

  /**
   * Clear all secure storage values.
   */
  static clear(): void {
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(this.PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/providers/__tests__/secureStorage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/providers/secureStorage.ts src/copilot/providers/__tests__/secureStorage.test.ts
git commit -m "feat(copilot): add SecureStorage for API keys"
```

---

### Task 11: Migrate AgentSettings to SecureStorage

**Files:**
- Modify: `src/copilot/AgentSettings.tsx`
- Modify: `src/copilot/providers/types.ts`

**Step 1: Update types to separate config from secrets**

In `src/copilot/providers/types.ts`, add:
```typescript
/**
 * Provider config stored in localStorage (no secrets).
 */
export interface StoredProviderConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  // apiKey is stored separately in SecureStorage
}
```

**Step 2: Update AgentSettings to use SecureStorage**

In `src/copilot/AgentSettings.tsx`:
- Import `SecureStorage`
- On save: store apiKey in SecureStorage, not localStorage
- On load: retrieve apiKey from SecureStorage

**Step 3: Update loadProviderConfig**

In `src/copilot/providers/types.ts`, update `loadProviderConfig()`:
```typescript
import { SecureStorage } from './secureStorage';

export function loadProviderConfig(): ProviderConfig | null {
  try {
    const stored = localStorage.getItem('openclo-provider');
    if (!stored) return null;
    const config: StoredProviderConfig = JSON.parse(stored);
    // Retrieve apiKey from SecureStorage
    const apiKey = SecureStorage.get(`${config.provider}-apikey`) ?? '';
    return { ...config, apiKey };
  } catch {
    return null;
  }
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/copilot/AgentSettings.tsx src/copilot/providers/types.ts
git commit -m "feat(copilot): migrate API keys to SecureStorage"
```

---

## Phase 4: UNIFY Tool Execution

### Task 12: Unify ToolRegistry and Update Bridge

**Files:**
- Modify: `src/copilot/action/tools/registry.ts`
- Modify: `src/copilot/reasoning/bridge/Executor.ts`
- Modify: `src/copilot/reasoning/bridge/types.ts`

**Step 1: Enhance ToolRegistry with execute method**

In `src/copilot/action/tools/registry.ts`, add:
```typescript
import { z } from 'zod';
import { validateToolParams } from './validation';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema?: z.ZodSchema;  // Optional Zod schema
  execute: ToolExecuteFn;
}

// Add execute method to ToolRegistry class:
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
```

**Step 2: Update Bridge Executor to use unified registry**

In `src/copilot/reasoning/bridge/Executor.ts`:
- Remove local `ToolRegistry` type definition
- Import `ToolRegistry` from `../../action/tools/registry`
- Update constructor and execute methods

**Step 3: Remove duplicate type from bridge/types.ts**

If `bridge/types.ts` has its own ToolRegistry type, remove it.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Run full build**

Run: `npm run build`
Expected: Build passes

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(copilot): unify ToolRegistry across bridge and tools"
```

---

## Final Verification

After all tasks complete:

```bash
# Verify directory structure
find src/copilot -type d -maxdepth 2 | sort

# Expected:
# src/copilot
# src/copilot/action
# src/copilot/action/skills
# src/copilot/action/tools
# src/copilot/hooks
# src/copilot/memory
# src/copilot/perception
# src/copilot/providers
# src/copilot/reasoning
# src/copilot/reasoning/bridge
# src/copilot/reasoning/intelligence

# Verify no legacy imports
grep -r "agentLoop\|commandExecutor\|features" src --include="*.ts" --include="*.tsx" | grep -v ".test.ts"
# Expected: No results

# Verify tests pass
npm test
# Expected: All 2600+ tests pass

# Verify build
npm run build
# Expected: Build succeeds
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Legacy files | 5 | 0 |
| Top-level copilot dirs | 18+ | ≤8 |
| Tool execution systems | 3 | 1 |
| Zod validation | 1 file | All tools |
| API keys in localStorage | Yes | No |
