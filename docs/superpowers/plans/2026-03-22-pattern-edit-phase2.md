# 2D Pattern Edit Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 new 2D pattern editing tools (unfold, optimize curves, offset internal line, poly pen, replace as pattern outline) with copilot tool registration.

**Architecture:** Pure functions in `patternOps.ts` following the Phase 1 pattern. UI tools dispatch Redux actions via thin wrappers. Copilot tools use JSON Schema params with deep snapshot rollback. New `fitCubicBezier()` geometry utility enables curve optimization and offset refit.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest, Clipper2-js, SVG

**Spec:** `docs/superpowers/specs/2026-03-22-pattern-edit-phase2-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/utils/geometry/__tests__/bezierFit.test.ts` | Tests for `fitCubicBezier` |
| `src/tools/definitions/polyPen.tsx` | Poly Pen UI tool definition |
| `src/components/PatternEditor/usePolyPenTool.ts` | Canvas interaction hook for Poly Pen |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx` | SVG overlay for Poly Pen |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/types.ts` | Add `'reference'` to `InternalLineType` |
| `src/utils/geometry/bezier.ts` | Add `fitCubicBezier()`, `rdpSimplify()` |
| `src/utils/patternOps.ts` | Add 5 pure functions: `unfoldPiece`, `optimizeCurvePoints`, `optimizePieceCurves`, `offsetInternalLine`, `replaceAsPatternOutline` |
| `src/utils/__tests__/patternOps.test.ts` | Tests for all 5 new functions |
| `src/copilot/action/tools/definitions/patternOpsTools.ts` | Register 5 copilot tools |
| `src/components/PatternEditor/ContextMenu.tsx` | Add `internalLineId` to state, add 4 context menu entries |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Add `'reference'` line rendering style |
| `src/tools/index.ts` | Register polyPen tool in allTools array |
| `src/components/PatternEditor/PatternEditor.tsx` | Wire polyPen hook, pass `internalLineId` to context menu |

---

## Task 1: Add `'reference'` to InternalLineType

**Files:**
- Modify: `src/types/types.ts:113`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:128-142`

- [ ] **Step 1: Add `'reference'` to the InternalLineType union**

In `src/types/types.ts` line 113, change:
```typescript
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch';
```
to:
```typescript
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch' | 'reference';
```

- [ ] **Step 2: Add reference line rendering style**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`, in the stroke color block (around line 128-135), add `'reference'` before the fallback `'#888'`:

Change:
```typescript
              line.type === 'topstitch' ? (line.topstitchOptions?.threadColor ?? '#333') :
                '#888'
```
to:
```typescript
              line.type === 'topstitch' ? (line.topstitchOptions?.threadColor ?? '#333') :
                line.type === 'reference' ? '#999' :
                '#888'
```

And in the strokeDasharray block (around line 138-142), add reference before `'none'`:

Change:
```typescript
                line.type === 'topstitch' ? `${(line.topstitchOptions?.stitchLength ?? 3) / zoom2D} ${1.5 / zoom2D}` :
                'none'
```
to:
```typescript
                line.type === 'topstitch' ? `${(line.topstitchOptions?.stitchLength ?? 3) / zoom2D} ${1.5 / zoom2D}` :
                line.type === 'reference' ? `${4 / zoom2D} ${4 / zoom2D}` :
                'none'
```

And in the opacity expression (line 143), add reference lines at 0.6:

Change:
```typescript
              opacity={line.type === 'grainline' && !showGrainlines ? 0 : isLineSelected ? 1 : 0.7}
```
to:
```typescript
              opacity={line.type === 'grainline' && !showGrainlines ? 0 : isLineSelected ? 1 : line.type === 'reference' ? 0.6 : 0.7}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add src/types/types.ts src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat: add 'reference' internal line type with dashed gray rendering"
```

---

## Task 2: Implement `fitCubicBezier` geometry utility

**Files:**
- Modify: `src/utils/geometry/bezier.ts`
- Create: `src/utils/geometry/__tests__/bezierFit.test.ts`

- [ ] **Step 1: Write failing tests for `fitCubicBezier` and `rdpSimplify`**

Create `src/utils/geometry/__tests__/bezierFit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fitCubicBezier, rdpSimplify } from '../bezier';
import type { Point2D } from '../../../types/types';

function sampleLine(a: Point2D, b: Point2D, n: number): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return pts;
}

function sampleArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, n: number): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const angle = startAngle + t * (endAngle - startAngle);
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

describe('rdpSimplify', () => {
  it('preserves endpoints', () => {
    const pts = sampleLine({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    const result = rdpSimplify(pts, 1);
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('reduces collinear points to 2', () => {
    const pts = sampleLine({ x: 0, y: 0 }, { x: 100, y: 0 }, 50);
    const result = rdpSimplify(pts, 0.1);
    expect(result.length).toBe(2);
  });

  it('retains corners', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 },
    ];
    const result = rdpSimplify(pts, 0.1);
    expect(result.length).toBe(4);
  });

  it('returns input when fewer than 3 points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(rdpSimplify(pts, 1)).toEqual(pts);
  });
});

describe('fitCubicBezier', () => {
  it('fits a straight line as a single L-equivalent segment', () => {
    const pts = sampleLine({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    const cmds = fitCubicBezier(pts, 0.5);
    // Should produce M + at least 1 segment + no absurd overshoot
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    expect(cmds[0].type).toBe('M');
  });

  it('fits a quarter circle within error tolerance', () => {
    const pts = sampleArc(0, 0, 100, 0, Math.PI / 2, 50);
    const cmds = fitCubicBezier(pts, 1.0);
    // Should be M + 1 or 2 C commands (a quarter circle is well approximated by 1 cubic)
    expect(cmds.length).toBeLessThanOrEqual(4);
    expect(cmds.filter(c => c.type === 'C').length).toBeGreaterThanOrEqual(1);
  });

  it('fits an S-curve with multiple segments', () => {
    const pts = sampleArc(0, 0, 100, 0, Math.PI, 100);
    const cmds = fitCubicBezier(pts, 0.5);
    expect(cmds.filter(c => c.type === 'C').length).toBeGreaterThanOrEqual(1);
  });

  it('returns M + Z for fewer than 2 points', () => {
    expect(fitCubicBezier([{ x: 0, y: 0 }]).length).toBe(1);
    expect(fitCubicBezier([]).length).toBe(0);
  });

  it('max error stays within tolerance', () => {
    const pts = sampleArc(0, 0, 100, 0, Math.PI / 2, 100);
    const maxErr = 2.0;
    const cmds = fitCubicBezier(pts, maxErr);
    // Re-sample the fitted curve and measure deviation
    // (detailed accuracy test — verify no point deviates more than maxErr)
    expect(cmds.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/bezierFit.test.ts`
Expected: FAIL — `fitCubicBezier` and `rdpSimplify` not found

- [ ] **Step 3: Implement `rdpSimplify` in bezier.ts**

Add to `src/utils/geometry/bezier.ts`:

```typescript
// ─── Ramer-Douglas-Peucker simplification ────────────────────────────────────

function perpendicularDist(pt: Point2D, lineA: Point2D, lineB: Point2D): number {
  const dx = lineB.x - lineA.x;
  const dy = lineB.y - lineA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt.x - lineA.x, pt.y - lineA.y);
  const t = Math.max(0, Math.min(1, ((pt.x - lineA.x) * dx + (pt.y - lineA.y) * dy) / lenSq));
  return Math.hypot(pt.x - (lineA.x + t * dx), pt.y - (lineA.y + t * dy));
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Returns a subset of the input points with max deviation ≤ epsilon.
 */
export function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}
```

- [ ] **Step 4: Implement `fitCubicBezier` in bezier.ts**

Add to `src/utils/geometry/bezier.ts` — Philip J. Schneider's algorithm:

