// @vitest-environment jsdom
/**
 * #1093, hallazgo HIGH 3 del review de codex: el router resetea la pluma, la
 * línea interna, Recorrer costura y Slash & Spread al cambiar de herramienta,
 * pero no Tijeras. Un corte a medias sobrevivía al cambio y el siguiente clic
 * al volver lo terminaba sobre lo que hubiera debajo.
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

/** Cada tool es un saco de vi.fn()s salvo los overrides explícitos (harness de la gramática). */
function makeTools(overrides: Record<string, unknown> = {}): Tools {
  const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  return new Proxy({}, {
    get(_t, tool: string) {
      if (tool in overrides) return overrides[tool];
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

describe('el router resetea Tijeras al cambiar de herramienta', () => {
  it('scissors → select llama scissorsTool.reset()', () => {
    const store = configureStore({
      reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const reset = vi.fn();
    const tools = makeTools({
      scissorsTool: { handleMouseDown: vi.fn(), handleMouseMove: vi.fn(), handleMouseUp: vi.fn(), handleKeyDown: vi.fn(), getCursor: vi.fn(() => 'default'), reset },
    });
    const hook = renderHook(
      ({ tool }: { tool: Tool2D }) => useEditorInteractions(tool, 1, { x: 0, y: 0 }, [], tools),
      { wrapper, initialProps: { tool: 'scissors' as Tool2D } },
    );
    const antes = reset.mock.calls.length;
    hook.rerender({ tool: 'select' as Tool2D });
    expect(reset.mock.calls.length).toBeGreaterThan(antes);
  });
});
