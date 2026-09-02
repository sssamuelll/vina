// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';
import { EDGE_HIT_PX, VERTEX_HIT_PX } from '../gestureConstants';

/**
 * Spec 2026-09-02 § 5.1: el hover es la promesa del clic (misma función,
 * mismos umbrales, mismo orden) y se DERIVA — el hook guarda la identidad
 * `{pieceId, edgeId, t}` con guarda de igualdad y el último punto de
 * pantalla, y vuelve a resolver cuando cambian zoom/pan/piezas sin esperar
 * un mousemove. El clic fija el ancla y pide abrir el chip; el arrastre fija
 * el ancla en el punto medio del tramo y NO abre nada (R3).
 */
afterEach(cleanup);

const cuadrado = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const bordes = (id: string): SemanticEdge[] => [
  { id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: `${id}:right`, name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: `${id}:bottom`, name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];

function pieza(id = 'p', x = 0): PatternPiece {
  return {
    id, name: id, outline: cuadrado, position: { x, y: 0 }, rotation: 0, mirrored: false,
    active: true, seamAllowance: 10, internals: [], edges: bordes(id),
  } as unknown as PatternPiece;
}

function raton(x: number, y: number, over: { button?: number; shiftKey?: boolean } = {}) {
  return {
    button: 0, shiftKey: false, clientX: x, clientY: y, pointerId: 7, ...over,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup(piezas: PatternPiece[] = [pieza()], zoom = 1, active = true) {
  const callbacks = {
    onApply: vi.fn(), onApplyAll: vi.fn(), onApplySpan: vi.fn(), onSelectEdge: vi.fn(), onSelectVertex: vi.fn(),
  };
  const store = configureStore({ reducer: { editor: editorReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(
    (props: { zoom: number; active: boolean; pieces: PatternPiece[] }) =>
      useSeamAllowanceTool(props.pieces, props.zoom, { x: 0, y: 0 }, callbacks, props.active),
    { wrapper, initialProps: { zoom, active, pieces: piezas } },
  );
  return { hook, ...callbacks };
}

describe('gestureConstants', () => {
  it('el radio de vértice tiene nombre y vale 10 (era un literal en el hook)', () => {
    expect(VERTEX_HIT_PX).toBe(10);
    expect(EDGE_HIT_PX).toBe(12);
  });
});

describe('useSeamAllowanceTool — hover (leer)', () => {
  it('empieza sin hover ni ancla', () => {
    const { hook } = setup();
    expect(hook.result.current.hover).toBeNull();
    expect(hook.result.current.ancla).toBeNull();
    expect(hook.result.current.abrirChip).toBe(0);
  });

  it('sobre el borde: identidad y t del punto proyectado', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).toMatchObject({ pieceId: 'p', edgeId: 'p:top' });
    expect(hook.result.current.hover!.t).toBeCloseTo(0.5, 6);
    act(() => hook.result.current.handleMouseMove(raton(198, 50)));
    expect(hook.result.current.hover).toMatchObject({ pieceId: 'p', edgeId: 'p:right' });
    expect(hook.result.current.hover!.t).toBeCloseTo(0.25, 6);
  });

  it('a 8 px del borde (dentro de EDGE_HIT_PX) lee; a 16 px no', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, -8)));
    expect(hook.result.current.hover).not.toBeNull();
    act(() => hook.result.current.handleMouseMove(raton(100, -16)));
    expect(hook.result.current.hover).toBeNull();
  });

  it('cuerpo, esquina y vacío: sin hover (la esquina gana al borde, como en el clic)', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.handleMouseMove(raton(100, 100)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseMove(raton(2, 2)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.handleMouseMove(raton(999, 999)));
    expect(hook.result.current.hover).toBeNull();
  });

  it('guarda de igualdad: el mismo punto dos veces no produce un objeto nuevo', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    const antes = hook.result.current.hover;
    act(() => hook.result.current.handleMouseMove(raton(100, 3)));
    expect(hook.result.current.hover).toBe(antes);
  });

  it('el chip sigue al cursor a lo largo del borde: moverse por el mismo borde actualiza t (spec § 4.3)', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(40, 2)));
    expect(hook.result.current.hover!.t).toBeCloseTo(0.2, 6);
    act(() => hook.result.current.handleMouseMove(raton(160, 2)));
    expect(hook.result.current.hover).toMatchObject({ pieceId: 'p', edgeId: 'p:top' });
    expect(hook.result.current.hover!.t).toBeCloseTo(0.8, 6);
  });

  it('en el solape gana la ÚLTIMA pieza del arreglo de dibujables (la que se dibuja arriba)', () => {
    const { hook } = setup([pieza('abajo'), pieza('arriba')]);
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover?.pieceId).toBe('arriba');
  });

  it('cualquier botón que baja limpia el hover: el izquierdo y el derecho', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.handleMouseDown(raton(100, 2, { button: 2 })));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.handleMouseDown(raton(100, 2)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseUp(raton(100, 2)));
  });

  it('limpiarHover() (el puntero salió del <svg>) deja el hover en null', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.limpiarHover());
    expect(hook.result.current.hover).toBeNull();
  });

  it('con el botón abajo tras un press que no armó gesto (esquina, vacío) tampoco se lee; al soltar, vuelve', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseDown(raton(2, 2)));      // esquina: no arma nada
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseUp(raton(100, 2)));
    act(() => hook.result.current.handleMouseMove(raton(100, 3)));
    expect(hook.result.current.hover).not.toBeNull();
    act(() => hook.result.current.handleMouseDown(raton(999, 999)));  // vacío
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseUp(raton(100, 2)));
  });

  it('cancel() (pointercancel) apaga la lectura y suelta el botón', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).not.toBeNull();
    act(() => hook.result.current.cancel());
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseDown(raton(2, 2)));
    act(() => hook.result.current.cancel());
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).not.toBeNull();
  });

  it('durante un arrastre de cuerpo no se lee aunque el cursor pase por un borde', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseDown(raton(100, 100)));
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover).toBeNull();
    act(() => hook.result.current.handleMouseUp(raton(100, 2)));
  });

  it('zoom con el puntero quieto: se vuelve a resolver desde el último punto de pantalla', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    expect(hook.result.current.hover!.t).toBeCloseTo(0.5, 6);
    // A zoom 2 el mismo píxel (100, 2) es el punto de patrón (50, 1): t = 0,25.
    act(() => hook.rerender({ zoom: 2, active: true, pieces: [pieza()] }));
    expect(hook.result.current.hover).toMatchObject({ pieceId: 'p', edgeId: 'p:top' });
    expect(hook.result.current.hover!.t).toBeCloseTo(0.25, 6);
    // A zoom 0,25 el píxel cae en (400, 8): ya no hay borde debajo.
    act(() => hook.rerender({ zoom: 0.25, active: true, pieces: [pieza()] }));
    expect(hook.result.current.hover).toBeNull();
  });

  it('las piezas cambian debajo (undo la quita): el hover se corrige solo', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.rerender({ zoom: 1, active: true, pieces: [] }));
    expect(hook.result.current.hover).toBeNull();
  });

  it('cambiar de herramienta (active = false) limpia hover y ancla, y no vuelve a resolver', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseMove(raton(100, 2)));
    act(() => hook.result.current.handleMouseDown(raton(100, 2)));
    act(() => hook.result.current.handleMouseUp(raton(100, 2)));
    expect(hook.result.current.ancla).not.toBeNull();
    act(() => hook.rerender({ zoom: 1, active: false, pieces: [pieza()] }));
    expect(hook.result.current.hover).toBeNull();
    expect(hook.result.current.ancla).toBeNull();
    act(() => hook.rerender({ zoom: 2, active: false, pieces: [pieza()] }));
    expect(hook.result.current.hover).toBeNull();
  });
});

