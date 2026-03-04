# Segment Sewing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a segment sewing tool that lets users sew partial edge segments between pattern pieces via a 4-click interaction.

**Architecture:** New tool definition + hook + overlay following the existing seam tool pattern. Uses `flattenPath()` + segment projection for snap-to-outline (same as scissors/measure). The Seam data model already supports partial edges via `edgeStart`/`edgeEnd` parametric values, so no backend changes needed.

**Tech Stack:** React, Redux, SVG, TypeScript, Vitest

---

### Task 1: Add `segmentSewing` to Tool2D type and create tool definition

**Files:**
- Modify: `src/types/types.ts` (add to Tool2D union)
- Create: `src/tools/definitions/segmentSewing.tsx`
- Modify: `src/tools/index.ts` (register tool)

**Step 1: Add `segmentSewing` to Tool2D union**

In `src/types/types.ts`, find the `Tool2D` type union. After the `'seam'` entry, add `'segmentSewing'`:

```typescript
  | 'seam'          // connect edges between pieces
  | 'segmentSewing' // connect partial edge segments
```

**Step 2: Create tool definition**

Create `src/tools/definitions/segmentSewing.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const SegmentSewingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Two partial edges with connection */}
    <path d="M3 4V14" opacity={0.3} />
    <path d="M3 7V11" strokeWidth={2.5} />
    <path d="M15 4V14" opacity={0.3} />
    <path d="M15 7V11" strokeWidth={2.5} />
    <path d="M3 9L15 9" strokeWidth="1" strokeDasharray="2 1.5" />
  </svg>
);

export const segmentSewingTool: ToolDefinition = {
  id: 'segmentSewing',
  name: 'Segment Sewing',
  description: 'Sew partial edge segments between pieces',
  context: '2d',
  shortcut: 'n',
  icon: SegmentSewingIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'seamType',
      label: 'Seam Type',
      type: 'select',
      value: 'standard',
      choices: [
        { label: 'Standard', value: 'standard' },
        { label: 'French', value: 'french' },
        { label: 'Flat-Felled', value: 'flat-felled' },
        { label: 'Overlock', value: 'overlock' },
      ],
    },
  ],
  copilot: {
    description: 'Sew partial edge segments between pattern pieces. Unlike full-edge seam, this lets you select a sub-portion of each edge to sew. Useful for set-in sleeves, yokes, and panel inserts.',
    examples: [
      'Sew the top half of the side seam',
      'Connect part of the sleeve to the armhole',
      'Join a partial seam for the yoke',
    ],
    keywords: ['segment', 'partial', 'sew', 'sub-edge', 'range'],
    requiresSelection: 'none',
    produces: 'seam',
    undoable: true,
    parameterHints: {
      seamType: 'Type of seam construction',
    },
  },
};
```

**Step 3: Register the tool**

In `src/tools/index.ts`, add the import alongside the other sewing tools:

```typescript
import { segmentSewingTool } from './definitions/segmentSewing';
```

Add `segmentSewingTool` to the `allTools` array, right after `seamTool`.

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/types/types.ts src/tools/definitions/segmentSewing.tsx src/tools/index.ts
git commit -m "feat(tools): add segmentSewing tool definition and type"
```

---

### Task 2: Create `useSegmentSewingTool` hook with snap-to-outline and state machine

**Files:**
- Create: `src/components/PatternEditor/useSegmentSewingTool.ts`
- Create: `src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts`

**Context:** The hook implements a 4-click state machine:
1. Click edge A start → 2. Click edge A end → 3. Click edge B start → 4. Click edge B end → Enter confirms.

Each click snaps to the nearest outline point using `flattenPath()` from `src/utils/seam/index.ts`. The snap result includes the `edgeIndex` (which PathCommand segment) and `t` (parametric position 0-1 along that segment).

**Step 1: Write the unit tests**

Create `src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { snapToEdge, SegmentSelection } from '../useSegmentSewingTool';
import type { PatternPiece } from '../../../types/types';

// A simple square piece: M 0,0 L 100,0 L 100,100 L 0,100 Z
const squarePiece: PatternPiece = {
  id: 'p1',
  name: 'Square',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: top (0,0)→(100,0)
    { type: 'L', values: [100, 100] }, // edge 2: right (100,0)→(100,100)
    { type: 'L', values: [0, 100] },   // edge 3: bottom (100,100)→(0,100)
    { type: 'Z', values: [] },          // edge 4: left (0,100)→(0,0)
  ],
  position: { x: 0, y: 0 },
  internals: [],
  createdAt: 0,
  updatedAt: 0,
};

