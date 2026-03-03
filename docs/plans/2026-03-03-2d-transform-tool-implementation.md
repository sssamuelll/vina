# 2D Transform Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a CLO3D-style Transform tool with 8 resize handles + 1 rotation handle for the 2D pattern editor.

**Architecture:** Pure SVG transform handles rendered in the ToolOverlay layer. A `useTransformTool` React hook manages drag state and computes scale/rotation. Transform math lives in a pure utility module for testability. On mouse-up, transformed `PathCommand[]` values are dispatched via `updatePiece()`.

**Tech Stack:** React, SVG, Redux (Zustand-wrapped), Vitest

---

### Task 1: Add `transform` to Tool2D type and verify build

**Files:**
- Modify: `src/types/types.ts:267-290`

**Step 1: Add `transform` to the Tool2D union**

In `src/types/types.ts`, find the `Tool2D` type and add `'transform'` after `'select'`:

```typescript
export type Tool2D =
  | 'select'
  | 'transform'   // ← ADD THIS LINE
  | 'editCurve'
  // ... rest unchanged
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS (no errors — transform is already used in tools/definitions/transform.tsx but was previously stringly typed)

**Step 3: Commit**

```bash
git add src/types/types.ts
git commit -m "feat(editor): add transform to Tool2D type union"
```

---

### Task 2: Transform math utilities (pure functions, TDD)

**Files:**
- Create: `src/components/PatternEditor/transformUtils.ts`
- Create: `src/components/PatternEditor/__tests__/transformUtils.test.ts`

**Step 1: Write failing tests**

```typescript
// src/components/PatternEditor/__tests__/transformUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeBoundingBox,
  computeHandlePositions,
  scaleOutline,
  rotateOutline,
  HandleId,
} from '../transformUtils';
import type { PathCommand, PatternPiece } from '../../../types/types';

const makeRect = (x: number, y: number, w: number, h: number): PathCommand[] => [
  { type: 'M', values: [x, y] },
  { type: 'L', values: [x + w, y] },
  { type: 'L', values: [x + w, y + h] },
  { type: 'L', values: [x, y + h] },
  { type: 'Z', values: [] },
];

const makePiece = (id: string, outline: PathCommand[], pos = { x: 0, y: 0 }): PatternPiece => ({
  id,
  name: id,
  outline,
  internals: [],
  position: pos,
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  createdAt: 0,
  updatedAt: 0,
});

describe('computeBoundingBox', () => {
  it('returns bbox for a single piece at origin', () => {
    const pieces = [makePiece('p1', makeRect(0, 0, 100, 50))];
    const bbox = computeBoundingBox(pieces, ['p1']);
    expect(bbox).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('accounts for piece position offset', () => {
    const pieces = [makePiece('p1', makeRect(0, 0, 100, 50), { x: 30, y: 20 })];
    const bbox = computeBoundingBox(pieces, ['p1']);
    expect(bbox).toEqual({ x: 30, y: 20, width: 100, height: 50 });
  });

  it('returns combined bbox for multiple pieces', () => {
    const pieces = [
      makePiece('p1', makeRect(0, 0, 100, 50)),
      makePiece('p2', makeRect(0, 0, 80, 60), { x: 120, y: 10 }),
    ];
    const bbox = computeBoundingBox(pieces, ['p1', 'p2']);
    expect(bbox).toEqual({ x: 0, y: 0, width: 200, height: 70 });
  });

  it('returns null when no pieces selected', () => {
    const bbox = computeBoundingBox([], []);
    expect(bbox).toBeNull();
  });

  it('handles bezier curves by extracting all coordinate values', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, -20, 90, -20, 100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];
    const pieces = [makePiece('p1', outline)];
    const bbox = computeBoundingBox(pieces, ['p1']);
    // Control points extend to y=-20
    expect(bbox!.y).toBe(-20);
    expect(bbox!.height).toBe(70);
  });
});

describe('computeHandlePositions', () => {
  it('returns 9 handles for a bbox', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 50 });
    expect(handles).toHaveLength(9);
    expect(handles.map(h => h.id)).toEqual([
      'nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate',
    ]);
  });

  it('positions corners correctly', () => {
    const handles = computeHandlePositions({ x: 10, y: 20, width: 100, height: 50 });
    const nw = handles.find(h => h.id === 'nw')!;
    const se = handles.find(h => h.id === 'se')!;
    expect(nw.pos).toEqual({ x: 10, y: 20 });
    expect(se.pos).toEqual({ x: 110, y: 70 });
  });

  it('positions rotation handle above top-center', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 50 });
    const rot = handles.find(h => h.id === 'rotate')!;
    expect(rot.pos.x).toBe(50); // center X
    expect(rot.pos.y).toBeLessThan(0); // above top
  });
});

