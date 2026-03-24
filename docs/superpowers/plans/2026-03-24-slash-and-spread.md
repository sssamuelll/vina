# Slash and Spread Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full CLO3D-style slash-and-spread tool with pivot/parallel modes, smooth/straight gap fill, and copilot integration.

**Architecture:** Pure geometry engine (`src/utils/geometry/slashAndSpread.ts`) consumed by a React hook (`useSlashAndSpreadTool.ts`) with SVG overlay and a copilot tool. Reuses existing `findOutlineIntersections` and `splitOutlineAtPoints` from `splitOutline.ts`. The geometry module has zero Redux dependencies — all state management is in the hook.

**Tech Stack:** TypeScript, React hooks, SVG overlays, Redux Toolkit, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-slash-and-spread-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/geometry/slashAndSpread.ts` | Pure geometry: split, classify, rotate/translate, merge, rebuild edges |
| `src/utils/geometry/__tests__/slashAndSpread.test.ts` | Geometry unit tests |
| `src/tools/definitions/slashAndSpread.tsx` | UI tool definition + SVG icon |
| `src/components/PatternEditor/useSlashAndSpreadTool.ts` | State machine hook |
| `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx` | SVG overlay per state |
| `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts` | Hook state machine tests |
| `src/copilot/action/tools/definitions/__tests__/slashAndSpreadTool.test.ts` | Copilot tool tests |

### Modified Files
| File | Change |
|------|--------|
| `src/types/types.ts:406` | Add `'slashAndSpread'` to `Tool2D` union after `'scissors'` |
| `src/utils/patternOps.ts:325-363` | Replace naive `slashAndSpread` with re-export from geometry module |
| `src/tools/index.ts:82` | Import + add to `allTools` array |
| `src/components/Toolbar2D/Toolbar2D.tsx:35` | Add to scissors group: `['scissors', 'slashAndSpread']` |
| `src/components/PatternEditor/PatternEditor.tsx:21,110` | Instantiate hook |
| `src/components/PatternEditor/useEditorInteractions.ts:128-134,279,362` | Wire ToolHooks + routing |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx:49-145,227` | Add props + overlay dispatch |
| `src/copilot/action/tools/definitions/patternOpsTools.ts:151-173` | Replace naive copilot tool |

---

## Task 1: Geometry — findSlashIntersections + splitOutlineAtSlash

**Files:**
- Create: `src/utils/geometry/slashAndSpread.ts`
- Create: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests for findSlashIntersections**

```typescript
// src/utils/geometry/__tests__/slashAndSpread.test.ts
import { describe, it, expect } from 'vitest';
import { findSlashIntersections, splitOutlineAtSlash } from '../slashAndSpread';
import type { PathCommand } from '../../../types/types';

// 100x150 rectangle centered at (50,75)
const RECT_OUTLINE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

describe('findSlashIntersections', () => {
  it('finds exactly 2 intersections for vertical line through rectangle', () => {
    const hits = findSlashIntersections(RECT_OUTLINE, { x: 50, y: -10 }, { x: 50, y: 160 });
    expect(hits).toHaveLength(2);
    expect(hits[0].point.x).toBeCloseTo(50);
    expect(hits[1].point.x).toBeCloseTo(50);
  });

  it('finds 2 intersections for diagonal line', () => {
    const hits = findSlashIntersections(RECT_OUTLINE, { x: -10, y: 75 }, { x: 110, y: 75 });
    expect(hits).toHaveLength(2);
  });

  it('throws when line misses the piece entirely', () => {
    expect(() =>
      findSlashIntersections(RECT_OUTLINE, { x: 200, y: 0 }, { x: 200, y: 150 })
    ).toThrow();
  });

  it('throws when line is tangent (not exactly 2 intersections)', () => {
    // Line along the top edge — tangent, not crossing
    expect(() =>
      findSlashIntersections(RECT_OUTLINE, { x: -10, y: 0 }, { x: 110, y: 0 })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement findSlashIntersections and splitOutlineAtSlash**

```typescript
// src/utils/geometry/slashAndSpread.ts
import type { PathCommand, Point2D } from '../../types/types';
import { findOutlineIntersections, splitOutlineAtPoints } from './splitOutline';
import type { OutlineHit } from './splitOutline';

