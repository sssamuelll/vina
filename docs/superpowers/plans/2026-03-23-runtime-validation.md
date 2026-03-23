# Runtime Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime validation at 7 data contract boundaries — auto-repair + warn on project load, clamp in reducers for runtime writes.

**Architecture:** Pure `validateAndRepairProject()` function called inside `loadProject` reducer. Returns repaired project + diagnostics + quarantine. Reducer clamping added to collisionBodySlice, simulationSlice, constructionSlice.

**Tech Stack:** TypeScript, Redux Toolkit, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-runtime-validation-design.md`

---

## File Map

### New Files
- `src/utils/projectValidator.ts` — pure validation+repair function
- `src/utils/__tests__/projectValidator.test.ts` — tests for all rules

### Modified Files
- `src/store/projectSlice.ts` — call validator in `loadProject`, add `loadDiagnostics` + `loadQuarantine` state
- `src/store/collisionBodySlice.ts` — clamp friction/offset
- `src/store/simulationSlice.ts` — clamp unclamped sim config values
- `src/store/constructionSlice.ts` — clean orphaned pieceIdentityMap on piece removal

---

## Task 1: Create projectValidator with Types and Outline Rules (1-2)

**Files:**
- Create: `src/utils/projectValidator.ts`
- Create: `src/utils/__tests__/projectValidator.test.ts`

- [ ] **Step 1: Write tests for outline validation**

```typescript
import { describe, it, expect } from 'vitest';
import { validateAndRepairProject } from '../projectValidator';
import type { OpenCloProject, PatternPiece } from '../../types/types';

function makeProject(overrides?: Partial<OpenCloProject>): OpenCloProject {
  return {
    id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
    avatar: { id: 'av', modelUrl: '', measurements: {} } as any,
    createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  };
}

function makePiece(id: string, outline?: any[]): PatternPiece {
  return {
    id, name: id, outline: outline ?? [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  } as PatternPiece;
}

describe('projectValidator — outline rules', () => {
  it('passes valid project unchanged', () => {
    const project = makeProject({ pieces: [makePiece('p1')] });
    const result = validateAndRepairProject(project);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.project.pieces).toHaveLength(1);
  });

  it('removes piece with undefined outline', () => {
    const project = makeProject({ pieces: [makePiece('p1', undefined as any)] });
    project.pieces[0].outline = undefined as any;
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(0);
    expect(result.quarantine.pieces).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('OUTLINE_UNDEFINED');
  });

  it('removes piece with empty outline', () => {
    const project = makeProject({ pieces: [makePiece('p1', [])] });
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(0);
    expect(result.quarantine.pieces).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('OUTLINE_NO_M');
  });

  it('removes piece whose outline does not start with M', () => {
    const project = makeProject({ pieces: [makePiece('p1', [
      { type: 'L', values: [100, 0] }, { type: 'Z', values: [] },
    ])] });
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(0);
    expect(result.diagnostics[0].code).toBe('OUTLINE_NO_M');
  });

  it('appends Z when outline is missing closing Z', () => {
    const project = makeProject({ pieces: [makePiece('p1', [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    ])] });
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(1);
    const outline = result.project.pieces[0].outline;
    expect(outline[outline.length - 1].type).toBe('Z');
    expect(result.diagnostics[0].code).toBe('OUTLINE_MISSING_Z');
  });

  it('keeps valid piece and removes invalid in same project', () => {
    const project = makeProject({ pieces: [makePiece('good'), makePiece('bad', [])] });
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(1);
    expect(result.project.pieces[0].id).toBe('good');
  });
});
```

- [ ] **Step 2: Write the projectValidator implementation**

```typescript
import type { OpenCloProject, PatternPiece, Seam, SeamGroup, PointOfMeasure } from '../types/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'OUTLINE_NO_M' | 'OUTLINE_MISSING_Z' | 'OUTLINE_UNDEFINED'
  | 'SEAM_ORPHANED_EDGE' | 'SEAMGROUP_ORPHANED'
  | 'FABRIC_ID_UNKNOWN'
  | 'POM_ORPHANED_PIECE';

export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: ValidationCode;
  message: string;
  pieceId?: string;
  seamId?: string;
  field?: string;
}

export interface Quarantine {
  pieces: PatternPiece[];
  seams: Seam[];
  poms: PointOfMeasure[];
  seamGroups: SeamGroup[];
}

