# PR #389 Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 13 issues found during code review of PR #389 (Pattern Edit Phase 2).

**Architecture:** Fixes are grouped by file proximity. Each task targets a specific file with a focused change. All fixes are on branch `feat/pattern-edit-phase2-384`.

**Tech Stack:** React, TypeScript, Redux, Vitest

---

## Triage Summary

| # | Issue | Verdict | Task |
|---|-------|---------|------|
| 1 | `fitCubicBezier` residual formula | **False positive** — code correctly implements Schneider's parameterization (cp1=p0, cp2=pN when alpha=0) | Task 1 (comment only) |
| 2 | `offsetInternalLine` alias mutation | Real (low risk) | Task 2 |
| 3 | `unfoldPiece` Z-command assertion | Real (low risk) | Task 3 |
| 4 | `polyPenDraw` uses `Date.now()` for IDs | Real | Task 4 |
| 5 | `'reference'` line not rendered distinctly | Real | Task 5 |
| 6 | Context menu callbacks not wired | Real | Task 6 |
| 7 | PolyPen tool not wired into editor | Real | Task 6 |
| 8 | PolyPen `Y` shortcut not registered | Real | Task 7 |
| 9 | `extendEdge` tangent inversion | Real (pre-existing) | Task 3 |
| 10 | `offsetInternalLine` copilot `count` not validated | Real | Task 8 |
| 11 | `polyPenDraw` copilot coords not validated | Real | Task 8 |
| 12 | `optimizePieceCurves` stale edges | Real | Task 2 |
| 13 | `view.xrayMode` shortcut not wired | Not actionable — `setXrayMode` action doesn't exist yet | N/A |

---

### Task 1: Add clarifying comment to `fitCubicBezier`

**Why:** Issue #1 was flagged as a bug but the residual formula is correct per Schneider's parameterization. Add a comment explaining why so future reviewers don't flag it again.

**Files:**
- Modify: `src/utils/geometry/bezier.ts:181-182`

- [ ] **Step 1: Add explanatory comment**

In `src/utils/geometry/bezier.ts`, before line 181, add:

```ts
    // Residual = point - B_base(t), where B_base is the degenerate cubic with cp1=p0, cp2=pN (alpha=0).
    // This is correct per Schneider's parameterization: cp1 = p0 + alpha0*hat0, cp2 = pN - alpha1*hatN.
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts --reporter=verbose`
Expected: All 76 tests pass (63 patternOps + 13 bezier)

- [ ] **Step 3: Commit**

```bash
git add src/utils/geometry/bezier.ts
git commit -m "docs: clarify fitCubicBezier residual formula (Schneider parameterization)"
```

---

### Task 2: Fix `optimizePieceCurves` stale edges + `offsetInternalLine` defensive copy

**Why:** Issue #12: `optimizePieceCurves` modifies the outline but spreads stale `edges` from the input piece. Every other outline-modifying function sets `edges: undefined` or calls `detectSemanticEdges()`. Issue #2: `finalPts = offsetPts` is an alias — make a defensive copy.

**Files:**
- Modify: `src/utils/patternOps.ts:1006` (optimizePieceCurves return)
- Modify: `src/utils/patternOps.ts:1066` (offsetInternalLine finalPts)
- Test: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing test for stale edges**

In `src/utils/__tests__/patternOps.test.ts`, add a test in the `optimizePieceCurves` describe block:

```ts
it('should invalidate edges when outline changes', () => {
  const pieceWithEdges = {
    ...mockPiece,
    outline: mockPiece.outline,
    edges: [{ id: 'e1', segmentRange: [1, 3], type: 'hem' }],
  };
  const result = optimizePieceCurves(pieceWithEdges);
  expect(result.edges).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "should invalidate edges"`
Expected: FAIL — `result.edges` still contains stale edges

- [ ] **Step 3: Fix `optimizePieceCurves` — invalidate edges**

In `src/utils/patternOps.ts` line 1006, change the return to include `edges: undefined`:

```ts
  return { ...piece, id: piece.id, outline: newOutline, internals: newInternals, edges: undefined, updatedAt: Date.now() };
```

- [ ] **Step 4: Fix `offsetInternalLine` — defensive copy**

In `src/utils/patternOps.ts` line 1066, change:

```ts
    let finalPts = offsetPts;
```

to:

```ts
    const finalPts = [...offsetPts];
```

Note: this also fixes the CI lint error (`prefer-const`) — the `finalPts` binding is never reassigned, so `const` is correct even though elements are mutated via index assignment.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts --reporter=verbose`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "fix: invalidate edges in optimizePieceCurves + defensive copy in offsetInternalLine"
```

