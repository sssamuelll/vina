# SDF Removal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all SDF (Signed Distance Field) code now that triangle mesh collision is fully implemented, and wire JS-side triangle collision into the Wasm solver worker.

**Architecture:** Delete `sdfGenerator.ts` and `avatarSDF.ts`. Remove SDF imports, fields, methods, and handlers from all solvers, workers, and clients. Replace `applyInitialCollision` with triangle-based settling. Add JS-side `solveTriangleCollision()` post-step in the Wasm worker's simulation loop. Rebuild the Rust Wasm crate without SDF. Rename remaining `avatarSDF.ts` references to `avatarMeshExtractor.ts`.

**Tech Stack:** TypeScript, Rust/Wasm (wasm-pack), Vitest

---

## Task 1: Remove SDF from Rust Wasm Crate

Remove all SDF-related code from the Rust solver and rebuild the Wasm binary.

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs:32-37,100-104,186-193,279-281,484-574`

**Step 1: Remove SDF struct fields from lib.rs**

Remove lines 32-37 (SDF collision fields):

```rust
// DELETE these fields from XpbdSolver struct:
    sdf_data: Vec<f32>,
    sdf_resolution: u32,
    sdf_min: [f32; 3],
    sdf_cell_size: f32,
    has_sdf: bool,
```

Remove their initialization at lines 100-104:

```rust
// DELETE from constructor:
            sdf_data: Vec::new(),
            sdf_resolution: 0,
            sdf_min: [0.0; 3],
            sdf_cell_size: 0.0,
            has_sdf: false,
```

**Step 2: Remove SDF methods from lib.rs**

Remove `set_sdf()` method (lines 186-193):

```rust
// DELETE:
    pub fn set_sdf(&mut self, data: &[f32], resolution: u32, min_x: f32, min_y: f32, min_z: f32, cell_size: f32) { ... }
```

Remove SDF collision call in `step()` (lines 279-281):

```rust
// DELETE from step():
            if self.has_sdf {
                self.solve_sdf_collision();
            }
```

Remove `solve_sdf_collision()` (lines 484-504), `sample_sdf()` (lines 520-562), and `sdf_gradient()` (lines 564-574).

**Step 3: Build Wasm and copy to public/**

Run:
```bash
cd crates/xpbd-wasm && wasm-pack build --target web --out-dir pkg
cp pkg/xpbd_wasm.js ../../public/wasm/
cp pkg/xpbd_wasm_bg.wasm ../../public/wasm/
```

**Step 4: Verify build succeeds**

Run: `cd crates/xpbd-wasm && cargo check`
Expected: No errors

**Step 5: Commit**

```bash
git add crates/xpbd-wasm/src/lib.rs public/wasm/xpbd_wasm.js public/wasm/xpbd_wasm_bg.wasm
git commit -m "refactor(wasm): remove SDF collision from Rust solver"
```

---

## Task 2: Wire JS-Side Triangle Collision into Wasm Worker

Replace the SDF stub in `wasmSolverWorker.ts` with functional JS-side triangle collision post-step. This is the core change — the Wasm solver now gets body collision via JS after each `solver.step()`.

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:7-8,32,63-89,210-258`

**Step 1: Add triangle collision imports and state**

Add imports at top of file (after line 9):

```typescript
import type { CollisionMeshData } from '../collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from '../triangleCollision';
```

Add module-level state (after line 60, before `FRAME_BUDGET_MS`):

```typescript
let collisionMesh: CollisionMeshData | null = null;
let collisionHash: TriangleSpatialHash | null = null;
```

**Step 2: Remove `set_sdf` from WasmXpbdSolver interface**

Remove line 32:

```typescript
// DELETE:
  set_sdf(data: Float32Array, resolution: number, minX: number, minY: number, minZ: number, cellSize: number): void;
```

**Step 3: Add JS-side triangle collision to simulationLoop**

Replace the simulation loop body (lines 63-89). After `solver.step(dt)`, read positions into JS, apply triangle collision, write back to Wasm memory:

```typescript
function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  solver.step(1 / 60);

  // Read positions from Wasm memory
  const n = numParticles;
  const ptr = solver.positions_ptr();

  if (wasmExports?.memory) {
    // Apply JS-side triangle collision post-step
    if (collisionMesh && collisionHash) {
      const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);
      const invMass = new Float32Array(n).fill(1.0);
      solveTriangleCollision(positions, invMass, n, collisionMesh, collisionHash, 0.005);
    }
    // Copy positions for transfer (can't transfer Wasm memory view)
    const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
    (self as unknown as Worker).postMessage(
      { type: 'frame', positions },
      [positions.buffer],
    );
  } else {
    const positions = new Float32Array(n * 3);
    (self as unknown as Worker).postMessage(
      { type: 'frame', positions },
      [positions.buffer],
    );
  }

  const elapsed = performance.now() - t0;
  const delay = elapsed > FRAME_BUDGET_MS ? Math.min(elapsed, 50) : 1000 / 60;
  animFrameId = setTimeout(simulationLoop, delay);
}
```

**Step 4: Replace setSDF handler with no-op, update setCollisionMesh handler**

Remove the `setSDF` case (lines 210-217). Update `setCollisionMesh` (lines 219-225) to build the spatial hash:

```typescript
      case 'setCollisionMesh':
        if (msg.mesh) {
          collisionMesh = msg.mesh;
          collisionHash = new TriangleSpatialHash(msg.mesh, 0.05);
          console.log('[WasmWorker] Collision mesh set:', msg.mesh.triCount, 'triangles');
        }
        break;
```

**Step 5: Replace `applyInitialCollision` with `applyInitialTriangleCollision`**

Replace lines 227-258 with triangle collision settling:

```typescript
      case 'applyInitialTriangleCollision':
        if (solver && collisionMesh && collisionHash && wasmExports?.memory) {
          console.log('[WasmWorker] Running initial triangle collision settling...');
          const n = numParticles;
          const ptr = solver.positions_ptr();
          const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);
          const invMass = new Float32Array(n).fill(1.0);
          for (let i = 0; i < 5; i++) {
            solveTriangleCollision(positions, invMass, n, collisionMesh, collisionHash, 0.005);
          }
          // Positions modified in-place on Wasm memory view
          const frame = positions.slice();
          (self as unknown as Worker).postMessage(
            { type: 'frame', positions: frame },
            [frame.buffer],
          );
          console.log('[WasmWorker] Initial triangle collision settling complete');
        }
        break;
```

**Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors (setSDF references in other files will be cleaned up in later tasks)

**Step 7: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts
git commit -m "feat(wasm-worker): replace SDF with JS-side triangle collision post-step"
```

---

## Task 3: Remove SDF from Wasm and CPU Solver Clients

Remove `setSDF()` and `applyInitialCollision()` from client classes. Add `applyInitialTriangleCollision()` to Wasm client.

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts:11,101-122`
- Modify: `src/utils/cloth/clothWorkerClient.ts:12,199-208`

**Step 1: Clean wasmSolverClient.ts**

Remove line 11 (`SDFData` import):

```typescript
// DELETE:
import type { SDFData } from '../sdfGenerator';
```

Remove `setSDF()` method (lines 101-104):

```typescript
// DELETE:
  /** @deprecated Use setCollisionMesh() instead. Retained for Wasm solver compatibility. */
  setSDF(sdf: SDFData): void {
    this.worker?.postMessage({ type: 'setSDF', sdf });
  }
```

Remove `applyInitialCollision()` method (lines 119-122):

```typescript
// DELETE:
  applyInitialCollision(): void {
    this.worker?.postMessage({ type: 'applyInitialCollision' });
  }
```

Add `applyInitialTriangleCollision()` method after `setCollisionMesh()`:

```typescript
  /**
   * Apply initial triangle collision pass to settle particles outside body.
   * Call AFTER setCollisionMesh() and BEFORE start().
   */
  applyInitialTriangleCollision(): void {
    this.worker?.postMessage({ type: 'applyInitialTriangleCollision' });
  }
```

**Step 2: Clean clothWorkerClient.ts**

Remove line 12 (`SDFData` import):

```typescript
// DELETE:
import type { SDFData } from './sdfGenerator';
```

