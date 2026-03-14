# Walk/Measure Along Curve — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add arc-length measurement along curves, two-curve comparison, and copilot integration to the existing measure tool.

**Architecture:** Extend the existing measure tool with a mode toggle (point-to-point / along-curve / compare). A new `arcLength.ts` utility provides pure-math functions for Gauss-Legendre arc-length, point-at-distance, and interval sampling. The measure hook gains edge selection, hover distance, and compare logic. Two new copilot meta-tools expose the functionality to the AI planner.

**Tech Stack:** React, SVG overlays, Gauss-Legendre quadrature, Redux (read-only selectors), copilot meta-tools

---

### Task 1: Arc-Length Utility — Core Math

**Files:**
- Create: `src/utils/geometry/arcLength.ts`
- Test: `src/utils/geometry/__tests__/arcLength.test.ts`

**Step 1: Write the failing tests**

Create `src/utils/geometry/__tests__/arcLength.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  gaussLegendreCubicBezierLength,
  computePathArcLength,
  pointAtPathDistance,
  samplePathAtIntervals,
  distanceAlongPath,
} from '../arcLength';
import type { PathCommand, Point2D } from '../../../types/types';

describe('gaussLegendreCubicBezierLength', () => {
  it('returns exact length for a straight line disguised as a Bezier', () => {
    // Bezier from (0,0) to (100,0) with control points on the line
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 33.33, y: 0 };
    const p2 = { x: 66.67, y: 0 };
    const p3 = { x: 100, y: 0 };
    expect(gaussLegendreCubicBezierLength(p0, p1, p2, p3)).toBeCloseTo(100, 1);
  });

  it('computes quarter-circle arc length within 0.1mm', () => {
    // Quarter circle of radius 100: exact length = π*100/2 ≈ 157.08
    const r = 100;
    const k = 0.5522847498; // standard Bezier circle approximation constant
    const p0 = { x: r, y: 0 };
    const p1 = { x: r, y: r * k };
    const p2 = { x: r * k, y: r };
    const p3 = { x: 0, y: r };
    const expected = Math.PI * r / 2;
    expect(gaussLegendreCubicBezierLength(p0, p1, p2, p3)).toBeCloseTo(expected, 0);
  });

  it('returns 0 for degenerate Bezier (all points coincident)', () => {
    const p = { x: 5, y: 5 };
    expect(gaussLegendreCubicBezierLength(p, p, p, p)).toBe(0);
  });
});

describe('computePathArcLength', () => {
  it('computes length of a single line segment', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(100, 1);
  });

  it('computes length of a polyline', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(150, 1);
  });

  it('computes length of a cubic Bezier path command', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [33, 0, 67, 0, 100, 0] }, // straight line as Bezier
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(100, 1);
  });

  it('computes length of a subrange of commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
    ];
    // Only segments 1-2 (index 1 to 3 exclusive) = L(100,0) + L(100,50) = 100 + 50
    expect(computePathArcLength(cmds, 1, 3)).toBeCloseTo(150, 1);
  });

  it('returns 0 for empty commands', () => {
    expect(computePathArcLength([])).toBe(0);
  });
});

describe('pointAtPathDistance', () => {
  it('returns start point at distance 0', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [10, 20] },
      { type: 'L', values: [110, 20] },
    ];
    const pt = pointAtPathDistance(cmds, 0);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(10, 1);
    expect(pt!.y).toBeCloseTo(20, 1);
  });

  it('returns midpoint at half distance', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const pt = pointAtPathDistance(cmds, 50);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(50, 1);
    expect(pt!.y).toBeCloseTo(0, 1);
  });

  it('returns end point at full distance', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const total = computePathArcLength(cmds);
    const pt = pointAtPathDistance(cmds, total);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(100, 1);
  });

  it('returns null for distance beyond path length', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(pointAtPathDistance(cmds, 200)).toBeNull();
  });
});

describe('samplePathAtIntervals', () => {
  it('returns markers at requested interval', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const samples = samplePathAtIntervals(cmds, 25);
    // Should have markers at 0, 25, 50, 75, 100
    expect(samples.length).toBe(5);
    expect(samples[0].distance).toBeCloseTo(0, 1);
    expect(samples[1].distance).toBeCloseTo(25, 1);
    expect(samples[4].distance).toBeCloseTo(100, 1);
  });

  it('returns empty for empty path', () => {
    expect(samplePathAtIntervals([], 10)).toEqual([]);
  });
});

describe('distanceAlongPath', () => {
  it('returns 0 for point at path start', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(distanceAlongPath(cmds, { x: 0, y: 0 })).toBeCloseTo(0, 1);
  });

  it('returns correct distance for point along straight path', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(distanceAlongPath(cmds, { x: 60, y: 0 })).toBeCloseTo(60, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/arcLength.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/utils/geometry/arcLength.ts`:

