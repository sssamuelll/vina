import { describe, it, expect } from 'vitest';
import editorReducer, { selectAllPieces, selectAllVisiblePieces } from '../editorSlice';
import { PatternPiece, EditorState } from '../../types/types';
import { removePieces, removeSeam } from '../projectSlice';

describe('editorSlice selectAllPieces', () => {
  const initialState = editorReducer(undefined, { type: '@@INIT' });

  const mockPieces: Partial<PatternPiece>[] = [
    { id: 'p1', name: 'P1', active: true, locked: false, layer: 1 },
    { id: 'p2', name: 'P2', active: false, locked: false, layer: 1 }, // Inactive
    { id: 'p3', name: 'P3', active: true, locked: true, layer: 1 },  // Locked
    { id: 'p4', name: 'P4', active: true, locked: false, layer: 2 }, // Layer 2
  ];

  it('selects all pieces when passed a direct ID array (selectAllPieces)', () => {
    const ids = ['p1', 'p2', 'p3'];
    const state = editorReducer(initialState, selectAllPieces(ids));
    expect(state.selectedPieceIds).toEqual(ids);
  });

  it('filters out inactive, locked, and layer-locked pieces (selectAllVisiblePieces)', () => {
    const layerLocked = { 2: true }; // Layer 2 is locked
    const action = selectAllVisiblePieces({ pieces: mockPieces as PatternPiece[], layerLocked });
    const state = editorReducer(initialState, action);

    // Should only have p1.
    expect(state.selectedPieceIds).toEqual(['p1']);
  });

  it('clears selection reactively when pieces are removed (Fix #3)', () => {
    let state: EditorState = {
      ...initialState,
      selectedPieceIds: ['p1', 'p2'],
    };
    // Dispatching project/removePieces should trigger extraReducer in editorSlice
    state = editorReducer(state, removePieces(['p1']));
    expect(state.selectedPieceIds).toEqual([]);
  });

  it('clears selection reactively when a seam is removed (Fix #3)', () => {
    let state: EditorState = {
      ...initialState,
      selectedSeamId: 's1',
    };
    state = editorReducer(state, removeSeam('s1'));
    expect(state.selectedSeamId).toBeNull();
  });

  it('clears other selections during selectAllPieces', () => {
    let state: EditorState = {
      ...initialState,
      selectedSeamId: 's1',
      selectedPOMId: 'pom1',
    };
    state = editorReducer(state, selectAllPieces(['p1']));
    expect(state.selectedSeamId).toBeNull();
    expect(state.selectedPOMId).toBeNull();
  });
});
