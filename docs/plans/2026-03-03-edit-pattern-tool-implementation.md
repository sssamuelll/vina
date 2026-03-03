# Edit Pattern Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CLO3D-style Edit Pattern (Z) and Edit Curve Point (V) tools by refactoring `useNodeEditor` into shared utilities + two dedicated hooks, with full copilot integration.

**Architecture:** Extract shared node editing math into `nodeEditorUtils.ts`. Create `useEditPattern.ts` for point/segment selection, multi-select, add/delete/convert. Refactor `useNodeEditor` into `useEditCurve.ts` for bezier handle editing. Wire both tools via `useEditorInteractions.ts`. Register copilot actions for `curve_edge` and `straighten_edge`.

**Tech Stack:** React hooks, SVG rendering, Redux (projectSlice/editorSlice), Vitest

---

### Task 1: Add `editPattern` to Tool2D union and create tool definition

**Files:**
- Modify: `src/types/types.ts:267-269`
- Create: `src/tools/definitions/editPattern.tsx`
- Modify: `src/tools/index.ts:4-48`

**Step 1: Add `editPattern` to Tool2D type**

In `src/types/types.ts`, after line 269 (`| 'transform'`), add:

```typescript
  | 'editPattern'  // edit points and segments (Z key)
```

**Step 2: Create tool definition**

Create `src/tools/definitions/editPattern.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const EditPatternIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Polygon outline */}
    <path d="M3 14L9 3L15 14Z" />
    {/* Node dots at corners — filled squares for edit pattern */}
    <rect x="7.5" y="1.5" width="3" height="3" fill="currentColor" />
    <rect x="13.5" y="12.5" width="3" height="3" fill="currentColor" />
    <rect x="1.5" y="12.5" width="3" height="3" fill="currentColor" />
  </svg>
);

export const editPatternTool: ToolDefinition = {
  id: 'editPattern',
  name: 'Edit Pattern',
  context: '2d',
  shortcut: 'z',
  icon: EditPatternIcon,
  cursor: 'default',
  group: 'select',
  copilot: {
    description: 'Select and edit individual points and segments on pattern piece edges. Click points to select, shift+click to multi-select, drag to move. Delete points with backspace/delete. Click on an edge to add a point. Right-click a segment to convert between line and curve.',
    examples: [
      'Edit the points on the front bodice',
      'Delete the extra point on the waistline',
      'Add a point at the hip notch location',
      'Convert the armhole segment to a curve',
    ],
    keywords: ['edit', 'pattern', 'points', 'segments', 'select', 'move', 'delete', 'add'],
    requiresSelection: 'piece',
    produces: 'point',
    undoable: true,
  },
};
```

**Step 3: Register in tools index**

In `src/tools/index.ts`, add import after line 5:

```typescript
import { editPatternTool } from './definitions/editPattern';
```

In the `allTools` array, add after `selectTool,` (line 46):

```typescript
  editPatternTool,
```

**Step 4: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add src/types/types.ts src/tools/definitions/editPattern.tsx src/tools/index.ts
git commit -m "feat(editor): add editPattern to Tool2D and register tool definition"
```

---

### Task 2: Extract shared utilities into `nodeEditorUtils.ts`

**Files:**
- Create: `src/components/PatternEditor/nodeEditorUtils.ts`
- Create: `src/components/PatternEditor/__tests__/nodeEditorUtils.test.ts`

**Step 1: Write tests for shared utilities**

Create `src/components/PatternEditor/__tests__/nodeEditorUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  extractNodes,
  applyNodeMove,
  hitTestNode,
  nearestSegment,
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
} from '../nodeEditorUtils';
import type { PatternPiece, PathCommand } from '../../../types/types';

const makeSquarePiece = (): PatternPiece => ({
  id: 'p1',
  name: 'Square',
  position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  createdAt: 0,
  updatedAt: 0,
});

const makeCurvePiece = (): PatternPiece => ({
  id: 'p2',
  name: 'Curve',
  position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [33, -20, 66, -20, 100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  createdAt: 0,
  updatedAt: 0,
});

describe('extractNodes', () => {
  it('extracts 4 anchor nodes from a square', () => {
    const nodes = extractNodes(makeSquarePiece());
    expect(nodes).toHaveLength(4);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position).toEqual({ x: 100, y: 0 });
    expect(nodes[2].position).toEqual({ x: 100, y: 100 });
    expect(nodes[3].position).toEqual({ x: 0, y: 100 });
  });

  it('extracts cubic bezier node with control point', () => {
    const nodes = extractNodes(makeCurvePiece());
    expect(nodes).toHaveLength(4);
    expect(nodes[1].cp1).toEqual({ x: 66, y: -20 });
  });

  it('skips Z commands', () => {
    const nodes = extractNodes(makeSquarePiece());
    const refs = nodes.map(n => n.ref.commandIndex);
    expect(refs).not.toContain(4); // Z is at index 4
  });
});

describe('hitTestNode', () => {
  it('returns matching node index within threshold', () => {
    const nodes = extractNodes(makeSquarePiece());
    const hit = hitTestNode({ x: 2, y: 2 }, nodes, 5);
    expect(hit).not.toBeNull();
    expect(hit!.commandIndex).toBe(0);
  });

  it('returns null when no node is within threshold', () => {
    const nodes = extractNodes(makeSquarePiece());
    const hit = hitTestNode({ x: 50, y: 50 }, nodes, 5);
    expect(hit).toBeNull();
  });
});

describe('nearestSegment', () => {
  it('finds the closest segment to a point', () => {
    const outline = makeSquarePiece().outline;
    const result = nearestSegment({ x: 50, y: 2 }, outline);
    expect(result).not.toBeNull();
    // Top edge: M(0,0) → L(100,0), commandIndex of L = 1
    expect(result!.commandIndex).toBe(1);
    expect(result!.distance).toBeLessThan(5);
  });

  it('computes t parameter along segment', () => {
    const outline = makeSquarePiece().outline;
    const result = nearestSegment({ x: 50, y: 0 }, outline);
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(0.5, 1);
  });
});

describe('splitSegmentAt', () => {
  it('splits a line segment into two', () => {
    const outline = makeSquarePiece().outline;
    const result = splitSegmentAt(outline, 1, 0.5);
    // Original had 5 commands (M, L, L, L, Z), now has 6
    expect(result).toHaveLength(6);
    expect(result[1].type).toBe('L');
    expect(result[1].values[0]).toBeCloseTo(50);
    expect(result[1].values[1]).toBeCloseTo(0);
  });

  it('splits a cubic bezier using de Casteljau', () => {
    const outline = makeCurvePiece().outline;
    const result = splitSegmentAt(outline, 1, 0.5);
    // Original: M, C, L, L, Z (5). After split: M, C, C, L, L, Z (6)
    expect(result).toHaveLength(6);
    expect(result[1].type).toBe('C');
    expect(result[2].type).toBe('C');
  });
});

