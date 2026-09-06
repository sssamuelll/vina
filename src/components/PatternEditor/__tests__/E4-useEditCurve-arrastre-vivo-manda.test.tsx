// @vitest-environment jsdom
/**
 * Revisión adversarial 2026-09-06 [MEDIO]: `useEditCurve` copió el peldaño 3
 * de E-4 (sub-selección se suelta antes de salir) pero SIN la guarda de
 * arrastre vivo que sí tiene su hermano `useEditPattern` (`!dragRef.current`).
 * Con el botón apretado, Escape debía cancelar el arrastre y salir —el
 * peldaño 2 manda sobre el 3— pero solo soltaba `selectedNode` y el lote de
 * deshacer ("Editar nodo") seguía abierto hasta el release.
 */
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import type { PatternPiece } from '../../../types/types';
import { useEditCurve } from '../useEditCurve';

afterEach(cleanup);

function squarePiece(): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

function setup(piece: PatternPiece) {
  const store = configureStore({
    reducer: { project: projectReducer, copilotUI: copilotUIReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useEditCurve(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

function pointer(x: number, y: number): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function escape(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape' });
}

describe('useEditCurve — el peldaño 2 (arrastre vivo) manda sobre el 3 (sub-selección)', () => {
  it('con un arrastre VIVO, Escape cancela el arrastre y sale — no solo suelta el nodo', () => {
    const { hook } = setup(squarePiece());
    act(() => { hook.result.current.enterEdit('p'); });
    act(() => { hook.result.current.handleMouseDown(pointer(100, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(110, 0)); });
    // Sin soltar: el gesto sigue abierto, igual que en useEditPattern.
    act(() => { hook.result.current.handleKeyDown(escape()); });
    expect(hook.result.current.isEditing, 'debía salir — el peldaño 2 manda').toBe(false);
  });

  it('CONTROL: sin arrastre, el primer Escape solo suelta el nodo (peldaño 3 intacto)', () => {
    const { hook } = setup(squarePiece());
    act(() => { hook.result.current.enterEdit('p'); });
    act(() => { hook.result.current.handleMouseDown(pointer(100, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(hook.result.current.selectedNode).not.toBeNull();

    act(() => { hook.result.current.handleKeyDown(escape()); });
    expect(hook.result.current.selectedNode).toBeNull();
    expect(hook.result.current.isEditing).toBe(true);
  });
});
