# Topstitch Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 topstitch tools (Seamline, Segment, Free, Edit) with data model, rendering, copilot integration, and keyboard shortcuts.

**Architecture:** Extend `InternalLineType` with `'topstitch'` and add `TopstitchOptions` to `InternalLine`. One shared hook `useTopstitchTool` handles all 4 modes. Each mode has its own tool definition. PieceRenderer renders topstitch with a dashed stitch pattern.

**Tech Stack:** React, Redux, SVG, TypeScript, Vitest

---

### Task 1: Extend data model with topstitch types

**Files:**
- Modify: `src/types/types.ts`

**Step 1: Add topstitch to InternalLineType and TopstitchOptions**

In `src/types/types.ts`, find the `InternalLineType` union (around line 93):

```typescript
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat';
```

Change to:

```typescript
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch';
```

After the `NotchOptions` interface (around line 104), add:

```typescript
export interface TopstitchOptions {
  stitchType: 'straight' | 'zigzag' | 'triple';
  stitchLength: number;
  offset: number;
  threadColor: string;
  rows: number;
}
```

In the `InternalLine` interface, after `notchOptions?: NotchOptions;`, add:

```typescript
  topstitchOptions?: TopstitchOptions;
```

**Step 2: Add 4 topstitch tool IDs to Tool2D**

Find the `Tool2D` union. After `'segmentSewing'`, add:

```typescript
  | 'topstitchSeamline'
  | 'topstitchSegment'
  | 'topstitchFree'
  | 'topstitchEdit'
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/types/types.ts
git commit -m "feat(topstitch): add topstitch types and Tool2D entries"
```

---

### Task 2: Create 4 tool definitions and register them

**Files:**
- Create: `src/tools/definitions/topstitchSeamline.tsx`
- Create: `src/tools/definitions/topstitchSegment.tsx`
- Create: `src/tools/definitions/topstitchFree.tsx`
- Create: `src/tools/definitions/topstitchEdit.tsx`
- Modify: `src/tools/index.ts`

**Step 1: Create topstitchSeamline.tsx**

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchSeamlineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5L15 5" strokeDasharray="2 1.5" />
    <path d="M3 9L15 9" opacity={0.3} />
    <path d="M3 13L15 13" strokeDasharray="2 1.5" />
  </svg>
);

export const topstitchSeamlineTool: ToolDefinition = {
  id: 'topstitchSeamline',
  name: 'Seamline Topstitch',
  description: 'Add topstitch along a seam edge',
  context: '2d',
  shortcut: ';',
  icon: TopstitchSeamlineIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    { id: 'stitchType', label: 'Stitch Type', type: 'select', value: 'straight',
      choices: [{ label: 'Straight', value: 'straight' }, { label: 'Zigzag', value: 'zigzag' }, { label: 'Triple', value: 'triple' }] },
    { id: 'stitchLength', label: 'Stitch Length (mm)', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.5 },
    { id: 'offset', label: 'Offset (mm)', type: 'number', value: 5.0, min: 1.0, max: 20.0, step: 0.5 },
    { id: 'threadColor', label: 'Thread Color', type: 'color', value: '#333333' },
  ],
  copilot: {
    description: 'Add topstitch along an existing seam edge. Click a piece edge to auto-generate a topstitch line at the specified offset.',
    examples: ['Add topstitch along the shoulder seam', 'Topstitch the hem'],
    keywords: ['topstitch', 'stitch', 'seam', 'finishing'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern', offset: 'Distance from edge in mm' },
  },
};
```

**Step 2: Create topstitchSegment.tsx**

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchSegmentIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L15 9" opacity={0.3} />
    <path d="M6 5L12 5" strokeDasharray="2 1.5" strokeWidth={2} />
    <circle cx="6" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
  </svg>
);

export const topstitchSegmentTool: ToolDefinition = {
  id: 'topstitchSegment',
  name: 'Segment Topstitch',
  description: 'Add topstitch to a specific edge segment',
  context: '2d',
  shortcut: 'k',
  icon: TopstitchSegmentIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    { id: 'stitchType', label: 'Stitch Type', type: 'select', value: 'straight',
      choices: [{ label: 'Straight', value: 'straight' }, { label: 'Zigzag', value: 'zigzag' }, { label: 'Triple', value: 'triple' }] },
    { id: 'stitchLength', label: 'Stitch Length (mm)', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.5 },
    { id: 'offset', label: 'Offset (mm)', type: 'number', value: 5.0, min: 1.0, max: 20.0, step: 0.5 },
    { id: 'threadColor', label: 'Thread Color', type: 'color', value: '#333333' },
  ],
  copilot: {
    description: 'Add topstitch to a partial edge segment. Click two points on an edge to define the segment.',
    examples: ['Topstitch only the top half of the side seam'],
    keywords: ['topstitch', 'segment', 'partial', 'stitch'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern', offset: 'Distance from edge in mm' },
  },
};
```

