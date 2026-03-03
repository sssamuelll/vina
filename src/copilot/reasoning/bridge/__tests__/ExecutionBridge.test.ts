import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';
import type { BridgeEvent } from '../types';
import type { ToolRegistry } from '../types';

// Mock dependencies
const mockPlannerLLM = vi.fn();
const mockEvaluator = vi.fn();
const mockReasonerLLM = vi.fn();
const mockTools: ToolRegistry = {
  measureEdge: vi.fn(),
  modifyEdge: vi.fn(),
};

describe('ExecutionBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a complete flow: plan -> execute -> summarize', async () => {
    // Planner returns a plan
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'measure_edge',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Measure' },
      ],
    }));

    // Tool succeeds
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { length: 314 },
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });

    const result = await bridge.run('Measure the neckline');

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary?.short).toContain('measure');
  });

  it('emits events throughout execution', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    }));
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    const events: BridgeEvent[] = [];
    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });
    bridge.on((event) => events.push(event));

    await bridge.run('Test');

    expect(events.some(e => e.type === 'plan:start')).toBe(true);
    expect(events.some(e => e.type === 'plan:complete')).toBe(true);
    expect(events.some(e => e.type === 'step:start')).toBe(true);
    expect(events.some(e => e.type === 'execution:complete')).toBe(true);
  });

  it('calls reasoner on step failure', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    }));
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Edge not found',
    });
    mockReasonerLLM.mockResolvedValue({
      action: 'abort',
      reason: 'Cannot recover',
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });

    const result = await bridge.run('Test');

    expect(result.success).toBe(false);
    expect(mockReasonerLLM).toHaveBeenCalled();
  });

  it('retries step when reasoner says retry', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Test' },
      ],
    }));

    let callCount = 0;
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, error: 'Not found' };
      }
      return { success: true, data: { length: 314 } };
    });

    mockReasonerLLM.mockResolvedValue({
      action: 'retry',
      newParams: { edge: 'front-neckline' },
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });

    const result = await bridge.run('Test');

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('emits ask:user event when reasoner asks', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    }));
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Ambiguous',
    });
    mockReasonerLLM.mockResolvedValue({
      action: 'askUser',
      question: 'Which edge?',
      options: ['a', 'b'],
    });

    const events: BridgeEvent[] = [];
    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });
    bridge.on((event) => events.push(event));

    await bridge.run('Test');

    const askEvent = events.find(e => e.type === 'ask:user');
    expect(askEvent).toBeDefined();
    if (askEvent?.type === 'ask:user') {
      expect(askEvent.question).toBe('Which edge?');
    }
  });

  it('supports rollback on abort', async () => {
    const rollbackFn = vi.fn();
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Step 1' },
        { type: 'execute', id: 's2', tool: 'modifyEdge', params: {}, label: 'Step 2' },
      ],
    }));
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {},
      rollback: rollbackFn,
    });
    (mockTools.modifyEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Failed',
    });
    mockReasonerLLM.mockResolvedValue({
      action: 'abort',
      reason: 'Cannot proceed',
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
      config: { maxRetries: 3, stepTimeout: 30000, enableRollback: true },
    });

    await bridge.run('Test');

    expect(rollbackFn).toHaveBeenCalled();
  });

  it('respects maxRetries config', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    }));
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Always fails',
    });
    mockReasonerLLM.mockResolvedValue({
      action: 'retry',
      newParams: {},
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
      config: { maxRetries: 2, stepTimeout: 30000, enableRollback: false },
    });

    const result = await bridge.run('Test');

    expect(result.success).toBe(false);
    // Initial try + 2 retries = 3 calls
    expect(mockTools.measureEdge).toHaveBeenCalledTimes(3);
  });

  it('uses alternative step when reasoner suggests one', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Measure' },
      ],
    }));

    let callCount = 0;
    (mockTools.measureEdge as ReturnType<typeof vi.fn>).mockImplementation(async (params) => {
      callCount++;
      if (params.edge === 'neckline') {
        return { success: false, error: 'Edge not found' };
      }
      // Alternative edge succeeds
      return { success: true, data: { length: 200 } };
    });

    mockReasonerLLM.mockResolvedValue({
      action: 'alternative',
      newStep: { type: 'execute', id: 's1-alt', tool: 'measureEdge', params: { edge: 'front-neckline' }, label: 'Measure alt' },
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });

    const result = await bridge.run('Test');

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
    expect(mockTools.measureEdge).toHaveBeenLastCalledWith({ edge: 'front-neckline' });
  });

  it('executes evaluate step using evaluator', async () => {
    mockPlannerLLM.mockResolvedValue(JSON.stringify({
      intent: 'evaluate_condition',
      steps: [
        { type: 'evaluate', id: 's1', input: '$context', decide: 'Is the measurement valid?', label: 'Check validity' },
      ],
    }));

    mockEvaluator.mockResolvedValue({
      success: true,
      data: { decision: 'yes', confidence: 0.95 },
    });

    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });

    const result = await bridge.run('Check if measurement is valid');

    expect(result.success).toBe(true);
    expect(mockEvaluator).toHaveBeenCalledWith(null, 'Is the measurement valid?');
    expect(result.results[0].data).toEqual({ decision: 'yes', confidence: 0.95 });
  });

  it('handles plan parsing failure from invalid JSON', async () => {
    mockPlannerLLM.mockResolvedValue('This is not valid JSON at all');

    const events: BridgeEvent[] = [];
    const bridge = new ExecutionBridge({
      plannerLLM: mockPlannerLLM,
      evaluator: mockEvaluator,
      reasonerLLM: mockReasonerLLM,
      tools: mockTools,
    });
    bridge.on((event) => events.push(event));

    const result = await bridge.run('Test');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.results).toEqual([]);
    expect(events.some(e => e.type === 'plan:error')).toBe(true);
  });
});
