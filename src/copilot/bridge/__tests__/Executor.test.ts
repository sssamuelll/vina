import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Executor } from '../Executor';
import type { ExecutionPlan, BridgeEvent } from '../types';

// Mock tool registry
const mockTools = {
  measureEdge: vi.fn(),
  modifyEdge: vi.fn(),
};

// Mock evaluator (LLM call for evaluate steps)
const mockEvaluator = vi.fn();

describe('Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a single execute step', async () => {
    mockTools.measureEdge.mockResolvedValue({
      success: true,
      data: { length: 314 },
    });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'measure',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Measuring' },
      ],
    };

    const result = await executor.execute(plan);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].data).toEqual({ length: 314 });
    expect(mockTools.measureEdge).toHaveBeenCalledWith({ edge: 'neckline' });
  });

  it('executes multiple steps in sequence', async () => {
    const callOrder: string[] = [];
    mockTools.measureEdge.mockImplementation(async () => {
      callOrder.push('measure');
      return { success: true, data: { length: 314 } };
    });
    mockTools.modifyEdge.mockImplementation(async () => {
      callOrder.push('modify');
      return { success: true, data: { newLength: 294 } };
    });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'reduce',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
        { type: 'execute', id: 's2', tool: 'modifyEdge', params: {}, label: 'Modify' },
      ],
    };

    await executor.execute(plan);

    expect(callOrder).toEqual(['measure', 'modify']);
  });

  it('emits step:start and step:complete events', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: true, data: {} });

    const events: BridgeEvent[] = [];
    const executor = new Executor(mockTools, mockEvaluator);
    executor.on((event) => events.push(event));

    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    };

    await executor.execute(plan);

    // Check step:start event
    const startEvent = events.find(e => e.type === 'step:start');
    expect(startEvent).toBeDefined();
    expect(startEvent?.type === 'step:start' && startEvent.step.id).toBe('s1');

    // Check step:complete event
    const completeEvent = events.find(e => e.type === 'step:complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.type === 'step:complete' && completeEvent.step.id).toBe('s1');
  });

  it('stops execution on step failure', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: false, error: 'Edge not found' });
    mockTools.modifyEdge.mockResolvedValue({ success: true, data: {} });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
        { type: 'execute', id: 's2', tool: 'modifyEdge', params: {}, label: 'Modify' },
      ],
    };

    const result = await executor.execute(plan);

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('s1');
    expect(result.error).toBe('Edge not found');
    expect(mockTools.modifyEdge).not.toHaveBeenCalled();
  });

  it('resolves variable references in params', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: true, data: { length: 314 } });
    mockTools.modifyEdge.mockResolvedValue({ success: true, data: {} });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
        { type: 'execute', id: 's2', tool: 'modifyEdge', params: { currentLength: '$s1.result.length' }, label: 'Modify' },
      ],
    };

    await executor.execute(plan);

    expect(mockTools.modifyEdge).toHaveBeenCalledWith({ currentLength: 314 });
  });

  it('calls evaluator for evaluate steps', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: true, data: { length: 314 } });
    mockEvaluator.mockResolvedValue({ success: true, data: { decision: 'acceptable' } });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
        { type: 'evaluate', id: 's2', input: '$s1.result', decide: 'Is length acceptable?', label: 'Evaluate' },
      ],
    };

    await executor.execute(plan);

    expect(mockEvaluator).toHaveBeenCalledWith(
      { length: 314 },
      'Is length acceptable?'
    );
  });

  it('returns failure for unknown tool', async () => {
    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'unknownTool', params: {}, label: 'Test' },
      ],
    };

    const result = await executor.execute(plan);

    expect(result.success).toBe(false);
    expect(result.error).toContain('unknownTool');
  });

  it('provides access to result store', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: true, data: { length: 314 } });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    };

    await executor.execute(plan);

    expect(executor.getResultStore().get('s1')).toBeDefined();
    expect(executor.getResultStore().get('s1')?.data).toEqual({ length: 314 });
  });

  it('emits step:error event on failure', async () => {
    mockTools.measureEdge.mockResolvedValue({ success: false, error: 'Failed' });

    const events: BridgeEvent[] = [];
    const executor = new Executor(mockTools, mockEvaluator);
    executor.on((event) => events.push(event));

    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    };

    await executor.execute(plan);

    const errorEvent = events.find(e => e.type === 'step:error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.type === 'step:error' && errorEvent.error).toBe('Failed');
  });

  it('resolves nested variable references', async () => {
    mockTools.measureEdge.mockResolvedValue({
      success: true,
      data: { measurements: { inner: { value: 42 } } },
    });
    mockTools.modifyEdge.mockResolvedValue({ success: true, data: {} });

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
        { type: 'execute', id: 's2', tool: 'modifyEdge', params: { val: '$s1.result.measurements.inner.value' }, label: 'Modify' },
      ],
    };

    await executor.execute(plan);

    expect(mockTools.modifyEdge).toHaveBeenCalledWith({ val: 42 });
  });

  it('handles tool that throws an exception', async () => {
    mockTools.measureEdge.mockRejectedValue(new Error('Tool crashed'));

    const executor = new Executor(mockTools, mockEvaluator);
    const plan: ExecutionPlan = {
      intent: 'test',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Test' },
      ],
    };

    const result = await executor.execute(plan);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool crashed');
    expect(result.failedStep).toBe('s1');
  });
});
