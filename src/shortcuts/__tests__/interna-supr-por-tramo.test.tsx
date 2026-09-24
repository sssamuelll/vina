// @vitest-environment jsdom
/**
 * Task 7, ronda de revisión 1 — Supr con un tramo de INTERNA seleccionado
 * (spec 2026-09-24 § 4.6), mismo par de lecciones que #1158 pero del otro
 * lado de la puerta:
 *
 *  1. El sujeto. `resolverBorrado` decide «internalLine» con su
 *     `segmentIndex`, y la puerta tiene que alcanzar el reducer NUEVO
 *     (`removeTramosDeInterna`) en vez del de siempre (`removeInternalLine`)
 *     cuando corresponde — y al revés cuando no. Que el reducer funcione
 *     (tarea 7, `removeTramosDeInterna.test.ts`) no prueba que el atajo lo
 *     alcance: es la misma lección de «verificar la puerta, no solo el
 *     cuarto» que motivó #1158.
 *  2. La bitácora. `interna:delete { pieceId, lineId, segmentIndex }`, solo
 *     cuando el tramo de verdad se usa — el hilo y la pinza (`seBorraEntera`)
 *     se van enteros y sin registrar ese evento.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer, { selectInternalLine } from '../../store/editorSlice';
import projectReducer, { restoreState } from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';
import { applyDartsToInternals, extractDarts } from '../../utils/dartEntity';
import type { InternalLine, PatternPiece } from '../../types/types';

/** Cuatro anclas, tres tramos: índices 1, 2 (medio) y 3 — como el trazo de #1158. */
const REFERENCIA: InternalLine = {
  id: 'r1', type: 'reference',
  path: [
    { type: 'M', values: [20, 20] },
    { type: 'L', values: [120, 20] },
    { type: 'L', values: [120, 120] },
    { type: 'L', values: [20, 120] },
  ],
};

/** Una pinza: `seBorraEntera` la protege de partirse aunque haya tramo elegido. */
const PINZA: InternalLine = {
  id: 'd1', type: 'dart', dartOptions: { capShape: 'pointed' },
  path: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 50] },
    { type: 'L', values: [20, 0] },
  ],
};

beforeEach(clearJournal);
afterEach(cleanup);

function montar(internal: InternalLine, segmentIndex?: number, extra: Partial<PatternPiece> = {}) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
  const piece = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 200] }, { type: 'Z', values: [] }],
    internals: [internal], edges: [], ...extra,
  } as unknown as PatternPiece;
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece], isDirty: false }));
  store.dispatch(selectInternalLine({
    pieceId: 'p', lineId: internal.id,
    ...(segmentIndex !== undefined ? { segmentIndex } : {}),
  }));
  function Hooked() { useKeyboardShortcuts(); return null; }
  render(
    <Provider store={store}>
      <ShortcutProvider>
        <Hooked />
      </ShortcutProvider>
    </Provider>,
  );
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
  const evento = getJournal().events.find((e) => e.name === 'interna:delete');
  return { store, evento };
}

describe('Supr con un tramo de interna seleccionado (atajo de teclado, spec § 4.6)', () => {
  it('el tramo del medio de una referencia la parte en dos, y la bitácora lo dice', () => {
    const { store, evento } = montar(REFERENCIA, 2);
    // (a) la puerta alcanzó el reducer nuevo con el sujeto correcto
    const internals = store.getState().project.pieces[0].internals;
    expect(internals).toHaveLength(2);
    expect(internals[0].id).toBe('r1');
    expect(internals[1].id).not.toBe('r1');
    // (b) y lo escribió en la caja negra
    expect(evento?.kind).toBe('gesture');
    expect(evento?.data).toEqual({ pieceId: 'p', lineId: 'r1', segmentIndex: 2 });
  });

  it('una pinza con un tramo elegido se va ENTERA: seBorraEntera no la deja partirse', () => {
    const { store, evento } = montar(PINZA, 1);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
    expect(evento).toBeUndefined();
  });

  it('… y con la copia `darts`, se va de las dos: una operación de pinza después no la resucita (spec § 7, revisión final I-1)', () => {
    const darts = extractDarts({ internals: [PINZA], edges: [] } as unknown as PatternPiece);
    expect(darts).toHaveLength(1);
    const { store } = montar(PINZA, 1, { darts });
    const piece = store.getState().project.pieces[0];
    expect(piece.internals).toHaveLength(0);
    expect(piece.darts).toEqual([]);
    expect(applyDartsToInternals(piece, piece.darts!)).toEqual([]);
  });

  it('sin tramo elegido, la interna se borra entera (comportamiento de hoy)', () => {
    const { store, evento } = montar(REFERENCIA);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
    expect(evento).toBeUndefined();
  });
});