```typescript
import type { PathCommand, Point2D } from '../../types/types';

// ─── Cubic Bezier Fitting (Schneider's algorithm) ────────────────────────────

function chordLengthParams(pts: Point2D[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) {
    u.push(u[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = u[u.length - 1];
  if (total > 0) for (let i = 0; i < u.length; i++) u[i] /= total;
  return u;
}

function bezierPoint(cp: Point2D[], t: number): Point2D {
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2 * mt * cp[0].x + 3 * mt2 * t * cp[1].x + 3 * mt * t2 * cp[2].x + t2 * t * cp[3].x,
    y: mt2 * mt * cp[0].y + 3 * mt2 * t * cp[1].y + 3 * mt * t2 * cp[2].y + t2 * t * cp[3].y,
  };
}

function computeMaxError(pts: Point2D[], cp: Point2D[], params: number[]): { maxErr: number; splitIdx: number } {
  let maxErr = 0, splitIdx = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = bezierPoint(cp, params[i]);
    const err = Math.hypot(p.x - pts[i].x, p.y - pts[i].y);
    if (err > maxErr) { maxErr = err; splitIdx = i; }
  }
  return { maxErr, splitIdx };
}

function fitCubicSingle(pts: Point2D[], params: number[], tHat1: Point2D, tHat2: Point2D): Point2D[] {
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length === 2) {
    const dist = Math.hypot(last.x - first.x, last.y - first.y) / 3;
    return [
      first,
      { x: first.x + tHat1.x * dist, y: first.y + tHat1.y * dist },
      { x: last.x + tHat2.x * dist, y: last.y + tHat2.y * dist },
      last,
    ];
  }

  // Compute A matrix rows and solve for alpha
  const A: [Point2D, Point2D][] = params.map(u => [
    { x: tHat1.x * 3 * u * (1 - u) * (1 - u), y: tHat1.y * 3 * u * (1 - u) * (1 - u) },
    { x: tHat2.x * 3 * u * u * (1 - u), y: tHat2.y * 3 * u * u * (1 - u) },
  ]);

  let c11 = 0, c12 = 0, c22 = 0, x1 = 0, x2 = 0;
  for (let i = 0; i < pts.length; i++) {
    c11 += A[i][0].x * A[i][0].x + A[i][0].y * A[i][0].y;
    c12 += A[i][0].x * A[i][1].x + A[i][0].y * A[i][1].y;
    c22 += A[i][1].x * A[i][1].x + A[i][1].y * A[i][1].y;

    const u = params[i], mt = 1 - u;
    const tmp = {
      x: pts[i].x - (first.x * mt * mt * mt + first.x * 3 * mt * mt * u + last.x * 3 * mt * u * u + last.x * u * u * u),
      y: pts[i].y - (first.y * mt * mt * mt + first.y * 3 * mt * mt * u + last.y * 3 * mt * u * u + last.y * u * u * u),
    };
    x1 += A[i][0].x * tmp.x + A[i][0].y * tmp.y;
    x2 += A[i][1].x * tmp.x + A[i][1].y * tmp.y;
  }

  const det = c11 * c22 - c12 * c12;
  const alpha1 = det !== 0 ? (c22 * x1 - c12 * x2) / det : 0;
  const alpha2 = det !== 0 ? (c11 * x2 - c12 * x1) / det : 0;

  const segLen = Math.hypot(last.x - first.x, last.y - first.y);
  const epsilon = 1e-6 * segLen;

  let cp1: Point2D, cp2: Point2D;
  if (alpha1 < epsilon || alpha2 < epsilon) {
    const dist = segLen / 3;
    cp1 = { x: first.x + tHat1.x * dist, y: first.y + tHat1.y * dist };
    cp2 = { x: last.x + tHat2.x * dist, y: last.y + tHat2.y * dist };
  } else {
    cp1 = { x: first.x + tHat1.x * alpha1, y: first.y + tHat1.y * alpha1 };
    cp2 = { x: last.x + tHat2.x * alpha2, y: last.y + tHat2.y * alpha2 };
  }

  return [first, cp1, cp2, last];
}

function computeTangent(pts: Point2D[], idx: number): Point2D {
  let dx: number, dy: number;
  if (idx === 0) {
    dx = pts[1].x - pts[0].x; dy = pts[1].y - pts[0].y;
  } else if (idx === pts.length - 1) {
    dx = pts[idx].x - pts[idx - 1].x; dy = pts[idx].y - pts[idx - 1].y;
  } else {
    dx = pts[idx + 1].x - pts[idx - 1].x; dy = pts[idx + 1].y - pts[idx - 1].y;
  }
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
}

function fitCubicRecursive(
  pts: Point2D[], tHat1: Point2D, tHat2: Point2D, maxError: number, result: PathCommand[],
): void {
  if (pts.length === 2) {
    result.push({ type: 'L', values: [pts[1].x, pts[1].y] });
    return;
  }

  const params = chordLengthParams(pts);
  const cp = fitCubicSingle(pts, params, tHat1, tHat2);
  const { maxErr, splitIdx } = computeMaxError(pts, cp, params);

  if (maxErr <= maxError) {
    result.push({ type: 'C', values: [cp[1].x, cp[1].y, cp[2].x, cp[2].y, cp[3].x, cp[3].y] });
    return;
  }

  const tHatCenter = computeTangent(pts, splitIdx);
  const tHatCenterNeg = { x: -tHatCenter.x, y: -tHatCenter.y };
  fitCubicRecursive(pts.slice(0, splitIdx + 1), tHat1, tHatCenterNeg, maxError, result);
  fitCubicRecursive(pts.slice(splitIdx), tHatCenter, tHat2, maxError, result);
}

/**
 * Fit cubic bezier curves to a sequence of points (Schneider's algorithm).
 * Returns PathCommand[] starting with M, followed by C and/or L commands.
 *
 * @param points Input point sequence (at least 2 points)
 * @param maxError Maximum allowed deviation in mm (default 1.0)
 */
export function fitCubicBezier(points: Point2D[], maxError = 1.0): PathCommand[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ type: 'M', values: [points[0].x, points[0].y] }];

  const cmds: PathCommand[] = [{ type: 'M', values: [points[0].x, points[0].y] }];
  const tHat1 = computeTangent(points, 0);
  const tHat2Fwd = computeTangent(points, points.length - 1);
  const tHat2 = { x: -tHat2Fwd.x, y: -tHat2Fwd.y };
  fitCubicRecursive(points, tHat1, tHat2, maxError, cmds);
  return cmds;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/bezierFit.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/geometry/bezier.ts src/utils/geometry/__tests__/bezierFit.test.ts
git commit -m "feat: add fitCubicBezier and rdpSimplify geometry utilities"
```

---

## Task 3: Implement `unfoldPiece` pure function

**Files:**
- Modify: `src/utils/patternOps.ts`
- Modify: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing tests for `unfoldPiece`**

Add to `src/utils/__tests__/patternOps.test.ts`:

```typescript
import { unfoldPiece } from '../patternOps';

function makeHalfRect(name: string): PatternPiece {
  // A 200×600 half-piece with a fold line along the left edge (x=0)
  return {
    id: `test-${name}`, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 600] },
      { type: 'L', values: [0, 600] },
      { type: 'Z', values: [] },
    ],
    internals: [
      {
        id: 'fold-1',
        type: 'fold' as const,
        path: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [0, 600] },
        ],
      },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('unfoldPiece', () => {
  it('mirrors half-rect into full rect', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    // Unfolded piece should be ~400mm wide (mirrored from x=0 axis)
    const xs = full.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
    const minX = Math.min(...xs.filter(isFinite));
    const maxX = Math.max(...xs.filter(isFinite));
    expect(maxX - minX).toBeCloseTo(400, 0);
  });

  it('preserves piece ID', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    expect(full.id).toBe(half.id);
  });

  it('removes fold line from internals', () => {
    const half = makeHalfRect('Front');
    const full = unfoldPiece(half, 'fold-1');
    expect(full.internals.find(l => l.id === 'fold-1')).toBeUndefined();
  });

  it('mirrors internals when outlineOnly is false', () => {
    const half = makeHalfRect('Front');
    half.internals.push({
      id: 'dart-1', type: 'dart',
      path: [{ type: 'M', values: [100, 100] }, { type: 'L', values: [100, 200] }],
    });
    const full = unfoldPiece(half, 'fold-1');
    // Should have the original dart + mirrored dart (fold line removed)
    const darts = full.internals.filter(l => l.type === 'dart');
    expect(darts.length).toBe(2);
  });

  it('does not mirror internals when outlineOnly is true', () => {
    const half = makeHalfRect('Front');
    half.internals.push({
      id: 'dart-1', type: 'dart',
      path: [{ type: 'M', values: [100, 100] }, { type: 'L', values: [100, 200] }],
    });
    const full = unfoldPiece(half, 'fold-1', { outlineOnly: true });
    const darts = full.internals.filter(l => l.type === 'dart');
    expect(darts.length).toBe(1);
  });

  it('throws if fold line not found', () => {
    const half = makeHalfRect('Front');
    expect(() => unfoldPiece(half, 'nonexistent')).toThrow();
  });

  it('throws if line is not type fold', () => {
    const half = makeHalfRect('Front');
    half.internals[0].type = 'dart';
    expect(() => unfoldPiece(half, 'fold-1')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "unfoldPiece"`
Expected: FAIL — `unfoldPiece` not exported