Remove `setSDF()` method (lines 199-208):

```typescript
// DELETE the entire setSDF method
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors only in GarmentSimulation.tsx (calling removed methods — fixed in Task 5)

**Step 4: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverClient.ts src/utils/cloth/clothWorkerClient.ts
git commit -m "refactor: remove setSDF from solver clients"
```

---

## Task 4: Remove SDF from XPBDClothSolver and CPU Worker

Remove SDF collision block from the TypeScript solver and worker handler.

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts:13,324-325,593-605,941-966`
- Modify: `src/utils/cloth/clothWorker.ts:43,296-301`

**Step 1: Clean xpbdSolver.ts**

Remove SDF imports from line 13:

```typescript
// CHANGE from:
import { type SDFData, sampleSDF, sdfGradient } from './sdfGenerator';
// TO:
// (delete the entire line — no SDF imports needed)
```

Remove `sdfData` field (lines 324-325):

```typescript
// DELETE:
  /** SDF data for accurate avatar body collision */
  private sdfData: SDFData | null = null;
```

Remove `setSDF()` method (lines 593-605):

```typescript
// DELETE the entire setSDF method
```

Remove the SDF collision block in `solveCollisions()` (lines 941-966):

```typescript
// DELETE the entire block from:
    // SDF collision (accurate avatar body collision)
    if (this.sdfData) {
    ...
    }
```

**Step 2: Clean clothWorker.ts**

Remove `setSDF` from `WorkerInMessage` union (line 43):

```typescript
// DELETE:
  | { type: 'setSDF'; sdf: SDFData }
```

Remove the `setSDF` case handler (lines 296-301):

```typescript
// DELETE:
      case 'setSDF': {
        if (solver) {
          solver.setSDF(msg.sdf);
        }
        break;
      }
```

Remove the `SDFData` import if it was only used for `setSDF`. Check whether `SDFData` is still used — it's imported via `ClothSimConfig` from `xpbdSolver` already (via `WorkerInMessage`). If `SDFData` is only referenced in the deleted `setSDF` union member, remove any standalone import.

**Step 3: Run tests**

Run: `npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts`
Expected: All pass

**Step 4: Commit**

```bash
git add src/utils/cloth/xpbdSolver.ts src/utils/cloth/clothWorker.ts
git commit -m "refactor: remove SDF collision from CPU solver and worker"
```

---

## Task 5: Remove SDF from GarmentSimulation.tsx

Remove the entire SDF cache/loading infrastructure and replace Wasm solver's SDF usage with triangle collision.

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:5,37-190,568-574,597-630`

**Step 1: Update module doc (line 5)**

```typescript
// CHANGE from:
 * All heavy work (meshing, SDF, simulation) runs in Web Workers.
// TO:
 * All heavy work (meshing, collision mesh extraction, simulation) runs in Web Workers.
```

**Step 2: Delete SDF cache section (lines 37-190)**

Delete all of:
- `_sdfInflight` map (line 40)
- `sdfCacheKey()` (lines 42-44)
- `SDF_IDB_STORE`, `SDF_IDB_VERSION` (lines 46-47)
- `openSdfIdb()` (lines 49-56)
- `getSdfFromIdb()` (lines 58-81)
- `putSdfToIdb()` (lines 83-96)
- `loadSDFInWorker()` (lines 102-190)

**Step 3: Replace GPU solver SDF loading (lines 568-574)**

Replace the SDF loading block with collision mesh extraction:

```typescript
              // Load collision mesh for body collision (GPU solver — future: GPU triangle collision)
              if (avatarModelUrl && !cancelled) {
                extractAvatarCollisionMesh(avatarModelUrl, avatarHeight).then(mesh => {
                  if (mesh && !cancelled) { dispatch(setBodyCollision(true)); }
                  else if (!cancelled) { dispatch(setBodyCollision(false)); }
                }).catch(e => { console.warn('[GarmentSimulation] Avatar collision mesh failed:', e); dispatch(setBodyCollision(false)); });
              }
```

