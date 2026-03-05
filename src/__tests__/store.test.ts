import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, {
  addPiece, updatePiece, removePiece, movePiece, rotatePiece,
  addSeam, addInternalLine, setInternalLine,
  setProjectName, loadProject, updateMeasurements,
  setAvatarMode, setAvatarModelUrl,
} from '../store/projectSlice';
import editorReducer, {
  setViewMode, setActiveTool, selectPiece, clearSelection,
  togglePieceSelection, selectSeam, setZoom2D, setPan2D,
  toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid,
} from '../store/editorSlice';
import { undoMiddleware, canUndo, canRedo } from '../store/undoMiddleware';
import { PatternPiece } from '../types/types';

function makePiece(id: string): PatternPiece {
  return {
    id, name: 'Test', outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function createStore() {
  return configureStore({
    reducer: { project: projectReducer, editor: editorReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(undoMiddleware),
  });
}

describe('projectSlice', () => {
  it('adds a piece', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    expect(store.getState().project.pieces).toHaveLength(1);
    expect(store.getState().project.isDirty).toBe(true);
  });

  it('updates a piece', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(updatePiece({ ...makePiece('p1'), name: 'Updated' }));
    expect(store.getState().project.pieces[0].name).toBe('Updated');
  });

  it('removes a piece and its seams', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(addPiece(makePiece('p2')));
    store.dispatch(addSeam({
      id: 's1', pieceA: { pieceId: 'p1', edgeStart: 0, edgeEnd: 1 },
      pieceB: { pieceId: 'p2', edgeStart: 0, edgeEnd: 1 }, type: 'standard',
    }));
    store.dispatch(removePiece('p1'));
    expect(store.getState().project.pieces).toHaveLength(1);
    expect(store.getState().project.seams).toHaveLength(0);
  });

  it('moves a piece', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(movePiece({ id: 'p1', x: 50, y: 100 }));
    expect(store.getState().project.pieces[0].position).toEqual({ x: 50, y: 100 });
  });

  it('rotates a piece', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(rotatePiece({ id: 'p1', rotation: 45 }));
    expect(store.getState().project.pieces[0].rotation).toBe(45);
  });

  it('adds internal line', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(addInternalLine({
      pieceId: 'p1',
      line: { id: 'n1', type: 'notch', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 10] }] },
    }));
    expect(store.getState().project.pieces[0].internals).toHaveLength(1);
  });

  it('setInternalLine replaces by type', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(setInternalLine({
      pieceId: 'p1',
      line: { id: 'gl1', type: 'grainline', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, 100] }] },
    }));
    store.dispatch(setInternalLine({
      pieceId: 'p1',
      line: { id: 'gl2', type: 'grainline', path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 100] }] },
    }));
    // Should only have the second grainline
    const internals = store.getState().project.pieces[0].internals;
    expect(internals).toHaveLength(1);
    expect(internals[0].id).toBe('gl2');
  });

  it('sets project name', () => {
    const store = createStore();
    store.dispatch(setProjectName('My Project'));
    expect(store.getState().project.name).toBe('My Project');
  });

  it('loads project', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('old')));
    store.dispatch(loadProject({
      id: 'new', name: 'Loaded', pieces: [makePiece('p1')],
      seams: [], fabrics: [], avatar: store.getState().project.avatar,
      createdAt: Date.now(), updatedAt: Date.now(),
    }));
    expect(store.getState().project.pieces).toHaveLength(1);
    expect(store.getState().project.name).toBe('Loaded');
    expect(store.getState().project.isDirty).toBe(false);
  });

  it('updates measurements', () => {
    const store = createStore();
    store.dispatch(updateMeasurements({ chest: 100 }));
    expect(store.getState().project.avatar.measurements.chest).toBe(100);
    // Other measurements unchanged
    expect(store.getState().project.avatar.measurements.waist).toBe(82);
  });

  it('supports optional expanded measurements without breaking existing', () => {
    const store = createStore();
    // New optional fields default to undefined
    expect(store.getState().project.avatar.measurements.neckCirc).toBeUndefined();
    expect(store.getState().project.avatar.measurements.thighCirc).toBeUndefined();
    // Can set them
    store.dispatch(updateMeasurements({ neckCirc: 38, upperArmCirc: 30 }));
    expect(store.getState().project.avatar.measurements.neckCirc).toBe(38);
    expect(store.getState().project.avatar.measurements.upperArmCirc).toBe(30);
    // Primary measurements still intact
    expect(store.getState().project.avatar.measurements.height).toBe(180);
  });

  it('sets avatar mode', () => {
    const store = createStore();
    store.dispatch(setAvatarMode('model'));
    expect(store.getState().project.avatarMode).toBe('model');
  });

  it('sets avatar model URL and switches mode', () => {
    const store = createStore();
    store.dispatch(setAvatarModelUrl('https://example.com/model.glb'));
    expect(store.getState().project.avatarModelUrl).toBe('https://example.com/model.glb');
    expect(store.getState().project.avatarMode).toBe('model');
  });

  it('piece has optional zOrder and locked fields', () => {
    const store = createStore();
    const piece = makePiece('p1');
    piece.zOrder = 5;
    piece.locked = true;
    store.dispatch(addPiece(piece));
    expect(store.getState().project.pieces[0].zOrder).toBe(5);
    expect(store.getState().project.pieces[0].locked).toBe(true);
  });

  it('piece defaults to no zOrder or locked', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    expect(store.getState().project.pieces[0].zOrder).toBeUndefined();
    expect(store.getState().project.pieces[0].locked).toBeUndefined();
  });
});

