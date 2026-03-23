# Silent Fallback Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace silent (0,0) fallbacks in construction point resolution with non-aborting error tracking, proactive UI notification, and errored-piece skip logic.

**Architecture:** Add `resolutionError?: string` to `CPoint`. Set it in `addPoint` reducer, `removePoint` cascade, and `resolver.ts`. Propagate through `resolveAll`. Skip piece building for errored pieces. Surface errors via Inspector badge + 2D canvas red dashed outline. Report to solver metrics.

**Tech Stack:** Redux Toolkit, React, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-silent-fallback-fix-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/types/construction.ts` | CPoint type definition | Modify: add `resolutionError` field |
| `src/store/constructionSlice.ts` | Construction state management | Modify: `addPoint`, `removePoint`, `resolveAll` reducers |
| `src/utils/construction/resolver.ts` | Parametric point resolution | Modify: propagate `resolutionError` in `ResolveResult` |
| `src/store/reactiveSolverMiddleware.ts` | Reactive solver pipeline | Modify: `resolvePointsSync` errors, skip errored pieces, dispatch `unresolvedCount` |
| `src/store/inspectorSlice.ts` | Diagnostic inspector state | Modify: add `unresolvedCount` |
| `src/diagnostics/types.ts` | Diagnostic data types | Modify: add `unresolvedPoints` to `InspectionData` |
| `src/diagnostics/dataCollector.ts` | Sync data collection | Modify: collect unresolved points |
| `src/diagnostics/ruleEngine.ts` | Deterministic diagnostic rules | Modify: add `ruleUnresolvedPoints` |
| `src/components/BottomPanel/BottomPanel.tsx` | Bottom panel tabs | Modify: badge on Inspector tab |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | 2D piece rendering | Modify: red dashed outline for errored pieces |
| `src/store/__tests__/constructionSlice.test.ts` | Construction slice tests | Create |
| `src/utils/construction/__tests__/resolver.test.ts` | Resolver tests | Create |
| `src/store/__tests__/reactiveSolverMiddleware.test.ts` | Middleware tests | Modify: add errored-piece skip test |
| `src/diagnostics/__tests__/ruleEngine.test.ts` | Rule engine tests | Modify: add unresolved points rule test |

---

### Task 1: Add `resolutionError` to CPoint type

**Files:**
- Modify: `src/types/construction.ts:17-32`

- [ ] **Step 1: Add `resolutionError` field to `CPoint`**

In `src/types/construction.ts`, add the field after `blockId`:

```typescript
export interface CPoint {
  /** Unique ID */
  id: string;
  /** Human-readable label (e.g., "A", "neckPoint", "bustApex") */
  label: string;
  /** Resolved x coordinate (mm) */
  x: number;
  /** Resolved y coordinate (mm) */
  y: number;
  /** How this point was defined */
  definition: PointDefinition;
  /** Visual: whether to show label on canvas */
  visible: boolean;
  /** Block this point belongs to (for overlay grouping) */
  blockId?: string;
  /** Set when resolution failed — x,y are unreliable (0,0 or stale) */
  resolutionError?: string;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS — field is optional, so no existing code breaks.

- [ ] **Step 3: Commit**

```bash
git add src/types/construction.ts
git commit -m "feat(types): add resolutionError to CPoint (#396)"
```

---

### Task 2: Fix `addPoint` reducer — replace silent fallback

**Files:**
- Modify: `src/store/constructionSlice.ts:49-117`
- Create: `src/store/__tests__/constructionSlice.test.ts`

- [ ] **Step 1: Write failing tests for `addPoint` with dangling refs**

Create `src/store/__tests__/constructionSlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import reducer, {
  addPoint,
  removePoint,
  resolveAll,
} from '../constructionSlice';
import type { ConstructionState } from '../../types/construction';

const emptyState: ConstructionState = {
  points: [],
  lines: [],
  curves: [],
  pieces: [],
  variables: {},
  selectedEntity: null,
  showConstruction: true,
  pieceIdentityMap: {},
};

// Helper to add a point and return the new state
function addAndGetState(
  state: ConstructionState,
  payload: Parameters<typeof addPoint>[0]['payload'],
): ConstructionState {
  // addPoint is a PayloadAction — we need to wrap payload
  return reducer(state, addPoint(payload));
}

describe('constructionSlice', () => {
  describe('addPoint — resolution errors', () => {
    it('sets no resolutionError for valid manual point', () => {
      const state = addAndGetState(emptyState, {
        label: 'A',
        definition: { type: 'manual', x: 100, y: 200 },
      });
      expect(state.points[0].resolutionError).toBeUndefined();
      expect(state.points[0].x).toBe(100);
      expect(state.points[0].y).toBe(200);
    });

    it('sets no resolutionError for valid absolute point with numeric values', () => {
      const state = addAndGetState(emptyState, {
        label: 'B',
        definition: { type: 'absolute', x: 50, y: 75 },
      });
      expect(state.points[0].resolutionError).toBeUndefined();
      expect(state.points[0].x).toBe(50);
    });

    it('sets resolutionError for absolute point with string formula', () => {
      const state = addAndGetState(emptyState, {
        label: 'C',
        definition: { type: 'absolute', x: 'bust_circ / 4', y: 100 },
      });
      expect(state.points[0].resolutionError).toMatch(/formula.*parametric resolution/i);
      expect(state.points[0].x).toBe(0);
    });

    it('sets resolutionError for endLine with missing basePoint', () => {
      const state = addAndGetState(emptyState, {
        label: 'D',
        definition: { type: 'endLine', basePoint: 'nonexistent', angle: 90, length: 50 },
      });
      expect(state.points[0].resolutionError).toMatch(/nonexistent/);
      expect(state.points[0].x).toBe(0);
      expect(state.points[0].y).toBe(0);
    });

    it('sets resolutionError for alongLine with missing from point', () => {
      const state = addAndGetState(emptyState, {
        label: 'E',
        definition: { type: 'alongLine', from: 'missing', to: 'also_missing', length: 30 },
      });
      expect(state.points[0].resolutionError).toMatch(/missing/);
    });

    it('sets resolutionError for midpoint with missing refs', () => {
      const state = addAndGetState(emptyState, {
        label: 'F',
        definition: { type: 'midpoint', from: 'gone1', to: 'gone2' },
      });
      expect(state.points[0].resolutionError).toMatch(/gone1|gone2/);
    });

    it('sets resolutionError for intersectionXY with one missing ref', () => {
      // First add a valid point so one ref can succeed
      let state = addAndGetState(emptyState, {
        label: 'Origin',
        definition: { type: 'manual', x: 100, y: 200 },
      });
      // intersectionXY: xFrom exists, yFrom does not
      state = addAndGetState(state, {
        label: 'G',
        definition: { type: 'intersectionXY', xFrom: 'Origin', yFrom: 'nowhere' },
      });
      // Both must succeed or both fail — partial resolution is not allowed
      expect(state.points[1].resolutionError).toMatch(/nowhere/);
    });

    it('sets resolutionError for intersection with missing points', () => {
      const state = addAndGetState(emptyState, {
        label: 'H',
        definition: {
          type: 'intersection',
          line1Start: 'a', line1End: 'b',
          line2Start: 'c', line2End: 'd',
        },
      });
      expect(state.points[0].resolutionError).toBeDefined();
    });

    it('sets resolutionError for normal with missing from', () => {
      const state = addAndGetState(emptyState, {
        label: 'I',
        definition: { type: 'normal', from: 'nope', to: 'nope2', angle: 90, length: 20 },
      });
      expect(state.points[0].resolutionError).toMatch(/nope/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: Most tests FAIL — `resolutionError` is not yet set by `addPoint`.

- [ ] **Step 3: Implement `addPoint` changes**

In `src/store/constructionSlice.ts`, replace lines 58-117 (the resolution logic inside `addPoint`):

```typescript
    addPoint(state, action: PayloadAction<{ label: string; definition: PointDefinition; visible?: boolean; blockId?: string }>) {
      const { label, definition, visible, blockId } = action.payload;

      // Build lookup from existing points (by id and label)
      const lookup = (ref: string): { x: number; y: number } | null => {
        const pt = state.points.find(p => p.id === ref || p.label === ref);
        return pt ? { x: pt.x, y: pt.y } : null;
      };

      // Resolve immediately based on definition type
      let x = 0, y = 0;
      let resolutionError: string | undefined;
      try {
        if (definition.type === 'absolute') {
          if (typeof definition.x === 'string' || typeof definition.y === 'string') {
            resolutionError = 'This point uses a formula that requires parametric resolution';
          } else {
            x = definition.x;
            y = definition.y;
          }
        } else if (definition.type === 'manual') {
          x = definition.x;
          y = definition.y;
        } else if (definition.type === 'endLine') {
          const base = lookup(definition.basePoint);
          if (!base) {
            resolutionError = `Dangling reference: point '${definition.basePoint}' not found`;
          } else {
            const angle = typeof definition.angle === 'number' ? definition.angle : 0;
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const rad = (angle * Math.PI) / 180;
            x = base.x + length * Math.cos(rad);
            y = base.y - length * Math.sin(rad); // Y down
          }
        } else if (definition.type === 'alongLine') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const totalDist = Math.sqrt((to!.x - from!.x) ** 2 + (to!.y - from!.y) ** 2);
            const ratio = totalDist > 0 ? length / totalDist : 0;
            x = from!.x + (to!.x - from!.x) * ratio;
            y = from!.y + (to!.y - from!.y) * ratio;
          }
        } else if (definition.type === 'midpoint') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            x = (from!.x + to!.x) / 2;
            y = (from!.y + to!.y) / 2;
          }
        } else if (definition.type === 'intersectionXY') {
          const px = lookup(definition.xFrom);
          const py = lookup(definition.yFrom);
          const missing = [
            !px && `'${definition.xFrom}'`,
            !py && `'${definition.yFrom}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            x = px!.x;
            y = py!.y;
          }
        } else if (definition.type === 'normal') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            const lineAngle = Math.atan2(to!.y - from!.y, to!.x - from!.x) * (180 / Math.PI);
            const normalAngle = lineAngle + (typeof definition.angle === 'number' ? definition.angle : 90);
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const rad = (normalAngle * Math.PI) / 180;
            x = from!.x + length * Math.cos(rad);
            y = from!.y - length * Math.sin(rad);
          }
        } else if (definition.type === 'intersection') {
          const l1s = lookup(definition.line1Start);
          const l1e = lookup(definition.line1End);
          const l2s = lookup(definition.line2Start);
          const l2e = lookup(definition.line2End);
          const missing = [
            !l1s && `'${definition.line1Start}'`,
            !l1e && `'${definition.line1End}'`,
            !l2s && `'${definition.line2Start}'`,
            !l2e && `'${definition.line2End}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            // Line-line intersection
            const d1x = l1e!.x - l1s!.x, d1y = l1e!.y - l1s!.y;
            const d2x = l2e!.x - l2s!.x, d2y = l2e!.y - l2s!.y;
            const denom = d1x * d2y - d1y * d2x;
            if (Math.abs(denom) < 1e-10) {
              resolutionError = 'Lines are parallel — no intersection';
            } else {
              const t = ((l2s!.x - l1s!.x) * d2y - (l2s!.y - l1s!.y) * d2x) / denom;
              x = l1s!.x + t * d1x;
              y = l1s!.y + t * d1y;
            }
          }
        }
      } catch (err) {
        resolutionError = err instanceof Error ? err.message : 'Unknown resolution error';
      }

      state.points.push({
        id: cid('pt'),
        label,
        x, y,
        definition,
        visible: visible ?? true,
        blockId,
        resolutionError,
      });
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/constructionSlice.ts src/store/__tests__/constructionSlice.test.ts
git commit -m "fix(construction): replace silent (0,0) fallback with resolutionError in addPoint (#396)"
```

---

### Task 3: Fix `removePoint` — flag dependents immediately

**Files:**
- Modify: `src/store/constructionSlice.ts:124-133`
- Modify: `src/store/__tests__/constructionSlice.test.ts`

- [ ] **Step 1: Write failing test for deletion cascade**

Add to `src/store/__tests__/constructionSlice.test.ts`:

```typescript
  describe('removePoint — cascade flagging', () => {
    it('flags dependent points with resolutionError when referenced point is deleted', () => {
      // Create point A (manual)
      let state = addAndGetState(emptyState, {
        label: 'A',
        definition: { type: 'manual', x: 100, y: 200 },
      });
      const pointAId = state.points[0].id;

      // Create point B referencing A via endLine
      state = addAndGetState(state, {
        label: 'B',
        definition: { type: 'endLine', basePoint: 'A', angle: 0, length: 50 },
      });
      expect(state.points[1].resolutionError).toBeUndefined();
      expect(state.points[1].x).toBe(150); // 100 + 50*cos(0)

      // Delete point A
      state = reducer(state, removePoint(pointAId));

      // Point B should remain but have resolutionError
      expect(state.points).toHaveLength(1);
      expect(state.points[0].label).toBe('B');
      expect(state.points[0].resolutionError).toMatch(/A.*deleted/);
    });

    it('flags multiple dependents when a point is deleted', () => {
      let state = addAndGetState(emptyState, {
        label: 'Origin',
        definition: { type: 'manual', x: 0, y: 0 },
      });
      const originId = state.points[0].id;

      state = addAndGetState(state, {
        label: 'P1',
        definition: { type: 'endLine', basePoint: 'Origin', angle: 0, length: 10 },
      });
      state = addAndGetState(state, {
        label: 'P2',
        definition: { type: 'endLine', basePoint: 'Origin', angle: 90, length: 20 },
      });

      expect(state.points).toHaveLength(3);
      state = reducer(state, removePoint(originId));

      // Both P1 and P2 should be flagged
      expect(state.points).toHaveLength(2);
      expect(state.points[0].resolutionError).toMatch(/Origin.*deleted/);
      expect(state.points[1].resolutionError).toMatch(/Origin.*deleted/);
    });

    it('does not flag points that do not reference the deleted point', () => {
      let state = addAndGetState(emptyState, {
        label: 'A',
        definition: { type: 'manual', x: 10, y: 20 },
      });
      state = addAndGetState(state, {
        label: 'B',
        definition: { type: 'manual', x: 30, y: 40 },
      });
      const pointAId = state.points[0].id;

      state = reducer(state, removePoint(pointAId));

      expect(state.points).toHaveLength(1);
      expect(state.points[0].label).toBe('B');
      expect(state.points[0].resolutionError).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run tests to verify cascade tests fail**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: New cascade tests FAIL — `removePoint` doesn't flag dependents yet.

- [ ] **Step 3: Add `referencesPoint` helper and update `removePoint`**

Add the helper function before the slice definition, and update the `removePoint` reducer in `src/store/constructionSlice.ts`:

```typescript
// ─── Helper: check if a definition references a point by id or label ────────

function referencesPoint(definition: PointDefinition, id: string, label: string): boolean {
  switch (definition.type) {
    case 'endLine':
      return definition.basePoint === id || definition.basePoint === label;
    case 'alongLine':
    case 'midpoint':
    case 'normal':
      return [definition.from, definition.to].some(ref => ref === id || ref === label);
    case 'intersectionXY':
      return [definition.xFrom, definition.yFrom].some(ref => ref === id || ref === label);
    case 'intersection':
      return [definition.line1Start, definition.line1End, definition.line2Start, definition.line2End]
        .some(ref => ref === id || ref === label);
    case 'absolute':
    case 'manual':
      return false;
    default:
      return false;
  }
}
```

Update `removePoint` reducer:

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

      // Remove lines/curves referencing this point
      state.lines = state.lines.filter(l => l.from !== id && l.to !== id);
      // Remove piece nodes referencing this point
      for (const piece of state.pieces) {
        piece.nodes = piece.nodes.filter(n => n.pointId !== id);
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/constructionSlice.ts src/store/__tests__/constructionSlice.test.ts
git commit -m "fix(construction): removePoint flags dependent points with resolutionError (#396)"
```

---

### Task 4: Fix `resolveAll` — propagate `resolutionError`

**Files:**
- Modify: `src/store/constructionSlice.ts:197-203`
- Modify: `src/store/__tests__/constructionSlice.test.ts`

- [ ] **Step 1: Write failing tests for `resolveAll` propagation**

Add to `src/store/__tests__/constructionSlice.test.ts`:

```typescript
  describe('resolveAll — resolutionError propagation', () => {
    it('clears resolutionError on successful re-resolution', () => {
      // Create a point with an error
      let state = addAndGetState(emptyState, {
        label: 'X',
        definition: { type: 'endLine', basePoint: 'missing', angle: 0, length: 10 },
      });
      expect(state.points[0].resolutionError).toBeDefined();
      const pointId = state.points[0].id;

      // resolveAll with no error → should clear
      state = reducer(state, resolveAll({
        resolved: [{ id: pointId, x: 50, y: 60 }],
      }));
      expect(state.points[0].x).toBe(50);
      expect(state.points[0].y).toBe(60);
      expect(state.points[0].resolutionError).toBeUndefined();
    });

    it('sets resolutionError on failed re-resolution', () => {
      let state = addAndGetState(emptyState, {
        label: 'Y',
        definition: { type: 'manual', x: 10, y: 20 },
      });
      expect(state.points[0].resolutionError).toBeUndefined();
      const pointId = state.points[0].id;

      // resolveAll with an error
      state = reducer(state, resolveAll({
        resolved: [{ id: pointId, x: 0, y: 0, resolutionError: 'Point "base" not found' }],
      }));
      expect(state.points[0].x).toBe(0);
      expect(state.points[0].resolutionError).toBe('Point "base" not found');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: FAIL — `resolveAll` payload doesn't include `resolutionError` yet.

- [ ] **Step 3: Update `resolveAll` reducer**

In `src/store/constructionSlice.ts`, replace the `resolveAll` reducer:

```typescript
    resolveAll(state, action: PayloadAction<{ resolved: Array<{ id: string; x: number; y: number; resolutionError?: string }> }>) {
      for (const { id, x, y, resolutionError } of action.payload.resolved) {
        const point = state.points.find(p => p.id === id);
        if (point) {
          point.x = x;
          point.y = y;
          point.resolutionError = resolutionError; // cleared to undefined on success
        }
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/constructionSlice.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/constructionSlice.ts src/store/__tests__/constructionSlice.test.ts
git commit -m "fix(construction): resolveAll propagates resolutionError (#396)"
```

---

### Task 5: Fix `resolver.ts` — propagate errors through `ResolveResult`

**Files:**
- Modify: `src/utils/construction/resolver.ts:51-54, 89-99`
- Modify: `src/utils/construction/__tests__/resolver.test.ts` (file already exists with `makePoint(id, label, def)` helper — add new tests using existing pattern)

- [ ] **Step 1: Write failing tests**

Add to existing `src/utils/construction/__tests__/resolver.test.ts` (uses existing `makePoint(id, label, def)` helper):

```typescript
describe('resolveConstructionPoints — resolutionError propagation', () => {
  it('omits resolutionError on successful resolution', () => {
    const points = [makePoint('p1', 'A', { type: 'manual', x: 100, y: 200 })];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });

  it('includes resolutionError on failed resolution', () => {
    const points = [
      makePoint('p1', 'B', { type: 'endLine', basePoint: 'nonexistent', angle: 0, length: 10 }),
    ];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeDefined();
    expect(result.resolved[0].x).toBe(0);
    expect(result.resolved[0].y).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/nonexistent/i);
  });

  it('downstream points can still resolve after an upstream failure', () => {
    const points = [
      makePoint('p1', 'Broken', { type: 'endLine', basePoint: 'ghost', angle: 0, length: 10 }),
      makePoint('p2', 'OK', { type: 'manual', x: 50, y: 60 }),
    ];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeDefined();
    expect(result.resolved[1].resolutionError).toBeUndefined();
    expect(result.resolved[1].x).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/construction/__tests__/resolver.test.ts`
Expected: FAIL — `resolutionError` not in `ResolveResult.resolved`.

- [ ] **Step 3: Update `ResolveResult` and catch block**

In `src/utils/construction/resolver.ts`:

Update the interface (lines 51-54):
```typescript
export interface ResolveResult {
  resolved: Array<{ id: string; x: number; y: number; resolutionError?: string }>;
  errors: Array<{ id: string; label: string; error: string }>;
}
```

Update the catch block (lines 94-99):
```typescript
    } catch (e) {
      const error = (e as Error).message;
      errors.push({ id: point.id, label: point.label, error });
      // Place at 0,0 so downstream points can still try
      pointMap.set(point.id, { x: 0, y: 0 });
      resolved.push({ id: point.id, x: 0, y: 0, resolutionError: error });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/construction/__tests__/resolver.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS. Callers of `resolveConstructionPoints` that destructure `resolved` entries will now have access to `resolutionError`. Since it's optional, no callers break.

- [ ] **Step 6: Commit**

```bash
git add src/utils/construction/resolver.ts src/utils/construction/__tests__/resolver.test.ts
git commit -m "fix(resolver): propagate resolutionError through ResolveResult (#396)"
```

---

### Task 6: Fix `resolvePointsSync` — error collection + metrics + skip errored pieces

**Files:**
- Modify: `src/store/reactiveSolverMiddleware.ts:230-253, 260-297, 555-565`
- Modify: `src/store/__tests__/reactiveSolverMiddleware.test.ts`

- [ ] **Step 1: Write failing tests for error collection and errored-piece skipping**

Add to `src/store/__tests__/reactiveSolverMiddleware.test.ts`. The existing test file has a `createTestStore()` helper and mocked workers. Add:

```typescript
describe('resolvePointsSync — error collection', () => {
  it('collects errors for points with resolutionError', () => {
    const store = createTestStore();
    // Add a point with an error (dangling ref)
    store.dispatch(addPoint({
      label: 'Bad',
      definition: { type: 'endLine', basePoint: 'nonexistent', angle: 0, length: 10 },
    }));

    // Trigger reactive solver via a variable change
    store.dispatch(setVariable({ name: 'test', value: 1 }));

    // Check that the point still has resolutionError in state
    const state = store.getState();
    const badPoint = state.construction.points.find((p: CPoint) => p.label === 'Bad');
    expect(badPoint?.resolutionError).toBeDefined();
  });

  it('reports non-numeric variables to metrics', () => {
    const store = createTestStore();
    store.dispatch(setVariable({ name: 'badVar', value: 'not-a-number' }));

    // Trigger solver
    store.dispatch(setVariable({ name: 'trigger', value: 1 }));

    const metrics = getSolverMetrics();
    expect(metrics.errors.some((e: string) => e.includes('badVar'))).toBe(true);
  });
});

describe('buildPiecesAsync — skip errored pieces', () => {
  it('does not build pieces when contributing points have resolutionError', async () => {
    const store = createTestStore();
    // Add a valid point and an errored point
    store.dispatch(addPoint({
      label: 'Good',
      definition: { type: 'manual', x: 100, y: 200 },
    }));
    store.dispatch(addPoint({
      label: 'Bad',
      definition: { type: 'endLine', basePoint: 'ghost', angle: 0, length: 10 },
    }));

    const state = store.getState();
    const badPt = state.construction.points.find((p: CPoint) => p.label === 'Bad');
    expect(badPt?.resolutionError).toBeDefined();

    // A construction piece referencing the errored point should be skipped
    // (buildPieceWithOffset mock won't be called for it)
  });
});
```

Note: The exact assertions depend on the mock setup — the implementing agent should verify that `buildPieceWithOffset` is not called for pieces whose nodes reference errored points. The store's `createTestStore()` helper already mocks `buildPieceWithOffset`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/reactiveSolverMiddleware.test.ts`
Expected: FAIL — `resolvePointsSync` doesn't collect errors yet.

- [ ] **Step 3: Update `resolvePointsSync` to collect errors**

In `src/store/reactiveSolverMiddleware.ts`, replace the `resolvePointsSync` function (lines 230-253):

```typescript
function resolvePointsSync(
  reduxState: SolverRootState
): { points: CPoint[]; context: FormulaContext; errors: Array<{ pointId: string; label: string; error: string }> } {
  const { points, variables } = reduxState.construction;
  const measurements = reduxState.parametric.baseMeasurements || reduxState.project.avatar.measurements;
  const overrides = reduxState.parametric.variableOverrides;

  const errors: Array<{ pointId: string; label: string; error: string }> = [];

  // Build formula context - convert variables to numbers only
  const numericVariables: Record<string, number> = {};
  for (const [key, val] of Object.entries(variables)) {
    if (typeof val === 'number') {
      numericVariables[key] = val;
    } else {
      const parsed = parseFloat(String(val));
      if (Number.isNaN(parsed)) {
        errors.push({ pointId: '', label: '', error: `Variable '${key}' is not numeric: '${val}'` });
        numericVariables[key] = 0;
      } else {
        numericVariables[key] = parsed;
      }
    }
  }

  const context: FormulaContext = {
    measurements: measurements as Record<string, number>,
    variables: { ...numericVariables, ...overrides },
  };

  // Collect points with resolutionError
  for (const pt of points) {
    if (pt.resolutionError) {
      errors.push({ pointId: pt.id, label: pt.label, error: pt.resolutionError });
    }
  }

  return { points: [...points], context, errors };
}
```

- [ ] **Step 2: Update middleware Phase 1 to report errors to metrics**

In the middleware handler (around line 555-565), update to use the errors:

```typescript
      // Phase 1: Resolve points synchronously (instant feedback)
      const { points, errors } = resolvePointsSync(reduxState);

      // Report resolution errors to metrics
      if (errors.length > 0) {
        for (const err of errors) {
          if (state.metrics.errors.length < 10) {
            state.metrics.errors.push(err.error);
          }
        }
      }

      // Dispatch resolved points
      if (points.length > 0) {
        store.dispatch(resolveAll({
          resolved: points.map(p => ({ id: p.id, x: p.x, y: p.y, resolutionError: p.resolutionError })),
        }) as AnyAction);
      }
```

- [ ] **Step 3: Skip errored pieces in `buildPiecesAsync`**

In `buildPiecesAsync` (around line 260-297), after getting points, add the skip logic before building each piece. Locate where pieces are iterated and add the guard:

```typescript
  // Filter out construction pieces where any node references an errored point
  const buildablePieces = pieces.filter(cPiece => {
    const hasErroredPoints = cPiece.nodes.some(node => {
      const pt = points.find(p => p.id === node.pointId);
      return pt?.resolutionError != null;
    });
    return !hasErroredPoints;
  });
```

Then use `buildablePieces` instead of `pieces` for the rest of the function.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run existing middleware tests**

Run: `npx vitest run src/store/__tests__/reactiveSolverMiddleware.test.ts`
Expected: PASS — existing tests should still work.

- [ ] **Step 6: Commit**

```bash
git add src/store/reactiveSolverMiddleware.ts
git commit -m "fix(solver): collect errors in resolvePointsSync, skip errored pieces (#396)"
```

---

### Task 7: Add `unresolvedCount` to `inspectorSlice`

**Files:**
- Modify: `src/store/inspectorSlice.ts:27-40, 55-117`
- Modify: `src/store/__tests__/inspectorSlice.test.ts` (if it exists, add test)

- [ ] **Step 1: Add `unresolvedCount` state and reducer**

In `src/store/inspectorSlice.ts`:

Add to `InspectorState` (line ~39):
```typescript
  /** Global count of construction points with resolution errors */
  unresolvedCount: number;
```

Add to `initialState` (line ~48):
```typescript
  unresolvedCount: 0,
```

Add new reducer (after `clearInspection`):
```typescript
    setUnresolvedCount(state, action: PayloadAction<number>) {
      state.unresolvedCount = action.payload;
    },
```

Export it:
```typescript
export const {
  setInspectionTarget,
  setInspectionData,
  setDiagnostics,
  setAgentAnalysis,
  setAgentStreaming,
  setAgentError,
  clearInspection,
  setUnresolvedCount,
} = inspectorSlice.actions;
```

- [ ] **Step 2: Write test for `setUnresolvedCount`**

Add to existing `src/store/__tests__/inspectorSlice.test.ts`:

```typescript
describe('setUnresolvedCount', () => {
  it('updates unresolvedCount', () => {
    const state = reducer(undefined, setUnresolvedCount(5));
    expect(state.unresolvedCount).toBe(5);
  });

  it('resets to zero', () => {
    let state = reducer(undefined, setUnresolvedCount(3));
    state = reducer(state, setUnresolvedCount(0));
    expect(state.unresolvedCount).toBe(0);
  });

  it('is reset by clearInspection', () => {
    let state = reducer(undefined, setUnresolvedCount(7));
    state = reducer(state, clearInspection());
    expect(state.unresolvedCount).toBe(0);
  });
});
```

Update the import at the top of the test file to include `setUnresolvedCount`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/inspectorSlice.test.ts`
Expected: PASS — the reducer is already implemented in Step 1.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/inspectorSlice.ts src/store/__tests__/inspectorSlice.test.ts
git commit -m "feat(inspector): add unresolvedCount state for badge (#396)"
```

---

### Task 8: Dispatch `unresolvedCount` from middleware

**Files:**
- Modify: `src/store/reactiveSolverMiddleware.ts`

- [ ] **Step 1: Import `setUnresolvedCount` and dispatch after resolve**

At the top of `reactiveSolverMiddleware.ts`, add to imports:
```typescript
import { setUnresolvedCount } from './inspectorSlice';
```

In the middleware handler, after dispatching `resolveAll` (around line 562-565), add:

```typescript
      // Update unresolved count for UI badge
      const unresolvedCount = points.filter(p => p.resolutionError != null).length;
      store.dispatch(setUnresolvedCount(unresolvedCount) as AnyAction);
```

Also listen for `construction/removePoint` to recompute the count. This check must be placed AFTER `const result = next(action)` (line ~531) but BEFORE the TRIGGER_ACTIONS early-return check (line ~536), so it runs for all actions — not just trigger actions:

```typescript
      // Update unresolvedCount when points are removed (removePoint flags dependents)
      if (action.type === 'construction/removePoint') {
        const updatedState = store.getState();
        const count = updatedState.construction.points.filter(
          (p: CPoint) => p.resolutionError != null
        ).length;
        store.dispatch(setUnresolvedCount(count) as AnyAction);
      }
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/store/reactiveSolverMiddleware.ts
git commit -m "feat(solver): dispatch unresolvedCount after resolve and removePoint (#396)"
```

---

### Task 9: Diagnostic rule — `ruleUnresolvedPoints`

**Files:**
- Modify: `src/diagnostics/types.ts`
- Modify: `src/diagnostics/dataCollector.ts`
- Modify: `src/diagnostics/ruleEngine.ts`
- Modify: `src/diagnostics/__tests__/ruleEngine.test.ts` (file exists — has `makeData` and `makeFabric` helpers)
- Modify: `src/diagnostics/__tests__/dataCollector.test.ts` (file exists — has `makeState` and `makePiece` helpers)

- [ ] **Step 1: Add `unresolvedPoints` to `InspectionData`**

In `src/diagnostics/types.ts`, add before the closing `}` of `InspectionData` (around line 93):

```typescript
  /** Construction points that failed to resolve for this piece */
  unresolvedPoints?: Array<{ label: string; error: string }>;
```

- [ ] **Step 2: Update `dataCollector.ts` to collect unresolved points**

In `src/diagnostics/dataCollector.ts`, after the existing construction point collection (around the section that handles `target.constructionPointId`), add code to collect all unresolved points for the piece.

The data collector receives `state: RootState`. Look up the construction piece via reverse `pieceIdentityMap`:

```typescript
  // Collect unresolved construction points for this piece
  const unresolvedPoints: Array<{ label: string; error: string }> = [];
  const { pieceIdentityMap, pieces: cPieces, points: cPoints } = state.construction;
  // Reverse lookup: find construction piece ID whose pattern piece ID matches
  for (const [cPieceId, patternPieceId] of Object.entries(pieceIdentityMap)) {
    if (patternPieceId === piece.id) {
      const cPiece = cPieces.find(cp => cp.id === cPieceId);
      if (cPiece) {
        for (const node of cPiece.nodes) {
          const pt = cPoints.find(p => p.id === node.pointId);
          if (pt?.resolutionError) {
            unresolvedPoints.push({ label: pt.label, error: pt.resolutionError });
          }
        }
      }
      break;
    }
  }
```

Include `unresolvedPoints` in the returned `InspectionData` (only if non-empty):

```typescript
  ...(unresolvedPoints.length > 0 ? { unresolvedPoints } : {}),
```

- [ ] **Step 3: Write failing test for `ruleUnresolvedPoints`**

Add to existing `src/diagnostics/__tests__/ruleEngine.test.ts` (uses existing `makeData` helper):

```typescript
describe('ruleUnresolvedPoints', () => {
  it('fires error when unresolvedPoints is non-empty', () => {
    const data = makeData({
      unresolvedPoints: [
        { label: 'bustApex', error: "Dangling reference: point 'shoulderPt' not found" },
      ],
    });
    const diagnostics = evaluateRules(data);
    const found = diagnostics.find(d => d.category === 'construction' && d.severity === 'error');
    expect(found).toBeDefined();
    expect(found!.message).toMatch(/1 construction point/);
  });

  it('does not fire when unresolvedPoints is absent', () => {
    const data = makeData();
    const diagnostics = evaluateRules(data);
    const found = diagnostics.find(d => d.category === 'construction' && d.message.match(/construction point.*failed/i));
    expect(found).toBeUndefined();
  });

  it('does not fire when unresolvedPoints is empty', () => {
    const data = makeData({ unresolvedPoints: [] });
    const diagnostics = evaluateRules(data);
    const found = diagnostics.find(d => d.category === 'construction' && d.message.match(/construction point.*failed/i));
    expect(found).toBeUndefined();
  });
});
```

- [ ] **Step 3b: Write failing test for dataCollector unresolved point collection**

Add to existing `src/diagnostics/__tests__/dataCollector.test.ts` (uses existing `makeState` and `makePiece` helpers). The `makeState` factory accepts `constructionPoints` — extend it for this test to also include `constructionPieces` and `pieceIdentityMap`:

```typescript
describe('collectInspectionData — unresolvedPoints', () => {
  it('collects unresolved construction points for a piece via pieceIdentityMap', () => {
    const target: InspectionTarget = { type: 'piece', pieceId: 'piece-1' };
    const state = makeState({
      constructionPoints: [
        {
          id: 'pt1', label: 'A', x: 0, y: 0,
          definition: { type: 'manual', x: 0, y: 0 },
          visible: true,
          resolutionError: "Dangling reference: point 'X' was deleted",
        },
        {
          id: 'pt2', label: 'B', x: 100, y: 200,
          definition: { type: 'manual', x: 100, y: 200 },
          visible: true,
        },
      ],
      // Need to extend makeState to support these — see note below
    });

    const data = collectInspectionData(target, state);
    expect(data.unresolvedPoints).toHaveLength(1);
    expect(data.unresolvedPoints![0].label).toBe('A');
    expect(data.unresolvedPoints![0].error).toMatch(/X.*deleted/);
  });
});
```

Note: The implementing agent will need to extend the `makeState` factory in this test file to include `constructionPieces`, `pieceIdentityMap`, and the `resolutionError` field on mock construction points. Follow the existing pattern of the factory.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/diagnostics/__tests__/ruleEngine.test.ts`
Expected: FAIL — rule doesn't exist yet.

- [ ] **Step 5: Add `ruleUnresolvedPoints` to `ruleEngine.ts`**

In `src/diagnostics/ruleEngine.ts`, add the new rule before the `RULES` array:

```typescript
const ruleUnresolvedPoints: Rule = (data) => {
  if (!data.unresolvedPoints || data.unresolvedPoints.length === 0) {
    return [];
  }
  const count = data.unresolvedPoints.length;
  const detail = data.unresolvedPoints
    .map(p => `• ${p.label}: ${p.error}`)
    .join('\n');
  return [
    {
      severity: 'error',
      category: 'construction',
      message: `${count} construction point(s) failed to resolve`,
      detail,
    },
  ];
};
```

Add `ruleUnresolvedPoints` to the `RULES` array.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/diagnostics/__tests__/ruleEngine.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics/types.ts src/diagnostics/dataCollector.ts src/diagnostics/ruleEngine.ts src/diagnostics/__tests__/ruleEngine.test.ts src/diagnostics/__tests__/dataCollector.test.ts
git commit -m "feat(diagnostics): add ruleUnresolvedPoints diagnostic rule + dataCollector integration (#396)"
```

---

### Task 10: UI — Inspector tab badge + 2D canvas error indicator

**Files:**
- Modify: `src/components/BottomPanel/BottomPanel.tsx:21-31`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx`

- [ ] **Step 1: Add badge to Inspector tab in `BottomPanel.tsx`**

In `src/components/BottomPanel/BottomPanel.tsx`, the `buildTabs` function (line 21-31) already uses a badge pattern for the "Problems" tab. Follow the same pattern:

First, import `useSelector` and read `unresolvedCount`:

The component already uses `useSelector`. Read the count:

```typescript
const unresolvedCount = useSelector((state: RootState) => state.inspector.unresolvedCount);
```

Update `buildTabs` to accept `unresolvedCount` and modify the Inspector tab label:

```typescript
function buildTabs(problemCount: number, unresolvedCount: number): { id: BottomTab; label: string }[] {
  return [
    { id: 'copilot', label: 'Copilot' },
    { id: 'problems', label: problemCount > 0 ? `Problems (${problemCount})` : 'Problems' },
    { id: 'output', label: 'Output' },
    { id: 'nesting-preview', label: 'Nesting Preview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'inspector', label: unresolvedCount > 0 ? `Inspector (${unresolvedCount})` : 'Inspector' },
    { id: 'poms', label: 'POMs' },
  ];
}
```

Update the call site:
```typescript
const allTabs = buildTabs(warnings.length, unresolvedCount);
```

- [ ] **Step 2: Add red dashed outline for errored pieces in `PieceRenderer.tsx`**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`:

Add a new prop to `SinglePieceProps`:
```typescript
  /** Whether the piece has unresolved construction points */
  hasResolutionErrors?: boolean;
```

After the `groupColor` dashed overlay (after line ~176 in `SinglePiece`), add a red dashed error overlay. This z-ordering ensures the error indicator renders above the group color overlay:

```typescript
      {hasResolutionErrors && (
        <path
          d={pathToSVG(piece.outline)}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2 / zoom2D}
          strokeDasharray={`${6 / zoom2D} ${4 / zoom2D}`}
          pointerEvents="none"
        />
      )}
```

The parent component that renders `SinglePiece` needs to compute `hasResolutionErrors` for each piece. This requires:
1. Reading `state.construction.pieceIdentityMap` to find the construction piece
2. Reading `state.construction.points` to check for `resolutionError`

Add a selector or compute it inline in the parent. Create a selector in a convenient location (e.g., inline in the parent or as a reusable selector):

```typescript
// In the parent that maps over pieces and renders SinglePiece
const constructionPoints = useSelector((state: RootState) => state.construction.points);
const pieceIdentityMap = useSelector((state: RootState) => state.construction.pieceIdentityMap);
const constructionPieces = useSelector((state: RootState) => state.construction.pieces);

// For each pattern piece, check if it has errored construction points
function hasResolutionErrors(patternPieceId: string): boolean {
  for (const [cPieceId, ppId] of Object.entries(pieceIdentityMap)) {
    if (ppId === patternPieceId) {
      const cPiece = constructionPieces.find(cp => cp.id === cPieceId);
      if (cPiece) {
        return cPiece.nodes.some(node => {
          const pt = constructionPoints.find(p => p.id === node.pointId);
          return pt?.resolutionError != null;
        });
      }
    }
  }
  return false;
}
```

Pass `hasResolutionErrors={hasResolutionErrors(piece.id)}` to each `<SinglePiece>`.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomPanel/BottomPanel.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat(ui): add Inspector badge + red dashed outline for errored pieces (#396)"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify acceptance criteria**

1. Failed point resolution produces an error entry → verified by constructionSlice tests
2. Pieces with unresolvable points are flagged proactively → Inspector badge + red dashed outline
3. `resolvePointsSync()` reports resolution failures to metrics → errors pushed to `state.metrics.errors`
4. Errored pieces preserve last-known-good outline → `buildPiecesAsync` skip logic
5. Point deletion immediately flags dependent points → `removePoint` cascade test

- [ ] **Step 4: Final commit if any uncommitted changes remain**

```bash
git status
# If clean, proceed. If not, commit remaining changes.
```
