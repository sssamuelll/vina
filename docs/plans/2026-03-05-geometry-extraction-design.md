# Extract Math Utilities into utils/geometry/ — Design

## Problem

50+ math/geometry functions are scattered across 12+ editor hooks, with heavy duplication:
- **Point-to-segment projection**: 7 implementations (nodeEditorUtils, useSeamTool, useMeasureTool, useScissorsTool, useSegmentSewingTool, useNotchTool, useTopstitchTool)
- **Screen-to-pattern coords**: 11 `toPattern` implementations across every hook
- **Bounding box hit test**: 4 implementations (useLineTool, useGrainlineTool, useMergeTool, transformUtils)
- **PathCommand anchor extraction**: 3 implementations (nodeEditorUtils, mergeOutline, splitOutline)
- **lerp/lerp2D**: 2 implementations
- **Edge endpoint extraction**: 3 implementations

## Approach

Extend the existing `src/utils/geometry/` directory (which already has `lineIntersect.ts`, `mergeOutline.ts`, `splitOutline.ts`) with new files by category. Add a barrel `index.ts` for clean imports.

## New Files

### `src/utils/geometry/distance.ts`
Consolidated distance/projection functions:
- `dist(a, b)` — Euclidean distance between two Point2D
- `distToSegment(p, a, b)` — distance from point to line segment (scalar)
- `distToSegmentWithT(px, py, x1, y1, x2, y2)` — full projection info (distance, t, closest point)

Source: nodeEditorUtils (`distToSegmentWithT`), useSeamTool (`distToSegment`), mergeOutline (`dist`), usePenTool (`dist`)

### `src/utils/geometry/bezier.ts`
Bezier evaluation and distance:
- `evalCubic(p0, p1, p2, p3, t)` — evaluate cubic Bezier at t
- `evalQuadratic(p0, p1, p2, t)` — evaluate quadratic Bezier at t
- `distToBezier(px, py, evalFn, samples)` — distance from point to Bezier curve
- `lerp2D(a, b, t)` — linear interpolation between Point2D
- `lerp(a, b, t)` — scalar linear interpolation

Source: nodeEditorUtils (`evalCubic`, `evalQuadratic`, `distToBezier`, `lerp2D`), splitOutline (`lerp`)

### `src/utils/geometry/hitTest.ts`
Hit-testing for pieces, nodes, and handles:
- `hitTestPieceBBox(pt, pieces)` — bounding-box hit test returning matched piece
- `findNearestPiece(pt, pieces, margin)` — nearest piece by center distance with bbox margin

Source: useGrainlineTool (`hitTestPiece`), useMergeTool (`hitTestPiece`), useLineTool (`findNearestPiece`)

### `src/utils/geometry/path.ts`
PathCommand edge/endpoint extraction:
- `getEdgeEndpoints(commands, edgeIndex)` — start/end points of an edge
- `getCommandEndpoint(cmd, prevX, prevY, startX, startY)` — endpoint of a single command
- `getEdgeLength(commands, edgeIndex)` — straight-line distance of edge
- `computeOffsetPath(start, end, offset)` — perpendicular offset path
- `computeSegmentOffsetPath(start, end, t0, t1, offset)` — offset for partial segment

Source: useSeamTool (`getEdgeEndpoints`, `getEdgeLength`), useTopstitchTool (`computeOffsetPath`, `computeSegmentOffsetPath`), splitOutline/mergeOutline (endpoint functions — keep those in-place since they're private and tightly coupled to their merge/split algorithms)

### `src/utils/geometry/snap.ts`
Snap-to-outline and snap-to-edge:
- `snapToOutline(pt, piece, zoom)` — find nearest point on piece outline
- `closestPointOnOutline(pt, piece, zoom)` — with normal vector
- `findClosestEdge(pt, pieces, zoom, excludePieceId?)` — find closest edge across pieces

Source: useMeasureTool (`snapToOutline`), useNotchTool (`closestPointOnOutline`), useSeamTool (`findClosestEdge`)

### `src/utils/geometry/coords.ts`
Coordinate transforms:
- `screenToPattern(screenX, screenY, svgRect, zoom, pan)` — pure function version of `toPattern`

Source: all 11 hooks that have `toPattern`

### `src/utils/geometry/transform.ts`
Move `transformUtils.ts` to `src/utils/geometry/transform.ts`. It's already pure — just update import paths. Keep all existing exports:
- `computeBoundingBox`, `computeHandlePositions`, `scaleOutline`, `rotateOutline`, `hitTestHandle`, `computeScaleFromDrag`, `computeRotationFromDrag`

### `src/utils/geometry/index.ts`
Barrel re-export from all files including the existing ones.

## What Stays In Place

- **`nodeEditorUtils.ts`** — `extractNodes`, `applyNodeMove`, `hitTestNode`, `nearestSegment`, `splitSegmentAt`, `deletePoint`, `convertToCurve`, `convertToLine`, `getAnchor` stay because they operate on `PatternPiece`/`EditableNode` domain types. They import from `utils/geometry/` instead of defining inline math.
- **`mergeOutline.ts` and `splitOutline.ts`** internals — their private helpers (`getAnchors`, `splitCubic`, etc.) stay in-place since they're tightly coupled to the merge/split algorithms. They already live in `utils/geometry/`.
- **Domain-specific factories** — `createNotchLine`, `createGrainline`, `nodesToCommands` stay in their hooks.

## Testing

Each new file gets a test file in `src/utils/geometry/__tests__/`. Pure functions with numeric inputs/outputs are trivially testable.
