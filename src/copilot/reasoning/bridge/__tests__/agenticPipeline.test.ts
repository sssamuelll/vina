// src/copilot/reasoning/bridge/__tests__/agenticPipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';
import { AgenticPlanner } from '../AgenticPlanner';
import type { ProviderResponse } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';

/**
 * Integration test: Full agentic pipeline
 * User says "reduce neckline 2cm" ->
 *   AgenticPlanner calls getGarmentState -> getPieceDetails -> outputs plan ->
 *   Executor runs modifyEdge with concrete params ->
 *   Success
 */
describe('Full agentic pipeline integration', () => {
  it('plans with meta-tools and executes with concrete params', async () => {
    const garmentState = {
      success: true,
      data: {
        pieces: [{ id: 'front', name: 'Front Bodice', edges: ['neckline', 'shoulder'] }],
        pieceCount: 1,
      },
    };

    const pieceDetails = {
      success: true,
      data: {
        id: 'front',
        name: 'Front Bodice',
        edges: [{ name: 'neckline', length: 125, edgeType: 'seam' }],
      },
    };

    const executionPlan = JSON.stringify({
      intent: 'Reduce neckline by 20mm',
      steps: [
        {
          type: 'execute',
          id: 'step1',
          tool: 'modifyEdge',
          params: { pieceId: 'front', edgeName: 'neckline', delta: -20 },
          label: 'Reduce neckline by 20mm',
        },
      ],
    });

    let sendCallCount = 0;
    const send = vi.fn(async () => {
      sendCallCount++;
      if (sendCallCount === 1) {
        // First call: LLM wants getGarmentState
        return {
          content: '',
          toolCalls: [{ id: 'tc1', name: 'getGarmentState', arguments: '{}' }],
        } as ProviderResponse;
      }
      if (sendCallCount === 2) {
        // Second call: LLM wants getPieceDetails
        return {
          content: '',
          toolCalls: [{ id: 'tc2', name: 'getPieceDetails', arguments: '{"pieceId":"front"}' }],
        } as ProviderResponse;
      }
      // Third call: LLM outputs the plan
      return { content: executionPlan, toolCalls: [] } as ProviderResponse;
    });

    // Mock meta-tools — typed explicitly to avoid union inference issues
    const getGarmentStateExecute = vi.fn(async () => garmentState);
    const getPieceDetailsExecute = vi.fn(async () => pieceDetails);

    const metaTools: MetaToolDefinition[] = [
      {
        name: 'getGarmentState',
        description: 'Get garment state',
        parameters: { type: 'object' as const, properties: {} },
        execute: getGarmentStateExecute,
      },
      {
        name: 'getPieceDetails',
        description: 'Get piece details',
        parameters: {
          type: 'object' as const,
          properties: { pieceId: { type: 'string' } },
          required: ['pieceId'],
        },
        execute: getPieceDetailsExecute,
      },
    ];

    const agenticPlanner = new AgenticPlanner({
      send,
      metaTools,
      toolSchemas: [
        {
          name: 'modifyEdge',
          description: 'Modify an edge',
          parameters: { type: 'object' as const, properties: {} },
        },
      ],
      getState: () => ({ project: { pieces: [], seams: [] } }) as never,
    });

    // Track what params modifyEdge receives
    let receivedParams: Record<string, unknown> = {};

    const bridge = new ExecutionBridge({
      plannerLLM: async () => '',
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const }),
      tools: {
        modifyEdge: async (params) => {
          receivedParams = params;
          return { success: true, data: { newLength: 105, oldLength: 125 } };
        },
      },
      agenticPlanner,
    });

    const result = await bridge.run('reduce el escote 2cm');

    // Verify the full pipeline worked
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(getGarmentStateExecute).toHaveBeenCalled();
    expect(getPieceDetailsExecute).toHaveBeenCalled();
    expect(receivedParams).toEqual({ pieceId: 'front', edgeName: 'neckline', delta: -20 });
  });
});