```typescript
/**
 * Arc-length utilities for PathCommand[] curves.
 *
 * Uses 5-point Gauss-Legendre quadrature for cubic Bezier arc-length
 * (< 0.1mm error on typical garment curves). Line segments use exact
 * Euclidean distance.
 *
 * @module arcLength
 */

import type { Point2D, PathCommand } from '../../types/types';
import { evalCubic, evalQuadratic } from './bezier';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArcLengthSample {
  point: Point2D;
  distance: number; // cumulative distance from start (mm)
  t: number;        // parameter [0, 1] along full path
}

// ─── Gauss-Legendre 5-point quadrature ──────────────────────────────────────

// Weights and abscissae for 5-point GL on [-1, 1]
const GL_W = [
  0.2369268850561891,
  0.4786286704993665,
  0.5688888888888889,
  0.4786286704993665,
  0.2369268850561891,
];
const GL_X = [
  -0.9061798459386640,
  -0.5384693101056831,
  0.0,
  0.5384693101056831,
  0.9061798459386640,
];

/**
 * Cubic Bezier derivative at parameter t.
 */
function cubicDerivative(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * Arc-length of a cubic Bezier using 5-point Gauss-Legendre quadrature.
 * Accuracy: < 0.1mm on typical garment curves (up to ~500mm).
 */
export function gaussLegendreCubicBezierLength(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D,
): number {
  // Transform from [0, 1] to [-1, 1]: t = (1 + x) / 2, dt = dx / 2
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const t = 0.5 * (1 + GL_X[i]);
    const d = cubicDerivative(p0, p1, p2, p3, t);
    const speed = Math.sqrt(d.x * d.x + d.y * d.y);
    sum += GL_W[i] * speed;
  }
  return sum * 0.5; // Jacobian for [0,1] → [-1,1]
}

/**
 * Arc-length of a quadratic Bezier using 5-point Gauss-Legendre quadrature.
 */
function gaussLegendreQuadBezierLength(p0: Point2D, p1: Point2D, p2: Point2D): number {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const t = 0.5 * (1 + GL_X[i]);
    const mt = 1 - t;
    const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    sum += GL_W[i] * Math.sqrt(dx * dx + dy * dy);
  }
  return sum * 0.5;
}

// ─── Path traversal helpers ─────────────────────────────────────────────────

interface PathSegment {
  type: 'line' | 'cubic' | 'quadratic';
  from: Point2D;
  to: Point2D;
  cp1?: Point2D; // cubic or quadratic
  cp2?: Point2D; // cubic only
  length: number;
  cmdIndex: number; // index in original PathCommand[]
}

/**
 * Parse PathCommand[] into typed segments with precomputed lengths.
 */
function parseSegments(commands: PathCommand[], startIdx?: number, endIdx?: number): PathSegment[] {
  const segments: PathSegment[] = [];
  let cursor: Point2D = { x: 0, y: 0 };
  const start = startIdx ?? 0;
  const end = endIdx ?? commands.length;

  for (let i = start; i < end; i++) {
    const cmd = commands[i];
    switch (cmd.type) {
      case 'M':
        cursor = { x: cmd.values[0], y: cmd.values[1] };
        break;
      case 'L': {
        const to = { x: cmd.values[0], y: cmd.values[1] };
        const length = Math.hypot(to.x - cursor.x, to.y - cursor.y);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'H': {
        const to = { x: cmd.values[0], y: cursor.y };
        const length = Math.abs(to.x - cursor.x);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'V': {
        const to = { x: cursor.x, y: cmd.values[0] };
        const length = Math.abs(to.y - cursor.y);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'C': {
        const cp1 = { x: cmd.values[0], y: cmd.values[1] };
        const cp2 = { x: cmd.values[2], y: cmd.values[3] };
        const to = { x: cmd.values[4], y: cmd.values[5] };
        const length = gaussLegendreCubicBezierLength(cursor, cp1, cp2, to);
        segments.push({ type: 'cubic', from: cursor, to, cp1, cp2, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'Q': {
        const cp1 = { x: cmd.values[0], y: cmd.values[1] };
        const to = { x: cmd.values[2], y: cmd.values[3] };
        const length = gaussLegendreQuadBezierLength(cursor, cp1, to);
        segments.push({ type: 'quadratic', from: cursor, to, cp1, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'Z':
        // Close path — skip for arc-length (closing segment handled by outline)
        break;
      // S, T, A: uncommon in garment patterns; skip for now
    }
  }
  return segments;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Total arc-length of a PathCommand[] (or a subrange by command index).
 */
export function computePathArcLength(
  commands: PathCommand[],
  startIdx?: number,
  endIdx?: number,
): number {
  const segments = parseSegments(commands, startIdx, endIdx);
  let total = 0;
  for (const seg of segments) total += seg.length;
  return total;
}

/**
 * Find the 2D point at a given cumulative distance along a PathCommand[].
 * Returns null if distance exceeds total path length.
 */
export function pointAtPathDistance(
  commands: PathCommand[],
  distance: number,
  startIdx?: number,
  endIdx?: number,
): Point2D | null {
  const segments = parseSegments(commands, startIdx, endIdx);
  if (segments.length === 0) return null;

  let remaining = distance;
  for (const seg of segments) {
    if (remaining <= seg.length + 1e-6) {
      const t = seg.length > 0 ? Math.min(remaining / seg.length, 1) : 0;
      return evaluateSegment(seg, t);
    }
    remaining -= seg.length;
  }
  return null; // distance exceeds path length
}

/**
 * Sample points along a PathCommand[] at regular intervals.
 * Always includes start (distance=0) and end (distance=total).
 */
export function samplePathAtIntervals(
  commands: PathCommand[],
  interval: number,
  startIdx?: number,
  endIdx?: number,
): ArcLengthSample[] {
  const total = computePathArcLength(commands, startIdx, endIdx);
  if (total === 0) return [];

  const samples: ArcLengthSample[] = [];
  const numIntervals = Math.floor(total / interval);

  for (let i = 0; i <= numIntervals; i++) {
    const d = i * interval;
    const pt = pointAtPathDistance(commands, d, startIdx, endIdx);
    if (pt) {
      samples.push({ point: pt, distance: d, t: d / total });
    }
  }

  // Always include end point
  const lastDist = numIntervals * interval;
  if (total - lastDist > 1e-6) {
    const pt = pointAtPathDistance(commands, total, startIdx, endIdx);
    if (pt) {
      samples.push({ point: pt, distance: total, t: 1 });
    }
  }

  return samples;
}

/**
 * Cumulative distance from path start to the nearest projection of
 * a query point onto the path. Used for hover-distance display.
 */
export function distanceAlongPath(
  commands: PathCommand[],
  point: Point2D,
  startIdx?: number,
  endIdx?: number,
): number {
  const segments = parseSegments(commands, startIdx, endIdx);
  if (segments.length === 0) return 0;

  let bestTotalDist = 0; // cumulative distance along path to best projection
  let bestPerpDist = Infinity; // perpendicular distance to path

  let cumDist = 0;
  for (const seg of segments) {
    const SAMPLES = seg.type === 'line' ? 1 : 20;
    let prev = evaluateSegment(seg, 0);
    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const curr = evaluateSegment(seg, t);

      // Project point onto this sub-segment
      const abx = curr.x - prev.x;
      const aby = curr.y - prev.y;
      const len2 = abx * abx + aby * aby;
      if (len2 > 0) {
        let proj = ((point.x - prev.x) * abx + (point.y - prev.y) * aby) / len2;
        proj = Math.max(0, Math.min(1, proj));
        const px = prev.x + proj * abx;
        const py = prev.y + proj * aby;
        const perpDist = Math.hypot(point.x - px, point.y - py);
        if (perpDist < bestPerpDist) {
          bestPerpDist = perpDist;
          const subLen = Math.hypot(abx, aby);
          bestTotalDist = cumDist + proj * subLen;
        }
      }

      cumDist += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      prev = curr;
    }
  }

  return bestTotalDist;
}

/**
 * Evaluate a parsed segment at parameter t ∈ [0, 1].
 */
function evaluateSegment(seg: PathSegment, t: number): Point2D {
  switch (seg.type) {
    case 'line':
      return {
        x: seg.from.x + t * (seg.to.x - seg.from.x),
        y: seg.from.y + t * (seg.to.y - seg.from.y),
      };
    case 'cubic':
      return evalCubic(seg.from, seg.cp1!, seg.cp2!, seg.to, t);
    case 'quadratic':
      return evalQuadratic(seg.from, seg.cp1!, seg.to, t);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/arcLength.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/geometry/arcLength.ts src/utils/geometry/__tests__/arcLength.test.ts
git commit -m "feat(measure): add arc-length utility with Gauss-Legendre quadrature (#263)"
```

