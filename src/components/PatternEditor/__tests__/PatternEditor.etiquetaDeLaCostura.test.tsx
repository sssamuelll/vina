// @vitest-environment jsdom
/**
 * La costura elegida trae su etiqueta con el tipo (spec 2026-10-02 § 5.2,
 * P3c). Su puerta de vuelta es Editar costuras, no Seleccionar: la firma de
 * María #210 pide que con Seleccionar no se pinte ninguna costura.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { selectSeam, setActiveTool } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece, Seam, Tool2D } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

const pieza = (id: string, x: number): PatternPiece => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
  edges: [
    { id: `${id}:right`, name: 'right', segmentRange: [2, 3], edgeType: 'seam', length: 100 },
    { id: `${id}:left`, name: 'left', segmentRange: [4, 5], edgeType: 'seam', length: 100 },
  ],
  internals: [], position: { x, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, active: true, createdAt: 0, updatedAt: 0,
});

const costura = {
  id: 's1', type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0,
  pieceA: { pieceId: 'a', edgeName: 'right' }, pieceB: { pieceId: 'b', edgeName: 'left' },
} as Seam;

function montar(herramienta: Tool2D) {
  const store = configureStore({
    reducer: {
      project: projectReducer, editor: editorReducer, tools: toolReducer, simulation: simulationReducer,
      construction: constructionReducer, inputScheme: inputSchemeReducer, workflow: workflowReducer,
    },
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(loadProject({
    ...store.getState().project,
    id: 'test', name: 'Test', pieces: [pieza('a', 0), pieza('b', 200)], seams: [costura], fabrics: [], createdAt: 0, updatedAt: 0,
  }));
  render(<Provider store={store}><PatternEditor /></Provider>);
  act(() => {
    store.dispatch(setActiveTool(herramienta));
    store.dispatch(selectSeam('s1'));
  });
  return store;
}

describe('PatternEditor — la costura elegida trae su etiqueta (P3c)', () => {
  it('con Editar costuras: «Tipo de costura: Normal»; «Francesa» la cambia, y solo a ella', () => {
    const store = montar('seamEdit');
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de costura: Normal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Francesa' }));
    expect(store.getState().project.seams[0].type).toBe('french');
    expect(screen.getByRole('button', { name: 'Tipo de costura: Francesa' })).toBeTruthy();
    // Lo escrito en la etiqueta vale para esa costura: no cambia ninguna opción de herramienta.
    expect(store.getState().tools.toolOptions.seam?.seamType).toBeUndefined();
  });

  it('con Seleccionar no, aunque la costura siga elegida: solo con las herramientas de costura (#210)', () => {
    montar('select');
    expect(screen.queryByRole('button', { name: /^Tipo de costura/ })).toBeNull();
  });

  it('con la Pluma, no', () => {
    montar('pen');
    expect(screen.queryByRole('button', { name: /^Tipo de costura/ })).toBeNull();
  });
});
