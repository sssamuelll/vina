# Trim Placement Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2D trim placement tool that lets users click-to-place trims on pattern piece edges, distribute N trims evenly along an edge, and mirror trims to symmetric pieces.

**Architecture:** Extends the existing `trimPlace` tool stub (already registered in `src/tools/definitions/trimPlace.tsx`) with tool options, a `useTrimTool` interaction hook mirroring `useNotchTool`, SVG overlays for preview, and a `TrimRenderer` for permanent trim visualization. A new `interpolateEdgePoint` utility resolves parametric `t` values to (x, y) positions on semantic edges. BOM extraction and copilot tools are extended correspondingly.

**Tech Stack:** React, Redux (projectSlice), SVG rendering, Vitest for tests

**Spec:** `docs/superpowers/specs/2026-03-29-trim-placement-tool-design.md`

---

### Task 1: Data Model — Add `edge-points` to TrimPlacement

**Files:**
- Modify: `src/types/trim.ts:5-8`
- Modify: `src/store/projectSlice.ts:617-631`
- Test: `src/utils/trim/__tests__/trimExtractor.test.ts` (existing, extend)

- [ ] **Step 1: Add `edge-points` mode to TrimPlacement union**

In `src/types/trim.ts`, add the new discriminant to the union:

```typescript
/** Placement mode — discriminated union */
export type TrimPlacement =
  | { mode: 'edge'; edgeName: string; tStart: number; tEnd: number }
  | { mode: 'edge-points'; edgeName: string; positions: number[] }
  | { mode: 'count'; quantity: number }
  | { mode: 'point'; positions: { x: number; y: number }[] };
```

- [ ] **Step 2: Add `edge-points` validation to addTrim reducer**

In `src/store/projectSlice.ts`, in the `addTrim` reducer (after the `point` mode validation block around line 626-628), add:

```typescript
if (placement.mode === 'edge-points') {
  const edge = piece.edges?.find(e => e.name === placement.edgeName);
  if (!edge) return;
  if (!placement.positions || placement.positions.length === 0) return;
  if (placement.positions.some(t => t < 0 || t > 1)) return;
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors — existing code handles all modes via discriminated union)

- [ ] **Step 4: Commit**

```bash
git add src/types/trim.ts src/store/projectSlice.ts
git commit -m "feat(trim): add edge-points placement mode to TrimPlacement union"
```

---

### Task 2: Edge Interpolation Utility

**Files:**
- Create: `src/utils/geometry/edgeInterpolation.ts`
- Test: `src/utils/geometry/__tests__/edgeInterpolation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/geometry/__tests__/edgeInterpolation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { interpolateEdgePoint, computeEdgeLengthMM } from '../edgeInterpolation';
import type { PatternPiece } from '../../../types/types';

function makeRectPiece(): PatternPiece {
  return {
    id: 'p1',
    name: 'Test',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },   // segment 0→1: top edge (100mm)
      { type: 'L', values: [100, 200] },  // segment 1→2: right edge (200mm)
      { type: 'L', values: [0, 200] },    // segment 2→3: bottom edge (100mm)
      { type: 'Z', values: [] },          // segment 3→0: left edge (200mm)
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    edges: [
      { id: 'e1', name: 'top', segmentRange: [0, 1] as [number, number], edgeType: 'seam' as const },
      { id: 'e2', name: 'right', segmentRange: [1, 2] as [number, number], edgeType: 'seam' as const },
      { id: 'e3', name: 'bottom', segmentRange: [2, 3] as [number, number], edgeType: 'seam' as const },
      { id: 'e4', name: 'left', segmentRange: [3, 4] as [number, number], edgeType: 'seam' as const },
    ],
  } as unknown as PatternPiece;
}

describe('interpolateEdgePoint', () => {
  it('returns null for unknown edge name', () => {
    expect(interpolateEdgePoint(makeRectPiece(), 'unknown', 0.5)).toBeNull();
  });

  it('returns start point at t=0', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(0, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns end point at t=1', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 1);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(100, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns midpoint at t=0.5', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0.5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(50, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns correct tangent for horizontal edge', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0.5);
    expect(result).not.toBeNull();
    // Top edge goes left→right, tangent should be (1, 0) normalized
    expect(result!.tangent.x).toBeCloseTo(1, 1);
    expect(result!.tangent.y).toBeCloseTo(0, 1);
  });

  it('interpolates vertical edge correctly', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'right', 0.5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(100, 1);
    expect(result!.point.y).toBeCloseTo(100, 1);
  });

  it('clamps t to [0, 1]', () => {
    const resultNeg = interpolateEdgePoint(makeRectPiece(), 'top', -0.5);
    expect(resultNeg!.point.x).toBeCloseTo(0, 1);
    const resultOver = interpolateEdgePoint(makeRectPiece(), 'top', 1.5);
    expect(resultOver!.point.x).toBeCloseTo(100, 1);
  });
});