export interface ValidationResult {
  project: OpenCloProject;
  diagnostics: ValidationDiagnostic[];
  quarantine: Quarantine;
}

// ─── Known fabric IDs ───────────────────────────────────────────────────────

let builtinFabricIds: Set<string> | null = null;

function getBuiltinFabricIds(): Set<string> {
  if (!builtinFabricIds) {
    try {
      // Lazy import to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PHYSICAL_FABRIC_LIBRARY } = require('../utils/cloth/physicalFabric');
      builtinFabricIds = new Set(
        (PHYSICAL_FABRIC_LIBRARY as { id: string }[]).map(f => f.id),
      );
    } catch {
      builtinFabricIds = new Set();
    }
  }
  return builtinFabricIds;
}

// ─── Validator ──────────────────────────────────────────────────────────────

export function validateAndRepairProject(project: OpenCloProject): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const quarantine: Quarantine = { pieces: [], seams: [], poms: [], seamGroups: [] };

  // Deep clone to avoid mutating the input
  const repaired: OpenCloProject = JSON.parse(JSON.stringify(project));

  // Guard against undefined arrays (older project files)
  if (!repaired.pieces) repaired.pieces = [];
  if (!repaired.seams) repaired.seams = [];
  if (!repaired.poms) repaired.poms = [];
  if (!(repaired as any).seamGroups) (repaired as any).seamGroups = [];

  // ── Phase 1: Outline validation (may remove pieces) ──────────────────
  const validPieces: PatternPiece[] = [];
  for (const piece of repaired.pieces) {
    if (!piece.outline || !Array.isArray(piece.outline)) {
      diagnostics.push({
        severity: 'error', code: 'OUTLINE_UNDEFINED',
        message: `Piece "${piece.name}" has no outline — removed`,
        pieceId: piece.id,
      });
      quarantine.pieces.push(piece);
      continue;
    }
    if (piece.outline.length === 0 || piece.outline[0].type !== 'M') {
      diagnostics.push({
        severity: 'error', code: 'OUTLINE_NO_M',
        message: `Piece "${piece.name}" outline does not start with M — removed`,
        pieceId: piece.id,
      });
      quarantine.pieces.push(piece);
      continue;
    }
    if (piece.outline[piece.outline.length - 1].type !== 'Z') {
      piece.outline.push({ type: 'Z', values: [] });
      diagnostics.push({
        severity: 'warning', code: 'OUTLINE_MISSING_Z',
        message: `Piece "${piece.name}" outline missing closing Z — appended`,
        pieceId: piece.id,
      });
    }
    validPieces.push(piece);
  }
  repaired.pieces = validPieces;

  // ── Phase 2: Cross-reference validation (against cleaned piece list) ──
  const pieceIds = new Set(repaired.pieces.map(p => p.id));
  const pieceEdgeMap = new Map(
    repaired.pieces.map(p => [p.id, new Set((p.edges ?? []).map(e => e.name))]),
  );

  // Rule 3: Seam validation
  const validSeams: Seam[] = [];
  for (const seam of repaired.seams) {
    const aExists = pieceIds.has(seam.pieceA.pieceId);
    const bExists = pieceIds.has(seam.pieceB.pieceId);
    if (!aExists || !bExists) {
      diagnostics.push({
        severity: 'warning', code: 'SEAM_ORPHANED_EDGE',
        message: `Seam "${seam.id}" references missing piece — removed`,
        seamId: seam.id,
      });
      quarantine.seams.push(seam);
      continue;
    }
    // Check edge names if present
    const aEdges = pieceEdgeMap.get(seam.pieceA.pieceId);
    const bEdges = pieceEdgeMap.get(seam.pieceB.pieceId);
    if (aEdges && aEdges.size > 0 && seam.pieceA.edgeName && !aEdges.has(seam.pieceA.edgeName)) {
      diagnostics.push({
        severity: 'warning', code: 'SEAM_ORPHANED_EDGE',
        message: `Seam "${seam.id}" references edge "${seam.pieceA.edgeName}" not found on piece — removed`,
        seamId: seam.id,
      });
      quarantine.seams.push(seam);
      continue;
    }
    if (bEdges && bEdges.size > 0 && seam.pieceB.edgeName && !bEdges.has(seam.pieceB.edgeName)) {
      diagnostics.push({
        severity: 'warning', code: 'SEAM_ORPHANED_EDGE',
        message: `Seam "${seam.id}" references edge "${seam.pieceB.edgeName}" not found on piece — removed`,
        seamId: seam.id,
      });
      quarantine.seams.push(seam);
      continue;
    }
    validSeams.push(seam);
  }
  repaired.seams = validSeams;

  // Rule 3b: SeamGroup validation
  const seamGroups = ((repaired as any).seamGroups ?? []) as SeamGroup[];
  const validSeamGroups: SeamGroup[] = [];
  for (const sg of seamGroups) {
    const allEdges = [...sg.edgesA, ...sg.edgesB];
    const allValid = allEdges.every(e => pieceIds.has(e.pieceId));
    if (!allValid) {
      diagnostics.push({
        severity: 'warning', code: 'SEAMGROUP_ORPHANED',
        message: `SeamGroup "${sg.id}" references missing piece — removed`,
      });
      quarantine.seamGroups.push(sg);
      continue;
    }
    validSeamGroups.push(sg);
  }
  (repaired as any).seamGroups = validSeamGroups;

  // Rule 4: fabricId validation
  const projectFabricIds = new Set((repaired.fabrics ?? []).map(f => f.id));
  const builtins = getBuiltinFabricIds();
  for (const piece of repaired.pieces) {
    const fid = (piece as any).fabricId as string | undefined;
    if (fid && !projectFabricIds.has(fid) && !builtins.has(fid)) {
      diagnostics.push({
        severity: 'warning', code: 'FABRIC_ID_UNKNOWN',
        message: `Piece "${piece.name}" references unknown fabric "${fid}" — reset to default`,
        pieceId: piece.id,
      });
      delete (piece as any).fabricId;
    }
  }

  // Rule 5: POM validation
  const validPoms: PointOfMeasure[] = [];
  for (const pom of repaired.poms ?? []) {
    if (!pieceIds.has(pom.pointA.pieceId) || !pieceIds.has(pom.pointB.pieceId)) {
      diagnostics.push({
        severity: 'warning', code: 'POM_ORPHANED_PIECE',
        message: `POM "${pom.name}" references missing piece — removed`,
      });
      quarantine.poms.push(pom);
      continue;
    }
    validPoms.push(pom);
  }
  repaired.poms = validPoms;

  // Log diagnostics
  for (const d of diagnostics) {
    if (d.severity === 'error') {
      console.error(`[projectValidator] ${d.message}`);
    } else {
      console.warn(`[projectValidator] ${d.message}`);
    }
  }

  return { project: repaired, diagnostics, quarantine };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/utils/__tests__/projectValidator.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/utils/projectValidator.ts src/utils/__tests__/projectValidator.test.ts
