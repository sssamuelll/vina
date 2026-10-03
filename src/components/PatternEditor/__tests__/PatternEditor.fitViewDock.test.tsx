// @vitest-environment jsdom
/**
 * Desde P2 de «la interfaz en papel» el margen de herramientas es una columna
 * al lado de la hoja, no encima (spec 2026-10-02 § 4.3): "ajustar a la vista"
 * encuadra en el svg entero, sin descontar ninguna faja. Hasta P2 el dock
 * flotaba y había que descontarle 62 px a mano. jsdom no calcula layout
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
import editorReducer, { requestFitView, computeFitView, toggleTrazos } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece, Trazo } from '../../../types/types';
import PatternEditor from '../PatternEditor';

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

describe('PatternEditor — ajustar a la vista encuadra en la hoja entera', () => {
  it('usa el ancho del svg y no desplaza el paneo: el margen ya no tapa la hoja', () => {
    stubResizeObserver();

    const { store } = setup();

    act(() => {
      store.dispatch(requestFitView());
    });

    const esperado = computeFitView([piece], VIEWPORT_WIDTH, VIEWPORT_HEIGHT)!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x, 5);
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
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    )!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });

  /**
   * El testigo se CONSUME aunque no haya nada que encuadrar (#1163, hallazgo de
   * la revisión adversarial del 14-09).
   *
   * El efecto tenía una sola compuerta para dos condiciones que no son la misma:
   * «el svg todavía no está medido» (hay que reintentar) y «no hay nada que
   * encuadrar» (no hay nada que reintentar). Salía por las dos sin tocar
   * `lastFitTokenRef`, así que un encuadre pedido sobre el lienzo vacío quedaba
   * ARMADO y saltaba solo minutos después, al aparecer la primera geometría.
   *
   * Con la entrada de menú muerta eso no se alcanzaba: los tres productores de
   * `requestFitView` —importar, restaurar, el copiloto— llegan con contenido ya
   * en el store. Arreglar #1163 le da a la usuaria dos productores nuevos (el
   * menú y ⌘0), pulsables sobre un proyecto recién abierto, que es justo el
   * estado vacío. Esta PR es la que lo vuelve alcanzable, así que es la que lo
   * cierra.
   */
  it('pedir encuadre con el lienzo vacío no deja un encuadre armado que salte al dibujar', () => {
    stubResizeObserver();

    const { store } = setup({ pieces: [], trazos: [] });

    act(() => {
      store.dispatch(requestFitView());
    });
    expect(store.getState().editor.zoom2D, 'sin nada que encuadrar no pasa nada').toBe(1);

    // Y ahora la usuaria dibuja. Esto NO es un encuadre que ella pidiera.
    act(() => {
      store.dispatch(restoreState({ ...store.getState().project, pieces: [piece], trazos: [] }));
    });

    expect(
      store.getState().editor.zoom2D,
      'el encuadre de un lienzo vacío se descarta ahí mismo; no se queda esperando geometría',
    ).toBe(1);
    expect(store.getState().editor.pan2D).toEqual({ x: 0, y: 0 });
  });

  /**
   * Con «Construcción» apagada, el encuadre no puede ir a por geometría que no
   * se pinta (#1164 § 0). Estaba aparcado con un ruling porque `showTrazos`
   * nace encendido y los tres productores eran de una sola vez; con ⌘0 pasa a
   * ser un teclazo repetible desde cualquier estado, así que se cierra aquí.
   */
  it('con «Construcción» apagada, un trazo suelto no se encuadra', () => {
    stubResizeObserver();

    const { store } = setup({ pieces: [], trazos: [trazo] });
    act(() => {
      store.dispatch(toggleTrazos());
    });
    expect(store.getState().editor.showTrazos, 'la capa tiene que quedar apagada').toBe(false);

    act(() => {
      store.dispatch(requestFitView());
    });

    expect(
      store.getState().editor.zoom2D,
      'encuadrar hacia algo invisible deja el lienzo mirando a la nada',
    ).toBe(1);
    expect(store.getState().editor.pan2D).toEqual({ x: 0, y: 0 });
  });
});
