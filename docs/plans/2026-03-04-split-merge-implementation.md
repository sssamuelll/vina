# Split/Merge Pattern Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement professional-grade curve-preserving Split (scissors) and Merge tools for the 2D pattern editor with full copilot integration.

**Architecture:** Geometry utilities for line-polygon intersection and curve-preserving outline splitting/merging. Interactive hooks (`useScissorsTool`, `useMergeTool`) with SVG overlays follow established patterns. Copilot gets `split_piece` and `merge_pieces` actions with full schemas. Clipper2 used for flattened-path intersection detection; original PathCommands preserved on uncut edges.

**Tech Stack:** React hooks, SVG overlays, clipper2-js, Vitest, TypeScript

---

### Task 1: Add `scissors` and `merge` to Tool2D union

**Files:**
- Modify: `src/types/types.ts:267-292`
- Create: `src/tools/definitions/merge.tsx`

**Step 1: Add tool types**

In `src/types/types.ts`, add `| 'scissors'` and `| 'merge'` to the `Tool2D` union (after `| 'measure'`):

```typescript
  | 'measure'      // distance / angle measurement
  | 'scissors'     // split pattern pieces
  | 'merge'        // merge adjacent pieces
  | 'hand'         // pan
```

**Step 2: Create merge tool definition**

Create `src/tools/definitions/merge.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const MergeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Two shapes merging into one */}
    <rect x="1" y="4" width="7" height="10" rx="1" />
    <rect x="10" y="4" width="7" height="10" rx="1" />
    <path d="M8 9L10 9" strokeWidth={2} />
  </svg>
);

export const mergeTool: ToolDefinition = {
  id: 'merge',
  name: 'Merge Patterns',
  context: '2d',
  shortcut: 'j',
  icon: MergeIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description:
      'Merge two adjacent pattern pieces into one piece. Select the first piece, then the second piece. The pieces must share an adjacent edge. The shared edge is removed and the outlines are combined.',
    examples: [
      'Merge the upper and lower bodice pieces',
      'Join these two pattern pieces together',
      'Combine the front panels into one piece',
    ],
    keywords: ['merge', 'join', 'combine', 'unite', 'connect', 'fuse'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};
```

**Step 3: Register merge tool in barrel export**

Check and add to `src/tools/definitions/index.ts`:

```typescript
export { mergeTool } from './merge';
```

Also register in `src/tools/registry.ts` (or wherever tools are registered — follow existing scissors registration pattern).

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 5: Commit**

```bash
git add src/types/types.ts src/tools/definitions/merge.tsx src/tools/definitions/index.ts src/tools/registry.ts
git commit -m "feat(editor): add scissors and merge to Tool2D, create merge tool definition"
```

---

### Task 2: Line-segment intersection utilities (TDD)

**Files:**
- Create: `src/utils/geometry/lineIntersect.ts`
- Create: `src/utils/geometry/__tests__/lineIntersect.test.ts`

**Step 1: Write failing tests**

Create `src/utils/geometry/__tests__/lineIntersect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  lineSegmentIntersection,
  linePolylineIntersections,
} from '../lineIntersect';

describe('lineSegmentIntersection', () => {
  it('returns intersection point for crossing segments', () => {
    // Horizontal line through vertical segment
    const result = lineSegmentIntersection(
      { x: 0, y: 5 }, { x: 10, y: 5 },  // horizontal line
      { x: 5, y: 0 }, { x: 5, y: 10 },   // vertical segment
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(5);
    expect(result!.t).toBeCloseTo(0.5);
  });

  it('returns null for parallel segments', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 },
    );
    expect(result).toBeNull();
  });

  it('returns null for non-crossing segments', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 5, y: 5 }, { x: 5, y: 10 },
    );
    expect(result).toBeNull();
  });

  it('returns correct t parameter along the segment', () => {
    // Line crosses segment at 1/4 of the way
    const result = lineSegmentIntersection(
      { x: 0, y: 2.5 }, { x: 10, y: 2.5 },
      { x: 5, y: 0 }, { x: 5, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(0.25);
  });

  it('handles diagonal lines', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(5);
  });
});

describe('linePolylineIntersections', () => {
  it('finds two intersections through a square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 }, // closed
    ];
    // Horizontal line through the middle
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      square,
    );
    expect(hits).toHaveLength(2);
    // Left edge hit
    expect(hits[0].point.x).toBeCloseTo(0);
    expect(hits[0].point.y).toBeCloseTo(5);
    // Right edge hit
    expect(hits[1].point.x).toBeCloseTo(10);
    expect(hits[1].point.y).toBeCloseTo(5);
  });

  it('returns segment indices', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      square,
    );
    // First hit on segment 3 (from (0,10) to (0,0)), second on segment 1 (from (10,0) to (10,10))
    expect(hits.map(h => h.segmentIndex).sort()).toEqual([1, 3]);
  });

  it('returns empty for line that misses polygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 15 }, { x: 15, y: 15 },
      square,
    );
    expect(hits).toHaveLength(0);
  });

  it('handles triangle', () => {
    const triangle = [
      { x: 5, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      triangle,
    );
    expect(hits).toHaveLength(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/lineIntersect.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement**

Create `src/utils/geometry/lineIntersect.ts`:

```typescript
import type { Point2D } from '../../types/types';

export interface LineSegmentHit {
  /** Intersection point */
  point: Point2D;
  /** Parameter t along the segment (0 = start, 1 = end) */
  t: number;
  /** Index of the segment in the polyline (0-based, segment i connects point[i] to point[i+1]) */
  segmentIndex: number;
}

/**
 * Find intersection of an infinite line (through p1, p2) with a finite segment (a, b).
 * Returns the intersection point and t parameter along the segment, or null if no intersection.
 *
 * Uses the parametric line intersection formula.
 * The line is treated as infinite; the segment is bounded to t ∈ [0, 1].
 */
export function lineSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  a: Point2D,
  b: Point2D,
): { point: Point2D; t: number } | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const ex = b.x - a.x;
  const ey = b.y - a.y;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const fx = a.x - p1.x;
  const fy = a.y - p1.y;

  // t along segment (a → b)
  const t = (fx * dy - fy * dx) / denom;
  if (t < -1e-10 || t > 1 + 1e-10) return null; // outside segment

  // u along line (p1 → p2) — not bounded but useful for direction
  const u = (fx * ey - fy * ex) / denom;
  // We want the intersection to be "in front" on the line direction,
  // but since we treat the line as infinite, we just need t in range
  void u;

  const clampedT = Math.max(0, Math.min(1, t));
  return {
    point: {
      x: a.x + clampedT * ex,
      y: a.y + clampedT * ey,
    },
    t: clampedT,
  };
}

/**
 * Find all intersections of an infinite line (through p1, p2) with a polyline.
 * Returns hits sorted by distance from p1.
 *
 * The polyline is a series of connected points. Each consecutive pair forms a segment.
 * If the polyline is closed (last point ≈ first point), the closing segment is included.
 */