git commit -m "feat(validation): add projectValidator with outline rules 1-2"
```

---

## Task 2: Add Cross-Reference Tests (Seam, SeamGroup, Fabric, POM)

**Files:**
- Modify: `src/utils/__tests__/projectValidator.test.ts`

- [ ] **Step 1: Add seam validation tests**

```typescript
describe('projectValidator — seam rules', () => {
  it('removes seam referencing deleted piece', () => {
    const project = makeProject({
      pieces: [makePiece('p1')],
      seams: [{
        id: 's1', pieceA: { pieceId: 'p1', edgeName: 'e1' },
        pieceB: { pieceId: 'deleted', edgeName: 'e2' },
        type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
      } as any],
    });
    const result = validateAndRepairProject(project);
    expect(result.project.seams).toHaveLength(0);
    expect(result.quarantine.seams).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('SEAM_ORPHANED_EDGE');
  });

  it('keeps seam with valid piece references', () => {
    const project = makeProject({
      pieces: [makePiece('p1'), makePiece('p2')],
      seams: [{
        id: 's1', pieceA: { pieceId: 'p1', edgeName: '' },
        pieceB: { pieceId: 'p2', edgeName: '' },
        type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
      } as any],
    });
    const result = validateAndRepairProject(project);
    expect(result.project.seams).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('removes seam referencing piece removed by outline validation', () => {
    const project = makeProject({
      pieces: [makePiece('good'), makePiece('bad', [])],
      seams: [{
        id: 's1', pieceA: { pieceId: 'good', edgeName: '' },
        pieceB: { pieceId: 'bad', edgeName: '' },
        type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
      } as any],
    });
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toHaveLength(1);
    expect(result.project.seams).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'OUTLINE_NO_M')).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'SEAM_ORPHANED_EDGE')).toBe(true);
  });
});

