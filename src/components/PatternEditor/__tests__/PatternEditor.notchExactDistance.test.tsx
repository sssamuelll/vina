// @vitest-environment jsdom
/**
 * La prueba cruza el hit-test, la curación y el host real: una fila correcta
 * que no llegue a `useNotchTool` seguiría dejando la cota del piquete fuera de
 * alcance (spec 2026-10-02 § 5.2, P3b).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

const notch: InternalLine = {
  id: 'notch-42',
  type: 'notch',
  path: [
    { type: 'M', values: [42, 0] },
    { type: 'L', values: [42, 8] },
  ],
  notchAnchor: {
    refPoint: { x: 0, y: 0 },
    direction: 'cw',
    distanceMm: 42,
    metric: 2,
  },
};

const piece: PatternPiece = {
  id: 'piece-1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [notch],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

function montar() {
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
  store.dispatch(loadProject({
    ...store.getState().project,
    id: 'test',
    name: 'Test',
    pieces: [piece],
    seams: [],
    fabrics: [],
    createdAt: 0,
    updatedAt: 0,
  }));
  const view = render(
    <Provider store={store}>
      <PatternEditor />
    </Provider>,
  );
  return { store, view };
}

describe('PatternEditor — distancia exacta de un piquete existente', () => {
  it('«Ajustar distancia…» abre la cota del piquete, lista para teclear; Enter lo mueve y la cierra', () => {
    const { store, view } = montar();
    const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
    fireEvent.contextMenu(svg, { clientX: 42, clientY: 4 });
    fireEvent.click(screen.getByRole('button', { name: /Ajustar distancia/ }));

    const distancia = screen.getByRole('textbox', { name: 'Distancia' }) as HTMLInputElement;
    expect(distancia.value).toBe('42');
    expect(document.activeElement).toBe(distancia);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.container.querySelector('.notch-refine-marker')).not.toBeNull();

    // Enter con otra distancia mueve el piquete y cierra la cota.
    fireEvent.change(distancia, { target: { value: '60' } });
    fireEvent.keyDown(distancia, { key: 'Enter' });
    const linea = store.getState().project.pieces[0].internals[0];
    expect(linea.notchAnchor?.distanceMm).toBeCloseTo(60, 6);
    expect(linea.path[0].values[0]).toBeCloseTo(60, 6);
    expect(screen.queryByRole('textbox', { name: 'Distancia' })).toBeNull();
    expect(view.container.querySelector('.notch-refine-marker')).toBeNull();
  });
});
