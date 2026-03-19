# Sewing Enhancements — Tension, M:N Sewing, Deactivation, Taping

> **Issue**: #368
> **Date**: 2026-03-19
> **Status**: Design approved

## Summary

Extends the sewing system with per-seam tension control (gathering/easing), adjustable sewing ranges, M:N seam groups, piece/seam deactivation, and seam taping. Includes a SeamPropertiesPanel, 8 copilot tools, and diagnostic integration.

## Extended Seam Data Model

```typescript
export interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  pieceB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';

  // Tension & strength
  tension: number;       // 100 = neutral, <100 = gathering, >100 = easing. Default 100. Clamped 10-200 in reducer.
  strength: number;      // 0-1, constraint force multiplier. Default 1.0. Clamped 0.01-1.0 in reducer.

  // Activation
  active: boolean;       // false = excluded from simulation, rendered dashed/gray. Default true.

  // Seam tape
  taped: boolean;        // true = seam tape applied (10x stiffer). Default false.
  tapeWidth: number;     // mm, visual indicator width. Default 10.
}
```

**`tStart`/`tEnd`** on each seam side — 0.0 to 1.0 arc-length parameters defining the sewing range on the edge. Default `undefined` = full edge (0.0 to 1.0). This is the "Change Length" feature.

### M:N Seam Groups

```typescript
export interface SeamGroup {
  id: string;
  edgesA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  edgesB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  type: Seam['type'];
  tension: number;
  strength: number;
  active: boolean;
  taped: boolean;
  tapeWidth: number;
}
```

M edges on side A mapped to N edges on side B. Stored in `state.project.seamGroups: SeamGroup[]` alongside `seams`. Also added to `OpenCloProject` interface as `seamGroups?: SeamGroup[]` for serialization. The solver distributes constraints proportionally by arc-length across the combined edges.

**Worker protocol for SeamGroups**: SeamGroups are flattened into `SeamInitData[]` before sending to the worker. Each group generates multiple constraint sets internally. The `seamsToInitData()` function in `GarmentSimulation.tsx` handles the flattening — each group edge-pair becomes a SeamInitData entry with a shared group ID prefix.

### PatternPiece.active

```typescript
// Added to PatternPiece:
active: boolean;  // default true. false = grayed in 2D, excluded from 3D simulation.
```

When `false`: piece renders grayed out in 2D (30% opacity + gray overlay), excluded from 3D simulation. Seams connected to inactive pieces stay visible in 2D but render as dashed/gray. **Filtering happens in `GarmentSimulation.tsx`** before calling `initMultiPiece` — inactive pieces are excluded from the merged mesh. Seams that reference any inactive piece are automatically excluded from constraint building.

## Solver Changes

In `src/utils/cloth/seamAssembly.ts`:

### Per-seam tension

Tension controls the **final sewn distance** between paired vertices. The sewing process still shrinks rest lengths toward zero (pulling pieces together), but after pieces are sewn, the constraint target distance is modified by tension.

**How it works**: Tension applies symmetrically to the seam — it modifies the matched distance between paired vertices. In a seam between edge A (44cm) and edge B (42cm), at `tension=100%` the solver matches vertices 1:1 by arc-length parameter and pulls them together (normal sewing). At `tension=90%`, the solver compresses the **longer** edge to 90% of its natural length, creating gathering on that side.

```typescript
// In buildSeamConstraints, for each vertex pair:
const edgeLengthA = arcLength(edgeA, tStartA, tEndA);
const edgeLengthB = arcLength(edgeB, tStartB, tEndB);
const ratio = tension / 100; // 1.0 = neutral

// Modify the matching: instead of equal t-parameter spacing,
// compress/expand one side's t-distribution by the ratio.
// The solver still pulls matched vertices to distance=0 (sewn together).
// The gathering effect comes from the unequal spacing of matched points —
// more points are matched to a shorter segment, creating fabric compression.

// Clamped to safe range:
const clampedTension = Math.max(10, Math.min(200, tension));
```

