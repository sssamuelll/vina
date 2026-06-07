// @vitest-environment jsdom
/**
 * useSeamAllowanceTool — the width-apply half of the seamAllowance tool
 * (María, hallazgo #2: explicit apply-SA command). Click a piece → apply
 * editor.defaultSeamAllowanceWidth as the per-piece scalar. The corner-type
 * half (right-click → CornerTypeMenu) was already wired in PatternEditor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setDefaultSAWidth } from '../../../store/editorSlice';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';

afterEach(cleanup);

function makeStore() {
  return configureStore({ reducer: { editor: editorReducer } });
}

function setup() {
  const store = makeStore();
  const onApply = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useSeamAllowanceTool(onApply), { wrapper });
  return { store, onApply, hook };
}

/** Build a real SVG fragment so `target.closest('[data-piece-id]')` works. */
function pieceTarget(pieceId?: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (pieceId) g.setAttribute('data-piece-id', pieceId);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  g.appendChild(rect);
  svg.appendChild(g);
  document.body.appendChild(svg);
  return rect as unknown as SVGElement;
}

function mouseEvent(target: SVGElement, button = 0) {
  return { button, target } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('useSeamAllowanceTool', () => {
  it('clicking a piece applies the default SA width (10mm)', () => {
    const { onApply, hook } = setup();
    act(() => {
      hook.result.current.handleMouseDown(mouseEvent(pieceTarget('piece-1')));
    });
    expect(onApply).toHaveBeenCalledWith('piece-1', 10);
  });

  it('applies the current editor.defaultSeamAllowanceWidth, not a frozen value', () => {
    const { store, onApply, hook } = setup();
    act(() => {
      store.dispatch(setDefaultSAWidth(25));
    });
    act(() => {
      hook.result.current.handleMouseDown(mouseEvent(pieceTarget('piece-1')));
    });
    expect(onApply).toHaveBeenCalledWith('piece-1', 25);
  });

  it('clicking empty canvas does nothing', () => {
    const { onApply, hook } = setup();
    act(() => {
      hook.result.current.handleMouseDown(mouseEvent(pieceTarget(undefined)));
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('ignores non-left buttons', () => {
    const { onApply, hook } = setup();
    act(() => {
      hook.result.current.handleMouseDown(mouseEvent(pieceTarget('piece-1'), 2));
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('exposes the effective width for the HintText', () => {
    const { store, hook } = setup();
    expect(hook.result.current.widthMm).toBe(10);
    act(() => {
      store.dispatch(setDefaultSAWidth(15));
    });
    expect(hook.result.current.widthMm).toBe(15);
  });
});
