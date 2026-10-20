// @vitest-environment jsdom
/**
 * Propiedades de una pieza en dos niveles (spec 2026-10-02 § 6.1, P4). El
 * primero, a la vista y sin cabecera: nombre, margen, tela y espejada. El
 * segundo, plegado en «Producción»: código de tela, entretela, anotaciones,
 * reglas de colocación, capa y subcapa, simulación y material. Fuera los
 * preajustes de margen y «Ajustes de piquete». Captura 08 de la spec.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectPiece, selectSeam, clearSelection } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece, Seam } from '../../../types/types';

afterEach(cleanup);

function pieza(id: string, name: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  const now = Date.now();
  return {
    id, name,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 10, internals: [], createdAt: now, updatedAt: now, ...extra,
  } as PatternPiece;
}

const COSTURA = {
  id: 's1', type: 'standard', tension: 100, strength: 1, taped: false, tapeWidth: 10, active: true,
  pieceA: { pieceId: 'p1', edgeName: 'edge-1' }, pieceB: { pieceId: 'p2', edgeName: 'edge-3' },
} as Seam;

function panel(extraDeLaPrimera: Partial<PatternPiece> = {}) {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, simulation: simulationReducer, tools: toolReducer },
  });
  const d = store.dispatch as AppDispatch;
  d(addPiece(pieza('p1', 'Delantero', extraDeLaPrimera)));
  d(addPiece(pieza('p2', 'Espalda')));
  d(selectPiece('p1'));
  render(<Provider store={store}><PropertiesPanel /></Provider>);
  return { store, d };
}

const produccion = () => screen.getByRole('button', { name: 'Producción' });
const seccionDeProduccion = () => produccion().closest('.panel-section')!;

describe('Propiedades de una pieza, en dos niveles', () => {
  it('el primer nivel son nombre, margen, tela y espejada, en ese orden y sin cabecera', () => {
    panel();
    const fuera = Array.from(document.querySelectorAll('.properties-panel label'))
      .filter((l) => !seccionDeProduccion().contains(l))
      .map((l) => l.textContent);
    expect(fuera).toEqual(['Nombre', 'Margen (mm)', 'Tela', 'Espejada']);
    expect(document.querySelectorAll('.panel-section-header')).toHaveLength(1);
  });

  it('lo demás vive dentro de «Producción»: código de tela, entretela, anotaciones, reglas, capa, simulación y material', () => {
    panel();
    const s = seccionDeProduccion();
    for (const etiqueta of ['Código de tela', 'Entretela', 'Capa', 'Subcapa']) {
      expect(s.contains(screen.getByLabelText(etiqueta)), etiqueta).toBe(true);
    }
    for (const texto of ['Anotaciones', 'Reglas de colocación', 'Simulación', 'Solidificar', 'Presión (Pa)', 'Material', 'Preajuste de tela']) {
      expect(s.textContent, texto).toContain(texto);
    }
  });

  it('«Producción» arranca plegada y fuera del Tab, y se despliega con su botón', () => {
    panel();
    const cuerpo = document.getElementById(produccion().getAttribute('aria-controls')!)!;
    expect(produccion().getAttribute('aria-expanded')).toBe('false');
    expect(cuerpo.classList.contains('collapsed')).toBe(true);
    expect(cuerpo.hasAttribute('inert')).toBe(true);
    fireEvent.click(produccion());
    expect(produccion().getAttribute('aria-expanded')).toBe('true');
    expect(cuerpo.classList.contains('collapsed')).toBe(false);
    expect(cuerpo.hasAttribute('inert')).toBe(false);
  });

  it('desplegada, sigue desplegada al elegir otra pieza', () => {
    const { d } = panel();
    fireEvent.click(produccion());
    act(() => { d(selectPiece('p2')); });
    expect(screen.getByDisplayValue('Espalda')).toBeTruthy();
    expect(produccion().getAttribute('aria-expanded')).toBe('true');
  });

  it('se borran los preajustes de margen y «Ajustes de piquete»: escribían lo que ya tiene campo o línea al pie', () => {
    panel();
    expect(screen.queryByText('Preajustes de margen')).toBeNull();
    expect(screen.queryByText('Ajustes de piquete')).toBeNull();
    expect(document.getElementById('prop-notch-shape')).toBeNull();
  });

  it('«Eliminar pieza» va después de «Producción», y con una pieza elegida no sale la lista de costuras del proyecto', () => {
    const { d } = panel();
    act(() => { d(addSeam(COSTURA)); });
    const eliminar = screen.getByRole('button', { name: 'Eliminar pieza' });
    expect(produccion().compareDocumentPosition(eliminar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/^Costuras \(/)).toBeNull();
    act(() => { d(clearSelection()); });
    expect(screen.getByText('Costuras (1)')).toBeTruthy();
  });

  it('«Eliminar pieza» queda fuera de «Producción»: se ve con ella plegada', () => {
    panel();
    expect(seccionDeProduccion().contains(screen.getByRole('button', { name: 'Eliminar pieza' }))).toBe(false);
  });

  it('el primer nivel escribe en la pieza: Margen y Espejada', () => {
    const { store } = panel();
    const p1 = () => store.getState().project.pieces.find((p) => p.id === 'p1')!;
    fireEvent.change(screen.getByLabelText('Margen (mm)'), { target: { value: '12' } });
    expect(p1().seamAllowance).toBe(12);
    fireEvent.click(screen.getByLabelText('Espejada'));
    expect(p1().mirrored).toBe(true);
  });

  it('«Capa» escribe la capa, no la subcapa, y dice su nombre de taller: en Capas ya no va el número', () => {
    const { store } = panel({ layer: 2 });
    const fila = () => screen.getByLabelText('Capa').closest('.panel-field')!;
    expect(fila().textContent).toContain('Avíos');
    fireEvent.change(screen.getByLabelText('Capa'), { target: { value: '0' } });
    const p1 = store.getState().project.pieces.find((p) => p.id === 'p1')!;
    expect([p1.layer, p1.sublayer]).toEqual([0, 0]);
    expect(fila().textContent).toContain('Forro');
  });

  it('la edición vinculada se queda a la vista, en el primer nivel', () => {
    panel({ linkedPieceId: 'p2', linkMode: 'symmetry' });
    const vinculada = screen.getByText('Edición vinculada');
    expect(seccionDeProduccion().contains(vinculada)).toBe(false);
  });

  it('las cabeceras van en sentence case: «Costura: A ↔ B», y el CSS no las pasa a mayúsculas', () => {
    const { d } = panel();
    act(() => { d(addSeam(COSTURA)); d(selectSeam('s1')); });
    expect(screen.getByText('Costura: Delantero ↔ Espalda')).toBeTruthy();
    const css = readFileSync(join(process.cwd(), 'src/components/PropertiesPanel/PropertiesPanel.css'), 'utf8');
    for (const sel of ['panel-title', 'panel-subtitle', 'panel-section-header']) {
      const regla = css.match(new RegExp(`\\.${sel}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(regla, `${sel}: la regla no está`).not.toBe('');
      expect(regla, sel).not.toMatch(/text-transform:\s*uppercase/);
    }
  });
});
