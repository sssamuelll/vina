# Extract Math Utilities into utils/geometry/ — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract ~50 scattered inline math/geometry functions from 12+ editor hooks into organized, tested utility modules under `src/utils/geometry/`.

**Architecture:** Create 7 new files in the existing `src/utils/geometry/` directory, each grouping related pure functions. Add a barrel `index.ts`. Move `transformUtils.ts`. Then update all hooks to import from the new locations.

**Tech Stack:** TypeScript, Vitest, pure functions (no React/Redux deps)

---

### Task 1: Create `distance.ts` with tests

**Files:**
- Create: `src/utils/geometry/distance.ts`
- Create: `src/utils/geometry/__tests__/distance.test.ts`

**Step 1: Write the test file**

```typescript
// src/utils/geometry/__tests__/distance.test.ts
import { describe, it, expect } from 'vitest';
import { dist, distToSegment, distToSegmentWithT } from '../distance';

describe('dist', () => {
  it('returns 0 for same point', () => {
    expect(dist({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
  it('returns correct distance', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('distToSegment', () => {
  it('returns 0 when point is on segment', () => {
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });
  it('returns perpendicular distance', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it('returns distance to nearest endpoint when outside', () => {
    expect(distToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
  it('handles zero-length segment', () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('distToSegmentWithT', () => {
  it('returns t=0 at start of segment', () => {
    const r = distToSegmentWithT(0, 0, 0, 0, 10, 0);
    expect(r.t).toBe(0);
    expect(r.distance).toBe(0);
    expect(r.point).toEqual({ x: 0, y: 0 });
  });
  it('returns t=1 at end of segment', () => {
    const r = distToSegmentWithT(10, 0, 0, 0, 10, 0);
    expect(r.t).toBe(1);
    expect(r.distance).toBe(0);
  });
  it('returns t=0.5 at midpoint', () => {
    const r = distToSegmentWithT(5, 3, 0, 0, 10, 0);
    expect(r.t).toBe(0.5);
    expect(r.distance).toBe(3);
    expect(r.point).toEqual({ x: 5, y: 0 });
  });
  it('clamps t for points beyond segment', () => {
    const r = distToSegmentWithT(15, 0, 0, 0, 10, 0);
    expect(r.t).toBe(1);
    expect(r.point).toEqual({ x: 10, y: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/geometry/__tests__/distance.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Create the implementation**

```typescript
// src/utils/geometry/distance.ts
import type { Point2D } from '../../types/types';

/** Euclidean distance between two 2D points. */
export function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from point p to the line segment a–b (scalar only). */
export function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Distance from point (px,py) to segment (x1,y1)–(x2,y2),
 * returning the distance, the t parameter (0–1), and the closest point.
 */
export function distToSegmentWithT(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): { distance: number; t: number; point: Point2D } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq === 0) {
    t = 0;
  } else {
    t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distance = Math.hypot(px - projX, py - projY);

  return { distance, t, point: { x: projX, y: projY } };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/geometry/__tests__/distance.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/distance.ts src/utils/geometry/__tests__/distance.test.ts
git commit -m "feat: extract distance utilities into utils/geometry/distance.ts"
```

---

### Task 2: Create `bezier.ts` with tests

**Files:**
- Create: `src/utils/geometry/bezier.ts`
- Create: `src/utils/geometry/__tests__/bezier.test.ts`

**Step 1: Write the test file**

```typescript
// src/utils/geometry/__tests__/bezier.test.ts
import { describe, it, expect } from 'vitest';
import { lerp, lerp2D, evalCubic, evalQuadratic, distToBezier } from '../bezier';

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(0, 10, 0)).toBe(0));
  it('returns b at t=1', () => expect(lerp(0, 10, 1)).toBe(10));
  it('returns midpoint at t=0.5', () => expect(lerp(0, 10, 0.5)).toBe(5));
});

describe('lerp2D', () => {
  it('returns a at t=0', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns b at t=1', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 1)).toEqual({ x: 10, y: 20 });
  });
  it('returns midpoint at t=0.5', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
});

describe('evalCubic', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 10 };
  const p2 = { x: 10, y: 10 };
  const p3 = { x: 10, y: 0 };
  it('returns p0 at t=0', () => expect(evalCubic(p0, p1, p2, p3, 0)).toEqual(p0));
  it('returns p3 at t=1', () => expect(evalCubic(p0, p1, p2, p3, 1)).toEqual(p3));
  it('returns a point between at t=0.5', () => {
    const mid = evalCubic(p0, p1, p2, p3, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(7.5);
  });
});

