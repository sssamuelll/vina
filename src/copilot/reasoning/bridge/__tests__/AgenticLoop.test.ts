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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondCallMessages = (send.mock.calls as any)[1][0] as Array<{ role: string; reasoning_content?: string }>;
    const assistantMsg = secondCallMessages.find((m) => m.role === 'assistant');
    expect(assistantMsg!.reasoning_content).toBe('Let me check the garment state first.');
  });

  it('produces error result when tool arguments are malformed JSON', async () => {
    const malformedArgs = '{"pieceId": "p1", delta: INVALID}';

    const mockRegistry = {
      execute: vi.fn(async () => ({ success: true, data: {} })),
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };

    const send = createMockSend([
      // LLM sends malformed JSON arguments
      { content: '', toolCalls: [{ id: 'tc1', name: 'modifyEdge', arguments: malformedArgs }] },
      // LLM sees the error and responds
      { content: 'Sorry, I had a formatting error. Let me try again.', toolCalls: [] },
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
    await loop.run('modify neckline', (e) => events.push(e));

    // Tool should NOT have been executed with empty args
    expect(mockRegistry.execute).not.toHaveBeenCalled();

    // Should emit tool:error event
    const errorEvents = events.filter(e => e.type === 'tool:error');
    expect(errorEvents).toHaveLength(1);

    // Error message should include the raw malformed string for debugging
    const errorEvent = errorEvents[0] as { type: 'tool:error'; error: string };
    expect(errorEvent.error).toContain('Malformed JSON');
    expect(errorEvent.error).toContain(malformedArgs);

    // Error result should have been sent back to LLM as tool response
    const secondCallMessages = (send.mock.calls as unknown[][])[1][0] as Array<{ role: string; content: string }>;
    const toolMsg = secondCallMessages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    const toolResult = JSON.parse(toolMsg!.content);
    expect(toolResult.success).toBe(false);
    expect(toolResult.error).toContain('Malformed JSON');
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
