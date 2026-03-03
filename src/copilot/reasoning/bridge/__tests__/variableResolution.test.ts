import { describe, it, expect } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';

describe('ExecutionBridge variable resolution', () => {
  it('resolves $stepId.result.field references in step params', async () => {
    const capturedParams: Record<string, unknown>[] = [];

    const bridge = new ExecutionBridge({
      plannerLLM: async () => JSON.stringify({
        intent: 'test variable resolution',
        steps: [
          { type: 'execute', id: 'step1', tool: 'getThing', params: {}, label: 'Get thing' },
          { type: 'execute', id: 'step2', tool: 'useThing', params: { value: '$step1.result.name' }, label: 'Use thing' },
        ],
      }),
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        getThing: async () => {
          capturedParams.push({});
          return { success: true, data: { name: 'resolved-value' } };
        },
        useThing: async (params) => {
          capturedParams.push(params);
          return { success: true, data: {} };
        },
      },
    });

    const result = await bridge.run('test');
    expect(result.success).toBe(true);
    // The second tool should receive the resolved value, not the variable reference
    expect(capturedParams[1]).toEqual({ value: 'resolved-value' });
  });

  it('passes through non-variable params unchanged', async () => {
    const capturedParams: Record<string, unknown>[] = [];

    const bridge = new ExecutionBridge({
      plannerLLM: async () => JSON.stringify({
        intent: 'test',
        steps: [
          { type: 'execute', id: 'step1', tool: 'doThing', params: { name: 'plain-value', count: 42 }, label: 'Do' },
        ],
      }),
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        doThing: async (params) => {
          capturedParams.push(params);
          return { success: true, data: {} };
        },
      },
    });

    await bridge.run('test');
    expect(capturedParams[0]).toEqual({ name: 'plain-value', count: 42 });
  });
});
