# Colorway Support Design

> Issue #265 — Colorway Support (Gerber-style)
> Sub-project A: data model, Redux state, copilot tools, 3D viewport integration
> UI components, 2D colors, export deferred to #446

## Overview

Gerber-compatible colorway system: multiple color/fabric combinations per model without duplicating the pattern. Colorways override what each `fabricCode` resolves to — if 5 pieces all use `SELF`, switching colorway changes all 5 at once. This matches the Gerber AccuMark model.

Overrides can include color, fabricId (changes simulation), and textureUrl. Switching a colorway that swaps fabricId triggers cloth re-drape.

## Data Model

### Colorway Types

New interfaces in `src/types/types.ts`:

```typescript
export interface ColorwayOverride {
  color?: string;           // hex color override
  fabricId?: string;        // swap PhysicalFabric (changes simulation drape)
  textureUrl?: string;      // texture override for 3D rendering
}

export interface Colorway {
  id: string;
  name: string;             // "Navy", "Summer Red", "Colorway A"
  overrides: Record<string, ColorwayOverride>;  // keyed by fabricCode (SELF, LINING, etc.)
  isDefault?: boolean;      // first colorway is typically default
}
```

### fabricCode-Based Override Model

Colorways override by `fabricCode`, not by `pieceId`. This means:
- All pieces with `fabricCode: 'SELF'` are affected by the `SELF` override
- Changing the `SELF` override from navy to red changes all SELF pieces at once
- Pieces without a matching `fabricCode` in the colorway are unaffected (fallback to base)

This matches Gerber AccuMark's colorway model and is production-compatible.

### Override Behavior

| Field | When present | When absent |
|-------|-------------|-------------|
| `color` | Overrides piece rendering color in 3D | Uses base fabric color |
| `fabricId` | Swaps PhysicalFabric for simulation AND rendering | Uses base fabric assignment |
| `textureUrl` | Overrides 3D material texture | Uses base fabric texture |

When `fabricId` is overridden, the simulation uses the new fabric's physical properties (stretch, bend, weight). This triggers re-drape when the colorway is switched.

## Redux State

### ProjectState Extension

```typescript
colorways: Colorway[];
activeColorwayId: string | null;
```

Added to `ProjectState` interface and `initialState` (as `[]` and `null`).

### Reducers

**`addColorway(state, action: PayloadAction<Omit<Colorway, 'id'>>)`:**
Generates ID via `uid()`, pushes to `state.colorways`. If it's the first colorway, sets `activeColorwayId` to its ID.

**`removeColorway(state, action: PayloadAction<string>)`:**
Removes by ID. If the removed colorway was active, sets `activeColorwayId` to the first remaining colorway's ID (or `null` if none left).

