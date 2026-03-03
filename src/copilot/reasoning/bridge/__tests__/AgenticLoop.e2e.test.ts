import { describe, it, expect, vi } from 'vitest';
import { AgenticLoop, type AgenticEvent } from '../AgenticLoop';
import type { ProviderResponse } from '../../../providers/types';
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
      execute: vi.fn(async (): Promise<ToolResult> => ({
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
