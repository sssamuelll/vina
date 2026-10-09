// @vitest-environment jsdom
/**
 * El tipo de una costura nueva. Hasta P3c, Coser lo leía de su opción en la
 * línea al pie (toolOptions.seam.seamType). Desde P3c (spec 2026-10-02 § 5.2
 * y § 5.3) «Tipo de costura» sale del pie: la costura nace Normal y su tipo se
 * cambia en su etiqueta, con la costura elegida. Es el «“Tipo de costura”
 * fuera del gesto de coser» que María pidió el 30-08 [22:47].
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useFreeSewingTool } from '../useFreeSewingTool';
import type { PatternPiece } from '../../../types/types';

function makeSquare(id: string, x: number): PatternPiece {
  return {
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
  };
}

const fakeEvent = (x: number, y: number) =>
  ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600,
        right: 800, bottom: 600, x: 0, y: 0,
        toJSON: () => ({}),
      }),
    },
  }) as unknown as React.MouseEvent<SVGSVGElement>;

function setup(seamType?: string) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  if (seamType) {
    store.dispatch(setToolOption({ toolId: 'seam', optionId: 'seamType', value: seamType }));
  }
  const onComplete = vi.fn();
  const pieces = [makeSquare('a', 0), makeSquare('b', 300)];
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
    { wrapper },
  );
  // Click (down+up, sin arrastre) el borde de arriba de la pieza A, luego el de B.
  act(() => { result.current.handleMouseDown(fakeEvent(50, 0)); });
  act(() => { result.current.handleMouseUp(fakeEvent(50, 0)); });
  act(() => { result.current.handleMouseDown(fakeEvent(350, 0)); });
  act(() => { result.current.handleMouseUp(fakeEvent(350, 0)); });
  return onComplete;
}

describe('useFreeSewingTool — la costura nueva nace Normal (P3c)', () => {
  it('sin nada guardado, Normal', () => {
    const onComplete = setup();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].type).toBe('standard');
  });

  it('un tipo viejo que quede en toolOptions ya no manda: la opción salió del pie', () => {
    const onComplete = setup('french');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].type).toBe('standard');
  });
});
