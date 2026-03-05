# Simulation State Snapshots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CLO3D-style warm-start simulation with undo-integrated draping state, A/B comparison slots, and copilot-driven iterative design loops.

**Architecture:** Hybrid worker/Redux model — the Web Worker owns raw particle position data (`Map<string, Float32Array>`), while Redux owns lightweight metadata (`SimSnapshotMeta[]`). The worker communicates via 4 new message types (saveSnapshot, restoreSnapshot, deleteSnapshot, warmStart). Copilot tools wrap snapshot operations for AI-driven pattern iteration.

**Tech Stack:** React 18 + Redux Toolkit, Web Workers (CPU + Wasm solvers), TypeScript, Vitest, CSS

---

## Context

**Design doc:** `docs/plans/2026-03-05-simulation-snapshots-design.md`

**Key files to understand before starting:**

| File | Purpose |
|------|---------|
| `src/utils/cloth/clothWorker.ts` | CPU worker — message handler, solver loop, `WorkerInMessage`/`WorkerOutMessage` types |
| `src/utils/cloth/clothWorkerClient.ts` | Main-thread client for CPU worker |
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | Wasm worker — parallel message handler |
| `src/utils/cloth/xpbdSolver.ts` | CPU solver class — `pos`, `prevPos`, `vel`, `reset()`, `getSnapshot()` |
| `src/store/simulationSlice.ts` | Redux slice for simulation state |
| `src/store/undoMiddleware.ts` | Undo/redo middleware — intercepts `project/` actions |
| `src/components/Viewport3D/GarmentSimulation.tsx` | R3F component that manages solver lifecycle |
| `src/copilot/action/tools/definitions/simulationTools.ts` | Existing copilot simulation tools |
| `src/copilot/perception/contextBuilder.ts` | Builds context for LLM system prompt |

**Test runner:** `npm run test` (Vitest)

**Type check:** `npx tsc --noEmit`

---

### Task 1: Add Snapshot Types to Worker Protocol

**Files:**
- Modify: `src/utils/cloth/clothWorker.ts:30-55` (WorkerInMessage / WorkerOutMessage types)

**Step 1: Add new message types to WorkerInMessage**

In `src/utils/cloth/clothWorker.ts`, add 4 new variants to `WorkerInMessage` (line 30):

```typescript
// Add after line 46 (before the closing semicolon of WorkerInMessage):
  | { type: 'saveSnapshot'; id: string }
  | { type: 'restoreSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'warmStart'; positions: Float32Array }
```

**Step 2: Add new message types to WorkerOutMessage**

In the same file, add 3 new variants to `WorkerOutMessage` (line 49):

```typescript
// Add after line 55 (before the closing semicolon of WorkerOutMessage):
  | { type: 'snapshotSaved'; id: string; particleCount: number }
  | { type: 'snapshotRestored'; id: string }
  | { type: 'snapshotDeleted'; id: string }
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add src/utils/cloth/clothWorker.ts
git commit -m "feat(sim): add snapshot message types to worker protocol"
```

---

### Task 2: Implement Snapshot Handling in CPU Worker

**Files:**
- Modify: `src/utils/cloth/clothWorker.ts:57-317` (worker state + message handler)

**Step 1: Add snapshot storage to worker state**

After `cachedOutlines` (line 63), add:

```typescript
/** Snapshot storage: id → copy of particle positions */
const snapshots = new Map<string, Float32Array>();
const MAX_SNAPSHOTS = 5; // 1 auto pre-edit + 3 manual + 1 buffer
```

**Step 2: Add saveSnapshot handler**

Inside the `switch (msg.type)` block, before the closing `}` of the try block (around line 316), add:

```typescript
      case 'saveSnapshot': {
        if (solver) {
          const positions = new Float32Array(solver.pos);
          snapshots.set(msg.id, positions);
          // Evict oldest if over limit
          if (snapshots.size > MAX_SNAPSHOTS) {
            const oldest = snapshots.keys().next().value;
            if (oldest !== undefined) snapshots.delete(oldest);
          }
          (self as unknown as Worker).postMessage({
            type: 'snapshotSaved',
            id: msg.id,
            particleCount: solver.numParticles,
          } satisfies WorkerOutMessage);
        }
        break;
      }
```

**Step 3: Add restoreSnapshot handler**