describe('projectValidator — fabricId rule', () => {
  it('resets unknown fabricId', () => {
    const piece = makePiece('p1');
    (piece as any).fabricId = 'nonexistent-fabric';
    const project = makeProject({ pieces: [piece] });
    const result = validateAndRepairProject(project);
    expect((result.project.pieces[0] as any).fabricId).toBeUndefined();
    expect(result.diagnostics[0].code).toBe('FABRIC_ID_UNKNOWN');
  });

  it('keeps valid fabricId', () => {
    const piece = makePiece('p1');
    (piece as any).fabricId = 'cotton-poplin';
    const project = makeProject({ pieces: [piece] });
    const result = validateAndRepairProject(project);
    expect((result.project.pieces[0] as any).fabricId).toBe('cotton-poplin');
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe('projectValidator — POM rule', () => {
  it('removes POM referencing missing piece', () => {
    const project = makeProject({
      pieces: [makePiece('p1')],
      poms: [{
        id: 'pom1', name: 'Bust', category: 'torso', method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'deleted', localPosition: { x: 100, y: 0 } },
        value: 88, createdAt: Date.now(), updatedAt: Date.now(),
      } as any],
    });
    const result = validateAndRepairProject(project);
    expect(result.project.poms).toHaveLength(0);
    expect(result.quarantine.poms).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('POM_ORPHANED_PIECE');
  });

  it('keeps POM with valid piece references', () => {
    const project = makeProject({
      pieces: [makePiece('p1'), makePiece('p2')],
      poms: [{
        id: 'pom1', name: 'Bust', category: 'torso', method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p2', localPosition: { x: 100, y: 0 } },
        value: 88, createdAt: Date.now(), updatedAt: Date.now(),
      } as any],
    });
    const result = validateAndRepairProject(project);
    expect(result.project.poms).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe('projectValidator — empty/undefined arrays', () => {
  it('handles project with undefined pieces', () => {
    const project = makeProject();
    (project as any).pieces = undefined;
    const result = validateAndRepairProject(project);
    expect(result.project.pieces).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('handles project with undefined seams', () => {
    const project = makeProject();
    (project as any).seams = undefined;
    const result = validateAndRepairProject(project);
    expect(result.project.seams).toEqual([]);
  });

  it('handles project with undefined poms', () => {
    const project = makeProject();
    (project as any).poms = undefined;
    const result = validateAndRepairProject(project);
    expect(result.project.poms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/utils/__tests__/projectValidator.test.ts`
Expected: All tests pass (outline + seam + fabric + POM + edge cases).

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/projectValidator.test.ts
git commit -m "test(validation): add cross-reference tests for seams, fabrics, POMs"
```

---

## Task 3: Integrate Validator into loadProject Reducer

**Files:**
- Modify: `src/store/projectSlice.ts:96-133`

- [ ] **Step 1: Add state fields and import**

At the top of `projectSlice.ts`, add import:
```typescript
import { validateAndRepairProject } from '../utils/projectValidator';
import type { ValidationDiagnostic, Quarantine } from '../utils/projectValidator';
```

Add to `ProjectState` interface (or the `initialState` object):
```typescript
loadDiagnostics: ValidationDiagnostic[];
loadQuarantine: Quarantine;
```

With initial values:
```typescript
loadDiagnostics: [],
loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
```

- [ ] **Step 2: Call validator in loadProject reducer**

In the `loadProject` reducer (line 96), add validation before assignment:

```typescript
loadProject(state, action: PayloadAction<OpenCloProject>) {
  const { project: validated, diagnostics, quarantine } = validateAndRepairProject(action.payload);
  state.loadDiagnostics = diagnostics;
  state.loadQuarantine = quarantine;

  const p = validated;
  state.id = p.id;
  state.name = p.name;
  state.pieces = p.pieces;
  // ... rest of existing code using p instead of action.payload ...
```

- [ ] **Step 3: Add setLoadDiagnostics reducer** (for direct setting if needed)

```typescript
clearLoadDiagnostics(state) {
  state.loadDiagnostics = [];
  state.loadQuarantine = { pieces: [], seams: [], poms: [], seamGroups: [] };
},
```

Export the action.

- [ ] **Step 4: Run TypeScript check and existing tests**

Run: `npx tsc --noEmit`
Run: `npx vitest run src/store/__tests__/projectSlice*.test.ts`
Expected: No errors, all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/projectSlice.ts
git commit -m "feat(validation): integrate validateAndRepairProject into loadProject reducer"
```

---

## Task 4: Reducer Clamping — Collision Body

**Files:**
- Modify: `src/store/collisionBodySlice.ts:44-52`

- [ ] **Step 1: Add clamping to updateCollisionBodyCollision**

Replace the `Object.assign` at line 50 with clamped assignment:

```typescript
updateCollisionBodyCollision(
  state,
  action: PayloadAction<{ id: string; collision: Partial<CollisionBodyCollision> }>
) {
  const body = state.bodies.find((b) => b.id === action.payload.id);
  if (body) {
    const changes = { ...action.payload.collision };
    if (changes.friction !== undefined) {
      changes.friction = Math.max(0, Math.min(1, changes.friction));
    }
    if (changes.offset !== undefined) {
      changes.offset = Math.max(0, Math.min(0.1, changes.offset));
    }
    Object.assign(body.collision, changes);
  }
},
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/store/collisionBodySlice.ts
git commit -m "fix(validation): clamp collision body friction [0,1] and offset [0,0.1]"
```

---

## Task 5: Reducer Clamping — Simulation Config

**Files:**
- Modify: `src/store/simulationSlice.ts`

- [ ] **Step 1: Find and clamp unclamped sim config setters**

Search the file for any setters that accept sim config values without clamping. The slice already clamps `particleDistance` [2,20] and `dragCoefficient` [0,5]. Add clamps to any setters for:

- `damping` — clamp [0, 1]
- `thickness` — clamp [0.0001, 0.05]
- compliance values (stretchComplianceWarp/Weft/Shear, bendComplianceWarp/Weft) — clamp [0, 100]
- `substeps` — clamp [1, 100]

If these values are set via a bulk config object sent to the worker, add a `clampSimConfig` helper:

```typescript
function clampSimConfig(config: Record<string, unknown>): Record<string, unknown> {
  const clamped = { ...config };
  if (typeof clamped.damping === 'number') clamped.damping = Math.max(0, Math.min(1, clamped.damping));
  if (typeof clamped.thickness === 'number') clamped.thickness = Math.max(0.0001, Math.min(0.05, clamped.thickness));
  if (typeof clamped.substeps === 'number') clamped.substeps = Math.max(1, Math.min(100, Math.round(clamped.substeps)));
  // Compliance values
  for (const key of ['stretchComplianceWarp', 'stretchComplianceWeft', 'stretchComplianceShear', 'bendComplianceWarp', 'bendComplianceWeft']) {
    if (typeof clamped[key] === 'number') clamped[key] = Math.max(0, Math.min(100, clamped[key] as number));
  }
  if (typeof clamped.internalDamping === 'number') clamped.internalDamping = Math.max(0, Math.min(1, clamped.internalDamping));
  return clamped;
}
```

Apply this helper wherever sim config values enter the slice.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/store/simulationSlice.ts
git commit -m "fix(validation): clamp sim config values to documented ranges"
```

---

## Task 6: Reducer Cleanup — pieceIdentityMap Orphans

**Files:**
- Modify: `src/store/constructionSlice.ts`

- [ ] **Step 1: Add extraReducer matcher for project/removePiece**

In the `extraReducers` builder (or add one if it doesn't exist), add a matcher:

```typescript
extraReducers: (builder) => {
  builder.addCase(NEW_PROJECT, () => initialState);
  builder.addMatcher(
    (action) => action.type === 'project/removePiece',
    (state, action) => {
      const pieceId = (action as { payload: string }).payload;
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
},
```

If `extraReducers` already exists with `NEW_PROJECT`, just add the matcher after it.

- [ ] **Step 2: Verify TypeScript compiles and existing tests pass**

Run: `npx tsc --noEmit`
Run: `npx vitest run`

- [ ] **Step 3: Commit**

```bash
git add src/store/constructionSlice.ts
git commit -m "fix(validation): clean orphaned pieceIdentityMap entries on piece removal"
```

---

## Task 7: Final Verification

**Files:** All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new validator tests).

- [ ] **Step 3: Verify validator tests specifically**

Run: `npx vitest run src/utils/__tests__/projectValidator.test.ts`
Expected: All outline, seam, fabric, POM, and edge case tests pass.

- [ ] **Step 4: Commit if any cleanup needed**

```bash
git add -A && git commit -m "chore(validation): final cleanup"
```
