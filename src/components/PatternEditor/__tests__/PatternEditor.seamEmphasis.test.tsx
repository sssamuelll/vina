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
import { act, cleanup, render } from '@testing-library/react';
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
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'pA', edgeName: 'edge-1' },
  pieceB: { pieceId: 'pB', edgeName: 'edge-1' },
  type: 'standard', tension: 100, strength: 1,
  active: true, taped: false, tapeWidth: 10,
};

function setupHost() {
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
    pieces: [square('pA', 0), square('pB', 300)], seams: [seam], fabrics: [],
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
});
