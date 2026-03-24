// src/store/animationSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AnimationTrack, Keyframe, PlaybackState, FpsOption, InterpolationType } from '../utils/animation/types';
import { NEW_PROJECT } from './actions';

interface AnimationState {
  duration: number;
  fps: FpsOption;
  currentFrame: number;
  playbackState: PlaybackState;
  loop: boolean;
  autoKeying: boolean;
  tracks: AnimationTrack[];
  recording: boolean;
  recordedFrameCount: number;
  recordedVertexCount: number;
}

const initialState: AnimationState = {
  duration: 10,
  fps: 24,
  currentFrame: 0,
  playbackState: 'stopped',
  loop: false,
  autoKeying: false,
  tracks: [],
  recording: false,
  recordedFrameCount: 0,
  recordedVertexCount: 0,
};

const animationSlice = createSlice({
  name: 'animation',
  initialState,
  reducers: {
    // Timeline controls
    setDuration(state, action: PayloadAction<number>) {
      state.duration = Math.max(1, action.payload);
    },
    setFps(state, action: PayloadAction<FpsOption>) {
      state.fps = action.payload;
    },
    setCurrentFrame(state, action: PayloadAction<number>) {
      const totalFrames = Math.floor(state.duration * state.fps);
      state.currentFrame = Math.max(0, Math.min(action.payload, totalFrames - 1));
    },
    setPlaybackState(state, action: PayloadAction<PlaybackState>) {
      state.playbackState = action.payload;
    },
    toggleLoop(state) {
      state.loop = !state.loop;
    },
    toggleAutoKeying(state) {
      state.autoKeying = !state.autoKeying;
    },

    // Track management
    addTrack(state, action: PayloadAction<AnimationTrack>) {
      state.tracks.push(action.payload);
    },
    removeTrack(state, action: PayloadAction<string>) {
      state.tracks = state.tracks.filter(t => t.id !== action.payload);
    },
    toggleTrackExpanded(state, action: PayloadAction<string>) {
      const track = state.tracks.find(t => t.id === action.payload);
      if (track) track.expanded = !track.expanded;
    },

    // Keyframe management
    insertKeyframe(state, action: PayloadAction<{
      trackId: string;
      propertyId: string;
      keyframe: Keyframe;
    }>) {
      const { trackId, propertyId, keyframe } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (!track) return;
      const prop = track.properties.find(p => p.id === propertyId);
      if (!prop) return;

      // Replace existing keyframe at same frame, or insert sorted
      const existingIdx = prop.keyframes.findIndex(k => k.frame === keyframe.frame);
      if (existingIdx >= 0) {
        prop.keyframes[existingIdx] = keyframe;
      } else {
        prop.keyframes.push(keyframe);
        prop.keyframes.sort((a, b) => a.frame - b.frame);
      }
    },
    removeKeyframe(state, action: PayloadAction<{
      trackId: string;
      propertyId: string;
      frame: number;
    }>) {
      const { trackId, propertyId, frame } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (!track) return;
      const prop = track.properties.find(p => p.id === propertyId);
      if (!prop) return;
      prop.keyframes = prop.keyframes.filter(k => k.frame !== frame);
    },
    setKeyframeInterpolation(state, action: PayloadAction<{
      trackId: string;
      propertyId: string;
      frame: number;
      interpolation: InterpolationType;
    }>) {
      const { trackId, propertyId, frame, interpolation } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (!track) return;
      const prop = track.properties.find(p => p.id === propertyId);
      if (!prop) return;
      const kf = prop.keyframes.find(k => k.frame === frame);
      if (kf) kf.interpolation = interpolation;
    },
    moveKeyframe(state, action: PayloadAction<{
      trackId: string;
      propertyId: string;
      fromFrame: number;
      toFrame: number;
    }>) {
      const { trackId, propertyId, fromFrame, toFrame } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (!track) return;
      const prop = track.properties.find(p => p.id === propertyId);
      if (!prop) return;
      const kf = prop.keyframes.find(k => k.frame === fromFrame);
      if (kf) {
        kf.frame = toFrame;
        prop.keyframes.sort((a, b) => a.frame - b.frame);
      }
    },

    // Recording
    setRecording(state, action: PayloadAction<boolean>) {
      state.recording = action.payload;
      if (action.payload) {
        state.recordedFrameCount = 0;
      }
    },
    setRecordedFrameCount(state, action: PayloadAction<number>) {
      state.recordedFrameCount = action.payload;
    },
    setRecordedVertexCount(state, action: PayloadAction<number>) {
      state.recordedVertexCount = action.payload;
    },

    // Reset
    resetAnimation() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setDuration, setFps, setCurrentFrame, setPlaybackState,
  toggleLoop, toggleAutoKeying,
  addTrack, removeTrack, toggleTrackExpanded,
  insertKeyframe, removeKeyframe, setKeyframeInterpolation, moveKeyframe,
  setRecording, setRecordedFrameCount, setRecordedVertexCount,
  resetAnimation,
} = animationSlice.actions;

export default animationSlice.reducer;
