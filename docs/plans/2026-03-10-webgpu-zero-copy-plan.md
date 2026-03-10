# WebGPU Zero-Copy Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the GPU→CPU readback bottleneck by migrating to Three.js WebGPURenderer and using StorageBufferAttribute for zero-copy compute-to-render cloth simulation.

**Architecture:** Upgrade Three.js (r175+) and R3F (v9) to enable WebGPURenderer with automatic WebGL2 fallback. The existing GpuClothSolver's GPU buffers bind directly as vertex attributes via StorageBufferAttribute — positions and normals never leave GPU memory. The WASM/CPU fallback paths remain unchanged.

**Tech Stack:** Three.js r175+ (`three/webgpu`), React Three Fiber v9, WebGPU compute shaders (existing WGSL), StorageBufferAttribute, `meshPhysicalNodeMaterial`

---

### Task 1: Upgrade Three.js, R3F, and Drei

**Files:**
- Modify: `package.json`

**Context:** Current versions are `three@0.170.0`, `@react-three/fiber@8.17.0`, `@react-three/drei@9.117.0`, `@types/three@0.170.0`. Three.js r171+ ships `three/webgpu` with WebGPURenderer. R3F v9 supports async `gl` prop for WebGPU init.

**Step 1: Update package versions**

```bash
npm install three@latest @react-three/fiber@latest @react-three/drei@latest
npm install -D @types/three@latest
```

**Step 2: Verify install succeeds and lock file is updated**

Run: `npm ls three @react-three/fiber @react-three/drei`
Expected: No peer dependency conflicts. Versions should be three@0.175+ (or latest), R3F@9.x, drei@latest.

**Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: May show errors related to Three.js API changes (e.g., `WebGLRenderer` type references). These are expected and will be fixed in subsequent tasks. Note any errors for reference.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): upgrade three.js, R3F, and drei for WebGPU support"
```

---

### Task 2: Widen Renderer Types Across Exporters

**Files:**
- Modify: `src/utils/export/stillExporter.ts:11,84`
- Modify: `src/utils/export/animationExporter.ts:8`
- Modify: `src/utils/export/turntableRenderer.ts:15`
- Modify: `src/components/Timeline/ExportDialog.tsx:12`
- Modify: `src/components/Viewport3D/Viewport3D.tsx:206,246,257,275`

**Context:** These files reference `THREE.WebGLRenderer` explicitly. With `three/webgpu`, the renderer may be `WebGPURenderer` which is a different class. We need to use `THREE.Renderer` or the union type so both backends work.

**Step 1: Update stillExporter.ts**

In `src/utils/export/stillExporter.ts`, change the renderer parameter type from `THREE.WebGLRenderer` to `THREE.WebGLRenderer | THREE.WebGPURenderer` (or use a common base type). The functions `setRenderTarget`, `render`, `readRenderTargetPixels`, `getSize`, `setClearAlpha`, `getClearAlpha` exist on both renderer types.

Replace both function signatures:

```typescript
// Line 10-14: change
export function exportStill(
  renderer: THREE.WebGLRenderer,
// to
export function exportStill(
  renderer: THREE.Renderer & { setRenderTarget: any; readRenderTargetPixels: any; getSize: any; setClearAlpha: any; getClearAlpha: any },

// Line 83-87: same change for exportAllViews
```

Actually, the simplest approach: since we'll import from `three/webgpu` in Viewport3D, the `gl` returned by R3F will be typed appropriately. We can use `any` cast at the boundary or use the `Renderer` base class. The key thing is to **not** hardcode `WebGLRenderer`.

Replace all `THREE.WebGLRenderer` references with a type alias:

Create a small type at the top of each file:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRenderer = any;
```

Or better: use Three.js's `Renderer` interface where available.

**Concrete changes:**

`stillExporter.ts` — change both function parameter types and the `WebGLRenderTarget` usage:
- `renderer: THREE.WebGLRenderer` → `renderer: THREE.Renderer`
- `new THREE.WebGLRenderTarget(...)` → `new THREE.RenderTarget(...)` (available in r171+)
- `renderer.readRenderTargetPixels(...)` → `(renderer as any).readRenderTargetPixels(...)` (both backends support this)

`animationExporter.ts` — same pattern:
- `renderer: THREE.WebGLRenderer` → `renderer: THREE.Renderer`
- `new THREE.WebGLRenderTarget(...)` → `new THREE.RenderTarget(...)`
- `renderer.readRenderTargetPixels(...)` → `(renderer as any).readRenderTargetPixels(...)`

`turntableRenderer.ts` — uses `renderer.render()` and `renderer.domElement` which are on the base `Renderer` class:
- `renderer: THREE.WebGLRenderer` → `renderer: THREE.Renderer`

`ExportDialog.tsx`:
- `renderer: THREE.WebGLRenderer | null` → `renderer: THREE.Renderer | null`

`Viewport3D.tsx` — multiple cast sites:
- `store.__gl as THREE.WebGLRenderer | undefined` → `store.__gl as THREE.Renderer | undefined`
- Same for all 4 locations (lines 206, 246, 257, 275)

**Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: No new errors from these files. The `Renderer` base class should have `render()`, `domElement`, etc.

**Step 3: Run tests**

Run: `npm test -- --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (no runtime changes, just type widening).

**Step 4: Commit**

```bash
git add src/utils/export/stillExporter.ts src/utils/export/animationExporter.ts src/utils/export/turntableRenderer.ts src/components/Timeline/ExportDialog.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "refactor: widen renderer types from WebGLRenderer to Renderer for WebGPU compat"
```

---

### Task 3: Switch Canvas to WebGPURenderer

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx:1-4,415-427`

**Context:** R3F v9 supports async `gl` prop that returns a `WebGPURenderer`. The renderer auto-falls back to WebGL2 if WebGPU is unavailable. We need to import from `three/webgpu` and call `extend(THREE)` for JSX element registration.

**Step 1: Update imports and Canvas setup**

At the top of `Viewport3D.tsx`, change:

```typescript
// OLD:
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

// NEW:
import { Canvas, extend } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

// Register three/webgpu elements with R3F's JSX catalog
extend(THREE);
```

Then update the Canvas `gl` prop:

```typescript
// OLD:
<Canvas
  camera={{ position: [0, 0.8, 2.8], fov: 35 }}
  shadows
  resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
  style={{ width: containerSize.width || '100%', height: containerSize.height || '100%' }}
  gl={{ antialias: true }}
  onPointerMissed={() => dispatch(clearSelection())}
  onCreated={({ gl, scene, camera }) => {
    (containerRef.current as unknown as Record<string, unknown>).__gl = gl;
    (containerRef.current as unknown as Record<string, unknown>).__scene = scene;
    (containerRef.current as unknown as Record<string, unknown>).__camera = camera;
  }}
>

// NEW:
<Canvas
  camera={{ position: [0, 0.8, 2.8], fov: 35 }}
  shadows
  resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
  style={{ width: containerSize.width || '100%', height: containerSize.height || '100%' }}
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer({ ...props, antialias: true } as any);
    await renderer.init();
    return renderer as any;
  }}
  onPointerMissed={() => dispatch(clearSelection())}
  onCreated={({ gl, scene, camera }) => {
    (containerRef.current as unknown as Record<string, unknown>).__gl = gl;
    (containerRef.current as unknown as Record<string, unknown>).__scene = scene;
    (containerRef.current as unknown as Record<string, unknown>).__camera = camera;
  }}
>
```

**Step 2: Update snapshot function**

The `snapshot3D` function (line 202-240) uses `canvas.getContext('webgl2')` and `readPixels`. With WebGPURenderer, we need a different approach:

```typescript
const snapshot3D = useCallback(async () => {
  const container = containerRef.current;
  if (!container) return;
  const store = container as unknown as Record<string, unknown>;
  const renderer = store.__gl as THREE.Renderer | undefined;
  const scene = store.__scene as THREE.Scene | undefined;
  const camera = store.__camera as THREE.Camera | undefined;
  if (!renderer || !scene || !camera) return;

  // Force render
  renderer.render(scene, camera);

  // Use canvas.toDataURL — works for both WebGL and WebGPU
  const canvas = renderer.domElement;
  const link = document.createElement('a');
  link.download = `openclo-fitmap-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}, []);
