// @vitest-environment jsdom
/**
 * Editar patrón con internas (spec 2026-09-24, fase 2).
 *
 * María, 10-09 [10:05]: «el patrón lo puedo mover? no puedes editar las
 * internas, ok, así hay que arreglarlo».
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, updateInternalLine } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { useEditPattern } from '../useEditPattern';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';

afterEach(cleanup);

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];
const ELE: InternalLine = {
  id: 'L', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
};
const PIQUETE: InternalLine = { id: 'N', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 8] }] };

function pieza(internals: InternalLine[] = [ELE], extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'P', outline: RECT, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, seamAllowance: 0, edges: [], internals, ...extra,
  } as unknown as PatternPiece;
}

/** zoom 1, pan 0, rect en el origen: pantalla === patrón. */
function montarQ(pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }).concat(undoMiddleware),
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
  const internaDe = (id: string) => store.getState().project.pieces[0].internals.find(l => l.id === id)!;
  return { store, hook, internaDe };
}

describe('el estado de Q conoce las internas', () => {
  it('al entrar lee sus internas editables, sin piquetes', () => {
    const { hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    expect(hook.result.current.internas.map(i => i.lineId)).toEqual(['L']);
  });

  it('un cambio externo en una interna (deshacer, el copiloto) relee sus puntos', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 50] }, { type: 'L', values: [120, 120] }];
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'L', path: nuevo })); });
    expect(hook.result.current.internas[0].nodes[1].position).toEqual({ x: 120, y: 50 });
  });

  it('un cambio en un piquete no suelta lo elegido del contorno', () => {
    const { store, hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown({ button: 0, shiftKey: false, clientX: 200, clientY: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } } as unknown as React.MouseEvent<SVGSVGElement>); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'N', path: [{ type: 'M', values: [101, 0] }, { type: 'L', values: [101, 8] }] })); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });
});
