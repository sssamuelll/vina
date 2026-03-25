# Slash and Spread Tool Design

> Issue #363 — Slash and Spread Tool — cut and spread/rotate for fullness

## Overview

The Slash and Spread tool lets users cut a piece along an arbitrary line and spread one half to add fullness (e.g., flared skirt from straight). The operation modifies the piece in place — the result is one piece with a wider silhouette, not two separate pieces. This matches CLO3D behavior and standard pattern drafting practice.

Two spread modes are supported:

- **Pivot mode** — one half rotates around a chosen endpoint of the slash line, opening a wedge-shaped gap. The amount is expressed in degrees.
- **Parallel mode** — one half translates perpendicular to the slash line, opening a parallel gap. The amount is expressed in millimetres.

## Core Geometry

The geometry module lives at `src/utils/geometry/slashAndSpread.ts`. All functions are pure and exported for both UI and copilot use.

### Exported Functions

| Function | Purpose |
|----------|---------|
| `findSlashIntersections` | Find the two points where a slash line crosses a closed outline |
| `splitOutlineAtSlash` | Split the outline into `halfA` / `halfB` and return a `SplitMap` |
| `pointInPolygon` | Ray-casting point-in-polygon test (used for half selection) |
| `flattenPathToPoints` | Flatten a `PathCommand[]` to `Point2D[]` (used internally) |
| `classifyInternals` | Assign internal lines to the half containing the majority of 5 arc-length samples |
| `classifyDarts` | Assign darts to the half containing the dart apex |
| `applyPivotSpread` | Rotate a half (outline + internals + darts) around a pivot point |
| `applyParallelSpread` | Translate a half perpendicular to the slash direction |
| `mergeSpreadHalves` | Stitch the two halves back into a single closed outline with gap fill |
| `rebuildSemanticEdges` | Re-index semantic edge `segmentRange` values after the merge |
| `buildSpreadPiece` | Top-level orchestrator: all steps → returns new `PatternPiece` |

### `buildSpreadPiece` Signature

```typescript
function buildSpreadPiece(
  piece: PatternPiece,
  hit1: OutlineHit,
  hit2: OutlineHit,
  selectedHalf: 'A' | 'B',         // which half moves
  pivotEnd: 'start' | 'end',        // pivot = hit1 ('start') or hit2 ('end')
  spreadAmount: number,             // degrees (pivot) or mm (parallel)
  mode: 'pivot' | 'parallel',
  gapFill: 'straight' | 'smooth',
): PatternPiece
```

### Algorithm

1. **Split** — `splitOutlineAtSlash` wraps `splitOutlineAtPoints` and also builds a `SplitMap` that records, for each command in each half, the index of the originating command in the original outline (or -1 for commands inserted at the cut points).
2. **Classify internals** — each `InternalLine` is sampled at 5 arc-length-evenly-spaced points; the half receiving more samples claims the line.
3. **Classify darts** — each dart is assigned to the half containing its apex point.
4. **Apply spread** — the chosen half is transformed:
   - Pivot mode: `applyPivotSpread` rotates all coordinates counter-clockwise around the pivot by `spreadAmount` degrees.
   - Parallel mode: `applyParallelSpread` translates all coordinates perpendicular to the slash direction by `spreadAmount` mm.
5. **Merge** — `mergeSpreadHalves` strips the synthetic boundary edges from each half and stitches them together:
   - `'straight'` gap fill inserts a single `L` command at each of the two gaps.
   - `'smooth'` gap fill inserts a cubic bezier `C` command computed via Catmull-Rom tangents from the neighbouring body edges.
6. **Rebuild semantic edges** — `rebuildSemanticEdges` uses the `SplitMap` to offset `segmentRange` indices for commands that shifted position in the merged outline due to gap-fill commands being inserted.
7. **Return** — a new `PatternPiece` with the same `id`, updated `outline`, `internals`, `darts`, and `edges`.

### `SplitMap` and `OutlineHit` Types

```typescript
export interface SplitMap {
  halfAIndices: number[]; // new index → original command index (-1 = inserted)
  halfBIndices: number[];
  hit1: OutlineHit;
  hit2: OutlineHit;
}
```

`OutlineHit` is re-exported from `splitOutline.ts` (unchanged).

### Gap Fill Detail

`'straight'` inserts `L(toPt)` — one line per gap.

`'smooth'` inserts a single `C` (cubic bezier) using Catmull-Rom control points:
```
cp1 = fromPt + (toPt  - prevFrom) / 6
cp2 = toPt   - (nextTo - fromPt)  / 6
```
where `prevFrom` is the body-edge point immediately before the gap start, and `nextTo` is the body-edge point immediately after the gap end.

### Edge Cases

- **0° / 0 mm spread** — `buildSpreadPiece` still executes all steps and returns a piece that is geometrically identical to the input (no early-out; the identity transform produces the correct outline).
- **Slash line with exactly 2 intersections required** — `findSlashIntersections` throws if it finds anything other than exactly 2 intersection points. The callers (hook and copilot tools) catch this and report the error.
- **Large angles (>180°)** — allowed; produces extreme fullness and may create self-intersecting outlines, which are valid for pattern drafting.
- **Bezier outlines** — `rotateCommands` and `translateCommands` treat every consecutive pair of values as an `(x, y)` coordinate, so cubic bezier control points and endpoints are all transformed correctly.