Note: GPU solver doesn't have triangle collision yet (out of scope). We just dispatch `setBodyCollision(false)` for now since the GPU solver has no collision. Actually, we should dispatch `setBodyCollision(false)` since the GPU solver can't use it yet.

```typescript
              // GPU solver doesn't support triangle collision yet
              if (avatarModelUrl && !cancelled) {
                dispatch(setBodyCollision(false));
              }
```

**Step 4: Replace Wasm solver SDF section (lines 597-630)**

Replace with triangle collision only:

```typescript
              // Load collision mesh BEFORE starting simulation
              if (avatarModelUrl && !cancelled) {
                console.log('[GarmentSimulation] Loading avatar collision data...');
                try {
                  const collisionMesh = await withTimeout(
                    extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
                    5000,
                    'Collision mesh extraction'
                  );
                  if (collisionMesh && !cancelled) {
                    console.log('[GarmentSimulation] ✅ Collision mesh extracted:', collisionMesh.triCount, 'triangles');
                    wasmClient.setCollisionMesh(collisionMesh);
                    wasmClient.applyInitialTriangleCollision();
                    dispatch(setBodyCollision(true));
                  } else if (!cancelled) {
                    dispatch(setBodyCollision(false));
                  }
                } catch (e) {
                  console.warn('[GarmentSimulation] Collision data load failed:', e);
                  dispatch(setBodyCollision(false));
                }
              }
```

**Step 5: Remove SimulationInitClient import if no longer used**

Check if `SimulationInitClient` is still used elsewhere in the file. If `generateSDF` was the only reason it exists, it can be kept for meshing. Keep the import — it's used for `meshPiece`.

**Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "refactor(GarmentSimulation): remove SDF loading, use triangle collision for all solvers"
```

---

## Task 6: Remove SDF from GPU Solver

Remove SDF buffers, collision pass, and methods from the GPU solver.

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolver.ts:21,81-84,217-224,316-392,447-451`
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts:14,128-130`

**Step 1: Clean gpuSolver.ts**

Remove `SDFData` import (line 21):

```typescript
// DELETE:
import type { SDFData } from '../sdfGenerator';
```

Remove SDF fields (lines 81-84):

```typescript
// DELETE:
  private sdfBuffer: GPUBuffer | null = null;
  private collisionParamsBuffer: GPUBuffer | null = null;
  private hasSDF: boolean = false;
```

Remove SDF collision pass in `step()` (lines 217-224):

```typescript
// DELETE:
      // SDF body collision
      if (this.hasSDF && this.collisionPipeline && this.collisionBindGroup) {
        const col = encoder.beginComputePass({ label: 'collision' });
        col.setPipeline(this.collisionPipeline);
        col.setBindGroup(0, this.collisionBindGroup);
        col.dispatchWorkgroups(particleWG);
        col.end();
      }
```

Remove `setSDF()` method (lines 316-380) and `clearSDF()` method (lines 385-392).

Remove SDF cleanup in `destroy()` (lines 447-451):

```typescript
// DELETE:
    this.sdfBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();
    this.sdfBuffer = null;
    this.collisionParamsBuffer = null;
    this.hasSDF = false;
```

**Step 2: Clean gpuSolverClient.ts**

Remove `SDFData` import (line 14):

```typescript
// DELETE:
import type { SDFData } from '../sdfGenerator';
```

Remove `setSDF()` method (lines 128-130):

```typescript
// DELETE:
  setSDF(sdf: SDFData): void {
    this.solver.setSDF(sdf);
  }
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolver.ts src/utils/cloth/gpu/gpuSolverClient.ts
git commit -m "refactor(gpu): remove SDF collision from GPU solver"
```

---

## Task 7: Remove SDF from SimulationInitClient and SimulationWorker

Remove the SDF generation pipeline from the init worker system.

**Files:**
- Modify: `src/utils/cloth/simulationInitClient.ts:11,37-40,76-86,129-151,191-193`
- Modify: `src/utils/cloth/simulationWorker.ts:11,37-48,57,89-109`

**Step 1: Clean simulationInitClient.ts**

Remove `SDFData` import (line 11):

```typescript
// DELETE:
import type { SDFData } from './sdfGenerator';
```

Remove `pendingSDF` field (lines 37-40):

```typescript
// DELETE:
  private pendingSDF: {
    resolve: (v: SDFData | null) => void;
    reject: (e: Error) => void;
  } | null = null;
