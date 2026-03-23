# Fix Silent (0,0) Fallback in Construction Point Resolution

**Issue:** #396
**Date:** 2026-03-23
**Status:** Approved

## Problem

Construction point resolution silently falls back to `(0, 0)` when a referenced point doesn't exist or a formula produces an invalid result. Three specific sites:

1. **`constructionSlice.ts:59-107`** — `addPoint` reducer initializes `let x = 0, y = 0` and swallows all errors in `catch { /* fallback to 0,0 */ }`. When `lookup()` returns `null` (dangling reference), coordinates stay at origin.
2. **`reactiveSolverMiddleware.ts:240`** — `parseFloat(String(val)) || 0` silently converts non-numeric variables to zero.
3. **`reactiveSolverMiddleware.ts:230-252`** — `resolvePointsSync()` has no error handling and returns points as-is without validation.

**Impact:** A dangling reference or invalid formula produces a pattern piece with silently wrong geometry at the origin. In parametric mode, a single deleted point can cascade to multiple pieces, all silently collapsing to the origin. The error is invisible until the piece is physically cut or the simulation produces nonsensical drape.

## Approach

**Non-aborting error tracking.** Failed resolution does not crash the pipeline. Instead, each point carries an optional error string, affected pieces are flagged via the diagnostic system, and errors are reported to solver metrics.

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
- `"Invalid formula result: NaN"`
- `"Unknown resolution error"`

Cleared on successful re-resolution.

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
- `alongLine`: if `lookup(definition.from)` or `lookup(definition.to)` returns null → set error naming the missing ref
- `midpoint`: same as `alongLine`
- `intersectionXY`: if `lookup(definition.xFrom)` or `lookup(definition.yFrom)` returns null → set error
- `normal`: if `lookup(definition.from)` or `lookup(definition.to)` returns null → set error

### 3. `resolvePointsSync()` — Error Collection + Metrics

Change return type from `{ points, context }` to `{ points, context, errors }` where:

```typescript
errors: Array<{ pointId: string; label: string; error: string }>
```

Changes:
- Variable parsing (`parseFloat(String(val)) || 0`): when `parseFloat` returns `NaN`, push error `"Variable '<key>' is not numeric: '<val>'"`, still default to 0.
- After resolution, iterate points and collect those with `resolutionError` set.
- In the middleware's Phase 1 handler, push collected errors to `state.metrics.errors` (the existing `string[]` in `SolverMetrics`).

### 4. Diagnostic Integration

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

When collecting data for a piece, scan the piece's node `pointId`s against construction state. For each node whose referenced `CPoint` has `resolutionError` set, include it in `unresolvedPoints`.

#### `src/diagnostics/ruleEngine.ts`

New rule `ruleUnresolvedPoints`:
- **Condition:** `data.unresolvedPoints` is non-empty
- **Severity:** `error`
- **Category:** `construction`
- **Message:** `"N construction point(s) failed to resolve"`
- **Detail:** Lists each point label and its error string

### 5. Files Changed

| File | Change |
|------|--------|
| `src/types/construction.ts` | Add `resolutionError?: string` to `CPoint` |
| `src/store/constructionSlice.ts` | `addPoint`: set `resolutionError` instead of silent fallback |
| `src/store/reactiveSolverMiddleware.ts` | `resolvePointsSync`: return errors, report to metrics |
| `src/diagnostics/types.ts` | Add `unresolvedPoints` to `InspectionData` |
| `src/diagnostics/dataCollector.ts` | Collect unresolved points for inspected piece |
| `src/diagnostics/ruleEngine.ts` | Add `ruleUnresolvedPoints` rule |

### 6. Testing

- **`constructionSlice` unit tests:** Verify `addPoint` with dangling refs sets `resolutionError`, valid points have `undefined` error
- **`resolvePointsSync` unit tests:** Verify non-numeric variable produces error entry, errors array populated for points with `resolutionError`
- **`ruleEngine` unit tests:** Verify `ruleUnresolvedPoints` fires with correct severity for inspection data containing unresolved points
- **`dataCollector` unit tests:** Verify unresolved points are collected for pieces referencing errored construction points

## Acceptance Criteria

- [x] Failed point resolution produces an error entry (not silent fallback)
- [x] Pieces with unresolvable points are flagged in the UI (via diagnostic inspector)
- [x] `resolvePointsSync()` reports resolution failures to metrics
