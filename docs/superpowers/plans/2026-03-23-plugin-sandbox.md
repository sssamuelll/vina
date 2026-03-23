# Plugin Sandbox — Web Worker Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sandbox all plugin code in dedicated Web Workers with a capability-gated message-passing bridge that enforces permissions at runtime.

**Architecture:** One Worker per plugin. Main-thread `PluginBridge` enforces permissions on every capability request. Plugins communicate exclusively via async `PluginContext` methods. Existing `pluginManager`/`pluginLoader`/`pluginRegistry` refactored to delegate to new `PluginHost`.

**Tech Stack:** TypeScript, Web Workers, Redux, Vitest (mocked Workers for unit tests)

**Spec:** `docs/superpowers/specs/2026-03-23-plugin-sandbox-design.md`

**Worktree:** `.worktrees/plugin-sandbox` (branch `feat/plugin-sandbox-393`)

---

## File Structure

| File | Thread | New/Modify | Responsibility |
|------|--------|------------|----------------|
| `src/copilot/plugins/sandbox/protocol.ts` | Shared | Create | Message types, type guards, error classes |
| `src/copilot/plugins/sandbox/PluginContext.ts` | Worker | Create | Async capability API for plugins |
| `src/copilot/plugins/sandbox/worker.ts` | Worker | Create | Worker entry point, global lockdown, message routing |
| `src/copilot/plugins/sandbox/PluginBridge.ts` | Main | Create | Per-plugin message handler, permission enforcement, validation |
| `src/copilot/plugins/sandbox/PluginHost.ts` | Main | Create | Manages Workers, bridges, registers tools in core registry |
| `src/copilot/plugins/sandbox/networkValidator.ts` | Main | Create | URL allowlist matching, private IP blocking, rate limiting |
| `src/copilot/plugins/sandbox/__tests__/protocol.test.ts` | — | Create | Message type guard tests |
| `src/copilot/plugins/sandbox/__tests__/PluginBridge.test.ts` | — | Create | Permission enforcement, validation, timeout tests |
| `src/copilot/plugins/sandbox/__tests__/PluginContext.test.ts` | — | Create | Context method tests |
| `src/copilot/plugins/sandbox/__tests__/PluginHost.test.ts` | — | Create | Lifecycle, tool registration tests |
| `src/copilot/plugins/sandbox/__tests__/networkValidator.test.ts` | — | Create | URL matching, IP blocking tests |
| `src/copilot/plugins/pluginManager.ts` | Main | Modify | Delegate to PluginHost instead of direct loading |
| `src/copilot/plugins/types.ts` | — | Modify | Add `apiVersion` to manifest, update handler signature |
| `docs/specs/SECURITY.md` | — | Modify | Update §2.2, add §2.3 |

---

### Task 1: Shared Protocol Types

**Files:**
- Create: `src/copilot/plugins/sandbox/protocol.ts`
- Test: `src/copilot/plugins/sandbox/__tests__/protocol.test.ts`

- [ ] **Step 1: Write tests for message type guards**

```ts
// protocol.test.ts
import { describe, it, expect } from 'vitest';
import {
  isMainToWorkerMessage, isWorkerToMainMessage,
  type LoadMessage, type ExecuteMessage, type CapabilityResultMessage,
  type LoadedMessage, type ResultMessage, type CapabilityRequestMessage,
  PermissionDeniedError, TimeoutError, PluginCrashError,
} from '../protocol';

describe('protocol', () => {
  it('isMainToWorkerMessage validates load', () => {
    const msg: LoadMessage = { type: 'load', pluginCode: 'code', manifest: {} as any, apiVersion: 2 };
    expect(isMainToWorkerMessage(msg)).toBe(true);
  });
  it('isMainToWorkerMessage validates execute', () => {
    const msg: ExecuteMessage = { type: 'execute', requestId: 'r1', toolName: 'foo', params: {} };
    expect(isMainToWorkerMessage(msg)).toBe(true);
  });
  it('isWorkerToMainMessage validates loaded', () => {
    const msg: LoadedMessage = { type: 'loaded', tools: [] };
    expect(isWorkerToMainMessage(msg)).toBe(true);
  });
  it('isWorkerToMainMessage validates capability', () => {
    const msg: CapabilityRequestMessage = { type: 'capability', requestId: 'r2', method: 'readPieces', args: {} };
    expect(isWorkerToMainMessage(msg)).toBe(true);
  });
  it('rejects invalid messages', () => {
    expect(isMainToWorkerMessage({ type: 'garbage' })).toBe(false);
    expect(isWorkerToMainMessage(null)).toBe(false);
  });
  it('PermissionDeniedError has correct name', () => {
    const err = new PermissionDeniedError('read-pieces', 'readPieces');
    expect(err.name).toBe('PermissionDeniedError');
    expect(err.permission).toBe('read-pieces');
  });
  it('TimeoutError has correct name', () => {
    const err = new TimeoutError('r1', 30000);
    expect(err.name).toBe('TimeoutError');
  });
  it('PluginCrashError has correct name', () => {
    const err = new PluginCrashError('com.test', 'Unhandled error');
    expect(err.name).toBe('PluginCrashError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/plugins/sandbox/__tests__/protocol.test.ts 2>&1 | tail -5`