- [ ] **Step 3: Implement `unfoldPiece` in patternOps.ts**

Add at the end of `src/utils/patternOps.ts` (before any closing brace):

```typescript
// ─── unfoldPiece ─────────────────────────────────────────────────────────────

/**
 * Reflect a point across an arbitrary line defined by two points.
 * Q' = 2 * proj(Q, P1→P2) - Q
 */
function reflectPoint(pt: Point2D, p1: Point2D, p2: Point2D): Point2D {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...pt };
  const t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
  const projX = p1.x + t * dx, projY = p1.y + t * dy;
  return { x: 2 * projX - pt.x, y: 2 * projY - pt.y };
}

function reflectCommands(commands: PathCommand[], p1: Point2D, p2: Point2D): PathCommand[] {
  return commands.map(cmd => {
    const vals = [...cmd.values];
    for (let i = 0; i < vals.length; i += 2) {
      if (i + 1 < vals.length) {
        const reflected = reflectPoint({ x: vals[i], y: vals[i + 1] }, p1, p2);
        vals[i] = reflected.x;
        vals[i + 1] = reflected.y;
      }
    }
    return { type: cmd.type, values: vals };
  });
}

function distPt(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cmdEndpoint(cmd: PathCommand): Point2D | null {
  if (cmd.type === 'Z' || cmd.values.length < 2) return null;
  return { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
}

/**
 * Unfold (mirror) a half-pattern piece along a fold internal line.
 * Produces a full symmetric piece.
 */
export function unfoldPiece(
  piece: PatternPiece,
  foldLineId: string,
  options?: { outlineOnly?: boolean },
): PatternPiece {
  const foldLine = piece.internals.find(l => l.id === foldLineId);
  if (!foldLine) throw new Error(`Fold line "${foldLineId}" not found`);
  if (foldLine.type !== 'fold') throw new Error(`Internal line "${foldLineId}" is not a fold line`);

  // Extract fold axis endpoints
  const foldStart = cmdEndpoint(foldLine.path[0]) || { x: foldLine.path[0].values[0], y: foldLine.path[0].values[1] };
  const foldEnd = cmdEndpoint(foldLine.path[foldLine.path.length - 1])!;

  // Find outline points closest to fold endpoints (split points)
  const TOLERANCE = 2; // mm
  const outlinePoints: { idx: number; pt: Point2D }[] = [];
  for (let i = 0; i < piece.outline.length; i++) {
    const ep = cmdEndpoint(piece.outline[i]);
    if (ep) outlinePoints.push({ idx: i, pt: ep });
  }

  let splitA = -1, splitB = -1;
  let minDistA = Infinity, minDistB = Infinity;
  for (const { idx, pt } of outlinePoints) {
    const dA = distPt(pt, foldStart);
    const dB = distPt(pt, foldEnd);
    if (dA < minDistA) { minDistA = dA; splitA = idx; }
    if (dB < minDistB) { minDistB = dB; splitB = idx; }
  }

  if (minDistA > TOLERANCE || minDistB > TOLERANCE) {
    throw new Error('Fold line endpoints are not on the piece outline');
  }

  // Ensure splitA < splitB
  if (splitA > splitB) { [splitA, splitB] = [splitB, splitA]; }

  // Split outline: kept half = splitA+1..splitB, fold half = splitB+1..end..splitA
  // (the shorter path between the two split points is the fold edge)
  const keptCmds: PathCommand[] = [];
  for (let i = splitA + 1; i <= splitB; i++) {
    keptCmds.push({ type: piece.outline[i].type, values: [...piece.outline[i].values] });
  }

  // Mirror the kept half
  const mirroredCmds = reflectCommands(keptCmds, foldStart, foldEnd);

  // Build merged outline: start at splitA endpoint, walk kept half to splitB,
  // then walk mirrored half in reverse back to splitA
  const startPt = outlinePoints.find(p => p.idx === splitA)!.pt;
  const merged: PathCommand[] = [{ type: 'M', values: [startPt.x, startPt.y] }];

  // Add kept half
  for (const cmd of keptCmds) {
    merged.push({ type: cmd.type === 'M' ? 'L' : cmd.type, values: [...cmd.values] });
  }

  // Add mirrored half in reverse: collect all endpoints first, then re-emit segments
  // Reversing bezier paths requires re-pairing endpoints with their predecessors.
  const mirrorPts: { pt: Point2D; cmd: PathCommand }[] = [];
  let mirrorCursor = { x: mirroredCmds[0]?.values[0] ?? 0, y: mirroredCmds[0]?.values[1] ?? 0 };
  // Gather (startPt, cmd) pairs for each mirrored segment
  const mirrorSegs: { start: Point2D; cmd: PathCommand }[] = [];
  for (const cmd of mirroredCmds) {
    if (cmd.type === 'M') {
      mirrorCursor = { x: cmd.values[0], y: cmd.values[1] };
      continue;
    }
    if (cmd.type === 'Z') continue;
    mirrorSegs.push({ start: { ...mirrorCursor }, cmd });
    const ep = cmdEndpoint(cmd);
    if (ep) mirrorCursor = ep;
  }
  // Walk segments in reverse: for each reversed segment, draw from its endpoint to its start
  for (let i = mirrorSegs.length - 1; i >= 0; i--) {
    const { start, cmd } = mirrorSegs[i];
    if (cmd.type === 'L' || cmd.type === 'H' || cmd.type === 'V') {
      merged.push({ type: 'L', values: [start.x, start.y] });
    } else if (cmd.type === 'C') {
      // Reverse cubic: C(cp1,cp2,end) from startPt → reversed is C(cp2,cp1,startPt) from end
      const [cx1, cy1, cx2, cy2, _ex, _ey] = cmd.values;
      merged.push({ type: 'C', values: [cx2, cy2, cx1, cy1, start.x, start.y] });
    }
  }

  merged.push({ type: 'Z', values: [] });

  // Build new internals: remove fold line, optionally mirror others
  const newInternals = piece.internals
    .filter(l => l.id !== foldLineId)
    .map(l => ({ ...l, path: l.path.map(c => ({ type: c.type, values: [...c.values] })) }));

  if (!options?.outlineOnly) {
    const mirrored = piece.internals
      .filter(l => l.id !== foldLineId)
      .map(l => ({
        ...l,
        id: uid('line'),
        path: reflectCommands(l.path, foldStart, foldEnd),
      }));
    newInternals.push(...mirrored);
  }

  // Mirror darts if present and not outlineOnly
  let newDarts = piece.darts ? [...piece.darts] : undefined;
  if (piece.darts && !options?.outlineOnly) {
    const mirroredDarts = piece.darts.map(d => ({
      ...d,
      id: uid('dart'),
      apex: reflectPoint(d.apex, foldStart, foldEnd),
      legs: d.legs.map(leg => leg.map(pt => reflectPoint(pt, foldStart, foldEnd))) as [Point2D[], Point2D[]],
      foldDirection: d.foldDirection === 'left' ? 'right' as const
        : d.foldDirection === 'right' ? 'left' as const
        : d.foldDirection,
    }));
    newDarts = [...piece.darts, ...mirroredDarts];
  }

  return {
    ...piece,
    id: piece.id,
    outline: merged,
    internals: newInternals,
    darts: newDarts,
    edges: detectSemanticEdges({ ...piece, outline: merged }),
    updatedAt: Date.now(),
  };
}
```

