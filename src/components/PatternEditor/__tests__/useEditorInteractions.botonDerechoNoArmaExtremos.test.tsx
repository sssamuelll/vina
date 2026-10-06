// @vitest-environment jsdom
/**
 * useEditorInteractions — el botón derecho no arma un arrastre de extremo.
 *
 * Hallazgo de la revisión de la tarea 8 (#1158). `PatternEditor.handleMouseDown`
 * solo marca `mouseInteractionActiveRef` para los botones 0 y 1, y
 * `finishMouseInteraction` sale en seco si ese ref está en `false`: con el botón
 * derecho NUNCA se llama `handleMouseUp`, ni por el `onMouseUp` del SVG ni por el
 * `window.mouseup` global. Un gesto armado con el derecho no tiene quien lo suelte.
 *
 * La secuencia natural es «selecciono el tramo → clic derecho encima para el menú».
 * Sin la guarda, ese clic dejaba `trazoDragRef` armado: el `mousemove` de hover
 * —sin ningún botón apretado— despachaba `updateTrazo` en cada píxel, el trazo se
 * quedaba pegado al cursor, `isDraggingEndpoint` colgado en `true` (chips apagados)
 * y el lote de deshacer «Mover trazo» abierto con basura dentro.
 *
 * El extremo de línea interna tenía el mismo agujero, preexistente. Se cierran los
 * dos con la misma guarda, así que aquí van los dos — y cada uno con su control con
 * el botón izquierdo: sin ese control, un test que solo afirma «no pasó nada» pasa
 * en verde aunque el montaje esté roto y no pase nada por ninguna razón.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectTrazo, selectInternalLine } from '../../../store/editorSlice';
import projectReducer, { addTrazo, restoreState } from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { PatternPiece, PathCommand } from '../../../types/types';

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

/** Nodo-editor inerte (mismo patrón que useEditorInteractions.grammar.test.tsx). */
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

/** Transform tool inerte: su `isDragging` en el saco genérico es un vi.fn()
 *  —truthy— y `handleMouseMove` se lo tragaría todo antes de llegar al trazo. */
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

/** Pieza en el origen con una interna de (0,20) a (50,20). */
function pieza(): PatternPiece {
  return {
    id: 'a', name: 'a', outline: rect(100, 100), position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, locked: false,
    internals: [{ id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }] }],
  } as PatternPiece;
}

/** Trazo lejos de la pieza, para que el hit-test del trazo no compita con nada. */
const TRAZO_PATH: PathCommand[] = [{ type: 'M', values: [300, 300] }, { type: 'L', values: [400, 300] }];

// zoom=1, pan=0, rect en el origen → punto de pantalla === punto de patrón.
function downAt(x: number, y: number, button: number, pieceId: string | null = null) {
  return {
    button, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    clientX: x, clientY: y,
    target: {
      closest: (_s: string) => (pieceId ? { getAttribute: () => pieceId } : null),
      ownerSVGElement: null,
    },
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}
/** Lienzo de mentira para el `svgRef`: la goma de la marquesina mide contra el
 *  rect del SVG, y sin montar `PatternEditor` entero el ref es `null`. */
function conLienzo(hook: ReturnType<typeof setup>['hook']) {
  (hook.result.current.svgRef as React.MutableRefObject<SVGSVGElement | null>).current = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as SVGSVGElement;
}

function moveTo(x: number, y: number) {
  return {
    clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup() {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  const pieces = [pieza()];
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  store.dispatch(addTrazo({ id: 't1', path: TRAZO_PATH, createdAt: 0 }));
  const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useEditorInteractions('select', 1, { x: 0, y: 0 }, pieces, tools),
    { wrapper },
  );
  return { store, hook };
}

const trazoPath = (store: ReturnType<typeof setup>['store']) =>
  store.getState().project.trazos[0].path;
const internaPath = (store: ReturnType<typeof setup>['store']) =>
  store.getState().project.pieces[0].internals[0].path;

describe('la punta de un trazo seleccionado solo se arrastra con el botón izquierdo', () => {
  it('control — con el izquierdo SÍ se arrastra (si esto falla, el resto del archivo no prueba nada)', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(selectTrazo({ trazoId: 't1', segmentIndex: 1 })); });
    act(() => { hook.result.current.handleMouseDown(downAt(300, 300, 0)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(320, 340)); });

    expect(trazoPath(store)[0].values).toEqual([320, 340]);
    expect(hook.result.current.isDraggingEndpoint).toBe(true);
  });

  it('con el derecho no se arma: el hover posterior no mueve el trazo ni apaga los chips', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(selectTrazo({ trazoId: 't1', segmentIndex: 1 })); });
    act(() => { hook.result.current.handleMouseDown(downAt(300, 300, 2)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(320, 340)); });

    expect(trazoPath(store)[0].values).toEqual([300, 300]);
    expect(hook.result.current.isDraggingEndpoint).toBe(false);
  });
});

describe('el extremo de una interna seleccionada, igual — el hermano preexistente', () => {
  it('control — con el izquierdo SÍ se arrastra', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'a', lineId: 'l1' })); });
    act(() => { hook.result.current.handleMouseDown(downAt(0, 20, 0)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 35)); });

    expect(internaPath(store)[0].values).toEqual([10, 35]);
    expect(hook.result.current.isDraggingEndpoint).toBe(true);
  });

  it('con el derecho no se arma', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'a', lineId: 'l1' })); });
    act(() => { hook.result.current.handleMouseDown(downAt(0, 20, 2)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 35)); });

    expect(internaPath(store)[0].values).toEqual([0, 20]);
    expect(hook.result.current.isDraggingEndpoint).toBe(false);
  });
});

