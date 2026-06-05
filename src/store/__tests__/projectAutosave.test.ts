// @vitest-environment jsdom
/**
 * Project autosave — the missing wiring between projectIO's plumbing and the
 * live store. Hydrate-then-subscribe lifecycle:
 *
 *  boot → loadFromStorage() → (restore + fit + toast | quarantined | nothing)
 *       → ONLY THEN attach the focused debounced save subscriber
 *       → visibilitychange:hidden flushes the pending save immediately.
 *
 * Orchestration is tested against a hand-rolled fake store (boundary-contract
 * style per Epic-746); projectIO is mocked at the module boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UnknownAction } from '@reduxjs/toolkit';

vi.mock('../../utils/projectIO', () => ({
  loadFromStorage: vi.fn(),
  saveToStorage: vi.fn().mockResolvedValue(undefined),
}));

import { loadFromStorage, saveToStorage } from '../../utils/projectIO';
import { initProjectPersistence, AUTOSAVE_DEBOUNCE_MS } from '../projectAutosave';
import { NEW_PROJECT } from '../actions';

const mockedLoad = vi.mocked(loadFromStorage);
const mockedSave = vi.mocked(saveToStorage);

// ─── Fake store (orchestration boundary) ───

interface FakeProject { id: string; pieces: unknown[]; seams: unknown[] }

function makeFakeStore(project: FakeProject) {
  let state = { project };
  const listeners: Array<() => void> = [];
  return {
    getState: () => state,
    dispatch: vi.fn((a: UnknownAction) => a),
    subscribe: vi.fn((l: () => void) => { listeners.push(l); return () => {}; }),
    /** Simulate a project-slice change (new reference) + notify like Redux would. */
    setProject(p: FakeProject) { state = { ...state, project: p }; listeners.forEach(l => l()); },
    /** Simulate a dispatch that does NOT touch the project slice. */
    touchOtherSlice() { state = { ...state }; listeners.forEach(l => l()); },
    listenerCount: () => listeners.length,
  };
}

const emptyProject = (): FakeProject => ({ id: 'p0', pieces: [], seams: [] });
const projectWith = (n: number): FakeProject =>
  ({ id: 'p1', pieces: Array.from({ length: n }, (_, i) => ({ id: `piece-${i}` })), seams: [] });

const dispatchedTypes = (store: ReturnType<typeof makeFakeStore>) =>
  store.dispatch.mock.calls.map(c => (c[0] as UnknownAction).type);

beforeEach(() => {
  vi.useFakeTimers();
  mockedLoad.mockReset();
  mockedSave.mockClear();
  mockedSave.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── Hydration ───

describe('initProjectPersistence — boot hydration', () => {
  it('restores a saved project FAITHFULLY: restoreProject + requestFitView + restore toast with "Empezar de cero"', async () => {
    const saved = { id: 'saved', pieces: [{}, {}], seams: [] };
    mockedLoad.mockResolvedValue({ ok: true, project: saved, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    const types = dispatchedTypes(store);
    // restoreProject, NOT loadProject — the import pipeline auto-sews; a
    // restore must never invent seams the user didn't save.
    expect(types).toContain('project/restoreProject');
    expect(types).not.toContain('project/loadProject');
    expect(types).toContain('editor/requestFitView');
    const loadCall = store.dispatch.mock.calls.find(c => (c[0] as UnknownAction).type === 'project/restoreProject')!;
    expect((loadCall[0] as unknown as { payload: unknown }).payload).toBe(saved);

    const toastCall = store.dispatch.mock.calls.find(c => (c[0] as UnknownAction).type === 'copilotUI/showToast')!;
    expect(toastCall).toBeDefined();
    const toast = (toastCall[0] as unknown as { payload: { message: string; actionLabel?: string; actionPayload?: UnknownAction } }).payload;
    expect(toast.message).toContain('2 piezas');
    expect(toast.actionLabel).toBe('Empezar de cero');
    expect(toast.actionPayload?.type).toBe(NEW_PROJECT.type);
  });

  it('no autosave (null) → no restore, no toast', async () => {
    mockedLoad.mockResolvedValue(null);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    expect(dispatchedTypes(store)).toEqual([]);
  });

  it('corrupt autosave (ok:false, already quarantined upstream) → no restore + honest error toast', async () => {
    mockedLoad.mockResolvedValue({ ok: false, error: { code: 'invalid_shape', message: 'bad' } } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    const types = dispatchedTypes(store);
    expect(types).not.toContain('project/restoreProject');
    const toastCall = store.dispatch.mock.calls.find(c => (c[0] as UnknownAction).type === 'copilotUI/showToast');
    expect(toastCall).toBeDefined();
    expect((toastCall![0] as unknown as { payload: { type: string } }).payload.type).toBe('error');
  });

  it('empty saved project (0 pieces, 0 seams) → skipped silently', async () => {
    mockedLoad.mockResolvedValue({ ok: true, project: { id: 'x', pieces: [], seams: [] }, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    expect(dispatchedTypes(store)).toEqual([]);
  });

  it('save subscriber attaches only AFTER hydration resolves (anti-clobber order)', async () => {
    let resolveLoad!: (v: null) => void;
    mockedLoad.mockReturnValue(new Promise(res => { resolveLoad = res; }) as never);
    const store = makeFakeStore(emptyProject());

    const init = initProjectPersistence(store);
    expect(store.listenerCount()).toBe(0); // nothing listening while hydration is in flight

    resolveLoad(null);
    await init;
    expect(store.listenerCount()).toBe(1);
  });
});

// ─── Debounced autosave ───

describe('initProjectPersistence — debounced save', () => {
  async function bootedStore() {
    mockedLoad.mockResolvedValue(null);
    const store = makeFakeStore(emptyProject());
    await initProjectPersistence(store);
    return store;
  }

  it('a project change saves once after the debounce window, with the LATEST state', async () => {
    const store = await bootedStore();
    const p = projectWith(1);
    store.setProject(p);

    expect(mockedSave).not.toHaveBeenCalled(); // not synchronously
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10);

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith(p);
  });

  it('rapid successive changes collapse into one trailing save', async () => {
    const store = await bootedStore();
    store.setProject(projectWith(1));
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS / 2);
    store.setProject(projectWith(2));
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS / 2);
    const last = projectWith(3);
    store.setProject(last);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10);

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith(last);
  });

  it('changes in OTHER slices never trigger a project save', async () => {
    const store = await bootedStore();
    store.touchOtherSlice();
    store.touchOtherSlice();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);

    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('visibilitychange→hidden flushes the pending save immediately (volatile browsers)', async () => {
    const store = await bootedStore();
    store.setProject(projectWith(2));

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockedSave).toHaveBeenCalledTimes(1); // no debounce wait
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(mockedSave).toHaveBeenCalledTimes(1); // pending timer was cancelled, no double save
  });

  it('visibilitychange→hidden with nothing pending does not save', async () => {
    await bootedStore();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockedSave).not.toHaveBeenCalled();
  });
});
