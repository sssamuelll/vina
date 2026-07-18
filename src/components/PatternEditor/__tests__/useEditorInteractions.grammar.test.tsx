// @vitest-environment jsdom
/**
 * useEditorInteractions — gramática de clic-izquierdo v1 (nota 170 + fixes de
 * runtime). Cubre: gate de phantom-move, enrutado del transform box en select,
 * cursor honesto sobre handles y coordinación de Escape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { PatternPiece, Tool2D } from '../../../types/types';

// usado por los describes de las tareas 3-5; void mientras tanto (noUnusedLocals)
void selectPiece;

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

/** Nodo-editor inerte: isEditing=false para que el transform box no quede
 *  suprimido por el invariante G7. */
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

/** Transform tool inerte y mutable — los tests lo sobrescriben por caso. */
function idleTransform() {
  return {
    isDragging: false,
    handleMouseDown: vi.fn(() => false),
    handleMouseMove: vi.fn(() => false),
    handleMouseUp: vi.fn(),
    handleKeyDown: vi.fn(),
    getCursor: vi.fn(() => null),
  };
}

/** Cada tool es un saco de vi.fn()s salvo los overrides explícitos. */
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

function pieceP1(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], edges: [],
  } as unknown as PatternPiece;
}

function setup(tool: Tool2D, pieces: PatternPiece[], tools: Tools) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useEditorInteractions(tool, 1, { x: 0, y: 0 }, pieces, tools),
    { wrapper },
  );
  return { store, hook };
}

// zoom=1, pan=0, rect en origen → punto de pantalla === punto de patrón.
function downOn(pieceId: string | null, x: number, y: number) {
  return {
    button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    clientX: x, clientY: y,
    target: {
      closest: (_s: string) => (pieceId ? { getAttribute: () => pieceId } : null),
      ownerSVGElement: null,
    },
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}
function moveTo(x: number, y: number) {
  return {
    clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}
function projPos(store: ReturnType<typeof setup>['store']) {
  return (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].position;
}

describe('gate de phantom-move (EB-1/EB-2)', () => {
  it('no despacha movePiece en un clic con jitter sub-3px', () => {
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(100, 101)); }); // 1px
    act(() => { hook.result.current.handleMouseUp(); });
    expect(projPos(store)).toEqual({ x: 0, y: 0 });
  });

  it('despacha movePiece pasado el umbral de 3px', () => {
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(100, 110)); }); // 10px
    act(() => { hook.result.current.handleMouseUp(); });
    expect(projPos(store)).toEqual({ x: 0, y: 10 });
  });
});
