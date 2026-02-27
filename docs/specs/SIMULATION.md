# OpenClo — Cloth Simulation Spec

## Overview

Real-time cloth simulation is the core differentiator. A pattern maker draws in 2D, and the garment drapes on an avatar in 3D — automatically, with physical accuracy.

**Charter objective:** "Sistema de simulación física en tiempo real para drapeado y colisiones."

## Physics Model ✅ COMPLETE (XPBD Implementation)

### XPBD (Extended Position Based Dynamics)

**DECISION:** We implemented **XPBD** instead of mass-spring for better stability and constraint handling.

**Current Implementation (v0.6 progress):**
- 10 fabric presets with XPBD compliance parameters
- Wasm-accelerated XPBD solver (Rust) for 3x performance boost
- Web Worker multi-threaded execution
- **Seam Assembly System**: Vertex-to-vertex distance constraints for joining pieces
- **Robust Meshing**: CDT-based triangulation with edge subdivision
- Gravity simulation + Avatar collision

**Missing (v0.6 gap):** Garment placement, self-collision

### Constraint Solving

After integration, iteratively solve constraints (Jakobsen method):

1. **Distance constraints** (springs) — maintain rest lengths
2. **Seam constraints** — sewn vertices share position (dynamic rest length)
3. **Collision constraints** — vertices outside avatar surface (SDF lookup)
4. **Pin constraints** — fixed vertices (shoulders, waistband)

**Iterations per frame:** 15 (default). Configurable per quality setting.

---

## Meshing Pipeline ✅ COMPLETE (v0.6)

High-quality triangles are essential for stable simulation. We replaced simple ear-clipping with a professional **Constrained Delaunay Triangulation (CDT)** pipeline.

### Implementation Strategy: "Subdivide & Fill"
1. **Edge Parameterization**: 2D pattern outlines are flattened into points.
2. **Subdivision**: Any edge segment longer than `maxEdgeLength` (default 15mm) is split into multiple segments. This ensures uniform particle density on the boundaries.
3. **PSLG Cleaning**: `clean-pslg` resolves self-intersections and T-junctions in the pattern geometry.
4. **Grid-based Interior Fill**: A regular grid of interior points is generated inside the polygon.
5. **CDT Triangulation**: `cdt2d` creates the final mesh constrained by the subdivided boundary and internal lines (darts).

**Benefit:** Guarantees minimum triangle angles > 20° and consistent particle distribution, preventing "mesh locking" or simulation explosions.

---

## Seam Assembly System ✅ COMPLETE (v0.6)

Connections between pieces are modeled as **dynamic distance constraints** in the XPBD solver.

### The Sewing Process
1. **Arc-Length Mapping**: Seam edges are mapped to a 0–1 parameter space.
2. **Vertex Matching**: Boundary vertices on Piece A are paired with the closest vertices on Piece B using their normalized parameter (t).
3. **Rest Length Shrinking**: At the start of simulation, seam constraints have a rest length equal to the 3D distance between pieces. This rest length is gradually shrunk to zero over several frames, creating a smooth "sewing" effect.
4. **Compliance**: Seam stiffness is controlled by the `seamType` (e.g., standard, french), allowing for realistic joint behavior.

---

## Collision Detection 🔨 IN PROGRESS (v0.6)

### Avatar Collision ✅ COMPLETE

The avatar is a **static collider** represented by a Signed Distance Field (SDF).

**Implementation (v0.6):**
- **SDF Generation**: 32³/64³ grid computed in a Web Worker using a highly optimized **Spatial Hash** structure.
- **M2/Safari Fix**: Robust 32-bit bitwise hashing prevents collision-induced brute force fallbacks on ARM browsers.
- **Response**: Each frame, vertices inside the avatar (SDF < 0) are projected to the surface using the pre-computed surface normals.

### Self-Collision 🔨 NEXT (v0.6)

Cloth-on-cloth collision (folds, layers).

**Approach:** Spatial hashing (following Müller papers #11/#15)
- Divide space into grid cells (cell size = 2× cloth thickness)
- Only check vertex-triangle pairs in same/adjacent cells
- O(n) average vs O(n²) brute force

---

## Simulation Loop

```
每 frame (requestAnimationFrame):
    1. Apply gravity + wind forces to all vertices
    2. Verlet integration (update positions)
    3. Constraint solving loop (15 iterations):
        a. Distance constraints (springs)
        b. Seam constraints (shrink rest lengths)
        c. Pin constraints
        d. Avatar collision (SDF lookup)
        e. (Optional) Self-collision
    4. Update Three.js mesh geometry (BufferGeometry)
    5. Update normals for lighting
```

### Performance Budget

| Operation | Target Time | Strategy |
|-----------|-------------|----------|
| Force accumulation | < 1ms | Simple gravity |
| Verlet integration | < 1ms | Typed arrays in Wasm |
| Constraint solving (15 iter) | < 10ms | Rust/Wasm solver in Worker |
| Collision detection | < 3ms | SDF lookup |
| Mesh update | < 1ms | Direct BufferGeometry write |
| **Total per frame** | **< 15ms** | **60fps budget = 16.6ms** |

---

## Initial Garment Placement 🔨 NEXT (v0.6)

Before simulation starts, pieces need initial 3D positions around the avatar:

1. **Cylindrical mapping** — wrap pieces around avatar (bodice, sleeve, skirt)
2. **Inflate** — push pieces slightly away from avatar surface (2-5cm offset)
3. **Pin shoulders/waistband** — fix key vertices to prevent garment falling off
4. **Simulate settle** — run 200-500 frames to let garment drape naturally

---

## Future Enhancements (post v0.7)

### GPU Simulation (WebGPU)
- Move entire simulation to compute shaders (10-100x performance)

### Wind and Animation
- Directional wind force + Avatar pose animation

### Fabric Drape Prediction
- AI model predicting spring parameters from fabric swatch photo
