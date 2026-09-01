// @vitest-environment jsdom
/**
 * Tanda 1 de arreglos (#1029), punto 1: `SEWING_TOOL_IDS` tiene TRES
 * miembros (seam, seamEdit, walkSeam — PatternEditor.tsx:78), pero el
 * ternario de `emphasis` en línea 831 solo contemplaba dos
 * (`activeTool === 'seamEdit' ? 'full' : 'muted'`). Con `walkSeam` activo
 * (Shift+M, la herramienta que compara dos bordes cosidos) las costuras
 * caían al 45% de opacidad — ayer se pintaban a opacidad plena.
 *
 * El diseño solo manda atenuar en Coser (`seam`): fija las tres puertas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import toolReducer from '../../../store/toolSlice';
import simulationReducer from '../../../store/simulationSlice';
import constructionReducer from '../../../store/constructionSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import workflowReducer from '../../../store/workflowSlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { activate2DTool } from '../../../store/toolActivation';
import type { PatternPiece, Seam } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const square = (id: string, x: number): PatternPiece => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  edges: [
    { id: `${id}:edge-1`, name: 'edge-1', segmentRange: [1, 2], edgeType: 'seam' },
    { id: `${id}:edge-2`, name: 'edge-2', segmentRange: [2, 3], edgeType: 'seam' },
  ],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'pA', edgeName: 'edge-1' },
  pieceB: { pieceId: 'pB', edgeName: 'edge-1' },
  type: 'standard', tension: 100, strength: 1,
  active: true, taped: false, tapeWidth: 10,
};

function setupHost(projectSeams: Seam[] = [seam]) {
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
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test',
    pieces: [square('pA', 0), square('pB', 300)], seams: projectSeams, fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const view = render(
    <Provider store={store}>
      <PatternEditor />
    </Provider>,
  );
  return { store, view };
}

/** Opacidad del `<g class="seam-connection">` renderizado para la costura. */
function seamOpacity(view: ReturnType<typeof setupHost>['view']): string | null {
  return view.container.querySelector('.seam-connection')?.getAttribute('opacity') ?? null;
}

function moveOver(view: ReturnType<typeof setupHost>['view'], x: number, y: number) {
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg');
  if (!svg) throw new Error('PatternEditor no montó el lienzo SVG');
  fireEvent.mouseMove(svg, { clientX: x, clientY: y, buttons: 0 });
}

describe('PatternEditor — emphasis de costuras por herramienta (#1029 tanda 1 pt.1)', () => {
  it('con Coser (seam) activo, las costuras van atenuadas (0.45)', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'seam'); });
    expect(seamOpacity(view)).toBe('0.45');
  });

  it('con Editar costuras (seamEdit) activo, las costuras van a opacidad plena', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'seamEdit'); });
    expect(seamOpacity(view)).toBe('1');
  });

  it('con Recorrer costura (walkSeam) activo, las costuras van a opacidad plena — ayer se atenuaban por error', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'walkSeam'); });
    expect(seamOpacity(view)).toBe('1');
  });

  it('#1110 — con Coser, el hover enciende el par cosido sin apagar el selector de bordes', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'seam'); });

    moveOver(view, 50, 0);

    const connection = view.container.querySelector('.seam-connection');
    expect(connection?.classList.contains('seam-connection--selected')).toBe(true);
    expect(connection?.querySelectorAll('.seam-selection-glow')).toHaveLength(2);
    expect(view.container.querySelector('.edge-pair-overlay path')).not.toBeNull();
  });

  it('#1110 — al pasar de un borde cosido a uno libre se apaga el par, pero el selector sigue el borde libre', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'seam'); });

    moveOver(view, 50, 0);
    expect(view.container.querySelector('.seam-connection--selected')).not.toBeNull();

    moveOver(view, 100, 50);
    expect(view.container.querySelector('.seam-connection--selected')).toBeNull();
    expect(view.container.querySelector('.edge-pair-overlay path')).not.toBeNull();
  });

  it('#1110 — no revive un hover viejo al salir de Coser y volver sin mover el cursor', () => {
    const { store, view } = setupHost();
    act(() => { activate2DTool(store.dispatch, 'seam'); });
    moveOver(view, 50, 0);
    expect(view.container.querySelector('.seam-connection--selected')).not.toBeNull();

    act(() => { activate2DTool(store.dispatch, 'select'); });
    moveOver(view, 200, 200);
    act(() => { activate2DTool(store.dispatch, 'seam'); });

    expect(view.container.querySelector('.seam-connection--selected')).toBeNull();
  });

  it('#1110 — un borde compartido enciende todas sus costuras existentes', () => {
    const secondSeam: Seam = {
      ...seam,
      id: 's2',
      pieceB: { pieceId: 'pB', edgeName: 'edge-2' },
    };
    const { store, view } = setupHost([seam, secondSeam]);
    act(() => { activate2DTool(store.dispatch, 'seam'); });

    moveOver(view, 50, 0);

    expect(view.container.querySelectorAll('.seam-connection--selected')).toHaveLength(2);
    expect(view.container.querySelectorAll('.seam-selection-glow')).toHaveLength(4);
  });
});
