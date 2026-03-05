# Simulation State Snapshots — Design Doc

> **Issue:** #126 (expanded scope)
> **Date:** 2026-03-05
> **Status:** Approved

## Goal

CLO3D-style warm-start simulation with undo-integrated draping state, plus A/B comparison slots and copilot-driven iterative design loops.

## Decisions

| Decision | Choice |
|----------|--------|
| Warm-start trigger | Auto re-simulate on any 2D edit |
| Snapshot model | CLO3D undo + 3 manual A/B slots |
| Architecture | Hybrid: worker owns positions, Redux owns metadata |
| Copilot scope | Snapshot management + iterative design loop |

---

## 1. Core Snapshot Engine

### Architecture: Hybrid (Worker + Redux)

**Worker-side:** `Map<string, Float32Array>` stores raw particle positions. Max 5 entries (1 auto pre-edit + 3 manual + 1 buffer).

**Redux-side:** Metadata only (no heavy arrays cross-thread).

```typescript
interface SimSnapshotMeta {
  id: string;
  name: string;            // "Version A", "manga corta", etc.
  timestamp: number;
  particleCount: number;
  isAutoSave: boolean;     // true for the auto pre-edit snapshot
}

// Added to SimulationSliceState:
snapshots: SimSnapshotMeta[];      // max 4 (1 auto + 3 manual)
activeSnapshotId: string | null;
```

### Worker Messages (new)

```
Main → Worker:
  { type: 'saveSnapshot', id: string }
  { type: 'restoreSnapshot', id: string }
  { type: 'deleteSnapshot', id: string }
  { type: 'warmStart', positions: Float32Array }

Worker → Main:
  { type: 'snapshotSaved', id: string, particleCount: number }
  { type: 'snapshotRestored', id: string }
  { type: 'snapshotPositions', id: string, positions: Float32Array }
```

### Worker Storage

```typescript
// Inside clothWorker.ts / wasmSolverWorker.ts
const snapshots = new Map<string, Float32Array>();

case 'saveSnapshot': {
  snapshots.set(msg.id, new Float32Array(solver.pos));
  postMessage({ type: 'snapshotSaved', id: msg.id, particleCount: solver.numParticles });
  break;
}

case 'restoreSnapshot': {
  const saved = snapshots.get(msg.id);
  if (saved) {
    solver.pos.set(saved);
    solver.prevPos.set(saved);
    solver.vel.fill(0);
    postMessage({ type: 'snapshotRestored', id: msg.id });
    // Send frame with restored positions
    const snap = solver.getSnapshot();
    postMessage({ type: 'frame', ...snap }, [snap.positions.buffer]);
  }
  break;
}
```

---

## 2. Warm-Start on 2D Edit

### Trigger

Any Redux dispatch that modifies `project.pieces` or `project.seams` while `simulationState !== 'idle'`.

### Flow

1. Patronista edits 2D pattern (move point, change edge length, etc.)
2. Middleware detects change in `project.pieces` / `project.seams`
3. Middleware sends `saveSnapshot('auto-pre-edit')` to worker
4. GarmentSimulation detects pieces/seams changed via `useEffect`
5. Instead of destroying solver: sends new mesh with `warmStart` flag
6. Solver re-equilibrates from current positions (converges in 1-2s)

### Position Remapping Strategy

**Simple case (majority of edits):** Pattern changes dimensions but not topology. Same particle count, same mesh connectivity. Solver positions reused directly — only constraints update.

**Complex case (topological change):** Piece added/removed, mesh re-triangulated. Fallback to approximate restart:
- Existing particles: maintain current positions where possible
- New particles: interpolate from nearest neighbors
- Removed particles: discard

### Undo Integration

Ctrl+Z undoes the 2D edit (already works) AND sends `restoreSnapshot('auto-pre-edit')` to worker to revert the draping state. Single unified undo stack.

**Implementation:** Extend `undoMiddleware.ts` to detect simulation-active state. On undo, if a pre-edit snapshot exists, dispatch `restoreSnapshot` to worker alongside the project state revert.

