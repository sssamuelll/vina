/**
 * Async storage abstraction — IndexedDB primary, localStorage fallback.
 *
 * All project data, avatars, plugins, and copilot state goes through here.
 * Small settings (layout, theme) can stay in localStorage directly.
 *
 * Database schema:
 * - `projects` store: project JSON keyed by id, plus 'autosave' key
 * - `avatars` store: avatar profiles and saved poses
 * - `plugins` store: installed plugin metadata
 * - `settings` store: copilot config, provider config, misc key-value
 *
 * @module storage
 */

import { openDB, type IDBPDatabase } from 'idb';
import { safeGetItem, safeSetItem, safeRemoveItem, setLocalStorageQuotaHook } from './safeStorage';

// ─── Schema ─────────────────────────────────────────────────────────────────

const DB_NAME = 'openclo';
const DB_VERSION = 1;

type StoreNames = 'projects' | 'avatars' | 'plugins' | 'settings';

// ─── Telemetry hook (B6-state § 3.8) ────────────────────────────────────────

/**
 * Storage-event union surfaced via `setStorageTelemetryHook`. Each variant
 * corresponds to a degraded-state branch inside the persistence layer:
 *
 * - `idb-unavailable` — fires on `storageGet` / `storageSet` catch sites
 *   only (read/write hot paths). Lifecycle operations (`storageDel`,
 *   `storageKeys`, `storageClear`, `storageClearAll`) intentionally do
 *   NOT emit this event — subscribe for read/write reliability signal,
 *   not for full lifecycle coverage. Extending to all catch sites is a
 *   stub-stage decision; revisit if E-async-states surfaces need it.
 *
 *   Throttled to once-per-session — only the FIRST idb-unavailable event
 *   in a given hook subscription is emitted. Resetting the hook via
 *   `setStorageTelemetryHook(null)` then `setStorageTelemetryHook(newHook)`
 *   resets the throttle.
 *
 * - `ls-fallback-write` — the IDB write failed and the LS fallback path
 *   was ENTERED. This event fires when fallback begins, NOT when LS
 *   write succeeds. If the LS write itself also fails (quota), a
 *   separate `ls-quota-exhausted` event fires.
 *
 * - `ls-quota-exhausted`: `localStorage.setItem` threw a QuotaExceededError
 *   (or its legacy Firefox equivalent) inside `safeSetItem`.
 *
 * Consumer integration lives in the E-async-states sub-track (toast/diag
 * surfaces). Until then this is a no-op stub for opt-in dev visibility.
 */
export type StorageEvent =
  | { type: 'idb-unavailable'; store: StoreNames; key: string }
  | { type: 'ls-fallback-write'; store: StoreNames; key: string }
  | { type: 'ls-quota-exhausted'; key: string };

let storageTelemetryHook: ((event: StorageEvent) => void) | null = null;
let _emittingEvent = false;
let _idbUnavailableEmittedThisSession = false;

/**
 * Register a telemetry hook for persistence degraded-state events. Pass
 * `null` to unregister. Hook invocation is wrapped in `try/catch`: a
 * throwing hook must never break the user's data path.
 *
 * **Re-entrancy**: hooks MUST NOT perform synchronous storage writes
 * during their own invocation. A re-entry guard drops nested events
 * silently to prevent stack overflow, so the inner event is lost. If
 * a hook needs to persist its own telemetry, defer via `queueMicrotask`
 * or `setTimeout` to escape the current invocation frame.
 */
export function setStorageTelemetryHook(
  hook: ((event: StorageEvent) => void) | null,
): void {
  storageTelemetryHook = hook;
  // Reset throttle so a freshly-subscribed hook gets its own first signal
  // (rather than inheriting the previous subscriber's once-per-session state).
  _idbUnavailableEmittedThisSession = false;
  // Subscribe / unsubscribe the safeStorage internal quota hook in lockstep.
  if (hook) {
    setLocalStorageQuotaHook((key) => {
      emitStorageEvent({ type: 'ls-quota-exhausted', key });
    });
  } else {
    setLocalStorageQuotaHook(null);
  }
}

function emitStorageEvent(event: StorageEvent): void {
  if (!storageTelemetryHook) return;
  if (_emittingEvent) {
    // Re-entrancy guard: a hook that synchronously triggers another
    // storage event (e.g., by calling storageSet during its own
    // invocation) would otherwise recurse without bound. Drop the
    // inner event silently. Consumers needing to persist telemetry
    // must defer via queueMicrotask / setTimeout.
    return;
  }

  // Once-per-session throttle for idb-unavailable to avoid log flood
  // in environments where IDB stays down for the duration of the
  // session (Safari private mode, disabled IDB). All other event
  // types fire every time they occur.
  if (event.type === 'idb-unavailable' && _idbUnavailableEmittedThisSession) {
    return;
  }

  _emittingEvent = true;
  try {
    storageTelemetryHook(event);
    if (event.type === 'idb-unavailable') {
      _idbUnavailableEmittedThisSession = true;
    }
  } catch {
    // Never let a buggy telemetry hook break persistence.
  } finally {
    _emittingEvent = false;
  }
}