**Step 3: Create topstitchFree.tsx**

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchFreeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 14L7 6L11 10L15 4" strokeDasharray="2 1.5" />
  </svg>
);

export const topstitchFreeTool: ToolDefinition = {
  id: 'topstitchFree',
  name: 'Free Topstitch',
  description: 'Draw freeform topstitch lines on a piece',
  context: '2d',
  shortcut: 'l',
  icon: TopstitchFreeIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    { id: 'stitchType', label: 'Stitch Type', type: 'select', value: 'straight',
      choices: [{ label: 'Straight', value: 'straight' }, { label: 'Zigzag', value: 'zigzag' }, { label: 'Triple', value: 'triple' }] },
    { id: 'stitchLength', label: 'Stitch Length (mm)', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.5 },
    { id: 'threadColor', label: 'Thread Color', type: 'color', value: '#333333' },
  ],
  copilot: {
    description: 'Draw freeform topstitch lines. Click points on a piece to create a polyline topstitch path.',
    examples: ['Draw a decorative topstitch line across the chest'],
    keywords: ['topstitch', 'free', 'freeform', 'draw', 'decorative'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern' },
  },
};
```

**Step 4: Create topstitchEdit.tsx**

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchEditIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L15 9" strokeDasharray="2 1.5" />
    <circle cx="6" cy="9" r="2" fill="none" />
    <circle cx="12" cy="9" r="2" fill="none" />
  </svg>
);

export const topstitchEditTool: ToolDefinition = {
  id: 'topstitchEdit',
  name: 'Edit Topstitch',
  description: 'Select and modify existing topstitch lines',
  context: '2d',
  shortcut: 't',
  icon: TopstitchEditIcon,
  cursor: 'default',
  group: 'sewing',
  options: [],
  copilot: {
    description: 'Select and edit existing topstitch lines. Click to select, drag endpoints to adjust, Backspace to delete.',
    examples: ['Select the shoulder topstitch', 'Move the hem topstitch'],
    keywords: ['topstitch', 'edit', 'select', 'modify', 'move'],
    requiresSelection: 'internalLine',
    produces: 'modification',
    undoable: true,
    parameterHints: {},
  },
};
```

**Step 5: Register all 4 tools in index.ts**

In `src/tools/index.ts`, add imports alongside the other sewing tool imports:

```typescript
import { topstitchSeamlineTool } from './definitions/topstitchSeamline';
import { topstitchSegmentTool } from './definitions/topstitchSegment';
import { topstitchFreeTool } from './definitions/topstitchFree';
import { topstitchEditTool } from './definitions/topstitchEdit';
```

Add all 4 to the `allTools` array, after `segmentSewingTool`:

```typescript
  topstitchSeamlineTool,
  topstitchSegmentTool,
  topstitchFreeTool,
  topstitchEditTool,
```

**Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/tools/definitions/topstitchSeamline.tsx src/tools/definitions/topstitchSegment.tsx src/tools/definitions/topstitchFree.tsx src/tools/definitions/topstitchEdit.tsx src/tools/index.ts
git commit -m "feat(topstitch): add 4 tool definitions and register"
```

---

### Task 3: Create useTopstitchTool hook with tests

**Files:**
- Create: `src/components/PatternEditor/useTopstitchTool.ts`
- Create: `src/components/PatternEditor/__tests__/useTopstitchTool.test.ts`

**Context:** This shared hook handles all 4 topstitch modes. It uses `activeTool` from Redux to determine which mode is active. The modes are:

- **`topstitchSeamline`**: Click edge → generate offset path → add InternalLine
- **`topstitchSegment`**: Click 2 points on edge → generate offset segment path → add InternalLine
- **`topstitchFree`**: Click points on piece → build polyline → Enter confirms → add InternalLine
- **`topstitchEdit`**: Click to select existing topstitch InternalLine (delegates to existing internal line selection in useEditorInteractions)

The key pure function is `computeOffsetPath` which takes an edge (start, end points) and an offset distance, and returns the offset path commands.

**Step 1: Write the unit tests**

Create `src/components/PatternEditor/__tests__/useTopstitchTool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeOffsetPath, computeSegmentOffsetPath } from '../useTopstitchTool';
import type { PathCommand } from '../../../types/types';

