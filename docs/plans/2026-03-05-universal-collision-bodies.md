# Universal Collision Bodies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable any imported mesh (furniture, mannequins, cushions, etc.) to act as a collision body alongside the existing avatar, with per-body transform gizmo, friction/offset controls, and GLB/FBX animation playback.

**Architecture:** Parallel `CollisionBody` system alongside the existing avatar. Each body gets its own `TriangleSpatialHash`. Workers iterate an array of collision meshes per particle. The avatar collision mesh becomes entry `__avatar__` in that array. `CollisionBodyMesh` handles visual rendering + gizmo; `GarmentSimulation` handles collision mesh extraction and worker communication.

**Tech Stack:** React, Redux Toolkit, Three.js, @react-three/fiber, @react-three/drei (`TransformControls`), Vitest

**Design doc:** `docs/plans/2026-03-05-universal-collision-bodies-design.md`

---

### Task 1: CollisionBody Type + Redux Slice + Store Registration

**Files:**
- Create: `src/types/collisionBody.ts`
- Create: `src/store/collisionBodySlice.ts`
- Create: `src/store/__tests__/collisionBodySlice.test.ts`
- Modify: `src/store/index.ts:1-55`

**Step 1: Write the test**

Create `src/store/__tests__/collisionBodySlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import collisionBodyReducer, {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyTransform,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
  setAnimationState,
  type CollisionBodyState,
} from '../collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';

function makeBody(id = 'b1'): CollisionBody {
  return {
    id,
    name: 'Table',
    meshUrl: 'blob:table.glb',
    format: 'glb',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    collision: { enabled: true, friction: 0.3, offset: 0.005 },
    animation: { clipIndex: null, playing: false, time: 0, loop: true },
    visible: true,
  };
}

function getInitialState(): CollisionBodyState {
  return collisionBodyReducer(undefined, { type: '@@INIT' });
}

describe('collisionBodySlice', () => {
  it('starts empty', () => {
    const state = getInitialState();
    expect(state.bodies).toEqual([]);
    expect(state.selectedBodyId).toBeNull();
  });

  it('addCollisionBody appends a body', () => {
    const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    expect(state.bodies).toHaveLength(1);
    expect(state.bodies[0].id).toBe('b1');
  });

  it('removeCollisionBody removes by id and clears selection', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, selectCollisionBody('b1'));
    state = collisionBodyReducer(state, removeCollisionBody('b1'));
    expect(state.bodies).toHaveLength(0);
    expect(state.selectedBodyId).toBeNull();
  });

  it('updateCollisionBodyTransform sets new transform', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, updateCollisionBodyTransform({
      id: 'b1',
      transform: { position: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 2, 2] },
    }));
    expect(state.bodies[0].transform.position).toEqual([1, 2, 3]);
    expect(state.bodies[0].transform.rotation).toEqual([0, 90, 0]);
  });

  it('updateCollisionBodyCollision merges partial collision props', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, updateCollisionBodyCollision({
      id: 'b1',
      collision: { friction: 0.8 },
    }));
    expect(state.bodies[0].collision.friction).toBe(0.8);
    expect(state.bodies[0].collision.offset).toBe(0.005); // unchanged
  });

  it('setCollisionBodyName updates name', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, setCollisionBodyName({ id: 'b1', name: 'Chair' }));
    expect(state.bodies[0].name).toBe('Chair');
  });

  it('setCollisionBodyVisibility toggles visibility', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, setCollisionBodyVisibility({ id: 'b1', visible: false }));
    expect(state.bodies[0].visible).toBe(false);
  });

  it('selectCollisionBody sets selectedBodyId', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, selectCollisionBody('b1'));
    expect(state.selectedBodyId).toBe('b1');
  });

  it('setAnimationState updates animation fields', () => {
    let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
    state = collisionBodyReducer(state, setAnimationState({
      id: 'b1', playing: true, clipIndex: 0, loop: false,
    }));
    expect(state.bodies[0].animation.playing).toBe(true);
    expect(state.bodies[0].animation.clipIndex).toBe(0);
    expect(state.bodies[0].animation.loop).toBe(false);
    expect(state.bodies[0].animation.time).toBe(0); // unchanged
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/__tests__/collisionBodySlice.test.ts`
Expected: FAIL — modules don't exist yet

**Step 3: Create the type**

Create `src/types/collisionBody.ts`:

```typescript
export interface CollisionBodyTransform {
  position: [number, number, number];
  rotation: [number, number, number]; // euler degrees
  scale: [number, number, number];
}

export interface CollisionBodyCollision {
  enabled: boolean;
  friction: number;  // 0-1, default 0.3
  offset: number;    // meters, default 0.005
}

export interface CollisionBodyAnimation {
  clipIndex: number | null;
  playing: boolean;
  time: number;
  loop: boolean;
}

export interface CollisionBody {
  id: string;
  name: string;
  meshUrl: string;
  format: 'obj' | 'fbx' | 'glb' | 'gltf';
  transform: CollisionBodyTransform;
  collision: CollisionBodyCollision;
  animation: CollisionBodyAnimation;
  visible: boolean;
}
```

**Step 4: Create the slice**