// ─── DB Singleton ───────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
        if (!db.objectStoreNames.contains('avatars')) db.createObjectStore('avatars');
        if (!db.objectStoreNames.contains('plugins')) db.createObjectStore('plugins');
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      },
    }).catch((err) => {
      // Reset so next call retries (e.g. after environment becomes available)
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// ─── Core API ───────────────────────────────────────────────────────────────

/**
 * Get a value from IndexedDB.
 * Falls back to localStorage if IndexedDB is unavailable.
 */
export async function storageGet<T = unknown>(store: StoreNames, key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    return await db.get(store, key) as T | undefined;
  } catch {
    emitStorageEvent({ type: 'idb-unavailable', store, key });
    // Fallback to localStorage
    try {
      const raw = safeGetItem(`${DB_NAME}:${store}:${key}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Set a value in IndexedDB.
 * Falls back to localStorage if IndexedDB is unavailable.
 */
export async function storageSet(store: StoreNames, key: string, value: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put(store, value, key);
  } catch {
    emitStorageEvent({ type: 'ls-fallback-write', store, key });
    // Fallback to localStorage
    safeSetItem(`${DB_NAME}:${store}:${key}`, JSON.stringify(value));
  }
}

/**
 * Delete a value from IndexedDB.
 */
export async function storageDel(store: StoreNames, key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store, key);
  } catch {
    safeRemoveItem(`${DB_NAME}:${store}:${key}`);
  }
}

/**
 * Get all keys from a store.
 */
export async function storageKeys(store: StoreNames): Promise<string[]> {
  try {
    const db = await getDB();
    return (await db.getAllKeys(store)) as string[];
  } catch {
    return [];
  }
}

/**
 * Clear all data in a store.
 */
export async function storageClear(store: StoreNames): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(store);
  } catch { /* ignore */ }
}

/**
 * Clear ALL OpenClo data (all stores). For full reset.
 */
export async function storageClearAll(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(['projects', 'avatars', 'plugins', 'settings'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').clear(),
      tx.objectStore('avatars').clear(),
      tx.objectStore('plugins').clear(),
      tx.objectStore('settings').clear(),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

// ─── Migration Helper ───────────────────────────────────────────────────────

/**
 * Migrate a localStorage key to IndexedDB.
 * Reads from localStorage, writes to IndexedDB, removes from localStorage.
 * Returns the migrated value or undefined.
 */
export async function migrateFromLocalStorage<T = unknown>(
  localKey: string,
  store: StoreNames,
  idbKey: string,
): Promise<T | undefined> {
  try {
    const raw = safeGetItem(localKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as T;
    await storageSet(store, idbKey, value);
    safeRemoveItem(localKey);
    return value;
  } catch {
    return undefined;
  }
}

// ─── Canonical persistence pattern ──────────────────────────────────────────

/**
 * CANONICAL persistence pattern for project-scoped data.
 *
 * Use `storageSet`/`storageGet` for IDB-primary writes/reads, with
 * `migrateFromLocalStorage()` for one-time LS legacy handover. Avoid
 * double-write LS+IDB — see `docs/reports/2026-04-30-bug-10-fix-options.md`
 * for rationale and a documented history of three drift waves of double-write
 * accumulating between 2026-02-23 and 2026-03-24 before this canonical was
 * adopted uniformly.
 *
 * The `saveProject`/`loadProject` pair below is the reference implementation
 * of this pattern (write side: storageSet only; read side: storageGet first,
 * migrateFromLocalStorage as fallback). All eight migrated sites follow the
 * same shape:
 *
 *   - agent-config           (UnifiedBar settings mode / AgentSettings)
 *   - saved-poses            (avatarSlice)
 *   - avatar profiles        (avatarLibrary)
 *   - per-plugin storage     (pluginLoader)
 *   - installed-plugins list (pluginManager)
 *   - provider-config        (providers/types)
 *   - ollama-config          (providers/ollama)
 *   - fallback-provider      (errorRecovery)
 *
 * Out of scope of this canonical (pending B6-state Fase 2 architectural
 * decisions): schema versioning, multi-store transactions, zod boundary
 * parsing, and the deliberate LS-only exceptions (ProjectMemory class API,
 * DesignLogManager, projectIO quarantine — see § 9 of the fix-options note).
 */

// ─── Convenience: Project Autosave ──────────────────────────────────────────

const AUTOSAVE_KEY = 'autosave';
const LEGACY_AUTOSAVE_KEY = 'openclo-autosave';

/** Save project to IndexedDB autosave slot. */
export async function saveProject(project: unknown): Promise<void> {
  await storageSet('projects', AUTOSAVE_KEY, project);
}

/** Load project from IndexedDB autosave slot. Migrates from localStorage if needed. */
export async function loadProject(): Promise<unknown | undefined> {
  // Try IndexedDB first
  const existing = await storageGet('projects', AUTOSAVE_KEY);
  if (existing) return existing;

  // Migrate from localStorage
  return migrateFromLocalStorage(LEGACY_AUTOSAVE_KEY, 'projects', AUTOSAVE_KEY);
}

/** Clear the autosave. */
export async function clearProject(): Promise<void> {
  await storageDel('projects', AUTOSAVE_KEY);
  // Also clear legacy
  safeRemoveItem(LEGACY_AUTOSAVE_KEY);
}