describe('computeOffsetPath', () => {
  it('offsets a horizontal edge upward', () => {
    // Edge from (0,0) to (100,0), offset 5 → should produce path at y=-5
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const result = computeOffsetPath(start, end, 5);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('M');
    expect(result[0].values[0]).toBeCloseTo(0, 0);
    expect(result[0].values[1]).toBeCloseTo(-5, 0);
    expect(result[1].type).toBe('L');
    expect(result[1].values[0]).toBeCloseTo(100, 0);
    expect(result[1].values[1]).toBeCloseTo(-5, 0);
  });

  it('offsets a vertical edge to the left', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 100 };
    const result = computeOffsetPath(start, end, 5);
    expect(result[0].values[0]).toBeCloseTo(-5, 0); // offset to the left (inward)
    expect(result[0].values[1]).toBeCloseTo(0, 0);
  });

  it('returns empty array for zero-length edge', () => {
    const result = computeOffsetPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 5);
    expect(result).toHaveLength(0);
  });
});

describe('computeSegmentOffsetPath', () => {
  it('offsets a partial segment', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    // Segment from t=0.2 to t=0.8 → (20,0) to (80,0), offset 5 → y=-5
    const result = computeSegmentOffsetPath(start, end, 0.2, 0.8, 5);
    expect(result).toHaveLength(2);
    expect(result[0].values[0]).toBeCloseTo(20, 0);
    expect(result[0].values[1]).toBeCloseTo(-5, 0);
    expect(result[1].values[0]).toBeCloseTo(80, 0);
    expect(result[1].values[1]).toBeCloseTo(-5, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PatternEditor/__tests__/useTopstitchTool.test.ts`
Expected: FAIL — functions not exported

**Step 3: Implement the hook**

Create `src/components/PatternEditor/useTopstitchTool.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addInternalLine } from '../../store/projectSlice';
import { selectInternalLine } from '../../store/editorSlice';
import type { PatternPiece, Point2D, PathCommand, InternalLine, TopstitchOptions, Tool2D } from '../../types/types';
import { getEdgeEndpoints } from './useSeamTool';
import { snapToEdge } from './useSegmentSewingTool';

// ─── Pure functions (exported for testing) ────────────────────────────

/**
 * Compute an offset path parallel to an edge.
 * Offset is perpendicular to the left of the direction vector (inward for CW outlines).
 */
export function computeOffsetPath(
  start: Point2D,
  end: Point2D,
  offset: number,
): PathCommand[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];

  // Perpendicular unit vector (rotate -90°: left side)
  const nx = -dy / len;
  const ny = dx / len;

  return [
    { type: 'M', values: [start.x + nx * offset, start.y + ny * offset] },
    { type: 'L', values: [end.x + nx * offset, end.y + ny * offset] },
  ];
}

/**
 * Compute offset path for a partial segment between t0 and t1.
 */
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

// ─── Types ────────────────────────────────────────────────────────────

type TopstitchMode = 'seamline' | 'segment' | 'free' | 'edit';

interface SnapHit {
  point: Point2D;
  edgeIndex: number;
  t: number;
  pieceId: string;
}

interface TopstitchState {
  mode: TopstitchMode;
  // Seamline mode
  hoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  // Segment mode
  segSnapA: SnapHit | null;
  segSnapB: SnapHit | null;
  segHover: SnapHit | null;
  // Free mode
  freePieceId: string | null;
  freePoints: Point2D[];
  freeCursor: Point2D | null;
  // General
  hoveredSnapPoint: Point2D | null;
}

const SNAP_THRESHOLD = 15; // screen px for edge hit

// ─── Hook ──────────────────────────────────────────────────────────────

export function useTopstitchTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  seams: Array<{ pieceA: { pieceId: string; edgeStart: number }; pieceB: { pieceId: string; edgeStart: number } }>,
) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool) as Tool2D;
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);

  const getOptions = useCallback((): TopstitchOptions => {
    const key = activeTool;
    const opts = toolOptions?.[key] ?? {};
    return {
      stitchType: (opts.stitchType as TopstitchOptions['stitchType']) ?? 'straight',
      stitchLength: (opts.stitchLength as number) ?? 3.0,
      offset: (opts.offset as number) ?? 5.0,
      threadColor: (opts.threadColor as string) ?? '#333333',
      rows: 1,
    };
  }, [activeTool, toolOptions]);

  const getMode = useCallback((): TopstitchMode => {
    switch (activeTool) {
      case 'topstitchSeamline': return 'seamline';
      case 'topstitchSegment': return 'segment';
      case 'topstitchFree': return 'free';
      case 'topstitchEdit': return 'edit';
      default: return 'seamline';
    }
  }, [activeTool]);

  const [state, setState] = useState<TopstitchState>({
    mode: 'seamline',
    hoveredEdge: null,
    segSnapA: null,
    segSnapB: null,
    segHover: null,
    freePieceId: null,
    freePoints: [],
    freeCursor: null,
    hoveredSnapPoint: null,
  });

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

  const reset = useCallback(() => {
    setState({
      mode: getMode(),
      hoveredEdge: null,
      segSnapA: null,
      segSnapB: null,
      segHover: null,
      freePieceId: null,
      freePoints: [],
      freeCursor: null,
      hoveredSnapPoint: null,
    });
  }, [getMode]);

  /** Find closest edge across all pieces */
  const findEdge = useCallback((pt: Point2D): { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null => {
    const threshold = SNAP_THRESHOLD / zoom2D;
    let best: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D; dist: number } | null = null;

    for (const piece of pieces) {
      const cmds = piece.outline;
      const ox = piece.position?.x ?? 0;
      const oy = piece.position?.y ?? 0;
      for (let i = 1; i < cmds.length; i++) {
        const ep = getEdgeEndpoints(cmds, i);
        if (!ep) continue;
        const s = { x: ep.start.x + ox, y: ep.start.y + oy };
        const e = { x: ep.end.x + ox, y: ep.end.y + oy };
        const dx = e.x - s.x, dy = e.y - s.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        let t = ((pt.x - s.x) * dx + (pt.y - s.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(pt.x - (s.x + t * dx), pt.y - (s.y + t * dy));
        if (dist < threshold && (!best || dist < best.dist)) {
          best = { pieceId: piece.id, edgeIndex: i, start: s, end: e, dist };
        }
      }
    }
    return best ? { pieceId: best.pieceId, edgeIndex: best.edgeIndex, start: best.start, end: best.end } : null;
  }, [pieces, zoom2D]);

  /** Check if an edge has a seam attached */
  const edgeHasSeam = useCallback((pieceId: string, edgeIndex: number): boolean => {
    return seams.some(s =>
      (s.pieceA.pieceId === pieceId && s.pieceA.edgeStart === edgeIndex) ||
      (s.pieceB.pieceId === pieceId && s.pieceB.edgeStart === edgeIndex)
    );
  }, [seams]);

  const addTopstitch = useCallback((pieceId: string, path: PathCommand[]) => {
    if (path.length < 2) return;
    const opts = getOptions();
    const line: InternalLine = {
      id: `topstitch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'topstitch',
      path,
      topstitchOptions: opts,
    };
    dispatch(addInternalLine({ pieceId, line }));
    dispatch(selectInternalLine({ pieceId, lineId: line.id }));
  }, [dispatch, getOptions]);

  // ─── Mouse handlers ──────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = toPattern(e);
    const mode = getMode();

    if (mode === 'seamline') {
      const edge = findEdge(pt);
      if (!edge) return;
      // Only allow seamline topstitch on edges that have seams
      // (relaxed: allow on any edge for now — CLO3D does this too)
      const piece = pieces.find(p => p.id === edge.pieceId);
      if (!piece) return;
      const ep = getEdgeEndpoints(piece.outline, edge.edgeIndex);
      if (!ep) return;
      const opts = getOptions();
      const path = computeOffsetPath(ep.start, ep.end, opts.offset);
      if (path.length > 0) addTopstitch(edge.pieceId, path);
      return;
    }

    if (mode === 'segment') {
      setState(prev => {
        if (!prev.segSnapA) {
          // First click: find snap point on edge
          for (const piece of pieces) {
            const snap = snapToEdge(pt, piece, zoom2D);
            if (snap) return { ...prev, segSnapA: snap, segSnapB: null };
          }
          return prev;
        } else {
          // Second click: find snap on SAME edge
          const piece = pieces.find(p => p.id === prev.segSnapA!.pieceId);
          if (!piece) return prev;
          const snap = snapToEdge(pt, piece, zoom2D, prev.segSnapA!.edgeIndex);
          if (!snap) return prev;
          if (Math.abs(snap.t - prev.segSnapA!.t) < 0.01) return prev;

          const ep = getEdgeEndpoints(piece.outline, prev.segSnapA!.edgeIndex);
          if (!ep) return prev;
          const t0 = Math.min(prev.segSnapA!.t, snap.t);
          const t1 = Math.max(prev.segSnapA!.t, snap.t);
          const opts = getOptions();
          const path = computeSegmentOffsetPath(ep.start, ep.end, t0, t1, opts.offset);
          if (path.length > 0) addTopstitch(prev.segSnapA!.pieceId, path);
          return { ...prev, segSnapA: null, segSnapB: null };
        }
      });
      return;
    }

    if (mode === 'free') {
      // Find which piece was clicked (by bounding box hit test)
      const hitPiece = pieces.find(piece => {
        if (!piece.outline?.length) return false;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const ox = piece.position?.x ?? 0;
        const oy = piece.position?.y ?? 0;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length; i += 2) {
            const px = cmd.values[i] + ox;
            const py = cmd.values[i + 1] + oy;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
        return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
      });

      setState(prev => {
        if (!prev.freePieceId && hitPiece) {
          // First point — set piece and start
          const ox = hitPiece.position?.x ?? 0;
          const oy = hitPiece.position?.y ?? 0;
          return { ...prev, freePieceId: hitPiece.id, freePoints: [{ x: pt.x - ox, y: pt.y - oy }] };
        } else if (prev.freePieceId) {
          const piece = pieces.find(p => p.id === prev.freePieceId);
          const ox = piece?.position?.x ?? 0;
          const oy = piece?.position?.y ?? 0;
          return { ...prev, freePoints: [...prev.freePoints, { x: pt.x - ox, y: pt.y - oy }] };
        }
        return prev;
      });
      return;
    }

    if (mode === 'edit') {
      // Edit mode: selection handled by useEditorInteractions (internal line click)
      // Nothing special here — the existing click handler already selects internal lines
      return;
    }
  }, [toPattern, getMode, findEdge, pieces, zoom2D, getOptions, addTopstitch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toPattern(e);
    const mode = getMode();

    if (mode === 'seamline') {
      const edge = findEdge(pt);
      setState(prev => ({ ...prev, hoveredEdge: edge, hoveredSnapPoint: edge ? pt : null }));
      return;
    }

    if (mode === 'segment') {
      setState(prev => {
        if (prev.segSnapA) {
          const piece = pieces.find(p => p.id === prev.segSnapA!.pieceId);
          if (piece) {
            const snap = snapToEdge(pt, piece, zoom2D, prev.segSnapA!.edgeIndex);
            return { ...prev, segHover: snap, hoveredSnapPoint: snap?.point ?? null };
          }
        } else {
          for (const piece of pieces) {
            const snap = snapToEdge(pt, piece, zoom2D);
            if (snap) return { ...prev, segHover: snap, hoveredSnapPoint: snap.point };
          }
        }
        return { ...prev, segHover: null, hoveredSnapPoint: null };
      });
      return;
    }

    if (mode === 'free') {
      setState(prev => ({ ...prev, freeCursor: pt }));
      return;
    }
  }, [toPattern, getMode, findEdge, pieces, zoom2D]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      reset();
      return;
    }
    const mode = getMode();
    if (e.key === 'Backspace' && mode === 'segment') {
      setState(prev => ({ ...prev, segSnapA: null, segSnapB: null }));
      return;
    }
    if (e.key === 'Backspace' && mode === 'free') {
      setState(prev => ({
        ...prev,
        freePoints: prev.freePoints.slice(0, -1),
        freePieceId: prev.freePoints.length <= 1 ? null : prev.freePieceId,
      }));
      return;
    }
    if (e.key === 'Enter' && mode === 'free' && state.freePieceId && state.freePoints.length >= 2) {
      const path: PathCommand[] = state.freePoints.map((p, i) => ({
        type: i === 0 ? 'M' as const : 'L' as const,
        values: [p.x, p.y],
      }));
      addTopstitch(state.freePieceId, path);
      reset();
      return;
    }
  }, [getMode, state.freePieceId, state.freePoints, addTopstitch, reset]);

  const getCursor = useCallback((): string => {
    const mode = getMode();
    if (mode === 'edit') return 'default';
    if (state.hoveredEdge || state.segHover || state.hoveredSnapPoint) return 'crosshair';
    return 'default';
  }, [getMode, state.hoveredEdge, state.segHover, state.hoveredSnapPoint]);

  return {
    mode: getMode(),
    hoveredEdge: state.hoveredEdge,
    segSnapA: state.segSnapA,
    segHover: state.segHover,
    freePieceId: state.freePieceId,
    freePoints: state.freePoints,
    freeCursor: state.freeCursor,
    hoveredSnapPoint: state.hoveredSnapPoint,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    getCursor,
    reset,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PatternEditor/__tests__/useTopstitchTool.test.ts`
Expected: 4 tests PASS

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/PatternEditor/useTopstitchTool.ts src/components/PatternEditor/__tests__/useTopstitchTool.test.ts
git commit -m "feat(topstitch): add useTopstitchTool hook with offset path computation"
```

---

### Task 4: Create TopstitchOverlay and add topstitch rendering to PieceRenderer

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx`

**Step 1: Create TopstitchOverlay**

Create `src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx`:

```tsx
import type { Point2D, PatternPiece } from '../../../../types/types';
import { getEdgeEndpoints } from '../../useSeamTool';

interface TopstitchOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  mode: string;
  hoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  segSnapA: { point: Point2D; edgeIndex: number; t: number; pieceId: string } | null;
  segHover: { point: Point2D } | null;
  freePieceId: string | null;
  freePoints: Point2D[];
  freeCursor: Point2D | null;
  hoveredSnapPoint: Point2D | null;
}

export default function TopstitchOverlay({
  zoom2D, pieces, mode, hoveredEdge, segSnapA, segHover,
  freePieceId, freePoints, freeCursor, hoveredSnapPoint,
}: TopstitchOverlayProps) {
  const color = '#e67e22'; // orange for topstitch

  return (
    <g className="topstitch-overlay">
      {/* Snap indicator */}
      {hoveredSnapPoint && (
        <circle cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
          r={4 / zoom2D} fill={color} opacity={0.5} pointerEvents="none" />
      )}

      {/* Seamline mode: highlight hovered edge */}
      {mode === 'seamline' && hoveredEdge && (
        <line
          x1={hoveredEdge.start.x} y1={hoveredEdge.start.y}
          x2={hoveredEdge.end.x} y2={hoveredEdge.end.y}
          stroke={color} strokeWidth={3 / zoom2D}
          strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
          opacity={0.7} pointerEvents="none"
        />
      )}

      {/* Segment mode: first snap point */}
      {mode === 'segment' && segSnapA && (
        <circle cx={segSnapA.point.x} cy={segSnapA.point.y}
          r={5 / zoom2D} fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
          pointerEvents="none" />
      )}

      {/* Segment mode: hover point */}
      {mode === 'segment' && segHover && (
        <circle cx={segHover.point.x} cy={segHover.point.y}
          r={4 / zoom2D} fill={color} opacity={0.5} pointerEvents="none" />
      )}

      {/* Free mode: polyline preview */}
      {mode === 'free' && freePieceId && freePoints.length > 0 && (() => {
        const piece = pieces.find(p => p.id === freePieceId);
        const ox = piece?.position?.x ?? 0;
        const oy = piece?.position?.y ?? 0;
        const pts = freePoints.map(p => ({ x: p.x + ox, y: p.y + oy }));
        const allPts = freeCursor ? [...pts, freeCursor] : pts;
        if (allPts.length < 1) return null;
        const d = allPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        return (
          <g>
            <path d={d} fill="none" stroke={color} strokeWidth={2 / zoom2D}
              strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
              opacity={0.8} pointerEvents="none" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y}
                r={4 / zoom2D} fill={color} stroke="#fff" strokeWidth={1 / zoom2D}
                pointerEvents="none" />
            ))}
          </g>
        );
      })()}
    </g>
  );
}
```

**Step 2: Add topstitch rendering to PieceRenderer**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`, find the `stroke` ternary chain in the internals rendering (the line that determines stroke color based on `line.type`). It currently ends with `'#888'` as the fallback. Before that fallback, add:

```typescript
line.type === 'topstitch' ? (line.topstitchOptions?.threadColor ?? '#333') :
```

Also find the `strokeDasharray` logic. It currently checks `line.type === 'fold'`. Change to:

```typescript
strokeDasharray={
  line.type === 'fold' ? `${5 / zoom2D} ${3 / zoom2D}` :
  line.type === 'topstitch' ? `${(line.topstitchOptions?.stitchLength ?? 3) / zoom2D} ${1.5 / zoom2D}` :
  'none'
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat(topstitch): add TopstitchOverlay and PieceRenderer topstitch rendering"
```

---

### Task 5: Wire hook into PatternEditor, ToolOverlay, and useEditorInteractions

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`

**Step 1: Add overlay to ToolOverlay**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:

a) Add import:
```typescript
import TopstitchOverlay from './overlays/TopstitchOverlay';
```

b) Add props to `ToolOverlayProps` interface:
```typescript
  // Topstitch
  topstitchMode: string;
  topstitchHoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  topstitchSegSnapA: { point: Point2D; edgeIndex: number; t: number; pieceId: string } | null;
  topstitchSegHover: { point: Point2D } | null;
  topstitchFreePieceId: string | null;
  topstitchFreePoints: Point2D[];
  topstitchFreeCursor: Point2D | null;
  topstitchHoveredSnapPoint: Point2D | null;
```

c) Add render block after segmentSewing overlay:
```tsx
      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') && (
        <TopstitchOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          mode={props.topstitchMode}
          hoveredEdge={props.topstitchHoveredEdge}
          segSnapA={props.topstitchSegSnapA}
          segHover={props.topstitchSegHover}
          freePieceId={props.topstitchFreePieceId}
          freePoints={props.topstitchFreePoints}
          freeCursor={props.topstitchFreeCursor}
          hoveredSnapPoint={props.topstitchHoveredSnapPoint}
        />
      )}
```

**Step 2: Wire in PatternEditor**

In `src/components/PatternEditor/PatternEditor.tsx`:

a) Add import:
```typescript
import { useTopstitchTool } from './useTopstitchTool';
```

b) Instantiate hook after `segmentSewingTool`:
```typescript
  const topstitchTool = useTopstitchTool(zoom2D, pan2D, pieces, seams);
```

c) Add to useEditorInteractions tools object:
```typescript
      ..., segmentSewingTool, topstitchTool,
```

