/**
 * Storage parse failure telemetry.
 *
 * Counts and surfaces localStorage validation failures so that silent
 * sanitisation in the boundary parsers (avatarLibrary, userPreferences,
 * costManager) does not turn into "we never know corruption is happening".
 *
 * The recorder is a sync, in-memory counter + 50-event ring buffer. Sinks
 * registered via `registerStorageParseFailureSink` get every event as it
 * lands; an external integration (Sentry, posthog, ...) is one sink away
 * without changing any caller.
 *
 * Detail strings are zod issue paths + messages — never input values, since
 * a corrupt blob may carry user data. Schema messages in this codebase do
 * not echo input values, so detail is safe to ship.
 *
 * @module storageTelemetry
 */

export type StorageParseFailureReason =
  | 'json_parse'      // JSON.parse threw on the raw localStorage string
  | 'schema_root'     // Root structure invalid (atomic reset to defaults)
  | 'schema_record'   // One or more records dropped from a list payload
  | 'storage_read';   // safeGetItem threw / storage unavailable

export interface StorageParseFailureEvent {
  /** localStorage key, e.g. 'vina-avatar-profiles'. */
  key: string;
  reason: StorageParseFailureReason;
  /** Number of records (or 1 for atomic payloads) discarded. */
  droppedCount: number;
  /** Number of records retained. 0 for atomic resets. */
  keptCount: number;
  /** Optional zod path + message. Never includes input values. */
  detail?: string;
  /** epoch ms, set by the recorder. */
  timestamp: number;
}

export interface StorageParseFailureSnapshot {
  total: number;
  byKey: Readonly<Record<string, number>>;
  byReason: Readonly<Record<StorageParseFailureReason, number>>;
  recent: readonly StorageParseFailureEvent[];
}

const MAX_RECENT = 50;

const ALL_REASONS: readonly StorageParseFailureReason[] = [
  'json_parse',
  'schema_root',
  'schema_record',
  'storage_read',
];

function emptyByReason(): Record<StorageParseFailureReason, number> {
  const out: Record<StorageParseFailureReason, number> = {
    json_parse: 0,
    schema_root: 0,
    schema_record: 0,
    storage_read: 0,
  };
  return out;
}

let total = 0;
const byKey: Record<string, number> = {};
const byReason: Record<StorageParseFailureReason, number> = emptyByReason();
const recent: StorageParseFailureEvent[] = [];

type Sink = (event: StorageParseFailureEvent) => void;
const sinks: Set<Sink> = new Set();

/**
 * Record a storage parse failure. Increments counters, pushes onto the
 * ring buffer, and notifies registered sinks. Sink errors are swallowed
 * so a misbehaving listener cannot break the boundary path.
 */
export function recordStorageParseFailure(
  event: Omit<StorageParseFailureEvent, 'timestamp'>,
): void {
  const full: StorageParseFailureEvent = { ...event, timestamp: Date.now() };
  total++;
  byKey[full.key] = (byKey[full.key] ?? 0) + 1;
  byReason[full.reason]++;
  recent.push(full);
  if (recent.length > MAX_RECENT) recent.shift();
  for (const sink of sinks) {
    try {
      sink(full);
    } catch {
      // sink errors must not propagate to the boundary path
    }
  }
}

/**
 * Register a sink that receives every storage parse failure event.
 * Returns an unregister function.
 */
export function registerStorageParseFailureSink(sink: Sink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/**
 * Snapshot of the current counters. Returned objects are frozen so callers
 * cannot mutate the internal state.
 */
export function getStorageParseFailureSnapshot(): StorageParseFailureSnapshot {
  return Object.freeze({
    total,
    byKey: Object.freeze({ ...byKey }),
    byReason: Object.freeze({ ...byReason }),
    recent: Object.freeze(recent.slice()),
  });
}

/**
 * Reset all counters and the ring buffer. Sinks are NOT cleared (callers
 * that need a clean slate should track their own sink registration).
 *
 * Intended for tests and for explicit "clear telemetry" actions.
 */
export function resetStorageParseFailureCounter(): void {
  total = 0;
  for (const k of Object.keys(byKey)) delete byKey[k];
  for (const r of ALL_REASONS) byReason[r] = 0;
  recent.length = 0;
}
