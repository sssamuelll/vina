# Per-Piece Freeze Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to freeze individual pattern pieces during simulation so they stay static while other pieces drape around them.

**Architecture:** Frozen pieces have `invMass[v] = 0` for all their vertices, which the XPBD solver already treats as immovable (all kernels check `if (invMass > 0)`). A `freezePieces()` method on `GpuSolverClient` writes to the CPU-side `invMassSBA.array` and bumps `.version` to trigger GPU re-upload. Redux state + useEffect drives the sync (same pattern as pin sync in `useCollisionBodies`).

**Tech Stack:** Redux Toolkit, React (useEffect/useSelector), Three.js StorageBufferAttribute, Vitest

---

### Task 1: Redux State — `frozenPieceIds`

**Files:**
- Modify: `src/store/simulationSlice.ts`
- Create: `src/store/__tests__/simulationSlice.freeze.test.ts`

**Step 1: Write the failing test**

Create `src/store/__tests__/simulationSlice.freeze.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  toggleFreezePiece,
  unfreezeAllPieces,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('frozenPieceIds state', () => {
  it('starts with empty frozenPieceIds', () => {
    const store = createStore();
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });

  it('toggleFreezePiece adds piece to frozenPieceIds', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    expect(store.getState().simulation.frozenPieceIds).toEqual(['piece-1']);
  });

  it('toggleFreezePiece removes piece if already frozen', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-1'));
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });

  it('toggleFreezePiece handles multiple pieces', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-2'));
    expect(store.getState().simulation.frozenPieceIds).toEqual(['piece-1', 'piece-2']);
  });

  it('unfreezeAllPieces clears all frozen pieces', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-2'));
    store.dispatch(unfreezeAllPieces());
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/simulationSlice.freeze.test.ts`
Expected: FAIL — `toggleFreezePiece` and `unfreezeAllPieces` not exported

**Step 3: Implement**

In `src/store/simulationSlice.ts`:

1. Add to `SimulationSliceState` interface (after `dragCoefficient: number`):
```typescript
frozenPieceIds: string[];
```

2. Add to `initialState` (after `dragCoefficient: 1.0`):
```typescript
frozenPieceIds: [],
```

3. Add reducers (after `setDragCoefficient`):
```typescript
toggleFreezePiece(state, action: PayloadAction<string>) {
  const idx = state.frozenPieceIds.indexOf(action.payload);
  if (idx >= 0) {
    state.frozenPieceIds.splice(idx, 1);
  } else {
    state.frozenPieceIds.push(action.payload);
  }
},
unfreezeAllPieces(state) {
  state.frozenPieceIds = [];
},
```

