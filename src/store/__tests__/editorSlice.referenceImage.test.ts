import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, {
  toggleReferenceImages,
  setShowReferenceImages,
  setSelectedReferenceImage,
  startCalibration,
  setCalibrationPoint1,
  cancelCalibration,
} from '../editorSlice';

function createStore() {
  return configureStore({
    reducer: { editor: editorReducer },
  });
}

describe('editorSlice — referenceImage state', () => {
  it('toggleReferenceImages flips showReferenceImages', () => {
    const store = createStore();
    // initial value is true
    expect(store.getState().editor.showReferenceImages).toBe(true);
    store.dispatch(toggleReferenceImages());
    expect(store.getState().editor.showReferenceImages).toBe(false);
    store.dispatch(toggleReferenceImages());
    expect(store.getState().editor.showReferenceImages).toBe(true);
  });

  it('setShowReferenceImages sets explicit value', () => {
    const store = createStore();
    store.dispatch(setShowReferenceImages(false));
    expect(store.getState().editor.showReferenceImages).toBe(false);
    store.dispatch(setShowReferenceImages(true));
    expect(store.getState().editor.showReferenceImages).toBe(true);
  });

  it('setSelectedReferenceImage stores id', () => {
    const store = createStore();
    store.dispatch(setSelectedReferenceImage('img-abc'));
    expect(store.getState().editor.selectedReferenceImageId).toBe('img-abc');
  });

  it('setSelectedReferenceImage clears with null', () => {
    const store = createStore();
    store.dispatch(setSelectedReferenceImage('img-abc'));
    store.dispatch(setSelectedReferenceImage(null));
    expect(store.getState().editor.selectedReferenceImageId).toBeNull();
  });

  it('startCalibration sets calibrationMode with imageId and null point1', () => {
    const store = createStore();
    store.dispatch(startCalibration({ imageId: 'img-xyz' }));
    const cal = store.getState().editor.calibrationMode;
    expect(cal).not.toBeNull();
    expect(cal?.imageId).toBe('img-xyz');
    expect(cal?.point1).toBeNull();
  });

  it('setCalibrationPoint1 stores point when calibrationMode active', () => {
    const store = createStore();
    store.dispatch(startCalibration({ imageId: 'img-xyz' }));
    store.dispatch(setCalibrationPoint1({ x: 10, y: 20 }));
    const cal = store.getState().editor.calibrationMode;
    expect(cal?.point1).toEqual({ x: 10, y: 20 });
  });

  it('setCalibrationPoint1 is no-op when calibrationMode is null', () => {
    const store = createStore();
    // calibrationMode starts as null
    expect(store.getState().editor.calibrationMode).toBeNull();
    store.dispatch(setCalibrationPoint1({ x: 10, y: 20 }));
    // still null — no crash, no state change
    expect(store.getState().editor.calibrationMode).toBeNull();
  });

  it('cancelCalibration clears calibrationMode', () => {
    const store = createStore();
    store.dispatch(startCalibration({ imageId: 'img-xyz' }));
    store.dispatch(cancelCalibration());
    expect(store.getState().editor.calibrationMode).toBeNull();
  });
});
