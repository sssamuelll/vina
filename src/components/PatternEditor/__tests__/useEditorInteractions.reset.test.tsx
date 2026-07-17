// @vitest-environment jsdom
/**
 * useEditorInteractions — reset-on-tool-switch wiring. Nota de María #168:
 * an abandoned pen stroke reappeared "already placed" on re-activation. The
 * fix is the pair of effects that call pen.reset()/polyPenTool.reset() when
 * the active tool changes away; this pins that wiring.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { Tool2D } from '../../../types/types';

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

/** Every tool is a bag of stable vi.fn()s, created on first access. */
function makeTools(): Tools {
  const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  return new Proxy({}, {
    get(_t, tool: string) {
      cache[tool] ??= {};
      return new Proxy(cache[tool], {
        get(bag, method: string) {
          bag[method] ??= vi.fn();
          return bag[method];
        },
      });
    },
  }) as unknown as Tools;
}

function setup(initialTool: Tool2D) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  const tools = makeTools();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    ({ tool }: { tool: Tool2D }) => useEditorInteractions(tool, 1, { x: 0, y: 0 }, [], tools),
    { wrapper, initialProps: { tool: initialTool } },
  );
  return { hook, tools };
}

describe('reset-on-tool-switch wiring', () => {
  it('resets the pen when switching away from it', () => {
    const { hook, tools } = setup('pen');
    (tools.pen.reset as ReturnType<typeof vi.fn>).mockClear();
    hook.rerender({ tool: 'select' });
    expect(tools.pen.reset).toHaveBeenCalled();
  });

  it('does not reset the pen while it stays active', () => {
    const { hook, tools } = setup('pen');
    (tools.pen.reset as ReturnType<typeof vi.fn>).mockClear();
    hook.rerender({ tool: 'pen' });
    expect(tools.pen.reset).not.toHaveBeenCalled();
  });

  it('resets polyPen when switching away from it', () => {
    const { hook, tools } = setup('polyPen');
    (tools.polyPenTool.reset as ReturnType<typeof vi.fn>).mockClear();
    hook.rerender({ tool: 'select' });
    expect(tools.polyPenTool.reset).toHaveBeenCalled();
  });
});