## UI Interaction

### Hook: `useSlashAndSpreadTool`

Located at `src/components/PatternEditor/useSlashAndSpreadTool.ts`. Implements the interaction as a pure state machine with all transition logic extracted into exported pure functions (`transitionMouseDown`, `transitionMouseMove`, `transitionMouseUp`, `transitionKeyDown`) for testability. The React hook wires these to SVG mouse/keyboard events and dispatches Redux actions for side effects.

### 8-Phase State Machine

```
idle → drawingSlash → slashComplete → selectingHalf →
halfConfirmed → awaitingDrag → spreading → spreadPreview → (apply → idle)
```

| Phase | Description |
|-------|-------------|
| `idle` | No active operation. Click on a selected piece's outline snaps to it and starts `drawingSlash`. |
| `drawingSlash` | Start point is locked; a live line follows the cursor. Second click on the outline (with optional snap) sets the end point and calls `findSlashIntersections` + `splitOutlineAtSlash`. On success → `slashComplete`. On error → stays in `drawingSlash` with error message. |
| `slashComplete` | Outline is split; both halves are available. Mouse-move highlights the hovered half. Click inside a half → `selectingHalf` with `selectedHalf` set. |
| `selectingHalf` | Same as `slashComplete` + `selectedHalf` is set. Click → `halfConfirmed`. |
| `halfConfirmed` | Selected half is highlighted. The two slash endpoints are shown as pivot candidates. Click within `PIVOT_THRESHOLD` (15 px / zoom) of either endpoint sets `pivotPoint` + `pivotEnd` and transitions to `awaitingDrag`. |
| `awaitingDrag` | Pivot is chosen. Mouse-move begins computing `spreadAmount` and building a live `previewPiece` via `buildSpreadPiece`. Phase transitions to `spreading` on first move. |
| `spreading` | Live drag. Each `mouseMove` recomputes `spreadAmount` (angle or distance depending on `mode`) and rebuilds `previewPiece`. `mouseUp` → `spreadPreview`. |
| `spreadPreview` | Drag complete. Preview piece is frozen. **Enter** commits (`updatePiece` dispatched, resets to idle). **Escape** reverts to `awaitingDrag`. |

### Keyboard Shortcuts

| Key | Phase(s) active | Effect |
|-----|----------------|--------|
| `Escape` | Any | Full reset to `idle` (or to `awaitingDrag` if in `spreadPreview`) |
| `Enter` | `spreadPreview` | Commit and apply the spread |
| `Tab` | `halfConfirmed`, `awaitingDrag`, `spreading`, `spreadPreview` | Toggle between `pivot` and `parallel` mode |

### Snap Thresholds

- **Outline snap** (`SNAP_THRESHOLD = 8` screen pixels) — used during `idle` and `drawingSlash` to snap the cursor to the nearest point on the piece outline.
- **Pivot snap** (`PIVOT_THRESHOLD = 15` screen pixels) — used during `halfConfirmed` to detect a click near either slash endpoint.

### Tool Options (Redux `toolSlice`)

Stored under `toolOptions.slashAndSpread`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'pivot' \| 'parallel'` | `'pivot'` | Spread mode (Tab toggles in-session) |
| `gapFill` | `'straight' \| 'smooth'` | `'straight'` | Gap bridging strategy |

### Cursor Mapping

| Phase | Cursor |
|-------|--------|
| `idle`, `drawingSlash` | `crosshair` |
| `slashComplete`, `selectingHalf`, `halfConfirmed` | `pointer` |
| `awaitingDrag` | `grab` |
| `spreading` | `grabbing` |
| `spreadPreview` | `default` |

## Visual Preview

### `SlashAndSpreadOverlay` Component

Located at `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx`. Rendered as a sibling inside the PatternEditor SVG tree with `pointerEvents="none"`.

All stroke widths and radii are divided by `zoom2D` to remain constant in screen pixels.

| Phase | Rendered elements |
|-------|------------------|
| `drawingSlash` | Dashed orange line from start to cursor; orange circle (snap indicator) at start point |
| `slashComplete`, `selectingHalf` | Solid orange slash line; hovered half filled light blue (`rgba(173,216,230,0.3)`); orange dots at slash endpoints |
| `halfConfirmed`, `awaitingDrag` | Solid orange slash line; selected half filled semi-transparent yellow (`rgba(255,215,0,0.3)`) with gold stroke; slash endpoint dots (green when pivot confirmed, orange otherwise); active pivot highlighted with a larger green ring |
| `spreading`, `spreadPreview` | Original piece outline faded dashed (`#999`, 50% opacity); preview piece outline in orange with 10% yellow fill; green pivot dot; arc indicator showing `spreadAmount` in degrees; text label showing `{value}°` (pivot mode) or `{value} mm` (parallel mode) centred between the slash endpoints |

The arc is built using the SVG arc command. For pivot mode the arc radius is `20 / zoom2D`.