Create `src/store/collisionBodySlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { CollisionBody, CollisionBodyTransform, CollisionBodyCollision } from '../types/collisionBody';

export interface CollisionBodyState {
  bodies: CollisionBody[];
  selectedBodyId: string | null;
}

const initialState: CollisionBodyState = {
  bodies: [],
  selectedBodyId: null,
};

const collisionBodySlice = createSlice({
  name: 'collisionBody',
  initialState,
  reducers: {
    addCollisionBody(state, action: PayloadAction<CollisionBody>) {
      state.bodies.push(action.payload);
    },
    removeCollisionBody(state, action: PayloadAction<string>) {
      state.bodies = state.bodies.filter(b => b.id !== action.payload);
      if (state.selectedBodyId === action.payload) state.selectedBodyId = null;
    },
    updateCollisionBodyTransform(state, action: PayloadAction<{ id: string; transform: CollisionBodyTransform }>) {
      const body = state.bodies.find(b => b.id === action.payload.id);
      if (body) body.transform = action.payload.transform;
    },
    updateCollisionBodyCollision(state, action: PayloadAction<{ id: string; collision: Partial<CollisionBodyCollision> }>) {
      const body = state.bodies.find(b => b.id === action.payload.id);
      if (body) Object.assign(body.collision, action.payload.collision);
    },
    setCollisionBodyName(state, action: PayloadAction<{ id: string; name: string }>) {
      const body = state.bodies.find(b => b.id === action.payload.id);
      if (body) body.name = action.payload.name;
    },
    setCollisionBodyVisibility(state, action: PayloadAction<{ id: string; visible: boolean }>) {
      const body = state.bodies.find(b => b.id === action.payload.id);
      if (body) body.visible = action.payload.visible;
    },
    selectCollisionBody(state, action: PayloadAction<string | null>) {
      state.selectedBodyId = action.payload;
    },
    setAnimationState(state, action: PayloadAction<{
      id: string; playing?: boolean; time?: number; loop?: boolean; clipIndex?: number | null;
    }>) {
      const body = state.bodies.find(b => b.id === action.payload.id);
      if (body) {
        if (action.payload.playing !== undefined) body.animation.playing = action.payload.playing;
        if (action.payload.time !== undefined) body.animation.time = action.payload.time;
        if (action.payload.loop !== undefined) body.animation.loop = action.payload.loop;
        if (action.payload.clipIndex !== undefined) body.animation.clipIndex = action.payload.clipIndex;
      }
    },
  },
});

export const {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyTransform,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
  setAnimationState,
} = collisionBodySlice.actions;

export default collisionBodySlice.reducer;
```

**Step 5: Register slice in store**

In `src/store/index.ts`, add import and reducer:

```typescript
// Add after line 15 (import cameraReducer):
import collisionBodyReducer from './collisionBodySlice';

// Add inside reducer object after line 36 (camera: cameraReducer):
    collisionBody: collisionBodyReducer,

// Add to ignoredPaths (line 42) after 'project.avatar':
// Change: ignoredPaths: ['project.pieces', 'project.avatar'],
// To:     ignoredPaths: ['project.pieces', 'project.avatar', 'collisionBody.bodies'],
```

**Step 6: Run tests**

Run: `npx vitest run src/store/__tests__/collisionBodySlice.test.ts`
Expected: PASS (all 8 tests)

**Step 7: Commit**

```bash
git add src/types/collisionBody.ts src/store/collisionBodySlice.ts src/store/__tests__/collisionBodySlice.test.ts src/store/index.ts
git commit -m "feat(collision): add CollisionBody type, Redux slice, and store registration"
```

---

### Task 2: Add Friction Parameter to solveTriangleCollision

**Files:**
- Modify: `src/utils/cloth/triangleCollision.ts:219-266`
- Modify: `src/utils/cloth/__tests__/triangleCollision.test.ts`

**Step 1: Add friction tests**

Append to `src/utils/cloth/__tests__/triangleCollision.test.ts` inside the `solveTriangleCollision` describe block (after line 121, before the closing `});`):

```typescript
  it('applies friction to tangential velocity when prevPos provided', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    // Particle below floor, sliding in X
    const pos = new Float32Array([1.0, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0.5, prevPos);
    // Y should be pushed to margin
    expect(pos[1]).toBeCloseTo(margin, 3);
    // X should be partially dampened: original slide was 1.0, friction 0.5 removes half
    expect(pos[0]).toBeCloseTo(0.5, 1);
  });

  it('zero friction preserves tangential velocity', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([1.0, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0, prevPos);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[0]).toBeCloseTo(1.0, 3); // no friction dampening
  });

  it('backward-compatible: no friction/prevPos params works as before', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
  });
```

**Step 2: Run tests to verify new ones fail**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: New friction tests FAIL (friction param not yet implemented)

**Step 3: Add friction to solveTriangleCollision**

In `src/utils/cloth/triangleCollision.ts`, modify the `solveTriangleCollision` function signature (line 219) and add friction logic after the position push (line 264):

Replace lines 219-266:

```typescript
export function solveTriangleCollision(
  pos: Float32Array,
  invMass: Float32Array,
  numParticles: number,
  mesh: CollisionMeshData,
  hash: TriangleSpatialHash,
  collisionMargin: number,
  friction: number = 0,
  prevPos?: Float32Array,
): void {
  for (let p = 0; p < numParticles; p++) {
    if (invMass[p] === 0) continue;

    const pi = p * 3;
    const px = pos[pi], py = pos[pi + 1], pz = pos[pi + 2];
    const nearby = hash.query(px, py, pz);

    if (nearby.length === 0) continue;

    let minDist = Infinity;
    let bestNx = 0, bestNy = 0, bestNz = 0;
    let bestSide = 1;

    for (let i = 0; i < nearby.length; i++) {
      const triIdx = nearby[i];
      const result = pointToTriangleDist(
        px, py, pz,
        mesh.vertices, triIdx * 9,
        mesh.normals, triIdx * 3,
      );
      if (result.dist < minDist) {
        minDist = result.dist;
        bestNx = result.nx;
        bestNy = result.ny;
        bestNz = result.nz;
        bestSide = result.side;
      }
    }

    if (bestSide < 0 || minDist < collisionMargin) {
      const pushDist = bestSide < 0
        ? collisionMargin + minDist
        : collisionMargin - minDist;

      pos[pi]     += bestNx * pushDist;
      pos[pi + 1] += bestNy * pushDist;
      pos[pi + 2] += bestNz * pushDist;

      // Position-based friction: dampen tangential displacement
      if (friction > 0 && prevPos) {
        const dx = pos[pi] - prevPos[pi];
        const dy = pos[pi + 1] - prevPos[pi + 1];
        const dz = pos[pi + 2] - prevPos[pi + 2];
        const vn = dx * bestNx + dy * bestNy + dz * bestNz;
        const tx = dx - vn * bestNx;
        const ty = dy - vn * bestNy;
        const tz = dz - vn * bestNz;
        pos[pi]     -= friction * tx;
        pos[pi + 1] -= friction * ty;
        pos[pi + 2] -= friction * tz;
      }
    }
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: ALL PASS (existing + new friction tests)

**Step 5: Commit**

```bash
git add src/utils/cloth/triangleCollision.ts src/utils/cloth/__tests__/triangleCollision.test.ts
git commit -m "feat(collision): add per-body friction param to solveTriangleCollision"
```

---

### Task 3: Multi-Body Collision in CPU Solver (xpbdSolver.ts)

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts:323-326, 595-603, 926-935`

**Step 1: Replace single collision mesh with array**

In `src/utils/cloth/xpbdSolver.ts`:

Replace lines 323-326:
```typescript
  /** Triangle collision mesh data for body collision */
  private collisionMesh: CollisionMeshData | null = null;
  /** Spatial hash over collision mesh triangles */
  private collisionHash: TriangleSpatialHash | null = null;
```
With:
```typescript
  /** Collision bodies: each has its own mesh, spatial hash, friction, and margin */
  private collisionBodies: Array<{
    id: string;
    mesh: CollisionMeshData;
    hash: TriangleSpatialHash;
    friction: number;
    margin: number;
  }> = [];
```

Replace `setCollisionMesh` method (lines 595-603):
```typescript
  /**
   * Set triangle collision mesh for body collision (backward-compatible).
   * Wraps single mesh as '__avatar__' collision body.
   */
  setCollisionMesh(mesh: CollisionMeshData | null): void {
    if (mesh && mesh.triCount > 0) {
      const cellSize = Math.max(0.02, (this.config.clothThickness ?? 0.002) * 10);
      this.collisionBodies = [{
        id: '__avatar__',
        mesh,
        hash: new TriangleSpatialHash(mesh, cellSize),
        friction: 0,
        margin: this.config.clothThickness ?? 0.005,
      }];
    } else {
      this.collisionBodies = [];
    }
  }

  /**
   * Set multiple collision bodies. Each gets its own spatial hash.
   */
  setCollisionBodies(bodies: Array<{ id: string; mesh: CollisionMeshData; friction: number; margin: number }>): void {
    const cellSize = Math.max(0.02, (this.config.clothThickness ?? 0.002) * 10);
    this.collisionBodies = bodies.map(b => ({
      ...b,
      hash: new TriangleSpatialHash(b.mesh, cellSize),
    }));
  }

  /**
   * Update a single collision body by id. Rebuilds its spatial hash.
   */
  updateCollisionBody(id: string, mesh: CollisionMeshData, friction: number, margin: number): void {
    const cellSize = Math.max(0.02, (this.config.clothThickness ?? 0.002) * 10);
    const existing = this.collisionBodies.findIndex(b => b.id === id);
    const entry = { id, mesh, hash: new TriangleSpatialHash(mesh, cellSize), friction, margin };
    if (existing >= 0) {
      this.collisionBodies[existing] = entry;
    } else {
      this.collisionBodies.push(entry);
    }
  }

  /**
   * Remove a collision body by id.
   */
  removeCollisionBody(id: string): void {
    this.collisionBodies = this.collisionBodies.filter(b => b.id !== id);
  }
```

Replace collision section in `solve` method (lines 925-935):
```typescript
    // Triangle mesh collision (exact distance, supports animation)
    for (const body of this.collisionBodies) {
      solveTriangleCollision(
        this.pos,
        this.invMass,
        this.numParticles,
        body.mesh,
        body.hash,
        body.margin,
        body.friction,
        this.prevPos,
      );
    }
```

**Step 2: Run existing tests**

Run: `npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts`
Expected: PASS (backward-compatible via `setCollisionMesh`)

**Step 3: Commit**

```bash
git add src/utils/cloth/xpbdSolver.ts
git commit -m "feat(collision): multi-body collision support in xpbdSolver"
```

---

### Task 4: Multi-Body Collision in WASM Worker + Client

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:58-65, 67-82, 220-245`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts`

**Step 1: Update wasmSolverWorker.ts**