```typescript
      case 'restoreSnapshot': {
        if (solver) {
          const saved = snapshots.get(msg.id);
          if (saved && saved.length === solver.pos.length) {
            solver.pos.set(saved);
            solver.prevPos.set(saved);
            solver.vel.fill(0);
            (self as unknown as Worker).postMessage({
              type: 'snapshotRestored',
              id: msg.id,
            } satisfies WorkerOutMessage);
            // Send frame with restored positions
            const snap = solver.getSnapshot();
            (self as unknown as Worker).postMessage(
              { type: 'frame', positions: snap.positions, numParticles: snap.numParticles, triIds: snap.triIds } satisfies WorkerOutMessage,
              [snap.positions.buffer],
            );
          }
        }
        break;
      }
```

**Step 4: Add deleteSnapshot handler**

```typescript
      case 'deleteSnapshot': {
        snapshots.delete(msg.id);
        (self as unknown as Worker).postMessage({
          type: 'snapshotDeleted',
          id: msg.id,
        } satisfies WorkerOutMessage);
        break;
      }
```

**Step 5: Add warmStart handler**

```typescript
      case 'warmStart': {
        if (solver) {
          const incoming = new Float32Array(msg.positions);
          // If same particle count, restore directly; otherwise ignore (topology changed)
          if (incoming.length === solver.pos.length) {
            solver.pos.set(incoming);
            solver.prevPos.set(incoming);
            solver.vel.fill(0);
          }
        }
        break;
      }
```

**Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add src/utils/cloth/clothWorker.ts
git commit -m "feat(sim): implement snapshot save/restore/delete + warmStart in CPU worker"
```

---

### Task 3: Implement Snapshot Handling in Wasm Worker

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:50-270` (worker state + message handler)

**Step 1: Add snapshot storage to wasm worker state**

After `animFrameId` (line 56), add:

```typescript
const snapshots = new Map<string, Float32Array>();
const MAX_SNAPSHOTS = 5;
```

**Step 2: Add helper to read current positions from wasm memory**

After `simulationLoop` function (after line 86), add:

```typescript
function readPositions(): Float32Array | null {
  if (!solver || !wasmExports?.memory) return null;
  const n = numParticles;
  const ptr = solver.positions_ptr();
  return new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
}
```

**Step 3: Add saveSnapshot, restoreSnapshot, deleteSnapshot, warmStart cases**

Inside `switch (msg.type)` (line 92), before the `case 'dispose':` block (line 256), add:

```typescript
      case 'saveSnapshot': {
        const positions = readPositions();
        if (positions) {
          snapshots.set(msg.id, positions);
          if (snapshots.size > MAX_SNAPSHOTS) {
            const oldest = snapshots.keys().next().value;
            if (oldest !== undefined) snapshots.delete(oldest);
          }
          (self as unknown as Worker).postMessage({
            type: 'snapshotSaved', id: msg.id, particleCount: numParticles,
          });
        }
        break;
      }

      case 'restoreSnapshot': {
        const saved = snapshots.get(msg.id);
        if (saved && solver && wasmExports?.memory) {
          // Write positions back into wasm memory
          const ptr = solver.positions_ptr();
          const target = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3);
          target.set(saved);
          (self as unknown as Worker).postMessage({ type: 'snapshotRestored', id: msg.id });
          // Send updated frame
          const positions = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3).slice();
          (self as unknown as Worker).postMessage(
            { type: 'frame', positions },
            [positions.buffer],
          );
        }
        break;
      }

      case 'deleteSnapshot': {
        snapshots.delete(msg.id);
        (self as unknown as Worker).postMessage({ type: 'snapshotDeleted', id: msg.id });
        break;
      }

      case 'warmStart': {
        if (solver && wasmExports?.memory) {
          const incoming = new Float32Array(msg.positions);
          if (incoming.length === numParticles * 3) {
            const ptr = solver.positions_ptr();
            const target = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3);
            target.set(incoming);
          }
        }
        break;
      }
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts
git commit -m "feat(sim): implement snapshot handling in Wasm worker"
```

---

### Task 4: Add Snapshot Client Methods + Redux Metadata

**Files:**
- Modify: `src/utils/cloth/clothWorkerClient.ts:33-282` (client methods + message handler)
- Modify: `src/store/simulationSlice.ts:48-315` (state + reducers)
- Modify: `src/store/__tests__/simulationSlice.test.ts` (new tests)

**Step 1: Write tests for snapshot Redux state**

Add to `src/store/__tests__/simulationSlice.test.ts`:

```typescript
import reducer, {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFabric,
  setDefaultFabric,
  setParticleDistance,
  setPieceParticleDistance,
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  clearSnapshots,
} from '../simulationSlice';

// ... keep existing tests, add new describe block:

describe('snapshots', () => {
  it('starts with empty snapshots', () => {
    expect(initial().snapshots).toEqual([]);
    expect(initial().activeSnapshotId).toBeNull();
  });

  it('addSnapshot adds metadata', () => {
    const s = reducer(initial(), addSnapshot({
      id: 'snap1', name: 'Version A', particleCount: 100, isAutoSave: false,
    }));
    expect(s.snapshots).toHaveLength(1);
    expect(s.snapshots[0].name).toBe('Version A');
    expect(s.snapshots[0].id).toBe('snap1');
  });

  it('addSnapshot limits to 4 entries', () => {
    let s = initial();
    for (let i = 0; i < 5; i++) {
      s = reducer(s, addSnapshot({
        id: `snap${i}`, name: `V${i}`, particleCount: 100, isAutoSave: false,
      }));
    }
    expect(s.snapshots).toHaveLength(4);
    // Oldest removed
    expect(s.snapshots[0].id).toBe('snap1');
  });

  it('removeSnapshot removes by id', () => {
    let s = reducer(initial(), addSnapshot({
      id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
    }));
    s = reducer(s, removeSnapshot('snap1'));
    expect(s.snapshots).toHaveLength(0);
  });

  it('removeSnapshot clears activeSnapshotId if it matches', () => {
    let s = reducer(initial(), addSnapshot({
      id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
    }));
    s = reducer(s, setActiveSnapshot('snap1'));
    s = reducer(s, removeSnapshot('snap1'));
    expect(s.activeSnapshotId).toBeNull();
  });

  it('setActiveSnapshot sets id', () => {
    const s = reducer(initial(), setActiveSnapshot('snap1'));
    expect(s.activeSnapshotId).toBe('snap1');
  });

  it('clearSnapshots resets all', () => {
    let s = reducer(initial(), addSnapshot({
      id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
    }));
    s = reducer(s, setActiveSnapshot('snap1'));
    s = reducer(s, clearSnapshots());
    expect(s.snapshots).toEqual([]);
    expect(s.activeSnapshotId).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/simulationSlice.test.ts`
Expected: FAIL — `addSnapshot`, `removeSnapshot`, `setActiveSnapshot`, `clearSnapshots` not exported

**Step 3: Add snapshot metadata to SimulationSliceState**

In `src/store/simulationSlice.ts`, add the `SimSnapshotMeta` interface (after `PinData` interface, around line 46):

```typescript
/** Metadata for a simulation state snapshot. Heavy data stays in worker. */
export interface SimSnapshotMeta {
  id: string;
  name: string;
  timestamp: number;
  particleCount: number;
  isAutoSave: boolean;
}
```

Add to `SimulationSliceState` interface (after `surfaceMode3D`, line 90):

```typescript
  /** Simulation state snapshots (max 4: 1 auto + 3 manual) */
  snapshots: SimSnapshotMeta[];
  /** Currently active snapshot ID */
  activeSnapshotId: string | null;
```

Add to `initialState` (after `surfaceMode3D` value, line 119):

```typescript
  snapshots: [],
  activeSnapshotId: null,
```

**Step 4: Add snapshot reducers**

In the `reducers` object (after `setSurfaceMode3D`, before the closing `}` of reducers):

```typescript
    // ─── Snapshot Metadata ──────────────────────────────────────────────────

    addSnapshot(state, action: PayloadAction<{
      id: string; name: string; particleCount: number; isAutoSave: boolean;
    }>) {
      const { id, name, particleCount, isAutoSave } = action.payload;
      state.snapshots.push({ id, name, timestamp: Date.now(), particleCount, isAutoSave });
      // Max 4 entries (1 auto + 3 manual)
      while (state.snapshots.length > 4) {
        state.snapshots.shift();
      }
    },
    removeSnapshot(state, action: PayloadAction<string>) {
      state.snapshots = state.snapshots.filter(s => s.id !== action.payload);
      if (state.activeSnapshotId === action.payload) {
        state.activeSnapshotId = null;
      }
    },
    setActiveSnapshot(state, action: PayloadAction<string | null>) {
      state.activeSnapshotId = action.payload;
    },
    clearSnapshots(state) {
      state.snapshots = [];
      state.activeSnapshotId = null;
    },
```