describe('computeEdgeLengthMM', () => {
  it('returns correct length for straight edge', () => {
    const len = computeEdgeLengthMM(makeRectPiece(), 'top');
    expect(len).toBeCloseTo(100, 1);
  });

  it('returns correct length for vertical edge', () => {
    const len = computeEdgeLengthMM(makeRectPiece(), 'right');
    expect(len).toBeCloseTo(200, 1);
  });

  it('returns 0 for unknown edge', () => {
    expect(computeEdgeLengthMM(makeRectPiece(), 'unknown')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/geometry/__tests__/edgeInterpolation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `interpolateEdgePoint` and `computeEdgeLengthMM`**

Create `src/utils/geometry/edgeInterpolation.ts`:

```typescript
import type { PatternPiece, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';

/**
 * Interpolate a parametric position (t: 0–1) along a named semantic edge.
 * Uses the same flattenPath + segmentRange model as edgeLengthMM in the BOM extractor
 * for path representation consistency (see spec diagnostic #1–2).
 */
export function interpolateEdgePoint(
  piece: PatternPiece,
  edgeName: string,
  t: number,
): { point: Point2D; tangent: Point2D } | null {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;

  const pts = flattenPath(piece.outline);
  const n = pts.length;
  if (n < 2) return null;

  const start = Math.max(0, Math.min(edge.segmentRange[0], n - 1));
  const end = Math.max(0, Math.min(edge.segmentRange[1], n - 1));

  // Collect edge segment points
  const edgePts: Point2D[] = [];
  let i = start;
  edgePts.push(pts[i]);
  while (i !== end) {
    i = (i + 1) % n;
    edgePts.push(pts[i]);
    if (edgePts.length > n + 1) break; // safety
  }

  if (edgePts.length < 2) return null;

  // Compute cumulative arc lengths
  const cumLen: number[] = [0];
  for (let j = 1; j < edgePts.length; j++) {
    const dx = edgePts[j].x - edgePts[j - 1].x;
    const dy = edgePts[j].y - edgePts[j - 1].y;
    cumLen.push(cumLen[j - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen === 0) return { point: { ...edgePts[0] }, tangent: { x: 1, y: 0 } };

  // Clamp t
  const clampedT = Math.max(0, Math.min(1, t));
  const targetLen = clampedT * totalLen;

  // Find the segment containing targetLen
  let segIdx = 0;
  for (let j = 1; j < cumLen.length; j++) {
    if (cumLen[j] >= targetLen) {
      segIdx = j - 1;
      break;
    }
    segIdx = j - 1;
  }

  const segStart = cumLen[segIdx];
  const segEnd = cumLen[segIdx + 1];
  const segLen = segEnd - segStart;
  const localT = segLen === 0 ? 0 : (targetLen - segStart) / segLen;

  const p0 = edgePts[segIdx];
  const p1 = edgePts[segIdx + 1];

  const point: Point2D = {
    x: p0.x + localT * (p1.x - p0.x),
    y: p0.y + localT * (p1.y - p0.y),
  };

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const tangent: Point2D = len === 0
    ? { x: 1, y: 0 }
    : { x: dx / len, y: dy / len };

  return { point, tangent };
}

/**
 * Compute total arc length (mm) of a named semantic edge.
 * Uses same flattenPath + segmentRange model as interpolateEdgePoint.
 */
export function computeEdgeLengthMM(piece: PatternPiece, edgeName: string): number {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return 0;

  const pts = flattenPath(piece.outline);
  const n = pts.length;
  if (n < 2) return 0;

  const start = Math.max(0, Math.min(edge.segmentRange[0], n - 1));
  const end = Math.max(0, Math.min(edge.segmentRange[1], n - 1));

  let len = 0;
  let i = start;
  while (i !== end) {
    const next = (i + 1) % n;
    const dx = pts[next].x - pts[i].x;
    const dy = pts[next].y - pts[i].y;
    len += Math.sqrt(dx * dx + dy * dy);
    i = next;
    if (len > 100000) break; // safety
  }

  return len;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/geometry/__tests__/edgeInterpolation.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/geometry/edgeInterpolation.ts src/utils/geometry/__tests__/edgeInterpolation.test.ts
git commit -m "feat(trim): add interpolateEdgePoint and computeEdgeLengthMM utilities"
```

---

### Task 3: Tool Definition — Add Options to trimPlaceTool

**Files:**
- Modify: `src/tools/definitions/trimPlace.tsx`
- Modify: `src/types/types.ts:558` (Tool2D union)

- [ ] **Step 1: Add `trimPlace` to Tool2D union**

In `src/types/types.ts`, add `'trimPlace'` to the `Tool2D` type, after `'pleat'`:

```typescript
  | 'pleat'        // add/edit pleats along piece edges
  | 'trimPlace'    // place trims on piece edges
```

- [ ] **Step 2: Add tool options to trimPlaceTool**

Replace the full contents of `src/tools/definitions/trimPlace.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
import { TRIM_LIBRARY } from '../../utils/trim/trimLibrary';

const TrimPlaceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="4" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="9" y1="14" x2="9" y2="17" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="14" y1="9" x2="17" y2="9" />
  </svg>
);

// Build preset choices grouped by type
const presetChoices = TRIM_LIBRARY.map(p => ({
  label: `${p.name} (${p.size}mm)`,
  value: p.id,
}));

export const trimPlaceTool: ToolDefinition = {
  id: 'trimPlace',
  name: 'Place Trim',
  description: 'Click on pattern edges to place trims (buttons, zippers, snaps)',
  context: '2d',
  icon: TrimPlaceIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'trimPreset',
      label: 'Preset',
      type: 'select',
      value: TRIM_LIBRARY[0].id,
      choices: presetChoices,
    },
    {
      id: 'placementMode',
      label: 'Mode',
      type: 'select',
      value: 'single',
      choices: [
        { label: 'Single', value: 'single' },
        { label: 'Distribute', value: 'distribute' },
      ],
    },
    {
      id: 'distributeCount',
      label: 'Count',
      type: 'number',
      value: 5,
      min: 2,
      max: 20,
      step: 1,
    },
    {
      id: 'startOffset',
      label: 'Start Offset (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      id: 'endOffset',
      label: 'End Offset (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Place trims (buttons, zippers, snaps, rivets, buckles) on pattern piece edges by clicking. ' +
      'Select a preset from the trim library, then click on piece edges to place. ' +
      'Use Distribute mode to evenly space N trims along an edge. ' +
      '/ Colocar avios (botones, cremalleras, broches, remaches, hebillas) en los bordes de piezas del patron.',
    examples: [
      'Place buttons on the front bodice center-front edge',
      'Distribute 5 snaps along the waistband',
      'Add a zipper to the center back',
    ],
    keywords: ['trim', 'button', 'zipper', 'snap', 'rivet', 'buckle', 'place', 'attach', 'distribute'],
    requiresSelection: 'none',
    produces: 'modification',
    undoable: true,
  },
};
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/tools/definitions/trimPlace.tsx src/types/types.ts
git commit -m "feat(trim): add tool options and Tool2D type for trimPlace"
```

---

### Task 4: Interaction Hook — `useTrimTool`

**Files:**
- Create: `src/components/PatternEditor/useTrimTool.ts`

- [ ] **Step 1: Create `useTrimTool` hook**

Create `src/components/PatternEditor/useTrimTool.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { PatternPiece, Point2D } from '../../types/types';
import type { Trim, TrimPlacement } from '../../types/trim';
import type { RootState, AppDispatch } from '../../store';
import { addTrim } from '../../store/projectSlice';
import { batchUndo } from '../../store/undoMiddleware';
import { getTrimPreset } from '../../utils/trim/trimLibrary';
import { TRIM_DEFAULTS } from '../../types/trim';
import { interpolateEdgePoint, computeEdgeLengthMM } from '../../utils/geometry/edgeInterpolation';
import { uid } from '../../utils/pathHelpers';

const EDGE_HIT_THRESHOLD = 20; // px screen space

export interface TrimHover {
  pieceId: string;
  edgeName: string;
  point: Point2D;
  t: number;
}

/**
 * Find the closest semantic edge point to a screen-space position.
 * Iterates all pieces and their semantic edges, projects the mouse point
 * onto each edge, and returns the closest hit within threshold.
 */
function findClosestEdgePoint(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
): TrimHover | null {
  let best: TrimHover | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (!piece.edges || piece.edges.length === 0) continue;

    for (const edge of piece.edges) {
      // Sample the edge at many t values to find closest point
      const steps = 50;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const result = interpolateEdgePoint(piece, edge.name, t);
        if (!result) continue;

        // Convert to world space (add piece position)
        const wx = piece.position.x + result.point.x;
        const wy = piece.position.y + result.point.y;
        const dist = Math.hypot(pt.x - wx, pt.y - wy) * zoom;

        if (dist < EDGE_HIT_THRESHOLD && dist < bestDist) {
          bestDist = dist;
          best = {
            pieceId: piece.id,
            edgeName: edge.name,
            point: { x: wx, y: wy },
            t,
          };
        }
      }
    }
  }

  return best;
}

export function useTrimTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  dispatch: AppDispatch,
) {
  const [hoveredEdge, setHoveredEdge] = useState<TrimHover | null>(null);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions['trimPlace'] ?? {});

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  }), [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    setHoveredEdge(findClosestEdgePoint(pt, pieces, zoom));
  }, [toPattern, pieces, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const hit = findClosestEdgePoint(pt, pieces, zoom);
    if (!hit) return;

    // Resolve preset
    const presetId = toolOptions.trimPreset as string | undefined;
    const preset = presetId ? getTrimPreset(presetId) : undefined;

    const type = preset?.type ?? TRIM_DEFAULTS.type;
    const name = preset?.name ?? TRIM_DEFAULTS.name;
    const material = preset?.material ?? TRIM_DEFAULTS.material;
    const color = preset?.color ?? TRIM_DEFAULTS.color;
    const size = preset?.size ?? TRIM_DEFAULTS.size;
    const unitCost = preset?.unitCost ?? TRIM_DEFAULTS.unitCost;

    const placementMode = (toolOptions.placementMode as string) ?? 'single';

    let placement: TrimPlacement;

    if (placementMode === 'distribute') {
      const piece = pieces.find(p => p.id === hit.pieceId);
      if (!piece) return;

      const count = (toolOptions.distributeCount as number) ?? 5;
      const startOffset = (toolOptions.startOffset as number) ?? 10;
      const endOffset = (toolOptions.endOffset as number) ?? 10;

      const edgeLen = computeEdgeLengthMM(piece, hit.edgeName);
      if (edgeLen <= 0) return;

      const tStart = Math.min(startOffset / edgeLen, 0.49);
      const tEnd = Math.max(1 - endOffset / edgeLen, 0.51);

      const positions: number[] = [];
      for (let i = 0; i < count; i++) {
        positions.push(count === 1 ? (tStart + tEnd) / 2 : tStart + i * (tEnd - tStart) / (count - 1));
      }

      placement = { mode: 'edge-points', edgeName: hit.edgeName, positions };
    } else {
      placement = { mode: 'edge-points', edgeName: hit.edgeName, positions: [hit.t] };
    }

    const trim: Trim = {
      id: uid(),
      pieceId: hit.pieceId,
      type,
      presetId: presetId,
      name,
      description: '',
      placement,
      material,
      color,
      size,
      unitCost,
      active: true,
    };

    batchUndo(dispatch, placementMode === 'distribute' ? 'Distribute trims' : 'Place trim', () => {
      dispatch(addTrim(trim));
    });
  }, [toPattern, pieces, zoom, dispatch, toolOptions]);

  return {
    hoveredEdge,
    handleMouseDown,
    handleMouseMove,
  };
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/PatternEditor/useTrimTool.ts
git commit -m "feat(trim): add useTrimTool interaction hook"
```

---

### Task 5: TrimToolOverlay — Hover Preview

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx`

- [ ] **Step 1: Create overlay component**

Create `src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx`:

```tsx
import type { TrimHover } from '../../useTrimTool';

interface TrimToolOverlayProps {
  zoom2D: number;
  hoveredEdge: TrimHover;
}

export default function TrimToolOverlay({ zoom2D, hoveredEdge }: TrimToolOverlayProps) {
  const r = 6 / zoom2D;
  const strokeW = 2 / zoom2D;

  return (
    <g className="trim-preview">
      {/* Snap dot */}
      <circle
        cx={hoveredEdge.point.x}
        cy={hoveredEdge.point.y}
        r={r * 0.6}
        fill="#ff9800"
        opacity={0.7}
      />
      {/* Ghost trim icon (dashed circle) */}
      <circle
        cx={hoveredEdge.point.x}
        cy={hoveredEdge.point.y}
        r={r}
        fill="none"
        stroke="#ff9800"
        strokeWidth={strokeW}
        strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
        opacity={0.5}
      />
    </g>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx
git commit -m "feat(trim): add TrimToolOverlay hover preview component"
```

---

### Task 6: TrimRenderer — Permanent Trim Visualization

**Files:**
- Create: `src/components/PatternEditor/renderers/TrimRenderer.tsx`

- [ ] **Step 1: Create TrimRenderer component**

Create `src/components/PatternEditor/renderers/TrimRenderer.tsx`:

```tsx
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import type { Trim, TrimType } from '../../../types/trim';
import type { PatternPiece, Point2D } from '../../../types/types';
import { interpolateEdgePoint } from '../../../utils/geometry/edgeInterpolation';

interface TrimIconProps {
  x: number;
  y: number;
  size: number;
  color: string;
  type: TrimType;
  zoom: number;
}

/** Renders an SVG icon for a trim type at a given position */
function TrimIcon({ x, y, size, color, type, zoom }: TrimIconProps) {
  // Size in pattern space (mm), clamped so it's visible at any zoom
  const r = Math.max(size / 2, 3 / zoom);
  const sw = 1 / zoom;

  switch (type) {
    case 'button':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={color} stroke="#666" strokeWidth={sw} />
          {/* 4-hole pattern */}
          <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x + r * 0.3} cy={y - r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x - r * 0.3} cy={y + r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x + r * 0.3} cy={y + r * 0.3} r={r * 0.12} fill="#999" />
        </g>
      );
    case 'snap':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={sw * 2} />
          <circle cx={x} cy={y} r={r * 0.5} fill={color} />
        </g>
      );
    case 'rivet':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={color} stroke="#666" strokeWidth={sw} />
          <circle cx={x} cy={y} r={r * 0.3} fill="#999" />
        </g>
      );
    case 'buckle':
      return (
        <rect
          x={x - r}
          y={y - r * 0.6}
          width={r * 2}
          height={r * 1.2}
          rx={r * 0.2}
          fill="none"
          stroke={color}
          strokeWidth={sw * 2}
        />
      );
    case 'ring':
      return <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={sw * 2} />;
    case 'hook-eye':
      return (
        <g>
          {/* Hook */}
          <path
            d={`M${x - r * 0.4},${y} Q${x - r * 0.4},${y - r * 0.6} ${x},${y - r * 0.6} Q${x + r * 0.4},${y - r * 0.6} ${x + r * 0.4},${y}`}
            fill="none"
            stroke={color}
            strokeWidth={sw * 2}
          />
          {/* Eye */}
          <circle cx={x} cy={y + r * 0.4} r={r * 0.3} fill="none" stroke={color} strokeWidth={sw * 1.5} />
        </g>
      );
    case 'drawstring-stop':
      return (
        <rect
          x={x - r * 0.4}
          y={y - r * 0.4}
          width={r * 0.8}
          height={r * 0.8}
          fill={color}
          stroke="#666"
          strokeWidth={sw}
        />
      );
    case 'zipper':
      // Zippers render as a line along the edge range — handled at the caller level
      return <circle cx={x} cy={y} r={r * 0.3} fill={color} />;
    case 'custom':
    default:
      // Diamond marker
      return (
        <polygon
          points={`${x},${y - r} ${x + r * 0.7},${y} ${x},${y + r} ${x - r * 0.7},${y}`}
          fill={color}
          stroke="#666"
          strokeWidth={sw}
        />
      );
  }
}

/** Resolve positions for a trim on a piece and render icons */
function TrimOnPiece({ trim, piece, zoom }: { trim: Trim; piece: PatternPiece; zoom: number }) {
  if (trim.placement.mode === 'edge-points') {
    return (
      <g>
        {trim.placement.positions.map((t, i) => {
          const result = interpolateEdgePoint(piece, trim.placement.edgeName, t);
          if (!result) return null;
          return (
            <TrimIcon
              key={`${trim.id}-${i}`}
              x={piece.position.x + result.point.x}
              y={piece.position.y + result.point.y}
              size={trim.size}
              color={trim.color}
              type={trim.type}
              zoom={zoom}
            />
          );
        })}
      </g>
    );
  }

  if (trim.placement.mode === 'edge') {
    // Render zipper as a thick dashed line along the edge range
    const steps = 20;
    const points: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = trim.placement.tStart + (i / steps) * (trim.placement.tEnd - trim.placement.tStart);
      const result = interpolateEdgePoint(piece, trim.placement.edgeName, t);
      if (result) {
        points.push({ x: piece.position.x + result.point.x, y: piece.position.y + result.point.y });
      }
    }
    if (points.length < 2) return null;
    const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const sw = Math.max(trim.size / 2, 2 / zoom);
    return (
      <path
        d={d}
        fill="none"
        stroke={trim.color}
        strokeWidth={sw}
        strokeDasharray={`${4 / zoom} ${2 / zoom}`}
        strokeLinecap="round"
      />
    );
  }

  if (trim.placement.mode === 'point') {
    return (
      <g>
        {trim.placement.positions.map((pos, i) => (
          <TrimIcon
            key={`${trim.id}-${i}`}
            x={piece.position.x + pos.x}
            y={piece.position.y + pos.y}
            size={trim.size}
            color={trim.color}
            type={trim.type}
            zoom={zoom}
          />
        ))}
      </g>
    );
  }

  // count mode — no spatial rendering
  return null;
}

interface TrimRendererProps {
  zoom2D: number;
}

export default function TrimRenderer({ zoom2D }: TrimRendererProps) {
  const trims = useSelector((s: RootState) => s.project.trims);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  if (trims.length === 0) return null;

  const pieceMap = new Map(pieces.map(p => [p.id, p]));

  return (
    <g className="trim-renderer">
      {trims
        .filter(t => t.active)
        .map(trim => {
          const piece = pieceMap.get(trim.pieceId);
          if (!piece) return null;
          return <TrimOnPiece key={trim.id} trim={trim} piece={piece} zoom={zoom2D} />;
        })}
    </g>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/TrimRenderer.tsx
git commit -m "feat(trim): add TrimRenderer with 9 SVG trim type icons"
```

---

### Task 7: Wire Everything — PatternEditor + useEditorInteractions + Toolbar + ToolOverlay

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/Toolbar2D/Toolbar2D.tsx`

- [ ] **Step 1: Add `trimPlace` to Toolbar2D TOOL_GROUPS**

In `src/components/Toolbar2D/Toolbar2D.tsx`, change the sewing group (line ~40) to include `'trimPlace'`:

```typescript
  // ─── Sewing ───
  ['seam', 'freesewing', 'elastic', 'trimPlace'],
```

Remove the standalone `['trimPlace']` if it exists elsewhere in TOOL_GROUPS.

- [ ] **Step 2: Instantiate useTrimTool in PatternEditor**

In `src/components/PatternEditor/PatternEditor.tsx`:

Add import at the top (near line 14):
```typescript
import { useTrimTool } from './useTrimTool';
```

Add import for TrimRenderer (near the renderer imports):
```typescript
import TrimRenderer from './renderers/TrimRenderer';
```

After the `notchTool` instantiation (around line 169), add:
```typescript
const trimTool = useTrimTool(zoom2D, pan2D, pieces, dispatch);
```

Add `trimTool` to the tools object passed to `useEditorInteractions` (around line 462):
```typescript
pen, rectTool, lineTool, seamTool, notchTool, trimTool, grainlineTool, ...
```

In the JSX, add `<TrimRenderer zoom2D={zoom2D} />` after `<ElasticRenderer>` (around line 633):
```tsx
<ElasticRenderer zoom2D={zoom2D} />
<TrimRenderer zoom2D={zoom2D} />
```

Pass `trimHoveredEdge` to `ToolOverlay`:
```typescript
trimHoveredEdge={trimTool.hoveredEdge}
```

- [ ] **Step 3: Route trimPlace events in useEditorInteractions**

In `src/components/PatternEditor/useEditorInteractions.ts`:

Add to the tools parameter type (around line 96):
```typescript
trimTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void };
```

Destructure `trimTool` in the tools object (around line 231):
```typescript
const { ..., notchTool, trimTool, grainlineTool, ... } = tools;
```

Add mouseDown routing (after the notch block, around line 382):
```typescript
if (activeTool === 'trimPlace') { trimTool.handleMouseDown(e); return; }
```

Add mouseMove routing (after the notch block, around line 613):
```typescript
if (activeTool === 'trimPlace') trimTool.handleMouseMove(e);
```

Add cursor case (around line 713):
```typescript
case 'trimPlace': return 'crosshair';
```

Add `trimTool` to both useCallback dependency arrays.

- [ ] **Step 4: Add TrimToolOverlay to ToolOverlay**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:

Add import:
```typescript
import TrimToolOverlay from './overlays/TrimToolOverlay';
import type { TrimHover } from '../useTrimTool';
```

Add to props interface:
```typescript
trimHoveredEdge: TrimHover | null;
```

Add rendering block (after the notch overlay block, around line 178):
```tsx
{activeTool === 'trimPlace' && props.trimHoveredEdge && (
  <TrimToolOverlay zoom2D={zoom2D} hoveredEdge={props.trimHoveredEdge} />
)}
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/Toolbar2D/Toolbar2D.tsx
git commit -m "feat(trim): wire trimPlace tool into editor, toolbar, and overlay"
```

---

### Task 8: BOM Integration — Handle `edge-points` in trimExtractor

**Files:**
- Modify: `src/utils/trim/trimExtractor.ts:63-84`
- Test: `src/utils/trim/__tests__/trimExtractor.test.ts` (extend)

- [ ] **Step 1: Write failing test for edge-points BOM extraction**

Add to `src/utils/trim/__tests__/trimExtractor.test.ts`:

```typescript
it('groups edge-points trims by type+name and sums position counts', () => {
  const pieces = [makeRectPiece('p1'), makeRectPiece('p2')];
  const trims: Trim[] = [
    makeTrim({
      id: 't1',
      pieceId: 'p1',
      type: 'button',
      name: 'Flat 20mm',
      unitCost: 0.20,
      placement: { mode: 'edge-points' as const, edgeName: 'side', positions: [0.2, 0.4, 0.6] },
    }),
    makeTrim({
      id: 't2',
      pieceId: 'p2',
      type: 'button',
      name: 'Flat 20mm',
      unitCost: 0.20,
      placement: { mode: 'edge-points' as const, edgeName: 'side', positions: [0.3, 0.7] },
    }),
  ];

  const result = extractTrims(trims, pieces);
  expect(result).toHaveLength(1);
  expect(result[0].quantity).toBe(5);
  expect(result[0].unit).toBe('pieces');
  expect(result[0].name).toBe('button \u2014 Flat 20mm');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/trim/__tests__/trimExtractor.test.ts`
Expected: FAIL — `edge-points` mode not handled

- [ ] **Step 3: Add `edge-points` handling to extractTrims**

In `src/utils/trim/trimExtractor.ts`, add a new `else if` block after the `point` mode block (around line 83):

```typescript
    } else if (trim.placement.mode === 'edge-points') {
      const g = countGroups.get(key) ?? { quantity: 0, unitCost: trim.unitCost, pieceIds: new Set(), name: trim.name, type: trim.type };
      g.quantity += trim.placement.positions.length;
      g.pieceIds.add(trim.pieceId);
      countGroups.set(key, g);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/trim/__tests__/trimExtractor.test.ts`
Expected: PASS (all tests including new one)

- [ ] **Step 5: Commit**

```bash
git add src/utils/trim/trimExtractor.ts src/utils/trim/__tests__/trimExtractor.test.ts
git commit -m "feat(trim): add edge-points BOM extraction to trimExtractor"
```

---

### Task 9: Copilot Tools — Extend addTrim + Add distribute + mirror

**Files:**
- Modify: `src/copilot/action/tools/definitions/trimTools.ts`

- [ ] **Step 1: Add new imports at top of file**

In `src/copilot/action/tools/definitions/trimTools.ts`, add these imports at the top with the other imports:

```typescript
import { computeEdgeLengthMM } from '../../../../utils/geometry/edgeInterpolation';
import { batchUndo } from '../../../../store/undoMiddleware';
```

- [ ] **Step 2: Add `edge-points` support to addTrim tool**

In `src/copilot/action/tools/definitions/trimTools.ts`:

Update the `placementMode` enum in the `addTrimTool` parameters (around line 36):
```typescript
placementMode: {
  type: 'string',
  enum: ['edge', 'edge-points', 'count'],
  description: 'Placement mode: "edge" for edge range, "edge-points" for discrete positions along edge, "count" for quantity-based / Modo: "edge" rango, "edge-points" posiciones discretas, "count" cantidad',
},
```

Add `positions` parameter:
```typescript
positions: {
  type: 'array',
  items: { type: 'number' },
  description: 'Parametric positions (0-1) along edge — required if placementMode is "edge-points" / Posiciones parametricas (0-1)',
},
```

Add the `edge-points` placement branch in the execute function (after the `edge` branch, around line 119):
```typescript
} else if (placementMode === 'edge-points') {
  const edgeName = params.edgeName as string | undefined;
  if (!edgeName) return { success: false, error: 'edgeName is required when placementMode is "edge-points"' };
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return { success: false, error: `Edge "${edgeName}" not found on piece "${params.pieceId}"` };
  const positions = params.positions as number[] | undefined;
  if (!positions || positions.length === 0) return { success: false, error: 'positions array is required for edge-points mode' };
  if (positions.some(t => t < 0 || t > 1)) return { success: false, error: 'All positions must be between 0 and 1' };
  placement = { mode: 'edge-points', edgeName, positions };
}
```

Update the `placementMode` cast to include `'edge-points'`:
```typescript
const placementMode = params.placementMode as 'edge' | 'edge-points' | 'count';
```

- [ ] **Step 3: Add `distributeTrimAlongEdge` tool**

Add after the `listTrimPresetsTool` definition (before the export):

```typescript
// ─── distributeTrimAlongEdge ───────────────────────────────────────────────

const distributeTrimAlongEdgeTool: ToolDefinition = {
  name: 'distributeTrimAlongEdge',
  description:
    'Distribute N trims evenly along a named semantic edge. Creates a single trim with edge-points placement. ' +
    '/ Distribuir N avios uniformemente a lo largo de un borde semantico nombrado.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      edgeName: { type: 'string', description: 'Edge name / Nombre del borde' },
      presetId: { type: 'string', description: 'Optional preset ID / ID de preset opcional' },
      count: { type: 'number', description: 'Number of trims to distribute (2-20) / Cantidad de avios (2-20)' },
      startOffset: { type: 'number', description: 'Start offset in mm (default 10) / Desplazamiento inicial en mm (defecto 10)' },
      endOffset: { type: 'number', description: 'End offset in mm (default 10) / Desplazamiento final en mm (defecto 10)' },
    },
    required: ['pieceId', 'edgeName', 'count'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const edgeName = params.edgeName as string;
    const edge = piece.edges?.find(e => e.name === edgeName);
    if (!edge) return { success: false, error: `Edge "${edgeName}" not found on piece "${params.pieceId}"` };

    const count = params.count as number;
    if (count < 2 || count > 20) return { success: false, error: 'count must be between 2 and 20' };

    const startOffset = (params.startOffset as number | undefined) ?? 10;
    const endOffset = (params.endOffset as number | undefined) ?? 10;

    const edgeLen = computeEdgeLengthMM(piece, edgeName);
    if (edgeLen <= 0) return { success: false, error: 'Edge has zero length' };

    const tStart = Math.min(startOffset / edgeLen, 0.49);
    const tEnd = Math.max(1 - endOffset / edgeLen, 0.51);

    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
      positions.push(count === 1 ? (tStart + tEnd) / 2 : tStart + i * (tEnd - tStart) / (count - 1));
    }

    const preset = params.presetId ? getTrimPreset(params.presetId as string) : undefined;
    if (params.presetId && !preset) return { success: false, error: `Preset "${params.presetId}" not found` };

    const id = uid();
    const trim: Trim = {
      id,
      pieceId: params.pieceId as string,
      type: preset?.type ?? TRIM_DEFAULTS.type,
      presetId: params.presetId as string | undefined,
      name: preset?.name ?? TRIM_DEFAULTS.name,
      description: '',
      placement: { mode: 'edge-points', edgeName, positions },
      material: preset?.material ?? TRIM_DEFAULTS.material,
      color: preset?.color ?? TRIM_DEFAULTS.color,
      size: preset?.size ?? TRIM_DEFAULTS.size,
      unitCost: preset?.unitCost ?? TRIM_DEFAULTS.unitCost,
      active: true,
    };

    batchUndo(dispatch, 'Distribute trims along edge', () => {
      dispatch(addTrim(trim));
    });

    return {
      success: true,
      data: { trimId: id, pieceId: params.pieceId, edgeName, count, positions },
    };
  },
};
```

- [ ] **Step 4: Add `mirrorTrimsToSymmetric` tool**

Add after the `distributeTrimAlongEdgeTool`:

```typescript
// ─── mirrorTrimsToSymmetric ────────────────────────────────────────────────

const mirrorTrimsToSymmetricTool: ToolDefinition = {
  name: 'mirrorTrimsToSymmetric',
  description:
    'Mirror trims from a piece to its linked symmetric piece. ' +
    'For edge-points trims, positions are mirrored (1-t). ' +
    '/ Espejo de avios de una pieza a su pieza simetrica vinculada.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Source piece ID / ID de la pieza origen' },
      trimId: { type: 'string', description: 'Optional: mirror only this trim / Opcional: solo espejar este avio' },
    },
    required: ['pieceId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    if (!piece.linkedPieceId || piece.linkMode !== 'symmetry') {
      return { success: false, error: 'Piece has no symmetric linked piece' };
    }

    const targetPiece = state.project.pieces.find(p => p.id === piece.linkedPieceId);
    if (!targetPiece) return { success: false, error: `Linked piece "${piece.linkedPieceId}" not found` };

    let trimsToMirror = state.project.trims.filter(t => t.pieceId === piece.id && t.active);
    if (params.trimId) {
      trimsToMirror = trimsToMirror.filter(t => t.id === params.trimId);
      if (trimsToMirror.length === 0) return { success: false, error: `Trim "${params.trimId}" not found on piece` };
    }

    if (trimsToMirror.length === 0) return { success: false, error: 'No active trims to mirror' };

    const mirroredIds: string[] = [];

    batchUndo(dispatch, 'Mirror trims to symmetric piece', () => {
      for (const trim of trimsToMirror) {
        let mirroredPlacement = trim.placement;

        if (trim.placement.mode === 'edge-points') {
          const targetEdge = targetPiece.edges?.find(e => e.name === trim.placement.edgeName);
          if (!targetEdge) continue;
          mirroredPlacement = {
            mode: 'edge-points',
            edgeName: trim.placement.edgeName,
            positions: trim.placement.positions.map(t => 1 - t),
          };
        } else if (trim.placement.mode === 'edge') {
          const targetEdge = targetPiece.edges?.find(e => e.name === trim.placement.edgeName);
          if (!targetEdge) continue;
          mirroredPlacement = {
            mode: 'edge',
            edgeName: trim.placement.edgeName,
            tStart: 1 - trim.placement.tEnd,
            tEnd: 1 - trim.placement.tStart,
          };
        }

        const mirroredId = uid();
        mirroredIds.push(mirroredId);

        dispatch(addTrim({
          ...trim,
          id: mirroredId,
          pieceId: targetPiece.id,
          placement: mirroredPlacement,
        }));
      }
    });

    return {
      success: true,
      data: { mirroredCount: mirroredIds.length, mirroredIds, targetPieceId: targetPiece.id },
    };
  },
};
```

- [ ] **Step 5: Update the export array**

Update the export at the bottom of the file:

```typescript
export const tools: ToolDefinition[] = [
  addTrimTool,
  removeTrimTool,
  updateTrimTool,
  listTrimsTool,
  listTrimPresetsTool,
  distributeTrimAlongEdgeTool,
  mirrorTrimsToSymmetricTool,
];
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/copilot/action/tools/definitions/trimTools.ts
git commit -m "feat(trim): add edge-points to addTrim, distribute and mirror copilot tools"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify no lint errors on changed files**

Run: `npx eslint src/types/trim.ts src/tools/definitions/trimPlace.tsx src/utils/geometry/edgeInterpolation.ts src/components/PatternEditor/useTrimTool.ts src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx src/components/PatternEditor/renderers/TrimRenderer.tsx src/utils/trim/trimExtractor.ts src/copilot/action/tools/definitions/trimTools.ts`
Expected: No errors

- [ ] **Step 4: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "fix(trim): lint cleanup"
```

---

### Deferred Items (follow-up PRs)

These spec requirements are deferred to keep this PR focused on core placement:

- **Snap-to-point (Shift modifier):** Spec section 3 mentions attracting to edge endpoints and construction points when Shift is held. Can be added to `useTrimTool` as a small follow-up.
- **Trim selection + right-click context menu:** Spec section 4b mentions click-to-select rendered trims and a context menu with Mirror/Delete/Edit Properties. Requires selection state, hit testing on rendered icons, and a context menu component. The mirror and delete operations are accessible via copilot tools now.
- **Distribute mode overlay preview:** The TrimToolOverlay shows a single snap point preview. In distribute mode, it could show all N ghost positions with spacing lines. Deferred for UX polish.
