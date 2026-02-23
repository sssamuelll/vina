/**
 * Tests for IndexedDB storage abstraction.
 * Mocks localStorage since jsdom isn't available.
 * @module storage.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock indexedDB to be unavailable (force localStorage fallback)
vi.stubGlobal('indexedDB', undefined);

// Now import storage (it will use localStorage fallback)
import { storageGet, storageSet, storageDel, saveProject, loadProject, clearProject, migrateFromLocalStorage } from '../storage';

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
      // Legacy key should be removed after migration
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
});
