/**
 * Tests for confirmationMiddleware
 *
 * Covers:
 * - Non-destructive actions pass through
 * - Normal mode: removePiece / removeSeam / construction/removePoint → modal
 * - Expert mode: destructive actions pass through
 * - Override 'always': shows confirmation even in expert mode
 * - Override 'never': passes through even in normal mode
 * - meta.skipConfirmation: bypasses gate in normal mode
 * - tools/setToolOption mirrors into workflow.toolMemory
 * - tools/setToolOption with meta.fromToolMemory does NOT mirror
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import workflowReducer, { setExpertMode, setConfirmOverride } from '../workflowSlice';
import copilotUIReducer from '../copilotUISlice';
import projectReducer from '../projectSlice';
import constructionReducer from '../constructionSlice';
import { createConfirmationMiddleware } from '../confirmationMiddleware';

// ─── Store factory ────────────────────────────────────────────────────────────

function makeStore(expertMode = false) {
  const store = configureStore({
    reducer: {
      workflow: workflowReducer,
      copilotUI: copilotUIReducer,
      project: projectReducer,
      construction: constructionReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(
        createConfirmationMiddleware()
      ),
  });
  if (expertMode) store.dispatch(setExpertMode(true));
  return store;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPendingConfirmation(store: ReturnType<typeof makeStore>) {
  return store.getState().copilotUI.pendingConfirmation;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('confirmationMiddleware', () => {
  // ── Non-destructive pass-through ─────────────────────────────────────────

  it('passes through non-destructive actions without showing a modal', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/addPiece', payload: { id: 'p1' } });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through unknown action types', () => {
    const store = makeStore();
    store.dispatch({ type: 'some/unknownAction', payload: 42 });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── Normal mode: destructive actions trigger modal ────────────────────────

  it('shows confirmation for project/removePiece in normal mode', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.source).toBe('middleware');
    expect(confirmation!.title).toBe('Remove Pattern Piece');
    expect(confirmation!.destructive).toBe(true);
    expect(confirmation!.reduxAction).toEqual({
      type: 'project/removePiece',
      payload: 'piece-1',
    });
  });

  it('shows confirmation for project/removePieces (plural) with dynamic title', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePieces', payload: ['p1', 'p2', 'p3'] });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.title).toBe('Remove 3 Pattern Pieces');
    expect(confirmation!.consequences[0]).toBe('3 pattern pieces will be permanently deleted.');
  });

  it('shows confirmation for project/removePieces (singular) with single piece', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePieces', payload: ['p1'] });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.title).toBe('Remove Pattern Piece');
  });

  it('shows confirmation for project/removeSeam in normal mode', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removeSeam', payload: 'seam-1' });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.source).toBe('middleware');
    expect(confirmation!.title).toBe('Remove Seam');
    expect(confirmation!.destructive).toBe(true);
    expect(confirmation!.reduxAction).toEqual({
      type: 'project/removeSeam',
      payload: 'seam-1',
    });
  });

  it('shows confirmation for construction/removePoint in normal mode', () => {
    const store = makeStore();
    store.dispatch({ type: 'construction/removePoint', payload: 'pt-1' });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.source).toBe('middleware');
    expect(confirmation!.title).toBe('Remove Construction Point');
    expect(confirmation!.destructive).toBe(true);
    expect(confirmation!.reduxAction).toEqual({
      type: 'construction/removePoint',
      payload: 'pt-1',
    });
  });

  it('includes non-empty consequences array in confirmation', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });

    const confirmation = getPendingConfirmation(store);
    expect(Array.isArray(confirmation!.consequences)).toBe(true);
    expect(confirmation!.consequences.length).toBeGreaterThan(0);
  });

  // ── Blocked actions do not mutate state ──────────────────────────────────

  it('does NOT dispatch removePiece to project reducer when blocked', () => {
    const store = makeStore();
    // Add a piece first using a raw payload that project reducer understands
    store.dispatch({
      type: 'project/restoreState',
      payload: {
        ...store.getState().project,
        pieces: [
          {
            id: 'p1', name: 'Front', outline: [], internals: [],
            position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
            seamAllowance: 10, createdAt: 0, updatedAt: 0,
          },
        ],
      },
    });

    store.dispatch({ type: 'project/removePiece', payload: 'p1' });

    // Piece should still be present — action was blocked
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  // ── Expert mode: destructive actions pass through ─────────────────────────

  it('passes through removePiece in expert mode without modal', () => {
    const store = makeStore(true /* expertMode */);
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through removeSeam in expert mode without modal', () => {
    const store = makeStore(true);
    store.dispatch({ type: 'project/removeSeam', payload: 'seam-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through construction/removePoint in expert mode without modal', () => {
    const store = makeStore(true);
    store.dispatch({ type: 'construction/removePoint', payload: 'pt-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── Override 'always': shows modal even in expert mode ───────────────────

  it("override 'always' shows confirmation even in expert mode", () => {
    const store = makeStore(true /* expertMode */);
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.source).toBe('middleware');
  });

  it("override 'always' shows confirmation in normal mode too", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removeSeam', value: 'always' }));
    store.dispatch({ type: 'project/removeSeam', payload: 'seam-1' });

    expect(getPendingConfirmation(store)).not.toBeNull();
  });

  // ── Override 'never': passes through even in normal mode ─────────────────

  it("override 'never' passes through in normal mode without modal", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'never' }));
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });

    expect(getPendingConfirmation(store)).toBeNull();
  });

  it("override 'never' passes through in expert mode without modal", () => {
    const store = makeStore(true);
    store.dispatch(setConfirmOverride({ operation: 'removePoint', value: 'never' }));
    store.dispatch({ type: 'construction/removePoint', payload: 'pt-1' });

    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── meta.skipConfirmation bypass ─────────────────────────────────────────

  it('passes through when meta.skipConfirmation is true (normal mode)', () => {
    const store = makeStore();
    store.dispatch({
      type: 'project/removePiece',
      payload: 'piece-1',
      meta: { skipConfirmation: true },
    });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through when meta.skipConfirmation is true (override always)', () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
    store.dispatch({
      type: 'project/removePiece',
      payload: 'piece-1',
      meta: { skipConfirmation: true },
    });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── tools/setToolOption → mirrors into workflow.toolMemory ───────────────

  it('mirrors setToolOption into workflow.toolMemory', () => {
    const store = makeStore();
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'width', value: 1.5 },
    });

    const memory = store.getState().workflow.toolMemory;
    expect(memory['seam']).toEqual({ width: 1.5 });
  });

  it('mirrors multiple setToolOption dispatches and merges them', () => {
    const store = makeStore();
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'width', value: 1.5 },
    });
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'style', value: 'french' },
    });

    const memory = store.getState().workflow.toolMemory;
    expect(memory['seam']).toEqual({ width: 1.5, style: 'french' });
  });

  it('mirrors setToolOption for different tools independently', () => {
    const store = makeStore();
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'width', value: 1.5 },
    });
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'hem', optionId: 'depth', value: 3.0 },
    });

    const memory = store.getState().workflow.toolMemory;
    expect(memory['seam']).toEqual({ width: 1.5 });
    expect(memory['hem']).toEqual({ depth: 3.0 });
  });

  it('does NOT mirror setToolOption when meta.fromToolMemory is true', () => {
    const store = makeStore();
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'width', value: 99 },
      meta: { fromToolMemory: true },
    });

    const memory = store.getState().workflow.toolMemory;
    expect(memory['seam']).toBeUndefined();
  });

  it('does NOT show confirmation for setToolOption', () => {
    const store = makeStore();
    store.dispatch({
      type: 'tools/setToolOption',
      payload: { toolId: 'seam', optionId: 'width', value: 1.5 },
    });
    expect(getPendingConfirmation(store)).toBeNull();
  });
});
