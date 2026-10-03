import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, {
  addPiece, updatePiece, removePiece, movePiece, rotatePiece,
  addSeam, addInternalLine, setInternalLine, updateInternalLine,
  setProjectName, loadProject, restoreProject, updateMeasurements,
  setAvatarMode, setAvatarModelUrl,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece, batchSetSeamAllowance,
} from '../store/projectSlice';
import editorReducer, {
  setViewMode, setActiveTool, selectPiece, clearSelection,
  togglePieceSelection, selectSeam, setZoom2D, setPan2D,
  toggleSeamAllowance, toggleGrainlines, toggleNotches,
  copyPieces, clearClipboard, createPastedPieces,
} from '../store/editorSlice';
import {
  undoMiddleware, canUndo, canRedo, batchUndo, beginUndoBatch,
  endUndoBatch, getHistory, getUndoLength, withUndoBatchToken,
} from '../store/undoMiddleware';
import { PatternPiece, type VinaProject } from '../types/types';

afterEach(() => vi.useRealTimers());

function makePiece(id: string): PatternPiece {
  return {
    id, name: 'Test', outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10,
    layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
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
      id: 's1', pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
      pieceB: { pieceId: 'p2', edgeName: 'sideSeam' }, type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
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

  it('updateInternalLine can also update notchAnchor and notchOptions (notch-precision F3)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(addInternalLine({
      pieceId: 'p1',
      line: {
        id: 'n1', type: 'notch',
        path: [{ type: 'M', values: [30, 0] }, { type: 'L', values: [30, 8] }],
        notchOptions: { shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1 },
        notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 30 },
      },
    }));
    store.dispatch(updateInternalLine({
      pieceId: 'p1', lineId: 'n1',
      path: [{ type: 'M', values: [42, 0] }, { type: 'L', values: [42, 10] }],
      notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 42 },
      notchOptions: { shape: 'slit', subType: 'straightforward', length: 10, width: 3, angle: 0, count: 1 },
    }));
    const line = store.getState().project.pieces[0].internals[0];
    expect(line.path[0].values).toEqual([42, 0]);
    expect(line.notchAnchor?.distanceMm).toBe(42);
    expect(line.notchOptions?.length).toBe(10);
  });

  it('updateInternalLine without optional fields leaves anchor/options untouched', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(addInternalLine({
      pieceId: 'p1',
      line: {
        id: 'n1', type: 'notch',
        path: [{ type: 'M', values: [30, 0] }, { type: 'L', values: [30, 8] }],
        notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 30 },
      },
    }));
    store.dispatch(updateInternalLine({
      pieceId: 'p1', lineId: 'n1',
      path: [{ type: 'M', values: [31, 0] }, { type: 'L', values: [31, 8] }],
    }));
    const line = store.getState().project.pieces[0].internals[0];
    expect(line.notchAnchor?.distanceMm).toBe(30);
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
    const cinturaAntes = store.getState().project.avatar.measurements.waist;
    store.dispatch(updateMeasurements({ chest: 100 }));
    expect(store.getState().project.avatar.measurements.chest).toBe(100);
    // Other measurements unchanged
    expect(store.getState().project.avatar.measurements.waist).toBe(cinturaAntes);
  });

  it('supports optional expanded measurements without breaking existing', () => {
    const store = createStore();
    // Un proyecto de antes, con las 7 principales y ninguna opcional (el defecto de hoy, Mujer
    // EU 38, ya trae las 15 del catálogo y no probaría que se AGREGAN).
    store.dispatch(restoreProject({
      id: 'viejo', name: 'Viejo', pieces: [], seams: [], fabrics: [], createdAt: 1000, updatedAt: 1000,
      avatar: { id: 'default', name: 'Default Avatar', modelUrl: '', measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } },
    } as VinaProject));
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

  it('bringToFront sets highest zOrder', () => {
    const store = createStore();
    const p1 = makePiece('p1'); p1.zOrder = 0;
    const p2 = makePiece('p2'); p2.zOrder = 1;
    const p3 = makePiece('p3'); p3.zOrder = 2;
    store.dispatch(addPiece(p1));
    store.dispatch(addPiece(p2));
    store.dispatch(addPiece(p3));
    store.dispatch(bringToFront('p1'));
    expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(3);
  });

  it('sendToBack sets lowest zOrder', () => {
    const store = createStore();
    const p1 = makePiece('p1'); p1.zOrder = 2;
    const p2 = makePiece('p2'); p2.zOrder = 0;
    store.dispatch(addPiece(p1));
    store.dispatch(addPiece(p2));
    store.dispatch(sendToBack('p1'));
    expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(-1);
  });

  it('bringForward increments zOrder by 1', () => {
    const store = createStore();
    const p1 = makePiece('p1'); p1.zOrder = 1;
    store.dispatch(addPiece(p1));
    store.dispatch(bringForward('p1'));
    expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(2);
  });

  it('sendBackward decrements zOrder by 1', () => {
    const store = createStore();
    const p1 = makePiece('p1'); p1.zOrder = 3;
    store.dispatch(addPiece(p1));
    store.dispatch(sendBackward('p1'));
    expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(2);
  });

  it('lockPiece sets locked to true', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(lockPiece('p1'));
    expect(store.getState().project.pieces[0].locked).toBe(true);
  });

  it('unlockPiece sets locked to false', () => {
    const store = createStore();
    const p1 = makePiece('p1'); p1.locked = true;
    store.dispatch(addPiece(p1));
    store.dispatch(unlockPiece('p1'));
    expect(store.getState().project.pieces[0].locked).toBe(false);
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

  it('clamps zoom (#1097: tope subió de 10 a 40)', () => {
    const store = createStore();
    store.dispatch(setZoom2D(0.001));
    expect(store.getState().editor.zoom2D).toBe(0.1);
    store.dispatch(setZoom2D(999));
    expect(store.getState().editor.zoom2D).toBe(40);
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
  });

  it('toggles notch visibility off and back on', () => {
    const store = createStore();
    expect(store.getState().editor.showNotches).toBe(true);

    store.dispatch(toggleNotches());
    expect(store.getState().editor.showNotches).toBe(false);

    store.dispatch(toggleNotches());
    expect(store.getState().editor.showNotches).toBe(true);
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

  it('undo/redo works for normal pattern editing operations', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    // Add piece → move → rename: three undo-able actions
    store.dispatch(addPiece(makePiece('p1')));
    store.dispatch(movePiece({ id: 'p1', x: 50, y: 100 }));
    store.dispatch(setProjectName('Edited'));

    expect(store.getState().project.pieces[0].position).toEqual({ x: 50, y: 100 });
    expect(store.getState().project.name).toBe('Edited');

    // Undo rename
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.name).toBe('Test');
    expect(store.getState().project.pieces[0].position).toEqual({ x: 50, y: 100 });

    // Undo move
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].position).toEqual({ x: 0, y: 0 });

    // Undo add
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces).toHaveLength(0);

    // Redo all three
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces).toHaveLength(1);
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces[0].position).toEqual({ x: 50, y: 100 });
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.name).toBe('Edited');

    expect(canRedo()).toBe(false);
  });

  it('preserves NaN in piece state through undo snapshot (structuredClone fix)', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    // Add a piece with a NaN value (simulates unset optional numeric field)
    const piece = makePiece('p1');
    piece.rotation = NaN;
    store.dispatch(addPiece(piece));
    expect(store.getState().project.pieces[0].rotation).toBeNaN();

    // Move the piece — this creates a new undo snapshot of the state containing NaN
    store.dispatch(movePiece({ id: 'p1', x: 99, y: 99 }));

    // Undo the move — restores the snapshot that should still have NaN
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].rotation).toBeNaN();
    expect(store.getState().project.pieces[0].position).toEqual({ x: 0, y: 0 });

    // Redo — current state at the time of undo also had NaN, should survive
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces[0].rotation).toBeNaN();
    expect(store.getState().project.pieces[0].position).toEqual({ x: 99, y: 99 });
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

