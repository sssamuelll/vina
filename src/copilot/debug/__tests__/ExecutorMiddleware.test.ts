import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInstrumentedTools } from '../middleware/ExecutorMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { ToolRegistry } from '../../reasoning/bridge/Executor';

describe('ExecutorMiddleware (createInstrumentedTools)', () => {
  let recorder: ExecutionRecorder;
  let mockTools: ToolRegistry;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });

    mockTools = {
      measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
      modifyEdge: vi.fn().mockResolvedValue({ success: true, data: { newLength: 23 } }),
      failingTool: vi.fn().mockResolvedValue({ success: false, error: 'boom' }),
    };
  });

  it('wraps tools and delegates calls', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);
    const result = await instrumented.measureEdge({ edge: 'neckline' });
    expect(result).toEqual({ success: true, data: { length: 24.5 } });
    expect(mockTools.measureEdge).toHaveBeenCalledWith({ edge: 'neckline' });
  });

  it('records step start and end on tool call', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);
    await instrumented.measureEdge({ edge: 'neckline' });
    const record = recorder.finalize();
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[0].resolvedParams).toEqual({ edge: 'neckline' });
    expect(record.steps[0].success).toBe(true);
    expect(record.steps[0].result).toEqual({ length: 24.5 });
    expect(record.steps[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('records tool failure', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);
    await instrumented.failingTool({ x: 1 });
    const record = recorder.finalize();
    expect(record.steps[0].success).toBe(false);
    expect(record.steps[0].error).toBe('boom');
  });

  it('records exception from tool', async () => {
    mockTools.crashingTool = vi.fn().mockRejectedValue(new Error('crash'));
    const instrumented = createInstrumentedTools(mockTools, recorder);
    await expect(instrumented.crashingTool({})).rejects.toThrow('crash');
    const record = recorder.finalize();
    expect(record.steps[0].success).toBe(false);
    expect(record.steps[0].error).toBe('crash');
  });

  it('handles multiple tool calls in sequence', async () => {
    const instrumented = createInstrumentedTools(mockTools, recorder);
    await instrumented.measureEdge({ edge: 'neckline' });
    await instrumented.modifyEdge({ edge: 'neckline', delta: -2 });
    const record = recorder.finalize();
    expect(record.steps).toHaveLength(2);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[1].tool).toBe('modifyEdge');
  });
});