describe('snapToEdge', () => {
  it('snaps to middle of top edge', () => {
    const result = snapToEdge({ x: 50, y: 2 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1); // top edge
    expect(result!.point.x).toBeCloseTo(50, 0);
    expect(result!.point.y).toBeCloseTo(0, 0);
    expect(result!.t).toBeCloseTo(0.5, 1);
  });

  it('snaps to start of right edge', () => {
    const result = snapToEdge({ x: 98, y: 5 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(2); // right edge
    expect(result!.point.x).toBeCloseTo(100, 0);
    expect(result!.t).toBeLessThan(0.1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToEdge({ x: 50, y: 50 }, squarePiece, 1);
    expect(result).toBeNull();
  });

  it('accounts for piece position offset', () => {
    const offsetPiece = { ...squarePiece, position: { x: 200, y: 200 } };
    const result = snapToEdge({ x: 250, y: 202 }, offsetPiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(250, 0);
    expect(result!.point.y).toBeCloseTo(200, 0);
  });

  it('constrains to same edge when edgeConstraint is given', () => {
    // Point near top edge but closer to right edge — should still snap to top if constrained
    const result = snapToEdge({ x: 95, y: 5 }, squarePiece, 1, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1); // constrained to edge 1
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts`
Expected: FAIL — `snapToEdge` is not exported / doesn't exist

**Step 3: Implement the hook**

Create `src/components/PatternEditor/useSegmentSewingTool.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addSeam } from '../../store/projectSlice';
import { selectSeam } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { getEdgeEndpoints } from './useSeamTool';

// ─── Types ────────────────────────────────────────────────────────────

export interface SnapResult {
  /** Canvas-space point (includes piece position offset) */
  point: Point2D;
  /** Which PathCommand index this edge belongs to (1-based) */
  edgeIndex: number;
  /** Parametric position along the edge (0 = start, 1 = end) */
  t: number;
  /** The piece this snap belongs to */
  pieceId: string;
}

export interface SegmentSelection {
  pieceId: string;
  edgeIndex: number;
  startT: number;
  endT: number;
  startPoint: Point2D;
  endPoint: Point2D;
}

type Phase = 'idle' | 'a_start' | 'a_end' | 'b_start' | 'b_end';

interface SegmentSewingState {
  phase: Phase;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  /** Partial snap for segment-in-progress */
  pendingSnap: SnapResult | null;
  /** Current hover snap point */
  hoveredSnap: SnapResult | null;
}

const SNAP_THRESHOLD = 8; // screen pixels

// ─── Pure functions (exported for testing) ────────────────────────────

/**
 * Snap a canvas-space point to the nearest edge of a piece.
 * Returns the closest point on any edge within threshold.
 * If `edgeConstraint` is provided, only snaps to that specific edge.
 */
export function snapToEdge(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
  edgeConstraint?: number,
): SnapResult | null {
  const threshold = SNAP_THRESHOLD / zoom;
  const cmds = piece.outline;
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;
  const localPt = { x: pt.x - ox, y: pt.y - oy };

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (let i = 1; i < cmds.length; i++) {
    if (edgeConstraint !== undefined && i !== edgeConstraint) continue;

    const ep = getEdgeEndpoints(cmds, i);
    if (!ep) continue;

    // Project localPt onto edge segment
    const dx = ep.end.x - ep.start.x;
    const dy = ep.end.y - ep.start.y;
    const lenSq = dx * dx + dy * dy;

    let t: number;
    let closest: Point2D;

    if (lenSq === 0) {
      t = 0;
      closest = ep.start;
    } else {
      t = ((localPt.x - ep.start.x) * dx + (localPt.y - ep.start.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      closest = {
        x: ep.start.x + t * dx,
        y: ep.start.y + t * dy,
      };
    }

    const dist = Math.hypot(localPt.x - closest.x, localPt.y - closest.y);
    if (dist < threshold && dist < bestDist) {
      bestDist = dist;
      best = {
        point: { x: closest.x + ox, y: closest.y + oy },
        edgeIndex: i,
        t,
        pieceId: piece.id,
      };
    }
  }

  return best;
}

/**
 * Find the closest edge snap across all pieces.
 */
function snapToAnyEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  constrainPieceId?: string,
  constrainEdge?: number,
): SnapResult | null {
  if (constrainPieceId) {
    const piece = pieces.find(p => p.id === constrainPieceId);
    if (!piece) return null;
    return snapToEdge(pt, piece, zoom, constrainEdge);
  }

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    const snap = snapToEdge(pt, piece, zoom);
    if (snap) {
      const dist = Math.hypot(pt.x - snap.point.x, pt.y - snap.point.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = snap;
      }
    }
  }

  return best;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSegmentSewingTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
) {
  const dispatch = useDispatch();
  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.segmentSewing?.seamType as string) ?? 'standard',
  );

  const [state, setState] = useState<SegmentSewingState>({
    phase: 'idle',
    segmentA: null,
    segmentB: null,
    pendingSnap: null,
    hoveredSnap: null,
  });

  const svgRectRef = useRef<DOMRect | null>(null);

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      svgRectRef.current = rect;
      return {
        x: (e.clientX - rect.left - pan2D.x) / zoom2D,
        y: (e.clientY - rect.top - pan2D.y) / zoom2D,
      };
    },
    [zoom2D, pan2D],
  );

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      segmentA: null,
      segmentB: null,
      pendingSnap: null,
      hoveredSnap: null,
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const pt = toPattern(e);

      setState(prev => {
        switch (prev.phase) {
          case 'idle': {
            // Click 1: select start of segment A on any piece
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap) return prev;
            return {
              ...prev,
              phase: 'a_start',
              pendingSnap: snap,
              segmentA: null,
              segmentB: null,
            };
          }

          case 'a_start': {
            // Click 2: select end of segment A on SAME edge
            if (!prev.pendingSnap) return prev;
            const snap = snapToAnyEdge(
              pt, pieces, zoom2D,
              prev.pendingSnap.pieceId,
              prev.pendingSnap.edgeIndex,
            );
            if (!snap) return prev;

            // Ensure start < end parametrically
            const startT = Math.min(prev.pendingSnap.t, snap.t);
            const endT = Math.max(prev.pendingSnap.t, snap.t);
            const startPt = startT === prev.pendingSnap.t ? prev.pendingSnap.point : snap.point;
            const endPt = endT === snap.t ? snap.point : prev.pendingSnap.point;

            // Reject zero-length selection
            if (Math.abs(endT - startT) < 0.01) return prev;

            return {
              ...prev,
              phase: 'a_end',
              segmentA: {
                pieceId: prev.pendingSnap.pieceId,
                edgeIndex: prev.pendingSnap.edgeIndex,
                startT,
                endT,
                startPoint: startPt,
                endPoint: endPt,
              },
              pendingSnap: null,
            };
          }

          case 'a_end': {
            // Click 3: select start of segment B on any OTHER piece
            if (!prev.segmentA) return prev;
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap || snap.pieceId === prev.segmentA.pieceId) return prev;
            return {
              ...prev,
              phase: 'b_start',
              pendingSnap: snap,
            };
          }

          case 'b_start': {
            // Click 4: select end of segment B on SAME edge
            if (!prev.pendingSnap) return prev;
            const snap = snapToAnyEdge(
              pt, pieces, zoom2D,
              prev.pendingSnap.pieceId,
              prev.pendingSnap.edgeIndex,
            );
            if (!snap) return prev;

            const startT = Math.min(prev.pendingSnap.t, snap.t);
            const endT = Math.max(prev.pendingSnap.t, snap.t);
            const startPt = startT === prev.pendingSnap.t ? prev.pendingSnap.point : snap.point;
            const endPt = endT === snap.t ? snap.point : prev.pendingSnap.point;

            if (Math.abs(endT - startT) < 0.01) return prev;

            return {
              ...prev,
              phase: 'b_end',
              segmentB: {
                pieceId: prev.pendingSnap.pieceId,
                edgeIndex: prev.pendingSnap.edgeIndex,
                startT,
                endT,
                startPoint: startPt,
                endPoint: endPt,
              },
              pendingSnap: null,
            };
          }

          default:
            return prev;
        }
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);

      setState(prev => {
        let constrainPiece: string | undefined;
        let constrainEdge: number | undefined;

        // When selecting end of a segment, constrain to same piece + edge
        if (prev.phase === 'a_start' && prev.pendingSnap) {
          constrainPiece = prev.pendingSnap.pieceId;
          constrainEdge = prev.pendingSnap.edgeIndex;
        } else if (prev.phase === 'b_start' && prev.pendingSnap) {
          constrainPiece = prev.pendingSnap.pieceId;
          constrainEdge = prev.pendingSnap.edgeIndex;
        } else if (prev.phase === 'a_end' && prev.segmentA) {
          // Exclude piece A when looking for piece B
          // (handled by snapToAnyEdge returning any piece, we filter in handleMouseDown)
        }

        const snap = snapToAnyEdge(pt, pieces, zoom2D, constrainPiece, constrainEdge);
        return { ...prev, hoveredSnap: snap };
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
        return;
      }
      if (e.key === 'Backspace') {
        setState(prev => {
          switch (prev.phase) {
            case 'a_start':
              return { ...prev, phase: 'idle', pendingSnap: null };
            case 'a_end':
              return { ...prev, phase: 'idle', segmentA: null, pendingSnap: null };
            case 'b_start':
              return { ...prev, phase: 'a_end', pendingSnap: null };
            case 'b_end':
              return { ...prev, phase: 'a_end', segmentB: null, pendingSnap: null };
            default:
              return prev;
          }
        });
        return;
      }
      if (e.key === 'Enter' && state.phase === 'b_end' && state.segmentA && state.segmentB) {
        // Create the seam
        const seam: Omit<Seam, 'id'> = {
          pieceA: {
            pieceId: state.segmentA.pieceId,
            edgeStart: state.segmentA.edgeIndex,
            edgeEnd: state.segmentA.edgeIndex,
          },
          pieceB: {
            pieceId: state.segmentB.pieceId,
            edgeStart: state.segmentB.edgeIndex,
            edgeEnd: state.segmentB.edgeIndex,
          },
          type: seamType as Seam['type'],
        };
        const fullSeam: Seam = { ...seam, id: `seam-${Date.now()}` };
        dispatch(addSeam(fullSeam));
        dispatch(selectSeam(fullSeam.id));
        reset();
      }
    },
    [state.phase, state.segmentA, state.segmentB, seamType, dispatch, reset],
  );

  const getCursor = useCallback((): string => {
    if (state.hoveredSnap) return 'crosshair';
    return 'default';
  }, [state.hoveredSnap]);

  return {
    phase: state.phase,
    segmentA: state.segmentA,
    segmentB: state.segmentB,
    pendingSnap: state.pendingSnap,
    hoveredSnap: state.hoveredSnap,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    getCursor,
    reset,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts`
Expected: 5 tests PASS

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/PatternEditor/useSegmentSewingTool.ts src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts
git commit -m "feat(segmentSewing): add useSegmentSewingTool hook with snap-to-edge"
```

---

### Task 3: Create `SegmentSewingOverlay` component

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/SegmentSewingOverlay.tsx`

**Context:** This SVG overlay renders visual feedback during the 4-click interaction. It shows:
- Hover snap indicator (purple dot)
- Pending snap points (anchor dots)
- Selected segment highlights (thick colored lines along edges)
- Dashed connector between segment midpoints when both are selected

Reference the styling from `ScissorsOverlay.tsx` (anchor circles with white border) and `SeamToolOverlay.tsx` (colored edge highlights + dashed connector).

**Step 1: Create the overlay component**

Create `src/components/PatternEditor/renderers/overlays/SegmentSewingOverlay.tsx`:

```tsx
import type { Point2D, PatternPiece } from '../../../../types/types';
import type { SegmentSelection, SnapResult } from '../../useSegmentSewingTool';
import { getEdgeEndpoints } from '../../useSeamTool';

interface SegmentSewingOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  phase: string;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  pendingSnap: SnapResult | null;
  hoveredSnap: SnapResult | null;
}

/**
 * Render a highlighted portion of an edge between startT and endT.
 * Uses the edge endpoints and interpolates between them.
 */
function SegmentHighlight({
  segment,
  piece,
  color,
  zoom2D,
}: {
  segment: SegmentSelection;
  piece: PatternPiece | undefined;
  color: string;
  zoom2D: number;
}) {
  if (!piece) return null;
  const ep = getEdgeEndpoints(piece.outline, segment.edgeIndex);
  if (!ep) return null;

  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;

  // Interpolate start and end along the edge
  const x1 = ox + ep.start.x + (ep.end.x - ep.start.x) * segment.startT;
  const y1 = oy + ep.start.y + (ep.end.y - ep.start.y) * segment.startT;
  const x2 = ox + ep.start.x + (ep.end.x - ep.start.x) * segment.endT;
  const y2 = oy + ep.start.y + (ep.end.y - ep.start.y) * segment.endT;

  const r = 5 / zoom2D;

  return (
    <g>
      {/* Thick segment highlight */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={3.5 / zoom2D}
        strokeLinecap="round" pointerEvents="none"
      />
      {/* Endpoint markers */}
      <circle cx={x1} cy={y1} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
      <circle cx={x2} cy={y2} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
    </g>
  );
}

export default function SegmentSewingOverlay({
  zoom2D, pieces, phase, segmentA, segmentB, pendingSnap, hoveredSnap,
}: SegmentSewingOverlayProps) {
  const colorA = '#3498db'; // blue
  const colorB = '#2ecc71'; // green

  // Midpoints for dashed connector
  const midA = segmentA ? {
    x: (segmentA.startPoint.x + segmentA.endPoint.x) / 2,
    y: (segmentA.startPoint.y + segmentA.endPoint.y) / 2,
  } : null;
  const midB = segmentB ? {
    x: (segmentB.startPoint.x + segmentB.endPoint.x) / 2,
    y: (segmentB.startPoint.y + segmentB.endPoint.y) / 2,
  } : null;

  return (
    <g className="segment-sewing-overlay">
      {/* Hover snap indicator */}
      {hoveredSnap && (
        <circle
          cx={hoveredSnap.point.x} cy={hoveredSnap.point.y}
          r={4 / zoom2D} fill="#9c27b0" opacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Pending first-click snap point (shown during a_start and b_start phases) */}
      {pendingSnap && (
        <circle
          cx={pendingSnap.point.x} cy={pendingSnap.point.y}
          r={5 / zoom2D}
          fill={phase === 'a_start' ? colorA : colorB}
          stroke="#fff" strokeWidth={1.2 / zoom2D}
          pointerEvents="none"
        />
      )}

      {/* Segment A highlight */}
      {segmentA && (
        <SegmentHighlight
          segment={segmentA}
          piece={pieces.find(p => p.id === segmentA.pieceId)}
          color={colorA}
          zoom2D={zoom2D}
        />
      )}

      {/* Segment B highlight */}
      {segmentB && (
        <SegmentHighlight
          segment={segmentB}
          piece={pieces.find(p => p.id === segmentB.pieceId)}
          color={colorB}
          zoom2D={zoom2D}
        />
      )}

      {/* Dashed connector between segment midpoints */}
      {midA && midB && (
        <line
          x1={midA.x} y1={midA.y} x2={midB.x} y2={midB.y}
          stroke="#2ecc71" strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5} pointerEvents="none"
        />
      )}
    </g>
  );
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/SegmentSewingOverlay.tsx
git commit -m "feat(segmentSewing): add SegmentSewingOverlay component"
```

---

### Task 4: Wire hook into PatternEditor, ToolOverlay, and useEditorInteractions

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`

**Context:** This wires the new tool into the editor so it actually works. Follow the pattern used by the scissors and seam tools.

**Step 1: Add overlay props and rendering to ToolOverlay**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:

a) Add the import at the top, alongside the other overlay imports:

```typescript
import SegmentSewingOverlay from './overlays/SegmentSewingOverlay';
import type { SegmentSelection, SnapResult } from '../useSegmentSewingTool';
```

b) Add props to the `ToolOverlayProps` interface, after the merge section (around line 99):

```typescript
  // Segment Sewing
  segmentSewingPhase: string;
  segmentSewingSegmentA: SegmentSelection | null;
  segmentSewingSegmentB: SegmentSelection | null;
  segmentSewingPendingSnap: SnapResult | null;
  segmentSewingHoveredSnap: SnapResult | null;
```

c) Add the render block inside the `<>` fragment, after the merge overlay (around line 184):

```tsx
      {activeTool === 'segmentSewing' && (
        <SegmentSewingOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          phase={props.segmentSewingPhase}
          segmentA={props.segmentSewingSegmentA}
          segmentB={props.segmentSewingSegmentB}
          pendingSnap={props.segmentSewingPendingSnap}
          hoveredSnap={props.segmentSewingHoveredSnap}
        />
      )}
```

**Step 2: Instantiate hook and pass props in PatternEditor**

In `src/components/PatternEditor/PatternEditor.tsx`:

a) Add the import:

```typescript
import { useSegmentSewingTool } from './useSegmentSewingTool';
```

b) Instantiate the hook after `mergeTool` (around line 88):

