# POM Measurement System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent named measurements (Points of Measure) to the project, with a 2D creation tool, POM panel, overlay renderer, CSV export, and 4 copilot tools.

**Architecture:** POM types added to `types.ts`, stored in `ProjectState.poms[]` alongside seams. Pure compute functions in `pomCompute.ts`. Tool hook `usePOMMeasureTool` with snap-to-outline bridging. POM panel as new bottom tab. Copilot tools follow the sewing tools pattern.

**Tech Stack:** Redux Toolkit, React, Vitest, SVG overlay rendering, arc-length math from `arcLength.ts`

**Spec:** `docs/superpowers/specs/2026-03-19-pom-measurement-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/utils/pom/pomCompute.ts` | Pure compute: straight distance, along-edge arc-length, recompute all |
| `src/tools/definitions/pomMeasure.tsx` | Tool definition: id, icon, shortcut P, options |
| `src/components/PatternEditor/usePOMMeasureTool.ts` | Tool hook: snap bridging, state machine, inline naming |
| `src/components/PatternEditor/renderers/overlays/POMOverlay.tsx` | SVG dimension lines + labels |
| `src/components/BottomPanel/POMPanel.tsx` | Table view, inline edit, CSV export |
| `src/copilot/action/tools/definitions/pomTools.ts` | 4 copilot tools |
| `src/store/__tests__/projectSlice.pom.test.ts` | Reducer tests |
| `src/utils/pom/__tests__/pomCompute.test.ts` | Compute function tests |

---

### Task 1: Add POM types to types.ts

**Files:**
- Modify: `src/types/types.ts`

- [ ] **Step 1: Add POM type definitions**

In `src/types/types.ts`, after the `SeamGroup` interface (around line 200), add:

```typescript
// ─── Points of Measure (POM) ────────────────────────────────────────────────

/** Measurement method — how the value is computed */
export type POMMethod = 'straight' | 'alongEdge' | 'circumference' | 'height' | 'surfaceTape';

/** Measurement category for grouping and filtering */
export type POMCategory = 'length' | 'width' | 'circumference' | 'height' | 'custom';

/** A reference point on a pattern piece (piece-local coordinates) */
export interface POMPoint {
  pieceId: string;
  edgeName?: string;
  t?: number;
  localPosition: Point2D;
}

/** Persistent named measurement */
export interface PointOfMeasure {
  id: string;
  name: string;
  category: POMCategory;
  method: POMMethod;
  pointA: POMPoint;
  pointB: POMPoint;
  value: number;
  tolerance?: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add `pomMeasure` to Tool2D union**

Find `Tool2D` type (line 306). Add `| 'pomMeasure'` after `'compareCurves'` (in the annotation group):

```typescript
  | 'compareCurves'
  | 'pomMeasure'      // persistent named measurement
```

- [ ] **Step 3: Add `poms` to OpenCloProject**

Find `OpenCloProject` interface (line 274). Add after `groups?`:

```typescript
  poms?: PointOfMeasure[];
```

- [ ] **Step 4: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pom): add PointOfMeasure, POMPoint, POMMethod, POMCategory types"
```

---

### Task 2: Redux actions + tests

**Files:**
- Modify: `src/store/projectSlice.ts`
- Create: `src/store/__tests__/projectSlice.pom.test.ts`
- Modify: `src/store/undoMiddleware.ts`
- Modify: `src/store/layoutSlice.ts`

- [ ] **Step 1: Write failing tests**

