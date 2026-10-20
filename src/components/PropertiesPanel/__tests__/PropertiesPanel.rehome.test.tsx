// @vitest-environment jsdom
/**
 * Re-home contracts for PropertiesPanel (orphaned 2 levels deep since the
 * VS-Code shell deletion `1c6e4238`; the ONLY seam editor in the codebase).
 * New home: ContextPanel via AppShell's renderPanelContent('Properties'),
 * opened from the piece ContextMenu ("Properties…") and ⌘K.
 *
 * These tests pin (a) the opener surfaces and (b) the behaviors that must
 * survive the re-home (the piece's first level, seam editor actions). The
 * margin presets and «Ajustes de piquete» went in P4 (spec 2026-10-02 § 6.1).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectPiece, selectSeam, setActiveTool } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import { COMMANDS } from '../../shell/unifiedBarCommandDefs';
import type { AppDispatch } from '../../../store';
import type { PatternPiece, Seam } from '../../../types/types';

afterEach(cleanup);

function makeStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      simulation: simulationReducer,
      tools: toolReducer,
    },
  });
}

function makePiece(id = 'p1'): PatternPiece {
  const now = Date.now();
  return {
    id, name: 'Front', outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 0, internals: [], createdAt: now, updatedAt: now,
  };
}

function renderPanel(store = makeStore()) {
  return render(
    <Provider store={store}>
      <PropertiesPanel />
    </Provider>,
  );
}

describe('opener surfaces', () => {
  // Dónde se abre (a la derecha, en la ranura) lo fija usePanelHost.test.ts.
  it('⌘K has a show-properties command that opens the Properties panel', () => {
    const cmd = COMMANDS.find(c => c.id === 'show-properties');
    expect(cmd).toBeTruthy();
    const onOpenPanel = vi.fn();
    // Panel commands never touch dispatch; a typed no-op documents that.
    const noopDispatch: AppDispatch = ((a: unknown) => a) as AppDispatch;
    cmd!.action(noopDispatch, { onOpenPanel });
    expect(onOpenPanel).toHaveBeenCalledWith('Properties');
  });
});

describe('PropertiesPanel content', () => {
  it('shows the empty state when nothing is selected', () => {
    renderPanel();
    expect(screen.getByText(/selecciona una pieza/i)).toBeTruthy();
  });

  it('shows the editable SA default when the seamAllowance tool is active and nothing is selected', () => {
    const store = makeStore();
    store.dispatch(setActiveTool('seamAllowance'));
    renderPanel(store);
    expect(screen.getByText('Margen de costura por defecto')).toBeTruthy();
    const input = screen.getByLabelText('Margen (mm)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(12);
  });

  it('hides the SA default control for other tools', () => {
    const store = makeStore();
    store.dispatch(setActiveTool('select'));
    renderPanel(store);
    expect(screen.queryByText('Margen de costura por defecto')).toBeNull();
  });

  it('shows the PIECE section for the selected piece', () => {
    const store = makeStore();
    store.dispatch(addPiece(makePiece()));
    store.dispatch(selectPiece('p1'));
    renderPanel(store);
    expect(screen.getByLabelText('Nombre')).toBeTruthy();
    expect(screen.getByDisplayValue('Front')).toBeTruthy();
  });

  it('seam editor works with ONLY a seam selected (selectSeam clears piece selection)', () => {
    // Latent bug in the old shell: the whole panel gated on selectedPiece,
    // but editorSlice.selectSeam CLEARS selectedPieceIds — so the seam
    // editor was unreachable even when the panel was mounted. The re-homed
    // panel must show the seam editor for a seam-only selection.
    const store = makeStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(addPiece({ ...makePiece('p2'), name: 'Back' }));
    const seam: Seam = {
      id: 's1', type: 'standard', tension: 100, strength: 1, taped: false, tapeWidth: 10,
      active: true,
      pieceA: { pieceId: 'p1', edgeName: 'edge-1' },
      pieceB: { pieceId: 'p2', edgeName: 'edge-3' },
    };
    store.dispatch(addSeam(seam));
    store.dispatch(selectSeam('s1'));
    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: 'Invertir' }));
    const after = store.getState().project.seams[0];
    // Fase 5: Reverse alterna pieceB.reversed (direccion real de cosido).
    // El swap A<->B anterior era un no-op fisico (matchVertices empareja
    // por t ascendente en ambos lados).
    expect(after.pieceA.pieceId).toBe('p1');
    expect(after.pieceB.pieceId).toBe('p2');
    expect(after.pieceB.reversed).toBe(true);
  });
});
