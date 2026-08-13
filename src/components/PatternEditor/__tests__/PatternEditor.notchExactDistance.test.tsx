// @vitest-environment jsdom
/**
 * La prueba cruza el hit-test, la curación y el host real: una fila correcta
 * que no llegue a `useNotchTool` seguiría dejando el modal inaccesible.
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

describe('PatternEditor — distancia exacta de un piquete existente', () => {
  it('abre el modal del piquete alcanzado por clic derecho', () => {
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
    const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;

    fireEvent.contextMenu(svg, { clientX: 42, clientY: 4 });
    fireEvent.click(screen.getByRole('button', { name: /Ajustar distancia/ }));

    expect(screen.getByRole('dialog', { name: /Colocación de piquete/ })).toBeTruthy();
    const distanceInput = screen.getByLabelText('Distancia desde la esquina (mm):') as HTMLInputElement;
    expect(distanceInput.value).toBe('42.0');
    expect(view.container.querySelector('.notch-refine-marker')).not.toBeNull();
  });
});
