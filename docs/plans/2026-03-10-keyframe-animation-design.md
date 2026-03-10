# Keyframe Animation System — Design Document

**Issue:** #232
**Date:** 2026-03-10

## Goal

Build a CLO3D-style keyframe animation system with a visual timeline editor, camera/joint/wind property animation, cloth simulation recording, and WebM video export.

## Architecture Overview

Four-layer architecture:

```
Layer 4: Timeline UI (BottomPanel tab)
Layer 3: Playback & Recording hooks (R3F useFrame)
Layer 2: Interpolation Engine (pure functions)
Layer 1: Animation Data Model (Redux slice)
         + Wind System (solver addition)
```

---

## 1. Animation Data Model

**File:** `src/store/animationSlice.ts`

```typescript
interface AnimationState {
  duration: number;           // seconds, default 10
  fps: 24 | 30 | 60;         // default 24
  currentFrame: number;       // 0-based
  playbackState: 'stopped' | 'playing' | 'paused';
  loop: boolean;
  autoKeying: boolean;

  tracks: AnimationTrack[];

  // Simulation recording metadata (actual buffers in useRef, not Redux)
  recording: boolean;
  recordedFrameCount: number;
  recordedVertexCount: number;
}

interface AnimationTrack {
  id: string;
  objectType: 'camera' | 'avatar' | 'wind' | 'light';
  objectId: string;
  label: string;
  expanded: boolean;
  properties: AnimationProperty[];
}

interface AnimationProperty {
  id: string;
  path: string;               // e.g., 'position.x', 'joints.LeftArm.z'
  label: string;
  valueType: 'number' | 'vec3';
  keyframes: Keyframe[];
}

interface Keyframe {
  frame: number;
  value: number | [number, number, number];
  interpolation: InterpolationType;
}

type InterpolationType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';
```

Design decisions:
- Recorded sim Float32Arrays stay in a `useRef`, not Redux — too large and updated every frame.
- Tracks organized by object (Camera, Avatar, Wind), expanding to property groups. Matches CLO3D hierarchy.
- `path` field maps directly to where the value is applied.

---

## 2. Interpolation Engine

**File:** `src/utils/animation/interpolation.ts`

Pure functions, no state:

```typescript
function interpolate(keyframes: Keyframe[], frame: number): number;
function interpolateVec3(kfX: Keyframe[], kfY: Keyframe[], kfZ: Keyframe[], frame: number): [number, number, number];

// Easing functions
function linear(t: number): number;       // t
function easeIn(t: number): number;       // t^2
function easeOut(t: number): number;      // 1-(1-t)^2
function easeInOut(t: number): number;    // cubic smoothstep
function bezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number;
```

Behavior:
- Before first keyframe: holds first value (constant).
- After last keyframe: holds last value (constant).
- Between keyframes: interpolation type of the **left** keyframe controls the curve leaving it.
- Avatar joints interpolated as independent Euler axes (degrees), no quaternion slerp needed.

---

## 3. Playback & Recording Hooks

All run inside R3F `<Canvas>` via `useFrame`.

### `useAnimationPlayback`

- Reads currentFrame, playbackState, tracks from Redux.
- When playing: increment currentFrame based on delta + fps.
- Interpolate all track properties at currentFrame.
- Apply values:
  - **Camera**: set `orbitControls.object.position`, `.target`, `camera.fov`. Disable OrbitControls during playback.
  - **Avatar**: dispatch joint rotations to `avatarSlice`.
  - **Wind**: call `solverClient.setWind(force)`.
  - **Light**: update scene light properties.
- When stopped: restore original values from snapshot taken on play start.

### `useSimulationRecorder`

- When `recording=true`:
  - Each frame: clone `positionsRef.current` into pre-allocated Float32Array buffer (useRef).
  - Buffer: one contiguous ArrayBuffer, indexed by `frame * vertexCount * 3`.
  - Increment `recordedFrameCount` in Redux.
  - Auto-stop at `duration * fps` frames.
- Memory: ~60MB for 10s at 24fps with 20K vertices. Warn user at longer durations.

### `useSimulationPlayback`

- When playing and recorded frames exist:
  - Read from buffer at currentFrame index.
  - Set cloth mesh `geometry.attributes.position` from recorded frame.
  - Compute vertex normals.
  - Pause live solver.
- Enables instant scrubbing to any frame.

### Interaction flow

1. User clicks "Record" → simulation runs live, frames captured to buffer.
2. Recording stops → user has recorded animation.
3. User adds camera/wind keyframes on timeline.
4. User clicks "Play" → playback hook drives everything: recorded cloth + interpolated properties.
5. User clicks "Export" → video exporter iterates all frames offline.

---

## 4. Timeline UI

**Directory:** `src/components/Timeline/`