4. Export the new actions in the destructured export at the bottom.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/simulationSlice.freeze.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/store/simulationSlice.ts src/store/__tests__/simulationSlice.freeze.test.ts
git commit -m "feat(state): add frozenPieceIds state and actions to simulationSlice (#302)"
```

---

### Task 2: Expose Piece Vertex Ranges from GpuSolverClient

The GPU solver merges all pieces into one buffer. To freeze a specific piece we need to know which vertices belong to it. Currently `vertexOffsets` is a local variable in `initMultiPieceTsl()` — we need to persist it.

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`
- Modify: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`

**Step 1: Write the failing test**

Add to `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`:

```typescript
describe('getPieceVertexRanges', () => {
  it('returns null before init', () => {
    // GpuSolverClient needs a GPUDevice, which is mocked in test setup
    // Just verify the method exists and returns null
    expect(typeof GpuSolverClient.prototype.getPieceVertexRanges).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: FAIL — `getPieceVertexRanges` not a function

**Step 3: Implement**

In `src/utils/cloth/gpu/gpuSolverClient.ts`:

1. Add private field (after `private tslBuffers`):
```typescript
private pieceVertexRanges: Map<string, { start: number; count: number }> | null = null;
```

2. In `initMultiPieceTsl()`, after the `vertexOffsets` loop (after line 218, before `const positions`), build and store the ranges:
```typescript
// Store piece vertex ranges for freeze/unfreeze support
this.pieceVertexRanges = new Map();
for (const p of pieces) {
  const start = vertexOffsets.get(p.pieceId) ?? 0;
  const count = p.vertices.length / 3;
  this.pieceVertexRanges.set(p.pieceId, { start, count });
}
```

3. Add a public getter:
```typescript
/**
 * Get vertex ranges for each piece in the merged mesh.
 * Returns null if solver not initialized.
 */
getPieceVertexRanges(): Map<string, { start: number; count: number }> | null {
  return this.pieceVertexRanges;
}
```

4. In `dispose()`, clear it:
```typescript
this.pieceVertexRanges = null;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(gpu): expose piece vertex ranges from GpuSolverClient (#302)"
```

---

### Task 3: Add `freezePieces()` Method to GpuSolverClient

This method writes to the invMass buffer from the CPU side to freeze/unfreeze vertices.

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`

**Step 1: Write the failing test**

Add to `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`:

```typescript
describe('freezePieces', () => {
  it('is a method on GpuSolverClient', () => {
    expect(typeof GpuSolverClient.prototype.freezePieces).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/utils/cloth/gpu/gpuSolverClient.ts`:

1. Add private field for original invMass backup (after `pieceVertexRanges`):
```typescript
private originalInvMass: Float32Array | null = null;
```

2. In `initMultiPieceTsl()`, after creating `invMass` array and filling it (after the piece loop around line 245), save a copy:
```typescript
this.originalInvMass = new Float32Array(invMass);
```

3. Add the method:
```typescript
/**
 * Freeze/unfreeze pieces by setting invMass=0 for frozen vertices.
 * Restores original invMass for unfrozen vertices.
 * Bumps SBA version to trigger GPU buffer re-upload.
 */
freezePieces(frozenPieceIds: string[]): void {
  if (!this.tslBuffers || !this.originalInvMass || !this.pieceVertexRanges) return;

  const invMassArr = this.tslBuffers.invMassSBA.array as Float32Array;
  // Restore all to original values first
  invMassArr.set(this.originalInvMass);

  // Zero out invMass for frozen pieces
  const frozenSet = new Set(frozenPieceIds);
  for (const [pieceId, range] of this.pieceVertexRanges) {
    if (frozenSet.has(pieceId)) {
      for (let i = range.start; i < range.start + range.count; i++) {
        invMassArr[i] = 0;
      }
    }
  }

  // Bump version to trigger GPU buffer re-upload on next render
  this.tslBuffers.invMassSBA.version++;
}
```

4. In `dispose()`, clear backup:
```typescript
this.originalInvMass = null;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(gpu): add freezePieces() method to GpuSolverClient (#302)"
```

---

### Task 4: Wire Redux Freeze State to GPU Solver

Follow the same `useEffect` pattern as pin sync in `useCollisionBodies.ts`.

**Files:**
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts`

**Step 1: Implement**

In `src/components/Viewport3D/useSimulationLifecycle.ts`:

1. Add import:
```typescript
import { useSelector } from 'react-redux';
```
(If not already imported — check current imports.)

2. Add selector (near other selectors):
```typescript
const frozenPieceIds = useSelector((s: RootState) => s.simulation.frozenPieceIds);
```

3. Add useEffect to sync freeze state to GPU solver (after the wind sync effect):
```typescript
// Sync frozen pieces to GPU solver — set invMass=0 for frozen vertices
useEffect(() => {
  if (!gpuClientRef.current) return;
  gpuClientRef.current.freezePieces(frozenPieceIds);
}, [frozenPieceIds]);
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/Viewport3D/useSimulationLifecycle.ts
git commit -m "feat(gpu): wire Redux frozenPieceIds to GPU solver via useEffect (#302)"
```

---

### Task 5: Freeze UI in SimulationView

Add per-piece freeze checkboxes to the sidebar. Follow the existing "Piece Fabrics" section pattern.

**Files:**
- Modify: `src/components/Sidebar/SimulationView.tsx`

**Step 1: Implement**

In `src/components/Sidebar/SimulationView.tsx`:

1. Add imports:
```typescript
import { toggleFreezePiece } from '../../store/simulationSlice';
```
(Add to the existing import from simulationSlice.)

2. Add selector:
```typescript
const frozenPieceIds = useSelector((s: RootState) => s.simulation.frozenPieceIds);
```

3. Add freeze section after the "Piece Fabrics" `</div>` (after line 286, before the closing `</div>`):

```tsx
{/* Per-Piece Freeze */}
{pieces.length > 0 && (
  <div style={{ marginTop: '12px' }}>
    <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
      Freeze Pieces
    </label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {pieces.map(p => {
        const isFrozen = frozenPieceIds.includes(p.id);
        return (
          <label key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            cursor: 'pointer', fontSize: '11px', color: isFrozen ? '#8ab4f8' : '#aaa',
          }}>
            <input
              type="checkbox"
              checked={isFrozen}
              onChange={() => dispatch(toggleFreezePiece(p.id))}
            />
            <span>{p.name}</span>
            {isFrozen && <span style={{ fontSize: '10px', color: '#668' }}>frozen</span>}
          </label>
        );
      })}
    </div>
  </div>
)}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/Sidebar/SimulationView.tsx
git commit -m "feat(ui): add per-piece freeze toggles to SimulationView (#302)"
```

---

### Task 6: Fix Mock State in Existing Tests

Adding `frozenPieceIds` to `SimulationSliceState` will break test files that mock the state without the new field.

**Files:**
- Modify: `src/components/Viewport3D/__tests__/FitMapToggle.test.tsx`
- Modify: `src/copilot/perception/__tests__/contextBuilder.test.ts`

**Step 1: Run type check to find failures**

Run: `npx tsc --noEmit 2>&1 | grep frozenPieceIds`

If any test files have inline mock `SimulationSliceState` objects missing `frozenPieceIds`, add:
```typescript
frozenPieceIds: [],
```

**Step 2: Fix each file**

In `src/components/Viewport3D/__tests__/FitMapToggle.test.tsx`, add `frozenPieceIds: [],` to the mock state (after `dragCoefficient: 1.0`).

In `src/copilot/perception/__tests__/contextBuilder.test.ts`, add `frozenPieceIds: [],` to the first mock state (the one with explicit types; the second uses `as unknown as RootState` and won't need it).

**Step 3: Run full test suite**

Run: `npx vitest run src/utils/cloth/gpu/ src/store/__tests__/simulationSlice.freeze.test.ts`
Expected: All pass

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/Viewport3D/__tests__/FitMapToggle.test.tsx src/copilot/perception/__tests__/contextBuilder.test.ts
git commit -m "fix: add frozenPieceIds to mock SimulationSliceState in tests (#302)"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Redux state + actions | `simulationSlice.freeze.test.ts` | `simulationSlice.ts` |
| 2 | Expose piece vertex ranges | — | `gpuSolverClient.ts`, test |
| 3 | `freezePieces()` method | — | `gpuSolverClient.ts`, test |
| 4 | Wire Redux → GPU solver | — | `useSimulationLifecycle.ts` |
| 5 | Freeze UI controls | — | `SimulationView.tsx` |
| 6 | Fix test mocks + verify | — | `FitMapToggle.test.tsx`, `contextBuilder.test.ts` |
