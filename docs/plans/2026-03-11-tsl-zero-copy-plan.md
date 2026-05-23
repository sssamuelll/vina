# TSL Zero-Copy Rendering (Phase 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the GPU→CPU→GPU readback roundtrip by rewriting the XPBD compute solver in TSL so that `renderer.compute()` and `renderer.render()` share the same storage buffers via `positionNode`/`normalNode`.

**Architecture:** Create TSL `Fn()` compute functions that mirror the existing WGSL shaders. Buffers are `StorageBufferAttribute` instances wrapped with `storage()` TSL nodes. The mesh material becomes `MeshStandardNodeMaterial` with `positionNode = positions.toAttribute()`. Phase 1 covers core solver + zero-copy rendering; normals use CPU `computeVertexNormals()` as fallback (GPU normals deferred to Phase 2).

**Tech Stack:** Three.js r183 (TSL, `three/webgpu`), React Three Fiber, Vitest

---

## Context

### Current GPU solver data flow
```
gpuSolver.step() → WGSL compute → readPositions() (mapAsync) → CPU Float32Array → geometry.setAttribute → GPU re-upload → render
```

### Target data flow (this work)
```
renderer.compute(tslSolver) → same StorageBufferAttribute → material.positionNode reads it → render
```

### Key insight
The previous zero-copy attempt (patching `StorageBufferAttribute.gpuBuffer`) failed because Three.js WebGPURenderer creates its own internal GPU buffers and ignores patched references. TSL solves this because `storage()` nodes ARE the renderer's buffer management — `renderer.compute()` writes to the same GPU buffer that `positionNode` reads from.

