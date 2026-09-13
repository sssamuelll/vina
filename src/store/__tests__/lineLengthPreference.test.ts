import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/storage', () => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

import editorReducer, { hydrateLineLengthMode, setLineLengthMode, setZoom2D } from '../editorSlice';
import { NEW_PROJECT } from '../actions';
import { initLineLengthPreference } from '../lineLengthPreference';
import { storageGet, storageSet } from '../../utils/storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('preferencia de largos en editorSlice', () => {
  it('nace apagada sin atribuirle la decisión a la usuaria', () => {
    const state = editorReducer(undefined, { type: '@@INIT' });
    expect(state.lineLengthMode).toBe('none');
    expect(state.lineLengthModeSetByUser).toBe(false);
  });

  it('una selección explícita marca la preferencia incluso si elige Ninguna', () => {
    const state = editorReducer(undefined, setLineLengthMode('none'));
    expect(state.lineLengthMode).toBe('none');
    expect(state.lineLengthModeSetByUser).toBe(true);
  });

  it('hidrata solo antes de que la usuaria elija', () => {
    const hydrated = editorReducer(undefined, hydrateLineLengthMode('all'));
    expect(hydrated.lineLengthMode).toBe('all');
    expect(hydrated.lineLengthModeSetByUser).toBe(false);
    const chosen = editorReducer(hydrated, setLineLengthMode('none'));
    const late = editorReducer(chosen, hydrateLineLengthMode('all'));
    expect(late.lineLengthMode).toBe('none');
    expect(late.lineLengthModeSetByUser).toBe(true);
  });

  it('conserva ambos campos de preferencia al crear otro proyecto', () => {
    let state = editorReducer(undefined, setLineLengthMode('all'));
    state = editorReducer(state, setZoom2D(4));
    state = editorReducer(state, NEW_PROJECT());
    expect(state.lineLengthMode).toBe('all');
    expect(state.lineLengthModeSetByUser).toBe(true);
    expect(state.zoom2D).toBe(1);
  });
});

describe('initLineLengthPreference', () => {
  beforeEach(() => {
    vi.mocked(storageGet).mockReset();
    vi.mocked(storageSet).mockReset();
    vi.mocked(storageSet).mockResolvedValue(undefined);
  });

  it('hidrata un literal válido sin reescribirlo durante el arranque', async () => {
    vi.mocked(storageGet).mockResolvedValue('all');
    const store = configureStore({ reducer: { editor: editorReducer } });
    const stop = initLineLengthPreference(store);
    await flushPromises();
    expect(storageGet).toHaveBeenCalledWith('settings', 'line-length-mode');
    expect(store.getState().editor.lineLengthMode).toBe('all');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(false);
    expect(storageSet).not.toHaveBeenCalled();
    stop();
  });

  it('ignora valores persistidos que no pertenecen al contrato', async () => {
    vi.mocked(storageGet).mockResolvedValue('sometimes');
    const store = configureStore({ reducer: { editor: editorReducer } });
    const stop = initLineLengthPreference(store);
    await flushPromises();
    expect(store.getState().editor.lineLengthMode).toBe('none');
    expect(storageSet).not.toHaveBeenCalled();
    stop();
  });

  it('un "creation" guardado por quien probó la rama vieja se hidrata como Ninguna', async () => {
    vi.mocked(storageGet).mockResolvedValue('creation');
    const store = configureStore({ reducer: { editor: editorReducer } });
    const stop = initLineLengthPreference(store);
    await flushPromises();
    expect(store.getState().editor.lineLengthMode).toBe('none');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(false);
    expect(storageSet).not.toHaveBeenCalled();
    stop();
  });

  it('una lectura tardía no pisa la elección hecha durante el arranque', async () => {
    const read = deferred<unknown>();
    vi.mocked(storageGet).mockReturnValue(read.promise);
    const store = configureStore({ reducer: { editor: editorReducer } });
    const stop = initLineLengthPreference(store);
    store.dispatch(setLineLengthMode('all'));
    read.resolve('none');
    await flushPromises();
    expect(store.getState().editor.lineLengthMode).toBe('all');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(true);
    expect(storageSet).toHaveBeenCalledWith('settings', 'line-length-mode', 'all');
    stop();
  });

  it('serializa cambios rápidos para que el último valor termine de último', async () => {
    vi.mocked(storageGet).mockResolvedValue(undefined);
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    vi.mocked(storageSet)
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const store = configureStore({ reducer: { editor: editorReducer } });
    const stop = initLineLengthPreference(store);
    await flushPromises();
    store.dispatch(setLineLengthMode('all'));
    store.dispatch(setLineLengthMode('none'));
    await flushPromises();
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenNthCalledWith(1, 'settings', 'line-length-mode', 'all');
    firstWrite.resolve();
    await flushPromises();
    expect(storageSet).toHaveBeenCalledTimes(2);
    expect(storageSet).toHaveBeenNthCalledWith(2, 'settings', 'line-length-mode', 'none');
    secondWrite.resolve();
    await flushPromises();
    stop();
  });
});
