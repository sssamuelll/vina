# Anisotropic Stretch - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make stretch constraints direction-dependent (warp/weft/shear) so different fabrics stretch differently along grain vs. bias.

**Architecture:** Classify each stretch constraint by its UV-space direction, store per-constraint compliance, modify solver to use it.

**Tech Stack:** TypeScript (JS solver), Rust (WASM solver), Vitest (testing)

**Epic Issue:** #198, Task 2 (P1: Anisotropic Stretch)

---

## Current State

- `PhysicalFabric` already has `stretchWarp`, `stretchWeft`, `stretchBias` properties
- `toXPBDParams()` already computes `stretchComplianceWarp`, `stretchComplianceWeft`, `shearCompliance`
- Solver uses single global `stretchCompliance` for ALL constraints
- `extractStretchConstraints()` doesn't track edge direction

---

## Task 1: Add edge direction classification to constraint extraction

**Files:**
- Modify: `src/utils/cloth/gpu/gpuBuffers.ts`
- Test: `src/utils/cloth/__tests__/gpuBuffers.test.ts` (if exists, else inline)

### Step 1: Define EdgeType enum

```typescript
export enum EdgeType {
  WARP = 0,   // Vertical (along V axis in UV)
  WEFT = 1,   // Horizontal (along U axis in UV)
  SHEAR = 2,  // Diagonal (45°)
}
```

### Step 2: Update StretchConstraints interface

```typescript
export interface StretchConstraints {
  ids: Uint32Array;
  restLengths: Float32Array;
  edgeTypes: Uint8Array;  // NEW: EdgeType per constraint
}
```

### Step 3: Add classifyEdgeType helper

```typescript
/**
 * Classify edge direction based on UV coordinates.
 * @param uvA - UV coords of first vertex [u, v]
 * @param uvB - UV coords of second vertex [u, v]
 * @returns EdgeType (WARP, WEFT, or SHEAR)
 */
export function classifyEdgeType(uvA: [number, number], uvB: [number, number]): EdgeType {
  const du = uvB[0] - uvA[0];
  const dv = uvB[1] - uvA[1];
  const angle = Math.atan2(Math.abs(dv), Math.abs(du)) * (180 / Math.PI);

  // Weft: mostly horizontal (angle < 22.5° or > 157.5°)
  if (angle < 22.5 || angle > 157.5) return EdgeType.WEFT;
  // Warp: mostly vertical (67.5° < angle < 112.5°)
  if (angle > 67.5 && angle < 112.5) return EdgeType.WARP;
  // Shear: diagonal
  return EdgeType.SHEAR;
}
```

### Step 4: Update extractStretchConstraints to accept UVs

```typescript
export function extractStretchConstraints(
  positions: Float32Array,
  triangles: Uint32Array,
  uvs?: Float32Array,  // NEW: optional UV coords [u,v, u,v, ...]
): StretchConstraints {
  // ... existing edge extraction ...

  // Add edge type classification
  const edgeTypes: number[] = [];

  for each edge (a, b):
    if (uvs) {
      const uvA: [number, number] = [uvs[a * 2], uvs[a * 2 + 1]];
      const uvB: [number, number] = [uvs[b * 2], uvs[b * 2 + 1]];
      edgeTypes.push(classifyEdgeType(uvA, uvB));
    } else {
      edgeTypes.push(EdgeType.SHEAR); // Default: treat as shear
    }

  return {
    ids: new Uint32Array(ids),
    restLengths: new Float32Array(restLengths),
    edgeTypes: new Uint8Array(edgeTypes),
  };
}
```

### Step 5: Run tests

```bash
npx vitest run src/utils/cloth/gpu/ --reporter=verbose
```

### Step 6: Commit

```bash
git commit -m "feat(cloth): add edge direction classification for anisotropic stretch

- Add EdgeType enum (WARP, WEFT, SHEAR)
- Add classifyEdgeType() based on UV coordinates
- Update extractStretchConstraints to return edgeTypes array

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 2: Add anisotropic compliance to ClothSimConfig

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

### Step 1: Write failing test

```typescript
describe('XPBDClothSolver - Anisotropic Stretch', () => {
  it('should have anisotropic stretch config properties', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.001,
      stretchComplianceShear: 0.01,
    });
    expect(solver.config.stretchComplianceWarp).toBe(0.0);
    expect(solver.config.stretchComplianceWeft).toBe(0.001);
    expect(solver.config.stretchComplianceShear).toBe(0.01);
  });
});
```

### Step 2: Add properties to ClothSimConfig interface

```typescript
export interface ClothSimConfig {
  // ... existing ...

  /** Stretch compliance in warp direction (vertical, 0° in UV) */
  stretchComplianceWarp: number;
  /** Stretch compliance in weft direction (horizontal, 90° in UV) */
  stretchComplianceWeft: number;
  /** Stretch compliance in shear direction (diagonal, 45° in UV) */
  stretchComplianceShear: number;
}
```

### Step 3: Add defaults in constructor

```typescript
stretchComplianceWarp: 0.0,
stretchComplianceWeft: 0.0,
stretchComplianceShear: 0.001,
```

### Step 4: Run tests

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

### Step 5: Commit

```bash
git commit -m "feat(cloth): add anisotropic stretch compliance to config

