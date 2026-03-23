# Runtime Validation at Data Contract Boundaries

**Issue:** #397
**Date:** 2026-03-23
**Status:** Approved

Adds runtime validation for 7 data contract boundaries identified in audit finding #05 (HIGH). Uses auto-repair + warn strategy: fix what can be fixed, remove what's broken, clamp what's out of range, and surface diagnostics.

---

## 1. Architecture

A single pure validation function in `src/utils/projectValidator.ts` called during project load. Returns a repaired project copy + diagnostics array. Additionally, targeted clamping is added to existing reducers for runtime writes.

### Entry Point

```
loadProjectFromJSON(json)
  → JSON.parse
  → deserializeDates
  → validateAndRepairProject(project)  ← NEW
  → dispatch(loadProject(repairedProject))
  → dispatch(setLoadDiagnostics(diagnostics))  ← NEW
```

### File Map

**New files:**
- `src/utils/projectValidator.ts` — pure validation+repair function, ~200 lines
- `src/utils/__tests__/projectValidator.test.ts` — tests for all 7 rules

**Modified files:**
- `src/utils/projectIO.ts` — call `validateAndRepairProject` after deserialization
- `src/store/projectSlice.ts` — add `setLoadDiagnostics` reducer + state field
- `src/store/collisionBodySlice.ts` — clamp friction/offset in `updateCollisionBodyCollision`
- `src/store/simulationSlice.ts` — clamp unclamped sim config values
- `src/store/constructionSlice.ts` — clean orphaned pieceIdentityMap entries on piece removal

---

## 2. Types

```typescript
interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  pieceId?: string;
  seamId?: string;
  field?: string;
}

interface ValidationResult {
  project: OpenCloProject;
  diagnostics: ValidationDiagnostic[];
}
```

Diagnostics stored in `projectSlice` state as `loadDiagnostics: ValidationDiagnostic[]`, cleared on next project load.

---

## 3. Validation Rules

### Rule 1: Outline starts with M

- **Code:** `OUTLINE_NO_M`
- **Severity:** error
- **Check:** `piece.outline.length === 0 || piece.outline[0].type !== 'M'`
- **Repair:** Remove the piece entirely (an outline without M is structurally broken)
- **Diagnostic:** `Piece "${piece.name}" has no M command in outline — removed`

### Rule 2: Outline ends with Z

- **Code:** `OUTLINE_MISSING_Z`
- **Severity:** warning
- **Check:** `piece.outline.length > 0 && piece.outline[outline.length - 1].type !== 'Z'`
- **Repair:** Append `{ type: 'Z', values: [] }` to the outline
- **Diagnostic:** `Piece "${piece.name}" outline missing closing Z — appended`

### Rule 3: Seam edge references valid edge on piece

- **Code:** `SEAM_ORPHANED_EDGE`
- **Severity:** warning
- **Check:** For each seam, verify `pieceA` and `pieceB` exist in pieces array, and that each `edgeName` (if present) can be found in the piece's `edges` array
- **Repair:** Remove the seam
- **Diagnostic:** `Seam "${seam.id}" references missing piece or edge — removed`

Note: Some seams may reference pieces by edge index rather than name. The validator checks that the referenced piece exists. Edge name validation is only applied when the seam stores an explicit `edgeName` field.

### Rule 4: fabricId exists in fabric library

- **Code:** `FABRIC_ID_UNKNOWN`
- **Severity:** warning
- **Check:** For each entry in `pieceFabrics`, verify the fabricId exists in the project's fabric list or the built-in `PHYSICAL_FABRIC_LIBRARY`
- **Repair:** Reset to the default fabric ID (`'cotton-poplin'`)
- **Diagnostic:** `Piece "${pieceId}" references unknown fabric "${fabricId}" — reset to default`

Note: This validates the `pieceFabrics` map from simulation state, which is saved as part of the project. The validator checks against both project-local fabrics and the built-in library.

### Rule 5: POM pieceId references existing piece