- [ ] **Step 3: Implement protocol.ts**

```ts
// protocol.ts — Shared message types for plugin sandbox bridge
import type { PluginManifest } from '../types';

// ─── Main → Worker ─────────────────────────────────────────────────────────

export interface LoadMessage {
  type: 'load';
  pluginCode: string;
  manifest: PluginManifest;
  apiVersion: number;
}

export interface ExecuteMessage {
  type: 'execute';
  requestId: string;
  toolName: string;
  params: Record<string, unknown>;
}

export interface CapabilityResultMessage {
  type: 'capabilityResult';
  requestId: string;
  data: unknown;
}

export interface CapabilityDeniedMessage {
  type: 'capabilityDenied';
  requestId: string;
  permission: string;
  reason: string;
}

export interface TerminateMessage {
  type: 'terminate';
}

export type MainToWorkerMessage =
  | LoadMessage | ExecuteMessage | CapabilityResultMessage
  | CapabilityDeniedMessage | TerminateMessage;

// ─── Worker → Main ─────────────────────────────────────────────────────────

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiredPermissions: string[];
}

export interface LoadedMessage {
  type: 'loaded';
  tools: ToolSchema[];
}

export interface LoadErrorMessage {
  type: 'loadError';
  error: string;
}

export interface ResultMessage {
  type: 'result';
  requestId: string;
  result: { success: boolean; data?: unknown; error?: string };
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  error: string;
}

export interface CapabilityRequestMessage {
  type: 'capability';
  requestId: string;
  method: string;
  args: unknown;
}

export type WorkerToMainMessage =
  | LoadedMessage | LoadErrorMessage | ResultMessage
  | ErrorMessage | CapabilityRequestMessage;

// ─── Type Guards ────────────────────────────────────────────────────────────

const MAIN_TYPES = new Set(['load', 'execute', 'capabilityResult', 'capabilityDenied', 'terminate']);
const WORKER_TYPES = new Set(['loaded', 'loadError', 'result', 'error', 'capability']);

export function isMainToWorkerMessage(msg: unknown): msg is MainToWorkerMessage {
  return msg !== null && typeof msg === 'object' && 'type' in (msg as any)
    && MAIN_TYPES.has((msg as any).type);
}

export function isWorkerToMainMessage(msg: unknown): msg is WorkerToMainMessage {
  return msg !== null && typeof msg === 'object' && 'type' in (msg as any)
    && WORKER_TYPES.has((msg as any).type);
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class PermissionDeniedError extends Error {
  name = 'PermissionDeniedError' as const;
  constructor(public permission: string, public method: string) {
    super(`Permission denied: requires "${permission}" for "${method}"`);
  }
}

export class TimeoutError extends Error {
  name = 'TimeoutError' as const;
  constructor(public requestId: string, public timeoutMs: number) {
    super(`Request ${requestId} timed out after ${timeoutMs}ms`);
  }
}

export class PluginCrashError extends Error {
  name = 'PluginCrashError' as const;
  constructor(public pluginId: string, message: string) {
    super(`Plugin "${pluginId}" crashed: ${message}`);
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const CAPABILITY_TIMEOUT_MS = 30_000;
export const EXECUTION_TIMEOUT_MS = 60_000;
export const MAX_PIECES_PER_REQUEST = 50;
export const MAX_FETCH_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_STORAGE_VALUE_BYTES = 100 * 1024; // 100KB
export const MAX_STORAGE_QUOTA_BYTES = 1024 * 1024; // 1MB
export const FETCH_RATE_LIMIT_PER_MINUTE = 60;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/copilot/plugins/sandbox/__tests__/protocol.test.ts 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/copilot/plugins/sandbox/protocol.ts src/copilot/plugins/sandbox/__tests__/protocol.test.ts
git commit -m "feat(sandbox): add shared protocol types and message guards (#393)"
```

---

### Task 2: Network Validator

**Files:**
- Create: `src/copilot/plugins/sandbox/networkValidator.ts`
- Test: `src/copilot/plugins/sandbox/__tests__/networkValidator.test.ts`

- [ ] **Step 1: Write tests**

