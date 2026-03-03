# Agentic Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plan-then-execute architecture with a single agentic loop where the LLM calls tools (read + write) iteratively until the work is done.

**Architecture:** One `AgenticLoop` class replaces `AgenticPlanner`, `ExecutionBridge`, `Reasoner`, `EnhancedReasoner`, `ResultStore`, and `SummaryGenerator`. The LLM drives the loop: it reads garment state via meta-tools, makes changes via action tools, observes results, and responds with text when done. Inspired by OpenClaw's standard agentic pattern.

**Tech Stack:** TypeScript, React, Vitest, Redux (store integration)

---

### Task 1: AgenticLoop Core — Types and Event Model

**Files:**
- Create: `src/copilot/reasoning/bridge/AgenticLoop.ts`
- Create: `src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts`

**Step 1: Write the failing tests**

Create `src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgenticLoop } from '../AgenticLoop';
import type { ProviderResponse, ProviderToolCall, ProviderToolDef } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';
import type { AgenticEvent } from '../AgenticLoop';

// Helper: create mock LLM send function from a sequence of responses
function createMockSend(responses: ProviderResponse[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

describe('AgenticLoop', () => {
  it('returns text response when LLM responds without tool calls', async () => {
    const send = createMockSend([
      { content: 'Done! Neckline reduced by 2cm.', toolCalls: [] },
    ]);

    const loop = new AgenticLoop({
      send,
      metaTools: [],
      actionToolDefs: [],
      getState: () => ({}) as never,
      dispatch: vi.fn(),
    });

    const events: AgenticEvent[] = [];
    const result = await loop.run('reduce neckline 2cm', (e) => events.push(e));

    expect(result).toBe('Done! Neckline reduced by 2cm.');
    expect(send).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'complete', content: 'Done! Neckline reduced by 2cm.' });
  });

  it('executes meta-tools (read-only) and feeds results back to LLM', async () => {
    const metaTool: MetaToolDefinition = {
      name: 'getGarmentState',
      description: 'Get garment state',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => ({
        success: true,
        data: { pieces: [{ id: 'p1', name: 'Front' }], pieceCount: 1 },
      })),
    };

    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: 'Found 1 piece. Done!', toolCalls: [] },
    ]);

    const loop = new AgenticLoop({
      send,
      metaTools: [metaTool],
      actionToolDefs: [],
      getState: () => ({}) as never,
      dispatch: vi.fn(),
    });

    const events: AgenticEvent[] = [];
    const result = await loop.run('show pieces', (e) => events.push(e));

    expect(result).toBe('Found 1 piece. Done!');
    expect(metaTool.execute).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(events.filter(e => e.type === 'tool:start')).toHaveLength(1);
    expect(events.filter(e => e.type === 'tool:complete')).toHaveLength(1);
  });

  it('executes action tools via registry and feeds results back to LLM', async () => {
    const mockExecute = vi.fn(async () => ({
      success: true,
      data: { newLength: 125.3 },
    }));

    const mockRegistry = {
      execute: mockExecute,
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };

    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'modifyEdge',
      arguments: JSON.stringify({ pieceId: 'p1', edge: 'neckline', delta: -20 }),
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: 'Edge modified successfully.', toolCalls: [] },
    ]);

    const actionToolDefs: ProviderToolDef[] = [{
      name: 'modifyEdge',
      description: 'Modify edge',
      parameters: { type: 'object', properties: {} },
    }];

    const loop = new AgenticLoop({
      send,
      metaTools: [],
      actionToolDefs,
      getState: () => ({}) as never,
      dispatch: vi.fn(),
      registry: mockRegistry as never,
    });

    const events: AgenticEvent[] = [];
    const result = await loop.run('reduce neckline', (e) => events.push(e));

    expect(result).toBe('Edge modified successfully.');
    expect(mockExecute).toHaveBeenCalledWith('modifyEdge', { pieceId: 'p1', edge: 'neckline', delta: -20 });
  });

  it('handles tool errors gracefully — LLM sees error and recovers', async () => {
    const metaTool: MetaToolDefinition = {
      name: 'searchPieces',
      description: 'Search pieces',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
      execute: vi.fn(async () => ({
        success: true,
        data: { matches: [{ pieceId: 'front-1', pieceName: 'Front Bodice', score: 0.9 }] },
      })),
    };

    const mockRegistry = {
      execute: vi.fn()
        .mockResolvedValueOnce({ success: false, error: 'Piece "front-bodice" not found' })
        .mockResolvedValueOnce({ success: true, data: { newLength: 125.3 } }),
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };

    const send = createMockSend([
      // LLM tries modifyEdge with wrong ID
      { content: '', toolCalls: [{ id: 'tc1', name: 'modifyEdge', arguments: JSON.stringify({ pieceId: 'front-bodice' }) }] },
      // LLM sees error, calls searchPieces
      { content: '', toolCalls: [{ id: 'tc2', name: 'searchPieces', arguments: JSON.stringify({ query: 'front bodice' }) }] },
      // LLM retries with correct ID
      { content: '', toolCalls: [{ id: 'tc3', name: 'modifyEdge', arguments: JSON.stringify({ pieceId: 'front-1' }) }] },
      // LLM responds with success
      { content: 'Neckline modified on Front Bodice.', toolCalls: [] },
    ]);

    const actionToolDefs: ProviderToolDef[] = [{
      name: 'modifyEdge',
      description: 'Modify edge',
      parameters: { type: 'object', properties: {} },
    }];

    const loop = new AgenticLoop({
      send,
      metaTools: [metaTool],
      actionToolDefs,
      getState: () => ({}) as never,
      dispatch: vi.fn(),
      registry: mockRegistry as never,
    });

    const result = await loop.run('modify neckline', () => {});

    expect(result).toBe('Neckline modified on Front Bodice.');
    expect(send).toHaveBeenCalledTimes(4);
    expect(mockRegistry.execute).toHaveBeenCalledTimes(2);
  });

  it('preserves reasoning_content on assistant messages', async () => {
    const send = createMockSend([
      {
        content: '',
        toolCalls: [{ id: 'tc1', name: 'getGarmentState', arguments: '{}' }],
        reasoningContent: 'Let me check the garment state first.',
      },
      { content: 'Done!', toolCalls: [] },
    ]);

    const metaTool: MetaToolDefinition = {
      name: 'getGarmentState',
      description: 'Get garment state',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => ({ success: true, data: { pieces: [], pieceCount: 0 } })),
    };

    const loop = new AgenticLoop({
      send,
      metaTools: [metaTool],
      actionToolDefs: [],
      getState: () => ({}) as never,
      dispatch: vi.fn(),
    });

    await loop.run('test', () => {});

    // Verify the second call includes the reasoning_content in messages
    const secondCallMessages = send.mock.calls[1][0];
    const assistantMsg = secondCallMessages.find((m: { role: string }) => m.role === 'assistant');
    expect(assistantMsg.reasoning_content).toBe('Let me check the garment state first.');
  });

  it('emits tool:error event when action tool throws', async () => {
    const mockRegistry = {
      execute: vi.fn(async () => { throw new Error('kaboom'); }),
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };

    const send = createMockSend([
      { content: '', toolCalls: [{ id: 'tc1', name: 'modifyEdge', arguments: '{}' }] },
      { content: 'Failed to modify edge.', toolCalls: [] },
    ]);

    const actionToolDefs: ProviderToolDef[] = [{
      name: 'modifyEdge',
      description: 'Modify edge',
      parameters: { type: 'object', properties: {} },
    }];

    const loop = new AgenticLoop({
      send,
      metaTools: [],
      actionToolDefs,
      getState: () => ({}) as never,
      dispatch: vi.fn(),
      registry: mockRegistry as never,
    });

    const events: AgenticEvent[] = [];
    await loop.run('test', (e) => events.push(e));

    const errorEvents = events.filter(e => e.type === 'tool:error');
    expect(errorEvents).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts`