d) Add overlay props to `<ToolOverlay>`:
```tsx
            topstitchMode={topstitchTool.mode}
            topstitchHoveredEdge={topstitchTool.hoveredEdge}
            topstitchSegSnapA={topstitchTool.segSnapA}
            topstitchSegHover={topstitchTool.segHover}
            topstitchFreePieceId={topstitchTool.freePieceId}
            topstitchFreePoints={topstitchTool.freePoints}
            topstitchFreeCursor={topstitchTool.freeCursor}
            topstitchHoveredSnapPoint={topstitchTool.hoveredSnapPoint}
```

**Step 3: Wire in useEditorInteractions**

In `src/components/PatternEditor/useEditorInteractions.ts`:

a) Add to `ToolHooks` interface:
```typescript
  topstitchTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
```

b) Destructure from tools parameter.

c) In keyboard handler effect, add:
```typescript
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') handlers.push(topstitchTool.handleKeyDown);
```

d) In `handleMouseDown`, add before the transform block:
```typescript
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') { topstitchTool.handleMouseDown(e); return; }
```

e) In `handleMouseMove`, add:
```typescript
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') topstitchTool.handleMouseMove(e);
```

f) In `getCursor`, add cases:
```typescript
      case 'topstitchSeamline': case 'topstitchSegment': case 'topstitchFree': return topstitchTool.getCursor();
      case 'topstitchEdit': return 'default';
```