export type { OutlineHit };

/**
 * Index mapping from original outline → split halves.
 * Tracks which original command indices ended up in which half.
 */
export interface SplitMap {
  /** For each half, maps new command index → original command index (or -1 if inserted) */
  halfAIndices: number[];
  halfBIndices: number[];
  /** The two OutlineHits used for splitting */
  hit1: OutlineHit;
  hit2: OutlineHit;
}

/**
 * Find exactly 2 intersection points where a slash line crosses a piece outline.
 * Throws if not exactly 2 intersections.
 */
export function findSlashIntersections(
  outline: PathCommand[],
  startPoint: Point2D,
  endPoint: Point2D,
): [OutlineHit, OutlineHit] {
  const hits = findOutlineIntersections(outline, startPoint, endPoint);
  if (hits.length !== 2) {
    throw new Error(
      `Slash line must cross the outline at exactly 2 points, but found ${hits.length}`,
    );
  }
  return [hits[0], hits[1]];
}

/**
 * Split an outline into two closed halves at the slash intersections.
 * Each half includes the slash line segment as its closing edge.
 * Returns the halves + a SplitMap for index tracking.
 */
export function splitOutlineAtSlash(
  outline: PathCommand[],
  hit1: OutlineHit,
  hit2: OutlineHit,
): { halfA: PathCommand[]; halfB: PathCommand[]; splitMap: SplitMap } {
  const [halfA, halfB] = splitOutlineAtPoints(outline, hit1, hit2);

  // Build index mapping: walk each half and map back to original indices
  // Commands from the original outline keep their index; closing/slash segments get -1
  const halfAIndices = halfA.map((cmd, i) => {
    if (cmd.type === 'M' || cmd.type === 'Z') return -1;
    // Approximate: commands before the slash line closing segment
    return i < halfA.length - 2 ? hit1.commandIndex + i - 1 : -1;
  });
  const halfBIndices = halfB.map((cmd, i) => {
    if (cmd.type === 'M' || cmd.type === 'Z') return -1;
    return i < halfB.length - 2 ? hit2.commandIndex + i - 1 : -1;
  });

  return {
    halfA,
    halfB,
    splitMap: { halfAIndices, halfBIndices, hit1, hit2 },
  };
}
```

Note: The `SplitMap` index mapping above is approximate — refine during Task 7 when `rebuildSemanticEdges` actually uses it. The important thing is the interface exists from the start.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/geometry/slashAndSpread.ts src/utils/geometry/__tests__/slashAndSpread.test.ts
git commit -m "feat(geometry): add findSlashIntersections and splitOutlineAtSlash"
```

---

## Task 2: Geometry — classifyInternals + classifyDarts

**Files:**
- Modify: `src/utils/geometry/slashAndSpread.ts`
- Modify: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to slashAndSpread.test.ts
import { classifyInternals, classifyDarts } from '../slashAndSpread';
import type { InternalLine, Dart } from '../../../types/types';

describe('classifyInternals', () => {
  // Two halves: left (x < 50) and right (x >= 50) of a rectangle
  const halfA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 150] },
    { type: 'L', values: [0, 150] },
    { type: 'Z', values: [] },
  ];
  const halfB: PathCommand[] = [
    { type: 'M', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 150] },
    { type: 'L', values: [50, 150] },
    { type: 'Z', values: [] },
  ];

  it('assigns grainline on left side to halfA', () => {
    const internals: InternalLine[] = [{
      id: 'gl1', type: 'grainline',
      path: [{ type: 'M', values: [25, 10] }, { type: 'L', values: [25, 140] }],
    }];
    const { internalsA, internalsB } = classifyInternals(internals, halfA, halfB);
    expect(internalsA).toHaveLength(1);
    expect(internalsB).toHaveLength(0);
  });

  it('assigns internal on right side to halfB', () => {
    const internals: InternalLine[] = [{
      id: 'ts1', type: 'topstitch',
      path: [{ type: 'M', values: [75, 10] }, { type: 'L', values: [75, 140] }],
    }];
    const { internalsA, internalsB } = classifyInternals(internals, halfA, halfB);
    expect(internalsA).toHaveLength(0);
    expect(internalsB).toHaveLength(1);
  });
});

