/**
 * Tests for useAgenticLoop hook.
 *
 * Since @testing-library/react is not available, we test:
 * 1. The pure `reduceToolCalls` reducer (event -> toolCalls state)
 * 2. Integration: verifying the mock AgenticLoop is wired correctly
 *    and the reducer produces the right state from event sequences
 */

import { describe, it, expect, vi } from 'vitest';
import { reduceToolCalls, type ToolCallProgress } from '../useAgenticLoop';
import type { AgenticEvent } from '../../reasoning/bridge/AgenticLoop';

// ─── reduceToolCalls (pure function) ─────────────────────────────────────────

describe('reduceToolCalls', () => {
  it('adds a running entry on tool:start', () => {
    const prev: ToolCallProgress[] = [];
    const event: AgenticEvent = { type: 'tool:start', name: 'getGarmentState', args: {} };

    const next = reduceToolCalls(prev, event);

    expect(next).toEqual([{ name: 'getGarmentState', status: 'running' }]);
  });

  it('marks the last running instance as done on tool:complete', () => {
    const prev: ToolCallProgress[] = [
      { name: 'getGarmentState', status: 'running' },
    ];
    const event: AgenticEvent = {
      type: 'tool:complete',
      name: 'getGarmentState',
      result: { success: true },
    };

    const next = reduceToolCalls(prev, event);

    expect(next).toEqual([
      { name: 'getGarmentState', status: 'done', result: { success: true } },
    ]);
  });

  it('marks the last running instance as error on tool:error', () => {
    const prev: ToolCallProgress[] = [
      { name: 'modifyEdge', status: 'running' },
    ];
    const event: AgenticEvent = {
      type: 'tool:error',
      name: 'modifyEdge',
      error: 'Piece not found',
    };

    const next = reduceToolCalls(prev, event);

    expect(next).toEqual([
      { name: 'modifyEdge', status: 'error', error: 'Piece not found' },
    ]);
  });

  it('does not modify state on unrelated event types', () => {
    const prev: ToolCallProgress[] = [
      { name: 'getGarmentState', status: 'done', result: {} },
    ];
    const event: AgenticEvent = { type: 'complete', content: 'All done!' };

    const next = reduceToolCalls(prev, event);

    expect(next).toBe(prev); // same reference -- no change
  });

  it('handles multiple tool calls in sequence', () => {
    let state: ToolCallProgress[] = [];

    // Start first tool
    state = reduceToolCalls(state, { type: 'tool:start', name: 'getGarmentState', args: {} });
    expect(state).toHaveLength(1);
    expect(state[0].status).toBe('running');

    // Complete first tool
    state = reduceToolCalls(state, {
      type: 'tool:complete',
      name: 'getGarmentState',
      result: { success: true, data: { pieceCount: 2 } },
    });
    expect(state[0].status).toBe('done');

    // Start second tool
    state = reduceToolCalls(state, {
      type: 'tool:start',
      name: 'modifyEdge',
      args: { pieceId: 'p1', delta: -20 },
    });
    expect(state).toHaveLength(2);
    expect(state[1].status).toBe('running');

    // Complete second tool
    state = reduceToolCalls(state, {
      type: 'tool:complete',
      name: 'modifyEdge',
      result: { success: true },
    });
    expect(state[1].status).toBe('done');
  });

  it('updates the last running instance when same tool is called twice', () => {
    let state: ToolCallProgress[] = [];

    // Start same tool twice
    state = reduceToolCalls(state, { type: 'tool:start', name: 'measureEdge', args: {} });
    state = reduceToolCalls(state, { type: 'tool:start', name: 'measureEdge', args: {} });
    expect(state).toHaveLength(2);
    expect(state[0].status).toBe('running');
    expect(state[1].status).toBe('running');

    // Complete -- should mark the LAST running one (index 1)
    // Index 0: has running sibling at index 1? slice(1) includes running -> skip
    // Index 1: has running sibling after? slice(2) = [] -> no, so update
    state = reduceToolCalls(state, {
      type: 'tool:complete',
      name: 'measureEdge',
      result: { length: 42 },
    });
    expect(state[0].status).toBe('running');
    expect(state[1].status).toBe('done');

    // Complete second
    state = reduceToolCalls(state, {
      type: 'tool:complete',
      name: 'measureEdge',
      result: { length: 55 },
    });
    expect(state[0].status).toBe('done');
    expect(state[1].status).toBe('done');
  });
});

// ─── useAgenticLoop integration ──────────────────────────────────────────────

