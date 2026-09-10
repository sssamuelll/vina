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
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

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
function downOn(pieceId: string | null, x: number, y: number, selected = false) {
  return {
    button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    clientX: x, clientY: y,
    target: {
      closest: (_s: string) => (pieceId ? { getAttribute: () => pieceId } : null),
      ownerSVGElement: selected
        ? {
            querySelectorAll: () => [{
              getAttribute: () => pieceId,
            }],
          }
        : null,
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

describe('la bitácora ve el press y el release en la puerta', () => {
  it('registra down con target y up con drag pasado el umbral', () => {
    clearJournal();
    const { hook } = setup('select', [pieceP1()], makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() }));
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 50, 50)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(70, 50)); });
    act(() => { hook.result.current.handleMouseUp(moveTo(70, 50)); });
    const gestures = getJournal().events.filter((e) => e.kind === 'gesture');
    expect(gestures).toEqual([
      expect.objectContaining({ name: 'down', data: { tool: 'select', button: 0, x: 50, y: 50, target: 'piece', shift: false, ctrl: false, alt: false } }),
      expect.objectContaining({ name: 'up', data: expect.objectContaining({ tool: 'select', x: 70, y: 50, drag: true }) }),
    ]);
  });

  it('un clic sin movimiento deja drag false, y un up sin evento queda marcado como sintético', () => {
    clearJournal();
    const { hook } = setup('select', [pieceP1()], makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() }));
    act(() => { hook.result.current.handleMouseDown(downOn(null, 200, 200)); });
    act(() => { hook.result.current.handleMouseUp(moveTo(201, 200)); });
    act(() => { hook.result.current.handleMouseUp(); });
    const ups = getJournal().events.filter((e) => e.kind === 'gesture' && e.name === 'up');
    expect(ups[0].data).toMatchObject({ drag: false });
    expect(ups[1].data).toMatchObject({ tool: 'select', synthetic: true });
  });
});

describe('gate de phantom-move (EB-1/EB-2)', () => {
  it('no despacha movePiece en un clic con jitter sub-4px (SM_CXDRAG de Windows)', () => {
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(100, 101)); }); // 1px
    act(() => { hook.result.current.handleMouseUp(); });
    expect(projPos(store)).toEqual({ x: 0, y: 0 });
  });

  it('despacha movePiece pasado el umbral de 4px (SM_CXDRAG de Windows)', () => {
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

describe('entrada a edición de nodos en una pieza rotada', () => {
  it('abre el nodo que está bajo su glifo rotado visible', () => {
    const nodeEditor = idleNodeEditor();
    const tools = makeTools({ nodeEditor, transformTool: idleTransform() });
    const rotated = { ...pieceP1(), rotation: 90 } as PatternPiece;
    const { hook, store } = setup('select', [rotated], tools);
    act(() => { store.dispatch(selectPiece('p1')); });

    // Local (100,0) se dibuja en (100,100) al rotar 90° sobre el centro.
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100, true)); });

    expect(nodeEditor.enterEdit).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ commandIndex: 1, pointType: 'anchor' }),
    );
  });
});

/** "Editar patrón" en plena edición de p1. Su handleMouseDown consume TODO
 *  clic — punto, segmento o marquee sobre vacío — y ese `true` es justo lo que
 *  dejaba el modo trabado en una sola pieza. */
function editingP1() {
  return {
    isEditing: true,
    editingPieceId: 'p1',
    hoveredNode: null,
    hoveredSegment: null,
    enterEdit: vi.fn(),
    exitEdit: vi.fn(),
    handleMouseDown: vi.fn(() => true),
    handleMouseMove: vi.fn(() => false),
    handleMouseUp: vi.fn(),
    handleKeyDown: vi.fn(),
    handleDoubleClick: vi.fn(() => false),
    getCursor: vi.fn(() => 'default'),
  };
}

function pieceP2(): PatternPiece {
  return { ...pieceP1(), id: 'p2', name: 'P2', position: { x: 400, y: 0 } } as PatternPiece;
}

describe('cambiar de pieza sin salir de "Editar patrón" (nota de María #170)', () => {
  it('el clic en otra pieza pasa a editarla en vez de morir en el marquee', () => {
    const editPattern = editingP1();
    const { hook } = setup('editPattern', [pieceP1(), pieceP2()], makeTools({ editPattern }));
    act(() => { hook.result.current.handleMouseDown(downOn('p2', 450, 50)); });
    expect(editPattern.enterEdit).toHaveBeenCalledWith('p2');
    expect(editPattern.handleMouseDown).not.toHaveBeenCalled();
  });

  it('el clic sobre la pieza en edición sigue siendo de la herramienta', () => {
    const editPattern = editingP1();
    const { hook } = setup('editPattern', [pieceP1(), pieceP2()], makeTools({ editPattern }));
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 50, 50)); });
    expect(editPattern.handleMouseDown).toHaveBeenCalled();
    expect(editPattern.enterEdit).not.toHaveBeenCalled();
  });

  // Sin pieza bajo el cursor: lienzo vacío, y también los glifos de nodo, que
  // se dibujan en el overlay y no cuelgan de ningún [data-piece-id]. El
  // marquee y el arrastre de puntos quedan intactos.
  it('el clic fuera de toda pieza sigue siendo de la herramienta (marquee)', () => {
    const editPattern = editingP1();
    const { hook } = setup('editPattern', [pieceP1(), pieceP2()], makeTools({ editPattern }));
    act(() => { hook.result.current.handleMouseDown(downOn(null, 900, 900)); });
    expect(editPattern.handleMouseDown).toHaveBeenCalled();
    expect(editPattern.enterEdit).not.toHaveBeenCalled();
  });
});

describe('salida del lienzo en los modos de edición', () => {
  it('rutea la limpieza del hover previo de patrón y curva', () => {
    const editPattern = { ...editingP1(), limpiarHover: vi.fn() };
    const nodeEditor = { ...idleNodeEditor(), limpiarHover: vi.fn() };
    const { hook } = setup(
      'editPattern',
      [pieceP1()],
      makeTools({ editPattern, nodeEditor }),
    );

    act(() => { hook.result.current.handleMouseLeave(); });

    expect(editPattern.limpiarHover).toHaveBeenCalledOnce();
    expect(nodeEditor.limpiarHover).toHaveBeenCalledOnce();
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