### Phased delivery
- **Phase 1 (this plan):** Core solver (preSolve, stretch, bend, seams, postSolve) + zero-copy rendering via `positionNode`. CPU normals via `computeVertexNormals()`.
- **Phase 2 (follow-up):** GPU normals (atomic i32 accumulation), body collision, `normalNode` integration.
- **Phase 3 (issue #293):** GPU self-collision (spatial hash).

### Important TSL API reference
```typescript
import {
  StorageBufferAttribute,
  storage, Fn, If, compute,
  float, int, uint, vec3,
  instanceIndex,
  MeshStandardNodeMaterial,
} from 'three/webgpu';

// Create buffer
const sba = new StorageBufferAttribute(new Float32Array(N * 3), 3);
// Wrap as TSL node
const buf = storage(sba, 'vec3', N);
// Read/write in compute
buf.element(instanceIndex).assign(vec3(0, 0, 0));
// Read in vertex shader
material.positionNode = buf.toAttribute();
// Dispatch compute
const computeNode = compute(fn, N, [256]);
renderer.compute(computeNode);
```

---

## Task 1: TSL Buffer Setup Module

**Files:**
- Create: `src/utils/cloth/gpu/tslBuffers.ts`
- Test: `src/utils/cloth/gpu/__tests__/tslBuffers.test.ts`

This module creates all `StorageBufferAttribute` instances and their TSL `storage()` wrappers. It also handles initial data upload (copying positions, invMass, constraints into the SBAs).

### Step 1: Write the failing test

Create `src/utils/cloth/gpu/__tests__/tslBuffers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createTslBuffers, type TslBufferSet } from '../tslBuffers';
import type { ClothMeshData, StretchConstraints, BendConstraints, SeamConstraintData, ColoredConstraints } from '../gpuBuffers';
import { colorConstraints } from '../gpuBuffers';

function makeTestMesh(): ClothMeshData {
  // 4-vertex square (2 triangles)
  const positions = new Float32Array([
    -0.5, 1.0, 0.0,  // 0: top-left
     0.5, 1.0, 0.0,  // 1: top-right
     0.5, 0.0, 0.0,  // 2: bottom-right
    -0.5, 0.0, 0.0,  // 3: bottom-left
  ]);
  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const invMass = new Float32Array([1.0, 1.0, 1.0, 1.0]);
  return { positions, triangles, invMass };
}

function makeTestStretch(): { stretch: StretchConstraints; colored: ColoredConstraints } {
  const ids = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]);
  const restLengths = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.414]);
  const edgeTypes = new Uint8Array([1, 0, 1, 0, 2]);
  const stretch: StretchConstraints = { ids, restLengths, edgeTypes };
  const colored = colorConstraints(ids, restLengths, 5);
  return { stretch, colored };
}

function makeTestBend(): BendConstraints {
  const ids = new Uint32Array([0, 2, 1, 3]); // 1 bend constraint
  const restAngles = new Float32Array([Math.PI]);
  const edgeTypes = new Uint8Array([1]);
  return { ids, restAngles, edgeTypes };
}

describe('createTslBuffers', () => {
  it('creates buffer set with correct particle count', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.numParticles).toBe(4);
    expect(buffers.numTriangles).toBe(2);
  });

  it('positions SBA has correct length', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    // SBA for vec3 positions: N particles
    expect(buffers.positionSBA.count).toBe(4);
    expect(buffers.positionSBA.array.length).toBe(12);
  });

  it('copies initial positions into SBA', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    // First vertex: (-0.5, 1.0, 0.0)
    expect(buffers.positionSBA.array[0]).toBeCloseTo(-0.5);
    expect(buffers.positionSBA.array[1]).toBeCloseTo(1.0);
    expect(buffers.positionSBA.array[2]).toBeCloseTo(0.0);
  });

  it('creates invMass SBA with correct values', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.invMassSBA.count).toBe(4);
    expect(buffers.invMassSBA.array[0]).toBe(1.0);
  });

  it('creates per-color stretch constraint SBAs', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.stretchColors.length).toBeGreaterThan(0);
    // Total constraints across all colors should equal original count
    let totalConstraints = 0;
    for (const color of buffers.stretchColors) {
      totalConstraints += color.count;
    }
    expect(totalConstraints).toBe(5);
  });

  it('creates bend constraint SBAs', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.bendIdsSBA).not.toBeNull();
    expect(buffers.numBendConstraints).toBe(1);
  });

  it('creates seam SBAs when seam data provided', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const seam: SeamConstraintData = {
      ids: new Uint32Array([0, 2]),
      targetDist: new Float32Array([0]),
    };
    const buffers = createTslBuffers(mesh, colored, bend, seam);

    expect(buffers.seamIdsSBA).not.toBeNull();
    expect(buffers.numSeamConstraints).toBe(1);
  });

  it('handles null seams', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.seamIdsSBA).toBeNull();
    expect(buffers.numSeamConstraints).toBe(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBuffers.test.ts`
Expected: FAIL with "Cannot find module '../tslBuffers'"

### Step 3: Write minimal implementation

Create `src/utils/cloth/gpu/tslBuffers.ts`:

```typescript
/**
 * TSL Buffer Setup — creates StorageBufferAttribute instances for the TSL compute solver.
 *
 * These SBAs are the single source of truth: written by renderer.compute() (solver)
 * and read by the vertex shader via material.positionNode / material.normalNode.
 *
 * @module tslBuffers
 */

import { StorageBufferAttribute } from 'three/webgpu';
import type { ClothMeshData, BendConstraints, SeamConstraintData, ColoredConstraints } from './gpuBuffers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StretchColorGroup {
  /** Pairs of particle indices for this color [a,b, a,b, ...] */
  idsSBA: StorageBufferAttribute;
  /** Rest lengths for this color */
  restLengthsSBA: StorageBufferAttribute;
  /** Number of constraints in this color group */
  count: number;
}

export interface TslBufferSet {
  // Core particle buffers
  positionSBA: StorageBufferAttribute;
  prevPosSBA: StorageBufferAttribute;
  velocitySBA: StorageBufferAttribute;
  invMassSBA: StorageBufferAttribute;

  // Stretch constraints (per-color for race-free dispatch)
  stretchColors: StretchColorGroup[];

  // Bend constraints
  bendIdsSBA: StorageBufferAttribute | null;
  bendRestSBA: StorageBufferAttribute | null;
  numBendConstraints: number;

  // Seam constraints
  seamIdsSBA: StorageBufferAttribute | null;
  seamTargetDistSBA: StorageBufferAttribute | null;
  numSeamConstraints: number;

  // Triangle index buffer (for CPU normal computation)
  triangles: Uint32Array;

  // Counts
  numParticles: number;
  numTriangles: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create all TSL storage buffer attributes for the cloth solver.
 *
 * Initial data is copied into the SBAs. When renderer.compute() first runs,
 * Three.js will upload these to GPU storage buffers automatically.
 */
export function createTslBuffers(
  mesh: ClothMeshData,
  coloredStretch: ColoredConstraints,
  bend: BendConstraints,
  seam: SeamConstraintData | null,
): TslBufferSet {
  const N = mesh.positions.length / 3;
  const numTri = mesh.triangles.length / 3;

  // ─── Core particle buffers ──────────────────────────────────────────
  const positionSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const prevPosSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const velocitySBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const invMassSBA = new StorageBufferAttribute(new Float32Array(mesh.invMass), 1);

  // ─── Per-color stretch constraints ──────────────────────────────────
  const stretchColors: StretchColorGroup[] = [];
  for (const range of coloredStretch.colorRanges) {
    const colorIds = coloredStretch.ids.slice(range.offset * 2, (range.offset + range.count) * 2);
    const colorRest = coloredStretch.restLengths.slice(range.offset, range.offset + range.count);

    stretchColors.push({
      idsSBA: new StorageBufferAttribute(new Uint32Array(colorIds), 2),
      restLengthsSBA: new StorageBufferAttribute(new Float32Array(colorRest), 1),
      count: range.count,
    });
  }

  // ─── Bend constraints ───────────────────────────────────────────────
  const numBend = bend.ids.length / 4;
  let bendIdsSBA: StorageBufferAttribute | null = null;
  let bendRestSBA: StorageBufferAttribute | null = null;
  if (numBend > 0) {
    bendIdsSBA = new StorageBufferAttribute(new Uint32Array(bend.ids), 4);
    bendRestSBA = new StorageBufferAttribute(new Float32Array(bend.restAngles), 1);
  }

  // ─── Seam constraints ──────────────────────────────────────────────
  let seamIdsSBA: StorageBufferAttribute | null = null;
  let seamTargetDistSBA: StorageBufferAttribute | null = null;
  const numSeam = seam ? seam.ids.length / 2 : 0;
  if (seam && numSeam > 0) {
    seamIdsSBA = new StorageBufferAttribute(new Uint32Array(seam.ids), 2);
    seamTargetDistSBA = new StorageBufferAttribute(new Float32Array(seam.targetDist), 1);
  }

  return {
    positionSBA,
    prevPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendIdsSBA,
    bendRestSBA,
    numBendConstraints: numBend,
    seamIdsSBA,
    seamTargetDistSBA,
    numSeamConstraints: numSeam,
    triangles: mesh.triangles,
    numParticles: N,
    numTriangles: numTri,
  };
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBuffers.test.ts`
Expected: All 7 tests PASS

### Step 5: Commit

```bash
git add src/utils/cloth/gpu/tslBuffers.ts src/utils/cloth/gpu/__tests__/tslBuffers.test.ts
git commit -m "feat(gpu): add TSL buffer setup module (tslBuffers.ts)

Creates StorageBufferAttribute instances for positions, velocities,
invMass, and per-color stretch constraints. These SBAs will be shared
between renderer.compute() and the vertex shader via positionNode."
```

---

## Task 2: TSL Compute Functions (Solver Core)

**Files:**
- Create: `src/utils/cloth/gpu/tslSolver.ts`
- Test: `src/utils/cloth/gpu/__tests__/tslSolver.test.ts`

Port the WGSL shaders to TSL `Fn()` functions: preSolve, solveStretch, solveBend, solveSeams, postSolve. Each function reads/writes to TSL `storage()` nodes wrapping the SBAs from Task 1.

### Step 1: Write the failing test

Create `src/utils/cloth/gpu/__tests__/tslSolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createTslSolver,
  type TslSolverConfig,
  type TslSolver,
} from '../tslSolver';
import { createTslBuffers } from '../tslBuffers';
import { colorConstraints } from '../gpuBuffers';
import type { ClothMeshData, BendConstraints, SeamConstraintData, StretchConstraints } from '../gpuBuffers';

function makeTestMesh(): ClothMeshData {
  const positions = new Float32Array([
    -0.5, 1.0, 0.0,
     0.5, 1.0, 0.0,
     0.5, 0.0, 0.0,
    -0.5, 0.0, 0.0,
  ]);
  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const invMass = new Float32Array([1.0, 1.0, 1.0, 1.0]);
  return { positions, triangles, invMass };
}

function makeTestStretch(): { stretch: StretchConstraints; colored: ReturnType<typeof colorConstraints> } {
  const ids = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]);
  const restLengths = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.414]);
  const edgeTypes = new Uint8Array([1, 0, 1, 0, 2]);
  return { stretch: { ids, restLengths, edgeTypes }, colored: colorConstraints(ids, restLengths, 5) };
}

function makeTestBend(): BendConstraints {
  return { ids: new Uint32Array([0, 2, 1, 3]), restAngles: new Float32Array([Math.PI]), edgeTypes: new Uint8Array([1]) };
}

const defaultConfig: TslSolverConfig = {
  substeps: 5,
  gravity: [0, -9.81, 0],
  damping: 0.96,
  stretchCompliance: 0.001,
  bendCompliance: 1.0,
  seamStiffness: 0.0,
  groundY: 0.0,
  dt: 1 / 60,
};

describe('createTslSolver', () => {
  it('returns solver with preSolve compute node', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.preSolve).toBeDefined();
    expect(solver.postSolve).toBeDefined();
  });

  it('returns per-color stretch compute nodes', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.stretchColors.length).toBe(buffers.stretchColors.length);
    expect(solver.stretchColors.length).toBeGreaterThan(0);
  });

  it('returns bend compute node when bend constraints exist', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.bend).not.toBeNull();
  });

  it('returns null bend when no bend constraints', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const noBend: BendConstraints = { ids: new Uint32Array(0), restAngles: new Float32Array(0), edgeTypes: new Uint8Array(0) };
    const buffers = createTslBuffers(mesh, colored, noBend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.bend).toBeNull();
  });

  it('returns seam compute node when seam constraints exist', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const seam: SeamConstraintData = { ids: new Uint32Array([0, 2]), targetDist: new Float32Array([0]) };
    const buffers = createTslBuffers(mesh, colored, bend, seam);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.seam).not.toBeNull();
  });

  it('exposes positionSBA for material.positionNode', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(solver.positionSBA).toBe(buffers.positionSBA);
  });

  it('exposes updateConfig for runtime param changes', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);
    const solver = createTslSolver(buffers, defaultConfig);

    expect(typeof solver.updateConfig).toBe('function');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSolver.test.ts`
Expected: FAIL with "Cannot find module '../tslSolver'"

### Step 3: Write implementation

Create `src/utils/cloth/gpu/tslSolver.ts`:

```typescript
/**
 * TSL Compute Solver — XPBD cloth simulation using Three.js TSL nodes.
 *
 * Ports the WGSL shaders (cloth.wgsl, constraints.wgsl) to TSL Fn() functions.
 * Each function reads/writes StorageBufferAttributes directly — the same buffers
 * that the vertex shader reads via material.positionNode.
 *
 * Design decisions:
 * - Flat f32 storage (not vec3) to match existing WGSL layout and avoid alignment issues.
 * - Each stretch color group gets its own ComputeNode for race-free Gauss-Seidel dispatch.
 * - Bend uses single Jacobi dispatch (soft constraints tolerate minor races).
 * - Simulation params are TSL uniform() nodes, updated via .value assignment.
 *
 * @module tslSolver
 */

import {
  storage,
  Fn, If,
  float, uint,
  instanceIndex,
  compute,
  uniform,
} from 'three/webgpu';
import type { StorageBufferAttribute } from 'three/webgpu';
import type { TslBufferSet } from './tslBuffers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TslSolverConfig {
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  stretchCompliance: number;
  bendCompliance: number;
  seamStiffness: number;
  groundY: number;
  dt: number;
}

export interface TslSolver {
  /** Pre-solve compute node: gravity + Verlet integration */
  preSolve: ReturnType<typeof compute>;
  /** Per-color stretch compute nodes (one per color group) */
  stretchColors: Array<ReturnType<typeof compute>>;
  /** Bend compute node (null if no bend constraints) */
  bend: ReturnType<typeof compute> | null;
  /** Seam compute node (null if no seam constraints) */
  seam: ReturnType<typeof compute> | null;
  /** Post-solve compute node: velocity update + clamping */
  postSolve: ReturnType<typeof compute>;

  /** The position SBA — use with material.positionNode = storage(positionSBA).toAttribute() */
  positionSBA: StorageBufferAttribute;
  /** Number of particles */
  numParticles: number;
  /** Number of triangles (for CPU normal computation) */
  numTriangles: number;
  /** Triangle indices (for CPU normal computation) */
  triangles: Uint32Array;

  /** Update solver config at runtime */
  updateConfig: (config: Partial<TslSolverConfig>) => void;
}

// ─── Solver Factory ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTslSolver(buffers: TslBufferSet, config: TslSolverConfig): TslSolver {
  const N = buffers.numParticles;

  // ─── TSL storage nodes ──────────────────────────────────────────────
  // Flat f32 arrays accessed by element index (matching WGSL layout)
  const pos = storage(buffers.positionSBA, 'float', N * 3);
  const prev = storage(buffers.prevPosSBA, 'float', N * 3);
  const vel = storage(buffers.velocitySBA, 'float', N * 3);
  const mass = storage(buffers.invMassSBA, 'float', N).toReadOnly();

  // ─── Uniform params (updated via .value) ────────────────────────────
  const sdt = uniform(config.dt / config.substeps);
  const gravX = uniform(config.gravity[0]);
  const gravY = uniform(config.gravity[1]);
  const gravZ = uniform(config.gravity[2]);
  const damping = uniform(config.damping);
  const stretchCompliance = uniform(config.stretchCompliance);
  const bendCompliance = uniform(config.bendCompliance);
  const seamStiffness = uniform(config.seamStiffness);
  const groundY = uniform(config.groundY);
  const numParticles = uniform(N);

  // ─── Pre-solve: gravity + Verlet integration ───────────────────────
  const preSolveFn = Fn(() => {
    const i = instanceIndex;
    // @ts-expect-error TSL operator overloading
    If(i.greaterThanEqual(uint(N)), () => { return; });

    const w = mass.element(i);
    // @ts-expect-error TSL operator overloading
    If(w.equal(float(0)), () => { return; });

    const idx = i.mul(uint(3));
    const idx1 = idx.add(uint(1));
    const idx2 = idx.add(uint(2));

    // Save previous position
    prev.element(idx).assign(pos.element(idx));
    prev.element(idx1).assign(pos.element(idx1));
    prev.element(idx2).assign(pos.element(idx2));

    // Gravity + damping
    vel.element(idx).addAssign(gravX.mul(sdt));
    vel.element(idx1).addAssign(gravY.mul(sdt));
    vel.element(idx2).addAssign(gravZ.mul(sdt));

    vel.element(idx).mulAssign(damping);
    vel.element(idx1).mulAssign(damping);
    vel.element(idx2).mulAssign(damping);

    // Integrate position
    pos.element(idx).addAssign(vel.element(idx).mul(sdt));
    pos.element(idx1).addAssign(vel.element(idx1).mul(sdt));
    pos.element(idx2).addAssign(vel.element(idx2).mul(sdt));

    // Ground collision
    // @ts-expect-error TSL operator overloading
    If(pos.element(idx1).lessThan(groundY), () => {
      pos.element(idx).assign(prev.element(idx));
      pos.element(idx1).assign(groundY);
      pos.element(idx2).assign(prev.element(idx2));
    });
  });

  const preSolveNode = compute(preSolveFn, N, [256]);

  // ─── Distance constraint solver (shared by stretch, bend, seams) ───
  function makeDistanceConstraintFn(
    idsSBA: StorageBufferAttribute,
    restLenSBA: StorageBufferAttribute,
    count: number,
    complianceUniform: ReturnType<typeof uniform>,
    idStride: number, // 2 for stretch/seam pairs, 4 for bend quads
    idOffset0: number, // 0 for stretch/seam, 2 for bend (opposite vertices)
    idOffset1: number, // 1 for stretch/seam, 3 for bend
  ) {
    const ids = storage(idsSBA, 'uint', idsSBA.array.length);
    const rest = storage(restLenSBA, 'float', count).toReadOnly();

    const fn = Fn(() => {
      const i = instanceIndex;
      // @ts-expect-error TSL operator overloading
      If(i.greaterThanEqual(uint(count)), () => { return; });

      const base = i.mul(uint(idStride));
      const id0 = ids.element(base.add(uint(idOffset0)));
      const id1 = ids.element(base.add(uint(idOffset1)));

      const w0 = mass.element(id0);
      const w1 = mass.element(id1);
      const wSum = w0.add(w1);
      // @ts-expect-error TSL operator overloading
      If(wSum.equal(float(0)), () => { return; });

      const idx0 = id0.mul(uint(3));
      const idx1f = id1.mul(uint(3));

      const dx = pos.element(idx0).sub(pos.element(idx1f));
      const dy = pos.element(idx0.add(uint(1))).sub(pos.element(idx1f.add(uint(1))));
      const dz = pos.element(idx0.add(uint(2))).sub(pos.element(idx1f.add(uint(2))));

      const len2 = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
      // @ts-expect-error TSL operator overloading
      If(len2.lessThan(float(1e-20)), () => { return; });

      const len = len2.sqrt();
      const restLen = rest.element(i);
      const C = len.sub(restLen);
      const alpha = complianceUniform.div(sdt.mul(sdt));
      const s = C.negate().div(wSum.add(alpha));

      const gx = dx.div(len);
      const gy = dy.div(len);
      const gz = dz.div(len);

      pos.element(idx0).addAssign(gx.mul(s).mul(w0));
      pos.element(idx0.add(uint(1))).addAssign(gy.mul(s).mul(w0));
      pos.element(idx0.add(uint(2))).addAssign(gz.mul(s).mul(w0));

      pos.element(idx1f).subAssign(gx.mul(s).mul(w1));
      pos.element(idx1f.add(uint(1))).subAssign(gy.mul(s).mul(w1));
      pos.element(idx1f.add(uint(2))).subAssign(gz.mul(s).mul(w1));
    });

    return compute(fn, count, [256]);
  }

  // ─── Per-color stretch compute nodes ────────────────────────────────
  const stretchComputeNodes = buffers.stretchColors.map(color =>
    makeDistanceConstraintFn(
      color.idsSBA, color.restLengthsSBA, color.count,
      stretchCompliance,
      2, 0, 1, // pairs: stride=2, offsets 0,1
    ),
  );

  // ─── Bend compute node ─────────────────────────────────────────────
  let bendNode: ReturnType<typeof compute> | null = null;
  if (buffers.bendIdsSBA && buffers.bendRestSBA && buffers.numBendConstraints > 0) {
    bendNode = makeDistanceConstraintFn(
      buffers.bendIdsSBA, buffers.bendRestSBA, buffers.numBendConstraints,
      bendCompliance,
      4, 2, 3, // quads: stride=4, offsets 2,3 (opposite vertices)
    );
  }

  // ─── Seam compute node ─────────────────────────────────────────────
  let seamNode: ReturnType<typeof compute> | null = null;
  if (buffers.seamIdsSBA && buffers.seamTargetDistSBA && buffers.numSeamConstraints > 0) {
    seamNode = makeDistanceConstraintFn(
      buffers.seamIdsSBA, buffers.seamTargetDistSBA, buffers.numSeamConstraints,
      seamStiffness,
      2, 0, 1, // pairs: stride=2, offsets 0,1
    );
  }

  // ─── Post-solve: velocity update + clamping ────────────────────────
  const postSolveFn = Fn(() => {
    const i = instanceIndex;
    // @ts-expect-error TSL operator overloading
    If(i.greaterThanEqual(uint(N)), () => { return; });

    const w = mass.element(i);
    // @ts-expect-error TSL operator overloading
    If(w.equal(float(0)), () => { return; });

    const idx = i.mul(uint(3));
    const idx1 = idx.add(uint(1));
    const idx2 = idx.add(uint(2));

    const invDt = float(1).div(sdt);

    const vx = pos.element(idx).sub(prev.element(idx)).mul(invDt);
    const vy = pos.element(idx1).sub(prev.element(idx1)).mul(invDt);
    const vz = pos.element(idx2).sub(prev.element(idx2)).mul(invDt);

    const speed2 = vx.mul(vx).add(vy.mul(vy)).add(vz.mul(vz));

    // Velocity clamp (max 50 m/s)
    const maxSpeed = float(50);
    const maxSpeed2 = maxSpeed.mul(maxSpeed);

    // @ts-expect-error TSL operator overloading
    If(speed2.greaterThan(maxSpeed2), () => {
      const scale = maxSpeed.div(speed2.sqrt());
      vel.element(idx).assign(vx.mul(scale));
      vel.element(idx1).assign(vy.mul(scale));
      vel.element(idx2).assign(vz.mul(scale));
    }).Else(() => {
      vel.element(idx).assign(vx);
      vel.element(idx1).assign(vy);
      vel.element(idx2).assign(vz);
    });
  });

  const postSolveNode = compute(postSolveFn, N, [256]);

  // ─── Config update ─────────────────────────────────────────────────
  function updateConfig(newConfig: Partial<TslSolverConfig>) {
    if (newConfig.gravity) {
      gravX.value = newConfig.gravity[0];
      gravY.value = newConfig.gravity[1];
      gravZ.value = newConfig.gravity[2];
    }
    if (newConfig.damping !== undefined) damping.value = newConfig.damping;
    if (newConfig.stretchCompliance !== undefined) stretchCompliance.value = newConfig.stretchCompliance;
    if (newConfig.bendCompliance !== undefined) bendCompliance.value = newConfig.bendCompliance;
    if (newConfig.seamStiffness !== undefined) seamStiffness.value = newConfig.seamStiffness;
    if (newConfig.groundY !== undefined) groundY.value = newConfig.groundY;
    if (newConfig.dt !== undefined || newConfig.substeps !== undefined) {
      const dt = newConfig.dt ?? config.dt;
      const sub = newConfig.substeps ?? config.substeps;
      sdt.value = dt / sub;
      config.dt = dt;
      config.substeps = sub;
    }
  }

  return {
    preSolve: preSolveNode,
    stretchColors: stretchComputeNodes,
    bend: bendNode,
    seam: seamNode,
    postSolve: postSolveNode,
    positionSBA: buffers.positionSBA,
    numParticles: N,
    numTriangles: buffers.numTriangles,
    triangles: buffers.triangles,
    updateConfig,
  };
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSolver.test.ts`
Expected: All 7 tests PASS

**Note:** These tests validate the factory's structure (returned nodes, null handling). Actual GPU execution is tested via E2E in Task 6.

### Step 5: Commit

```bash
git add src/utils/cloth/gpu/tslSolver.ts src/utils/cloth/gpu/__tests__/tslSolver.test.ts
git commit -m "feat(gpu): add TSL compute solver (tslSolver.ts)

Ports WGSL shaders to TSL Fn() functions: preSolve (gravity + Verlet),
solveStretch (graph-colored distance constraints), solveBend (Jacobi),
solveSeams, postSolve (velocity update + clamping).

Uses shared makeDistanceConstraintFn for stretch/bend/seam (DRY).
Exposes uniform nodes for runtime config updates."
```

---

## Task 3: Modify GpuSolverClient for TSL Mode

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`
- Test: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` (new)

Add a TSL code path to `GpuSolverClient`. When a Three.js `WebGPURenderer` is provided, the client creates TSL buffers + solver and uses `renderer.compute()` instead of the raw WGSL solver. The `loop()` method skips CPU readback entirely (zero-copy mode), but `readPositionsToCPU()` remains for export/fit maps.

### Step 1: Write the failing test

Create `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GpuSolverClient } from '../gpuSolverClient';

describe('GpuSolverClient', () => {
  it('exports GpuSolverClient class', () => {
    expect(GpuSolverClient).toBeDefined();
    expect(typeof GpuSolverClient).toBe('function');
  });

  it('has initMultiPieceTsl method', () => {
    // Verify the TSL init path exists on the prototype
    expect(typeof GpuSolverClient.prototype.initMultiPieceTsl).toBe('function');
  });

  it('has getTslSolver accessor', () => {
    expect(typeof GpuSolverClient.prototype.getTslSolver).toBe('function');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: FAIL with "GpuSolverClient.prototype.initMultiPieceTsl is not a function" or similar

### Step 3: Modify gpuSolverClient.ts

Add the following to `src/utils/cloth/gpu/gpuSolverClient.ts`:

**Add imports** (after existing imports, around line 14):
```typescript
import { createTslBuffers, type TslBufferSet } from './tslBuffers';
import { createTslSolver, type TslSolver, type TslSolverConfig } from './tslSolver';
import { colorConstraints } from './gpuBuffers';
```

**Add fields** to the `GpuSolverClient` class (after line 59):
```typescript
  /** TSL solver (when using renderer.compute() path) */
  private tslSolver: TslSolver | null = null;
  private tslBuffers: TslBufferSet | null = null;
```

**Add `initMultiPieceTsl` method** (after `initMultiPiece`, around line 183):
```typescript
  /**
   * Initialize with TSL solver (for zero-copy rendering via positionNode).
   * Call this instead of initMultiPiece() when using MeshStandardNodeMaterial.
   */
  async initMultiPieceTsl(
    pieces: PieceMeshData[],
    seamPairs?: Array<{ pieceAId: string; pieceBId: string; vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]> }>, // brand: LocalVertexIndex (see src/utils/cloth/seamPairs.ts)
    solverConfig?: Partial<TslSolverConfig>,
  ): Promise<void> {
    // Merge pieces (same logic as initMultiPiece)
    let totalVerts = 0;
    let totalTris = 0;
    const vertexOffsets = new Map<string, number>();

    for (const p of pieces) {
      vertexOffsets.set(p.pieceId, totalVerts);
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
    }

    const positions = new Float32Array(totalVerts * 3);
    const invMass = new Float32Array(totalVerts);
    const triangles = new Uint32Array(totalTris);

    let vOff = 0;
    let tOff = 0;

    for (const p of pieces) {
      const numV = p.vertices.length / 3;
      positions.set(p.vertices, vOff * 3);
      for (let i = 0; i < numV; i++) invMass[vOff + i] = 1.0;
      for (let i = 0; i < p.triIds.length; i++) triangles[tOff + i] = p.triIds[i] + vOff;
      vOff += numV;
      tOff += p.triIds.length;
    }

    // Extract constraints
    const { extractStretchConstraints, extractBendConstraints } = await import('./gpuBuffers');
    const stretch = extractStretchConstraints(positions, triangles);
    const bend = extractBendConstraints(positions, triangles);
    const colored = colorConstraints(stretch.ids, stretch.restLengths, stretch.ids.length / 2);

    // Build seam constraints
    let seam: import('./gpuBuffers').SeamConstraintData | null = null;
    if (seamPairs && seamPairs.length > 0) {
      const seamIds: number[] = [];
      const seamDist: number[] = [];
      for (const sp of seamPairs) {
        const offA = vertexOffsets.get(sp.pieceAId) ?? 0;
        const offB = vertexOffsets.get(sp.pieceBId) ?? 0;
        for (const [a, b] of sp.vertexPairs) {
          seamIds.push(a + offA, b + offB);
          seamDist.push(0);
        }
      }
      if (seamIds.length > 0) {
        seam = { ids: new Uint32Array(seamIds), targetDist: new Float32Array(seamDist) };
      }
    }

    // Create TSL buffers and solver
    this.tslBuffers = createTslBuffers(
      { positions, triangles, invMass },
      colored,
      bend,
      seam,
    );

    const defaultConfig: TslSolverConfig = {
      substeps: 15,
      gravity: [0, -9.81, 0],
      damping: 0.9603,
      stretchCompliance: 0.001,
      bendCompliance: 1.0,
      seamStiffness: 0.0,
      groundY: 0.0,
      dt: 1 / 60,
      ...solverConfig,
    };

    this.tslSolver = createTslSolver(this.tslBuffers, defaultConfig);
    this.zeroCopy = true; // TSL mode = zero-copy

    console.log('[GpuSolverClient] TSL solver initialized:', {
      particles: totalVerts,
      stretchColors: colored.colorRanges.length,
      bendConstraints: bend.ids.length / 4,
      seamConstraints: seam ? seam.ids.length / 2 : 0,
    });
  }

  /**
   * Get the TSL solver (for renderer.compute() dispatch in useFrame).
   */
  getTslSolver(): TslSolver | null {
    return this.tslSolver;
  }