## Copilot Tools

Both tools are defined in `src/copilot/action/tools/definitions/patternOpsTools.ts` and call into `src/utils/geometry/slashAndSpread.ts` via dynamic import.

### `slashAndSpread`

Full control: slash line defined by edge names and parametric positions.

```typescript
slashAndSpread(
  pieceId: string,
  fromEdge: string,         // semantic edge name where slash starts
  fromT?: number,           // parametric position on fromEdge (default 0.5)
  toEdge: string,           // semantic edge name where slash ends
  toT?: number,             // parametric position on toEdge (default 0.5)
  selectedHalf: 'A' | 'B', // which half to spread
  pivotEnd?: 'from' | 'to', // pivot end (default 'from' = start hit)
  spreadAmount: number,     // degrees (pivot) or mm (parallel)
  mode?: 'pivot' | 'parallel', // default 'pivot'
  gapFill?: 'straight' | 'smooth', // default 'straight'
)
```

Required parameters: `pieceId`, `fromEdge`, `toEdge`, `selectedHalf`, `spreadAmount`.

Internally: resolves edge names to `SemanticEdge` objects, computes `fromPt`/`toPt` at the parametric positions via `getPointOnEdge`, calls `findSlashIntersections` and `buildSpreadPiece`, then dispatches `updatePiece`. Does not provide rollback.

### `slashAndSpreadSimple`

Simplified API for common copilot use cases ("slash horizontally at 50% and spread 15°"). Always uses pivot mode; always spreads half B; supports optional smooth gap fill.

```typescript
slashAndSpreadSimple(
  pieceId: string,
  position: number,          // 0=top, 1=bottom, 0.5=middle of bounding box
  spreadAngleDeg: number,
  pivotEnd?: 'start' | 'end', // default 'start'
  smooth?: boolean,           // default true (smooth gap fill)
)
```

Required parameters: `pieceId`, `position` (0–1), `spreadAngleDeg`.

Internally: computes the piece's bounding box from `piece.outline`, derives a horizontal slash at `slashY = minY + position * (maxY - minY)`, extends the line 10 units beyond the bounding box on each side, calls `findSlashIntersections` + `buildSpreadPiece`. Provides rollback via a deep-cloned snapshot of the original piece.

## Known Limitations

| Item | Notes |
|------|-------|
| Multiple slashes on one piece | Apply sequentially — each slash operates on the already-spread piece. No batch UI in this PR. |
| Undo | Handled by existing undo middleware — `updatePiece` is undoable. `slashAndSpreadSimple` additionally provides an explicit `rollback` function in the tool result. `slashAndSpread` does not. |
| Semantic edges after spread | `rebuildSemanticEdges` re-indexes `segmentRange` values using the `SplitMap`. Edges fully within the spread half get their ranges shifted by `gapCommandCount`. Edges that straddle the slash cut may become inaccurate — not addressed in this PR. |
| Bezier subdivision at cut | When a bezier segment is cut at an intersection, the subdivided fragment may not exactly match any original command. `buildSplitMap` records these as -1 (inserted). The affected edge may lose its semantic label if its start index falls on a subdivided fragment. |
| TSL/GPU solver | No simulation changes — spread modifies 2D pattern only. |
| Rotation not bounding-box-relative in `slashAndSpreadSimple` | `position` is relative to the piece outline's raw bounding box (no `piece.rotation` compensation). |

## Files

| File | Purpose |
|------|---------|
| `src/utils/geometry/slashAndSpread.ts` | All geometry: 7 exported functions + `buildSpreadPiece` orchestrator |
| `src/components/PatternEditor/useSlashAndSpreadTool.ts` | 8-phase state machine hook + pure transition functions |
| `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx` | SVG overlay component |
| `src/copilot/action/tools/definitions/patternOpsTools.ts` | `slashAndSpread` and `slashAndSpreadSimple` copilot tool definitions |

## Testing

- **Geometry unit tests** — target `src/utils/geometry/slashAndSpread.ts`:
  - `findSlashIntersections`: throws for 0 or 1 intersections; returns ordered tuple for valid slash
  - `splitOutlineAtSlash`: produces two closed halves; `splitMap` indices map back to original commands
  - `pointInPolygon`: correctly classifies interior vs exterior points
  - `classifyInternals` / `classifyDarts`: correct half assignment
  - `applyPivotSpread` / `applyParallelSpread`: correct rotation / translation; internals and darts transformed
  - `mergeSpreadHalves`: straight and smooth gap fill produce valid closed outlines
  - `rebuildSemanticEdges`: spread-half ranges shifted by `gapCommandCount`; static-half ranges unchanged
  - `buildSpreadPiece`: full round-trip on a rectangle; 0° spread = unchanged outline
- **Hook unit tests** — target pure transition functions in `useSlashAndSpreadTool.ts`:
  - Phase progression for each event in order
  - `Escape` resets at every phase
  - `Enter` in `spreadPreview` sets `_applyPiece`
  - `Tab` toggles mode in eligible phases
- **Type check** — `npx tsc --noEmit`
- **Existing test suite** — no regressions in `splitOutline`, `patternOps`, seam tools