```

Note: `canvas.toDataURL()` works for both WebGL (with `preserveDrawingBuffer` caveat) and WebGPU canvases. Since we call `renderer.render()` immediately before, the buffer is fresh.

**Step 3: Update EnvironmentSetup.tsx tone mapping**

In `src/components/Viewport3D/EnvironmentSetup.tsx`, the `gl.toneMapping` and `gl.toneMappingExposure` properties exist on both renderers. The `gl.setClearColor()` method also exists on both. No changes needed IF `useThree` returns the correct type. Check that it compiles.

**Step 4: Run the dev server and verify 3D viewport loads**

Run: `npm run dev`
Expected: Open in Chrome, navigate to 3D view. Canvas should render. Console should show WebGPU init (or WebGL2 fallback). All existing materials, lighting, environment, grid should display correctly.

**Step 5: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(webgpu): switch Canvas to WebGPURenderer with WebGL2 fallback"
```

---

### Task 4: Create StorageBufferAttribute Factory

**Files:**
- Create: `src/utils/cloth/gpu/gpuStorageAttributes.ts`
- Test: `src/utils/cloth/gpu/__tests__/gpuStorageAttributes.test.ts`

**Context:** This module wraps raw `GPUBuffer` objects from the solver into Three.js `StorageBufferAttribute` instances that can be bound as vertex attributes. This is the zero-copy bridge.

**Step 1: Write the test**

```typescript
// src/utils/cloth/gpu/__tests__/gpuStorageAttributes.test.ts
import { describe, it, expect } from 'vitest';
import { createPositionStorageAttribute, createNormalStorageAttribute } from '../gpuStorageAttributes';

describe('gpuStorageAttributes', () => {
  it('returns null when buffer is null', () => {
    expect(createPositionStorageAttribute(null, 0)).toBeNull();
    expect(createNormalStorageAttribute(null, 0)).toBeNull();
  });

  it('returns null when particle count is 0', () => {
    // Can't create a real GPUBuffer in test env, but we can test the guard
    expect(createPositionStorageAttribute(null, 100)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuStorageAttributes.test.ts`
Expected: FAIL — module does not exist yet.

**Step 3: Write implementation**

```typescript
// src/utils/cloth/gpu/gpuStorageAttributes.ts
/**
 * StorageBufferAttribute factory — wraps GPU solver buffers for zero-copy rendering.
 *
 * Creates Three.js StorageBufferAttribute instances from raw GPUBuffers,
 * enabling direct compute-to-render data flow without CPU readback.
 *
 * @module gpuStorageAttributes
 */

import * as THREE from 'three/webgpu';

/**
 * Wrap a GPU position buffer as a StorageBufferAttribute (vec3, itemSize 3).
 * Returns null if buffer is unavailable.
 */
export function createPositionStorageAttribute(
  buffer: GPUBuffer | null,
  particleCount: number,
): THREE.StorageBufferAttribute | null {
  if (!buffer || particleCount <= 0) return null;
  // StorageBufferAttribute wraps a TypedArray but we need to provide
  // the initial data size — Three.js will bind the underlying GPU buffer
  const attr = new THREE.StorageBufferAttribute(new Float32Array(particleCount * 3), 3);
  // Replace the internal GPU buffer with our solver's buffer
  // This is the zero-copy trick: Three.js renders directly from our compute buffer
  (attr as any).gpuBuffer = buffer;
  return attr;
}

/**
 * Wrap a GPU normal buffer as a StorageBufferAttribute (vec3, itemSize 3).
 * Returns null if buffer is unavailable.
 */
export function createNormalStorageAttribute(
  buffer: GPUBuffer | null,
  particleCount: number,
): THREE.StorageBufferAttribute | null {
  if (!buffer || particleCount <= 0) return null;
  const attr = new THREE.StorageBufferAttribute(new Float32Array(particleCount * 3), 3);
  (attr as any).gpuBuffer = buffer;
  return attr;
}
```