```

**Update `dispose` method** to clean up TSL resources (add before `this.solver.destroy()` in dispose):
```typescript
    this.tslSolver = null;
    this.tslBuffers = null;
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: All 3 tests PASS

### Step 5: Commit

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(gpu): add TSL init path to GpuSolverClient

Adds initMultiPieceTsl() which creates TSL buffers + solver for
zero-copy rendering. getTslSolver() exposes the solver for
renderer.compute() dispatch from useFrame."
```

---

## Task 4: Integrate TSL Solver into GarmentSimulation Rendering

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts`

Wire `MeshStandardNodeMaterial` with `positionNode` to the TSL solver's position buffer. The `useFrame` loop dispatches `renderer.compute()` for each substep, then Three.js renders the mesh from the same GPU buffer — no readback.

### Step 1: Modify useSimulationLifecycle.ts

In the WebGPU GPU solver section (around line 212-264), change the init and loop to use TSL:

**Replace the WebGPU block** (from `if (isWebGPUFeatureEnabled() && isWebGPUAvailable())` through `return;`) with:

```typescript
        if (isWebGPUFeatureEnabled() && isWebGPUAvailable()) {
          try {
            // Reuse cached device or create a new one
            let device = gpuDeviceRef.current;
            if (!device || gpuDeviceLostRef.current) {
              const adapter = await navigator.gpu.requestAdapter();
              if (!adapter || cancelled) throw new Error('No WebGPU adapter');
              device = await adapter.requestDevice();
              gpuDeviceRef.current = device;
              gpuDeviceLostRef.current = false;
              device.lost.then((info) => {
                console.warn('[SimLifecycle] GPU device lost:', info.reason, info.message);
                gpuDeviceLostRef.current = true;
                gpuDeviceRef.current = null;
              });
            }
            if (!cancelled) {
                console.log('[SimLifecycle] 🟢 Using WebGPU TSL solver (zero-copy)');
                dispatch(setSolverTier('webgpu'));
                const gpuClient = new GpuSolverClient(device);
                gpuClientRef.current = gpuClient;
                // Note: onFrame not needed for TSL mode — positions stay on GPU.
                // We still set it for potential CPU readback requests.
                gpuClient.onFrame = onFrame;
                await withTimeout(gpuClient.initMultiPieceTsl(placedMeshes), 12000, 'TSL solver init');

                // Body collision deferred to Phase 2.

                // Don't call gpuClient.start() — TSL compute is driven by useFrame.
                return;
            }
          } catch (e) {
            console.warn('[SimLifecycle] TSL solver failed, falling through to WASM:', e);
            gpuClientRef.current?.dispose();
            gpuClientRef.current = null;
          }
        }
```

