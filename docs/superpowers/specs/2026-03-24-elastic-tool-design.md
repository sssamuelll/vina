# Elastic Tool Design

> Issue #322 — Implement Elastic tool

## Overview

The Elastic tool allows users to define elastic segments along piece edges, specifying stretch ratio, width, type, and placement. It includes 2D visual rendering (zigzag), cloth simulation integration (contracted rest-length constraints for WASM/CPU solvers), and copilot tool registration for AI-driven elastic operations.

## Data Model

New `Elastic` entity in `src/types/types.ts`, stored as `ProjectState.elastics: Elastic[]`.

```typescript
interface Elastic {
  id: string;
  pieceId: string;
  edgeName: string;          // references SemanticEdge.name on the piece
  stretchRatio: number;      // 0.1–2.0 (0.5 = gathers to 50%, 1.5 = compression stretch)
  width: number;             // mm (typical: 6, 12, 25)
  type: 'band' | 'shirring' | 'drawstring';
  tStart: number;            // 0.0–1.0 parametric start on edge, default 0
  tEnd: number;              // 0.0–1.0 parametric end on edge, default 1
  active: boolean;           // participates in cloth simulation
}
```

### stretchRatio Range: 0.1–2.0

- **< 1.0:** Gathering — fabric contracts (waistband, cuffs). 0.5 = gathers to 50%.
- **= 1.0:** No effect — elastic holds at relaxed length.
- **> 1.0:** Compression — elastic pulls fabric taut (athletic wear, compression garments).
- **Minimum 0.1:** Values below 0.1 produce degenerate constraints (near-zero rest lengths) causing solver instability. Clamped at validation layer.

### Defaults

| Property | Default | Rationale |
|----------|---------|-----------|
| stretchRatio | 0.5 | Standard waistband gathering |
| width | 12 | 12mm is the most common elastic width |
| type | 'band' | Most common elastic application |
| tStart | 0 | Full edge |
| tEnd | 1 | Full edge |
| active | true | Simulate immediately |

### Multiple Elastics Per Edge

Multiple elastics are allowed on the same edge with different `tStart/tEnd` ranges. Example: elastic from 0.0–0.3 and 0.7–1.0 on a waistband with center-back opening. No overlap validation is enforced — overlapping ranges just create overlapping constraints (additive gathering).

### Redux State

`projectSlice.ts` extended with:
- State: `elastics: Elastic[]`
- Reducers: `addElastic`, `removeElastic`, `updateElastic`
- Already resets on NEW_PROJECT via `() => initialState`

### Cascade on Piece Removal

The `removePiece` reducer must be extended to also filter `state.elastics` by `pieceId`, removing all elastics associated with the deleted piece. This matches the existing cascade pattern where `removePiece` also removes associated seams.

### Edge Reference Integrity

`edgeName` references `SemanticEdge.name` on the piece. This is the same reference pattern used by seams (`seam.pieceA.edgeName`).

**Validation at creation:** `addElastic` reducer (and copilot `addElasticTool`) validates that the referenced edge exists on the piece. If the edge doesn't exist, the operation fails.