describe('editorSlice', () => {
  it('sets view mode', () => {
    const store = createStore();
    store.dispatch(setViewMode('3d'));
    expect(store.getState().editor.viewMode).toBe('3d');
  });

  it('sets active tool', () => {
    const store = createStore();
    store.dispatch(setActiveTool('pen'));
    expect(store.getState().editor.activeTool).toBe('pen');
  });

  it('selects and clears piece', () => {
    const store = createStore();
    store.dispatch(selectPiece('p1'));
    expect(store.getState().editor.selectedPieceIds).toEqual(['p1']);
    store.dispatch(clearSelection());
    expect(store.getState().editor.selectedPieceIds).toEqual([]);
  });

  it('toggles piece selection', () => {
    const store = createStore();
    store.dispatch(togglePieceSelection('p1'));
    store.dispatch(togglePieceSelection('p2'));
    expect(store.getState().editor.selectedPieceIds).toEqual(['p1', 'p2']);
    store.dispatch(togglePieceSelection('p1'));
    expect(store.getState().editor.selectedPieceIds).toEqual(['p2']);
  });

  it('selects seam and clears piece selection', () => {
    const store = createStore();
    store.dispatch(selectPiece('p1'));
    store.dispatch(selectSeam('s1'));
    expect(store.getState().editor.selectedSeamId).toBe('s1');
    expect(store.getState().editor.selectedPieceIds).toEqual([]);
  });

  it('clamps zoom', () => {
    const store = createStore();
    store.dispatch(setZoom2D(0.001));
    expect(store.getState().editor.zoom2D).toBe(0.1);
    store.dispatch(setZoom2D(999));
    expect(store.getState().editor.zoom2D).toBe(10);
  });

  it('sets pan', () => {
    const store = createStore();
    store.dispatch(setPan2D({ x: 100, y: -50 }));
    expect(store.getState().editor.pan2D).toEqual({ x: 100, y: -50 });
  });

  it('toggles display options', () => {
    const store = createStore();
    const initial = store.getState().editor.showSeamAllowance;
    store.dispatch(toggleSeamAllowance());
    expect(store.getState().editor.showSeamAllowance).toBe(!initial);

    store.dispatch(toggleGrainlines());
    store.dispatch(toggleSnapToGrid());
  });
});

describe('undoMiddleware', () => {
  it('supports undo/redo for project actions', () => {
    const store = createStore();
    // loadProject clears history
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    expect(canUndo()).toBe(false);

    store.dispatch(addPiece(makePiece('p1')));
    expect(store.getState().project.pieces).toHaveLength(1);
    expect(canUndo()).toBe(true);

    // Undo
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces).toHaveLength(0);
    expect(canRedo()).toBe(true);

    // Redo
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  it('clears redo on new action', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch({ type: 'editor/undo' });
    expect(canRedo()).toBe(true);

    // New action should clear redo
    store.dispatch(addPiece(makePiece('p2')));
    expect(canRedo()).toBe(false);
  });

  it('does not track editor actions', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    store.dispatch(setActiveTool('pen'));
    store.dispatch(setViewMode('3d'));
    expect(canUndo()).toBe(false);
  });
});