> **Important note for implementer:** The exact API for binding an external GPUBuffer to a `StorageBufferAttribute` may differ based on the Three.js version. The implementer MUST check Three.js source/docs for the correct way to set the underlying buffer. Alternatives include:
> - `new THREE.StorageBufferAttribute(count, itemSize)` with a buffer property
> - Using `THREE.StorageInstancedBufferAttribute`
> - Setting `.buffer` directly on the attribute after creation
>
> The test env won't have real WebGPU, so unit tests only cover null guards. Real validation happens in Task 8 (manual test).

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuStorageAttributes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuStorageAttributes.ts src/utils/cloth/gpu/__tests__/gpuStorageAttributes.test.ts
git commit -m "feat(webgpu): add StorageBufferAttribute factory for zero-copy rendering"
```

---

### Task 5: Update GpuSolverClient for Zero-Copy Mode

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`

**Context:** Currently the `loop()` method calls `this.solver.readPositions()` every frame (the bottleneck). We need two modes:
1. **Zero-copy mode** (new): `loop()` only calls `solver.step()` — no readback. Exposes `getPositionStorageAttribute()` and `getNormalStorageAttribute()`.
2. **Readback mode** (existing): For fit maps and export, which need CPU-side positions.

**Step 1: Add zero-copy mode to GpuSolverClient**

Add imports and new methods to `src/utils/cloth/gpu/gpuSolverClient.ts`:

```typescript
// Add import at top:
import { createPositionStorageAttribute, createNormalStorageAttribute } from './gpuStorageAttributes';
import type { StorageBufferAttribute } from 'three/webgpu';

// Add to class body:

  /** Whether to skip CPU readback (zero-copy mode). Default true. */
  private zeroCopy: boolean = true;

  /** Cached StorageBufferAttributes for rendering. */
  private positionAttr: StorageBufferAttribute | null = null;
  private normalAttr: StorageBufferAttribute | null = null;

  /**
   * Enable/disable zero-copy mode.
   * When true (default), the loop skips readPositions() and positions render directly from GPU.
   * When false, positions are read back to CPU each frame (legacy behavior, needed for fit maps).
   */
  setZeroCopy(enabled: boolean): void {
    this.zeroCopy = enabled;
  }

  /**
   * Get position StorageBufferAttribute for zero-copy rendering.
   * Returns null before init or if solver has no buffers.
   */
  getPositionStorageAttribute(): StorageBufferAttribute | null {
    if (!this.positionAttr) {
      this.positionAttr = createPositionStorageAttribute(
        this.solver.getPositionBuffer(),
        this.solver.numParticles,
      );
    }
    return this.positionAttr;
  }

  /**
   * Get normal StorageBufferAttribute for zero-copy rendering.
   */
  getNormalStorageAttribute(): StorageBufferAttribute | null {
    if (!this.normalAttr) {
      this.normalAttr = createNormalStorageAttribute(
        this.solver.getNormalBuffer(),
        this.solver.numParticles,
      );
    }
    return this.normalAttr;
  }

  /**
   * Read positions to CPU (async). Use for fit maps, export — NOT per frame.
   */
  async readPositionsToCPU(): Promise<Float32Array | null> {
    return this.solver.readPositions();
  }
```

**Step 2: Update the loop method**

Replace the existing `loop` method:

```typescript
  private loop = (): void => {
    if (!this.running) return;

    // Step simulation (GPU compute)
    this.solver.step();

    if (this.zeroCopy) {
      // Zero-copy mode: no readback. Signal frame for timing metrics only.
      if (this.onFrame) {
        // Pass empty array — GarmentSimulation ignores it in GPU mode
        // (positions come from StorageBufferAttribute, not from onFrame)
        this.onFrame(new Float32Array(0));
      }
    } else {
      // Legacy readback mode (for fit maps etc.)
      this.solver.readPositions().then(positions => {
        if (positions && this.onFrame) {
          this.onFrame(positions);
        }
      });
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
```

**Step 3: Clean up cached attrs in dispose**

In the `dispose()` method, add:
```typescript
  dispose(): void {
    this.stop();
    this.positionAttr = null;
    this.normalAttr = null;
    this.solver.destroy();
  }
```

**Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors in this file.

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts
git commit -m "feat(webgpu): add zero-copy mode to GpuSolverClient with StorageBufferAttribute"
```

---

### Task 6: Verify GPU Buffer Usage Flags

**Files:**
- Modify: `src/utils/cloth/gpu/gpuBuffers.ts:316-331`

**Context:** The position and normal buffers already have `GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX`. Verify this is correct and no changes are needed. If `COPY_SRC` is missing from normals, add it (needed for potential readback).

**Step 1: Verify buffer flags**

Read `src/utils/cloth/gpu/gpuBuffers.ts` lines 316-331. The position buffer (line 319) has:
```
GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
```
This is correct — `STORAGE` for compute, `VERTEX` for rendering, `COPY_SRC` for readback.

The normal buffer (line 330) has:
```
GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
```
This is also correct for zero-copy rendering. No `COPY_SRC` needed unless we want to read normals back to CPU (we don't).

**Step 2: No code changes needed — just verify**

If the flags are already correct, no modification is needed. Skip commit.

---

### Task 7: Re-Enable WebGPU Tier in Simulation Lifecycle + Shared Device

**Files:**
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts:15-24,199-216`

**Context:** The WebGPU tier is disabled with `if (false as boolean && ...)`. We need to:
1. Remove the `false` guard
2. Add a feature flag check (`webclo-use-webgpu` localStorage)
3. Use the **renderer's GPUDevice** (shared device) instead of creating a new one via `initWebGPU()`

**Step 1: Add feature flag helper**

At the top of the file, add:

```typescript
/** Check localStorage feature flag. Default: true (WebGPU enabled). */
function isWebGPUFeatureEnabled(): boolean {
  try {
    return localStorage.getItem('webclo-use-webgpu') !== 'false';
  } catch {
    return true;
  }
}
```

**Step 2: Import useThree for device access**

Add `useThree` import:
```typescript
import { useThree } from '@react-three/fiber';
```

In the hook body, get the renderer:
```typescript
const gl = useThree((s) => s.gl);
```

**Step 3: Replace the disabled WebGPU block**

Replace lines 199-216:

```typescript
        // ─── WebGPU (zero-copy) ─────────────────────────────────────────
        if (isWebGPUFeatureEnabled() && isWebGPUAvailable()) {
          try {
            // Get shared GPUDevice from the WebGPURenderer
            const device = (gl as any).backend?.device as GPUDevice | undefined;
            if (device && !cancelled) {
              console.log('[SimLifecycle] 🟢 Using WebGPU solver (zero-copy)');
              dispatch(setSolverTier('webgpu'));
              const gpuClient = new GpuSolverClient(device);
              gpuClientRef.current = gpuClient;
              gpuClient.onFrame = onFrame;
              await withTimeout(gpuClient.initMultiPiece(placedMeshes), 10000, 'GPU solver init');
              if (!cancelled) gpuClient.start();
              return;
            } else if (!cancelled) {
              console.warn('[SimLifecycle] WebGPU renderer device not available, falling back');
            }
          } catch (e) {
            console.warn('[SimLifecycle] WebGPU failed, falling back:', e);
          }
        }
```

Key change: Instead of `initWebGPU()` (which creates a new device), we extract the device from the renderer via `gl.backend.device`. This ensures the solver and renderer share the same device — required for zero-copy buffer sharing.

**Step 4: Add `gl` to hook dependencies and props**

