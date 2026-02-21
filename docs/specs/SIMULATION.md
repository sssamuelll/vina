# OpenClo — Cloth Simulation Spec

## Overview

Real-time cloth simulation is the core differentiator. A pattern maker draws in 2D, and the garment drapes on an avatar in 3D — automatically, with physical accuracy.

**Charter objective:** "Sistema de simulación física en tiempo real para drapeado y colisiones."

## Physics Model ✅ COMPLETE (XPBD Implementation)

### XPBD (Extended Position Based Dynamics)

**DECISION:** We implemented **XPBD** instead of mass-spring for better stability and constraint handling.

**XPBD Advantages:**
- More stable than mass-spring systems
- Better constraint satisfaction (distance, collision, seam constraints)
- Handles stiff materials without explosion
- Position-based → naturally damped

**Current Implementation (v0.5):**
- 10 fabric presets with XPBD compliance parameters
- Web Worker physics at 60fps
- Distance constraints for stretch/shear resistance
- Gravity simulation (pieces fall naturally)

**Missing (v0.6 gap):** Seam constraints, collision detection, garment placement

### XPBD Parameters (per fabric)

| Fabric | Stretch Compliance | Shear Compliance | Bend Compliance | Mass (g/m²) |
|--------|-------------------|------------------|------------------|-------------|
| Cotton (woven) | 0.001 | 0.005 | 0.02 | 150 |
| Silk (light) | 0.002 | 0.01 | 0.1 | 50 |
| Denim | 0.0008 | 0.0025 | 0.005 | 350 |
| Jersey (knit) | 0.003 | 0.012 | 0.05 | 180 |
| Leather | 0.0005 | 0.0016 | 0.002 | 800 |
| Chiffon | 0.005 | 0.02 | 0.2 | 30 |

**Timestep:** Fixed 1/60s (16.67ms). XPBD handles larger timesteps better than Verlet integration.

### Constraint Solving

After integration, iteratively solve constraints (Jakobsen method):

1. **Distance constraints** (springs) — maintain rest lengths
2. **Seam constraints** — sewn vertices share position
3. **Collision constraints** — vertices outside avatar surface
4. **Pin constraints** — fixed vertices (shoulders, waistband)

**Iterations per frame:** 8-16 (more = stiffer, less stretchy). Configurable per quality setting.

---

## Collision Detection 🔨 NEXT (v0.6)

### Avatar Collision

The avatar is a **static collider** (doesn't move during simulation).

**Approach:** Signed Distance Field (SDF)
- Pre-compute SDF from avatar mesh (3D grid of distances to surface)
- Each cloth vertex: if inside avatar → push to nearest surface point
- SDF resolution: 64³/128³ grid (balance memory vs accuracy)
- Computed once when avatar changes, cached

**Implementation Strategy:**
1. Generate SDF in compute shader (WebGPU) or Web Worker 
2. Store as 3D texture for GPU lookup or typed array for CPU
3. Trilinear interpolation for smooth distance queries

### Self-Collision 🔨 NEXT (v0.6)

Cloth-on-cloth collision (folds, layers). Expensive but necessary for realism.

**Approach:** Spatial hashing (following Müller papers #11/#15)
- Divide space into grid cells (cell size = 2× cloth thickness)
- Only check vertex-triangle pairs in same/adjacent cells
- O(n) average vs O(n²) brute force

**Performance toggle:** Can be disabled for complex garments (UI setting).

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

### Web Worker Architecture ✅ COMPLETE

**Current implementation (v0.5):** XPBD physics runs in Web Worker at 60fps.

```
Main Thread                    Worker Thread
─────────────                  ─────────────
User input, Three.js render    Physics simulation (XPBD)
    │                              │
    ├── SharedArrayBuffer ────────►│ (vertex positions)
    │   (positions, forces)        │
    │                              ├── XPBD Integration
    │                              ├── Distance Constraints
    │                              ├── Gravity Forces
    │◄── Atomics.notify ──────────┤ (frame done)
    │                              │
    ├── Update BufferGeometry      │
    └── Render                     │
```

**Deployment:** Requires `Cross-Origin-Isolation` headers (COOP + COEP) — already configured on openclo.sdar.dev.

---

## Initial Garment Placement 🔨 NEXT (v0.6)

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
