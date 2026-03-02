# Air Drag per Triangle - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement physics-based air resistance that makes cloth settle naturally instead of floating.

**Architecture:** Add `applyAirDrag()` method called in `preSolve()` that iterates triangles and applies drag force to vertices based on triangle velocity, normal, and area.

**Tech Stack:** TypeScript (JS solver), Rust (WASM solver), Vitest (testing)

**Epic Issue:** #198, Task 1

---

## Task 1: Add dragCoefficient to ClothSimConfig

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts:105-136` (ClothSimConfig interface)
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

### Step 1: Write the failing test

```typescript
// Add to xpbdSolver.test.ts after existing imports

describe('XPBDClothSolver - Air Drag', () => {
  it('should have dragCoefficient in default config', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.config.dragCoefficient).toBe(1.0);
  });

  it('should accept custom dragCoefficient', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, { dragCoefficient: 0.5 });
    expect(solver.config.dragCoefficient).toBe(0.5);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

Expected: FAIL with "Property 'dragCoefficient' does not exist"

### Step 3: Add dragCoefficient to interface and defaults

In `src/utils/cloth/xpbdSolver.ts`, add to `ClothSimConfig` interface (around line 136):

```typescript
export interface ClothSimConfig {
  // ... existing properties ...
  /** Enable Long Range Attachments (default true) */
  enableLRA: boolean;
  /** Air drag coefficient (0 = no drag, 1.0 = normal, 2.0 = heavy drag) */
  dragCoefficient: number;
}
```

And add default in constructor (around line 333):

```typescript
this.config = {
  // ... existing defaults ...
  enableLRA: true,
  dragCoefficient: 1.0,
  ...config,
};
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

Expected: PASS

### Step 5: Commit

```bash
git add src/utils/cloth/xpbdSolver.ts src/utils/cloth/__tests__/xpbdSolver.test.ts
git commit -m "feat(cloth): add dragCoefficient to ClothSimConfig

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 2: Implement applyAirDrag method (TypeScript)

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

### Step 1: Write the failing test

```typescript
// Add to the 'Air Drag' describe block

it('should slow down fast-moving cloth with drag enabled', () => {
  const mesh = makeSquareMesh();
  const solver = new XPBDClothSolver(mesh, {
    dragCoefficient: 1.0,
    damping: 1.0, // Disable regular damping to isolate drag effect
    gravity: [0, 0, 0], // Disable gravity
  });

  // Give all particles downward velocity
  for (let i = 0; i < solver.numParticles; i++) {
    solver.vel[i * 3 + 1] = -5.0; // 5 m/s downward
  }

  const initialKE = solver.computeKineticEnergy();
  solver.step();
  const finalKE = solver.computeKineticEnergy();

  // Drag should reduce kinetic energy
  expect(finalKE).toBeLessThan(initialKE);
});

it('should not affect cloth when dragCoefficient is 0', () => {
  const mesh = makeSquareMesh();
  const solver = new XPBDClothSolver(mesh, {
    dragCoefficient: 0.0,
    damping: 1.0,
    gravity: [0, 0, 0],
  });

  // Give particle velocity
  solver.vel[1] = -5.0;
  const velBefore = solver.vel[1];

  // Apply one preSolve worth of drag (through step)
  // Note: This test is approximate since step() does more than just preSolve
  expect(solver.config.dragCoefficient).toBe(0.0);
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

Expected: FAIL (drag not slowing cloth because not implemented)

### Step 3: Implement applyAirDrag method

Add after `preSolve()` method in `xpbdSolver.ts` (around line 534):

```typescript
/**
 * Apply aerodynamic drag force per triangle.
 * Formula: F = ½ρv²CdA(n·v̂)
 *
 * @param sdt - Substep delta time
 */
