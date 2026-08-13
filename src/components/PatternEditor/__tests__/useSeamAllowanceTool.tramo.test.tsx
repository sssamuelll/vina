// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';

afterEach(cleanup);

const outline = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'p:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];

function makePiece(id = 'p', x = 0): PatternPiece {
  return {
    id,
    name: id,
    outline,
    position: { x, y: 0 },
    rotation: 0,
    mirrored: false,
    active: true,
    seamAllowance: 0,
    internals: [],
    edges: id === 'p' ? edges : [],
  } as unknown as PatternPiece;
}

function mouseAt(x: number, y: number, shiftKey = false) {
  return {
    button: 0,
    shiftKey,
    clientX: x,
    clientY: y,
    pointerId: 7,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup(pieces: PatternPiece[] = [makePiece()]) {
  const callbacks = {
    onApply: vi.fn(),
    onApplyAll: vi.fn(),
    onApplySpan: vi.fn(),
    onSelectEdge: vi.fn(),
    onSelectVertex: vi.fn(),
  };
  const store = configureStore({ reducer: { editor: editorReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useSeamAllowanceTool(pieces, 1, { x: 0, y: 0 }, callbacks),
    { wrapper },
  );
  return { hook, ...callbacks };
}

describe('useSeamAllowanceTool — tramo del borde', () => {
  it('clic en borde sigue seleccionando el borde entero, como hoy', () => {
    const { hook, onSelectEdge, onApplySpan } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(100, 2)));
    expect(onSelectEdge).not.toHaveBeenCalled();
    act(() => hook.result.current.handleMouseUp(mouseAt(100, 2)));

    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
    expect(onApplySpan).not.toHaveBeenCalled();
  });

  it('arrastre sobre un borde escribe un tramo, no el borde entero', () => {
    const { hook, onSelectEdge, onApplySpan, onApply } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(50, 2)));
    act(() => hook.result.current.handleMouseMove(mouseAt(150, 2)));
    act(() => hook.result.current.handleMouseUp(mouseAt(150, 2)));

    expect(onApplySpan).toHaveBeenCalledWith('p', 'p:top', [0.25, 0.75], 9.5);
    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('el vértice sigue ganando al borde, y no arma arrastre', () => {
    const { hook, onSelectVertex, onSelectEdge, onApplySpan } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(2, 2)));
    act(() => hook.result.current.handleMouseMove(mouseAt(150, 2)));
    act(() => hook.result.current.handleMouseUp(mouseAt(150, 2)));

    expect(onSelectVertex).toHaveBeenCalledWith('p', 0);
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(onApplySpan).not.toHaveBeenCalled();
  });

  it('un body-drag que pasa por encima de un borde sigue siendo body-drag', () => {
    const { hook, onApplyAll, onSelectEdge, onApplySpan } = setup([
      makePiece(),
      makePiece('q', 300),
    ]);

    act(() => hook.result.current.handleMouseDown(mouseAt(100, 100)));
    act(() => hook.result.current.handleMouseMove(mouseAt(100, 2)));
    act(() => hook.result.current.handleMouseUp(mouseAt(100, 2)));

    expect(onApplyAll).toHaveBeenCalledWith(['p'], 9.5);
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(onApplySpan).not.toHaveBeenCalled();
  });

  it('soltar fuera de la pieza clampea al borde del press', () => {
    const { hook, onApplySpan } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(50, 2)));
    act(() => hook.result.current.handleMouseMove(mouseAt(-500, -500)));
    act(() => hook.result.current.handleMouseUp(mouseAt(-500, -500)));

    expect(onApplySpan).toHaveBeenCalledWith('p', 'p:top', [0, 0.25], 9.5);
  });

  it('soltar sobre otro borde clampea al del press: no cruza la esquina', () => {
    const { hook, onApplySpan } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(50, 2)));
    act(() => hook.result.current.handleMouseMove(mouseAt(200, 150)));
    act(() => hook.result.current.handleMouseUp(mouseAt(200, 150)));

    expect(onApplySpan).toHaveBeenCalledWith('p', 'p:top', [0.25, 1], 9.5);
  });

  it('un arrastre degenerado (|Δt| < 0.01) cae a clic', () => {
    const { hook, onSelectEdge, onApplySpan } = setup();

    act(() => hook.result.current.handleMouseDown(mouseAt(100, 2)));
    act(() => hook.result.current.handleMouseMove(mouseAt(100, -20)));
    act(() => hook.result.current.handleMouseUp(mouseAt(100, -20)));

    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
    expect(onApplySpan).not.toHaveBeenCalled();
  });
});
