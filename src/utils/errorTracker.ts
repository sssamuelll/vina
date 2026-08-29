/**
 * Global error tracker — captures unhandled errors and rejections
 * into an in-memory ring buffer for diagnostics.
 *
 * Replaces console-only error logging with a queryable store.
 *
 * @module errorTracker
 */

import { safeGetItem, safeRemoveItem, safeSetItem } from './safeStorage';
import { pushJournal } from './telemetry/journal';

export interface TrackedError {
  message: string;
  source?: string;
  timestamp: number;
  stack?: string;
}

const MAX_ERRORS = 50;
const errors: TrackedError[] = [];
let _initialized = false;

export const LAST_BOUNDARY_ERROR_KEY = 'vina-last-boundary-error';

/** Get all tracked errors (newest first). */
export function getTrackedErrors(): readonly TrackedError[] {
  return errors;
}

/** Clear all tracked errors. */
export function clearTrackedErrors(): void {
  errors.length = 0;
  // LS-only: borra la misma ranura síncrona de crash; no existe copia IDB paralela.
  safeRemoveItem(LAST_BOUNDARY_ERROR_KEY);
}

/** Get error count. */
export function getErrorCount(): number {
  return errors.length;
}

/** Solo el array + el cap — sin espejo ni persistencia. La rehidratación de arranque usa esto directo (no `pushError`) para no re-fechar en la bitácora un error de la sesión anterior. */
function appendError(entry: TrackedError): void {
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.shift();
}

export function pushError(
  entry: TrackedError,
  options: { persistForReload?: boolean } = {},
): void {
  appendError(entry);
  if (options.persistForReload) {
    // LS-only: React componentDidCatch debe sobrevivir un reload y no puede esperar IDB.
    safeSetItem(LAST_BOUNDARY_ERROR_KEY, JSON.stringify(entry));
  }
  pushJournal('error', 'error', { source: entry.source, message: entry.message.slice(0, 200) });
}

function readPersistedBoundaryError(): TrackedError | null {
  try {
    const raw = safeGetItem(LAST_BOUNDARY_ERROR_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TrackedError>;
    return typeof value.message === 'string' && typeof value.timestamp === 'number'
      ? value as TrackedError
      : null;
  } catch {
    return null;
  }
}

/**
 * Install global error handlers. Call once at app startup.
 * Captures window.onerror + unhandledrejection into the ring buffer.
 */
export function initErrorTracker(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  const persisted = readPersistedBoundaryError();
  if (persisted) appendError(persisted);

  window.addEventListener('error', (event) => {
    pushError({
      message: event.message || 'Unknown error',
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      timestamp: Date.now(),
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    pushError({
      message: reason?.message || String(reason) || 'Unhandled promise rejection',
      source: 'unhandledrejection',
      timestamp: Date.now(),
      stack: reason?.stack,
    });
  });
}
