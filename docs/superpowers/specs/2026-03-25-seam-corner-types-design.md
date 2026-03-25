# Seam Corner Types — Design Spec

> Issue #255 — Extend seam allowance engine with 7 professional corner types

## Overview

Add 7 production-grade corner types to the seam allowance engine: mitered, double mitered, envelope, squared, slant, match, and trim mirrored. Per-vertex corner type configuration with a piece-level default. Custom edge-walk algorithm with per-vertex corner geometry, using Clipper2 only for self-intersection cleanup.

## Corner Types

| Type | Points | Description | Default Parameters |
|------|--------|-------------|-------------------|
| **Mitered** | 1 | Standard miter at corner — intersection of two offset edges. Default. | — |
| **Double Mitered** | 2 | Miter with blunted tip perpendicular to bisector. Prevents bulk. | depth = `saWidth * 0.3` |
| **Squared** | 3 | Right-angle box extension at corner. Belt loops, tabs. | — |
| **Slant** | 2 | Straight cut across miter at fixed angle (perpendicular to bisector). | — |
| **Envelope** | 4 | Extended rectangular tab beyond miter. Collars, facings. | extension = `saWidth * 0.75` |
| **Match** | varies | Mirrors partner piece corner geometry via seam lookup. Falls back to mitered if no seam or circular dependency. | — |
| **Trim Mirrored** | 2 | Symmetric trim on both sides of bisector. Decorative corners. | — |

Slant and envelope use fixed default parameters for v1. Per-corner parameter customization (e.g., custom slant angle) can be added later by extending `CornerType` to a discriminated union without changing the storage structure.

## Data Model

### New types in `src/types/types.ts`

```typescript
export type CornerType =
  | 'mitered'
  | 'doubleMitered'
  | 'envelope'
  | 'squared'
  | 'slant'
  | 'match'
  | 'trimMirrored';
```

### New fields on PatternPiece

```typescript
/** Default corner type for all vertices. Default 'mitered'. */
defaultCornerType?: CornerType;
/** Per-vertex corner type overrides. Key = outline command index. */
cornerTypes?: Record<number, CornerType>;
```

### Resolution logic

For vertex at outline index `i`:
```
piece.cornerTypes?.[i] ?? piece.defaultCornerType ?? 'mitered'
```

Sparse storage — a piece with all mitered corners stores nothing extra.

### Index stability on outline edits

When outline editing operations add or remove points (addPoint, removePoint, splitEdge), the `cornerTypes` keys must be shifted to stay aligned. A helper function handles this:

```typescript
function shiftCornerTypes(
  cornerTypes: Record<number, CornerType>,
  editIndex: number,
  delta: number,  // +1 for insert, -1 for remove
): Record<number, CornerType>
```

This is called by the projectSlice reducers that modify the outline (same pattern as `SemanticEdge.segmentRange` shifting). On insert at index `i`: keys >= `i` shift by +1. On remove at index `i`: key `i` is deleted, keys > `i` shift by -1.

## Geometry Engine

File: `src/utils/seam/cornerTypes.ts` — pure functions, no Redux.

### Algorithm (custom edge-walk + Clipper2 cleanup)

**No nearest-point mapping needed.** Instead of post-processing Clipper2's output, we compute the SA outline directly:

1. **Walk the piece outline** edge by edge. For each edge, compute the parallel offset line (perpendicular offset by `saWidth`).
2. **At each vertex**, join the two adjacent offset lines using the corner-type function for that vertex. This produces the corner geometry points.
3. **Assemble** the offset edges + corner points into a complete SA outline.
4. **Self-intersection cleanup** (concave regions only): pass the result through Clipper2's `SimplifyPolygon` or union operation to resolve any self-intersecting regions. This handles concave corners where offset edges cross.

This gives a **direct 1:1 correspondence** — vertex `i` in the piece outline produces the corner geometry at the corresponding position in the SA outline. No mapping, no ambiguity.

### Per-corner-type functions

Each function signature:
```typescript
(prevOffsetEdge: Line2D, nextOffsetEdge: Line2D, vertex: Point2D, saWidth: number, angle: number) → Point2D[]
```

Where `angle` is the interior angle at the vertex (radians), `prevOffsetEdge` and `nextOffsetEdge` are the two adjacent offset edge lines.

