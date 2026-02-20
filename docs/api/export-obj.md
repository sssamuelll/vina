# OBJ Export

> `src/utils/export/exportOBJ.ts`

Exports pattern pieces as Wavefront OBJ 3D meshes using **ear-clipping triangulation**. Each piece becomes a named object with triangulated faces on the Z=0 plane (1 unit = 1mm).

## Overview

The exporter flattens each piece's outline to a 2D polygon, triangulates it via the ear-clipping algorithm, and writes standard OBJ format with vertices (`v`) and faces (`f`). Useful for 3D visualization, cloth simulation import, or further mesh processing.

## Quick Example

```ts
import { generateOBJ, downloadOBJ } from '@openclo/utils/export/exportOBJ';

const objString = generateOBJ(pieces);
// # OpenClo OBJ Export
// o Front_Bodice
// v 0.0000 0.0000 0.0000
// v 100.0000 0.0000 0.0000
// ...
// f 1 2 3
// f 1 3 4

// Or trigger browser download:
downloadOBJ(pieces, 'my-pattern.obj');
```

## API Reference

### `generateOBJ(pieces): string`

Generates OBJ file content from pattern pieces.

| Param | Type | Description |
|-------|------|-------------|
| `pieces` | `PatternPiece[]` | Pieces to export |
| **Returns** | `string` | Complete OBJ file content |

**Per piece:**
1. `o PieceName` — object declaration (spaces replaced with `_`)
2. Flatten outline via `flattenPath`, remove duplicate closing point
3. Emit `v x y 0.0000` for each vertex
4. Triangulate polygon → emit `f` lines (1-indexed)

### `downloadOBJ(pieces, filename?): void`

Browser helper. Generates OBJ and triggers file download.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pieces` | `PatternPiece[]` | — | Pieces to export |
| `filename` | `string` | `'pattern.obj'` | Download filename |

### `triangulate(points): number[][]`

Ear-clipping triangulation of a simple polygon.

| Param | Type | Description |
|-------|------|-------------|
| `points` | `Point2D[]` | Polygon vertices (no duplicate closing point) |
| **Returns** | `number[][]` | Array of `[a, b, c]` index triples (0-indexed) |

**Algorithm:**
1. Determine winding (CW or CCW) via signed area
2. Iterate vertices looking for "ears" — convex vertices whose triangle contains no other vertices
3. Clip each ear (add triangle, remove vertex), repeat
4. Safety counter prevents infinite loops on degenerate polygons

## Output Format

Standard Wavefront OBJ:

```
# OpenClo OBJ Export
o Piece_Name
v 0.0000 150.0000 0.0000
v 100.0000 150.0000 0.0000
v 100.0000 0.0000 0.0000
v 0.0000 0.0000 0.0000
f 4 1 2
f 4 2 3
```

### Coordinate System
- **X, Y** — pattern coordinates in mm (from piece outline)
- **Z** — always `0.0000` (flat pieces on XY plane)
- **1 unit = 1 mm**
- Face indices are **1-indexed** (OBJ standard)
- Vertex offsets accumulate across pieces (multi-object support)

## Types

Uses shared types from `src/types/types.ts`:

- `PatternPiece` — piece with `outline: PathCommand[]` and `name: string`
- `Point2D` — `{ x: number; y: number }`

## Related

- [Seam Allowance](./seam-allowance.md) — `flattenPath` used to convert curves to polyline
- [DXF Export](./dxf.md) — alternative 2D industry-standard export
- [Nesting](./nesting.md) — export nested layout positions