describe('evalQuadratic', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 5, y: 10 };
  const p2 = { x: 10, y: 0 };
  it('returns p0 at t=0', () => expect(evalQuadratic(p0, p1, p2, 0)).toEqual(p0));
  it('returns p2 at t=1', () => expect(evalQuadratic(p0, p1, p2, 1)).toEqual(p2));
  it('returns peak at t=0.5', () => {
    const mid = evalQuadratic(p0, p1, p2, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(5);
  });
});

describe('distToBezier', () => {
  it('finds closest point on a straight-line bezier', () => {
    const evalFn = (t: number) => ({ x: t * 10, y: 0 });
    const r = distToBezier(5, 3, evalFn, 20);
    expect(r.distance).toBeCloseTo(3, 1);
    expect(r.t).toBeCloseTo(0.5, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/geometry/__tests__/bezier.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Create the implementation**

```typescript
// src/utils/geometry/bezier.ts
import type { Point2D } from '../../types/types';
import { distToSegmentWithT } from './distance';

/** Scalar linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear interpolation between two 2D points. */
export function lerp2D(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/** Evaluate a cubic Bezier curve at parameter t (Bernstein polynomial). */
export function evalCubic(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/** Evaluate a quadratic Bezier curve at parameter t. */
export function evalQuadratic(p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Compute distance from point (px,py) to a curve defined by evalFn.
 * Samples N points along the curve and tests each polyline segment.
 */
export function distToBezier(
  px: number, py: number,
  evalFn: (t: number) => Point2D,
  samples: number,
): { distance: number; t: number; point: Point2D } {
  let bestDist = Infinity;
  let bestT = 0;
  let bestPoint: Point2D = { x: 0, y: 0 };

  let prev = evalFn(0);
  for (let i = 1; i <= samples; i++) {
    const tCurr = i / samples;
    const curr = evalFn(tCurr);
    const seg = distToSegmentWithT(px, py, prev.x, prev.y, curr.x, curr.y);

    if (seg.distance < bestDist) {
      bestDist = seg.distance;
      const tPrev = (i - 1) / samples;
      bestT = tPrev + seg.t * (tCurr - tPrev);
      bestPoint = seg.point;
    }

    prev = curr;
  }

  return { distance: bestDist, t: bestT, point: bestPoint };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/geometry/__tests__/bezier.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/bezier.ts src/utils/geometry/__tests__/bezier.test.ts
git commit -m "feat: extract bezier utilities into utils/geometry/bezier.ts"
```

---

### Task 3: Create `coords.ts`, `path.ts`, `hitTest.ts` with tests

**Files:**
- Create: `src/utils/geometry/coords.ts`
- Create: `src/utils/geometry/path.ts`
- Create: `src/utils/geometry/hitTest.ts`
- Create: `src/utils/geometry/__tests__/coords.test.ts`
- Create: `src/utils/geometry/__tests__/path.test.ts`
- Create: `src/utils/geometry/__tests__/hitTest.test.ts`

**Step 1: Write `coords.ts` and test**

```typescript
// src/utils/geometry/coords.ts
import type { Point2D } from '../../types/types';

/** Convert screen coordinates to pattern space (pure — no React deps). */
export function screenToPattern(
  screenX: number,
  screenY: number,
  svgRect: { left: number; top: number },
  zoom: number,
  pan: Point2D,
): Point2D {
  return {
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  };
}
```

```typescript
// src/utils/geometry/__tests__/coords.test.ts
import { describe, it, expect } from 'vitest';
import { screenToPattern } from '../coords';

describe('screenToPattern', () => {
  it('converts with no zoom/pan', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 0, y: 0 });
    expect(result).toEqual({ x: 100, y: 200 });
  });
  it('accounts for zoom', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 2, { x: 0, y: 0 });
    expect(result).toEqual({ x: 50, y: 100 });
  });
  it('accounts for pan', () => {
    const result = screenToPattern(100, 200, { left: 0, top: 0 }, 1, { x: 10, y: 20 });
    expect(result).toEqual({ x: 90, y: 180 });
  });
  it('accounts for svgRect offset', () => {
    const result = screenToPattern(100, 200, { left: 50, top: 100 }, 1, { x: 0, y: 0 });
    expect(result).toEqual({ x: 50, y: 100 });
  });
});
```

**Step 2: Write `path.ts` and test**

```typescript
// src/utils/geometry/path.ts
import type { PathCommand, Point2D } from '../../types/types';

/** Get the start and end points of an edge at edgeIndex in a PathCommand array. */
export function getEdgeEndpoints(
  commands: PathCommand[],
  edgeIndex: number,
): { start: Point2D; end: Point2D } | null {
  if (edgeIndex < 1 || edgeIndex >= commands.length) return null;

  let cx = 0, cy = 0;
  for (let i = 0; i < edgeIndex; i++) {
    const cmd = commands[i];
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': case 'L': cx = v[0]; cy = v[1]; break;
      case 'H': cx = v[0]; break;
      case 'V': cy = v[0]; break;
      case 'C': cx = v[4]; cy = v[5]; break;
      case 'Q': cx = v[2]; cy = v[3]; break;
      case 'Z': {
        const m = commands[0];
        if (m.type === 'M') { cx = m.values[0]; cy = m.values[1]; }
        break;
      }
    }
  }
  const start = { x: cx, y: cy };

  const cmd = commands[edgeIndex];
  const v = cmd.values;
  let end: Point2D;
  switch (cmd.type) {
    case 'L': end = { x: v[0], y: v[1] }; break;
    case 'H': end = { x: v[0], y: cy }; break;
    case 'V': end = { x: cx, y: v[0] }; break;
    case 'C': end = { x: v[4], y: v[5] }; break;
    case 'Q': end = { x: v[2], y: v[3] }; break;
    case 'Z': {
      const m = commands[0];
      end = m.type === 'M' ? { x: m.values[0], y: m.values[1] } : start;
      break;
    }
    default: return null;
  }

  return { start, end };
}

/** Compute the straight-line length of an edge. */
export function getEdgeLength(commands: PathCommand[], edgeIndex: number): number {
  const ep = getEdgeEndpoints(commands, edgeIndex);
  if (!ep) return 0;
  return Math.sqrt((ep.end.x - ep.start.x) ** 2 + (ep.end.y - ep.start.y) ** 2);
}

/** Compute a perpendicular offset path from a line segment. */
export function computeOffsetPath(
  start: Point2D,
  end: Point2D,
  offset: number,
): PathCommand[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];

  const nx = -dy / len;
  const ny = dx / len;

  return [
    { type: 'M', values: [start.x + nx * offset, start.y + ny * offset] },
    { type: 'L', values: [end.x + nx * offset, end.y + ny * offset] },
  ];
}

/** Compute offset path for a sub-segment defined by t0 and t1. */
export function computeSegmentOffsetPath(
  start: Point2D,
  end: Point2D,
  t0: number,
  t1: number,
  offset: number,
): PathCommand[] {
  const segStart = {
    x: start.x + (end.x - start.x) * t0,
    y: start.y + (end.y - start.y) * t0,
  };
  const segEnd = {
    x: start.x + (end.x - start.x) * t1,
    y: start.y + (end.y - start.y) * t1,
  };
  return computeOffsetPath(segStart, segEnd, offset);
}
```

```typescript
// src/utils/geometry/__tests__/path.test.ts
import { describe, it, expect } from 'vitest';
import { getEdgeEndpoints, getEdgeLength, computeOffsetPath, computeSegmentOffsetPath } from '../path';
import type { PathCommand } from '../../../types/types';

const triangle: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [5, 10] },
  { type: 'Z', values: [] },
];

describe('getEdgeEndpoints', () => {
  it('returns start/end for first edge', () => {
    const r = getEdgeEndpoints(triangle, 1);
    expect(r).toEqual({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
  });
  it('returns start/end for second edge', () => {
    const r = getEdgeEndpoints(triangle, 2);
    expect(r).toEqual({ start: { x: 10, y: 0 }, end: { x: 5, y: 10 } });
  });
  it('returns null for out-of-range', () => {
    expect(getEdgeEndpoints(triangle, 0)).toBeNull();
    expect(getEdgeEndpoints(triangle, 10)).toBeNull();
  });
});

describe('getEdgeLength', () => {
  it('computes length of horizontal edge', () => {
    expect(getEdgeLength(triangle, 1)).toBe(10);
  });
  it('returns 0 for invalid index', () => {
    expect(getEdgeLength(triangle, 0)).toBe(0);
  });
});

describe('computeOffsetPath', () => {
  it('offsets a horizontal segment upward', () => {
    const r = computeOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(r).toHaveLength(2);
    expect(r[0].values[1]).toBe(-5); // offset upward (normal is -dy/len = 0, nx = 0, ny... let me recalc)
    // For horizontal line (dx=10, dy=0): nx = -0/10 = 0, ny = 10/10 = 1
    // So offset is in +y direction
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [10, 5] });
  });
  it('returns empty for zero-length segment', () => {
    expect(computeOffsetPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 3)).toEqual([]);
  });
});

describe('computeSegmentOffsetPath', () => {
  it('offsets a partial segment', () => {
    const r = computeSegmentOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0.5, 5);
    expect(r).toHaveLength(2);
    // Sub-segment is (0,0)-(5,0), offset by 5 in +y
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [5, 5] });
  });
});
```

**Step 3: Write `hitTest.ts` and test**

```typescript
// src/utils/geometry/hitTest.ts
import type { Point2D, PatternPiece } from '../../types/types';

/**
 * Bounding-box hit test: find the first piece whose bbox contains the point.
 * Iterates piece outlines to compute bbox on the fly.
 */
export function hitTestPieceBBox(pt: Point2D, pieces: PatternPiece[]): PatternPiece | null {
  for (const piece of pieces) {
    const cmds = piece.outline;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of cmds) {
      const v = cmd.values;
      for (let i = 0; i < v.length; i += 2) {
        if (i + 1 < v.length) {
          const x = v[i] + piece.position.x;
          const y = v[i + 1] + piece.position.y;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
      return piece;
    }
  }
  return null;
}

/**
 * Find the nearest piece to a point by bounding-box containment with margin,
 * then ranking by distance to bbox center.
 */
export function findNearestPiece(pt: Point2D, pieces: PatternPiece[], margin = 50): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        const px = cmd.values[i] + piece.position.x;
        const py = cmd.values[i + 1] + piece.position.y;
        minX = Math.min(minX, px); minY = Math.min(minY, py);
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      }
    }
    if (pt.x >= minX - margin && pt.x <= maxX + margin &&
        pt.y >= minY - margin && pt.y <= maxY + margin) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d < bestDist) {
        bestDist = d;
        bestId = piece.id;
      }
    }
  }
  return bestId;
}
```

```typescript
// src/utils/geometry/__tests__/hitTest.test.ts
import { describe, it, expect } from 'vitest';
import { hitTestPieceBBox, findNearestPiece } from '../hitTest';
import type { PatternPiece } from '../../../types/types';

function makePiece(id: string, x: number, y: number, size: number): PatternPiece {
  return {
    id,
    name: id,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [size, 0] },
      { type: 'L', values: [size, size] },
      { type: 'L', values: [0, size] },
      { type: 'Z', values: [] },
    ],
    position: { x, y },
    rotation: 0,
    internals: [],
    seamAllowance: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('hitTestPieceBBox', () => {
  const pieces = [makePiece('A', 0, 0, 100), makePiece('B', 200, 200, 50)];
  it('returns piece when point is inside bbox', () => {
    expect(hitTestPieceBBox({ x: 50, y: 50 }, pieces)?.id).toBe('A');
  });
  it('returns null when point is outside all bboxes', () => {
    expect(hitTestPieceBBox({ x: 150, y: 150 }, pieces)).toBeNull();
  });
  it('returns first matching piece', () => {
    expect(hitTestPieceBBox({ x: 210, y: 210 }, pieces)?.id).toBe('B');
  });
});

describe('findNearestPiece', () => {
  const pieces = [makePiece('A', 0, 0, 100), makePiece('B', 200, 200, 50)];
  it('returns nearest piece within margin', () => {
    expect(findNearestPiece({ x: 50, y: 50 }, pieces)).toBe('A');
  });
  it('returns null when outside margin', () => {
    expect(findNearestPiece({ x: 500, y: 500 }, pieces, 10)).toBeNull();
  });
});
```

**Step 4: Run all tests**

Run: `npx vitest run src/utils/geometry/__tests__/coords.test.ts src/utils/geometry/__tests__/path.test.ts src/utils/geometry/__tests__/hitTest.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/coords.ts src/utils/geometry/path.ts src/utils/geometry/hitTest.ts src/utils/geometry/__tests__/coords.test.ts src/utils/geometry/__tests__/path.test.ts src/utils/geometry/__tests__/hitTest.test.ts
git commit -m "feat: extract coords, path, hitTest utilities into utils/geometry/"
```

---

### Task 4: Move `transformUtils.ts` to `utils/geometry/transform.ts`

**Files:**
- Move: `src/components/PatternEditor/transformUtils.ts` → `src/utils/geometry/transform.ts`
- Modify: `src/components/PatternEditor/useTransformTool.ts` (update import path)

**Step 1: Copy the file**

Copy `src/components/PatternEditor/transformUtils.ts` to `src/utils/geometry/transform.ts`. The only change needed is the import path for types. Currently it imports from `../../types/types` — in the new location (`src/utils/geometry/`) the path is still `../../types/types`. So no change needed to the file content itself.

**Step 2: Update the import in useTransformTool.ts**

In `src/components/PatternEditor/useTransformTool.ts`, find the import line:

```typescript
import { computeBoundingBox, computeHandlePositions, scaleOutline, rotateOutline, hitTestHandle, computeScaleFromDrag, computeRotationFromDrag } from './transformUtils';
```

Replace with:

```typescript
import { computeBoundingBox, computeHandlePositions, scaleOutline, rotateOutline, hitTestHandle, computeScaleFromDrag, computeRotationFromDrag } from '../../utils/geometry/transform';
```

Also check for any other files that import from `./transformUtils` or `../PatternEditor/transformUtils`:

Run: `grep -r "transformUtils" src/ --include="*.ts" --include="*.tsx" -l`

Update all found import paths.

**Step 3: Delete the old file**

Delete `src/components/PatternEditor/transformUtils.ts`.

**Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: all pass

**Step 6: Commit**

```bash
git add src/utils/geometry/transform.ts src/components/PatternEditor/useTransformTool.ts
git rm src/components/PatternEditor/transformUtils.ts
git commit -m "refactor: move transformUtils.ts to utils/geometry/transform.ts"
```

---

### Task 5: Create barrel `index.ts`

**Files:**
- Create: `src/utils/geometry/index.ts`

**Step 1: Create the barrel file**

```typescript
// src/utils/geometry/index.ts
export { dist, distToSegment, distToSegmentWithT } from './distance';
export { lerp, lerp2D, evalCubic, evalQuadratic, distToBezier } from './bezier';
export { screenToPattern } from './coords';
export { getEdgeEndpoints, getEdgeLength, computeOffsetPath, computeSegmentOffsetPath } from './path';
export { hitTestPieceBBox, findNearestPiece } from './hitTest';
export {
  computeBoundingBox, computeHandlePositions, scaleOutline, rotateOutline,
  hitTestHandle, computeScaleFromDrag, computeRotationFromDrag,
} from './transform';
export type { HandleId, HandlePosition, BBox } from './transform';
export { lineSegmentIntersection, linePolylineIntersections } from './lineIntersect';
export { findSharedEdge, mergeOutlines } from './mergeOutline';
export { findOutlineIntersections, splitOutlineAtPoints } from './splitOutline';
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/utils/geometry/index.ts
git commit -m "feat: add barrel re-export for utils/geometry/"
```

---

### Task 6: Update `nodeEditorUtils.ts` to import from utils/geometry

**Files:**
- Modify: `src/components/PatternEditor/nodeEditorUtils.ts`

**Step 1: Replace inline functions with imports**

At the top of `nodeEditorUtils.ts`, add:

```typescript
import { distToSegmentWithT } from '../../utils/geometry/distance';
import { evalCubic, evalQuadratic, distToBezier, lerp2D } from '../../utils/geometry/bezier';
```

Then delete these functions from the file:
- `distToSegmentWithT` (lines 60-83) — keep the export as re-export: `export { distToSegmentWithT } from '../../utils/geometry/distance';`
- `evalCubic` (lines 220-228) — delete entirely (was private)
- `evalQuadratic` (lines 231-237) — delete entirely (was private)
- `distToBezier` (lines 243-269) — delete entirely (was private)
- `lerp2D` (lines 558-563) — delete entirely (was private)

The `nearestSegment` function uses `evalCubic`, `evalQuadratic`, `distToBezier`, and `distToSegmentWithT` — these will now come from the imports.

The `splitSegmentAt` function uses `lerp2D` — this will now come from the import.

**Important:** `distToSegmentWithT` was exported from nodeEditorUtils. To avoid breaking existing importers during migration, re-export it:

```typescript
export { distToSegmentWithT } from '../../utils/geometry/distance';
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Run tests**

Run: `npx vitest run --reporter=verbose`
Expected: all pass

**Step 4: Commit**

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts
git commit -m "refactor: nodeEditorUtils imports from utils/geometry"
```

---

### Task 7: Update `useSeamTool.ts` to import from utils/geometry

**Files:**
- Modify: `src/components/PatternEditor/useSeamTool.ts`

**Step 1: Replace inline functions with imports**

Add imports at the top:

```typescript
import { distToSegment } from '../../utils/geometry/distance';
import { getEdgeEndpoints, getEdgeLength } from '../../utils/geometry/path';
```

Delete these functions from the file:
- `getEdgeEndpoints` (lines 25-70) — delete the private function definition
- `distToSegment` (lines 73-81) — delete entirely
- `getEdgeLength` (lines 216-220) — delete the private function definition

Update the export at the bottom (line 222). Replace:

```typescript
export { getEdgeEndpoints, getEdgeLength };
```

With re-exports from the new location:

```typescript
export { getEdgeEndpoints, getEdgeLength } from '../../utils/geometry/path';
```

The `findClosestEdge` function (lines 84-134) uses `distToSegment` and `getEdgeEndpoints` — these will now come from the imports. `findClosestEdge` stays in the hook because it has a hardcoded `EDGE_HIT_THRESHOLD` constant specific to the seam tool.

**Step 2: Type check and test**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: all pass

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useSeamTool.ts
git commit -m "refactor: useSeamTool imports from utils/geometry"
```

---

### Task 8: Update `useTopstitchTool.ts` to import from utils/geometry

**Files:**
- Modify: `src/components/PatternEditor/useTopstitchTool.ts`

**Step 1: Replace inline functions with imports**

The tool currently exports `computeOffsetPath` and `computeSegmentOffsetPath` and imports `getEdgeEndpoints` from `./useSeamTool`.

Update imports:

```typescript
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { computeOffsetPath, computeSegmentOffsetPath } from '../../utils/geometry/path';
```

Delete the local `computeOffsetPath` (lines 12-29) and `computeSegmentOffsetPath` (lines 31-47) function definitions.

Re-export them for backward compatibility:

```typescript
export { computeOffsetPath, computeSegmentOffsetPath } from '../../utils/geometry/path';
```

**Step 2: Type check and test**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: all pass

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useTopstitchTool.ts
git commit -m "refactor: useTopstitchTool imports from utils/geometry"
```

---

### Task 9: Update `useGrainlineTool.ts` and `useLineTool.ts` to import from utils/geometry

**Files:**
- Modify: `src/components/PatternEditor/useGrainlineTool.ts`
- Modify: `src/components/PatternEditor/useLineTool.ts`

**Step 1: Update useGrainlineTool.ts**

Add import:

```typescript
import { hitTestPieceBBox } from '../../utils/geometry/hitTest';
```

Delete the local `hitTestPiece` function (lines 20-41).

In the hook body, replace all calls to `hitTestPiece(pt, pieces)` with `hitTestPieceBBox(pt, pieces)`.

**Step 2: Update useLineTool.ts**

Add import:

```typescript
import { findNearestPiece } from '../../utils/geometry/hitTest';
```

Delete the local `findNearestPiece` useCallback (lines 39-69 inside the hook).

Replace all calls to the old `findNearestPiece(pt)` with `findNearestPiece(pt, pieces)` (the extracted version takes pieces as a parameter instead of capturing from closure).

**Step 3: Type check and test**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: all pass

**Step 4: Commit**

```bash
git add src/components/PatternEditor/useGrainlineTool.ts src/components/PatternEditor/useLineTool.ts
git commit -m "refactor: useGrainlineTool and useLineTool import from utils/geometry"
```

---

### Task 10: Full verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 2: Full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: all tests pass

**Step 3: Verify no remaining duplicates**

Run: `grep -rn "function distToSegment\b" src/components/ --include="*.ts"` — should return 0 matches (only the one in useSeamTool's `findClosestEdge` which calls the imported version).

Run: `grep -rn "function hitTestPiece\b" src/components/ --include="*.ts"` — should return 0 matches in hooks (only useMergeTool may still have its inline version, which is fine since it's inside a useCallback).

**Step 4: Verify imports**

Run: `grep -rn "from '../../utils/geometry" src/components/PatternEditor/ --include="*.ts" | head -20` — should show the new imports.
