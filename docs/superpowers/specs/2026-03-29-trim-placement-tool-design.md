# Trim Placement Tool — Phase 2 Design

> 2D edge-bound trim placement following the notch tool pattern.
> Covers: click-to-place, snap-to-edge, spacing/distribute, mirror-to-symmetric, trim library dropdown.

**Issue:** #483 (Phase 2 only)
**Depends on:** #226 Phase 1 (Trim Data Model + Store + Library + BOM) — already merged

---

## 1. Data Model Extension

Extend `TrimPlacement` in `src/types/trim.ts` with a new `edge-points` discriminant:

```typescript
type TrimPlacement =
  | { mode: 'edge'; edgeName: string; tStart: number; tEnd: number }       // Range — zippers
  | { mode: 'edge-points'; edgeName: string; positions: number[] }          // Points on edge — buttons, snaps
  | { mode: 'count'; quantity: number };                                    // BOM-only
```

### Key properties

- `positions`: parametric `t` values (0–1) along the named semantic edge
- Single-click placement appends one `t` value
- Distribute mode computes evenly-spaced `t` values and writes them all at once
- (x, y) coordinates derived from edge geometry + `t` at render time — not stored
- Backward compatible: existing `edge` and `count` modes unchanged

### Validation rules (in projectSlice reducer)

- `edgeName` must match an existing `SemanticEdge.name` on the target piece
- All `positions` values must be in [0, 1]
- `positions` array must have at least one entry

---

## 2. Tool Definition

New file: `src/tools/definitions/trim.tsx`

| Field | Value |
|-------|-------|
| `id` | `'trim'` |
| `name` | `'Trim'` |
| `context` | `'2d'` |
| `group` | Toolbar group after `notch`: `['notch', 'trim']` |
| `cursor` | `'crosshair'` |
| `icon` | Circle with 4 dots (button icon) |

### Tool Options

| Option | Type | Values | Default | Condition |
|--------|------|--------|---------|-----------|
| `trimPreset` | select | 23 presets from `trimLibrary`, grouped by type | First button preset | Always |
| `placementMode` | select | `single` / `distribute` | `single` | Always |
| `distributeCount` | number | 2–20 | 5 | `placementMode === 'distribute'` |
| `startOffset` | number | 0–50 mm | 10 | `placementMode === 'distribute'` |
| `endOffset` | number | 0–50 mm | 10 | `placementMode === 'distribute'` |

Tool options bar renders the standard `ToolOptionsBar2D` controls. Expert mode auto-remembers last-used preset and mode via `toolMemory`.

---

## 3. Interaction Hook — `useTrimTool`

New file: `src/components/PatternEditor/useTrimTool.ts`

Mirrors `useNotchTool` structure. Returns `{ handleMouseDown, handleMouseMove, hoveredEdge, previewPoint }`.

### State

```typescript
interface TrimHover {
  pieceId: string;
  edgeName: string;
  point: Point2D;       // Snapped position on edge
  t: number;            // Parametric position (0–1)
}
```

### handleMouseMove

1. Transform screen coords → pattern space (same as notch tool)
2. For each piece, iterate semantic edges
3. For each edge, project mouse point onto edge segments within `segmentRange`
4. Find closest point within 20px screen threshold
5. Compute parametric `t` along the edge
6. Update `hoveredEdge` state → triggers overlay render

### handleMouseDown — Single Mode

1. If no `hoveredEdge`, return
2. Resolve selected preset from tool options
3. Create `Trim` object:
   - `id`: `nanoid()`
   - `pieceId`: from hovered piece
   - `type`, `name`, `material`, `color`, `size`, `unitCost`: from preset
   - `presetId`: preset id
   - `placement`: `{ mode: 'edge-points', edgeName, positions: [t] }`
   - `active`: true
4. `batchUndo(dispatch, 'Place trim', () => dispatch(addTrim(trim)))`

### handleMouseDown — Distribute Mode

