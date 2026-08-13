// @vitest-environment jsdom
/**
 * El lector vivo y el commit tienen que compartir la misma cuenta. Si cada
 * uno deriva los milímetros por su lado, el lienzo puede prometer una medida
 * y guardar otra al soltar — el peor fallo posible para una herramienta CAD.
 */
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import toolReducer from '../../../store/toolSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { useNotchTool } from '../useNotchTool';

const PIECE: PatternPiece = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

const ev = (x: number, y: number) => ({
  button: 0,
  clientX: x,
  clientY: y,
  currentTarget: {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  },
}) as unknown as React.MouseEvent<SVGSVGElement>;

function setup() {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const onAddNotch = vi.fn<(pieceId: string, notch: InternalLine) => void>();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useNotchTool(1, { x: 0, y: 0 }, [PIECE], onAddNotch),
    { wrapper },
  );
  return { result, onAddNotch };
}

describe('useNotchTool — lector vivo del arrastre', () => {
  it('sigue nulo mientras el movimiento no cruza el umbral de arrastre', () => {
    const h = setup();

    expect(h.result.current.dragPreview).toBeNull();
    act(() => { h.result.current.handleMouseDown(ev(10, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(13, 0)); });

    expect(h.result.current.dragPreview).toBeNull();
  });

  it('muestra la misma distancia que guarda al soltar y después desaparece', () => {
    const h = setup();

    act(() => { h.result.current.handleMouseDown(ev(10, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(42.3, 0)); });

    const preview = h.result.current.dragPreview;
    expect(preview).not.toBeNull();
    expect(preview?.refWorld).toEqual({ x: 0, y: 0 });
    expect(preview?.currentWorld.x).toBeCloseTo(42.3, 3);
    expect(preview?.currentWorld.y).toBeCloseTo(0, 3);
    expect(preview?.distanceMm).toBeCloseTo(42.3, 3);

    const distanceRead = preview!.distanceMm;
    act(() => { h.result.current.handleMouseUp(ev(42.3, 0)); });

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    const saved = h.onAddNotch.mock.calls[0][1].notchAnchor;
    expect(saved?.distanceMm).toBeCloseTo(distanceRead, 6);
    expect(h.result.current.dragPreview).toBeNull();
  });
});
