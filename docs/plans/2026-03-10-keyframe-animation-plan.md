# Keyframe Animation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLO3D-style keyframe animation system with timeline editor, camera/joint/wind animation, simulation recording, and WebM video export.

**Architecture:** Four layers — Redux data model, pure-function interpolation engine, R3F playback/recording hooks, and CLO3D-style timeline UI in the existing BottomPanel. Wind force added to both TS and Rust XPBD solvers.

**Tech Stack:** React, Redux Toolkit, React Three Fiber, Three.js, MediaRecorder API, Rust/wasm-pack

---

## Task 1: Animation Types

**Files:**
- Create: `src/utils/animation/types.ts`

**Step 1: Write the types file**

```typescript
// src/utils/animation/types.ts

export type InterpolationType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';

export interface Keyframe {
  frame: number;
  value: number;
  interpolation: InterpolationType;
}

export interface AnimationProperty {
  id: string;
  path: string;           // e.g. 'position.x', 'joints.LeftArm.z', 'force.x'
  label: string;
  keyframes: Keyframe[];
}

export interface AnimationTrack {
  id: string;
  objectType: 'camera' | 'avatar' | 'wind' | 'light';
  objectId: string;       // e.g. 'main-camera', 'avatar', 'wind-global'
  label: string;
  expanded: boolean;
  properties: AnimationProperty[];
}

export type PlaybackState = 'stopped' | 'playing' | 'paused';
export type FpsOption = 24 | 30 | 60;
```

**Step 2: Commit**

```bash
git add src/utils/animation/types.ts
git commit -m "feat(animation): add animation type definitions (#232)"
```

---

## Task 2: Interpolation Engine

**Files:**
- Create: `src/utils/animation/__tests__/interpolation.test.ts`
- Create: `src/utils/animation/interpolation.ts`

**Step 1: Write the failing tests**

```typescript
// src/utils/animation/__tests__/interpolation.test.ts
import { describe, it, expect } from 'vitest';
import { interpolate, interpolateVec3 } from '../interpolation';
import type { Keyframe } from '../types';

describe('interpolate', () => {
  it('returns undefined for empty keyframes', () => {
    expect(interpolate([], 5)).toBeUndefined();
  });

  it('holds first value before first keyframe', () => {
    const kf: Keyframe[] = [{ frame: 10, value: 5, interpolation: 'linear' }];
    expect(interpolate(kf, 0)).toBe(5);
  });

  it('holds last value after last keyframe', () => {
    const kf: Keyframe[] = [{ frame: 10, value: 5, interpolation: 'linear' }];
    expect(interpolate(kf, 20)).toBe(5);
  });

  it('returns exact value at keyframe', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 0)).toBe(0);
    expect(interpolate(kf, 10)).toBe(100);
  });

  it('linearly interpolates between keyframes', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 5)).toBe(50);
  });

  it('uses left keyframe interpolation type', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeIn' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeIn at t=0.5 → 0.25 → value 25
    expect(interpolate(kf, 5)).toBe(25);
  });

  it('easeOut interpolation', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeOut' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeOut at t=0.5 → 0.75 → value 75
    expect(interpolate(kf, 5)).toBe(75);
  });

  it('easeInOut interpolation at midpoint', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeInOut' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeInOut at t=0.5 → 0.5 (midpoint of smoothstep)
    expect(interpolate(kf, 5)).toBe(50);
  });

  it('handles multiple segments', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
      { frame: 20, value: 50, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 15)).toBe(75);
  });
});

describe('interpolateVec3', () => {
  it('interpolates each axis independently', () => {
    const kfX: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 10, interpolation: 'linear' },
    ];
    const kfY: Keyframe[] = [
      { frame: 0, value: 100, interpolation: 'linear' },
      { frame: 10, value: 200, interpolation: 'linear' },
    ];
    const kfZ: Keyframe[] = [
      { frame: 0, value: -5, interpolation: 'linear' },
      { frame: 10, value: 5, interpolation: 'linear' },
    ];
    const result = interpolateVec3(kfX, kfY, kfZ, 5);
    expect(result).toEqual([5, 150, 0]);
  });

  it('returns undefined if any axis has no keyframes', () => {
    const kf: Keyframe[] = [{ frame: 0, value: 0, interpolation: 'linear' }];
    expect(interpolateVec3(kf, [], kf, 0)).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/animation/__tests__/interpolation.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the interpolation engine**

```typescript
// src/utils/animation/interpolation.ts
import type { Keyframe, InterpolationType } from './types';

