// @vitest-environment jsdom
/**
 * Re-home contracts for PropertiesPanel (orphaned 2 levels deep since the
 * VS-Code shell deletion `1c6e4238`; the ONLY seam editor in the codebase).
 * New home: ContextPanel via AppShell's renderPanelContent('Properties'),
 * opened from the piece ContextMenu ("Properties…") and ⌘K.
 *
 * These tests pin (a) the opener surfaces, (b) the behaviors that must
 * survive the re-home (SA presets, seam editor actions), and (c) the one
 * NEW live wire: Notch Settings now writes tools.toolOptions.notch (it was
 * local useState — decorative — even in the old shell).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectPiece, selectSeam } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import { getPanelSide } from '../../shell/panelSide';
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
  it('Properties is a left-side (2D-domain) panel', () => {
    expect(getPanelSide('Properties')).toBe('left');
  });

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
    expect(screen.getByText(/select a piece/i)).toBeTruthy();
  });

  it('shows the PIECE section for the selected piece', () => {
    const store = makeStore();
    store.dispatch(addPiece(makePiece()));
    store.dispatch(selectPiece('p1'));
    renderPanel(store);
    expect(screen.getByText('PIECE')).toBeTruthy();
    expect(screen.getByDisplayValue('Front')).toBeTruthy();
  });

  it('SA preset buttons write piece.seamAllowance (French → 15mm)', () => {
    const store = makeStore();
    store.dispatch(addPiece(makePiece()));
    store.dispatch(selectPiece('p1'));
    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: 'French' }));
    expect(store.getState().project.pieces[0].seamAllowance).toBe(15);
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
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    const after = store.getState().project.seams[0];
    expect(after.pieceA.pieceId).toBe('p2');
    expect(after.pieceB.pieceId).toBe('p1');
  });

  it('Notch Settings writes tools.toolOptions.notch (NEW live wire, was dead useState)', () => {
    const store = makeStore();
    store.dispatch(addPiece(makePiece()));
    store.dispatch(selectPiece('p1'));
    renderPanel(store);
    const shapeSelect = screen.getByLabelText('Shape');
    fireEvent.change(shapeSelect, { target: { value: 't-notch' } });
    expect(store.getState().tools.toolOptions?.notch?.shape).toBe('t-notch');
  });
});