- **`cornerMitered`** — intersection of the two offset edge lines (1 point)
- **`cornerDoubleMitered`** — miter intersection, then blunt cut perpendicular to bisector at depth `saWidth * 0.3` (2 points)
- **`cornerSquared`** — extend prevOffsetEdge endpoint, right-angle turn, meet nextOffsetEdge start (3 points)
- **`cornerSlant`** — straight cut perpendicular to the angle bisector between the two offset edges (2 points)
- **`cornerEnvelope`** — extend both offset edges past their intersection by `saWidth * 0.75`, connect as rectangular tab (4 points)
- **`cornerMatch`** — look up seam partner via `seamLookup` callback, compute partner's corner as mitered, mirror it. If no seam or circular dependency (both pieces use match), fall back to mitered. (variable points)
- **`cornerTrimMirrored`** — trim equal amounts from both offset edges along the bisector, symmetric (2 points)

### Match corner — resolution and lookup chain

**Lookup chain:** vertex index → find `SemanticEdge` containing that index → find `Seam` referencing that edge → partner piece + partner edge → partner vertex at the corresponding position.

**Circular dependency resolution:** If piece A vertex uses `match` and the partner piece B vertex also uses `match`, resolve both as `mitered`. Mitered geometry is inherently matched (same algorithm on both sides of a seam produces identical corner geometry). Detection: before computing `match`, check if the partner vertex is also `match` → short-circuit to mitered.

### Top-level function

```typescript
export function generateSeamAllowanceWithCorners(
  outline: PathCommand[],
  saWidth: number,
  defaultCornerType: CornerType,
  cornerTypes: Record<number, CornerType>,
  seamLookup?: (vertexIndex: number) => {
    partnerOutline: PathCommand[];
    partnerVertex: number;
    partnerSaWidth: number;
    partnerCornerType: CornerType;
  } | null,
): PathCommand[]
```

This replaces calls to `generateSeamAllowance()` when corner types are configured. If `cornerTypes` is empty and `defaultCornerType` is `'mitered'`, the result is equivalent to `generateSeamAllowance(outline, saWidth, 'miter')`.

### Helper types

```typescript
interface Line2D {
  start: Point2D;
  end: Point2D;
}
```

### Helper functions

```typescript
/** Compute the parallel offset of an edge by saWidth (perpendicular). */
function offsetEdge(edge: Line2D, saWidth: number): Line2D

/** Compute intersection of two lines. Returns null if parallel. */
function lineIntersection(a: Line2D, b: Line2D): Point2D | null

/** Compute interior angle between two edges at a shared vertex. */
function interiorAngle(prevEdge: Line2D, nextEdge: Line2D): number

/** Compute the angle bisector direction at a vertex. */
function bisectorDirection(prevEdge: Line2D, nextEdge: Line2D): Point2D
```

## Rendering

In `PieceRenderer.tsx`, extend SA generation:

```typescript
const hasCornerTypes = piece.cornerTypes && Object.keys(piece.cornerTypes).length > 0;
const hasNonDefaultCorner = piece.defaultCornerType && piece.defaultCornerType !== 'mitered';

const saOutline = (hasCornerTypes || hasNonDefaultCorner)
  ? generateSeamAllowanceWithCorners(
      piece.outline, saWidth,
      piece.defaultCornerType ?? 'mitered',
      piece.cornerTypes ?? {},
      seamLookup,
    )
  : generateSeamAllowance(piece.outline, saWidth); // fast path — existing Clipper2
```

Memoize with `useMemo` keyed on `(outline, saWidth, defaultCornerType, cornerTypes)`.

Fast path: pieces with all-mitered corners (the vast majority) skip the custom edge-walk entirely and use the existing Clipper2 path — zero performance regression.

### Vertex indicators

When `seamAllowance` tool is active, render small circles at each outline vertex. Vertices with non-default corner types show an orange dot. Selected vertex highlighted in blue.

## UI — Context Menu

When the `seamAllowance` tool is active and user right-clicks a piece outline vertex:

File: `src/components/PatternEditor/CornerTypeMenu.tsx`

Contents:
- "Set All Corners..." option at top (sets defaultCornerType, clears overrides)
- Separator
- 7 corner type radio items (current type has checkmark)
- Current vertex index shown in header

On selection: dispatch `updatePiece({ id, cornerTypes: { ...existing, [vertexIndex]: type } })`.
On "Set All": dispatch `updatePiece({ id, defaultCornerType: type, cornerTypes: {} })`.

## DXF Export

The preparation pipeline (`src/utils/export/pipeline.ts`) calls `generateSeamAllowanceWithCorners` (when corner types are configured) instead of `generateSeamAllowance`. Corner geometry is baked into the SA outline. No exporter changes needed — both legacy and AAMA exporters receive pre-computed `seamOutline`.

## Copilot Tools

Added to `src/copilot/action/tools/definitions/seamTools.ts`:

### setCornerType
```typescript
{
  name: 'setCornerType',
  description: 'Set seam corner type for a specific vertex / Establecer tipo de esquina para un vértice específico',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      vertexIndex: { type: 'number', description: 'Outline command index of the vertex' },
      cornerType: { type: 'string', enum: ['mitered', 'doubleMitered', 'envelope', 'squared', 'slant', 'match', 'trimMirrored'] },
    },
    required: ['pieceId', 'vertexIndex', 'cornerType'],
  },
}
```

### setAllCorners
```typescript
{
  name: 'setAllCorners',
  description: 'Set default corner type for all vertices of a piece / Establecer tipo de esquina predeterminado para todos los vértices',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      cornerType: { type: 'string', enum: ['mitered', 'doubleMitered', 'envelope', 'squared', 'slant', 'match', 'trimMirrored'] },
    },
    required: ['pieceId', 'cornerType'],
  },
}
```

Register by adding to existing `seamToolDefs` array (no new module needed).

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `CornerType` type, `defaultCornerType` + `cornerTypes` on PatternPiece |
| `src/utils/seam/cornerTypes.ts` | New: all corner type functions + `generateSeamAllowanceWithCorners` + `shiftCornerTypes` |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Extend SA generation to use corner-typed version when configured |
| `src/components/PatternEditor/CornerTypeMenu.tsx` | New: right-click context menu for corner selection |
| `src/components/PatternEditor/PatternEditor.tsx` | Wire context menu to SA tool vertex right-click |
| `src/utils/export/pipeline.ts` | Call `generateSeamAllowanceWithCorners` in SA preparation when corner types exist |
| `src/copilot/action/tools/definitions/seamTools.ts` | Add `setCornerType` + `setAllCorners` tools |
| `src/store/projectSlice.ts` | Call `shiftCornerTypes` in outline-editing reducers (addPoint, removePoint, splitEdge) |

## Testing

### Unit — `src/utils/seam/__tests__/cornerTypes.test.ts`

Per corner type function (7 × 3 angles = 21 tests):
- 90° right angle: expected point count and positions
- 45° acute angle: handles sharp corners
- 135° obtuse angle: handles wide corners

Helper functions:
- `offsetEdge`: perpendicular offset at correct distance
- `lineIntersection`: correct intersection, null for parallel lines
- `interiorAngle`: correct for 90°, 45°, 180° (straight line)
- `bisectorDirection`: unit vector along bisector

Integration:
- `generateSeamAllowanceWithCorners` full pipeline: outline + corner specs → correct SA
- Mixed corner types on same piece (vertex 0 = squared, vertex 2 = envelope)
- All corners default mitered → equivalent to Clipper2 miter output
- Concave corner with self-intersection → Clipper2 cleanup resolves correctly

Edge cases:
- Empty cornerTypes record → uses default for all
- Invalid vertex index in cornerTypes → ignored
- Match type with no seam → falls back to mitered
- Match type with circular dependency → both resolve as mitered
- Zero seam allowance → returns empty

Index stability:
- `shiftCornerTypes` on insert: keys shift correctly
- `shiftCornerTypes` on remove: deleted key gone, subsequent keys shift
- `shiftCornerTypes` on insert at index 0: all keys shift

### Redux — `src/store/__tests__/projectSlice.cornerTypes.test.ts`
- updatePiece with cornerTypes merges correctly
- defaultCornerType fallback chain works
- Outline editing shifts cornerTypes keys

### Copilot — `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts`
- setCornerType valid vertex → success
- setCornerType out-of-bounds vertex → error
- setCornerType invalid corner type → error
- setAllCorners → sets default, clears overrides

## Files Created

- `src/utils/seam/cornerTypes.ts` — Corner type geometry + edge-walk SA generation + shiftCornerTypes
- `src/utils/seam/__tests__/cornerTypes.test.ts` — Geometry + integration tests
- `src/components/PatternEditor/CornerTypeMenu.tsx` — Context menu component
- `src/store/__tests__/projectSlice.cornerTypes.test.ts` — Redux tests
- `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts` — Copilot tests

## Files Modified

- `src/types/types.ts` — CornerType + PatternPiece fields
- `src/components/PatternEditor/renderers/PieceRenderer.tsx` — SA generation with corner types
- `src/components/PatternEditor/PatternEditor.tsx` — Wire corner type menu
- `src/utils/export/pipeline.ts` — Apply corner types in SA preparation
- `src/copilot/action/tools/definitions/seamTools.ts` — Add copilot tools
- `src/store/projectSlice.ts` — Call shiftCornerTypes in outline-editing reducers
