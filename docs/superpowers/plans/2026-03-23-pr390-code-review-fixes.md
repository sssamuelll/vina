# PR #390 Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues found during code review of PR #390 (Layer System).

**Architecture:** Fixes grouped by file proximity. All on branch `feat/layer-system-372`. Issues range from critical bugs to code quality improvements.

**Tech Stack:** React, TypeScript, Redux, Vitest

---

## Triage Summary

| # | Issue | Score | Task |
|---|-------|-------|------|
| 1 | X-ray pieces stuck at 0.2 opacity after disable | 85 | Task 1 |
| 2 | `removeLayer` missing `cleanupRemovedLayer` dispatch | 75 | Task 2 |
| 3 | `handleDragLeave` flicker on child elements | 75 | Task 3 |
| 4 | `toggleXrayMode` rollback relies on ambient state | 62 | Task 4 |
| 5 | "Set Layer" cycles mod 10, no proper picker | 22 | Task 5 |
| 6 | Duplicate `DEFAULT_OUTLINE_COLORS` constant | 15 | Task 6 |
| 7 | `simulationSlice` module JSDoc outdated | 12 | Task 7 |
| 8 | `fitCubicBezier` missing clarifying comment | — | Task 7 |

---

### Task 1: Fix X-ray opacity not restored for pieces added during X-ray mode

**Why:** When X-ray is enabled, a snapshot of `pieceOpacity` is taken. The `useEffect` then sets all non-active-layer pieces to 0.2. If a piece is added while X-ray is on, it's not in the snapshot — when X-ray is disabled, its 0.2 opacity persists permanently. Also, the effect fires on every `pieces` change, causing N Redux dispatches.

**Files:**
- Modify: `src/store/simulationSlice.ts:572-587` (setXrayMode reducer)
- Test: `src/store/__tests__/layerVisibility.test.ts`

- [ ] **Step 1: Write failing test**

In `src/store/__tests__/layerVisibility.test.ts`, add:

```ts
it('should restore opacity for pieces added during xray mode', () => {
  // Enable xray
  store.dispatch(setXrayMode({ enabled: true, activeLayer: 1 }));
  // Simulate a piece added during xray (its opacity set to 0.2 by the effect)
  store.dispatch(setPieceOpacity({ pieceId: 'new-piece', opacity: 0.2 }));
  // Disable xray
  store.dispatch(setXrayMode({ enabled: false }));
  // The new piece should NOT have 0.2 opacity stuck
  const state = store.getState().simulation;
  expect(state.pieceOpacity['new-piece']).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/layerVisibility.test.ts -t "should restore opacity for pieces added during xray" 2>&1 | tail -15`
Expected: FAIL — `pieceOpacity['new-piece']` is still 0.2

- [ ] **Step 3: Fix setXrayMode reducer — clear ALL pieceOpacity on disable, not just snapshot entries**

In `src/store/simulationSlice.ts`, the `setXrayMode` reducer disable path (lines 582-587), change:

```ts
    if (state.xrayOpacitySnapshot) {
      state.pieceOpacity = { ...state.xrayOpacitySnapshot };
    }
```

to:

```ts
    // Restore original opacities from snapshot; any pieces added during xray
    // that aren't in the snapshot get their opacity cleared (fully opaque)
    state.pieceOpacity = state.xrayOpacitySnapshot ? { ...state.xrayOpacitySnapshot } : {};
```