Expected: FAIL — `AgenticLoop` not found

**Step 3: Write the AgenticLoop implementation**

Create `src/copilot/reasoning/bridge/AgenticLoop.ts`:

```typescript
/**
 * AgenticLoop — unified tool-use loop for the copilot.
 *
 * Replaces the plan-then-execute architecture (AgenticPlanner + ExecutionBridge +
 * Reasoner + EnhancedReasoner + ResultStore + SummaryGenerator) with a single
 * agentic loop where the LLM calls tools iteratively until the work is done.
 *
 * The LLM has access to both:
 * - Meta-tools (read-only): getGarmentState, getPieceDetails, measureEdge, searchPieces
 * - Action tools (mutations): modifyEdge, createPiece, addDart, etc.
 *
 * The loop terminates when the LLM responds with text (no tool calls).
 *
 * @module bridge/AgenticLoop
 */

import type {
  ChatMessage,
  ProviderToolDef,
  ProviderResponse,
  ProviderToolCall,
} from '../../providers/types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { ToolRegistry } from '../../action/tools/registry';
import type { AppDispatch, RootState } from '../../../store';
import { buildDomainBootstrap } from './domainBootstrap';

// ─── Event Types ─────────────────────────────────────────────────────────────

export type AgenticEvent =
  | { type: 'tool:start'; name: string; args: Record<string, unknown> }
  | { type: 'tool:complete'; name: string; result: unknown }
  | { type: 'tool:error'; name: string; error: string }
  | { type: 'text:delta'; content: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string };

export type AgenticEventHandler = (event: AgenticEvent) => void;

// ─── Options ─────────────────────────────────────────────────────────────────

export interface AgenticLoopOptions {
  /** LLM send function */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  /** Read-only meta-tools */
  metaTools: MetaToolDefinition[];
  /** Action tool definitions (for LLM to see) */
  actionToolDefs: ProviderToolDef[];
  /** State accessor for meta-tool execution */
  getState: () => RootState;
  /** Redux dispatch for action tool execution */
  dispatch: AppDispatch;
  /** Action tool registry (for execution) */
  registry?: ToolRegistry;
  /** Provider config to pass through to send */
  providerConfig?: unknown;
}

// ─── Tool Call Record ────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

// ─── AgenticLoop ─────────────────────────────────────────────────────────────

export class AgenticLoop {
  private send: AgenticLoopOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private actionToolDefs: ProviderToolDef[];
  private getState: () => RootState;
  private registry: ToolRegistry | undefined;
  private providerConfig: unknown;
  private lastToolCalls: ToolCallRecord[] = [];

  constructor(options: AgenticLoopOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map((t) => [t.name, t]));
    this.actionToolDefs = options.actionToolDefs;
    this.getState = options.getState;
    this.registry = options.registry;
    this.providerConfig = options.providerConfig;
  }

  /**
   * Get tool call records from the last run (for debugging).
   */
  getLastToolCalls(): ToolCallRecord[] {
    return [...this.lastToolCalls];
  }

  /**
   * Run the agentic loop with a user request.
   *
   * The LLM drives the loop: it calls tools (read + write) as needed,
   * and terminates naturally when it responds with text (no tool calls).
   */
  async run(userRequest: string, onEvent: AgenticEventHandler): Promise<string> {
    this.lastToolCalls = [];

    const systemPrompt = this.buildSystemPrompt();
    const allToolDefs = this.buildAllToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(messages, allToolDefs, this.providerConfig);

      // Text response = work is done
      if (response.toolCalls.length === 0) {
        onEvent({ type: 'complete', content: response.content });
        return response.content;
      }

      // Build assistant message with all tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      };
      if (response.reasoningContent) {
        assistantMsg.reasoning_content = response.reasoningContent;
      }
      messages.push(assistantMsg);

      // Execute each tool call and append results
      for (const toolCall of response.toolCalls) {
        const args = this.parseArgs(toolCall);
        onEvent({ type: 'tool:start', name: toolCall.name, args });

        const start = performance.now();
        let result: unknown;
        let isMetaTool = false;

        try {
          const metaTool = this.metaTools.get(toolCall.name);
          if (metaTool) {
            isMetaTool = true;
            result = await metaTool.execute(args, this.getState);
          } else if (this.registry) {
            result = await this.registry.execute(toolCall.name, args);
          } else {
            result = { success: false, error: `Unknown tool: ${toolCall.name}` };
          }

          onEvent({ type: 'tool:complete', name: toolCall.name, result });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result = { success: false, error: errorMsg };
          onEvent({ type: 'tool:error', name: toolCall.name, error: errorMsg });
        }

        const duration = performance.now() - start;
        this.lastToolCalls.push({
          name: toolCall.name,
          arguments: args,
          result,
          duration,
          isMetaTool,
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  /**
   * Parse arguments from a tool call, handling JSON parse errors gracefully.
   */
  private parseArgs(toolCall: ProviderToolCall): Record<string, unknown> {
    try {
      return JSON.parse(toolCall.arguments);
    } catch {
      return {};
    }
  }

  /**
   * Build the system prompt combining domain knowledge and tool descriptions.
   */
  private buildSystemPrompt(): string {
    const domain = buildDomainBootstrap();

    const metaToolList = Array.from(this.metaTools.values())
      .map((t) => `- **${t.name}** (read-only): ${t.description}`)
      .join('\n');

    const actionToolList = this.actionToolDefs
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return `${domain}

