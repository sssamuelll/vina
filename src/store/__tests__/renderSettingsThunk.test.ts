/**
 * @vitest-environment jsdom
 *
 * openRenderSettings — la puerta al export 3D/turntable (Fase 2).
 * El panel vive en Viewport3D: abrirlo desde una vista 2D-only sin traer el
 * viewport sería abrir una puerta hacia una habitación apagada.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../editorSlice';
import simulationReducer, { setRenderSettingsOpen } from '../simulationSlice';
import { openRenderSettings } from '../renderSettingsThunk';

function makeStore() {
  return configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer },
  });
}

describe('openRenderSettings', () => {
  it('opens the render/export panel', () => {
    const store = makeStore();
    store.dispatch(openRenderSettings());
    expect(store.getState().simulation.renderSettingsOpen).toBe(true);
  });

  it('switches a 2D-only view to split so the panel is visible', () => {
    const store = makeStore();
    store.dispatch(setViewMode('2d'));
    store.dispatch(openRenderSettings());
    expect(store.getState().editor.viewMode).toBe('split');
    expect(store.getState().simulation.renderSettingsOpen).toBe(true);
  });

  it('leaves a 3D view untouched', () => {
    const store = makeStore();
    store.dispatch(setViewMode('3d'));
    store.dispatch(openRenderSettings());
    expect(store.getState().editor.viewMode).toBe('3d');
  });

  it('setRenderSettingsOpen(false) closes it', () => {
    const store = makeStore();
    store.dispatch(openRenderSettings());
    store.dispatch(setRenderSettingsOpen(false));
    expect(store.getState().simulation.renderSettingsOpen).toBe(false);
  });
});

describe('puertas del export 3D (menú + palette)', () => {
  it('la palette tiene un comando export-3d que abre el panel', async () => {
    const { COMMANDS } = await import('../../components/shell/unifiedBarCommandDefs');
    const cmd = COMMANDS.find(c => c.id === 'export-3d');
    expect(cmd).toBeTruthy();
    const store = makeStore();
    cmd!.action(store.dispatch, { onOpenPanel: () => {} });
    expect(store.getState().simulation.renderSettingsOpen).toBe(true);
  });
});