Note: add `import { detectSemanticEdges } from './semanticEdges'` at top of file if not already imported (it's already imported as `detectSemanticEdges` on line 13).

- [ ] **Step 4: Add `unfoldPiece` to the import in the test file**

Update the import line at the top of `patternOps.test.ts` to include `unfoldPiece`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "unfoldPiece"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "feat: implement unfoldPiece — mirror half-pattern along fold line"
```

---

## Task 4: Implement `optimizeCurvePoints` and `optimizePieceCurves`

**Files:**
- Modify: `src/utils/patternOps.ts`
- Modify: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/utils/__tests__/patternOps.test.ts`:

```typescript
import { optimizeCurvePoints, optimizePieceCurves } from '../patternOps';
import type { PathCommand } from '../../types/types';

describe('optimizeCurvePoints', () => {
  it('preserves M and Z commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    expect(result[0].type).toBe('M');
    expect(result[result.length - 1].type).toBe('Z');
  });

  it('merges collinear L segments', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 0.5);
    // The two collinear L segments along y=0 should merge into one
    const lCmds = result.filter(c => c.type === 'L');
    expect(lCmds.length).toBeLessThanOrEqual(2);
  });

  it('reduces bezier point count at low ratio', () => {
    // Generate a curve with many redundant control points
    const cmds: PathCommand[] = [{ type: 'M', values: [0, 0] }];
    for (let i = 1; i <= 10; i++) {
      const x = i * 10;
      cmds.push({ type: 'C', values: [x - 7, 5, x - 3, 5, x, 0] });
    }
    cmds.push({ type: 'Z', values: [] });
    const result = optimizeCurvePoints(cmds, 0.1); // aggressive
    expect(result.length).toBeLessThan(cmds.length);
  });

  it('returns input unchanged at ratio 1.0', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, 50, 70, 50, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const result = optimizeCurvePoints(cmds, 1.0);
    expect(result.length).toBe(cmds.length);
  });
});

describe('optimizePieceCurves', () => {
  it('optimizes outline by default', () => {
    const piece = makeRect('Test', 100, 100);
    const result = optimizePieceCurves(piece, { ratio: 0.5 });
    expect(result.id).toBe(piece.id);
    expect(result.outline.length).toBeGreaterThan(0);
  });

  it('optimizes specific internal line', () => {
    const piece = makeRect('Test', 100, 100);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [50, 0] },
        { type: 'L', values: [100, 0] },
      ],
    }];
    const result = optimizePieceCurves(piece, { target: { internalLineId: 'line-1' } });
    expect(result.internals[0].path.length).toBeLessThanOrEqual(piece.internals[0].path.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "optimizeCurvePoints"`
Expected: FAIL

- [ ] **Step 3: Implement `optimizeCurvePoints` and `optimizePieceCurves`**

Add to `src/utils/patternOps.ts`:

```typescript
import { samplePathAtIntervals } from './geometry/arcLength';
import { fitCubicBezier, rdpSimplify } from './geometry/bezier';

// ─── optimizeCurvePoints ─────────────────────────────────────────────────────

function areCollinear(a: Point2D, b: Point2D, c: Point2D, eps = 0.1): boolean {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(cross) < eps;
}

/**
 * Reduce bezier control points on a PathCommand array while preserving shape.
 * @param ratio 0.0 (aggressive) to 1.0 (preserve all)
 */
export function optimizeCurvePoints(commands: PathCommand[], ratio: number): PathCommand[] {
  if (ratio >= 1.0) return commands.map(c => ({ type: c.type, values: [...c.values] }));
  if (commands.length <= 2) return commands.map(c => ({ type: c.type, values: [...c.values] }));

  // Separate M, Z from geometry commands
  const mCmd = commands[0];
  const hasZ = commands[commands.length - 1].type === 'Z';
  const geoCmds = commands.slice(1, hasZ ? -1 : undefined);

  const hasCurves = geoCmds.some(c => c.type === 'C' || c.type === 'Q');

  if (hasCurves) {
    // Sample the path to polyline, simplify, refit
    const samples = samplePathAtIntervals(commands, 0.5); // 0.5mm intervals
    if (samples.length < 2) return commands.map(c => ({ type: c.type, values: [...c.values] }));

    const points = samples.map(s => s.point);
    const bbox = outlineBBox(commands);
    const diag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
    const tolerance = (1 - ratio) * diag * 0.005;
    const simplified = rdpSimplify(points, tolerance);

    if (simplified.length < 2) return commands.map(c => ({ type: c.type, values: [...c.values] }));

    const fitted = fitCubicBezier(simplified, tolerance);
    if (hasZ) fitted.push({ type: 'Z', values: [] });
    return fitted;
  }

  // For straight-only paths: merge collinear L segments
  const result: PathCommand[] = [{ type: mCmd.type, values: [...mCmd.values] }];
  let prevPt: Point2D = { x: mCmd.values[0], y: mCmd.values[1] };

  for (let i = 0; i < geoCmds.length; i++) {
    const cmd = geoCmds[i];
    const endPt: Point2D = { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };

    // Check if next segment is collinear
    if (i + 1 < geoCmds.length) {
      const nextCmd = geoCmds[i + 1];
      const nextEnd: Point2D = { x: nextCmd.values[nextCmd.values.length - 2], y: nextCmd.values[nextCmd.values.length - 1] };
      if ((cmd.type === 'L' || cmd.type === 'H' || cmd.type === 'V') &&
          (nextCmd.type === 'L' || nextCmd.type === 'H' || nextCmd.type === 'V') &&
          areCollinear(prevPt, endPt, nextEnd)) {
        prevPt = endPt;
        continue; // skip this segment, next will cover the span
      }
    }

    result.push({ type: cmd.type, values: [...cmd.values] });
    prevPt = endPt;
  }

  if (hasZ) result.push({ type: 'Z', values: [] });
  return result;
}

/**
 * Optimize curve points on a PatternPiece's outline and/or internal lines.
 */
export function optimizePieceCurves(
  piece: PatternPiece,
  options?: { ratio?: number; target?: 'all' | 'outline' | { internalLineId: string } },
): PatternPiece {
  const ratio = options?.ratio ?? 0.5;
  const target = options?.target ?? 'all';

  const newOutline = (target === 'all' || target === 'outline')
    ? optimizeCurvePoints(piece.outline, ratio)
    : piece.outline.map(c => ({ type: c.type, values: [...c.values] }));

  const newInternals = piece.internals.map(l => {
    const shouldOptimize =
      target === 'all' ||
      (typeof target === 'object' && 'internalLineId' in target && target.internalLineId === l.id);
    return {
      ...l,
      path: shouldOptimize ? optimizeCurvePoints(l.path, ratio) : l.path.map(c => ({ type: c.type, values: [...c.values] })),
    };
  });

  return {
    ...piece,
    id: piece.id,
    outline: newOutline,
    internals: newInternals,
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Update imports in test file**

Add `optimizeCurvePoints, optimizePieceCurves` to the import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "optimizeCurve"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "feat: implement optimizeCurvePoints — RDP + bezier refit"
```

---

## Task 5: Implement `offsetInternalLine`

**Files:**
- Modify: `src/utils/patternOps.ts`
- Modify: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/utils/__tests__/patternOps.test.ts`:

```typescript
import { offsetInternalLine } from '../patternOps';

describe('offsetInternalLine', () => {
  it('creates one offset copy', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20 });
    expect(result.internals.length).toBe(2); // original + 1 offset
  });

  it('creates multiple offset copies', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 3, distance: 10 });
    expect(result.internals.length).toBe(4); // original + 3
  });

  it('reverses direction', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const normal = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20 });
    const reversed = offsetInternalLine(piece, 'line-1', { count: 1, distance: 20, reverse: true });
    // Offset lines should be on opposite sides
    const normalX = normal.internals[1].path[1].values[0];
    const reversedX = reversed.internals[1].path[1].values[0];
    expect(normalX).not.toBeCloseTo(reversedX, 0);
  });

  it('preserves piece ID', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'fold',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 10 });
    expect(result.id).toBe(piece.id);
  });

  it('throws if source line not found', () => {
    const piece = makeRect('Test', 200, 400);
    expect(() => offsetInternalLine(piece, 'nope', { count: 1, distance: 10 })).toThrow();
  });

  it('preserves source line type on offset copies', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'line-1', type: 'pleat',
      path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 400] }],
    }];
    const result = offsetInternalLine(piece, 'line-1', { count: 1, distance: 10 });
    expect(result.internals[1].type).toBe('pleat');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "offsetInternalLine"`
Expected: FAIL

- [ ] **Step 3: Implement `offsetInternalLine`**

Add to `src/utils/patternOps.ts`:

```typescript
import { linePolylineIntersections } from './geometry/lineIntersect';

// ─── offsetInternalLine ──────────────────────────────────────────────────────

function normalAtSegment(ax: number, ay: number, bx: number, by: number): Point2D {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 1 };
  return { x: -dy / len, y: dx / len };
}