/** Easing functions: take normalized t (0-1), return eased t (0-1) */
const easings: Record<InterpolationType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  bezier: (t) => t, // default bezier fallback (linear); real bezier needs control points
};

/**
 * Interpolate a scalar value at the given frame from sorted keyframes.
 * Returns undefined if keyframes array is empty.
 * Holds first/last value outside keyframe range.
 * Uses the LEFT keyframe's interpolation type for the curve between two keys.
 */
export function interpolate(keyframes: Keyframe[], frame: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  if (keyframes.length === 1) return keyframes[0].value;

  // Before first keyframe
  if (frame <= keyframes[0].frame) return keyframes[0].value;

  // After last keyframe
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

  // Find the segment
  for (let i = 0; i < keyframes.length - 1; i++) {
    const left = keyframes[i];
    const right = keyframes[i + 1];
    if (frame >= left.frame && frame <= right.frame) {
      const t = (frame - left.frame) / (right.frame - left.frame);
      const eased = easings[left.interpolation](t);
      return left.value + (right.value - left.value) * eased;
    }
  }

  return keyframes[keyframes.length - 1].value;
}

/**
 * Interpolate a Vec3 by interpolating each axis independently.
 * Returns undefined if any axis has no keyframes.
 */
export function interpolateVec3(
  kfX: Keyframe[],
  kfY: Keyframe[],
  kfZ: Keyframe[],
  frame: number,
): [number, number, number] | undefined {
  const x = interpolate(kfX, frame);
  const y = interpolate(kfY, frame);
  const z = interpolate(kfZ, frame);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return [x, y, z];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/animation/__tests__/interpolation.test.ts`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add src/utils/animation/interpolation.ts src/utils/animation/__tests__/interpolation.test.ts
git commit -m "feat(animation): add keyframe interpolation engine with tests (#232)"
```

---

## Task 3: Animation Redux Slice

**Files:**
- Create: `src/store/animationSlice.ts`
- Modify: `src/store/index.ts`

**Step 1: Write the slice**

```typescript
// src/store/animationSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AnimationTrack, AnimationProperty, Keyframe, PlaybackState, FpsOption, InterpolationType } from '../utils/animation/types';

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
```

**Step 2: Register in store**

In `src/store/index.ts`, add:
```typescript
import animationReducer from './animationSlice';
```
And in the `reducer` object:
```typescript
animation: animationReducer,
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/store/animationSlice.ts src/store/index.ts
git commit -m "feat(animation): add animation Redux slice (#232)"
```

---

## Task 4: Wind Force — TypeScript Solver

**Files:**
- Create: `src/utils/cloth/__tests__/windForce.test.ts`
- Modify: `src/utils/cloth/xpbdSolver.ts`

**Step 1: Write the failing test**

```typescript
// src/utils/cloth/__tests__/windForce.test.ts
import { describe, it, expect } from 'vitest';
import { XPBDSolver } from '../xpbdSolver';

describe('wind force', () => {
  it('config accepts windForce with default [0,0,0]', () => {
    // Create a minimal solver to check config defaults
    const solver = new XPBDSolver();
    expect(solver.config.windForce).toEqual([0, 0, 0]);
  });

  it('setWind updates the wind force', () => {
    const solver = new XPBDSolver();
    solver.setWind([5, 0, 2]);
    expect(solver.config.windForce).toEqual([5, 0, 2]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/windForce.test.ts`
Expected: FAIL (windForce not in config)

**Step 3: Add wind force to the TS solver**

In `src/utils/cloth/xpbdSolver.ts`:

1. Add `windForce: [number, number, number]` to `ClothSimConfig` interface with default `[0, 0, 0]`.

2. Add `setWind(force: [number, number, number])` method:
```typescript
setWind(force: [number, number, number]): void {
  this.config.windForce = force;
}
```

3. In `preSolve()`, after the `this.applyAirDrag(sdt)` call, add:
```typescript
this.applyWindForce(sdt);
```

4. Add `applyWindForce()` method (follows same triangle iteration pattern as `applyAirDrag`):
```typescript
private applyWindForce(sdt: number): void {
  const wind = this.config.windForce;
  if (wind[0] === 0 && wind[1] === 0 && wind[2] === 0) return;

  const numTris = this.triIds.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = this.triIds[t * 3];
    const i1 = this.triIds[t * 3 + 1];
    const i2 = this.triIds[t * 3 + 2];

    // Skip if all pinned
    if (this.invMass[i0] === 0 && this.invMass[i1] === 0 && this.invMass[i2] === 0) continue;

    // Compute triangle normal and area via cross product
    const ax = this.pos[i1 * 3] - this.pos[i0 * 3];
    const ay = this.pos[i1 * 3 + 1] - this.pos[i0 * 3 + 1];
    const az = this.pos[i1 * 3 + 2] - this.pos[i0 * 3 + 2];
    const bx = this.pos[i2 * 3] - this.pos[i0 * 3];
    const by = this.pos[i2 * 3 + 1] - this.pos[i0 * 3 + 1];
    const bz = this.pos[i2 * 3 + 2] - this.pos[i0 * 3 + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const area = Math.sqrt(nx * nx + ny * ny + nz * nz) * 0.5;
    if (area < 1e-8) continue;

    // Normalize
    const invLen = 1.0 / (area * 2);
    const nnx = nx * invLen;
    const nny = ny * invLen;
    const nnz = nz * invLen;

    // Wind force projected onto face normal
    const dot = wind[0] * nnx + wind[1] * nny + wind[2] * nnz;
    const forcePerVertex = dot * area * this.config.dragCoefficient / 3;

    for (const idx of [i0, i1, i2]) {
      if (this.invMass[idx] === 0) continue;
      this.vel[idx * 3] += nnx * forcePerVertex * this.invMass[idx] * sdt;
      this.vel[idx * 3 + 1] += nny * forcePerVertex * this.invMass[idx] * sdt;
      this.vel[idx * 3 + 2] += nnz * forcePerVertex * this.invMass[idx] * sdt;
    }
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/cloth/__tests__/windForce.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/xpbdSolver.ts src/utils/cloth/__tests__/windForce.test.ts
git commit -m "feat(physics): add wind force to TypeScript XPBD solver (#232)"
```

---

## Task 5: Wind Force — Rust WASM Solver

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs`

**Step 1: Add wind field and setter**

In the `XPBDSolver` struct, add:
```rust
wind: [f32; 3],
```

Initialize to `[0.0, 0.0, 0.0]` in `new()`.

Add public method:
```rust
#[wasm_bindgen]
pub fn set_wind(&mut self, wx: f32, wy: f32, wz: f32) {
    self.wind = [wx, wy, wz];
}
```

**Step 2: Add wind force in `pre_solve`**

After `self.apply_air_drag(sdt)`, add:
```rust
self.apply_wind_force(sdt);
```

**Step 3: Implement `apply_wind_force`**

```rust
fn apply_wind_force(&mut self, sdt: f32) {
    let wind = self.wind;
    if wind[0] == 0.0 && wind[1] == 0.0 && wind[2] == 0.0 { return; }

    let num_tris = self.tri_ids.len() / 3;
    for t in 0..num_tris {
        let i0 = self.tri_ids[t * 3] as usize;
        let i1 = self.tri_ids[t * 3 + 1] as usize;
        let i2 = self.tri_ids[t * 3 + 2] as usize;

        if self.inv_mass[i0] == 0.0 && self.inv_mass[i1] == 0.0 && self.inv_mass[i2] == 0.0 {
            continue;
        }

        let (i0x, i0y, i0z) = (i0 * 3, i0 * 3 + 1, i0 * 3 + 2);
        let (i1x, i1y, i1z) = (i1 * 3, i1 * 3 + 1, i1 * 3 + 2);
        let (i2x, i2y, i2z) = (i2 * 3, i2 * 3 + 1, i2 * 3 + 2);

        let ax = self.positions[i1x] - self.positions[i0x];
        let ay = self.positions[i1y] - self.positions[i0y];
        let az = self.positions[i1z] - self.positions[i0z];
        let bx = self.positions[i2x] - self.positions[i0x];
        let by = self.positions[i2y] - self.positions[i0y];
        let bz = self.positions[i2z] - self.positions[i0z];

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        let area = (nx * nx + ny * ny + nz * nz).sqrt() * 0.5;
        if area < 1e-8 { continue; }

        let inv_len = 1.0 / (area * 2.0);
        let nnx = nx * inv_len;
        let nny = ny * inv_len;
        let nnz = nz * inv_len;

        let dot = wind[0] * nnx + wind[1] * nny + wind[2] * nnz;
        let force_per_vertex = dot * area * self.drag_coefficient / 3.0;

        for &idx in &[i0, i1, i2] {
            if self.inv_mass[idx] == 0.0 { continue; }
            let vi = idx * 3;
            let scale = force_per_vertex * self.inv_mass[idx] * sdt;
            self.velocities[vi] += nnx * scale;
            self.velocities[vi + 1] += nny * scale;
            self.velocities[vi + 2] += nnz * scale;
        }
    }
}
```

**Step 4: Build WASM and copy**

```bash
cd crates/xpbd-wasm && wasm-pack build --target web --out-dir pkg
cp pkg/xpbd_wasm.js ../../public/wasm/
cp pkg/xpbd_wasm_bg.wasm ../../public/wasm/
```

**Step 5: Commit**

```bash
git add crates/xpbd-wasm/src/lib.rs public/wasm/xpbd_wasm.js public/wasm/xpbd_wasm_bg.wasm
git commit -m "feat(physics): add wind force to Rust WASM solver (#232)"
```

---

## Task 6: Wind Force — Worker Protocol

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts`

**Step 1: Add setWind handler in worker**

In `wasmSolverWorker.ts`, in the `switch (msg.type)` block, add:
```typescript
case 'setWind': {
  if (solver) {
    solver.set_wind(msg.wind[0], msg.wind[1], msg.wind[2]);
  }
  break;
}
```

**Step 2: Add setWind method to client**

In `wasmSolverClient.ts`, add public method:
```typescript
setWind(force: [number, number, number]): void {
  this.worker?.postMessage({ type: 'setWind', wind: force });
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "feat(physics): add setWind worker protocol (#232)"
```

---

## Task 7: Simulation Recorder Hook

**Files:**
- Create: `src/hooks/useSimulationRecorder.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useSimulationRecorder.ts
import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '../store';
import { setRecording, setRecordedFrameCount, setRecordedVertexCount } from '../store/animationSlice';

interface SimRecorderOptions {
  positionsRef: React.MutableRefObject<Float32Array | null>;
}

export interface SimRecorderHandle {
  getFrame: (frameIndex: number) => Float32Array | null;
  frameCount: number;
  vertexCount: number;
}

export function useSimulationRecorder({ positionsRef }: SimRecorderOptions): SimRecorderHandle {
  const dispatch = useDispatch();
  const { recording, fps, duration } = useSelector((s: RootState) => s.animation);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const frameCountRef = useRef(0);
  const vertexCountRef = useRef(0);

  const totalFrames = Math.floor(duration * fps);

  useFrame(() => {
    if (!recording) return;
    const positions = positionsRef.current;
    if (!positions) return;

    const vertexCount = positions.length / 3;

    // First frame: allocate buffer
    if (frameCountRef.current === 0) {
      vertexCountRef.current = vertexCount;
      bufferRef.current = new ArrayBuffer(totalFrames * vertexCount * 3 * 4); // Float32
      dispatch(setRecordedVertexCount(vertexCount));
    }

    if (frameCountRef.current >= totalFrames) {
      dispatch(setRecording(false));
      return;
    }

    // Copy current positions into buffer
    const offset = frameCountRef.current * vertexCount * 3;
    const view = new Float32Array(bufferRef.current!, offset, vertexCount * 3);
    view.set(positions);

    frameCountRef.current++;
    dispatch(setRecordedFrameCount(frameCountRef.current));
  });

  const getFrame = useCallback((frameIndex: number): Float32Array | null => {
    if (!bufferRef.current || frameIndex >= frameCountRef.current) return null;
    const vc = vertexCountRef.current;
    const offset = frameIndex * vc * 3;
    return new Float32Array(bufferRef.current, offset * 4, vc * 3);
  }, []);

  return {
    getFrame,
    get frameCount() { return frameCountRef.current; },
    get vertexCount() { return vertexCountRef.current; },
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/useSimulationRecorder.ts
git commit -m "feat(animation): add simulation frame recorder hook (#232)"
```

---

## Task 8: Simulation Playback Hook

**Files:**
- Create: `src/hooks/useSimulationPlayback.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useSimulationPlayback.ts
import { useSelector } from 'react-redux';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RootState } from '../store';
import type { SimRecorderHandle } from './useSimulationRecorder';

interface SimPlaybackOptions {
  meshRef: React.MutableRefObject<THREE.Mesh | null>;
  recorder: SimRecorderHandle;
}

/**
 * During animation playback, reads recorded sim frames and applies
 * them to the cloth mesh geometry. Returns true if playback is active
 * (caller should skip live solver updates).
 */
export function useSimulationPlayback({ meshRef, recorder }: SimPlaybackOptions): { isPlayingBack: boolean } {
  const { playbackState, currentFrame, recordedFrameCount } = useSelector((s: RootState) => s.animation);
  const isPlayingBack = (playbackState === 'playing' || playbackState === 'paused') && recordedFrameCount > 0;

  useFrame(() => {
    if (!isPlayingBack) return;
    if (!meshRef.current) return;

    const clampedFrame = Math.min(currentFrame, recorder.frameCount - 1);
    const frameData = recorder.getFrame(clampedFrame);
    if (!frameData) return;

    const geometry = meshRef.current.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === frameData.length) {
      (posAttr.array as Float32Array).set(frameData);
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  });

  return { isPlayingBack };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/useSimulationPlayback.ts
git commit -m "feat(animation): add simulation playback hook (#232)"
```

---

## Task 9: Animation Playback Hook

**Files:**
- Create: `src/hooks/useAnimationPlayback.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useAnimationPlayback.ts
import { useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '../store';
import { setCurrentFrame, setPlaybackState } from '../store/animationSlice';
import { interpolate } from '../utils/animation/interpolation';

/**
 * Drives animation playback: advances the timeline frame counter
 * and applies interpolated keyframe values to scene objects.
 */
export function useAnimationPlayback() {
  const dispatch = useDispatch();
  const { camera } = useThree();
  const { playbackState, currentFrame, fps, duration, loop, tracks } = useSelector(
    (s: RootState) => s.animation,
  );
  const totalFrames = Math.floor(duration * fps);
  const accumulatorRef = useRef(0);

  // Snapshot of original camera state for restoration
  const snapshotRef = useRef<{
    cameraPos: [number, number, number];
    cameraFov: number;
  } | null>(null);

  useFrame((_, delta) => {
    if (playbackState !== 'playing') return;

    // Take snapshot on first playing frame
    if (!snapshotRef.current) {
      const cam = camera as THREE.PerspectiveCamera;
      snapshotRef.current = {
        cameraPos: [cam.position.x, cam.position.y, cam.position.z],
        cameraFov: cam.fov,
      };
    }

    // Advance frame based on delta time
    accumulatorRef.current += delta;
    const frameDuration = 1 / fps;
    if (accumulatorRef.current >= frameDuration) {
      const framesToAdvance = Math.floor(accumulatorRef.current / frameDuration);
      accumulatorRef.current -= framesToAdvance * frameDuration;
      let nextFrame = currentFrame + framesToAdvance;

      if (nextFrame >= totalFrames) {
        if (loop) {
          nextFrame = nextFrame % totalFrames;
        } else {
          dispatch(setPlaybackState('stopped'));
          // Restore camera
          if (snapshotRef.current) {
            const cam = camera as THREE.PerspectiveCamera;
            cam.position.set(...snapshotRef.current.cameraPos);
            cam.fov = snapshotRef.current.cameraFov;
            cam.updateProjectionMatrix();
            snapshotRef.current = null;
          }
          accumulatorRef.current = 0;
          return;
        }
      }

      dispatch(setCurrentFrame(nextFrame));
    }

    // Apply interpolated values from tracks
    for (const track of tracks) {
      for (const prop of track.properties) {
        if (prop.keyframes.length === 0) continue;
        const val = interpolate(prop.keyframes, currentFrame);
        if (val === undefined) continue;

        applyAnimatedValue(track.objectType, prop.path, val, camera);
      }
    }
  });
}

function applyAnimatedValue(
  objectType: string,
  path: string,
  value: number,
  camera: THREE.Camera,
) {
  const cam = camera as THREE.PerspectiveCamera;

  if (objectType === 'camera') {
    switch (path) {
      case 'position.x': cam.position.x = value; break;
      case 'position.y': cam.position.y = value; break;
      case 'position.z': cam.position.z = value; break;
      case 'fov':
        cam.fov = value;
        cam.updateProjectionMatrix();
        break;
    }
  }
  // Avatar joints and wind are applied via Redux dispatches
  // in the GarmentSimulation integration (Task 11)
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/useAnimationPlayback.ts
git commit -m "feat(animation): add animation playback hook (#232)"
```

---

## Task 10: Timeline UI — Components

**Files:**
- Create: `src/components/Timeline/Timeline.tsx`
- Create: `src/components/Timeline/TimelineToolbar.tsx`
- Create: `src/components/Timeline/TrackList.tsx`
- Create: `src/components/Timeline/KeyframeArea.tsx`
- Create: `src/components/Timeline/TimelineRuler.tsx`
- Create: `src/components/Timeline/Timeline.css`

This is a large task. The implementation should follow the design doc layout:

**TimelineToolbar.tsx** — play/pause/stop/loop buttons, timecode display (`MM:SS / MM:SS`), fps dropdown (`<select>`), REC button, Auto-keying toggle, Export button. All wired to `animationSlice` actions.

**TrackList.tsx** — left panel. Renders `tracks` from Redux as a tree. Each track row: expand/collapse chevron, object icon, label. Child rows: property label. "+" button opens a popover to add Camera/Avatar/Wind/Light track.

**KeyframeArea.tsx** — right panel (synced scroll with TrackList). For each property row: horizontal track lane. Diamond markers (`◆`) at keyframe positions. Vertical scrubber line at `currentFrame`. Click on empty area: move playhead. Click on keyframe: select it. Right-click keyframe: context menu with interpolation types + delete. Drag keyframe horizontally to reposition.

**TimelineRuler.tsx** — frame numbers across the bottom. Tick marks at regular intervals. Shows both frame number and timecode.

**Timeline.tsx** — composes all sub-components. Split layout: TrackList (200px fixed left) + KeyframeArea (flex:1 right). TimelineToolbar on top. TimelineRuler on bottom.

**Timeline.css** — dark theme matching existing app. Use CSS variables. Key classes: `.timeline`, `.timeline-toolbar`, `.track-list`, `.keyframe-area`, `.timeline-ruler`, `.keyframe-diamond`, `.scrubber-line`.

I will not write the full JSX/CSS here — the implementing engineer should follow the layout diagram from the design doc and the component descriptions above. Each component should be < 150 lines. Use existing patterns from `BottomPanel.tsx` and `Toolbar2D.tsx` for styling reference.

**Step 1: Create all component files**

Implement each component following the descriptions above.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/Timeline/
git commit -m "feat(animation): add Timeline UI components (#232)"
```

---

## Task 11: Integrate Timeline into BottomPanel

**Files:**
- Modify: `src/components/BottomPanel/BottomPanel.tsx`

**Step 1: Add Timeline tab**

1. Update the type:
```typescript
type BottomTab = 'copilot' | 'problems' | 'output' | 'nesting-preview' | 'timeline';
```

2. Add to `buildTabs()`:
```typescript
{ id: 'timeline', label: 'Timeline' },
```

3. Add render block:
```tsx
{activeTab === 'timeline' && <Timeline />}
```

4. Import Timeline:
```typescript
import Timeline from '../Timeline/Timeline';
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/BottomPanel/BottomPanel.tsx
git commit -m "feat(animation): add Timeline tab to BottomPanel (#232)"
```

---

## Task 12: Mount Hooks in Viewport3D

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx`
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Step 1: Mount animation playback hook in Viewport3D**

In `Viewport3D.tsx`, inside the `<Canvas>`, add a new component:

```tsx
function AnimationDriver() {
  useAnimationPlayback();
  return null;
}
```

Render `<AnimationDriver />` inside the Canvas alongside other components.

**Step 2: Integrate recorder + playback in GarmentSimulation**

In `GarmentSimulation.tsx`:

1. Import and call `useSimulationRecorder` with `positionsRef`.
2. Import and call `useSimulationPlayback` with `meshRef` and the recorder handle.
3. In the existing `useFrame` that updates cloth positions, check `isPlayingBack` — if true, skip the live position update (the playback hook handles it).

```typescript
const recorder = useSimulationRecorder({ positionsRef });
const { isPlayingBack } = useSimulationPlayback({ meshRef, recorder });

useFrame(() => {
  if (isPlayingBack) return; // Skip live update during playback
  // ... existing position update code ...
});
```

**Step 3: Disable OrbitControls during playback**

In `Viewport3D.tsx`, read `playbackState` from Redux. When `playing`, set `orbitRef.current.enabled = false`. When stopped, restore to `true`.

**Step 4: Run type check and visual test**

Run: `npx tsc --noEmit`
Run: `npx vite --port 5177` and verify Timeline tab appears in BottomPanel.

**Step 5: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(animation): mount playback and recording hooks in 3D viewport (#232)"
```

---

## Task 13: Video Export

**Files:**
- Create: `src/utils/export/animationExporter.ts`

**Step 1: Write the exporter**

```typescript
// src/utils/export/animationExporter.ts
import type { AnimationTrack } from '../animation/types';
import { interpolate } from '../animation/interpolation';
import type { SimRecorderHandle } from '../../hooks/useSimulationRecorder';
import * as THREE from 'three';

export interface AnimationExportOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tracks: AnimationTrack[];
  fps: number;
  duration: number;
  width: number;
  height: number;
  transparent: boolean;
  recorder: SimRecorderHandle | null;
  clothMesh: THREE.Mesh | null;
  onProgress?: (frame: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export async function exportAnimation(opts: AnimationExportOptions): Promise<Blob> {
  const {
    renderer, scene, camera, tracks, fps, duration,
    width, height, transparent, recorder, clothMesh,
    onProgress, abortSignal,
  } = opts;

  const totalFrames = Math.floor(duration * fps);

  // Save original state
  const originalSize = renderer.getSize(new THREE.Vector2());
  const originalCamPos = camera.position.clone();
  const originalCamFov = camera.fov;
  const originalBg = scene.background;

  // Setup offscreen canvas for MediaRecorder
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // Setup render target at export resolution
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: transparent ? THREE.RGBAFormat : THREE.RGBFormat,
  });

  if (transparent) {
    scene.background = null;
  }

  // MediaRecorder setup
  const stream = offscreen.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const recordingDone = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  mediaRecorder.start();

  // Render each frame
  for (let frame = 0; frame < totalFrames; frame++) {
    if (abortSignal?.aborted) {
      mediaRecorder.stop();
      break;
    }

    // Apply recorded cloth positions
    if (recorder && clothMesh && frame < recorder.frameCount) {
      const frameData = recorder.getFrame(frame);
      if (frameData) {
        const posAttr = clothMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.array.length === frameData.length) {
          (posAttr.array as Float32Array).set(frameData);
          posAttr.needsUpdate = true;
          clothMesh.geometry.computeVertexNormals();
        }
      }
    }

    // Apply interpolated keyframe values
    for (const track of tracks) {
      for (const prop of track.properties) {
        if (prop.keyframes.length === 0) continue;
        const val = interpolate(prop.keyframes, frame);
        if (val === undefined) continue;

        if (track.objectType === 'camera') {
          switch (prop.path) {
            case 'position.x': camera.position.x = val; break;
            case 'position.y': camera.position.y = val; break;
            case 'position.z': camera.position.z = val; break;
            case 'fov':
              camera.fov = val;
              camera.updateProjectionMatrix();
              break;
          }
        }
      }
    }

    // Render
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Read pixels to offscreen canvas
    const buffer = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

    const imageData = ctx.createImageData(width, height);
    // Flip Y (WebGL is bottom-up)
    for (let y = 0; y < height; y++) {
      const srcRow = (height - y - 1) * width * 4;
      const dstRow = y * width * 4;
      imageData.data.set(buffer.subarray(srcRow, srcRow + width * 4), dstRow);
    }
    ctx.putImageData(imageData, 0, 0);

    onProgress?.(frame + 1, totalFrames);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  if (!abortSignal?.aborted) {
    mediaRecorder.stop();
  }

  // Restore state
  camera.position.copy(originalCamPos);
  camera.fov = originalCamFov;
  camera.updateProjectionMatrix();
  scene.background = originalBg;
  renderer.setSize(originalSize.x, originalSize.y);
  renderTarget.dispose();

  return recordingDone;
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/export/animationExporter.ts
git commit -m "feat(animation): add WebM video exporter (#232)"
```

---

## Task 14: Export Dialog UI

**Files:**
- Create: `src/components/Timeline/ExportDialog.tsx`

**Step 1: Write the dialog**

A modal dialog triggered by the Export button in TimelineToolbar. Contains:
- Resolution dropdown: 720p (1280x720), 1080p (1920x1080), 4K (3840x2160)
- Transparent background toggle
- Export / Cancel buttons
- Progress bar (visible during export): "Rendering frame X / Y" with cancel button

Wire the Export button to call `exportAnimation()` from Task 13, passing the renderer/scene/camera refs from the Viewport3D container DOM element (`containerRef.current.__gl`, `__scene`, `__camera`).

On completion, trigger a download: `URL.createObjectURL(blob)` → click a hidden `<a>` element.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/Timeline/ExportDialog.tsx
git commit -m "feat(animation): add video export dialog (#232)"
```

---

## Task 15: Integration Testing

**Files:**
- Create: `src/utils/animation/__tests__/animationSlice.test.ts`

**Step 1: Write slice tests**

```typescript
import { describe, it, expect } from 'vitest';
import animationReducer, {
  setDuration, setFps, setCurrentFrame, setPlaybackState,
  toggleLoop, toggleAutoKeying,
  addTrack, removeTrack, insertKeyframe, removeKeyframe,
  moveKeyframe, setKeyframeInterpolation,
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
```

**Step 2: Run tests**

Run: `npx vitest run src/utils/animation/__tests__/animationSlice.test.ts`
Expected: All PASS

**Step 3: Run full test suite**

Run: `npm run test`
Expected: No regressions

**Step 4: Commit**

```bash
git add src/utils/animation/__tests__/animationSlice.test.ts
git commit -m "test(animation): add animation slice unit tests (#232)"
```

---

## Task 16: Final Type Check & Build

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Production build**

Run: `npm run build`
Expected: PASS

**Step 3: Run all tests**

Run: `npm run test`
Expected: All pass (except known flaky cubicBezier test)

**Step 4: Manual visual test**

Run: `npx vite --port 5177`

Verify:
- [ ] Timeline tab appears in BottomPanel
- [ ] Play/pause/stop controls work
- [ ] Can add a Camera track
- [ ] Can insert keyframes by moving scrubber and clicking "Insert Key"
- [ ] Camera animates during playback
- [ ] Record button captures simulation frames
- [ ] Recorded simulation plays back on timeline scrub
- [ ] Export produces a downloadable WebM file