Create `src/store/__tests__/projectSlice.pom.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import reducer, {
  addPOM, updatePOM, removePOM, recomputePOMValues,
  removePiece, loadProject,
} from '../projectSlice';
import type { PointOfMeasure } from '../../types/types';

function makePOM(id: string, overrides: Partial<PointOfMeasure> = {}): PointOfMeasure {
  return {
    id,
    name: 'Test POM',
    category: 'custom',
    method: 'straight',
    pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
    pointB: { pieceId: 'p2', localPosition: { x: 100, y: 0 } },
    value: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const initialState = reducer(undefined, { type: '@@INIT' });

describe('projectSlice — POM actions', () => {
  describe('addPOM', () => {
    it('adds a POM to state', () => {
      const state = reducer(initialState, addPOM(makePOM('pom1')));
      expect(state.poms).toHaveLength(1);
      expect(state.poms[0].id).toBe('pom1');
      expect(state.isDirty).toBe(true);
    });

    it('backfills defaults', () => {
      const minimal = { ...makePOM('pom2'), category: undefined } as any;
      const state = reducer(initialState, addPOM(minimal));
      expect(state.poms[0].category).toBe('custom');
    });
  });

  describe('updatePOM', () => {
    it('replaces POM by id', () => {
      let state = reducer(initialState, addPOM(makePOM('pom1')));
      state = reducer(state, updatePOM(makePOM('pom1', { name: 'Renamed' })));
      expect(state.poms[0].name).toBe('Renamed');
      expect(state.isDirty).toBe(true);
    });

    it('does nothing for unknown id', () => {
      let state = reducer(initialState, addPOM(makePOM('pom1')));
      state = reducer(state, updatePOM(makePOM('unknown')));
      expect(state.poms).toHaveLength(1);
    });
  });

  describe('removePOM', () => {
    it('removes POM by id', () => {
      let state = reducer(initialState, addPOM(makePOM('pom1')));
      state = reducer(state, removePOM('pom1'));
      expect(state.poms).toHaveLength(0);
      expect(state.isDirty).toBe(true);
    });
  });

  describe('recomputePOMValues', () => {
    it('batch updates POM values', () => {
      let state = reducer(initialState, addPOM(makePOM('pom1', { value: 100 })));
      state = reducer(state, addPOM(makePOM('pom2', { value: 200 })));
      state = reducer(state, recomputePOMValues([
        { id: 'pom1', value: 150 },
        { id: 'pom2', value: 250 },
      ]));
      expect(state.poms.find(p => p.id === 'pom1')?.value).toBe(150);
      expect(state.poms.find(p => p.id === 'pom2')?.value).toBe(250);
    });
  });

  describe('removePiece cleans up POMs', () => {
    it('removes POMs referencing deleted piece', () => {
      let state = reducer(initialState, addPOM(makePOM('pom1', {
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p2', localPosition: { x: 100, y: 0 } },
      })));
      // Need a piece in state for removePiece to work
      state = { ...state, pieces: [{ id: 'p1' } as any, { id: 'p2' } as any] };
      state = reducer(state, removePiece('p1'));
      expect(state.poms).toHaveLength(0);
    });
  });

  describe('loadProject backfills poms', () => {
    it('defaults poms to [] for old projects', () => {
      const project = {
        id: 'old', name: 'Old Project',
        pieces: [], seams: [], fabrics: [],
        avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
        createdAt: 0, updatedAt: 0,
      };
      const state = reducer(undefined, loadProject(project));
      expect(state.poms).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/projectSlice.pom.test.ts`
Expected: FAIL — `addPOM`, `updatePOM`, `removePOM`, `recomputePOMValues` not exported

- [ ] **Step 3: Implement Redux actions in projectSlice**

In `src/store/projectSlice.ts`:

1. Add `PointOfMeasure` to the import from `../types/types` (line 3).

2. Add `poms: PointOfMeasure[]` to `ProjectState` interface (after `groups`).

3. Add `poms: []` to `initialState` (after `groups: []`).

4. In `loadProject` reducer, add after the piece backfill loop:
```typescript
state.poms = p.poms ?? [];
```
(The `OpenCloProject` interface already has `poms?: PointOfMeasure[]`, so no cast needed.)

5. In `removePiece` reducer, add after the groups cleanup:
```typescript
// Clean up POMs referencing the removed piece
state.poms = state.poms.filter(
  pom => pom.pointA.pieceId !== action.payload && pom.pointB.pieceId !== action.payload
);
```

