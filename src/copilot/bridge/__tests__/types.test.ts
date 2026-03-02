// src/copilot/bridge/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  ExecutionPlan,
  ExecuteStep,
  EvaluateStep,
  Step,
  StepResult,
  ReasonerDecision,
  ExpandableSummary,
  ProgressState,
} from '../types';

describe('Bridge Types', () => {
  it('ExecuteStep has required fields', () => {
    const step: ExecuteStep = {
      type: 'execute',
      id: 'step1',
      tool: 'measureEdge',
      params: { pieceId: 'front', edge: 'neckline' },
      label: 'Measuring neckline',
    };
    expect(step.type).toBe('execute');
    expect(step.tool).toBe('measureEdge');
  });

  it('EvaluateStep has required fields', () => {
    const step: EvaluateStep = {
      type: 'evaluate',
      id: 'step2',
      input: '$step1.result',
      decide: 'Is the measurement acceptable?',
      label: 'Evaluating measurement',
    };
    expect(step.type).toBe('evaluate');
    expect(step.input).toBe('$step1.result');
  });

  it('Step is union of ExecuteStep | EvaluateStep', () => {
    const steps: Step[] = [
      { type: 'execute', id: 's1', tool: 'test', params: {}, label: 'Test' },
      { type: 'evaluate', id: 's2', input: '$s1', decide: 'ok?', label: 'Eval' },
    ];
    expect(steps).toHaveLength(2);
  });

  it('ExecutionPlan contains intent and steps', () => {
    const plan: ExecutionPlan = {
      intent: 'reduce_neckline',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      ],
    };
    expect(plan.intent).toBe('reduce_neckline');
    expect(plan.steps).toHaveLength(1);
  });

  it('StepResult includes optional rollback', () => {
    let rolledBack = false;
    const result: StepResult = {
      stepId: 'step1',
      success: true,
      data: { length: 314 },
      rollback: () => { rolledBack = true; },
    };
    expect(result.success).toBe(true);
    result.rollback?.();
    expect(rolledBack).toBe(true);
  });

  it('StepResult can represent failure', () => {
    const result: StepResult = {
      stepId: 'step1',
      success: false,
      error: 'Edge not found',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Edge not found');
  });

  it('ReasonerDecision retry action', () => {
    const decision: ReasonerDecision = {
      action: 'retry',
      newParams: { edge: 'front-neckline' },
    };
    expect(decision.action).toBe('retry');
  });

  it('ReasonerDecision askUser action', () => {
    const decision: ReasonerDecision = {
      action: 'askUser',
      question: 'Which edge should I modify?',
      options: ['back-neck', 'cb-curve', 'cancel'],
    };
    expect(decision.action).toBe('askUser');
    expect(decision.options).toHaveLength(3);
  });

  it('ReasonerDecision abort action', () => {
    const decision: ReasonerDecision = {
      action: 'abort',
      reason: 'Cannot find matching edge',
    };
    expect(decision.action).toBe('abort');
  });

  it('ExpandableSummary has short and details', () => {
    const summary: ExpandableSummary = {
      short: 'Neckline reduced 2cm',
      details: ['Front: 314mm → 294mm', 'Back: 253mm → 233mm'],
    };
    expect(summary.short).toContain('Neckline');
    expect(summary.details).toHaveLength(2);
  });

  it('ProgressState tracks execution', () => {
    const state: ProgressState = {
      status: 'running',
      intent: 'Reducing neckline',
      steps: [
        { id: 's1', label: 'Measure', status: 'done' },
        { id: 's2', label: 'Modify', status: 'running' },
      ],
      currentStepIndex: 1,
    };
    expect(state.status).toBe('running');
    expect(state.steps[0].status).toBe('done');
  });
});
