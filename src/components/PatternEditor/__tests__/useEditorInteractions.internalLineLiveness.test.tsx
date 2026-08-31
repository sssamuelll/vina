// @vitest-environment jsdom
/**
 * useEditorInteractions — revisión adversarial de la tanda 4 (codex, `codex
 * review --base main`): `hasSelectedInternalLine` leía solo si el par
 * pieza/línea estaba en Redux, no si esa línea SEGUÍA VIVA. Un undo que
 * borra la línea recién trazada deja `editor.selectedInternalLine` colgando
 * — la caja de transformación (y la barra flotante, mismo booleano) se
 * quedaba apagada hasta que la usuaria hacía clic de nuevo en la pieza, sin
 * ningún control disponible mientras tanto.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectInternalLine } from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { PatternPiece, PathCommand } from '../../../types/types';

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

/** Nodo-editor inerte: isEditing=false para que el transform box no quede
 *  suprimido por el invariante G7 (mismo patrón que useEditorInteractions.grammar.test.tsx). */
function idleNodeEditor() {
  return {
    isEditing: false,
    hoveredNode: null,
    enterEdit: vi.fn(),
    handleMouseDown: vi.fn(() => false),
    handleMouseMove: vi.fn(() => false),
    handleMouseUp: vi.fn(),
    handleKeyDown: vi.fn(),
  };
}

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

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];

function piezaConLinea(): PatternPiece {
  return {
    id: 'a', name: 'a', outline: rect(100, 100), position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, locked: false,
    internals: [{ id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }] }],
  } as PatternPiece;
}

function piezaSinLinea(): PatternPiece {
  return { ...piezaConLinea(), internals: [] };
}

function setup(pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  const tools = makeTools({ nodeEditor: idleNodeEditor() });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    ({ ps }: { ps: PatternPiece[] }) => useEditorInteractions('select', 1, { x: 0, y: 0 }, ps, tools),
    { wrapper, initialProps: { ps: pieces } },
  );
  act(() => { store.dispatch(selectInternalLine({ pieceId: 'a', lineId: 'l1' })); });
  return hook;
}

describe('hasSelectedInternalLine es consciente de la vida de la línea', () => {
  it('con la línea viva: la caja de transformación se suprime', () => {
    const hook = setup([piezaConLinea()]);
    expect(hook.result.current.showTransformBox).toBe(false);
  });

  it('colgante (undo borró la línea, el par sigue en Redux): la caja de transformación vuelve — no se queda sin ningún control', () => {
    const hook = setup([piezaSinLinea()]);
    expect(hook.result.current.showTransformBox).toBe(true);
  });
});
