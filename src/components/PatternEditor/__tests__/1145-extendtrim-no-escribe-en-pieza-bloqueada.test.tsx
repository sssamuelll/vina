// @vitest-environment jsdom
/**
 * #1145 (mitad ALTA) — Extender/Recortar reescribe el contorno de una pieza
 * bloqueada, tanto en el segundo clic como al confirmar con Enter.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { addPiece, setLayerLocked, lockPiece } from '../../../store/projectSlice';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useExtendTrimTool } from '../useExtendTrimTool';
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

/** zoom 1, pan 0: pantalla = patrón. */
function ev(x: number, y: number) {
  return {
    button: 0, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function montar(piece: PatternPiece, mode: 'extend' | 'trim' = 'extend') {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, tools: toolReducer },
  });
  store.dispatch(addPiece(piece));
  store.dispatch(selectPiece(piece.id));
  store.dispatch(setToolOption({ toolId: 'extendTrim', optionId: 'mode', value: mode }));
  store.dispatch(setToolOption({ toolId: 'extendTrim', optionId: 'distance', value: 20 }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useExtendTrimTool(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

const contorno = (store: ReturnType<typeof montar>['store'], id: string) =>
  store.getState().project.pieces.find((p: PatternPiece) => p.id === id)!.outline;

describe('#1145 — Extender/Recortar no reescribe el contorno de una pieza bloqueada', () => {
  it('con el candado de la pieza, el primer clic ni siquiera arma el gesto', () => {
    // Si armara el gesto (selectedSnap) y muriera en el segundo clic, María
    // vería un preview que luego se rechaza en silencio — peor que no armar.
    const { hook } = montar(pieza('p', { locked: true }));
    act(() => hook.result.current.handleMouseDown(ev(0, 0))); // extremo M
    expect(hook.result.current.selectedSnap).toBeNull();
  });

  it('con el candado de la pieza, el contorno no cambia aunque se insista', () => {
    const { store, hook } = montar(pieza('p', { locked: true }));
    const antes = contorno(store, 'p');
    act(() => hook.result.current.handleMouseDown(ev(0, 0)));
    act(() => hook.result.current.handleMouseDown(ev(-20, 0)));
    expect(contorno(store, 'p')).toBe(antes);
  });

  it('con el candado de la capa, tampoco', () => {
    const { store, hook } = montar(pieza('p', { layer: 3 }));
    act(() => { store.dispatch(setLayerLocked({ layer: 3, locked: true })); });
    const antes = contorno(store, 'p');
    act(() => hook.result.current.handleMouseDown(ev(0, 0)));
    act(() => hook.result.current.handleMouseDown(ev(-20, 0)));
    expect(contorno(store, 'p')).toBe(antes);
  });

  it('Enter tampoco confirma sobre una pieza bloqueada', () => {
    // Defensa en profundidad: si el candado se puso a mitad de gesto (el
    // hallazgo de la revisión de #1136 del 09-06), Enter es la otra puerta de
    // escritura y tiene que negarse igual, no solo el segundo clic.
    const { store, hook } = montar(pieza('p'));
    act(() => hook.result.current.handleMouseDown(ev(0, 0)));
    expect(hook.result.current.selectedSnap, 'el caso no se ejerce: no se armó').not.toBeNull();
    // La pieza se bloquea DESPUÉS de armar el gesto.
    act(() => { store.dispatch(lockPiece('p')); });
    const antes = contorno(store, 'p');
    act(() => hook.result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(contorno(store, 'p')).toBe(antes);
  });

  it('el rechazo se dice, no muere en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const { hook } = montar(pieza('p', { locked: true }));
    act(() => hook.result.current.handleMouseDown(ev(0, 0)));
    cancelar();
    expect(avisos).toContain('extender:pieza-bloqueada');
  });

  it('CONTROL: sin candado, el gesto de extender sí escribe', () => {
    const { store, hook } = montar(pieza('p'));
    const antes = contorno(store, 'p');
    act(() => hook.result.current.handleMouseDown(ev(0, 0)));
    act(() => hook.result.current.handleMouseDown(ev(-20, 0)));
    expect(contorno(store, 'p')).not.toBe(antes);
  });

  it('CONTROL: sin candado, recortar también escribe', () => {
    const { store, hook } = montar(pieza('p'), 'trim');
    const antes = contorno(store, 'p');
    act(() => hook.result.current.handleMouseDown(ev(100, 0))); // punto sobre el borde de arriba
    // El segundo clic en modo recortar vuelve a buscar borde bajo el cursor
    // ANTES de mirar el estado armado: fuera de un borde, `findNearestEdgePoint`
    // da null y el clic no cuenta. Y el borde de cierre (comando Z, el lado
    // izquierdo) se salta entero en ese barrido — (200,100), el borde
    // derecho, sí es un segmento `L` proyectable.
    act(() => hook.result.current.handleMouseDown(ev(200, 100)));
    expect(contorno(store, 'p')).not.toBe(antes);
  });
});