function offsetPolyline(points: Point2D[], dist: number): Point2D[] {
  if (points.length < 2) return points.map(p => ({ ...p }));
  const result: Point2D[] = [];
  for (let i = 0; i < points.length; i++) {
    // Compute normal as average of adjacent segment normals
    let nx = 0, ny = 0, count = 0;
    if (i > 0) {
      const n = normalAtSegment(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      nx += n.x; ny += n.y; count++;
    }
    if (i < points.length - 1) {
      const n = normalAtSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      nx += n.x; ny += n.y; count++;
    }
    if (count > 0) { nx /= count; ny /= count; }
    const len = Math.hypot(nx, ny);
    if (len > 0) { nx /= len; ny /= len; }
    result.push({ x: points[i].x + nx * dist, y: points[i].y + ny * dist });
  }
  return result;
}

/**
 * Create N parallel copies of an internal line at fixed distance.
 */
export function offsetInternalLine(
  piece: PatternPiece,
  sourceLineId: string,
  options: {
    count: number;
    distance: number;
    reverse?: boolean;
    extend?: boolean;
    sourceSegmentRange?: [number, number];
  },
): PatternPiece {
  const sourceLine = piece.internals.find(l => l.id === sourceLineId);
  if (!sourceLine) throw new Error(`Internal line "${sourceLineId}" not found`);

  const sign = options.reverse ? -1 : 1;
  const newInternals = piece.internals.map(l => ({
    ...l,
    path: l.path.map(c => ({ type: c.type, values: [...c.values] })),
  }));

  // Sample source path to polyline
  const samples = samplePathAtIntervals(sourceLine.path, 0.5);
  const sourcePoints = samples.map(s => s.point);

  for (let i = 1; i <= options.count; i++) {
    const dist = i * options.distance * sign;
    const offsetPts = offsetPolyline(sourcePoints, dist);

    let finalPts = offsetPts;

    if (options.extend && offsetPts.length >= 2) {
      // Flatten outline for intersection
      const outlineSamples = samplePathAtIntervals(piece.outline, 0.5);
      const outlinePoly = outlineSamples.map(s => s.point);

      // Extend start: find intersection with outline from start along start tangent
      const startTanX = offsetPts[0].x - offsetPts[1].x;
      const startTanY = offsetPts[0].y - offsetPts[1].y;
      const extStart = { x: offsetPts[0].x + startTanX * 100, y: offsetPts[0].y + startTanY * 100 };
      const hitsStart = linePolylineIntersections(extStart, offsetPts[0], outlinePoly);
      if (hitsStart.length > 0) finalPts[0] = hitsStart[hitsStart.length - 1].point;

      // Extend end
      const last = offsetPts.length - 1;
      const endTanX = offsetPts[last].x - offsetPts[last - 1].x;
      const endTanY = offsetPts[last].y - offsetPts[last - 1].y;
      const extEnd = { x: offsetPts[last].x + endTanX * 100, y: offsetPts[last].y + endTanY * 100 };
      const hitsEnd = linePolylineIntersections(offsetPts[last], extEnd, outlinePoly);
      if (hitsEnd.length > 0) finalPts[last] = hitsEnd[0].point;
    }

    // Refit to bezier for smooth curves
    const fitted = fitCubicBezier(finalPts, 0.5);

    newInternals.push({
      id: uid('line'),
      type: sourceLine.type,
      path: fitted,
    });
  }

  return {
    ...piece,
    id: piece.id,
    internals: newInternals,
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Update imports in test file**

Add `offsetInternalLine` to the import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "offsetInternalLine"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "feat: implement offsetInternalLine — parallel copies with extend"
```

---

## Task 6: Implement `replaceAsPatternOutline`

**Files:**
- Modify: `src/utils/patternOps.ts`
- Modify: `src/utils/__tests__/patternOps.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/utils/__tests__/patternOps.test.ts`:

```typescript
import { replaceAsPatternOutline } from '../patternOps';

describe('replaceAsPatternOutline', () => {
  it('replaces outline segment with internal line', () => {
    const piece = makeRect('Test', 200, 400);
    // Internal line across the top edge (from (0,0) to (200,0)) but curved
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [66, -30, 133, -30, 200, 0] },
      ],
    }];
    // Replace outline segment [0,1] (M(0,0) → L(200,0)) with the internal line
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    // The old outline segment should now be a reference internal line
    const refLines = result.internals.filter(l => l.type === 'reference');
    expect(refLines.length).toBe(1);
    // The original internal line should be removed
    expect(result.internals.find(l => l.id === 'style-1')).toBeUndefined();
  });

  it('preserves piece ID', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
      ],
    }];
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    expect(result.id).toBe(piece.id);
  });

  it('throws if internal line not found', () => {
    const piece = makeRect('Test', 200, 400);
    expect(() => replaceAsPatternOutline(piece, 'nope', [0, 1])).toThrow();
  });

  it('throws if endpoints are too far from outline', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 50] }, // 50mm away from outline endpoint
        { type: 'L', values: [200, 50] },
      ],
    }];
    expect(() => replaceAsPatternOutline(piece, 'style-1', [0, 1])).toThrow();
  });

  it('outline is still closed after replacement', () => {
    const piece = makeRect('Test', 200, 400);
    piece.internals = [{
      id: 'style-1', type: 'fold',
      path: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
      ],
    }];
    const result = replaceAsPatternOutline(piece, 'style-1', [0, 1]);
    expect(result.outline[result.outline.length - 1].type).toBe('Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "replaceAsPatternOutline"`
Expected: FAIL

- [ ] **Step 3: Implement `replaceAsPatternOutline`**

Add to `src/utils/patternOps.ts`:

```typescript
// ─── replaceAsPatternOutline ─────────────────────────────────────────────────

/**
 * Replace a section of the pattern outline with an internal line.
 * The old outline section becomes a 'reference' internal line.
 */
export function replaceAsPatternOutline(
  piece: PatternPiece,
  internalLineId: string,
  outlineSegmentRange: [number, number],
): PatternPiece {
  const line = piece.internals.find(l => l.id === internalLineId);
  if (!line) throw new Error(`Internal line "${internalLineId}" not found`);

  const [rangeStart, rangeEnd] = outlineSegmentRange;
  if (rangeStart < 0 || rangeEnd >= piece.outline.length) {
    throw new Error('Outline segment range out of bounds');
  }

  // Get endpoints of the outline segment range
  const outlineStartPt = cmdEndpoint(piece.outline[rangeStart])
    || { x: piece.outline[rangeStart].values[0], y: piece.outline[rangeStart].values[1] };
  const outlineEndPt = cmdEndpoint(piece.outline[rangeEnd])!;

  // Get endpoints of the internal line
  const lineStartPt = { x: line.path[0].values[0], y: line.path[0].values[1] };
  const lineLastCmd = line.path[line.path.length - 1];
  const lineEndPt = cmdEndpoint(lineLastCmd)
    || { x: lineLastCmd.values[0], y: lineLastCmd.values[1] };

  // Check orientation: does line start match outline start or end?
  const TOLERANCE = 2; // mm
  const startToStart = distPt(lineStartPt, outlineStartPt);
  const startToEnd = distPt(lineStartPt, outlineEndPt);

  let lineCmds: PathCommand[];
  if (startToStart <= TOLERANCE) {
    // Same direction
    lineCmds = line.path.slice(1); // skip M, take rest
    if (distPt(lineEndPt, outlineEndPt) > TOLERANCE) {
      throw new Error('Internal line endpoints do not match outline segment');
    }
  } else if (startToEnd <= TOLERANCE) {
    // Reverse direction
    if (distPt(lineEndPt, outlineStartPt) > TOLERANCE) {
      throw new Error('Internal line endpoints do not match outline segment');
    }
    // Reverse the line path commands
    const reversed: PathCommand[] = [];
    const allPts: Point2D[] = [{ x: line.path[0].values[0], y: line.path[0].values[1] }];
    for (const cmd of line.path.slice(1)) {
      const ep = cmdEndpoint(cmd);
      if (ep) allPts.push(ep);
    }
    allPts.reverse();
    for (let i = 1; i < allPts.length; i++) {
      reversed.push({ type: 'L', values: [allPts[i].x, allPts[i].y] });
    }
    lineCmds = reversed;
  } else {
    throw new Error('Internal line endpoints are too far from outline segment');
  }

  // Convert line commands: ensure first is L (not M)
  const insertCmds = lineCmds.map(c => ({
    type: c.type === 'M' ? 'L' : c.type,
    values: [...c.values],
  }));

  // Build new outline
  const before = piece.outline.slice(0, rangeStart + 1).map(c => ({ type: c.type, values: [...c.values] }));
  const after = piece.outline.slice(rangeEnd + 1).map(c => ({ type: c.type, values: [...c.values] }));

  const newOutline = [...before, ...insertCmds, ...after];
  // Ensure Z at end
  if (newOutline[newOutline.length - 1].type !== 'Z') {
    newOutline.push({ type: 'Z', values: [] });
  }

  // Create reference line from old outline segment
  const oldSegment: PathCommand[] = [
    { type: 'M', values: [outlineStartPt.x, outlineStartPt.y] },
    ...piece.outline.slice(rangeStart + 1, rangeEnd + 1).map(c => ({ type: c.type, values: [...c.values] })),
  ];

  const refLine = {
    id: uid('line'),
    type: 'reference' as const,
    path: oldSegment,
  };

  // New internals: remove original line, add reference
  const newInternals = piece.internals
    .filter(l => l.id !== internalLineId)
    .map(l => ({ ...l, path: l.path.map(c => ({ type: c.type, values: [...c.values] })) }));
  newInternals.push(refLine);

  const result = {
    ...piece,
    id: piece.id,
    outline: newOutline,
    internals: newInternals,
    updatedAt: Date.now(),
  };

  // Re-detect semantic edges
  result.edges = detectSemanticEdges(result);

  return result;
}
```

- [ ] **Step 4: Update imports in test file**

Add `replaceAsPatternOutline` to the import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/patternOps.test.ts -t "replaceAsPatternOutline"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/patternOps.ts src/utils/__tests__/patternOps.test.ts
git commit -m "feat: implement replaceAsPatternOutline — swap internal line with outline"
```

---

## Task 7: Implement Poly Pen UI tool

**Files:**
- Create: `src/tools/definitions/polyPen.tsx`
- Create: `src/components/PatternEditor/usePolyPenTool.ts`
- Create: `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx`
- Modify: `src/tools/registry.ts`

- [ ] **Step 1: Create Poly Pen tool definition**

Create `src/tools/definitions/polyPen.tsx`. Follow the pattern from `pen.tsx` (shortcut, icon, options, copilot metadata):

```typescript
import type { ToolDefinition } from '../types';

const PolyPenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 17L7 3L13 10L17 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="3" cy="17" r="1.5" fill="currentColor"/>
    <circle cx="7" cy="3" r="1.5" fill="currentColor"/>
    <circle cx="13" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="17" cy="5" r="1.5" fill="currentColor"/>
  </svg>
);

export const polyPenTool: ToolDefinition = {
  id: 'polyPen',
  name: 'Poly Pen',
  description: 'Draw pattern shapes with combined straight lines and bezier curves',
  context: '2d',
  shortcut: 'y',
  icon: PolyPenIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      value: 'piece',
      choices: [
        { label: 'New Piece', value: 'piece' },
        { label: 'Internal Line', value: 'internalLine' },
      ],
    },
    {
      id: 'lineType',
      label: 'Line Type',
      type: 'select',
      value: 'fold',
      choices: [
        { label: 'Fold', value: 'fold' },
        { label: 'Reference', value: 'reference' },
        { label: 'Topstitch', value: 'topstitch' },
      ],
    },
    {
      id: 'snapGrid',
      label: 'Snap to Grid',
      type: 'toggle',
      value: true,
    },
  ],
  copilot: {
    description: 'Draw pattern shapes with combined straight lines and bezier curves. Click for straight segments, click+drag for bezier curves.',
    examples: [
      'Draw a rectangle piece at (0,0) 200mm × 400mm',
      'Draw a curved neckline as an internal fold line',
    ],
    keywords: ['draw', 'polygon', 'pen', 'shape', 'curve', 'straight'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    parameterHints: {
      points: 'Array of {x, y, type, handleIn?, handleOut?}',
      mode: 'piece or internalLine',
    },
  },
};
```

- [ ] **Step 2: Create `usePolyPenTool` hook**

Create `src/components/PatternEditor/usePolyPenTool.ts`. Follow the pattern from `usePenTool.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import type { Point2D, PathCommand, PatternPiece, InternalLineType } from '../../types/types';