---

### Task 3: Guard `unfoldPiece` against Z-terminated fold lines + fix `extendEdge` tangent

**Why:** Issue #3: `cmdEndpoint` returns `null` for Z commands, and the `!` assertion on `foldEnd` is unsafe. Issue #9: `extendEdge` Bezier start-tangent is inverted (pre-existing bug, fixing while here).

**Files:**
- Modify: `src/utils/patternOps.ts:834` (unfoldPiece foldEnd)
- Modify: `src/utils/patternOps.ts:694` (extendEdge tangent)
- Test: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing test for Z-terminated fold line**

In `src/utils/__tests__/patternOps.test.ts`, in the `unfoldPiece` describe block, add:

```ts
it('should handle fold line ending with Z without crashing', () => {
  const pieceWithZFold = {
    ...mockPiece,
    internals: [{
      id: 'zfold', type: 'fold' as const,
      path: [
        { type: 'M', values: [50, 0] },
        { type: 'L', values: [50, 100] },
        { type: 'Z', values: [] },
      ],
    }],
  };
  // Should either succeed or throw a clear error, NOT a TypeError
  expect(() => unfoldPiece(pieceWithZFold, 'zfold')).not.toThrow(TypeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "should handle fold line ending with Z"`
Expected: FAIL with TypeError

- [ ] **Step 3: Fix `unfoldPiece` — safe foldEnd extraction**

In `src/utils/patternOps.ts` line 834, change:

```ts
  const foldEnd = cmdEndpoint(foldLine.path[foldLine.path.length - 1])!;
```

to:

```ts
  // Skip trailing Z commands to find the actual endpoint
  let foldEndCmd = foldLine.path[foldLine.path.length - 1];
  if (foldEndCmd.type === 'Z' && foldLine.path.length > 1) {
    foldEndCmd = foldLine.path[foldLine.path.length - 2];
  }
  const foldEnd = cmdEndpoint(foldEndCmd);
  if (!foldEnd) throw new Error('Cannot determine fold line endpoint');
```

- [ ] **Step 4: Confirm `extendEdge` tangent is correct (no change needed)**

The direction `start - cp1` = `-(cp1 - start)` is the negated forward tangent at t=0, which is the correct backward-extension direction. No code change required. Issue #9 is a false positive.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts --reporter=verbose`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "fix: guard unfoldPiece against Z-terminated fold lines"
```

---

### Task 4: Fix `polyPenDraw` ID generation

**Why:** Issue #4: `polyPenDraw` copilot tool uses `Date.now()` for piece/line IDs which can collide in rapid calls. Should use a pattern consistent with `uid()` in patternOps.ts.

**Files:**
- Modify: `src/copilot/action/tools/definitions/patternOpsTools.ts:601,611`

- [ ] **Step 1: Add a local uid helper at the top of patternOpsTools.ts**

After the `requireFiniteNumber` function (line ~11), add:

```ts
function uid(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
```

- [ ] **Step 2: Replace Date.now() ID usages**

Line 601: change `id: \`piece-${Date.now()}\`` to `id: uid('piece')`
Line 611: change `const lineId = \`line-${Date.now()}\`` to `const lineId = uid('line')`

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/copilot/action/tools/definitions/patternOpsTools.ts
git commit -m "fix: use uid() for ID generation in polyPenDraw copilot tool"
```

---

### Task 5: Add `'reference'` line rendering to PieceRenderer

**Why:** Issue #5: The `'reference'` InternalLineType is used by `replaceAsPatternOutline` but PieceRenderer falls through to default gray rendering. Reference lines should render as dashed dark gray at reduced opacity.

**Files:**
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:128-143`

- [ ] **Step 1: Add reference branch to stroke color**

In `PieceRenderer.tsx` line 134, after the `'topstitch'` line and before the `'#888'` default, add:

```ts
                line.type === 'reference' ? '#999' :
```

- [ ] **Step 2: Add reference branch to strokeDasharray**

In `PieceRenderer.tsx` line 140, after the `'topstitch'` dasharray line and before `'none'`, add:

```ts
                line.type === 'reference' ? `${4 / zoom2D} ${4 / zoom2D}` :
```

- [ ] **Step 3: Add reference branch to opacity**

In `PieceRenderer.tsx` line 143, update the opacity to handle reference lines:

```ts
              opacity={
                line.type === 'grainline' && !showGrainlines ? 0 :
                line.type === 'reference' ? 0.6 :
                isLineSelected ? 1 : 0.7
              }
```

- [ ] **Step 4: Visual verification note**

No automated test — this is a visual rendering change. Manual check: create a reference line via `replaceAsPatternOutline` and verify it renders as dashed dark gray (#999) at 0.6 opacity.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat: render reference internal lines with dashed gray style"
```

---

### Task 6: Wire PolyPen tool + context menu callbacks into PatternEditor

**Why:** Issues #6 and #7: `ContextMenu` defines `onUnfold`/`onOffsetInternalLine`/`onOptimizeCurves` props but they're never passed. `usePolyPenTool` and `PolyPenToolOverlay` exist but aren't imported or used.

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx:1-30` (imports)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:407-413` (ContextMenu render)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (add handlers + hook call + overlay)

- [ ] **Step 1: Add imports to PatternEditor.tsx**

After the existing tool hook imports (around line 27), add:

```ts
import { usePolyPenTool } from './usePolyPenTool';
import PolyPenToolOverlay from './renderers/overlays/PolyPenToolOverlay';
```

Also add the patternOps imports needed for the context menu handlers:

```ts
import { unfoldPiece, offsetInternalLine, optimizePieceCurves } from '../../utils/patternOps';
```

- [ ] **Step 2: Initialize usePolyPenTool hook**

Inside the PatternEditor component, after the other tool hooks, add:

```ts
const polyPen = usePolyPenTool(
  zoom2D, pan2D,
  (cmds, opts) => {
    const id = `piece-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    dispatch(addPiece({ id, name: 'Poly Pen Piece', outline: cmds, internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, ...opts }));
  },
  (cmds, lineType) => {
    if (selectedPieceIds.length !== 1) return;
    const pid = selectedPieceIds[0];
    const piece = pieces.find(p => p.id === pid);
    if (!piece) return;
    dispatch(addInternalLine({ pieceId: pid, line: { id: `line-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type: lineType, path: cmds } }));
  },
  toolOptions?.mode ?? 'piece',
  toolOptions?.lineType ?? 'fold',
);
```

- [ ] **Step 3: Add context menu handler functions**

Inside the component, before the return JSX, add:

```ts
const handleUnfold = useCallback((pieceId: string, foldLineId: string, outlineOnly?: boolean) => {
  const piece = pieces.find(p => p.id === pieceId);
  if (!piece) return;
  try {
    const result = unfoldPiece(piece, foldLineId, { outlineOnly });
    dispatch(updatePiece(result));
  } catch (err) { console.error('Unfold failed:', err); }
}, [pieces, dispatch]);

