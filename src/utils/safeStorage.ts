/**
 * Safe localStorage wrapper with detection, in-memory fallback, and logging.
 *
 * When localStorage is unavailable (private browsing, storage disabled, quota
 * exceeded), falls back to an in-memory Map so the current session still works.
 * Errors are logged once per key to avoid spamming the console.
 */

const memoryFallback = new Map<string, string>();
let _available: boolean | null = null;
const _warnedKeys = new Set<string>();

/** Test whether localStorage is usable. Cached after first call. */
export function isStorageAvailable(): boolean {
  if (_available !== null) return _available;
  try {
    const key = '__openclo_storage_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

function warnOnce(operation: string, key: string, err: unknown): void {
  const warnKey = `${operation}:${key}`;
  if (_warnedKeys.has(warnKey)) return;
  _warnedKeys.add(warnKey);
  console.warn(`[safeStorage] ${operation} failed for "${key}":`, err);
}

/** Get a value from localStorage, falling back to in-memory store. */
export function safeGetItem(key: string): string | null {
  if (!isStorageAvailable()) {
    return memoryFallback.get(key) ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch (err) {
    warnOnce('getItem', key, err);
    return memoryFallback.get(key) ?? null;
  }
}

/** Set a value in localStorage, falling back to in-memory store. */
export function safeSetItem(key: string, value: string): void {
  memoryFallback.set(key, value);
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    warnOnce('setItem', key, err);
  }
}

/** Remove a value from localStorage and in-memory store. */
export function safeRemoveItem(key: string): void {
  memoryFallback.delete(key);
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    warnOnce('removeItem', key, err);
  }
}

/**
 * Get the number of keys in localStorage.
 * Returns 0 if unavailable.
 */
export function safeStorageLength(): number {
  if (!isStorageAvailable()) return memoryFallback.size;
  try {
    return localStorage.length;
  } catch {
    return memoryFallback.size;
  }
}

/**
 * Get the key at a given index in localStorage.
 * Returns null if unavailable.
 */
export function safeKey(index: number): string | null {
  if (!isStorageAvailable()) {
    const keys = Array.from(memoryFallback.keys());
    return keys[index] ?? null;
  }
  try {
    return localStorage.key(index);
  } catch {
    return null;
  }
}