Export the new actions (add to the destructuring export at line 281):

```typescript
  // Snapshots
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  clearSnapshots,
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/simulationSlice.test.ts`
Expected: PASS

**Step 6: Add snapshot methods to ClothWorkerClient**

In `src/utils/cloth/clothWorkerClient.ts`, add methods (after `requestEdgeData()`, around line 235):

```typescript
  /** Callback for snapshot saved confirmation. */
  onSnapshotSaved: ((id: string, particleCount: number) => void) | null = null;

  /** Callback for snapshot restored confirmation. */
  onSnapshotRestored: ((id: string) => void) | null = null;

  /** Callback for snapshot deleted confirmation. */
  onSnapshotDeleted: ((id: string) => void) | null = null;

  /**
   * Save current particle positions as a named snapshot in the worker.
   */
  saveSnapshot(id: string): void {
    this.postMessage({ type: 'saveSnapshot', id });
  }

  /**
   * Restore particle positions from a previously saved snapshot.
   */
  restoreSnapshot(id: string): void {
    this.postMessage({ type: 'restoreSnapshot', id });
  }

  /**
   * Delete a snapshot from worker memory.
   */
  deleteSnapshot(id: string): void {
    this.postMessage({ type: 'deleteSnapshot', id });
  }

  /**
   * Apply positions for warm-start (after pattern edit, keeps draped state).
   */
  warmStart(positions: Float32Array): void {
    this.postMessage({ type: 'warmStart', positions });
  }
```

Update `handleMessage` to handle new response types (add cases to the switch inside `handleMessage`, around line 276):

```typescript
      case 'snapshotSaved':
        this.onSnapshotSaved?.(msg.id, msg.particleCount);
        break;

      case 'snapshotRestored':
        this.onSnapshotRestored?.(msg.id);
        break;

      case 'snapshotDeleted':
        this.onSnapshotDeleted?.(msg.id);
        break;
```

**Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 8: Run full test suite**

Run: `npm run test`
Expected: PASS (all existing tests + new snapshot tests)

**Step 9: Commit**

```bash
git add src/store/simulationSlice.ts src/store/__tests__/simulationSlice.test.ts src/utils/cloth/clothWorkerClient.ts
git commit -m "feat(sim): add snapshot metadata to Redux + client methods"
```

---

### Task 5: Create SnapshotBar UI Component

**Files:**
- Create: `src/components/Viewport3D/SnapshotBar.tsx`
- Create: `src/components/Viewport3D/SnapshotBar.css`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (mount SnapshotBar)

**Step 1: Create SnapshotBar.css**

Create `src/components/Viewport3D/SnapshotBar.css`:

```css
.snapshot-bar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 6px 12px;
  z-index: 10;
  pointer-events: auto;
}

.snapshot-bar .snap-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.snapshot-bar .snap-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.snapshot-bar .snap-chip.active {
  background: rgba(74, 158, 255, 0.2);
  border-color: var(--accent);
  color: var(--accent);
}

.snapshot-bar .snap-chip .snap-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
}

.snapshot-bar .snap-chip:hover .snap-delete {
  opacity: 0.6;
}

.snapshot-bar .snap-chip .snap-delete:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}

.snapshot-bar .snap-save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.snapshot-bar .snap-save-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
}

.snapshot-bar .snap-save-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
```

**Step 2: Create SnapshotBar.tsx**

Create `src/components/Viewport3D/SnapshotBar.tsx`:

```tsx
/**
 * SnapshotBar — floating chip bar for A/B simulation state comparison.
 * Shows saved draping states as clickable chips in the 3D viewport.
 */
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import {
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  type SimSnapshotMeta,
} from '../../store/simulationSlice';
import './SnapshotBar.css';

interface SnapshotBarProps {
  onSaveSnapshot: (id: string) => void;
  onRestoreSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
}

const MAX_MANUAL_SLOTS = 3;

export default function SnapshotBar({ onSaveSnapshot, onRestoreSnapshot, onDeleteSnapshot }: SnapshotBarProps) {
  const dispatch = useDispatch();
  const snapshots = useSelector((s: RootState) => s.simulation.snapshots);
  const activeSnapshotId = useSelector((s: RootState) => s.simulation.activeSnapshotId);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);

  const manualSnapshots = snapshots.filter(s => !s.isAutoSave);
  const canSave = simulationState !== 'idle' && manualSnapshots.length < MAX_MANUAL_SLOTS;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const letter = String.fromCharCode(65 + manualSnapshots.length); // A, B, C
    const id = `manual-${Date.now()}`;
    onSaveSnapshot(id);
    dispatch(addSnapshot({ id, name: `Version ${letter}`, particleCount: 0, isAutoSave: false }));
    dispatch(setActiveSnapshot(id));
  }, [canSave, manualSnapshots.length, onSaveSnapshot, dispatch]);

  const handleRestore = useCallback((snap: SimSnapshotMeta) => {
    onRestoreSnapshot(snap.id);
    dispatch(setActiveSnapshot(snap.id));
  }, [onRestoreSnapshot, dispatch]);

  const handleDelete = useCallback((e: React.MouseEvent, snap: SimSnapshotMeta) => {
    e.stopPropagation();
    onDeleteSnapshot(snap.id);
    dispatch(removeSnapshot(snap.id));
  }, [onDeleteSnapshot, dispatch]);

  // Only show when simulation is active and there are manual snapshots (or can save)
  if (simulationState === 'idle') return null;
  if (manualSnapshots.length === 0 && !canSave) return null;

  return (
    <div className="snapshot-bar">
      {manualSnapshots.map(snap => (
        <button
          key={snap.id}
          className={`snap-chip${activeSnapshotId === snap.id ? ' active' : ''}`}
          onClick={() => handleRestore(snap)}
        >
          {snap.name}
          <span
            className="snap-delete"
            onClick={(e) => handleDelete(e, snap)}
            role="button"
            tabIndex={-1}
          >
            ×
          </span>
        </button>
      ))}
      <button
        className="snap-save-btn"
        onClick={handleSave}
        disabled={!canSave}
        title="Save current state"
      >
        +
      </button>
    </div>
  );
}
```

**Step 3: Mount SnapshotBar in Viewport3D**

Find the `Viewport3D` component. Inside the `return` JSX, after the existing overlay elements (near the bottom of the component, inside the wrapper div that has `position: relative`), add:

```tsx
import SnapshotBar from './SnapshotBar';
```

And in the JSX:

```tsx
<SnapshotBar
  onSaveSnapshot={(id) => {
    /* Will wire to worker client in Task 6 */
  }}
  onRestoreSnapshot={(id) => {
    /* Will wire to worker client in Task 6 */
  }}
  onDeleteSnapshot={(id) => {
    /* Will wire to worker client in Task 6 */
  }}
/>
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Viewport3D/SnapshotBar.tsx src/components/Viewport3D/SnapshotBar.css src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(sim): add SnapshotBar UI component for A/B comparison"
```

---

### Task 6: Wire Snapshot Operations in GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (expose snapshot methods via ref or callbacks)
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (pass snapshot callbacks from GarmentSimulation to SnapshotBar)

This task connects the SnapshotBar UI to the actual worker clients. GarmentSimulation manages the solver clients, so snapshot operations need to flow through it.

**Step 1: Add snapshot methods to GarmentSimulation**

In `GarmentSimulation.tsx`, the component maintains refs to solver clients (`clientRef`, `wasmClientRef`). Add a snapshot forwarding mechanism.

After the existing `useEffect` hooks (around line 596), add:

```typescript
// Expose snapshot operations for SnapshotBar
const saveSnapshot = useCallback((id: string) => {
  clientRef.current?.saveSnapshot(id);
  wasmClientRef.current?.saveSnapshot(id);
}, []);

const restoreSnapshot = useCallback((id: string) => {
  clientRef.current?.restoreSnapshot(id);
  wasmClientRef.current?.restoreSnapshot(id);
}, []);

const deleteSnapshot = useCallback((id: string) => {
  clientRef.current?.deleteSnapshot(id);
  wasmClientRef.current?.deleteSnapshot(id);
}, []);
```

The WasmSolverClient doesn't have these methods yet. Add them similarly to ClothWorkerClient by posting messages directly:

In `GarmentSimulation.tsx`, the wasm client posts messages directly. The snapshot messages we added to `wasmSolverWorker.ts` use the same message format, so the `WasmSolverClient` class needs matching methods.

Check `src/utils/cloth/wasm/wasmSolverClient.ts` — if it wraps a Worker, add `saveSnapshot`, `restoreSnapshot`, `deleteSnapshot`, `warmStart` methods using the same `postMessage` pattern.

**Step 2: Pass snapshot callbacks up to Viewport3D via props**

Add props to `GarmentSimulation` component signature:

```typescript
interface GarmentSimulationProps {
  // ... existing props
  onSnapshotSave?: (id: string) => void;
  onSnapshotRestore?: (id: string) => void;
  onSnapshotDelete?: (id: string) => void;
}
```

Or use `useImperativeHandle` with a ref to expose `saveSnapshot`, `restoreSnapshot`, `deleteSnapshot` methods.

**Recommended approach:** Use a ref forwarded from Viewport3D:

```typescript
// In Viewport3D:
const simRef = useRef<{ saveSnapshot: (id: string) => void; restoreSnapshot: (id: string) => void; deleteSnapshot: (id: string) => void } | null>(null);

// Pass to GarmentSimulation:
<GarmentSimulation ref={simRef} ... />

// Pass to SnapshotBar:
<SnapshotBar
  onSaveSnapshot={(id) => simRef.current?.saveSnapshot(id)}
  onRestoreSnapshot={(id) => simRef.current?.restoreSnapshot(id)}
  onDeleteSnapshot={(id) => simRef.current?.deleteSnapshot(id)}
/>
```

In GarmentSimulation, use `forwardRef` + `useImperativeHandle`:

```typescript
import { forwardRef, useImperativeHandle } from 'react';

export interface GarmentSimulationHandle {
  saveSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
}

const GarmentSimulation = forwardRef<GarmentSimulationHandle, GarmentSimulationProps>((props, ref) => {
  // ... existing code

  useImperativeHandle(ref, () => ({
    saveSnapshot: (id: string) => {
      clientRef.current?.saveSnapshot(id);
      // For wasm client, post message directly
    },
    restoreSnapshot: (id: string) => {
      clientRef.current?.restoreSnapshot(id);
    },
    deleteSnapshot: (id: string) => {
      clientRef.current?.deleteSnapshot(id);
    },
  }), []);

  // ... rest of component
});
```

**Step 3: Also add snapshot methods to WasmSolverClient**

Check `src/utils/cloth/wasm/wasmSolverClient.ts` and add `saveSnapshot`, `restoreSnapshot`, `deleteSnapshot`, `warmStart` methods matching the pattern used in `ClothWorkerClient`.

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/components/Viewport3D/Viewport3D.tsx src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "feat(sim): wire snapshot operations through GarmentSimulation to SnapshotBar"
```

---

### Task 7: Integrate Pre-Edit Snapshot with Undo

**Files:**
- Modify: `src/store/undoMiddleware.ts:107-173` (add simulation snapshot on undo)

**Step 1: Extend undo middleware to save/restore simulation snapshots**

The undo middleware needs access to the active worker client to send snapshot commands. Since middleware can't hold React refs, use a module-level registration pattern.

At the top of `undoMiddleware.ts` (after imports), add:

```typescript
/** Worker snapshot callback — registered by GarmentSimulation when simulation is active */
let _snapshotSave: ((id: string) => void) | null = null;
let _snapshotRestore: ((id: string) => void) | null = null;

export function registerSimulationCallbacks(
  save: (id: string) => void,
  restore: (id: string) => void,
): () => void {
  _snapshotSave = save;
  _snapshotRestore = restore;
  return () => {
    _snapshotSave = null;
    _snapshotRestore = null;
  };
}
```

**Step 2: Save pre-edit snapshot before project changes during active simulation**

In the middleware, inside the `if (actionType.startsWith('project/') ...)` block (line 133), before the existing snapshot logic, add:

```typescript
    // Auto-save simulation state before pattern edit (for undo integration)
    const simState = (store.getState() as RootState).simulation.simulationState;
    if (simState !== 'idle' && _snapshotSave && !(isSameAction && isRecent)) {
      _snapshotSave('auto-pre-edit');
    }
```

**Step 3: Restore simulation snapshot on undo during active simulation**

In the `editor/undo` handler (line 110), after dispatching `project/restoreState`, add:

```typescript
    // Restore simulation state if simulation was active during the edit
    const simStateAfterUndo = (store.getState() as RootState).simulation.simulationState;
    if (simStateAfterUndo !== 'idle' && _snapshotRestore) {
      _snapshotRestore('auto-pre-edit');
    }
```

**Step 4: Register callbacks from GarmentSimulation**

In `GarmentSimulation.tsx`, add a `useEffect` that registers/unregisters the snapshot callbacks with the undo middleware when simulation is active:

```typescript
import { registerSimulationCallbacks } from '../../store/undoMiddleware';

