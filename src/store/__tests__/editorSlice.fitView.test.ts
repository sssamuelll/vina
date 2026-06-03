import { describe, it, expect } from 'vitest';
import editorReducer, { requestFitView, setZoom2D, computeFitView } from '../editorSlice';
import { NEW_PROJECT } from '../actions';
import type { Point2D } from '../../types/types';

// A 100×100 square at the given top-left offset, in the shape computeFitView expects.
const square = (x: number, y: number) => ({
  position: { x, y } as Point2D,
  outline: [{ values: [0, 0, 100, 0, 100, 100, 0, 100] }],
});

describe('editorSlice — requestFitView token', () => {
  it('starts at 0', () => {
    const state = editorReducer(undefined, { type: '@@INIT' });
    expect(state.fitViewToken).toBe(0);
  });

  it('increments monotonically on each requestFitView', () => {
    let state = editorReducer(undefined, { type: '@@INIT' });
    state = editorReducer(state, requestFitView());
    expect(state.fitViewToken).toBe(1);
    state = editorReducer(state, requestFitView());
    expect(state.fitViewToken).toBe(2);
  });

  it('survives NEW_PROJECT reset so a fresh import still fits (token never collides)', () => {
    let state = editorReducer(undefined, { type: '@@INIT' });
    state = editorReducer(state, requestFitView()); // token = 1, fits the first pattern
    state = editorReducer(state, NEW_PROJECT()); // File ▸ New resets the editor...
    expect(state.fitViewToken).toBe(1); // ...but the token is preserved (monotonic)
    state = editorReducer(state, requestFitView()); // next import → 2, never equals the prior 1
    expect(state.fitViewToken).toBe(2);
  });

  it('NEW_PROJECT still resets the rest of the editor view', () => {
    let state = editorReducer(undefined, { type: '@@INIT' });
    state = editorReducer(state, setZoom2D(4));
    expect(state.zoom2D).toBe(4);
    state = editorReducer(state, NEW_PROJECT());
    expect(state.zoom2D).toBe(1); // back to initial
    expect(state.pan2D).toEqual({ x: 0, y: 0 });
  });
});

describe('computeFitView', () => {
  it('returns null when there are no pieces', () => {
    expect(computeFitView([], 800, 600)).toBeNull();
  });

  it('returns null for a zero-area viewport', () => {
    expect(computeFitView([square(0, 0)], 0, 600)).toBeNull();
  });

  it('centers content in the viewport', () => {
    const fit = computeFitView([square(0, 0)], 800, 600);
    expect(fit).not.toBeNull();
    // screen = pan + world * zoom; content center (50,50) must land at viewport center.
    expect(fit!.pan.x + 50 * fit!.zoom).toBeCloseTo(400, 5);
    expect(fit!.pan.y + 50 * fit!.zoom).toBeCloseTo(300, 5);
  });

  it('accounts for piece position offset when centering', () => {
    const fit = computeFitView([square(200, 100)], 800, 600);
    expect(fit).not.toBeNull();
    // content center is now (250,150).
    expect(fit!.pan.x + 250 * fit!.zoom).toBeCloseTo(400, 5);
    expect(fit!.pan.y + 150 * fit!.zoom).toBeCloseTo(300, 5);
  });

  it('caps zoom at 5 and keeps it positive', () => {
    const fit = computeFitView([square(0, 0)], 800, 600);
    expect(fit).not.toBeNull();
    expect(fit!.zoom).toBeLessThanOrEqual(5);
    expect(fit!.zoom).toBeGreaterThan(0);
  });

  it('encloses a multi-piece layout (both pieces inside the framed content)', () => {
    const fit = computeFitView([square(0, 0), square(300, 0)], 800, 600);
    expect(fit).not.toBeNull();
    // combined content center is (200, 50): (0..400) x, (0..100) y.
    expect(fit!.pan.x + 200 * fit!.zoom).toBeCloseTo(400, 5);
    expect(fit!.pan.y + 50 * fit!.zoom).toBeCloseTo(300, 5);
  });

  it('accounts for piece rotation when framing (rotated content needs a smaller zoom)', () => {
    const sq = { position: { x: 0, y: 0 }, outline: [{ values: [0, 0, 100, 0, 100, 100, 0, 100] }] };
    const flat = computeFitView([{ ...sq, rotation: 0 }], 800, 600);
    const rotated = computeFitView([{ ...sq, rotation: 45 }], 800, 600);
    expect(flat).not.toBeNull();
    expect(rotated).not.toBeNull();
    // The 45°-rotated square's bbox is the ~141px diagonal, so it must zoom out further.
    expect(rotated!.zoom).toBeLessThan(flat!.zoom);
  });
});