```

Remove `sdfResult` handler (lines 76-86):

```typescript
// DELETE:
    if (msg.type === 'sdfResult') {
      if (this.pendingSDF) {
        const { resolve, reject } = this.pendingSDF;
        this.pendingSDF = null;
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.sdf);
        }
      }
    }
```

Remove `generateSDF()` method (lines 129-151).

Remove SDF rejection in `rejectAll()` (lines 191-193):

```typescript
// DELETE:
    if (this.pendingSDF) {
      this.pendingSDF.reject(error);
      this.pendingSDF = null;
    }
```

Update module doc to remove SDF mention.

**Step 2: Clean simulationWorker.ts**

Remove `generateSDF` and `SDFData` import (line 11):

```typescript
// DELETE:
import { generateSDF, type SDFData } from './sdfGenerator';
```

Remove `SDFRequest` and `SDFResponse` interfaces (lines 37-48).

Update `WorkerRequest` and `WorkerResponse` types (lines 57-58) to remove SDF:

```typescript
export type WorkerRequest = MeshPieceRequest;
export type WorkerResponse = MeshPieceResponse | ProgressMessage;
```

Remove the SDF generation handler (lines 89-109):

```typescript
// DELETE:
  if (msg.type === 'generateSDF') { ... }
```

Update module doc to remove SDF mention.

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/utils/cloth/simulationInitClient.ts src/utils/cloth/simulationWorker.ts
git commit -m "refactor: remove SDF generation from simulation init worker"
```

---

## Task 8: Delete sdfGenerator.ts and Rename avatarSDF.ts

Delete the SDF generator module and rename `avatarSDF.ts` to `avatarMeshExtractor.ts` keeping only the mesh extraction functions.

**Files:**
- Delete: `src/utils/cloth/sdfGenerator.ts`
- Delete: `src/utils/cloth/__tests__/sdfGenerator.test.ts`
- Rename: `src/utils/cloth/avatarSDF.ts` → `src/utils/cloth/avatarMeshExtractor.ts`
- Rename: `src/utils/cloth/__tests__/avatarSDF.test.ts` → `src/utils/cloth/__tests__/avatarMeshExtractor.test.ts`
- Modify: `src/utils/cloth/avatarCollisionMesh.ts:17` (update import path)

**Step 1: Create avatarMeshExtractor.ts with only the kept functions**

Create `src/utils/cloth/avatarMeshExtractor.ts` containing only:
- `applyAPose()` (lines 40-69 from avatarSDF.ts)
- `extractMeshData()` (lines 77-140 from avatarSDF.ts)

Remove from the file:
- `sdfCache` map (line 17)
- `cacheKey()` (lines 19-21)
- `clearAvatarSDFCache()` (lines 26-28)
- `buildAvatarSDF()` (lines 159-222)
- `generateSDF` import (line 12)

Keep the `SDFData` removal — remove line 12 (`import { generateSDF, type SDFData } from './sdfGenerator'`).

The new file should have:
```typescript
import * as THREE from 'three';
import { POSE_PRESETS } from '../../store/avatarSlice';

const DEG2RAD = Math.PI / 180;

// applyAPose function (unchanged)
// extractMeshData function (unchanged, exported)
```

**Step 2: Update avatarMeshExtractor test**

Create `src/utils/cloth/__tests__/avatarMeshExtractor.test.ts` with just the `extractMeshData` tests from `avatarSDF.test.ts` (lines 41-74). Remove the SDF-specific tests (lines 77-121).

Update imports:
```typescript
import { extractMeshData } from '../avatarMeshExtractor';
// Remove: clearAvatarSDFCache, generateSDF, SDFData
```

**Step 3: Update avatarCollisionMesh.ts import**

Change line 17 in `avatarCollisionMesh.ts`:

```typescript
// CHANGE from:
  const { extractMeshData } = await import('./avatarSDF');
// TO:
  const { extractMeshData } = await import('./avatarMeshExtractor');
```

**Step 4: Delete old files**