describe('clipboard (editorSlice)', () => {
  it('copyPieces stores deep copies in clipboard', () => {
    const store = createStore();
    const p1 = makePiece('p1');
    p1.name = 'Front';
    store.dispatch(addPiece(p1));
    store.dispatch(copyPieces({ pieces: [p1] }));
    const clip = store.getState().editor.clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.pieces).toHaveLength(1);
    expect(clip!.pieces[0].name).toBe('Front');
  });

  it('createPastedPieces generates new pieces with offset', () => {
    const p1 = makePiece('p1');
    const pasted = createPastedPieces({ pieces: [p1] });
    expect(pasted).toHaveLength(1);
    expect(pasted[0].id).not.toBe('p1');
    expect(pasted[0].position.x).toBe(30);
    expect(pasted[0].position.y).toBe(30);
    expect(pasted[0].name).toContain('copy');
  });

  it('createPastedPieces with mirror flag', () => {
    const p1 = makePiece('p1');
    const pasted = createPastedPieces({ pieces: [p1] }, true);
    expect(pasted[0].name).toContain('mirror');
  });

  it('clearClipboard resets clipboard to null', () => {
    const store = createStore();
    store.dispatch(copyPieces({ pieces: [makePiece('p1')] }));
    expect(store.getState().editor.clipboard).not.toBeNull();
    store.dispatch(clearClipboard());
    expect(store.getState().editor.clipboard).toBeNull();
  });
});