**`updateColorway(state, action: PayloadAction<Partial<Colorway> & { id: string }>)`:**
Merges updates. For `overrides`, deep-merges with existing overrides (so updating one fabricCode doesn't wipe others).

**`setActiveColorway(state, action: PayloadAction<string | null>)`:**
Sets `activeColorwayId`. Validates the ID exists in `state.colorways` (or is `null`).

**`duplicateColorway(state, action: PayloadAction<{ sourceId: string; newName: string }>)`:**
Deep-clones the source colorway with a new ID and name, pushes to array.

**`renameColorway(state, action: PayloadAction<{ id: string; name: string }>)`:**
Updates the colorway's name.

### Cascades

No `removePiece` cascade needed — colorways reference `fabricCode` strings, not piece IDs.

### NEW_PROJECT

Covered by `projectSlice` resetting to `initialState` which includes `colorways: []`, `activeColorwayId: null`.

## Colorway Resolver

### Module: `src/utils/colorwayResolver.ts`

Pure function that resolves the effective color, fabricId, and textureUrl for a piece given the active colorway.

```typescript
interface ResolvedPieceMaterial {
  color: string;            // hex color to render
  fabricId: string;         // PhysicalFabric ID for simulation
  textureUrl?: string;      // texture URL for 3D material
  isOverridden: boolean;    // true if any colorway override was applied
}

function resolveColorway(
  piece: PatternPiece,
  colorways: Colorway[],
  activeColorwayId: string | null,
  baseFabrics: Record<string, { color: string; fabricId: string; textureUrl?: string }>,
): ResolvedPieceMaterial
```

**Resolution order:**
1. If `activeColorwayId` is null → return base material (no override).
2. Find active colorway by ID. If not found → return base material.
3. Look up `piece.fabricCode` in `colorway.overrides`. If no override for this fabricCode → return base material.
4. Apply override fields (color, fabricId, textureUrl) on top of base material. Only non-undefined fields override.
5. Return resolved material with `isOverridden: true`.

**Base material resolution:**
The base color/fabricId comes from the piece's existing fabric assignment:
- `piece.fabricCode` → look up in project's fabric library → get color
- `piece.fabricId` or `pieceFabrics[pieceId]` → fabricId for simulation

## 3D Viewport Integration

### Color Resolution Change

Modify `Viewport3D.tsx` where piece color is determined (currently reads from `FABRIC_LIBRARY[fabricId]`).

**New flow:**
1. Read `activeColorwayId` and `colorways` from Redux.
2. For each piece, call `resolveColorway()` to get the effective material.
3. Pass `resolved.color` as `fabricColor` and `resolved.fabricId` as the simulation fabric.

### Simulation Re-Drape on Colorway Switch

When `activeColorwayId` changes and the new colorway overrides `fabricId` for any piece:
- The fabric assignments in `simulationSlice.pieceFabrics` are recomputed.
- `useSimulationLifecycle` detects the fabric change via its existing dependency on `pieceFabrics` and triggers re-drape.

Implementation: A `useEffect` in a new `useColorwaySync` hook watches `activeColorwayId` + `colorways` and dispatches `setFabric` actions for each piece whose fabricId is overridden by the active colorway.

### File: `src/hooks/useColorwaySync.ts`

Small hook that:
1. Reads `pieces`, `colorways`, `activeColorwayId` from Redux.
2. On change, computes which pieces need fabric reassignment.
3. Dispatches `setFabric({ pieceId, fabricId })` for each overridden piece.
4. When colorway is deactivated (null), restores base fabric assignments.

## Copilot Tools

### File: `src/copilot/action/tools/definitions/colorwayTools.ts`

Six tools:

**`addColorway`:**
- Parameters: `name` (required), `overrides` (Record<fabricCode, ColorwayOverride>), `activate` (boolean, default true)
- Dispatches `addColorway`, optionally `setActiveColorway`
- Returns created colorway

**`removeColorway`:**
- Parameters: `colorwayId` (required)
- Validates exists, dispatches `removeColorway`

**`switchColorway`:**
- Parameters: `colorwayId` or `name` (one required)
- If `name` provided, looks up by name. Dispatches `setActiveColorway`.
- Passing `null` deactivates all colorways.

**`updateColorway`:**
- Parameters: `colorwayId` (required), `overrides` (partial overrides to merge)
- Dispatches `updateColorway`

**`listColorways`:**
- No parameters
- Returns all colorways with active status

**`duplicateColorway`:**
- Parameters: `colorwayId` (required), `newName` (required)
- Dispatches `duplicateColorway`

Registered in `src/copilot/action/tools/registry.ts`.

## Known Limitations / Follow-ups

| Item | Notes |
|------|-------|
| Colorway UI (tab bar, editor table) | Deferred to #446 |
| 2D viewport colorway colors | Deferred to #446 — PieceRenderer currently ignores fabric color |
| DXF export colorway metadata | Deferred to #446 |
| Tech pack colorway listing | Deferred to #446 |
| Colorway-specific textures | textureUrl override is stored but texture loading may need work if textures aren't preloaded |

## Files Created/Modified

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/types/types.ts` | Add `Colorway`, `ColorwayOverride` |
| Modify | `src/store/projectSlice.ts` | Add colorway state + reducers |
| Create | `src/utils/colorwayResolver.ts` | Pure resolution function |
| Create | `src/hooks/useColorwaySync.ts` | Sync colorway fabricId overrides to simulation |
| Modify | `src/components/Viewport3D/Viewport3D.tsx` | Use resolver for piece color/material |
| Create | `src/copilot/action/tools/definitions/colorwayTools.ts` | Copilot tools |
| Modify | `src/copilot/action/tools/registry.ts` | Register colorway tools |
| Create | `src/utils/__tests__/colorwayResolver.test.ts` | Resolver tests |

## Testing Strategy

- **Resolver tests:** no active colorway = fallback, color override only, fabricId override only, textureUrl override only, combined override, unknown fabricCode = fallback, missing piece.fabricCode = fallback
- **Redux tests:** add/remove/update/switch/duplicate/rename colorways, remove active colorway falls back
- **Copilot tool tests:** parameter validation, switchColorway by name
- **Type check:** `tsc --noEmit`
- **Existing tests:** no regressions
