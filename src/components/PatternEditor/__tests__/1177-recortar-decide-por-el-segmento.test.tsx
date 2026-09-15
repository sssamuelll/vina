// @vitest-environment jsdom
/**
 * #1177 — Recortar: el clic de confirmación no decidía nada en un contorno
 * cerrado.
 *
 * El heurístico comparaba el clic contra el PRIMER y el ÚLTIMO punto del
 * contorno APLANADO ENTERO. Para cualquier pieza cerrada (comando `Z`),
 * `flattenPath` devuelve el mismo punto como primero y como último —así que
 * la comparación siempre desempataba igual, sin importar dónde clicara
 * María. El DXF que importa vina cierra todos sus contornos.
 *
 * La pregunta que el clic de confirmación tiene que contestar no es «¿más
 * cerca del principio o del final del contorno?» —eso no tiene sentido para
 * un lazo—, es «¿más cerca del inicio o del final de ESTE segmento?». Ese es
 * el arreglo: comparar contra los dos vértices del segmento que se recorta,
 * no contra los extremos del array.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useExtendTrimTool } from '../useExtendTrimTool';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

/** Cuadrado 200×150 CERRADO: M(0,0) L(200,0) L(200,150) L(0,150) Z. */
function piezaCerrada(): PatternPiece {
  return {
    id: 'p', name: 'p',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true, layer: 1,
  } as PatternPiece;
}

function ev(x: number, y: number) {
  return {
    button: 0, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function montar(piece: PatternPiece) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, tools: toolReducer },
  });
  store.dispatch(addPiece(piece));
  store.dispatch(selectPiece(piece.id));
  store.dispatch(setToolOption({ toolId: 'extendTrim', optionId: 'mode', value: 'trim' }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useExtendTrimTool(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

const contorno = (store: ReturnType<typeof montar>['store']) =>
  store.getState().project.pieces[0].outline;

describe('#1177 — el clic de confirmación decide por el segmento, no por el contorno', () => {
  it('confirmar cerca del INICIO del segmento conserva ese lado: M no se mueve, el segmento se acorta hasta el recorte', () => {
    // Punto de recorte: (100,0), a la mitad del borde de arriba (segmento 1,
    // de (0,0) a (200,0)). Confirmar cerca de (0,0) —el inicio del
    // segmento— tiene que conservar «inicio → recorte»: M se queda donde
    // estaba y es el SEGMENTO el que se acorta hasta el punto de recorte,
    // saltando directo al vértice siguiente (`trimEdgeAtPoint`, keepSide
    // 'before').
    const { store, hook } = montar(piezaCerrada());
    act(() => hook.result.current.handleMouseDown(ev(100, 0)));   // arma el recorte
    act(() => hook.result.current.handleMouseDown(ev(5, 2)));     // confirma cerca de (0,0)

    const primero = contorno(store)[0];
    const segmento1 = contorno(store)[1];
    expect(primero.values, 'M se movió cuando no debía').toEqual([0, 0]);
    expect(segmento1.type).toBe('L');
    expect(segmento1.values[0], 'el segmento no se acortó hasta el punto de recorte').toBeCloseTo(100, 0);
    expect(segmento1.values[1]).toBeCloseTo(0, 0);
  });

  it('confirmar cerca del FINAL del segmento conserva el otro lado: M se mueve al recorte', () => {
    // Confirmar cerca de (200,0) —el final del segmento— tiene que conservar
    // «recorte → final»: el punto de arranque (M, porque este es el
    // segmento 1) se mueve al recorte, y el segmento sigue intacto hasta su
    // vértice original (`trimEdgeAtPoint`, keepSide 'after').
    const { store, hook } = montar(piezaCerrada());
    act(() => hook.result.current.handleMouseDown(ev(100, 0)));    // arma el recorte
    act(() => hook.result.current.handleMouseDown(ev(195, 2)));    // confirma cerca de (200,0)

    const primero = contorno(store)[0];
    const segmento1 = contorno(store)[1];
    expect(primero.type).toBe('M');
    expect(primero.values[0], 'M no se movió al punto de recorte').toBeCloseTo(100, 0);
    expect(primero.values[1]).toBeCloseTo(0, 0);
    expect(segmento1.values, 'el segmento cambió cuando no debía').toEqual([200, 0]);
  });

  it('los dos clics de confirmación dan resultados DISTINTOS (el caso no se ejerce si son iguales)', () => {
    // Esta es la prueba directa del bug: con el heurístico viejo, las dos
    // ramas de arriba producían el MISMO contorno pase lo que pase, porque
    // primero y último punto del array aplanado son el mismo punto.
    const cercaDelInicio = montar(piezaCerrada());
    act(() => cercaDelInicio.hook.result.current.handleMouseDown(ev(100, 0)));
    act(() => cercaDelInicio.hook.result.current.handleMouseDown(ev(5, 2)));

    const cercaDelFinal = montar(piezaCerrada());
    act(() => cercaDelFinal.hook.result.current.handleMouseDown(ev(100, 0)));
    act(() => cercaDelFinal.hook.result.current.handleMouseDown(ev(195, 2)));

    expect(contorno(cercaDelInicio.store)).not.toEqual(contorno(cercaDelFinal.store));
  });

  it('en un segmento que NO es el 1, donde el heurístico viejo no acertaba ni por casualidad, también decide', () => {
    // El segmento 1 (M→primer L) es el único cuyo vértice de inicio coincide
    // con el primer punto del array — ahí el heurístico viejo podía acertar
    // sin querer. El borde derecho (segmento 2, de (200,0) a (200,150)) no
    // tiene esa suerte: ninguno de sus dos vértices es el primero ni el
    // último punto del contorno.
    const { store, hook } = montar(piezaCerrada());
    act(() => hook.result.current.handleMouseDown(ev(200, 75)));  // mitad del borde derecho
    act(() => hook.result.current.handleMouseDown(ev(200, 5)));   // confirma cerca de (200,0)

    // Cerca del inicio del segmento (200,0): el segmento 2 se acorta hasta
    // el recorte, y el vértice anterior (el final del segmento 1) no cambia.
    const segmento1 = contorno(store)[1];
    const segmento2 = contorno(store)[2];
    expect(segmento1.values, 'el vértice anterior se movió cuando no debía').toEqual([200, 0]);
    expect(segmento2.values[1], 'el segmento 2 no se acortó hasta el punto de recorte').toBeCloseTo(75, 0);
  });
});
