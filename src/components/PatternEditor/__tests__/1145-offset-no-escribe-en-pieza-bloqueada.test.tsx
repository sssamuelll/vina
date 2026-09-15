// @vitest-environment jsdom
/**
 * #1145 (mitad ALTA) — Desplazar contorno sustituye el contorno de una pieza
 * bloqueada. Mismo mecanismo que #1136 (Margen): el candado se lee para
 * PINTAR (el chip apagado, la fila de capas) y no se leía para ESCRIBIR.
 *
 * Esta es la más severa de las cuatro: en modo `replace` no crea una pieza
 * nueva, sustituye el contorno de la bloqueada en el sitio — la geometría que
 * el candado prometía proteger desaparece y no queda ni rastro de la
 * original.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { addPiece, setLayerLocked } from '../../../store/projectSlice';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useOffsetTool } from '../useOffsetTool';
import { suscribirNoPasoNada } from '../noPasoNada';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function pieza(id: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true, layer: 1,
    ...extra,
  } as PatternPiece;
}

function montar(piece: PatternPiece) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, tools: toolReducer },
  });
  store.dispatch(addPiece(piece));
  store.dispatch(selectPiece(piece.id));
  store.dispatch(setToolOption({ toolId: 'offsetOutline', optionId: 'replace', value: true }));
  store.dispatch(setToolOption({ toolId: 'offsetOutline', optionId: 'distance', value: 10 }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useOffsetTool(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

const contorno = (store: ReturnType<typeof montar>['store'], id: string) =>
  store.getState().project.pieces.find((p: PatternPiece) => p.id === id)!.outline;

describe('#1145 — Desplazar contorno no sustituye la geometría de una pieza bloqueada', () => {
  it('con el candado de la pieza, execute() no toca el contorno', () => {
    const { store, hook } = montar(pieza('p', { locked: true }));
    const antes = contorno(store, 'p');
    act(() => hook.result.current.execute());
    expect(contorno(store, 'p')).toBe(antes);
  });

  it('con el candado de la capa, execute() no toca el contorno', () => {
    const { store, hook } = montar(pieza('p', { layer: 3 }));
    act(() => { store.dispatch(setLayerLocked({ layer: 3, locked: true })); });
    const antes = contorno(store, 'p');
    act(() => hook.result.current.execute());
    expect(contorno(store, 'p')).toBe(antes);
  });

  it('el rechazo se dice, no muere en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const { hook } = montar(pieza('p', { locked: true }));
    act(() => hook.result.current.execute());
    cancelar();
    expect(avisos).toContain('desplazar:pieza-bloqueada');
  });

  it('CONTROL: sin candado, execute() sí sustituye el contorno', () => {
    const { store, hook } = montar(pieza('p'));
    const antes = contorno(store, 'p');
    act(() => hook.result.current.execute());
    expect(contorno(store, 'p')).not.toBe(antes);
  });

  it('CONTROL: en modo NO reemplazar, una pieza bloqueada sí puede derivar una nueva', () => {
    // El censo de #1145 solo marcó ALTA las líneas de `replace` (70, 109):
    // en modo "crear pieza nueva" la original ni se lee para escribir, se usa
    // de referencia — igual que mover ya se permite a propósito sobre una
    // pieza bloqueada. Bloquear esto también sería restringir algo que el
    // candado nunca prometió proteger.
    const { store, hook } = montar(pieza('p', { locked: true }));
    act(() => { store.dispatch(setToolOption({ toolId: 'offsetOutline', optionId: 'replace', value: false })); });
    const antesOriginal = contorno(store, 'p');
    const piezasAntes = store.getState().project.pieces.length;

    act(() => hook.result.current.execute());

    expect(contorno(store, 'p'), 'la pieza bloqueada se tocó igual').toBe(antesOriginal);
    expect(store.getState().project.pieces.length, 'no se creó la pieza derivada').toBe(piezasAntes + 1);
  });
});
