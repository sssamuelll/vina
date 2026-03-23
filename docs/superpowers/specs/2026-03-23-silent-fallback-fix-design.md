# Fix Silent (0,0) Fallback in Construction Point Resolution

**Issue:** #396
**Date:** 2026-03-23
**Status:** Approved

## Problem

Construction point resolution silently falls back to `(0, 0)` when a referenced point doesn't exist or a formula produces an invalid result. Four specific sites:

1. **`constructionSlice.ts:59-107`** — `addPoint` reducer initializes `let x = 0, y = 0` and swallows all errors in `catch { /* fallback to 0,0 */ }`. When `lookup()` returns `null` (dangling reference), coordinates stay at origin. The `intersection` definition type has no branch at all, always falling through to (0,0). The `absolute` type silently truncates string formulas to 0 via `typeof definition.x === 'number' ? definition.x : 0`. The `intersectionXY` type partially resolves when only one ref is missing (one coordinate set, the other stays 0) with no error.
2. **`resolver.ts:89-99`** — `resolveConstructionPoints()` catches errors and pushes them to an `errors` array, but the resolved coordinates still contain (0,0) for failed points. When these are dispatched via `resolveAll`, the error information is lost because `resolveAll` only carries `{ id, x, y }`.
3. **`reactiveSolverMiddleware.ts:240`** — `parseFloat(String(val)) || 0` silently converts non-numeric variables to zero.
4. **`reactiveSolverMiddleware.ts:230-252`** — `resolvePointsSync()` does no actual re-resolution (returns points as-is from Redux state) and has no error handling or validation.

**Impact:** A dangling reference or invalid formula produces a pattern piece with silently wrong geometry at the origin. In parametric mode, a single deleted point can cascade to multiple pieces, all silently collapsing to the origin. The error is invisible until the piece is physically cut or the simulation produces nonsensical drape.

## Approach

**Non-aborting error tracking with proactive notification.** Failed resolution does not crash the pipeline. Instead, each point carries an optional error string, affected pieces are flagged proactively (badge + canvas indicator), piece building is skipped for errored pieces (preserving last-known-good outline), and errors are reported to solver metrics.

### Alternatives Considered

- **Separate ResolutionErrorStore (rejected):** New slice, selectors, and subscriptions for what is essentially a string per point. Over-engineered.
- **Throw on failure / abort piece (rejected):** A single deleted point takes down all dependent pieces. Poor UX during iterative editing.

## Design

### 1. Type Change — `CPoint.resolutionError`

In `src/types/construction.ts`, add:

```typescript
export interface CPoint {
  // ... existing fields ...
  /** Set when resolution failed — x,y are unreliable (0,0 or stale) */
  resolutionError?: string;
}
```

Examples of error strings:
- `"Dangling reference: point 'bustApex' not found"`
- `"This point uses a formula that requires parametric resolution"`
- `"Lines are parallel — no intersection"`
- `"Dangling reference: point 'shoulderPoint' was deleted"`
- `"Unknown resolution error"`

Cleared to `undefined` on successful re-resolution.

Note: `CPointSerialized` in `reactiveSolver.ts` intentionally omits `resolutionError` since workers only need coordinates for piece building.

### 2. `constructionSlice.ts` — `addPoint` Reducer

Replace silent fallback:

```
Before:
  let x = 0, y = 0;
  try { ... } catch { /* fallback to 0,0 */ }

After:
  let x = 0, y = 0;
  let resolutionError: string | undefined;
  try {
    // For each definition type, when lookup() returns null:
    //   resolutionError = "Dangling reference: point '<ref>' not found"
    //   (x, y remain 0)
  } catch (err) {
    resolutionError = err instanceof Error ? err.message : 'Unknown resolution error';
  }
  state.points.push({ ..., resolutionError });
```

Specific changes per definition type:
- `endLine`: if `lookup(definition.basePoint)` returns null → set error naming `basePoint`
- `alongLine`: if `lookup(definition.from)` or `lookup(definition.to)` returns null → set error naming the missing ref(s)
- `midpoint`: same as `alongLine`
- `intersection`: add branch for this type; if any of the 4 point refs (`line1Start`, `line1End`, `line2Start`, `line2End`) returns null → set error naming missing refs. Also compute line-line intersection and set error if lines are parallel.
- `intersectionXY`: if `lookup(definition.xFrom)` **or** `lookup(definition.yFrom)` returns null → set error (not partial resolution). Both must succeed or both fail.
- `normal`: if `lookup(definition.from)` or `lookup(definition.to)` returns null → set error
- `absolute`: if `definition.x` or `definition.y` is a string (formula), set error `"This point uses a formula that requires parametric resolution"`. The `addPoint` reducer does not have access to `FormulaContext`; formula-bearing absolute points must be resolved via the proper resolver.

### 3. `constructionSlice.ts` — `removePoint` Flags Dependents

When a point is deleted, immediately flag all remaining points that reference it:

