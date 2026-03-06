## Summary

Build a keyframe animation system with a visual timeline editor, camera motion, property interpolation, and video export (MP4/WebM). Enables walk-cycle visualization, garment presentation videos, and motion-based fit testing.

**Competitive context:** CLO3D added keyframe animation in 2025.0. Browzwear supports animation via FBX import. Animation is increasingly expected for digital fashion presentations and social media content.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §13 — Animation](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Timeline Editor
- Horizontal timeline with playback scrubber
- Keyframe markers on timeline tracks
- Play, pause, stop, loop controls
- Adjustable duration and frame rate (24, 30, 60 fps)

### Keyframe Animation
- Set keyframes on animatable properties:
  - Avatar joint angles
  - Camera position/rotation/FOV
  - Wind direction/strength
  - Light properties
- Interpolation types: linear, ease-in, ease-out, ease-in-out, bezier
- Parent/child key hierarchy for grouped properties

### Camera Animation
- Keyframe camera position, rotation, and field of view
- Preset camera paths: orbit, dolly, zoom
- Camera shake for cinematic effect
- Preview camera path as visible spline in viewport

### Cloth Simulation Recording
- Record simulation as frame sequence (vertex positions per frame)
- Play back recorded simulation without re-computing
- Time warp: speed up/slow down playback

### Video Export
- Render animation to MP4 or WebM video file
- Configurable resolution (720p, 1080p, 4K)
- Frame rate selection (24, 30, 60 fps)
- Transparent background option (WebM with alpha)
- Progress indicator during render

---

## Implementation Strategy

### Phase 1: Timeline & Keyframe Core
1. Create `AnimationTimeline` data model with tracks and keyframes
2. Build timeline UI component (horizontal strip with scrubber)
3. Implement property interpolation engine (linear, cubic bezier)
4. `animationStore.ts` for state management

### Phase 2: Property Animation
1. Camera keyframing: position, rotation, FOV
2. Joint keyframing: avatar joint angles
3. Wind property keyframing
4. Apply interpolated values per frame in render loop

### Phase 3: Simulation Recording
1. Capture vertex positions per frame during live simulation
2. Store as typed array sequence
3. Playback: feed recorded positions to cloth mesh
4. Scrub timeline to any frame

### Phase 4: Video Export
1. Frame capture via `WebGLRenderer.domElement.toDataURL()`
2. Encode frames to video using `MediaRecorder` or FFmpeg WASM
3. Progress dialog with cancel option
4. Download completed video

---

## Key Files to Create

- `src/stores/animationStore.ts` — timeline and keyframe state
- `src/components/Timeline/` — timeline editor UI
- `src/utils/animation/interpolation.ts` — keyframe interpolation
- `src/utils/export/videoExporter.ts` — video rendering pipeline

## Acceptance Criteria

- [ ] Timeline editor with scrubber, play/pause/stop controls
- [ ] Keyframes settable on camera, joints, wind, and lights
- [ ] Interpolation between keyframes (linear and bezier)
- [ ] Camera animation with preset paths (orbit, dolly)
- [ ] Simulation recording captures vertex positions per frame
- [ ] Recorded animation plays back without re-simulation
- [ ] Video export to MP4/WebM at configurable resolution
- [ ] Animation duration and frame rate configurable
