# Walk/Measure Along Curve — Design Document

> Issue #263 · 2026-03-14

## Overview

Extend the existing measure tool with arc-length measurement along curves, two-curve comparison, and copilot integration. Essential for validating curved seams (armhole, neckline, princess seam) where straight-line distance is meaningless.

## Architecture

### Mode Toggle

Add `measureMode` option to the existing measure tool definition:

```
measureMode: 'point-to-point' | 'along-curve' | 'compare'
```

- **point-to-point**: Current behavior (unchanged)
- **along-curve**: Click on edge → show arc-length, markers, hover distance
- **compare**: Select two edges → show length delta and divergence

### Core Arc-Length Module

**New file: `src/utils/geometry/arcLength.ts`**

Pure math functions with no React/Redux dependencies:

```typescript
// 5-point Gauss-Legendre quadrature for cubic Bezier arc-length (< 0.1mm error)
gaussLegendreBezierLength(p0, cp1, cp2, p3): number

// Arc-length of a PathCommand[] segment range
computePathArcLength(commands: PathCommand[], startIdx?: number, endIdx?: number): number

// Point at cumulative distance along PathCommand[]
pointAtPathDistance(commands: PathCommand[], distance: number): Point2D | null

// Sample points at regular intervals (e.g., every 50mm)
samplePathAtIntervals(commands: PathCommand[], interval: number): ArcLengthSample[]

// Distance from path start to nearest projection of a point onto the path
distanceAlongPath(commands: PathCommand[], point: Point2D): number
```

**ArcLengthSample type:**
```typescript
interface ArcLengthSample {
  point: Point2D;
  distance: number;  // cumulative distance from start (mm)
  t: number;         // parameter [0, 1] along full path
}
```

Reuses `cubicAt()` from `edgeExtractor.ts` for Bezier evaluation. Line segments use exact Euclidean distance.

### Along-Curve Mode

**Flow:**
1. Hover near piece outline → snap highlight (existing `snapToOutline`)
2. Click → identify nearest `SemanticEdge` from piece's `edges[]` using `segmentRange`
3. Edge highlights in accent color
4. Distance markers appear at configurable intervals (default 50mm)
5. Hover along edge → show cumulative distance from edge start at cursor
6. Optional: click two points on same edge → show arc-length between them
7. Animated dot walks the edge showing cumulative distance (CSS animation on SVG circle)

**Edge identification:**
Given a snap result with `segmentIndex`, find which `SemanticEdge` contains that segment:
```typescript
const edge = piece.edges?.find(e =>
  segmentIndex >= e.segmentRange[0] && segmentIndex < e.segmentRange[1]
);
```

If no semantic edges exist, fall back to full outline measurement.

### Compare Mode

**Flow:**
1. Click edge A on any piece → highlighted, shows total length
2. Click edge B on any piece → highlighted, shows total length
3. Display: length A, length B, delta, percentage ease
4. Sample both curves at N points (20), color-code by local delta
5. Escape to clear and start over

**Compare result:**
```typescript
interface CurveComparison {
  lengthA: number;
  lengthB: number;
  delta: number;           // B - A (positive = B longer)
  easePercent: number;     // delta / A * 100
  maxLocalDelta: number;   // max divergence at any sample point
  samples: { distA: number; distB: number; delta: number }[];
}
```

### Overlay Rendering

**Extend `MeasureToolOverlay.tsx`** with new visual elements:

- **Edge highlight**: Thick accent-colored stroke along selected edge path
- **Distance markers**: Small tick marks perpendicular to edge every N mm, with distance label
- **Hover distance**: Label at cursor showing cumulative distance from edge start
- **Walk dot**: Animated circle that travels along the edge path (CSS `offset-path`)
- **Compare visualization**: Two highlighted edges with color-coded sample points (green = matched, yellow = slight delta, red = large delta)

### Tool Hook Changes

**Extend `useMeasureTool.ts`** with new state:

```typescript
// New state
const [measureMode, setMeasureMode] = useState<'point-to-point' | 'along-curve' | 'compare'>('point-to-point');
const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);
const [compareEdgeA, setCompareEdgeA] = useState<SelectedEdgeInfo | null>(null);
const [compareEdgeB, setCompareEdgeB] = useState<SelectedEdgeInfo | null>(null);
const [hoverDistance, setHoverDistance] = useState<number | null>(null);
const [edgeMarkers, setEdgeMarkers] = useState<ArcLengthSample[]>([]);
```

`handleMouseDown` dispatches based on `measureMode`. `handleMouseMove` computes `hoverDistance` via `distanceAlongPath()` when in along-curve mode.

### Tool Definition Changes

**`measure.tsx`** — Add mode option:
```typescript
{
  id: 'measureMode',
  label: 'Mode',
  type: 'select',
  value: 'point-to-point',
  choices: [
    { label: 'Point to Point', value: 'point-to-point' },
    { label: 'Along Curve', value: 'along-curve' },
    { label: 'Compare Curves', value: 'compare' },
  ],
}
```

Add copilot keywords: `'curve'`, `'arc length'`, `'along'`, `'walk'`, `'compare'`, `'ease'`, `'seam length'`.

### Copilot Meta-Tools

**New file: `src/copilot/reasoning/bridge/meta-tools/measureAlongCurve.ts`**

```typescript
{
  name: 'measureAlongCurve',
  parameters: { pieceId: string, edgeName: string },
  returns: { length: number, unit: 'mm', samplePoints: ArcLengthSample[] }
}
```

Uses `computePathArcLength()` on the edge's segment range.

**New file: `src/copilot/reasoning/bridge/meta-tools/compareCurves.ts`**

```typescript
{
  name: 'compareCurves',
  parameters: { pieceIdA, edgeNameA, pieceIdB, edgeNameB },
  returns: { lengthA, lengthB, delta, easePercent, maxLocalDelta, samples }
}
```

Both registered in `meta-tools/index.ts`.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/geometry/arcLength.ts` | Create | Core arc-length math |
| `src/utils/geometry/__tests__/arcLength.test.ts` | Create | Unit tests |
| `src/tools/definitions/measure.tsx` | Modify | Add mode option + keywords |
| `src/components/PatternEditor/useMeasureTool.ts` | Modify | Along-curve + compare logic |
| `src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx` | Modify | Edge highlight, markers, walk dot, compare |
| `src/copilot/reasoning/bridge/meta-tools/measureAlongCurve.ts` | Create | Copilot tool |
| `src/copilot/reasoning/bridge/meta-tools/compareCurves.ts` | Create | Copilot tool |
| `src/copilot/reasoning/bridge/meta-tools/index.ts` | Modify | Register new tools |

## Accuracy

- Cubic Bezier: 5-point Gauss-Legendre quadrature (< 0.1mm error on typical garment curves)
- Line segments: Exact Euclidean distance
- Polylines: Sum of segment lengths
- Target: < 0.1mm error overall

## Testing

- Unit tests for `arcLength.ts`: known curves (straight line = exact, quarter circle ≈ πr/2, S-curve)
- Edge cases: zero-length edge, single-segment edge, degenerate Bezier (all control points coincident)
- Compare mode: identical curves → zero delta, known ease percentage
