// @vitest-environment jsdom
/**
 * Espacio pausa la simulación, no la restablece (2026-10-11).
 *
 * El botón del margen dice «Simular · espacio» y el registro llama a la tecla
 * «Iniciar o pausar simulación». Pero el manejador de `sim.toggle` venía de la
 * interfaz vieja de dos modos: fuera de «colocar» RESTABLECÍA (`idle` y vuelta
 * a colocar: la prenda desaparece y las piezas vuelven a flotar alrededor del
 * cuerpo), y dentro de «colocar» —donde el botón deja la vista, porque solo
 * despacha `startSimulation`— volvía a arrancar lo que ya corría. Samuel:
 * «se reinicia». #1170 lo dejó anotado como decisión de producto; la decide
 * esa queja. La tecla hace lo que el botón.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { pauseSimulation, setViewMode3D, startSimulation } from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import dockReducer from '../../../store/dockSlice';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function makeStore() {
  return configureStore({
    reducer: {
      editor: editorReducer,
      project: projectReducer,
      simulation: simulationReducer,
      tools: toolsReducer,
      dock: dockReducer,
      construction: constructionReducer,
      copilotUI: copilotUIReducer,
    },
  });
}

function Hooked() {
  useKeyboardShortcuts();
  return <div data-shortcut-context="3d" tabIndex={0} data-testid="foco" />;
}

function espacio(store: ReturnType<typeof makeStore>) {
  const view = render(<Provider store={store}><ShortcutProvider><Hooked /></ShortcutProvider></Provider>);
  const foco = view.getByTestId('foco');
  foco.focus();
  return () => act(() => {
    foco.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
  });
}

describe('Espacio es el botón «Simular»', () => {
  it.each(['arrange', 'simulate'] as const)('con la tela en marcha (vista %s), Espacio la pausa', (vista) => {
    const store = makeStore();
    store.dispatch(setViewMode3D(vista));
    store.dispatch(startSimulation());
    const pulsar = espacio(store);

    pulsar();

    expect(store.getState().simulation.simulationState, 'pausada, no restablecida ni vuelta a arrancar').toBe('paused');
  });

  it.each(['arrange', 'simulate'] as const)('en pausa (vista %s), Espacio la reanuda', (vista) => {
    const store = makeStore();
    store.dispatch(setViewMode3D(vista));
    store.dispatch(startSimulation());
    store.dispatch(pauseSimulation());
    const pulsar = espacio(store);

    pulsar();

    expect(store.getState().simulation.simulationState).toBe('running');
  });

  it('parada, Espacio la arranca', () => {
    const store = makeStore();
    const pulsar = espacio(store);

    pulsar();

    expect(store.getState().simulation.simulationState).toBe('running');
  });
});
