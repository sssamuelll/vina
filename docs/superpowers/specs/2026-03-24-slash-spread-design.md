# Slash and Spread Tool Design

> Issue #363 — Slash and Spread Tool — cut and spread/rotate for fullness

## Overview

The Slash and Spread tool lets users cut a piece along an arbitrary line and spread one half around a pivot point, inserting a wedge-shaped gap to add fullness (e.g., flared skirt from straight). The operation modifies the piece in place — the result is one piece with a wider silhouette, not two separate pieces. This matches CLO3D behavior and standard pattern drafting practice.

## Core Geometry

### Function Signature

Replaces the existing `slashAndSpread()` in `src/utils/patternOps.ts`:

```typescript
function slashAndSpread(
  piece: PatternPiece,
  slashStart: Point2D,    // first outline intersection point
  slashEnd: Point2D,      // second outline intersection point
  pivotEnd: 'start' | 'end',  // which intersection is the pivot
  spreadAngleDeg: number, // spread angle in degrees (positive = open)
  smooth: boolean,        // blend curves at wedge gap edges
): PatternPiece
```

### Algorithm

1. **Find intersections:** Use `findOutlineIntersections()` from `splitOutline.ts` to locate the two points where the slash line crosses the piece outline. Validates that exactly 2 intersections exist.
2. **Split outline:** Use `splitOutlineAtPoints()` to divide the outline into two halves at the intersection points.
3. **Identify halves:** The pivot-side half stays fixed. The moving half (opposite the pivot) will be rotated.
4. **Rotate moving half:** Rotate all points of the moving half by `spreadAngleDeg` around the pivot point. This opens a wedge-shaped gap.
5. **Fill the wedge gap:** Connect the rotated half back to the fixed half:
   - If `smooth = false`: two straight line segments bridge the gap (raw wedge).
   - If `smooth = true`: cubic bezier curves blend the gap edges for a smooth flared silhouette. Control points are computed from the tangent directions at the gap endpoints.
6. **Transform internal lines:** Internal lines (`piece.internals`) whose points fall in the moving half are rotated by the same angle around the pivot.
7. **Return:** A new `PatternPiece` with the modified outline and adjusted internals. ID and metadata are preserved.

### Edge Cases

- **0° spread:** Returns the piece unchanged (no-op).
- **Slash line tangent to outline (1 intersection):** Rejected — operation returns original piece.
- **Slash line outside piece (0 intersections):** Rejected — returns original piece.
- **Large angles (>180°):** Allowed — produces extreme fullness. The outline may self-intersect, which is valid for pattern drafting (the user handles it during construction).

### Dependencies

Reuses existing geometry from:
- `src/utils/geometry/splitOutline.ts` — `findOutlineIntersections`, `splitOutlineAtPoints`
- `src/utils/geometry/lineIntersect.ts` — line-polyline intersections
- `src/utils/pathHelpers.ts` — path command utilities

## UI Interaction

### Hook: `useSlashAndSpreadTool`

Located at `src/hooks/useSlashAndSpreadTool.ts`. The hook import already exists in `PatternEditor.tsx` but the file is missing.

### Two-Step Flow

**Step 1 — Draw slash line:**
1. User activates the slash-and-spread tool from the toolbar.
2. User clicks a point on a piece's outline — this becomes `slashStart`. The click snaps to the nearest outline point.
3. A dashed red preview line follows the cursor from `slashStart`.
4. User clicks a second point on the same piece's outline — this becomes `slashEnd`.
5. The slash line is validated: it must produce exactly 2 intersections with the piece outline. If invalid (e.g., line runs along an edge), the second click is rejected and the user retries.

**Step 2 — Drag from pivot to spread:**
1. After the slash line is confirmed, the two intersection endpoints are highlighted as clickable handles.
2. User click-drags from one end — that end becomes the pivot. The drag direction relative to the slash line determines the spread angle.
3. During drag, the preview updates live: the moving half is shown rotated, the wedge gap is rendered with semi-transparent fill, and a label shows `12.5° / 45mm` (angle + arc length at widest point).
4. On mouse-up, the operation is committed: `updatePiece` is dispatched with the result of `slashAndSpread()`.