```ts
// networkValidator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkValidator } from '../networkValidator';

describe('NetworkValidator', () => {
  let validator: NetworkValidator;

  beforeEach(() => {
    validator = new NetworkValidator(['https://api.example.com/*', 'https://cdn.example.com/assets/*']);
  });

  it('allows matching URL', () => {
    expect(validator.isUrlAllowed('https://api.example.com/v1/data')).toBe(true);
  });
  it('allows matching URL with subpath', () => {
    expect(validator.isUrlAllowed('https://cdn.example.com/assets/image.png')).toBe(true);
  });
  it('blocks non-matching URL', () => {
    expect(validator.isUrlAllowed('https://evil.com/steal')).toBe(false);
  });
  it('blocks private IP 10.x', () => {
    expect(validator.isUrlAllowed('http://10.0.0.1/api')).toBe(false);
  });
  it('blocks private IP 192.168.x', () => {
    expect(validator.isUrlAllowed('http://192.168.1.1/')).toBe(false);
  });
  it('blocks localhost', () => {
    expect(validator.isUrlAllowed('http://localhost:3000/api')).toBe(false);
  });
  it('blocks 169.254.x (link-local)', () => {
    expect(validator.isUrlAllowed('http://169.254.169.254/metadata')).toBe(false);
  });
  it('rate limits after 60 requests', () => {
    for (let i = 0; i < 60; i++) {
      expect(validator.checkRateLimit()).toBe(true);
    }
    expect(validator.checkRateLimit()).toBe(false);
  });
  it('empty allowlist blocks everything', () => {
    const v = new NetworkValidator([]);
    expect(v.isUrlAllowed('https://api.example.com/')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement networkValidator.ts**

```ts
// networkValidator.ts — URL allowlist matching, private IP blocking, rate limiting
import { FETCH_RATE_LIMIT_PER_MINUTE } from './protocol';

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^127\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
];

export class NetworkValidator {
  private patterns: string[];
  private requestTimestamps: number[] = [];

  constructor(allowlist: string[]) {
    this.patterns = allowlist;
  }

