/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addTrim, removeTrim, updateTrim,
  removePiece, removePieces,
  cascadeEdgeRename, cascadeEdgeRemove,
} from '../projectSlice';
import type { Trim, TrimPlacement } from '../../types/trim';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePiece(id: string, edges: { name: string }[] = []) {
  return {
    id,
    name: id,
    outline: [],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    edges,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeTrim(id: string, pieceId: string, placement: TrimPlacement, overrides: Partial<Trim> = {}): Trim {
  return {
    id,
    pieceId,
    type: 'button',
    name: 'Test Trim',
    description: '',
    placement,
    material: 'plastic',
    color: '#333333',
    size: 15,
    unitCost: 0,
    active: true,
    ...overrides,
  };
}

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], pleats: [], elastics: [], trims: [] as Trim[],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [],
    referenceImages: [],
    trazos: [],
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    colorways: [],
    activeColorwayId: null,
    ...overrides,
  };
}

// ─── addTrim ────────────────────────────────────────────────────────────────

describe('projectSlice — Trim CRUD', () => {
  it('addTrim count-mode success', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const trim = makeTrim('t1', 'p1', { mode: 'count', quantity: 4 });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].id).toBe('t1');
    expect(next.isDirty).toBe(true);
  });

  it('addTrim edge-mode success', () => {
    const state = baseState({ pieces: [makePiece('p1', [{ name: 'hemline' }])] });
    const trim = makeTrim('t1', 'p1', { mode: 'edge', edgeName: 'hemline', tStart: 0, tEnd: 1 });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].placement).toEqual({ mode: 'edge', edgeName: 'hemline', tStart: 0, tEnd: 1 });
    expect(next.isDirty).toBe(true);
  });

  it('addTrim rejects missing piece', () => {
    const state = baseState({ pieces: [] });
    const trim = makeTrim('t1', 'no-such-piece', { mode: 'count', quantity: 1 });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(0);
    expect(next.isDirty).toBe(false);
  });

  it('addTrim rejects missing edge (edge-mode)', () => {
    const state = baseState({ pieces: [makePiece('p1', [{ name: 'armhole' }])] });
    const trim = makeTrim('t1', 'p1', { mode: 'edge', edgeName: 'no-such-edge', tStart: 0, tEnd: 1 });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(0);
    expect(next.isDirty).toBe(false);
  });

  it('addTrim rejects tStart >= tEnd (edge-mode)', () => {
    const state = baseState({ pieces: [makePiece('p1', [{ name: 'hemline' }])] });
    const trim = makeTrim('t1', 'p1', { mode: 'edge', edgeName: 'hemline', tStart: 0.5, tEnd: 0.5 });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(0);
  });

  it('addTrim sets isDirty', () => {
    const state = baseState({ pieces: [makePiece('p1')], isDirty: false });
    const trim = makeTrim('t1', 'p1', { mode: 'count', quantity: 2 });
    const next = reducer(state, addTrim(trim));
    expect(next.isDirty).toBe(true);
  });

  it('addTrim point-mode success', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const trim = makeTrim('t1', 'p1', { mode: 'point', positions: [{ x: 10, y: 20 }, { x: 30, y: 40 }] });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].placement).toEqual({ mode: 'point', positions: [{ x: 10, y: 20 }, { x: 30, y: 40 }] });
    expect(next.isDirty).toBe(true);
  });

  it('addTrim rejects point-mode with empty positions', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const trim = makeTrim('t1', 'p1', { mode: 'point', positions: [] });
    const next = reducer(state, addTrim(trim));
    expect(next.trims).toHaveLength(0);
    expect(next.isDirty).toBe(false);
  });

  // ─── removeTrim ─────────────────────────────────────────────────────────

  it('removeTrim removes by ID', () => {
    const trim = makeTrim('t1', 'p1', { mode: 'count', quantity: 1 });
    const state = baseState({ pieces: [makePiece('p1')], trims: [trim] });
    const next = reducer(state, removeTrim('t1'));
    expect(next.trims).toHaveLength(0);
    expect(next.isDirty).toBe(true);
  });

  it('removeTrim safe when not found', () => {
    const state = baseState({ trims: [] });
    const next = reducer(state, removeTrim('nonexistent'));
    expect(next.trims).toHaveLength(0);
  });

  // ─── updateTrim ─────────────────────────────────────────────────────────

  it('updateTrim updates fields', () => {
    const trim = makeTrim('t1', 'p1', { mode: 'count', quantity: 1 });
    const state = baseState({ pieces: [makePiece('p1')], trims: [trim] });
    const next = reducer(state, updateTrim({ id: 't1', name: 'Updated', size: 20 }));
    expect(next.trims[0].name).toBe('Updated');
    expect(next.trims[0].size).toBe(20);
    expect(next.isDirty).toBe(true);
  });

  it('updateTrim no-op when not found', () => {
    const state = baseState({ trims: [] });
    const next = reducer(state, updateTrim({ id: 'nonexistent', name: 'X' }));
    expect(next.trims).toHaveLength(0);
    expect(next.isDirty).toBe(false);
  });

  it('updateTrim validates pieceId change', () => {
    const trim = makeTrim('t1', 'p1', { mode: 'count', quantity: 1 });
    const state = baseState({ pieces: [makePiece('p1')], trims: [trim] });
    // Attempt to move trim to non-existent piece
    const next = reducer(state, updateTrim({ id: 't1', pieceId: 'no-piece' }));
    // Should be a no-op: trim stays unchanged
    expect(next.trims[0].pieceId).toBe('p1');
    expect(next.isDirty).toBe(false);
  });
});