describe('classifyDarts', () => {
  const halfA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 150] },
    { type: 'L', values: [0, 150] },
    { type: 'Z', values: [] },
  ];
  const halfB: PathCommand[] = [
    { type: 'M', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 150] },
    { type: 'L', values: [50, 150] },
    { type: 'Z', values: [] },
  ];

  it('assigns dart with apex on left to dartsA', () => {
    const darts: Dart[] = [{
      id: 'd1', intake: 15,
      apex: { x: 25, y: 75 },
      legs: [{ x: 20, y: 0 }, { x: 30, y: 0 }],
    } as Dart];
    const { dartsA, dartsB } = classifyDarts(darts, halfA, halfB);
    expect(dartsA).toHaveLength(1);
    expect(dartsB).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: FAIL — classifyInternals/classifyDarts not exported

- [ ] **Step 3: Implement classifyInternals and classifyDarts**

```typescript
// Add to src/utils/geometry/slashAndSpread.ts
import type { InternalLine, Dart } from '../../types/types';
import { flattenPath } from '../../utils/patternOps'; // or inline

/**
 * Check if a point is inside a closed polygon (PathCommand[]).
 * Uses ray-casting algorithm.
 */
function pointInPolygon(point: Point2D, polygon: PathCommand[]): boolean {
  const pts = flattenPathToPoints(polygon);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Flatten PathCommand[] to Point2D[] (extract coordinate pairs). */
function flattenPathToPoints(cmds: PathCommand[]): Point2D[] {
  const pts: Point2D[] = [];
  for (const cmd of cmds) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      pts.push({ x: cmd.values[i], y: cmd.values[i + 1] });
    }
  }
  return pts;
}

/**
 * Classify internal lines into the half that contains them.
 * Uses majority-of-path sampling (5 evenly-spaced points).
 * Dart-type internals use the furthest-from-baseline point (apex).
 */
export function classifyInternals(
  internals: InternalLine[],
  halfA: PathCommand[],
  halfB: PathCommand[],
): { internalsA: InternalLine[]; internalsB: InternalLine[] } {
  const internalsA: InternalLine[] = [];
  const internalsB: InternalLine[] = [];

  for (const internal of internals) {
    const pts = flattenPathToPoints(internal.path);
    if (pts.length === 0) continue;

    // Sample 5 evenly-spaced points along the path
    const sampleCount = Math.min(5, pts.length);
    let inA = 0;
    let inB = 0;
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.floor((i / sampleCount) * pts.length);
      const pt = pts[idx];
      if (pointInPolygon(pt, halfA)) inA++;
      else if (pointInPolygon(pt, halfB)) inB++;
    }

    if (inA >= inB) {
      internalsA.push(internal);
    } else {
      internalsB.push(internal);
    }
  }

  return { internalsA, internalsB };
}

/**
 * Classify rich Dart entities by their apex position.
 */
export function classifyDarts(
  darts: Dart[],
  halfA: PathCommand[],
  halfB: PathCommand[],
): { dartsA: Dart[]; dartsB: Dart[] } {
  const dartsA: Dart[] = [];
  const dartsB: Dart[] = [];

  for (const dart of darts) {
    if (pointInPolygon(dart.apex, halfA)) {
      dartsA.push(dart);
    } else {
      dartsB.push(dart);
    }
  }

  return { dartsA, dartsB };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/geometry/slashAndSpread.ts src/utils/geometry/__tests__/slashAndSpread.test.ts
git commit -m "feat(geometry): add classifyInternals and classifyDarts"
```

---

## Task 3: Geometry — applyPivotSpread + applyParallelSpread

**Files:**
- Modify: `src/utils/geometry/slashAndSpread.ts`
- Modify: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { applyPivotSpread, applyParallelSpread } from '../slashAndSpread';

describe('applyPivotSpread', () => {
  const half: PathCommand[] = [
    { type: 'M', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 150] },
    { type: 'L', values: [50, 150] },
    { type: 'Z', values: [] },
  ];

  it('rotates 90° around origin produces expected coordinates', () => {
    const pivot = { x: 0, y: 0 };
    const result = applyPivotSpread(half, [], [], pivot, 90);
    // (50,0) rotated 90° CCW around origin → (0,50)
    expect(result.outline[0].values[0]).toBeCloseTo(0, 0);
    expect(result.outline[0].values[1]).toBeCloseTo(50, 0);
  });

  it('0° returns identical outline', () => {
    const pivot = { x: 50, y: 0 };
    const result = applyPivotSpread(half, [], [], pivot, 0);
    expect(result.outline).toEqual(half);
  });

  it('negative angle rotates in opposite direction', () => {
    const pivot = { x: 0, y: 0 };
    const resultPos = applyPivotSpread(half, [], [], pivot, 45);
    const resultNeg = applyPivotSpread(half, [], [], pivot, -45);
    // M command y values should be opposite signs relative to 0°
    expect(resultPos.outline[0].values[1]).toBeGreaterThan(0);
    expect(resultNeg.outline[0].values[1]).toBeLessThan(0);
  });
});

describe('applyParallelSpread', () => {
  const half: PathCommand[] = [
    { type: 'M', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 150] },
    { type: 'L', values: [50, 150] },
    { type: 'Z', values: [] },
  ];

  it('translates perpendicular to vertical slash by 20mm', () => {
    // Slash direction is vertical (0,1) → perpendicular is (1,0)
    const slashDir = { x: 0, y: 1 };
    const result = applyParallelSpread(half, [], [], slashDir, 20);
    // All x values should be shifted by 20
    expect(result.outline[0].values[0]).toBeCloseTo(70);
    expect(result.outline[1].values[0]).toBeCloseTo(120);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement rotation and translation functions**

```typescript
// Add to src/utils/geometry/slashAndSpread.ts

/** Rotate a point around a pivot by angleDeg (counter-clockwise). */
function rotatePoint(pt: Point2D, pivot: Point2D, angleDeg: number): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - pivot.x;
  const dy = pt.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/** Apply rotation to all coordinate pairs in a PathCommand[]. */
function rotateCommands(cmds: PathCommand[], pivot: Point2D, angleDeg: number): PathCommand[] {
  return cmds.map(cmd => {
    if (cmd.values.length === 0) return { ...cmd };
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      const rotated = rotatePoint({ x: newValues[i], y: newValues[i + 1] }, pivot, angleDeg);
      newValues[i] = rotated.x;
      newValues[i + 1] = rotated.y;
    }
    return { ...cmd, values: newValues };
  });
}

/** Translate all coordinate pairs in a PathCommand[] by (dx, dy). */
function translateCommands(cmds: PathCommand[], dx: number, dy: number): PathCommand[] {
  return cmds.map(cmd => {
    if (cmd.values.length === 0) return { ...cmd };
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      newValues[i] += dx;
      newValues[i + 1] += dy;
    }
    return { ...cmd, values: newValues };
  });
}

export interface SpreadHalfResult {
  outline: PathCommand[];
  internals: InternalLine[];
  darts: Dart[];
}

/**
 * Rotate a half-outline, its internals, and darts around a pivot point.
 */
export function applyPivotSpread(
  half: PathCommand[],
  internals: InternalLine[],
  darts: Dart[],
  pivot: Point2D,
  angleDeg: number,
): SpreadHalfResult {
  return {
    outline: rotateCommands(half, pivot, angleDeg),
    internals: internals.map(il => ({
      ...il,
      path: rotateCommands(il.path, pivot, angleDeg),
    })),
    darts: darts.map(d => ({
      ...d,
      apex: rotatePoint(d.apex, pivot, angleDeg),
      legs: d.legs.map(l => rotatePoint(l, pivot, angleDeg)),
    })),
  };
}

/**
 * Translate a half-outline, its internals, and darts perpendicular to the slash direction.
 */
export function applyParallelSpread(
  half: PathCommand[],
  internals: InternalLine[],
  darts: Dart[],
  slashDirection: Point2D,
  distance: number,
): SpreadHalfResult {
  // Perpendicular to slash direction (90° CCW): (-dy, dx) normalized
  const len = Math.sqrt(slashDirection.x ** 2 + slashDirection.y ** 2);
  const perpX = (-slashDirection.y / len) * distance;
  const perpY = (slashDirection.x / len) * distance;

  return {
    outline: translateCommands(half, perpX, perpY),
    internals: internals.map(il => ({
      ...il,
      path: translateCommands(il.path, perpX, perpY),
    })),
    darts: darts.map(d => ({
      ...d,
      apex: { x: d.apex.x + perpX, y: d.apex.y + perpY },
      legs: d.legs.map(l => ({ x: l.x + perpX, y: l.y + perpY })),
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/geometry/slashAndSpread.ts src/utils/geometry/__tests__/slashAndSpread.test.ts
git commit -m "feat(geometry): add applyPivotSpread and applyParallelSpread"
```

---

## Task 4: Geometry — mergeSpreadHalves (straight + smooth gap fill)

**Files:**
- Modify: `src/utils/geometry/slashAndSpread.ts`
- Modify: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { mergeSpreadHalves } from '../slashAndSpread';

describe('mergeSpreadHalves', () => {
  // Two halves of a rectangle split at x=50, with halfB shifted right by 20
  const halfA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 150] },
    { type: 'L', values: [0, 150] },
    { type: 'Z', values: [] },
  ];
  const halfB: PathCommand[] = [
    { type: 'M', values: [70, 0] },
    { type: 'L', values: [120, 0] },
    { type: 'L', values: [120, 150] },
    { type: 'L', values: [70, 150] },
    { type: 'Z', values: [] },
  ];

  it('straight fill produces closed outline with line segments across gap', () => {
    const { outline, gapCommandCount } = mergeSpreadHalves(halfA, halfB, 'straight');
    // Outline should be closed (starts with M, ends with Z)
    expect(outline[0].type).toBe('M');
    expect(outline[outline.length - 1].type).toBe('Z');
    // Should have more commands than either half alone (gap segments added)
    expect(outline.length).toBeGreaterThan(halfA.length);
    expect(gapCommandCount).toBeGreaterThan(0);
  });

  it('smooth fill produces bezier curves across gap', () => {
    const { outline } = mergeSpreadHalves(halfA, halfB, 'smooth');
    const hasBezier = outline.some(cmd => cmd.type === 'C' || cmd.type === 'Q');
    expect(hasBezier).toBe(true);
  });

  it('merged outline is closed (first point ≈ last point before Z)', () => {
    const { outline } = mergeSpreadHalves(halfA, halfB, 'straight');
    const firstPt = outline[0].values;
    const lastEdge = outline[outline.length - 2]; // before Z
    const lastPt = lastEdge.values.slice(-2);
    expect(firstPt[0]).toBeCloseTo(lastPt[0], 0);
    expect(firstPt[1]).toBeCloseTo(lastPt[1], 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mergeSpreadHalves**

Implement the function in `slashAndSpread.ts`. The straight fill connects the gap endpoints with `L` commands. The smooth fill creates a cubic bezier (`C` command) using Catmull-Rom → cubic conversion: given 4 points p0,p1,p2,p3, control points are `p1 + (p2-p0)/6` and `p2 - (p3-p1)/6` for G1 continuity.

The function must:
1. Extract the last point of halfA and the first point of halfB (top gap)
2. Extract the last point of halfB and the first point of halfA (bottom gap)
3. Walk halfA edges → insert gap connection → walk halfB edges → insert gap connection → close
4. Return `{ outline, gapCommandCount }` (number of commands inserted per gap)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/slashAndSpread.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/geometry/slashAndSpread.ts src/utils/geometry/__tests__/slashAndSpread.test.ts
git commit -m "feat(geometry): add mergeSpreadHalves with straight and smooth gap fill"
```

---

## Task 5: Geometry — rebuildSemanticEdges

**Files:**
- Modify: `src/utils/geometry/slashAndSpread.ts`
- Modify: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { rebuildSemanticEdges } from '../slashAndSpread';
import type { SemanticEdge } from '../../../types/types';

describe('rebuildSemanticEdges', () => {
  it('edges on static half retain original segment ranges', () => {
    const edges: SemanticEdge[] = [
      { id: 'e1', name: 'topEdge', segmentRange: [1, 2], edgeType: 'seam' },
    ];
    // splitMap: edge 'e1' is on halfA (static), slash at command 3
    const splitMap = {
      halfAIndices: [-1, 1, 2, -1, -1],  // M, cmd1, cmd2, slashClose, Z
      halfBIndices: [-1, 3, 4, -1, -1],
      hit1: { commandIndex: 2, t: 1, point: { x: 50, y: 0 } },
      hit2: { commandIndex: 4, t: 0, point: { x: 50, y: 150 } },
    };
    const result = rebuildSemanticEdges(edges, splitMap as any, 2, 'B');
    // Edge on static half — should keep range [1,2]
    expect(result[0].segmentRange[0]).toBe(1);
    expect(result[0].segmentRange[1]).toBe(2);
  });

  it('edges on spread half are offset by gap command count', () => {
    const edges: SemanticEdge[] = [
      { id: 'e2', name: 'bottomEdge', segmentRange: [3, 4], edgeType: 'seam' },
    ];
    const splitMap = {
      halfAIndices: [-1, 1, 2, -1, -1],
      halfBIndices: [-1, 3, 4, -1, -1],
      hit1: { commandIndex: 2, t: 1, point: { x: 50, y: 0 } },
      hit2: { commandIndex: 4, t: 0, point: { x: 50, y: 150 } },
    };
    const result = rebuildSemanticEdges(edges, splitMap as any, 2, 'B');
    // Edge on spread half — offset by gapCommandCount (2)
    expect(result[0].segmentRange[0]).toBe(5);
    expect(result[0].segmentRange[1]).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests, verify fail, implement, verify pass, commit**

Follow the standard TDD cycle. The implementation uses `splitMap` to determine which half each edge belongs to (by checking if its original `segmentRange` indices appear in `halfAIndices` or `halfBIndices`), then applies the appropriate offset.

```bash
git commit -m "feat(geometry): add rebuildSemanticEdges with tracked index offsets"
```

---

## Task 6: Geometry — buildSpreadPiece orchestrator + area conservation test

**Files:**
- Modify: `src/utils/geometry/slashAndSpread.ts`
- Modify: `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { buildSpreadPiece } from '../slashAndSpread';

describe('buildSpreadPiece', () => {
  it('preserves piece id and name after spread', () => {
    const piece = makePiece('p1');  // helper that creates a PatternPiece
    const [hit1, hit2] = findSlashIntersections(piece.outline, { x: 50, y: -10 }, { x: 50, y: 160 });
    const result = buildSpreadPiece(piece, hit1, hit2, 'B', 'start', 15, 'pivot', 'straight');
    expect(result.id).toBe('p1');
    expect(result.name).toBe(piece.name);
  });

  it('clears linkedPieceId after spread', () => {
    const piece = makePiece('p1');
    piece.linkedPieceId = 'p2';
    piece.linkMode = 'symmetry';
    const [hit1, hit2] = findSlashIntersections(piece.outline, { x: 50, y: -10 }, { x: 50, y: 160 });
    const result = buildSpreadPiece(piece, hit1, hit2, 'B', 'start', 15, 'pivot', 'straight');
    expect(result.linkedPieceId).toBeUndefined();
    expect(result.linkMode).toBeUndefined();
  });

  it('area conservation: spread area ≈ original + gap area', () => {
    const piece = makePiece('p1');
    const originalArea = computeArea(piece.outline);
    const [hit1, hit2] = findSlashIntersections(piece.outline, { x: 50, y: -10 }, { x: 50, y: 160 });
    const result = buildSpreadPiece(piece, hit1, hit2, 'B', 'start', 15, 'pivot', 'straight');
    const newArea = computeArea(result.outline);
    // New area should be greater than original (gap added)
    expect(newArea).toBeGreaterThan(originalArea);
  });
});
```

- [ ] **Step 2: Run tests, verify fail, implement buildSpreadPiece, verify pass, commit**

`buildSpreadPiece` is the orchestrator: calls `findSlashIntersections` → `splitOutlineAtSlash` → `classifyInternals` → `classifyDarts` → `applyPivotSpread`/`applyParallelSpread` → `mergeSpreadHalves` → `rebuildSemanticEdges` → returns new piece with same id, cleared `linkedPieceId`.

```bash
git commit -m "feat(geometry): add buildSpreadPiece orchestrator with area conservation test"
```

---

## Task 7: Replace naive patternOps.slashAndSpread

**Files:**
- Modify: `src/utils/patternOps.ts:325-363`

- [ ] **Step 1: Replace naive implementation with re-export**

```typescript
// In src/utils/patternOps.ts, replace lines 325-363 with:

// ─── slashAndSpread (delegated to geometry module) ────────────────────────────

export { buildSpreadPiece as slashAndSpreadFull } from './geometry/slashAndSpread';

/**
 * Slash and spread: simplified API for backward compatibility.
 * For full control (pivot, parallel, gap fill), use buildSpreadPiece directly.
 */
export function slashAndSpread(
  piece: PatternPiece,
  slashX: number,
  spreadAmount: number,
): PatternPiece {
  const { buildSpreadPiece, findSlashIntersections } = require('./geometry/slashAndSpread');
  const bbox = getBoundingBox(piece.outline);
  const start = { x: slashX, y: bbox.minY - 10 };
  const end = { x: slashX, y: bbox.maxY + 10 };
  const [hit1, hit2] = findSlashIntersections(piece.outline, start, end);
  return buildSpreadPiece(piece, hit1, hit2, 'B', 'start', spreadAmount, 'parallel', 'straight');
}
```

- [ ] **Step 2: Run existing tests to ensure backward compatibility**

Run: `npx vitest run`
Expected: All existing tests pass (the API signature is unchanged)

- [ ] **Step 3: Commit**

```bash
git add src/utils/patternOps.ts
git commit -m "refactor: delegate slashAndSpread to geometry module"
```

---

## Task 8: Tool Definition + Tool2D union

**Files:**
- Create: `src/tools/definitions/slashAndSpread.tsx`
- Modify: `src/types/types.ts:406`
- Modify: `src/tools/index.ts:82`

- [ ] **Step 1: Add `'slashAndSpread'` to Tool2D union**

In `src/types/types.ts` at line 406, after `| 'scissors'`:
```typescript
  | 'scissors'     // split pattern pieces
  | 'slashAndSpread' // slash and spread for fullness
  | 'merge'        // merge adjacent pattern pieces
```

- [ ] **Step 2: Create tool definition file**

Create `src/tools/definitions/slashAndSpread.tsx` with the SVG icon, tool options (mode, gapFill), and copilot metadata as specified in the design spec (see spec §Tool Definition for exact code).

- [ ] **Step 3: Register in tools/index.ts**

Add import and insert into `allTools` array after `scissorsTool`.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/types/types.ts src/tools/definitions/slashAndSpread.tsx src/tools/index.ts
git commit -m "feat: add slashAndSpread tool definition and register"
```

---

## Task 9: Hook — useSlashAndSpreadTool state machine

**Files:**
- Create: `src/components/PatternEditor/useSlashAndSpreadTool.ts`
- Create: `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts`

- [ ] **Step 1: Write failing hook state machine tests**

Test the state transitions: IDLE → DRAWING_SLASH → SLASH_COMPLETE → SELECTING_HALF → HALF_CONFIRMED → AWAITING_DRAG → SPREADING → SPREAD_PREVIEW. Test Escape at each state → IDLE. Test Tab toggles mode. Test Enter in SPREAD_PREVIEW dispatches `updatePiece`.

Use `renderHook` from `@testing-library/react-hooks` with a mock Redux provider.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the hook**

Follow the `useScissorsTool.ts` pattern exactly:
- State ref with `useRef`
- `toPattern()` coordinate conversion using `zoom2D` and `pan2D`
- Mouse handlers check `stateRef.current` for current phase
- `handleMouseDown`: place start (→ DRAWING_SLASH), place end (→ SLASH_COMPLETE), select half (→ SELECTING_HALF), confirm half (→ HALF_CONFIRMED), set pivot (→ AWAITING_DRAG)
- `handleMouseMove`: preview per state
- `handleMouseUp`: in SPREADING → SPREAD_PREVIEW
- `handleKeyDown`: Escape → reset, Enter in SPREAD_PREVIEW → apply, Tab → toggle mode
- Return all state + handlers

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/useSlashAndSpreadTool.ts src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts
git commit -m "feat: add useSlashAndSpreadTool hook with state machine"
```

---

## Task 10: Overlay — SlashAndSpreadOverlay

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx`

- [ ] **Step 1: Create the overlay component**

SVG component rendering per state: dashed slash line (DRAWING_SLASH), solid line + arrows (SLASH_COMPLETE), half highlight fills (SELECTING_HALF, HALF_CONFIRMED), live preview + angle arc + labels (SPREADING), editable input + hint text (SPREAD_PREVIEW).

Follow the `ScissorsOverlay.tsx` pattern: receive state props, render SVG elements conditionally.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx
git commit -m "feat: add SlashAndSpreadOverlay component"
```

---

## Task 11: Wire into PatternEditor + useEditorInteractions + ToolOverlay

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/Toolbar2D/Toolbar2D.tsx:35`

- [ ] **Step 1: Wire hook in PatternEditor.tsx**

Import `useSlashAndSpreadTool`, instantiate with `(zoom2D, pan2D)`, pass into `useEditorInteractions` alongside existing tools.

- [ ] **Step 2: Add to ToolHooks interface in useEditorInteractions.ts**

Add `slashAndSpreadTool` entry matching the scissors pattern (handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, getCursor, reset).

- [ ] **Step 3: Add routing in useEditorInteractions.ts**

Add `if (activeTool === 'slashAndSpread')` cases in handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, getCursor. Follow the exact pattern used for scissors at lines 279, 362, etc.

- [ ] **Step 4: Extend ToolOverlayProps and add dispatch in ToolOverlay.tsx**

Add slash-and-spread state props to the interface. Add conditional rendering block:
```tsx
{activeTool === 'slashAndSpread' && (
  <SlashAndSpreadOverlay {...slashAndSpreadProps} />
)}
```

- [ ] **Step 5: Add to Toolbar2D.tsx TOOL_GROUPS**

At line 35, change `['scissors']` to `['scissors', 'slashAndSpread']`.

- [ ] **Step 6: Run type check + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean types, all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/Toolbar2D/Toolbar2D.tsx
git commit -m "feat: wire slashAndSpread into editor, toolbar, and overlay"
```

---

## Task 12: Copilot tool — replace naive entry

**Files:**
- Modify: `src/copilot/action/tools/definitions/patternOpsTools.ts:151-173`
- Create: `src/copilot/action/tools/definitions/__tests__/slashAndSpreadTool.test.ts`

- [ ] **Step 1: Write failing copilot tool tests**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('slashAndSpread copilot tool', () => {
  it('succeeds with valid edge-name params', async () => {
    // Setup: create mock dispatch/getState with a piece that has edges
    // Call execute with { pieceId, fromEdge: 'sideSeam', toEdge: 'hemline', selectedHalf: 'B', spreadAmount: 15 }
    // Expect: { success: true, data: { pieceId } }
  });

  it('returns error for nonexistent pieceId', async () => {
    // Call with pieceId that doesn't exist
    // Expect: { success: false, error: 'Piece not found' }
  });

  it('returns error for invalid edge name', async () => {
    // Call with fromEdge that doesn't exist on the piece
    // Expect: { success: false, error containing 'edge' }
  });

  it('uses default t=0.5 when fromT/toT not provided', async () => {
    // Call without fromT/toT
    // Expect: success, slash at midpoints of edges
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Replace naive tool in patternOpsTools.ts**

Replace lines 151-173 with the full implementation from the design spec (§Copilot Tool). The execute function:
1. Finds piece by ID
2. Resolves `fromEdge`/`toEdge` names to coordinates via `piece.edges[].segmentRange`
3. Uses `fromT`/`toT` (default 0.5) to compute exact points on edges
4. Calls `buildSpreadPiece` with resolved coordinates
5. Dispatches `updatePiece`
6. Returns `ToolResult`

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/copilot/action/tools/definitions/patternOpsTools.ts src/copilot/action/tools/definitions/__tests__/slashAndSpreadTool.test.ts
git commit -m "feat(copilot): replace naive slashAndSpread with full edge-based tool"
```

---

## Task 13: Final verification + type check

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run linter**

Run: `npx eslint src/utils/geometry/slashAndSpread.ts src/tools/definitions/slashAndSpread.tsx src/components/PatternEditor/useSlashAndSpreadTool.ts src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx src/copilot/action/tools/definitions/patternOpsTools.ts --max-warnings=0`
Expected: Clean

- [ ] **Step 4: Verify tool appears in toolbar**

Start dev server: `npm run dev`
Open browser → 2D view → long-press scissors tool → verify "Slash & Spread" appears in flyout.

- [ ] **Step 5: Commit any final fixes**

```bash
git commit -m "chore: final cleanup for slash and spread tool"
```
