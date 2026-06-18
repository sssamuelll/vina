# Remove Blueprint Execution Shell (#847 Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead blueprint *execution* shell (executor, slice stepping, BUILTIN load) while keeping the blueprint *persistence* substrate and the parametric engine intact, per `docs/superpowers/specs/2026-06-17-847-axis2-construction-engine-decision.md`.

**Architecture:** Pure deletion + dormancy documentation. No new behavior. The parametric engine (`templateEngine`/`constructionResolver`/`formulaEvaluator`/`resolver`/`pieceBuilder`/`sizeTables`) and the blueprint CRUD (`loadBlueprints`/`saveBlueprint`/`removeBlueprint`, `saveUserBlueprint`/`listBlueprints`) are untouched in behavior. Only the never-dispatched execution machinery is removed. Because this is removal work, each task's "test" is the gate proving nothing downstream broke, not a new failing-test-first cycle.

**Tech Stack:** TypeScript, Redux Toolkit, Vitest.

## Global Constraints

- Typecheck command is `npx tsc -b --noEmit` (build mode), NOT bare `tsc --noEmit` — copied verbatim from CLAUDE.md.
- No `--no-verify`; the Husky pre-commit hook (fast gate: `tsc -b` + lint-staged) must pass on every commit.
- Full manual gate before declaring done: `npx tsc -b --noEmit && npm run test && npm run lint`.
- Do not touch the parametric engine modules or grading — they are load-bearing (AC2).
- Keep the blueprint persistence substrate dormant, not deleted (Tier 2 decision): `saveUserBlueprint`, `listBlueprints`, `loadBlueprints`, `saveBlueprint`, `removeBlueprint`, `blueprints[]` state.

---

## File Map

- **Delete:** `src/utils/construction/blueprintExecutor.ts` (whole file — no external importers)
- **Delete:** `src/utils/construction/blueprints/index.ts` (`BUILTIN_BLUEPRINTS = []`; remove empty `blueprints/` dir if left)
- **Modify:** `src/types/blueprint.ts` — strip stepping fields from `BlueprintLibraryState`
- **Modify:** `src/store/blueprintSlice.ts` — remove stepping reducers/state/extraReducer, keep CRUD, update header
- **Modify:** `src/store/index.ts` — remove `BUILTIN_BLUEPRINTS` import + boot dispatch
- **Modify:** `src/copilot/perception/__tests__/contextBuilder.test.ts` — fix the blueprints state mock to the slimmed shape
- **Modify:** `src/copilot/action/skills/coreSkills.ts` — dormancy header comment (AC3)
- **Modify:** `src/copilot/action/tools/definitions/blueprintTools.ts` — dormancy header comment (AC3)

---

## Task 1: Delete the dead blueprint executor

**Files:**
- Delete: `src/utils/construction/blueprintExecutor.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `executeBlueprint`, `validateBlueprint`, `StepAction`, `ValidationResult` cease to exist. Verified zero external importers (the `StepAction`/`ValidationResult` symbols in `actionValidator.ts`, `skillValidator.ts`, `plugins/`, `projectValidator.ts` are unrelated same-named types). The construction barrel `src/utils/construction/index.ts` re-exports only `resolveConstructionPoints` and `buildPiece`, not the executor.

- [ ] **Step 1: Confirm no importer before deleting**

Run: `grep -rn "blueprintExecutor" src/`
Expected: only the comment line `src/copilot/action/tools/definitions/blueprintTools.ts:4` (a prose mention). If any `import ... from '.../blueprintExecutor'` appears, STOP and reassess.

- [ ] **Step 2: Delete the file**

Run: `git rm src/utils/construction/blueprintExecutor.ts`

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean (exit 0). No "cannot find module" — nothing imported it.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(847): remove dead blueprintExecutor (no callers)"
```

---

## Task 2: Strip stepping state/actions from the blueprint slice

