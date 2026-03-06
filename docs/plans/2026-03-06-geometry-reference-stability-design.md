# Geometry Reference Stability — Design

## Problem

Three coordinate/reference bugs prevent reliable editing and break seams during parametric updates:

1. **Coordinate normalization mismatch**: `pieceBuilder.ts` shifts all outline coordinates to near-origin (subtracting minX/minY). The construction overlay must then apply a `normOffset` to re-align construction points with the pattern. This creates a fragile indirection — if normOffset drifts or isn't stored, construction and pattern diverge visually.

2. **SemanticEdge ID instability**: `detectSemanticEdges()` uses a session-scoped counter (`edge-1`, `edge-2`, ...) that resets every time it's called. Any code caching edge IDs (Dart.edgeId, UI selection, copilot tool references) gets stale after a rebuild.

3. **Seam references use fragile PathCommand indices**: `Seam.pieceA/B` stores `{ pieceId, edgeStart, edgeEnd }` — raw indices into the PathCommand array. If outline structure changes (node added/removed, curve segments change), these indices silently point to wrong geometry.

## Approach

### 1. Remove Normalization

Stop shifting outline coordinates in `pieceBuilder.ts`. Pieces keep absolute construction coordinates. The piece `position` field (already exists, currently hardcoded to `{ x: 50, y: 50 }`) becomes the piece's placement offset in the 2D editor — purely a view concern, not baked into geometry.

**What changes:**
- `pieceBuilder.ts`: Delete lines 127-140 (the normalization block). Return `normOffset: { x: 0, y: 0 }`.
- `ConstructionOverlay.tsx`: Stop subtracting `normOffset` from point/curve coordinates. Construction points render at their absolute coordinates, which now match the outline exactly.
- `constructionSlice.ts`: Remove `setConstructionPieceNormOffset` action and `normOffset` field from `CPiece`.
- `reactiveSolverMiddleware.ts`: Stop dispatching normOffset updates.

**What stays the same:**
- `piece.position` continues to handle where the piece sits in the 2D editor.
- The 2D editor's `transform={translate(position.x, position.y)}` wrapping already handles view placement.

### 2. Stable SemanticEdge IDs

Replace the session counter with a **deterministic ID** derived from `pieceId + edgeName`:

```typescript
function stableEdgeId(pieceId: string, edgeName: string): string {
  return `${pieceId}:${edgeName}`;
}
```

This is simpler and more debuggable than a content hash. The edge name is already unique per piece (the detection algorithm deduplicates with suffix: `sideSeam`, `sideSeam-2`). Combined with pieceId, it's globally unique.

**What changes:**
- `semanticEdges.ts`: `detectSemanticEdges()` accepts `pieceId` parameter. Uses `stableEdgeId()` instead of counter.
- Remove `_edgeCounter` module state.
- All callers of `detectSemanticEdges()` pass the piece ID.

### 3. Seam References by Edge Name

Migrate `Seam` from PathCommand indices to semantic edge names:

```typescript
// Before
interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeStart: number; edgeEnd: number };
  pieceB: { pieceId: string; edgeStart: number; edgeEnd: number };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}

// After
interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeName: string };
  pieceB: { pieceId: string; edgeName: string };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}
```

Edge names are stable because they're derived from geometry heuristics (zone position, angle, curvature) and piece name. When a piece outline changes parametrically (e.g., waist measurement changes), the edge zones stay the same — the armhole is still in the top-curved zone, the hemline is still at the bottom.

**What changes:**
- `types/types.ts`: Update `Seam` interface.
- `seamTools.ts`: `createSeam` tool accepts `edgeAName`/`edgeBName` instead of start/end indices.
- `projectSlice.ts`: `addSeam` takes new shape.
- `useParametricEngine.ts`: Auto-seam logic uses edge names from `findMatchingEdges()`.
- 3D simulation seam assembly: Resolve edge name → segmentRange at simulation time (lookup piece.edges by name).

**Migration for existing seams**: A one-time migration function resolves old `{ edgeStart, edgeEnd }` to the matching semantic edge name by finding which edge's `segmentRange` contains those indices.

## What Stays Unchanged

- Avatar system, cloth simulation, collision bodies — all untouched.
- Construction engine types (CPoint, CCurve, CPiece core fields) — untouched.
- `pieceIdentityMap` — continues to work exactly as before.
- Undo/redo (snapshot-based) — continues to work since it snapshots full state.
- `findMatchingEdges()` — already uses edge names, no change needed.

## File Changes

| Action | File | What |
|--------|------|------|
| Modify | `src/utils/construction/pieceBuilder.ts` | Remove normalization block |
| Modify | `src/utils/semanticEdges.ts` | Accept pieceId, use stableEdgeId() |
| Modify | `src/types/types.ts` | Update Seam interface (edgeName) |
| Modify | `src/types/construction.ts` | Remove normOffset from CPiece |
| Modify | `src/store/constructionSlice.ts` | Remove setConstructionPieceNormOffset |
| Modify | `src/store/projectSlice.ts` | Update seam reducers for new shape |
| Modify | `src/store/reactiveSolverMiddleware.ts` | Stop dispatching normOffset |
| Modify | `src/components/PatternEditor/renderers/ConstructionOverlay.tsx` | Remove normOffset subtraction |
| Modify | `src/copilot/action/tools/definitions/seamTools.ts` | Use edgeName params |
| Modify | `src/hooks/useParametricEngine.ts` | Auto-seam uses edge names |
| Modify | 3D seam assembly (cloth simulation) | Resolve edgeName → segmentRange at sim time |
| Modify | Tests referencing old Seam shape | Update to new interface |

## Success Criteria

1. Construction overlay points align perfectly with pattern outline — no offset drift.
2. SemanticEdge IDs persist across parametric rebuilds (same piece + same edge = same ID).
3. Seams survive outline changes — sliding a measurement slider doesn't detach seams.
4. All existing tests pass after migration.