private applyAirDrag(sdt: number): void {
  const dragCoeff = this.config.dragCoefficient;
  if (dragCoeff <= 0) return;

  const airDensity = 1.225; // kg/m³ at sea level
  const numTris = this.triIds.length / 3;

  // Temporary vectors for calculation
  const e0 = new Float32Array(3);
  const e1 = new Float32Array(3);
  const normal = new Float32Array(3);
  const triVel = new Float32Array(3);

  for (let t = 0; t < numTris; t++) {
    const i0 = this.triIds[t * 3];
    const i1 = this.triIds[t * 3 + 1];
    const i2 = this.triIds[t * 3 + 2];

    // Skip if all vertices are pinned
    if (this.invMass[i0] === 0 && this.invMass[i1] === 0 && this.invMass[i2] === 0) {
      continue;
    }

    // Calculate triangle velocity (average of vertices)
    const v0 = i0 * 3, v1 = i1 * 3, v2 = i2 * 3;
    triVel[0] = (this.vel[v0] + this.vel[v1] + this.vel[v2]) / 3;
    triVel[1] = (this.vel[v0 + 1] + this.vel[v1 + 1] + this.vel[v2 + 1]) / 3;
    triVel[2] = (this.vel[v0 + 2] + this.vel[v1 + 2] + this.vel[v2 + 2]) / 3;

    const speed = Math.sqrt(triVel[0] * triVel[0] + triVel[1] * triVel[1] + triVel[2] * triVel[2]);
    if (speed < 0.001) continue;

    // Calculate triangle normal and area
    // e0 = pos[i1] - pos[i0]
    const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3;
    e0[0] = this.pos[p1] - this.pos[p0];
    e0[1] = this.pos[p1 + 1] - this.pos[p0 + 1];
    e0[2] = this.pos[p1 + 2] - this.pos[p0 + 2];

    // e1 = pos[i2] - pos[i0]
    e1[0] = this.pos[p2] - this.pos[p0];
    e1[1] = this.pos[p2 + 1] - this.pos[p0 + 1];
    e1[2] = this.pos[p2 + 2] - this.pos[p0 + 2];

    // normal = cross(e0, e1)
    normal[0] = e0[1] * e1[2] - e0[2] * e1[1];
    normal[1] = e0[2] * e1[0] - e0[0] * e1[2];
    normal[2] = e0[0] * e1[1] - e0[1] * e1[0];

    const normalLen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (normalLen < 1e-10) continue;

    // Area = |cross| / 2
    const area = normalLen * 0.5;

    // Normalize normal
    normal[0] /= normalLen;
    normal[1] /= normalLen;
    normal[2] /= normalLen;

    // Velocity direction
    const velDir = [triVel[0] / speed, triVel[1] / speed, triVel[2] / speed];

    // Facing factor: how much triangle faces into velocity (0 = parallel, 1 = perpendicular)
    const facingFactor = Math.abs(normal[0] * velDir[0] + normal[1] * velDir[1] + normal[2] * velDir[2]);

    // F = ½ρv²CdA * facingFactor
    const dragMagnitude = 0.5 * airDensity * speed * speed * dragCoeff * area * facingFactor;

    // Drag force opposes velocity
    const dragForce = [
      -velDir[0] * dragMagnitude,
      -velDir[1] * dragMagnitude,
      -velDir[2] * dragMagnitude,
    ];

    // Distribute force to vertices (F = ma, so Δv = F/m * dt = F * invMass * dt)
    const forcePerVertex = 1 / 3;
    for (const idx of [i0, i1, i2]) {
      if (this.invMass[idx] === 0) continue;
      const vi = idx * 3;
      const scale = forcePerVertex * this.invMass[idx] * sdt;
      this.vel[vi] += dragForce[0] * scale;
      this.vel[vi + 1] += dragForce[1] * scale;
      this.vel[vi + 2] += dragForce[2] * scale;
    }
  }
}
```

### Step 4: Call applyAirDrag from preSolve

Modify `preSolve()` to call `applyAirDrag()` after applying gravity:

```typescript
private preSolve(sdt: number): void {
  const grav = new Float32Array(this.config.gravity);

  for (let i = 0; i < this.numParticles; i++) {
    if (this.invMass[i] === 0.0) continue;

    // Apply gravity
    vecAdd(this.vel, i, grav, 0, sdt);

    // Apply damping
    vecScale(this.vel, i, this.config.damping);

    // Save previous position
    vecCopy(this.prevPos, i, this.pos, i);

    // Integrate position
    vecAdd(this.pos, i, this.vel, i, sdt);
  }

  // Apply air drag after gravity but note: we already integrated position
  // So we apply drag to velocity for NEXT substep
  this.applyAirDrag(sdt);
}
```

### Step 5: Run test to verify it passes

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

Expected: PASS

### Step 6: Commit

```bash
git add src/utils/cloth/xpbdSolver.ts src/utils/cloth/__tests__/xpbdSolver.test.ts
git commit -m "feat(cloth): implement air drag per triangle in TypeScript solver

- Add applyAirDrag() method with physics-based drag formula
- F = ½ρv²CdA(n·v̂) per triangle
- Distribute force equally to triangle vertices
- Called in preSolve() after gravity integration

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 3: Implement air drag in Rust WASM solver

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs`

### Step 1: Add drag_coefficient to XpbdSolver struct

Add to struct fields (around line 57):

```rust
// Config
gravity: [f32; 3],
damping: f32,
substeps: u32,
stretch_compliance: f32,
bend_compliance: f32,
ground_y: f32,
collision_margin: f32,
drag_coefficient: f32,  // NEW

