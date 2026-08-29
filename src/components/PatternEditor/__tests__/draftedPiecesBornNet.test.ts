// @vitest-environment jsdom
/**
 * Hallazgo #2 (María) — pieces are born NET.
 *
 * Patternmakers draft without seam allowance: SA is an explicit finishing
 * step (width + corner geometry per piece), never an automatic birth value.
 * The drawing tools used to hardcode `seamAllowance: 10` at creation, so
 * every pen/rect/polyPen piece appeared with a margin nobody asked for.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import { useRectangleTool } from '../useRectangleTool';
import { draftedPieceDefaults } from '../../../utils/defaults';

// El rectángulo lee Ancho/Alto de `toolOptions` (spec 2026-08-29 § 6): el
// hook vive dentro de un Provider.
const store = configureStore({ reducer: { tools: toolReducer } });
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(Provider, { store, children });

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

describe('drafted pieces are born NET (hallazgo #2)', () => {
  it('draftedPieceDefaults carries zero seam allowance', () => {
    expect(draftedPieceDefaults().seamAllowance).toBe(0);
  });

  it('rectangle tool completes a piece with zero seam allowance', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useRectangleTool(1, { x: 0, y: 0 }, onComplete),
      { wrapper },
    );

    act(() => { result.current.handleMouseDown(fakeEvent(10, 10)); });
    act(() => { result.current.handleMouseMove(fakeEvent(110, 90)); });
    act(() => { result.current.handleMouseUp(); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const piece = onComplete.mock.calls[0][0];
    expect(piece.outline.length).toBeGreaterThan(0);
    expect(piece.seamAllowance).toBe(0);
  });
});
