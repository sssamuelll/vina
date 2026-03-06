## Summary

Implement GPU-accelerated cloth simulation using WebGPU compute shaders. This replaces the current CPU-based WASM XPBD solver with a massively parallel GPU pipeline for 10–50x performance improvement on supported hardware.

**Competitive context:** Both CLO3D and Browzwear use GPU-accelerated simulation. While our WASM solver is competitive for small garments, complex multi-piece garments with high mesh resolution require GPU compute to maintain real-time frame rates.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §3 — 3D Simulation & Draping](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### WebGPU Compute Pipeline
- XPBD solver implemented as compute shaders (WGSL)
- Pre-solve: predict positions, apply gravity, damping
- Distance constraints: parallel Gauss-Seidel with graph coloring
- Bending constraints: dihedral angle constraints
- Collision: triangle mesh collision via spatial hash
- Self-collision: vertex-triangle continuous collision detection

### Capability Detection & Fallback
- Detect WebGPU support (`navigator.gpu`)
- Automatic fallback chain: WebGPU → WASM → JS CPU
- Feature parity across all three backends
- User-selectable backend override in settings

### Storage Buffer Architecture
- Upload mesh data (positions, velocities, constraints) to GPU storage buffers
- Zero-copy readback for rendering (share buffers with WebGL/WebGPU renderer)
- Dynamic buffer resizing for mesh topology changes

### Performance Targets
- 60fps with 50k+ particles on mid-range GPU
- 60fps with 10k particles on integrated GPU
- Sub-frame simulation (multiple substeps per render frame)

---

## Implementation Strategy

### Phase 1: WebGPU Device & Detection
1. Request `GPUAdapter` and `GPUDevice`
2. Capability detection and feature flags
3. Fallback logic if WebGPU unavailable

### Phase 2: Core Compute Shaders
1. Pre-solve shader: position prediction + external forces
2. Distance constraint shader with graph coloring
3. Position update and velocity computation

### Phase 3: Collision Shaders
1. Build spatial hash on GPU
2. Triangle mesh collision detection
3. Self-collision via spatial hash

### Phase 4: Integration
1. Replace WASM worker with WebGPU compute when available
2. Share GPU buffers with Three.js renderer
3. Performance benchmarks vs WASM baseline

---

## Related Issues

- #84 — WebGPU Cloth Simulation Engine (closed — previous exploration; this is production implementation)
- #85–94 — Individual WebGPU work items (closed — design exploration)

## Acceptance Criteria

- [ ] WebGPU compute shaders implement full XPBD solver
- [ ] Automatic fallback: WebGPU → WASM → JS
- [ ] Distance, bending, and collision constraints run on GPU
- [ ] 60fps at 50k+ particles on discrete GPU
- [ ] Zero-copy buffer sharing with renderer
- [ ] Feature parity with WASM solver
- [ ] Works on Chrome 113+ and Firefox (when supported)
