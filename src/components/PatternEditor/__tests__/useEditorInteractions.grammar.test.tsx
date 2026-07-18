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

describe('enrutado del transform box en select', () => {
  it('rutea el handle-hit a transformTool y no despacha selectPiece/movePiece', () => {
    const tj = { ...idleTransform(), handleMouseDown: vi.fn(() => true) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); }); // showTransformBox → true
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 5, 5)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(15, 15)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(tj.handleMouseDown).toHaveBeenCalled();
    expect(projPos(store)).toEqual({ x: 0, y: 0 }); // ningún movePiece se coló
  });

  it('rutea move y up cuando el transform drag está activo', () => {
    const tj = { ...idleTransform(), isDragging: true, handleMouseMove: vi.fn(() => true), handleMouseUp: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(20, 20)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(tj.handleMouseMove).toHaveBeenCalled();
    expect(tj.handleMouseUp).toHaveBeenCalled();
  });

  it('no rutea al transform box si la pieza está bloqueada (F8)', () => {
    const tj = { ...idleTransform(), handleMouseDown: vi.fn(() => true) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1(true)], tools); // locked
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 5, 5)); });
    expect(tj.handleMouseDown).not.toHaveBeenCalled();
  });
});

describe('cursor honesto sobre los handles (F15)', () => {
  it('muestra el cursor del handle al hacer hover en select con selección', () => {
    const tj = { ...idleTransform(), getCursor: vi.fn(() => 'nwse-resize') };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });
    expect(hook.result.current.getCursor()).toBe('nwse-resize');
  });

  it('devuelve default fuera de los handles', () => {
    const tj = { ...idleTransform(), getCursor: vi.fn(() => null) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });
    expect(hook.result.current.getCursor()).toBe('default');
  });
});

describe('coordinación de Escape (CF-1)', () => {
  it('Escape durante un transform drag lo cancela y consume el evento (un Esc = una acción)', () => {
    const tj = { ...idleTransform(), isDragging: true, handleKeyDown: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    void hook;
    act(() => { store.dispatch(selectPiece('p1')); });
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    document.removeEventListener('keydown', docSpy);
    expect(tj.handleKeyDown).toHaveBeenCalled();
    expect(docSpy).not.toHaveBeenCalled(); // clearSelection global bloqueado
  });

  it('Escape en idle no se consume: el deselect global sigue llegando', () => {
    const tj = { ...idleTransform(), isDragging: false, handleKeyDown: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    void hook;
    act(() => { store.dispatch(selectPiece('p1')); });
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    document.removeEventListener('keydown', docSpy);
    expect(tj.handleKeyDown).not.toHaveBeenCalled();
    expect(docSpy).toHaveBeenCalled();
  });
});