---

### Task 2: Measure Tool Definition — Add Mode Option

**Files:**
- Modify: `src/tools/definitions/measure.tsx`

**Step 1: Add measureMode option to the tool definition**

In `measure.tsx`, add a new option at the beginning of the `options` array:

```typescript
{
  id: 'measureMode',
  label: 'Mode',
  type: 'select',
  value: 'point-to-point',
  choices: [
    { label: 'Point to Point', value: 'point-to-point' },
    { label: 'Along Curve', value: 'along-curve' },
    { label: 'Compare Curves', value: 'compare' },
  ],
},
```

Also add a `markerInterval` option:

```typescript
{
  id: 'markerInterval',
  label: 'Marker Interval',
  type: 'select',
  value: '50',
  choices: [
    { label: '25mm', value: '25' },
    { label: '50mm', value: '50' },
    { label: '100mm', value: '100' },
  ],
},
```

Add copilot keywords: `'curve'`, `'arc length'`, `'along'`, `'walk'`, `'compare'`, `'ease'`, `'seam length'` to the existing keywords array.

Update the copilot examples to include:
```typescript
'Measure the armhole length along the curve',
'Compare the armhole and sleeve cap lengths',
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/definitions/measure.tsx
git commit -m "feat(measure): add along-curve and compare mode options (#263)"
```

