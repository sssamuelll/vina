# Runtime Validation at Data Contract Boundaries

**Issue:** #397
**Date:** 2026-03-23
**Status:** Approved

Adds runtime validation for 7 data contract boundaries identified in audit finding #05 (HIGH). Uses auto-repair + warn strategy: fix what can be fixed, remove what's broken, clamp what's out of range, and surface diagnostics.

---

## 1. Architecture

Two validation layers:

1. **Project-load validator** (`validateAndRepairProject`) — a pure function that validates data available in the serialized `OpenCloProject` object (pieces, seams, fabrics, POMs, seamGroups). Called from the `loadProject` reducer itself to cover ALL load paths.

2. **Reducer clamping** — targeted validation in individual reducers for runtime writes (collision body friction, sim config values, pieceIdentityMap orphan cleanup).

### Data Availability

The serialized `OpenCloProject` contains: `pieces`, `seams`, `fabrics`, `avatar`, `groups`, `poms`, `seamGroups`. It does NOT contain: `pieceFabrics` (simulationSlice), `collisionBodies` (collisionBodySlice), sim config, or `pieceIdentityMap` (constructionSlice). Rules are split accordingly:

| Rule | Data source | Validation layer |
|------|------------|-----------------|
| Outline M/Z | `project.pieces` | Project-load validator |
| Seam edge refs | `project.seams` + `project.pieces` | Project-load validator |
| fabricId on pieces | `piece.fabricId` + `project.fabrics` + built-in library | Project-load validator |
| POM piece refs | `project.poms` + `project.pieces` | Project-load validator |
| SeamGroup refs | `project.seamGroups` + `project.pieces` | Project-load validator |
| Collision friction | `collisionBodySlice` | Reducer clamping |
| Sim config ranges | `simulationSlice` | Reducer clamping |
| pieceIdentityMap | `constructionSlice` | Reducer cleanup on piece removal |

### Integration Point — `loadProject` Reducer

Validation runs inside the `loadProject` reducer in `projectSlice.ts`, NOT in `loadProjectFromJSON`. This guarantees ALL load paths are covered:
- `loadProjectFromJSON` → `dispatch(loadProject(...))`
- `FileExplorerView.tsx:338` → `dispatch(loadProject(...))`
- `ProjectView.tsx:483` → `dispatch(loadProject(...))`
- `Workspace.tsx:168` (autosave) → `dispatch(loadProject(...))`
- `actionExecutor.ts:909` → `dispatch(loadProject(...))`

The reducer calls `validateAndRepairProject(payload)` before assigning to state, and stores diagnostics in `state.loadDiagnostics`. Console warnings are logged for each diagnostic.

### File Map

**New files:**
- `src/utils/projectValidator.ts` — pure validation+repair function
- `src/utils/__tests__/projectValidator.test.ts` — tests for all rules

**Modified files:**
- `src/store/projectSlice.ts` — call validator in `loadProject`, add `loadDiagnostics` state
- `src/store/collisionBodySlice.ts` — clamp friction/offset in `updateCollisionBodyCollision`
- `src/store/simulationSlice.ts` — clamp unclamped sim config values
- `src/store/constructionSlice.ts` — clean orphaned pieceIdentityMap entries on piece removal

---

## 2. Types