The `useThree` call must be inside the hook. Add `gl` to the `useEffect` dependency array:

```typescript
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight, collisionBodies, stretchingIdsRef, dispatch, gl]);
```

**Step 5: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean (the `any` casts handle the backend.device access).

**Step 6: Commit**

```bash
git add src/components/Viewport3D/useSimulationLifecycle.ts
git commit -m "feat(webgpu): re-enable GPU solver tier with shared device from WebGPURenderer"
```

---

### Task 8: Dual Material Path in GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:17-19,254-269,477-508`

**Context:** When `solverTier === 'webgpu'`, the cloth mesh should use `StorageBufferAttribute` for positions/normals (zero-copy). When WASM/CPU, it uses the existing `BufferAttribute.needsUpdate` path.

**Step 1: Add imports**

```typescript
import { useSelector } from 'react-redux';
// ... existing imports ...

// Add at top:
import type { SolverTier } from '../../store/simulationSlice';
```

**Step 2: Read solver tier from Redux**

In `MergedSimulation`, add:
```typescript
const solverTier = useSelector((s: RootState) => s.simulation.solverTier);
```

**Step 3: Get StorageBufferAttributes from GPU client**

After the `useSimulationLifecycle` call, add:

```typescript
  // Zero-copy GPU attributes (only available when solverTier === 'webgpu')
  const gpuPositionAttr = useMemo(() => {
    if (solverTier !== 'webgpu' || !clients.gpu) return null;
    return clients.gpu.getPositionStorageAttribute();
  }, [solverTier, clients.gpu]);

  const gpuNormalAttr = useMemo(() => {
    if (solverTier !== 'webgpu' || !clients.gpu) return null;
    return clients.gpu.getNormalStorageAttribute();
  }, [solverTier, clients.gpu]);
```

**Step 4: Update per-frame geometry update**

Modify the `useFrame` callback to skip CPU position copy when GPU zero-copy is active:

```typescript
  useFrame(() => {
    if (!meshRef.current || !staticGeometry) return;
    if (isPlayingBack) return;

    // GPU zero-copy: positions/normals are already on GPU via StorageBufferAttribute
    // We only need to update fit map colors (CPU-side, infrequent)
    if (solverTier === 'webgpu') {
      // Still update fit map colors if needed
      // (fit maps require CPU readback — triggered on demand, not per-frame)
      return;
    }

    // WASM/CPU path: copy positions from solver to geometry
    const positions = positionsRef.current;
    if (!positions) return;

    const posAttr = staticGeometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === positions.length) {
      (posAttr.array as Float32Array).set(positions);
      posAttr.needsUpdate = true;
      staticGeometry.computeVertexNormals();
      staticGeometry.computeBoundingSphere();
    }

    // Fit map overlay (existing code)...
  });
```

**Step 5: Apply StorageBufferAttributes to geometry**

After geometry building, when GPU solver is active, replace position/normal attributes:

```typescript
  // Apply GPU storage attributes when available
  useEffect(() => {
    if (!staticGeometry || solverTier !== 'webgpu') return;
    if (gpuPositionAttr) {
      staticGeometry.setAttribute('position', gpuPositionAttr);
    }
    if (gpuNormalAttr) {
      staticGeometry.setAttribute('normal', gpuNormalAttr);
    }
  }, [staticGeometry, solverTier, gpuPositionAttr, gpuNormalAttr]);
```

**Step 6: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