```typescript
removePoint(state, action: PayloadAction<string>) {
  const id = action.payload;
  const deletedPoint = state.points.find(p => p.id === id);
  const deletedLabel = deletedPoint?.label ?? id;

  state.points = state.points.filter(p => p.id !== id);

  // Flag dependents with resolutionError immediately
  for (const point of state.points) {
    if (referencesPoint(point.definition, id, deletedLabel)) {
      point.resolutionError = `Dangling reference: point '${deletedLabel}' was deleted`;
    }
  }

  // Existing cleanup: remove lines/curves referencing this point
  state.lines = state.lines.filter(l => l.from !== id && l.to !== id);
  for (const piece of state.pieces) {
    piece.nodes = piece.nodes.filter(n => n.pointId !== id);
  }
}
```

The helper `referencesPoint(definition, id, label)` checks all ref fields in the definition against both the deleted point's id and label. This is a synchronous scan — no re-resolution needed, just error flagging. It closes the staleness window between deletion and the next reactive solver trigger.

### 4. `resolveAll` Reducer — Propagate `resolutionError`

The `resolveAll` reducer is the central mechanism for updating points after re-resolution. It must propagate error state to prevent staleness.

Expand the payload type:

```typescript
resolveAll(state, action: PayloadAction<{
  resolved: Array<{ id: string; x: number; y: number; resolutionError?: string }>
}>) {
  for (const { id, x, y, resolutionError } of action.payload.resolved) {
    const point = state.points.find(p => p.id === id);
    if (point) {
      point.x = x;
      point.y = y;
      point.resolutionError = resolutionError; // cleared to undefined on success
    }
  }
}
```

This ensures:
- Points that previously had errors get cleared when re-resolution succeeds
- Points that newly fail get their error set
- Error state is always in sync with the latest resolution pass

### 5. `resolver.ts` — Propagate Errors Through `ResolveResult`

`resolveConstructionPoints()` already collects errors. Expand `ResolveResult` to include `resolutionError` per resolved point:

```typescript
export interface ResolveResult {
  resolved: Array<{ id: string; x: number; y: number; resolutionError?: string }>;
  errors: Array<{ id: string; label: string; error: string }>;
}
```

In the catch block (line 94-99), set `resolutionError` on the resolved entry:

```typescript
} catch (e) {
  const error = (e as Error).message;
  errors.push({ id: point.id, label: point.label, error });
  pointMap.set(point.id, { x: 0, y: 0 });
  resolved.push({ id: point.id, x: 0, y: 0, resolutionError: error });
}
```

On success, `resolutionError` is omitted (undefined), which clears any previous error when dispatched through `resolveAll`.

### 6. `resolvePointsSync()` — Error Collection + Metrics

`resolvePointsSync` does not perform actual re-resolution (it returns points as-is from Redux state). Its role is limited to:

1. Building the `FormulaContext` (measurements + variables)
2. Passing points through for Phase 2 piece building

Change return type from `{ points, context }` to `{ points, context, errors }` where:

```typescript
errors: Array<{ pointId: string; label: string; error: string }>
```

Changes:
- Variable parsing (`parseFloat(String(val)) || 0`): when `parseFloat` returns `NaN`, push error `"Variable '<key>' is not numeric: '<val>'"`, still default to 0.
- After building context, iterate points and collect those with `resolutionError` set into the `errors` array.
- In the middleware's Phase 1 handler, push collected errors to `state.metrics.errors` (the existing `string[]` in `SolverMetrics`).

Note: Actual parametric re-resolution happens in `resolveConstructionPoints()` (called by copilot tools and the Seamly2D import pipeline), not in `resolvePointsSync()`.

### 7. Skip Piece Building for Errored Pieces

In `buildPiecesAsync`, before building each construction piece, check if any of its `nodes[].pointId` references a `CPoint` with `resolutionError` set. If so, **skip that piece** — preserve the last-known-good outline in Redux.

```typescript
// In buildPiecesAsync, before building each piece:
for (const cPiece of pieces) {
  const hasErroredPoints = cPiece.nodes.some(node => {
    const pt = points.find(p => p.id === node.pointId);
    return pt?.resolutionError != null;
  });

  if (hasErroredPoints) {
    // Skip — preserve last-known-good outline in Redux
    continue;
  }

  // ... proceed with normal piece building
}
```

This prevents workers from overwriting valid outlines with collapsed (0,0) geometry. The last-known-good outline remains in Redux until the error is resolved and the next successful build replaces it.

### 8. Proactive Notification

Errors must be visible without manually inspecting each piece.

#### `inspectorSlice.ts` — Add `unresolvedCount`

```typescript
export interface InspectorState {
  // ... existing fields ...
  /** Global count of construction points with resolution errors */
  unresolvedCount: number;
}
```

New reducer:
```typescript
setUnresolvedCount(state, action: PayloadAction<number>) {
  state.unresolvedCount = action.payload;
}
```

#### Middleware Integration