```typescript
  const segmentSewingTool = useSegmentSewingTool(zoom2D, pan2D, pieces);
```

c) Add `segmentSewingTool` to the `useEditorInteractions` call (around line 179), inside the tools object:

```typescript
    { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, mergeTool, segmentSewingTool },
```

d) Add the overlay props to `<ToolOverlay>`, after the merge props (around line 272):

```tsx
            segmentSewingPhase={segmentSewingTool.phase}
            segmentSewingSegmentA={segmentSewingTool.segmentA}
            segmentSewingSegmentB={segmentSewingTool.segmentB}
            segmentSewingPendingSnap={segmentSewingTool.pendingSnap}
            segmentSewingHoveredSnap={segmentSewingTool.hoveredSnap}
```

**Step 3: Wire into useEditorInteractions**

In `src/components/PatternEditor/useEditorInteractions.ts`:

a) Add `segmentSewingTool` to the `ToolHooks` interface. Look at how `scissorsTool` is typed:

```typescript
  segmentSewingTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
```

b) Destructure it from the `tools` parameter alongside the other tools.

c) In the keyboard handler effect (find `if (activeTool === 'scissors') handlers.push(scissorsTool.handleKeyDown);`), add:

```typescript
    if (activeTool === 'segmentSewing') handlers.push(segmentSewingTool.handleKeyDown);
```