**Files:**
- Modify: `src/types/blueprint.ts:132-143`
- Modify: `src/store/blueprintSlice.ts` (whole file → target below)
- Modify: `src/copilot/perception/__tests__/contextBuilder.test.ts:227-232`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BlueprintLibraryState` is now `{ blueprints: Blueprint[] }`. The slice still exports `loadBlueprints`, `saveBlueprint`, `removeBlueprint` (CRUD, dormant). The stepping actions (`startBlueprint`/`nextStep`/`prevStep`/`goToStep`/`togglePause`/`stopBlueprint`) no longer exist. `removeBlueprint(id)` now only filters the list. Consumers `blueprintTools.ts` (`getState().blueprints.blueprints`) and the store reducer key `blueprints` are unaffected.

- [ ] **Step 1: Confirm the only stepping-state reader is the test mock**

Run: `grep -rn "activeBlueprintId\|activeBlockIndex\|activeStepIndex" src/`
Expected: matches only in `src/store/blueprintSlice.ts`, `src/types/blueprint.ts`, and `src/copilot/perception/__tests__/contextBuilder.test.ts`. If a production file reads these, STOP — it is a live consumer and the decision must be revisited.

- [ ] **Step 2: Slim `BlueprintLibraryState`**

In `src/types/blueprint.ts`, replace the interface (lines 132-143):

```ts
export interface BlueprintLibraryState {
  /** All available user blueprints (dormant — no executor in M2, see #847) */
  blueprints: Blueprint[];
}
```

- [ ] **Step 3: Rewrite the slice to CRUD-only**

Replace the entire contents of `src/store/blueprintSlice.ts` with:

```ts
/**
 * Blueprint Library Redux Slice
 *
 * User blueprint library (CRUD only). DORMANT in M2: blueprints can be saved and
 * listed, but there is no executor — the step-by-step execution model was removed
 * with the blueprint execution shell (#847). Retained as the persistence substrate
 * for blueprint authoring (#53, post-M2).
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Blueprint, BlueprintLibraryState } from '../types/blueprint';

const initialState: BlueprintLibraryState = {
  blueprints: [],
};

const blueprintSlice = createSlice({
  name: 'blueprints',
  initialState,
  reducers: {
    loadBlueprints(state, action: PayloadAction<Blueprint[]>) {
      for (const blueprint of action.payload) {
        const idx = state.blueprints.findIndex(r => r.id === blueprint.id);
        if (idx >= 0) {
          state.blueprints[idx] = blueprint;
        } else {
          state.blueprints.push(blueprint);
        }
      }
    },

    saveBlueprint(state, action: PayloadAction<Blueprint>) {
      const idx = state.blueprints.findIndex(r => r.id === action.payload.id);
      if (idx >= 0) {
        state.blueprints[idx] = action.payload;
      } else {
        state.blueprints.push(action.payload);
      }
    },

    removeBlueprint(state, action: PayloadAction<string>) {
      state.blueprints = state.blueprints.filter(r => r.id !== action.payload);
    },
  },
});

export const {
  loadBlueprints,
  saveBlueprint,
  removeBlueprint,
} = blueprintSlice.actions;

export default blueprintSlice.reducer;
```

Note: this drops the `NEW_PROJECT` import (its only use was resetting stepping state) — gone with the extraReducer.

- [ ] **Step 4: Fix the test mock**

In `src/copilot/perception/__tests__/contextBuilder.test.ts`, replace the blueprints mock block (lines 227-232):

```ts
    blueprints: {
      blueprints: [],
    },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. If an excess-property error fires on another RootState mock, it is another test still carrying the old shape — fix it the same way (keep only `blueprints: []`).

- [ ] **Step 6: Run the affected tests**

Run: `npx vitest run src/copilot/perception/__tests__/contextBuilder.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/blueprint.ts src/store/blueprintSlice.ts src/copilot/perception/__tests__/contextBuilder.test.ts
git commit -m "refactor(847): strip never-dispatched blueprint stepping from slice"
```

---

## Task 3: Remove the BUILTIN_BLUEPRINTS boot load

**Files:**
- Modify: `src/store/index.ts:13,32,83-84`
- Delete: `src/utils/construction/blueprints/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no boot-time `loadBlueprints([])` dispatch. `loadBlueprints` remains exported from the slice (dormant CRUD), just no longer called at boot. The `blueprints` reducer key and initial `{ blueprints: [] }` state are unchanged.

- [ ] **Step 1: Drop the `loadBlueprints` import in store**

In `src/store/index.ts`, change line 13 from:

```ts
import blueprintReducer, { loadBlueprints } from './blueprintSlice';
```
to:
```ts
import blueprintReducer from './blueprintSlice';
```

- [ ] **Step 2: Remove the BUILTIN import**

In `src/store/index.ts`, delete line 32:

```ts
import { BUILTIN_BLUEPRINTS } from '../utils/construction/blueprints';
```

- [ ] **Step 3: Remove the boot dispatch**

In `src/store/index.ts`, delete the comment + dispatch (lines 83-84):

```ts
// Load builtin recipes synchronously — must be available before first copilot turn
store.dispatch(loadBlueprints(BUILTIN_BLUEPRINTS));
```

- [ ] **Step 4: Delete the empty builtin library**

Run: `git rm src/utils/construction/blueprints/index.ts`
Then, if `src/utils/construction/blueprints/` is now empty, remove the directory.
Confirm nothing else imported it: `grep -rn "construction/blueprints" src/` → expected: no matches.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts
git commit -m "refactor(847): drop empty BUILTIN_BLUEPRINTS boot load"
```

---

## Task 4: Document the dormant subsystems (AC3)

**Files:**
- Modify: `src/copilot/action/skills/coreSkills.ts:1-8`
- Modify: `src/copilot/action/tools/definitions/blueprintTools.ts:1-7`

**Interfaces:**
- Consumes: nothing.
- Produces: header comments only. No code change.

- [ ] **Step 1: Annotate the skills barrel**

In `src/copilot/action/skills/coreSkills.ts`, replace the header comment (lines 1-8) with:

```ts
/**
 * Core Skills — bundled skills with NSID identifiers.
 *
 * All skills that ship with OpenClo are defined here with their
 * namespace identifiers for the unified registry.
 *
 * DORMANT (M2, #847): these skills encode real drafting formulas but are NOT
 * wired to the AgenticLoop — `getRelevantSkills()` / `buildSkillContext()` are
 * never called, so the agent never sees or executes them. Retained as the
 * head-start for agent-driven parametric drafting (#243, post-M2). Do not treat
 * as live behavior.
 *
 * @module skills/coreSkills
 */
