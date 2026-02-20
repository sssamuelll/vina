# OpenClo — Core Engine Spec

## Overview

The core engine is the middleware between 2D pattern definition and 3D visualization/simulation. It handles:

1. **Pattern Interpretation** — parse parametric pattern definitions into geometry
2. **Meshing** — convert 2D vector outlines into 3D-ready triangle meshes
3. **Assembly** — define and execute virtual seam connections
4. **Parametric Updates** — propagate measurement changes through the entire pipeline in near-real-time

## 1. Pattern Representation

### Internal Model

```
PatternPiece
├── outline: PathCommand[]       — Bezier path (M/L/C/Q/Z)
├── internals: InternalLine[]    — darts, grainlines, notches, folds, pleats, drills
├── seamAllowance: number        — mm offset from sew line
├── position/rotation/mirrored   — placement on 2D workspace
├── fabricId: string             — assigned fabric
└── grading?: GradingRule[]      — size scaling rules (v0.8)
```

### Parametric System

Pattern pieces can be defined by **measurements** rather than absolute coordinates:

```typescript
interface ParametricDefinition {
  type: 'bodice' | 'sleeve' | 'skirt' | 'pants' | 'collar' | 'custom';
  measurements: Record<string, number>;  // e.g. { chest: 92, waist: 76, hipToKnee: 58 }
  ease: Record<string, number>;          // wearing ease per measurement
  generator: (m: Measurements) => PatternPiece[];
}
```

When a measurement changes, the generator re-runs and produces updated PathCommands. This is the **non-destructive parametric flow** from the charter — edit a number, see the change everywhere.

### Current Generators (v0.4)

| Template | Key Measurements | Output |
|----------|-----------------|--------|
| Bodice (front/back) | chest, waist, shoulder, neckToWaist, shoulderSlope | 2 pieces + darts |
| Sleeve | armhole, sleeveLength, wristCirc, capHeight | 1 piece |
| Skirt | waist, hips, skirtLength, waistToHip | 1-2 pieces (A-line/pencil) |
| Pants | waist, hips, inseam, thigh, knee, hem | 2 pieces (front/back) |
| Collar | neckCirc, collarWidth, collarStyle | 1 piece |

### Future: Custom Parametric Definitions

Users should be able to define their own parametric relationships:
- "This dart depth = chest / 12"
- "Side seam length = hipToKnee + 3cm ease"
- Visual constraint editor (like Grasshopper for Rhino, but for garments)

---

## 2. Meshing Pipeline (2D → 3D)

### Problem

Pattern pieces are 2D Bezier paths. Cloth simulation needs 3D triangle meshes. The conversion must:
- Preserve outline accuracy (curves → sufficient triangle density)
- Handle complex topologies (armholes, necklines, darts)
- Be fast enough for near-real-time updates

### Pipeline

```
PathCommand[] (Bezier)
    ↓ tessellate
Polygon (point array)
    ↓ triangulate (earcut / constrained Delaunay)
Triangle Mesh (vertices + faces)
    ↓ refine
Simulation-Ready Mesh (uniform density, quality triangles)
    ↓ position
3D Mesh on Avatar (UV mapping, initial placement)
```

### Implementation Notes

**Tessellation:** Convert Bezier curves to point arrays. Adaptive resolution — more points on tight curves, fewer on straight edges. Current: 12 segments per cubic Bezier (fixed). Target: adaptive based on curvature.

**Triangulation:** Use `earcut` (robust, handles holes) or constrained Delaunay triangulation for better quality. Earcut is already available as npm package and used by Three.js internally.

**Refinement:** After initial triangulation, subdivide long/thin triangles. Target: no triangle edge > 15mm for cloth simulation stability.

**Dart handling:** Darts create folds — the mesh must have fold lines as constrained edges, not just visual overlays.

### Dependencies
- `earcut` — polygon triangulation (already in Three.js)
- Potential: `poly2tri` — constrained Delaunay (better quality, handles holes)
- Potential: `cdt2d` — 2D constrained Delaunay triangulation

---

## 3. Virtual Assembly (Seams)

### Seam Model

```typescript
interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeStart: number; edgeEnd: number };
  pieceB: { pieceId: string; edgeStart: number; edgeEnd: number };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}
```

### Assembly Process

1. **Edge matching** — user defines which edges connect (click edge A, click edge B)
2. **Length validation** — warn if edges differ by > 5% (easing tolerance configurable)
3. **3D positioning** — seamed edges are placed adjacent on the avatar, aligned at seam points
4. **Simulation constraint** — seam becomes a distance constraint in the physics solver

### Seam Types and 3D Behavior

| Type | Visual | Physics |
|------|--------|---------|
| Standard | Single stitch line | Hard distance constraint |
| French | Enclosed seam (thicker) | Stiffer constraint, increased thickness |
| Flat-felled | Two visible stitch rows | Double constraint, lies flat |
| Overlock | Edge-wrapped finish | Standard constraint + edge stiffening |

---

## 4. Parametric Update Flow

```
User changes measurement (e.g. waist: 76 → 80)
    ↓
Generator re-runs → new PathCommands
    ↓
Pieces update in Redux store
    ↓
2D editor re-renders (SVG paths)
    ↓
Meshing pipeline re-runs → new triangle mesh
    ↓
3D viewport updates → mesh repositioned on avatar
    ↓
Simulation re-runs (if active) → draping updates
```

**Performance target:** < 200ms from measurement change to 3D update (without simulation). Simulation re-settle: < 2 seconds.

### Optimization Strategies
- Only re-mesh pieces that changed
- Cache tessellation for unmodified curves
- Web Workers for triangulation + physics
- Debounce rapid slider changes (16ms frame budget)

---

## 5. Units and Coordinate Systems

| Context | Unit | Y-axis |
|---------|------|--------|
| 2D Editor (SVG) | mm | Down (screen convention) |
| Internal Model | mm | Down |
| DXF Export | mm | Up (flipped on export) |
| 3D Viewport | mm (Three.js units = mm) | Up (Three.js convention) |
| User-facing measurements | cm | — |

**Conversion:** internal mm ↔ display cm is handled at the UI layer only. All calculations in mm.