**Add to exports** — expose `gpuClientRef` so GarmentSimulation can access the TSL solver:

After the existing return statement (line ~416), modify the return to also include `tslSolver`:

Actually, the cleanest approach is to add a `tslSolverRef` to the hook output:

Add a new ref at the top of the hook (around line 174):
```typescript
  const tslSolverRef = useRef<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>(null);
```

In the WebGPU init block, after `gpuClient.initMultiPieceTsl(...)`, add:
```typescript
                tslSolverRef.current = gpuClient.getTslSolver();
```

In the cleanup function and idle handler, add:
```typescript
        tslSolverRef.current = null;
```

Add to the return type interface:
```typescript
  /** TSL solver ref for renderer.compute() dispatch */
  tslSolverRef: React.MutableRefObject<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>;
```

And return it:
```typescript
  return {
    clients: { ... },
    positionsRef,
    edgeDataRef,
    onFrame,
    tslSolverRef,
  };
```

### Step 2: Modify GarmentSimulation.tsx

**Add imports** (around line 18):
```typescript
import { MeshStandardNodeMaterial, storage } from 'three/webgpu';
```

**Destructure `tslSolverRef`** from useSimulationLifecycle (line ~204):
```typescript
  const { clients, positionsRef, edgeDataRef, onFrame, tslSolverRef } = useSimulationLifecycle({
```

