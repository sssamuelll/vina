import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { ExecutionPlan, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';

describe('ExecutionRecorder', () => {
  let recorder: ExecutionRecorder;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
  });

  it('starts a new recording with user request', () => {
    recorder.start('reduce neckline 2cm');
    const record = recorder.finalize();
    expect(record.userRequest).toBe('reduce neckline 2cm');
    expect(record.id).toBeDefined();
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('records planning phase', () => {
    recorder.start('test');
    recorder.recordPlanningStart('system prompt text', ['modifyEdge', 'measureEdge']);
    const plan: ExecutionPlan = { intent: 'test', steps: [] };
    recorder.recordPlanningEnd('{"intent":"test","steps":[]}', plan);
    const record = recorder.finalize();
    expect(record.planning.systemPrompt).toBe('system prompt text');
    expect(record.planning.toolsProvided).toEqual(['modifyEdge', 'measureEdge']);
    expect(record.planning.rawResponse).toBe('{"intent":"test","steps":[]}');
    expect(record.planning.parsedPlan).toEqual(plan);
    expect(record.planning.duration).toBeGreaterThanOrEqual(0);
  });

  it('records planning error', () => {
    recorder.start('test');
    recorder.recordPlanningStart('prompt', []);
    recorder.recordPlanningError('Invalid JSON');
    const record = recorder.finalize();
    expect(record.planning.parseError).toBe('Invalid JSON');
    expect(record.planning.parsedPlan).toBeNull();
  });

  it('records step execution with variable resolution', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'measureEdge', 'Measure neckline');
    recorder.recordStepParams(
      's1',
      { pieceId: '$p1.result.id', edge: 'neckline' },
      { pieceId: 'front-bodice', edge: 'neckline' },
      [{ variable: '$p1.result.id', resolvedValue: 'front-bodice' }]
    );
    recorder.recordStepEnd('s1', true, { length: 24.5 });
    const record = recorder.finalize();
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].rawParams).toEqual({ pieceId: '$p1.result.id', edge: 'neckline' });
    expect(record.steps[0].resolvedParams).toEqual({ pieceId: 'front-bodice', edge: 'neckline' });
    expect(record.steps[0].variableResolutions).toHaveLength(1);
    expect(record.steps[0].success).toBe(true);
    expect(record.steps[0].result).toEqual({ length: 24.5 });
    expect(record.steps[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('records step failure with retry', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'modifyEdge', 'Modify edge');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepError('s1', 'Constraint violation');
    const reasonerInput: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: {}, label: '' },
      error: 'Constraint violation',
      resultsSoFar: [],
      originalIntent: 'test',
    };
    const decision: ReasonerDecision = { action: 'retry', newParams: { delta: -1 } };
    recorder.recordRetry('s1', 1, 'Constraint violation', reasonerInput, decision, 340);
    recorder.recordStepEnd('s1', true, { newLength: 23 });
    const record = recorder.finalize();
    expect(record.steps[0].retries).toHaveLength(1);
    expect(record.steps[0].retries[0].attempt).toBe(1);
    expect(record.steps[0].retries[0].reasonerDecision.action).toBe('retry');
    expect(record.steps[0].retries[0].reasonerDuration).toBe(340);
    expect(record.steps[0].success).toBe(true);
  });

  it('finalize computes total duration and success', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'tool', 'Step 1');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepEnd('s1', true, null);
    const record = recorder.finalize();
    expect(record.success).toBe(true);
    expect(record.duration).toBeGreaterThanOrEqual(0);
  });

  it('marks record as failed when any step fails', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    recorder.recordStepStart('s1', 'tool', 'Step 1');
    recorder.recordStepParams('s1', {}, {}, []);
    recorder.recordStepError('s1', 'boom');
    const record = recorder.finalize();
    expect(record.success).toBe(false);
  });

  it('reset clears state for next recording', () => {
    recorder.start('first');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'first', steps: [] });
    recorder.finalize();
    recorder.reset();
    recorder.start('second');
    recorder.recordPlanningStart('', []);
    recorder.recordPlanningEnd('{}', { intent: 'second', steps: [] });
    const record = recorder.finalize();
    expect(record.userRequest).toBe('second');
    expect(record.steps).toHaveLength(0);
  });
});
