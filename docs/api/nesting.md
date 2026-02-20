# Nesting Engine

> `src/utils/nesting/`

Automatic piece layout on fabric sheets using a **skyline bin-packing algorithm**. Optimizes fabric utilization for marker making (trazada) with support for rotation, mirroring, multi-sheet placement, and configurable gaps.

## Overview

The nesting engine places pattern pieces (piezas) onto rectangular fabric sheets, minimizing wasted material. It uses a skyline-based approach where the top contour of placed pieces is tracked as horizontal segments. New pieces are placed at the lowest available position.

**Flow:**
1. Flatten piece outlines → compute bounding boxes and areas
2. Sort pieces by strategy (area, height, or width descending)
3. For each piece, try all rotation/mirror variants
4. Find the best skyline position (lowest Y) across existing sheets
5. If no sheet fits, open a new sheet
6. Return placements + utilization percentage

## Quick Example

```ts
import { nestPieces } from '@openclo/utils/nesting';
import type { NestingOptions } from '@openclo/utils/nesting';

const options: NestingOptions = {
  sheet: { width: 1500, height: 3000, margin: 10 },
  gap: 5,
  rotationStep: 90,    // try 0°, 90°, 180°, 270°
  allowMirror: true,
  sortStrategy: 'area-desc',
};

const result = nestPieces(pieces, options);
// {
//   placements: [{ pieceId, sheetIndex, x, y, rotation, mirrored }, ...],
//   sheetsUsed: 2,
//   utilization: 0.73,
//   unplaced: [],
// }
```

## API Reference

### `nestPieces(pieces, options): NestingResult`

Main function. Places all pieces onto sheets.

| Param | Type | Description |
|-------|------|-------------|
| `pieces` | `PatternPiece[]` | Pieces to nest |
| `options` | `NestingOptions` | Sheet dimensions, gap, rotation, sort strategy |
| **Returns** | `NestingResult` | Placements, sheet count, utilization, unplaced IDs |

### `computeBBox(points): BBox`

Computes axis-aligned bounding box of a point set.

| Returns | `{ minX, minY, maxX, maxY, width, height }` |

### `computeArea(outline): number`

Calculates polygon area via shoelace formula on flattened path.

### `rotateBBox(points, angleDeg): { width, height, offsetX, offsetY }`

Returns bounding box dimensions after rotating points by given angle.

### `findBestPosition(skyline, pieceW, pieceH, sheetW, sheetH, margin, gap): Position | null`

Scans skyline segments for the lowest valid placement of a rectangle `pieceW × pieceH`.

| Param | Type | Description |
|-------|------|-------------|
| `skyline` | `SkylineSegment[]` | Current sheet skyline |
| `pieceW` | `number` | Piece bounding box width |
| `pieceH` | `number` | Piece bounding box height |
| `sheetW/H` | `number` | Sheet dimensions |
| `margin` | `number` | Sheet edge margin |
| `gap` | `number` | Gap between pieces |
| **Returns** | `{ x, y, score } \| null` | Best position or null if doesn't fit |

### `updateSkyline(skyline, x, width, newY): SkylineSegment[]`

Updates skyline after placing a piece. Splits overlapping segments, inserts new segment, merges adjacent segments with equal Y.

## Types

### `NestingOptions`

```ts
interface NestingOptions {
  sheet: NestingSheet;
  gap: number;              // Space between pieces (mm)
  rotationStep: number;     // Degrees (0 = no rotation, 90 = 4 orientations)
  allowMirror: boolean;     // Allow mirrored placement
  sortStrategy: 'area-desc' | 'height-desc' | 'width-desc';
}
```

### `NestingSheet`

```ts
interface NestingSheet {
  width: number;   // Fabric width (mm) — typically 1500 for standard fabric
  height: number;  // Fabric length (mm) — cut length
  margin: number;  // Edge margin (mm)
}
```

### `PlacedPiece`

```ts
interface PlacedPiece {
  pieceId: string;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;    // Degrees
  mirrored: boolean;
}
```

### `NestingResult`

```ts
interface NestingResult {
  placements: PlacedPiece[];
  sheetsUsed: number;
  utilization: number;    // 0–1, ratio of piece area to total sheet area
  unplaced: string[];     // Piece IDs that couldn't fit
}
```

### `SkylineSegment`

```ts
interface SkylineSegment {
  x: number;      // Segment start X
  width: number;  // Segment width
  y: number;      // Height at this segment (top of placed pieces)
}
```

## Algorithm Details

**Skyline bin packing** tracks the top contour of all placed pieces as a series of horizontal segments. For each new piece:

1. **Generate variants** — all rotation angles (0°, step°, 2×step°, ...) × mirror options
2. **For each variant**, compute rotated bounding box
3. **Scan skyline** — for each segment position, find the maximum Y across all overlapping segments, add gap → candidate position
4. **Pick lowest** — the variant + position with the lowest `y + height` wins
5. **Update skyline** — split affected segments, insert new segment at placed height, merge adjacent equal-Y segments

**Sort strategies** affect placement order:
- `area-desc` — largest pieces first (best general-purpose)
- `height-desc` — tallest pieces first (good for fabric with fixed width)
- `width-desc` — widest pieces first

## Related

- [Seam Allowance](./seam-allowance.md) — `flattenPath` used for bounding box computation
- [DXF Export](./dxf.md) — export nested layout as DXF
- [Grading](./grading.md) — nest a full size range together