### Cancellation

- **Escape** at any step resets the tool to idle.
- **Right-click** cancels the current step (goes back to step 1 if in step 2, or resets if in step 1).

### Tool Options

- `smooth: boolean` (default `true`) — accessible via the tool options panel (shift+right-click context menu, following the existing pattern). Controls whether the wedge gap is blended with curves or left as straight edges.

## Visual Preview

### SlashSpreadPreview Component

New component at `src/components/PatternEditor/renderers/SlashSpreadPreview.tsx`.

Renders during the slash-and-spread interaction:

**Step 1 preview:**
- Dashed red line from `slashStart` to cursor
- Snapping indicator (circle) when cursor is near the piece outline

**Step 2 preview:**
- The moving half of the outline, rotated to current angle (stroke only, thin gray)
- Wedge gap filled with semi-transparent blue (#3B82F6, opacity 0.15)
- Arc indicator at the pivot point showing the spread angle
- Text label: `{angle}° / {arcLength}mm` positioned near the widest point of the wedge

Rendered as a sibling to other renderers in the PatternEditor SVG tree, with `pointerEvents="none"`.

## Copilot Tools

### Upgraded `slashAndSpread` Tool

Replace the existing tool in `src/copilot/action/tools/definitions/patternOpsTools.ts`:

```typescript
slashAndSpread(
  pieceId: string,
  slashStartX: number, slashStartY: number,
  slashEndX: number, slashEndY: number,
  pivotEnd: 'start' | 'end',  // default 'start'
  spreadAngleDeg: number,
  smooth?: boolean,            // default true
)
```

Validates piece exists, computes intersections, calls `slashAndSpread()`, dispatches `updatePiece`.

### Convenience Tool: `slashAndSpreadSimple`

For common copilot use cases ("slash at the hip and spread 15°"):

```typescript
slashAndSpreadSimple(
  pieceId: string,
  position: number,         // 0–1 parametric along piece height (0=top, 1=bottom)
  spreadAngleDeg: number,
  pivotEnd?: 'start' | 'end',  // default 'start' (top)
  smooth?: boolean,
)
```

Converts `position` to a horizontal slash line at the computed Y coordinate, then calls the full `slashAndSpread`.

## Known Limitations / Follow-ups

| Item | Notes |
|------|-------|
| Multiple slashes on one piece | Apply sequentially — each slash modifies the piece, then the next slash operates on the already-spread piece. No batch UI in this PR. |
| Rotate mode (separate from spread) | Spread and rotate are the same operation geometrically (rotation around pivot). The `spreadAngleDeg` parameter covers both. No separate mode needed. |
| Undo | Handled by existing undo middleware — `updatePiece` is already undoable. |
| Seam/elastic cascade | Semantic edges are recomputed after piece modification. Seams referencing old edge names may become dangling (same issue as audit Finding #05). |

## Files Created/Modified

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/utils/patternOps.ts` | Replace `slashAndSpread` with full implementation |
| Create | `src/hooks/useSlashAndSpreadTool.ts` | Two-step interaction hook |
| Create | `src/components/PatternEditor/renderers/SlashSpreadPreview.tsx` | Preview SVG rendering |
| Modify | `src/components/PatternEditor/PatternEditor.tsx` | Wire hook (import exists, needs instantiation) |
| Modify | `src/components/PatternEditor/useEditorInteractions.ts` | Wire handlers (reference exists) |
| Modify | `src/copilot/action/tools/definitions/patternOpsTools.ts` | Upgrade + add convenience tool |
| Modify | `src/copilot/action/tools/registry.ts` | Register new tool if needed |
| Create | `src/utils/__tests__/slashAndSpread.test.ts` | Geometry tests |

## Testing Strategy

- **Geometry tests:** Rectangle slash produces correct wedge angle, pivot start vs end, 0° = no change, smooth vs raw output, internal lines rotated, edge cases (tangent, outside, large angle)
- **Copilot tool tests:** Validate parameter checking, piece existence, intersection validation
- **Type check:** `tsc --noEmit`
- **Existing tests:** No regressions in patternOps, splitOutline, seam tools