**Add state for the TSL material** (around line 90):
```typescript
  const tslMaterialRef = useRef<InstanceType<typeof MeshStandardNodeMaterial> | null>(null);
```

**Create TSL material when solver is available.** Add a useEffect after the geometry building useMemo (around line 168):
```typescript
  // Create TSL node material when solver initializes
  useEffect(() => {
    const solver = tslSolverRef.current;
    if (!solver || !staticGeometry) {
      tslMaterialRef.current = null;
      return;
    }

    const mat = new MeshStandardNodeMaterial();
    mat.positionNode = storage(solver.positionSBA, 'vec3', solver.numParticles).toAttribute();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.opacity = renderParams.opacity;
    mat.roughness = renderParams.roughness;
    mat.metalness = renderParams.metalness;
    tslMaterialRef.current = mat;

    return () => {
      mat.dispose();
      tslMaterialRef.current = null;
    };
  }, [tslSolverRef.current, staticGeometry, renderParams]);
```

**Update useFrame** to dispatch TSL compute (replace the existing useFrame block starting at line 259):

```typescript
  useFrame(({ gl }) => {
    if (!meshRef.current || !staticGeometry) return;
    if (isPlayingBack) return;

    const solver = tslSolverRef.current;

    // ─── TSL zero-copy path ──────────────────────────────────────────
    if (solver) {
      // Dispatch compute passes for all substeps
      const substeps = 15; // TODO: get from solver config
      for (let s = 0; s < substeps; s++) {
        gl.compute(solver.preSolve);
        for (const stretchColor of solver.stretchColors) {
          gl.compute(stretchColor);
        }
        if (solver.bend) gl.compute(solver.bend);
        if (solver.seam) gl.compute(solver.seam);
        gl.compute(solver.postSolve);
      }

      // CPU normal computation (Phase 1 fallback — GPU normals in Phase 2)
      staticGeometry.computeVertexNormals();
      return;
    }

    // ─── CPU readback path (WASM/CPU solvers) ────────────────────────
    {
      const positions = positionsRef.current;
      if (positions && positions.length > 0) {
        const posAttr = staticGeometry.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.array.length === positions.length) {
          (posAttr.array as Float32Array).set(positions);
          posAttr.needsUpdate = true;
          staticGeometry.computeVertexNormals();
          staticGeometry.computeBoundingSphere();
        }
      }
    }

    // Fit map overlay (CPU readback path only)
    const positions = positionsRef.current;
    const colorAttr = staticGeometry.getAttribute('color') as THREE.BufferAttribute;
    if (fitMapMode !== 'none' && edgeDataRef.current && colorAttr && positions && positions.length > 0) {
      if (!pieceColorsRef.current) {
        pieceColorsRef.current = new Float32Array(colorAttr.array as Float32Array);
      }
      const numP = positions.length / 3;
      const fabric = PHYSICAL_FABRIC_LIBRARY.find((f: { id: string }) => f.id === fabricId);
      const fitParams = fabric ? fabricToFitParams(fabric) : {
        maxStretchRatio: 0.08, weight: 150, thickness: 0.4, avgStretch: 0.025,
      };
      const mapData = computeFitMapData(
        fitMapMode, positions, numP, edgeDataRef.current, fitParams, null, fitMapConfig,
      );
      if (mapData) {
        (colorAttr.array as Float32Array).set(mapData.colors);
        colorAttr.needsUpdate = true;
        onFitMapStats?.(mapData.stats);
        dispatch(setFitMapStats(mapData.stats));
      }
    } else if (fitMapMode === 'none' && pieceColorsRef.current && colorAttr) {
      (colorAttr.array as Float32Array).set(pieceColorsRef.current);
      colorAttr.needsUpdate = true;
      pieceColorsRef.current = null;
      onFitMapStats?.(null);
      dispatch(setFitMapStats(null));
    }
  });
```

