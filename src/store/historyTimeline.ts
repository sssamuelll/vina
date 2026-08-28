import { storageGet, storageSet } from '../utils/storage';

export const HISTORY_TIMELINE_MAX = 50;
export const HISTORY_WRITE_DEBOUNCE_MS = 250;
const HISTORY_STORAGE_KEY = 'undo-history-events';

export interface HistoryActionEvent {
  readonly kind: 'historyEntry';
  readonly label: string;
  readonly actionType: string;
  readonly timestamp: number;
  readonly agent?: {
    readonly toolName: string;
  };
}

export interface RapidUndoAfterAgentEvent {
  readonly kind: 'rapidUndoAfterAgent';
  readonly timestamp: number;
  readonly toolName: string;
  readonly actionType: string;
  readonly actionTimestamp: number;
  readonly lastMutationAt: number;
  readonly latencyMs: number;
}

export type HistoryTimelineEvent =
  | HistoryActionEvent
  | RapidUndoAfterAgentEvent;

let timeline: HistoryTimelineEvent[] = [];
let hydrated = false;
let dirty = false;
let generation = 0;
let hydrationPromise: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: HistoryTimelineEvent[] | null = null;
let writerPromise: Promise<void> | null = null;
let visibilityInstalled = false;
let flushRequestedBeforeHydration = false;

function cloneHistoryTimelineEvent(event: HistoryTimelineEvent): HistoryTimelineEvent {
  if (event.kind === 'historyEntry' && event.agent) {
    return { ...event, agent: { ...event.agent } };
  }
  return { ...event };
}

function snapshot(): HistoryTimelineEvent[] {
  return timeline.map(cloneHistoryTimelineEvent);
}

async function drainWrites(): Promise<void> {
  while (pendingSnapshot) {
    const nextSnapshot = pendingSnapshot;
    pendingSnapshot = null;
    try {
      // shape: HistoryTimelineEvent[] v1 — opt-in envelope: no
      await storageSet('settings', HISTORY_STORAGE_KEY, nextSnapshot);
    } catch {
      // Degradación silenciosa ratificada: la sesión conserva el ring en memoria.
    }
  }
}

function startWriter(): Promise<void> {
  if (!writerPromise) {
    writerPromise = drainWrites().then(() => {
      writerPromise = null;
      if (pendingSnapshot) return startWriter();
    });
  }
  return writerPromise;
}

function queueLatestSnapshot(): Promise<void> {
  pendingSnapshot = snapshot();
  return startWriter();
}

function schedulePersist(): void {
  dirty = true;
  if (!hydrated) return;
  if (writerPromise) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    dirty = false;
    pendingSnapshot = snapshot();
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (!dirty) return;
    dirty = false;
    void queueLatestSnapshot();
  }, HISTORY_WRITE_DEBOUNCE_MS);
}

export function appendHistoryTimelineEvent(event: HistoryTimelineEvent): void {
  timeline.push(cloneHistoryTimelineEvent(event));
  if (timeline.length > HISTORY_TIMELINE_MAX) timeline.shift();
  schedulePersist();
}

export function getHistoryTimeline(): readonly HistoryTimelineEvent[] {
  return snapshot();
}

export function resetHistoryTimeline(): void {
  generation += 1;
  timeline = [];
  schedulePersist();
}

export function flushHistoryTimeline(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!hydrated) {
    flushRequestedBeforeHydration = true;
    return hydrationPromise ?? initHistoryTimelinePersistence();
  }
  if (dirty) {
    dirty = false;
    return queueLatestSnapshot();
  }
  return writerPromise ?? Promise.resolve();
}

async function hydrate(): Promise<void> {
  const requestedGeneration = generation;
  let stored: HistoryTimelineEvent[] | undefined;
  try {
    stored = await storageGet<HistoryTimelineEvent[]>(
      'settings',
      HISTORY_STORAGE_KEY,
    );
  } catch {
    stored = undefined;
  }

  if (requestedGeneration === generation && Array.isArray(stored)) {
    timeline = [...stored.map(cloneHistoryTimelineEvent), ...timeline]
      .slice(-HISTORY_TIMELINE_MAX);
  }

  hydrated = true;
  if (flushRequestedBeforeHydration) {
    flushRequestedBeforeHydration = false;
    dirty = false;
    await queueLatestSnapshot();
  } else if (dirty || requestedGeneration !== generation) {
    schedulePersist();
  }
}

function installVisibilityFlush(): void {
  if (visibilityInstalled || typeof document === 'undefined') return;
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushHistoryTimeline();
    }
  });
}

export function initHistoryTimelinePersistence(): Promise<void> {
  installVisibilityFlush();
  hydrationPromise ??= hydrate();
  return hydrationPromise;
}
