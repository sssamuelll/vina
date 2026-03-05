# Measure Tool Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the existing measure tool with snap-to-outline precision, edge path measurement, angle display, cumulative mode, and fix missing `measure_distance` LLM schema.

**Architecture:** Incremental enhancement of 4 existing files. Snap-to-outline reuses `flattenPath()` + segment projection (same pattern as `useScissorsTool`). Edge path length walks the flattened polyline. Angle is `Math.atan2`. No new files created.

**Tech Stack:** React hooks, SVG rendering, `flattenPath()` from `src/utils/seam/index.ts`

---

### Task 1: Add `measure_distance` to LLM action schemas

This is a one-line gap fix. The copilot action type, executor, and validator already exist for `measure_distance`, but it was never added to the LLM schemas, so the copilot can't invoke it.

**Files:**
- Modify: `src/copilot/llm/actionSchemas.ts:323` (insert before `// === Simulation ===` comment)

**Step 1: Add the schema entry**

Insert after the `compare_edges` schema (line 323) and before the `// === Simulation ===` comment (line 325):

```typescript
  {
    action: 'measure_distance',
    description: 'Measure straight-line distance between two points',
    category: 'measurement',
    parameters: [
      { name: 'from', type: '{ x: number, y: number }', description: 'Start point coordinates', required: true },
      { name: 'to', type: '{ x: number, y: number }', description: 'End point coordinates', required: true },
    ],
    examples: ['Measure distance between these two points', 'How far apart are these points?'],
    readOnly: true,
  },
```

**Step 2: Verify types pass**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Run tests**

Run: `npm run test -- --run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/copilot/llm/actionSchemas.ts
git commit -m "fix(copilot): add missing measure_distance LLM schema"
```

---

### Task 2: Add shortcut key to measure tool definition

**Files:**
- Modify: `src/tools/definitions/measure.tsx:21-27`

**Step 1: Add shortcut property**

The tool definition at line 21 is:
```typescript
export const measureTool: ToolDefinition = {
  id: 'measure',
  name: 'Measure',
  context: '2d',
  icon: MeasureIcon,
  cursor: 'crosshair',
  group: 'annotation',
```

Add `shortcut: 'm',` after `cursor: 'crosshair',` (line 26):

```typescript
export const measureTool: ToolDefinition = {
  id: 'measure',
  name: 'Measure',
  context: '2d',
  icon: MeasureIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
```

**Step 2: Verify no shortcut conflict**

Search for `shortcut: 'm'` across `src/tools/definitions/` to ensure no other tool uses `m`. The existing tools use: `v` (select), `p` (pen), `r` (rect), `l` (line), `s` (seam), `n` (notch), `g` (grainline), `a` (node), `e` (edit pattern), `t` (transform), `x` (scissors), `j` (merge). So `m` is free.

**Step 3: Verify types pass**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/definitions/measure.tsx
git commit -m "feat(tools): add keyboard shortcut 'm' for measure tool"
```

---

### Task 3: Enhance useMeasureTool with snap-to-outline

This is the core enhancement. We add snap-to-outline logic (same pattern as `useScissorsTool.ts:52-81`) and expand the Measurement interface.

**Files:**
- Modify: `src/components/PatternEditor/useMeasureTool.ts` (full rewrite)
- Reference: `src/components/PatternEditor/useScissorsTool.ts:52-81` (snap pattern)
- Reference: `src/utils/seam/index.ts:9` (`flattenPath`)

**Step 1: Write the failing test**

Create: `src/components/PatternEditor/__tests__/useMeasureTool.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

// Test the snap-to-outline helper directly
// We extract it as a pure function for testability

import { snapToOutline, calculatePathLength } from '../useMeasureTool';