**Edge rename/split/removal:** This is a pre-existing integrity issue shared with the seam system (audit Finding #05). When a piece's outline is modified and edges are renamed or split, both seams and elastics referencing old edge names become dangling. This is **out of scope** for this PR — the fix should be a centralized edge-reference cascade system that handles both seams and elastics. Tracked as a known limitation.

## UI Interaction

### Hook: `useElasticTool`

Located at `src/hooks/useElasticTool.ts`. Follows the seam tool interaction pattern.

**Flow:**
1. User activates elastic tool from sewing toolbar group
2. Hovering over a piece edge highlights it (edge hit-testing from existing infrastructure)
3. Click applies elastic with defaults to the full edge
4. If the edge already has elastic(s), clicking selects the nearest one (by parametric distance to click point) for editing
5. Properties panel shows elastic config for the selected elastic

**Edge detection:** Reuse the edge hit-testing logic from seam/walk-seam tools. The hook reads `pieces` and `elastics` from Redux, and the `activeTool2D` from the editor slice.

**Returns:** hover state, click handler, active elastic ID, edge highlight data.

### Properties Panel

When an elastic is selected, the properties panel shows:
- Stretch ratio slider (10–200%, maps to 0.1–2.0)
- Width dropdown (6mm, 12mm, 19mm, 25mm, custom)
- Type selector (Band, Shirring, Drawstring)
- Start/End parametric fields (0.0–1.0)
- Active toggle

This uses the existing PropertiesPanel extension pattern — no new panel component needed, just a conditional section when the selection is an elastic entity.

## 2D Visual Rendering

### ElasticRenderer

New component at `src/components/PatternEditor/renderers/ElasticRenderer.tsx`.

Renders a zigzag SVG path along each elastic edge segment. The zigzag is the universal pattern drafting symbol for elastic.

**Zigzag parameters:**
- Amplitude: proportional to `elastic.width` (scaled to canvas units)
- Frequency: fixed at ~4mm per zigzag tooth
- Color by type: blue (#3B82F6) for band, purple (#8B5CF6) for shirring, green (#10B981) for drawstring
- Opacity: 0.4 for inactive, 0.9 for active
- Rendered only on the `tStart`–`tEnd` segment of the edge

**Implementation:** Sample points along the edge outline commands (using existing path interpolation utils), generate alternating offsets perpendicular to the edge tangent to create the zigzag pattern. Output as an SVG `<path>` element.

**Layer order:** Rendered after piece outlines, before seam allowance indicators. Sibling to existing renderers in the PatternEditor SVG tree.

## Cloth Simulation Integration

### Solver Scope

**This PR implements elastic constraints for the WASM and CPU solver paths only.** The GPU (TSL) solver path requires a dedicated compute kernel (analogous to the existing TSL seam kernel) and is tracked as a follow-up. On WebGPU-capable browsers where the TSL solver is active, elastic gathering will not be visible until the TSL kernel is implemented.

### ElasticAssembly

New module at `src/utils/cloth/elasticAssembly.ts`.

**Approach:** Elastic constraints are distance constraints between consecutive vertices along the elastic edge, with rest lengths multiplied by `stretchRatio`. This causes the fabric to gather.

```typescript
interface ElasticConstraint {
  vertexA: number;       // vertex index in merged mesh
  vertexB: number;
  restLength: number;    // original edge segment length * stretchRatio
  compliance: number;    // stiffness from elastic type
}
```

**Compliance by type:**

| Type | Compliance | Behavior |
|------|-----------|----------|
| band | 0.00005 | Very stiff — strong gathering |
| shirring | 0.0005 | Softer — gentle gathering |
| drawstring | 0.0002 | Medium — adjustable tension |

### Vertex-to-Edge Mapping

The existing `parameterizeEdge()` function in `seamAssembly.ts` solves the edge-to-mesh-vertex mapping. It:
1. Takes a piece outline, `segmentRange` (from `SemanticEdge`), and a global vertex offset
2. Flattens curves, subdivides long edges to match CDT mesher output
3. Returns `ParameterizedVertex[]` with global mesh indices and parametric `t` values

`buildElasticConstraints` reuses `parameterizeEdge`, then filters by `tStart/tEnd` — the same approach used by `buildSeamConstraints` for partial-edge seams.

### Building Constraints

1. For each active `Elastic`, look up the piece's `SemanticEdge` by `edgeName` to get `segmentRange`
2. Call `parameterizeEdge(outline, segmentRange[0], segmentRange[1], vertexOffset)` to get mesh vertices
3. Filter vertices to `tStart`–`tEnd` range
4. For consecutive vertex pairs, create a constraint with `restLength = segmentLength * stretchRatio`
5. Return array of `ElasticConstraint`

**Integration point:** The elastic constraints are solved in the same XPBD substep loop as seam constraints. `elasticAssembly.ts` exports a `buildElasticConstraints(elastics, outlines, mergedMesh, pieces)` function called during simulation setup, alongside `buildSeamConstraints`.

**Worker messages:** Add `setElastics` message type to both WASM and CPU workers, following the existing `setCollisionBodies` pattern.

## Copilot Tools

### File: `src/copilot/action/tools/definitions/elasticTools.ts`

Three tools following the `sewingEnhancementTools.ts` pattern:

**addElasticTool:**
- Parameters: `pieceId`, `edgeName`, optional `stretchRatio`, `width`, `type`, `tStart`, `tEnd`
- Validates piece exists and edge exists on piece
- Clamps `stretchRatio` to 0.1–2.0
- Dispatches `addElastic` with defaults for omitted params
- Returns created elastic data

**removeElasticTool:**
- Parameters: `elasticId`
- Validates elastic exists
- Dispatches `removeElastic`

**updateElasticTool:**
- Parameters: `elasticId`, plus optional fields to update
- Validates elastic exists, clamps stretchRatio if provided
- Dispatches `updateElastic` with merged values

All tools registered in `src/copilot/action/tools/registry.ts`.

## Known Limitations / Follow-ups

| Item | Scope | Notes |
|------|-------|-------|
| GPU (TSL) solver elastic kernel | Follow-up | Requires TSL compute kernel; WASM/CPU paths work in this PR |
| Edge rename/split cascade | Follow-up (shared with seams) | Audit Finding #05 — centralized edge-reference integrity system |
| Export integration (DXF/PDF) | Follow-up | Elastic annotations in manufacturing output |

## Files Created/Modified

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/types/types.ts` | Add `Elastic` interface |
| Modify | `src/store/projectSlice.ts` | Add `elastics` state + reducers + removePiece cascade |
| Create | `src/hooks/useElasticTool.ts` | 2D canvas interaction hook |
| Create | `src/components/PatternEditor/renderers/ElasticRenderer.tsx` | Zigzag SVG rendering |
| Create | `src/utils/cloth/elasticAssembly.ts` | Simulation constraint builder |
| Modify | `src/utils/cloth/seamAssembly.ts` | Export `parameterizeEdge` if not already exported |
| Modify | WASM/CPU worker message handlers | Add `setElastics` message |
| Modify | `src/tools/definitions/elastic.tsx` | Wire `onActivate` |
| Create | `src/copilot/action/tools/definitions/elasticTools.ts` | Copilot tools |
| Modify | `src/copilot/action/tools/registry.ts` | Register elastic tools |
| Create | `src/utils/cloth/__tests__/elasticAssembly.test.ts` | Simulation tests |
| Create | `src/hooks/__tests__/useElasticTool.test.ts` | Hook tests |

## Testing Strategy

- **Unit tests:** `elasticAssembly.test.ts` — constraint building, rest length calculation, compliance mapping, stretchRatio clamping
- **Hook tests:** `useElasticTool.test.ts` — edge detection, click handling, multi-elastic selection
- **Redux tests:** removePiece cascade removes associated elastics
- **Type check:** `tsc --noEmit` validates all type additions
- **Existing tests:** Verify no regressions in seam tools, project slice, simulation