d) In `handleMouseDown` (find `if (activeTool === 'scissors')`), add:

```typescript
    if (activeTool === 'segmentSewing') { segmentSewingTool.handleMouseDown(e); return; }
```

e) In `handleMouseMove` (find `if (activeTool === 'scissors')`), add:

```typescript
    if (activeTool === 'segmentSewing') segmentSewingTool.handleMouseMove(e);
```

f) In `getCursor` switch/if chain, add:

```typescript
    case 'segmentSewing': return segmentSewingTool.getCursor();
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `npm run test`
Expected: All tests pass (2670+)

**Step 6: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(segmentSewing): wire tool into editor, overlay, and interactions"
```

---

### Task 5: Add keyboard shortcut and hint text

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/components/PatternEditor/renderers/HintText.tsx`

**Step 1: Add `N` shortcut to useKeyboardShortcuts**

In `src/hooks/useKeyboardShortcuts.ts`, in the "no modifiers" section (after the guard `if (ctrl || shift || e.altKey) return;`), find the block for `W — Pin` (around line 329). After that block, add:

```typescript
      // N — Segment Sewing
      if (key === 'n') {
        dispatch(setActiveTool('segmentSewing' as any));
        dispatch(setActiveTool2D('segmentSewing'));
        return;
      }
```

Also add to `_shortcutMap` array (in the 2D Tools section):

```typescript
      { key: 'N', label: 'Segment Sewing', category: '2D Tools', action: () => {} },
```

**Step 2: Add hint text for segment sewing**

In `src/components/PatternEditor/renderers/HintText.tsx`:

a) Add a new prop `segmentSewingPhase` to `HintTextProps`:

```typescript
interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  segmentSewingPhase?: string;
}
```

b) Add the hint text block before the closing `</>`:

```tsx
      {activeTool === 'segmentSewing' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Click on an edge to start segment A',
          a_start: 'Click further along the same edge to define segment A end',
          a_end: 'Click on a different piece to start segment B',
          b_start: 'Click further along the same edge to define segment B end',
          b_end: 'Press Enter to sew · Backspace to undo · Esc to cancel',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
            {msgs[segmentSewingPhase ?? 'idle'] ?? msgs.idle}
          </text>
        );
      })()}
```

c) In `PatternEditor.tsx`, pass the new prop to `<HintText>`:

```tsx
        <HintText
          activeTool={activeTool}
          pieces={pieces}
          penNodesLength={pen.nodes.length}
          nodeEditorIsEditing={nodeEditor.isEditing}
          segmentSewingPhase={segmentSewingTool.phase}
        />
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(segmentSewing): add N shortcut and hint text"
```
