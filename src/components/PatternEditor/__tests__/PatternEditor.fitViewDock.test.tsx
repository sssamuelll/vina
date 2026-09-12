// @vitest-environment jsdom
/**
 * El dock 2D flota (`position: absolute`, § 2.1 de la spec) y no reserva
 * espacio real, así que "ajustar a la vista" tiene que descontar su faja a
 * mano — ver task-10-brief-corregido.md. jsdom no calcula layout
 * (`getBoundingClientRect` da 0 siempre y no existe `ResizeObserver`), así
 * que este test mockea las dos cosas que `handleZoomToFit` mide y afirma
 * el resultado EN EL STORE, no una llamada espiada (espiar el binding
 * importado por nombre no intercepta nada — brief, § "por qué el test del
 * plan no puede correr").
 */
import { cleanup, render, act } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { requestFitView, computeFitView } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece, Trazo } from '../../../types/types';
import PatternEditor, { DOCK_WIDTH_PX } from '../PatternEditor';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Pieza ancha y baja: con padding=1.2 el ANCHO manda sobre el alto para el
// viewport de abajo (1000/(800*1.2)=1.04 < 800/(100*1.2)=6.67), así que el
// test discrimina el arreglo — con la pieza equivocada pasaría igual con y
// sin el fix.
const piece: PatternPiece = {
  id: 'p',
  name: 'Ancha',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [800, 0] },
    { type: 'L', values: [800, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  edges: [],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

/** Trazo con el MISMO bbox que la pieza: el ancho sigue mandando, así que el
 *  encuadre esperado se calcula con la misma fórmula y el test discrimina. */
const trazo: Trazo = {
  id: 't',
  path: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [800, 0] },
    { type: 'L', values: [800, 100] },
  ],
  createdAt: 0,
};

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;
// DOCK_WIDTH_PX viene de PatternEditor.tsx — no se repite el literal acá.

/** El doble de ResizeObserver: jsdom no lo tiene y sin él `svgSize` queda en 0,
 *  que es la otra compuerta del efecto de encuadre. */
function stubResizeObserver() {
  class ResizeObserverDouble {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe() {
      this.cb(
        [{ contentRect: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
}

function setup(contenido: { pieces?: PatternPiece[]; trazos?: Trazo[] } = {}) {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      tools: toolReducer,
      simulation: simulationReducer,
      construction: constructionReducer,
      inputScheme: inputSchemeReducer,
      workflow: workflowReducer,
    },
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(restoreState({
    ...store.getState().project,
    pieces: contenido.pieces ?? [piece],
    trazos: contenido.trazos ?? [],
  }));
  const onOpenPanel = vi.fn();
  const view = render(
    <Provider store={store}>
      <PatternEditor onOpenPanel={onOpenPanel} />
    </Provider>,
  );
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  svg.getBoundingClientRect = () => ({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    top: 0,
    left: 0,
    right: VIEWPORT_WIDTH,
    bottom: VIEWPORT_HEIGHT,
    x: 0,
    y: 0,
    toJSON() { return {}; },
  });
  return { store, svg };
}

describe('PatternEditor — ajustar a la vista respeta la faja del dock', () => {
  it('descuenta el dock del ancho Y desplaza el paneo por lo mismo', () => {
    stubResizeObserver();

    const { store } = setup();

    act(() => {
      store.dispatch(requestFitView());
    });

    const esperado = computeFitView([piece], VIEWPORT_WIDTH - DOCK_WIDTH_PX, VIEWPORT_HEIGHT)!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x + DOCK_WIDTH_PX, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });

  /**
   * Un proyecto de SOLO trazos también se encuadra (#1158, I1). La tarea 9
   * arregló la compuerta de hidratación y `initProjectPersistence` despacha
   * `requestFitView()` justo después; con cero piezas ese encuadre era un no-op
   * silencioso —el aviso decía «Restauré tu proyecto: 3 trazos» y el lienzo se
   * quedaba en `zoom 1, pan 0,0`— y el mismo no-op apagaba Ver ▸ Ajustar zoom
   * al patrón. El oráculo es el store, igual que arriba.
   */
  it('con cero piezas y un trazo también encuadra (no se queda en zoom 1, pan 0,0)', () => {
    stubResizeObserver();

    const { store } = setup({ pieces: [], trazos: [trazo] });

    act(() => {
      store.dispatch(requestFitView());
    });

    // El trazo va en coordenadas de patrón: su `path` ES el contorno, sin posición.
    const esperado = computeFitView(
      [{ position: { x: 0, y: 0 }, outline: trazo.path }],
      VIEWPORT_WIDTH - DOCK_WIDTH_PX,
      VIEWPORT_HEIGHT,
    )!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x + DOCK_WIDTH_PX, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });
});