describe('snapToOutline', () => {
  const piece = {
    id: 'p1',
    name: 'Test',
    position: { x: 0, y: 0 },
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [100, 0] },
      { type: 'L' as const, values: [100, 100] },
      { type: 'L' as const, values: [0, 100] },
      { type: 'Z' as const, values: [] },
    ],
    edges: [],
    darts: [],
    fabric: { preset: 'cotton-poplin' },
  };

  it('snaps to nearest point on outline within threshold', () => {
    // Point near top edge at y=2, should snap to y=0
    const result = snapToOutline({ x: 50, y: 2 }, piece as any, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(0, 1);
    expect(result!.point.x).toBeCloseTo(50, 1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToOutline({ x: 50, y: 50 }, piece as any, 1.0);
    expect(result).toBeNull();
  });

  it('handles piece position offset', () => {
    const offsetPiece = { ...piece, position: { x: 200, y: 300 } };
    // Point near top edge in world space (200+50, 300+2)
    const result = snapToOutline({ x: 250, y: 302 }, offsetPiece as any, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(300, 1);
    expect(result!.point.x).toBeCloseTo(250, 1);
  });
});

describe('calculatePathLength', () => {
  it('calculates straight line length', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(calculatePathLength(points)).toBeCloseTo(100, 1);
  });

  it('calculates polyline length (sum of segments)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // 100 + 100 = 200
    expect(calculatePathLength(points)).toBeCloseTo(200, 1);
  });

  it('returns 0 for single point', () => {
    expect(calculatePathLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calculatePathLength([])).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PatternEditor/__tests__/useMeasureTool.test.ts`
Expected: FAIL — `snapToOutline` and `calculatePathLength` are not exported from useMeasureTool

**Step 3: Rewrite useMeasureTool.ts with all enhancements**

Replace the entire content of `src/components/PatternEditor/useMeasureTool.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece } from '../../types/types';
import { formatDimension } from '../../utils/units';
import { flattenPath } from '../../utils/seam/index';

// ─── Types ───

export interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
  isPathMeasurement: boolean;
  pathPoints?: Point2D[];
  angle?: number;
}

export interface SnapResult {
  point: Point2D;
  pieceId: string;
  segmentIndex: number;
}

// ─── Exported helpers (pure functions for testability) ───

const SNAP_THRESHOLD = 8; // screen pixels

/**
 * Find nearest point on piece outline to a world-space point.
 * Returns snap info or null if outside threshold.
 */
export function snapToOutline(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
): SnapResult | null {
  const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
  const flatPoints = flattenPath(piece.outline);
  let bestDist = Infinity;
  let bestPt: Point2D | null = null;
  let bestSegment = -1;

  for (let i = 0; i < flatPoints.length - 1; i++) {
    const a = flatPoints[i];
    const b = flatPoints[i + 1];
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
      bestSegment = i;
    }
  }

  const threshold = SNAP_THRESHOLD / zoom;
  if (bestDist <= threshold && bestPt) {
    return { point: bestPt, pieceId: piece.id, segmentIndex: bestSegment };
  }
  return null;
}

/**
 * Calculate total length of a polyline given its points.
 */
