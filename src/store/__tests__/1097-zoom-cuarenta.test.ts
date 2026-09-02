import { describe, it, expect } from 'vitest';
import editorReducer, { setZoom2D } from '../editorSlice';

describe('#1097 — editorSlice.setZoom2D: tope subió de 10 a 40', () => {
  it('acepta 40', () => {
    const state = editorReducer(undefined, setZoom2D(40));
    expect(state.zoom2D).toBe(40);
  });

  it('clava por encima de 40 en 40, no en 10', () => {
    const state = editorReducer(undefined, setZoom2D(100));
    expect(state.zoom2D).toBe(40);
  });

  it('el piso sigue en 0.1', () => {
    const state = editorReducer(undefined, setZoom2D(-5));
    expect(state.zoom2D).toBe(0.1);
  });
});