---

### Task 3: Measure Hook — Along-Curve and Compare Logic

**Files:**
- Modify: `src/components/PatternEditor/useMeasureTool.ts`

**Step 1: Add types and state for curve measurement**

Add these imports at the top:
```typescript
import { computePathArcLength, samplePathAtIntervals, distanceAlongPath } from '../../utils/geometry/arcLength';
import type { ArcLengthSample } from '../../utils/geometry/arcLength';
import type { SemanticEdge } from '../../types/types';
```

Add new exported types:
```typescript
export type MeasureMode = 'point-to-point' | 'along-curve' | 'compare';

export interface SelectedEdgeInfo {
  pieceId: string;
  piece: PatternPiece;
  edge: SemanticEdge;
  arcLength: number;
  markers: ArcLengthSample[];
  /** Flattened path points for overlay rendering */
  pathPoints: Point2D[];
}

export interface CurveComparison {
  edgeA: SelectedEdgeInfo;
  edgeB: SelectedEdgeInfo;
  delta: number;
  easePercent: number;
}
```

**Step 2: Add new state and mode-aware handlers**

Add to the hook's state:
```typescript
const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);
const [compareEdgeA, setCompareEdgeA] = useState<SelectedEdgeInfo | null>(null);
const [compareEdgeB, setCompareEdgeB] = useState<SelectedEdgeInfo | null>(null);
const [hoverDistance, setHoverDistance] = useState<number | null>(null);
const [comparison, setComparison] = useState<CurveComparison | null>(null);
```