Replace the single collision state variables (around lines 58-65):
```typescript
let collisionMesh: CollisionMeshData | null = null;
let collisionHash: TriangleSpatialHash | null = null;
```
With:
```typescript
interface WorkerCollisionBody {
  id: string;
  mesh: CollisionMeshData;
  hash: TriangleSpatialHash;
  friction: number;
  margin: number;
}
let collisionBodies: WorkerCollisionBody[] = [];
```

Update the simulation loop (around lines 77-82). Replace:
```typescript
    if (collisionMesh && collisionHash) {
      const posView = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);
      const invMass = new Float32Array(n).fill(1.0);
      solveTriangleCollision(posView, invMass, n, collisionMesh, collisionHash, 0.005);
    }
```
With:
```typescript
    if (collisionBodies.length > 0) {
      const posView = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);
      const invMass = new Float32Array(n).fill(1.0);
      for (const body of collisionBodies) {
        solveTriangleCollision(posView, invMass, n, body.mesh, body.hash, body.margin, body.friction);
      }
    }
```

Replace the `setCollisionMesh` message handler (around lines 220-226):
```typescript
      case 'setCollisionMesh':
        if (msg.mesh) {
          // Backward-compatible: wrap as __avatar__ body
          collisionBodies = collisionBodies.filter(b => b.id !== '__avatar__');
          collisionBodies.push({
            id: '__avatar__',
            mesh: msg.mesh,
            hash: new TriangleSpatialHash(msg.mesh, 0.05),
            friction: 0,
            margin: 0.005,
          });
          console.log('[WasmWorker] Collision mesh set (avatar):', msg.mesh.triCount, 'triangles');
        }
        break;

      case 'setCollisionBodies':
        collisionBodies = (msg.bodies as Array<{ id: string; mesh: CollisionMeshData; friction: number; margin: number }>).map(b => ({
          ...b,
          hash: new TriangleSpatialHash(b.mesh, 0.05),
        }));
        console.log('[WasmWorker] Collision bodies set:', collisionBodies.length, 'bodies');
        break;

      case 'updateCollisionBody': {
        const { id, mesh, friction, margin } = msg as { id: string; mesh: CollisionMeshData; friction: number; margin: number };
        const idx = collisionBodies.findIndex(b => b.id === id);
        const entry: WorkerCollisionBody = { id, mesh, hash: new TriangleSpatialHash(mesh, 0.05), friction, margin };
        if (idx >= 0) collisionBodies[idx] = entry;
        else collisionBodies.push(entry);
        break;
      }

      case 'removeCollisionBody':
        collisionBodies = collisionBodies.filter(b => b.id !== msg.id);
        break;
```

Update the `applyInitialTriangleCollision` handler (around lines 228-245). Replace:
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
```
With:
```typescript
      case 'applyInitialTriangleCollision':
        if (solver && collisionBodies.length > 0 && wasmExports?.memory) {
          console.log('[WasmWorker] Running initial triangle collision settling...');
          const n = numParticles;
          const ptr = solver.positions_ptr();
          const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);
          const invMass = new Float32Array(n).fill(1.0);
          for (let i = 0; i < 5; i++) {
            for (const body of collisionBodies) {
              solveTriangleCollision(positions, invMass, n, body.mesh, body.hash, body.margin, body.friction);
            }
          }
```

**Step 2: Update wasmSolverClient.ts**

Add new methods after the existing `setCollisionMesh` method (around line 230):

```typescript
  setCollisionBodies(bodies: Array<{ id: string; mesh: CollisionMeshData; friction: number; margin: number }>): void {
    const transferables: ArrayBuffer[] = [];
    const payload = bodies.map(b => {
      transferables.push(b.mesh.vertices.buffer, b.mesh.normals.buffer);
      return { id: b.id, mesh: b.mesh, friction: b.friction, margin: b.margin };
    });
    this.worker?.postMessage({ type: 'setCollisionBodies', bodies: payload }, transferables);
  }

  updateCollisionBody(body: { id: string; mesh: CollisionMeshData; friction: number; margin: number }): void {
    this.worker?.postMessage(
      { type: 'updateCollisionBody', id: body.id, mesh: body.mesh, friction: body.friction, margin: body.margin },
      [body.mesh.vertices.buffer, body.mesh.normals.buffer],
    );
  }

  removeCollisionBody(id: string): void {
    this.worker?.postMessage({ type: 'removeCollisionBody', id });
  }
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "feat(collision): multi-body collision in WASM worker and client"
```

---

### Task 5: Multi-Body Collision in CPU Worker + Client

**Files:**
- Modify: `src/utils/cloth/clothWorker.ts:29-50, 294-299`
- Modify: `src/utils/cloth/clothWorkerClient.ts`

**Step 1: Update clothWorker.ts message protocol**

Add new message types to the `WorkerInMessage` union (after line 42 — `setCollisionMesh`):

```typescript
  | { type: 'setCollisionBodies'; bodies: Array<{ id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }> }
  | { type: 'updateCollisionBody'; id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }
  | { type: 'removeCollisionBody'; id: string }
```

Add message handlers in the switch statement (after the existing `setCollisionMesh` case, around line 299):

```typescript
      case 'setCollisionBodies': {
        if (solver) {
          solver.setCollisionBodies(msg.bodies);
        }
        break;
      }

      case 'updateCollisionBody': {
        if (solver) {
          solver.updateCollisionBody(msg.id, msg.mesh, msg.friction, msg.margin);
        }
        break;
      }

      case 'removeCollisionBody': {
        if (solver) {
          solver.removeCollisionBody(msg.id);
        }
        break;
      }
