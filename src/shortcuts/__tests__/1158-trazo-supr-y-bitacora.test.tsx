// @vitest-environment jsdom
/**
 * #1158 — Supr con un tramo de trazo seleccionado.
 *
 * Dos cosas que van juntas y se prueban juntas, porque el bug de una es
 * invisible desde la otra:
 *
 *  1. El sujeto. `resolverBorrado` decide «trazo» y la puerta despacha
 *     `removeTramoDeTrazo` con ESE id y ESE índice. Que el reducer funcione
 *     (tarea 2) no prueba que el atajo lo alcance: es la lección de
 *     «verificar la puerta, no solo el cuarto».
 *  2. La bitácora. Spec 2026-09-12 § 5.6: `trazo:delete { trazoId,
 *     segmentIndex, parte }`. `parte` es si ese Supr PARTE el trazo en dos —
 *     lo que la usuaria ve pasar, no lo que pedimos. Sale de la misma
 *     condición que `quitarTramo`: un tramo del medio parte, una punta no.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer, { selectTrazo } from '../../store/editorSlice';
import projectReducer, { addTrazo } from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';
import type { Trazo } from '../../types/types';

/** Cuatro anclas, tres tramos: índices 1 (punta), 2 (medio) y 3 (punta). */
const TRAZO: Trazo = {
  id: 't1',
  path: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [300, 0] },
  ],
  createdAt: 1,
};

beforeEach(clearJournal);
afterEach(cleanup);

function montar(segmentIndex: number) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
  store.dispatch(addTrazo(TRAZO));
  store.dispatch(selectTrazo({ trazoId: 't1', segmentIndex }));
  function Hooked() { useKeyboardShortcuts(); return null; }
  render(
    <Provider store={store}>
      <ShortcutProvider>
        <Hooked />
      </ShortcutProvider>
    </Provider>,
  );
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
  const evento = getJournal().events.find((e) => e.name === 'trazo:delete');
  return { store, evento };
}

describe('#1158 — Supr borra el tramo del trazo y lo registra', () => {
  it('un tramo del medio parte el trazo en dos, y la bitácora lo dice', () => {
    const { store, evento } = montar(2);
    // (a) la puerta alcanzó el reducer con el sujeto correcto
    expect(store.getState().project.trazos).toHaveLength(2);
    // (b) y lo escribió en la caja negra
    expect(evento?.kind).toBe('gesture');
    expect(evento?.data).toEqual({ trazoId: 't1', segmentIndex: 2, parte: true });
  });

  it('un tramo de la punta no parte nada: `parte: false`', () => {
    const { store, evento } = montar(3);
    expect(store.getState().project.trazos).toHaveLength(1);
    expect(store.getState().project.trazos[0].path).toHaveLength(3);
    expect(evento?.data).toEqual({ trazoId: 't1', segmentIndex: 3, parte: false });
  });

  it('sin tramo seleccionado no se registra ningún borrado de trazo', () => {
    const store = configureStore({
      reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
    });
    store.dispatch(addTrazo(TRAZO));
    function Hooked() { useKeyboardShortcuts(); return null; }
    render(
      <Provider store={store}>
        <ShortcutProvider><Hooked /></ShortcutProvider>
      </Provider>,
    );
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(getJournal().events.some((e) => e.name === 'trazo:delete')).toBe(false);
    expect(store.getState().project.trazos).toHaveLength(1);
  });
});