1. If no `hoveredEdge`, return
2. Read `distributeCount`, `startOffset`, `endOffset` from tool options
3. Compute edge length in mm from semantic edge geometry
4. Convert offsets to parametric: `tStart = startOffset / edgeLengthMm`, `tEnd = 1 - endOffset / edgeLengthMm`
5. Compute `N` evenly-spaced `t` values between `tStart` and `tEnd`
6. Create single `Trim` with `placement: { mode: 'edge-points', edgeName, positions: [t1, ..., tN] }`
7. `batchUndo(dispatch, 'Distribute trims', () => dispatch(addTrim(trim)))`

### Snap-to-Point (Shift modifier)

When Shift held, additionally check:
- Edge endpoint vertices (t=0, t=1)
- Construction points within 15px
- Snap to nearest qualifying point

---

## 4. Canvas Rendering

### 4a. TrimToolOverlay

New file: `src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx`

Renders when trim tool is active:

**Single mode hover:**
- Orange highlight on hovered edge (3px stroke, 0.3 opacity)
- Ghost trim icon at snap point (dashed circle for buttons, dashed line for zippers)
- Snap dot (filled orange circle, 5px radius)

**Distribute mode hover:**
- Orange highlight on hovered edge
- Preview of all N trim positions as ghost icons
- Spacing dimension lines between consecutive trims
- Start/end offset markers

All sizes scale by `1/zoom2D` for consistent screen appearance.

### 4b. TrimRenderer

New file: `src/components/PatternEditor/renderers/TrimRenderer.tsx`

Renders placed trims on each piece (always visible, not just when trim tool is active).

**Per trim type icons (SVG):**

| Type | Icon | Size reference |
|------|------|----------------|
| `button` | Filled circle + 2/4 hole dots | `trim.size` mm |
| `snap` | Concentric rings (male/female) | `trim.size` mm |
| `rivet` | Filled circle + center dot | `trim.size` mm |
| `zipper` | Dashed line along edge range | tStart→tEnd |
| `buckle` | Rounded rectangle | `trim.size` mm |
| `ring` | Open circle | `trim.size` mm |
| `hook-eye` | Hook + eye pair | `trim.size` mm |
| `drawstring-stop` | Small filled square | `trim.size` mm |
| `custom` | Diamond marker | `trim.size` mm |

**Rendering logic:**

For `edge-points` mode:
1. Resolve edge from piece's `edges[]` by `edgeName`
2. For each `t` in `positions`, interpolate (x, y) along the edge path segments
3. Draw trim icon at (x, y) with `trim.color` fill, `trim.size` diameter

For `edge` mode (zippers):
1. Resolve edge path between `tStart` and `tEnd`
2. Draw dashed line with zipper teeth marks along the path

For `count` mode:
- No rendering (BOM-only, no spatial position)

**Selection:**
- Click a rendered trim icon → select it (highlight ring)
- Right-click → context menu (Mirror, Delete, Edit Properties)

---

## 5. Mirror to Symmetric

Context menu item on right-click of a placed trim: **"Mirror to Linked Piece"**

### Algorithm

1. Look up `piece.linkedPieceId` and confirm `piece.linkMode === 'symmetry'`
2. If no linked piece, show toast: "No symmetric piece linked"
3. Find matching edge on target piece by `edgeName`
4. If no matching edge, show toast: "No matching edge found on linked piece"
5. Create new `Trim` on target piece:
   - Same preset, type, material, color, size, unitCost
   - `placement.positions` mirrored: `positions.map(t => 1 - t)` (works because semantic edges on symmetric pieces run in opposite directions along the mirror axis)
6. `batchUndo(dispatch, 'Mirror trim', fn)` wraps both original + mirrored as single undo

### Batch mirror

Right-click a piece (not a trim) → "Mirror All Trims to Linked Piece":
- Iterates all trims on the piece
- Creates mirrored copies on the linked piece
- Single undo step for the entire batch

---

## 6. Copilot Tool Updates

### Extend `addTrim` tool

Add `edge-points` mode support to existing `addTrim` tool parameters:
- When `placementMode === 'edge-points'`: accept `edgeName` + `positions: number[]`

### New tool: `distributeTrimAlongEdge`

