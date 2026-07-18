// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import ContextMenu, { type ContextMenuState } from '../ContextMenu';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function piece(id: string, over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id.toUpperCase(), position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked: false, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'Z', values: [] }],
    internals: [], edges: [], createdAt: 0, updatedAt: 0, ...over,
  } as unknown as PatternPiece;
}

function renderMenu(menu: ContextMenuState, pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      // stub: selectWorkflowStage solo lee simulationState
      simulation: (s: { simulationState: string } = { simulationState: 'idle' }) => s,
    },
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  return render(
    <Provider store={store}>
      <ContextMenu menu={menu} onClose={vi.fn()} />
    </Provider>,
  );
}

const base: ContextMenuState = { visible: true, x: 10, y: 10, pieceId: null };

describe('ContextMenu curado (Surface B)', () => {
  it('pieza bloqueada oculta Rotar/Voltear/Eliminar y muestra Desbloquear (F2)', () => {
    renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1', { locked: true })]);
    expect(screen.queryByText('Rotar 90°')).toBeNull();
    expect(screen.queryByText('Voltear horizontal')).toBeNull();
    expect(screen.queryByText('Eliminar pieza')).toBeNull();
    expect(screen.getByText('Desbloquear')).toBeTruthy();
    expect(screen.getByText('Copiar')).toBeTruthy();
  });

  it('pieza desbloqueada muestra Rotar/Voltear/Eliminar', () => {
    renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1')]);
    expect(screen.getByText('Rotar 90°')).toBeTruthy();
    expect(screen.getByText('Eliminar pieza')).toBeTruthy();
  });

  it('piquete: sin Offset ni Optimizar; con Seleccionar pieza y Eliminar piquete (curación por subtipo)', () => {
    renderMenu(
      { ...base, pieceId: 'p1', internalLineId: 'l1', internalLineType: 'notch' },
      [piece('p1', { internals: [{ id: 'l1', type: 'notch', path: [{ type: 'M', values: [0, 0] }] }] as unknown as PatternPiece['internals'] })],
    );
    expect(screen.queryByText('Offset como línea interna')).toBeNull();
    expect(screen.queryByText('Optimizar puntos de curva')).toBeNull();
    expect(screen.getByText('Seleccionar pieza')).toBeTruthy();
    expect(screen.getByText('Eliminar piquete')).toBeTruthy();
  });

  it('Pegar se oculta sin clipboard en canvas vacío (hide-not-disable)', () => {
    renderMenu({ ...base }, []);
    expect(screen.queryByText('Pegar')).toBeNull();
    expect(screen.getByText('Ajustar zoom al patrón')).toBeTruthy();
  });

  it('ningún botón del menú se renderiza en blanco (muere el separador vacío)', () => {
    const { container } = renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1')]);
    const buttons = [...container.querySelectorAll('.context-menu__item')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('point.node (edición de nodos, sin segmento) no monta menú', () => {
    const { container } = renderMenu(
      { ...base, pieceId: 'p1', isEditingNodes: true },
      [piece('p1')],
    );
    expect(container.querySelector('.context-menu')).toBeNull();
  });
});