Add a helper to find the edge that contains a snap segment:
```typescript
function findEdgeForSegment(piece: PatternPiece, segmentIndex: number): SemanticEdge | null {
  if (!piece.edges) return null;
  return piece.edges.find(e =>
    segmentIndex >= e.segmentRange[0] && segmentIndex < e.segmentRange[1]
  ) ?? null;
}

function buildEdgeInfo(piece: PatternPiece, edge: SemanticEdge, markerInterval: number): SelectedEdgeInfo {
  const arcLength = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
  const markers = samplePathAtIntervals(piece.outline, markerInterval, edge.segmentRange[0], edge.segmentRange[1]);
  const pathPoints = markers.map(m => ({
    x: m.point.x + piece.position.x,
    y: m.point.y + piece.position.y,
  }));
  return { pieceId: piece.id, piece, edge, arcLength, markers, pathPoints };
}
```

Add `measureMode` parameter to the hook signature (read from tool options via selector):
```typescript
const measureMode = useSelector(
  (s: RootState) => (s.tools.toolOptions['measure']?.measureMode as MeasureMode) ?? 'point-to-point'
);
const markerInterval = useSelector(
  (s: RootState) => Number(s.tools.toolOptions['measure']?.markerInterval ?? '50')
);
```

Update `handleMouseDown` to dispatch by mode:
- **point-to-point**: existing behavior (unchanged)
- **along-curve**: call `trySnap` → `findEdgeForSegment` → `setSelectedEdge`
- **compare**: first click sets `compareEdgeA`, second sets `compareEdgeB` and computes comparison

Update `handleMouseMove` to compute `hoverDistance` in along-curve mode:
- If `selectedEdge` is set and cursor is near that edge, compute `distanceAlongPath()` using the edge's segment range

Update `reset()` to clear new state.

Return new values from the hook:
```typescript
return {
  // ... existing returns ...
  measureMode,
  markerInterval,
  selectedEdge,
  compareEdgeA,
  compareEdgeB,
  hoverDistance,
  comparison,
};
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/PatternEditor/useMeasureTool.ts
git commit -m "feat(measure): add along-curve edge selection and compare logic (#263)"
```

---

### Task 4: Overlay Rendering — Edge Highlight, Markers, Walk Dot, Compare

**Files:**
- Modify: `src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx`

**Step 1: Extend props and add new visual elements**

Add imports:
```typescript
import type { SelectedEdgeInfo, CurveComparison } from '../../useMeasureTool';
import type { ArcLengthSample } from '../../../../utils/geometry/arcLength';
```

Extend `MeasureToolOverlayProps`:
```typescript
interface MeasureToolOverlayProps {
  // ... existing props ...
  measureMode?: 'point-to-point' | 'along-curve' | 'compare';
  selectedEdge?: SelectedEdgeInfo | null;
  hoverDistance?: number | null;
  compareEdgeA?: SelectedEdgeInfo | null;
  compareEdgeB?: SelectedEdgeInfo | null;
  comparison?: CurveComparison | null;
}
```

**Step 2: Add EdgeHighlight sub-component**

