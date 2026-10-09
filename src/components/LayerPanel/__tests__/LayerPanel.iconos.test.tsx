// @vitest-environment jsdom
/**
 * Capas (spec 2026-10-02 § 6.1, P4): iconos de Lucide en lugar de emojis, y
 * «Forro / Exterior / Avíos» en lugar de «1: Shell».
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, renameLayer } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import editorReducer from '../../../store/editorSlice';
import LayerPanel from '../LayerPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function pieza(id: string, layer: number): PatternPiece {
  const now = Date.now();
  return {
    id, name: `Pieza ${id}`, layer,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] }, { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 10, internals: [], createdAt: now, updatedAt: now,
  } as PatternPiece;
}

function panel() {
  const store = configureStore({ reducer: { project: projectReducer, simulation: simulationReducer, editor: editorReducer } });
  const d = store.dispatch as AppDispatch;
  for (const [id, capa] of [['a', 0], ['b', 1], ['c', 2], ['d', 3]] as const) d(addPiece(pieza(id, capa)));
  render(<Provider store={store}><LayerPanel /></Provider>);
  return { d };
}

const titulos = () => Array.from(document.querySelectorAll('.layer-group-title')).map((t) => t.textContent);

describe('Capas', () => {
  it('las capas se llaman Forro, Exterior y Avíos, sin el número delante; de la 3 en adelante, «Capa N»', () => {
    panel();
    expect(titulos()).toEqual(['Capa 3', 'Avíos', 'Exterior', 'Forro']);
  });

  it('el nombre que ella le puso a una capa gana', () => {
    const { d } = panel();
    act(() => { d(renameLayer({ layer: 1, name: 'Cuerpo' })); });
    expect(titulos()).toContain('Cuerpo');
    expect(titulos()).not.toContain('Exterior');
  });

  it('ver, ocultar y bloquear son iconos de Lucide con su nombre, sin emojis ni glifos', () => {
    panel();
    for (const nombre of ['Ocultar capa', 'Bloquear capa', 'Ocultar pieza', 'Contraer/expandir todo']) {
      const botones = screen.getAllByRole('button', { name: nombre });
      for (const b of botones) expect(b.querySelector('svg'), nombre).not.toBeNull();
    }
    const texto = document.querySelector('.layer-panel')!.textContent ?? '';
    expect(texto).not.toMatch(/\p{Extended_Pictographic}|[▶▼☰]/u);
  });

  it('los títulos van en sentence case: el CSS no los pasa a mayúsculas', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/LayerPanel/LayerPanel.css'), 'utf8');
    const regla = css.match(/\.layer-group-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(regla).not.toMatch(/text-transform:\s*uppercase/);
  });
});