describe('deletePoint', () => {
  it('removes a point and reconnects', () => {
    const outline = makeSquarePiece().outline;
    const result = deletePoint(outline, 2); // remove (100, 100)
    // M, L, L, Z → 4 commands
    expect(result).toHaveLength(4);
    expect(result.filter(c => c.type === 'Z')).toHaveLength(1);
  });

  it('throws when piece would have fewer than 3 points', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [50, 50] },
      { type: 'Z', values: [] },
    ];
    expect(() => deletePoint(outline, 1)).toThrow();
  });
});

describe('convertToCurve', () => {
  it('converts L to C with control points at 1/3 and 2/3', () => {
    const outline = makeSquarePiece().outline;
    const result = convertToCurve(outline, 1);
    expect(result[1].type).toBe('C');
    expect(result[1].values).toHaveLength(6);
    // cp1 at 1/3: (33.33, 0), cp2 at 2/3: (66.67, 0), anchor: (100, 0)
    expect(result[1].values[0]).toBeCloseTo(33.33, 0);
    expect(result[1].values[4]).toBe(100);
    expect(result[1].values[5]).toBe(0);
  });
});

describe('convertToLine', () => {
  it('converts C to L, keeping only the anchor', () => {
    const outline = makeCurvePiece().outline;
    const result = convertToLine(outline, 1);
    expect(result[1].type).toBe('L');
    expect(result[1].values).toEqual([100, 0]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.test.ts`
Expected: FAIL — module not found

**Step 3: Create `nodeEditorUtils.ts`**

Create `src/components/PatternEditor/nodeEditorUtils.ts`:

```typescript
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodeRef {
  pieceId: string;
  commandIndex: number;
  pointType: 'anchor' | 'cp1' | 'cp2';
}

export interface EditableNode {
  ref: NodeRef;
  position: Point2D;
  cp1?: Point2D;
  cp2?: Point2D;
}

export interface SegmentHit {
  commandIndex: number;
  t: number;
  distance: number;
  point: Point2D;
}

// ─── Node Extraction ────────────────────────────────────────────────────────

export function extractNodes(piece: PatternPiece): EditableNode[] {
  const nodes: EditableNode[] = [];
  const cmds = piece.outline;

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;

    switch (cmd.type) {
      case 'M':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'L':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'C':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[4], y: v[5] },
          cp1: { x: v[2], y: v[3] },
        });
        break;
      case 'Q':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[2], y: v[3] },
          cp1: { x: v[0], y: v[1] },
        });
        break;
    }
  }

  return nodes;
}

// ─── Hit Testing ────────────────────────────────────────────────────────────

export function hitTestNode(
  point: Point2D,
  nodes: EditableNode[],
  threshold: number,
): NodeRef | null {
  for (const node of nodes) {
    if (Math.hypot(point.x - node.position.x, point.y - node.position.y) <= threshold) {
      return node.ref;
    }
  }
  return null;
}

/** Get the anchor position of a command */
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

/** Distance from point to line segment, returning t parameter */
function distToSegmentWithT(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): { distance: number; t: number; point: Point2D } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { distance: Math.hypot(px - x1, py - y1), t: 0, point: { x: x1, y: y1 } };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { distance: Math.hypot(px - projX, py - projY), t, point: { x: projX, y: projY } };
}

/** Find the nearest segment to a point */
export function nearestSegment(
  point: Point2D,
  outline: PathCommand[],
): SegmentHit | null {
  let best: SegmentHit | null = null;
  let prev: Point2D | null = null;

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    const anchor = getAnchor(cmd);
    if (!anchor) continue;

    if (prev && (cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q')) {
      // For C/Q, approximate as straight line from prev anchor to this anchor for hit testing
      const endPt = anchor;
      const { distance, t, point: projPt } = distToSegmentWithT(
        point.x, point.y, prev.x, prev.y, endPt.x, endPt.y,
      );
      if (!best || distance < best.distance) {
        best = { commandIndex: i, t, distance, point: projPt };
      }
    }
    prev = anchor;
  }

  // Also check the closing segment (last point → first point) if outline has Z
  if (prev && outline.some(c => c.type === 'Z')) {
    const firstAnchor = getAnchor(outline[0]);
    if (firstAnchor) {
      const { distance, t, point: projPt } = distToSegmentWithT(
        point.x, point.y, prev.x, prev.y, firstAnchor.x, firstAnchor.y,
      );
      // Use index 0 to indicate the closing segment
      if (!best || distance < best.distance) {
        best = { commandIndex: 0, t, distance, point: projPt };
      }
    }
  }

  return best;
}

// ─── Node Movement ──────────────────────────────────────────────────────────

export function applyNodeMove(
  outline: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];
  if (!cmd) return cmds;

  switch (cmd.type) {
    case 'M':
    case 'L':
      if (pointType === 'anchor') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
    case 'C':
      if (pointType === 'anchor') {
        const dx = newPos.x - cmd.values[4];
        const dy = newPos.y - cmd.values[5];
        cmd.values[4] = newPos.x;
        cmd.values[5] = newPos.y;
        cmd.values[2] += dx;
        cmd.values[3] += dy;
        const nextIdx = commandIndex + 1;
        if (nextIdx < cmds.length && cmds[nextIdx].type === 'C') {
          cmds[nextIdx].values[0] += dx;
          cmds[nextIdx].values[1] += dy;
        }
      } else if (pointType === 'cp1') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      } else if (pointType === 'cp2') {
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
      }
      break;
    case 'Q':
      if (pointType === 'anchor') {
        const dx = newPos.x - cmd.values[2];
        const dy = newPos.y - cmd.values[3];
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
        cmd.values[0] += dx;
        cmd.values[1] += dy;
      } else if (pointType === 'cp1') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
  }

  return cmds;
}

// ─── Segment Operations ─────────────────────────────────────────────────────