New tab in existing BottomPanel.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ◀ ▶ ■ ⟳  │  00:00 / 00:10  │  24fps ▾  │  ● REC  │ Auto⚷ │  ⬇ Export │
├────────────┬────────────────────────────────────────────────┤
│ Track List │ Keyframe Area                                  │
│            │                                                │
│ ▼ Camera   │ ──◆────────◆──────────◆───────── (scrubber)   │
│   Position │ ──◆────────◆──────────◆──────────             │
│   Rotation │ ──────────────────────────────────             │
│   FOV      │ ──────────────────────────────────             │
│ ▼ Avatar   │                                                │
│   Joints   │ ──◆──────────────◆────────────────             │
│ ▼ Wind     │                                                │
│   Force    │ ──────◆──────────────◆────────────             │
│ ▸ Lights   │                                                │
├────────────┴────────────────────────────────────────────────┤
│ ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏ (frame ruler with numbers)       │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **`TimelineToolbar`** — play/pause/stop/loop, timecode, fps dropdown, record, auto-keying toggle, export button.
- **`TrackList`** — left panel, hierarchical tree. Expand/collapse. "+" to add object layer.
- **`KeyframeArea`** — right panel, diamond keyframe markers, draggable scrubber line. Click sets playhead. Right-click keyframe → interpolation/delete/copy.
- **`TimelineRuler`** — frame numbers / timecode at bottom.

### Key interactions

- **Set keyframe**: Move scrubber, change property in viewport, click "Insert Key" — or with Auto-keying ON, any change auto-inserts at current frame.
- **Camera keyframe**: Position camera in viewport, click "Set Camera Key" → captures position + rotation + fov + target.
- **Scrub**: Drag playhead, all properties update in real-time (including recorded cloth).
- **Right-click keyframe**: Change interpolation, delete, copy/paste.
- **Drag keyframe**: Move to different frame.
- **Track range bar**: Hover object track → handles → drag to scale child keyframes proportionally.

---

## 5. Wind System

Minimal directional wind force addition.

### TypeScript solver (`src/utils/cloth/xpbdSolver.ts`)

- Add `windForce: [number, number, number]` to `ClothSimConfig` (default `[0,0,0]`).
- In `preSolve()`, after gravity: per triangle, compute face normal, project windForce onto normal.
- `F = dot(windForce, normal) * area * dragCoefficient / 3` (split to 3 vertices).

### Rust WASM solver (`crates/xpbd-wasm/src/lib.rs`)

- Add `set_wind(wx: f32, wy: f32, wz: f32)` method.
- Same per-triangle wind force in `pre_solve()`.

### Worker protocol

- New message: `{ type: 'setWind', wind: [number, number, number] }`.
- Both `WasmSolverClient` and `ClothWorkerClient` expose `setWind(force)`.

No turbulence or gusting — animate the wind vector via keyframes for dynamic effects.

---

## 6. Video Export

**File:** `src/utils/export/animationExporter.ts`

### Flow

```
Export button → Export dialog (resolution, fps, transparent bg)
  → Pause live simulation
  → For frame 0..totalFrames:
      1. Apply recorded cloth positions (if recorded)
      2. Interpolate & apply keyframed properties
      3. renderer.render(scene, camera) to WebGLRenderTarget
      4. Draw to offscreen canvas
  → MediaRecorder encodes → WebM blob
  → Download
  → Restore pre-export state
```

### Export dialog

- **Resolution**: 720p / 1080p / 4K dropdown
- **Frame rate**: Uses timeline fps (24/30/60)
- **Transparent background**: Toggle (WebM alpha)
- **Progress bar**: Frame X / Total with cancel button

### No simulation recorded?

Export still works — camera/joint/wind keyframes applied, cloth stays at current static pose. Allows camera-only animation videos.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/store/animationSlice.ts` | Redux slice for timeline/tracks/keyframes |
| `src/utils/animation/interpolation.ts` | Keyframe interpolation engine |
| `src/utils/animation/types.ts` | Shared animation types |
| `src/components/Timeline/Timeline.tsx` | Main timeline component (BottomPanel tab) |
| `src/components/Timeline/TimelineToolbar.tsx` | Playback controls, record, export |
| `src/components/Timeline/TrackList.tsx` | Hierarchical track tree |
| `src/components/Timeline/KeyframeArea.tsx` | Keyframe markers + scrubber |
| `src/components/Timeline/TimelineRuler.tsx` | Frame number ruler |
| `src/components/Timeline/Timeline.css` | Styles |
| `src/hooks/useAnimationPlayback.ts` | R3F playback hook |
| `src/hooks/useSimulationRecorder.ts` | Sim frame capture hook |
| `src/hooks/useSimulationPlayback.ts` | Sim frame playback hook |
| `src/utils/export/animationExporter.ts` | WebM video export |

## Files to Modify

| File | Change |
|------|--------|
| `src/store/index.ts` | Add animationSlice reducer |
| `src/components/BottomPanel/BottomPanel.tsx` | Add "Timeline" tab |
| `src/components/Viewport3D/Viewport3D.tsx` | Mount playback/recording hooks |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Integrate sim recorder/playback |
| `src/utils/cloth/xpbdSolver.ts` | Add wind force calculation |
| `crates/xpbd-wasm/src/lib.rs` | Add set_wind() + wind force |
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | Handle setWind message |
| `src/utils/cloth/wasm/wasmSolverClient.ts` | Expose setWind() method |
