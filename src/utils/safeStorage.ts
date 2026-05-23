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

/**
 * Internal quota-exhaustion hook. Subscribed by `storage.ts` to forward
 * quota events into the central StorageEvent telemetry surface
 * (B6-state § 3.8). Kept as a local hook (not the public StorageEvent
 * surface) so safeStorage.ts stays free of any dependency on storage.ts,
 * avoiding a circular import.
 */
let _quotaHook: ((key: string) => void) | null = null;

/**
 * Register an internal listener for `QuotaExceededError`-class failures
 * inside `safeSetItem`. Pass `null` to unregister. Intended for use by
 * `storage.ts` only.
 *
 * The hook is invoked on any setItem catch when the failure looks like a
 * quota error (DOMException name `QuotaExceededError` or its legacy
 * Firefox code 1014 `NS_ERROR_DOM_QUOTA_REACHED`).
 */
export function setLocalStorageQuotaHook(hook: ((key: string) => void) | null): void {
  _quotaHook = hook;
}

/** Best-effort detection of QuotaExceededError across browsers. */
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22
    || e.code === 1014;
}

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
    if (isQuotaError(err) && _quotaHook) {
      try {
        _quotaHook(key);
      } catch {
        // Never let a buggy hook break persistence.
      }
    }
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
