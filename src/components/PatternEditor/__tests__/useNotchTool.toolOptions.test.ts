// @vitest-environment jsdom
/**
 * Notch-precision F2 (G6) — the notch tool must honor toolOptions.notch
 * (canonical keys: shape/length/width/angle/count, same names as
 * NotchOptions), mirroring the toolOptions.seam convention. The hook used
 * to accept a notchOptions param that NO call site passed (the dangling
 * wire found by the impact map), so DEFAULT_NOTCH_OPTIONS was always used.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useNotchTool } from '../useNotchTool';
import type { InternalLine, PatternPiece } from '../../../types/types';

function makeSquare(): PatternPiece {
  return {
    id: 'p1',
    name: 'Square',
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
}

const fakeEvent = (x: number, y: number) =>
  ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600,
        right: 800, bottom: 600, x: 0, y: 0,
        toJSON: () => ({}),
      }),
    },
  }) as unknown as React.MouseEvent<SVGSVGElement>;

function setup(options?: Record<string, unknown>) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  for (const [optionId, value] of Object.entries(options ?? {})) {
    store.dispatch(setToolOption({ toolId: 'notch', optionId, value }));
  }
  const onAddNotch = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useNotchTool(1, { x: 0, y: 0 }, [makeSquare()], onAddNotch),
    { wrapper },
  );
  act(() => { result.current.handleMouseDown(fakeEvent(30, 0)); });
  return onAddNotch;
}

describe('useNotchTool — notch options from toolOptions.notch (G6)', () => {
  it('defaults to DEFAULT_NOTCH_OPTIONS when no option is set', () => {
    const onAddNotch = setup();
    expect(onAddNotch).toHaveBeenCalledTimes(1);
    const line: InternalLine = onAddNotch.mock.calls[0][1];
    expect(line.notchOptions?.shape).toBe('slit');
    expect(line.notchOptions?.length).toBe(8);
  });

  it('honors toolOptions.notch.{shape,length,count} — canonical NotchOptions keys', () => {
    const onAddNotch = setup({ shape: 't-notch', length: 12, count: 2 });
    expect(onAddNotch).toHaveBeenCalledTimes(1);
    const line: InternalLine = onAddNotch.mock.calls[0][1];
    expect(line.notchOptions?.shape).toBe('t-notch');
    expect(line.notchOptions?.length).toBe(12);
    expect(line.notchOptions?.count).toBe(2);
    // Unset keys keep their defaults
    expect(line.notchOptions?.width).toBe(3);
  });
});