**Key clarification**: The rest-length convergence (shrink toward 0) is unchanged. Tension modifies the *vertex matching distribution*, not the rest length. At `tension=50%`, side A's vertices are matched to only 50% of side B's arc-length range, causing side A to bunch/gather into that compressed region.

### Per-seam strength

Maps to compliance modification:

```typescript
const seamCompliance = baseTypeCompliance / strength;
// strength=1.0 → normal
// strength=0.5 → twice as soft (looser)
// strength=0.1 → very soft (decorative)
```

### Per-seam active

Skip inactive seams in `buildSeamConstraints()`. Do not generate constraint pairs for seams where `active === false`.

### Seam tape stiffness

When `taped === true`, reduce compliance by 10x (much stiffer constraint). This simulates the reinforcement of seam tape.

### buildSeamConstraints integration

In `buildSeamConstraints()`, for each seam:
1. Check `seam.active` — skip if false
2. Call `parameterizeEdge()` with `tStart`/`tEnd` range to get vertex subset
3. Apply tension to modify vertex matching distribution (see tension section above)
4. Compute compliance: `baseTypeCompliance / seam.strength * (seam.taped ? 0.1 : 1.0)`
5. Generate constraint pairs as before

### t-range (Change Length)

`parameterizeEdge()` already uses arc-length parameters. When `tStart`/`tEnd` are provided, filter **before** parameterization — only include outline vertices within the t-range. Vertices outside the range are not included in seam constraints.

### M:N seam groups

New `buildSeamGroupConstraints()` function:
1. Concatenate all edges from side A into one continuous parameterized curve
2. Concatenate all edges from side B into one continuous parameterized curve
3. Match vertices proportionally by arc-length across the combined curves
4. Apply tension/strength/tape as with regular seams

## SeamInitData Extension

The worker message format extends to include new fields:

```typescript
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeName: string;
  pieceARange?: [number, number]; // [tStart, tEnd]
  pieceBId: string;
  pieceBEdgeName: string;
  pieceBRange?: [number, number]; // [tStart, tEnd]
  type: Seam['type'];
  tension: number;
  strength: number;
  active: boolean;
  taped: boolean;
}
```

## UI: SeamPropertiesPanel

New component rendered when a seam is selected (via `editorSlice.selectedSeamId`). Appears in the Properties Panel area.

- **Type dropdown**: standard / french / flat-felled / overlock
- **Tension slider**: 0-200%, default 100%. Shows "Gathering" label below 100%, "Easing" above.
- **Strength slider**: 0.0-1.0, default 1.0
- **Tape toggle**: checkbox + width input (mm)
- **Range A/B**: t-start/t-end inputs (0.0-1.0) per side
- **Deactivate button**: toggles `seam.active`
- **Reverse button**: swaps pieceA ↔ pieceB
- **Delete button**: removes seam

## UI: Piece Deactivation

- **Context menu**: "Deactivate Piece" / "Activate Piece" toggle on right-click in 2D and 3D
- **Properties Panel**: toggle in Piece section
- **Visual**: inactive pieces render with 30% opacity and gray overlay in 2D
- **3D**: inactive pieces are not included in simulation mesh

## UI: Seam Rendering Updates

In `SeamRenderer.tsx`:
- **Inactive seams**: dashed line, gray color instead of solid
- **Taped seams**: thicker line or double-line indicator
- **Tension label**: small percentage label near seam midpoint when tension ≠ 100%
- **M:N groups**: rendered as connected set of seam lines with shared color

## Copilot Tools

8 new tools in `src/copilot/action/tools/definitions/sewingEnhancementTools.ts`:

| Tool | Params | Purpose |
|------|--------|---------|
| `setSeamTension` | `{ seamId, tension, strength? }` | Set gathering/easing + optional strength |
| `setSeamRange` | `{ seamId, side: 'A'\|'B', tStart, tEnd }` | Change sewing range on edge |
| `setSeamTape` | `{ seamId, taped, tapeWidth? }` | Toggle seam taping |
| `setSeamActive` | `{ seamId, active }` | Toggle seam on/off in simulation |
| `setPieceActive` | `{ pieceId, active }` | Toggle piece on/off in simulation |
| `createSeamGroup` | `{ edgesA[], edgesB[], type, tension? }` | Create M:N seam group |
| `getSeamInfo` | `{ seamId? }` | Get seam properties (read-only) |
| `analyzeGathering` | `{ seamId }` | Calculate actual gathering ratio + suggest optimal tension |

**Agent intelligence**: `analyzeGathering` measures both edge lengths, computes the natural ratio, and suggests a tension value. Example: "Sleeve cap is 44cm, armhole is 42cm → suggested tension: 95% for standard ease."

All tools return `ToolResult` with rollback functions.

## Diagnostic Inspector Integration

- `InspectionData` extended with seam tension/strength data when inspecting a seam-connected piece
- New rules in `ruleEngine.ts`:
  - "Tension below 50% — extreme gathering" → warning
  - "Tension above 150% — extreme easing" → warning
  - "Inactive piece has active seams" → info
  - "Seam connects edges with >20% length mismatch and tension=100%" → warning (suggests tension adjustment)

## Files

### Create

| File | Purpose |
|------|---------|
| `src/components/PropertiesPanel/SeamPropertiesPanel.tsx` | Seam property editor |
| `src/copilot/action/tools/definitions/sewingEnhancementTools.ts` | 8 copilot tools |
| `src/store/__tests__/projectSlice.sewing.test.ts` | Sewing action tests |

### Modify

| File | Change |
|------|--------|
| `src/types/types.ts` | Extend Seam, add SeamGroup, add PatternPiece.active |
| `src/store/projectSlice.ts` | Add updateSeam, addSeamGroup, removeSeamGroup, setSeamTension, deactivatePiece, deactivateSeam actions. Update addSeam to default new fields. Update loadProject to backfill defaults. |
| `src/utils/cloth/seamAssembly.ts` | Per-seam tension/strength/range, M:N group support, skip inactive |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | Inactive (dashed/gray), tape indicator, tension label |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Gray overlay for inactive pieces |
| `src/components/PatternEditor/ContextMenu.tsx` | "Deactivate Piece" option |
| `src/components/Viewport3D/ContextMenu3D.tsx` | "Deactivate Piece" in 3D menu |
| `src/utils/cloth/clothWorkerClient.ts` | Pass extended SeamInitData to worker |
| `src/utils/cloth/clothWorker.ts` | Handle extended seam fields in constraint building |
| `src/utils/cloth/wasm/wasmSolverClient.ts` | Pass extended SeamInitData (WASM path) |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Update `seamsToInitData()` to pass tension/strength/active/taped/range fields |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Handle extended SeamInitData |
| `src/diagnostics/types.ts` | Add tension/strength/active/taped to InspectionSeamData |
| `src/diagnostics/dataCollector.ts` | Include seam properties in InspectionData |
| `src/diagnostics/ruleEngine.ts` | Tension/gathering/deactivation rules |
| `src/components/PropertiesPanel/PropertiesPanel.tsx` | Render SeamPropertiesPanel when seam selected |
| `src/copilot/action/tools/registry.ts` | Register new sewing tools |

### Not Touched

- Undo middleware (seam actions are standard Redux)
- Copilot bridge
- Layer system
- Confirmation middleware

## Testing

- Unit tests for projectSlice sewing actions (updateSeam, addSeamGroup, deactivate)
- Unit tests for seamAssembly tension/range modifications
- Unit tests for copilot sewing tools
- Unit tests for diagnostic rules (tension thresholds)
- Integration: set tension → verify constraint rest lengths modified

## Project Migration

Existing projects have seams without the new fields. `loadProject` backfills defaults: `tension: 100`, `strength: 1.0`, `active: true`, `taped: false`, `tapeWidth: 10`. Pieces without `active` default to `true`.