// Inside the component:
useEffect(() => {
  if (simulationState !== 'idle') {
    const unregister = registerSimulationCallbacks(
      (id) => {
        clientRef.current?.saveSnapshot(id);
        // wasmClientRef if active
      },
      (id) => {
        clientRef.current?.restoreSnapshot(id);
        // wasmClientRef if active
      },
    );
    return unregister;
  }
}, [simulationState]);
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add src/store/undoMiddleware.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(sim): integrate pre-edit snapshot with undo middleware"
```

---

### Task 8: Add Copilot Snapshot Tools + Context Builder Extension

**Files:**
- Modify: `src/copilot/action/tools/definitions/simulationTools.ts:1-209` (new tools)
- Modify: `src/copilot/perception/contextBuilder.ts:128-210` (extend context)

**Step 1: Add snapshot tools to simulationTools.ts**

Import the new Redux actions at the top of `simulationTools.ts`:

```typescript
import {
  setFabric as setFabricAction,
  setDefaultFabric,
  startSimulation as startSimAction,
  pauseSimulation as pauseSimAction,
  resetSimulation,
  setFitMapMode,
  updateFitMapConfig,
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
} from '../../../../store/simulationSlice';
```

Add new tool definitions before the `export const tools` array:

```typescript
// ─── saveSimulationState ────────────────────────────────────────────────────

const saveSimulationStateTool: ToolDefinition = {
  name: 'saveSimulationState',
  description:
    'Save the current 3D draping state as a named snapshot for later comparison. ' +
    '/ Guardar el estado actual de caída 3D como snapshot con nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable name for this state / Nombre legible para este estado' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const id = `copilot-${Date.now()}`;
    const state = getState?.();
    const particleCount = state?.simulation?.particleCount ?? 0;

    // Dispatch Redux metadata (worker save happens via event system)
    dispatch(addSnapshot({ id, name, particleCount, isAutoSave: false }));
    dispatch(setActiveSnapshot(id));

    // Emit custom event for GarmentSimulation to pick up
    window.dispatchEvent(new CustomEvent('openclo:snapshotSave', { detail: { id } }));

    return { success: true, data: { id, name, particleCount } };
  },
};

// ─── restoreSimulationState ─────────────────────────────────────────────────

const restoreSimulationStateTool: ToolDefinition = {
  name: 'restoreSimulationState',
  description:
    'Restore a previously saved draping state by name. ' +
    '/ Restaurar un estado de caída guardado previamente por nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the saved state / Nombre del estado guardado' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const state = getState?.();
    const snapshots = state?.simulation?.snapshots ?? [];
    const snap = snapshots.find((s: { name: string }) => s.name === name);
    if (!snap) {
      return { success: false, error: `No snapshot named "${name}" found` };
    }

    dispatch(setActiveSnapshot(snap.id));
    window.dispatchEvent(new CustomEvent('openclo:snapshotRestore', { detail: { id: snap.id } }));

    return { success: true, data: { restored: true, name: snap.name } };
  },
};

// ─── listSimulationStates ───────────────────────────────────────────────────

const listSimulationStatesTool: ToolDefinition = {
  name: 'listSimulationStates',
  description:
    'List all saved simulation state snapshots. ' +
    '/ Listar todos los snapshots de estado de simulación guardados.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState?.();
    const snapshots = state?.simulation?.snapshots ?? [];
    return {
      success: true,
      data: {
        snapshots: snapshots
          .filter((s: { isAutoSave: boolean }) => !s.isAutoSave)
          .map((s: { id: string; name: string; timestamp: number; particleCount: number }) => ({
            id: s.id,
            name: s.name,
            timestamp: s.timestamp,
            particleCount: s.particleCount,
          })),
      },
    };
  },
};

// ─── deleteSimulationState ──────────────────────────────────────────────────

