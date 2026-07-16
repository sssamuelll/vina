import { describe, it, expect } from 'vitest';
import markerReducer, {
  openMarker,
  closeMarker,
  movePiece,
  rotatePiece,
  selectPiece,
  deselectPiece,
  toggleGrid,
  setGridSpacing,
  type MarkerState,
} from '../markerSlice';
import type { LayoutResult } from '../../utils/export/cuttingLayout';

function makeLayout(): LayoutResult {
  return {
    pages: [{
      pageNumber: 1,
      width: 841,
      height: 1189,
      pieces: [{
        pieceId: 'p1',
        pieceName: 'Front',
        outline: [10, 10, 110, 10, 110, 110, 10, 110],
        rotation: 0,
        position: [10, 10],
      }],
    }],
    fabricUtilization: 0.5,
    totalFabricArea: 1000000,
    totalPieceArea: 500000,
  };
}

function openState(): MarkerState {
  const initial: MarkerState = {
    isOpen: false, paperSize: 'A0', paperWidth: 841, paperHeight: 1189,
    scale: 1, margin: 10, layout: null, selectedPieceIndex: null,
    includeSeamAllowance: true, showGrid: true, gridSpacing: 10, fabricUtilization: 0,
  };
  return markerReducer(initial, openMarker({
    layout: makeLayout(),
    paperSize: 'A0',
    paperWidth: 841,
    paperHeight: 1189,
    scale: 1,
    margin: 10,
    includeSeamAllowance: true,
  }));
}

describe('markerSlice', () => {
  it('opens with layout', () => {
    const state = openState();
    expect(state.isOpen).toBe(true);
    expect(state.layout?.pages.length).toBe(1);
    expect(state.fabricUtilization).toBe(0.5);
  });

  it('closes and clears', () => {
    const state = markerReducer(openState(), closeMarker());
    expect(state.isOpen).toBe(false);
    expect(state.layout).toBe(null);
  });

  it('movePiece updates position and outline', () => {
    const state = markerReducer(openState(), movePiece({
      pageIndex: 0, pieceIndex: 0, newPosition: [20, 20],
    }));
    const piece = state.layout!.pages[0].pieces[0];
    // With grid snapping (gridSpacing=10), position snaps to [20,20]
    expect(piece.position[0]).toBe(20);
    expect(piece.position[1]).toBe(20);
  });

  it('rotatePiece updates rotation', () => {
    const state = markerReducer(openState(), rotatePiece({
      pageIndex: 0, pieceIndex: 0, degrees: 90,
    }));
    expect(state.layout!.pages[0].pieces[0].rotation).toBe(90);
  });

  it('selectPiece / deselectPiece', () => {
    let state = markerReducer(openState(), selectPiece({ page: 0, piece: 0 }));
    expect(state.selectedPieceIndex).toEqual({ page: 0, piece: 0 });
    state = markerReducer(state, deselectPiece());
    expect(state.selectedPieceIndex).toBe(null);
  });

  it('toggleGrid toggles showGrid', () => {
    let state = openState();
    expect(state.showGrid).toBe(true);
    state = markerReducer(state, toggleGrid());
    expect(state.showGrid).toBe(false);
  });

  it('setGridSpacing clamps to >= 1', () => {
    const state = markerReducer(openState(), setGridSpacing(0));
    expect(state.gridSpacing).toBe(1);
  });

  it('grid snapping rounds to gridSpacing', () => {
    const state = markerReducer(openState(), movePiece({
      pageIndex: 0, pieceIndex: 0, newPosition: [17, 23],
    }));
    const piece = state.layout!.pages[0].pieces[0];
    // 17 rounds to 20, 23 rounds to 20
    expect(piece.position[0]).toBe(20);
    expect(piece.position[1]).toBe(20);
  });
});