```typescript
type ValidationCode =
  | 'OUTLINE_NO_M' | 'OUTLINE_MISSING_Z' | 'OUTLINE_UNDEFINED'
  | 'SEAM_ORPHANED_EDGE' | 'SEAMGROUP_ORPHANED'
  | 'FABRIC_ID_UNKNOWN'
  | 'POM_ORPHANED_PIECE'
  | 'IDENTITY_MAP_ORPHANED';

interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: ValidationCode;
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

Diagnostics stored in `projectSlice` state as `loadDiagnostics: ValidationDiagnostic[]`, cleared on each new project load.

---

## 3. Validation Rules (Project-Load)

All rules guard against `undefined` arrays — older project files may lack `poms`, `seamGroups`, or individual piece `outline`/`edges`.

### Rule 1: Outline starts with M

- **Code:** `OUTLINE_NO_M`
- **Severity:** error
- **Check:** `!piece.outline || piece.outline.length === 0 || piece.outline[0].type !== 'M'`
- **Repair:** Remove the piece entirely (an outline without M is structurally broken)
- **Diagnostic:** `Piece "${piece.name}" has no M command in outline — removed`

Handle `piece.outline === undefined` with code `OUTLINE_UNDEFINED` — remove piece.

### Rule 2: Outline ends with Z

- **Code:** `OUTLINE_MISSING_Z`
- **Severity:** warning
- **Check:** `piece.outline.length > 0 && piece.outline[piece.outline.length - 1].type !== 'Z'`
- **Repair:** Append `{ type: 'Z', values: [] }` to the outline
- **Diagnostic:** `Piece "${piece.name}" outline missing closing Z — appended`

### Rule 3: Seam references valid pieces

- **Code:** `SEAM_ORPHANED_EDGE`
- **Severity:** warning
- **Check:** For each seam, verify `pieceA` and `pieceB` IDs exist in the (already-validated) pieces array. If the seam has `edgeName` fields, verify they exist on the respective piece's `edges` array.
- **Repair:** Remove the seam
- **Diagnostic:** `Seam "${seam.id}" references missing piece or edge — removed`

### Rule 3b: SeamGroup references valid pieces

- **Code:** `SEAMGROUP_ORPHANED`
- **Severity:** warning
- **Check:** Same as Rule 3 but for `project.seamGroups`
- **Repair:** Remove the seamGroup
- **Diagnostic:** `SeamGroup references missing piece — removed`

### Rule 4: fabricId exists in fabric library

- **Code:** `FABRIC_ID_UNKNOWN`
- **Severity:** warning
- **Check:** For each piece with a `fabricId` field, verify the ID exists in `project.fabrics` array or the built-in `PHYSICAL_FABRIC_LIBRARY`
- **Repair:** Delete the `fabricId` field (falls back to default assignment)
- **Diagnostic:** `Piece "${piece.name}" references unknown fabric "${fabricId}" — reset to default`

Note: This validates `piece.fabricId` (the per-piece field in the serialized project), NOT `simulationSlice.pieceFabrics` (which is not serialized).

### Rule 5: POM pieceId references existing piece

- **Code:** `POM_ORPHANED_PIECE`
- **Severity:** warning
- **Check:** For each POM in `project.poms`, verify referenced piece IDs exist in pieces array
- **Repair:** Remove the POM
- **Diagnostic:** `POM "${pom.id}" references missing piece — removed`

---

## 4. Reducer Clamping (Runtime Writes)

These protect against in-app mutations from any source (UI, copilot tools, worker results).

### collisionBodySlice.ts — `updateCollisionBodyCollision`

Clamp `friction` to [0, 1] and `offset` to [0, 0.1]:

```typescript
if (changes.friction !== undefined) {
  changes.friction = Math.max(0, Math.min(1, changes.friction));
}
if (changes.offset !== undefined) {
  changes.offset = Math.max(0, Math.min(0.1, changes.offset));
}
```

### simulationSlice.ts — Add missing clamps

Add clamping to existing setters that currently lack bounds. Parameters already clamped (particleDistance, dragCoefficient, steam brush, mesh grab) are unchanged. New clamps:

| Parameter | Setter to add/modify | Range |
|-----------|---------------------|-------|
| damping | Add in sim config update path | [0, 1] |
| thickness | Add in sim config update path | [0.0001, 0.05] |
| compliance values | Clamp >= 0 where set | [0, Infinity) |

If no individual setter exists for a parameter, add the clamp in the `setSimConfig` or equivalent bulk-update reducer that sends config to the worker.

### constructionSlice.ts — Clean orphaned identities on piece removal

Add an `extraReducers` matcher for `project/removePiece` that removes any `pieceIdentityMap` entries where the removed piece ID appears as either key or value:

```typescript
builder.addMatcher(
  (action) => action.type === 'project/removePiece',
  (state, action) => {
    const pieceId = action.payload as string;
    // Clean entries where removed piece is the pattern piece (value side)
    for (const [cId, pId] of Object.entries(state.pieceIdentityMap)) {
      if (pId === pieceId) {
        delete state.pieceIdentityMap[cId];
      }
    }
    // Clean entries where removed piece is the construction piece (key side)
    delete state.pieceIdentityMap[pieceId];
  },
);
```

---

## 5. Diagnostics Surfacing

Diagnostics stored in `projectSlice.loadDiagnostics`, cleared on each new project load. Each diagnostic logged via `console.warn`. No UI added — diagnostics are available in Redux for future UI consumption (toast, notification panel, inspector tab).

---

## 6. Non-Goals

- **UI for diagnostics** — deferred, stored in Redux for future consumption
- **Undo/redo for auto-repairs** — repairs happen inside the `loadProject` reducer before state is committed
- **Deep outline geometry validation** — we check M/Z structure, not geometric validity
- **Network/worker boundary validation** — covered by plugin sandbox (#393) and WASM protocol
- **`pieceFabrics` map validation** — not serialized in project; the `simulationSlice.setFabric` reducer could add a check in a future iteration
- **Collision body / sim config load-time validation** — not serialized in project; protected by reducer clamping only
