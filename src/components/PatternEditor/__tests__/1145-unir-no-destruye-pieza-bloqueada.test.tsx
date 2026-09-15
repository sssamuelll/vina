// @vitest-environment jsdom
/**
 * #1145 (mitad ALTA) — Unir piezas borra las dos y crea una nueva, sin mirar
 * el candado de ninguna. Es la más destructiva de las cuatro: no sustituye un
 * contorno, hace desaparecer la pieza entera (`removePiece` ×2).
 *
 * `useGuardedAction` no es una defensa: en modo experto ejecuta sin preguntar
 * (`useGuardedAction.ts:120-124`), así que el único filtro real tiene que ser
 * el candado, igual que ya lo es para Tijeras.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import projectReducer, { addPiece, setLayerLocked, lockPiece } from '../../../store/projectSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer, { setExpertMode } from '../../../store/workflowSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import simulationReducer, { toggleLayerVisibility } from '../../../store/simulationSlice';
import { _resetCallbacksForTest } from '../../../hooks/useGuardedAction';
import { useMergeTool } from '../useMergeTool';
import { suscribirNoPasoNada } from '../noPasoNada';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

/** Dos piezas que comparten un lado en x=200: se tocan de sobra para unir. */
function pieza(id: string, x: number, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true, layer: 1,
    ...extra,
  } as PatternPiece;
}

function ev(x: number, y: number) {
  return {
    button: 0, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function montar(piezas: PatternPiece[]) {
  _resetCallbacksForTest();
  const store = configureStore({
    reducer: {
      editor: editorReducer, project: projectReducer, tools: toolReducer,
      workflow: workflowReducer, copilotUI: copilotUIReducer, simulation: simulationReducer,
    },
  });
  for (const p of piezas) store.dispatch(addPiece(p));
  store.dispatch(setExpertMode(true)); // sin el diálogo de por medio: aquí se mide el candado
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useMergeTool(1, { x: 0, y: 0 }), { wrapper });
  const tool = () => hook.result.current;
  const clic = (x: number, y: number) => act(() => tool().handleMouseDown(ev(x, y)));
  return { store, tool, clic };
}

const nPiezas = (store: ReturnType<typeof montar>['store']) => store.getState().project.pieces.length;

describe('#1145 — Unir no destruye una pieza bloqueada', () => {
  it('con la PRIMERA pieza bloqueada, el clic no la arma como sujeto A', () => {
    const { tool, clic } = montar([pieza('a', 0, { locked: true }), pieza('b', 200)]);
    clic(100, 75); // cuerpo de a
    expect(tool().pieceIdA).toBeNull();
  });

  it('con la SEGUNDA pieza bloqueada, unir no las borra', () => {
    const { store, tool, clic } = montar([pieza('a', 0), pieza('b', 200, { locked: true })]);
    clic(100, 75); // arma a
    expect(tool().pieceIdA, 'el caso no se ejerce: el primer clic no armó A').toBe('a');
    clic(300, 75); // b, bloqueada
    expect(nPiezas(store), 'unir se llevó una pieza bloqueada').toBe(2);
  });

  it('con el candado de CAPA en cualquiera de las dos, tampoco', () => {
    const { store, tool, clic } = montar([pieza('a', 0), pieza('b', 200, { layer: 3 })]);
    act(() => { store.dispatch(setLayerLocked({ layer: 3, locked: true })); });
    clic(100, 75);
    expect(tool().pieceIdA, 'el caso no se ejerce: el primer clic no armó A').toBe('a');
    clic(300, 75);
    expect(nPiezas(store)).toBe(2);
  });

  it('el candado puesto DESPUÉS de armar el sujeto A tampoco la deja destruir', () => {
    // Revisión adversarial: el guardián del clic solo pesa `clickedPiece`. La
    // pieza A se re-lee del store en el clic destructivo (línea del segundo
    // clic) y ahí nadie vuelve a mirar el candado. Bloquear la fila de capas
    // o el candado de A entre clic y clic no resetea el estado del hook —así
    // que es alcanzable sin trucos: María clica A, se distrae, bloquea, y
    // vuelve a clicar B.
    const { store, tool, clic } = montar([pieza('a', 0), pieza('b', 200)]);
    clic(100, 75);
    expect(tool().pieceIdA, 'el caso no se ejerce: A no se armó').toBe('a');
    act(() => { store.dispatch(lockPiece('a')); });
    clic(300, 75);
    const ids = store.getState().project.pieces.map((p: PatternPiece) => p.id);
    expect(ids, 'unir se llevó una pieza bloqueada').toContain('a');
  });

  it('el candado de CAPA puesto a mitad de gesto sobre A también la protege', () => {
    const { store, tool, clic } = montar([pieza('a', 0), pieza('b', 200, { layer: 2 })]);
    clic(100, 75);
    expect(tool().pieceIdA, 'el caso no se ejerce: A no se armó').toBe('a');
    act(() => { store.dispatch(setLayerLocked({ layer: 1, locked: true })); });
    clic(300, 75);
    const ids = store.getState().project.pieces.map((p: PatternPiece) => p.id);
    expect(ids, 'unir se llevó una pieza con la capa bloqueada a mitad de gesto').toContain('a');
  });

  it('una pieza OCULTA por capa no gana el hit-test sobre la visible que pisa', () => {
    // Revisión adversarial: `hitTestPieceBBox` recorre el array en orden y
    // devuelve la PRIMERA caja que contiene el punto — sin mirar capas
    // ocultas ni `zOrder`. Con una pieza oculta primero en el array y su caja
    // pisando a una visible, el clic resolvía la oculta: el rechazo de
    // candado (si la oculta también estaba bloqueada) apuntaría a una pieza
    // que María ni ve en pantalla. Mismo filtro que ya usa Tijeras.
    const oculta = pieza('oculta', 50, { layer: 2 }); // caja pisa a 'visible': x en [50,200]
    const visible = pieza('visible', 0, { layer: 1 });
    const { store, tool, clic } = montar([oculta, visible]);
    act(() => { store.dispatch(toggleLayerVisibility(2)); });
    clic(100, 75); // dentro de las dos cajas
    expect(tool().pieceIdA, 'el hit-test resolvió la pieza oculta').toBe('visible');
  });

  it('entre dos piezas visibles superpuestas, gana la de arriba (zOrder)', () => {
    const abajo = pieza('abajo', 50, { zOrder: 1 });
    const arriba = pieza('arriba', 0, { zOrder: 2 });
    const { tool, clic } = montar([abajo, arriba]);
    clic(100, 75); // dentro de las dos cajas
    expect(tool().pieceIdA).toBe('arriba');
  });

  it('el rechazo se dice, no muere en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const { clic } = montar([pieza('a', 0, { locked: true }), pieza('b', 200)]);
    clic(100, 75);
    cancelar();
    expect(avisos).toContain('unir:pieza-bloqueada');
  });

  it('CONTROL: sin candado, unir sí borra las dos y crea una', () => {
    const { store, clic } = montar([pieza('a', 0), pieza('b', 200)]);
    clic(100, 75);
    clic(300, 75);
    expect(nPiezas(store)).toBe(1);
    const ids = store.getState().project.pieces.map((p: PatternPiece) => p.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
  });
});
