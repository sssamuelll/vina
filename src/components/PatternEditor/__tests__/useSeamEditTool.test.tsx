// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import editorReducer from '../../../store/editorSlice';
import { useSeamEditTool } from '../useSeamEditTool';
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
  // `children` va DENTRO de las props (no como 3er argumento posicional): con
  // `-b`, el overload de createElement exige `children` en el tipo de props de
  // Provider y el 3er-argumento no lo satisface — mismo patrón ya usado en
  // useFreeSewingTool.seamType.test.ts / useFreeSewingTool.tramo.test.ts.
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
  store = configureStore({ reducer: { editor: editorReducer } });
});

describe('useSeamEditTool', () => {
  it('clicar un borde cosido selecciona su costura', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBe('s1');
  });

  it('clicar un borde libre NO selecciona ni crea nada', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(100, 50)); }); // borde derecho de pA
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });

  it('pasar el ratón sobre un borde cosido enciende su costura', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseMove(ev(50, 0)); });
    expect(result.current.hoveredSeamId).toBe('s1');
  });

  it('salirse del borde apaga el hover', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseMove(ev(50, 0)); });
    act(() => { result.current.handleMouseMove(ev(50, 50)); }); // centro de la pieza
    expect(result.current.hoveredSeamId).toBeNull();
  });

  it('Escape deselecciona', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });

  it('el botón derecho no toca la selección', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0, 2)); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });
});
