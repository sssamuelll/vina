# OpenClo — Cloth Simulation Spec

## Overview

Real-time cloth simulation is the core differentiator. A pattern maker draws in 2D, and the garment drapes on an avatar in 3D — automatically, with physical accuracy.

**Charter objective:** "Sistema de simulación física en tiempo real para drapeado y colisiones."

## Physics Model

### Mass-Spring System

The simplest viable approach for real-time browser simulation:

```
Each mesh vertex = point mass
Connected by springs:
├── Structural springs — along mesh edges (resist stretching)
├── Shear springs — along diagonals (resist shearing)
└── Bend springs — skip-one connections (resist bending)
```

### Spring Parameters (per fabric)

| Fabric | Structural K | Shear K | Bend K | Mass (g/m²) | Damping |
|--------|-------------|---------|--------|-------------|---------|
| Cotton (woven) | 800 | 200 | 50 | 150 | 0.98 |
| Silk (light) | 400 | 100 | 10 | 50 | 0.99 |
| Denim | 1200 | 400 | 200 | 350 | 0.97 |
| Jersey (knit) | 300 | 80 | 20 | 180 | 0.98 |
| Leather | 2000 | 600 | 500 | 800 | 0.95 |
| Chiffon | 200 | 50 | 5 | 30 | 0.99 |

These map from the `Fabric` type's `weight`, `stretch`, `stiffness` properties.

### Integration Method

**Verlet integration** — position-based, inherently stable, no explicit velocity:

```
newPos = pos + (pos - prevPos) * damping + acceleration * dt²
```

Advantages over Euler: no velocity explosion, naturally damped, handles constraints well.

**Timestep:** Fixed 1/120s (sub-step if frame budget allows). Variable timestep causes instability.

### Constraint Solving

After integration, iteratively solve constraints (Jakobsen method):

1. **Distance constraints** (springs) — maintain rest lengths
2. **Seam constraints** — sewn vertices share position
3. **Collision constraints** — vertices outside avatar surface
4. **Pin constraints** — fixed vertices (shoulders, waistband)

**Iterations per frame:** 8-16 (more = stiffer, less stretchy). Configurable per quality setting.

---

## Collision Detection

### Avatar Collision

The avatar is a **static collider** (doesn't move during simulation).

**Approach:** Signed Distance Field (SDF)
- Pre-compute SDF from avatar mesh (3D grid of distances to surface)
- Each cloth vertex: if inside avatar → push to nearest surface point
- SDF resolution: 128³ grid (~2MB) — computed once when avatar changes

**Alternative (simpler, v0.7 MVP):** Raycast from vertex toward avatar center. If intersection count is odd → inside → push out along surface normal.

### Self-Collision

Cloth-on-cloth collision (folds, layers). Expensive but necessary for realism.

**Approach:** Spatial hashing
- Divide space into grid cells (cell size = 2× cloth thickness)
- Only check vertex-triangle pairs in same/adjacent cells
- O(n) average vs O(n²) brute force

**Can be disabled** for performance (toggle in UI).

---

## Simulation Loop

```
每 frame (requestAnimationFrame):
    1. Apply gravity + wind forces to all vertices
    2. Verlet integration (update positions)
    3. Constraint solving loop (8-16 iterations):
        a. Distance constraints (springs)
        b. Seam constraints
        c. Pin constraints
        d. Avatar collision
        e. (Optional) Self-collision
    4. Update Three.js mesh geometry (BufferGeometry)
    5. Update normals for lighting
```

### Performance Budget

| Operation | Target Time | Strategy |
|-----------|-------------|----------|
| Force accumulation | < 1ms | Simple gravity + optional wind |
| Verlet integration | < 1ms | Typed arrays, no allocations |
| Constraint solving (8 iter) | < 8ms | Web Worker, shared buffers |
| Collision detection | < 3ms | SDF lookup (GPU) or spatial hash (CPU) |
| Mesh update | < 1ms | Direct BufferGeometry write |
| **Total per frame** | **< 14ms** | **60fps budget = 16.6ms** |

### Web Worker Architecture

```
Main Thread                    Worker Thread
─────────────                  ─────────────
User input, Three.js render    Physics simulation
    │                              │
    ├── SharedArrayBuffer ────────►│ (vertex positions)
    │   (positions, forces)        │
    │                              ├── Integration
    │                              ├── Constraints
    │                              ├── Collision
    │◄── Atomics.notify ──────────┤ (frame done)
    │                              │
    ├── Update BufferGeometry      │
    └── Render                     │
```

SharedArrayBuffer allows zero-copy data sharing between threads. Requires `Cross-Origin-Isolation` headers (COOP + COEP).

---

## Initial Garment Placement

Before simulation starts, pieces need initial 3D positions around the avatar:

1. **Cylindrical mapping** — wrap pieces around avatar at approximate body position
   - Bodice → chest cylinder
   - Sleeve → arm cylinder
   - Skirt → hip-to-knee cylinder
2. **Inflate** — push pieces slightly away from avatar surface (2-5cm offset)
3. **Pin shoulders/waistband** — fix key vertices to prevent garment falling off
4. **Simulate settle** — run 200-500 frames to let garment drape naturally

### Pin Points (automatic detection)

| Garment Area | Pin Location | Detection |
|--------------|-------------|-----------|
| Top (bodice/shirt) | Shoulder seam vertices | Highest vertices after cylindrical mapping |
| Bottom (skirt/pants) | Waistband top edge | Vertices on waist-height ring |
| Sleeve | Cap attachment vertices | Vertices nearest armhole seam |

---

## Future Enhancements (post v0.7)

### GPU Simulation (WebGPU)
- Move entire simulation to compute shaders
- 10-100x performance improvement
- Enables complex garments (coats, layered outfits)
- Requires WebGPU browser support (Chrome 113+, Firefox nightly)

### Wind and Animation
- Directional wind force with turbulence noise
- Avatar pose animation (walking, sitting) → garment follows
- Timeline-based animation for fashion shows / renders

### Fabric Drape Prediction
- AI model trained on fabric swatches → predict spring parameters from photo
- Camera → swatch photo → auto-configure fabric properties
