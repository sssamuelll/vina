// @vitest-environment jsdom
/**
 * La cota del punto recién puesto descansa en reposo: no se lleva el foco del
 * lienzo (spec 2026-10-02 § 5.2, «escribible, que vive hasta el siguiente clic
 * o Esc»). Con el foco en su campo, la Q de la firma D3 de María («pongo un
 * punto y lo muevo con Editar patrón», `seis-firmas-maria.spec.ts`) se
 * escribía en la cota y la herramienta no cambiaba: lo cazó el gate del
 * deploy de P3b. La del piquete sí se abre sola: conserva lo que el modal
 * daba, y el modal ya se quedaba el foco.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import type { PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

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
  internals: [],
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
    id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [], createdAt: 0, updatedAt: 0,
  }));
  const view = render(<Provider store={store}><PatternEditor /></Provider>);
  act(() => {
    store.dispatch({ type: 'editor/setActiveTool', payload: 'point' });
    store.dispatch({ type: 'tools/setActiveTool2D', payload: 'point' });
  });
  return { store, view };
}

describe('PatternEditor — la cota del punto recién puesto', () => {
  it('descansa en reposo: el punto se pone, su cota se ve y el foco no se va del lienzo', () => {
    const { store, view } = montar();
    const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 0, button: 0 });
    fireEvent.mouseUp(svg, { clientX: 50, clientY: 0, button: 0 });

    expect(store.getState().project.pieces[0].outline).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Distancia: 50 mm de 100 mm' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Distancia' }), 'la cota del punto se llevó el foco').toBeNull();

    // Un clic la abre, como a toda cota.
    fireEvent.click(screen.getByRole('button', { name: 'Distancia: 50 mm de 100 mm' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Distancia' }));
  });
});
