# Simulation Enhancements — Strengthen (Interfacing) + Solidify

> **Issue**: #369 (Phase 1)
> **Date**: 2026-03-20
> **Status**: Design approved

## Summary

Per-piece interfacing and solidify controls that modify constraint compliance in the XPBD solver. Interfacing applies a named stiffness preset (fusible-light through canvas). Solidify applies a continuous 0–1 stiffness multiplier. Both are computed once at constraint build time — no per-frame overhead. Includes UI controls in PieceProperties, 3 copilot tools, and a diagnostic rule.

Pressure (inflation force) is deferred to Phase 2 (#382).

## Data Model

### InterfacingType

```typescript
export type InterfacingType =
  | 'none'
  | 'fusible-light'
  | 'fusible-medium'
  | 'fusible-heavy'
  | 'sew-in-light'
  | 'sew-in-heavy'
  | 'canvas';
```

### Stiffness Multiplier Map

```typescript
export const INTERFACING_STIFFNESS: Record<InterfacingType, number> = {
  'none': 1.0,
  'fusible-light': 2.0,
  'fusible-medium': 4.0,
  'fusible-heavy': 8.0,
  'sew-in-light': 1.5,
  'sew-in-heavy': 3.0,
  'canvas': 10.0,
};
```

### PatternPiece Extensions

```typescript
// Added to PatternPiece interface:
/** Interfacing type applied to this piece. Default 'none'. */
interfacingType?: InterfacingType;

/** Solidify factor: 0 = normal fabric, 1 = maximum rigidity. Default 0. */
solidifyFactor?: number;
```

### Combined Stiffness Computation

```typescript
export function computeStiffnessMultiplier(
  interfacingType: InterfacingType = 'none',
  solidifyFactor: number = 0,
): number {
  const interfacingMul = INTERFACING_STIFFNESS[interfacingType];
  const solidifyMul = 1 + solidifyFactor * 9; // 0→1x, 0.5→5.5x, 1→10x
  return interfacingMul * solidifyMul;
}
```

The result is a single number that divides constraint compliance. Clamped to a maximum of 50 to prevent simulation instability:

```typescript
return Math.min(interfacingMul * solidifyMul, 50);
```

- `1.0` = normal fabric behavior
- `4.0` = fusible-medium interfacing (standard collar/cuff)
- `10.0` = canvas (tailored jacket chest piece)
- `50.0` = maximum (canvas + solidify 1.0, clamped from 100)

**Note:** Without clamping, canvas (10x) + solidify 1.0 (10x) = 100x, which can cause instability. The 50x cap keeps pieces stiff but simulatable.

## Solver Integration

### How compliance is modified

The XPBD solver builds per-constraint compliance arrays at initialization time. Currently, compliance comes from the fabric config (stretchComplianceWarp/Weft/Shear, bendComplianceWarp/Weft). The stiffness multiplier divides these values:

```
effectiveCompliance = baseCompliance / stiffnessMultiplier
```

Lower compliance = stiffer constraint = less stretch/bend.

### Where the modification happens

After the solver is constructed via `new XPBDClothSolver(mergedMeshData, config)`, the solver's `initPhysics()` builds `stretchCompliances` and `bendCompliances` arrays from the global fabric config. These are private arrays — we need a new public method to apply per-piece stiffness:

```typescript
// New method on XPBDClothSolver:
applyPieceStiffness(pieceOffsets: PieceOffset[], multipliers: number[]): void {
  // Build vertex → piece index lookup from pieceOffsets
  // For each stretch constraint: find which piece both vertices belong to, divide compliance
  // For each bend constraint: same treatment
}
```

The `PieceOffset` data (vertex offset + count per piece) already exists from `mergeMeshes()` in the worker. After solver construction, the worker calls `solver.applyPieceStiffness(pieceOffsets, multipliers)` to modify the internal compliance arrays.

**Seam constraints are NOT modified** by piece stiffness — they model sewing thread with its own physical properties (`strength`, `taped`), independent of fabric stiffness. The seam system already has its own compliance modifiers via `buildSeamConstraints()`.

### Worker interface

The existing `initMultiPiece` message's piece data is extended:

```typescript
// In the piece data sent to worker:
{
  pieceId: string;
  vertices: Float32Array;
  triIds: Uint32Array;
  outline: PathCommand[];
  edges?: SemanticEdge[];
  stiffnessMultiplier: number;  // precomputed on main thread
}
```

The main thread computes `stiffnessMultiplier` via `computeStiffnessMultiplier(piece.interfacingType, piece.solidifyFactor)` before sending to the worker. The solver doesn't need to know about interfacing types — it receives a number.

### Constraint rebuild trigger

When `interfacingType` or `solidifyFactor` changes on a piece, the simulation must rebuild constraints. This uses the same mechanism as fabric changes: the `GarmentSimulation` component detects piece property changes and re-sends `initMultiPiece` to the worker.

### WASM + GPU solver scope

**JS solver (`xpbdSolver.ts`):** Full support. The new `applyPieceStiffness()` method modifies the internal compliance arrays after construction.

**WASM solver (`lib.rs`):** The Rust solver re-derives per-constraint compliance from global config values via `set_stretch_with_types()`. It does not accept per-constraint compliance overrides. **Phase 1 limitation: per-piece stiffness has no effect in WASM mode.** To support it, Phase 2 would add a `set_compliance_overrides(&[f32])` method to the Rust solver. For now, the worker should fall through to the JS solver's compliance arrays when stiffness multipliers differ from 1.0 (or accept the limitation silently).

**GPU solver (TSL):** Same limitation as WASM — compliance is baked into the compute shader from global config. Per-piece stiffness is not applied in GPU mode. Phase 2 scope.

## UI: PieceProperties Panel

Add to `src/components/PropertiesPanel/PieceProperties.tsx`, after the Fabric dropdown:

### Interfacing Dropdown

```
Interfacing: [none ▼]
  none
  fusible-light (2x)
  fusible-medium (4x)
  fusible-heavy (8x)
  sew-in-light (1.5x)
  sew-in-heavy (3x)
  canvas (10x)
```

Dispatches `updatePiece({ ...piece, interfacingType: value })`.

### Solidify Slider

```
Solidify: [====------] 0.40   (1x–10x)
```

Range 0.0–1.0, step 0.01. Shows the effective multiplier in parentheses.
Dispatches `updatePiece({ ...piece, solidifyFactor: value })`.

### Combined Stiffness Display

Below both controls, a small info line:
```
Effective stiffness: 4.0x (fusible-medium)
```

Shows the combined multiplier from interfacing + solidify.

## Copilot Tools

3 new tools added to `src/copilot/action/tools/definitions/simulationTools.ts`:

| Tool | Params | Purpose |
|------|--------|---------|
| `setInterfacing` | `{ pieceId, interfacingType }` | Apply interfacing to a piece |
| `setSolidify` | `{ pieceId, solidifyFactor }` | Set solidify stiffness (0–1) |
| `getSimulationProperties` | `{ pieceId? }` | Read interfacing, solidify, fabric for piece(s) |

### `setInterfacing` Intelligence

When the copilot says "add interfacing to the collar", the tool:
1. Finds pieces with `category: 'collar'` or name matching "collar"
2. Applies the specified type (defaults to `'fusible-medium'` if not specified)
3. Returns the applied stiffness multiplier

### `getSimulationProperties` Output

Returns per-piece: name, fabricId, interfacingType, solidifyFactor, effective stiffness multiplier. Useful for the copilot to reason about garment construction ("the collar has fusible-medium at 4x, which is standard").

All tools dispatch `updatePiece` and return `ToolResult` with rollback.

## Diagnostic Integration

One new rule in `ruleEngine.ts`:

- When inspecting a piece with `category` in `['collar', 'cuff', 'waistband']` and `interfacingType` is `'none'` or undefined → info "No interfacing applied — consider adding interfacing for structural support"

## Files

### Create

| File | Purpose |
|------|---------|
| `src/utils/cloth/interfacing.ts` | `InterfacingType`, `INTERFACING_STIFFNESS`, `computeStiffnessMultiplier()` |
| `src/utils/cloth/__tests__/interfacing.test.ts` | Unit tests for stiffness computation |

### Modify

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `InterfacingType`, `interfacingType?` and `solidifyFactor?` to PatternPiece |
| `src/store/projectSlice.ts` | `loadProject` backfill: `interfacingType ?? 'none'`, `solidifyFactor ?? 0` |
| `src/utils/cloth/xpbdSolver.ts` | Apply per-piece stiffness multiplier to stretch/bend compliance arrays |
| `src/utils/cloth/clothWorker.ts` | Extend piece init data with `stiffnessMultiplier` field |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Compute and pass `stiffnessMultiplier` per piece |
| `src/components/PropertiesPanel/PieceProperties.tsx` | Interfacing dropdown + solidify slider + combined display |
| `src/copilot/action/tools/definitions/simulationTools.ts` | 3 new tools |
| `src/copilot/action/tools/registry.ts` | Update tool count (if tools are in a new module) |
| `src/diagnostics/ruleEngine.ts` | Missing interfacing suggestion rule |
| `src/store/undoMiddleware.ts` | No new actions needed — uses existing `updatePiece` |

### Not Touched

- WASM solver (`crates/xpbd-wasm/src/lib.rs`) — per-piece stiffness not applied in WASM mode (Phase 2)
- GPU solver (TSL) — per-piece stiffness not applied in GPU mode (Phase 2)
- Seam system — seam constraints have their own strength/tape modifiers, NOT modified by piece stiffness
- Layer system
- Confirmation middleware

## Testing

- Unit tests for `computeStiffnessMultiplier`: all interfacing types, solidify range, combined values, edge cases (0, 1, defaults)
- Unit tests for solver compliance modification: verify constraints for interfaced piece have lower compliance
- Copilot tool tests: setInterfacing, setSolidify, getSimulationProperties
- Integration: apply interfacing → verify constraint compliance reduced → simulation produces stiffer behavior

## Migration

Existing pieces have no `interfacingType` or `solidifyFactor` fields. `loadProject` backfills defaults following the established pattern:

```typescript
if ((piece as any).interfacingType === undefined) piece.interfacingType = 'none';
if ((piece as any).solidifyFactor === undefined) piece.solidifyFactor = 0;
```

This is consistent with how `layer`, `sublayer`, `active` are backfilled. `computeStiffnessMultiplier` also handles `undefined` gracefully as a safety net.

## Future (Phase 2 — #382)

- **Pressure inflation**: Normal-direction force per triangle for puffer jackets
- **Per-region interfacing zones**: Sub-piece zones (collar point only, not full collar)
- **WASM per-particle stiffness**: Float32Array for brush-based strengthening
- **Interfacing weight/thickness**: Affect fabric weight and drape coefficient
