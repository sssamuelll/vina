// @vitest-environment jsdom
/**
 * La prueba cruza hit-test, curación y selección real. Ver la fila en un
 * ContextMenu aislado no demostraría que el borde alcanzado llega al panel.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer, { setActiveTool2D } from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

const piece: PatternPiece = {
  id: 'p',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 100 },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

function setup() {
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
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece] }));
  store.dispatch(setActiveTool('seamAllowance'));
  store.dispatch(setActiveTool2D('seamAllowance'));
  const onOpenPanel = vi.fn();
  const view = render(
    <Provider store={store}>
      <PatternEditor onOpenPanel={onOpenPanel} />
    </Provider>,
  );
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  return { store, view, svg, onOpenPanel };
}

describe('PatternEditor — ancho exacto del margen', () => {
  it('el clic derecho sobre el borde abre su ancho en Propiedades', () => {
    const { store, svg, onOpenPanel } = setup();

    fireEvent.contextMenu(svg, { clientX: 50, clientY: 2 });
    fireEvent.click(screen.getByRole('button', { name: /Ancho exacto/ }));

    expect(store.getState().editor.saSelection).toEqual({
      kind: 'edge',
      items: [{ pieceId: 'p', edgeId: 'p:top' }],
    });
    expect(onOpenPanel).toHaveBeenCalledWith('Properties');
  });

  it('el clic derecho durante el arrastre cancela y no abre el menú', () => {
    const { store, view, svg } = setup();
    fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: 20, clientY: 2 });

    fireEvent.contextMenu(svg, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(svg, { button: 0, buttons: 0, clientX: 80, clientY: 2 });

    expect(view.container.querySelector('.context-menu')).toBeNull();
    expect(store.getState().editor.saSelection).toBeNull();
    expect(store.getState().project.pieces[0].edges?.[0].seamAllowanceSpans).toBeUndefined();
  });
});