describe('scaleOutline', () => {
  it('scales a rectangle by 2x around center', () => {
    const outline = makeRect(0, 0, 100, 50);
    const center = { x: 50, y: 25 };
    const result = scaleOutline(outline, center, 2, 2);
    // M: (0,0) → center + (0-50)*2, (0-25)*2 = (-50, -25)
    expect(result[0].values).toEqual([-50, -25]);
    // L: (100,0) → center + (100-50)*2, (0-25)*2 = (150, -25)
    expect(result[1].values).toEqual([150, -25]);
  });

  it('scales only X axis with midpoint handles', () => {
    const outline = makeRect(0, 0, 100, 50);
    const center = { x: 50, y: 25 };
    const result = scaleOutline(outline, center, 1.5, 1);
    // Y values unchanged relative to center
    expect(result[0].values[1]).toBe(0); // (0-25)*1 + 25 = 0
    // X values scaled by 1.5
    expect(result[0].values[0]).toBe(-25); // (0-50)*1.5 + 50 = -25
  });

  it('scales cubic bezier control points', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, -20, 90, -20, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const center = { x: 50, y: 0 };
    const result = scaleOutline(outline, center, 2, 2);
    // C: cp1x=10 → (10-50)*2+50 = -30
    expect(result[1].values[0]).toBe(-30);
    // C: cp1y=-20 → (-20-0)*2+0 = -40
    expect(result[1].values[1]).toBe(-40);
  });
});