/**
 * Tercer hermano, el peor de los tres: el arrastre de pieza. Con el derecho
 * `dragRef` quedaba armado, el hover le iba poniendo `lastPos` y el mouseup del
 * SIGUIENTE clic izquierdo comiteaba `movePiece` a una posición que la usuaria
 * nunca arrastró. Aquí la guarda NO puede ir en toda la rama: el clic derecho
 * tiene que seguir seleccionando la pieza, porque el menú contextual necesita
 * sujeto — así que el caso afirma las dos mitades.
 *
 * El oráculo es `project.pieces[0].position` tras down/move/up, el mismo que usa
 * el gate de phantom-move de `useEditorInteractions.grammar.test.tsx`. El
 * `transform` del `<g>` no sirve aquí: sin montar `PatternEditor` entero,
 * `svgRef.current` es `null` y no hay grupo que consultar.
 */
describe('el arrastre de pieza: el derecho selecciona pero no arrastra', () => {
  const pos = (store: ReturnType<typeof setup>['store']) =>
    store.getState().project.pieces[0].position;

  it('control — con el izquierdo la pieza se mueve y se comitea', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown(downAt(50, 50, 0, 'a')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(50, 90)); });
    act(() => { hook.result.current.handleMouseUp(); });

    expect(pos(store)).toEqual({ x: 0, y: 40 });
  });

  it('con el derecho la pieza SÍ se selecciona (el menú necesita sujeto) pero NO se mueve', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown(downAt(50, 50, 2, 'a')); });

    expect(store.getState().editor.selectedPieceIds).toContain('a');

    act(() => { hook.result.current.handleMouseMove(moveTo(50, 90)); });
    act(() => { hook.result.current.handleMouseUp(); });

    expect(pos(store)).toEqual({ x: 0, y: 0 });
  });
});

/**
 * Cuarto hermano, preexistente: la marquesina del vacío. Tras un clic derecho en
 * el lienzo vacío `handleMouseUp` nunca corre, así que la goma quedaba armada,
 * el `mousemove` de hover la pintaba siguiendo al cursor, y el siguiente release
 * IZQUIERDO despachaba `selectAllPieces(hitIds)` sobre un rectángulo que nadie
 * arrastró — selección fantasma.
 *
 * El `clearSelection()` de esa rama se queda: el clic derecho en el vacío sigue
 * soltando lo que hubiera. Lo que no se arma es la goma.
 */
describe('la marquesina del vacío solo se arma con el botón izquierdo', () => {
  const seleccion = (store: ReturnType<typeof setup>['store']) =>
    store.getState().editor.selectedPieceIds;

  it('control — con el izquierdo la goma se pinta y el release selecciona lo que cubre', () => {
    const { store, hook } = setup();
    conLienzo(hook);
    act(() => { hook.result.current.handleMouseDown(downAt(200, 200, 0)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });

    expect(hook.result.current.selectMarquee).not.toBeNull();

    act(() => { hook.result.current.handleMouseUp(); });

    expect(seleccion(store)).toContain('a');
  });

  it('con el derecho no se arma: ni goma en pantalla ni selección en el release siguiente', () => {
    const { store, hook } = setup();
    conLienzo(hook);
    act(() => { hook.result.current.handleMouseDown(downAt(200, 200, 2)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });

    expect(hook.result.current.selectMarquee, 'la goma se pintó sola siguiendo al cursor').toBeNull();

    act(() => { hook.result.current.handleMouseUp(); });

    expect(seleccion(store), 'selección fantasma: nadie arrastró ese rectángulo').toEqual([]);
  });
});

/**
 * Las puntas de un piquete seleccionado no se arman, ni con el izquierdo (P3b).
 * El arrastre escribía el `path` sin el ancla: el siguiente cambio del contorno
 * devolvía el piquete a su sitio. La misma lista que Q (`esInternaEditable`).
 * El control es el de arriba: el extremo de una línea de referencia sí se arma.
 */
describe('las puntas de un piquete seleccionado no se arrastran', () => {
  it('ni con el izquierdo: el path queda igual y no hay arrastre de extremo', () => {
    const store = configureStore({
      reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
    });
    const pieces = [{
      ...pieza(),
      internals: [{
        id: 'n1', type: 'notch' as const,
        path: [{ type: 'M' as const, values: [40, 0] }, { type: 'L' as const, values: [40, 8] }],
        notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw' as const, distanceMm: 40, metric: 2 as const },
      }],
    }];
    store.dispatch(restoreState({ ...store.getState().project, pieces }));
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = renderHook(
      () => useEditorInteractions('select', 1, { x: 0, y: 0 }, pieces, tools),
      { wrapper },
    );
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'a', lineId: 'n1' })); });
    act(() => { hook.result.current.handleMouseDown(downAt(40, 8, 0)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(60, 30)); });

    expect(internaPath(store)).toEqual(pieces[0].internals[0].path);
    expect(hook.result.current.isDraggingEndpoint).toBe(false);
  });
});
