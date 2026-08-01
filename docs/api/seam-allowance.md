# Seam Allowance Engine

> `src/utils/seam/`

Generates seam allowance (margen de costura) outlines around pattern pieces using the **Equidistant algorithm** ported from [Seamly2D](https://github.com/FashionFreedom/Seamly2D). Supports per-point seam widths, multiple corner angle strategies, curve flattening, and self-intersection removal.

## Overview

The engine offsets a closed polygon outward by a given width. At each vertex, a corner strategy (angle type) determines how the offset lines meet. After offsetting, self-intersecting loops are detected and removed (`checkLoops`), producing a clean seam allowance path.

**Key concepts:**
- **Pieza** (piece) outline → offset outward → seam allowance contour
- Each vertex can have independent `saBefore` / `saAfter` widths
- Corner behavior controlled via `AngleType` (6 strategies)
- Curves (cubic/quadratic Bézier) are flattened to polylines before offsetting

## Quick Example

```ts
import { generateSeamAllowance } from '@vina/utils/seam';
import type { PathCommand } from '@vina/types';

const outline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

// 10mm seam allowance
const seamPath = generateSeamAllowance(outline, 10);
```

### Advanced: Per-Point Control

```ts
import { generateSeamAllowanceAdvanced, AngleType } from '@vina/utils/seam';
import type { SAPoint } from '@vina/utils/seam';

const points: SAPoint[] = [
  { x: 0, y: 0, saBefore: 10, saAfter: 10, angleType: AngleType.ByLength },
  { x: 100, y: 0, saBefore: 10, saAfter: 15, angleType: AngleType.ByFirstEdgeRightAngle },
  { x: 100, y: 150, saBefore: 15, saAfter: 10, angleType: AngleType.ByPointsIntersection },
  { x: 0, y: 150, saBefore: 10, saAfter: 10, angleType: AngleType.ByLength },
];

const offsetPoints = generateSeamAllowanceAdvanced(points, 10);
```

## API Reference

### `generateSeamAllowance(outline, width): PathCommand[]`

High-level function. Flattens the path, applies uniform seam allowance, returns offset path commands.

| Param | Type | Description |
|-------|------|-------------|
| `outline` | `PathCommand[]` | Piece outline (M, L, C, Q, Z, etc.) |
| `width` | `number` | Seam allowance width in mm |
| **Returns** | `PathCommand[]` | Offset outline as M/L/Z commands |

### `generateSeamAllowanceAdvanced(points, defaultWidth): Point2D[]`

Per-point control over seam width and corner angle type.

| Param | Type | Description |
|-------|------|-------------|
| `points` | `SAPoint[]` | Vertices with per-point SA config |
| `defaultWidth` | `number` | Fallback width when `saBefore`/`saAfter` is `-1` |
| **Returns** | `Point2D[]` | Offset polygon vertices |

### `equidistant(inputPoints, defaultWidth): Point2D[]`

Core algorithm. Takes SAPoints, ensures CW winding, computes offset at each vertex, removes loops.

| Param | Type | Description |
|-------|------|-------------|
| `inputPoints` | `SAPoint[]` | Closed polygon vertices with SA metadata |
| `defaultWidth` | `number` | Global seam allowance width |
| **Returns** | `Point2D[]` | Clean offset polygon |

### `flattenPath(commands, resolution?): Point2D[]`

Converts SVG-style path commands (including cubic/quadratic Bézier curves) to a polyline.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `commands` | `PathCommand[]` | — | Path commands to flatten |
| `resolution` | `number` | `12` (`CURVE_RESOLUTION`) | Segments per curve |
| **Returns** | `Point2D[]` | Flattened point array |

### `checkLoops(points): Point2D[]`

Removes self-intersecting loops from an offset polygon. Port of Seamly2D's `CheckLoops`.

### `maxLocalSA(point, defaultWidth): { before: number; after: number }`

Resolves per-point seam allowance, substituting `defaultWidth` when value is `-1`.

### Geometry Utilities

All exported from `src/utils/seam/geometry.ts`:

| Function | Signature | Description |
|----------|-----------|-------------|
| `createParallelLine` | `(p1, p2, width) → [Point2D, Point2D]` | Offset line to the LEFT of p1→p2 |
| `lineIntersection` | `(a1, a2, b1, b2) → IntersectionResult` | Segment intersection (bounded/unbounded/parallel/none) |
| `bisectorLine` | `(p1, p2, p3) → Point2D` | Unit bisector direction at vertex p2 |
| `angleBetweenBisectors` | `(b1, b2) → number` | Angle in radians (0–π) |
| `pointOnLine` | `(p, start, end, tol?) → boolean` | Point-on-segment test |
| `isClockwise` | `(points) → boolean` | Shoelace formula (screen coords, Y-down) |
| `removeDuplicates` | `(points, tol?) → Point2D[]` | Remove consecutive duplicates |
| `removePointsOnLine` | `(points, tol?) → Point2D[]` | Remove collinear points |
| `distance` | `(p1, p2) → number` | Euclidean distance |
| `distanceSq` | `(p1, p2) → number` | Squared distance (fast comparison) |

## Types

### `SAPoint`

```ts
interface SAPoint {
  x: number;
  y: number;
  saBefore: number;   // -1 = use global default width
  saAfter: number;     // -1 = use global default width
  angleType: AngleType;
}
```

### `AngleType` (enum)

Controls corner geometry at each vertex:

| Value | Name | Behavior |
|-------|------|----------|
| `0` | `ByLength` | Use intersection point; if too far (> `MAX_L × width`), cut perpendicular |
| `1` | `ByPointsIntersection` | Always use line-line intersection of offset edges |
| `2` | `ByFirstEdgeSymmetry` | Mirror first offset edge across second |
| `3` | `BySecondEdgeSymmetry` | Mirror second offset edge across first |
| `4` | `ByFirstEdgeRightAngle` | Right-angle extension from first offset edge |
| `5` | `BySecondEdgeRightAngle` | Right-angle extension from second offset edge |

### `SeamAllowanceOptions`

```ts
interface SeamAllowanceOptions {
  width: number;
  closePath?: boolean;
}
```

### `IntersectionResult`

```ts
interface IntersectionResult {
  point: Point2D;
  type: 'bounded' | 'unbounded' | 'none' | 'parallel';
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_L` | `3.0` | Max offset distance as multiple of width before corner is cut |
| `ACCURACY` | `0.001` | Global geometric tolerance (mm) |
| `CURVE_RESOLUTION` | `12` | Default segments per Bézier curve |

## Algorithm Notes

1. **Winding normalization** — Input is forced to CW winding (screen coords, Y-down). If reversed, `saBefore`/`saAfter` are swapped.
2. **Parallel edge offset** — Each edge is offset to the left by the local SA width using perpendicular normals.
3. **Corner resolution** — Adjacent offset edges are intersected. The `AngleType` determines how the corner is handled when intersection is unbounded.
4. **Loop removal** — `checkLoops` iterates over the result polygon, detecting and removing self-intersections by splicing the vertex list.

## Related

- [DXF Export](./dxf.md) — exports pieces with seam allowance on AAMA draw layer
- [Nesting](./nesting.md) — uses `flattenPath` for bounding box computation
- [OBJ Export](./export-obj.md) — uses `flattenPath` for triangulation input