```

**Step 2: Update clothWorkerClient.ts**

Add new methods after the existing `setCollisionMesh` method:

```typescript
  setCollisionBodies(bodies: Array<{ id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }>): void {
    const transferables: ArrayBuffer[] = [];
    const payload = bodies.map(b => {
      transferables.push(b.mesh.vertices.buffer, b.mesh.normals.buffer);
      return { id: b.id, mesh: b.mesh, friction: b.friction, margin: b.margin };
    });
    this.postMessage({ type: 'setCollisionBodies', bodies: payload } as WorkerInMessage, transferables);
  }

  updateCollisionBody(body: { id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }): void {
    this.postMessage(
      { type: 'updateCollisionBody', id: body.id, mesh: body.mesh, friction: body.friction, margin: body.margin } as WorkerInMessage,
      [body.mesh.vertices.buffer, body.mesh.normals.buffer],
    );
  }

  removeCollisionBody(id: string): void {
    this.postMessage({ type: 'removeCollisionBody', id } as WorkerInMessage);
  }
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/cloth/clothWorker.ts src/utils/cloth/clothWorkerClient.ts
git commit -m "feat(collision): multi-body collision in CPU worker and client"
```

---

### Task 6: collisionMeshFromBuffers Helper

**Files:**
- Modify: `src/utils/cloth/collisionMesh.ts`
- Modify: `src/utils/cloth/__tests__/collisionMesh.test.ts`

**Step 1: Add test**

Append to `src/utils/cloth/__tests__/collisionMesh.test.ts`:

```typescript
import { collisionMeshFromBuffers } from '../collisionMesh';

describe('collisionMeshFromBuffers', () => {
  it('converts indexed vertex/index buffers to CollisionMeshData', () => {
    // One triangle: (0,0,0), (1,0,0), (0,1,0)
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const result = collisionMeshFromBuffers(vertices, indices);
    expect(result).not.toBeNull();
    expect(result!.triCount).toBe(1);
    expect(result!.vertices.length).toBe(9);
    expect(result!.normals.length).toBe(3);
  });

  it('returns null for empty buffers', () => {
    expect(collisionMeshFromBuffers(new Float32Array(0), new Uint32Array(0))).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/collisionMesh.test.ts`
Expected: FAIL — `collisionMeshFromBuffers` not exported

**Step 3: Add the helper**

Append to `src/utils/cloth/collisionMesh.ts` (after the existing `extractCollisionMesh` function):

```typescript
/**
 * Convert raw vertex + index buffers to CollisionMeshData.
 * Useful for going from avatarMeshExtractor output to collision format.
 */
export function collisionMeshFromBuffers(
  vertices: Float32Array,
  indices: Uint32Array,
): CollisionMeshData | null {
  if (vertices.length === 0 || indices.length === 0) return null;
  return extractCollisionMesh({
    attributes: { position: { array: vertices, count: vertices.length / 3 } },
    index: { array: indices, count: indices.length },
  });
}
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/cloth/__tests__/collisionMesh.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/collisionMesh.ts src/utils/cloth/__tests__/collisionMesh.test.ts
git commit -m "feat(collision): add collisionMeshFromBuffers helper"
```

---

### Task 7: CollisionBodyMesh R3F Component

**Files:**
- Create: `src/components/Viewport3D/CollisionBodyMesh.tsx`

This component handles:
- Loading mesh from URL via meshImporter
- Applying transform from Redux state
- TransformControls gizmo when selected
- Animation playback with THREE.AnimationMixer

**Step 1: Create the component**

Create `src/components/Viewport3D/CollisionBodyMesh.tsx`:

```typescript
import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  updateCollisionBodyTransform,
  selectCollisionBody,
  setAnimationState,
} from '../../store/collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';
import { importMesh } from '../../utils/import/meshImporter';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

interface CollisionBodyMeshProps {
  body: CollisionBody;
  orbitRef: React.RefObject<THREE.EventDispatcher | null>;
}

export default function CollisionBodyMesh({ body, orbitRef }: CollisionBodyMeshProps) {
  const dispatch = useDispatch<AppDispatch>();
  const selectedBodyId = useSelector((s: RootState) => s.collisionBody.selectedBodyId);
  const isSelected = selectedBodyId === body.id;

  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);

  // Load mesh
  useEffect(() => {
    let cancelled = false;
    importMesh(body.meshUrl, body.name, { targetHeightMm: undefined }).then(result => {
      if (cancelled) return;
      setScene(result.scene);
    }).catch(err => {
      console.warn('[CollisionBodyMesh] Failed to load:', body.name, err);
    });
    return () => { cancelled = true; };
  }, [body.meshUrl, body.name]);

  // Extract animation clips from loaded scene
  useEffect(() => {
    if (!scene) return;
    const foundClips: THREE.AnimationClip[] = [];
    scene.traverse(obj => {
      if ((obj as THREE.Object3D).animations?.length) {
        foundClips.push(...(obj as THREE.Object3D).animations);
      }
    });
    if (scene.animations?.length) foundClips.push(...scene.animations);
    setClips(foundClips);
  }, [scene]);

  // Setup animation mixer
  useEffect(() => {
    if (!scene || clips.length === 0) return;
    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;
    return () => { mixer.stopAllAction(); mixerRef.current = null; };
  }, [scene, clips]);

  // Play/stop animation
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || clips.length === 0) return;
    mixer.stopAllAction();
    if (body.animation.clipIndex !== null && body.animation.clipIndex < clips.length && body.animation.playing) {
      const clip = clips[body.animation.clipIndex];
      const action = mixer.clipAction(clip);
      action.loop = body.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce;
      action.clampWhenFinished = !body.animation.loop;
      action.play();
    }
  }, [body.animation.clipIndex, body.animation.playing, body.animation.loop, clips]);

  // Advance mixer each frame
  useFrame((_, delta) => {
    if (mixerRef.current && body.animation.playing) {
      mixerRef.current.update(delta);
    }
  });

  // Apply transform from Redux state
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...body.transform.position);
    groupRef.current.rotation.set(
      body.transform.rotation[0] * DEG2RAD,
      body.transform.rotation[1] * DEG2RAD,
      body.transform.rotation[2] * DEG2RAD,
    );
    groupRef.current.scale.set(...body.transform.scale);
  }, [body.transform]);

  // Handle gizmo transform change
  const handleTransformChange = () => {
    if (!groupRef.current) return;
    const p = groupRef.current.position;
    const r = groupRef.current.rotation;
    const s = groupRef.current.scale;
    dispatch(updateCollisionBodyTransform({
      id: body.id,
      transform: {
        position: [p.x, p.y, p.z],
        rotation: [r.x * RAD2DEG, r.y * RAD2DEG, r.z * RAD2DEG],
        scale: [s.x, s.y, s.z],
      },
    }));
  };

  // Disable orbit controls while dragging gizmo
  const handleDraggingChanged = (event: THREE.Event & { value?: boolean }) => {
    const orbit = orbitRef.current as unknown as { enabled: boolean } | null;
    if (orbit) orbit.enabled = !event.value;
  };

  const transformMode = useSelector((s: RootState) => {
    const b = s.collisionBody.bodies.find(x => x.id === body.id);
    return b ? 'translate' : 'translate';
  });

  if (!scene || !body.visible) return null;

  return (
    <>
      <group
        ref={groupRef}
        onClick={e => {
          e.stopPropagation();
          dispatch(selectCollisionBody(body.id));
        }}
      >
        <primitive object={scene} />
      </group>
      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onObjectChange={handleTransformChange}
          // @ts-expect-error — drei event typing
          onMouseDown={() => handleDraggingChanged({ value: true } as THREE.Event & { value?: boolean })}
          // @ts-expect-error — drei event typing
          onMouseUp={() => handleDraggingChanged({ value: false } as THREE.Event & { value?: boolean })}
        />
      )}
    </>
  );
}
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/Viewport3D/CollisionBodyMesh.tsx
git commit -m "feat(collision): add CollisionBodyMesh R3F component with gizmo and animation"
```

---

### Task 8: CollisionBodyPanel UI

**Files:**
- Create: `src/components/Viewport3D/CollisionBodyPanel.tsx`
- Create: `src/components/Viewport3D/CollisionBodyPanel.css`

**Step 1: Create CSS**

Create `src/components/Viewport3D/CollisionBodyPanel.css`:

```css
.cb-panel-wrapper {
  position: absolute;
  top: 0;
  right: 0;
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  z-index: 20;
}

