/**
 * Global error tracker — captures unhandled errors and rejections
 * into an in-memory ring buffer for diagnostics.
 *
 * Replaces console-only error logging with a queryable store.
 *
 * @module errorTracker
 */

export interface TrackedError {
  message: string;
  source?: string;
  timestamp: number;
  stack?: string;
}

const MAX_ERRORS = 50;
const errors: TrackedError[] = [];
let _initialized = false;

/** Get all tracked errors (newest first). */
export function getTrackedErrors(): readonly TrackedError[] {
  return errors;
}

/** Clear all tracked errors. */
export function clearTrackedErrors(): void {
  errors.length = 0;
}

/** Get error count. */
export function getErrorCount(): number {
  return errors.length;
}

function pushError(entry: TrackedError): void {
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.shift();
}

/**
 * Install global error handlers. Call once at app startup.
 * Captures window.onerror + unhandledrejection into the ring buffer.
 */
export function initErrorTracker(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

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
