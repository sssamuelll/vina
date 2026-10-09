/**
 * @vitest-environment jsdom
 *
 * Un término por concepto (contrato de interfaz § 5): Propiedades nombra las
 * formas del piquete, los tipos de costura y los de esquina igual que la línea
 * al pie y la etiqueta de opción (P3c). Antes decía «Recto», «V interna»,
 * «Castillo», «Estándar» y «Sobrecargada» donde el pie decía otra cosa.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectPiece, selectSeam } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece, Seam } from '../../../types/types';
import { FORMAS_DE_PIQUETE } from '../../../tools/definitions/notch';
import { TIPOS_DE_COSTURA } from '../../../utils/seam/tiposDeCostura';

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

  it('los preajustes de margen llevan el nombre del tipo de costura con que se le llama en el pie', () => {
    // Revisión final de P3c (lente A): «Estándar» y «Sobrecargada» seguían aquí.
    panel();
    const fila = Array.from(document.querySelectorAll('.panel-field'))
      .find((f) => f.textContent?.includes('Preajustes de margen'))!;
    const nombres = Array.from(fila.querySelectorAll('button')).map((b) => b.textContent);
    const delPie = TIPOS_DE_COSTURA.map((t) => t.label);
    expect(nombres.filter((n) => !delPie.includes(n ?? ''))).toEqual([]);
  });

  it('los tipos de costura, en su desplegable y en la insignia de la lista', () => {
    const store = panel();
    const costura: Seam = {
      id: 's1', type: 'flat-felled', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0,
      pieceA: { pieceId: 'p1', edgeName: 'edge-1' }, pieceB: { pieceId: 'p1', edgeName: 'edge-3' },
    } as Seam;
    act(() => { (store.dispatch as AppDispatch)(addSeam(costura)); });
    // La lista de costuras: la insignia ya no dice «sobrecargada».
    expect(document.querySelector('.seam-type')?.textContent).toBe('flat-felled');
    act(() => { (store.dispatch as AppDispatch)(selectSeam('s1')); });
    const tipo = Array.from(document.querySelectorAll('select'))
      .find((s) => Array.from(s.options).some((o) => o.value === 'flat-felled'))!;
    expect(Array.from(tipo.options).map((o) => [o.value, o.textContent]))
      .toEqual(TIPOS_DE_COSTURA.map((t) => [t.value, t.label]));
  });
});