const deleteSimulationStateTool: ToolDefinition = {
  name: 'deleteSimulationState',
  description:
    'Delete a saved simulation state snapshot by name. ' +
    '/ Eliminar un snapshot de estado de simulación por nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the state to delete / Nombre del estado a eliminar' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const state = getState?.();
    const snapshots = state?.simulation?.snapshots ?? [];
    const snap = snapshots.find((s: { name: string }) => s.name === name);
    if (!snap) {
      return { success: false, error: `No snapshot named "${name}" found` };
    }

    dispatch(removeSnapshot(snap.id));
    window.dispatchEvent(new CustomEvent('openclo:snapshotDelete', { detail: { id: snap.id } }));

    return { success: true, data: { deleted: true, name } };
  },
};
```

Add the new tools to the export:

```typescript
export const tools: ToolDefinition[] = [
  setFabricTool,
  listFabricsTool,
  startSimulationTool,
  pauseSimulationTool,
  setFitMapModeTool,
  configureFitMapTool,
  saveSimulationStateTool,
  restoreSimulationStateTool,
  listSimulationStatesTool,
  deleteSimulationStateTool,
];
```

**Step 2: Extend contextBuilder with snapshot metadata**

In `src/copilot/perception/contextBuilder.ts`, update the `buildAgentContext` function (line 128).

Update the `simulation` section of the return object:

```typescript
    simulation: {
      state: simulation.simulationState,
      pieceFabrics: simulation.pieceFabrics,
      snapshots: simulation.snapshots
        .filter(s => !s.isAutoSave)
        .map(s => ({ name: s.name, timestamp: s.timestamp })),
      hasPreEditSnapshot: simulation.snapshots.some(s => s.isAutoSave),
      particleCount: simulation.particleCount,
    },
```

Update the `AgentContext` interface's `simulation` field to include the new properties:

```typescript
  simulation: {
    state: string;
    pieceFabrics: Record<string, string>;
    snapshots: Array<{ name: string; timestamp: number }>;
    hasPreEditSnapshot: boolean;
    particleCount: number;
  };
```

Update `serializeContext` (line 205) to include snapshot info:

```typescript
  if (context.simulation.state !== 'idle') {
    parts.push(`\nSimulation: ${context.simulation.state} (${context.simulation.particleCount} particles)`);
    if (context.simulation.snapshots.length > 0) {
      parts.push(`Snapshots: ${context.simulation.snapshots.map(s => s.name).join(', ')}`);
    }
    if (context.simulation.hasPreEditSnapshot) {
      parts.push(`Pre-edit snapshot available (undo will restore draping)`);
    }
  }
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/action/tools/definitions/simulationTools.ts src/copilot/perception/contextBuilder.ts
git commit -m "feat(copilot): add snapshot management tools + context builder extension"
```

---

### Task 9: Final Integration Test + Cleanup

**Step 1: Run full test suite**

Run: `npm run test`
Expected: PASS (all tests)

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Manual verification checklist**

- [ ] Open app, start simulation
- [ ] Click "+" in SnapshotBar to save state "Version A"
- [ ] Edit pattern in 2D, verify simulation warm-starts (doesn't reset to flat)
- [ ] Click "Version A" chip to restore previous draping
- [ ] Ctrl+Z after pattern edit should restore both pattern and draping
- [ ] Save second state "Version B", toggle between A and B
- [ ] Delete a snapshot via × button
- [ ] Stop simulation — SnapshotBar should disappear

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat(sim): simulation state snapshots — complete implementation

- Worker snapshot save/restore/delete for CPU and WASM solvers
- Warm-start on pattern edit with position preservation
- Redux snapshot metadata with max 4 entries
- SnapshotBar UI: floating chip bar for A/B comparison
- Undo integration: pre-edit snapshot auto-saved and restored on Ctrl+Z
- Copilot tools: saveSimulationState, restoreSimulationState,
  listSimulationStates, deleteSimulationState
- Context builder: snapshot metadata in copilot context

Closes #126"
```

---

## Summary of Files Changed

| Action | File | Task |
|--------|------|------|
| Modify | `src/utils/cloth/clothWorker.ts` | 1, 2 |
| Modify | `src/utils/cloth/wasm/wasmSolverWorker.ts` | 3 |
| Modify | `src/utils/cloth/clothWorkerClient.ts` | 4 |
| Modify | `src/utils/cloth/wasm/wasmSolverClient.ts` | 6 |
| Modify | `src/store/simulationSlice.ts` | 4 |
| Modify | `src/store/__tests__/simulationSlice.test.ts` | 4 |
| Modify | `src/store/undoMiddleware.ts` | 7 |
| Create | `src/components/Viewport3D/SnapshotBar.tsx` | 5 |
| Create | `src/components/Viewport3D/SnapshotBar.css` | 5 |
| Modify | `src/components/Viewport3D/Viewport3D.tsx` | 5, 6 |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | 6, 7 |
| Modify | `src/copilot/action/tools/definitions/simulationTools.ts` | 8 |
| Modify | `src/copilot/perception/contextBuilder.ts` | 8 |