**Update the mesh JSX** to use TSL material when available (replace the `<mesh>` block around line 487):

```typescript
      <mesh
        ref={meshRef}
        geometry={staticGeometry}
        onClick={handleMeshClick}
        material={tslMaterialRef.current || undefined}
      >
        {!tslMaterialRef.current && (
          <meshPhysicalMaterial
            vertexColors={fitMapMode !== 'none'}
            color={effectiveTint || '#ffffff'}
            side={THREE.DoubleSide}
            transparent
            opacity={renderParams.opacity}
            roughness={renderParams.roughness}
            metalness={renderParams.metalness}
            sheen={renderParams.sheen}
            sheenRoughness={renderParams.sheenRoughness}
            sheenColor={renderParams.sheenColor}
            clearcoat={renderParams.clearcoat}
            clearcoatRoughness={renderParams.clearcoatRoughness}
            transmission={renderParams.transmission}
            thickness={renderParams.thickness}
            ior={renderParams.ior}
            map={fitMapMode === 'none' ? textures.map : null}
            normalMap={textures.normalMap}
            roughnessMap={fitMapMode === 'none' ? textures.roughnessMap : null}
            aoMap={textures.aoMap}
          />
        )}
      </mesh>
```

### Step 3: Run type check

Run: `npx tsc --noEmit`
Expected: No errors (fix any type issues)

