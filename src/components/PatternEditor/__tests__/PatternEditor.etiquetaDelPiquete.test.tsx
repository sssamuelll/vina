// @vitest-environment jsdom
/**
 * El piquete elegido con Seleccionar, en el host real (spec 2026-10-02 § 5.2,
 * P3c, la puerta de vuelta): su distancia en reposo y una etiqueta con forma,
 * cantidad, profundidad y ancho. La prueba cruza la escalera del sujeto,
 * `aplicarCota`, la etiqueta y el store.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { selectInternalLine, setActiveTool } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';
import { reescribirPiquete } from '../etiquetas/piquete';

afterEach(cleanup);

const notch: InternalLine = {
  id: 'notch-42',
  type: 'notch',
  path: [{ type: 'M', values: [42, 0] }, { type: 'L', values: [42, 8] }],
  notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 42, metric: 2 },
};

const piece: PatternPiece = {
  id: 'piece-1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
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

function montar(pieza: PatternPiece = piece) {
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
    id: 'test', name: 'Test', pieces: [pieza], seams: [], fabrics: [], createdAt: 0, updatedAt: 0,
  }));
  const view = render(
    <Provider store={store}>
      <PatternEditor />
    </Provider>,
  );
  act(() => {
    store.dispatch(setActiveTool('select'));
    store.dispatch(selectInternalLine({ pieceId: 'piece-1', lineId: 'notch-42' }));
  });
  return { store, view };
}

const linea = (store: ReturnType<typeof montar>['store']) => store.getState().project.pieces[0].internals[0];

describe('PatternEditor — el piquete elegido trae su distancia y su etiqueta (P3c)', () => {
  it('la etiqueta dice forma y medidas, y su distancia descansa', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Piquete: Recta · 8 × 3 mm' })).toBeTruthy();
    // En reposo: una cota que se abre sola se lleva las teclas (P3b, firma D3).
    expect(screen.getByRole('button', { name: /^Distancia/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Distancia' })).toBeNull();
  });

  it('«En T» en su menú cambia la forma sin moverlo: el path sale del ancla', () => {
    const { store } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Piquete: Recta · 8 × 3 mm' }));
    fireEvent.click(screen.getByRole('button', { name: 'En T' }));
    const despues = linea(store);
    expect(despues.notchOptions?.shape).toBe('t-notch');
    expect(despues.notchAnchor?.distanceMm).toBeCloseTo(42, 6);
    expect(despues.path).toEqual(reescribirPiquete(piece, notch, { opciones: { shape: 't-notch' } })!.path);
    expect(screen.getByRole('button', { name: 'Piquete: En T · 8 × 3 mm' })).toBeTruthy();
  });

  it('la distancia se escribe por el ancla: clic en la cota, 60 y Enter', () => {
    const { store } = montar();
    fireEvent.click(screen.getByRole('button', { name: /^Distancia/ }));
    const campo = screen.getByRole('textbox', { name: 'Distancia' });
    fireEvent.change(campo, { target: { value: '60' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(linea(store).notchAnchor?.distanceMm).toBeCloseTo(60, 6);
    expect(linea(store).path[0].values[0]).toBeCloseTo(60, 6);
  });

  it('con la pieza bloqueada la etiqueta se ve apagada y no abre', () => {
    montar({ ...piece, locked: true });
    const etiqueta = screen.getByRole('button', { name: 'Piquete: Recta · 8 × 3 mm' });
    expect(etiqueta.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(etiqueta);
    expect(screen.queryByRole('group', { name: 'Opciones del piquete' })).toBeNull();
  });
});