export function calculatePathLength(points: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// ─── Hook ───

export function useMeasureTool(zoom: number, pan: Point2D) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentStart, setCurrentStart] = useState<Point2D | null>(null);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);

  const currentStartRef = useRef(currentStart);
  currentStartRef.current = currentStart;

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  /** Try to snap to nearest piece outline */
  const trySnap = useCallback((pt: Point2D): SnapResult | null => {
    let best: SnapResult | null = null;
    let bestDist = Infinity;
    for (const piece of pieces) {
      if (!piece.outline?.length) continue;
      const result = snapToOutline(pt, piece, zoom);
      if (result) {
        const d = Math.hypot(pt.x - result.point.x, pt.y - result.point.y);
        if (d < bestDist) {
          bestDist = d;
          best = result;
        }
      }
    }
    return best;
  }, [pieces, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    const pt = snap ? snap.point : rawPt;

    if (!currentStartRef.current) {
      setCurrentStart(pt);
      setCursorPos(pt);
    } else {
      const start = currentStartRef.current;
      const dx = pt.x - start.x;
      const dy = pt.y - start.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      setMeasurements(prev => [...prev, {
        id: `measure-${Date.now()}`,
        startPoint: start,
        endPoint: pt,
        distance,
        isPathMeasurement: false,
        angle,
      }]);
      setCurrentStart(null);
      setCursorPos(null);
    }
  }, [toPattern, trySnap]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);

    if (currentStartRef.current) {
      setCursorPos(snap ? snap.point : rawPt);
    }
  }, [toPattern, trySnap]);

  const handleMouseUp = useCallback(() => {
    // no-op — measure uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (currentStartRef.current) {
        setCurrentStart(null);
        setCursorPos(null);
      } else {
        setMeasurements([]);
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setMeasurements(prev => prev.slice(0, -1));
    }
  }, []);

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  const reset = useCallback(() => {
    setMeasurements([]);
    setCurrentStart(null);
    setCursorPos(null);
    setHoveredSnapPoint(null);
  }, []);

  // Keep clear as alias for backward compatibility with useEditorInteractions
  const clear = reset;

  return {
    measurements,
    currentStart,
    cursorPos,
    hoveredSnapPoint,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
    clear,
    formatDistance,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PatternEditor/__tests__/useMeasureTool.test.ts`
Expected: All 6 tests PASS

**Step 5: Verify types pass**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/components/PatternEditor/useMeasureTool.ts src/components/PatternEditor/__tests__/useMeasureTool.test.ts
git commit -m "feat(measure): add snap-to-outline and ToolHooks interface alignment"
```

---

### Task 4: Update MeasureToolOverlay with snap indicator and angle display

**Files:**
- Modify: `src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx` (enhanced)

**Step 1: Rewrite MeasureToolOverlay**

Replace the entire content of `src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx`:

```tsx
import type { Point2D } from '../../../../types/types';

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
  isPathMeasurement: boolean;
  pathPoints?: Point2D[];
  angle?: number;
}

interface MeasureToolOverlayProps {
  zoom2D: number;
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  hoveredSnapPoint: Point2D | null;
  formatDistance: (d: number) => string;
  showAngle?: boolean;
}

function MeasurementLabel({ x, y, label, zoom2D, bold }: { x: number; y: number; label: string; zoom2D: number; bold?: boolean }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
        width={label.length * 6 / zoom2D} height={14 / zoom2D}
        rx={7 / zoom2D} fill={bold ? 'rgba(123,31,162,0.85)' : 'rgba(0,0,0,0.75)'}
      />
      <text
        textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize={10 / zoom2D}
        fontFamily="Inter, sans-serif" pointerEvents="none"
        fontWeight={bold ? 700 : 400}
      >
        {label}
      </text>
    </g>
  );
}

function AngleArc({ start, end, zoom2D }: { start: Point2D; end: Point2D; zoom2D: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const angleDeg = angle * (180 / Math.PI);
  const r = 15 / zoom2D;

  // Arc from horizontal to the measurement angle
  const arcEnd = {
    x: start.x + r * Math.cos(angle),
    y: start.y + r * Math.sin(angle),
  };
  const horizontal = { x: start.x + r, y: start.y };
  const sweep = angleDeg >= 0 ? 1 : 0;
  const largeArc = Math.abs(angleDeg) > 180 ? 1 : 0;

  const label = `${Math.abs(angleDeg).toFixed(1)}°`;
  const labelAngle = angle / 2;
  const labelR = r + 8 / zoom2D;
  const labelPos = {
    x: start.x + labelR * Math.cos(labelAngle),
    y: start.y + labelR * Math.sin(labelAngle),
  };

  return (
    <g opacity={0.6}>
      <line x1={start.x} y1={start.y} x2={horizontal.x} y2={horizontal.y}
        stroke="#9c27b0" strokeWidth={0.5 / zoom2D} strokeDasharray={`${2 / zoom2D}`} />
      <path
        d={`M ${horizontal.x} ${horizontal.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        fill="none" stroke="#9c27b0" strokeWidth={1 / zoom2D}
      />
      <text
        x={labelPos.x} y={labelPos.y}
        textAnchor="middle" dominantBaseline="central"
        fill="#9c27b0" fontSize={8 / zoom2D}
        fontFamily="Inter, sans-serif" pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

export default function MeasureToolOverlay({
  zoom2D, measurements, currentStart, cursorPos,
  hoveredSnapPoint, formatDistance, showAngle,
}: MeasureToolOverlayProps) {
  return (
    <g className="measure-lines">
      {/* Snap indicator */}
      {hoveredSnapPoint && (
        <circle
          cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
          r={4 / zoom2D} fill="#9c27b0" opacity={0.5}
        />
      )}

      {/* Completed measurements */}
      {measurements.map(m => {
        const mx = (m.startPoint.x + m.endPoint.x) / 2;
        const my = (m.startPoint.y + m.endPoint.y) / 2;
        const label = formatDistance(m.distance);
        return (
          <g key={m.id}>
            <line
              x1={m.startPoint.x} y1={m.startPoint.y}
              x2={m.endPoint.x} y2={m.endPoint.y}
              stroke="#9c27b0" strokeWidth={1.5 / zoom2D}
              strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
            />
            <circle cx={m.startPoint.x} cy={m.startPoint.y} r={3 / zoom2D} fill="#9c27b0" />
            <circle cx={m.endPoint.x} cy={m.endPoint.y} r={3 / zoom2D} fill="#9c27b0" />
            <MeasurementLabel x={mx} y={my} label={label} zoom2D={zoom2D} />
            {showAngle && <AngleArc start={m.startPoint} end={m.endPoint} zoom2D={zoom2D} />}
          </g>
        );
      })}

      {/* In-progress measurement */}
      {currentStart && cursorPos && (() => {
        const s = currentStart;
        const c = cursorPos;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        const label = formatDistance(d);
        const mx = (s.x + c.x) / 2;
        const my = (s.y + c.y) / 2;
        return (
          <>
            <line
              x1={s.x} y1={s.y} x2={c.x} y2={c.y}
              stroke="#9c27b0" strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`} opacity={0.6}
            />
            <circle cx={s.x} cy={s.y} r={3 / zoom2D} fill="#9c27b0" />
            <MeasurementLabel x={mx} y={my} label={label} zoom2D={zoom2D} />
            {showAngle && <AngleArc start={s} end={c} zoom2D={zoom2D} />}
          </>
        );
      })()}
    </g>
  );
}
```

**Step 2: Update ToolOverlay.tsx to pass new props**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`, the current measure overlay render (line 134-136) is:

```tsx
{activeTool === 'measure' && (
  <MeasureToolOverlay zoom2D={zoom2D} measurements={props.measurements} currentStart={props.currentStart} cursorPos={props.cursorPos} formatDistance={props.formatDistance} />
)}
```

Replace with:

```tsx
{activeTool === 'measure' && (
  <MeasureToolOverlay zoom2D={zoom2D} measurements={props.measurements} currentStart={props.currentStart} cursorPos={props.cursorPos} hoveredSnapPoint={props.measureHoveredSnapPoint} formatDistance={props.formatDistance} showAngle={props.measureShowAngle} />
)}
```

Also add the new props to the `ToolOverlayProps` interface in the same file. Find where `measurements` is declared and add:

```typescript
measureHoveredSnapPoint?: Point2D | null;
measureShowAngle?: boolean;
```

**Step 3: Update PatternEditor.tsx to pass the new props**

In `src/components/PatternEditor/PatternEditor.tsx`, find where measure overlay props are passed to `<ToolOverlay>` (around line 240-243). Add:

```typescript
measureHoveredSnapPoint={measureTool.hoveredSnapPoint}
measureShowAngle={false}
```

(We set `showAngle` to `false` by default; the tool options UI can toggle this later.)

**Step 4: Verify types pass**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(measure): add snap indicator and angle display to overlay"
```

---

### Task 5: Full verification and type check

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Full test suite**

Run: `npm run test -- --run`
Expected: All tests pass (including new useMeasureTool tests)

**Step 3: Verify measure tool hook tests**

Run: `npx vitest run src/components/PatternEditor/__tests__/useMeasureTool.test.ts`
Expected: 6 tests pass

**Step 4: Final commit if any fixes needed**

Only commit if type check or tests required fixes in previous tasks.