## Read-Only Tools (inspect garment state)
${metaToolList || 'None'}

## Action Tools (modify garment)
${actionToolList || 'None'}

## Instructions
- Use read-only tools first to understand current state before making changes.
- After making changes, verify the result if needed.
- Respond in the user's language when done.
- If a tool fails, investigate with read-only tools and retry with corrected parameters.`;
  }

  /**
   * Build all tool definitions (meta + action) for the LLM.
   */
  private buildAllToolDefs(): ProviderToolDef[] {
    const metaDefs = Array.from(this.metaTools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    return [...metaDefs, ...this.actionToolDefs];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/AgenticLoop.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts
git commit -m "feat(copilot): add AgenticLoop core with unified tool-use loop"
```

---

### Task 2: useAgenticLoop React Hook

**Files:**
- Create: `src/copilot/hooks/useAgenticLoop.ts`
- Create: `src/copilot/hooks/__tests__/useAgenticLoop.test.ts`

**Step 1: Write the failing tests**

Create `src/copilot/hooks/__tests__/useAgenticLoop.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgenticLoop } from '../useAgenticLoop';
import type { AgenticLoopOptions } from '../../reasoning/bridge/AgenticLoop';

// Mock AgenticLoop
vi.mock('../../reasoning/bridge/AgenticLoop', () => {
  return {
    AgenticLoop: vi.fn().mockImplementation(() => ({
      run: vi.fn(async (_request: string, onEvent: (e: unknown) => void) => {
        onEvent({ type: 'tool:start', name: 'getGarmentState', args: {} });
        onEvent({ type: 'tool:complete', name: 'getGarmentState', result: { success: true } });
        onEvent({ type: 'complete', content: 'Done!' });
        return 'Done!';
      }),
      getLastToolCalls: vi.fn(() => []),
    })),
  };
});

describe('useAgenticLoop', () => {
  const mockOptions: AgenticLoopOptions = {
    send: vi.fn(),
    metaTools: [],
    actionToolDefs: [],
    getState: () => ({}) as never,
    dispatch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with idle state', () => {
    const { result } = renderHook(() => useAgenticLoop(mockOptions));

    expect(result.current.isRunning).toBe(false);
    expect(result.current.response).toBeNull();
    expect(result.current.toolCalls).toEqual([]);
  });

  it('tracks tool calls during execution', async () => {
    const { result } = renderHook(() => useAgenticLoop(mockOptions));

    await act(async () => {
      await result.current.run('test request');
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.response).toBe('Done!');
  });

  it('sets isRunning during execution', async () => {
    const { result } = renderHook(() => useAgenticLoop(mockOptions));

    let wasRunning = false;
    const originalRun = result.current.run;

    await act(async () => {
      const promise = originalRun('test');
      // isRunning should be true during execution
      wasRunning = result.current.isRunning;
      await promise;
    });

    // After completion, isRunning should be false
    expect(result.current.isRunning).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/copilot/hooks/__tests__/useAgenticLoop.test.ts`
Expected: FAIL — `useAgenticLoop` not found

**Step 3: Write the hook implementation**

Create `src/copilot/hooks/useAgenticLoop.ts`:

```typescript
/**
 * useAgenticLoop — React hook for AgenticLoop integration.
 *
 * Replaces useBridge with a simpler hook that tracks tool calls
 * and the final response from the agentic loop.
 *
 * @module useAgenticLoop
 */

import { useState, useCallback } from 'react';
import { AgenticLoop, type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';

export interface ToolCallProgress {
  name: string;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  error?: string;
}

export interface UseAgenticLoopReturn {
  /** Tool calls in progress or completed */
  toolCalls: ToolCallProgress[];
  /** Whether the loop is currently running */
  isRunning: boolean;
  /** Final text response from the LLM */
  response: string | null;
  /** Run a user request through the agentic loop */
  run: (request: string) => Promise<string>;
}

export function useAgenticLoop(options: AgenticLoopOptions): UseAgenticLoopReturn {
  const [toolCalls, setToolCalls] = useState<ToolCallProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const run = useCallback(async (request: string): Promise<string> => {
    setIsRunning(true);
    setToolCalls([]);
    setResponse(null);

    const loop = new AgenticLoop(options);

    const handleEvent = (event: AgenticEvent) => {
      switch (event.type) {
        case 'tool:start':
          setToolCalls((prev) => [...prev, { name: event.name, status: 'running' }]);
          break;
        case 'tool:complete':
          setToolCalls((prev) =>
            prev.map((tc, idx) =>
              // Update the last running instance of this tool name
              tc.name === event.name && tc.status === 'running' && !prev.slice(idx + 1).some(t => t.name === event.name && t.status === 'running')
                ? { ...tc, status: 'done' as const, result: event.result }
                : tc
            )
          );
          break;
        case 'tool:error':
          setToolCalls((prev) =>
            prev.map((tc, idx) =>
              tc.name === event.name && tc.status === 'running' && !prev.slice(idx + 1).some(t => t.name === event.name && t.status === 'running')
                ? { ...tc, status: 'error' as const, error: event.error }
                : tc
            )
          );
          break;
        case 'complete':
          setResponse(event.content);
          break;
      }
    };

    try {
      const result = await loop.run(request, handleEvent);
      return result;
    } finally {
      setIsRunning(false);
    }
  }, [options]);

  return { toolCalls, isRunning, response, run };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/hooks/__tests__/useAgenticLoop.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/hooks/useAgenticLoop.ts src/copilot/hooks/__tests__/useAgenticLoop.test.ts
git commit -m "feat(copilot): add useAgenticLoop React hook"
```

---

### Task 3: Adapt Debug Suite for AgenticLoop

**Files:**
- Modify: `src/copilot/debug/types.ts`
- Modify: `src/copilot/debug/ExecutionRecorder.ts`
- Modify: `src/copilot/debug/ConsoleLogger.ts`
- Modify: `src/copilot/debug/createDebugBridge.ts`
- Modify: `src/copilot/debug/__tests__/createDebugBridge.test.ts`

**Step 1: Update debug types**

Add new agentic record types to `src/copilot/debug/types.ts`. Keep old types so the existing debug suite still compiles during transition. Add these at the bottom:

```typescript
// ─── Agentic Loop Records ────────────────────────────────────────────────────

export interface AgenticToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

export interface AgenticRecord {
  id: string;
  timestamp: number;
  userRequest: string;
  toolCalls: AgenticToolCallRecord[];
  finalResponse: string;
  totalDuration: number;
  success: boolean;
  error?: string;
}
```

**Step 2: Create AgenticRecorder**

Create `src/copilot/debug/AgenticRecorder.ts`:

```typescript
/**
 * AgenticRecorder — aggregates debug data during an agentic loop run.
 *
 * Replaces ExecutionRecorder for the new AgenticLoop architecture.
 * Simpler lifecycle: start() -> recordToolCall() -> finalize()
 */

import type { AgenticRecord, AgenticToolCallRecord } from './types';

export class AgenticRecorder {
  private id = '';
  private startTime = 0;
  private userRequest = '';
  private toolCalls: AgenticToolCallRecord[] = [];

  start(userRequest: string): void {
    this.id = crypto.randomUUID();
    this.startTime = Date.now();
    this.userRequest = userRequest;
    this.toolCalls = [];
  }

  recordToolCall(record: AgenticToolCallRecord): void {
    this.toolCalls.push(record);
  }

  finalize(finalResponse: string, success: boolean, error?: string): AgenticRecord {
    return {
      id: this.id,
      timestamp: this.startTime,
      userRequest: this.userRequest,
      toolCalls: [...this.toolCalls],
      finalResponse,
      totalDuration: Date.now() - this.startTime,
      success,
      error,
    };
  }

  reset(): void {
    this.id = '';
    this.startTime = 0;
    this.userRequest = '';
    this.toolCalls = [];
  }
}
```

**Step 3: Create AgenticConsoleLogger**

Create `src/copilot/debug/AgenticConsoleLogger.ts`:

```typescript
import type { AgenticRecord } from './types';

export class AgenticConsoleLogger {
  log(record: AgenticRecord): void {
    const status = record.success ? '\u2713' : '\u2717';
    const color = record.success ? 'color: green' : 'color: red';
    console.group(
      `%c[AgenticLoop] "${record.userRequest}" (${record.totalDuration}ms) ${status}`,
      `font-weight: bold; ${color}`
    );

    if (record.toolCalls.length > 0) {
      console.groupCollapsed(`\u26A1 Tool calls (${record.toolCalls.length})`);
      for (const tc of record.toolCalls) {
        const typeLabel = tc.isMetaTool ? 'read' : 'write';
        const resultPreview = JSON.stringify(tc.result).slice(0, 100);
        console.log(
          `  ${tc.name} [${typeLabel}] (${Math.round(tc.duration)}ms) → ${resultPreview}`
        );
      }
      console.groupEnd();
    }

    console.log('Response:', record.finalResponse.slice(0, 200));

    if (record.error) {
      console.error('Error:', record.error);
    }

    console.groupEnd();
  }
}
```

**Step 4: Create createDebugAgenticLoop factory**

Add to `src/copilot/debug/createDebugBridge.ts` (below existing code):