- **Code:** `POM_ORPHANED_PIECE`
- **Severity:** warning
- **Check:** For each POM, verify `pointA.pieceId` and `pointB.pieceId` exist in pieces array
- **Repair:** Remove the POM
- **Diagnostic:** `POM "${pom.id}" references missing piece — removed`

### Rule 6: CollisionBody.friction in [0, 1]

- **Code:** `FRICTION_OUT_OF_RANGE`
- **Severity:** warning
- **Check:** `friction < 0 || friction > 1`
- **Repair:** Clamp to `[0, 1]`
- **Diagnostic:** `CollisionBody "${body.id}" friction ${friction} clamped to [0, 1]`

Also check `offset` is in `[0, 0.1]` (meters).

### Rule 7: ClothSimConfig in documented ranges

- **Code:** `SIM_CONFIG_OUT_OF_RANGE`
- **Severity:** warning
- **Check and clamp:**

| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| `substeps` | 1 | 100 | 15 |
| `damping` | 0 | 1 | 0.99 |
| `gravityY` | -100 | 0 | -9.81 |
| `dragCoefficient` | 0 | 5 | 1.0 |
| `stretchComplianceWarp` | 0 | 1 | 0.0 |
| `stretchComplianceWeft` | 0 | 1 | 0.0 |
| `stretchComplianceShear` | 0 | 1 | 0.001 |
| `bendComplianceWarp` | 0 | 100 | 1.0 |
| `bendComplianceWeft` | 0 | 100 | 1.0 |
| `internalDamping` | 0 | 1 | 0.3 |
| `thickness` | 0.0001 | 0.05 | 0.002 |

- **Repair:** Clamp to range
- **Diagnostic:** `Sim config "${param}" value ${value} clamped to [${min}, ${max}]`

### pieceIdentityMap Cleanup

Not a numbered rule (it's a structural consistency check, not a per-entity validation).

- **Check:** For each entry `cPieceId → patternPieceId` in `pieceIdentityMap`, verify both the construction piece and pattern piece still exist
- **Repair:** Remove orphaned entries
- **Diagnostic:** (info severity) `Removed orphaned identity mapping: ${cPieceId} → ${patternPieceId}`

---

## 4. Reducer Clamping

These changes protect against runtime mutations (not just project load).

### collisionBodySlice.ts — `updateCollisionBodyCollision`

```typescript
if (action.payload.collision.friction !== undefined) {
  action.payload.collision.friction = Math.max(0, Math.min(1, action.payload.collision.friction));
}
if (action.payload.collision.offset !== undefined) {
  action.payload.collision.offset = Math.max(0, Math.min(0.1, action.payload.collision.offset));
}
```

### simulationSlice.ts — Add missing clamps

Add clamping for any sim config setters that currently lack bounds. Check each setter — some (particleDistance, dragCoefficient) already clamp. Add clamping for any that don't:

- `substeps` (if exposed as a setter): clamp [1, 100]
- `damping`: clamp [0, 1]
- compliance values: clamp >= 0
- `thickness`: clamp [0.0001, 0.05]

### constructionSlice.ts — Clean orphaned identities on piece removal

In the `removePiece` extra reducer or in the `project/removePiece` matcher, also remove any `pieceIdentityMap` entries that reference the removed piece (either as key or value).

---

## 5. Diagnostics Surfacing

Diagnostics are stored in `projectSlice.loadDiagnostics` and cleared on each new project load. The UI can display them via a toast or notification panel. This design does NOT add UI for diagnostics — it only stores them in Redux for future UI consumption. Console warnings are logged for each diagnostic.

---

## 6. Non-Goals

- **UI for diagnostics** — deferred. Diagnostics are logged to console and stored in Redux.
- **Undo/redo for auto-repairs** — repairs happen before the project enters Redux, so there's nothing to undo.
- **Deep outline geometry validation** — we check M/Z structure, not geometric validity (self-intersection, winding order, etc.).
- **Network/worker boundary validation** — covered by the plugin sandbox (#393) and WASM worker protocol separately.
