# Live-Link 2D↔3D — Design Doc

> **Issue:** #20
> **Date:** 2026-03-05
> **Status:** Approved

## Goal

Instant 3D feedback on 2D pattern edits without full solver restart. Edit pattern → geometric preview (instant) → warm-start re-simulation (1-2s convergence).

## Decisions

| Decision | Choice |
|----------|--------|
| Approach | CLO3D-style with auto-debounce (Approach B) |
| Scope | All 3 phases: change detection, geometric preview, auto re-simulate |
| Topology changes | Fall back to full restart (current behavior) |
| Debounce delay | 500ms after last edit |
| Preview method | Proportional vertex displacement from 2D delta |

---

## 1. Problem: Current Behavior

Any change to `project.pieces` triggers this chain:

```
pieces change → re-mesh in worker (200ms) → pieceMeshes update →
placedMeshes recompute → simulation useEffect fires →
full solver destroy + create + SDF reload → flat state → 5-10s convergence
```

The `useEffect` at `GarmentSimulation.tsx:434` depends on `[simulationState, placedMeshes, seamInitData, fabricId, ...]`. When `placedMeshes` changes (because `pieceMeshes` changed from re-meshing), the entire solver is destroyed and recreated from scratch.

**Result:** Every 2D edit during active simulation costs 5-10s of lost drape state.

---

## 2. Target Behavior

```
pieces change → classifyEdit() →
  dimension edit: geometric preview (instant) → debounce 500ms → warm-start (1-2s)
  topology change: full restart (current behavior, unchanged)
```

### How CLO3D Does It

1. **Sync mode** deforms 3D mesh geometrically when 2D points move (no physics)
2. **Simulation auto-pauses** during 2D edits
3. **Re-simulate** from current positions (warm-start) when user triggers it or after edits stop

Our approach adds auto-debounce so the user doesn't need to manually re-trigger simulation.

---

## 3. Phase 1: Change Detection + Warm-Start Path

### Edit Classifier

New utility to determine if a pattern change requires re-meshing or just constraint updates.

```typescript
// src/utils/cloth/editClassifier.ts
type EditType = 'dimension' | 'topology';

function classifyEdit(prev: Piece[], next: Piece[]): EditType {
  if (prev.length !== next.length) return 'topology';
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return 'topology';
    if (prev[i].outline.length !== next[i].outline.length) return 'topology';
    for (let j = 0; j < prev[i].outline.length; j++) {
      if (prev[i].outline[j].values.length !== next[i].outline[j].values.length)
        return 'topology';
    }
  }
  return 'dimension';
}
```

**Dimension edit** = same piece count, same point count per piece, same edge segment count. Only coordinates changed (move point, resize edge, etc.).

**Topology change** = piece added/removed, point added/removed, edge split/merged. Requires full re-mesh.

### GarmentSimulation Split

The monolithic `useEffect` at line 434 is split:

1. **Solver lifecycle effect** — only fires on `simulationState` changes, solver tier selection, and topology changes. Creates/destroys solver.
2. **Warm-start effect** — fires on dimension edits. Sends `updateConstraints` to existing solver without restarting it.

A `useRef` stores the previous `pieces` array. On change, `classifyEdit()` determines the path.

### New Worker Message: `updateConstraints`

```
Main → Worker:
  { type: 'updateConstraints', restLengths: Float32Array }

Worker → Main:
  { type: 'constraintsUpdated' }
```

The solver updates stretch constraint rest lengths in-place. Same particles, same mesh connectivity, only rest lengths change. Solver continues from current positions — this IS the warm-start.

### Solver Changes

```typescript
// xpbdSolver.ts
updateRestLengths(newLengths: Float32Array): void {
  // newLengths corresponds to stretch constraints
  // Update rest length for each stretch constraint
  for (let i = 0; i < this.stretchConstraints.length && i < newLengths.length; i++) {
    this.stretchConstraints[i].restLength = newLengths[i];
  }
}
```

---

## 4. Phase 2: Geometric Preview

Instant visual feedback while physics catches up.

### How It Works

When a 2D pattern point moves:

1. Identify which vertices in the 3D mesh correspond to the moved region
2. Compute the 2D displacement delta
3. Apply a proportional displacement to the 3D vertex positions
4. Update the Three.js BufferGeometry immediately (no physics)
5. The preview is approximate but instant

### Vertex Mapping

Each vertex in the simulation mesh has a known barycentric position within the 2D pattern. When a pattern point moves, vertices near that point are displaced proportionally:

```typescript
// Displacement falls off with distance from the moved point
const influence = Math.max(0, 1 - distance / influenceRadius);
vertex3D.x += delta2D.x * influence;
vertex3D.y += delta2D.y * influence; // minimal — mostly planar
vertex3D.z += delta2D.z * influence;
```

### Implementation

New hook: `useGeometricPreview` that:
- Watches for dimension edits (via `classifyEdit`)
- Computes vertex displacements from the 2D delta
- Applies them to `positionsRef.current` (last simulated frame)
- Triggers a render update via the existing `onFrame` callback
- Marks state as `isWarmStarting: true` in Redux (for UI feedback)

---

## 5. Phase 3: Auto Re-Simulate with Debounce

After 500ms of no 2D edits:

1. Auto-save snapshot via #126 infrastructure (`saveSnapshot('auto-pre-edit')`)
2. Send `warmStart` with current geometric-preview positions to worker
3. Solver re-equilibrates from deformed positions (1-2s convergence vs 5-10s from flat)
4. Clear `isWarmStarting` flag when convergence detected (velocity below threshold)

### Undo Integration

Already implemented in Issue #126. Ctrl+Z undoes the 2D edit AND restores the pre-edit snapshot. No additional work needed.

### Convergence Detection

The solver already reports frame data. We can detect convergence by monitoring average velocity magnitude:

```typescript
// In onFrame callback
const avgVelocity = computeAvgVelocity(positions, prevPositions, dt);
if (avgVelocity < CONVERGENCE_THRESHOLD) {
  dispatch(setIsWarmStarting(false));
}
```

---

## 6. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/utils/cloth/editClassifier.ts` | Classify edits as dimension vs topology |
| Create | `src/utils/cloth/__tests__/editClassifier.test.ts` | Tests for edit classification |
| Modify | `src/utils/cloth/clothWorker.ts` | Add `updateConstraints` message handler |
| Modify | `src/utils/cloth/wasm/wasmSolverWorker.ts` | Add `updateConstraints` message handler |
| Modify | `src/utils/cloth/clothWorkerClient.ts` | Add `updateConstraints()` client method |
| Modify | `src/utils/cloth/wasm/wasmSolverClient.ts` | Add `updateConstraints()` client method |
| Modify | `src/utils/cloth/xpbdSolver.ts` | Add `updateRestLengths(Float32Array)` |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Split useEffect, add warm-start path, debounce |
| Create | `src/components/Viewport3D/useGeometricPreview.ts` | Geometric preview hook |
| Modify | `src/store/simulationSlice.ts` | Add `isWarmStarting` state |

---

## 7. Out of Scope (v1)

- Topology-preserving re-mesh (add/remove points without full restart)
- Stress/strain preview during geometric deformation
- Multi-piece independent warm-start (all pieces warm-start together)
- Split-screen before/after comparison during warm-start
- Convergence speed tuning (adaptive substeps)