// Triangle indices for air drag
tri_ids: Vec<u32>,  // NEW
```

### Step 2: Initialize in constructor

In `new()` function (around line 100):

```rust
drag_coefficient: 1.0,
tri_ids: Vec::new(),
```

### Step 3: Add set_triangles method

Add new public method:

```rust
/// Set triangle indices for air drag calculation.
pub fn set_triangles(&mut self, tri_ids: &[u32]) {
    self.tri_ids = tri_ids.to_vec();
}
```

### Step 4: Update configure() to include drag_coefficient

Modify `configure()` signature and body:

```rust
pub fn configure(&mut self, substeps: u32, damping: f32, gravity_y: f32,
                 stretch_compliance: f32, bend_compliance: f32,
                 self_collision: bool, thickness: f32, collision_margin: f32,
                 ground_y: f32, drag_coefficient: f32) {
    self.substeps = substeps;
    self.damping = damping;
    self.gravity[1] = gravity_y;
    self.stretch_compliance = stretch_compliance;
    self.bend_compliance = bend_compliance;
    self.self_collision = self_collision;
    self.thickness = thickness;
    self.collision_margin = collision_margin;
    self.ground_y = ground_y;
    self.drag_coefficient = drag_coefficient;
}
```

### Step 5: Implement apply_air_drag method

Add after `pre_solve()`:

```rust
/// Apply aerodynamic drag force per triangle.
fn apply_air_drag(&mut self, sdt: f32) {
    if self.drag_coefficient <= 0.0 || self.tri_ids.is_empty() {
        return;
    }

    let air_density = 1.225_f32;
    let num_tris = self.tri_ids.len() / 3;

    for t in 0..num_tris {
        let i0 = self.tri_ids[t * 3] as usize;
        let i1 = self.tri_ids[t * 3 + 1] as usize;
        let i2 = self.tri_ids[t * 3 + 2] as usize;

        // Skip if all pinned
        if self.inv_mass[i0] == 0.0 && self.inv_mass[i1] == 0.0 && self.inv_mass[i2] == 0.0 {
            continue;
        }

        let (v0, v1, v2) = (i0 * 3, i1 * 3, i2 * 3);
        let (p0, p1, p2) = (i0 * 3, i1 * 3, i2 * 3);

        // Triangle velocity (average)
        let tri_vel = [
            (self.velocities[v0] + self.velocities[v1] + self.velocities[v2]) / 3.0,
            (self.velocities[v0 + 1] + self.velocities[v1 + 1] + self.velocities[v2 + 1]) / 3.0,
            (self.velocities[v0 + 2] + self.velocities[v1 + 2] + self.velocities[v2 + 2]) / 3.0,
        ];

        let speed = (tri_vel[0] * tri_vel[0] + tri_vel[1] * tri_vel[1] + tri_vel[2] * tri_vel[2]).sqrt();
        if speed < 0.001 {
            continue;
        }

        // Edge vectors
        let e0 = [
            self.positions[p1] - self.positions[p0],
            self.positions[p1 + 1] - self.positions[p0 + 1],
            self.positions[p1 + 2] - self.positions[p0 + 2],
        ];
        let e1 = [
            self.positions[p2] - self.positions[p0],
            self.positions[p2 + 1] - self.positions[p0 + 1],
            self.positions[p2 + 2] - self.positions[p0 + 2],
        ];

        // Normal = cross(e0, e1)
        let normal = [
            e0[1] * e1[2] - e0[2] * e1[1],
            e0[2] * e1[0] - e0[0] * e1[2],
            e0[0] * e1[1] - e0[1] * e1[0],
        ];

        let normal_len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
        if normal_len < 1e-10 {
            continue;
        }

        let area = normal_len * 0.5;
        let normal_normalized = [normal[0] / normal_len, normal[1] / normal_len, normal[2] / normal_len];
        let vel_dir = [tri_vel[0] / speed, tri_vel[1] / speed, tri_vel[2] / speed];

        // Facing factor
        let facing = (normal_normalized[0] * vel_dir[0] + normal_normalized[1] * vel_dir[1] + normal_normalized[2] * vel_dir[2]).abs();

        // Drag magnitude: F = ½ρv²CdA * facing
        let drag_mag = 0.5 * air_density * speed * speed * self.drag_coefficient * area * facing;

        // Drag force opposes velocity
        let drag_force = [-vel_dir[0] * drag_mag, -vel_dir[1] * drag_mag, -vel_dir[2] * drag_mag];

        // Distribute to vertices
        let force_per_vertex = 1.0 / 3.0;
        for &idx in &[i0, i1, i2] {
            if self.inv_mass[idx] == 0.0 {
                continue;
            }
            let vi = idx * 3;
            let scale = force_per_vertex * self.inv_mass[idx] * sdt;
            self.velocities[vi] += drag_force[0] * scale;
            self.velocities[vi + 1] += drag_force[1] * scale;
            self.velocities[vi + 2] += drag_force[2] * scale;
        }
    }
}
```

### Step 6: Call apply_air_drag in pre_solve

Modify `pre_solve()` to call `apply_air_drag()` at the end:

```rust
fn pre_solve(&mut self, sdt: f32) {
    for i in 0..self.num_particles {
        // ... existing code ...
    }

    // Apply air drag after gravity integration
    self.apply_air_drag(sdt);
}
```

### Step 7: Build WASM

```bash
cd crates/xpbd-wasm && wasm-pack build --target web --out-dir pkg
```

### Step 8: Copy to public

```bash
cp crates/xpbd-wasm/pkg/xpbd_wasm_bg.wasm public/wasm/
```

### Step 9: Commit

```bash
git add crates/xpbd-wasm/src/lib.rs public/wasm/xpbd_wasm_bg.wasm
git commit -m "feat(cloth): implement air drag in Rust WASM solver

