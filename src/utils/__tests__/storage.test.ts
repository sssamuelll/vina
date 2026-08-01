/**
 * Tests for IndexedDB storage abstraction.
 * Mocks the `idb` module so openDB always rejects, forcing localStorage fallback.
 * @module storage.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock localStorage ──────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((_i: number) => null),
};
vi.stubGlobal('localStorage', localStorageMock);

// ─── Mock idb so openDB always rejects (forces localStorage fallback) ───────
vi.mock('idb', () => ({
  openDB: () => Promise.reject(new Error('IndexedDB unavailable in test')),
}));

// Now import storage — every call will fall through to localStorage
import {
  storageGet, storageSet, storageDel,
  saveProject, loadProject, clearProject,
  migrateFromLocalStorage,
  setStorageTelemetryHook,
  type StorageEvent,
} from '../storage';

describe('storage abstraction (localStorage fallback)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('basic CRUD', () => {
    it('set and get a value', async () => {
      await storageSet('settings', 'test-key', { foo: 'bar' });
      const result = await storageGet<{ foo: string }>('settings', 'test-key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('returns undefined for missing key', async () => {
      const result = await storageGet('settings', 'nonexistent');
      expect(result).toBeUndefined();
    });

    it('delete removes value', async () => {
      await storageSet('settings', 'to-delete', 42);
      await storageDel('settings', 'to-delete');
      const result = await storageGet('settings', 'to-delete');
      expect(result).toBeUndefined();
    });

    it('overwrites existing value', async () => {
      await storageSet('settings', 'key', 'first');
      await storageSet('settings', 'key', 'second');
      expect(await storageGet('settings', 'key')).toBe('second');
    });
  });

  describe('project autosave', () => {
    it('save and load project', async () => {
      const project = { id: 'test-1', name: 'Test', pieces: [] };
      await saveProject(project);
      const loaded = await loadProject();
      expect(loaded).toEqual(project);
    });

    it('clear removes project', async () => {
      await saveProject({ id: 'test-2' });
      await clearProject();
      const loaded = await loadProject();
      expect(loaded).toBeUndefined();
    });

    it('migrates from legacy localStorage', async () => {
      const legacy = { id: 'legacy', name: 'Old Project' };
      store['openclo-autosave'] = JSON.stringify(legacy);
      const loaded = await loadProject();
      expect(loaded).toEqual(legacy);
      expect(store['openclo-autosave']).toBeUndefined();
    });
  });

  describe('migrateFromLocalStorage', () => {
    it('migrates and removes localStorage key', async () => {
      store['old-key'] = JSON.stringify({ data: true });
      const result = await migrateFromLocalStorage('old-key', 'settings', 'new-key');
      expect(result).toEqual({ data: true });
      expect(store['old-key']).toBeUndefined();
      expect(await storageGet('settings', 'new-key')).toEqual({ data: true });
    });

    it('returns undefined for missing key', async () => {
      const result = await migrateFromLocalStorage('missing', 'settings', 'key');
      expect(result).toBeUndefined();
    });
  });

  describe('stores are isolated', () => {
    it('same key in different stores returns different values', async () => {
      await storageSet('projects', 'shared', 'project-val');
      await storageSet('settings', 'shared', 'settings-val');
      expect(await storageGet('projects', 'shared')).toBe('project-val');
      expect(await storageGet('settings', 'shared')).toBe('settings-val');
    });
  });

  describe('complex data types', () => {
    it('stores arrays', async () => {
      await storageSet('avatars', 'list', [1, 2, 3]);
      expect(await storageGet('avatars', 'list')).toEqual([1, 2, 3]);
    });

    it('stores nested objects', async () => {
      const data = { a: { b: { c: [1, { d: true }] } } };
      await storageSet('settings', 'nested', data);
      expect(await storageGet('settings', 'nested')).toEqual(data);
    });
  });

  describe('telemetry hook (B6-state § 3.8)', () => {
    afterEach(() => {
      // Always unsubscribe to prevent state leaking between tests.
      setStorageTelemetryHook(null);
    });

    it('fires idb-unavailable on storageGet when getDB rejects', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => events.push(e));

      await storageGet('settings', 'some-key');

      const idbEvents = events.filter(e => e.type === 'idb-unavailable');
      expect(idbEvents).toHaveLength(1);
      expect(idbEvents[0]).toEqual({
        type: 'idb-unavailable',
        store: 'settings',
        key: 'some-key',
      });
    });

    it('fires ls-fallback-write on storageSet when getDB rejects', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => events.push(e));

      await storageSet('projects', 'autosave', { foo: 'bar' });

      const fallbackEvents = events.filter(e => e.type === 'ls-fallback-write');
      expect(fallbackEvents).toHaveLength(1);
      expect(fallbackEvents[0]).toEqual({
        type: 'ls-fallback-write',
        store: 'projects',
        key: 'autosave',
      });
    });

    it('fires ls-quota-exhausted when localStorage.setItem throws QuotaExceededError', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => events.push(e));

      // Simulate QuotaExceededError on the next setItem call.
      const quotaErr = Object.assign(new Error('quota'), {
        name: 'QuotaExceededError',
        code: 22,
      });
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw quotaErr;
      });

      await storageSet('settings', 'big-blob', { huge: 'payload' });

      const quotaEvents = events.filter(e => e.type === 'ls-quota-exhausted');
      expect(quotaEvents).toHaveLength(1);
      expect(quotaEvents[0]).toEqual({
        type: 'ls-quota-exhausted',
        key: 'vina:settings:big-blob',
      });
    });

    it('also fires ls-quota-exhausted for the legacy Firefox NS_ERROR_DOM_QUOTA_REACHED', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => events.push(e));

      const legacyQuotaErr = Object.assign(new Error('quota'), {
        name: 'NS_ERROR_DOM_QUOTA_REACHED',
        code: 1014,
      });
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw legacyQuotaErr;
      });

      await storageSet('settings', 'legacy-quota', { x: 1 });

      const quotaEvents = events.filter(e => e.type === 'ls-quota-exhausted');
      expect(quotaEvents).toHaveLength(1);
    });

    it('a throwing hook does not break persistence', async () => {
      setStorageTelemetryHook(() => {
        throw new Error('buggy hook');
      });

      // storageSet must still complete successfully despite the hook throwing.
      await expect(storageSet('settings', 'safe', 'value')).resolves.toBeUndefined();

      // And the write must still be visible via storageGet.
      expect(await storageGet('settings', 'safe')).toBe('value');
    });

    it('unsubscribing the hook stops events from firing', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => events.push(e));

      await storageSet('settings', 'before', 'v1');
      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      setStorageTelemetryHook(null);

      await storageSet('settings', 'after', 'v2');
      expect(events.length).toBe(countBefore);
    });

    it('default behavior is no-op (no hook registered)', async () => {
      // No setStorageTelemetryHook call. Just verify nothing throws and
      // storage still works.
      await expect(storageSet('settings', 'x', 1)).resolves.toBeUndefined();
      expect(await storageGet('settings', 'x')).toBe(1);
    });

    it('drops nested events silently to prevent stack overflow', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => {
        events.push(e);
        // Synchronously trigger another event — should be dropped by the guard.
        // We use the void IIFE pattern to fire-and-forget without awaiting
        // (the re-entrancy guard runs synchronously inside emitStorageEvent
        // regardless of whether the outer caller awaits the inner storageSet).
        void storageSet('settings', 'inner', 'value');
      });
      await storageSet('settings', 'outer', 'value');
      // Without the guard, this would either stack-overflow or grow without
      // bound. With the guard, the count stays small and finite.
      expect(events.length).toBeLessThan(10);
    });

    it('emits idb-unavailable only once per hook subscription', async () => {
      const events: StorageEvent[] = [];
      setStorageTelemetryHook((e) => {
        if (e.type === 'idb-unavailable') events.push(e);
      });
      await storageGet('settings', 'key1');
      await storageGet('settings', 'key2');
      await storageGet('settings', 'key3');
      expect(events.length).toBe(1);
    });

    it('resets the idb-unavailable throttle when a new hook is set', async () => {
      const eventsA: StorageEvent[] = [];
      setStorageTelemetryHook((e) => {
        if (e.type === 'idb-unavailable') eventsA.push(e);
      });
      await storageGet('settings', 'key1');
      await storageGet('settings', 'key2');
      // First hook saw only one event (throttled after first).
      expect(eventsA.length).toBe(1);

      const eventsB: StorageEvent[] = [];
      setStorageTelemetryHook((e) => {
        if (e.type === 'idb-unavailable') eventsB.push(e);
      });
      await storageGet('settings', 'key3');
      // Second hook gets its own first event — throttle was reset on re-subscribe.
      expect(eventsB.length).toBe(1);
    });
  });
});
