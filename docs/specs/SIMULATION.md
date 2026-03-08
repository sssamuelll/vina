# OpenClo.ai — Cloth Simulation Spec (v0.7)

## Overview

Real-time, physically accurate cloth simulation is the technical core of OpenClo.ai. By using **Deterministic XPBD Physics**, we bridge the gap between 2D pattern engineering and 3D virtual fitting.

## Physics Model

### Extended Position Based Dynamics (XPBD)

OpenClo.ai implements an **XPBD solver** in **Rust (WASM)** for maximum performance. Unlike traditional mass-spring models, XPBD is unconditionally stable and handles constraints (seams, collisions) with industrial precision.

**Implementation Details:**
- **Wasm Acceleration**: 60fps draping on mobile and desktop.
- **Off-Thread Simulation**: Runs in a dedicated Web Worker to maintain UI responsiveness.
- **Physical Fabric Library**: 32+ presets (Denim, Silk, Jersey, Organza, Neoprene, etc.) with real-world compliance parameters.
- **Edge Types**: 0 = WARP (along grain), 1 = WEFT (across grain), 2 = SHEAR (diagonal).

### Constraint Hierarchy
1. **Distance Constraints**: Maintain the integrity of the pattern (warp, weft, shear compliance).
2. **Bending Constraints**: Model fabric stiffness and drape (warp and weft bending).
3. **Seam Constraints**: Dynamic distance constraints that "pull" pieces together during assembly.
4. **Collision Constraints**: Resolved via triangle mesh collision with per-body spatial hashing.

### Solver Parameters (ClothSimConfig)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `substeps` | number | 15 | XPBD solver iterations per frame |
| `damping` | number | 0.99 | Global velocity damping |
| `gravityY` | number | -9.81 | Gravity acceleration |
| `dragCoefficient` | number | 1.0 | Air resistance (0-2) |
| `stretchComplianceWarp` | number | 0.0 | Stretch along grain (0 = stiff) |
| `stretchComplianceWeft` | number | 0.0 | Stretch across grain |
| `stretchComplianceShear` | number | 0.001 | Diagonal stretch |
| `bendComplianceWarp` | number | 1.0 | Bend along grain |
| `bendComplianceWeft` | number | 1.0 | Bend across grain |
| `internalDamping` | number | 0.3 | Per-fabric damping (0 = fluid, 1 = heavy) |
| `selfCollision` | boolean | false | Enable self-collision |
| `thickness` | number | 0.002 | Cloth thickness (meters) |

---

## Meshing & Assembly

### Professional Triangulation
- **CDT (Constrained Delaunay Triangulation)**: Using `cdt2d` to ensure uniform particle density.
- **Adaptive Subdivision**: Piece boundaries are split every 15mm to ensure simulation stability.

### Virtual Seam Assembly
- **Arc-Length Parameterization**: Edges are matched in a 0-1 space.
- **Edge-Name References**: Seams use stable `pieceId:edgeName` identifiers (migrated from index-based in v0.7).
- **Shrink-Phase**: Seam rest-lengths start at the 3D distance and shrink to zero over the first 30 frames, creating a realistic "sewing" animation.

---

## Initial Garment Placement

OpenClo.ai uses a **Semantic-Aware Placement** system to automatically position pieces around the avatar.

1. **Classification**: Pieces are identified by `category` and `side` (Bodice Front, Sleeve Left, etc.).
2. **Tangent Plane Mapping**: Pieces are placed as flat planes tangent to the avatar surface at the correct body region.
3. **Parametric Offsets**: Positioning is dynamically calculated based on the avatar's body measurements.
4. **Collision Inflation**: A standard 3cm "inflation gap" prevents initial interpenetration with the body.

---

## Collision Detection

### Avatar Collision
- **Triangle Mesh Collision**: The avatar mesh is extracted to flat `CollisionMeshData` (vertices + normals + triCount) and sent to the worker.
- **TriangleSpatialHash**: 3x3x3 cell spatial hash for O(1) nearest-triangle queries per particle.
- **Point-to-Triangle Distance**: Barycentric projection with edge-distance fallback for robust collision resolution.

### Universal Collision Bodies (v0.6+)
- **Multi-Body Array**: Any imported mesh (furniture, mannequins, props) can act as a collision body alongside the avatar.
- **Per-Body Properties**: Each body has independent `friction` (0-1) and `offset`/margin (meters).
- **Transform Gizmo**: `@react-three/drei` TransformControls for live translate/rotate/scale.
- **Animation Playback**: GLB/FBX with embedded clips play via `THREE.AnimationMixer`; posed vertices re-extracted and sent to worker.
- **Redux State**: `collisionBodySlice` manages CRUD, selection, transform, and animation state.
- **Worker Protocol**: `setCollisionBodies`, `updateCollisionBody`, `removeCollisionBody` messages on both WASM and CPU workers.
- **Avatar as `__avatar__`**: The avatar collision mesh is entry `__avatar__` in the body array, preserving backward compatibility.

### Self-Collision
- **Spatial Hashing**: A grid-based spatial hash allows for O(n) self-collision detection between garment layers.
- **Thickness Preservation**: Fabric thickness is maintained during folds and layering.

### BVH Collision (Planned)
- **three-mesh-bvh**: Dependency added (^0.9.9), design document complete.
- **Goal**: Replace `TriangleSpatialHash` with BVH for faster broad-phase collision on complex meshes.

---

## Simulation Snapshots (v0.7)

Users can capture and compare draping states:
- **3 Manual Slots**: A, B, C for side-by-side comparison.
- **Auto-Save**: Automatic snapshot on significant state changes.
- **Redux Integration**: `addSnapshot()`, `removeSnapshot()`, `setActiveSnapshot()` actions.
- **UI**: `SnapshotBar.tsx` component with visual comparison.

---

## Performance Budget (60fps Target)

| Operation | Implementation | Budget |
|-----------|----------------|--------|
| **Force Integration** | Rust/Wasm | < 0.5ms |
| **Constraint Loop** | Rust/Wasm | < 8.0ms |
| **Triangle Collision** | JS (per-body spatial hash) | < 2.0ms |
| **Self-Collision** | Spatial Hash (Wasm) | < 3.0ms |
| **Mesh Geometry Update**| TypedArrays | < 1.0ms |
| **Total Frame Time** | | **< 14.5ms** |

---

## Future Enhancements

- **BVH Collision**: Accelerated broad-phase collision detection.
- **Live Link 2D-3D**: Warm-start re-simulation on 2D edits (edit classifier implemented).
- **WebGPU Simulation**: Compute-shader physics for 100x vertex density.
- **Non-Linear Materials**: High-fidelity simulation for leather and hardware.
- **Garment-to-Garment Collision**: Multi-layer clothing support.