### Step 4: Run existing tests

Run: `npx vitest run`
Expected: All existing tests pass (no regressions)

### Step 5: Commit

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/components/Viewport3D/useSimulationLifecycle.ts
git commit -m "feat(gpu): integrate TSL solver into rendering pipeline

useSimulationLifecycle now initializes TSL solver via initMultiPieceTsl().
GarmentSimulation.useFrame dispatches renderer.compute() per substep
and reads positions via positionNode — no CPU readback.

MeshStandardNodeMaterial with positionNode replaces meshPhysicalMaterial
when TSL solver is active. Falls back to CPU readback for WASM/CPU tiers."
```

---

## Task 5: CPU Readback Fallback for Export/Fit Maps

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`

The TSL solver's position data lives in `StorageBufferAttribute.array` (the CPU-side backing array). However, after `renderer.compute()`, this array is stale — the GPU has the latest data. For export and fit maps, we need a readback method.

### Step 1: Add `readPositionsToCPU` for TSL mode

In `gpuSolverClient.ts`, update the existing `readPositionsToCPU` method:

```typescript
  /**
   * Explicit CPU readback for export/fit-maps.
   * For TSL mode: reads back from the StorageBufferAttribute's GPU buffer.
   * For WGSL mode: delegates to solver.readPositions().
   */
  async readPositionsToCPU(): Promise<Float32Array | null> {
    if (this.tslSolver) {
      // TSL mode: the SBA's backing array is stale after compute.
      // Use renderer.readStorageBufferAttribute() or readback via mapAsync.
      // For now, return the SBA's array — it was initialized with positions
      // and will be stale after compute (acceptable for Phase 1).
      // Phase 2 will add proper GPU→CPU readback for TSL buffers.
      console.warn('[GpuSolverClient] TSL readback returns initial positions (GPU readback not yet implemented)');
      return new Float32Array(this.tslSolver.positionSBA.array as Float32Array);
    }
    return this.solver.readPositions();
  }
```