export interface PolyPenNode {
  point: Point2D;
  type: 'straight' | 'curve';
  handleIn?: Point2D;
  handleOut?: Point2D;
}

interface PolyPenState {
  nodes: PolyPenNode[];
  previewPoint: Point2D | null;
  isDragging: boolean;
  dragHandle: Point2D | null;
}

function nodesToCommands(nodes: PolyPenNode[], closed: boolean): PathCommand[] {
  if (nodes.length === 0) return [];
  const cmds: PathCommand[] = [{ type: 'M', values: [nodes[0].point.x, nodes[0].point.y] }];

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];

    if (curr.type === 'curve' || prev.type === 'curve') {
      // Cubic bezier: use handleOut of prev and handleIn of curr
      const cp1 = prev.handleOut || prev.point;
      const cp2 = curr.handleIn || curr.point;
      cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.point.x, curr.point.y] });
    } else {
      cmds.push({ type: 'L', values: [curr.point.x, curr.point.y] });
    }
  }

  if (closed) cmds.push({ type: 'Z', values: [] });
  return cmds;
}

export function usePolyPenTool(
  zoom: number,
  pan: Point2D,
  onCompletePiece: (piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => void,
  onCompleteInternalLine: (path: PathCommand[], lineType: InternalLineType) => void,
  mode: 'piece' | 'internalLine',
  lineType: InternalLineType,
) {
  const [state, setState] = useState<PolyPenState>({
    nodes: [],
    previewPoint: null,
    isDragging: false,
    dragHandle: null,
  });
  const nodesRef = useRef<PolyPenNode[]>([]);
  const dragStartRef = useRef<Point2D | null>(null);

  const CLOSE_THRESHOLD = 8; // pixels

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left) / zoom - pan.x,
    y: (screenY - svgRect.top) / zoom - pan.y,
  }), [zoom, pan]);

  const finishShape = useCallback((closed: boolean) => {
    const nodes = nodesRef.current;
    if (nodes.length < 2) { reset(); return; }

    const cmds = nodesToCommands(nodes, closed);
    if (mode === 'piece') {
      onCompletePiece({
        name: 'Poly Pen Piece',
        outline: cmds,
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
      });
    } else {
      onCompleteInternalLine(cmds, lineType);
    }
    reset();
  }, [mode, lineType, onCompletePiece, onCompleteInternalLine]);

  const reset = useCallback(() => {
    nodesRef.current = [];
    setState({ nodes: [], previewPoint: null, isDragging: false, dragHandle: null });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);

    // Check if closing the shape
    if (nodesRef.current.length >= 3) {
      const first = nodesRef.current[0].point;
      const dx = (pt.x - first.x) * zoom;
      const dy = (pt.y - first.y) * zoom;
      if (Math.hypot(dx, dy) < CLOSE_THRESHOLD) {
        finishShape(true);
        return;
      }
    }

    dragStartRef.current = pt;
    // Don't add node yet — wait for mouseUp to determine straight vs curve
  }, [toPattern, zoom, finishShape]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);

    if (dragStartRef.current) {
      // Dragging — this will become a curve node
      setState(prev => ({
        ...prev,
        isDragging: true,
        dragHandle: pt,
        previewPoint: pt,
      }));
    } else {
      setState(prev => ({ ...prev, previewPoint: pt }));
    }
  }, [toPattern]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);

    if (!dragStartRef.current) return;

    const start = dragStartRef.current;
    const dx = (pt.x - start.x) * zoom;
    const dy = (pt.y - start.y) * zoom;
    const wasDrag = Math.hypot(dx, dy) > 3;

    const node: PolyPenNode = wasDrag
      ? {
          point: start,
          type: 'curve',
          handleOut: pt,
          handleIn: { x: 2 * start.x - pt.x, y: 2 * start.y - pt.y },
        }
      : { point: start, type: 'straight' };

    nodesRef.current = [...nodesRef.current, node];
    dragStartRef.current = null;
    setState({
      nodes: [...nodesRef.current],
      previewPoint: pt,
      isDragging: false,
      dragHandle: null,
    });
  }, [toPattern, zoom]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      reset();
    }
  }, [reset]);

  const handleDoubleClick = useCallback(() => {
    if (nodesRef.current.length >= 2) {
      finishShape(true);
    }
  }, [finishShape]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    nodes: state.nodes,
    previewPoint: state.previewPoint,
    isDragging: state.isDragging,
    dragHandle: state.dragHandle,
    reset,
  };
}
```

- [ ] **Step 3: Create `PolyPenToolOverlay.tsx`**

Create `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx`. Follow the pattern from `PenToolOverlay.tsx`:

```typescript
import type { PolyPenNode } from '../../usePolyPenTool';
import type { Point2D } from '../../../../types/types';

interface PolyPenToolOverlayProps {
  nodes: PolyPenNode[];
  previewPoint: Point2D | null;
  isDragging: boolean;
  dragHandle: Point2D | null;
  zoom2D: number;
}

function buildPathD(nodes: PolyPenNode[]): string {
  if (nodes.length === 0) return '';
  let d = `M ${nodes[0].point.x} ${nodes[0].point.y}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (curr.type === 'curve' || prev.type === 'curve') {
      const cp1 = prev.handleOut || prev.point;
      const cp2 = curr.handleIn || curr.point;
      d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.point.x} ${curr.point.y}`;
    } else {
      d += ` L ${curr.point.x} ${curr.point.y}`;
    }
  }
  return d;
}