6. Add new reducers after `reverseSeam`:
```typescript
// ─── Points of Measure (POM) ───
addPOM(state, action: PayloadAction<PointOfMeasure>) {
  const pom = {
    ...action.payload,
    category: action.payload.category ?? 'custom',
    createdAt: action.payload.createdAt ?? Date.now(),
    updatedAt: action.payload.updatedAt ?? Date.now(),
  };
  state.poms.push(pom);
  state.isDirty = true;
},
updatePOM(state, action: PayloadAction<PointOfMeasure>) {
  const idx = state.poms.findIndex(p => p.id === action.payload.id);
  if (idx !== -1) {
    state.poms[idx] = { ...action.payload, updatedAt: Date.now() };
    state.isDirty = true;
  }
},
removePOM(state, action: PayloadAction<string>) {
  state.poms = state.poms.filter(p => p.id !== action.payload);
  state.isDirty = true;
},
/** Recompute derived values — intentionally does NOT set isDirty (not a user edit) */
recomputePOMValues(state, action: PayloadAction<{ id: string; value: number }[]>) {
  for (const { id, value } of action.payload) {
    const pom = state.poms.find(p => p.id === id);
    if (pom) pom.value = value;
  }
},
```

7. Export the new actions (add to the exports block):
```typescript
// POMs
addPOM, updatePOM, removePOM, recomputePOMValues,
```

- [ ] **Step 4: Add BottomTab type**

In `src/store/layoutSlice.ts` (line 3), add `'poms'` to the `BottomTab` union:
```typescript
export type BottomTab = 'copilot' | 'problems' | 'output' | 'nesting-preview' | 'timeline' | 'inspector' | 'poms';
```

- [ ] **Step 5: Add selectedPOMId to editorSlice**

In `src/store/editorSlice.ts`, add `selectedPOMId: string | null` to the state (alongside `selectedSeamId`), initialize to `null`, and add a `selectPOM` reducer:
```typescript
selectPOM(state, action: PayloadAction<string | null>) {
  state.selectedPOMId = action.payload;
},
```
Export `selectPOM` action.

- [ ] **Step 6: Add undo labels**

In `src/store/undoMiddleware.ts`, add to the `ACTION_LABELS` map:
```typescript
'project/addPOM': 'Add Measurement',
'project/updatePOM': 'Update Measurement',
'project/removePOM': 'Remove Measurement',
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/store/__tests__/projectSlice.pom.test.ts`
Expected: All pass

- [ ] **Step 8: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(pom): add POM Redux actions, BottomTab type, undo labels"
```

---

### Task 3: Pure compute functions + tests

**Files:**
- Create: `src/utils/pom/pomCompute.ts`
- Create: `src/utils/pom/__tests__/pomCompute.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/pom/__tests__/pomCompute.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePOMValue, computeStraightDistance, computeAlongEdgeDistance, recomputeAllPOMs } from '../pomCompute';
import type { PointOfMeasure, POMPoint, PatternPiece } from '../../../types/types';

const pieceA: PatternPiece = {
  id: 'p1', name: 'Front',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] },
    { type: 'L', values: [0, 300] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 100, y: 50 },
  edges: [
    { id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 200 },
    { id: 'e2', name: 'right', segmentRange: [2, 3], edgeType: 'seam', length: 300 },
  ],
  active: true,
  createdAt: 0, updatedAt: 0,
} as any;

const pieceB: PatternPiece = {
  id: 'p2', name: 'Back',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] },
    { type: 'L', values: [0, 300] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 400, y: 50 },
  edges: [],
  active: true,
  createdAt: 0, updatedAt: 0,
} as any;

const pieces = [pieceA, pieceB];