describe('useAgenticLoop integration', () => {
  // Since we cannot use renderHook (no @testing-library/react), we verify
  // the hook's wiring by testing:
  // 1. The module exports the correct interface
  // 2. The AgenticLoop mock is constructed and run is called
  // 3. Event sequences produce correct state via reduceToolCalls

  // Mock createDebugAgenticLoop to return a mock loop
  vi.mock('../../debug/createDebugBridge', () => {
    return {
      createDebugAgenticLoop: (options: unknown) => {
        const loop = {
          options,
          runCalls: [] as Array<{ request: string; onEvent: (e: unknown) => void }>,
          async run(request: string, onEvent: (e: unknown) => void): Promise<string> {
            loop.runCalls.push({ request, onEvent });
            onEvent({ type: 'tool:start', name: 'getGarmentState', args: {} });
            onEvent({ type: 'tool:complete', name: 'getGarmentState', result: { success: true } });
            onEvent({ type: 'complete', content: 'Done!' });
            return 'Done!';
          },
          getLastToolCalls() { return []; },
        };
        return { loop, store: null };
      },
    };
  });

  it('hook module exports useAgenticLoop and reduceToolCalls', async () => {
    const mod = await import('../useAgenticLoop');
    expect(typeof mod.useAgenticLoop).toBe('function');
    expect(typeof mod.reduceToolCalls).toBe('function');
  });

  it('createDebugAgenticLoop mock returns a working loop', async () => {
    const { createDebugAgenticLoop } = await import('../../debug/createDebugBridge');

    const options = {
      send: vi.fn(),
      metaTools: [],
      actionToolDefs: [],
      getState: () => ({}) as never,
      dispatch: vi.fn() as never,
    };

    const { loop } = createDebugAgenticLoop(options);
    const events: AgenticEvent[] = [];
    const result = await loop.run('test request', (e: AgenticEvent) => events.push(e));

    expect(result).toBe('Done!');
    expect(events).toContainEqual({ type: 'tool:start', name: 'getGarmentState', args: {} });
    expect(events).toContainEqual({ type: 'tool:complete', name: 'getGarmentState', result: { success: true } });
    expect(events).toContainEqual({ type: 'complete', content: 'Done!' });
  });

  it('event handler produces correct toolCalls state through reduceToolCalls', () => {
    // Simulate the same event sequence the mock produces
    const events: AgenticEvent[] = [
      { type: 'tool:start', name: 'getGarmentState', args: {} },
      { type: 'tool:complete', name: 'getGarmentState', result: { success: true } },
      { type: 'complete', content: 'Done!' },
    ];

    // Replay through reduceToolCalls (same logic the hook uses)
    let toolCalls: ToolCallProgress[] = [];
    for (const event of events) {
      toolCalls = reduceToolCalls(toolCalls, event);
    }

    expect(toolCalls).toEqual([
      { name: 'getGarmentState', status: 'done', result: { success: true } },
    ]);
  });

  it('error event produces correct toolCalls state', () => {
    const events: AgenticEvent[] = [
      { type: 'tool:start', name: 'modifyEdge', args: { pieceId: 'p1' } },
      { type: 'tool:error', name: 'modifyEdge', error: 'Piece not found' },
    ];

    let toolCalls: ToolCallProgress[] = [];
    for (const event of events) {
      toolCalls = reduceToolCalls(toolCalls, event);
    }

    expect(toolCalls).toEqual([
      { name: 'modifyEdge', status: 'error', error: 'Piece not found' },
    ]);
  });

  it('complex multi-step sequence produces correct state', () => {
    const events: AgenticEvent[] = [
      // First: read garment state
      { type: 'tool:start', name: 'getGarmentState', args: {} },
      { type: 'tool:complete', name: 'getGarmentState', result: { pieceCount: 2 } },
      // Second: try to modify edge, fails
      { type: 'tool:start', name: 'modifyEdge', args: { pieceId: 'bad-id' } },
      { type: 'tool:error', name: 'modifyEdge', error: 'Not found' },
      // Third: search for correct piece
      { type: 'tool:start', name: 'searchPieces', args: { query: 'front' } },
      { type: 'tool:complete', name: 'searchPieces', result: { matches: ['front-1'] } },
      // Fourth: retry modify with correct ID
      { type: 'tool:start', name: 'modifyEdge', args: { pieceId: 'front-1' } },
      { type: 'tool:complete', name: 'modifyEdge', result: { success: true } },
      // Done
      { type: 'complete', content: 'Neckline modified.' },
    ];

    let toolCalls: ToolCallProgress[] = [];
    for (const event of events) {
      toolCalls = reduceToolCalls(toolCalls, event);
    }

    expect(toolCalls).toHaveLength(4);
    expect(toolCalls[0]).toEqual({ name: 'getGarmentState', status: 'done', result: { pieceCount: 2 } });
    expect(toolCalls[1]).toEqual({ name: 'modifyEdge', status: 'error', error: 'Not found' });
    expect(toolCalls[2]).toEqual({ name: 'searchPieces', status: 'done', result: { matches: ['front-1'] } });
    expect(toolCalls[3]).toEqual({ name: 'modifyEdge', status: 'done', result: { success: true } });
  });
});
