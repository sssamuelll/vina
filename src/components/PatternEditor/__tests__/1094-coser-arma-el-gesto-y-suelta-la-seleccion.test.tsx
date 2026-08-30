// @vitest-environment jsdom
/**
 * #1094, hallazgo HIGH 8 del review de codex: al armar un gesto de Coser
 * (la mitad A sostenida), la costura seleccionada de ANTES seguía seleccionada
 * y Supr la borraba aunque el sujeto más reciente fuera el gesto vivo. Y la
 * pieza seleccionada de tres gestos atrás seguía ahí, que es la raíz de #1094.
 *
 * Regla: el press que arma el gesto suelta la selección entera (pieza y
 * costura). Lo que María tiene delante es el borde que acaba de tomar.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { selectPiece, selectSeam } from '../../../store/editorSlice';
import { useFreeSewingTool } from '../useFreeSewingTool';
import type { PatternPiece } from '../../../types/types';

const PIEZA: PatternPiece = {
  id: 'p1', name: 'P1',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  internals: [], layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as PatternPiece;
const PIEZA_B: PatternPiece = { ...PIEZA, id: 'p2', position: { x: 300, y: 0 } };

/** zoom 1, pan 0, lienzo en el origen: pantalla === patrón. */
const ev = (x: number, y: number) =>
  ({
    button: 0, clientX: x, clientY: y,
    currentTarget: {
      setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
    },
    preventDefault: vi.fn(),
  }) as unknown as React.MouseEvent<SVGSVGElement>;

describe('coser — armar el gesto suelta la selección vieja', () => {
  it('con una pieza y una costura seleccionadas de antes, el press sobre un borde las suelta', () => {
    const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
    store.dispatch(selectPiece('p2'));
    store.dispatch(selectSeam('costura-vieja'));
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, [PIEZA, PIEZA_B], vi.fn()),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    expect(result.current.segmentA).not.toBeNull();
    expect(store.getState().editor.selectedSeamId).toBeNull();
    expect(store.getState().editor.selectedPieceIds).toEqual([]);
  });

  it('un press en vacío (sin borde) no toca la selección', () => {
    const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
    store.dispatch(selectSeam('costura-vieja'));
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, [PIEZA, PIEZA_B], vi.fn()),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(500, 500)); });
    act(() => { result.current.handleMouseUp(ev(500, 500)); });
    expect(result.current.segmentA).toBeNull();
    expect(store.getState().editor.selectedSeamId).toBe('costura-vieja');
  });
});
