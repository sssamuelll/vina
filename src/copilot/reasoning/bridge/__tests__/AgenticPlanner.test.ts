// src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgenticPlanner } from '../AgenticPlanner';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';

// Mock LLM that responds with tool calls then a plan
function createMockSend(responses: ProviderResponse[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

// Minimal meta-tool
const mockMetaTool: MetaToolDefinition = {
  name: 'getGarmentState',
  description: 'Get garment state',
  parameters: { type: 'object', properties: {} },
  execute: vi.fn(async () => ({
    success: true,
    data: { pieces: [{ id: 'p1', name: 'Front', edges: ['neckline'] }], pieceCount: 1 },
  })),
};

const validPlanJson = JSON.stringify({
  intent: 'Reduce neckline by 2cm',
  steps: [
    { type: 'execute', id: 'step1', tool: 'modifyEdge', params: { pieceId: 'p1', edge: 'neckline', delta: -20 }, label: 'Modify neckline' },
  ],
});

describe('AgenticPlanner', () => {
  it('produces a plan without meta-tool calls if LLM responds directly', async () => {
    const send = createMockSend([
      { content: validPlanJson, toolCalls: [], usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('reduce neckline 2cm');
    expect(plan.intent).toBe('Reduce neckline by 2cm');
    expect(plan.steps).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('calls meta-tools when LLM requests them', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    const send = createMockSend([
      // First response: LLM wants to call a meta-tool
      { content: '', toolCalls: [toolCall], usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } },
      // Second response: LLM outputs the plan
      { content: validPlanJson, toolCalls: [], usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 } },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [mockMetaTool],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('reduce escote 2cm');
    expect(plan.intent).toBe('Reduce neckline by 2cm');
    expect(send).toHaveBeenCalledTimes(2);
    expect(mockMetaTool.execute).toHaveBeenCalled();
  });

  it('throws PlannerError for invalid JSON response', async () => {
    const send = createMockSend([
      { content: 'not valid json', toolCalls: [] },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    await expect(planner.plan('test')).rejects.toThrow();
  });

  it('tracks meta-tool calls for debugging', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: validPlanJson, toolCalls: [] },
    ]);

    const metaTool: MetaToolDefinition = {
      name: 'getGarmentState',
      description: 'Get garment state',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => ({
        success: true,
        data: { pieces: [], pieceCount: 0 },
      })),
    };

    const planner = new AgenticPlanner({
      send,
      metaTools: [metaTool],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('test');
    expect(plan).toBeDefined();
    expect(planner.getLastMetaToolCalls()).toHaveLength(1);
    expect(planner.getLastMetaToolCalls()[0].name).toBe('getGarmentState');
  });
});