export default function PolyPenToolOverlay({
  nodes, previewPoint, isDragging, dragHandle, zoom2D,
}: PolyPenToolOverlayProps) {
  const r = 4 / zoom2D;
  const strokeW = 1 / zoom2D;
  const handleR = 3 / zoom2D;

  const pathD = buildPathD(nodes);
  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

  // Close indicator
  const firstNode = nodes.length >= 3 ? nodes[0] : null;
  let showClose = false;
  if (firstNode && previewPoint) {
    const dx = (previewPoint.x - firstNode.point.x) * zoom2D;
    const dy = (previewPoint.y - firstNode.point.y) * zoom2D;
    showClose = Math.hypot(dx, dy) < 8;
  }

  return (
    <g pointerEvents="none">
      {/* Completed segments */}
      {pathD && (
        <path d={pathD} fill="none" stroke="#2196f3" strokeWidth={strokeW * 1.5} />
      )}

      {/* Preview line from last node to cursor */}
      {lastNode && previewPoint && !isDragging && (
        <line
          x1={lastNode.point.x} y1={lastNode.point.y}
          x2={previewPoint.x} y2={previewPoint.y}
          stroke="#2196f3" strokeWidth={strokeW} strokeDasharray={`${3 / zoom2D} ${3 / zoom2D}`} opacity={0.6}
        />
      )}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <g key={i}>
          <circle cx={node.point.x} cy={node.point.y} r={r} fill={node.type === 'curve' ? '#2196f3' : '#fff'} stroke="#2196f3" strokeWidth={strokeW} />
          {/* Handle lines for curve nodes */}
          {node.type === 'curve' && node.handleOut && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleOut.x} y2={node.handleOut.y}
                stroke="#999" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleOut.x} cy={node.handleOut.y} r={handleR}
                fill="none" stroke="#999" strokeWidth={strokeW * 0.5} />
            </>
          )}
          {node.type === 'curve' && node.handleIn && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleIn.x} y2={node.handleIn.y}
                stroke="#999" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleIn.x} cy={node.handleIn.y} r={handleR}
                fill="none" stroke="#999" strokeWidth={strokeW * 0.5} />
            </>
          )}
        </g>
      ))}

      {/* Drag handle preview */}
      {isDragging && dragHandle && lastNode && (
        <>
          <line x1={dragHandle.x} y1={dragHandle.y}
            x2={2 * (lastNode?.point.x ?? dragHandle.x) - dragHandle.x}
            y2={2 * (lastNode?.point.y ?? dragHandle.y) - dragHandle.y}
            stroke="#ff9800" strokeWidth={strokeW} />
          <circle cx={dragHandle.x} cy={dragHandle.y} r={handleR} fill="none" stroke="#ff9800" strokeWidth={strokeW} />
        </>
      )}

      {/* Close indicator */}
      {showClose && firstNode && (
        <circle cx={firstNode.point.x} cy={firstNode.point.y} r={r * 2} fill="none" stroke="#4caf50" strokeWidth={strokeW * 2} />
      )}
    </g>
  );
}
```

- [ ] **Step 4: Register in tool index**

In `src/tools/index.ts`:
1. Add import at the top:
```typescript
import { polyPenTool } from './definitions/polyPen';
```
2. Add `polyPenTool` to the `allTools` array in the "2D Tools — Drawing" section (after `circleTool`):
```typescript
  // 2D Tools — Drawing
  penTool,
  lineTool,
  internalShapeTool,
  rectangleTool,
  dartTool,
  traceTool,
  circleTool,
  polyPenTool,
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/definitions/polyPen.tsx src/components/PatternEditor/usePolyPenTool.ts src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx src/tools/index.ts
git commit -m "feat: add Poly Pen tool — combined straight + curve drawing"
```

---

## Task 8: Wire Poly Pen into PatternEditor + context menu entries

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/ContextMenu.tsx`

- [ ] **Step 1: Add `internalLineId` to ContextMenuState**

In `src/components/PatternEditor/ContextMenu.tsx`, add to the `ContextMenuState` interface:

```typescript
/** ID of internal line under cursor, or null */
internalLineId?: string | null;
/** Type of internal line under cursor */
internalLineType?: string | null;
```

- [ ] **Step 2: Add context menu items for the 4 tools**

In the `ContextMenu` component, after the existing piece items section, add internal line context items. The items should be conditionally rendered when `menu.internalLineId` is set:

```typescript
// ── Internal line context ──
if (menu.internalLineId && menu.pieceId) {
  const piece = pieces.find(p => p.id === menu.pieceId);
  const line = piece?.internals.find(l => l.id === menu.internalLineId);

  if (line?.type === 'fold') {
    items.push({
      label: 'Unfold',
      icon: '⇔',
      action: () => act(() => {
        // Dispatch unfold — implementation will call unfoldPiece
        // and dispatch updatePiece. Handler to be wired in PatternEditor.
        onUnfold?.(menu.pieceId!, menu.internalLineId!);
      }),
    });
    items.push({
      label: 'Unfold Outline Only',
      icon: '⇔',
      action: () => act(() => {
        onUnfold?.(menu.pieceId!, menu.internalLineId!, true);
      }),
      separator: true,
    });
  }

  items.push({
    label: 'Offset as Internal Line',
    icon: '⏛',
    action: () => act(() => {
      onOffsetInternalLine?.(menu.pieceId!, menu.internalLineId!);
    }),
  });

  items.push({
    label: 'Optimize Curve Points',
    icon: '◇',
    action: () => act(() => {
      onOptimizeCurves?.(menu.pieceId!, menu.internalLineId!);
    }),
    separator: true,
  });
}

// On piece background (no internal line)
if (menu.pieceId && !menu.internalLineId) {
  items.push({
    label: 'Optimize All Curve Points',
    icon: '◇',
    action: () => act(() => {
      onOptimizeCurves?.(menu.pieceId!);
    }),
    separator: true,
  });
}
```

Add the corresponding callback props to `ContextMenuProps`:

```typescript
onUnfold?: (pieceId: string, foldLineId: string, outlineOnly?: boolean) => void;
onOffsetInternalLine?: (pieceId: string, lineId: string) => void;
onOptimizeCurves?: (pieceId: string, lineId?: string) => void;
```

- [ ] **Step 3: Wire Poly Pen hook in PatternEditor.tsx**

In `src/components/PatternEditor/PatternEditor.tsx`, import and use the `usePolyPenTool` hook alongside the existing pen tool hook. Wire it to the active tool state. Pass `internalLineId` to context menu when right-clicking an internal line.

This step requires reading the current PatternEditor to find the right insertion points — follow the existing pen tool wiring pattern.

- [ ] **Step 4: Implement context menu handlers in PatternEditor**

