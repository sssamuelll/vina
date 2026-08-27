// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  HistoryActionEvent,
  HistoryTimelineEvent,
  RapidUndoAfterAgentEvent,
} from '../historyTimeline';

const { storageGetMock, storageSetMock } = vi.hoisted(() => ({
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn(),
}));

vi.mock('../../utils/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

const eventAt = (timestamp: number): HistoryActionEvent => ({
  kind: 'historyEntry',
  label: 'Edit Piece',
  actionType: 'project/updatePiece',
  timestamp,
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('persistencia del timeline de historial', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    storageGetMock.mockReset();
    storageSetMock.mockReset();
    storageGetMock.mockResolvedValue([]);
    storageSetMock.mockResolvedValue(undefined);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('debouncea, serializa y coalesce al snapshot más reciente', async () => {
    const {
      appendHistoryTimelineEvent,
      flushHistoryTimeline,
      HISTORY_WRITE_DEBOUNCE_MS,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    let resolveFirst!: () => void;
    let concurrent = 0;
    let maxConcurrent = 0;
    storageSetMock
      .mockImplementationOnce(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => { resolveFirst = resolve; });
        concurrent -= 1;
      })
      .mockImplementation(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        concurrent -= 1;
      });

    await initHistoryTimelinePersistence();
    appendHistoryTimelineEvent(eventAt(1));
    appendHistoryTimelineEvent(eventAt(2));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock.mock.calls[0][2]).toEqual([eventAt(1), eventAt(2)]);

    appendHistoryTimelineEvent(eventAt(3));
    appendHistoryTimelineEvent(eventAt(4));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    expect(storageSetMock).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushHistoryTimeline();

    expect(storageSetMock).toHaveBeenCalledTimes(2);
    expect(storageSetMock.mock.calls[1][2]).toEqual([
      eventAt(1),
      eventAt(2),
      eventAt(3),
      eventAt(4),
    ]);
    expect(maxConcurrent).toBe(1);
  });

  it('visibilitychange hidden hace flush sin esperar 250 ms', async () => {
    const {
      appendHistoryTimelineEvent,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    await initHistoryTimelinePersistence();
    appendHistoryTimelineEvent(eventAt(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenLastCalledWith(
      'settings',
      'undo-history-events',
      [eventAt(1)],
    );
  });

  it('persiste rapidUndoAfterAgent mediante el escritor único del timeline', async () => {
    const {
      appendHistoryTimelineEvent,
      flushHistoryTimeline,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    const event: RapidUndoAfterAgentEvent = {
      kind: 'rapidUndoAfterAgent',
      timestamp: 11_000,
      toolName: 'modifyEdge',
      actionType: 'project/updatePiece',
      actionTimestamp: 1_000,
      lastMutationAt: 1_000,
      latencyMs: 10_000,
    };
    await initHistoryTimelinePersistence();

    appendHistoryTimelineEvent(event);
    await flushHistoryTimeline();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenLastCalledWith(
      'settings',
      'undo-history-events',
      [event],
    );
  });

  it('un evento nuevo reemplaza inmediatamente el snapshot pendiente durante una escritura', async () => {
    const firstWrite = deferred<void>();
    const secondStarted = deferred<void>();
    storageSetMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementation(async () => { secondStarted.resolve(); });
    const {
      appendHistoryTimelineEvent,
      HISTORY_WRITE_DEBOUNCE_MS,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    await initHistoryTimelinePersistence();

    appendHistoryTimelineEvent(eventAt(1));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    appendHistoryTimelineEvent(eventAt(2));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    appendHistoryTimelineEvent(eventAt(3));

    firstWrite.resolve();
    await secondStarted.promise;

    expect(storageSetMock.mock.calls[1][2]).toEqual([
      eventAt(1),
      eventAt(2),
      eventAt(3),
    ]);
  });

  it('un reset reemplaza inmediatamente el snapshot pendiente durante una escritura', async () => {
    const firstWrite = deferred<void>();
    const secondStarted = deferred<void>();
    storageSetMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementation(async () => { secondStarted.resolve(); });
    const {
      appendHistoryTimelineEvent,
      HISTORY_WRITE_DEBOUNCE_MS,
      initHistoryTimelinePersistence,
      resetHistoryTimeline,
    } = await import('../historyTimeline');
    await initHistoryTimelinePersistence();

    appendHistoryTimelineEvent(eventAt(1));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    appendHistoryTimelineEvent(eventAt(2));
    await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
    resetHistoryTimeline();

    firstWrite.resolve();
    await secondStarted.promise;

    expect(storageSetMock.mock.calls[1][2]).toEqual([]);
  });

  it('flush antes de hidratar espera la lectura y la escritura', async () => {
    const read = deferred<HistoryTimelineEvent[]>();
    const write = deferred<void>();
    const writeStarted = deferred<void>();
    storageGetMock.mockImplementation(() => read.promise);
    storageSetMock.mockImplementation(() => {
      writeStarted.resolve();
      return write.promise;
    });
    const {
      appendHistoryTimelineEvent,
      flushHistoryTimeline,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    const hydration = initHistoryTimelinePersistence();
    appendHistoryTimelineEvent(eventAt(1));
    let flushCompleted = false;
    const flush = flushHistoryTimeline().then(() => { flushCompleted = true; });

    await Promise.resolve();
    const completedBeforeRead = flushCompleted;
    read.resolve([]);
    await writeStarted.promise;
    const completedBeforeWrite = flushCompleted;
    write.resolve();
    await Promise.all([hydration, flush]);

    expect({ completedBeforeRead, completedBeforeWrite, flushCompleted }).toEqual({
      completedBeforeRead: false,
      completedBeforeWrite: false,
      flushCompleted: true,
    });
  });

  it('fusiona lectura tardía sin fabricar undo', async () => {
    let resolveRead!: (events: HistoryTimelineEvent[]) => void;
    storageGetMock.mockImplementation(() => new Promise<HistoryTimelineEvent[]>((resolve) => {
      resolveRead = resolve;
    }));
    const { initHistoryTimelinePersistence } = await import('../historyTimeline');
    const {
      canUndo,
      getHistory,
      undoMiddleware,
    } = await import('../undoMiddleware');
    const { default: projectReducer, setProjectName } = await import('../projectSlice');
    const hydration = initHistoryTimelinePersistence();
    const store = configureStore({
      reducer: { project: projectReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(undoMiddleware),
    });

    vi.setSystemTime(2);
    store.dispatch(setProjectName('Sesión'));
    resolveRead([eventAt(1)]);
    await hydration;

    expect(getHistory().timeline.map((event) => event.timestamp)).toEqual([1, 2]);
    expect(getHistory().past).toHaveLength(1);
    expect(canUndo()).toBe(true);

    store.dispatch({ type: 'editor/undo' });

    expect(canUndo()).toBe(false);
    expect(getHistory().timeline).toHaveLength(2);
  });

  it('un reset durante la lectura descarta el proyecto anterior y persiste vacío', async () => {
    let resolveRead!: (events: HistoryTimelineEvent[]) => void;
    storageGetMock.mockImplementation(() => new Promise<HistoryTimelineEvent[]>((resolve) => {
      resolveRead = resolve;
    }));
    const {
      flushHistoryTimeline,
      getHistoryTimeline,
      initHistoryTimelinePersistence,
      resetHistoryTimeline,
    } = await import('../historyTimeline');

    const hydration = initHistoryTimelinePersistence();
    resetHistoryTimeline();
    resolveRead([eventAt(1)]);
    await hydration;
    await flushHistoryTimeline();

    expect(getHistoryTimeline()).toEqual([]);
    expect(storageSetMock).toHaveBeenLastCalledWith(
      'settings',
      'undo-history-events',
      [],
    );
  });

  it('retiene solo los 50 eventos más recientes sin mutar los retenidos', async () => {
    const {
      appendHistoryTimelineEvent,
      getHistoryTimeline,
      HISTORY_TIMELINE_MAX,
      initHistoryTimelinePersistence,
    } = await import('../historyTimeline');
    await initHistoryTimelinePersistence();
    const first: {
      kind: 'historyEntry';
      label: string;
      actionType: string;
      timestamp: number;
    } = { ...eventAt(1) };
    appendHistoryTimelineEvent(first);
    first.label = 'Mutado fuera del timeline';
    expect(getHistoryTimeline()[0]).toMatchObject({
      kind: 'historyEntry',
      label: 'Edit Piece',
    });
    for (let timestamp = 2; timestamp <= 51; timestamp += 1) {
      appendHistoryTimelineEvent(eventAt(timestamp));
    }

    expect(getHistoryTimeline()).toHaveLength(HISTORY_TIMELINE_MAX);
    expect(getHistoryTimeline().map((event) => event.timestamp)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 2),
    );
    expect(getHistoryTimeline().every(
      (event) => event.kind === 'historyEntry' && event.label === 'Edit Piece',
    )).toBe(true);
  });

  it('los getters aíslan eventos y procedencia anidada de mutaciones externas', async () => {
    const {
      appendHistoryTimelineEvent,
      getHistoryTimeline,
    } = await import('../historyTimeline');
    const { getHistory } = await import('../undoMiddleware');
    const source = {
      ...eventAt(1),
      agent: { toolName: 'modifyEdge' },
    } as HistoryTimelineEvent & { agent: { toolName: string } };
    appendHistoryTimelineEvent(source);

    const direct = getHistoryTimeline() as unknown as Array<{
      label: string;
      actionType: string;
      agent: { toolName: string };
    }>;
    const integrated = getHistory().timeline as unknown as Array<{
      label: string;
      actionType: string;
      agent: { toolName: string };
    }>;
    direct[0].label = 'Mutado desde getHistoryTimeline';
    direct[0].agent.toolName = 'mutado-directo';
    integrated[0].actionType = 'mutado-desde-getHistory';
    integrated[0].agent.toolName = 'mutado-integrado';

    expect(getHistoryTimeline()[0]).toEqual({
      kind: 'historyEntry',
      label: 'Edit Piece',
      actionType: 'project/updatePiece',
      timestamp: 1,
      agent: { toolName: 'modifyEdge' },
    });
  });

  it('inicializa la persistencia una sola vez', async () => {
    const { initHistoryTimelinePersistence } = await import('../historyTimeline');

    const first = initHistoryTimelinePersistence();
    const second = initHistoryTimelinePersistence();

    expect(second).toBe(first);
    await first;
    expect(storageGetMock).toHaveBeenCalledTimes(1);
  });
});
