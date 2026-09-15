import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, linkPieces, updatePiece, movePiece, loadProject, addInternalLine, setLayerLocked } from '../projectSlice';
import { linkedEditingMiddleware } from '../linkedEditingMiddleware';
import { undoMiddleware, getUndoLength } from '../undoMiddleware';
import type { PatternPiece, InternalLine } from '../../types/types';

function makePiece(id: string, name: string): PatternPiece {
  return {
    id, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createStore() {
  return configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault().concat(linkedEditingMiddleware),
  });
}

describe('linkedEditingMiddleware', () => {
  it('syncs updatePiece to instance-linked partner (same outline)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const edited = {
      ...a,
      outline: [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [150, 0] },
        { type: 'L' as const, values: [150, 200] },
        { type: 'L' as const, values: [0, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(edited));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(b.outline[1].values[0]).toBe(150);
  });

  it('syncs updatePiece to symmetry-linked partner (mirrored outline)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const edited = {
      ...a,
      outline: [
        { type: 'M' as const, values: [10, 0] },
        { type: 'L' as const, values: [100, 0] },
        { type: 'L' as const, values: [100, 200] },
        { type: 'L' as const, values: [10, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(edited));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    // Symmetry: X mirrored around center (55). M(10) -> M(100), L(100) -> L(10)
    expect(b.outline[0].values[0]).toBe(100);
    expect(b.outline[1].values[0]).toBe(10);
  });

  it('does not sync movePiece (positions are independent)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    store.dispatch(movePiece({ id: 'a', x: 200, y: 100 }));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(b.position.x).toBe(0);
  });

  it('does not infinite loop (synced dispatch does not re-trigger)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    store.dispatch(updatePiece({ ...a, name: 'Edited', updatedAt: Date.now() }));

    const pieces = store.getState().project.pieces;
    expect(pieces.find(p => p.id === 'a')!.name).toBe('Edited');
  });

  // #1176 (H1) — editar la pieza SIN candado, cuando su pareja vinculada SÍ
  // lo tiene, cascadeaba la escritura a la pareja bloqueada sin mirarlo. La
  // pieza editada directamente es legítima (no está bloqueada); lo que debe
  // omitirse es solo la cascada hacia la pareja.
  it('omite la cascada si la pareja vinculada tiene el candado de PIEZA puesto — la fuente sí se actualiza', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece({ ...makePiece('b', 'Right'), locked: true }));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bAntes = store.getState().project.pieces.find(p => p.id === 'b')!;
    const edited = {
      ...a,
      outline: [
        { type: 'M' as const, values: [10, 0] },
        { type: 'L' as const, values: [100, 0] },
        { type: 'L' as const, values: [100, 200] },
        { type: 'L' as const, values: [10, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(edited));

    const aDespues = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bDespues = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(aDespues.outline[0].values[0], 'la pieza editada directamente (sin candado) sí debe cambiar').toBe(10);
    expect(bDespues.outline, 'la pareja BLOQUEADA no debe tocarse').toEqual(bAntes.outline);
  });

  it('omite la cascada si la pareja vinculada tiene el candado de CAPA puesto', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece({ ...makePiece('b', 'Right'), layer: 3 }));
    store.dispatch(setLayerLocked({ layer: 3, locked: true }));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bAntes = store.getState().project.pieces.find(p => p.id === 'b')!;
    store.dispatch(updatePiece({
      ...a,
      outline: [
        { type: 'M' as const, values: [10, 0] },
        { type: 'L' as const, values: [100, 0] },
        { type: 'L' as const, values: [100, 200] },
        { type: 'L' as const, values: [10, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    }));

    const bDespues = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(bDespues.outline, 'la pareja con la CAPA bloqueada no debe tocarse').toEqual(bAntes.outline);
  });
});

// ─── BUG-7 (#610) — single-step undo for linked-piece cascades ────────────
//
// Verifies that linkedEditingMiddleware groups its cascade dispatch with the
// originating action into ONE undo entry, so a single Ctrl+Z restores both
// pieces. This depends on linkedEditingMiddleware running BEFORE undoMiddleware
// in the chain so it can wrap the action in an undo/startBatch...endBatch pair.

function createStoreWithUndo() {
  return configureStore({
    reducer: { project: projectReducer },
    // Match production order: linkedEditing BEFORE undoMid.
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(linkedEditingMiddleware, undoMiddleware),
  });
}

function loadEmptyProject(store: ReturnType<typeof createStoreWithUndo>) {
  // Resets undo history and gives a deterministic baseline.
  store.dispatch(loadProject({
    id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
    avatar: store.getState().project.avatar,
    createdAt: Date.now(), updatedAt: Date.now(),
  }));
}

describe('linkedEditingMiddleware + undoMiddleware (BUG-7)', () => {
  it('updatePiece on linked piece: single Ctrl+Z restores both pieces', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const aBefore = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bBefore = store.getState().project.pieces.find(p => p.id === 'b')!;
    const undoBeforeEdit = getUndoLength();

    const editedA = {
      ...aBefore,
      outline: [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [150, 0] },
        { type: 'L' as const, values: [150, 200] },
        { type: 'L' as const, values: [0, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(editedA));

    // Cascade applied: B mirrors A's outline (instance mode).
    const aAfter = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bAfter = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(aAfter.outline[1].values[0]).toBe(150);
    expect(bAfter.outline[1].values[0]).toBe(150);

    // Exactly ONE new undo entry for the linked edit (not two).
    expect(getUndoLength()).toBe(undoBeforeEdit + 1);

    // Single Ctrl+Z restores BOTH pieces atomically.
    store.dispatch({ type: 'editor/undo' });
    const aRestored = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bRestored = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(aRestored.outline).toEqual(aBefore.outline);
    expect(bRestored.outline).toEqual(bBefore.outline);
  });

  // Note on flip + symmetry geometry: flipping a symmetric rectangle around
  // its own center, then mirroring (symmetry-link) around the same axis, is
  // mathematically identity for the partner. So `bFlipped.outline` may equal
  // `bBefore.outline` in this fixture — that's correct semantically (the
  // pieces stay in valid symmetry). The invariants we DO check: the action
  // produces exactly one undo entry, and `editor/undo` restores both pieces.
  it('flipPieceH on linked piece: single Ctrl+Z restores both', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const aBefore = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bBefore = store.getState().project.pieces.find(p => p.id === 'b')!;
    const undoBeforeFlip = getUndoLength();

    store.dispatch({ type: 'project/flipPieceH', payload: 'a' });

    // A's outline changed (asymmetric rectangle would change visibly; this
    // symmetric one changes cmd order — see assertion below).
    const aFlipped = store.getState().project.pieces.find(p => p.id === 'a')!;
    expect(aFlipped.outline).not.toEqual(aBefore.outline);

    // ONE entry for the cascade.
    expect(getUndoLength()).toBe(undoBeforeFlip + 1);

    // Single undo restores both.
    store.dispatch({ type: 'editor/undo' });
    const aRestored = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bRestored = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(aRestored.outline).toEqual(aBefore.outline);
    expect(bRestored.outline).toEqual(bBefore.outline);
  });

  it('flipPieceV on linked piece: single Ctrl+Z restores both', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const aBefore = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bBefore = store.getState().project.pieces.find(p => p.id === 'b')!;
    const undoBeforeFlip = getUndoLength();

    store.dispatch({ type: 'project/flipPieceV', payload: 'a' });

    expect(getUndoLength()).toBe(undoBeforeFlip + 1);

    store.dispatch({ type: 'editor/undo' });
    const aRestored = store.getState().project.pieces.find(p => p.id === 'a')!;
    const bRestored = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(aRestored.outline).toEqual(aBefore.outline);
    expect(bRestored.outline).toEqual(bBefore.outline);
  });

  it('updatePiece on non-linked piece: normal single undo entry, no batch overhead', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('solo', 'Solo')));

    const before = store.getState().project.pieces.find(p => p.id === 'solo')!;
    const undoBeforeEdit = getUndoLength();

    const edited = { ...before, name: 'Renamed', updatedAt: Date.now() };
    store.dispatch(updatePiece(edited));

    // Exactly one entry — same as if the middleware wasn't there.
    expect(getUndoLength()).toBe(undoBeforeEdit + 1);

    store.dispatch({ type: 'editor/undo' });
    const restored = store.getState().project.pieces.find(p => p.id === 'solo')!;
    expect(restored.name).toBe('Solo');
  });

  it('redo after undo of linked edit: restores both pieces atomically', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const aOriginal = store.getState().project.pieces.find(p => p.id === 'a')!;
    const editedA = {
      ...aOriginal,
      outline: [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [200, 0] },
        { type: 'L' as const, values: [200, 200] },
        { type: 'L' as const, values: [0, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(editedA));

    // Undo first.
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces.find(p => p.id === 'a')!.outline[1].values[0]).toBe(100);
    expect(store.getState().project.pieces.find(p => p.id === 'b')!.outline[1].values[0]).toBe(100);

    // Redo — both pieces restore the post-edit state.
    store.dispatch({ type: 'editor/redo' });
    expect(store.getState().project.pieces.find(p => p.id === 'a')!.outline[1].values[0]).toBe(200);
    expect(store.getState().project.pieces.find(p => p.id === 'b')!.outline[1].values[0]).toBe(200);
  });

  it('addInternalLine on linked piece: single Ctrl+Z removes line from both', () => {
    const store = createStoreWithUndo();
    loadEmptyProject(store);
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const undoBeforeAdd = getUndoLength();

    const line: InternalLine = {
      id: 'line-1',
      type: 'dart',
      path: [
        { type: 'M', values: [50, 50] },
        { type: 'L', values: [50, 150] },
      ],
    };
    store.dispatch(addInternalLine({ pieceId: 'a', line }));

    // Both pieces have one line.
    expect(store.getState().project.pieces.find(p => p.id === 'a')!.internals).toHaveLength(1);
    expect(store.getState().project.pieces.find(p => p.id === 'b')!.internals).toHaveLength(1);

    // ONE entry.
    expect(getUndoLength()).toBe(undoBeforeAdd + 1);

    // Undo removes from both.
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces.find(p => p.id === 'a')!.internals).toHaveLength(0);
    expect(store.getState().project.pieces.find(p => p.id === 'b')!.internals).toHaveLength(0);
  });
});