```bash
rm src/utils/cloth/sdfGenerator.ts
rm src/utils/cloth/__tests__/sdfGenerator.test.ts
rm src/utils/cloth/avatarSDF.ts
rm src/utils/cloth/__tests__/avatarSDF.test.ts
```

**Step 5: Run tests**

Run: `npx vitest run src/utils/cloth/__tests__/avatarMeshExtractor.test.ts`
Expected: All pass

**Step 6: Commit**

```bash
git add -A src/utils/cloth/avatarMeshExtractor.ts src/utils/cloth/__tests__/avatarMeshExtractor.test.ts src/utils/cloth/avatarCollisionMesh.ts
git add src/utils/cloth/sdfGenerator.ts src/utils/cloth/__tests__/sdfGenerator.test.ts src/utils/cloth/avatarSDF.ts src/utils/cloth/__tests__/avatarSDF.test.ts
git commit -m "refactor: rename avatarSDF to avatarMeshExtractor, delete sdfGenerator"
```

---

## Task 9: Clean Up index.ts Exports

Remove the SDF export block from the cloth module barrel export.

**Files:**
- Modify: `src/utils/cloth/index.ts:22-28`

**Step 1: Remove SDF export block**

Remove lines 22-28:

```typescript
// DELETE:
// SDF generation exports
export {
  generateSDF,
  sampleSDF,
  sdfGradient,
  type SDFData
} from './sdfGenerator';
```

Update the `avatarMeshExtractor` export to use the new module name. Change lines 30-36:

```typescript
// CHANGE from:
// Avatar mesh extraction exports
export {
  extractAvatarMesh,
  createTestMesh,
  validateMeshData,
  type ExtractedMeshData
} from './avatarMeshExtractor';
// TO: (verify what's actually exported from avatarMeshExtractor — should be extractMeshData)
export {
  extractMeshData,
} from './avatarMeshExtractor';
```

Check if `extractAvatarMesh`, `createTestMesh`, `validateMeshData`, `ExtractedMeshData` are exported from `avatarMeshExtractor.ts`. If not (they were from the old module), update accordingly.

**Step 2: Update module doc (line 5)**

```typescript
// CHANGE from:
 * Exports all types and utilities for cloth simulation including
 * XPBD solver, SDF generation, and avatar mesh extraction.
// TO:
 * Exports all types and utilities for cloth simulation including
 * XPBD solver and avatar mesh extraction.
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/utils/cloth/index.ts
git commit -m "refactor: remove SDF exports from cloth module index"
```

---

## Task 10: Final Verification

Run full test suite and type check to confirm everything is clean.

**Files:** None (verification only)

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass. Test count should decrease by the number of deleted SDF tests.

**Step 3: Grep for remaining SDF references**

Run: `grep -r "SDF\|sdfGenerator\|setSDF\|sdfData\|sdf_data\|sdfGradient\|sampleSDF\|avatarSDF\|loadSDFInWorker\|generateSDF" --include="*.ts" --include="*.tsx" --include="*.rs" src/ crates/`

Expected: Only references in:
- Design docs (acceptable)
- Comments mentioning historical SDF removal (acceptable)
- No functional SDF code remaining

**Step 4: Commit any remaining cleanup**

If stray references found, clean them up and commit.

---

## Task Dependency Order

```
Task 1 (Rust Wasm) ─────────────────────┐
Task 2 (Wasm Worker) ───────────────────┤
Task 3 (Solver Clients) ───────────────┤── All can run in parallel
Task 4 (CPU Solver + Worker) ──────────┤
Task 6 (GPU Solver) ───────────────────┤
Task 7 (SimInit Worker) ───────────────┘
                                         ↓
Task 5 (GarmentSimulation) ─── depends on Tasks 1-4, 6-7
                                         ↓
Task 8 (Delete + Rename) ──── depends on Tasks 4-7
                                         ↓
Task 9 (index.ts) ──────────── depends on Task 8
                                         ↓
Task 10 (Verification) ─────── depends on all
```

Recommended execution: Tasks 1-4+6-7 in parallel → Task 5 → Task 8 → Task 9 → Task 10.