  isUrlAllowed(url: string): boolean {
    if (this.patterns.length === 0) return false;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      if (PRIVATE_IP_PATTERNS.some(p => p.test(hostname))) return false;
      return this.patterns.some(pattern => this.matchGlob(url, pattern));
    } catch {
      return false;
    }
  }

  checkRateLimit(): boolean {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60_000);
    if (this.requestTimestamps.length >= FETCH_RATE_LIMIT_PER_MINUTE) return false;
    this.requestTimestamps.push(now);
    return true;
  }

  private matchGlob(url: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(url);
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run src/copilot/plugins/sandbox/__tests__/networkValidator.test.ts
git add src/copilot/plugins/sandbox/networkValidator.ts src/copilot/plugins/sandbox/__tests__/networkValidator.test.ts
git commit -m "feat(sandbox): add network URL validator with allowlist and rate limiting (#393)"
```

---

### Task 3: PluginContext (Worker-side API)

**Files:**
- Create: `src/copilot/plugins/sandbox/PluginContext.ts`
- Test: `src/copilot/plugins/sandbox/__tests__/PluginContext.test.ts`

- [ ] **Step 1: Write tests**

Test that each method sends the correct message via `postMessage` and resolves/rejects based on response type. Mock `self.postMessage` and simulate `onmessage` callbacks.

Key tests:
- `readPieces()` sends `{ type: 'capability', method: 'readPieces', args: { limit: 50, offset: 0 } }`
- `readPiece('p1')` sends `{ type: 'capability', method: 'readPiece', args: { id: 'p1' } }`
- `updatePiece(piece)` sends `{ type: 'capability', method: 'updatePiece', args: { piece } }`
- On `capabilityDenied` response → throws `PermissionDeniedError`
- On timeout (30s) → throws `TimeoutError`
- `fetch()` sends `{ type: 'capability', method: 'fetch', args: { url, options } }`

- [ ] **Step 2: Implement PluginContext.ts**

The context stores a `pendingRequests` map of `requestId → { resolve, reject, timer }`. Each method generates a UUID requestId, sends a `capability` message, and returns a promise. The `handleMessage` method dispatches `capabilityResult`/`capabilityDenied` responses to the correct pending request.

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat(sandbox): add Worker-side PluginContext with async capability API (#393)"
```

---

### Task 4: Worker Entry Point

**Files:**
- Create: `src/copilot/plugins/sandbox/worker.ts`

- [ ] **Step 1: Implement worker.ts**

1. Capture `_URL` and `_Blob` before lockdown
2. Apply global lockdown (`Object.defineProperty` for all BLOCKED_GLOBALS + prototype freeze)
3. Handle `load` message: create Blob from pluginCode, `import()` via `_URL.createObjectURL`, extract `default` export, validate tools, send `loaded`
4. Handle `execute` message: find tool by name, create `PluginContext`, call `handler(params)` or `handler(params, ctx)` based on `apiVersion`, send `result`
5. Handle `terminate`: `self.close()`
6. Route `capabilityResult`/`capabilityDenied` to `PluginContext.handleMessage`

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(sandbox): add Worker entry point with global lockdown and plugin loader (#393)"
```

---

### Task 5: PluginBridge (Main Thread)

**Files:**
- Create: `src/copilot/plugins/sandbox/PluginBridge.ts`
- Test: `src/copilot/plugins/sandbox/__tests__/PluginBridge.test.ts`

- [ ] **Step 1: Write tests**

Key tests:
- `handleCapability('readPieces')` with `read-pieces` granted → reads from Redux, sends `capabilityResult`
- `handleCapability('readPieces')` without `read-pieces` → sends `capabilityDenied`, dispatches `setPluginError`
- `handleCapability('updatePiece')` validates ownership (piece must have been read first)
- `handleCapability('updatePiece')` validates numeric ranges
- `handleCapability('updatePiece')` validates outline (M + L/C + Z)
- `handleCapability('fetch')` checks URL against allowlist
- `handleCapability('fetch')` blocks private IPs
- `handleCapability('fetch')` enforces rate limit
- `handleCapability('controlSimulation', { action: 'reset' })` goes through confirmation
- `handleCapability('getStorage')` prefixes key with `plugin:${pluginId}:`
- `executeTool` sends `execute` message and resolves on `result`
- `executeTool` rejects after 60s timeout
- Crash: `onError` rejects all pending, dispatches `setPluginError`, rollback via undo

- [ ] **Step 2: Implement PluginBridge.ts**

The bridge receives a `Worker` instance, `pluginId`, `grantedPermissions`, `dispatch`, and `getState`. It:
- Listens to `worker.onmessage` and routes messages
- Maintains `pendingExecutions` map for tool calls
- Maintains `pendingCapabilities` map for capability responses (to send back to Worker)
- Maintains `bridgeState` with `readPieceIds` and `modifiedPieceIds` per execution
- Snapshots pieces before execution for crash rollback
- Validates all mutations before dispatching to Redux

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat(sandbox): add PluginBridge with permission enforcement and mutation validation (#393)"
```

---

### Task 6: PluginHost (Lifecycle Manager)

**Files:**
- Create: `src/copilot/plugins/sandbox/PluginHost.ts`
- Test: `src/copilot/plugins/sandbox/__tests__/PluginHost.test.ts`

- [ ] **Step 1: Write tests**

Key tests:
- `loadPlugin(manifest, code)` creates Worker, sends `load`, resolves on `loaded`
- `loadPlugin` rejects on `loadError`
- `loadPlugin` registers tools in core `ToolRegistry`
- `unloadPlugin(pluginId)` terminates Worker, unregisters tools
- Tool execution via registry → calls `bridge.executeTool` → returns result
- Crash handling: Worker error → plugin marked as crashed

- [ ] **Step 2: Implement PluginHost.ts**

Manages a `Map<string, { worker: Worker, bridge: PluginBridge }>`. For each plugin:
1. Creates Worker from `worker.ts` entry point
2. Creates `PluginBridge` with Worker + permissions
3. Sends `load` message with plugin code
4. On `loaded`: registers each tool schema as a `ToolDefinition` in the core registry
5. The registered tool's `execute` delegates to `bridge.executeTool()`

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat(sandbox): add PluginHost lifecycle manager with tool registration (#393)"
```

---

### Task 7: Integration — Migrate pluginManager

**Files:**
- Modify: `src/copilot/plugins/pluginManager.ts`
- Modify: `src/copilot/plugins/types.ts`

- [ ] **Step 1: Add `apiVersion` to PluginManifest type**

In `types.ts`, add `apiVersion?: number` to the `PluginManifest` interface.

- [ ] **Step 2: Refactor pluginManager to use PluginHost**

In `pluginManager.ts`, replace `loadPlugin()` + `registry.registerPlugin()` with `pluginHost.loadPlugin()`. The `PluginHost` singleton is created once and shared.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sandbox): migrate pluginManager to use PluginHost (#393)"
```

---

### Task 8: Update SECURITY.md

**Files:**
- Modify: `docs/specs/SECURITY.md`

- [ ] **Step 1: Update §2.2 and add §2.3**

Update §2.2 to document Web Worker isolation as implemented. Add §2.3 documenting the bridge protocol, global lockdown, and timeout/crash handling.

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: update SECURITY.md with Web Worker plugin sandbox documentation (#393)"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 3: Run lint**

```bash
npx eslint src/copilot/plugins/sandbox/ --quiet 2>&1 | head -10
```

- [ ] **Step 4: Push and create PR**

```bash
git push origin feat/plugin-sandbox-393
gh pr create --title "feat: Plugin sandbox — Web Worker isolation with capability-gated bridge (#393)" \
  --body "## Summary\n\nSandboxes all plugin code in dedicated Web Workers.\n\nCloses #393"
```