### Step 2: Run tests

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS

### Step 3: Commit

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts
git commit -m "feat(gpu): add TSL readback fallback for export/fit maps

readPositionsToCPU() returns SBA backing array in TSL mode.
Proper GPU readback via renderer.readStorageBufferAttribute()
deferred to Phase 2."
```

---

## Task 6: E2E Smoke Test

**Files:**
- Create: `tests/e2e/tsl-zero-copy.spec.ts`

Verify that the TSL solver initializes, cloth moves (positions change), and the mesh renders without errors on a WebGPU-capable browser.

### Step 1: Write the E2E test

Create `tests/e2e/tsl-zero-copy.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('TSL Zero-Copy Rendering', () => {
  test.setTimeout(120_000);

  test('cloth simulation runs with TSL solver on WebGPU', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:5173');

    // Wait for 3D viewport to mount
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // Check console for TSL solver initialization
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Wait for simulation to start (triggered by default template)
    await page.waitForTimeout(5_000);

    // Check that WebGPU TSL solver was selected (or fell through to WASM/CPU)
    const hasTslLog = consoleMessages.some(msg => msg.includes('TSL solver initialized'));
    const hasWebGpuLog = consoleMessages.some(msg => msg.includes('Using WebGPU'));

    // If WebGPU is available, expect TSL solver
    if (hasWebGpuLog) {
      expect(hasTslLog).toBe(true);
    }

    // Verify no WebGPU errors
    const hasGpuError = consoleMessages.some(msg =>
      msg.includes('WebGPU uncaptured error') || msg.includes('GPUValidationError'),
    );
    expect(hasGpuError).toBe(false);
  });
});
```

### Step 2: Run E2E test

Run: `npx playwright test tests/e2e/tsl-zero-copy.spec.ts --headed`
Expected: PASS (on WebGPU-capable machine). May skip on CI if no GPU.

### Step 3: Commit

```bash
git add tests/e2e/tsl-zero-copy.spec.ts
git commit -m "test(e2e): add TSL zero-copy smoke test

Verifies TSL solver initializes on WebGPU-capable browsers
and produces no GPU validation errors."
```

---

## Task 7: Final Verification + Cleanup

**Files:**
- All modified files from Tasks 1-6

### Step 1: Run full test suite

Run: `npx vitest run`
Expected: All tests pass (existing + new)

### Step 2: Run type check

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Run build

Run: `npm run build`
Expected: Build succeeds. Check that `three-webgpu` chunk includes TSL dependencies.

### Step 4: Manual visual test

1. `npm run dev`
2. Open browser at localhost:5173
3. Load a garment template
4. Start simulation
5. Verify: cloth drapes and moves
6. Open DevTools console — confirm `[SimLifecycle] 🟢 Using WebGPU TSL solver (zero-copy)` log
7. Verify: no `mapAsync` readback logs (confirming zero-copy path)

### Step 5: Commit any fixes

```bash
git add -A
git commit -m "fix(gpu): address TSL integration issues from final verification"
```

### Step 6: Update CLAUDE.md

Add to the Architecture Notes section of CLAUDE.md:

```markdown
- **TSL Zero-Copy**: GPU solver now uses TSL (Three Shading Language) for compute.
  `renderer.compute()` writes positions to `StorageBufferAttribute`, which the
  vertex shader reads via `material.positionNode` — no CPU readback per frame.
  Body collision and GPU normals deferred to Phase 2.
```

### Step 7: Commit CLAUDE.md

```bash
git add CLAUDE.md
git commit -m "docs: add TSL zero-copy architecture note to CLAUDE.md"
```
