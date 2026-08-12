// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildSegmentSeam, type SegmentSelection } from '../useSegmentSewingTool';
import type { PatternPiece } from '../../../types/types';

/** Cuadrado simple: M 0,0 L 100,0 L 100,100 L 0,100 Z */
const square = (id: string, x: number): PatternPiece => ({
  id,
  name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
});

const seg = (pieceId: string, startT: number, endT: number): SegmentSelection => ({
  pieceId,
  edgeIndex: 1,
  edgeRange: [1, 2],
  startT,
  endT,
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 0, y: 0 },
});

const pieces = [square('pA', 0), square('pB', 300)];

describe('el clic sigue produciendo el borde entero, byte a byte', () => {
  it('rango 0..1 NO escribe tStart/tEnd — es la convención rango-completo', () => {
    const seam = buildSegmentSeam(seg('pA', 0, 1), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceA.tEnd).toBeUndefined();
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  it('y conserva pieceId y edgeName como el flujo de dos clics de hoy', () => {
    const seam = buildSegmentSeam(seg('pA', 0, 1), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.pieceId).toBe('pA');
    expect(seam.pieceB.pieceId).toBe('pB');
    expect(seam.type).toBe('standard');
    expect(seam.tension).toBe(100);
    expect(seam.active).toBe(true);
  });
});

describe('el arrastre sí escribe el tramo', () => {
  it('media mitad contra borde entero: A lleva rango, B no', () => {
    const seam = buildSegmentSeam(seg('pA', 0.25, 0.75), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 5);
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  it('dos tramos asimétricos conservan cada uno el suyo', () => {
    const seam = buildSegmentSeam(seg('pA', 0.1, 0.4), seg('pB', 0.5, 0.9), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.1, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.4, 5);
    expect(seam.pieceB.tStart).toBeCloseTo(0.5, 5);
    expect(seam.pieceB.tEnd).toBeCloseTo(0.9, 5);
  });
});

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import toolReducer from '../../../store/toolSlice';
import { useFreeSewingTool } from '../useFreeSewingTool';

function wrapper({ children }: { children: React.ReactNode }) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  // `children` va DENTRO de las props (no como 3er argumento posicional): con
  // `-b`, el overload de createElement exige `children` en el tipo de props de
  // Provider y el 3er-argumento no lo satisface — mismo patrón ya usado en
  // useFreeSewingTool.seamType.test.ts.
  return React.createElement(Provider, { store, children });
}

/** Evento de ratón sobre el lienzo, en coordenadas de patrón = de pantalla
 *  (zoom 1, pan 0, rect en el origen). */
function ev(clientX: number, clientY: number, button = 0) {
  return {
    button, clientX, clientY,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('useFreeSewingTool — la fusión', () => {
  it('dos clics en bordes de piezas distintas cosen los bordes enteros', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );

    // Borde de arriba de pA: y≈0, x entre 0 y 100
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    // Borde de arriba de pB: pieza desplazada 300 en x
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const seam = onComplete.mock.calls[0][0];
    expect(seam.pieceA.pieceId).toBe('pA');
    expect(seam.pieceB.pieceId).toBe('pB');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceB.tStart).toBeUndefined();
  });

  it('arrastrar en la primera pieza cose solo ese tramo', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );

    // Arrastre del 25% al 75% del borde de arriba de pA
    act(() => { result.current.handleMouseDown(ev(25, 0)); });
    act(() => { result.current.handleMouseMove(ev(75, 0)); });
    act(() => { result.current.handleMouseUp(ev(75, 0)); });
    // Clic entero en pB
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });

    const seam = onComplete.mock.calls[0][0];
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 1);
    expect(seam.pieceB.tStart).toBeUndefined();
  });

  it('el segundo gesto en la MISMA pieza no cierra costura', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    act(() => { result.current.handleMouseDown(ev(100, 50)); }); // borde derecho de pA
    act(() => { result.current.handleMouseUp(ev(100, 50)); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('Escape suelta la mitad sostenida', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    expect(result.current.segmentA).not.toBeNull();
    act(() => { result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.segmentA).toBeNull();
  });

  it('un clic en vacío sosteniendo la mitad A la suelta (#1029 tanda 1 pt.2)', () => {
    // Antes de la unificación, un clic en lona vacía soltaba segmentA
    // (resolveTarget devuelve null y el press "no pasaba nada"). Hoy
    // resolveTarget también devuelve null ahí, pero handleMouseDown salía
    // sin escribir nada: la usuaria quedaba atrapada sosteniendo la mitad A
    // sin ninguna salida (el único camino visible era Escape).
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    expect(result.current.segmentA).not.toBeNull();

    // Lona vacía: muy lejos de cualquier borde de pA o pB.
    act(() => { result.current.handleMouseDown(ev(5000, 5000)); });
    expect(result.current.segmentA).toBeNull();
  });
});

// El § 3.4 del spec tiene una tabla de cuatro filas para "soltar fuera", y las
// cuatro dicen CLAMPEAR. El release no es una segunda oportunidad de apuntar:
// el borde ya lo eligió el press, y soltar lejos solo dice "hasta el final".
//
// Caer a clic ahí es peor que no hacer nada, porque no hace nada visible mal:
// cose el borde ENTERO, que es una costura válida y plausible. María no ve un
// error, ve que "a veces coge todo el lado" — y eso no se reporta como bug,
// se aprende como maña.
describe('soltar fuera del borde clampea, no cae a clic (spec § 3.4)', () => {
  const dragAndRelease = (releaseX: number, releaseY: number) => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    // Press en el 25% del borde de arriba de pA (y=0, x de 0 a 100).
    act(() => { result.current.handleMouseDown(ev(25, 0)); });
    act(() => { result.current.handleMouseMove(ev(releaseX, releaseY)); });
    act(() => { result.current.handleMouseUp(ev(releaseX, releaseY)); });
    // Clic de borde entero en pB para cerrar la costura y poder inspeccionarla.
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });
    return onComplete.mock.calls[0]?.[0];
  };

  it('soltar lejos del borde proyecta sobre él en vez de coserlo entero', () => {
    // 60 px por debajo del borde: cinco veces el umbral de enganche de 12.
    const seam = dragAndRelease(75, 60);
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 1);
  });

  it('soltar más allá del extremo clampea a 1, no cose el borde entero', () => {
    // x=150 se pasa del final del borde (x=100). El tramo llega hasta la punta.
    const seam = dragAndRelease(150, 0);
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBe(1);
  });

  it('soltar sobre otra pieza sigue clampeado al borde del press', () => {
    // (350,0) es el borde de arriba de pB. El press mandó pA y no se re-apunta.
    const seam = dragAndRelease(350, 0);
    expect(seam.pieceA.pieceId).toBe('pA');
    expect(seam.pieceA.tEnd).toBe(1);
  });

  it('el borde entero sigue siendo lo que da un clic sin moverse', () => {
    // La no-regresión: sin este caso, el arreglo podría matar el clic.
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(25, 0)); });
    act(() => { result.current.handleMouseUp(ev(25, 0)); });
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });
    expect(onComplete.mock.calls[0][0].pieceA.tStart).toBeUndefined();
  });
});