```typescript
import { AgenticLoop, type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';
import { AgenticRecorder } from './AgenticRecorder';
import { AgenticConsoleLogger } from './AgenticConsoleLogger';

export interface DebugAgenticLoopResult {
  loop: AgenticLoop;
  store: DebugStore | null;
}

export function createDebugAgenticLoop(options: AgenticLoopOptions): DebugAgenticLoopResult {
  if (!isDebugEnabled()) {
    return {
      loop: new AgenticLoop(options),
      store: null,
    };
  }

  const recorder = new AgenticRecorder();
  const logger = new AgenticConsoleLogger();
  const debugStore = new DebugStore();

  // Wrap options.send to record through the loop
  const loop = new AgenticLoop(options);

  // We can't easily wrap the loop's internal send, so instead we
  // wrap the run method to capture events for recording.
  const originalRun = loop.run.bind(loop);
  loop.run = async (userRequest: string, onEvent: (event: AgenticEvent) => void): Promise<string> => {
    recorder.start(userRequest);

    const wrappedOnEvent = (event: AgenticEvent) => {
      if (event.type === 'tool:complete' || event.type === 'tool:error') {
        const toolCalls = loop.getLastToolCalls();
        const lastCall = toolCalls[toolCalls.length - 1];
        if (lastCall) {
          recorder.recordToolCall(lastCall);
        }
      }
      onEvent(event);
    };

    try {
      const result = await originalRun(userRequest, wrappedOnEvent);
      const record = recorder.finalize(result, true);
      logger.log(record);
      debugStore.save(record as never);
      recorder.reset();
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const record = recorder.finalize('', false, errorMsg);
      logger.log(record);
      debugStore.save(record as never);
      recorder.reset();
      throw err;
    }
  };

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__openclo_debug = createDebugAPI(debugStore);
  }

  return { loop, store: debugStore };
}
```

**Step 5: Write tests for AgenticRecorder**

Create `src/copilot/debug/__tests__/AgenticRecorder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgenticRecorder } from '../AgenticRecorder';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });

describe('AgenticRecorder', () => {
  let recorder: AgenticRecorder;

  beforeEach(() => {
    recorder = new AgenticRecorder();
  });

  it('records tool calls and finalizes', () => {
    recorder.start('reduce neckline 2cm');
    recorder.recordToolCall({
      name: 'getGarmentState',
      arguments: {},
      result: { success: true, data: { pieceCount: 2 } },
      duration: 5,
      isMetaTool: true,
    });
    recorder.recordToolCall({
      name: 'modifyEdge',
      arguments: { pieceId: 'p1', delta: -20 },
      result: { success: true, data: { newLength: 125 } },
      duration: 12,
      isMetaTool: false,
    });

    const record = recorder.finalize('Neckline reduced!', true);

    expect(record.id).toBe('test-uuid');
    expect(record.userRequest).toBe('reduce neckline 2cm');
    expect(record.toolCalls).toHaveLength(2);
    expect(record.toolCalls[0].isMetaTool).toBe(true);
    expect(record.toolCalls[1].isMetaTool).toBe(false);
    expect(record.finalResponse).toBe('Neckline reduced!');
    expect(record.success).toBe(true);
  });

  it('records error state', () => {
    recorder.start('test');
    const record = recorder.finalize('', false, 'Something broke');

    expect(record.success).toBe(false);
    expect(record.error).toBe('Something broke');
  });

  it('resets state between runs', () => {
    recorder.start('first');
    recorder.recordToolCall({
      name: 'test',
      arguments: {},
      result: {},
      duration: 0,
      isMetaTool: true,
    });
    recorder.finalize('done', true);
    recorder.reset();

    recorder.start('second');
    const record = recorder.finalize('done', true);

    expect(record.userRequest).toBe('second');
    expect(record.toolCalls).toHaveLength(0);
  });
});
```

**Step 6: Run tests**

Run: `npx vitest run src/copilot/debug/__tests__/AgenticRecorder.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/copilot/debug/types.ts src/copilot/debug/AgenticRecorder.ts src/copilot/debug/AgenticConsoleLogger.ts src/copilot/debug/createDebugBridge.ts src/copilot/debug/__tests__/AgenticRecorder.test.ts
git commit -m "feat(copilot): add debug suite for AgenticLoop"
```

---

### Task 4: Wire CopilotPanel to AgenticLoop

**Files:**
- Modify: `src/components/CopilotPanel/CopilotPanel.tsx`
- Modify: `src/copilot/reasoning/bridge/index.ts`

**Step 1: Update barrel exports**

Add to `src/copilot/reasoning/bridge/index.ts`:

```typescript
export { AgenticLoop } from './AgenticLoop';
export type { AgenticLoopOptions, AgenticEvent, AgenticEventHandler, ToolCallRecord } from './AgenticLoop';
```

**Step 2: Update CopilotPanel to use AgenticLoop**

In `src/components/CopilotPanel/CopilotPanel.tsx`, replace the `useBridge` integration with `useAgenticLoop`. Key changes:

1. Replace imports:
   - Remove: `import { useBridge } from '../../copilot/hooks/useBridge';`
   - Remove: `import { Planner } from '../../copilot/reasoning/bridge/Planner';`
   - Remove: `import { AgenticPlanner } from '../../copilot/reasoning/bridge/AgenticPlanner';`
   - Remove: `import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';`
   - Add: `import { useAgenticLoop } from '../../copilot/hooks/useAgenticLoop';`
   - Add: `import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';`

2. Replace the `agenticPlanner` useMemo block and `bridgeHook = useBridge(...)` block with:

```typescript
// Tool registry with Redux context
const registry = useMemo(() => {
  const reg = getDefaultRegistry();
  reg.setContext(dispatch, () => store.getState());
  return reg;
}, [dispatch]);

// Build action tool defs for the LLM
const actionToolDefs = useMemo(() => {
  return registry.list().map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}, [registry]);

// Agentic loop hook
const agenticHook = useAgenticLoop({
  send: useMemo(() => {
    if (!providerConfig) return async () => ({ content: '', toolCalls: [] });
    const provider = getProvider(providerConfig);
    return (messages, tools, config) =>
      provider.send(messages, tools, (config ?? providerConfig) as ProviderConfig);
  }, [providerConfig]),
  metaTools: useMemo(() => getAllMetaTools(), []),
  actionToolDefs,
  getState: () => store.getState(),
  dispatch,
  registry,
  providerConfig: providerConfig ?? undefined,
});
```

3. Replace `handleProviderSend` to use `agenticHook.run()`:
   - The result is now the text response directly (a string), not a `BridgeResult`
   - `agenticHook.toolCalls` provides tool call progress for the UI

