# WebGPU Zero-Copy Rendering — Design Document

**Date:** 2026-03-10

## Goal

Eliminate the GPU→CPU readback bottleneck in the cloth simulation pipeline by migrating to Three.js WebGPURenderer and using StorageBufferAttribute for zero-copy compute-to-render data flow. Target: 10-50x simulation speedup for large meshes.

## Problem

The existing GPU solver (`src/utils/cloth/gpu/`) is fully implemented with WGSL compute shaders but **disabled** (`useSimulationLifecycle.ts:200`). The bottleneck: `GpuSolverClient.readPositions()` does async GPU→CPU readback every frame, then Three.js re-uploads positions to WebGL — defeating the purpose of GPU compute.

Current pipeline:
```
GPU Compute → readPositions() (async readback) → CPU Float32Array → posAttr.needsUpdate → WebGL re-upload
```

## Solution

Upgrade Three.js to r171+ and R3F to v9, enabling WebGPURenderer with built-in WebGL2 fallback. Use `StorageBufferAttribute` to bind GPU solver buffers directly as vertex attributes.

New pipeline:
```
GPU Compute → StorageBufferAttribute → Render directly (data never leaves GPU)
```

---

## 1. Renderer Migration

**Package upgrades:**
- `three`: 0.170.0 → latest (r175+)
- `@react-three/fiber`: 8.17.0 → 9.x
- `@react-three/drei`: 9.117.0 → latest compatible with R3F v9
- `@types/three`: match three version

**Canvas change** in `Viewport3D.tsx`:

```tsx
import * as THREE from 'three/webgpu';
import { Canvas, extend } from '@react-three/fiber';

extend(THREE);

<Canvas
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer({ ...props, antialias: true });
    await renderer.init();
    return renderer;
  }}
>
```

Three.js WebGPURenderer has built-in WebGL2 fallback. All existing materials (meshPhysicalMaterial, meshStandardMaterial, meshBasicMaterial) auto-convert. No shader porting needed.

**Codebase impact is minimal:**
- No custom shaders exist — all built-in materials
- No post-processing effects
- Standard drei components (OrbitControls, TransformControls, Grid, etc.)
- Single Canvas instance

---

## 2. Zero-Copy Compute-to-Render Pipeline

**GpuSolverClient changes:**
- Remove `readPositions()` from the render loop
- Expose `getPositionStorageAttribute()` and `getNormalStorageAttribute()` returning `THREE.StorageBufferAttribute` wrapping solver GPU buffers
- Loop becomes: `solver.step()` + `requestAnimationFrame` — no readback

**GarmentSimulation changes:**
- GPU solver active: use `meshPhysicalNodeMaterial` reading from `StorageBufferAttribute` for positions/normals
- WASM/CPU solver active: keep existing `BufferAttribute.needsUpdate` path unchanged
- Both paths coexist — GPU zero-copy for WebGPU, CPU copy for WASM fallback

**Buffer lifecycle:**
1. `GpuClothSolver.init()` creates position/normal GPU buffers
2. `GpuSolverClient` wraps them as `StorageBufferAttribute`
3. `GarmentSimulation` binds to mesh geometry
4. Each frame: compute shader writes → render shader reads → no CPU
5. Normals stay on GPU (existing `normalAccum` + `normalNorm` compute passes)

---

## 3. Solver Tier Cascade Update

Existing cascade structure stays, GPU tier re-enabled:

```
WebGPU (re-enabled) → WASM → CPU Worker → Neural Drape
```

**Shared GPUDevice** is critical — StorageBufferAttribute zero-copy only works if compute solver and renderer share the same device. WebGPURenderer exposes its device after init; pass `renderer.backend.device` to `GpuSolverClient`.

**Fallback behavior:**
- WebGPU renderer init fails → Three.js falls back to WebGL2 → WASM solver activates
- GPU solver init fails → WASM solver activates
- No behavior change for non-WebGPU browsers

---

## 4. Snapshot & Export Adaptation

Two places access WebGL APIs directly:

**Viewport3D snapshot** (`Viewport3D.tsx:202-240`):
- Current: `canvas.getContext('webgl2')` → `glCtx.readPixels()`
- New: `renderer.readRenderTargetPixelsAsync()` — unified API for both backends
- Becomes async (already triggered from button click)

**Still exporter** (`stillExporter.ts`) + **Animation exporter** (`animationExporter.ts`):
- Current: `new THREE.WebGLRenderTarget()` → `renderer.readRenderTargetPixels()`
- New: `new THREE.RenderTarget()` → `renderer.readRenderTargetPixelsAsync()`

No other WebGL-specific code exists in the codebase.

---

## 5. Material Strategy for Cloth Mesh

**GPU solver active (`solverTier === 'webgpu'`):**
- Geometry uses `StorageBufferAttribute` for position and normal attributes
- `meshPhysicalNodeMaterial` reads from storage attributes natively
- All PBR properties carry over (roughness, metalness, sheen, transmission, etc.)
- Textures (diffuse, normal, roughness, AO) work identically
- Vertex colors for fit maps: CPU-side update (infrequent, not per-frame)

**WASM/CPU solver active:**
- Standard `meshPhysicalMaterial` + `BufferAttribute` + `needsUpdate` (current path, unchanged)

**Switching:** `GarmentSimulation.tsx` checks `simulationSlice.solverTier` from Redux.

---

## 6. Testing & Rollout

**Feature flag:** `webclo-use-webgpu` localStorage (default: `true`). Set `false` to force WASM path.

**Testing:**
- Unit tests for StorageBufferAttribute wrapper creation
- Integration: verify solver tier cascade fallback
- Manual: Chrome, Safari, Firefox (all support WebGPU as of late 2025)
- Manual: force WebGL2 fallback — verify WASM path works
- Performance benchmark: frame times WASM vs WebGPU

**Not doing (YAGNI):**
- No TSL shader authoring — no custom shaders exist
- No compute shader rewrite — existing WGSL shaders work as-is
- No multi-device support — one shared GPUDevice

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Upgrade three, R3F, drei, @types/three |
| `src/components/Viewport3D/Viewport3D.tsx` | WebGPURenderer Canvas setup, async snapshot |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Re-enable GPU tier, shared device, remove `false` guard |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Dual material path (node material for GPU, standard for CPU) |
| `src/utils/cloth/gpu/gpuSolverClient.ts` | Remove readback loop, expose StorageBufferAttribute |
| `src/utils/cloth/gpu/gpuSolver.ts` | Ensure buffers have STORAGE | VERTEX usage flags |
| `src/utils/export/stillExporter.ts` | RenderTarget + async readback |
| `src/utils/export/animationExporter.ts` | RenderTarget + async readback |
| `src/components/Viewport3D/EnvironmentSetup.tsx` | Verify tone mapping API compatibility |

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/cloth/gpu/gpuStorageAttributes.ts` | StorageBufferAttribute factory (wraps solver GPU buffers) |
