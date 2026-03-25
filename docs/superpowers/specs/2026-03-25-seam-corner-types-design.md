# Seam Corner Types — Design Spec

> Issue #255 — Extend seam allowance engine with 7 professional corner types

## Overview

Add 7 production-grade corner types to the seam allowance engine: mitered, double mitered, envelope, squared, slant, match, and trim mirrored. Per-vertex corner type configuration with a piece-level default. Post-process approach on top of existing Clipper2 offset.

## Corner Types

| Type | Points | Description |
|------|--------|-------------|
| **Mitered** | 1 | 45° miter at corner. Identity — same as Clipper2 miter output. Default. |
| **Double Mitered** | 2 | Miter with blunted tip perpendicular to bisector. Prevents bulk in heavy fabrics. |
| **Squared** | 3 | Right-angle box extension at corner. Belt loops, tabs. |
| **Slant** | 2 | Straight cut across miter at configurable angle. Variable angle corners. |
| **Envelope** | 4 | Extended rectangular tab beyond miter. Collars, facings, waistbands. |
| **Match** | varies | Mirrors partner piece corner geometry via seam lookup. Falls back to mitered if no seam. |
| **Trim Mirrored** | 2 | Symmetric trim on both sides of bisector. Decorative corners. |

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

## Geometry Engine

File: `src/utils/seam/cornerTypes.ts` — pure functions, no Redux.

### Algorithm (post-process Clipper2)

1. Run existing `generateSeamAllowance(outline, width, 'miter')` — produces base SA outline with miter joins at all corners
2. Map each piece outline vertex to its corresponding SA outline miter point (nearest SA vertex to the expected offset position of the piece vertex)
3. For each vertex with a non-default corner type, replace the miter point region with the corner-type-specific geometry

### Per-corner-type functions

Each function signature:
```typescript
(prevOffsetEdge: Line2D, nextOffsetEdge: Line2D, vertex: Point2D, saWidth: number, angle: number) → Point2D[]
```

- **`cornerMitered`** — returns the miter intersection point (identity, 1 point)
- **`cornerDoubleMitered`** — blunt cut perpendicular to bisector at depth `saWidth * 0.3` (2 points)
- **`cornerSquared`** — extend both offset edges, connect with right-angle turn (3 points)
- **`cornerSlant`** — straight cut between offset edges at configurable angle (2 points)
- **`cornerEnvelope`** — extend offset edges past intersection, connect as rectangular tab (4 points)
- **`cornerMatch`** — look up seam partner via `seamLookup` callback, mirror partner's corner geometry. Falls back to mitered if no seam. (variable points)
- **`cornerTrimMirrored`** — symmetric trim along bisector, equal from both offset edges (2 points)

### Top-level function

```typescript
export function applyCornerTypes(
  outline: PathCommand[],
  saOutline: PathCommand[],
  saWidth: number,
  defaultCornerType: CornerType,
  cornerTypes: Record<number, CornerType>,
  seamLookup?: (vertexIndex: number) => {
    partnerOutline: PathCommand[];
    partnerVertex: number;
    partnerSaWidth: number;
  } | null,
): PathCommand[]
```

Returns a new SA outline with corner regions replaced. The `seamLookup` callback is optional — only needed if any vertex uses `'match'` type.

### Vertex-to-SA mapping

`mapOutlineVerticesToSA(outline, saOutline, saWidth)` — for each piece outline vertex (M or L command), find the corresponding miter point in the SA outline. Uses expected offset position (vertex + saWidth along bisector) and nearest-point search on the SA outline. Returns `Map<number, number>` (outline index → SA index).

### Helper types

```typescript
interface Line2D {
  start: Point2D;
  end: Point2D;
}
```

## Rendering

In `PieceRenderer.tsx`, extend the existing SA generation:

```typescript
const saOutline = generateSeamAllowance(piece.outline, saWidth, 'miter');
const finalSa = applyCornerTypes(
  piece.outline, saOutline, saWidth,
  piece.defaultCornerType ?? 'mitered',
  piece.cornerTypes ?? {},
  seamLookup,
);
```

Memoize with `useMemo` keyed on `(outline, saWidth, defaultCornerType, cornerTypes)`.

Rendered as the same dashed SVG path — no change to rendering pipeline, just different geometry in the path data.

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

No exporter changes needed. The preparation pipeline (`src/utils/export/pipeline.ts`) calls `generateSeamAllowance` → `applyCornerTypes` before passing to the exporter. Corner geometry is baked into the SA outline that the exporter already handles.

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

Register in `src/copilot/action/tools/registry.ts` — add to existing `seamToolDefs` array (no new module needed).

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `CornerType` type, `defaultCornerType` + `cornerTypes` on PatternPiece |
| `src/utils/seam/cornerTypes.ts` | New: all corner type functions + `applyCornerTypes` |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Extend SA generation to call `applyCornerTypes` |
| `src/components/PatternEditor/CornerTypeMenu.tsx` | New: right-click context menu for corner selection |
| `src/components/PatternEditor/PatternEditor.tsx` | Wire context menu to SA tool vertex right-click |
| `src/utils/export/pipeline.ts` | Call `applyCornerTypes` in SA preparation |
| `src/copilot/action/tools/definitions/seamTools.ts` | Add `setCornerType` + `setAllCorners` tools |

## Testing

### Unit — `src/utils/seam/__tests__/cornerTypes.test.ts`

Per corner type function (7 × 3 angles = 21 tests):
- 90° right angle: expected point count and positions
- 45° acute angle: handles sharp corners
- 135° obtuse angle: handles wide corners

Integration:
- `applyCornerTypes` full pipeline: outline + SA + corner specs → correct final SA
- Mixed corner types on same piece (vertex 0 = squared, vertex 2 = envelope)
- All corners default mitered → SA unchanged from Clipper2 output
- `mapOutlineVerticesToSA`: correct mapping for rectangle, triangle, L-shape

Edge cases:
- Empty cornerTypes record → uses default for all
- Invalid vertex index in cornerTypes → ignored
- Match type with no seam → falls back to mitered
- Zero seam allowance → returns empty (no corners to compute)

### Redux — `src/store/__tests__/projectSlice.cornerTypes.test.ts`
- updatePiece with cornerTypes merges correctly
- defaultCornerType fallback chain works
- setAllCorners clears per-vertex overrides

### Copilot — `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts`
- setCornerType valid vertex → success
- setCornerType out-of-bounds vertex → error
- setCornerType invalid corner type → error
- setAllCorners → sets default, clears overrides

## Files Created

- `src/utils/seam/cornerTypes.ts` — Corner type geometry functions
- `src/utils/seam/__tests__/cornerTypes.test.ts` — Geometry tests
- `src/components/PatternEditor/CornerTypeMenu.tsx` — Context menu component
- `src/store/__tests__/projectSlice.cornerTypes.test.ts` — Redux tests
- `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts` — Copilot tests

## Files Modified

- `src/types/types.ts` — CornerType + PatternPiece fields
- `src/components/PatternEditor/renderers/PieceRenderer.tsx` — SA generation with corner types
- `src/components/PatternEditor/PatternEditor.tsx` — Wire corner type menu
- `src/utils/export/pipeline.ts` — Apply corner types in SA preparation
- `src/copilot/action/tools/definitions/seamTools.ts` — Add copilot tools