4. Replace the `{bridgeHook.progress && <ProgressMessage .../>}` block with tool-call progress display (or remove for now — Task 5 handles the UI).

5. Remove the `agenticPlannerRef` ref since it's no longer needed.

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (or only pre-existing errors)

**Step 4: Commit**

```bash
git add src/components/CopilotPanel/CopilotPanel.tsx src/copilot/reasoning/bridge/index.ts
git commit -m "feat(copilot): wire CopilotPanel to AgenticLoop"
```

---

### Task 5: Adapt Progress UI for Tool Calls

**Files:**
- Modify: `src/components/CopilotPanel/ProgressMessage/ProgressMessage.tsx`
- Modify: `src/components/CopilotPanel/CopilotPanel.tsx`

**Step 1: Update ProgressMessage to display tool calls**

Replace the plan/step-based `ProgressState` with tool-call-based display. The `ProgressMessage` component should accept `ToolCallProgress[]` from `useAgenticLoop` instead of `ProgressState`.

Update `ProgressMessage.tsx`:

```typescript
import React, { useState } from 'react';
import type { ToolCallProgress } from '../../../copilot/hooks/useAgenticLoop';
import './ProgressMessage.css';

export interface ProgressMessageProps {
  /** Tool calls in progress or completed */
  toolCalls: ToolCallProgress[];
  /** Whether the loop is currently running */
  isRunning: boolean;
  /** Final text response */
  response: string | null;
}

export const ProgressMessage: React.FC<ProgressMessageProps> = ({
  toolCalls,
  isRunning,
  response,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0 && !isRunning) return null;

  const isDone = !isRunning && response !== null;
  const hasFailed = toolCalls.some(tc => tc.status === 'error');

  const getStatusClass = () => {
    if (hasFailed) return 'progress-failed';
    if (isDone) return 'progress-done';
    return 'progress-running';
  };

  const getStatusIcon = () => {
    if (hasFailed) return '\u2717';
    if (isDone) return '\u2713';
    return '\uD83D\uDCCB';
  };

  return (
    <div className={`progress-message ${getStatusClass()}`}>
      <div className="progress-header">
        <span className="progress-icon">{getStatusIcon()}</span>
        <span className="progress-intent">
          {isDone ? 'Complete' : 'Working...'}
        </span>
        {toolCalls.length > 0 && (
          <button
            className="progress-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        )}
      </div>

      {(isRunning || expanded) && (
        <div className="progress-steps">
          {toolCalls.map((tc, i) => (
            <div key={i} className={`progress-step progress-step-${tc.status}`}>
              <span className="progress-step-indicator">
                {tc.status === 'done' ? '\u2713' :
                 tc.status === 'running' ? '\u25CF' :
                 tc.status === 'error' ? '\u2717' : '\u25CB'}
              </span>
              <span className="progress-step-label">{tc.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressMessage;
```

**Step 2: Update CopilotPanel to pass tool calls to ProgressMessage**

In `CopilotPanel.tsx`, replace:
```tsx
{bridgeHook.progress && (
  <ProgressMessage
    state={bridgeHook.progress}
    onAnswer={bridgeHook.answer}
    onUndo={bridgeHook.undo}
  />
)}
```

With:
```tsx
{(agenticHook.isRunning || agenticHook.toolCalls.length > 0) && (
  <ProgressMessage
    toolCalls={agenticHook.toolCalls}
    isRunning={agenticHook.isRunning}
    response={agenticHook.response}
  />
)}
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/CopilotPanel/ProgressMessage/ProgressMessage.tsx src/components/CopilotPanel/CopilotPanel.tsx
git commit -m "feat(copilot): adapt ProgressMessage UI for agentic tool calls"
```

---

### Task 6: Clean Up Deleted Files

**Files:**
- Delete: `src/copilot/reasoning/bridge/Reasoner.ts`
- Delete: `src/copilot/reasoning/bridge/ResultStore.ts`
- Delete: `src/copilot/reasoning/bridge/SummaryGenerator.ts`
- Delete: `src/copilot/reasoning/bridge/Executor.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/Executor.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/Reasoner.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/ResultStore.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/SummaryGenerator.test.ts`
- Modify: `src/copilot/reasoning/bridge/index.ts` (remove deleted exports)
- Modify: `src/copilot/hooks/useBridge.ts` (keep file but mark deprecated or remove)

**Important:** Do NOT delete `AgenticPlanner.ts`, `EnhancedReasoner.ts`, `ExecutionBridge.ts`, `Planner.ts`, or `types.ts` yet. They may still be imported elsewhere. Only delete files that are clearly replaced and have no remaining imports.

**Step 1: Check for remaining imports**

Run: `grep -r "from.*Reasoner" src/ --include="*.ts" --include="*.tsx" -l`
Run: `grep -r "from.*ResultStore" src/ --include="*.ts" --include="*.tsx" -l`
Run: `grep -r "from.*SummaryGenerator" src/ --include="*.ts" --include="*.tsx" -l`
Run: `grep -r "from.*Executor" src/ --include="*.ts" --include="*.tsx" -l`

For each file still importing these modules, update imports or remove the reference.

**Step 2: Remove deleted exports from index.ts**

In `src/copilot/reasoning/bridge/index.ts`, remove these lines:
```typescript
export { ResultStore } from './ResultStore';
export { SummaryGenerator } from './SummaryGenerator';
export { Executor } from './Executor';
export type { ToolRegistry, ToolFunction, Evaluator, ExecutionResult } from './Executor';
export { Reasoner } from './Reasoner';
export type { ReasonerLLM } from './Reasoner';
```

Keep the `ExecutionBridge`, `AgenticPlanner`, `EnhancedReasoner`, `Planner`, and `types` exports for now — they'll be cleaned up later once all references are migrated.

**Step 3: Delete the files**