/** Split a segment at parameter t, inserting a new point */
export function splitSegmentAt(
  outline: PathCommand[],
  commandIndex: number,
  t: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];
  if (!cmd) return cmds;

  // Find the previous anchor
  let prevAnchor: Point2D = { x: 0, y: 0 };
  for (let i = commandIndex - 1; i >= 0; i--) {
    const a = getAnchor(cmds[i]);
    if (a) { prevAnchor = a; break; }
  }

  if (cmd.type === 'L') {
    const x = prevAnchor.x + (cmd.values[0] - prevAnchor.x) * t;
    const y = prevAnchor.y + (cmd.values[1] - prevAnchor.y) * t;
    cmds.splice(commandIndex, 0, { type: 'L', values: [x, y] });
  } else if (cmd.type === 'C') {
    // De Casteljau subdivision for cubic bezier
    const p0 = prevAnchor;
    const p1 = { x: cmd.values[0], y: cmd.values[1] };
    const p2 = { x: cmd.values[2], y: cmd.values[3] };
    const p3 = { x: cmd.values[4], y: cmd.values[5] };

    const lerp = (a: Point2D, b: Point2D, u: number): Point2D => ({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
    });

    const q0 = lerp(p0, p1, t);
    const q1 = lerp(p1, p2, t);
    const q2 = lerp(p2, p3, t);
    const r0 = lerp(q0, q1, t);
    const r1 = lerp(q1, q2, t);
    const s = lerp(r0, r1, t);

    // First half: C from p0 to s with controls q0, r0
    const firstHalf: PathCommand = {
      type: 'C',
      values: [q0.x, q0.y, r0.x, r0.y, s.x, s.y],
    };
    // Second half: C from s to p3 with controls r1, q2
    const secondHalf: PathCommand = {
      type: 'C',
      values: [r1.x, r1.y, q2.x, q2.y, p3.x, p3.y],
    };

    cmds.splice(commandIndex, 1, firstHalf, secondHalf);
  } else if (cmd.type === 'Q') {
    // Split quadratic: subdivide into two Q commands
    const p0 = prevAnchor;
    const p1 = { x: cmd.values[0], y: cmd.values[1] };
    const p2 = { x: cmd.values[2], y: cmd.values[3] };

    const lerp = (a: Point2D, b: Point2D, u: number): Point2D => ({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
    });

    const q0 = lerp(p0, p1, t);
    const q1 = lerp(p1, p2, t);
    const s = lerp(q0, q1, t);

    cmds.splice(commandIndex, 1,
      { type: 'Q', values: [q0.x, q0.y, s.x, s.y] },
      { type: 'Q', values: [q1.x, q1.y, p2.x, p2.y] },
    );
  }

  return cmds;
}

/** Delete a point from the outline by commandIndex */
export function deletePoint(outline: PathCommand[], commandIndex: number): PathCommand[] {
  const nonZ = outline.filter(c => c.type !== 'Z');
  if (nonZ.length <= 3) {
    throw new Error('Cannot delete point: piece must have at least 3 points');
  }

  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  cmds.splice(commandIndex, 1);

  // Ensure first command is M
  if (cmds.length > 0 && cmds[0].type !== 'M') {
    cmds[0] = { type: 'M', values: cmds[0].values.slice(-2) };
  }

  // Ensure Z is present at end
  if (!cmds.some(c => c.type === 'Z')) {
    cmds.push({ type: 'Z', values: [] });
  }

  return cmds;
}

/** Convert a line segment (L) to a cubic bezier (C) */
export function convertToCurve(outline: PathCommand[], commandIndex: number): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];
  if (!cmd || cmd.type !== 'L') return cmds;

  // Find previous anchor
  let prevAnchor: Point2D = { x: 0, y: 0 };
  for (let i = commandIndex - 1; i >= 0; i--) {
    const a = getAnchor(cmds[i]);
    if (a) { prevAnchor = a; break; }
  }

  const endX = cmd.values[0];
  const endY = cmd.values[1];

  // Place control points at 1/3 and 2/3
  const cp1x = prevAnchor.x + (endX - prevAnchor.x) / 3;
  const cp1y = prevAnchor.y + (endY - prevAnchor.y) / 3;
  const cp2x = prevAnchor.x + (endX - prevAnchor.x) * 2 / 3;
  const cp2y = prevAnchor.y + (endY - prevAnchor.y) * 2 / 3;

  cmds[commandIndex] = {
    type: 'C',
    values: [cp1x, cp1y, cp2x, cp2y, endX, endY],
  };

  return cmds;
}

/** Convert a curve segment (C or Q) to a straight line (L) */
export function convertToLine(outline: PathCommand[], commandIndex: number): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];
  if (!cmd) return cmds;

  const anchor = getAnchor(cmd);
  if (!anchor || (cmd.type !== 'C' && cmd.type !== 'Q')) return cmds;

  cmds[commandIndex] = { type: 'L', values: [anchor.x, anchor.y] };
  return cmds;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts src/components/PatternEditor/__tests__/nodeEditorUtils.test.ts
git commit -m "feat(editor): extract shared node editor utilities with tests"
```

---

### Task 3: Create `useEditPattern` hook

**Files:**
- Create: `src/components/PatternEditor/useEditPattern.ts`

**Context:** This is the main Edit Pattern (Z) hook. It manages point/segment selection (including multi-select), dragging, marquee selection, and delegates mutations (add, delete, convert) to `nodeEditorUtils`. It does NOT show bezier handles — that's `useEditCurve`.

**Step 1: Create the hook**

Create `src/components/PatternEditor/useEditPattern.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import {
  extractNodes,
  hitTestNode,
  nearestSegment,
  applyNodeMove,
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
  type EditableNode,
  type NodeRef,
  type SegmentHit,
} from './nodeEditorUtils';

const HIT_RADIUS = 8; // screen pixels

export interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;       // commandIndex set
  selectedSegments: Set<number>;    // commandIndex of segment destination
  hoveredNode: number | null;       // commandIndex
  hoveredSegment: number | null;    // commandIndex
  addPointPreview: Point2D | null;  // preview dot on edge
  marquee: { start: Point2D; current: Point2D } | null;
}

const INITIAL_STATE: EditPatternState = {
  isEditing: false,
  editingPieceId: null,
  nodes: [],
  selectedNodes: new Set(),
  selectedSegments: new Set(),
  hoveredNode: null,
  hoveredSegment: null,
  addPointPreview: null,
  marquee: null,
};