```typescript
{
  name: 'distributeTrimAlongEdge',
  parameters: {
    pieceId: string,
    edgeName: string,
    presetId?: string,      // Or inline type/name/material/color/size
    count: number,          // 2–20
    startOffset?: number,   // mm, default 10
    endOffset?: number,     // mm, default 10
  }
}
```

Computes evenly-spaced positions and creates a single Trim with `edge-points` placement.

### New tool: `mirrorTrimsToSymmetric`

```typescript
{
  name: 'mirrorTrimsToSymmetric',
  parameters: {
    pieceId: string,        // Source piece — mirrors all its trims
    trimId?: string,        // Optional — mirror only this trim
  }
}
```

---

## 7. Trim BOM Integration

Update `src/utils/trim/trimExtractor.ts` to handle `edge-points` mode:

- **Quantity**: `positions.length` (number of discrete instances)
- **Unit**: `'pieces'` (not meters — these are countable items)
- Grouping key remains `type::name`
- Existing `edge` mode (zippers) unchanged: still calculates edge length in meters
- Existing `count` mode unchanged: uses `quantity` directly

---

## 8. Edge Helper — `interpolateEdgePoint`

New utility: `src/utils/geometry/edgeInterpolation.ts`

```typescript
function interpolateEdgePoint(
  piece: PatternPiece,
  edgeName: string,
  t: number,
): { point: Point2D; tangent: Point2D } | null
```

Resolves a parametric `t` (0–1) to an (x, y) position and tangent direction on a semantic edge. Used by both the interaction hook (snap feedback) and the renderer (trim icon positions).

### Algorithm

1. Find `SemanticEdge` by name in `piece.edges`
2. Extract outline path commands within `segmentRange`
3. Compute cumulative arc length along those commands
4. Walk to `t * totalLength`, interpolating on the active segment (line or cubic bezier)
5. Return point + tangent vector

### Path representation consistency (diagnostic #1–2)

Both `interpolateEdgePoint` and the distribute mode's edge length computation must use the same path representation. Use the same `flattenPath` + index approach as `edgeLengthMM` in the BOM extractor (`src/utils/export/bomExtractor.ts`). This is a known systemic `segmentRange` ambiguity shared with seam assembly, BOM extraction, and elastic assembly — this spec inherits it consistently rather than introducing a divergent interpretation.

---

## 9. Files Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| `src/types/trim.ts` | Modify | Add `edge-points` to TrimPlacement union |
| `src/tools/definitions/trim.tsx` | Create | Tool definition + icon |
| `src/tools/index.ts` | Modify | Register trim tool |
| `src/components/Toolbar2D/Toolbar2D.tsx` | Modify | Add `'trim'` to toolbar group |
| `src/components/PatternEditor/useTrimTool.ts` | Create | Interaction hook |
| `src/components/PatternEditor/renderers/overlays/TrimToolOverlay.tsx` | Create | Hover preview overlay |
| `src/components/PatternEditor/renderers/TrimRenderer.tsx` | Create | Placed trim rendering |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify | Wire useTrimTool + overlays |
| `src/components/PatternEditor/useEditorInteractions.ts` | Modify | Route trim tool events |
| `src/utils/geometry/edgeInterpolation.ts` | Create | `interpolateEdgePoint` utility |
| `src/utils/trim/trimExtractor.ts` | Modify | Handle `edge-points` in BOM extraction |
| `src/store/projectSlice.ts` | Modify | Validate `edge-points` placement in addTrim |
| `src/copilot/action/tools/definitions/trimTools.ts` | Modify | Extend addTrim, add 2 new tools |
| `src/copilot/action/tools/registry.ts` | Modify | Register new tools |

---

## Out of Scope (Future Phases)

- 3D trim rendering and cloth-following (Phase 3)
- Custom OBJ trim import (Phase 4)
- Buttonhole auto-generation, zipper puller shapes (Phase 5)
- Per-colorway trim color overrides (Phase 5)
- Free-point placement at arbitrary (x, y) positions
- Trim drag-to-reposition after placement
- Trim library sidebar panel (current design uses options bar dropdown)
