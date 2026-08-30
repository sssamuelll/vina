// @vitest-environment jsdom
/**
 * #1094 — María, audio 2026-08-30 [23:47]: "Incluso si clico y le doy a
 * suprimir, suprime la pieza… muy raro."
 *
 * En Coser el sujeto es la costura. `edit.delete` borraba lo seleccionado en
 * Redux — una pieza de tres gestos atrás que sobrevivió al cambio de
 * herramienta — y la costura se iba en cascada. Regla (spec cotas vivas
 * § 3.1, el sujeto es lo más reciente): en una herramienta de costura, Supr y
 * Retroceso borran la costura seleccionada si la hay, y NUNCA una pieza. En
 * Seleccionar siguen borrando la selección, como siempre.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer, { selectPiece, selectSeam, setActiveTool } from '../../store/editorSlice';
import projectReducer, { addPiece, addSeam } from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import type { PatternPiece, Seam, Tool2D } from '../../types/types';

afterEach(cleanup);

function pieza(id: string, x: number): PatternPiece {
  return {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x, y: 100 }, rotation: 0, mirrored: false,
    seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true,
  } as PatternPiece;
}

const COSTURA: Seam = {
  id: 'costura-AB',
  pieceA: { pieceId: 'A', edgeName: 'rightEdge' },
  pieceB: { pieceId: 'B', edgeName: 'leftEdge' },
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
} as Seam;

function montar(activeTool: Tool2D, preparar: (dispatch: (a: unknown) => void) => void) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
  store.dispatch(addPiece(pieza('A', 100)));
  store.dispatch(addPiece(pieza('B', 350)));
  store.dispatch(addSeam(COSTURA));
  store.dispatch(setActiveTool(activeTool));
  preparar(store.dispatch as (a: unknown) => void);
  function Hooked() { useKeyboardShortcuts(); return null; }
  render(
    <Provider store={store}>
      <ShortcutProvider>
        <Hooked />
      </ShortcutProvider>
    </Provider>,
  );
  const tecla = (key: string) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key })); });
  const ids = () => store.getState().project.pieces.map((p) => p.id).sort();
  return { store, tecla, ids };
}

describe('#1094 — Supr en Coser', () => {
  for (const key of ['Delete', 'Backspace']) {
    it(`${key} en Coser con una pieza seleccionada de antes no borra la pieza ni la costura`, () => {
      const { store, tecla, ids } = montar('seam', (d) => d(selectPiece('B')));
      tecla(key);
      expect(ids()).toEqual(['A', 'B']);
      expect(store.getState().project.seams).toHaveLength(1);
    });
  }

  it('Supr en Coser con la costura seleccionada borra ESA costura y deja las piezas', () => {
    const { store, tecla, ids } = montar('seam', (d) => d(selectSeam('costura-AB')));
    tecla('Delete');
    expect(store.getState().project.seams).toHaveLength(0);
    expect(ids()).toEqual(['A', 'B']);
  });

  it('en Editar costuras rige la misma regla: la pieza seleccionada de antes sobrevive', () => {
    const { tecla, ids } = montar('seamEdit', (d) => d(selectPiece('A')));
    tecla('Delete');
    expect(ids()).toEqual(['A', 'B']);
  });

  it('en Seleccionar, Supr sigue borrando la selección (nada cambia para ella ahí)', () => {
    const { tecla, ids } = montar('select', (d) => d(selectPiece('B')));
    tecla('Delete');
    expect(ids()).toEqual(['A']);
  });
});