export function useEditPattern(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [state, setState] = useState<EditPatternState>(INITIAL_STATE);

  const dragRef = useRef<{
    type: 'node' | 'segment' | 'marquee';
    startMouse: Point2D;
    startPositions: Map<number, Point2D>; // commandIndex → original position
  } | null>(null);

  const toLocal = useCallback((e: React.MouseEvent<SVGSVGElement>, piece: PatternPiece): Point2D => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom - piece.position.x,
      y: (e.clientY - rect.top - pan.y) / zoom - piece.position.y,
    };
  }, [zoom, pan]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  const refreshNodes = useCallback((piece: PatternPiece) => {
    setState(s => ({ ...s, nodes: extractNodes(piece) }));
  }, []);

  // ─── Enter / Exit ─────────────────────────────────────────────────────

  const enterEdit = useCallback((pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    setState({
      ...INITIAL_STATE,
      isEditing: true,
      editingPieceId: pieceId,
      nodes: extractNodes(piece),
    });
  }, [pieces]);

  const exitEdit = useCallback(() => {
    setState(INITIAL_STATE);
    dragRef.current = null;
  }, []);

  // ─── Mouse Down ───────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>): boolean => {
    if (!state.isEditing || !state.editingPieceId || e.button !== 0) return false;

    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;

    const localPt = toLocal(e, piece);
    const threshold = HIT_RADIUS / zoom;

    // 1. Check anchor hit
    const hitRef = hitTestNode(localPt, state.nodes, threshold);
    if (hitRef) {
      const idx = hitRef.commandIndex;
      let newSelected: Set<number>;
      if (e.shiftKey) {
        newSelected = new Set(state.selectedNodes);
        if (newSelected.has(idx)) newSelected.delete(idx);
        else newSelected.add(idx);
      } else {
        newSelected = new Set([idx]);
      }

      // Collect start positions for all selected nodes
      const startPositions = new Map<number, Point2D>();
      for (const ci of newSelected) {
        const node = state.nodes.find(n => n.ref.commandIndex === ci);
        if (node) startPositions.set(ci, { ...node.position });
      }

      dragRef.current = {
        type: 'node',
        startMouse: { x: e.clientX, y: e.clientY },
        startPositions,
      };
      setState(s => ({ ...s, selectedNodes: newSelected, selectedSegments: new Set() }));
      return true;
    }

    // 2. Check segment hit
    const segHit = nearestSegment(localPt, piece.outline);
    if (segHit && segHit.distance <= threshold) {
      const idx = segHit.commandIndex;
      if (e.shiftKey) {
        const newSel = new Set(state.selectedSegments);
        if (newSel.has(idx)) newSel.delete(idx);
        else newSel.add(idx);
        setState(s => ({ ...s, selectedSegments: newSel, selectedNodes: new Set() }));
      } else {
        setState(s => ({ ...s, selectedSegments: new Set([idx]), selectedNodes: new Set() }));
      }

      // For segment drag, collect both endpoints
      const segCmdIdx = segHit.commandIndex;
      const startPositions = new Map<number, Point2D>();
      // Find the "from" node (previous command with anchor)
      for (let i = segCmdIdx - 1; i >= 0; i--) {
        const node = state.nodes.find(n => n.ref.commandIndex === i);
        if (node) { startPositions.set(i, { ...node.position }); break; }
      }
      // The "to" node
      const toNode = state.nodes.find(n => n.ref.commandIndex === segCmdIdx);
      if (toNode) startPositions.set(segCmdIdx, { ...toNode.position });

      dragRef.current = {
        type: 'segment',
        startMouse: { x: e.clientX, y: e.clientY },
        startPositions,
      };
      return true;
    }

    // 3. Start marquee selection on empty area
    const patternPt = toPattern(e);
    dragRef.current = {
      type: 'marquee',
      startMouse: { x: e.clientX, y: e.clientY },
      startPositions: new Map(),
    };
    setState(s => ({
      ...s,
      marquee: { start: patternPt, current: patternPt },
      selectedNodes: e.shiftKey ? s.selectedNodes : new Set(),
      selectedSegments: new Set(),
    }));
    return true;
  }, [state, pieces, zoom, toLocal, toPattern]);

  // ─── Mouse Move ───────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>): boolean => {
    if (!state.isEditing || !state.editingPieceId) return false;

    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;

    // Dragging
    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom;

      if (dragRef.current.type === 'marquee') {
        const patternPt = toPattern(e);
        setState(s => s.marquee ? { ...s, marquee: { ...s.marquee, current: patternPt } } : s);
        return true;
      }

      // Move nodes or segment endpoints
      let newOutline = piece.outline;
      for (const [cmdIdx, startPos] of dragRef.current.startPositions) {
        const newPos = { x: startPos.x + dx, y: startPos.y + dy };
        newOutline = applyNodeMove(newOutline, cmdIdx, 'anchor', newPos);
      }

      dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
      refreshNodes({ ...piece, outline: newOutline });
      return true;
    }

    // Hover detection
    const localPt = toLocal(e, piece);
    const threshold = HIT_RADIUS / zoom;

    // Check node hover
    const hitRef = hitTestNode(localPt, state.nodes, threshold);
    if (hitRef) {
      setState(s => ({
        ...s,
        hoveredNode: hitRef.commandIndex,
        hoveredSegment: null,
        addPointPreview: null,
      }));
      return false;
    }

    // Check segment hover
    const segHit = nearestSegment(localPt, piece.outline);
    if (segHit && segHit.distance <= threshold) {
      setState(s => ({
        ...s,
        hoveredNode: null,
        hoveredSegment: segHit.commandIndex,
        addPointPreview: segHit.point,
      }));
      return false;
    }

    setState(s => ({
      ...s,
      hoveredNode: null,
      hoveredSegment: null,
      addPointPreview: null,
    }));
    return false;
  }, [state, pieces, zoom, toLocal, toPattern, dispatch, refreshNodes]);

  // ─── Mouse Up ─────────────────────────────────────────────────────────

  const handleMouseUp = useCallback((): void => {
    if (!state.isEditing || !state.editingPieceId) return;

    if (dragRef.current?.type === 'marquee' && state.marquee) {
      // Resolve marquee: select nodes inside the rectangle
      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (piece) {
        const { start, current } = state.marquee;
        const minX = Math.min(start.x, current.x) - piece.position.x;
        const maxX = Math.max(start.x, current.x) - piece.position.x;
        const minY = Math.min(start.y, current.y) - piece.position.y;
        const maxY = Math.max(start.y, current.y) - piece.position.y;

        const newSelected = new Set(state.selectedNodes);
        for (const node of state.nodes) {
          if (node.position.x >= minX && node.position.x <= maxX &&
              node.position.y >= minY && node.position.y <= maxY) {
            newSelected.add(node.ref.commandIndex);
          }
        }
        setState(s => ({ ...s, selectedNodes: newSelected, marquee: null }));
      }
    } else {
      setState(s => ({ ...s, marquee: null }));
    }

    dragRef.current = null;
  }, [state, pieces]);

  // ─── Keyboard ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (!state.isEditing || !state.editingPieceId) return;

    if (e.key === 'Escape') {
      exitEdit();
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedNodes.size > 0) {
      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (!piece) return;

      // Delete selected points (in reverse order to preserve indices)
      const sorted = Array.from(state.selectedNodes).sort((a, b) => b - a);
      let outline = piece.outline;
      for (const idx of sorted) {
        try {
          outline = deletePoint(outline, idx);
        } catch {
          // Skip if can't delete (minimum 3 points)
          break;
        }
      }

      const updatedPiece = { ...piece, outline, updatedAt: Date.now() };
      dispatch(updatePiece(updatedPiece));
      setState(s => ({
        ...s,
        selectedNodes: new Set(),
        nodes: extractNodes(updatedPiece),
      }));
      e.preventDefault();
    }
  }, [state, pieces, dispatch, exitEdit]);

  // ─── Add Point (double-click on edge) ─────────────────────────────────

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>): boolean => {
    if (!state.isEditing || !state.editingPieceId) return false;

    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;

    const localPt = toLocal(e, piece);
    const threshold = HIT_RADIUS / zoom;
    const segHit = nearestSegment(localPt, piece.outline);
    if (!segHit || segHit.distance > threshold) return false;

    const newOutline = splitSegmentAt(piece.outline, segHit.commandIndex, segHit.t);
    const updatedPiece = { ...piece, outline: newOutline, updatedAt: Date.now() };
    dispatch(updatePiece(updatedPiece));
    setState(s => ({
      ...s,
      nodes: extractNodes(updatedPiece),
      selectedNodes: new Set([segHit.commandIndex]),
    }));
    return true;
  }, [state, pieces, zoom, toLocal, dispatch]);

  // ─── Convert Segment ──────────────────────────────────────────────────

  const convertSegment = useCallback((commandIndex: number, toCurve: boolean) => {
    if (!state.editingPieceId) return;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return;

    const newOutline = toCurve
      ? convertToCurve(piece.outline, commandIndex)
      : convertToLine(piece.outline, commandIndex);

    const updatedPiece = { ...piece, outline: newOutline, updatedAt: Date.now() };
    dispatch(updatePiece(updatedPiece));
    setState(s => ({ ...s, nodes: extractNodes(updatedPiece) }));
  }, [state.editingPieceId, pieces, dispatch]);

  // ─── Cursor ───────────────────────────────────────────────────────────

  const getCursor = useCallback((): string => {
    if (dragRef.current?.type === 'marquee') return 'crosshair';
    if (dragRef.current) return 'move';
    if (state.hoveredNode !== null) return 'move';
    if (state.hoveredSegment !== null) return 'pointer';
    return 'default';
  }, [state.hoveredNode, state.hoveredSegment]);

  return {
    ...state,
    enterEdit,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    convertSegment,
    getCursor,
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useEditPattern.ts
git commit -m "feat(editor): add useEditPattern hook for point/segment editing"
```

---

### Task 4: Refactor `useNodeEditor` into `useEditCurve`

**Files:**
- Create: `src/components/PatternEditor/useEditCurve.ts`
- Delete: `src/components/PatternEditor/useNodeEditor.ts`
- Modify: `src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx:1-3`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx:2`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:7`

**Step 1: Create `useEditCurve.ts`**

Create `src/components/PatternEditor/useEditCurve.ts` — this is a copy of the existing `useNodeEditor.ts` but importing from `nodeEditorUtils` instead of defining its own types/functions. The hook name and export change but the behavior is identical.

```typescript
import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import {
  extractNodes,
  applyNodeMove,
  type EditableNode,
  type NodeRef,
} from './nodeEditorUtils';

export interface EditCurveState {
  isEditing: boolean;
  editingPieceId: string | null;
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  nodes: EditableNode[];
}

export function useEditCurve(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [state, setState] = useState<EditCurveState>({
    isEditing: false,
    editingPieceId: null,
    selectedNode: null,
    hoveredNode: null,
    nodes: [],
  });

  const dragRef = useRef<{
    nodeRef: NodeRef;
    startMouse: Point2D;
    startPos: Point2D;
  } | null>(null);

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => {
    return {
      x: (screenX - svgRect.left - pan.x) / zoom,
      y: (screenY - svgRect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  const enterEdit = useCallback((pieceId: string, selectedNode?: NodeRef) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    setState({
      isEditing: true,
      editingPieceId: pieceId,
      selectedNode: selectedNode || null,
      hoveredNode: null,
      nodes: extractNodes(piece),
    });
  }, [pieces]);

  const exitEdit = useCallback(() => {
    setState({
      isEditing: false,
      editingPieceId: null,
      selectedNode: null,
      hoveredNode: null,
      nodes: [],
    });
    dragRef.current = null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;
    if (e.button !== 0) return false;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;

    // Adjust for piece position
    const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
    const HIT = 8 / zoom;

    // Check control points first
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(localPt.x - node.cp1.x, localPt.y - node.cp1.y);
        if (d < HIT) {
          const ref: NodeRef = { ...node.ref, pointType: 'cp2' };
          setState(s => ({ ...s, selectedNode: ref }));
          dragRef.current = { nodeRef: ref, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...node.cp1! } };
          return true;
        }
      }
    }

    // Check anchors
    for (const node of state.nodes) {
      const d = Math.hypot(localPt.x - node.position.x, localPt.y - node.position.y);
      if (d < HIT) {
        setState(s => ({ ...s, selectedNode: node.ref }));
        dragRef.current = { nodeRef: node.ref, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...node.position } };
        return true;
      }
    }

    exitEdit();
    return false;
  }, [state, pieces, zoom, toPattern, exitEdit]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;

    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom;
      const newPos: Point2D = {
        x: dragRef.current.startPos.x + dx,
        y: dragRef.current.startPos.y + dy,
      };

      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (piece) {
        const newOutline = applyNodeMove(
          piece.outline,
          dragRef.current.nodeRef.commandIndex,
          dragRef.current.nodeRef.pointType,
          newPos,
        );
        dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
        const updatedPiece = { ...piece, outline: newOutline };
        setState(s => ({ ...s, nodes: extractNodes(updatedPiece) }));
      }
      return true;
    }

    // Hover detection
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;
    const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
    const HIT = 8 / zoom;

    let hovered: NodeRef | null = null;
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(localPt.x - node.cp1.x, localPt.y - node.cp1.y);
        if (d < HIT) { hovered = { ...node.ref, pointType: 'cp2' }; break; }
      }
      const d = Math.hypot(localPt.x - node.position.x, localPt.y - node.position.y);
      if (d < HIT) { hovered = node.ref; break; }
    }

    if (hovered !== state.hoveredNode) {
      setState(s => ({ ...s, hoveredNode: hovered }));
    }
    return false;
  }, [state, pieces, zoom, toPattern, dispatch]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.isEditing) {
      exitEdit();
    }
  }, [state.isEditing, exitEdit]);

  return {
    ...state,
    enterEdit,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
  };
}
```

**Step 2: Update imports that reference `useNodeEditor`**

In `src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx`, change line 2:

```typescript
// FROM:
import { NodeRef } from '../../useNodeEditor';
// TO:
import { NodeRef } from '../../nodeEditorUtils';
```

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`, change line 2:

```typescript
// FROM:
import { NodeRef } from '../useNodeEditor';
// TO:
import { NodeRef } from '../nodeEditorUtils';
```

In `src/components/PatternEditor/useEditorInteractions.ts`, change line 7:

```typescript
// FROM:
import { extractNodes, NodeRef } from './useNodeEditor';
// TO:
import { extractNodes, NodeRef } from './nodeEditorUtils';
```

**Step 3: Delete `useNodeEditor.ts`**

```bash
rm src/components/PatternEditor/useNodeEditor.ts
```

**Step 4: Update `PatternEditor.tsx` to use `useEditCurve`**

In `src/components/PatternEditor/PatternEditor.tsx`, change line 13:

```typescript
// FROM:
import { useNodeEditor } from './useNodeEditor';
// TO:
import { useEditCurve } from './useEditCurve';
```

Change line 119:

```typescript
// FROM:
const nodeEditor = useNodeEditor(zoom2D, pan2D);
// TO:
const nodeEditor = useEditCurve(zoom2D, pan2D);
```

The rest of `PatternEditor.tsx` continues to use `nodeEditor` as the variable name — the API shape is identical (`enterEdit` maps to `enterNodeEdit`, etc.). Update the method names:

In `useEditorInteractions.ts` ToolHooks interface (lines 74-82), rename `enterNodeEdit` to `enterEdit`:

```typescript
  nodeEditor: {
    isEditing: boolean;
    hoveredNode: unknown;
    enterEdit: (pieceId: string, selectedNode?: NodeRef) => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
  };
```

In `useEditorInteractions.ts`, update all `nodeEditor.enterNodeEdit` calls (line 196 and line 289) to `nodeEditor.enterEdit`.

**Step 5: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(editor): replace useNodeEditor with useEditCurve + shared utils"
```

---

### Task 5: Create `EditPatternOverlay` component

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx`

**Step 1: Create the overlay**

Create `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx`:

```tsx
import type { PatternPiece, Point2D } from '../../../../types/types';

interface EditPatternOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  editingPieceId: string;
  nodes: Array<{ position: Point2D; ref: { commandIndex: number } }>;
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
  marquee: { start: Point2D; current: Point2D } | null;
}

export default function EditPatternOverlay({
  zoom2D,
  pieces,
  editingPieceId,
  nodes,
  selectedNodes,
  selectedSegments,
  hoveredNode,
  hoveredSegment,
  addPointPreview,
  marquee,
}: EditPatternOverlayProps) {
  const piece = pieces.find(p => p.id === editingPieceId);
  if (!piece) return null;

  const r = 5 / zoom2D;
  const sw = 1.2 / zoom2D;

  // Build segment paths for highlight
  const segmentHighlights: JSX.Element[] = [];
  const outline = piece.outline;
  let prevX = 0, prevY = 0;
  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    const isSelected = selectedSegments.has(i);
    const isHovered = hoveredSegment === i && !isSelected;

    if (isSelected || isHovered) {
      let d = '';
      if (cmd.type === 'L') {
        d = `M ${prevX} ${prevY} L ${cmd.values[0]} ${cmd.values[1]}`;
      } else if (cmd.type === 'C') {
        d = `M ${prevX} ${prevY} C ${cmd.values.join(' ')}`;
      } else if (cmd.type === 'Q') {
        d = `M ${prevX} ${prevY} Q ${cmd.values.join(' ')}`;
      }
      if (d) {
        segmentHighlights.push(
          <path
            key={`seg-${i}`}
            d={d}
            fill="none"
            stroke={isSelected ? '#FFD700' : '#6BB3FF'}
            strokeWidth={2.5 / zoom2D}
            opacity={isSelected ? 1 : 0.6}
          />
        );
      }
    }

    // Track previous anchor for segment path construction
    switch (cmd.type) {
      case 'M':
      case 'L':
        prevX = cmd.values[0]; prevY = cmd.values[1]; break;
      case 'C':
        prevX = cmd.values[4]; prevY = cmd.values[5]; break;
      case 'Q':
        prevX = cmd.values[2]; prevY = cmd.values[3]; break;
    }
  }

  return (
    <>
      <g transform={`translate(${piece.position.x}, ${piece.position.y})`}>
        {/* Segment highlights */}
        {segmentHighlights}

        {/* Add-point preview */}
        {addPointPreview && (
          <circle
            cx={addPointPreview.x}
            cy={addPointPreview.y}
            r={4 / zoom2D}
            fill="#4A9EFF"
            opacity={0.5}
          />
        )}

        {/* Anchor points */}
        {nodes.map((node, i) => {
          const isSelected = selectedNodes.has(node.ref.commandIndex);
          const isHovered = hoveredNode === node.ref.commandIndex;
          return (
            <circle
              key={i}
              cx={node.position.x}
              cy={node.position.y}
              r={r}
              fill={isSelected ? '#FFD700' : isHovered ? '#6BB3FF' : '#4A9EFF'}
              stroke="#fff"
              strokeWidth={sw}
              style={{ cursor: 'move' }}
            />
          );
        })}
      </g>

      {/* Marquee selection rectangle */}
      {marquee && (
        <rect
          x={Math.min(marquee.start.x, marquee.current.x)}
          y={Math.min(marquee.start.y, marquee.current.y)}
          width={Math.abs(marquee.current.x - marquee.start.x)}
          height={Math.abs(marquee.current.y - marquee.start.y)}
          fill="rgba(74, 158, 255, 0.1)"
          stroke="#4A9EFF"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}
    </>
  );
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx
git commit -m "feat(editor): add EditPatternOverlay SVG component"
```

---

### Task 6: Wire Edit Pattern tool into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

**Step 1: Add Edit Pattern overlay to ToolOverlay**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:

Add import at top:

```typescript
import EditPatternOverlay from './overlays/EditPatternOverlay';
import type { EditableNode } from '../nodeEditorUtils';
```

Add these props to the `ToolOverlayProps` interface:

```typescript
  // Edit Pattern
  editPatternIsEditing: boolean;
  editPatternEditingPieceId: string | null;
  editPatternNodes: EditableNode[];
  editPatternSelectedNodes: Set<number>;
  editPatternSelectedSegments: Set<number>;
  editPatternHoveredNode: number | null;
  editPatternHoveredSegment: number | null;
  editPatternAddPointPreview: Point2D | null;
  editPatternMarquee: { start: Point2D; current: Point2D } | null;
```

Add rendering block before the closing `</>`, before the NodeEditorOverlay block:

```tsx
      {props.editPatternIsEditing && props.editPatternEditingPieceId && (
        <EditPatternOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          editingPieceId={props.editPatternEditingPieceId}
          nodes={props.editPatternNodes}
          selectedNodes={props.editPatternSelectedNodes}
          selectedSegments={props.editPatternSelectedSegments}
          hoveredNode={props.editPatternHoveredNode}
          hoveredSegment={props.editPatternHoveredSegment}
          addPointPreview={props.editPatternAddPointPreview}
          marquee={props.editPatternMarquee}
        />
      )}
```