- Add stretchComplianceWarp/Weft/Shear to ClothSimConfig
- Default values: warp=0, weft=0, shear=0.001

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 3: Store per-constraint compliance in TypeScript solver

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`

### Step 1: Add stretchCompliances array to class

```typescript
private stretchCompliances!: Float32Array;  // Per-constraint compliance
```

### Step 2: Compute per-constraint compliance in initConstraints

After extracting stretch constraints, compute compliance per edge:

```typescript
// In initConstraints() after stretch extraction:
this.stretchCompliances = new Float32Array(this.stretchingLengths.length);
for (let i = 0; i < this.stretchingLengths.length; i++) {
  const edgeType = stretchConstraints.edgeTypes[i];
  switch (edgeType) {
    case EdgeType.WARP:
      this.stretchCompliances[i] = this.config.stretchComplianceWarp;
      break;
    case EdgeType.WEFT:
      this.stretchCompliances[i] = this.config.stretchComplianceWeft;
      break;
    case EdgeType.SHEAR:
    default:
      this.stretchCompliances[i] = this.config.stretchComplianceShear;
      break;
  }
}
```

### Step 3: Update solveStretching to use per-constraint compliance

```typescript
private solveStretching(sdt: number): void {
  for (let i = 0; i < this.stretchingLengths.length; i++) {
    const compliance = this.stretchCompliances[i];
    const alpha = compliance / (sdt * sdt);
    // ... rest of constraint solving ...
  }
}
```

### Step 4: Commit

```bash
git commit -m "feat(cloth): implement per-constraint compliance in TS solver

- Store stretchCompliances array per constraint
- Classify edges by type and assign compliance
- Update solveStretching to use per-constraint values

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 4: Add anisotropic stretch test

**Files:**
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

### Step 1: Add behavior test

```typescript
it('shear direction should stretch more than warp/weft', () => {
  // Create mesh with known UV layout
  const mesh = makeSquareMeshWithUVs(); // 2x2 grid with UVs

  // Cotton-like: stiff in warp/weft, stretchy in shear
  const solver = new XPBDClothSolver(mesh, {
    stretchComplianceWarp: 0.0,
    stretchComplianceWeft: 0.0,
    stretchComplianceShear: 0.1,
    gravity: [0, 0, 0],
    damping: 1.0,
  });

  // Pin corners and apply diagonal pull
  solver.pinParticle(0); // top-left
  // Apply force to bottom-right corner (shear direction)

  // Measure strain in shear vs warp direction
  // Shear should have more displacement
});
```

### Step 2: Run tests

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

### Step 3: Commit

```bash
git commit -m "test(cloth): add anisotropic stretch behavior test

Verifies shear direction stretches more than warp/weft.

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 5: Implement anisotropic stretch in Rust WASM

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs`

### Step 1: Add fields to XpbdSolver

```rust
stretch_compliance_warp: f32,
stretch_compliance_weft: f32,
stretch_compliance_shear: f32,
stretch_compliances: Vec<f32>,  // Per-constraint
```

### Step 2: Update configure()

Add parameters for the three compliance values.

### Step 3: Add set_stretch_with_types method

```rust
pub fn set_stretch_with_types(&mut self, ids: &[u32], rest_lengths: &[f32], edge_types: &[u8]) {
    // Store constraints
    // Compute per-constraint compliance based on edge_types
}
```

### Step 4: Update solve_stretch to use per-constraint compliance

### Step 5: Build and copy WASM

```bash
cd crates/xpbd-wasm && wasm-pack build --target web --out-dir pkg
cp crates/xpbd-wasm/pkg/xpbd_wasm_bg.wasm public/wasm/
```

### Step 6: Commit

```bash
git commit -m "feat(cloth): implement anisotropic stretch in Rust WASM

- Add per-constraint stretch compliance
- Add set_stretch_with_types method
- Update configure() with warp/weft/shear compliance

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 6: Update WASM worker interface

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts`

### Step 1: Extract UVs and pass to constraint extraction

### Step 2: Call set_stretch_with_types with edge types

### Step 3: Update configure() call with anisotropic compliance

### Step 4: TypeScript check

```bash
npx tsc --noEmit
```

### Step 5: Commit

```bash
git commit -m "feat(cloth): wire up anisotropic stretch in WASM worker

- Pass UV data for edge classification
- Call set_stretch_with_types with edge types
- Update configure with anisotropic compliance values

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 7: Final integration and tests

### Step 1: Run all tests

```bash
npm test
```

### Step 2: Build check

```bash
npm run build
```

### Step 3: Commit if needed

---

## Success Criteria

- [ ] Edge types classified correctly from UV coordinates
- [ ] Per-constraint compliance stored and used in solver
- [ ] Visible difference between warp/weft/shear stretch
- [ ] TypeScript and WASM implementations match
- [ ] All tests pass
- [ ] 60fps performance maintained
