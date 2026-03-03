import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugStore } from '../DebugStore';
import type { ExecutionRecord } from '../types';

// Provide a minimal localStorage mock for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

// Assign to globalThis so the implementation can use it
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

const makeRecord = (id: string, success = true, daysAgo = 0): ExecutionRecord => ({
  id,
  timestamp: Date.now() - daysAgo * 86400000,
  userRequest: `request-${id}`,
  duration: 1000,
  success,
  planning: {
    systemPrompt: '',
    toolsProvided: [],
    rawResponse: '',
    parsedPlan: null,
    duration: 0,
  },
  steps: [],
});

describe('DebugStore', () => {
  let store: DebugStore;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    store = new DebugStore();
    store.clear();
  });

  it('saves and retrieves a record', () => {
    const record = makeRecord('r1');
    store.save(record);
    const retrieved = store.getById('r1');
    expect(retrieved?.id).toBe('r1');
    expect(retrieved?.userRequest).toBe('request-r1');
  });

  it('returns null for non-existent record', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('getAll returns all records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));
    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('getRecent returns most recent N records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));
    store.save(makeRecord('r3'));
    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
  });

  it('getFailures returns only failed records', () => {
    store.save(makeRecord('r1', true));
    store.save(makeRecord('r2', false));
    store.save(makeRecord('r3', false));
    const failures = store.getFailures();
    expect(failures).toHaveLength(2);
    expect(failures.every(r => !r.success)).toBe(true);
  });

  it('clear removes all records', () => {
    store.save(makeRecord('r1'));
    store.save(makeRecord('r2'));
    store.clear();
    expect(store.getAll()).toHaveLength(0);
  });

  it('pruneOlderThan removes old records', () => {
    store.save(makeRecord('old', true, 10));
    store.save(makeRecord('recent', true, 1));
    store.pruneOlderThan(7);
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('recent');
  });

  it('exportAsJSON returns valid JSON string', () => {
    store.save(makeRecord('r1'));
    const json = store.exportAsJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('r1');
  });
});
