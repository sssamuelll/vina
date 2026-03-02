import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReasonerMiddleware } from '../middleware/ReasonerMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { IReasoner, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';

describe('ReasonerMiddleware', () => {
  let recorder: ExecutionRecorder;
  let mockReasoner: IReasoner;
  let middleware: ReasonerMiddleware;

  const sampleInput: ReasonerInput = {
    failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: { delta: -2 }, label: 'Modify' },
    error: 'Constraint violation',
    resultsSoFar: [],
    originalIntent: 'reduce neckline',
  };

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'modifyEdge', 'Modify');
    recorder.recordStepParams('s1', {}, {}, []);

    mockReasoner = {
      analyze: vi.fn<(input: ReasonerInput) => Promise<ReasonerDecision>>().mockResolvedValue({
        action: 'retry',
        newParams: { delta: -1 },
        reason: 'Try smaller delta',
      }),
    };

    middleware = new ReasonerMiddleware(mockReasoner, recorder);
  });

  it('delegates analyze to inner reasoner', async () => {
    const decision = await middleware.analyze(sampleInput);
    expect(decision.action).toBe('retry');
    expect(mockReasoner.analyze).toHaveBeenCalledWith(sampleInput);
  });

  it('records retry with duration', async () => {
    await middleware.analyze(sampleInput);
    const record = recorder.finalize();
    const step = record.steps.find(s => s.stepId === 's1');
    expect(step?.retries).toHaveLength(1);
    expect(step?.retries[0].reasonerDecision.action).toBe('retry');
    expect(step?.retries[0].reasonerDuration).toBeGreaterThanOrEqual(0);
    expect(step?.retries[0].error).toBe('Constraint violation');
  });

  it('tracks retry attempt count across multiple calls', async () => {
    await middleware.analyze(sampleInput);
    await middleware.analyze(sampleInput);
    const record = recorder.finalize();
    const step = record.steps.find(s => s.stepId === 's1');
    expect(step?.retries).toHaveLength(2);
    expect(step?.retries[0].attempt).toBe(1);
    expect(step?.retries[1].attempt).toBe(2);
  });

  it('satisfies IReasoner interface', () => {
    const asInterface: IReasoner = middleware;
    expect(asInterface.analyze).toBeDefined();
  });
});
