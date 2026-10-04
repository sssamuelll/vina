/**
 * @vitest-environment jsdom
 *
 * La barra superior (spec 2026-10-02 «la interfaz en papel» § 4.2): el grupo
 * del patrón está cuando la hoja está a la vista y hay algo dibujado en ella.
 * Que el selector de vista quede centrado y no se mueva es layout: lo mide
 * `tests/e2e/barra-superior.spec.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import projectReducer, { addPiece, addTrazo } from '../../../store/projectSlice';
import TopBar from '../TopBar';

afterEach(cleanup);

function renderBarra() {
  const store = configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, project: projectReducer },
  });
  render(<Provider store={store}><TopBar onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  return store;
}

const grupo = () => screen.queryByRole('group', { name: 'Qué se ve del patrón' });

const PIEZA = {
  id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false,
};

describe('TopBar ▸ grupo del patrón', () => {
  it('sin nada en la hoja no está', () => {
    renderBarra();
    expect(grupo()).toBeNull();
  });

  it('con una pieza está en Split y en 2D, y en 3D no', () => {
    const store = renderBarra();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    act(() => { store.dispatch(addPiece(PIEZA as any)); });
    expect(store.getState().editor.viewMode).toBe('split');
    expect(grupo()).not.toBeNull();
    act(() => { store.dispatch(setViewMode('2d')); });
    expect(grupo()).not.toBeNull();
    act(() => { store.dispatch(setViewMode('3d')); });
    expect(grupo()).toBeNull();
  });

  it('con un trazo y ninguna pieza también está', () => {
    const store = renderBarra();
    act(() => {
      store.dispatch(addTrazo({
        id: 't1', createdAt: 0,
        path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }],
      }));
    });
    expect(grupo()).not.toBeNull();
  });

  it('el selector de vista ya no vive entre dos espaciadores', () => {
    const { container } = render(
      <Provider store={configureStore({ reducer: { editor: editorReducer, simulation: simulationReducer, project: projectReducer } })}>
        <TopBar onOpenPanel={() => {}} onImportDXF={() => {}} />
      </Provider>,
    );
    expect(container.querySelector('.top-bar__spacer')).toBeNull();
    expect(container.querySelectorAll('.top-bar > *')).toHaveLength(3);
  });
});