**Step 2: Wire Edit Pattern into useEditorInteractions**

In `src/components/PatternEditor/useEditorInteractions.ts`:

Add `editPattern` to the ToolHooks interface:

```typescript
  editPattern: {
    isEditing: boolean;
    hoveredNode: number | null;
    hoveredSegment: number | null;
    enterEdit: (pieceId: string) => void;
    exitEdit: () => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    handleDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    getCursor: () => string;
  };
```

Add `editPattern` to the destructure on the tools line:

```typescript
const { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern } = tools;
```

Add keyboard handler registration in the useEffect (after line 164):

```typescript
if (activeTool === 'editPattern') handlers.push(editPattern.handleKeyDown);
```

Add to deps array of that useEffect.

In `handleDoubleClick`, add editPattern case before the select case:

```typescript
if (activeTool === 'editPattern') {
  const handled = editPattern.handleDoubleClick(e);
  if (handled) return;
}
```

Also change the existing select double-click to enter editPattern instead of nodeEditor when the tool is 'select':

```typescript
// When in select mode, double-click enters editPattern mode
if (activeTool === 'select') {
  const target = e.target as SVGElement;
  const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
  if (pieceId) {
    editPattern.enterEdit(pieceId);
  }
}
```

In `handleMouseDown`, add before the existing `pen` routing:

```typescript
if (editPattern.isEditing && activeTool === 'editPattern') {
  const handled = editPattern.handleMouseDown(e);
  if (handled) return;
}
if (activeTool === 'editPattern') {
  // Not yet editing — click piece to enter
  const target = e.target as SVGElement;
  const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
  if (pieceId) {
    editPattern.enterEdit(pieceId);
  } else {
    editPattern.exitEdit();
  }
  return;
}
```

In `handleMouseMove`, add:

```typescript
if (editPattern.isEditing && activeTool === 'editPattern') {
  editPattern.handleMouseMove(e);
  return;
}
```

In `handleMouseUp`, add:

```typescript
if (activeTool === 'editPattern') editPattern.handleMouseUp();
```

In `getCursor`, add case:

```typescript
case 'editPattern': return editPattern.isEditing ? editPattern.getCursor() : 'default';
```

**Step 3: Wire in PatternEditor.tsx**

Add import:

```typescript
import { useEditPattern } from './useEditPattern';
```

Add hook instantiation (after the nodeEditor line):

```typescript
const editPatternTool = useEditPattern(zoom2D, pan2D);
```

Pass to `useEditorInteractions`:

```typescript
const { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } =
  useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
    pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool,
  });
```

Pass overlay props to ToolOverlay:

```typescript
editPatternIsEditing={editPatternTool.isEditing}
editPatternEditingPieceId={editPatternTool.editingPieceId}
editPatternNodes={editPatternTool.nodes}
editPatternSelectedNodes={editPatternTool.selectedNodes}
editPatternSelectedSegments={editPatternTool.selectedSegments}
editPatternHoveredNode={editPatternTool.hoveredNode}
editPatternHoveredSegment={editPatternTool.hoveredSegment}
editPatternAddPointPreview={editPatternTool.addPointPreview}
editPatternMarquee={editPatternTool.marquee}
```

**Step 4: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(editor): wire Edit Pattern tool into PatternEditor"
```

---

### Task 7: Add convert line/curve to context menu

**Files:**
- Modify: `src/components/PatternEditor/ContextMenu.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

**Step 1: Extend ContextMenuState and props**

In `src/components/PatternEditor/ContextMenu.tsx`, extend `ContextMenuState`:

```typescript
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  pieceId: string | null;
  pieceName?: string;
  /** Segment command index for convert options (set when right-clicking in edit pattern mode) */
  segmentIndex?: number;
  /** Whether the segment is currently a curve */
  segmentIsCurve?: boolean;
}
```

Add to `ContextMenuProps`:

```typescript
interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
}
```

In the component, add convert items when `segmentIndex` is defined. Add this block after the piece context items, before the delete item:

```typescript
if (menu.segmentIndex !== undefined) {
  items.push({
    label: menu.segmentIsCurve ? 'Convert to Line' : 'Convert to Curve',
    icon: menu.segmentIsCurve ? '─' : '⌒',
    action: () => act(() => onConvertSegment?.(menu.segmentIndex!, !menu.segmentIsCurve)),
    separator: true,
  });
}
```

**Step 2: Wire in PatternEditor.tsx**

In the `handleContextMenu` callback, when `editPatternTool.isEditing`, detect segment under cursor and populate `segmentIndex`/`segmentIsCurve` in the context menu state.

Add this before `setCtxMenu`:

```typescript
// If editing pattern, check for segment hit
let segmentIndex: number | undefined;
let segmentIsCurve: boolean | undefined;
if (editPatternTool.isEditing && editPatternTool.editingPieceId && hitPiece?.id === editPatternTool.editingPieceId) {
  const { nearestSegment } = await import('./nodeEditorUtils');
  const localPt = { x: canvasX - hitPiece.position.x, y: canvasY - hitPiece.position.y };
  const segHit = nearestSegment(localPt, hitPiece.outline);
  if (segHit && segHit.distance <= 8 / zoom2D) {
    segmentIndex = segHit.commandIndex;
    const cmd = hitPiece.outline[segHit.commandIndex];
    segmentIsCurve = cmd?.type === 'C' || cmd?.type === 'Q';
  }
}
```

Wait — dynamic imports aren't needed. Use a static import. Add to PatternEditor.tsx imports:

```typescript
import { nearestSegment } from './nodeEditorUtils';
```

And make `handleContextMenu` synchronous — compute the segment hit inline:

```typescript
let segmentIndex: number | undefined;
let segmentIsCurve: boolean | undefined;
if (editPatternTool.isEditing && editPatternTool.editingPieceId && hitPiece?.id === editPatternTool.editingPieceId) {
  const localPt = { x: canvasX - hitPiece.position.x, y: canvasY - hitPiece.position.y };
  const segHit = nearestSegment(localPt, hitPiece.outline);
  if (segHit && segHit.distance <= 8 / zoom2D) {
    segmentIndex = segHit.commandIndex;
    const cmd = hitPiece.outline[segHit.commandIndex];
    segmentIsCurve = cmd?.type === 'C' || cmd?.type === 'Q';
  }
}

setCtxMenu({
  visible: true,
  x: e.clientX,
  y: e.clientY,
  pieceId: hitPiece?.id ?? null,
  pieceName: hitPiece?.name,
  segmentIndex,
  segmentIsCurve,
});
```