---

## 3. A/B Comparison

### UI

Floating panel in the bottom-left corner of the 3D viewport. Only visible when manual snapshots exist.

**Components:**
- "Save State" button in ToolOptionsBar (visible when simulation active/paused)
- Click opens mini-dialog for naming the snapshot
- Saved snapshots appear as clickable chips: `[A: manga corta] [B: manga larga]`
- Active chip highlighted with accent color
- X button to delete
- Max 3 manual slots

### Interaction

- Click chip → instant restore (`restoreSnapshot` to worker)
- No split-screen in v1 — just toggle between states
- Future: side-by-side render, overlay diff

### File

New component: `src/components/Viewport3D/SnapshotBar.tsx` + CSS.

---

## 4. Copilot Integration

### New Tools (in `simulationTools.ts`)

**Snapshot management:**

```typescript
saveSimulationState({ name: string })
  → Saves current draping state with given name
  → Returns { id, name, particleCount }

restoreSimulationState({ name: string })
  → Restores draping to named state
  → Returns { restored: true, name }

listSimulationStates()
  → Returns array of { id, name, timestamp, particleCount }

deleteSimulationState({ name: string })
  → Removes named state
```

**Iterative design loop:**

```typescript
tryPatternEdit({ description: string, edits: ToolCall[], autoCompare: boolean })
  → 1. Saves snapshot "before"
  → 2. Executes edits (existing tools: modifyDimension, etc.)
  → 3. Waits for warm-start convergence (~2s)
  → 4. If autoCompare: reports fit/stress delta vs "before"
  → 5. Returns { success, delta, snapshotBefore, snapshotAfter }
```

### Example Copilot Flow

```
User: "prueba acortar la manga 3cm"
Copilot:
  1. saveSimulationState({ name: "before manga edit" })
  2. modifyDimension({ piece: "Sleeve", edge: "hem", delta: -30 })
  3. [warm-start, wait 2s convergence]
  4. Response: "Manga acortada 3cm. Stress en sisa aumentó 12%.
     ¿Quieres mantener o volver al estado anterior?"
```

### Context Builder Extension

Extend `contextBuilder.ts` to include snapshot metadata in copilot context:

```typescript
simulation: {
  state: 'running' | 'paused' | 'idle',
  snapshots: [{ name: 'Version A', timestamp: ... }, ...],
  hasPreEditSnapshot: true,
  particleCount: 10240,
}
```

This lets the copilot proactively suggest comparisons ("you have 2 saved states, want me to compare the stress maps?").

---

## 5. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/utils/cloth/clothWorker.ts` | Add snapshot messages to CPU worker |
| Modify | `src/utils/cloth/wasm/wasmSolverWorker.ts` | Add snapshot messages to WASM worker |
| Modify | `src/utils/cloth/clothWorkerClient.ts` | Add snapshot/warmStart client methods |
| Modify | `src/utils/cloth/xpbdSolver.ts` | Add `restorePositions(Float32Array)` method |
| Modify | `src/store/simulationSlice.ts` | Add snapshot metadata state + reducers |
| Modify | `src/store/undoMiddleware.ts` | Integrate pre-edit snapshot on undo |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Warm-start logic on pieces/seams change |
| Create | `src/components/Viewport3D/SnapshotBar.tsx` | A/B comparison UI |
| Create | `src/components/Viewport3D/SnapshotBar.css` | Floating chip bar styling |
| Modify | `src/copilot/action/tools/definitions/simulationTools.ts` | New copilot tools |
| Modify | `src/copilot/perception/contextBuilder.ts` | Snapshot metadata in context |

---

## 6. Out of Scope (v1)

- IndexedDB persistence (snapshots are session-only)
- Split-screen A/B comparison
- Stress/strain diff overlay between snapshots
- Snapshot thumbnails (3D viewport screenshot)
- Sharing snapshots between sessions