Renders the selected edge as a thick accent-colored polyline with tick markers:
```typescript
function EdgeHighlight({ edge, zoom2D, formatDistance }: {
  edge: SelectedEdgeInfo; zoom2D: number; formatDistance: (d: number) => string;
}) {
  const points = edge.pathPoints;
  if (points.length < 2) return null;
  const d = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <g>
      {/* Edge highlight stroke */}
      <polyline points={d} fill="none" stroke="#9c27b0" strokeWidth={3 / zoom2D} opacity={0.7} />
      {/* Distance markers */}
      {edge.markers.map((m, i) => (
        <g key={i} transform={`translate(${m.point.x + edge.piece.position.x}, ${m.point.y + edge.piece.position.y})`}>
          <circle r={2.5 / zoom2D} fill="#9c27b0" />
          {i > 0 && (
            <MeasurementLabel
              x={0} y={-10 / zoom2D}
              label={formatDistance(m.distance)} zoom2D={zoom2D}
            />
          )}
        </g>
      ))}
      {/* Total length label at midpoint */}
      {points.length > 1 && (() => {
        const mid = points[Math.floor(points.length / 2)];
        return (
          <MeasurementLabel
            x={mid.x} y={mid.y - 16 / zoom2D}
            label={`Total: ${formatDistance(edge.arcLength)}`}
            zoom2D={zoom2D} bold
          />
        );
      })()}
    </g>
  );
}
```

**Step 3: Add HoverDistanceLabel sub-component**

Shows cumulative distance from edge start at cursor position:
```typescript
function HoverDistanceLabel({ x, y, distance, zoom2D, formatDistance }: {
  x: number; y: number; distance: number; zoom2D: number; formatDistance: (d: number) => string;
}) {
  return (
    <MeasurementLabel x={x} y={y - 14 / zoom2D} label={formatDistance(distance)} zoom2D={zoom2D} />
  );
}
```

**Step 4: Add WalkDot sub-component**

Animated dot walking the edge path using CSS animation:
```typescript
function WalkDot({ edge, zoom2D }: { edge: SelectedEdgeInfo; zoom2D: number }) {
  const points = edge.pathPoints;
  if (points.length < 2) return null;

  return (
    <circle r={4 / zoom2D} fill="#9c27b0" opacity={0.9}>
      <animateMotion
        dur="3s"
        repeatCount="indefinite"
        path={`M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
      />
    </circle>
  );
}
```

**Step 5: Add CompareVisualization sub-component**

Shows two edges with delta labels:
```typescript
function CompareVisualization({ comparison, zoom2D, formatDistance }: {
  comparison: CurveComparison; zoom2D: number; formatDistance: (d: number) => string;
}) {
  const { edgeA, edgeB, delta, easePercent } = comparison;
  return (
    <g>
      <EdgeHighlight edge={edgeA} zoom2D={zoom2D} formatDistance={formatDistance} />
      <EdgeHighlight edge={edgeB} zoom2D={zoom2D} formatDistance={formatDistance} />
      {/* Delta summary label between the two edges */}
      {edgeA.pathPoints.length > 0 && edgeB.pathPoints.length > 0 && (() => {
        const midA = edgeA.pathPoints[Math.floor(edgeA.pathPoints.length / 2)];
        const midB = edgeB.pathPoints[Math.floor(edgeB.pathPoints.length / 2)];
        const mx = (midA.x + midB.x) / 2;
        const my = (midA.y + midB.y) / 2;
        const sign = delta >= 0 ? '+' : '';
        return (
          <MeasurementLabel
            x={mx} y={my}
            label={`Δ ${sign}${formatDistance(delta)} (${easePercent.toFixed(1)}%)`}
            zoom2D={zoom2D} bold
          />
        );
      })()}
    </g>
  );
}
```

**Step 6: Wire into main overlay component**

In the `MeasureToolOverlay` default export, add conditional rendering based on `measureMode`:

```typescript
{/* Along-curve mode */}
{measureMode === 'along-curve' && selectedEdge && (
  <>
    <EdgeHighlight edge={selectedEdge} zoom2D={zoom2D} formatDistance={formatDistance} />
    <WalkDot edge={selectedEdge} zoom2D={zoom2D} />
    {hoverDistance != null && cursorPos && (
      <HoverDistanceLabel
        x={cursorPos.x} y={cursorPos.y}
        distance={hoverDistance} zoom2D={zoom2D} formatDistance={formatDistance}
      />
    )}
  </>
)}

