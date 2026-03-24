# Elastic Tool Design

> Issue #322 — Implement Elastic tool

## Overview

The Elastic tool allows users to define elastic segments along piece edges, specifying stretch ratio, width, type, and placement. It includes 2D visual rendering (zigzag), cloth simulation integration (contracted rest-length constraints), and copilot tool registration for AI-driven elastic operations.

## Data Model

New `Elastic` entity in `src/types/types.ts`, stored as `ProjectState.elastics: Elastic[]`.

```typescript
interface Elastic {
  id: string;
  pieceId: string;
  edgeName: string;          // references SemanticEdge.name on the piece
  stretchRatio: number;      // 0.0–1.0 (0.5 = gathers fabric to 50% of relaxed length)
  width: number;             // mm (typical: 6, 12, 25)
  type: 'band' | 'shirring' | 'drawstring';
  tStart: number;            // 0.0–1.0 parametric start on edge, default 0
  tEnd: number;              // 0.0–1.0 parametric end on edge, default 1
  active: boolean;           // participates in cloth simulation
}
```

### Defaults

| Property | Default | Rationale |
|----------|---------|-----------|
| stretchRatio | 0.5 | Standard waistband gathering |
| width | 12 | 12mm is the most common elastic width |
| type | 'band' | Most common elastic application |
| tStart | 0 | Full edge |
| tEnd | 1 | Full edge |
| active | true | Simulate immediately |

### Redux State

`projectSlice.ts` extended with:
- State: `elastics: Elastic[]`
- Reducers: `addElastic`, `removeElastic`, `updateElastic`
- Already resets on NEW_PROJECT via `() => initialState`

## UI Interaction

### Hook: `useElasticTool`

Located at `src/hooks/useElasticTool.ts`. Follows the seam tool interaction pattern.

**Flow:**
1. User activates elastic tool from sewing toolbar group
2. Hovering over a piece edge highlights it (edge hit-testing from existing infrastructure)
3. Click applies elastic with defaults to the full edge
4. If the edge already has an elastic, clicking selects it for editing
5. Properties panel shows elastic config for the selected elastic

**Edge detection:** Reuse the edge hit-testing logic from seam/walk-seam tools. The hook reads `pieces` and `elastics` from Redux, and the `activeTool2D` from the editor slice.

**Returns:** hover state, click handler, active elastic ID, edge highlight data.

### Properties Panel

When an elastic is selected, the properties panel shows:
- Stretch ratio slider (0–100%, maps to 0.0–1.0)
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

### ElasticAssembly

New module at `src/utils/cloth/elasticAssembly.ts`.

**Approach:** Elastic constraints are distance constraints between consecutive vertices along the elastic edge, with rest lengths multiplied by `stretchRatio`. This causes the fabric to gather.

```typescript
interface ElasticConstraint {
  vertexA: number;       // vertex index in mesh
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

**Building constraints:**
1. For each active `Elastic`, find the piece's mesh vertices along the edge segment (`tStart`–`tEnd`)
2. For consecutive vertex pairs, create a constraint with `restLength = segmentLength * stretchRatio`
3. Return array of `ElasticConstraint`

**Integration point:** The elastic constraints are solved in the same XPBD substep loop as seam constraints. The entry point is the existing solver's constraint-solving phase. `elasticAssembly.ts` exports a `buildElasticConstraints(elastics, meshData)` function called during simulation setup, alongside `buildSeamConstraints`.

**Worker messages:** Add `setElastics` message type to both WASM and CPU workers, following the existing `setCollisionBodies` pattern.

## Copilot Tools

### File: `src/copilot/action/tools/definitions/elasticTools.ts`

Three tools following the `sewingEnhancementTools.ts` pattern:

**addElasticTool:**
- Parameters: `pieceId`, `edgeName`, optional `stretchRatio`, `width`, `type`, `tStart`, `tEnd`
- Validates piece and edge exist
- Dispatches `addElastic` with defaults for omitted params
- Returns created elastic data

**removeElasticTool:**
- Parameters: `elasticId`
- Validates elastic exists
- Dispatches `removeElastic`

**updateElasticTool:**
- Parameters: `elasticId`, plus optional fields to update
- Validates elastic exists
- Dispatches `updateElastic` with merged values

All tools registered in `src/copilot/action/tools/registry.ts`.

## Files Created/Modified

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/types/types.ts` | Add `Elastic` interface |
| Modify | `src/store/projectSlice.ts` | Add `elastics` state + reducers |
| Create | `src/hooks/useElasticTool.ts` | 2D canvas interaction hook |
| Create | `src/components/PatternEditor/renderers/ElasticRenderer.tsx` | Zigzag SVG rendering |
| Create | `src/utils/cloth/elasticAssembly.ts` | Simulation constraint builder |
| Modify | `src/utils/cloth/seamAssembly.ts` or solver entry | Integrate elastic constraint solving |
| Modify | `src/tools/definitions/elastic.tsx` | Wire `onActivate` |
| Create | `src/copilot/action/tools/definitions/elasticTools.ts` | Copilot tools |
| Modify | `src/copilot/action/tools/registry.ts` | Register elastic tools |
| Create | `src/utils/cloth/__tests__/elasticAssembly.test.ts` | Simulation tests |
| Create | `src/hooks/__tests__/useElasticTool.test.ts` | Hook tests |

## Testing Strategy

- **Unit tests:** `elasticAssembly.test.ts` — constraint building, rest length calculation, compliance mapping
- **Hook tests:** `useElasticTool.test.ts` — edge detection, click handling, duplicate prevention
- **Type check:** `tsc --noEmit` validates all type additions
- **Existing tests:** Verify no regressions in seam tools, project slice, simulation
