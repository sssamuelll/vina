// @vitest-environment jsdom
/**
 * #1132 — el resaltado de hover se queda pegado al salir del lienzo.
 *
 * El arreglo anterior cubrió solo Margen: `handleMouseLeave` (useEditorInteractions)
 * llamaba a `seamAllowanceTool.limpiarHover()` y a nadie más. El censo del 06-09
 * encontró 14 hooks con estado de hover y UNO cableado — otra vez «arreglar la
 * mitad parte el dibujo». Aquí entran los dos que María nombró: coser y editar
 * costuras.
 *
 * #1098 (segundo defecto) — «Editar costuras no reacciona al clic sobre un
 * borde». El clic sobre un borde SIN costura era un no-op declarado a propósito
 * en `useSeamEditTool.ts:53`. A propósito o no, para María es la herramienta
 * rota: la convención de #1117 dice que un gesto que se arma y muere lo dice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import editorReducer from '../../../store/editorSlice';
import toolReducer from '../../../store/toolSlice';
import { useSeamEditTool } from '../useSeamEditTool';
import { useFreeSewingTool } from '../useFreeSewingTool';
import { suscribirNoPasoNada } from '../noPasoNada';
import type { PatternPiece, Seam } from '../../../types/types';

const square = (id: string, x: number): PatternPiece => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const pieces = [square('pA', 0), square('pB', 300)];

const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'pA', edgeName: 'edge-1' },
  pieceB: { pieceId: 'pB', edgeName: 'edge-1' },
  type: 'standard', tension: 100, strength: 1,
  active: true, taped: false, tapeWidth: 10,
};

let store: ReturnType<typeof configureStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(Provider, { store, children });
}

function ev(clientX: number, clientY: number, button = 0) {
  return {
    button, clientX, clientY,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

beforeEach(() => {
  store = configureStore({ reducer: { editor: editorReducer, tools: toolReducer } });
});

describe('#1132 — el resalte se va cuando el ratón sale del lienzo', () => {
  it('editar costuras: limpiarHover apaga las costuras resaltadas', () => {
    const hook = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    // Pasar por el borde superior de pA (edge-1) enciende el resalte.
    act(() => hook.result.current.handleMouseMove(ev(50, 1)));
    expect(hook.result.current.hoveredSeamIds).toEqual(['s1']);

    act(() => hook.result.current.limpiarHover());
    expect(hook.result.current.hoveredSeamIds).toEqual([]);
  });

  it('editar costuras: limpiar dos veces no revienta ni reenciende', () => {
    const hook = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => hook.result.current.limpiarHover());
    act(() => hook.result.current.limpiarHover());
    expect(hook.result.current.hoveredSeamIds).toEqual([]);
  });

  it('coser: limpiarHover apaga el borde resaltado', () => {
    const hook = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, vi.fn()),
      { wrapper },
    );
    act(() => hook.result.current.handleMouseMove(ev(50, 1)));
    expect(hook.result.current.hoveredTarget).not.toBeNull();

    act(() => hook.result.current.limpiarHover());
    expect(hook.result.current.hoveredTarget).toBeNull();
  });
});

describe('#1098 — en Editar costuras, un borde sin costura lo dice', () => {
  it('clicar un borde libre avisa en vez de morir en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const hook = renderHook(
      // Sin costuras: cualquier borde que enganche es libre.
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, []),
      { wrapper },
    );
    act(() => hook.result.current.handleMouseDown(ev(50, 1)));
    cancelar();
    expect(avisos).toContain('costuras:borde-sin-costura');
  });

  it('CONTROL: con costura, el clic la selecciona y no avisa', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const hook = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => hook.result.current.handleMouseDown(ev(50, 1)));
    cancelar();
    expect(avisos).toEqual([]);
    expect((store.getState() as { editor: { selectedSeamId: string | null } }).editor.selectedSeamId).toBe('s1');
  });

  it('clicar donde no hay ningún borde NO avisa — eso es el vacío, no un gesto', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const hook = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, []),
      { wrapper },
    );
    act(() => hook.result.current.handleMouseDown(ev(900, 500)));
    cancelar();
    expect(avisos).toEqual([]);
  });
});
