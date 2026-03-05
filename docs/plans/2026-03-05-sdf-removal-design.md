# SDF Removal — Design Doc

> **Issue:** Follow-up to #6
> **Date:** 2026-03-05
> **Status:** Approved

## Goal

Remove all SDF (Signed Distance Field) code now that triangle mesh collision is fully implemented. The Wasm solver gets JS-side triangle collision as a post-step replacement.

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Remove SDF everywhere, including Rust/Wasm |
| Wasm collision | JS-side `solveTriangleCollision()` post-step in simulation loop |
| avatarSDF.ts | Rename to `avatarMeshExtractor.ts`, keep `extractMeshData` + `applyAPose` |
| Initial collision | Replace SDF settling with triangle collision settling |

---

## 1. Files to Delete

| File | Reason |
|------|--------|
| `src/utils/cloth/sdfGenerator.ts` | Entirely replaced by `collisionMesh.ts` + `triangleCollision.ts` |
| `src/utils/cloth/__tests__/sdfGenerator.test.ts` | Tests for deleted module |

---

## 2. Files to Modify

### GarmentSimulation.tsx

**Remove (~155 lines):**
- `_sdfInflight` map (line 40)
- `sdfCacheKey()` (lines 42-44)
- `SDF_IDB_STORE`, `SDF_IDB_VERSION` (lines 46-47)
- `openSdfIdb()` (lines 49-56)
- `getSdfFromIdb()` (lines 58-81)
- `putSdfToIdb()` (lines 83-96)
- `loadSDFInWorker()` (lines 102-190)

**Modify:**
- GPU solver section (lines 568-574): Replace `loadSDFInWorker` + `setSDF` with `extractAvatarCollisionMesh` + `setCollisionMesh`
- Wasm solver section (lines 597-630): Remove SDF loading, keep only collision mesh path. Replace `applyInitialCollision` with `applyInitialTriangleCollision`

### xpbdSolver.ts

**Remove:**
- `SDFData`, `sampleSDF`, `sdfGradient` imports (line 13)
- `sdfData` field (line 325)
- `setSDF()` method (lines 603-604)
- SDF collision block in `solveCollisions()` (lines 942-963)

### clothWorker.ts

**Remove:**
- `setSDF` from `WorkerInMessage` union (line 43)
- `setSDF` handler (lines 295-300)
- `SDFData` import (if any)

### clothWorkerClient.ts

**Remove:**
- `SDFData` import (line 12)
- `setSDF()` method (lines 204-206)

### wasmSolverClient.ts

**Remove:**
- `SDFData` import (line 11)
- `setSDF()` method (lines 101-103)
- `applyInitialCollision()` method (lines 109-111)

**Add:**
- `applyInitialTriangleCollision()` method — tells worker to run settling with triangle collision

### wasmSolverWorker.ts

**Remove:**
- `set_sdf` from `WasmXpbdSolver` interface (line 32)
- `setSDF` handler (lines 210-217)
- `applyInitialCollision` handler (lines 227-258)

**Modify:**
- `setCollisionMesh` handler (lines 219-225): Store mesh AND build `TriangleSpatialHash`
- `simulationLoop()` (lines 63-89): After `solver.step(dt)`, write positions to Wasm memory, apply `solveTriangleCollision()`, then read back

**Add:**
- Import `TriangleSpatialHash`, `solveTriangleCollision` from `triangleCollision.ts`
- Import `CollisionMeshData` from `collisionMesh.ts`
- Module-level `collisionMesh` and `collisionHash` variables
- `applyInitialTriangleCollision` handler: Run settling steps with triangle collision

### gpuSolver.ts

**Remove:**
- `SDFData` import (line 21)
- `sdfBuffer`, `collisionParamsBuffer`, `hasSDF` fields (lines 82-84)
- SDF collision pass in `step()` (lines 218-224)
- `setSDF()` method (lines 316-380)
- `clearSDF()` method (lines 385-392)
- SDF cleanup in `destroy()` (lines 447-450)

**Note:** GPU solver collision will use a separate approach in the future. For now, just remove SDF. The GPU solver is a separate tier that can add triangle collision later.

### gpuSolverClient.ts

**Remove:**
- `SDFData` import (line 14)
- `setSDF()` method (lines 128-130)

### avatarSDF.ts → Rename to avatarMeshExtractor.ts

**Remove:**
- `sdfCache` map (line 15)
- `cacheKey()` (lines 19-21)
- `clearAvatarSDFCache()` (lines 26-28)
- `buildAvatarSDF()` (lines 159-222)
- `generateSDF` import

**Keep:**
- `applyAPose()` (lines 40-69)
- `extractMeshData()` (lines 77-140)

**Update:** `avatarCollisionMesh.ts` import path from `./avatarSDF` to `./avatarMeshExtractor`

### avatarSDF.test.ts → Rename to avatarMeshExtractor.test.ts

**Remove:** SDF-specific tests
**Keep:** `extractMeshData` tests

### simulationInitClient.ts

**Remove:**
- `SDFData` import
- `pendingSDF` field
- `generateSDF()` method
- SDF result handling in message handler

### simulationWorker.ts

**Remove:**
- `generateSDF` import
- `SDFRequest`/`SDFResponse` interfaces
- SDF generation handler

### index.ts

**Remove:** SDF export block (lines 22-28)

### Rust: crates/xpbd-wasm/src/lib.rs

**Remove:**
- SDF struct fields (`sdf_data`, `sdf_resolution`, `sdf_min`, `sdf_cell_size`, `has_sdf`)
- SDF initialization values
- `set_sdf()` method
- `solve_sdf_collision()` method
- `sample_sdf()` method
- `sdf_gradient()` method
- SDF collision call in `step()`

**Rebuild:** `wasm-pack build` + copy to `public/wasm/`

---

## 3. Wasm Worker: JS-Side Triangle Collision

The simulation loop in `wasmSolverWorker.ts` currently:

```
solver.step(dt)  →  read positions  →  postMessage
```

After modification:

```
solver.step(dt)  →  read positions into JS array  →
  solveTriangleCollision(positions, invMass, ...)  →
  write positions back to Wasm memory  →  postMessage
```

The positions are in Wasm linear memory at `solver.positions_ptr()`. We:
1. Read into a JS `Float32Array` (already done — line 76)
2. Apply `solveTriangleCollision()` on the JS-side array
3. Write modified positions back to Wasm memory via `new Float32Array(memory.buffer, ptr, n*3).set(positions)`
4. Post the collided positions to main thread

### Initial Collision Settling

Replace the current SDF-based settling (20 steps with zero gravity) with:

```typescript
case 'applyInitialTriangleCollision':
  if (solver && collisionMesh && collisionHash) {
    // Read positions from Wasm
    const positions = new Float32Array(memory.buffer, ptr, n * 3);
    const invMass = new Float32Array(n).fill(1.0);
    // Apply triangle collision several times to push particles out
    for (let i = 0; i < 5; i++) {
      solveTriangleCollision(positions, invMass, n, collisionMesh, collisionHash, 0.005);
    }
    // Positions already modified in Wasm memory (shared buffer view)
    postMessage({ type: 'frame', positions: positions.slice() });
  }
```

---

## 4. Out of Scope

- Porting triangle collision to Rust/Wasm (future perf optimization)
- GPU compute triangle collision
- Removing IndexedDB entirely (the DB will just go unused; browser can GC it)
