/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to reset the module state between tests since isStorageAvailable caches
let safeStorage: typeof import('../safeStorage');

beforeEach(async () => {
  vi.resetModules();
  safeStorage = await import('../safeStorage');
});

describe('safeStorage', () => {
  describe('isStorageAvailable', () => {
    it('returns true when localStorage works', () => {
      expect(safeStorage.isStorageAvailable()).toBe(true);
    });

    it('returns false when localStorage.setItem throws', async () => {
      vi.resetModules();
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
      const mod = await import('../safeStorage');
      expect(mod.isStorageAvailable()).toBe(false);
      Storage.prototype.setItem = original;
    });
  });

  describe('safeGetItem / safeSetItem', () => {
    it('reads and writes through localStorage normally', () => {
      safeStorage.safeSetItem('test-key', 'hello');
      expect(safeStorage.safeGetItem('test-key')).toBe('hello');
      localStorage.removeItem('test-key');
    });

    it('falls back to memory when localStorage.getItem throws', () => {
      safeStorage.safeSetItem('fallback-key', 'value');
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = () => { throw new DOMException('SecurityError'); };
      expect(safeStorage.safeGetItem('fallback-key')).toBe('value');
      Storage.prototype.getItem = original;
    });

    it('writes to memory even when localStorage.setItem throws', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
      safeStorage.safeSetItem('quota-key', 'data');
      Storage.prototype.setItem = original;
      // Value is in memory fallback — can be read when getItem also fails
      const origGet = Storage.prototype.getItem;
      Storage.prototype.getItem = () => { throw new DOMException('SecurityError'); };
      expect(safeStorage.safeGetItem('quota-key')).toBe('data');
      Storage.prototype.getItem = origGet;
    });
  });

  describe('safeRemoveItem', () => {
    it('removes from both localStorage and memory', () => {
      safeStorage.safeSetItem('rm-key', 'val');
      safeStorage.safeRemoveItem('rm-key');
      expect(safeStorage.safeGetItem('rm-key')).toBeNull();
    });
  });

  describe('warnOnce', () => {
    it('logs only once per key per operation', () => {
      // Ensure availability is cached as true before we break setItem
      safeStorage.isStorageAvailable();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };

      safeStorage.safeSetItem('warn-key', 'a');
      safeStorage.safeSetItem('warn-key', 'b');
      safeStorage.safeSetItem('warn-key', 'c');

      Storage.prototype.setItem = original;
      const calls = warnSpy.mock.calls.filter(c =>
        typeof c[0] === 'string' && c[0].includes('warn-key'),
      );
      expect(calls).toHaveLength(1);
      warnSpy.mockRestore();
    });
  });
});
