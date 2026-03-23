import { describe, it, expect } from 'vitest';
import reducer from '../simulationSlice';
import {
  toggleLayerVisibility, showAllLayers, setLayerOutlineColor,
  setXrayMode, setXrayActiveLayer, cleanupRemovedLayer,
} from '../simulationSlice';

function emptyState() {
  return reducer(undefined, { type: '@@INIT' });
}

describe('toggleLayerVisibility', () => {
  it('hides a layer', () => {
    const next = reducer(emptyState(), toggleLayerVisibility(2));
    expect(next.hiddenLayerIds).toContain(2);
  });

  it('unhides a layer on second toggle', () => {
    let state = reducer(emptyState(), toggleLayerVisibility(2));
    state = reducer(state, toggleLayerVisibility(2));
    expect(state.hiddenLayerIds).not.toContain(2);
  });
});

describe('showAllLayers', () => {
  it('clears all hidden layers', () => {
    let state = reducer(emptyState(), toggleLayerVisibility(0));
    state = reducer(state, toggleLayerVisibility(2));
    state = reducer(state, showAllLayers());
    expect(state.hiddenLayerIds).toEqual([]);
  });
});

describe('setLayerOutlineColor', () => {
  it('sets a custom outline color', () => {
    const next = reducer(emptyState(), setLayerOutlineColor({ layer: 1, color: '#ff0000' }));
    expect(next.layerOutlineColors[1]).toBe('#ff0000');
  });
});

describe('setXrayMode', () => {
  it('enables X-ray and snapshots opacity', () => {
    let state = emptyState();
    state = { ...state, pieceOpacity: { p1: 0.8, p2: 0.5 } };
    const next = reducer(state, setXrayMode({ enabled: true, activeLayer: 1 }));
    expect(next.xrayMode).toBe(true);
    expect(next.xrayActiveLayer).toBe(1);
    expect(next.xrayOpacitySnapshot).toEqual({ p1: 0.8, p2: 0.5 });
  });

  it('disables X-ray and restores opacity snapshot', () => {
    let state = emptyState();
    state = { ...state, pieceOpacity: { p1: 0.8 } };
    state = reducer(state, setXrayMode({ enabled: true, activeLayer: 1 }));
    state = { ...state, pieceOpacity: { p1: 0.2, p2: 0.2 } };
    const next = reducer(state, setXrayMode({ enabled: false }));
    expect(next.xrayMode).toBe(false);
    expect(next.pieceOpacity).toEqual({ p1: 0.8 });
    expect(next.xrayOpacitySnapshot).toBeNull();
  });
});

describe('setXrayActiveLayer', () => {
  it('changes the active layer during X-ray', () => {
    let state = reducer(emptyState(), setXrayMode({ enabled: true, activeLayer: 1 }));
    state = reducer(state, setXrayActiveLayer(2));
    expect(state.xrayActiveLayer).toBe(2);
  });
});

describe('cleanupRemovedLayer', () => {
  it('removes layer from hiddenLayerIds', () => {
    let state = reducer(emptyState(), toggleLayerVisibility(2));
    state = reducer(state, cleanupRemovedLayer(2));
    expect(state.hiddenLayerIds).not.toContain(2);
  });

  it('removes layer outline color', () => {
    let state = reducer(emptyState(), setLayerOutlineColor({ layer: 2, color: '#ff0000' }));
    state = reducer(state, cleanupRemovedLayer(2));
    expect(state.layerOutlineColors[2]).toBeUndefined();
  });

  it('clears xrayActiveLayer if it matches', () => {
    let state = reducer(emptyState(), setXrayMode({ enabled: true, activeLayer: 2 }));
    state = reducer(state, cleanupRemovedLayer(2));
    expect(state.xrayActiveLayer).toBeNull();
  });
});