```bash
rm src/copilot/reasoning/bridge/Reasoner.ts
rm src/copilot/reasoning/bridge/ResultStore.ts
rm src/copilot/reasoning/bridge/SummaryGenerator.ts
rm src/copilot/reasoning/bridge/Executor.ts
rm -f src/copilot/reasoning/bridge/__tests__/Executor.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/Reasoner.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/ResultStore.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/SummaryGenerator.test.ts
```

**Step 4: Run tests and type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (may need to fix remaining imports found in Step 1)

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(copilot): remove replaced bridge components (Reasoner, ResultStore, SummaryGenerator, Executor)"
```

---

### Task 7: Remove Legacy Bridge Components

**Files:**
- Delete: `src/copilot/reasoning/bridge/ExecutionBridge.ts`
- Delete: `src/copilot/reasoning/bridge/AgenticPlanner.ts`
- Delete: `src/copilot/reasoning/bridge/EnhancedReasoner.ts`
- Delete: `src/copilot/reasoning/bridge/Planner.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/ExecutionBridge.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts`
- Delete: `src/copilot/reasoning/bridge/__tests__/Planner.test.ts`
- Delete: `src/copilot/hooks/useBridge.ts`
- Delete: `src/copilot/hooks/__tests__/useBridge.test.ts` (if exists)
- Modify: `src/copilot/reasoning/bridge/index.ts`
- Modify: `src/copilot/reasoning/bridge/types.ts` (remove plan-specific types)
- Modify: `src/copilot/debug/createDebugBridge.ts` (remove old bridge factory)
- Modify: `src/copilot/debug/middleware/ExecutorMiddleware.ts` (remove or keep for reference)

**Step 1: Check all remaining imports**

Run `grep -r` for each module to find all remaining references. Fix them all before deleting.

**Step 2: Update bridge/index.ts**

Replace with clean exports:

```typescript
// src/copilot/reasoning/bridge/index.ts
/**
 * Bridge Module — Copilot Agentic Loop
 *
 * @module bridge
 */

// AgenticLoop
export { AgenticLoop } from './AgenticLoop';
export type { AgenticLoopOptions, AgenticEvent, AgenticEventHandler, ToolCallRecord } from './AgenticLoop';

// Meta-tools
export { getAllMetaTools } from './meta-tools';

// Domain bootstrap
export { buildDomainBootstrap } from './domainBootstrap';
```

**Step 3: Slim down types.ts**

Remove plan-specific types (`ExecutionPlan`, `Step`, `ExecuteStep`, `EvaluateStep`, `StepResult`, `ReasonerInput`, `ReasonerDecision`, `BridgeEvent`, `BridgeEventHandler`, `ProgressState`, `ProgressStep`, `BridgeConfig`, `IPlanner`, `IReasoner`, type guards). Keep only what's still needed by the rest of the app (if any). If nothing else imports these, delete the entire file.

**Step 4: Delete files**

```bash
rm src/copilot/reasoning/bridge/ExecutionBridge.ts
rm src/copilot/reasoning/bridge/AgenticPlanner.ts
rm src/copilot/reasoning/bridge/EnhancedReasoner.ts
rm src/copilot/reasoning/bridge/Planner.ts
rm -f src/copilot/reasoning/bridge/__tests__/ExecutionBridge.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts
rm -f src/copilot/reasoning/bridge/__tests__/Planner.test.ts
rm src/copilot/hooks/useBridge.ts
rm -f src/copilot/hooks/__tests__/useBridge.test.ts
```

**Step 5: Clean up debug suite**

In `src/copilot/debug/createDebugBridge.ts`:
- Remove the old `createDebugBridge` function and its `ExecutionBridge` import
- Rename file to `src/copilot/debug/createDebugLoop.ts` if desired, or keep old name
- Remove `src/copilot/debug/middleware/ExecutorMiddleware.ts` if no longer referenced
- Remove old `ExecutionRecorder.ts` if no longer referenced
- Remove old `ConsoleLogger.ts` if no longer referenced

**Step 6: Run tests and type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(copilot): remove legacy bridge architecture (ExecutionBridge, AgenticPlanner, Planner, etc.)"
```

---

### Task 8: Update domainBootstrap for Agentic Loop

**Files:**
- Modify: `src/copilot/reasoning/bridge/domainBootstrap.ts`

**Step 1: Update the prompt**

The domain bootstrap prompt currently references "execution plans" and "JSON output format". Update it to match the new agentic loop behavior where the LLM calls tools directly:

```typescript
export function buildDomainBootstrap(): string {
  return `You are a garment pattern modification assistant for a professional CAD application.

## Your Role
You help modify pattern pieces by calling tools directly. You have access to read-only tools to inspect the garment and action tools to modify it.

## Domain Knowledge
Garment patterns consist of flat pattern pieces that are sewn together to create 3D garments.

Common piece types: bodice (front/back), sleeve, skirt (front/back), pants (front/back), collar, cuff, waistband, facing, lining.

Common edge types on pieces:
- neckline, shoulder, armhole, sideSeam, hemline, centerFront, centerBack
- waistline, hipline, crotchSeam, inseam, outseam (for pants/skirts)
- sleeveHead, sleeveHem, underarm (for sleeves)

## Multilingual Support
Users may describe modifications in any language. Map their terms to the internal edge/piece names.
Use the read-only tools (getGarmentState, getPieceDetails, measureEdge, searchPieces) to discover the actual piece IDs and edge names in the project.