Pass `onConvertSegment` to ContextMenu:

```typescript
<ContextMenu
  menu={ctxMenu}
  onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
  onRename={(id) => setEditingPieceNameId(id)}
  onConvertSegment={(idx, toCurve) => editPatternTool.convertSegment(idx, toCurve)}
/>
```

**Step 3: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(editor): add convert line/curve to context menu"
```

---

### Task 8: Copilot integration — implement `curve_edge` and add `straighten_edge`

**Files:**
- Modify: `src/copilot/actions/actionTypes.ts`
- Modify: `src/copilot/actions/actionExecutor.ts`
- Modify: `src/copilot/llm/actionSchemas.ts`

**Step 1: Add `straighten_edge` action type**

In `src/copilot/actions/actionTypes.ts`, add after the `SplitEdgeAction` interface:

```typescript
export interface StraightenEdgeAction {
  action: 'straighten_edge';
  pieceId: string;
  edgeIndex: number;
}
```

Add `StraightenEdgeAction` to the `GeometryAction` union type.

**Step 2: Implement `curve_edge` handler**

In `src/copilot/actions/actionExecutor.ts`, replace the `curve_edge` stub:

```typescript
case 'curve_edge': {
  const piece = state.project.pieces.find(p => p.id === action.pieceId);
  if (!piece) throw new Error('Piece not found');

  const edges = piece.outline.filter(c => c.type !== 'Z');
  const cmdIdx = action.edgeIndex + 1; // +1 because edgeIndex 0 = segment from M to first L
  if (cmdIdx < 0 || cmdIdx >= piece.outline.length) {
    throw new Error(`Edge index ${action.edgeIndex} out of range`);
  }
  const cmd = piece.outline[cmdIdx];
  if (cmd.type !== 'L') {
    return {
      data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
      summary: `Edge ${action.edgeIndex} is already a curve`,
    };
  }

  // Find previous anchor
  let prevX = 0, prevY = 0;
  for (let i = cmdIdx - 1; i >= 0; i--) {
    const c = piece.outline[i];
    if (c.type === 'M' || c.type === 'L') { prevX = c.values[0]; prevY = c.values[1]; break; }
    if (c.type === 'C') { prevX = c.values[4]; prevY = c.values[5]; break; }
    if (c.type === 'Q') { prevX = c.values[2]; prevY = c.values[3]; break; }
  }

  const endX = cmd.values[0], endY = cmd.values[1];
  const dx = endX - prevX, dy = endY - prevY;

  // Perpendicular offset for curvature
  const nx = -dy, ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  const offset = action.curvature * len * 0.3;

  const midX = (prevX + endX) / 2 + (nx / len) * offset;
  const midY = (prevY + endY) / 2 + (ny / len) * offset;

  // Place cp1 and cp2 to create smooth curve through offset midpoint
  const cp1x = prevX + (midX - prevX) * 2 / 3 + (endX - prevX) / 3;
  const cp1y = prevY + (midY - prevY) * 2 / 3 + (endY - prevY) / 3;
  const cp2x = endX + (midX - endX) * 2 / 3 + (prevX - endX) / 3;
  const cp2y = endY + (midY - endY) * 2 / 3 + (prevY - endY) / 3;

  const newOutline = piece.outline.map((c, i) => {
    if (i !== cmdIdx) return c;
    return { type: 'C' as const, values: [cp1x, cp1y, cp2x, cp2y, endX, endY] };
  });

  this.dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));

  return {
    data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex, curvature: action.curvature },
    summary: `Curved edge ${action.edgeIndex} with curvature ${action.curvature}`,
  };
}
```

**Step 3: Add `straighten_edge` handler**

Add after the `curve_edge` case:

```typescript
case 'straighten_edge': {
  const piece = state.project.pieces.find(p => p.id === action.pieceId);
  if (!piece) throw new Error('Piece not found');

  const cmdIdx = action.edgeIndex + 1;
  if (cmdIdx < 0 || cmdIdx >= piece.outline.length) {
    throw new Error(`Edge index ${action.edgeIndex} out of range`);
  }
  const cmd = piece.outline[cmdIdx];
  if (cmd.type === 'L') {
    return {
      data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
      summary: `Edge ${action.edgeIndex} is already straight`,
    };
  }
  if (cmd.type !== 'C' && cmd.type !== 'Q') {
    throw new Error(`Edge ${action.edgeIndex} is not a curve (type: ${cmd.type})`);
  }

  // Get anchor point
  const anchor = cmd.type === 'C'
    ? { x: cmd.values[4], y: cmd.values[5] }
    : { x: cmd.values[2], y: cmd.values[3] };

  const newOutline = piece.outline.map((c, i) => {
    if (i !== cmdIdx) return c;
    return { type: 'L' as const, values: [anchor.x, anchor.y] };
  });

  this.dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));

  return {
    data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
    summary: `Straightened edge ${action.edgeIndex}`,
  };
}
```

**Step 4: Add schemas**

In `src/copilot/llm/actionSchemas.ts`, add after the `add_point` schema:

```typescript
{
  action: 'delete_point',
  description: 'Delete a point from a piece outline',
  category: 'geometry',
  parameters: [
    { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
    { name: 'pointIndex', type: 'number', description: 'Index of the point to delete', required: true },
  ],
  examples: ['Delete point 3 from the front bodice', 'Remove the extra point on edge 2'],
},
{
  action: 'straighten_edge',
  description: 'Convert a curved edge to a straight line',
  category: 'geometry',
  parameters: [
    { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
    { name: 'edgeIndex', type: 'number', description: 'Index of the edge to straighten', required: true },
  ],
  examples: ['Straighten the armhole edge', 'Make edge 1 a straight line'],
},
```

**Step 5: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(copilot): implement curve_edge, add straighten_edge and delete_point schemas"
```

---

### Task 9: Visual verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify Edit Pattern tool**

1. Open browser to `http://localhost:5173`
2. Create a rectangle piece using the rectangle tool
3. Press `Z` to switch to Edit Pattern tool
4. Click the piece — should see 4 anchor dots (no bezier handles)
5. Click an anchor — should highlight gold
6. Drag an anchor — should move it
7. Shift+click another anchor — should multi-select
8. Double-click on an edge — should add a point
9. Select a point, press Delete — should remove it
10. Right-click a segment — should show "Convert to Curve"
11. Convert to curve — segment should become bezier
12. Press Escape — should exit edit mode

**Step 3: Verify Edit Curve tool**

1. Press `V` to switch to Edit Curve tool (or double-click piece in select mode)
2. Should see anchors AND bezier handle squares
3. Drag a handle — should change curve shape

**Step 4: Check console**

Run: Check browser console for 0 errors

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(editor): polish Edit Pattern tool after visual testing"
```
