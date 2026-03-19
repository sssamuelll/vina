# POM Measurement System — Phase 1

> **Issue**: #367
> **Date**: 2026-03-19
> **Status**: Design approved

## Summary

Persistent named measurements (Points of Measure) stored at the project level. Phase 1 covers 2D straight-line and along-edge measurements, a POM panel table, 2D overlay rendering, CSV export, and 4 copilot tools. Circumference, height, and surface tape measurements are reserved for Phase 2-3.

## Data Model

```typescript
/** Measurement method — how the value is computed */
type POMMethod = 'straight' | 'alongEdge' | 'circumference' | 'height' | 'surfaceTape';

/** Measurement category for grouping and filtering */
type POMCategory = 'length' | 'width' | 'circumference' | 'height' | 'custom';

/** A reference point on a pattern piece */
interface POMPoint {
  pieceId: string;
  edgeName?: string;       // semantic edge name (if snapped to edge)
  t?: number;              // parametric position on edge (0-1)
  position: Point2D;       // absolute 2D position (fallback if edge deleted)
}

/** Persistent named measurement */
interface PointOfMeasure {
  id: string;
  name: string;            // "Chest Width", "Side Seam Length", etc.
  category: POMCategory;
  method: POMMethod;

  // Reference geometry
  pointA: POMPoint;
  pointB: POMPoint;

  // Computed value
  value: number;           // mm — recomputed on pattern change

  // Tolerance (for tech pack QC)
  tolerance?: number;      // mm — acceptable deviation (+/-)

  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

**Storage:** `poms: PointOfMeasure[]` in `ProjectState`, alongside `seams` and `seamGroups`.

**Phase 1 methods:** `'straight'` (point-to-point Euclidean) and `'alongEdge'` (arc-length along a semantic edge). Other methods are type-safe placeholders for Phase 2-3.

## Redux Actions

| Reducer | Payload | Purpose |
|---------|---------|---------|
| `addPOM` | `PointOfMeasure` | Add new measurement |
| `updatePOM` | `PointOfMeasure` | Replace by id (rename, move, tolerance) |
| `removePOM` | `string` (id) | Delete measurement |
| `recomputePOMValues` | `{ id: string; value: number }[]` | Batch update computed values |

**`addPOM`** backfills defaults: `category: 'custom'`, `tolerance: undefined`, timestamps.

**`loadProject`** backfills `poms: []` for older project files.

**`removePiece`** cleans up POMs referencing the deleted piece — removes POMs where either `pointA.pieceId` or `pointB.pieceId` matches.

### Recomputation

POM values recompute via a `useEffect` in the POM panel that watches `pieces`. When pieces change, all POM values are recalculated from current geometry and dispatched via `recomputePOMValues`. This avoids middleware complexity while keeping values fresh when the user views them.

## POM Compute Functions

Pure functions in `src/utils/pom/pomCompute.ts`:

```typescript
/** Compute the value of a POM from current piece geometry */
function computePOMValue(pom: PointOfMeasure, pieces: PatternPiece[]): number | null;

/** Compute straight-line distance between two POM points */
function computeStraightDistance(pointA: POMPoint, pointB: POMPoint, pieces: PatternPiece[]): number | null;

/** Compute arc-length along an edge for an along-edge POM */
function computeAlongEdgeDistance(pointA: POMPoint, pieces: PatternPiece[]): number | null;

/** Recompute all POM values, returning update pairs */
function recomputeAllPOMs(poms: PointOfMeasure[], pieces: PatternPiece[]): { id: string; value: number }[];
```

For `straight` method: Euclidean distance between resolved positions (piece position + point offset).

For `alongEdge` method: Arc-length of the referenced semantic edge using the existing `computePathArcLength()` from `src/utils/geometry/arcLength.ts`. If `t` start/end are specified on pointA/pointB, compute partial arc-length.

Returns `null` if referenced piece/edge no longer exists (orphaned POM).

## 2D Tool: `pomMeasure`

**ID:** `pomMeasure`
**Shortcut:** `P`
**Group:** `annotation`
**Context:** `2d`

### Tool Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | select | `'straight'` | `'straight'` or `'alongEdge'` |
| `defaultCategory` | select | `'custom'` | Category preset for new POMs |

### Interaction Flow

**Straight mode (2 clicks):**
1. Click point A on a piece outline (snaps to outline, same as measure tool)
2. Click point B on any piece outline
3. Inline name input appears at the measurement midpoint
4. Type name + Enter → dispatches `addPOM`
5. Escape → cancels

**Along-edge mode (1 click):**
1. Click on an edge → selects the full semantic edge
2. Arc-length computed automatically
3. Inline name input appears at edge midpoint
4. Type name + Enter → dispatches `addPOM` with `method: 'alongEdge'`

### Snap Behavior

Reuse `snapToOutline` from the existing measure tool. Snap threshold: 8px / zoom. Returns piece ID, edge name, parametric t, and canvas-space position.

### State Machine

```
IDLE → (click) → POINT_A_SET
POINT_A_SET → (click) → NAMING  [straight mode]
IDLE → (click edge) → NAMING   [alongEdge mode]
NAMING → (Enter) → dispatch addPOM → IDLE
NAMING → (Escape) → IDLE
```

## POM Overlay (2D Renderer)

Renders all POMs as persistent dimension annotations in the 2D viewport.

### Straight POMs
- Thin dashed line between pointA and pointB
- Small arrowheads at both ends
- Value label at midpoint: `"{name}: {value}mm"` with semi-transparent background
- Color: `#8e44ad` (purple, distinct from seam red and selection blue)