**Step 7: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(webgpu): dual material path — zero-copy GPU attrs or CPU position updates"
```

---

### Task 9: Update Export Functions for Async Readback

**Files:**
- Modify: `src/utils/export/stillExporter.ts`
- Modify: `src/utils/export/animationExporter.ts`

**Context:** `readRenderTargetPixels` is synchronous in WebGL but may not exist on WebGPURenderer. Three.js r171+ provides `readRenderTargetPixelsAsync` which works on both backends. Since export functions are already in async contexts (button handlers), switching to async is straightforward.

**Step 1: Update stillExporter.ts**

Make `exportStill` async and use `readRenderTargetPixelsAsync`:

```typescript
export async function exportStill(
  renderer: THREE.Renderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: StillExportConfig,
): Promise<void> {
  // ... same setup code ...

  const renderTarget = new THREE.RenderTarget(width, height);  // Backend-agnostic

  // ... render code ...

  // Read pixels (async, works on both WebGL and WebGPU)
  const pixels = new Uint8Array(width * height * 4);
  if ('readRenderTargetPixelsAsync' in renderer) {
    const result = await (renderer as any).readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height);
    pixels.set(new Uint8Array(result.buffer));
  } else {
    (renderer as any).readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  }

  // ... rest unchanged (flip + download) ...
}
```

**Step 2: Update animationExporter.ts similarly**

Same pattern: check for `readRenderTargetPixelsAsync`, fall back to sync version.

**Step 3: Update Viewport3D callers**

Since `exportStill` is now async, update the calling sites in `Viewport3D.tsx`:
- `handleExportStill` → make async
- `handleExportAllViews` → make async (calls exportStill internally)

**Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

**Step 5: Commit**

```bash
git add src/utils/export/stillExporter.ts src/utils/export/animationExporter.ts src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(webgpu): async readback for export functions, works on both WebGL and WebGPU"
```

---

### Task 10: Feature Flag for WebGPU Toggle

**Files:**
- Modify: `src/copilot/features.ts` (if exists, else skip)
- Modify: `src/store/simulationSlice.ts` (add to status display)

**Context:** Add `webclo-use-webgpu` localStorage flag. Default: `true`. Set `false` to force WASM path. This was already referenced in Task 7 via the `isWebGPUFeatureEnabled()` helper.

**Step 1: Verify the feature flag works**

The `isWebGPUFeatureEnabled()` function in `useSimulationLifecycle.ts` (from Task 7) reads `localStorage.getItem('webclo-use-webgpu')`. If it returns `'false'`, WebGPU is skipped. No additional code needed.

**Step 2: Add console log for solver tier**

Already handled by existing `console.log('[SimLifecycle] 🟢 Using WebGPU solver (zero-copy)')` in Task 7.

**Step 3: No code changes needed — skip commit**

---

### Task 11: Full Test Suite + Type Check

**Files:**
- No files created, just verification

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `npm test`
Expected: All existing tests pass. No regressions.

**Step 3: Fix any test failures**

If any tests fail due to Three.js API changes from the upgrade, fix them:
- Mock updates for `WebGLRenderer` → `Renderer` type
- Import path changes (`three` → `three/webgpu` in files that need it)

**Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve test failures from Three.js/R3F upgrade"
```

---

### Task 12: Manual Verification — WebGPU Zero-Copy

**Files:**
- No files changed, just verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Open in Chrome (WebGPU-enabled)**

Open the app, navigate to 3D view. Add a garment and start simulation.

**Step 3: Check console for solver tier**

Expected: `[SimLifecycle] 🟢 Using WebGPU solver (zero-copy)`

If you see `🟠 Using Wasm XPBD solver` instead, WebGPU device extraction failed. Check:
- Console for WebGPU errors
- `gl.backend?.device` availability (may need different accessor path)

**Step 4: Verify cloth simulates correctly**

Cloth should drape, collide with avatar, respond to gravity. Visual result should be identical to WASM path.

**Step 5: Check frame time**

The Redux `simulation.frameTime` should be significantly lower than with WASM (especially for large meshes with 5K+ vertices).

**Step 6: Test WebGL2 fallback**

Disable WebGPU: `localStorage.setItem('webclo-use-webgpu', 'false')`, reload. Verify WASM path activates and simulation works.

Re-enable: `localStorage.removeItem('webclo-use-webgpu')`, reload.

**Step 7: Test export functions**

Take a snapshot (F10), verify PNG downloads correctly.

**Step 8: Build**

Run: `npm run build`
Expected: Build succeeds with no errors.