.cb-panel {
  background: rgba(30, 30, 30, 0.95);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #ccc;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
}

.cb-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.cb-panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.cb-panel-close {
  background: none;
  border: none;
  color: #888;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}
.cb-panel-close:hover { color: #fff; }

.cb-panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
}

.cb-import-btn {
  width: 100%;
  padding: 8px;
  background: rgba(74, 158, 255, 0.15);
  border: 1px dashed rgba(74, 158, 255, 0.4);
  border-radius: 6px;
  color: #4a9eff;
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 10px;
}
.cb-import-btn:hover {
  background: rgba(74, 158, 255, 0.25);
}

.cb-body-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.cb-body-item.selected {
  border-color: rgba(74, 158, 255, 0.5);
  background: rgba(74, 158, 255, 0.08);
}

.cb-body-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.cb-body-name {
  background: none;
  border: none;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 4px;
  border-radius: 3px;
  width: 120px;
}
.cb-body-name:focus {
  outline: 1px solid rgba(74, 158, 255, 0.5);
  background: rgba(0, 0, 0, 0.3);
}

.cb-body-actions {
  display: flex;
  gap: 4px;
}

.cb-icon-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 2px 5px;
  font-size: 13px;
  border-radius: 3px;
}
.cb-icon-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
.cb-icon-btn.active { color: #4a9eff; }
.cb-icon-btn.danger:hover { color: #ff5252; }

.cb-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.cb-slider-label {
  width: 55px;
  font-size: 11px;
  color: #999;
}

.cb-slider-row input[type="range"] {
  flex: 1;
  height: 3px;
  accent-color: #4a9eff;
}

.cb-slider-value {
  width: 40px;
  font-size: 11px;
  text-align: right;
  color: #bbb;
}

.cb-transform-modes {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.cb-mode-btn {
  flex: 1;
  padding: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  font-size: 11px;
  text-align: center;
}
.cb-mode-btn:hover { background: rgba(255, 255, 255, 0.1); }
.cb-mode-btn.active {
  background: rgba(74, 158, 255, 0.15);
  border-color: rgba(74, 158, 255, 0.4);
  color: #4a9eff;
}

.cb-anim-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.cb-anim-controls {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
```

**Step 2: Create the panel component**

Create `src/components/Viewport3D/CollisionBodyPanel.tsx`:

```typescript
import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
  setAnimationState,
} from '../../store/collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';
import { detectFormat } from '../../utils/import/meshImporter';
import './CollisionBodyPanel.css';

interface CollisionBodyPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function CollisionBodyPanel({ open, onClose }: CollisionBodyPanelProps) {
  const dispatch = useDispatch<AppDispatch>();
  const bodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const selectedBodyId = useSelector((s: RootState) => s.collisionBody.selectedBodyId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const supported = ['obj', 'fbx', 'glb', 'gltf'];
    if (!supported.includes(ext)) return;

    const url = URL.createObjectURL(file);
    const format = detectFormat(file.name);
    if (format === 'unknown' || format === 'vrm') return;

    const body: CollisionBody = {
      id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      meshUrl: url,
      format: format as 'obj' | 'fbx' | 'glb' | 'gltf',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      collision: { enabled: true, friction: 0.3, offset: 0.005 },
      animation: { clipIndex: null, playing: false, time: 0, loop: true },
      visible: true,
    };
    dispatch(addCollisionBody(body));
    dispatch(selectCollisionBody(body.id));
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileImport(file);
  }, [handleFileImport]);

  if (!open) return null;

  return (
    <div className="cb-panel-wrapper">
      <div className="cb-panel">
        <div className="cb-panel-header">
          <h3>Collision Bodies</h3>
          <button className="cb-panel-close" onClick={onClose}>&times;</button>
        </div>
        <div className="cb-panel-scroll">
          <input
            ref={fileInputRef}
            type="file"
            accept=".obj,.fbx,.glb,.gltf"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
              e.target.value = '';
            }}
          />
          <button
            className="cb-import-btn"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            + Import Collision Body (.obj .fbx .glb .gltf)
          </button>

          {bodies.map(body => (
            <BodyItem
              key={body.id}
              body={body}
              isSelected={selectedBodyId === body.id}
              dispatch={dispatch}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BodyItem({
  body,
  isSelected,
  dispatch,
}: {
  body: CollisionBody;
  isSelected: boolean;
  dispatch: AppDispatch;
}) {
  return (
    <div
      className={`cb-body-item ${isSelected ? 'selected' : ''}`}
      onClick={() => dispatch(selectCollisionBody(body.id))}
    >
      <div className="cb-body-header">
        <input
          className="cb-body-name"
          value={body.name}
          onChange={e => dispatch(setCollisionBodyName({ id: body.id, name: e.target.value }))}
          onClick={e => e.stopPropagation()}
        />
        <div className="cb-body-actions">
          <button
            className={`cb-icon-btn ${body.visible ? 'active' : ''}`}
            title={body.visible ? 'Hide' : 'Show'}
            onClick={e => { e.stopPropagation(); dispatch(setCollisionBodyVisibility({ id: body.id, visible: !body.visible })); }}
          >
            {body.visible ? '\u25C9' : '\u25CB'}
          </button>
          <button
            className={`cb-icon-btn ${body.collision.enabled ? 'active' : ''}`}
            title={body.collision.enabled ? 'Disable collision' : 'Enable collision'}
            onClick={e => { e.stopPropagation(); dispatch(updateCollisionBodyCollision({ id: body.id, collision: { enabled: !body.collision.enabled } })); }}
          >
            {body.collision.enabled ? '\u26A1' : '\u26AA'}
          </button>
          <button
            className="cb-icon-btn danger"
            title="Delete"
            onClick={e => { e.stopPropagation(); dispatch(removeCollisionBody(body.id)); }}
          >
            &times;
          </button>
        </div>
      </div>

      {isSelected && (
        <>
          <div className="cb-slider-row">
            <span className="cb-slider-label">Friction</span>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={body.collision.friction}
              onChange={e => dispatch(updateCollisionBodyCollision({ id: body.id, collision: { friction: Number(e.target.value) } }))}
            />
            <span className="cb-slider-value">{body.collision.friction.toFixed(2)}</span>
          </div>
          <div className="cb-slider-row">
            <span className="cb-slider-label">Offset</span>
            <input
              type="range"
              min={0.001} max={0.05} step={0.001}
              value={body.collision.offset}
              onChange={e => dispatch(updateCollisionBodyCollision({ id: body.id, collision: { offset: Number(e.target.value) } }))}
            />
            <span className="cb-slider-value">{(body.collision.offset * 1000).toFixed(1)}mm</span>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Viewport3D/CollisionBodyPanel.tsx src/components/Viewport3D/CollisionBodyPanel.css
git commit -m "feat(collision): add CollisionBodyPanel UI with import, controls, and sliders"
```

---

### Task 9: GarmentSimulation Integration

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

This task adds collision body mesh extraction and worker communication inside GarmentSimulation, following the same pattern used for avatar collision mesh.

**Step 1: Add imports**

At the top of `GarmentSimulation.tsx`, add (around line 29, after the avatar collision import):

```typescript
import { useSelector as useReduxSelector } from 'react-redux';
import type { CollisionBody } from '../../types/collisionBody';
import { extractMeshData } from '../../utils/cloth/avatarMeshExtractor';
import { collisionMeshFromBuffers } from '../../utils/cloth/collisionMesh';
import { importMesh } from '../../utils/import/meshImporter';
```

Note: `useSelector` is likely already imported — reuse the existing import. If there's a conflict, alias the new one.

**Step 2: Read collision bodies from Redux**

Inside the component function, add a selector (near the other useSelector calls):

```typescript
const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
```

**Step 3: Send collision bodies to workers on simulation start**

Inside the simulation init effect (the large `useEffect` that starts simulation), after the avatar collision mesh loading blocks (around lines 438-458 for WASM and 488-508 for CPU), add collision body loading.

After the avatar collision mesh block for WASM (after line 458, before `if (!cancelled) wasmClient.start();`):

```typescript
              // Load collision bodies BEFORE starting simulation
              if (!cancelled) {
                for (const body of collisionBodies) {
                  if (!body.collision.enabled || cancelled) continue;
                  try {
                    const result = await importMesh(body.meshUrl, body.name, {});
                    const scene = result.scene;
                    // Apply body transform
                    scene.position.set(...body.transform.position);
                    scene.rotation.set(
                      body.transform.rotation[0] * (Math.PI / 180),
                      body.transform.rotation[1] * (Math.PI / 180),
                      body.transform.rotation[2] * (Math.PI / 180),
                    );
                    scene.scale.set(...body.transform.scale);
                    scene.updateMatrixWorld(true);
                    const { vertices, indices } = extractMeshData(scene);
                    const mesh = collisionMeshFromBuffers(vertices, indices);
                    if (mesh && !cancelled) {
                      wasmClient.updateCollisionBody({
                        id: body.id,
                        mesh,
                        friction: body.collision.friction,
                        margin: body.collision.offset,
                      });
                    }
                  } catch (e) {
                    console.warn('[GarmentSimulation] Collision body load failed:', body.name, e);
                  }
                }
              }
```

Add the same block after the CPU worker collision mesh section (after line 508, before `if (!cancelled) client.start();`):

```typescript
              // Load collision bodies BEFORE starting simulation (CPU)
              if (!cancelled) {
                for (const body of collisionBodies) {
                  if (!body.collision.enabled || cancelled) continue;
                  try {
                    const result = await importMesh(body.meshUrl, body.name, {});
                    const scene = result.scene;
                    scene.position.set(...body.transform.position);
                    scene.rotation.set(
                      body.transform.rotation[0] * (Math.PI / 180),
                      body.transform.rotation[1] * (Math.PI / 180),
                      body.transform.rotation[2] * (Math.PI / 180),
                    );
                    scene.scale.set(...body.transform.scale);
                    scene.updateMatrixWorld(true);
                    const { vertices, indices } = extractMeshData(scene);
                    const mesh = collisionMeshFromBuffers(vertices, indices);
                    if (mesh && !cancelled) {
                      client.updateCollisionBody({
                        id: body.id,
                        mesh,
                        friction: body.collision.friction,
                        margin: body.collision.offset,
                      });
                    }
                  } catch (e) {
                    console.warn('[GarmentSimulation] Collision body load failed (CPU):', body.name, e);
                  }
                }
              }
```

**Step 4: Add collisionBodies to the effect dependency array**

Add `collisionBodies` to the dependency array of the simulation init effect. This ensures re-init when bodies change.

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(collision): send collision bodies to workers on simulation start"
```

---

### Task 10: Viewport3D Integration

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx`

**Step 1: Add imports**

```typescript
import CollisionBodyMesh from './CollisionBodyMesh';
import CollisionBodyPanel from './CollisionBodyPanel';
import { useSelector as useReduxSelector } from 'react-redux';
```

Note: if `useSelector` is already imported, use the existing import.

**Step 2: Add state and selector**

Inside the `Viewport3D` component, add:

```typescript
const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
const [collisionPanelOpen, setCollisionPanelOpen] = useState(false);
```

**Step 3: Render CollisionBodyMesh components inside Canvas**

Inside the Canvas, after the avatar layer and before the garment layer (around line 290), add:

```typescript
        {/* Collision Bodies */}
        {collisionBodies.map(body => (
          <CollisionBodyMesh key={body.id} body={body} orbitRef={orbitRef} />
        ))}
```

**Step 4: Add panel toggle button**

Add a toggle button for the collision body panel. Find where `SimModeToggle` or other overlay buttons are rendered (outside Canvas, around line 380). Add nearby:

```typescript
        <button
          style={{
            position: 'absolute',
            top: 8,
            right: collisionPanelOpen ? 290 : 8,
            zIndex: 25,
            background: collisionPanelOpen ? 'rgba(74, 158, 255, 0.2)' : 'rgba(30, 30, 30, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 6,
            color: collisionPanelOpen ? '#4a9eff' : '#ccc',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'Inter, sans-serif',
          }}
          title="Collision Bodies"
          onClick={() => setCollisionPanelOpen(!collisionPanelOpen)}
        >
          CB
        </button>
```

**Step 5: Render CollisionBodyPanel**

After the toggle button, render the panel:

```typescript
        <CollisionBodyPanel
          open={collisionPanelOpen}
          onClose={() => setCollisionPanelOpen(false)}
        />
```

**Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(collision): render collision bodies and panel in Viewport3D"
```

---

### Task 11: Full Verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass. New tests in:
- `src/store/__tests__/collisionBodySlice.test.ts` (8 tests)
- `src/utils/cloth/__tests__/triangleCollision.test.ts` (3 new tests)
- `src/utils/cloth/__tests__/collisionMesh.test.ts` (2 new tests)

Existing tests must not regress — especially:
- `src/utils/cloth/__tests__/xpbdSolver.test.ts`
- `src/utils/cloth/__tests__/triangleCollision.test.ts`
- `src/utils/cloth/__tests__/collisionMesh.test.ts`

**Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(collision): address any remaining type/test issues"
```
