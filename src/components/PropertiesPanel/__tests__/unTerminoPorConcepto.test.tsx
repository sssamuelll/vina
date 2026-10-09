/**
 * @vitest-environment jsdom
 *
 * Un término por concepto (contrato de interfaz § 5): Propiedades nombra las
 * formas del piquete, los tipos de costura y los de esquina igual que la línea
 * al pie y la etiqueta de opción (P3c). Antes decía «Recto», «V interna»,
 * «Castillo», «Estándar» y «Sobrecargada» donde el pie decía otra cosa.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';
import { FORMAS_DE_PIQUETE } from '../../../tools/definitions/notch';

afterEach(cleanup);

function pieza(): PatternPiece {
  return {
    id: 'p1', name: 'Delantero',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: true,
  } as unknown as PatternPiece;
}

function panel() {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, simulation: simulationReducer, tools: toolReducer },
  });
  (store.dispatch as AppDispatch)(addPiece(pieza()));
  (store.dispatch as AppDispatch)(selectPiece('p1'));
  render(<Provider store={store}><PropertiesPanel /></Provider>);
  return store;
}

const opciones = (id: string) => {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  expect(select, `#${id}`).not.toBeNull();
  return Array.from(select!.options).map((o) => [o.value, o.textContent]);
};

describe('Propiedades nombra como la línea al pie', () => {
  it('las formas del piquete', () => {
    panel();
    expect(opciones('prop-notch-shape')).toEqual(FORMAS_DE_PIQUETE.map((c) => [c.value, c.label]));
  });
});