// ─── Undo Batching ─────────────────────────────────────────────────────────

describe('Undo batch grouping', () => {
  it('an empty explicit batch creates no history entry', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    const before = getUndoLength();
    const token = beginUndoBatch(store.dispatch, 'Empty gesture');
    endUndoBatch(store.dispatch, token);
    expect(getUndoLength()).toBe(before);
  });

  it('groups one gesture even when identical updates are more than 500ms apart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    const before = getUndoLength();
    const token = beginUndoBatch(store.dispatch, 'Editar puntos del patrón');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'A' }),
      token,
    ));
    vi.advanceTimersByTime(750);
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'B' }),
      token,
    ));
    endUndoBatch(store.dispatch, token);
    expect(getUndoLength()).toBe(before + 1);
    expect(getHistory().past.at(-1)?.label).toBe('Editar puntos del patrón');
  });

  it('finalizes an open dirty batch before the same editor/undo', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    const token = beginUndoBatch(store.dispatch, 'Editar puntos del patrón');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Moved' }),
      token,
    ));
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Test');
    expect(canRedo()).toBe(true);
    endUndoBatch(store.dispatch, token);
  });

  it('finalizes an open dirty batch before editor/redo without leaking a late endBatch', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Existing' }));
    store.dispatch({ type: 'editor/undo' });
    const token = beginUndoBatch(store.dispatch, 'New gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Moved' }),
      token,
    ));

    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces[0].name).toBe('Moved');
    expect(getUndoLength()).toBe(1);
    endUndoBatch(store.dispatch, token);
    expect(getUndoLength()).toBe(1);

    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Test');
  });

  it('resets temporal coalescing when an explicit batch closes', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    const token = beginUndoBatch(store.dispatch, 'Gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Inside' }),
      token,
    ));
    endUndoBatch(store.dispatch, token);
    const afterBatch = getUndoLength();
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'After' }));
    expect(getUndoLength()).toBe(afterBatch + 1);
  });

  it('loadProject clears an in-flight explicit batch without leaking it', () => {
    const store = createStore();
    const project = {
      id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    };
    store.dispatch(loadProject(project));
    const abandonedToken = beginUndoBatch(store.dispatch, 'Abandoned gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Inside' }),
      abandonedToken,
    ));
    store.dispatch(loadProject(project));
    endUndoBatch(store.dispatch, abandonedToken);
    expect(canUndo()).toBe(false);

    const freshToken = beginUndoBatch(store.dispatch, 'Fresh gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Fresh' }),
      freshToken,
    ));
    endUndoBatch(store.dispatch, freshToken);
    expect(getUndoLength()).toBe(1);
  });

  it('multiple dispatches inside batchUndo create a single undo entry', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    const undoBefore = getUndoLength();

    batchUndo(store.dispatch, 'Add 3 Pieces', () => {
      store.dispatch(addPiece(makePiece('b1')));
      store.dispatch(addPiece(makePiece('b2')));
      store.dispatch(addPiece(makePiece('b3')));
    });

    expect(store.getState().project.pieces).toHaveLength(3);
    // Should have exactly 1 new undo entry (not 3)
    expect(getUndoLength()).toBe(undoBefore + 1);

    // Single undo reverts all 3 pieces
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces).toHaveLength(0);
  });

  it('redo after batched undo restores all changes', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    batchUndo(store.dispatch, 'Batch Add', () => {
      store.dispatch(addPiece(makePiece('r1')));
      store.dispatch(addPiece(makePiece('r2')));
    });

    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces).toHaveLength(0);

    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces).toHaveLength(2);
  });

  it('drag-to-all (batchSetSeamAllowance in batchUndo) is a single undo entry, not one per piece', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [makePiece('p1'), makePiece('p2'), makePiece('p3')],
      seams: [], fabrics: [], avatar: store.getState().project.avatar,
      createdAt: Date.now(), updatedAt: Date.now(),
    }));

    const undoBefore = getUndoLength();

    // Mirrors PatternEditor.handleApplySeamAllowanceAll — the drag-to-all command.
    batchUndo(store.dispatch, 'Apply 9.5mm to 3 pieces', () => {
      store.dispatch(batchSetSeamAllowance({ pieceIds: ['p1', 'p2', 'p3'], width: 9.5 }));
    });

    expect(store.getState().project.pieces.every(p => p.seamAllowance === 9.5)).toBe(true);
    // Halberg's gate: ONE history entry for the whole gesture, not N.
    expect(getUndoLength()).toBe(undoBefore + 1);

    // Single undo reverts the whole apply-to-all.
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces.every(p => p.seamAllowance === 10)).toBe(true);
  });

  it('nested batches only create one undo entry', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: Date.now(), updatedAt: Date.now(),
    }));

    const undoBefore = getUndoLength();

    batchUndo(store.dispatch, 'Outer', () => {
      store.dispatch(addPiece(makePiece('n1')));
      batchUndo(store.dispatch, 'Inner', () => {
        store.dispatch(addPiece(makePiece('n2')));
      });
      store.dispatch(addPiece(makePiece('n3')));
    });

    expect(store.getState().project.pieces).toHaveLength(3);
    expect(getUndoLength()).toBe(undoBefore + 1);
  });

  it('finalizes nested capture-all batches when the callback throws', () => {
    const store = createStore();
    store.dispatch(loadProject({
      id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
      avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
    }));
    const undoBefore = getUndoLength();

    expect(() => batchUndo(store.dispatch, 'Outer failure', () => {
      store.dispatch(addPiece(makePiece('e1')));
      batchUndo(store.dispatch, 'Inner failure', () => {
        store.dispatch(addPiece(makePiece('e2')));
        throw new Error('expected batch failure');
      });
    })).toThrow('expected batch failure');

    expect(getUndoLength()).toBe(undoBefore + 1);
    batchUndo(store.dispatch, 'Fresh after failure', () => {
      store.dispatch(addPiece(makePiece('e3')));
    });
    expect(getUndoLength()).toBe(undoBefore + 2);

    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces.map((piece) => piece.id)).toEqual(['e1', 'e2']);
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces).toHaveLength(0);
  });
});
