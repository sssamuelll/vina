// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
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

  it('la fila ejecutada queda en la bitácora con su id', () => {
    clearJournal();
    renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1')]);
    fireEvent.click(screen.getByText('Rotar 90°'));
    expect(getJournal().events.filter((e) => e.kind === 'ui')).toEqual([
      expect.objectContaining({ name: 'menu:action', data: { id: 'rotate90' } }),
    ]);
  });

  it('un borde de margen añade Ancho exacto al menú de pieza', () => {
    renderMenu(
      { ...base, pieceId: 'p1', pieceName: 'P1', activeTool: 'seamAllowance', saEdgeId: 'p1:top' },
      [piece('p1')],
    );

    expect(screen.getByText('Ancho exacto…')).toBeTruthy();
    expect(screen.getByText('Rotar 90°')).toBeTruthy();
  });

  it('el menú de pieza no inventa Ancho exacto lejos de un borde de margen', () => {
    renderMenu(
      { ...base, pieceId: 'p1', pieceName: 'P1', activeTool: 'seamAllowance' },
      [piece('p1')],
    );

    expect(screen.queryByText('Ancho exacto…')).toBeNull();
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
      { ...base, pieceId: 'p1', isEditingNodes: true, activeTool: 'editPattern' },
      [piece('p1')],
    );
    expect(container.querySelector('.context-menu')).toBeNull();
  });
});

/**
 * samuel-214 — "Error en la seleccion de una herramienta, cuando estamos en
 * puntero a veces no puedo utilizar el click derecho a pesar de que tengo
 * seleccionado un contexto por ejemplo una pieza."
 *
 * El "a veces" es Editar patrón LATENTE. `editPatternTool.isEditing` no se
 * apaga al cambiar de herramienta — solo con Esc — así que se puede estar con la
 * flecha en la mano y el modo nodo encendido por debajo. Ese es el mismo estado
 * latente del rastro del #194.
 *
 * Y en altitud 'point', `resolveTargetKind` devuelve `point.node` para
 * CUALQUIER clic que no caiga a 8px de un segmento del contorno. `point.node`
 * tiene `menu: []`, y `ContextMenu` devuelve null cuando no hay verbos. O sea:
 * clic derecho muerto en toda la lona, con la flecha activa, y sin ninguna
 * señal de por qué.
 *
 * La altitud es del MODO, no del estado colgado: solo vale mientras la
 * herramienta activa sea la de editar patrón.
 */
describe('samuel-214 — el clic derecho con el puntero no se queda mudo', () => {
  it('con la flecha activa y Editar patrón latente, el menú de pieza aparece', () => {
    renderMenu(
      { ...base, pieceId: 'p1', pieceName: 'P1', isEditingNodes: true, activeTool: 'select' },
      [piece('p1')],
    );
    expect(screen.getByText('Rotar 90°')).toBeTruthy();
  });

  it('la lona vacía tampoco se queda muda con el modo latente', () => {
    renderMenu(
      { ...base, isEditingNodes: true, activeTool: 'select' },
      [piece('p1')],
    );
    expect(screen.getByText('Ajustar zoom al patrón')).toBeTruthy();
  });

  it('dentro de Editar patrón el menú de nodo sigue mudo, como estaba', () => {
    const { container } = renderMenu(
      { ...base, pieceId: 'p1', isEditingNodes: true, activeTool: 'editPattern' },
      [piece('p1')],
    );
    expect(container.querySelector('.context-menu')).toBeNull();
  });
});