describe('rotateOutline', () => {
  it('rotates 90 degrees around center', () => {
    const outline = makeRect(0, 0, 100, 100);
    const center = { x: 50, y: 50 };
    const result = rotateOutline(outline, center, Math.PI / 2);
    // M: (0,0) → rotated 90° around (50,50)
    // dx=-50, dy=-50 → x'=50+(-50*0 - -50*1)=100, y'=50+(-50*1 + -50*0)=0
    expect(result[0].values[0]).toBeCloseTo(100);
    expect(result[0].values[1]).toBeCloseTo(0);
  });

  it('rotation by 0 returns same coordinates', () => {
    const outline = makeRect(10, 20, 100, 50);
    const center = { x: 60, y: 45 };
    const result = rotateOutline(outline, center, 0);
    expect(result[0].values).toEqual(outline[0].values);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PatternEditor/__tests__/transformUtils.test.ts`
Expected: FAIL — module not found

**Step 3: Implement transform utilities**

```typescript
// src/components/PatternEditor/transformUtils.ts
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';

export type HandleId = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'rotate';

export interface HandlePosition {
  id: HandleId;
  pos: Point2D;
  cursor: string;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ROTATION_ARM_LENGTH = 25; // pixels (will be divided by zoom)

/**
 * Compute the axis-aligned bounding box encompassing all selected pieces.
 * Accounts for piece position offset and all path coordinate values
 * (including bezier control points).
 */
export function computeBoundingBox(
  pieces: PatternPiece[],
  selectedIds: string[],
): BBox | null {
  const selected = pieces.filter(p => selectedIds.includes(p.id));
  if (selected.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const piece of selected) {
    const ox = piece.position?.x ?? 0;
    const oy = piece.position?.y ?? 0;
    for (const cmd of piece.outline) {
      const v = cmd.values;
      for (let i = 0; i < v.length; i += 2) {
        const px = v[i] + ox;
        const py = v[i + 1] + oy;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the 9 handle positions (8 resize + 1 rotation) for a bounding box.
 */
export function computeHandlePositions(bbox: BBox, zoom = 1): HandlePosition[] {
  const { x, y, width, height } = bbox;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const armLen = ROTATION_ARM_LENGTH / zoom;

  return [
    { id: 'nw', pos: { x, y }, cursor: 'nwse-resize' },
    { id: 'n',  pos: { x: cx, y }, cursor: 'ns-resize' },
    { id: 'ne', pos: { x: x + width, y }, cursor: 'nesw-resize' },
    { id: 'w',  pos: { x, y: cy }, cursor: 'ew-resize' },
    { id: 'e',  pos: { x: x + width, y: cy }, cursor: 'ew-resize' },
    { id: 'sw', pos: { x, y: y + height }, cursor: 'nesw-resize' },
    { id: 's',  pos: { x: cx, y: y + height }, cursor: 'ns-resize' },
    { id: 'se', pos: { x: x + width, y: y + height }, cursor: 'nwse-resize' },
    { id: 'rotate', pos: { x: cx, y: y - armLen }, cursor: 'grab' },
  ];
}

/**
 * Scale all coordinate values in a PathCommand[] around a center point.
 */
export function scaleOutline(
  outline: PathCommand[],
  center: Point2D,
  scaleX: number,
  scaleY: number,
): PathCommand[] {
  return outline.map(cmd => {
    if (cmd.type === 'Z' || cmd.values.length === 0) return cmd;
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      newValues[i] = center.x + (newValues[i] - center.x) * scaleX;
      if (i + 1 < newValues.length) {
        newValues[i + 1] = center.y + (newValues[i + 1] - center.y) * scaleY;
      }
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Rotate all coordinate values in a PathCommand[] around a center point.
 * Angle is in radians.
 */
export function rotateOutline(
  outline: PathCommand[],
  center: Point2D,
  angle: number,
): PathCommand[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map(cmd => {
    if (cmd.type === 'Z' || cmd.values.length === 0) return cmd;
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      const dx = newValues[i] - center.x;
      const dy = (i + 1 < newValues.length) ? newValues[i + 1] - center.y : 0;
      newValues[i] = center.x + dx * cos - dy * sin;
      if (i + 1 < newValues.length) {
        newValues[i + 1] = center.y + dx * sin + dy * cos;
      }
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Hit-test: find which handle (if any) is under the given pattern-space point.
 */
export function hitTestHandle(
  point: Point2D,
  handles: HandlePosition[],
  threshold: number,
): HandleId | null {
  for (const h of handles) {
    if (Math.hypot(point.x - h.pos.x, point.y - h.pos.y) <= threshold) {
      return h.id;
    }
  }
  return null;
}

/**
 * Compute scale factors from a drag on a resize handle.
 * Returns { scaleX, scaleY } relative to the bounding box.
 */
export function computeScaleFromDrag(
  handleId: HandleId,
  bbox: BBox,
  dragStart: Point2D,
  dragCurrent: Point2D,
  uniform: boolean,
): { scaleX: number; scaleY: number } {
  const dx = dragCurrent.x - dragStart.x;
  const dy = dragCurrent.y - dragStart.y;
  let scaleX = 1;
  let scaleY = 1;

  // Which axes does this handle affect?
  const affectsX = ['nw', 'ne', 'sw', 'se', 'e', 'w'].includes(handleId);
  const affectsY = ['nw', 'ne', 'sw', 'se', 'n', 's'].includes(handleId);
  const isLeft = ['nw', 'w', 'sw'].includes(handleId);
  const isTop = ['nw', 'n', 'ne'].includes(handleId);

  if (affectsX && bbox.width > 0) {
    scaleX = 1 + (isLeft ? -dx : dx) / bbox.width;
  }
  if (affectsY && bbox.height > 0) {
    scaleY = 1 + (isTop ? -dy : dy) / bbox.height;
  }

  if (uniform && affectsX && affectsY) {
    const avg = (scaleX + scaleY) / 2;
    scaleX = avg;
    scaleY = avg;
  }

  // Prevent negative/zero scale
  scaleX = Math.max(0.01, scaleX);
  scaleY = Math.max(0.01, scaleY);

  return { scaleX, scaleY };
}

/**
 * Compute rotation angle from dragging the rotation handle.
 * Returns angle in radians.
 */
export function computeRotationFromDrag(
  bbox: BBox,
  dragStart: Point2D,
  dragCurrent: Point2D,
  snapToIncrement: boolean,
): number {
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const startAngle = Math.atan2(dragStart.y - cy, dragStart.x - cx);
  const currentAngle = Math.atan2(dragCurrent.y - cy, dragCurrent.x - cx);
  let angle = currentAngle - startAngle;

  if (snapToIncrement) {
    const snap = Math.PI / 12; // 15 degrees
    angle = Math.round(angle / snap) * snap;
  }

  return angle;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/components/PatternEditor/__tests__/transformUtils.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/components/PatternEditor/transformUtils.ts src/components/PatternEditor/__tests__/transformUtils.test.ts
git commit -m "feat(editor): add transform math utilities with tests"
```

---

### Task 3: `useTransformTool` hook

**Files:**
- Create: `src/components/PatternEditor/useTransformTool.ts`

**Step 1: Implement the hook**

```typescript
// src/components/PatternEditor/useTransformTool.ts
import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece } from '../../types/types';
import {
  computeBoundingBox,
  computeHandlePositions,
  hitTestHandle,
  computeScaleFromDrag,
  computeRotationFromDrag,
  scaleOutline,
  rotateOutline,
  type BBox,
  type HandleId,
  type HandlePosition,
} from './transformUtils';

interface TransformDragState {
  handleId: HandleId;
  origin: Point2D;
  current: Point2D;
  piecesSnapshot: PatternPiece[];
}

export interface TransformPreview {
  scaleX: number;
  scaleY: number;
  rotation: number;
  centerX: number;
  centerY: number;
}

const HANDLE_HIT_THRESHOLD = 8; // screen pixels

export function useTransformTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  selectedPieceIds: string[],
  onTransform: (updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }>) => void,
) {
  const [drag, setDrag] = useState<TransformDragState | null>(null);
  const dragRef = useRef<TransformDragState | null>(null);
  const shiftRef = useRef(false);

  const bbox = computeBoundingBox(pieces, selectedPieceIds);
  const handles = bbox ? computeHandlePositions(bbox, zoom2D) : [];

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!bbox || handles.length === 0) return false;
      const pt = toPattern(e);
      const threshold = HANDLE_HIT_THRESHOLD / zoom2D;
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return false;

      const snapshot = pieces.filter(p => selectedPieceIds.includes(p.id)).map(p => ({
        ...p,
        outline: p.outline.map(cmd => ({ ...cmd, values: [...cmd.values] })),
        position: { ...p.position },
      }));

      const state: TransformDragState = {
        handleId: hitId,
        origin: pt,
        current: pt,
        piecesSnapshot: snapshot,
      };
      dragRef.current = state;
      shiftRef.current = e.shiftKey;
      setDrag(state);
      return true;
    },
    [bbox, handles, toPattern, pieces, selectedPieceIds, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!dragRef.current || !bbox) return false;
      shiftRef.current = e.shiftKey;
      const pt = toPattern(e);
      const updated = { ...dragRef.current, current: pt };
      dragRef.current = updated;
      setDrag(updated);
      return true;
    },
    [toPattern, bbox],
  );

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d || !bbox) {
      dragRef.current = null;
      setDrag(null);
      return;
    }

    const center: Point2D = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    const updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }> = [];

    if (d.handleId === 'rotate') {
      const angle = computeRotationFromDrag(bbox, d.origin, d.current, shiftRef.current);
      for (const snap of d.piecesSnapshot) {
        const ox = snap.position?.x ?? 0;
        const oy = snap.position?.y ?? 0;
        // Rotate outline points relative to global center (adjusted for piece position)
        const localCenter = { x: center.x - ox, y: center.y - oy };
        const newOutline = rotateOutline(snap.outline, localCenter, angle);
        // Also rotate the piece position around global center
        const dx = ox - center.x;
        const dy = oy - center.y;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const newPos = {
          x: center.x + dx * cos - dy * sin,
          y: center.y + dx * sin + dy * cos,
        };
        updates.push({ id: snap.id, outline: newOutline, position: newPos });
      }
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(d.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(d.handleId, bbox, d.origin, d.current, uniform);
      for (const snap of d.piecesSnapshot) {
        const ox = snap.position?.x ?? 0;
        const oy = snap.position?.y ?? 0;
        const localCenter = { x: center.x - ox, y: center.y - oy };
        const newOutline = scaleOutline(snap.outline, localCenter, scaleX, scaleY);
        // Scale position offset relative to center
        const newPos = {
          x: center.x + (ox - center.x) * scaleX,
          y: center.y + (oy - center.y) * scaleY,
        };
        updates.push({ id: snap.id, outline: newOutline, position: newPos });
      }
    }

    onTransform(updates);
    dragRef.current = null;
    setDrag(null);
  }, [bbox, onTransform]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
  }, []);

  // Compute preview transform for rendering ghost during drag
  let preview: TransformPreview | null = null;
  if (drag && bbox) {
    const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    if (drag.handleId === 'rotate') {
      const angle = computeRotationFromDrag(bbox, drag.origin, drag.current, shiftRef.current);
      preview = { scaleX: 1, scaleY: 1, rotation: angle, centerX: center.x, centerY: center.y };
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(drag.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(drag.handleId, bbox, drag.origin, drag.current, uniform);
      preview = { scaleX, scaleY, rotation: 0, centerX: center.x, centerY: center.y };
    }
  }

  const getCursor = useCallback(
    (pt: Point2D): string | null => {
      if (!handles.length) return null;
      const threshold = HANDLE_HIT_THRESHOLD / zoom2D;
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return null;
      return handles.find(h => h.id === hitId)?.cursor ?? null;
    },
    [handles, zoom2D],
  );

  return {
    bbox,
    handles,
    isDragging: drag !== null,
    preview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
  };
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useTransformTool.ts
git commit -m "feat(editor): add useTransformTool hook for scale/rotate"
```

---

### Task 4: TransformHandlesOverlay component

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx`

**Step 1: Implement the overlay**

```tsx
// src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx
import type { Point2D } from '../../../../types/types';
import type { BBox, HandlePosition } from '../../transformUtils';
import type { TransformPreview } from '../../useTransformTool';

interface TransformHandlesOverlayProps {
  zoom2D: number;
  bbox: BBox;
  handles: HandlePosition[];
  preview: TransformPreview | null;
}

const HANDLE_SIZE = 6;   // screen pixels
const ROTATE_RADIUS = 4; // screen pixels

export default function TransformHandlesOverlay({
  zoom2D,
  bbox,
  handles,
  preview,
}: TransformHandlesOverlayProps) {
  const hs = HANDLE_SIZE / zoom2D;
  const rr = ROTATE_RADIUS / zoom2D;
  const strokeW = 1 / zoom2D;

  // Transform string for preview ghost
  const previewTransform = preview
    ? `translate(${preview.centerX}, ${preview.centerY}) rotate(${(preview.rotation * 180) / Math.PI}) scale(${preview.scaleX}, ${preview.scaleY}) translate(${-preview.centerX}, ${-preview.centerY})`
    : undefined;

  const rotateHandle = handles.find(h => h.id === 'rotate');
  const topCenter = handles.find(h => h.id === 'n');

  return (
    <>
      {/* Bounding box */}
      <rect
        x={bbox.x}
        y={bbox.y}
        width={bbox.width}
        height={bbox.height}
        fill="none"
        stroke="#4A9EFF"
        strokeWidth={strokeW}
        strokeDasharray={`${4 / zoom2D}`}
        pointerEvents="none"
      />

      {/* Rotation arm (line from top-center to rotation handle) */}
      {rotateHandle && topCenter && (
        <line
          x1={topCenter.pos.x}
          y1={topCenter.pos.y}
          x2={rotateHandle.pos.x}
          y2={rotateHandle.pos.y}
          stroke="#4A9EFF"
          strokeWidth={strokeW}
          pointerEvents="none"
        />
      )}

      {/* Resize handles (squares) */}
      {handles
        .filter(h => h.id !== 'rotate')
        .map(h => (
          <rect
            key={h.id}
            x={h.pos.x - hs / 2}
            y={h.pos.y - hs / 2}
            width={hs}
            height={hs}
            fill="white"
            stroke="#4A9EFF"
            strokeWidth={strokeW}
            style={{ cursor: h.cursor }}
          />
        ))}

      {/* Rotation handle (circle) */}
      {rotateHandle && (
        <circle
          cx={rotateHandle.pos.x}
          cy={rotateHandle.pos.y}
          r={rr}
          fill="white"
          stroke="#4A9EFF"
          strokeWidth={strokeW}
          style={{ cursor: 'grab' }}
        />
      )}

      {/* Preview ghost during drag */}
      {preview && (
        <rect
          x={bbox.x}
          y={bbox.y}
          width={bbox.width}
          height={bbox.height}
          fill="rgba(74, 158, 255, 0.1)"
          stroke="#4A9EFF"
          strokeWidth={strokeW}
          strokeDasharray={`${2 / zoom2D}`}
          opacity={0.5}
          transform={previewTransform}
          pointerEvents="none"
        />
      )}
    </>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx
git commit -m "feat(editor): add TransformHandlesOverlay SVG component"
```

---

### Task 5: Wire transform tool into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

**Step 1: Add transform to ToolOverlay**

In `src/components/PatternEditor/renderers/ToolOverlay.tsx`:

1. Add import at top:
```typescript
import TransformHandlesOverlay from './overlays/TransformHandlesOverlay';
import type { BBox, HandlePosition } from '../transformUtils';
import type { TransformPreview } from '../useTransformTool';
```

2. Add to `ToolOverlayProps` interface:
```typescript
  transformBbox: BBox | null;
  transformHandles: HandlePosition[];
  transformPreview: TransformPreview | null;
```

3. Add render block before the closing `</>` (before NodeEditorOverlay):
```typescript
      {activeTool === 'transform' && props.transformBbox && (
        <TransformHandlesOverlay
          zoom2D={zoom2D}
          bbox={props.transformBbox}
          handles={props.transformHandles}
          preview={props.transformPreview}
        />
      )}
```

**Step 2: Add transform routing to useEditorInteractions**

In `src/components/PatternEditor/useEditorInteractions.ts`:

1. Add to `ToolHooks` interface:
```typescript
  transformTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: (pt: Point2D) => string | null;
  };
```

2. Destructure in the function body (add to existing destructure line):
```typescript
  const { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool } = tools;
```

3. In `handleMouseDown`, add before the `if (activeTool === 'select')` block:
```typescript
    if (activeTool === 'transform') {
      const handled = transformTool.handleMouseDown(e);
      if (handled) return;
      // Fall through to selection logic if no handle was hit
    }
```

4. Also in `handleMouseDown`, duplicate the select tool's piece-selection logic for transform. Add after the transform block above:
```typescript
    if (activeTool === 'transform') {
      // Piece selection (same as select tool)
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        if (e.shiftKey) {
          dispatch(togglePieceSelection(pieceId));
        } else {
          dispatch(selectPiece(pieceId));
        }
      } else {
        dispatch(clearSelection());
      }
      return;
    }
```

5. In `handleMouseMove`, add before the `if (dragRef.current ...` block:
```typescript
    if (activeTool === 'transform') {
      const handled = transformTool.handleMouseMove(e);
      if (handled) return;
    }
```

6. In `handleMouseUp`, add:
```typescript
    if (activeTool === 'transform') transformTool.handleMouseUp();
```

7. In the keyboard `useEffect`, add:
```typescript
    if (activeTool === 'transform') handlers.push(transformTool.handleKeyDown);
```

8. In `getCursor`, add case:
```typescript
      case 'transform': return 'default';
```

**Step 3: Wire hook in PatternEditor**

In `src/components/PatternEditor/PatternEditor.tsx`:

1. Add import:
```typescript
import { useTransformTool } from './useTransformTool';
```

2. Add the hook call (after `measureTool` hook, before `useEditorInteractions`):
```typescript
  const handleTransform = useCallback((updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }>) => {
    for (const u of updates) {
      const piece = pieces.find(p => p.id === u.id);
      if (piece) {
        dispatch(updatePiece({
          ...piece,
          outline: u.outline,
          position: u.position,
          updatedAt: Date.now(),
        }));
      }
    }
  }, [pieces, dispatch]);

  const transformTool = useTransformTool(zoom2D, pan2D, pieces, selectedPieceIds, handleTransform);
```

3. Add `transformTool` to the `useEditorInteractions` call:
```typescript
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool,
    });
```

4. Add transform overlay props to `<ToolOverlay>`:
```typescript
            transformBbox={transformTool.bbox}
            transformHandles={transformTool.handles}
            transformPreview={transformTool.preview}
```

**Step 4: Import Point2D in PatternEditor**

Make sure `Point2D` is imported in PatternEditor.tsx (it should already be from the PatternPiece import, but verify).

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Verify tests still pass**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(editor): wire transform tool into PatternEditor"
```

---

### Task 6: Visual verification and polish

**Files:**
- Possibly modify: Any of the above files for fixes found during testing

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test transform tool**

1. Open the app in the browser
2. Create a rectangular piece (Rectangle tool)
3. Select the piece (Select tool)
4. Switch to Transform tool (press `A` or click toolbar)
5. Verify: 8 blue-bordered white squares appear at corners and midpoints
6. Verify: 1 circle rotation handle above top-center with arm line
7. Drag a corner handle — piece should scale
8. Drag a midpoint handle — piece should scale on one axis
9. Drag rotation handle — piece should rotate
10. Hold Shift while dragging corner — should allow non-uniform scale
11. Hold Shift while rotating — should snap to 15-degree increments
12. Press Escape during drag — should cancel
13. Select multiple pieces with Shift+click — transform should work on all

**Step 3: Fix any issues found**

Apply fixes as needed.

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add -u
git commit -m "fix(editor): polish transform tool from visual testing"
```