// ─── Cascades ───────────────────────────────────────────────────────────────

describe('projectSlice — Trim Cascades', () => {
  it('removePiece cleans up trims for that piece', () => {
    const trim1 = makeTrim('t1', 'p1', { mode: 'count', quantity: 1 });
    const trim2 = makeTrim('t2', 'p2', { mode: 'count', quantity: 2 });
    const state = baseState({
      pieces: [makePiece('p1'), makePiece('p2')],
      trims: [trim1, trim2],
    });
    const next = reducer(state, removePiece('p1'));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].id).toBe('t2');
  });

  it('removePieces cleans up trims for those pieces', () => {
    const trim1 = makeTrim('t1', 'p1', { mode: 'count', quantity: 1 });
    const trim2 = makeTrim('t2', 'p2', { mode: 'edge', edgeName: 'hem', tStart: 0, tEnd: 1 });
    const trim3 = makeTrim('t3', 'p3', { mode: 'count', quantity: 3 });
    const state = baseState({
      pieces: [makePiece('p1'), makePiece('p2'), makePiece('p3')],
      trims: [trim1, trim2, trim3],
    });
    const next = reducer(state, removePieces(['p1', 'p2']));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].id).toBe('t3');
  });

  it('cascadeEdgeRename updates edge-mode trims only', () => {
    const edgeTrim = makeTrim('t1', 'p1', { mode: 'edge', edgeName: 'old-hem', tStart: 0, tEnd: 1 });
    const countTrim = makeTrim('t2', 'p1', { mode: 'count', quantity: 4 });
    const state = baseState({
      pieces: [makePiece('p1', [{ name: 'old-hem' }])],
      trims: [edgeTrim, countTrim],
    });
    const next = reducer(state, cascadeEdgeRename({ pieceId: 'p1', oldName: 'old-hem', newName: 'new-hem' }));
    // Edge-mode trim should be renamed
    expect(next.trims[0].placement).toEqual({ mode: 'edge', edgeName: 'new-hem', tStart: 0, tEnd: 1 });
    // Count-mode trim should be untouched
    expect(next.trims[1].placement).toEqual({ mode: 'count', quantity: 4 });
  });

  it('cascadeEdgeRemove removes edge-mode trims, count survives', () => {
    const edgeTrim = makeTrim('t1', 'p1', { mode: 'edge', edgeName: 'hemline', tStart: 0, tEnd: 1 });
    const countTrim = makeTrim('t2', 'p1', { mode: 'count', quantity: 4 });
    const state = baseState({
      pieces: [makePiece('p1', [{ name: 'hemline' }])],
      trims: [edgeTrim, countTrim],
    });
    const next = reducer(state, cascadeEdgeRemove({ pieceId: 'p1', edgeName: 'hemline' }));
    expect(next.trims).toHaveLength(1);
    expect(next.trims[0].id).toBe('t2');
    expect(next.trims[0].placement.mode).toBe('count');
  });
});
