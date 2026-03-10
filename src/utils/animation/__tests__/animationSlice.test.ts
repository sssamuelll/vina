// src/utils/animation/__tests__/animationSlice.test.ts
import { describe, it, expect } from 'vitest';
import animationReducer, {
  setDuration, setFps, setCurrentFrame, setPlaybackState,
  addTrack, removeTrack, insertKeyframe,
  moveKeyframe,
  resetAnimation,
} from '../../../store/animationSlice';
import type { AnimationTrack, Keyframe } from '../types';

const makeTrack = (id: string): AnimationTrack => ({
  id, objectType: 'camera', objectId: 'main-camera', label: 'Camera',
  expanded: false,
  properties: [
    { id: `${id}-pos-x`, path: 'position.x', label: 'Position X', keyframes: [] },
  ],
});

describe('animationSlice', () => {
  it('sets duration with minimum of 1', () => {
    const state = animationReducer(undefined, setDuration(0));
    expect(state.duration).toBe(1);
  });

  it('clamps currentFrame to valid range', () => {
    let state = animationReducer(undefined, setFps(24));
    state = animationReducer(state, setDuration(1)); // 24 frames
    state = animationReducer(state, setCurrentFrame(100));
    expect(state.currentFrame).toBe(23);
  });

  it('adds and removes tracks', () => {
    let state = animationReducer(undefined, addTrack(makeTrack('t1')));
    expect(state.tracks).toHaveLength(1);
    state = animationReducer(state, removeTrack('t1'));
    expect(state.tracks).toHaveLength(0);
  });

  it('inserts keyframes sorted by frame', () => {
    let state = animationReducer(undefined, addTrack(makeTrack('t1')));
    const kf1: Keyframe = { frame: 10, value: 5, interpolation: 'linear' };
    const kf2: Keyframe = { frame: 5, value: 3, interpolation: 'linear' };
    state = animationReducer(state, insertKeyframe({ trackId: 't1', propertyId: 't1-pos-x', keyframe: kf1 }));
    state = animationReducer(state, insertKeyframe({ trackId: 't1', propertyId: 't1-pos-x', keyframe: kf2 }));
    const kfs = state.tracks[0].properties[0].keyframes;
    expect(kfs).toHaveLength(2);
    expect(kfs[0].frame).toBe(5);
    expect(kfs[1].frame).toBe(10);
  });

  it('replaces keyframe at same frame', () => {
    let state = animationReducer(undefined, addTrack(makeTrack('t1')));
    state = animationReducer(state, insertKeyframe({
      trackId: 't1', propertyId: 't1-pos-x',
      keyframe: { frame: 10, value: 5, interpolation: 'linear' },
    }));
    state = animationReducer(state, insertKeyframe({
      trackId: 't1', propertyId: 't1-pos-x',
      keyframe: { frame: 10, value: 99, interpolation: 'easeIn' },
    }));
    const kfs = state.tracks[0].properties[0].keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs[0].value).toBe(99);
  });

  it('moves keyframe and re-sorts', () => {
    let state = animationReducer(undefined, addTrack(makeTrack('t1')));
    state = animationReducer(state, insertKeyframe({
      trackId: 't1', propertyId: 't1-pos-x',
      keyframe: { frame: 5, value: 1, interpolation: 'linear' },
    }));
    state = animationReducer(state, insertKeyframe({
      trackId: 't1', propertyId: 't1-pos-x',
      keyframe: { frame: 10, value: 2, interpolation: 'linear' },
    }));
    state = animationReducer(state, moveKeyframe({
      trackId: 't1', propertyId: 't1-pos-x', fromFrame: 5, toFrame: 15,
    }));
    const kfs = state.tracks[0].properties[0].keyframes;
    expect(kfs[0].frame).toBe(10);
    expect(kfs[1].frame).toBe(15);
  });

  it('resets to initial state', () => {
    let state = animationReducer(undefined, addTrack(makeTrack('t1')));
    state = animationReducer(state, setPlaybackState('playing'));
    state = animationReducer(state, resetAnimation());
    expect(state.tracks).toHaveLength(0);
    expect(state.playbackState).toBe('stopped');
  });
});