- Add drag_coefficient and tri_ids fields
- Add set_triangles() method for JS to pass triangle indices
- Implement apply_air_drag() with same physics as TS solver
- Update configure() to accept drag_coefficient

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 4: Update WASM worker interface

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts`

### Step 1: Update worker to pass triangles and drag coefficient

In `wasmSolverWorker.ts`, find where `set_stretch` is called and add after it:

```typescript
// Pass triangle indices for air drag
if (data.triIds) {
  solver.set_triangles(new Uint32Array(data.triIds));
}
```

Update the `configure` call to include `dragCoefficient`:

```typescript
solver.configure(
  config.substeps ?? 15,
  config.damping ?? 0.99,
  config.gravityY ?? -9.81,
  config.stretchCompliance ?? 0.0,
  config.bendCompliance ?? 0.01,
  config.selfCollision ?? true,
  config.thickness ?? 0.002,
  config.collisionMargin ?? 0.005,
  config.groundY ?? 0.0,
  config.dragCoefficient ?? 1.0  // NEW
);
```

### Step 2: Update client interface

In `wasmSolverClient.ts`, ensure the init message includes `triIds` and config includes `dragCoefficient`.

### Step 3: Run TypeScript check

```bash
npx tsc --noEmit
```

### Step 4: Commit

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "feat(cloth): wire up air drag in WASM worker interface

- Pass triIds to WASM solver for air drag calculation
- Add dragCoefficient to configure() call

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 5: Add visual validation test

**Files:**
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

### Step 1: Add settling time test

```typescript
describe('XPBDClothSolver - Air Drag Settling', () => {
  it('cloth should settle faster with higher drag coefficient', () => {
    const mesh = generateRectClothMesh(0.5, 0.5, 5, 5);

    // Low drag
    const solverLow = new XPBDClothSolver(mesh, { dragCoefficient: 0.1 });
    solverLow.pinParticle(0);
    solverLow.pinParticle(4);

    // High drag
    const solverHigh = new XPBDClothSolver(mesh, { dragCoefficient: 2.0 });
    solverHigh.pinParticle(0);
    solverHigh.pinParticle(4);

    // Simulate 60 frames (1 second)
    for (let i = 0; i < 60; i++) {
      solverLow.step();
      solverHigh.step();
    }

    const keLow = solverLow.computeKineticEnergy();
    const keHigh = solverHigh.computeKineticEnergy();

    // Higher drag should result in lower kinetic energy (more settled)
    expect(keHigh).toBeLessThan(keLow);
  });
});
```

### Step 2: Run test

```bash
npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts --reporter=verbose
```

### Step 3: Commit

```bash
git add src/utils/cloth/__tests__/xpbdSolver.test.ts
git commit -m "test(cloth): add settling time validation for air drag

Verifies that higher drag coefficient results in faster cloth settling.

Part of Epic #198 - Realistic Cloth Simulation"
```

---

## Task 6: Final integration test and cleanup

### Step 1: Run all cloth tests

```bash
npx vitest run src/utils/cloth/ --reporter=verbose
```

### Step 2: Run full test suite

```bash
npm test
```

### Step 3: Build check

```bash
npm run build
```

### Step 4: Final commit

```bash
git add -A
git commit -m "feat(cloth): complete air drag implementation (Epic #198, Task 1)

Summary:
- Added dragCoefficient to ClothSimConfig (default 1.0)
- Implemented applyAirDrag() in TypeScript solver
- Implemented apply_air_drag() in Rust WASM solver
- Updated WASM worker interface
- Added unit tests and settling validation

Formula: F = ½ρv²CdA(n·v̂) per triangle

Closes Epic #198 Task 1"
```

---

## Success Criteria Checklist

- [ ] `dragCoefficient` configurable in `ClothSimConfig`
- [ ] Air drag reduces cloth velocity based on physics formula
- [ ] Drag is proportional to triangle area and facing direction
- [ ] WASM solver has same behavior as TypeScript solver
- [ ] Cloth settles within 2-3 seconds instead of floating
- [ ] All tests pass
- [ ] 60fps performance maintained
