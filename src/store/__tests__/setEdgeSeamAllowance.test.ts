import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, setEdgeSeamAllowance } from '../projectSlice';
import type { PatternPiece, SemanticEdge } from '../../types/types';

function makeStore() {
  return configureStore({ reducer: { project: projectReducer } });
}

function piece(edges: SemanticEdge[]): PatternPiece {
  const now = Date.now();
  return {
    id: 'p1', name: 'Front', outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 10, internals: [], edges, createdAt: now, updatedAt: now,
  } as PatternPiece;
}

const topEdge: SemanticEdge = { id: 'p1:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' };

describe('setEdgeSeamAllowance', () => {
  it('sets the per-edge seam allowance width on the matching edge', () => {
    const store = makeStore();
    store.dispatch(addPiece(piece([{ ...topEdge }])));
    store.dispatch(setEdgeSeamAllowance({ pieceId: 'p1', edgeId: 'p1:top', width: 40 }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p1:top')!;
    expect(e.seamAllowanceWidth).toBe(40);
  });

  it('clears the per-edge width back to inherit when width is null', () => {
    const store = makeStore();
    store.dispatch(addPiece(piece([{ ...topEdge, seamAllowanceWidth: 40 }])));
    store.dispatch(setEdgeSeamAllowance({ pieceId: 'p1', edgeId: 'p1:top', width: null }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p1:top')!;
    expect(e.seamAllowanceWidth).toBeUndefined();
  });

  it('is a no-op for an unknown edge id (no crash)', () => {
    const store = makeStore();
    store.dispatch(addPiece(piece([{ ...topEdge }])));
    store.dispatch(setEdgeSeamAllowance({ pieceId: 'p1', edgeId: 'p1:nope', width: 40 }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p1:top')!;
    expect(e.seamAllowanceWidth).toBeUndefined();
  });

  it('clamps negative widths to 0', () => {
    const store = makeStore();
    store.dispatch(addPiece(piece([{ ...topEdge }])));
    store.dispatch(setEdgeSeamAllowance({ pieceId: 'p1', edgeId: 'p1:top', width: -5 }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p1:top')!;
    expect(e.seamAllowanceWidth).toBe(0);
  });
});