g) Add `topstitchTool` to all relevant dependency arrays.

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(topstitch): wire tool into editor, overlay, and interactions"
```

---

### Task 6: Add keyboard shortcuts, hint text, and copilot action

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/components/PatternEditor/renderers/HintText.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (hint text prop)
- Modify: `src/copilot/llm/actionSchemas.ts`
- Modify: `src/copilot/actions/actionTypes.ts`
- Modify: `src/copilot/actions/actionExecutor.ts`

**Step 1: Add keyboard shortcuts**

In `src/hooks/useKeyboardShortcuts.ts`, in the "no modifiers" section (after the `N → segmentSewing` block), add:

```typescript
      // T — Edit Topstitch
      if (key === 't') {
        dispatch(setActiveTool('topstitchEdit' as any));
        dispatch(setActiveTool2D('topstitchEdit'));
        return;
      }

      // K — Segment Topstitch
      if (key === 'k') {
        dispatch(setActiveTool('topstitchSegment' as any));
        dispatch(setActiveTool2D('topstitchSegment'));
        return;
      }
```

In the Shift+Key section (before the `if (ctrl || shift || e.altKey) return;` guard), add:

```typescript
      // Shift+L is already taken (Line tool), so L without shift:
      // Actually L is NOT taken in the no-modifiers section. Add after the guard falls through:
```

Wait — `L` is currently `Shift+L → line`. Let me check: the issue says `L` for Free Topstitch but Shift+L is already Line tool. Since the no-modifier section runs AFTER shift checks, plain `L` is not assigned. Add in the no-modifier section:

```typescript
      // L — Free Topstitch
      if (key === 'l') {
        dispatch(setActiveTool('topstitchFree' as any));
        dispatch(setActiveTool2D('topstitchFree'));
        return;
      }
```

For `;`, add in the no-modifier section:

```typescript
      // ; — Seamline Topstitch
      if (key === ';') {
        dispatch(setActiveTool('topstitchSeamline' as any));
        dispatch(setActiveTool2D('topstitchSeamline'));
        return;
      }
```

Add to `_shortcutMap`:

```typescript
      { key: 'T', label: 'Edit Topstitch', category: '2D Tools', action: () => {} },
      { key: 'K', label: 'Segment Topstitch', category: '2D Tools', action: () => {} },
      { key: 'L', label: 'Free Topstitch', category: '2D Tools', action: () => {} },
      { key: ';', label: 'Seamline Topstitch', category: '2D Tools', action: () => {} },
```

**Step 2: Add hint text**

In `src/components/PatternEditor/renderers/HintText.tsx`, add `topstitchMode?: string` to `HintTextProps`. Add before the closing `</>`:

```tsx
      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree' || activeTool === 'topstitchEdit') && (() => {
        const msgs: Record<string, string> = {
          seamline: 'Click an edge to add topstitch along it',
          segment: topstitchMode === 'segment' ? 'Click 2 points on an edge to define segment' : 'Click an edge to start',
          free: 'Click on a piece to start · Click to add points · Enter to confirm · Esc to cancel',
          edit: 'Click a topstitch line to select · Backspace to delete',
        };
        const key = activeTool === 'topstitchSeamline' ? 'seamline' :
                     activeTool === 'topstitchSegment' ? 'segment' :
                     activeTool === 'topstitchFree' ? 'free' : 'edit';
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
            {msgs[key]}
          </text>
        );
      })()}