const handleOffsetInternalLine = useCallback((pieceId: string, lineId: string) => {
  const piece = pieces.find(p => p.id === pieceId);
  if (!piece) return;
  try {
    const result = offsetInternalLine(piece, lineId, { count: 1, distance: 10 });
    dispatch(updatePiece(result));
  } catch (err) { console.error('Offset failed:', err); }
}, [pieces, dispatch]);

const handleOptimizeCurves = useCallback((pieceId: string, lineId?: string) => {
  const piece = pieces.find(p => p.id === pieceId);
  if (!piece) return;
  try {
    const target = lineId ? { internalLineId: lineId } : 'all' as const;
    const result = optimizePieceCurves(piece, { target });
    dispatch(updatePiece(result));
  } catch (err) { console.error('Optimize failed:', err); }
}, [pieces, dispatch]);
```

- [ ] **Step 4: Wire context menu props**

In the `<ContextMenu>` JSX (line ~407-413), add the three new props:

```tsx
<ContextMenu
  menu={ctxMenu}
  onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
  onRename={(id) => setEditingPieceNameId(id)}
  onConvertSegment={(idx, toCurve) => editPatternTool.convertSegment(idx, toCurve)}
  onZoomToFit={handleZoomToFit}
  onUnfold={handleUnfold}
  onOffsetInternalLine={handleOffsetInternalLine}
  onOptimizeCurves={handleOptimizeCurves}
/>
```

- [ ] **Step 5: Add PolyPen overlay to SVG**

In the SVG render area (before the `</svg>` closing tag around line 406), add the overlay when polyPen tool is active:

```tsx
{activeTool2D === 'polyPen' && (
  <PolyPenToolOverlay
    nodes={polyPen.nodes}
    previewPoint={polyPen.previewPoint}
    isDragging={polyPen.isDragging}
    dragHandle={polyPen.dragHandle}
    zoom2D={zoom2D}
  />
)}
```

- [ ] **Step 6: Wire polyPen events into the editor interaction layer**

In the mouse/keyboard event handlers, dispatch to `polyPen` when `activeTool2D === 'polyPen'`. This depends on the existing event routing pattern in PatternEditor — check how other tools like `pen` are wired and follow the same pattern.

- [ ] **Step 7: Populate `internalLineId` in context menu state**

In the `handleContextMenu` function, detect right-clicks on internal lines and populate `internalLineId` and `internalLineType` in the context menu state. Check how existing context menu fields like `commandIndex` are populated during right-click hit detection.

- [ ] **Step 8: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 9: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat: wire PolyPen tool + context menu callbacks into PatternEditor"
```

