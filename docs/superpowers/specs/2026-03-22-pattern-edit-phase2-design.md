# 2D Pattern Edit Utilities Phase 2 — Design Spec

> Issue #384 · Split from #365 (merged as PR #385)

## Overview

Five new 2D pattern editing tools matching CLO3D behavior, each with UI tool + copilot tool registration.

| Tool | Access | Toolbar? |
|------|--------|----------|
| Unfold | Right-click fold line → context menu | No |
| Optimize Curve Points | Right-click piece/line → context menu | No |
| Offset Internal Line | Right-click internal line → context menu | No |
| Poly Pen | Toolbar button (shortcut: `y`) | Yes |
| Replace as Pattern Outline | Shift-select line + outline → context menu | No |

## Architecture

Same layered pattern as #365:

```
┌─────────────────────────────────┐
│  UI Tool (src/tools/definitions)│  ← mouse/keyboard → Redux dispatch
├─────────────────────────────────┤
│  Copilot Tool (src/copilot/     │  ← LLM params → Redux dispatch
│    action/tools/definitions)    │
├─────────────────────────────────┤
│  Pure Functions (patternOps.ts) │  ← PatternPiece in → PatternPiece out
├─────────────────────────────────┤
│  Geometry Utils (utils/geometry)│  ← math primitives
└─────────────────────────────────┘
```

All core logic lives as pure functions in `src/utils/patternOps.ts`. UI tools and copilot tools are thin wrappers that call these functions and dispatch Redux actions.

### Type Changes

- Add `'reference'` to `InternalLineType` union in `src/types/types.ts`
- No new top-level interfaces needed

### New Files

| File | Purpose |
|------|---------|
| `src/tools/definitions/polyPen.tsx` | Poly Pen tool definition |
| `src/components/PatternEditor/usePolyPenTool.ts` | Canvas interaction hook |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx` | Preview rendering |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/types.ts` | Add `'reference'` to `InternalLineType` |
| `src/utils/patternOps.ts` | 5 new pure functions |
| `src/utils/geometry/bezier.ts` | Add `fitCubicBezier()` utility |
| `src/tools/registry.ts` | Register polyPen tool |
| `src/copilot/action/tools/definitions/patternOpsTools.ts` | 5 new copilot tools |
| `src/components/PatternEditor/PatternEditor.tsx` | Wire polyPen hook + context menu entries |
| `src/components/PatternEditor/renderers/` | Reference line rendering style |
| Context menu component | Add unfold, optimize, offset, replace entries |

---

## Tool 1: Unfold

Mirrors a half-pattern piece along a fold internal line to produce a full symmetric pattern.

### Pure Function

```typescript
unfoldPiece(
  piece: PatternPiece,
  foldLineId: string,
  options?: { outlineOnly?: boolean }
): PatternPiece
```

### Algorithm