describe('useSeamAllowanceTool — ancla (escribir)', () => {
  it('clic en el borde: selecciona, fija el ancla en el t del clic y pide abrir el chip', () => {
    const { hook, onSelectEdge } = setup();
    act(() => hook.result.current.handleMouseDown(raton(50, 2)));
    act(() => hook.result.current.handleMouseUp(raton(50, 2)));
    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
    expect(hook.result.current.ancla).toMatchObject({ pieceId: 'p', edgeId: 'p:top' });
    expect(hook.result.current.ancla!.t).toBeCloseTo(0.25, 6);
    expect(hook.result.current.abrirChip).toBe(1);
    act(() => hook.result.current.handleMouseDown(raton(150, 2)));
    act(() => hook.result.current.handleMouseUp(raton(150, 2)));
    expect(hook.result.current.ancla!.t).toBeCloseTo(0.75, 6);
    expect(hook.result.current.abrirChip).toBe(2);
  });

  it('arrastre: escribe el tramo, ancla en el punto medio del tramo y NO pide abrir (R3)', () => {
    const { hook, onApplySpan } = setup();
    act(() => hook.result.current.handleMouseDown(raton(50, 2)));
    act(() => hook.result.current.handleMouseMove(raton(150, 2)));
    act(() => hook.result.current.handleMouseUp(raton(150, 2)));
    expect(onApplySpan).toHaveBeenCalledWith('p', 'p:top', [0.25, 0.75], 9.5);
    expect(hook.result.current.ancla).toMatchObject({ pieceId: 'p', edgeId: 'p:top' });
    expect(hook.result.current.ancla!.t).toBeCloseTo(0.5, 6);
    expect(hook.result.current.abrirChip).toBe(0);
  });

  it('el clic en la esquina o en el cuerpo no toca el ancla', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleMouseDown(raton(2, 2)));
    act(() => hook.result.current.handleMouseUp(raton(2, 2)));
    act(() => hook.result.current.handleMouseDown(raton(100, 100)));
    act(() => hook.result.current.handleMouseUp(raton(100, 100)));
    expect(hook.result.current.ancla).toBeNull();
    expect(hook.result.current.abrirChip).toBe(0);
  });
});
