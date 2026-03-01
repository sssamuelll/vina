# OpenClo.ai — Cloth Simulation Spec (v0.5)

## Overview

Real-time, physically accurate cloth simulation is the technical core of OpenClo.ai. By using **Deterministic XPBD Physics**, we bridge the gap between 2D pattern engineering and 3D virtual fitting.

## Physics Model ✅ COMPLETE (v0.5)

### Extended Position Based Dynamics (XPBD)

OpenClo.ai implements an **XPBD solver** in **Rust (WASM)** for maximum performance. Unlike traditional mass-spring models, XPBD is unconditionally stable and handles constraints (seams, collisions) with industrial precision.

**Implementation Details:**
- **Wasm Acceleration**: 60fps draping on mobile and desktop.
- **Off-Thread Simulation**: Runs in a dedicated Web Worker to maintain UI responsiveness.
- **Physical Fabric Library**: 10 presets (Denim, Silk, etc.) with real-world compliance parameters.

### Constraint Hierarchy
1. **Distance Constraints**: Maintain the integrity of the pattern.
2. **Bending Constraints**: Model fabric stiffness and drape.
3. **Seam Constraints**: Dynamic distance constraints that "pull" pieces together during assembly.
4. **Collision Constraints**: Resolved via SDF (Signed Distance Fields).

---

## Meshing & Assembly ✅ COMPLETE (v0.5)

### Professional Triangulation
- **CDT (Constrained Delaunay Triangulation)**: Using `cdt2d` to ensure uniform particle density.
- **Adaptive Subdivision**: Piece boundaries are split every 15mm to ensure simulation stability.

### Virtual Seam Assembly
- **Arc-Length Parameterization**: Edges are matched in a 0-1 space.
- **Shrink-Phase**: Seam rest-lengths start at the 3D distance and shrink to zero over the first 30 frames, creating a realistic "sewing" animation.

---

## Initial Garment Placement ✅ COMPLETE (v0.5)

OpenClo.ai uses a **Semantic-Aware Placement** system to automatically position pieces around the avatar.

1. **Classification**: Pieces are identified by `category` and `side` (Bodice Front, Sleeve Left, etc.).
2. **Tangent Plane Mapping**: Pieces are placed as flat planes tangent to the avatar surface at the correct body region (e.g., center-front for bodice).
3. **Parametric Offsets**: Positioning is dynamically calculated based on the avatar's body measurements (Chest Radius, Hip Height, etc.).
4. **Collision Inflation**: A standard 3cm "inflation gap" prevents initial interpenetration with the body.

---

## Collision Detection ✅ COMPLETE (v0.5)

### Avatar Collision
- **SDF Lookup**: The avatar is pre-computed as a 64³ Signed Distance Field in a Web Worker.
- **Fast Projection**: Vertices inside the body are projected to the surface in a single step using SDF normals.

### Self-Collision
- **Spatial Hashing**: A grid-based spatial hash allows for $O(n)$ self-collision detection between garment layers.
- **Thickness Preservation**: Fabric thickness is maintained during folds and layering.

---

## Performance Budget (60fps Target)

| Operation | Implementation | Budget |
|-----------|----------------|--------|
| **Force Integration** | Rust/Wasm | < 0.5ms |
| **Constraint Loop** | Rust/Wasm | < 8.0ms |
| **SDF Collision** | Wasm + Web Worker | < 2.0ms |
| **Self-Collision** | Spatial Hash (Wasm) | < 3.0ms |
| **Mesh Geometry Update**| TypedArrays | < 1.0ms |
| **Total Frame Time** | — | **< 14.5ms** |

---

## Future Enhancements

### Compute-Shader Simulation
- Migration to **WebGPU** for 100x vertex density (future).

### Advanced Material Modeling
- Support for non-linear stretch and shear (v0.7).