export function linePolylineIntersections(
  p1: Point2D,
  p2: Point2D,
  polyline: Point2D[],
): LineSegmentHit[] {
  const hits: LineSegmentHit[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const result = lineSegmentIntersection(p1, p2, polyline[i], polyline[i + 1]);
    if (result) {
      // Deduplicate hits at the same point (can happen at vertices)
      const isDup = hits.some(
        h => Math.hypot(h.point.x - result.point.x, h.point.y - result.point.y) < 0.01,
      );
      if (!isDup) {
        hits.push({ ...result, segmentIndex: i });
      }
    }
  }

  // Sort by distance from p1
  const ldx = p2.x - p1.x;
  const ldy = p2.y - p1.y;
  hits.sort((a, b) => {
    const da = (a.point.x - p1.x) * ldx + (a.point.y - p1.y) * ldy;
    const db = (b.point.x - p1.x) * ldx + (b.point.y - p1.y) * ldy;
    return da - db;
  });

  return hits;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/lineIntersect.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/utils/geometry/
git commit -m "feat(geometry): add line-segment intersection utilities with tests"
```

---

### Task 3: Curve-preserving outline split (TDD)

**Files:**
- Create: `src/utils/geometry/splitOutline.ts`
- Create: `src/utils/geometry/__tests__/splitOutline.test.ts`

**Step 1: Write failing tests**

Create `src/utils/geometry/__tests__/splitOutline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import {
  findOutlineIntersections,
  splitOutlineAtPoints,
} from '../splitOutline';

// Simple 10x10 square: M(0,0) L(10,0) L(10,10) L(0,10) Z
const SQUARE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

describe('findOutlineIntersections', () => {
  it('finds two intersection points for a horizontal cut through a square', () => {
    const hits = findOutlineIntersections(SQUARE, { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(hits).toHaveLength(2);
  });

  it('returns intersection commandIndex and t for each hit', () => {
    const hits = findOutlineIntersections(SQUARE, { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(hits.length).toBe(2);
    // Each hit should have commandIndex, t, and point
    for (const hit of hits) {
      expect(hit).toHaveProperty('commandIndex');
      expect(hit).toHaveProperty('t');
      expect(hit).toHaveProperty('point');
      expect(hit.t).toBeGreaterThanOrEqual(0);
      expect(hit.t).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty array if line misses the outline', () => {
    const hits = findOutlineIntersections(SQUARE, { x: -5, y: 15 }, { x: 15, y: 15 });
    expect(hits).toHaveLength(0);
  });
});

describe('splitOutlineAtPoints', () => {
  it('splits a square horizontally into two rectangles', () => {
    const hits = findOutlineIntersections(SQUARE, { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(SQUARE, hits[0], hits[1]);

    // Each half should be a valid closed outline
    expect(outlineA[0].type).toBe('M');
    expect(outlineA[outlineA.length - 1].type).toBe('Z');
    expect(outlineB[0].type).toBe('M');
    expect(outlineB[outlineB.length - 1].type).toBe('Z');
  });

  it('preserves original L commands on non-cut edges', () => {
    const hits = findOutlineIntersections(SQUARE, { x: -5, y: 5 }, { x: 15, y: 5 });
    const [outlineA, outlineB] = splitOutlineAtPoints(SQUARE, hits[0], hits[1]);

    // Both halves should have L commands (not just M/Z)
    const aLCount = outlineA.filter(c => c.type === 'L').length;
    const bLCount = outlineB.filter(c => c.type === 'L').length;
    expect(aLCount).toBeGreaterThanOrEqual(3); // top rect: 4 edges → 3 L + M + Z
    expect(bLCount).toBeGreaterThanOrEqual(3); // bottom rect: 4 edges → 3 L + M + Z
  });

  it('preserves curves on non-cut edges', () => {
    // Square with one curved edge: top edge is a cubic bezier
    const curvedSquare: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [3, -3, 7, -3, 10, 0] }, // curved top edge
      { type: 'L', values: [10, 10] },
      { type: 'L', values: [0, 10] },
      { type: 'Z', values: [] },
    ];
    // Horizontal cut at y=5 — should not affect the curved top edge
    const hits = findOutlineIntersections(curvedSquare, { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(hits).toHaveLength(2);

    const [outlineA] = splitOutlineAtPoints(curvedSquare, hits[0], hits[1]);

    // The top half should still have a C command (the curved top edge)
    const hasCurve = outlineA.some(c => c.type === 'C');
    expect(hasCurve).toBe(true);
  });

  it('splits a curve command when the cut line passes through it', () => {
    // Rectangle with curved right edge
    const curvedRect: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'C', values: [13, 3, 13, 7, 10, 10] }, // curved right edge
      { type: 'L', values: [0, 10] },
      { type: 'Z', values: [] },
    ];
    // Horizontal cut at y=5 — passes through the curved right edge
    const hits = findOutlineIntersections(curvedRect, { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(curvedRect, hits[0], hits[1]);

    // Both halves should be valid closed outlines
    expect(outlineA[0].type).toBe('M');
    expect(outlineA[outlineA.length - 1].type).toBe('Z');
    expect(outlineB[0].type).toBe('M');
    expect(outlineB[outlineB.length - 1].type).toBe('Z');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/splitOutline.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement**

Create `src/utils/geometry/splitOutline.ts`:

```typescript
import type { PathCommand, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';
import { linePolylineIntersections } from './lineIntersect';

export interface OutlineHit {
  /** Index of the PathCommand that was hit */
  commandIndex: number;
  /** Parameter t along that command's segment (0 = start anchor, 1 = end anchor) */
  t: number;
  /** The intersection point */
  point: Point2D;
}

/**
 * Map a flattened-polyline segment index back to the original PathCommand index.
 *
 * flattenPath produces N points per curve segment. This function maps
 * a polyline segment index back to the source PathCommand and computes
 * the parametric t within that command.
 */
function mapPolylineToCommand(
  outline: PathCommand[],
  polySegmentIndex: number,
  polyT: number,
  resolution: number,
): { commandIndex: number; t: number } {
  // Build a mapping: for each original command, how many polyline segments does it produce?
  let polyIdx = 0;
  for (let cmdIdx = 0; cmdIdx < outline.length; cmdIdx++) {
    const cmd = outline[cmdIdx];
    let segCount: number;
    switch (cmd.type) {
      case 'M':
        segCount = 0;
        break;
      case 'L':
      case 'H':
      case 'V':
        segCount = 1;
        break;
      case 'C':
      case 'Q':
        segCount = resolution;
        break;
      case 'Z': {
        // Closing segment: only if last anchor != first anchor
        segCount = 1;
        break;
      }
      default:
        segCount = 1;
        break;
    }

    if (polySegmentIndex < polyIdx + segCount) {
      // This command owns the hit
      const localIdx = polySegmentIndex - polyIdx;
      const localT = (localIdx + polyT) / segCount;
      return { commandIndex: cmdIdx, t: Math.max(0, Math.min(1, localT)) };
    }
    polyIdx += segCount;
  }

  // Fallback: last command
  return { commandIndex: outline.length - 1, t: polyT };
}

/**
 * Find where an infinite line (through p1, p2) intersects the piece outline.
 * Returns intersection points with their commandIndex and t within that command.
 *
 * Uses flattenPath to approximate curves as polylines, then maps intersections
 * back to the original PathCommand indices.
 */
export function findOutlineIntersections(
  outline: PathCommand[],
  p1: Point2D,
  p2: Point2D,
  resolution = 12,
): OutlineHit[] {
  const flatPoints = flattenPath(outline, resolution);
  const polyHits = linePolylineIntersections(p1, p2, flatPoints);

  return polyHits.map(h => {
    const { commandIndex, t } = mapPolylineToCommand(outline, h.segmentIndex, h.t, resolution);
    return { commandIndex, t, point: h.point };
  });
}

/**
 * Get the anchor (endpoint) of a PathCommand.
 */
function getAnchor(cmd: PathCommand): Point2D | null {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'C':
      return { x: cmd.values[4], y: cmd.values[5] };
    case 'Q':
      return { x: cmd.values[2], y: cmd.values[3] };
    default:
      return null;
  }
}

/**
 * Split a cubic bezier at parameter t using de Casteljau subdivision.
 * Returns [firstHalf, secondHalf] as C commands.
 */
function splitCubicAt(
  startX: number, startY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  endX: number, endY: number,
  t: number,
): [PathCommand, PathCommand] {
  const mt = 1 - t;

  // Level 1
  const ax = mt * startX + t * cp1x;
  const ay = mt * startY + t * cp1y;
  const bx = mt * cp1x + t * cp2x;
  const by = mt * cp1y + t * cp2y;
  const cx = mt * cp2x + t * endX;
  const cy = mt * cp2y + t * endY;

  // Level 2
  const dx = mt * ax + t * bx;
  const dy = mt * ay + t * by;
  const ex = mt * bx + t * cx;
  const ey = mt * by + t * cy;

  // Level 3 (split point)
  const fx = mt * dx + t * ex;
  const fy = mt * dy + t * ey;

  return [
    { type: 'C', values: [ax, ay, dx, dy, fx, fy] },
    { type: 'C', values: [ex, ey, cx, cy, endX, endY] },
  ];
}

/**
 * Split a quadratic bezier at parameter t using de Casteljau subdivision.
 * Returns [firstHalf, secondHalf] as Q commands.
 */
function splitQuadraticAt(
  startX: number, startY: number,
  cpx: number, cpy: number,
  endX: number, endY: number,
  t: number,
): [PathCommand, PathCommand] {
  const mt = 1 - t;

  const ax = mt * startX + t * cpx;
  const ay = mt * startY + t * cpy;
  const bx = mt * cpx + t * endX;
  const by = mt * cpy + t * endY;

  const cx = mt * ax + t * bx;
  const cy = mt * ay + t * by;

  return [
    { type: 'Q', values: [ax, ay, cx, cy] },
    { type: 'Q', values: [bx, by, endX, endY] },
  ];
}

/**
 * Split a PathCommand at parameter t, returning [before, after].
 * prevAnchor is the anchor of the previous command (needed for curve splitting).
 */
function splitCommandAt(
  cmd: PathCommand,
  prevAnchor: Point2D,
  t: number,
  splitPoint: Point2D,
): [PathCommand[], PathCommand[]] {
  if (t <= 0.001) {
    // Split at very start — before is empty, after is the full command
    return [[], [cmd]];
  }
  if (t >= 0.999) {
    // Split at very end — before is the full command, after is empty
    return [[cmd], []];
  }

  switch (cmd.type) {
    case 'L':
    case 'H':
    case 'V': {
      const anchor = getAnchor(cmd) ?? splitPoint;
      return [
        [{ type: 'L', values: [splitPoint.x, splitPoint.y] }],
        [{ type: 'L', values: [anchor.x, anchor.y] }],
      ];
    }
    case 'C': {
      const [first, second] = splitCubicAt(
        prevAnchor.x, prevAnchor.y,
        cmd.values[0], cmd.values[1],
        cmd.values[2], cmd.values[3],
        cmd.values[4], cmd.values[5],
        t,
      );
      return [[first], [second]];
    }
    case 'Q': {
      const [first, second] = splitQuadraticAt(
        prevAnchor.x, prevAnchor.y,
        cmd.values[0], cmd.values[1],
        cmd.values[2], cmd.values[3],
        t,
      );
      return [[first], [second]];
    }
    default:
      return [[cmd], []];
  }
}

/**
 * Get the anchor of the previous command (needed for curve splitting).
 */
function getPrevAnchor(outline: PathCommand[], cmdIndex: number): Point2D {
  for (let i = cmdIndex - 1; i >= 0; i--) {
    const a = getAnchor(outline[i]);
    if (a) return a;
  }
  return { x: 0, y: 0 };
}

/**
 * Split an outline at two intersection points, producing two closed outlines.
 *
 * hit1 and hit2 should be ordered by their position along the outline
 * (hit1.commandIndex < hit2.commandIndex, or same commandIndex with hit1.t < hit2.t).
 *
 * Returns [outlineA, outlineB] where:
 * - outlineA: from hit1 → forward along outline → hit2 → straight line back to hit1
 * - outlineB: from hit2 → forward along outline → hit1 → straight line back to hit2
 */
export function splitOutlineAtPoints(
  outline: PathCommand[],
  hit1: OutlineHit,
  hit2: OutlineHit,
): [PathCommand[], PathCommand[]] {
  // Ensure hit1 comes before hit2 in outline order
  let first = hit1;
  let second = hit2;
  if (
    first.commandIndex > second.commandIndex ||
    (first.commandIndex === second.commandIndex && first.t > second.t)
  ) {
    [first, second] = [second, first];
  }

  // Get the commands between M and Z (the actual edge commands)
  const edgeCmds: PathCommand[] = [];
  const mCmd = outline[0]; // M command
  const startPt: Point2D = { x: mCmd.values[0], y: mCmd.values[1] };

  for (let i = 1; i < outline.length; i++) {
    if (outline[i].type !== 'Z') {
      edgeCmds.push(outline[i]);
    }
  }

  // Split the command at `first` hit
  const firstCmdIdx = first.commandIndex - 1; // offset by 1 because edgeCmds skips M
  const secondCmdIdx = second.commandIndex - 1;

  // Build outline A: from first → forward → second → cut line back
  const outlineA: PathCommand[] = [];
  outlineA.push({ type: 'M', values: [first.point.x, first.point.y] });

  if (firstCmdIdx === secondCmdIdx) {
    // Both hits on the same command — split it into three parts
    const cmd = edgeCmds[firstCmdIdx];
    const prev = firstCmdIdx > 0 ? getPrevAnchor(outline, first.commandIndex) : startPt;

    // Split at first t, then split the remainder at adjusted second t
    const [, afterFirst] = splitCommandAt(cmd, prev, first.t, first.point);
    if (afterFirst.length > 0) {
      const adjustedT = (second.t - first.t) / (1 - first.t);
      const midAnchor = first.point;
      const [between] = splitCommandAt(afterFirst[0], midAnchor, adjustedT, second.point);
      outlineA.push(...between);
    }
  } else {
    // After the first split point within the first command
    const firstCmd = edgeCmds[firstCmdIdx];
    const firstPrev = firstCmdIdx > 0 ? getPrevAnchor(outline, first.commandIndex) : startPt;
    const [, afterFirst] = splitCommandAt(firstCmd, firstPrev, first.t, first.point);
    outlineA.push(...afterFirst);

    // Full commands between first and second
    for (let i = firstCmdIdx + 1; i < secondCmdIdx; i++) {
      outlineA.push(edgeCmds[i]);
    }

    // Before the second split point within the second command
    const secondCmd = edgeCmds[secondCmdIdx];
    const secondPrev = getPrevAnchor(outline, second.commandIndex);
    const [beforeSecond] = splitCommandAt(secondCmd, secondPrev, second.t, second.point);
    outlineA.push(...beforeSecond);
  }

  // Close A with cut line
  outlineA.push({ type: 'L', values: [first.point.x, first.point.y] });
  outlineA.push({ type: 'Z', values: [] });

  // Build outline B: from second → forward (wrapping around) → first → cut line back
  const outlineB: PathCommand[] = [];
  outlineB.push({ type: 'M', values: [second.point.x, second.point.y] });

  if (firstCmdIdx === secondCmdIdx) {
    const cmd = edgeCmds[secondCmdIdx];
    const prev = secondCmdIdx > 0 ? getPrevAnchor(outline, second.commandIndex) : startPt;
    const [, afterSecond] = splitCommandAt(cmd, prev, second.t, second.point);
    outlineB.push(...afterSecond);

    // All commands after the split command, then wrap to commands before
    for (let i = secondCmdIdx + 1; i < edgeCmds.length; i++) {
      outlineB.push(edgeCmds[i]);
    }
    // Closing segment (Z was removed, so add L back to M's start if needed)
    const lastAnchor = getAnchor(edgeCmds[edgeCmds.length - 1]);
    if (lastAnchor && (Math.abs(lastAnchor.x - startPt.x) > 0.001 || Math.abs(lastAnchor.y - startPt.y) > 0.001)) {
      outlineB.push({ type: 'L', values: [startPt.x, startPt.y] });
    }
    for (let i = 0; i < firstCmdIdx; i++) {
      outlineB.push(edgeCmds[i]);
    }

    // Before the first hit in the same command
    const [beforeFirst] = splitCommandAt(cmd, prev, first.t, first.point);
    outlineB.push(...beforeFirst);
  } else {
    // After second split point
    const secondCmd = edgeCmds[secondCmdIdx];
    const secondPrev = getPrevAnchor(outline, second.commandIndex);
    const [, afterSecond] = splitCommandAt(secondCmd, secondPrev, second.t, second.point);
    outlineB.push(...afterSecond);

    // Commands after second, wrapping around
    for (let i = secondCmdIdx + 1; i < edgeCmds.length; i++) {
      outlineB.push(edgeCmds[i]);
    }
    // Closing segment
    const lastAnchor = getAnchor(edgeCmds[edgeCmds.length - 1]);
    if (lastAnchor && (Math.abs(lastAnchor.x - startPt.x) > 0.001 || Math.abs(lastAnchor.y - startPt.y) > 0.001)) {
      outlineB.push({ type: 'L', values: [startPt.x, startPt.y] });
    }
    for (let i = 0; i < firstCmdIdx; i++) {
      outlineB.push(edgeCmds[i]);
    }
    // Before first split point
    const firstCmd = edgeCmds[firstCmdIdx];
    const firstPrev = firstCmdIdx > 0 ? getPrevAnchor(outline, first.commandIndex) : startPt;
    const [beforeFirst] = splitCommandAt(firstCmd, firstPrev, first.t, first.point);
    outlineB.push(...beforeFirst);
  }

  // Close B with cut line
  outlineB.push({ type: 'L', values: [second.point.x, second.point.y] });
  outlineB.push({ type: 'Z', values: [] });

  return [outlineA, outlineB];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/splitOutline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/splitOutline.ts src/utils/geometry/__tests__/splitOutline.test.ts
git commit -m "feat(geometry): add curve-preserving outline split with tests"
```

---

### Task 4: Merge outline utilities (TDD)

**Files:**
- Create: `src/utils/geometry/mergeOutline.ts`
- Create: `src/utils/geometry/__tests__/mergeOutline.test.ts`

**Step 1: Write failing tests**

Create `src/utils/geometry/__tests__/mergeOutline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { findSharedEdge, mergeOutlines } from '../mergeOutline';

// Two adjacent 10x5 rectangles (stacked vertically)
const RECT_TOP: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [10, 5] },
  { type: 'L', values: [0, 5] },
  { type: 'Z', values: [] },
];

const RECT_BOTTOM: PathCommand[] = [
  { type: 'M', values: [0, 5] },
  { type: 'L', values: [10, 5] },
  { type: 'L', values: [10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

describe('findSharedEdge', () => {
  it('detects shared edge between adjacent rectangles', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).not.toBeNull();
  });

  it('returns null for non-adjacent pieces', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 100, y: 100 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).toBeNull();
  });

  it('returns edge indices for both pieces', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('edgeA');
    expect(result).toHaveProperty('edgeB');
  });
});

describe('mergeOutlines', () => {
  it('merges two adjacent rectangles into one larger rectangle', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(RECT_TOP, posA, RECT_BOTTOM, posB, shared!);

    // Merged should be a valid closed outline
    expect(merged[0].type).toBe('M');
    expect(merged[merged.length - 1].type).toBe('Z');
  });

  it('preserves curves on non-shared edges', () => {
    const curvedTop: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [3, -3, 7, -3, 10, 0] }, // curved top edge
      { type: 'L', values: [10, 5] },
      { type: 'L', values: [0, 5] },
      { type: 'Z', values: [] },
    ];
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(curvedTop, posA, RECT_BOTTOM, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(curvedTop, posA, RECT_BOTTOM, posB, shared!);

    // Should preserve the C command from the top piece
    const hasCurve = merged.some(c => c.type === 'C');
    expect(hasCurve).toBe(true);
  });

  it('merged outline has fewer commands than both originals combined', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    const merged = mergeOutlines(RECT_TOP, posA, RECT_BOTTOM, posB, shared!);

    const origTotal = RECT_TOP.length + RECT_BOTTOM.length;
    expect(merged.length).toBeLessThan(origTotal);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/mergeOutline.test.ts`
Expected: FAIL

**Step 3: Implement**

Create `src/utils/geometry/mergeOutline.ts`:

```typescript
import type { PathCommand, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';

export interface SharedEdge {
  /** Command indices in outline A that form the shared edge */
  edgeA: { startCmd: number; endCmd: number };
  /** Command indices in outline B that form the shared edge (reversed direction) */
  edgeB: { startCmd: number; endCmd: number };
}

/**
 * Get anchor points from an outline with their command indices.
 */
function getAnchors(outline: PathCommand[], position: Point2D): Array<{ cmd: number; pt: Point2D }> {
  const anchors: Array<{ cmd: number; pt: Point2D }> = [];
  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    let pt: Point2D | null = null;
    switch (cmd.type) {
      case 'M':
      case 'L':
        pt = { x: cmd.values[0] + position.x, y: cmd.values[1] + position.y };
        break;
      case 'C':
        pt = { x: cmd.values[4] + position.x, y: cmd.values[5] + position.y };
        break;
      case 'Q':
        pt = { x: cmd.values[2] + position.x, y: cmd.values[3] + position.y };
        break;
    }
    if (pt) anchors.push({ cmd: i, pt });
  }
  return anchors;
}

/**
 * Find a shared edge between two outlines.
 * Looks for consecutive anchor points in outline A that match (within tolerance)
 * consecutive anchor points in outline B (in reverse direction, since adjacent
 * pieces share edges in opposite winding order).
 *
 * Returns the command index ranges for the shared edge in each outline,
 * or null if no shared edge is found.
 */
export function findSharedEdge(
  outlineA: PathCommand[],
  posA: Point2D,
  outlineB: PathCommand[],
  posB: Point2D,
  tolerance: number = 2,
): SharedEdge | null {
  const anchorsA = getAnchors(outlineA, posA);
  const anchorsB = getAnchors(outlineB, posB);

  if (anchorsA.length < 2 || anchorsB.length < 2) return null;

  // Try to find matching consecutive anchor pairs
  // A's edge goes forward, B's edge goes in reverse (opposite winding)
  for (let ia = 0; ia < anchorsA.length; ia++) {
    for (let ib = 0; ib < anchorsB.length; ib++) {
      const distStart = Math.hypot(
        anchorsA[ia].pt.x - anchorsB[ib].pt.x,
        anchorsA[ia].pt.y - anchorsB[ib].pt.y,
      );
      if (distStart > tolerance) continue;

      // Check if next anchor in A matches previous anchor in B
      const nextA = (ia + 1) % anchorsA.length;
      const prevB = (ib - 1 + anchorsB.length) % anchorsB.length;
      const distEnd = Math.hypot(
        anchorsA[nextA].pt.x - anchorsB[prevB].pt.x,
        anchorsA[nextA].pt.y - anchorsB[prevB].pt.y,
      );
      if (distEnd > tolerance) continue;

      // Found a shared edge
      return {
        edgeA: { startCmd: anchorsA[ia].cmd, endCmd: anchorsA[nextA].cmd },
        edgeB: { startCmd: anchorsB[prevB].cmd, endCmd: anchorsB[ib].cmd },
      };
    }
  }

  // Also try same-direction matching (some pieces may have same winding)
  for (let ia = 0; ia < anchorsA.length; ia++) {
    for (let ib = 0; ib < anchorsB.length; ib++) {
      const distStart = Math.hypot(
        anchorsA[ia].pt.x - anchorsB[ib].pt.x,
        anchorsA[ia].pt.y - anchorsB[ib].pt.y,
      );
      if (distStart > tolerance) continue;

      const nextA = (ia + 1) % anchorsA.length;
      const nextB = (ib + 1) % anchorsB.length;
      const distEnd = Math.hypot(
        anchorsA[nextA].pt.x - anchorsB[nextB].pt.x,
        anchorsA[nextA].pt.y - anchorsB[nextB].pt.y,
      );
      if (distEnd > tolerance) continue;

      return {
        edgeA: { startCmd: anchorsA[ia].cmd, endCmd: anchorsA[nextA].cmd },
        edgeB: { startCmd: anchorsB[ib].cmd, endCmd: anchorsB[nextB].cmd },
      };
    }
  }

  return null;
}

/**
 * Offset all coordinate values in a PathCommand by a delta.
 */
function offsetCommand(cmd: PathCommand, dx: number, dy: number): PathCommand {
  if (cmd.type === 'Z') return cmd;
  const values = [...cmd.values];
  for (let i = 0; i < values.length; i += 2) {
    values[i] += dx;
    if (i + 1 < values.length) values[i + 1] += dy;
  }
  return { type: cmd.type, values };
}

/**
 * Merge two outlines along their shared edge, producing a single closed outline.
 *
 * The shared edge is removed from both outlines. Outline A's non-shared edges
 * are walked forward, then outline B's non-shared edges are appended.
 *
 * Both outlines' commands are offset by their respective positions so the
 * merged result is in absolute coordinates (position = 0,0).
 */
export function mergeOutlines(
  outlineA: PathCommand[],
  posA: Point2D,
  outlineB: PathCommand[],
  posB: Point2D,
  shared: SharedEdge,
): PathCommand[] {
  // Collect edge commands (skip M and Z) with position offset
  const edgesA: PathCommand[] = [];
  for (let i = 1; i < outlineA.length; i++) {
    if (outlineA[i].type !== 'Z') {
      edgesA.push(offsetCommand(outlineA[i], posA.x, posA.y));
    }
  }

  const edgesB: PathCommand[] = [];
  for (let i = 1; i < outlineB.length; i++) {
    if (outlineB[i].type !== 'Z') {
      edgesB.push(offsetCommand(outlineB[i], posB.x, posB.y));
    }
  }

  // Identify which edge commands to skip (the shared edge)
  // In edgesA, the shared edge is the command at shared.edgeA.endCmd - 1 (0-indexed from edges, not outline)
  const skipA = shared.edgeA.endCmd - 1; // edge index = command index - 1 (since M is at 0)
  const skipB = shared.edgeB.endCmd - 1;

  // Build merged: walk A (skipping shared), then walk B (skipping shared)
  const result: PathCommand[] = [];

  // Find the start point (the anchor just after the shared edge in A)
  let startIdx = (skipA + 1) % edgesA.length;

  // Get start anchor from the edge command
  const startCmd = edgesA[startIdx];
  let startPt: Point2D;
  switch (startCmd.type) {
    case 'C':
      startPt = { x: startCmd.values[4], y: startCmd.values[5] };
      break;
    case 'Q':
      startPt = { x: startCmd.values[2], y: startCmd.values[3] };
      break;
    default:
      startPt = { x: startCmd.values[0], y: startCmd.values[1] };
  }

  // Actually, we need to start M at the anchor BEFORE the first edge we include
  // Let's use a simpler approach: walk edges in order, skip the shared one

  // Walk A edges, skipping the shared edge command
  const aEdgesOrdered: PathCommand[] = [];
  for (let i = 0; i < edgesA.length; i++) {
    if (i !== skipA) {
      aEdgesOrdered.push(edgesA[i]);
    }
  }

  // Walk B edges, skipping the shared edge command
  const bEdgesOrdered: PathCommand[] = [];
  for (let i = 0; i < edgesB.length; i++) {
    if (i !== skipB) {
      bEdgesOrdered.push(edgesB[i]);
    }
  }

  // Start with M at A's first anchor
  const mA = outlineA[0];
  result.push({ type: 'M', values: [mA.values[0] + posA.x, mA.values[1] + posA.y] });

  // Add A's non-shared edges
  result.push(...aEdgesOrdered);

  // Add B's non-shared edges
  result.push(...bEdgesOrdered);

  // Close
  result.push({ type: 'Z', values: [] });

  return result;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/geometry/__tests__/mergeOutline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/mergeOutline.ts src/utils/geometry/__tests__/mergeOutline.test.ts
git commit -m "feat(geometry): add curve-preserving outline merge with tests"
```

---

### Task 5: Rewrite `splitPiece()` and add `mergePieces()`

**Files:**
- Modify: `src/utils/patternOps.ts`

**Step 1: Rewrite splitPiece**

Replace the existing `splitPiece` function in `src/utils/patternOps.ts` with:

```typescript
import { findOutlineIntersections, splitOutlineAtPoints } from './geometry/splitOutline';

/**
 * Split a piece along a line from startPoint to endPoint.
 * Returns two new pieces with curve-preserving outlines.
 *
 * The cut line intersects the piece outline at two points.
 * Each resulting piece keeps original curves on non-cut edges.
 * The cut edge itself is straight (L commands).
 */
export function splitPiece(
  piece: PatternPiece,
  startPoint: Point2D,
  endPoint: Point2D,
): [PatternPiece, PatternPiece] {
  // Convert points to piece-local coordinates
  const localStart = { x: startPoint.x - piece.position.x, y: startPoint.y - piece.position.y };
  const localEnd = { x: endPoint.x - piece.position.x, y: endPoint.y - piece.position.y };

  const hits = findOutlineIntersections(piece.outline, localStart, localEnd);
  if (hits.length < 2) {
    throw new Error('Cut line must intersect the outline at exactly 2 points');
  }

  const [outlineA, outlineB] = splitOutlineAtPoints(piece.outline, hits[0], hits[1]);

  const now = Date.now();
  const pieceA: PatternPiece = {
    ...piece,
    id: uid('piece'),
    name: `${piece.name} (A)`,
    outline: outlineA,
    internals: [],
    edges: undefined,
    darts: undefined,
    updatedAt: now,
  };

  const pieceB: PatternPiece = {
    ...piece,
    id: uid('piece'),
    name: `${piece.name} (B)`,
    outline: outlineB,
    internals: [],
    position: { x: piece.position.x + 15, y: piece.position.y }, // offset for visibility
    edges: undefined,
    darts: undefined,
    updatedAt: now,
  };

  return [pieceA, pieceB];
}
```

Keep the old axis-aligned version as `splitPieceAxis` for backward compatibility if other code references it, or remove it if nothing else uses it (check with grep first).

**Step 2: Add mergePieces**

Add to `src/utils/patternOps.ts`:

```typescript
import { findSharedEdge, mergeOutlines } from './geometry/mergeOutline';

/**
 * Merge two adjacent pieces into one piece.
 * The pieces must share an adjacent edge (within tolerance).
 *
 * Returns the merged piece, or throws if no shared edge is found.
 */
export function mergePieces(
  pieceA: PatternPiece,
  pieceB: PatternPiece,
  tolerance: number = 2,
): PatternPiece {
  const shared = findSharedEdge(
    pieceA.outline, pieceA.position,
    pieceB.outline, pieceB.position,
    tolerance,
  );

  if (!shared) {
    throw new Error('No shared edge found between pieces');
  }

  const mergedOutline = mergeOutlines(
    pieceA.outline, pieceA.position,
    pieceB.outline, pieceB.position,
    shared,
  );

  return {
    ...pieceA,
    id: uid('piece'),
    name: `${pieceA.name} + ${pieceB.name}`,
    outline: mergedOutline,
    position: { x: 0, y: 0 }, // merged outline is in absolute coords
    internals: [...pieceA.internals, ...pieceB.internals],
    edges: undefined, // need recalculation
    darts: [...(pieceA.darts ?? []), ...(pieceB.darts ?? [])],
    updatedAt: Date.now(),
  };
}
```

**Step 3: Run type check and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/patternOps.ts
git commit -m "feat(patternOps): rewrite splitPiece for arbitrary cuts, add mergePieces"
```

---

### Task 6: Scissors tool hook (`useScissorsTool`)

**Files:**
- Create: `src/components/PatternEditor/useScissorsTool.ts`

**Step 1: Implement the hook**

Create `src/components/PatternEditor/useScissorsTool.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import { flattenPath } from '../../utils/seam/index';
import { linePolylineIntersections } from '../../utils/geometry/lineIntersect';
import { splitPiece } from '../../utils/patternOps';

export interface ScissorsState {
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  hoveredEdgePoint: Point2D | null;
  previewValid: boolean;
}

const INITIAL_STATE: ScissorsState = {
  targetPieceId: null,
  startPoint: null,
  endPoint: null,
  hoveredEdgePoint: null,
  previewValid: false,
};

const SNAP_THRESHOLD = 8; // screen pixels

export function useScissorsTool(zoom2D: number, pan2D: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  const [state, setState] = useState<ScissorsState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan2D.x) / zoom2D,
        y: (e.clientY - rect.top - pan2D.y) / zoom2D,
      };
    },
    [zoom2D, pan2D],
  );

  /** Find nearest point on piece outline to a pattern-space point */
  const snapToOutline = useCallback(
    (pt: Point2D, piece: PatternPiece): Point2D | null => {
      const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
      const flatPoints = flattenPath(piece.outline);
      let bestDist = Infinity;
      let bestPt: Point2D | null = null;

      for (let i = 0; i < flatPoints.length - 1; i++) {
        const a = flatPoints[i];
        const b = flatPoints[i + 1];
        // Project localPt onto segment a-b
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        if (len2 === 0) continue;
        let t = ((localPt.x - a.x) * abx + (localPt.y - a.y) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * abx, y: a.y + t * aby };
        const dist = Math.hypot(localPt.x - proj.x, localPt.y - proj.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestPt = { x: proj.x + piece.position.x, y: proj.y + piece.position.y };
        }
      }

      const threshold = SNAP_THRESHOLD / zoom2D;
      return bestDist <= threshold ? bestPt : null;
    },
    [zoom2D],
  );

  /** Check if the cut line produces exactly 2 intersections */
  const validateCut = useCallback(
    (piece: PatternPiece, start: Point2D, end: Point2D): boolean => {
      const localStart = { x: start.x - piece.position.x, y: start.y - piece.position.y };
      const localEnd = { x: end.x - piece.position.x, y: end.y - piece.position.y };
      const flatPoints = flattenPath(piece.outline);
      const hits = linePolylineIntersections(localStart, localEnd, flatPoints);
      return hits.length >= 2;
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const s = stateRef.current;

      if (!s.targetPieceId) {
        // First: target a piece (use selected piece or click on one)
        const targetId = selectedPieceIds[0] ?? null;
        if (targetId) {
          const piece = pieces.find(p => p.id === targetId);
          if (piece) {
            const snap = snapToOutline(pt, piece);
            if (snap) {
              setState({
                targetPieceId: targetId,
                startPoint: snap,
                endPoint: null,
                hoveredEdgePoint: null,
                previewValid: false,
              });
            } else {
              setState({ ...INITIAL_STATE, targetPieceId: targetId });
            }
          }
        }
        return;
      }

      const piece = pieces.find(p => p.id === s.targetPieceId);
      if (!piece) return;

      if (!s.startPoint) {
        // Set start point
        const snap = snapToOutline(pt, piece);
        if (snap) {
          setState(prev => ({ ...prev, startPoint: snap }));
        }
        return;
      }

      // Set end point and execute split
      const snap = snapToOutline(pt, piece);
      if (!snap) return;

      if (!validateCut(piece, s.startPoint, snap)) return;

      try {
        const [pieceA, pieceB] = splitPiece(piece, s.startPoint, snap);
        dispatch(removePiece(piece.id));
        dispatch(addPiece(pieceA));
        dispatch(addPiece(pieceB));
        reset();
      } catch {
        // Invalid cut — ignore
      }
    },
    [toPattern, pieces, selectedPieceIds, snapToOutline, validateCut, dispatch, reset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const s = stateRef.current;
      if (!s.targetPieceId) return;

      const piece = pieces.find(p => p.id === s.targetPieceId);
      if (!piece) return;

      const pt = toPattern(e);
      const snap = snapToOutline(pt, piece);

      if (s.startPoint && snap) {
        const valid = validateCut(piece, s.startPoint, snap);
        setState(prev => ({ ...prev, hoveredEdgePoint: snap, endPoint: snap, previewValid: valid }));
      } else {
        setState(prev => ({ ...prev, hoveredEdgePoint: snap, endPoint: null, previewValid: false }));
      }
    },
    [toPattern, pieces, snapToOutline, validateCut],
  );

  const handleMouseUp = useCallback(() => {
    // No-op — scissors uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
      }
    },
    [reset],
  );

  const getCursor = useCallback((): string => {
    const s = stateRef.current;
    if (s.hoveredEdgePoint) return 'crosshair';
    if (s.targetPieceId) return 'crosshair';
    return 'default';
  }, []);

  return {
    ...state,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useScissorsTool.ts
git commit -m "feat(editor): add useScissorsTool hook for interactive piece splitting"
```

---

### Task 7: Merge tool hook (`useMergeTool`)

**Files:**
- Create: `src/components/PatternEditor/useMergeTool.ts`

**Step 1: Implement the hook**

Create `src/components/PatternEditor/useMergeTool.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece, removeSeam } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import { mergePieces } from '../../utils/patternOps';
import { findSharedEdge } from '../../utils/geometry/mergeOutline';

export interface MergeState {
  pieceIdA: string | null;
  pieceIdB: string | null;
  sharedEdgeFound: boolean;
  error: string | null;
}

const INITIAL_STATE: MergeState = {
  pieceIdA: null,
  pieceIdB: null,
  sharedEdgeFound: false,
  error: null,
};

export function useMergeTool(zoom2D: number, pan2D: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);

  const [state, setState] = useState<MergeState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan2D.x) / zoom2D,
        y: (e.clientY - rect.top - pan2D.y) / zoom2D,
      };
    },
    [zoom2D, pan2D],
  );

  /** Hit-test: find which piece contains the point */
  const hitTestPiece = useCallback(
    (pt: Point2D): PatternPiece | null => {
      // Simple bounding box hit test
      for (const piece of pieces) {
        const ox = piece.position.x;
        const oy = piece.position.y;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length; i += 2) {
            const x = cmd.values[i] + ox;
            const y = (i + 1 < cmd.values.length) ? cmd.values[i + 1] + oy : 0;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
          return piece;
        }
      }
      return null;
    },
    [pieces],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const s = stateRef.current;
      const clickedPiece = hitTestPiece(pt);

      if (!clickedPiece) {
        reset();
        return;
      }

      if (!s.pieceIdA) {
        // Select first piece
        setState({
          pieceIdA: clickedPiece.id,
          pieceIdB: null,
          sharedEdgeFound: false,
          error: null,
        });
        return;
      }

      if (clickedPiece.id === s.pieceIdA) return; // clicked same piece

      // Select second piece and try to merge
      const pieceA = pieces.find(p => p.id === s.pieceIdA);
      if (!pieceA) { reset(); return; }

      const shared = findSharedEdge(
        pieceA.outline, pieceA.position,
        clickedPiece.outline, clickedPiece.position,
        2,
      );

      if (!shared) {
        setState(prev => ({
          ...prev,
          pieceIdB: clickedPiece.id,
          sharedEdgeFound: false,
          error: 'No adjacent edge found between these pieces',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        pieceIdB: clickedPiece.id,
        sharedEdgeFound: true,
        error: null,
      }));

      // Execute merge
      try {
        const merged = mergePieces(pieceA, clickedPiece, 2);
        dispatch(removePiece(pieceA.id));
        dispatch(removePiece(clickedPiece.id));
        dispatch(addPiece(merged));

        // Remove seams between the two pieces
        for (const seam of seams) {
          if (
            (seam.pieceId1 === pieceA.id && seam.pieceId2 === clickedPiece.id) ||
            (seam.pieceId1 === clickedPiece.id && seam.pieceId2 === pieceA.id)
          ) {
            dispatch(removeSeam(seam.id));
          }
        }

        reset();
      } catch {
        setState(prev => ({ ...prev, error: 'Failed to merge pieces' }));
      }
    },
    [toPattern, hitTestPiece, pieces, seams, dispatch, reset],
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // Could add hover highlighting in the future
    },
    [],
  );

  const handleMouseUp = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') reset();
    },
    [reset],
  );

  const getCursor = useCallback((): string => {
    return 'default';
  }, []);

  return {
    ...state,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useMergeTool.ts
git commit -m "feat(editor): add useMergeTool hook for interactive piece merging"
```

---

### Task 8: Scissors and Merge overlays

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/ScissorsOverlay.tsx`
- Create: `src/components/PatternEditor/renderers/overlays/MergeOverlay.tsx`

**Step 1: Create ScissorsOverlay**

Create `src/components/PatternEditor/renderers/overlays/ScissorsOverlay.tsx`:

```tsx
import React from 'react';
import type { Point2D, PatternPiece } from '../../../../types/types';

interface ScissorsOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  hoveredEdgePoint: Point2D | null;
  previewValid: boolean;
}

export default function ScissorsOverlay({
  zoom2D,
  pieces,
  targetPieceId,
  startPoint,
  endPoint,
  hoveredEdgePoint,
  previewValid,
}: ScissorsOverlayProps) {
  if (!targetPieceId) return null;

  const piece = pieces.find(p => p.id === targetPieceId);
  if (!piece) return null;

  const r = 6 / zoom2D;
  const sw = 1.5 / zoom2D;
  const color = previewValid ? '#FF4444' : '#FF8888';

  return (
    <g>
      {/* Cut line preview */}
      {startPoint && endPoint && (
        <line
          x1={startPoint.x}
          y1={startPoint.y}
          x2={endPoint.x}
          y2={endPoint.y}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          pointerEvents="none"
        />
      )}

      {/* Start point */}
      {startPoint && (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={r}
          fill="#FF4444"
          stroke="#fff"
          strokeWidth={1.2 / zoom2D}
          pointerEvents="none"
        />
      )}

      {/* Hover snap indicator */}
      {hoveredEdgePoint && !startPoint && (
        <circle
          cx={hoveredEdgePoint.x}
          cy={hoveredEdgePoint.y}
          r={4 / zoom2D}
          fill="#FF4444"
          opacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* End point preview */}
      {endPoint && (
        <circle
          cx={endPoint.x}
          cy={endPoint.y}
          r={r}
          fill={previewValid ? '#FF4444' : '#FF8888'}
          stroke="#fff"
          strokeWidth={1.2 / zoom2D}
          opacity={0.7}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
```

**Step 2: Create MergeOverlay**

Create `src/components/PatternEditor/renderers/overlays/MergeOverlay.tsx`:

```tsx
import React from 'react';
import type { PatternPiece } from '../../../../types/types';

interface MergeOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  pieceIdA: string | null;
  pieceIdB: string | null;
  sharedEdgeFound: boolean;
  error: string | null;
}

export default function MergeOverlay({
  zoom2D,
  pieces,
  pieceIdA,
  pieceIdB,
  sharedEdgeFound,
  error,
}: MergeOverlayProps) {
  if (!pieceIdA) return null;

  const sw = 2 / zoom2D;

  // Highlight selected pieces with colored outlines
  const renderHighlight = (pieceId: string, color: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return null;

    // Build SVG path from outline
    const d = piece.outline
      .map(cmd => {
        switch (cmd.type) {
          case 'M': return `M${cmd.values[0]},${cmd.values[1]}`;
          case 'L': return `L${cmd.values[0]},${cmd.values[1]}`;
          case 'C': return `C${cmd.values.join(',')}`;
          case 'Q': return `Q${cmd.values.join(',')}`;
          case 'Z': return 'Z';
          default: return '';
        }
      })
      .join(' ');

    return (
      <g transform={`translate(${piece.position.x}, ${piece.position.y})`}>
        <path
          d={d}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={sw}
          pointerEvents="none"
        />
      </g>
    );
  };

  return (
    <g>
      {renderHighlight(pieceIdA, '#4A9EFF')}
      {pieceIdB && renderHighlight(pieceIdB, sharedEdgeFound ? '#4CAF50' : '#FF4444')}

      {/* Error message */}
      {error && pieceIdB && (
        <text
          x={0}
          y={-10 / zoom2D}
          fill="#FF4444"
          fontSize={12 / zoom2D}
          textAnchor="middle"
          pointerEvents="none"
        >
          {error}
        </text>
      )}
    </g>
  );
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/ScissorsOverlay.tsx src/components/PatternEditor/renderers/overlays/MergeOverlay.tsx
git commit -m "feat(editor): add ScissorsOverlay and MergeOverlay components"
```

---

### Task 9: Wire scissors and merge into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`

**Step 1: Add hooks to PatternEditor.tsx**

Import and instantiate the hooks:

```typescript
import { useScissorsTool } from './useScissorsTool';
import { useMergeTool } from './useMergeTool';

// Inside PatternEditor component, after other hook instantiations:
const scissorsTool = useScissorsTool(zoom2D, pan2D);
const mergeTool = useMergeTool(zoom2D, pan2D);
```

Add to the tools object passed to `useEditorInteractions`:

```typescript
const tools = {
  pen,
  rectTool,
  lineTool,
  seamTool,
  notchTool,
  grainlineTool,
  measureTool,
  nodeEditor,
  transformTool,
  editPattern: editPatternTool,
  scissorsTool,
  mergeTool,
};
```

Pass overlay props to ToolOverlay:

```tsx
<ToolOverlay
  {...existingProps}
  scissorsTargetPieceId={scissorsTool.targetPieceId}
  scissorsStartPoint={scissorsTool.startPoint}
  scissorsEndPoint={scissorsTool.endPoint}
  scissorsHoveredEdgePoint={scissorsTool.hoveredEdgePoint}
  scissorsPreviewValid={scissorsTool.previewValid}
  mergePieceIdA={mergeTool.pieceIdA}
  mergePieceIdB={mergeTool.pieceIdB}
  mergeSharedEdgeFound={mergeTool.sharedEdgeFound}
  mergeError={mergeTool.error}
/>
```

**Step 2: Wire into useEditorInteractions**

Add to `ToolHooks` interface:

```typescript
scissorsTool: {
  handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseUp: () => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  getCursor: () => string;
  reset: () => void;
};
mergeTool: {
  handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseUp: () => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  getCursor: () => string;
  reset: () => void;
};
```

Add dispatching in `handleMouseDown`:

```typescript
if (activeTool === 'scissors') { scissorsTool.handleMouseDown(e); return; }
if (activeTool === 'merge') { mergeTool.handleMouseDown(e); return; }
```

Add in `handleMouseMove`:

```typescript
if (activeTool === 'scissors') scissorsTool.handleMouseMove(e);
if (activeTool === 'merge') mergeTool.handleMouseMove(e);
```

Add in `handleMouseUp`:

```typescript
if (activeTool === 'scissors') scissorsTool.handleMouseUp();
if (activeTool === 'merge') mergeTool.handleMouseUp();
```

Add keyboard handlers in `useEffect`:

```typescript
if (activeTool === 'scissors') scissorsTool.handleKeyDown(e);
if (activeTool === 'merge') mergeTool.handleKeyDown(e);
```

Add cursor case:

```typescript
case 'scissors': return scissorsTool.getCursor();
case 'merge': return mergeTool.getCursor();
```

**Step 3: Add to ToolOverlay**

Add props to `ToolOverlayProps`:

```typescript
// Scissors
scissorsTargetPieceId: string | null;
scissorsStartPoint: Point2D | null;
scissorsEndPoint: Point2D | null;
scissorsHoveredEdgePoint: Point2D | null;
scissorsPreviewValid: boolean;
// Merge
mergePieceIdA: string | null;
mergePieceIdB: string | null;
mergeSharedEdgeFound: boolean;
mergeError: string | null;
```

Add imports and conditional rendering:

```typescript
import ScissorsOverlay from './overlays/ScissorsOverlay';
import MergeOverlay from './overlays/MergeOverlay';

// In the JSX return:
{activeTool === 'scissors' && (
  <ScissorsOverlay
    zoom2D={zoom2D}
    pieces={pieces}
    targetPieceId={props.scissorsTargetPieceId}
    startPoint={props.scissorsStartPoint}
    endPoint={props.scissorsEndPoint}
    hoveredEdgePoint={props.scissorsHoveredEdgePoint}
    previewValid={props.scissorsPreviewValid}
  />
)}

{activeTool === 'merge' && (
  <MergeOverlay
    zoom2D={zoom2D}
    pieces={pieces}
    pieceIdA={props.mergePieceIdA}
    pieceIdB={props.mergePieceIdB}
    sharedEdgeFound={props.mergeSharedEdgeFound}
    error={props.mergeError}
  />
)}
```

**Step 4: Run type check and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/renderers/ToolOverlay.tsx
git commit -m "feat(editor): wire scissors and merge tools into PatternEditor"
```

---

### Task 10: Copilot integration — action types, executor, validator, schemas

**Files:**
- Modify: `src/copilot/actions/actionTypes.ts`
- Modify: `src/copilot/actions/actionExecutor.ts`
- Modify: `src/copilot/actions/actionValidator.ts`
- Modify: `src/copilot/llm/actionSchemas.ts`

**Step 1: Add action types**

In `src/copilot/actions/actionTypes.ts`:

```typescript
// Add interfaces:
export interface SplitPieceAction {
  action: 'split_piece';
  pieceId: string;
  startPoint: [number, number];
  endPoint: [number, number];
}

export interface MergePiecesAction {
  action: 'merge_pieces';
  pieceIdA: string;
  pieceIdB: string;
}

// Add to GeometryAction union:
export type GeometryAction =
  | MovePointAction
  | AddPointAction
  | DeletePointAction
  | AddEaseAction
  | AddDartAction
  | CurveEdgeAction
  | StraightenEdgeAction
  | SplitEdgeAction
  | SplitPieceAction
  | MergePiecesAction;

// Add to ACTION_CATEGORIES.geometry:
geometry: ['move_point', 'add_point', 'delete_point', 'add_ease', 'add_dart', 'curve_edge', 'straighten_edge', 'split_edge', 'split_piece', 'merge_pieces'],

// Add to UNDOABLE_ACTIONS:
'split_piece', 'merge_pieces'

// Add 'split_piece' to DANGEROUS_ACTIONS
```

**Step 2: Add executor handlers**

In `src/copilot/actions/actionExecutor.ts`, add cases:

```typescript
case 'split_piece': {
  const piece = state.project.pieces.find(p => p.id === action.pieceId);
  if (!piece) return { success: false, error: `Piece ${action.pieceId} not found` };
  try {
    const startPt = { x: action.startPoint[0], y: action.startPoint[1] };
    const endPt = { x: action.endPoint[0], y: action.endPoint[1] };
    const [pieceA, pieceB] = splitPiece(piece, startPt, endPt);
    dispatch(removePiece(piece.id));
    dispatch(addPiece(pieceA));
    dispatch(addPiece(pieceB));
    return {
      success: true,
      summary: `Split "${piece.name}" into "${pieceA.name}" and "${pieceB.name}"`,
      data: { pieceAId: pieceA.id, pieceBId: pieceB.id },
    };
  } catch (err) {
    return { success: false, error: `Split failed: ${(err as Error).message}` };
  }
}

case 'merge_pieces': {
  const pieceA = state.project.pieces.find(p => p.id === action.pieceIdA);
  const pieceB = state.project.pieces.find(p => p.id === action.pieceIdB);
  if (!pieceA) return { success: false, error: `Piece ${action.pieceIdA} not found` };
  if (!pieceB) return { success: false, error: `Piece ${action.pieceIdB} not found` };
  try {
    const merged = mergePieces(pieceA, pieceB);
    dispatch(removePiece(pieceA.id));
    dispatch(removePiece(pieceB.id));
    dispatch(addPiece(merged));
    // Remove seams between the two pieces
    const seams = state.project.seams || [];
    for (const seam of seams) {
      if (
        (seam.pieceId1 === pieceA.id && seam.pieceId2 === pieceB.id) ||
        (seam.pieceId1 === pieceB.id && seam.pieceId2 === pieceA.id)
      ) {
        dispatch(removeSeam(seam.id));
      }
    }
    return {
      success: true,
      summary: `Merged "${pieceA.name}" and "${pieceB.name}" into "${merged.name}"`,
      data: { mergedPieceId: merged.id },
    };
  } catch (err) {
    return { success: false, error: `Merge failed: ${(err as Error).message}` };
  }
}
```

Add imports at top of file:

```typescript
import { splitPiece, mergePieces } from '../../utils/patternOps';
```

**Step 3: Add validator rules**

In `src/copilot/actions/actionValidator.ts`:

Add to the geometry action dispatch list:

```typescript
if (['move_point', 'add_point', 'delete_point', 'add_ease', 'add_dart', 'curve_edge', 'straighten_edge', 'split_edge', 'split_piece', 'merge_pieces'].includes(action.action)) {
```

Add cases in `validateGeometryAction`:

```typescript
case 'split_piece': {
  const splitPieceResult = validatePieceExists(state, action.pieceId);
  if (!splitPieceResult.valid) return splitPieceResult;
  if (!Array.isArray(action.startPoint) || action.startPoint.length !== 2) {
    return fail('startPoint must be [x, y]');
  }
  if (!Array.isArray(action.endPoint) || action.endPoint.length !== 2) {
    return fail('endPoint must be [x, y]');
  }
  return ok();
}

case 'merge_pieces': {
  const mergeResultA = validatePieceExists(state, action.pieceIdA);
  if (!mergeResultA.valid) return mergeResultA;
  const mergeResultB = validatePieceExists(state, action.pieceIdB);
  if (!mergeResultB.valid) return mergeResultB;
  if (action.pieceIdA === action.pieceIdB) {
    return fail('Cannot merge a piece with itself');
  }
  return ok();
}
```

**Step 4: Add LLM schemas**

In `src/copilot/llm/actionSchemas.ts`, add:

```typescript
{
  action: 'split_piece',
  description: 'Split a pattern piece into two pieces along a cut line between two points on the outline',
  category: 'geometry',
  parameters: [
    { name: 'pieceId', type: 'string', description: 'ID of the piece to split', required: true },
    { name: 'startPoint', type: '[number, number]', description: 'Start point [x, y] on the piece outline (in pattern space)', required: true },
    { name: 'endPoint', type: '[number, number]', description: 'End point [x, y] on the piece outline (in pattern space)', required: true },
  ],
  examples: ['Split the front bodice from armhole to waist', 'Cut this piece in half horizontally'],
  dangerous: true,
},
{
  action: 'merge_pieces',
  description: 'Merge two adjacent pattern pieces into one. The pieces must share an adjacent edge.',
  category: 'geometry',
  parameters: [
    { name: 'pieceIdA', type: 'string', description: 'ID of the first piece', required: true },
    { name: 'pieceIdB', type: 'string', description: 'ID of the second piece', required: true },
  ],
  examples: ['Merge the upper and lower bodice', 'Join these two pieces together', 'Combine the front panels'],
},
```

**Step 5: Run type check and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/copilot/actions/actionTypes.ts src/copilot/actions/actionExecutor.ts src/copilot/actions/actionValidator.ts src/copilot/llm/actionSchemas.ts
git commit -m "feat(copilot): add split_piece and merge_pieces actions with schemas"
```

---

### Task 11: Run full test suite and type check

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests PASS

**Step 3: Fix any issues found**

If any type errors or test failures, fix them before proceeding.

---

### Task 12: Visual verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test scissors tool**

1. Create a rectangular piece (or use an existing one)
2. Select the piece
3. Press X to activate scissors
4. Click on the left edge → red dot appears
5. Click on the right edge → piece splits into two
6. Verify both halves are separate pieces
7. Press Ctrl+Z to undo — verify piece is restored

**Step 3: Test merge tool**

1. With two adjacent pieces from the split above
2. Press J to activate merge
3. Click piece A → blue highlight
4. Click piece B → pieces merge into one
5. Press Ctrl+Z to undo — verify pieces are separated again

**Step 4: Test copilot**

1. Open copilot panel
2. Say "Split the front piece in half horizontally"
3. Verify the action executes correctly
4. Say "Merge the two pieces back together"
5. Verify merge works
