// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
});

describe('useEditorInteractions — el mouseUp cierra el gesto para las DOS herramientas que comparten hook', () => {
  /**
   * Regresión, ronda de arreglo 1 (#1029). `freesewing` quedó armando el
   * gesto sin cerrarlo NUNCA: comparte instancia con `seamTool` (paso 10 de
   * esta tarea) y mouseDown/mouseMove seguían ruteados, pero nadie ruteaba
   * mouseUp para `freesewing` — y en la arquitectura del gesto unificado
   * (Tarea 2) TODO commit, clic incluido, se resuelve en `handleMouseUp`
   * (ahí corre `resolveEdgeCommit`). Sin esa línea, `onCommit` no dispara
   * jamás: ni costura, ni reset del `armed.current` de `useEdgeGesture`.
   *
   * Probar esto con un `renderHook(useEditorInteractions, ...)` real exige
   * stubbear las ~25 herramientas de `ToolHooks` — desproporcionado para lo
   * que hay que cazar. En su lugar, se afirma sobre el propio módulo: que
   * las dos ramas de ruteo existen, literales. No es un test de
   * comportamiento, pero SÍ es honesto — falla si cualquiera de las dos
   * líneas desaparece o cambia el handler que llama.
   */
  it('el ruteo de mouseUp incluye seam Y freesewing, no solo seam', () => {
    const src = readFileSync(
      join(__dirname, '../useEditorInteractions.ts'),
      'utf-8',
    );
    expect(src).toContain("if (activeTool === 'seam' && e) seamTool.handleMouseUp(e);");
    expect(src).toContain("if (activeTool === 'freesewing' && e) freeSewingTool.handleMouseUp(e);");
  });
});