---

### Task 7: Register PolyPen `Y` shortcut

**Why:** Issue #8: `polyPen.tsx` defines `shortcut: 'y'` but `tool.polyPen` is not in `defaults.ts` and has no handler in `useKeyboardShortcuts.ts`. Note: `edit.redoAlt` uses `Ctrl+Y`, so bare `Y` (no modifier, context `2d`) is available.

**Files:**
- Modify: `src/shortcuts/defaults.ts:58` (add entry after tool.extendTrim)
- Modify: `src/hooks/useKeyboardShortcuts.ts:184` (add handler after tool.extendTrim)

- [ ] **Step 1: Add shortcut definition**

In `src/shortcuts/defaults.ts`, after line 58 (`tool.extendTrim`), add:

```ts
  { id: 'tool.polyPen', key: 'y', label: 'Poly Pen', category: '2D Tools', context: '2d' },
```

- [ ] **Step 2: Add handler**

In `src/hooks/useKeyboardShortcuts.ts`, after line 184 (`tool.extendTrim` handler), add:

```ts
      ['tool.polyPen', () => { dispatch(setActiveTool('polyPen' as any)); dispatch(setActiveTool2D('polyPen')); }],
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add src/shortcuts/defaults.ts src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: register tool.polyPen Y shortcut in defaults + handler"
```

---

### Task 8: Add copilot tool parameter validation

**Why:** Issue #10: `offsetInternalLine` copilot tool validates `distance` but not `count`. Issue #11: `polyPenDraw` copilot tool doesn't validate point coordinates.

**Files:**
- Modify: `src/copilot/action/tools/definitions/patternOpsTools.ts:549-554` (offsetInternalLine count)
- Modify: `src/copilot/action/tools/definitions/patternOpsTools.ts:583-586` (polyPenDraw coords)

- [ ] **Step 1: Add `count` validation to offsetInternalLine tool**

In `patternOpsTools.ts`, after line 550 (`if (distErr)` check), add:

```ts
      const rawCount = (params.count as number) ?? 1;
      const countErr = requireFiniteNumber(rawCount, 'count');
      if (countErr) return { success: false, error: countErr };
      const count = Math.max(1, Math.min(10, Math.round(rawCount)));
```

Then update line 554 to use the validated `count`:

```ts
          count, distance: params.distance as number,
```

- [ ] **Step 2: Add coordinate validation to polyPenDraw tool**

In `patternOpsTools.ts`, after line 584 (`if (!points || points.length < 2)`), add:

```ts
      for (let i = 0; i < points.length; i++) {
        const xErr = requireFiniteNumber(points[i].x, `points[${i}].x`);
        if (xErr) return { success: false, error: xErr };
        const yErr = requireFiniteNumber(points[i].y, `points[${i}].y`);
        if (yErr) return { success: false, error: yErr };
      }
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add src/copilot/action/tools/definitions/patternOpsTools.ts
git commit -m "fix: validate count and coordinates in copilot pattern tools"
```

---

### Task 9: Fix ESLint error (CI blocker)

**Why:** CI fails with `'finalPts' is never reassigned. Use 'const' instead`. Task 2 already fixes this (`let finalPts` → `const finalPts = [...offsetPts]`), but verify CI passes after all changes.

**Files:**
- Already fixed in Task 2

- [ ] **Step 1: Run lint**

Run: `npx eslint src/utils/patternOps.ts --quiet 2>&1 | head -10`
Expected: No errors (warnings are OK)

- [ ] **Step 2: Run full test suite**

Run: `npm run test 2>&1 | tail -20`
Expected: All tests pass

---

## Non-Issues (no code change needed)

- **Issue #1** (`fitCubicBezier` residual): Code is correct. The formula `b0*p0 + b1*p0 + b2*pN + b3*pN` is the base curve B(t) when alpha=0 in Schneider's least-squares parameterization. Addressed with a clarifying comment in Task 1.
- **Issue #9** (`extendEdge` tangent inversion): The direction `start - cp1` is correct for **backward extension** (away from the curve). Pre-existing and functionally correct.
- **Issue #13** (`view.xrayMode` shortcut): The `setXrayMode` Redux action does not exist in `simulationSlice.ts` yet. The TODO comment in `useKeyboardShortcuts.ts:159` is appropriate — cannot wire until the action is created.
