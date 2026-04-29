/**
 * Tests for confirmationMiddleware
 *
 * Covers:
 * - Non-destructive actions pass through
 * - Default mode: destructive actions pass through (undoable via Ctrl+Z)
 * - Override 'always': shows confirmation modal
 * - Override 'never': passes through even with 'always' would block
 * - meta.skipConfirmation: bypasses gate regardless
 * - tools/setToolOption mirrors into workflow.toolMemory
 * - tools/setToolOption with meta.fromToolMemory does NOT mirror
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import workflowReducer, { setConfirmOverride } from '../workflowSlice';
import copilotUIReducer from '../copilotUISlice';
import projectReducer from '../projectSlice';
import constructionReducer from '../constructionSlice';
import { confirmationMiddleware } from '../confirmationMiddleware';

// ─── Store factory ────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      workflow: workflowReducer,
      copilotUI: copilotUIReducer,
      project: projectReducer,
      construction: constructionReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(
        confirmationMiddleware
      ),
  });
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

  // ── Default: destructive actions pass through (undoable) ─────────────────

  it('passes through removePiece by default (undoable via Ctrl+Z)', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through removePieces by default', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removePieces', payload: ['p1', 'p2'] });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through removeSeam by default', () => {
    const store = makeStore();
    store.dispatch({ type: 'project/removeSeam', payload: 'seam-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  it('passes through construction/removePoint by default', () => {
    const store = makeStore();
    store.dispatch({ type: 'construction/removePoint', payload: 'pt-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── Override 'always': shows modal ──────────────────────────────────────

  it("override 'always' shows confirmation for removePiece", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
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

  it("override 'always' shows confirmation for removeSeam", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removeSeam', value: 'always' }));
    store.dispatch({ type: 'project/removeSeam', payload: 'seam-1' });

    expect(getPendingConfirmation(store)).not.toBeNull();
  });

  it("override 'always' shows confirmation for removePieces with dynamic title", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePieces', value: 'always' }));
    store.dispatch({ type: 'project/removePieces', payload: ['p1', 'p2', 'p3'] });

    const confirmation = getPendingConfirmation(store);
    expect(confirmation).not.toBeNull();
    expect(confirmation!.title).toBe('Remove 3 Pattern Pieces');
    expect(confirmation!.consequences[0]).toBe('3 pattern pieces will be deleted.');
  });

  it("override 'always' includes consequences", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });

    const confirmation = getPendingConfirmation(store);
    expect(Array.isArray(confirmation!.consequences)).toBe(true);
    expect(confirmation!.consequences.length).toBeGreaterThan(0);
  });

  it("override 'always' blocks the action from reaching the reducer", () => {
    const store = makeStore();
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

    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
    store.dispatch({ type: 'project/removePiece', payload: 'p1' });

    // Piece should still be present — action was blocked
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  // ── Override 'never': always passes through ─────────────────────────────

  it("override 'never' passes through without modal", () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'never' }));
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });
    expect(getPendingConfirmation(store)).toBeNull();
  });

  // ── meta.skipConfirmation bypass ─────────────────────────────────────────

  it('meta.skipConfirmation bypasses even override always', () => {
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
