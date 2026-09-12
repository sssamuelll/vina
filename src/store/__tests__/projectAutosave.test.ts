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
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';

vi.mock('../../utils/projectIO', () => ({
  loadFromStorage: vi.fn(),
  saveToStorage: vi.fn().mockResolvedValue(undefined),
}));

import { loadFromStorage, saveToStorage } from '../../utils/projectIO';
import { initProjectPersistence, AUTOSAVE_DEBOUNCE_MS } from '../projectAutosave';
import { NEW_PROJECT, RESEW_AI_SEAMS } from '../actions';
import projectReducer, { loadProject } from '../projectSlice';
import { canUndo, getHistory, undoMiddleware } from '../undoMiddleware';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';

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

function makeStoreWithUndo() {
  return configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(undoMiddleware),
  });
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
  clearJournal();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── Hydration ───

describe('initProjectPersistence — boot hydration', () => {
  it('la hidratación del arranque no crea historia de deshacer', async () => {
    const store = makeStoreWithUndo();
    store.dispatch(loadProject({
      ...store.getState().project,
      id: 'proyecto-vacío',
      name: 'Proyecto vacío',
      pieces: [],
      seams: [],
      createdAt: 1,
      updatedAt: 1,
    }));
    const saved = {
      ...store.getState().project,
      id: 'proyecto-guardado',
      name: 'Proyecto guardado',
      pieces: [{
        id: 'pieza-guardada',
        name: 'Pieza guardada',
        outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      }],
      seams: [],
    };
    mockedLoad.mockResolvedValue({ ok: true, project: saved, warnings: [] } as never);

    await initProjectPersistence(store);

    expect(store.getState().project.id).toBe('proyecto-guardado');
    expect(canUndo()).toBe(false);
    expect(getHistory().past).toEqual([]);
  });

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

  it('empty saved project (0 pieces, 0 seams, 0 trazos) → skipped silently', async () => {
    mockedLoad.mockResolvedValue({ ok: true, project: { id: 'x', pieces: [], seams: [], trazos: [] }, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    expect(dispatchedTypes(store)).toEqual([]);
  });

  /**
   * El orden de María (spec de trazos 2026-09-12 § 2.3): raya de construcción
   * primero, pieza calcada después. Si cierra el navegador entre las dos cosas,
   * la compuerta de contenido no puede tirarle el trabajo — el trazo SÍ estaba
   * guardado en IDB, era la hidratación la que no lo restauraba. Lo midió el
   * e2e `tests/e2e/trazos.spec.ts` («recargar conserva los trazos»).
   */
  it('proyecto de solo trazos (0 piezas, 0 costuras, 1 trazo) → se restaura igual', async () => {
    const saved = { id: 'solo-trazos', pieces: [], seams: [], trazos: [{ id: 't1', path: [] }] };
    mockedLoad.mockResolvedValue({ ok: true, project: saved, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    const types = dispatchedTypes(store);
    expect(types).toContain('project/restoreProject');
    expect(types).toContain('editor/requestFitView');
    const toastCall = store.dispatch.mock.calls.find(c => (c[0] as UnknownAction).type === 'copilotUI/showToast')!;
    const toast = (toastCall[0] as unknown as { payload: { message: string } }).payload;
    // Sin piezas, el aviso no puede decir «0 piezas»: cuenta lo que sí volvió.
    expect(toast.message).toBe('Restauré tu proyecto: 1 trazo');
  });

  it('piezas Y trazos → el aviso cuenta las dos cosas', async () => {
    const saved = { id: 'mixto', pieces: [{}, {}], seams: [], trazos: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] };
    mockedLoad.mockResolvedValue({ ok: true, project: saved, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    const toastCall = store.dispatch.mock.calls.find(c => (c[0] as UnknownAction).type === 'copilotUI/showToast')!;
    const toast = (toastCall[0] as unknown as { payload: { message: string } }).payload;
    expect(toast.message).toBe('Restauré tu proyecto: 2 piezas y 3 trazos');
  });

  it('un guardado viejo sin el campo `trazos` no rompe la compuerta', async () => {
    mockedLoad.mockResolvedValue({ ok: true, project: { id: 'viejo', pieces: [], seams: [] }, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    expect(dispatchedTypes(store)).toEqual([]);
  });

  it('costuras IA de motor anterior → toast warning con acción "Re-coser" (RESEW_AI_SEAMS)', async () => {
    const staleSeam = { id: 'auto-seam-123-0', createdBy: 'ai', pieceA: {}, pieceB: {} }; // sin sewEngine = motor 0
    const saved = { id: 'saved', pieces: [{}], seams: [staleSeam] };
    mockedLoad.mockResolvedValue({ ok: true, project: saved, warnings: [] } as never);
    const store = makeFakeStore(emptyProject());

    await initProjectPersistence(store);

    const toasts = store.dispatch.mock.calls
      .filter(c => (c[0] as UnknownAction).type === 'copilotUI/showToast')
      .map(c => (c[0] as unknown as { payload: { type: string; actionLabel?: string; actionPayload?: UnknownAction } }).payload);
    const resew = toasts.find(t => t.actionLabel === 'Re-coser');
    expect(resew).toBeDefined();
    expect(resew!.type).toBe('warning');
    expect(resew!.actionPayload?.type).toBe(RESEW_AI_SEAMS.type);
  });

  it('costuras IA FRESCAS (sewEngine actual) o solo humanas → sin toast de Re-coser', async () => {
    const { SEAM_ENGINE_VERSION } = await import('../../utils/autoSew');
    const freshAi = { id: 'auto-seam-123-0', createdBy: 'ai', sewEngine: SEAM_ENGINE_VERSION, pieceA: {}, pieceB: {} };
    const human = { id: 'uuid-normal', pieceA: {}, pieceB: {} };
    for (const seams of [[freshAi], [human]]) {
      mockedLoad.mockResolvedValue({ ok: true, project: { id: 's', pieces: [{}], seams }, warnings: [] } as never);
      const store = makeFakeStore(emptyProject());
      await initProjectPersistence(store);
      const labels = store.dispatch.mock.calls
        .filter(c => (c[0] as UnknownAction).type === 'copilotUI/showToast')
        .map(c => (c[0] as unknown as { payload: { actionLabel?: string } }).payload.actionLabel);
      expect(labels).not.toContain('Re-coser');
    }
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

  it('un guardado exitoso deja storage/autosave { ok: true, ms } en la bitácora', async () => {
    const store = await bootedStore();
    store.setProject(projectWith(1));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);

    const events = getJournal().events.filter((e) => e.kind === 'storage' && e.name === 'autosave');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ ok: true });
    expect(typeof events[0].data?.ms).toBe('number');
  });

  it('un guardado fallido deja storage/autosave { ok: false, error } en la bitácora', async () => {
    mockedSave.mockRejectedValueOnce(new Error('disco lleno'));
    const store = await bootedStore();
    store.setProject(projectWith(1));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);

    const events = getJournal().events.filter((e) => e.kind === 'storage' && e.name === 'autosave');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ ok: false, error: 'disco lleno' });
    expect(typeof events[0].data?.ms).toBe('number');
  });
});