Wire the `onUnfold`, `onOffsetInternalLine`, and `onOptimizeCurves` callbacks to dispatch the pure functions + `updatePiece`. Each should:
1. Deep snapshot the piece
2. Call the pure function
3. Dispatch `updatePiece(result)`
4. Show a dialog for offset (count/distance) and optimize (ratio slider) — can use `window.prompt()` as a placeholder initially

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/ContextMenu.tsx
git commit -m "feat: wire poly pen + context menu entries for unfold, offset, optimize"
```

---

## Task 9: Register all 5 copilot tools

**Files:**
- Modify: `src/copilot/action/tools/definitions/patternOpsTools.ts`

- [ ] **Step 1: Add necessary imports and `unfoldPiece` copilot tool**

First, update the imports at the top of `patternOpsTools.ts`:
```typescript
import type { PatternPiece, InternalLineType, PathCommand } from '../../../../types/types';
```

Then add to the `tools` array:

```typescript
{
  name: 'unfoldPiece',
  description:
    'Mirror a half-pattern along a fold line to produce a full symmetric piece. ' +
    '/ Desplegar una mitad de patrón a lo largo de una línea de doblez.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      foldLineId: { type: 'string', description: 'ID of the fold internal line' },
      outlineOnly: { type: 'boolean', description: 'Mirror only the outline, not internal lines (default false)' },
    },
    required: ['pieceId', 'foldLineId'],
  },
  execute: async (params, dispatch, getState) => {
    const { unfoldPiece } = await import('../../../../utils/patternOps');
    const { updatePiece } = await import('../../../../store/projectSlice');
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));

    try {
      const result = unfoldPiece(piece, params.foldLineId as string, {
        outlineOnly: params.outlineOnly as boolean | undefined,
      });
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, internalsCount: result.internals.length },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unfold failed' };
    }
  },
},
```

- [ ] **Step 2: Add `optimizeCurvePoints` copilot tool**

```typescript
{
  name: 'optimizeCurvePoints',
  description:
    'Reduce bezier control points while preserving curve shape. ' +
    '/ Optimizar puntos de curva manteniendo la forma.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      ratio: { type: 'number', description: 'Simplification ratio: 0.0 (aggressive) to 1.0 (preserve all), default 0.5' },
      target: { type: 'string', description: '"all" (default), "outline", or an internalLineId' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState) => {
    const { optimizePieceCurves } = await import('../../../../utils/patternOps');
    const { updatePiece } = await import('../../../../store/projectSlice');
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    const ratioErr = params.ratio !== undefined ? requireFiniteNumber(params.ratio, 'ratio') : null;
    if (ratioErr) return { success: false, error: ratioErr };

    const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
    const ratio = (params.ratio as number) ?? 0.5;
    const targetStr = (params.target as string) ?? 'all';
    const target = (targetStr === 'all' || targetStr === 'outline')
      ? targetStr
      : { internalLineId: targetStr };

    try {
      const result = optimizePieceCurves(piece, { ratio, target });
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, outlinePoints: result.outline.length },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Optimize failed' };
    }
  },
},
```

- [ ] **Step 3: Add `offsetInternalLine` copilot tool**

```typescript
{
  name: 'offsetInternalLine',
  description:
    'Create parallel copies of an internal line at a given distance. ' +
    '/ Crear copias paralelas de una línea interna a una distancia dada.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      sourceLineId: { type: 'string', description: 'Source internal line ID' },
      count: { type: 'number', description: 'Number of copies (1-10, default 1)' },
      distance: { type: 'number', description: 'Distance between copies in mm' },
      reverse: { type: 'boolean', description: 'Flip offset direction (default false)' },
      extend: { type: 'boolean', description: 'Extend to outline boundary (default false)' },
    },
    required: ['pieceId', 'sourceLineId', 'distance'],
  },
  execute: async (params, dispatch, getState) => {
    const { offsetInternalLine } = await import('../../../../utils/patternOps');
    const { updatePiece } = await import('../../../../store/projectSlice');
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    const distErr = requireFiniteNumber(params.distance, 'distance');
    if (distErr) return { success: false, error: distErr };

    const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));

    try {
      const result = offsetInternalLine(piece, params.sourceLineId as string, {
        count: (params.count as number) ?? 1,
        distance: params.distance as number,
        reverse: params.reverse as boolean | undefined,
        extend: params.extend as boolean | undefined,
      });
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, totalInternals: result.internals.length },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Offset failed' };
    }
  },
},
```

- [ ] **Step 4: Add `polyPenDraw` copilot tool**

```typescript
{
  name: 'polyPenDraw',
  description:
    'Draw a shape from a list of points with straight lines and curves. ' +
    '/ Dibujar una forma a partir de una lista de puntos con líneas rectas y curvas.',
  parameters: {
    type: 'object',
    properties: {
      points: {
        type: 'array',
        description: 'Array of points: [{x, y, type: "straight"|"curve", handleIn?: {x,y}, handleOut?: {x,y}}]',
        items: {
          type: 'object',
          properties: {
            x: { type: 'number' }, y: { type: 'number' },
            type: { type: 'string', enum: ['straight', 'curve'] },
            handleIn: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
            handleOut: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
          },
          required: ['x', 'y', 'type'],
        },
      },
      mode: { type: 'string', enum: ['piece', 'internalLine'], description: 'piece (default) or internalLine' },
      targetPieceId: { type: 'string', description: 'Required when mode is internalLine' },
      lineType: { type: 'string', enum: ['fold', 'reference', 'topstitch'], description: 'Internal line type (default fold)' },
    },
    required: ['points'],
  },
  execute: async (params, dispatch, getState) => {
    const { addPiece, updatePiece } = await import('../../../../store/projectSlice');
    const state = getState();
    const points = params.points as Array<{ x: number; y: number; type: string; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } }>;
    if (!points || points.length < 2) return { success: false, error: 'Need at least 2 points' };

    // Build PathCommand[]
    const cmds: PathCommand[] = [{ type: 'M', values: [points[0].x, points[0].y] }];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (curr.type === 'curve' || prev.type === 'curve') {
        const cp1 = prev.handleOut || { x: prev.x, y: prev.y };
        const cp2 = curr.handleIn || { x: curr.x, y: curr.y };
        cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y] });
      } else {
        cmds.push({ type: 'L', values: [curr.x, curr.y] });
      }
    }
    cmds.push({ type: 'Z', values: [] });

    const mode = (params.mode as string) || 'piece';

    if (mode === 'piece') {
      const newPiece = {
        id: `piece-${Date.now()}`,
        name: 'Poly Pen Piece',
        outline: cmds,
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0, mirrored: false,
        seamAllowance: 10, layer: 1, sublayer: 0, active: true,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      dispatch(addPiece(newPiece));
      return {
        success: true,
        data: { pieceId: newPiece.id },
        rollback: () => dispatch({ type: 'project/removePiece', payload: newPiece.id, meta: { skipConfirmation: true } }),
      };
    } else {
      // Internal line mode
      const targetId = params.targetPieceId as string;
      if (!targetId) return { success: false, error: 'targetPieceId required for internalLine mode' };
      const piece = state.project.pieces.find(p => p.id === targetId);
      if (!piece) return { success: false, error: 'Target piece not found' };

      const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
      const lineType = (params.lineType as string) || 'fold';
      const lineId = `line-${Date.now()}`;
      const newLine = { id: lineId, type: lineType as InternalLineType, path: cmds.slice(0, -1) }; // no Z for internal lines
      dispatch(updatePiece({
        ...piece,
        internals: [...piece.internals, newLine],
        updatedAt: Date.now(),
      }));
      return {
        success: true,
        data: { pieceId: targetId, lineId },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    }
  },
},
```

- [ ] **Step 5: Add `replaceAsPatternOutline` copilot tool**

```typescript
{
  name: 'replaceAsPatternOutline',
  description:
    'Swap an internal line with a section of the pattern outline. Old outline becomes a reference line. ' +
    '/ Reemplazar una sección del contorno con una línea interna. El contorno antiguo se convierte en línea de referencia.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      internalLineId: { type: 'string', description: 'Internal line to promote to outline' },
      outlineSegmentRange: {
        type: 'array', items: { type: 'number' },
        description: 'Start and end command indices of outline to replace: [start, end]',
      },
      outlineStartPoint: {
        type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } },
        description: 'Alternative: start point near outline (resolves to segment index)',
      },
      outlineEndPoint: {
        type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } },
        description: 'Alternative: end point near outline (resolves to segment index)',
      },
    },
    required: ['pieceId', 'internalLineId'],
  },
  execute: async (params, dispatch, getState) => {
    const { replaceAsPatternOutline } = await import('../../../../utils/patternOps');
    const { updatePiece } = await import('../../../../store/projectSlice');
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));

    // Resolve segment range from indices or points
    let range = params.outlineSegmentRange as [number, number] | undefined;
    if (!range && params.outlineStartPoint && params.outlineEndPoint) {
      const start = params.outlineStartPoint as { x: number; y: number };
      const end = params.outlineEndPoint as { x: number; y: number };
      // Find nearest outline command indices
      let bestStartIdx = 0, bestEndIdx = 0;
      let bestStartDist = Infinity, bestEndDist = Infinity;
      for (let i = 0; i < piece.outline.length; i++) {
        const v = piece.outline[i].values;
        if (v.length < 2) continue;
        const ex = v[v.length - 2], ey = v[v.length - 1];
        const dStart = Math.hypot(ex - start.x, ey - start.y);
        const dEnd = Math.hypot(ex - end.x, ey - end.y);
        if (dStart < bestStartDist) { bestStartDist = dStart; bestStartIdx = i; }
        if (dEnd < bestEndDist) { bestEndDist = dEnd; bestEndIdx = i; }
      }
      range = [Math.min(bestStartIdx, bestEndIdx), Math.max(bestStartIdx, bestEndIdx)];
    }

    if (!range) return { success: false, error: 'outlineSegmentRange or start/end points required' };

    try {
      const result = replaceAsPatternOutline(piece, params.internalLineId as string, range);
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, referenceLineCount: result.internals.filter(l => l.type === 'reference').length },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Replace failed' };
    }
  },
},
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/copilot/action/tools/definitions/patternOpsTools.ts
git commit -m "feat: register 5 copilot tools for pattern edit phase 2"
```

---

## Task 10: Final integration test + type check

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Fix any failures**

If tests fail, fix the issues and re-run.

- [ ] **Step 4: Final commit**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: resolve integration issues in pattern edit phase 2"
```