```

- [ ] **Step 2: Annotate the blueprint tools**

In `src/copilot/action/tools/definitions/blueprintTools.ts`, replace the header comment (lines 1-7) with:

```ts
/**
 * Blueprint Tools — user blueprint management only.
 *
 * searchBlueprints and executeBlueprint removed — no AI-generated blueprints.
 * Real patterns come from the user's imported DXF (file entry is always a
 * user gesture). Users can save their own constructions as blueprints.
 *
 * DORMANT (M2, #847): write-only persistence — there is NO executor for saved
 * blueprints in M2. Retained as the persistence substrate for blueprint
 * authoring (#53, post-M2).
 */
```

- [ ] **Step 3: Lint the two files**

Run: `npx eslint src/copilot/action/skills/coreSkills.ts src/copilot/action/tools/definitions/blueprintTools.ts`
Expected: clean (comment-only change).

- [ ] **Step 4: Commit**

```bash
git add src/copilot/action/skills/coreSkills.ts src/copilot/action/tools/definitions/blueprintTools.ts
git commit -m "docs(847): mark dormant skills + blueprint persistence (AC3)"
```

---

## Task 5: Acceptance verification (AC1 / AC2 / AC3)

**Files:** none (verification only).

- [ ] **Step 1: AC1 — full gate green**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all three pass (exit 0). No references to `executeBlueprint`, `validateBlueprint`, or the stepping actions remain.

- [ ] **Step 2: AC1 — confirm the shell is gone**

Run: `grep -rn "executeBlueprint\|validateBlueprint\|startBlueprint\|nextStep\|stopBlueprint\|BUILTIN_BLUEPRINTS" src/`
Expected: zero matches (the prose mention in `blueprintTools.ts:4` was rewritten in Task 4; `nextStep` in `planExecutor.ts` is the unrelated planner symbol — acceptable, it is not a blueprint action).

- [ ] **Step 3: AC2 — engine survived (grading intact)**

Run: `npx vitest run src/utils/grading/__tests__/batchGrader.test.ts`
Expected: PASS — proves `PatternTemplateEngine` / `constructionResolver` / `formulaEvaluator` are untouched and grading still generates per-size piece sets.

- [ ] **Step 4: AC3 — dormancy documented**

Confirm the two header comments from Task 4 are present:
Run: `grep -rn "DORMANT (M2, #847)" src/copilot/`
Expected: two matches (`coreSkills.ts`, `blueprintTools.ts`).

- [ ] **Step 5: Final confirmation**

All ACs green. No commit needed (Task 5 is a checkpoint). The branch is ready for PR.

---

## Self-Review

- **Spec coverage:** AC1 (dead shell removed + gates) → Tasks 1-3 + 5/Step1-2. AC2 (grading intact) → Task 5/Step 3. AC3 (dormancy documented) → Task 4 + 5/Step 4. Tier-2 "keep dormant" → respected (CRUD + tools untouched except header). Non-goals (no rename, no skills wiring, no grading change) → honored.
- **Placeholder scan:** none — every edit shows the exact resulting code.
- **Type consistency:** `BlueprintLibraryState` slimmed in Task 2/Step 2 is consumed by the slice (Task 2/Step 3) and the test mock (Task 2/Step 4) with the matching `{ blueprints: [] }` shape; `loadBlueprints`/`saveBlueprint`/`removeBlueprint` names are stable across the slice and `store/index.ts`.