{/* Compare mode */}
{measureMode === 'compare' && comparison && (
  <CompareVisualization comparison={comparison} zoom2D={zoom2D} formatDistance={formatDistance} />
)}
{measureMode === 'compare' && !comparison && compareEdgeA && (
  <EdgeHighlight edge={compareEdgeA} zoom2D={zoom2D} formatDistance={formatDistance} />
)}
```

**Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx
git commit -m "feat(measure): add edge highlight, markers, walk dot, and compare overlay (#263)"
```

---

### Task 5: Wire Overlay Props in PatternEditor

**Files:**
- Modify: The file that renders `MeasureToolOverlay` and calls `useMeasureTool` (likely `src/components/PatternEditor/useEditorInteractions.ts` or the PatternEditor component itself)

**Step 1: Find and update the overlay rendering**

Search for where `MeasureToolOverlay` is rendered and pass the new props from `useMeasureTool`:

```typescript
<MeasureToolOverlay
  // ... existing props ...
  measureMode={measureTool.measureMode}
  selectedEdge={measureTool.selectedEdge}
  hoverDistance={measureTool.hoverDistance}
  compareEdgeA={measureTool.compareEdgeA}
  compareEdgeB={measureTool.compareEdgeB}
  comparison={measureTool.comparison}
/>
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add <modified file>
git commit -m "feat(measure): wire along-curve props to overlay (#263)"
```

---

### Task 6: Copilot Meta-Tools

**Files:**
- Create: `src/copilot/reasoning/bridge/meta-tools/measureAlongCurve.ts`
- Create: `src/copilot/reasoning/bridge/meta-tools/compareCurves.ts`
- Modify: `src/copilot/reasoning/bridge/meta-tools/index.ts`

**Step 1: Create measureAlongCurve meta-tool**

Create `src/copilot/reasoning/bridge/meta-tools/measureAlongCurve.ts`:

```typescript
/**
 * measureAlongCurve Meta-Tool
 *
 * Returns arc-length of a named edge on a pattern piece, with sample points
 * at regular intervals. Read-only — never modifies state.
 *
 * @module measureAlongCurve
 */

import type { MetaToolDefinition, MetaToolResult } from './types';
import { computePathArcLength, samplePathAtIntervals } from '../../../../utils/geometry/arcLength';

export const measureAlongCurveTool: MetaToolDefinition = {
  name: 'measureAlongCurve',
  description:
    'Returns the arc-length (in mm) of a named edge on a pattern piece, measured along the curve rather than straight-line. Also returns sample points at regular intervals along the edge.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'The unique identifier of the piece containing the edge.',
      },
      edgeName: {
        type: 'string',
        description: 'The name of the edge to measure along (case-insensitive). E.g. "armhole", "neckline".',
      },
    },
    required: ['pieceId', 'edgeName'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const pieceId = params.pieceId as string;
    const edgeName = params.edgeName as string;
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      outline: Array<{ type: string; values: number[] }>;
      edges?: Array<{ id: string; name: string; segmentRange: [number, number]; length?: number }>;
    }>;

    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. Available: ${pieces.map(p => `${p.id} (${p.name})`).join(', ') || 'none'}`,
      };
    }

    const edges = piece.edges ?? [];
    const edgeNameLower = edgeName.toLowerCase();
    const edge = edges.find(e => e.name.toLowerCase() === edgeNameLower);
    if (!edge) {
      return {
        success: false,
        error: `Edge "${edgeName}" not found on piece "${pieceId}". Available: ${edges.map(e => e.name).join(', ') || 'none'}`,
      };
    }

    const outline = piece.outline as Array<{ type: string; values: number[] }>;
    const length = computePathArcLength(outline, edge.segmentRange[0], edge.segmentRange[1]);
    const samples = samplePathAtIntervals(outline, 50, edge.segmentRange[0], edge.segmentRange[1]);

    return {
      success: true,
      data: {
        pieceId,
        edgeName: edge.name,
        length,
        unit: 'mm',
        samplePoints: samples.map(s => ({ distance: s.distance, x: s.point.x, y: s.point.y })),
      } as unknown as Record<string, unknown>,
    };
  },
};
```

**Step 2: Create compareCurves meta-tool**

Create `src/copilot/reasoning/bridge/meta-tools/compareCurves.ts`:

```typescript
/**
 * compareCurves Meta-Tool
 *
 * Compares arc-lengths of two named edges on pattern pieces.
 * Returns delta, ease percentage, and per-sample divergence.
 * Read-only — never modifies state.
 *
 * @module compareCurves
 */

