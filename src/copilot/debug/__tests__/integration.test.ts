import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDebugBridge } from '../createDebugBridge';
import type { BridgeOptions } from '../../reasoning/bridge/ExecutionBridge';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('Debug Suite Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorage.setItem('openclo-debug-bridge', 'true');
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('records a full successful execution', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'measure neckline',
        steps: [{
          type: 'execute',
          id: 's1',
          tool: 'measureEdge',
          params: { edge: 'neckline' },
          label: 'Measure neckline edge',
        }],
      })),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn(),
      tools: {
        measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
      },
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('measure the neckline');

    expect(result.success).toBe(true);

    const records = store!.getAll();
    expect(records).toHaveLength(1);

    const record = records[0];
    expect(record.userRequest).toBe('measure the neckline');
    expect(record.success).toBe(true);
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].tool).toBe('measureEdge');
    expect(record.steps[0].success).toBe(true);

    // Verify console was called
    expect(console.group).toHaveBeenCalled();
  });

  it('records a failed execution with error', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'modify neckline',
        steps: [{
          type: 'execute',
          id: 's1',
          tool: 'modifyEdge',
          params: { delta: -2 },
          label: 'Modify neckline',
        }],
      })),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn().mockResolvedValue({ action: 'abort', reason: 'Cannot recover' }),
      tools: {
        modifyEdge: vi.fn().mockResolvedValue({ success: false, error: 'Constraint violation' }),
      },
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('reduce neckline 2cm');

    expect(result.success).toBe(false);

    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].success).toBe(false);
  });

  it('records planning failure', async () => {
    const options: BridgeOptions = {
      plannerLLM: vi.fn().mockResolvedValue('not valid json at all'),
      evaluator: vi.fn(),
      reasonerLLM: vi.fn(),
      tools: {},
    };

    const { bridge, store } = createDebugBridge(options);
    const result = await bridge.run('anything');

    expect(result.success).toBe(false);

    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].success).toBe(false);
  });
});