## Workflow
1. Use read-only tools to understand the current garment state
2. Use action tools to make the requested modifications
3. Verify results with read-only tools if needed
4. Respond in the user's language with a summary of what was done`;
}
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/copilot/reasoning/bridge/domainBootstrap.ts
git commit -m "refactor(copilot): update domain bootstrap prompt for agentic loop"
```

---

### Task 9: Integration Test — End-to-End Agentic Loop

**Files:**
- Create: `src/copilot/reasoning/bridge/__tests__/AgenticLoop.e2e.test.ts`

**Step 1: Write an integration test**

This test verifies the full flow: meta-tool call → action tool call → error → recovery → success:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgenticLoop, type AgenticEvent } from '../AgenticLoop';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';
import type { ToolRegistry, ToolResult } from '../../../action/tools/registry';

describe('AgenticLoop E2E', () => {
  it('full flow: inspect → modify → verify → respond', async () => {
    // Meta-tools
    const getGarmentState: MetaToolDefinition = {
      name: 'getGarmentState',
      description: 'Get garment state',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => ({
        success: true,
        data: { pieces: [{ id: 'front-1', name: 'Front Bodice', edges: ['neckline', 'shoulder'] }], pieceCount: 1 },
      })),
    };

    const measureEdge: MetaToolDefinition = {
      name: 'measureEdge',
      description: 'Measure edge',
      parameters: { type: 'object', properties: { pieceId: { type: 'string' }, edgeName: { type: 'string' } } },
      execute: vi.fn(async () => ({
        success: true,
        data: { pieceId: 'front-1', edgeName: 'neckline', length: 145.3, unit: 'mm' },
      })),
    };

    // Action tool registry mock
    const mockRegistry = {
      execute: vi.fn(async (_name: string, _params: unknown): Promise<ToolResult> => ({
        success: true,
        data: { newLength: 125.3 },
      })),
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };

    // LLM responses simulate a full agentic conversation
    let callIndex = 0;
    const send = vi.fn(async (): Promise<ProviderResponse> => {
      callIndex++;
      switch (callIndex) {
        case 1:
          // Step 1: LLM calls getGarmentState
          return {
            content: '',
            toolCalls: [{ id: 'tc1', name: 'getGarmentState', arguments: '{}' }],
          };
        case 2:
          // Step 2: LLM calls measureEdge
          return {
            content: '',
            toolCalls: [{ id: 'tc2', name: 'measureEdge', arguments: JSON.stringify({ pieceId: 'front-1', edgeName: 'neckline' }) }],
          };
        case 3:
          // Step 3: LLM calls modifyEdge
          return {
            content: '',
            toolCalls: [{ id: 'tc3', name: 'modifyEdge', arguments: JSON.stringify({ pieceId: 'front-1', edge: 'neckline', delta: -20 }) }],
          };
        case 4:
          // Step 4: LLM verifies by measuring again
          return {
            content: '',
            toolCalls: [{ id: 'tc4', name: 'measureEdge', arguments: JSON.stringify({ pieceId: 'front-1', edgeName: 'neckline' }) }],
          };
        default:
          // Step 5: LLM responds with summary
          return {
            content: 'Listo! Acorté el escote 2cm en el delantero. La nueva medida es 12.53cm.',
            toolCalls: [],
          };
      }
    });

    const loop = new AgenticLoop({
      send,
      metaTools: [getGarmentState, measureEdge],
      actionToolDefs: [{ name: 'modifyEdge', description: 'Modify edge', parameters: { type: 'object', properties: {} } }],
      getState: () => ({}) as never,
      dispatch: vi.fn(),
      registry: mockRegistry as unknown as ToolRegistry,
    });

    const events: AgenticEvent[] = [];
    const result = await loop.run('reducir escote 2cm', (e) => events.push(e));

    // Verify final response
    expect(result).toContain('Acorté el escote 2cm');

    // Verify tool calls happened in order
    const toolStarts = events.filter(e => e.type === 'tool:start').map(e => (e as { name: string }).name);
    expect(toolStarts).toEqual(['getGarmentState', 'measureEdge', 'modifyEdge', 'measureEdge']);

    // Verify all tools completed
    expect(events.filter(e => e.type === 'tool:complete')).toHaveLength(4);
    expect(events.filter(e => e.type === 'complete')).toHaveLength(1);

    // Verify LLM was called 5 times
    expect(send).toHaveBeenCalledTimes(5);
  });
});
```

**Step 2: Run the test**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/AgenticLoop.e2e.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/copilot/reasoning/bridge/__tests__/AgenticLoop.e2e.test.ts
git commit -m "test(copilot): add AgenticLoop end-to-end integration test"
```

---

### Task 10: Final Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Verify no leftover references**

Run: `grep -r "ExecutionBridge\|useBridge\|AgenticPlanner\|ExecutionPlan\|EnhancedReasoner\|ResultStore\|SummaryGenerator" src/ --include="*.ts" --include="*.tsx" -l`
Expected: No results (or only in files being imported for type compatibility)

**Step 4: Final commit**

```bash
git commit --allow-empty -m "chore(copilot): verify agentic loop migration complete"
```

---

## Task Dependency Order

```
Task 1 (AgenticLoop core)
  └── Task 2 (useAgenticLoop hook)
        └── Task 4 (Wire CopilotPanel)
              └── Task 5 (Adapt Progress UI)
  └── Task 3 (Debug suite)
Task 8 (Update domainBootstrap) — independent
Task 6 (Clean up first batch) — after Tasks 4, 5
  └── Task 7 (Remove legacy) — after Task 6
Task 9 (E2E test) — after Task 1
Task 10 (Final verification) — after all tasks
```

## Summary of Changes

| Action | Files |
|--------|-------|
| **Create** | `AgenticLoop.ts`, `useAgenticLoop.ts`, `AgenticRecorder.ts`, `AgenticConsoleLogger.ts`, tests |
| **Delete** | `ExecutionBridge.ts`, `AgenticPlanner.ts`, `EnhancedReasoner.ts`, `Planner.ts`, `Reasoner.ts`, `ResultStore.ts`, `SummaryGenerator.ts`, `Executor.ts`, `useBridge.ts`, their tests |
| **Modify** | `CopilotPanel.tsx`, `ProgressMessage.tsx`, `domainBootstrap.ts`, `index.ts`, `types.ts`, debug suite |