1. Find the fold line in `piece.internals` by `foldLineId`. Error if not found or type !== `'fold'`.
2. Extract fold axis: start point (P1) and end point (P2) from the fold line path.
3. Mirror the outline: for each `PathCommand`, reflect all coordinate values across the fold axis using: `Q' = 2 × proj(Q, P1→P2) − Q`
4. Merge original + mirrored outlines into one continuous closed path:
   a. Find the two outline points closest to P1 and P2 (the fold line endpoints). These are the **split points** where the fold line meets the outline.
   b. Split the original outline into two halves at these split points: the **kept half** (the side with actual geometry) and the **fold-edge half** (the side that lies along the fold line).
   c. Mirror the kept half across the fold axis to get the **mirrored half**.
   d. Build the merged outline: walk the kept half from split-point-A → split-point-B, then walk the mirrored half from split-point-B → split-point-A (reversed), close with `Z`.
   e. The fold-edge half is discarded (it's the edge that was on the fold line).
   f. Handle `M` commands: the mirrored half's commands are converted from `M` to `L` at the junction point to maintain path continuity.
5. If `outlineOnly` is false (default):
   - Mirror all internals (darts, notches, grainline, topstitch, pleat)
   - Reflect their paths across the same axis
   - Generate new IDs for mirrored internals
   - Darts: mirror legs, apex, and flip foldDirection
6. Remove the fold line from internals (it's now interior to the piece)
7. Re-detect semantic edges via `detectSemanticEdges()`
8. Invalidate seams: any seams referencing this piece's old semantic edges are marked stale. The caller (UI or copilot tool) should dispatch `removeSeam` for affected seams and notify the user to re-sew.
9. Return new piece with preserved ID

### Edge Cases

- Fold line doesn't span full piece width → find nearest outline points within tolerance (2mm), snap, then proceed with merge
- Piece has no fold internals → return error
- Batch unfold of multiple fold lines → **out of scope for Phase 2** (defer to future iteration)

### UI Access

Right-click a fold internal line → context menu:
- "Unfold" (mirrors all)
- "Unfold Outline Only" (mirrors only outline)

### Copilot Tool

```typescript
{
  name: 'unfoldPiece',
  description: 'Mirror a half-pattern along a fold line to produce a full symmetric piece',
  params: {
    pieceId: { type: 'string', required: true },
    foldLineId: { type: 'string', required: true },
    outlineOnly: { type: 'boolean', default: false }
  },
  rollback: snapshot restore
}
```

---

## Tool 2: Optimize Curve Points

Reduces redundant bezier control points on outlines or internal lines while preserving shape within tolerance.

### Pure Functions

```typescript
// Low-level: operates on a PathCommand array
optimizeCurvePoints(
  commands: PathCommand[],
  ratio: number                    // 0.0 (aggressive) to 1.0 (preserve all)
): PathCommand[]

// Piece-level wrapper
optimizePieceCurves(
  piece: PatternPiece,
  options?: {
    ratio?: number,                // default 0.5
    target?: 'all' | 'outline' | { internalLineId: string }
  }
): PatternPiece
```

### Algorithm — RDP + Bezier Refit

1. For each cubic bezier segment (`C` command) in the path:
   - Sample into N polyline points (N proportional to arc length via Gauss-Legendre)
2. Concatenate all sampled points into a single point sequence
3. Run Ramer-Douglas-Peucker simplification:
   - Tolerance derived from ratio: `tolerance = (1 - ratio) × maxDeviation`
   - `maxDeviation` = fraction of bounding box diagonal (e.g., 0.5% at ratio 0)
4. Re-fit simplified point sequence back to cubic bezier segments using least-squares bezier fitting (`fitCubicBezier()`)
5. For straight segments (`L`, `H`, `V`): merge consecutive collinear segments
6. Preserve `M` and `Z` commands untouched

### New Geometry Utility

`src/utils/geometry/bezier.ts` — add:

```typescript
fitCubicBezier(points: Point2D[], maxError?: number): PathCommand[]
```

Implementation: Philip J. Schneider's algorithm (Graphics Gems I). Iteratively fits cubic bezier curves to a sequence of points, splitting at high-error regions. This is the industry standard (used by Illustrator, Inkscape, Paper.js).

### UI Access

Right-click context menu:
- On piece background → "Optimize All Curve Points" (outline + all internals)
- On specific internal line → "Optimize Curve Points" (that line only)

Dialog with:
- Ratio slider (0–100%), default 50%
- Live preview updating as slider moves

### Copilot Tool

```typescript
{
  name: 'optimizeCurvePoints',
  description: 'Reduce bezier control points while preserving curve shape',
  params: {
    pieceId: { type: 'string', required: true },
    ratio: { type: 'number', default: 0.5, min: 0, max: 1 },
    target: { type: 'string', default: 'all', description: '"all", "outline", or an internalLineId' }
  },
  rollback: snapshot restore
}
```

---

## Tool 3: Offset Internal Line

Creates N parallel copies of an internal line at a fixed distance, with optional extension to the pattern outline boundary.

### Pure Function

```typescript
offsetInternalLine(
  piece: PatternPiece,
  sourceLineId: string,
  options: {
    count: number,                     // 1-10
    distance: number,                  // mm between each copy
    reverse?: boolean,                 // flip offset direction (default false)
    extend?: boolean,                  // extend to outline boundary (default false)
    sourceSegmentRange?: [number, number]  // for offsetting part of outline
  }
): PatternPiece
```

### Algorithm

1. Get source path from `piece.internals` by `sourceLineId`, or from outline if `sourceLineId === '__outline__'` (using `sourceSegmentRange`)
2. Flatten the source path to a dense polyline using `samplePathAtIntervals()` from `arcLength.ts` (interval = 0.5mm for accuracy)
3. For each offset copy `i` (1 to `count`):
   - Compute offset distance: `i × distance` (negate if `reverse`)
   - Offset the flattened polyline: for each vertex, shift by normal vector × distance
   - Clean up self-intersections at concave corners using Clipper2 (matching seam allowance approach)
   - Re-fit the offset polyline back to bezier curves using `fitCubicBezier()` to preserve curve quality (rather than leaving as a raw polyline)
4. If `extend` is true:
   - Flatten the piece outline to a polyline using `samplePathAtIntervals()`
   - Find intersection of offset line endpoints with the flattened outline using `linePolylineIntersections()` from `src/utils/geometry/lineIntersect.ts`
   - Extend or trim offset line to those intersection points
5. Add each offset copy as a new `InternalLine`:
   - Type matches source line type (or `'fold'` if source was outline)
   - Generated ID via `uid('line')` (existing helper in `patternOps.ts`)

**Note:** We use a flatten → offset → refit pipeline rather than direct bezier offset (Tiller-Hanson) because Clipper2 only operates on polylines, and the refit step via `fitCubicBezier()` restores smooth curves. This is simpler and equally accurate.

### UI Access

Right-click an internal line → "Offset as Internal Line". Dialog with:
- Count spinner (1–10), default 1
- Distance input (mm)
- Reverse direction checkbox (default off)
- Extend to outline checkbox (default off)
- Live preview

### Copilot Tool

```typescript
{
  name: 'offsetInternalLine',
  description: 'Create parallel copies of an internal line at a given distance',
  params: {
    pieceId: { type: 'string', required: true },
    sourceLineId: { type: 'string', required: true },
    count: { type: 'number', default: 1, min: 1, max: 10 },
    distance: { type: 'number', required: true },
    reverse: { type: 'boolean', default: false },
    extend: { type: 'boolean', default: false }
  },
  rollback: snapshot restore
}
```

---

## Tool 4: Poly Pen

Combined straight + curve drawing tool. Click places straight vertices, click-and-drag creates bezier curves.

### Interaction Model

| Action | Result | PathCommand |
|--------|--------|-------------|
| Click | Straight segment point | `L` |
| Click + drag | Bezier curve point (drag controls tangent handles) | `C` |
| Shift + click/drag | Constrain to 0°/45°/90° | — |
| Click on start point | Close shape and finish | `Z` |
| Double-click | Close shape and finish | `Z` |
| Escape | Cancel drawing | — |

**Note:** Only `L` and `C` commands are produced (no `Q` / quadratic bezier). This avoids introducing a PathCommand type that downstream consumers (`outlineBBox`, `measureEdgeLength`, seam allowance, cloth meshing) do not fully handle. CLO3D's "free curve point" (Ctrl+click) is deferred until `Q` support is audited across the pipeline.

### State Machine

```
Idle → (click on canvas) → Drawing
Drawing → (click) → add L point, stay Drawing
Drawing → (mousedown + mousemove) → Dragging handles
Dragging → (mouseup) → add C point, back to Drawing
Drawing → (click start / double-click) → Close → dispatch
Drawing → (Escape) → Idle (discard)
```

### Tool Definition

```typescript
// src/tools/definitions/polyPen.tsx
{
  id: 'polyPen',
  name: 'Poly Pen',
  context: '2d',
  shortcut: 'y',
  group: 'drawing',
  icon: PolyPenIcon,
  cursor: 'crosshair',
  options: [
    { id: 'mode', type: 'select', choices: [
      { label: 'New Piece', value: 'piece' },
      { label: 'Internal Line', value: 'internalLine' }
    ], default: 'piece' },
    { id: 'lineType', type: 'select', choices: [
      { label: 'Fold', value: 'fold' },
      { label: 'Reference', value: 'reference' },
      { label: 'Topstitch', value: 'topstitch' }
    ], default: 'fold', visibleWhen: { mode: 'internalLine' } },
    { id: 'snapGrid', type: 'boolean', default: true }
  ],
  copilot: {
    description: 'Draw pattern shapes with combined straight lines and bezier curves',
    capabilities: ['create-piece', 'add-internal-line']
  }
}
```

### Mode Option

- `piece` — creates a new PatternPiece with drawn path as outline. Dispatches `addPiece()`.
- `internalLine` — adds drawn path as internal line to currently selected piece. Dispatches `addInternalLine()` with the selected `lineType` (`'fold'` by default). Requires a selected piece.

### Hook: `usePolyPenTool.ts`

Local state:
- `nodes: Array<{ point: Point2D, type: 'straight' | 'curve', handleIn?: Point2D, handleOut?: Point2D }>`
- `previewPoint: Point2D | null` — current cursor position for preview line
- `isDragging: boolean` — true during handle drag
- `dragHandle: Point2D | null` — current handle position during drag

Returns: `{ handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, nodes, previewPoint, isDragging, dragHandle }`

### Overlay: `PolyPenToolOverlay.tsx`

Renders in SVG:
- Placed points as filled circles (4px / zoom)
- Bezier handles as thin lines + hollow circles for curve points
- Preview line from last placed point to cursor (dashed)
- Close indicator: larger hollow circle when hovering within 8px of start point
- Completed segments rendered as solid path

### Copilot Tool

```typescript
{
  name: 'polyPenDraw',
  description: 'Draw a shape from a list of points with straight lines and curves',
  params: {
    points: {
      type: 'array',
      items: {
        x: 'number', y: 'number',
        type: "'straight' | 'curve'",
        handleIn: '{ x, y } | undefined',
        handleOut: '{ x, y } | undefined'
      },
      required: true
    },
    mode: { type: 'string', enum: ['piece', 'internalLine'], default: 'piece' },
    targetPieceId: { type: 'string', description: 'Required when mode is internalLine' }
  },
  rollback: snapshot restore
}
```

The copilot tool accepts a fully-specified point array and builds the PathCommand sequence from it, since the LLM cannot perform interactive mouse gestures.

---

## Tool 5: Replace as Pattern Outline

Swaps an internal line with a section of the pattern outline. The old outline section becomes a `'reference'` internal line.

### Pure Function

```typescript
replaceAsPatternOutline(
  piece: PatternPiece,
  internalLineId: string,
  outlineSegmentRange: [number, number]
): PatternPiece
```

### Algorithm

1. Get the internal line path from `piece.internals` by `internalLineId`
2. Get the outline segment range — commands from `outlineSegmentRange[0]` to `outlineSegmentRange[1]` in `piece.outline`
3. Validate endpoints: internal line start/end must be within tolerance (2mm) of outline segment range start/end. Snap if within tolerance; error if not.
4. Detect orientation: compare internal line start point to outline segment start point. If internal line start matches outline segment end → reverse the internal line commands.
5. Build new outline:
   - Commands `[0, segmentRange[0])` — before the replaced section
   - Internal line commands (oriented correctly, first command converted to `L` if it's an `M`)
   - Commands `(segmentRange[1], end]` — after the replaced section
   - Close with `Z`
6. Convert old outline segment into a new `InternalLine` with:
   - `type: 'reference'`
   - Generated ID via `uid('line')` (existing helper in `patternOps.ts`)
   - Path: the extracted outline commands (with leading `M` at the segment start point)
7. Remove the original internal line from `piece.internals`
8. Re-detect semantic edges via `detectSemanticEdges()`

### Reference Line Rendering

Internal lines with `type: 'reference'` render as:
- Dashed gray line (`stroke-dasharray: "4 4"`, `stroke: #999`, `opacity: 0.6`)
- Distinct from fold lines (dash-dot) and other internal line types

### UI Access

1. Activate Edit Pattern tool
2. Shift+click to select an internal line AND an outline segment (combined selection)
3. Right-click → "Replace as Pattern Outline"

The Edit Pattern tool already has `selectedInternalLine` state in `editorSlice.ts`. The UI logic needs to allow Shift+click to keep both an internal line and outline segment selected simultaneously.

### Copilot Tool

```typescript
{
  name: 'replaceAsPatternOutline',
  description: 'Swap an internal line with a section of the pattern outline; old outline becomes a reference line',
  params: {
    pieceId: { type: 'string', required: true },
    internalLineId: { type: 'string', required: true },
    // UI tools pass command indices directly from selection state.
    // Copilot tool also accepts point-based range as an alternative,
    // since the LLM cannot easily determine command indices.
    outlineSegmentRange: { type: '[number, number]', required: false },
    outlineStartPoint: { type: '{ x, y }', required: false },
    outlineEndPoint: { type: '{ x, y }', required: false }
  },
  rollback: snapshot restore
}
```

The copilot tool accepts either `outlineSegmentRange` (command indices) or `outlineStartPoint` + `outlineEndPoint` (Point2D). When points are provided, the executor finds the nearest outline segments to resolve the range.

---

## Copilot Integration Summary

All 5 tools registered in `src/copilot/action/tools/definitions/patternOpsTools.ts`:

| Tool Name | Params | Rollback |
|-----------|--------|----------|
| `unfoldPiece` | pieceId, foldLineId, outlineOnly? | Deep snapshot |
| `optimizeCurvePoints` | pieceId, ratio?, target? | Deep snapshot |
| `offsetInternalLine` | pieceId, sourceLineId, count?, distance, reverse?, extend? | Deep snapshot |
| `polyPenDraw` | points[], mode, targetPieceId? | Remove created piece/line |
| `replaceAsPatternOutline` | pieceId, internalLineId, outlineSegmentRange | Deep snapshot |

All rollback snapshots use `JSON.parse(JSON.stringify(piece))` (deep copy, not shallow — lesson from #385 review).

All numeric params validated with `requireFiniteNumber()` guard (existing helper from #385 fixes).

**Note on param schemas:** The shorthand `params` notation in this spec is for readability. Implementation must use the established JSON Schema format (`type: 'object'`, `properties`, `required` arrays) matching the existing tools in `patternOpsTools.ts`.

---

## Testing Strategy

Unit tests in `src/utils/__tests__/patternOps.test.ts`:

- **Unfold**: fold line axis math, outline merge, internal mirroring, outlineOnly mode, missing fold error, seam invalidation
- **Optimize Curve Points**: straight-line collinearity merge, bezier simplification at various ratios, M/Z preservation, empty path
- **Offset Internal Line**: single/multi offset, reverse direction, extend to outline, concave corner handling
- **Replace as Pattern Outline**: orientation detection, reference line creation, endpoint snapping, out-of-tolerance error

New test file `src/utils/geometry/__tests__/bezier.test.ts`:
- `fitCubicBezier` accuracy tests — fit known curves, verify max error within tolerance

Integration tests for copilot tools: verify dispatch, rollback, and NaN validation.