```

Pass the prop from PatternEditor.tsx:
```tsx
          topstitchMode={topstitchTool.mode}
```

**Step 3: Add copilot action type**

In `src/copilot/actions/actionTypes.ts`, add:

```typescript
export interface CreateTopstitchAction {
  action: 'create_topstitch';
  pieceId: string;
  edgeIndex: number;
  mode?: 'seamline' | 'segment';
  startT?: number;
  endT?: number;
  stitchType?: 'straight' | 'zigzag' | 'triple';
  offset?: number;
  threadColor?: string;
}
```

Add `CreateTopstitchAction` to the appropriate action union and `CopilotAction`. Add `'create_topstitch'` to `ACTION_CATEGORIES` under a `'topstitch'` category. Add to `UNDOABLE_ACTIONS`.

**Step 4: Add copilot executor**

In `src/copilot/actions/actionExecutor.ts`, add a case for `'create_topstitch'`:

```typescript
case 'create_topstitch': {
  const piece = state.project.pieces.find(p => p.id === action.pieceId);
  if (!piece) throw new Error(`Piece "${action.pieceId}" not found`);
  const ep = getEdgeEndpoints(piece.outline, action.edgeIndex);
  if (!ep) throw new Error(`Edge ${action.edgeIndex} not found`);

  const offset = action.offset ?? 5;
  let path: PathCommand[];
  if (action.mode === 'segment' && action.startT != null && action.endT != null) {
    path = computeSegmentOffsetPath(ep.start, ep.end, action.startT, action.endT, offset);
  } else {
    path = computeOffsetPath(ep.start, ep.end, offset);
  }

  const line: InternalLine = {
    id: `topstitch-${Date.now()}`,
    type: 'topstitch',
    path,
    topstitchOptions: {
      stitchType: action.stitchType ?? 'straight',
      stitchLength: 3.0,
      offset,
      threadColor: action.threadColor ?? '#333333',
      rows: 1,
    },
  };

  this.dispatch(addInternalLine({ pieceId: action.pieceId, line }));
  return { data: { internalLineId: line.id }, summary: 'Added topstitch' };
}
```

Import `computeOffsetPath`, `computeSegmentOffsetPath` from `useTopstitchTool` and `getEdgeEndpoints` from `useSeamTool`.

**Step 5: Add LLM schema**

In `src/copilot/llm/actionSchemas.ts`, after the seam schemas and before the simulation section, add:

```typescript
  // === Topstitch ===
  {
    action: 'create_topstitch',
    description: 'Add a topstitch line along a pattern piece edge',
    category: 'topstitch',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Edge index to topstitch', required: true },
      { name: 'offset', type: 'number', description: 'Offset from edge in mm (default 5)', required: false },
      { name: 'stitchType', type: 'string', description: 'Stitch type', required: false, enum: ['straight', 'zigzag', 'triple'] },
      { name: 'threadColor', type: 'string', description: 'Thread color hex', required: false },
    ],
    examples: ['Add topstitch along the hem', 'Topstitch the neckline with zigzag'],
  },
```

**Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 8: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/PatternEditor.tsx src/copilot/actions/actionTypes.ts src/copilot/actions/actionExecutor.ts src/copilot/llm/actionSchemas.ts
git commit -m "feat(topstitch): add shortcuts, hints, and copilot integration"
```
