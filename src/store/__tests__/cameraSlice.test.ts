import { describe, it, expect } from 'vitest';
import cameraReducer, {
  setCameraPreset,
  focusOnPiece,
  clearCameraRequest,
  type ViewPreset,
} from '../cameraSlice';

describe('cameraSlice', () => {
  it('sets a camera preset request', () => {
    const state = cameraReducer(undefined, setCameraPreset('front'));
    expect(state.pendingPreset).toBe('front');
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('sets a focus piece request', () => {
    const state = cameraReducer(undefined, focusOnPiece('piece-123'));
    expect(state.pendingFocusPieceId).toBe('piece-123');
    expect(state.pendingPreset).toBeNull();
  });

  it('clears camera request', () => {
    let state = cameraReducer(undefined, setCameraPreset('back'));
    state = cameraReducer(state, clearCameraRequest());
    expect(state.pendingPreset).toBeNull();
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('preset request clears focus request', () => {
    let state = cameraReducer(undefined, focusOnPiece('piece-1'));
    state = cameraReducer(state, setCameraPreset('top'));
    expect(state.pendingPreset).toBe('top');
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('focus request clears preset request', () => {
    let state = cameraReducer(undefined, setCameraPreset('left'));
    state = cameraReducer(state, focusOnPiece('piece-2'));
    expect(state.pendingFocusPieceId).toBe('piece-2');
    expect(state.pendingPreset).toBeNull();
  });

  it('exports all 8 view presets as type', () => {
    const presets: ViewPreset[] = [
      'front', 'back', 'left', 'right', 'top', 'bottom',
      'threeQuarterLeft', 'threeQuarterRight',
    ];
    expect(presets).toHaveLength(8);
  });
});