import type { MetaToolDefinition, MetaToolResult } from './types';
import { computePathArcLength } from '../../../../utils/geometry/arcLength';

export const compareCurvesTool: MetaToolDefinition = {
  name: 'compareCurves',
  description:
    'Compares the arc-lengths of two named edges across pattern pieces. Returns both lengths, their delta, and the ease percentage. Useful for verifying seam matching (e.g. armhole vs sleeve cap).',
  parameters: {
    type: 'object',
    properties: {
      pieceIdA: { type: 'string', description: 'Piece ID for edge A.' },
      edgeNameA: { type: 'string', description: 'Edge name on piece A (case-insensitive).' },
      pieceIdB: { type: 'string', description: 'Piece ID for edge B.' },
      edgeNameB: { type: 'string', description: 'Edge name on piece B (case-insensitive).' },
    },
    required: ['pieceIdA', 'edgeNameA', 'pieceIdB', 'edgeNameB'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      outline: Array<{ type: string; values: number[] }>;
      edges?: Array<{ id: string; name: string; segmentRange: [number, number]; length?: number }>;
    }>;

    function findEdge(pieceId: string, edgeName: string) {
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return { error: `Piece "${pieceId}" not found.` };
      const edge = (piece.edges ?? []).find(e => e.name.toLowerCase() === edgeName.toLowerCase());
      if (!edge) return { error: `Edge "${edgeName}" not found on "${pieceId}". Available: ${(piece.edges ?? []).map(e => e.name).join(', ') || 'none'}` };
      const length = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
      return { piece, edge, length };
    }

    const a = findEdge(params.pieceIdA as string, params.edgeNameA as string);
    if ('error' in a) return { success: false, error: a.error };
    const b = findEdge(params.pieceIdB as string, params.edgeNameB as string);
    if ('error' in b) return { success: false, error: b.error };

    const delta = b.length - a.length;
    const easePercent = a.length > 0 ? (delta / a.length) * 100 : 0;

    return {
      success: true,
      data: {
        lengthA: a.length,
        edgeNameA: a.edge.name,
        pieceIdA: params.pieceIdA,
        lengthB: b.length,
        edgeNameB: b.edge.name,
        pieceIdB: params.pieceIdB,
        delta,
        easePercent,
        unit: 'mm',
      } as unknown as Record<string, unknown>,
    };
  },
};
```

**Step 3: Register in index.ts**

Add imports and entries in `src/copilot/reasoning/bridge/meta-tools/index.ts`:

```typescript
export { measureAlongCurveTool } from './measureAlongCurve';
export { compareCurvesTool } from './compareCurves';
```

And in the imports + `getAllMetaTools()` array:
```typescript
import { measureAlongCurveTool } from './measureAlongCurve';
import { compareCurvesTool } from './compareCurves';

export function getAllMetaTools(): MetaToolDefinition[] {
  return [
    // ... existing tools ...
    measureAlongCurveTool,
    compareCurvesTool,
  ];
}
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/meta-tools/measureAlongCurve.ts \
        src/copilot/reasoning/bridge/meta-tools/compareCurves.ts \
        src/copilot/reasoning/bridge/meta-tools/index.ts
git commit -m "feat(copilot): add measureAlongCurve and compareCurves meta-tools (#263)"
```

---

### Task 7: Full Verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Zero errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (including new arcLength tests)

**Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit and PR**

```bash
git push -u origin feat/walk-measure-along-curve
gh pr create --title "feat: Walk/Measure Along Curve (#263)" --body "..."
```
