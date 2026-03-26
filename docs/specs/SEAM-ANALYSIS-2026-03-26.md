# Seam System Analysis — OpenClo vs CLO3D

**Date:** 2026-03-26
**Status:** Critical gaps identified

## Executive Summary

The seam system has correct infrastructure (data model, XPBD solver, rendering) but several fundamental gaps prevent it from working like CLO3D. The pieces are not being sewn together in simulation primarily due to **edge name resolution failures** — seams reference edges by semantic name, but pieces often lack semantic edge definitions, causing the solver to silently skip all constraints.

## Critical Issues (Pieces Not Sewing Together)

### 1. SILENT EDGE NAME RESOLUTION FAILURE

**Root cause of "pieces not being sewn together".**

`buildSeamConstraints()` in `seamAssembly.ts` (line 372-374):
```typescript
const edgeADef = pieceAData?.edges?.find(e => e.name === seam.pieceA.edgeName);
const edgeBDef = pieceBData?.edges?.find(e => e.name === seam.pieceB.edgeName);
if (!edgeADef || !edgeBDef) continue;  // SILENTLY SKIPS
```

When a piece has no `edges` array (common for hand-drawn or imported pieces), `edgeADef` is undefined, and the seam constraint is **silently skipped**. No warning, no error. The solver runs with zero constraints. Pieces fall through each other.

**CLO3D approach**: CLO3D always has edge definitions because pieces are created from parametric blocks. OpenClo allows freeform pieces without edge metadata, but the seam system assumes edges always exist.

**Fix needed**: Fall back to edge-index-based resolution when semantic names aren't available. The seam tool stores `edgeName: "edge-0"` as a fallback, but `buildSeamConstraints` doesn't parse this pattern.

### 2. GPU/WASM SOLVERS DON'T RECEIVE SEAM DATA

Only the **CPU cloth worker** processes seam constraints. The GPU (TSL) solver and WASM solver do not implement seam constraint solving.

- `tslSolver.ts` — no seam support
- `wasmSolverWorker.ts` — no seam support
- `clothWorker.ts` — seam support via `buildSeamConstraints()`

Since the app defaults to GPU or WASM (higher performance tiers), most users never hit the CPU path where seams actually work.

**Fix needed**: Implement seam constraints in the WASM solver. For GPU, either transfer seam data as a StorageBuffer or fall back to CPU for seam solving.

### 3. SEAM CONSTRAINTS SHRINK TOO SLOWLY

`DEFAULT_SEAM_CONFIG.shrinkFactor = 0.995` means rest length shrinks by 0.5% per substep. With 15 substeps/frame at 60fps, it takes ~900 frames (15 seconds) to fully sew pieces together.

**CLO3D approach**: CLO3D pulls pieces together much faster — within 1-2 seconds of simulation start. The shrink factor should be more aggressive or seam constraints should use zero rest length from the start.

**Fix needed**: Use `shrinkFactor = 0.95` or start with `restLength = 0` (instant sewing).

## 2D Visualization Gaps

### 4. SEAM RENDERING DOESN'T MATCH CLO3D

**Current OpenClo**: Red/orange lines on edges + dotted connection line between midpoints.

**CLO3D**:
- Sew-able edges **bold** during tool activation
- **Colored edge segments** directly on the piece outline (not separate lines)
- **Matching colors** per seam pair (e.g., seam 1 = blue, seam 2 = green, seam 3 = purple)
- Connection lines between matched edges
- **Directional arrows** showing sewing direction along each edge
- **Type-specific styles**: French = dashed, overlock = zigzag, standard = solid
- **Selected seam** = bright green highlight

**OpenClo issues**:
- Only uses red/orange colors (no color-coding per seam)
- Renders `<line>` elements for edges (straight lines) instead of following the actual piece outline curves
- No sew-able edge highlighting during tool activation
- No type-specific line styles
- Edge highlight doesn't follow the actual outline path — it draws a straight line from edge start to edge end, which looks wrong on curved edges (armholes, necklines)

### 5. EDGE HIGHLIGHT DRAWS STRAIGHT LINES ON CURVED EDGES

`SeamRenderer.tsx` line 94-100:
```tsx
<line
  x1={epA.start.x + offA.x} y1={epA.start.y + offA.y}
  x2={epA.end.x + offA.x} y2={epA.end.y + offA.y}
  stroke={baseColor}
/>
```

This draws a straight `<line>` between the edge's start and end points. For curved edges (armhole, neckline, side seam curves), the highlight cuts across the piece instead of following the outline.

**Fix needed**: Use `<path>` elements that trace the actual outline path segment between start and end vertices.

### 6. NO SEAM COLOR CODING

All seams render in the same red/orange color. With multiple seams, it's impossible to tell which edges connect to which.

**CLO3D approach**: Each seam pair gets a unique color from a palette. Edge A and edge B of the same seam share the same color. Different seams get different colors.

**Fix needed**: Assign sequential colors from a palette: `['#4a9eff', '#ff6b9d', '#6bffa6', '#ffa64a', '#9d6bff', '#ff4a4a', ...]`

## Feature Gaps vs CLO3D

### 7. NO 3D SEWING TOOL
CLO3D can create seams by clicking edges directly in the 3D viewport. OpenClo only supports 2D seam creation.

### 8. NO SHRINKAGE/GATHERING CONTROL
CLO3D has a `shrinkage` property (0-100%) that controls fabric gathering along the seam. OpenClo has `tension` (0-200) but it's not equivalent — it modifies rest length, not gathering distribution.

### 9. NO FRENCH/OVERLOCK VISUAL DISTINCTION
Seam types are stored (`standard`, `french`, `flat-felled`, `overlock`) but all render identically in 2D. CLO3D uses dashed lines for French, zigzag for overlock, etc.

### 10. NO SEAM DIRECTION REVERSAL PREVIEW
The `reverseSeam` action exists but the directional arrows in the renderer don't update visually to show the reversed direction.

## Recommended Fix Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | #1 Edge name resolution fallback | Small | Pieces will actually sew together |
| **P0** | #2 WASM/GPU seam support | Medium | Seams work on default solver tier |
| **P1** | #3 Faster shrink factor | Tiny | Seams complete in <2s instead of 15s |
| **P1** | #5 Curved edge path rendering | Medium | 2D seams follow piece outlines |
| **P1** | #6 Color-coded seam pairs | Small | Distinguish between seams |
| **P2** | #4 Full CLO3D visual parity | Medium | Professional 2D appearance |
| **P2** | #9 Type-specific line styles | Small | Visual seam type identification |
| **P3** | #7 3D sewing tool | Large | CLO3D parity |
| **P3** | #8 Shrinkage/gathering | Medium | Production sewing behavior |

## Files Involved

| File | Issue |
|------|-------|
| `src/utils/cloth/seamAssembly.ts:372` | Silent edge resolution failure |
| `src/utils/cloth/clothWorker.ts` | Only CPU path has seam support |
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | Missing seam constraints |
| `src/utils/cloth/gpu/tslSolver.ts` | Missing seam constraints |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | Straight lines, no color coding |
| `src/utils/cloth/seamAssembly.ts:86` | shrinkFactor too slow |