After `resolveAll` is dispatched in the reactive solver middleware's Phase 1 handler, count points with `resolutionError` set and dispatch `setUnresolvedCount`. Also update the count from `removePoint` (the constructionSlice can't dispatch cross-slice, so the middleware listens for `construction/removePoint` and recomputes the count from state).

#### Inspector Tab Badge

The Inspector tab in the bottom panel shows a badge with `unresolvedCount` when > 0. This is visible without opening the tab.

#### 2D Canvas Indicator

Pieces containing errored points render with a red dashed outline on the 2D canvas. The renderer checks the piece's construction points for `resolutionError` via a selector.

### 9. Diagnostic Integration

#### `src/diagnostics/types.ts`

Add to `InspectionData`:

```typescript
export interface InspectionData {
  // ... existing fields ...
  /** Construction points that failed to resolve for this piece */
  unresolvedPoints?: Array<{ label: string; error: string }>;
}
```

#### `src/diagnostics/dataCollector.ts`

When collecting data for a piece, traverse from the pattern piece to construction points:
1. Reverse-lookup `pieceIdentityMap` to find the construction piece ID for the inspected pattern piece
2. Get the construction piece's `nodes[].pointId` references
3. For each pointId, look up the `CPoint` in `state.construction.points`
4. If the `CPoint` has `resolutionError` set, include `{ label, error }` in `unresolvedPoints`

#### `src/diagnostics/ruleEngine.ts`

New rule `ruleUnresolvedPoints`:
- **Condition:** `data.unresolvedPoints` is non-empty
- **Severity:** `error`
- **Category:** `construction`
- **Message:** `"N construction point(s) failed to resolve"`
- **Detail:** Lists each point label and its error string

### 10. Files Changed

| File | Change |
|------|--------|
| `src/types/construction.ts` | Add `resolutionError?: string` to `CPoint` |
| `src/store/constructionSlice.ts` | `addPoint`: set `resolutionError`; `removePoint`: flag dependents; `resolveAll`: propagate `resolutionError` |
| `src/utils/construction/resolver.ts` | Include `resolutionError` in `ResolveResult.resolved` entries |
| `src/store/reactiveSolverMiddleware.ts` | `resolvePointsSync`: return errors, report to metrics; `buildPiecesAsync`: skip errored pieces; dispatch `setUnresolvedCount` after resolve |
| `src/store/inspectorSlice.ts` | Add `unresolvedCount` state + `setUnresolvedCount` reducer |
| `src/diagnostics/types.ts` | Add `unresolvedPoints` to `InspectionData` |
| `src/diagnostics/dataCollector.ts` | Collect unresolved points via `pieceIdentityMap` reverse lookup |
| `src/diagnostics/ruleEngine.ts` | Add `ruleUnresolvedPoints` rule |
| `src/components/BottomPanel/InspectorTab.tsx` | Show badge with `unresolvedCount` |
| `src/components/Viewport2D/PieceRenderer.tsx` (or equivalent) | Red dashed outline for pieces with errored points |

### 11. Testing

- **`constructionSlice` unit tests:**
  - `addPoint` with dangling refs sets `resolutionError`, valid points have `undefined`
  - `addPoint` with `intersection` type: missing refs, parallel lines
  - `addPoint` with `intersectionXY`: single missing ref sets error (no partial resolution)
  - `addPoint` with `absolute` type: string formula sets error with user-friendly message
  - `resolveAll` clears `resolutionError` on successful re-resolution
  - `resolveAll` sets `resolutionError` on failed re-resolution
  - `removePoint` flags dependent points with `resolutionError` immediately
  - **Cascade test:** create Point A, create Point B referencing A, delete A, verify Point B has `resolutionError` immediately (no resolve trigger needed)
- **`resolver.ts` unit tests:**
  - `resolveConstructionPoints` includes `resolutionError` on failed entries
  - `resolveConstructionPoints` omits `resolutionError` on successful entries
- **`resolvePointsSync` unit tests:**
  - Non-numeric variable produces error entry
  - Points with `resolutionError` are collected in errors array
- **`ruleEngine` unit tests:**
  - `ruleUnresolvedPoints` fires with `error` severity when `unresolvedPoints` is non-empty
  - `ruleUnresolvedPoints` returns empty when `unresolvedPoints` is absent or empty
- **`dataCollector` unit tests:**
  - Collects unresolved points for pieces referencing errored construction points via `pieceIdentityMap`
- **`buildPiecesAsync` unit test:**
  - Construction piece with errored point is skipped, last-known-good outline preserved
- **`inspectorSlice` unit test:**
  - `setUnresolvedCount` updates count; badge visible when > 0

## Acceptance Criteria

- [x] Failed point resolution produces an error entry (not silent fallback)
- [x] Pieces with unresolvable points are flagged proactively in the UI (badge + red dashed outline)
- [x] `resolvePointsSync()` reports resolution failures to metrics
- [x] Errored pieces preserve last-known-good outline (piece building skipped)
- [x] Point deletion immediately flags dependent points (no staleness window)
