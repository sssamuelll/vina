# Grading Engine

> `src/utils/grading/`

Size grading for pattern pieces — supports both **rule-based grading** (per-point measurement deltas) and **proportional scaling** (uniform scale by primary measurement ratio).

## Overview

Grading transforms a base-size pattern piece into other sizes (XS–XXL). Two approaches:

1. **Rule-based** (`gradePoints`) — Each vertex has grading rules defining how it shifts per unit of measurement change. Precise control for professional grading.
2. **Proportional** (`gradePiece`) — Uniform scaling based on the ratio of a primary measurement (e.g., chest) between base and target size. Quick and simple.

A built-in **standard grade table** provides chest, waist, and hip measurements for sizes XS through XXL.

## Quick Example

```ts
import { gradePiece, standardGradeTable } from '@vina/utils/grading';

const table = standardGradeTable();
const baseMeasurements = table.sizes['M'];   // { chest: 88, waist: 72, hips: 96 }
const targetMeasurements = table.sizes['XL']; // { chest: 96, waist: 84, hips: 108 }

const gradedPiece = gradePiece(piece, baseMeasurements, targetMeasurements, 'chest');
// piece.outline scaled by 96/88 ≈ 1.091
```

### Rule-Based Grading

```ts
import { gradePoints, standardGradeTable } from '@vina/utils/grading';
import type { GradedPoint } from '@vina/utils/grading';

const points: GradedPoint[] = [
  { x: 0, y: 0, rules: [{ measurement: 'chest', deltaX: 0.25, deltaY: 0 }] },
  { x: 50, y: 0, rules: [{ measurement: 'chest', deltaX: 0.25, deltaY: 0 }] },
  { x: 50, y: 80, rules: [
    { measurement: 'chest', deltaX: 0.25, deltaY: 0 },
    { measurement: 'waist', deltaX: 0, deltaY: 0.15 },
  ]},
  { x: 0, y: 80, rules: [{ measurement: 'waist', deltaX: 0, deltaY: 0.15 }] },
];

const result = gradePoints(points, {
  gradeTable: standardGradeTable(),
  baseSize: 'M',
  targetSize: 'L',
  baseMeasurements: { chest: 88, waist: 72, hips: 96 },
});
```

## API Reference

### `gradePoints(points, options): Point2D[]`

Rule-based grading. Each point shifts by `deltaX × (targetMeasurement - baseMeasurement)` for each rule.

| Param | Type | Description |
|-------|------|-------------|
| `points` | `GradedPoint[]` | Vertices with grading rules |
| `options` | `GradingOptions` | Grade table, base/target size, base measurements |
| **Returns** | `Point2D[]` | Graded point positions |

### `gradePiece(piece, baseMeasurements, targetMeasurements, primaryMeasurement?): PatternPiece`

Proportional grading. Scales the entire outline by `target[primary] / base[primary]`.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `piece` | `PatternPiece` | — | Base-size piece |
| `baseMeasurements` | `Record<string, number>` | — | Base size body measurements (cm) |
| `targetMeasurements` | `Record<string, number>` | — | Target size body measurements (cm) |
| `primaryMeasurement` | `string` | `'chest'` | Measurement to derive scale factor from |
| **Returns** | `PatternPiece` | New piece with scaled outline |

### `scaleOutline(outline, scaleFactor, center?): PathCommand[]`

Scales path commands around a center point. Handles M, L, H, V, C, Q, A, Z.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `outline` | `PathCommand[]` | — | Path commands to scale |
| `scaleFactor` | `number` | — | Scale multiplier (1.0 = no change) |
| `center` | `Point2D` | `{x:0, y:0}` | Scale origin |
| **Returns** | `PathCommand[]` | Scaled path commands |

### `standardGradeTable(): GradeTable`

Returns the built-in grade table:

| Size | Chest (cm) | Waist (cm) | Hips (cm) |
|------|:----------:|:----------:|:---------:|
| XS | 80 | 64 | 88 |
| S | 84 | 68 | 92 |
| M | 88 | 72 | 96 |
| L | 92 | 78 | 102 |
| XL | 96 | 84 | 108 |
| XXL | 100 | 90 | 114 |

## Types

### `GradeRule`

```ts
interface GradeRule {
  measurement: string;  // e.g. 'chest', 'waist', 'hips'
  deltaX: number;       // X shift per unit of measurement change
  deltaY: number;       // Y shift per unit of measurement change
}
```

### `GradedPoint`

```ts
interface GradedPoint {
  x: number;
  y: number;
  rules: GradeRule[];
}
```

### `GradeTable`

```ts
interface GradeTable {
  sizes: Record<string, Partial<Record<string, number>>>;
  // e.g. { 'M': { chest: 88, waist: 72, hips: 96 } }
}
```

### `GradingOptions`

```ts
interface GradingOptions {
  baseSize: string;
  targetSize: string;
  gradeTable: GradeTable;
  baseMeasurements: Record<string, number>;
}
```

## Rule-Based vs Proportional

| | Rule-Based (`gradePoints`) | Proportional (`gradePiece`) |
|---|---|---|
| **Precision** | Per-vertex control, multi-measurement | Uniform scaling |
| **Setup** | Requires grading rules on each point | Just needs measurements |
| **Use case** | Professional production grading | Quick prototyping |
| **Shape preservation** | Can change proportions per area | Maintains exact proportions |

## Related

- [Seam Allowance](./seam-allowance.md) — apply after grading to get correct seam widths per size
- [DXF Export](./dxf.md) — export graded nest of sizes
- [Nesting](./nesting.md) — nest graded size set for marker making
