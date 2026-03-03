import { describe, it, expect, vi } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';
import type { AgenticPlanner } from '../AgenticPlanner';

describe('ExecutionBridge with AgenticPlanner', () => {
  it('uses AgenticPlanner when provided in options', async () => {
    const planSpy = vi.fn(async () => ({
      intent: 'test',
      steps: [
        { type: 'execute' as const, id: 's1', tool: 'doThing', params: { x: 1 }, label: 'Do thing' },
      ],
    }));

    const mockPlanner = { plan: planSpy, getLastMetaToolCalls: () => [] } as unknown as AgenticPlanner;

    const bridge = new ExecutionBridge({
      plannerLLM: async () => '', // Shouldn't be called
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        doThing: async () => ({ success: true, data: {} }),
      },
      agenticPlanner: mockPlanner,
    });

    const result = await bridge.run('test request');
    expect(result.success).toBe(true);
    expect(planSpy).toHaveBeenCalledWith('test request');
  });

  it('does not call plannerLLM when AgenticPlanner is provided', async () => {
    const plannerLLM = vi.fn(async () => '');
    const planSpy = vi.fn(async () => ({
      intent: 'test',
      steps: [
        { type: 'execute' as const, id: 's1', tool: 'doThing', params: {}, label: 'Do' },
      ],
    }));

    const mockPlanner = { plan: planSpy, getLastMetaToolCalls: () => [] } as unknown as AgenticPlanner;

    const bridge = new ExecutionBridge({
      plannerLLM,
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        doThing: async () => ({ success: true, data: {} }),
      },
      agenticPlanner: mockPlanner,
    });

    await bridge.run('test');
    expect(plannerLLM).not.toHaveBeenCalled();
  });

  it('falls back to plannerLLM when AgenticPlanner not provided', async () => {
    const plannerLLM = vi.fn(async () => JSON.stringify({
      intent: 'fallback test',
      steps: [
        { type: 'execute', id: 's1', tool: 'doThing', params: {}, label: 'Do' },
      ],
    }));

    const bridge = new ExecutionBridge({
      plannerLLM,
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        doThing: async () => ({ success: true, data: {} }),
      },
    });

    const result = await bridge.run('test');
    expect(result.success).toBe(true);
    expect(plannerLLM).toHaveBeenCalled();
  });
});