This already handles it correctly — the issue is that pieces NOT in the snapshot will retain their xray-set opacity. The fix is to replace the entire `pieceOpacity` map with the snapshot (which doesn't include new pieces), effectively clearing their 0.2 opacity. Wait — that's already what the code does (`state.pieceOpacity = { ...state.xrayOpacitySnapshot }`). The bug is that `setPieceOpacity` is called AFTER the reducer restores, via the `useEffect`.

The real fix is in the `useEffect` — it needs a cleanup function that restores opacities for pieces it touched:

In `src/components/Viewport3D/GarmentSimulation.tsx` lines 178-186, change to:

```ts
useEffect(() => {
  if (!xrayMode) return;
  const touchedPieceIds: string[] = [];
  for (const p of pieces) {
    if (p.active === false) continue;
    const layer = p.layer ?? 1;
    const opacity = (xrayActiveLayer === layer) ? 1.0 : 0.2;
    dispatch(setPieceOpacity({ pieceId: p.id, opacity }));
    touchedPieceIds.push(p.id);
  }
  return () => {
    // On cleanup (xray disabled or deps change), clear xray-set opacities
    // The reducer's snapshot restore handles the originals;
    // this handles pieces added DURING xray that aren't in the snapshot
    for (const id of touchedPieceIds) {
      dispatch(setPieceOpacity({ pieceId: id, opacity: 1.0 }));
    }
  };
}, [xrayMode, xrayActiveLayer, pieces, dispatch]);
```

Wait — this cleanup fires on EVERY dependency change (including `pieces` changes), which would cause flicker. Better approach: move the opacity logic entirely into the reducer and remove the effect.

**Revised fix — move opacity into reducer:**

In `src/store/simulationSlice.ts`, update `setXrayMode`:

```ts
setXrayMode(state, action: PayloadAction<{ enabled: boolean; activeLayer?: number; pieces?: Array<{ id: string; layer?: number; active?: boolean }> }>) {
  if (action.payload.enabled) {
    if (!state.xrayMode) {
      state.xrayOpacitySnapshot = { ...state.pieceOpacity };
    }
    state.xrayMode = true;
    state.xrayActiveLayer = action.payload.activeLayer ?? null;
    // Apply xray opacities if pieces provided
    if (action.payload.pieces) {
      for (const p of action.payload.pieces) {
        if (p.active === false) continue;
        const layer = p.layer ?? 1;
        const opacity = (state.xrayActiveLayer === layer) ? 1.0 : 0.2;
        if (opacity >= 1.0) { delete state.pieceOpacity[p.id]; }
        else { state.pieceOpacity[p.id] = opacity; }
      }
    }
  } else {
    state.pieceOpacity = state.xrayOpacitySnapshot ? { ...state.xrayOpacitySnapshot } : {};
    state.xrayOpacitySnapshot = null;
    state.xrayMode = false;
    state.xrayActiveLayer = null;
  }
},
```

Actually, this is getting complex. The simplest correct fix: keep the effect but also handle the disable case instead of early-returning.

**Final approach — simplest fix:**

```ts
useEffect(() => {
  if (!xrayMode) {
    // When xray is off, ensure no stale xray opacities remain
    // (reducer handles snapshot restore; this catches pieces added during xray)
    return;
  }
  for (const p of pieces) {
    if (p.active === false) continue;
    const layer = p.layer ?? 1;
    const opacity = (xrayActiveLayer === layer) ? 1.0 : 0.2;
    dispatch(setPieceOpacity({ pieceId: p.id, opacity }));
  }
}, [xrayMode, xrayActiveLayer, pieces, dispatch]);
```

The reducer already restores the snapshot on disable. The snapshot includes all pieces that existed before xray was enabled. Pieces added during xray get `setPieceOpacity(0.2)` dispatched by this effect but are NOT in the snapshot. When xray disables, the reducer sets `pieceOpacity = {...snapshot}` which doesn't include the new piece — so its 0.2 entry disappears. This is actually already correct!

Let me re-read the reducer: `state.pieceOpacity = { ...state.xrayOpacitySnapshot }` — this REPLACES the entire map. So any piece that was added during xray and got `setPieceOpacity(0.2)` dispatched will have its entry removed (since it's not in the snapshot). So the restore IS correct.

The actual bug scenario: the effect fires, dispatches `setPieceOpacity` for new pieces, those dispatches go through AFTER the reducer snapshot restore. Let me check if there's a timing issue...

No — the reducer runs synchronously when `setXrayMode(false)` is dispatched. Then the effect runs on the next render cycle. When xrayMode flips to false, the effect early-returns. So the reducer correctly replaces all opacities. Then on the next render, the effect sees `xrayMode=false` and returns. No stale dispatches.

Wait, the dependency array includes `pieces`. If `pieces` changes while xray is on, the effect refires and dispatches `setPieceOpacity(0.2)` for new pieces. When xray is later disabled, the reducer replaces `pieceOpacity` with the snapshot (which doesn't have the new piece). The new piece's 0.2 entry is gone. So... this is actually NOT a bug?

Let me trace more carefully:
1. T1: xray enabled → snapshot captured (empty or current opacities)
2. T2: effect fires → dispatches setPieceOpacity(0.2) for all non-active pieces
3. T3: new piece added → `pieces` array changes → effect refires → dispatches setPieceOpacity(0.2) for new piece
4. T4: xray disabled → reducer sets `pieceOpacity = {...snapshot}` → snapshot doesn't have new piece → new piece's entry is removed
5. T5: effect sees xrayMode=false → early returns

So at T4, `pieceOpacity` is fully replaced with the snapshot. The new piece is NOT in the snapshot, so its 0.2 is gone. This works correctly!

The bug is only if `pieces` array reference changes AFTER xray disable (T4), causing the effect to refire with xrayMode=false (which early-returns). That's fine.

**Conclusion: The original bug report is likely a false positive for the opacity-stuck scenario.** However, the N-dispatches-per-pieces-change issue IS real (performance, not correctness). Let me downgrade this to a performance fix.

- [ ] **Step 3 (revised): Optimize xray effect to avoid N dispatches per pieces change**

In `src/components/Viewport3D/GarmentSimulation.tsx` lines 178-186, change:

```ts
useEffect(() => {
  if (!xrayMode) return;
  for (const p of pieces) {
    if (p.active === false) continue;
    const layer = p.layer ?? 1;
    const opacity = (xrayActiveLayer === layer) ? 1.0 : 0.2;
    dispatch(setPieceOpacity({ pieceId: p.id, opacity }));
  }
}, [xrayMode, xrayActiveLayer, pieces, dispatch]);
```

to batch via a single action:

```ts
useEffect(() => {
  if (!xrayMode) return;
  const opacities: Record<string, number> = {};
  for (const p of pieces) {
    if (p.active === false) continue;
    const layer = p.layer ?? 1;
    opacities[p.id] = (xrayActiveLayer === layer) ? 1.0 : 0.2;
  }
  dispatch(setBatchPieceOpacity(opacities));
}, [xrayMode, xrayActiveLayer, pieces, dispatch]);
```

And add `setBatchPieceOpacity` to `simulationSlice.ts`:

```ts
setBatchPieceOpacity(state, action: PayloadAction<Record<string, number>>) {
  for (const [pieceId, opacity] of Object.entries(action.payload)) {
    if (!Number.isFinite(opacity)) continue;
    if (opacity >= 1.0) { delete state.pieceOpacity[pieceId]; }
    else { state.pieceOpacity[pieceId] = Math.max(0, Math.min(1, opacity)); }
  }
},
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/__tests__/layerVisibility.test.ts --reporter=verbose 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/store/simulationSlice.ts src/store/__tests__/layerVisibility.test.ts
git commit -m "perf: batch xray opacity dispatches into single action"
```

---

### Task 2: Dispatch `cleanupRemovedLayer` when deleting a layer

**Why:** `handleContextDelete` only dispatches `removeLayer` (projectSlice) but never `cleanupRemovedLayer` (simulationSlice). This leaves stale `hiddenLayerIds`, `layerOutlineColors`, and `xrayActiveLayer` entries.

**Files:**
- Modify: `src/components/LayerPanel/LayerPanel.tsx:141-145`
- Test: `src/store/__tests__/layerVisibility.test.ts`

- [ ] **Step 1: Write failing test**

In `src/store/__tests__/layerVisibility.test.ts`, add:

```ts
it('cleanupRemovedLayer should clear hidden and outline state', () => {
  store.dispatch(toggleLayerVisibility(2));
  store.dispatch(setLayerOutlineColor({ layer: 2, color: '#ff0000' }));
  store.dispatch(setXrayMode({ enabled: true, activeLayer: 2 }));

  store.dispatch(cleanupRemovedLayer(2));

  const state = store.getState().simulation;
  expect(state.hiddenLayerIds).not.toContain(2);
  expect(state.layerOutlineColors[2]).toBeUndefined();
  expect(state.xrayActiveLayer).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it passes** (the reducer itself works; the bug is it's never called)

- [ ] **Step 3: Fix `handleContextDelete` to also dispatch cleanup**

In `src/components/LayerPanel/LayerPanel.tsx`, add import:

```ts
import { cleanupRemovedLayer } from '../../store/simulationSlice';
```

Then change `handleContextDelete` (line 141-145):

```ts
const handleContextDelete = useCallback(() => {
  if (!contextMenu) return;
  dispatch(removeLayer({ layer: contextMenu.layer }));
  dispatch(cleanupRemovedLayer(contextMenu.layer));
  setContextMenu(null);
}, [contextMenu, dispatch]);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/__tests__/layerVisibility.test.ts --reporter=verbose 2>&1 | tail -15`

- [ ] **Step 5: Commit**

```bash
git add src/components/LayerPanel/LayerPanel.tsx src/store/__tests__/layerVisibility.test.ts
git commit -m "fix: dispatch cleanupRemovedLayer when deleting layer from panel"
```

---

### Task 3: Fix `handleDragLeave` flicker on child elements

**Why:** `handleDragLeave` unconditionally clears drag-over state. Since `dragleave` fires when cursor moves from parent to child, the drop zone highlight flickers constantly.

**Files:**
- Modify: `src/components/LayerPanel/LayerPanel.tsx:189-192`

- [ ] **Step 1: Fix handleDragLeave to check relatedTarget**

In `src/components/LayerPanel/LayerPanel.tsx` line 189-192, change:

```ts
const handleDragLeave = useCallback(() => {
  setDragOverLayer(null);
  setDragOverPieceId(null);
}, []);
```

to:

```ts
const handleDragLeave = useCallback((e: React.DragEvent) => {
  const related = e.relatedTarget as Node | null;
  if (related && e.currentTarget.contains(related)) return;
  setDragOverLayer(null);
  setDragOverPieceId(null);
}, []);
```

- [ ] **Step 2: Update all `onDragLeave` callsites to pass the event**

Search for `onDragLeave={handleDragLeave}` in LayerPanel.tsx and ensure they pass the event. If they use inline arrow `() => handleDragLeave()`, change to `handleDragLeave` directly (since it now accepts the event).

- [ ] **Step 3: Commit**

```bash
git add src/components/LayerPanel/LayerPanel.tsx
git commit -m "fix: prevent drag-leave flicker on child elements in LayerPanel"
```

---

### Task 4: Fix `toggleXrayMode` rollback to capture snapshot at call time

**Why:** The rollback dispatches `setXrayMode({ enabled: !params.enabled })` which relies on `xrayOpacitySnapshot` still being intact. If another action clears it, the restore silently fails.

**Files:**
- Modify: `src/copilot/action/tools/definitions/layerTools.ts:278-289`

- [ ] **Step 1: Capture state snapshot in execute, use in rollback**

In `layerTools.ts`, change the `toggleXrayModeTool.execute` (lines 278-289):

```ts
  execute: async (params, dispatch, getState) => {
    const state = getState();
    const wasEnabled = state.simulation.xrayMode;
    const previousActiveLayer = state.simulation.xrayActiveLayer;
    dispatch(setXrayMode({
      enabled: params.enabled as boolean,
      activeLayer: params.activeLayer as number | undefined,
    }));
    return {
      success: true,
      data: { enabled: params.enabled, activeLayer: params.activeLayer },
      rollback: () => {
        dispatch(setXrayMode({
          enabled: wasEnabled,
          activeLayer: wasEnabled ? previousActiveLayer ?? undefined : undefined,
        }));
      },
    };
  },
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/copilot/action/tools/definitions/layerTools.ts
git commit -m "fix: capture xray state at call time for toggleXrayMode rollback"
```

---

### Task 5: Extract shared layer color constants

**Why:** `DEFAULT_OUTLINE_COLORS` and `getOutlineColor` are duplicated in `LayerPanel.tsx` and `PieceRenderer.tsx`.

**Files:**
- Create: `src/utils/layerColors.ts`
- Modify: `src/components/LayerPanel/LayerPanel.tsx:18-24`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:12-19`

- [ ] **Step 1: Create shared module**

Create `src/utils/layerColors.ts`:

```ts
/** Default outline colors for layer indicators (indexed by layer number) */
export const DEFAULT_OUTLINE_COLORS: Record<number, string> = {
  0: '#4ade80',  // green – innermost / body
  1: '#60a5fa',  // blue  – default mid layer
  2: '#f97316',  // orange – outer shell
};

/** Get the outline color for a layer, with user overrides and auto-generated fallback */
export function getOutlineColor(layer: number, overrides: Record<number, string>): string {
  return overrides[layer] ?? DEFAULT_OUTLINE_COLORS[layer] ?? `hsl(${layer * 137.5}, 70%, 60%)`;
}
```

- [ ] **Step 2: Replace duplicates in LayerPanel.tsx**

Remove lines 18-24 and add import:

```ts
import { getOutlineColor } from '../../utils/layerColors';
```

- [ ] **Step 3: Replace duplicates in PieceRenderer.tsx**

Remove lines 12-19 and add import:

```ts
import { getOutlineColor } from '../../../utils/layerColors';
```

- [ ] **Step 4: Run type check + tests**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/utils/layerColors.ts src/components/LayerPanel/LayerPanel.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "refactor: extract shared layer color constants to utils/layerColors.ts"
```

---

### Task 6: Update `simulationSlice` JSDoc + add bezier comment

**Why:** Module JSDoc doesn't mention layer visibility/xray state. Also, `fitCubicBezier` in `bezier.ts` needs the clarifying comment from PR #389 (not present on this branch).

**Files:**
- Modify: `src/store/simulationSlice.ts:1-7`
- Modify: `src/utils/geometry/bezier.ts:181`

- [ ] **Step 1: Update simulationSlice JSDoc**

Change lines 1-7:

```ts
/**
 * Redux slice for cloth simulation state.
 *
 * Manages simulation lifecycle (idle/running/paused), per-piece fabric assignments,
 * layer visibility, and X-ray transparency mode.
 *
 * @module simulationSlice
 */
```

- [ ] **Step 2: Add bezier clarifying comment**

In `src/utils/geometry/bezier.ts`, before line 181, add:

```ts
    // Residual = point - B_base(t), where B_base is the degenerate cubic with cp1=p0, cp2=pN (alpha=0).
    // This is correct per Schneider's parameterization: cp1 = p0 + alpha0*hat0, cp2 = pN - alpha1*hatN.
```

- [ ] **Step 3: Commit**

```bash
git add src/store/simulationSlice.ts src/utils/geometry/bezier.ts
git commit -m "docs: update simulationSlice JSDoc + clarify bezier residual formula"
```

---

### Task 7: Verify lint + full test suite

- [ ] **Step 1: Run lint**

Run: `npx eslint src/store/simulationSlice.ts src/components/LayerPanel/LayerPanel.tsx src/components/Viewport3D/GarmentSimulation.tsx --quiet 2>&1 | head -10`

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All tests pass