### Along-Edge POMs
- Colored highlight along the referenced edge (thinner than seam highlight)
- Value label at edge midpoint
- Color: `#2980b9` (blue)

### Selected POM (from panel click)
- Brighter color, thicker line/highlight
- Name label always visible (non-selected POMs show name on hover only to reduce clutter)

### Interaction
- Hover over a POM annotation → show name tooltip
- Click a POM annotation → select it in the POM panel

## POM Panel (Bottom Panel Tab)

New "POMs" tab in `BottomPanel`, alongside the existing Inspector tab.

### Table Columns

| Column | Editable | Description |
|--------|----------|-------------|
| Name | Yes (double-click) | POM name |
| Category | Yes (dropdown) | length / width / circumference / height / custom |
| Method | No | straight / alongEdge |
| Value | No | Computed value in current units (mm/cm/in) |
| Tolerance | Yes (double-click) | ±mm tolerance |
| Actions | — | Delete button |

### Features
- Click row → selects POM, highlights in 2D viewport
- Double-click name/tolerance → inline edit, dispatches `updatePOM`
- "Export CSV" button → downloads all POMs as CSV
- Empty state: "No measurements. Use the POM tool (P) to create one."
- Sort by name or category

### CSV Export Format

```csv
Name,Category,Method,Value (mm),Tolerance (mm)
Chest Width,width,straight,482.3,5
Side Seam,length,alongEdge,410.1,3
```

## Copilot Tools

4 new tools in `src/copilot/action/tools/definitions/pomTools.ts`:

| Tool | Params | Purpose |
|------|--------|---------|
| `createPOM` | `{ name, category?, method?, pieceAId, edgeAName?, positionA?, pieceBId?, edgeBName?, positionB?, tolerance? }` | Create a named measurement |
| `getPOMs` | `{ category?, pieceId? }` | List all POMs, optionally filtered |
| `updatePOM` | `{ pomId, name?, tolerance?, category? }` | Rename or adjust tolerance |
| `removePOM` | `{ pomId }` | Delete a measurement |

### `createPOM` Intelligence

When given edge names, the tool resolves piece geometry and computes the value automatically:
- `method: 'straight'` with two edge names → measures between edge midpoints
- `method: 'alongEdge'` with one edge name → computes full edge arc-length
- If `positionA`/`positionB` are given as `{x, y}`, uses those directly

The tool validates that referenced pieces and edges exist before creating.

All tools return `ToolResult` with rollback functions (dispatch `removePOM` or restore previous state).

### Copilot Examples

- "Measure the chest width" → `createPOM({ name: 'Chest Width', category: 'width', method: 'straight', ... })`
- "What are all the measurements?" → `getPOMs({})`
- "Set tolerance to 3mm on the side seam POM" → `updatePOM({ pomId: '...', tolerance: 3 })`
- "List all length measurements" → `getPOMs({ category: 'length' })`

## Diagnostic Integration

One new info-level rule in `ruleEngine.ts`:

- When inspecting a piece with no POM references: info "No POMs reference this piece — consider adding measurements for tech pack completeness"

## Files

### Create

| File | Purpose |
|------|---------|
| `src/tools/definitions/pomMeasure.tsx` | Tool definition (id, icon, shortcut P, options) |
| `src/components/PatternEditor/usePOMMeasureTool.ts` | 2-click creation hook with snap + inline naming |
| `src/components/PatternEditor/renderers/overlays/POMOverlay.tsx` | Persistent dimension lines in 2D viewport |
| `src/components/BottomPanel/POMPanel.tsx` | Table view of all POMs with inline edit + CSV export |
| `src/copilot/action/tools/definitions/pomTools.ts` | 4 copilot tools |
| `src/store/__tests__/projectSlice.pom.test.ts` | POM reducer tests |
| `src/utils/pom/pomCompute.ts` | Pure compute functions |

### Modify

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `PointOfMeasure`, `POMPoint`, `POMMethod`, `POMCategory` |
| `src/store/projectSlice.ts` | Add `poms` to state, 4 reducers, removePiece cleanup, loadProject backfill |
| `src/tools/index.ts` | Register `pomMeasureTool` |
| `src/components/PatternEditor/PatternEditor.tsx` | Instantiate hook, pass overlay props |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add POMOverlay rendering |
| `src/components/PatternEditor/useEditorInteractions.ts` | Wire tool events |
| `src/components/BottomPanel/BottomPanel.tsx` | Add POMs tab |
| `src/copilot/action/tools/registry.ts` | Register POM tools |
| `src/diagnostics/ruleEngine.ts` | "No POMs" info rule |

### Not Touched

- 3D viewport (Phase 2-3)
- Simulation / WASM
- Undo middleware (standard Redux actions)
- Confirmation middleware
- Layer system

## Testing

- Unit tests for POM reducers (add, update, remove, recompute, piece deletion cleanup, loadProject backfill)
- Unit tests for `pomCompute.ts` (straight distance, arc-length, null for missing pieces)
- Unit tests for copilot POM tools (create, get, update, remove)
- Integration: create POM → verify value → move piece → recompute → verify updated value

## Migration

Existing projects have no `poms` field. `loadProject` backfills `poms: []`. No data migration needed.

## Future (Phase 2-3)

- **Circumference measurement**: 3D horizontal plane intersection, compute perimeter
- **Height measurement**: 3D vertical distance between two surface points
- **Surface tape**: Geodesic distance on 3D mesh (Dijkstra on triangle graph)
- **2D vs 3D comparison table**: Flat pattern value vs simulated 3D value vs delta
- **Grading**: POM values per graded size, tolerance checking across size range
- **Tech pack export**: Full POM table with grading in PDF/Excel format