describe('pomCompute', () => {
  describe('computeStraightDistance', () => {
    it('computes Euclidean distance between two piece-local points resolved to world', () => {
      const ptA: POMPoint = { pieceId: 'p1', localPosition: { x: 100, y: 0 } };
      const ptB: POMPoint = { pieceId: 'p2', localPosition: { x: 100, y: 0 } };
      // World A: (100+100, 50+0) = (200, 50)
      // World B: (400+100, 50+0) = (500, 50)
      // Distance: 300
      const dist = computeStraightDistance(ptA, ptB, pieces);
      expect(dist).toBeCloseTo(300, 1);
    });

    it('returns null if piece not found', () => {
      const ptA: POMPoint = { pieceId: 'missing', localPosition: { x: 0, y: 0 } };
      const ptB: POMPoint = { pieceId: 'p2', localPosition: { x: 0, y: 0 } };
      expect(computeStraightDistance(ptA, ptB, pieces)).toBeNull();
    });
  });

  describe('computeAlongEdgeDistance', () => {
    it('computes arc-length of a named edge', () => {
      const pom: PointOfMeasure = {
        id: 'pom1', name: 'Top Edge', category: 'length', method: 'alongEdge',
        pointA: { pieceId: 'p1', edgeName: 'top', t: 0, localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', edgeName: 'top', t: 1, localPosition: { x: 200, y: 0 } },
        value: 0, createdAt: 0, updatedAt: 0,
      };
      const dist = computeAlongEdgeDistance(pom, pieces);
      expect(dist).toBeCloseTo(200, 1);
    });

    it('returns null if edge not found', () => {
      const pom: PointOfMeasure = {
        id: 'pom2', name: 'Missing', category: 'length', method: 'alongEdge',
        pointA: { pieceId: 'p1', edgeName: 'nonexistent', t: 0, localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p1', edgeName: 'nonexistent', t: 1, localPosition: { x: 0, y: 0 } },
        value: 0, createdAt: 0, updatedAt: 0,
      };
      expect(computeAlongEdgeDistance(pom, pieces)).toBeNull();
    });
  });

  describe('computePOMValue', () => {
    it('dispatches to straight for straight method', () => {
      const pom: PointOfMeasure = {
        id: 'pom1', name: 'Width', category: 'width', method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 100, y: 150 } },
        pointB: { pieceId: 'p2', localPosition: { x: 100, y: 150 } },
        value: 0, createdAt: 0, updatedAt: 0,
      };
      expect(computePOMValue(pom, pieces)).toBeCloseTo(300, 1);
    });
  });

  describe('recomputeAllPOMs', () => {
    it('returns update pairs for all POMs', () => {
      const poms: PointOfMeasure[] = [
        {
          id: 'pom1', name: 'W', category: 'width', method: 'straight',
          pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
          pointB: { pieceId: 'p2', localPosition: { x: 0, y: 0 } },
          value: 0, createdAt: 0, updatedAt: 0,
        },
      ];
      const updates = recomputeAllPOMs(poms, pieces);
      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe('pom1');
      expect(updates[0].value).toBeCloseTo(300, 1);
    });

    it('skips orphaned POMs', () => {
      const poms: PointOfMeasure[] = [
        {
          id: 'orphan', name: 'X', category: 'custom', method: 'straight',
          pointA: { pieceId: 'missing', localPosition: { x: 0, y: 0 } },
          pointB: { pieceId: 'p2', localPosition: { x: 0, y: 0 } },
          value: 0, createdAt: 0, updatedAt: 0,
        },
      ];
      const updates = recomputeAllPOMs(poms, pieces);
      expect(updates).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/pom/__tests__/pomCompute.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement compute functions**

Create `src/utils/pom/pomCompute.ts`:

```typescript
import type { PointOfMeasure, POMPoint, PatternPiece } from '../../types/types';
import { computePathArcLength } from '../geometry/arcLength';

/**
 * Resolve a POMPoint to world coordinates using piece position.
 */
function resolveWorldPosition(pt: POMPoint, pieces: PatternPiece[]): { x: number; y: number } | null {
  const piece = pieces.find(p => p.id === pt.pieceId);
  if (!piece) return null;
  return {
    x: piece.position.x + pt.localPosition.x,
    y: piece.position.y + pt.localPosition.y,
  };
}

/**
 * Compute straight-line Euclidean distance between two POM points.
 */
export function computeStraightDistance(
  pointA: POMPoint,
  pointB: POMPoint,
  pieces: PatternPiece[],
): number | null {
  const worldA = resolveWorldPosition(pointA, pieces);
  const worldB = resolveWorldPosition(pointB, pieces);
  if (!worldA || !worldB) return null;
  return Math.hypot(worldB.x - worldA.x, worldB.y - worldA.y);
}

/**
 * Compute arc-length along a named edge for an along-edge POM.
 * Both pointA and pointB must reference the same piece and edge.
 */
export function computeAlongEdgeDistance(
  pom: PointOfMeasure,
  pieces: PatternPiece[],
): number | null {
  const piece = pieces.find(p => p.id === pom.pointA.pieceId);
  if (!piece) return null;

  const edgeName = pom.pointA.edgeName;
  if (!edgeName || !piece.edges) return null;

  const edge = piece.edges.find(e => e.name === edgeName);
  if (!edge) return null;

  // Always compute from geometry for correctness (edge.length may be stale after edits)
  return computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
}

/**
 * Compute the value of a POM based on its method.
 */
export function computePOMValue(
  pom: PointOfMeasure,
  pieces: PatternPiece[],
): number | null {
  switch (pom.method) {
    case 'straight':
      return computeStraightDistance(pom.pointA, pom.pointB, pieces);
    case 'alongEdge':
      return computeAlongEdgeDistance(pom, pieces);
    default:
      return null; // circumference, height, surfaceTape — Phase 2-3
  }
}

/**
 * Recompute all POM values. Returns update pairs for POMs that could be computed.
 * Orphaned POMs (referencing deleted pieces/edges) are skipped.
 */
export function recomputeAllPOMs(
  poms: PointOfMeasure[],
  pieces: PatternPiece[],
): { id: string; value: number }[] {
  const updates: { id: string; value: number }[] = [];
  for (const pom of poms) {
    const value = computePOMValue(pom, pieces);
    if (value != null) {
      updates.push({ id: pom.id, value });
    }
  }
  return updates;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/pom/__tests__/pomCompute.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pom): add pure POM compute functions with tests"
```

---

### Task 4: Tool definition + registration

**Files:**
- Create: `src/tools/definitions/pomMeasure.tsx`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Create tool definition**

Create `src/tools/definitions/pomMeasure.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const POMIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size} height={size} viewBox="0 0 18 18"
    fill="none" stroke="currentColor" strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round"
  >
    {/* Ruler with named label */}
    <line x1="3" y1="14" x2="15" y2="4" />
    <line x1="3" y1="14" x2="5" y2="12" strokeWidth={2} />
    <line x1="13" y1="6" x2="15" y2="4" strokeWidth={2} />
    <line x1="7" y1="10" x2="8" y2="9" />
    <line x1="9" y1="8" x2="10" y2="7" />
    <text x="9" y="16" fontSize="5" fill="currentColor" textAnchor="middle" stroke="none">POM</text>
  </svg>
);

export const pomMeasureTool: ToolDefinition = {
  id: 'pomMeasure',
  name: 'POM Measure',
  description: 'Create persistent named measurements (Points of Measure)',
  context: '2d',
  shortcut: 'p',
  icon: POMIcon,
  cursor: 'crosshair',
  group: 'annotation',
  options: [
    {
      id: 'method',
      label: 'Method',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Straight', value: 'straight' },
        { label: 'Along Edge', value: 'alongEdge' },
      ],
    },
    {
      id: 'defaultCategory',
      label: 'Category',
      type: 'select',
      value: 'custom',
      choices: [
        { label: 'Length', value: 'length' },
        { label: 'Width', value: 'width' },
        { label: 'Custom', value: 'custom' },
      ],
    },
  ],
  copilot: {
    description: 'Create a persistent named measurement (Point of Measure) on the 2D pattern. Straight mode measures point-to-point, along-edge mode measures full edge arc-length. / Crear una medida persistente con nombre (POM) en el patrón 2D.',
    examples: [
      'Add a chest width measurement',
      'Measure the side seam length',
      'Create a POM for the hemline',
    ],
    keywords: ['pom', 'measurement', 'point of measure', 'dimension', 'tech pack', 'persistent'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: true,
    parameterHints: {
      method: 'straight (point-to-point) or alongEdge (full edge arc-length)',
      defaultCategory: 'Preset category: length, width, or custom',
    },
  },
};
```

- [ ] **Step 2: Register in tools/index.ts**

In `src/tools/index.ts`, add the import alongside other annotation tools:

```typescript
import { pomMeasureTool } from './definitions/pomMeasure';
```

Add `pomMeasureTool` to the `allTools` array, after `compareCurvesTool` (or the last annotation tool).

- [ ] **Step 3: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pom): add pomMeasure tool definition and register"
```

---

### Task 5: POM tool hook (usePOMMeasureTool)

**Files:**
- Create: `src/components/PatternEditor/usePOMMeasureTool.ts`
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`

- [ ] **Step 1: Create the tool hook**

Create `src/components/PatternEditor/usePOMMeasureTool.ts`. This hook implements:
- `snapToPOMPoint()` — bridges `snapToOutline` → POMPoint (with edgeName + t resolution)
- State machine: IDLE → POINT_A_SET → NAMING (straight) or IDLE → NAMING (alongEdge)
- Inline naming state (text input position + value)
- `handleMouseDown`, `handleMouseMove`, `handleKeyDown` event handlers
- Dispatches `addPOM` on Enter during NAMING phase

Key implementation details:
- Import `snapToOutline`, `findEdgeForSegment` from `./useMeasureTool`
- Import `distanceAlongPath`, `computePathArcLength` from `../../utils/geometry/arcLength`
- Import `computePOMValue` from `../../utils/pom/pomCompute`
- Import `addPOM` from `../../store/projectSlice`
- Use `uid()` from `../../utils/pathHelpers` for POM id generation
- Read `method` and `defaultCategory` from tool options via `useSelector`

The `snapToPOMPoint` function:
```typescript
function snapToPOMPoint(snapResult: SnapResult, piece: PatternPiece): POMPoint {
  const edge = findEdgeForSegment(piece, snapResult.segmentIndex);
  const localX = snapResult.point.x - piece.position.x;
  const localY = snapResult.point.y - piece.position.y;
  let t: number | undefined;
  if (edge) {
    const totalLen = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
    const distToPoint = distanceAlongPath(piece.outline, { x: localX, y: localY }, edge.segmentRange[0], edge.segmentRange[1]);
    t = totalLen > 0 ? distToPoint / totalLen : 0;
  }
  return {
    pieceId: piece.id,
    edgeName: edge?.name,
    t,
    localPosition: { x: localX, y: localY },
  };
}
```

Return interface:
```typescript
{
  phase: 'idle' | 'pointASet' | 'naming';
  pointA: POMPoint | null;
  pointB: POMPoint | null;
  hoveredSnap: SnapResult | null;
  namingPosition: Point2D | null;  // world position for inline input
  nameValue: string;
  setNameValue: (v: string) => void;
  handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  confirmName: () => void;
  cancel: () => void;
}
```

- [ ] **Step 2: Wire into PatternEditor.tsx**

In `src/components/PatternEditor/PatternEditor.tsx`:
- Import `usePOMMeasureTool`
- Instantiate: `const pomTool = usePOMMeasureTool(zoom2D, pan2D, pieces);`
- Pass to `useEditorInteractions` tools object
- Pass POM overlay props to `<ToolOverlay>`

- [ ] **Step 3: Wire into useEditorInteractions.ts**

In `src/components/PatternEditor/useEditorInteractions.ts`:
- Add `pomTool` to tool hooks interface
- In keyboard handler: `if (activeTool === 'pomMeasure') handlers.push(pomTool.handleKeyDown);`
- In handleMouseDown: `if (activeTool === 'pomMeasure') { pomTool.handleMouseDown(e); return; }`
- In handleMouseMove: `if (activeTool === 'pomMeasure') pomTool.handleMouseMove(e);`

- [ ] **Step 4: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pom): add usePOMMeasureTool hook with snap bridging and state machine"
```

---

### Task 6: POM Overlay (2D renderer)

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/POMOverlay.tsx`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`

- [ ] **Step 1: Create POMOverlay component**

Create `src/components/PatternEditor/renderers/overlays/POMOverlay.tsx`:

Renders all POMs from Redux as persistent SVG annotations:
- **Straight POMs**: dashed line with arrowheads, value label at midpoint, color `#8e44ad`
- **Along-edge POMs**: colored edge highlight (thinner than seam), value label, color `#2980b9`
- **Selected POM**: brighter, thicker
- **Naming input**: foreignObject with `<input>` at naming position during NAMING phase
- Resolve POMPoint to world coords using `piece.position + localPosition`

Props:
```typescript
interface POMOverlayProps {
  poms: PointOfMeasure[];
  pieces: PatternPiece[];
  zoom2D: number;
  selectedPOMId: string | null;
  // Tool state (for active creation)
  phase: string;
  pointA: POMPoint | null;
  hoveredSnap: SnapResult | null;
  namingPosition: Point2D | null;
  nameValue: string;
  onNameChange: (v: string) => void;
  onNameConfirm: () => void;
  onNameCancel: () => void;
}
```

- [ ] **Step 2: Add to ToolOverlay.tsx**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:
- Import `POMOverlay`
- Add props for POM state
- Render `<POMOverlay>` (always visible, not just when tool is active — POMs are persistent annotations)

- [ ] **Step 3: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pom): add POMOverlay with dimension lines, labels, and inline naming"
```

---

### Task 7: POM Panel (Bottom Panel tab)

**Files:**
- Create: `src/components/BottomPanel/POMPanel.tsx`
- Modify: `src/components/BottomPanel/BottomPanel.tsx`

- [ ] **Step 1: Create POMPanel component**

Create `src/components/BottomPanel/POMPanel.tsx`:

Features:
- Table with columns: Name, Category, Method, Value, Tolerance, Actions (delete)
- Double-click name → inline edit input
- Double-click tolerance → inline edit input
- Click row → dispatch selection (store selected POM ID in editorSlice or local state)
- "Export CSV" button at top-right
- Empty state message
- `useEffect` watching `pieces` → calls `recomputeAllPOMs()` → dispatches `recomputePOMValues`
- CSV export calls `recomputeAllPOMs()` on-demand before generating CSV

Read `src/components/BottomPanel/InspectorTab.tsx` for the styling pattern (dark theme, compact rows).

- [ ] **Step 2: Add to BottomPanel.tsx**

In `src/components/BottomPanel/BottomPanel.tsx`:
- Import `POMPanel`
- Add `{ id: 'poms', label: 'POMs' }` to the `buildTabs` function
- Add render case: `{activeTab === 'poms' && <POMPanel />}`

- [ ] **Step 3: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pom): add POMPanel with table view, inline edit, CSV export"
```

---

### Task 8: Copilot tools

**Files:**
- Create: `src/copilot/action/tools/definitions/pomTools.ts`
- Modify: `src/copilot/action/tools/registry.ts`

- [ ] **Step 1: Create pomTools.ts**

Create `src/copilot/action/tools/definitions/pomTools.ts` with 4 tools following the sewing tools pattern:

1. **createPOM** — resolves piece/edge geometry, calls `computePOMValue()`, dispatches `addPOM`
2. **getPOMs** — reads state, calls `recomputeAllPOMs()` on-demand, returns fresh values
3. **updatePOM** — dispatches `updatePOM` for name/tolerance/category changes
4. **removePOM** — dispatches `removePOM` with rollback

Each tool has bilingual description (EN/ES), JSON Schema parameters, execute function.

Export as `export const tools: ToolDefinition[] = [...]`.

- [ ] **Step 2: Register in registry.ts**

In `src/copilot/action/tools/registry.ts`:
- Add import: `import { tools as pomToolDefs } from './definitions/pomTools';`
- Add `pomToolDefs` to `ALL_TOOL_MODULES` array

- [ ] **Step 3: Update tool count tests**

In `src/copilot/__tests__/compoundTools.test.ts` and `toolsE2E.test.ts`:
- Update expected tool count: current count + 4
- Add POM tool names to expected list in `toolsE2E.test.ts`

- [ ] **Step 4: Run type check + tests**

Run: `npx tsc -b --noEmit && npx vitest run src/copilot/__tests__/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pom): register 4 copilot tools (createPOM, getPOMs, updatePOM, removePOM)"
```

---

### Task 9: Diagnostic rule + keyboard shortcut

**Files:**
- Modify: `src/diagnostics/types.ts` — add `poms?: PointOfMeasure[]` to `InspectionData`
- Modify: `src/diagnostics/dataCollector.ts` — add `poms: state.project.poms` to returned object
- Modify: `src/diagnostics/ruleEngine.ts` — add no-POMs rule
- Modify: `src/hooks/useKeyboardShortcuts.ts` — add P shortcut

- [ ] **Step 1: Extend InspectionData**

In `src/diagnostics/types.ts`, add to `InspectionData`:
```typescript
poms?: PointOfMeasure[];
```
Import `PointOfMeasure` from `../types/types`.

- [ ] **Step 2: Pass POMs from dataCollector**

In `src/diagnostics/dataCollector.ts`, add to the returned `InspectionData` object:
```typescript
poms: state.project.poms,
```

- [ ] **Step 3: Add diagnostic rule**

In `src/diagnostics/ruleEngine.ts`, add a new rule function:

```typescript
function ruleNoPOMs(data: InspectionData): Diagnostic[] {
  const hasPOMs = data.poms?.some(
    p => p.pointA.pieceId === data.piece?.id || p.pointB.pieceId === data.piece?.id
  );
  if (!hasPOMs) {
    return [{
      severity: 'info',
      category: 'measurement',
      message: 'No POMs reference this piece — consider adding measurements for tech pack completeness',
    }];
  }
  return [];
}
```

Register in the `RULES` array.

- [ ] **Step 2: Add P shortcut**

In `src/hooks/useKeyboardShortcuts.ts`, in the no-modifiers section, add:

```typescript
if (key === 'p') {
  dispatch(setActiveTool2D('pomMeasure'));
  return;
}
```

- [ ] **Step 3: Run type check + tests**

Run: `npx tsc -b --noEmit && npx vitest run src/diagnostics/`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pom): add 'no POMs' diagnostic rule and P keyboard shortcut"
```

---

### Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Manual smoke test checklist**

1. Press P → POM tool activates with crosshair cursor
2. Click two points on piece outlines → inline name input appears
3. Type "Chest Width" + Enter → POM created, visible as dimension line
4. Bottom panel → POMs tab → table shows the POM with value
5. Click row → POM highlights in 2D viewport
6. Double-click name → inline edit works
7. Export CSV → downloads file with piece names and values
8. Switch to Along Edge mode → click an edge → names + saves arc-length POM
9. Copilot: "measure the side seam" → createPOM executes
10. Copilot: "what are all measurements?" → getPOMs returns table
11. Delete piece → POM referencing it is cleaned up

- [ ] **Step 4: Commit if adjustments needed**

```bash
git commit -m "feat(pom): POM Measurement System (#367) — final adjustments"
```
