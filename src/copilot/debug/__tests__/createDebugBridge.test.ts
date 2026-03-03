import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDebugBridge, isDebugEnabled } from '../createDebugBridge';
import type { BridgeOptions } from '../../reasoning/bridge/ExecutionBridge';

// Mock localStorage for tests
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

describe('createDebugBridge', () => {
  const mockOptions: BridgeOptions = {
    plannerLLM: vi.fn().mockResolvedValue('{"intent":"test","steps":[{"type":"execute","id":"s1","tool":"measureEdge","params":{"edge":"neckline"},"label":"Measure"}]}'),
    evaluator: vi.fn().mockResolvedValue({ success: true, data: {} }),
    reasonerLLM: vi.fn().mockResolvedValue({ action: 'abort' }),
    tools: {
      measureEdge: vi.fn().mockResolvedValue({ success: true, data: { length: 24.5 } }),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    // Suppress console output in tests
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('isDebugEnabled returns true (always on for testing)', () => {
    expect(isDebugEnabled()).toBe(true);
  });

  it('creates a working bridge', async () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { bridge } = createDebugBridge(mockOptions);
    const result = await bridge.run('test');
    expect(result.success).toBe(true);
  });

  it('returns debug store when debug is enabled', () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { store } = createDebugBridge(mockOptions);
    expect(store).toBeDefined();
    expect(store).not.toBeNull();
  });

  it('returns store when debug is always enabled', () => {
    const { store } = createDebugBridge(mockOptions);
    expect(store).not.toBeNull();
  });

  it('persists execution records when debug is enabled', async () => {
    localStorage.setItem('openclo-debug-bridge', 'true');
    const { bridge, store } = createDebugBridge(mockOptions);
    await bridge.run('test request');
    const records = store!.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].userRequest).toBe('test request');
    expect(records[0].success).toBe(true);
  });
});
