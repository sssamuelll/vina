import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reasoner } from '../Reasoner';
import type { ReasonerInput, StepResult, ExecuteStep } from '../types';
import { isExecuteStep } from '../types';

// Mock LLM call
const mockLLM = vi.fn();

describe('Reasoner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds prompt with error context', async () => {
    mockLLM.mockResolvedValue({
      action: 'abort',
      reason: 'Cannot recover',
    });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Measure' },
      error: 'Edge not found',
      resultsSoFar: [],
      originalIntent: 'reduce_neckline',
    };

    await reasoner.analyze(input);

    expect(mockLLM).toHaveBeenCalledWith(expect.stringContaining('Edge not found'));
    expect(mockLLM).toHaveBeenCalledWith(expect.stringContaining('measureEdge'));
    expect(mockLLM).toHaveBeenCalledWith(expect.stringContaining('reduce_neckline'));
  });

  it('returns retry decision with new params', async () => {
    mockLLM.mockResolvedValue({
      action: 'retry',
      newParams: { edge: 'front-neckline' },
    });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'measureEdge', params: { edge: 'neckline' }, label: 'Measure' },
      error: 'Edge not found',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('retry');
    expect(decision.newParams).toEqual({ edge: 'front-neckline' });
  });

  it('returns askUser decision with question and options', async () => {
    mockLLM.mockResolvedValue({
      action: 'askUser',
      question: 'Which edge should I use?',
      options: ['front-neckline', 'back-neckline', 'cancel'],
    });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      error: 'Ambiguous edge',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('askUser');
    expect(decision.question).toBe('Which edge should I use?');
    expect(decision.options).toHaveLength(3);
  });

  it('returns alternative decision with new step', async () => {
    mockLLM.mockResolvedValue({
      action: 'alternative',
      newStep: { type: 'execute', id: 'alt1', tool: 'measureAllEdges', params: {}, label: 'Measure all' },
    });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      error: 'Tool unavailable',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('alternative');
    expect(decision.newStep).toBeDefined();
    expect(isExecuteStep(decision.newStep!)).toBe(true);
    expect((decision.newStep as ExecuteStep).tool).toBe('measureAllEdges');
  });

  it('returns abort decision with reason', async () => {
    mockLLM.mockResolvedValue({
      action: 'abort',
      reason: 'No recovery possible',
    });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      error: 'Fatal error',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('abort');
    expect(decision.reason).toBe('No recovery possible');
  });

  it('includes previous results in context', async () => {
    mockLLM.mockResolvedValue({ action: 'abort', reason: 'test' });

    const reasoner = new Reasoner(mockLLM);
    const previousResults: StepResult[] = [
      { stepId: 's1', success: true, data: { length: 314 } },
    ];
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's2', tool: 'modifyEdge', params: {}, label: 'Modify' },
      error: 'Cannot modify',
      resultsSoFar: previousResults,
      originalIntent: 'test',
    };

    await reasoner.analyze(input);

    expect(mockLLM).toHaveBeenCalledWith(expect.stringContaining('314'));
  });

  it('defaults to abort on invalid LLM response', async () => {
    mockLLM.mockResolvedValue({ invalid: 'response' });

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'test', params: {}, label: 'Test' },
      error: 'Error',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('abort');
    expect(decision.reason).toContain('Invalid');
  });

  it('handles LLM errors gracefully', async () => {
    mockLLM.mockRejectedValue(new Error('LLM unavailable'));

    const reasoner = new Reasoner(mockLLM);
    const input: ReasonerInput = {
      failedStep: { type: 'execute', id: 's1', tool: 'test', params: {}, label: 'Test' },
      error: 'Error',
      resultsSoFar: [],
      originalIntent: 'test',
    };

    const decision = await reasoner.analyze(input);

    expect(decision.action).toBe('abort');
    expect(decision.reason).toContain('LLM unavailable');
  });
});
