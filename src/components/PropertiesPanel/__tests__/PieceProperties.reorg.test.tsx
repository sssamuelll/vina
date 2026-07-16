/**
 * @vitest-environment jsdom
 *
 * Reorg de Propiedades (Fase 3 del plan 2026-07-16): las propiedades de
 * patronaje (PIEZA) se separan de los parámetros del solver (SIMULACIÓN,
 * colapsada por defecto — progressive disclosure), y la acción destructiva
 * vive al FINAL del panel, no en mitad del formulario.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function makePiece(): PatternPiece {
  const now = Date.now();
  return {
    id: 'p1', name: 'Delantero',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 0] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, internals: [], createdAt: now, updatedAt: now, active: true,
  } as unknown as PatternPiece;
}

function renderPanel() {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, simulation: simulationReducer, tools: toolReducer },
  });
  (store.dispatch as AppDispatch)(addPiece(makePiece()));
  (store.dispatch as AppDispatch)(selectPiece('p1'));
  const utils = render(<Provider store={store}><PropertiesPanel /></Provider>);
  return { store, ...utils };
}

describe('PieceProperties — patronaje vs simulación (Fase 3)', () => {
  it('los parámetros del solver viven en su propia sección SIMULACIÓN', () => {
    const { container } = renderPanel();
    expect(screen.getByText('SIMULACIÓN')).toBeTruthy();
    // Solidificar/Presión cuelgan del body de SIMULACIÓN, no de PIEZA.
    const simSection = screen.getByText('SIMULACIÓN').closest('.panel-section')!;
    expect(simSection.textContent).toContain('Solidificar');
    expect(simSection.textContent).toContain('Presión');
    const pieceSection = screen.getByText('PIEZA').closest('.panel-section')!;
    expect(pieceSection.textContent).not.toContain('Solidificar');
    void container;
  });

  it('SIMULACIÓN arranca colapsada (progressive disclosure)', () => {
    renderPanel();
    const simSection = screen.getByText('SIMULACIÓN').closest('.panel-section')!;
    expect(simSection.querySelector('.panel-section-body.collapsed')).toBeTruthy();
    const pieceSection = screen.getByText('PIEZA').closest('.panel-section')!;
    expect(pieceSection.querySelector('.panel-section-body.collapsed')).toBeNull();
  });

  it('Eliminar pieza es lo último del panel, fuera del formulario', () => {
    const { container } = renderPanel();
    const buttons = Array.from(container.querySelectorAll('button'));
    const deleteBtn = buttons.find(b => b.textContent === 'Eliminar pieza')!;
    expect(deleteBtn).toBeTruthy();
    // Ningún section header (otra sección) aparece DESPUÉS del botón en el DOM.
    const all = Array.from(container.querySelectorAll('button, .panel-section-header'));
    const idx = all.indexOf(deleteBtn);
    const after = all.slice(idx + 1).filter(el => el.classList.contains('panel-section-header'));
    expect(after.length).toBe(0);
  });
});
