import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger } from '../ConsoleLogger';
import type { ExecutionRecord } from '../types';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const makeRecord = (overrides?: Partial<ExecutionRecord>): ExecutionRecord => ({
    id: 'test-id',
    timestamp: Date.now(),
    userRequest: 'reduce neckline 2cm',
    duration: 1243,
    success: true,
    planning: {
      systemPrompt: 'You are a pattern assistant...',
      toolsProvided: ['modifyEdge', 'measureEdge'],
      rawResponse: '{"intent":"reduce","steps":[]}',
      parsedPlan: { intent: 'reduce neckline', steps: [] },
      duration: 823,
    },
    steps: [],
    ...overrides,
  });

  it('logs a successful run with console.group', () => {
    logger.log(makeRecord());
    expect(console.group).toHaveBeenCalled();
    expect(console.groupEnd).toHaveBeenCalled();
  });

  it('uses console.error for failed runs', () => {
    logger.log(makeRecord({ success: false, error: 'Plan failed' }));
    expect(console.error).toHaveBeenCalled();
  });

  it('logs planning phase details', () => {
    logger.log(makeRecord());
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allLogs = logCalls.map(c => String(c)).join(' ');
    expect(allLogs).toContain('modifyEdge');
  });

  it('logs step details with params', () => {
    logger.log(makeRecord({
      steps: [{
        stepId: 's1',
        tool: 'measureEdge',
        label: 'Measure neckline',
        rawParams: { pieceId: '$p1.result.id' },
        resolvedParams: { pieceId: 'front-bodice' },
        variableResolutions: [{ variable: '$p1.result.id', resolvedValue: 'front-bodice' }],
        success: true,
        result: { length: 24.5 },
        duration: 89,
        retries: [],
      }],
    }));
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
    const allLogs = logCalls.map(c => String(c)).join(' ');
    expect(allLogs).toContain('measureEdge');
  });

  it('logs retries with console.warn', () => {
    logger.log(makeRecord({
      steps: [{
        stepId: 's1',
        tool: 'modifyEdge',
        label: 'Modify',
        rawParams: {},
        resolvedParams: {},
        variableResolutions: [],
        success: true,
        result: null,
        duration: 500,
        retries: [{
          attempt: 1,
          error: 'Constraint violation',
          reasonerInput: {
            failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: {}, label: '' },
            error: 'Constraint violation',
            resultsSoFar: [],
            originalIntent: 'test',
          },
          reasonerDecision: { action: 'retry', newParams: { delta: -1 } },
          reasonerDuration: 340,
        }],
      }],
    }));
    expect(console.warn).toHaveBeenCalled();
  });
});
