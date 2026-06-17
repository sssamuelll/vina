# AXIS-2 — Construction/Parametric Engine: Product Decision (#847)

- **Date:** 2026-06-17
- **Status:** Decided (approved in brainstorm session)
- **Decision owner:** Samuel
- **Resolves:** #847
- **Defers (post-M2):** #243, #53, #163, #176
- **Spins off:** rename hygiene (was #847 part-2), grading-as-feature (approach C)

## TL;DR

OpenClo is **DXF-in for M2**. The only pattern-creation path is import (DXF, or the
~42 pre-converted Seamly patterns). We do **not** build an agent-driven parametric
drafting surface in M2. The parametric engine **stays** — not because we plan drafting,
but because **grading already depends on it in production**. We remove only the genuinely
dead blueprint *execution* shell; the blueprint *persistence* substrate and the
drafting *skills* stay dormant as the head-start for a post-M2 effort.

## Context: what is actually alive vs dead

#847 framed the construction/parametric engine as "orphaned infra without a surface."
A code audit (2026-06-17) refined that: it is **not** uniformly dead. There are three
distinct subsystems with very different status.

### Alive and load-bearing

| Module | Why it's alive | Evidence |
|---|---|---|
| `seamly2d/templateEngine.ts` (`PatternTemplateEngine.generate`) | Grading generates one piece set per size through it | consumed by `GradingTab` / `batchGrader`, `useParametricEngine` |
| `seamly2d/constructionResolver.ts` (~1463 LoC) | Resolves construction steps → points/curves | called by `templateEngine.ts` |
| `seamly2d/formulaEvaluator.ts` | Safe formula evaluation (`evaluateFormula`, `resolveVariables`) | called by resolver, template engine, hook |
| `seamly2d/measurementNameTranslation.ts`, `sizeTables.ts` | Measurement aliasing + size tables | used by formula eval and the parametric hook |
| `construction/resolver.ts` (`resolveConstructionPoints`) | Resolves agent-placed construction points → coords | `constructionTools.ts` (resolveConstruction) |
| `construction/pieceBuilder.ts` (`buildPiece` / `buildPieceWithOffset`) | Builds a `PatternPiece` from construction | `constructionTools.ts`, `reactiveSolverMiddleware.ts`, `pieceBuilderWorker.ts` |
| Construction copilot tools | Live agent editing surface (not from-scratch drafting) | `constructionTools.ts`: addConstructionPoint/Line/Curve, buildPieceFromConstruction, resolveConstruction, setConstructionVariable |
| `parametricSlice` | Holds active Seamly pattern + variable overrides | modified by `reactiveSolverMiddleware` |

Key consequence: **grading is an already-shipped feature for exactly the M2 user**
(an indie who imports a DXF and wants a size run). The engine is justified by grading
regardless of any drafting ambition. It cannot be removed.

### Dormant (written, unwired, harmless to keep)

- The drafting **skills** — `bodice` / `skirt` / `sleeve` / `collar` / `grading` under
  `src/copilot/action/skills/definitions/`. These encode real patternmaking formulas
  (Aldrich / Müller / Gilewska blocks). They are rich, but **inert**:
  `getRelevantSkills()` / `buildSkillContext()` are never called by `AgenticLoop`, so the
  agent never sees them and never executes their formulas to produce geometry.
- The `skillRegistry` (NSID, trigger index, conflict resolution) initializes but has no
  behavioral consumer (consistent with #175's finding: "data primitives without a
  consumer").

These are the **70% head-start** for a future agent-driven drafter (#243): the formulas
exist, and the geometry-execution engine (resolver + formula evaluator + pieceBuilder)
exists. What is missing is the wire between them plus a surface — that is the post-M2 work,
not this one.

### Genuinely dead (the blueprint *execution* shell)

- `construction/blueprintExecutor.ts`: `executeBlueprint`, `validateBlueprint` — no callers.
  In-code comment: "searchBlueprints and executeBlueprint removed — no AI-generated blueprints."
- `blueprintSlice` *stepping*: `startBlueprint` / `nextStep` / `prevStep` / `goToStep` /
  `togglePause` / `stopBlueprint` plus the active-execution state — reducers defined, never
  dispatched, no UI.
- `BUILTIN_BLUEPRINTS` (`construction/blueprints/index.ts`) — empty `[]`, loaded once at boot
  as `loadBlueprints([])`, never populated.

## Decision

1. **Product direction.** DXF import is the canonical (and only) pattern-creation surface for
   M2. No parametric drafting surface, no skills→agent wiring, no blueprint authoring UI in M2.
   The M2 moat is **import → classify → sew → drape**, not pattern generation.

2. **Keep the engine.** All "alive and load-bearing" modules above are retained unchanged.
   Grading is their justification and must keep working.

3. **Remove the dead execution shell (Tier 1).** Delete `executeBlueprint`, `validateBlueprint`,
   the `blueprintSlice` stepping actions + active-execution state, and the `BUILTIN_BLUEPRINTS`
   load. These are dead today and would be redesigned by #53 anyway, so retaining them is pure
   debt.

4. **Keep the blueprint persistence substrate dormant (Tier 2).** `saveUserBlueprint`,
   `listBlueprints`, and the `blueprints[]` CRUD (`loadBlueprints` / `saveBlueprint` /
   `removeBlueprint`) are retained but marked dormant. They are write-only without an executor,
   but they are the persistence substrate that #53 (blueprint authoring) will reuse, and the
   retention cost is near zero. (Decided over a "total cut" alternative.)

5. **Keep the skills dormant, documented.** The drafting skills + registry stay in the tree.
   Each skill-definitions entry (or the registry barrel) gets a header comment declaring the
   dormant state: *not wired to AgenticLoop; latent head-start for #243; post-M2.*

## Issue disposition

- **#847** — close as Decided, pin this document as the resolving comment.
- **#243** (AI Pattern Drafter), **#53** (blueprint authoring), **#163** (plugin marketplace),
  **#176** (skill versioning) — label `roadmap`; note "post-M2, serves the *doesn't-know-
  patternmaking* archetype, not the M2 import-and-simulate user."
- **Rename hygiene** (relocate live modules out of the misleading `src/utils/seamly2d/` into
  `utils/formula/` · `utils/sizing/` · `utils/construction/`) — new standalone issue. The
  folder name lies post-nuke (Seamly is gone) and it misled this very triage, but it is a pure
  refactor with real import churn; not part of #847's closure.
- **Grading-as-feature** (promote the existing size-run capability to an explicit selling point
  for the indie) — new standalone roadmap/product issue.

## Acceptance criteria

- **AC1 — dead shell removed.** `executeBlueprint`, `validateBlueprint`, and the `blueprintSlice`
  stepping actions/state are gone. Gates green: `npx tsc -b --noEmit` && `npm run test` &&
  `npm run lint`.
- **AC2 — engine intact.** Grading still works end-to-end; the `GradingTab` / `batchGrader` tests
  pass — the proof the engine survived the cut.
- **AC3 — dormancy documented.** The drafting skills (and the retained blueprint persistence
  tools) carry a header comment/JSDoc declaring their dormant, not-wired status and pointing to
  the deferring issue (#243 / #53).

## Non-goals

- No new user-facing surface.
- No skills→agent wiring (`getRelevantSkills` / `buildSkillContext` stay unused).
- No folder rename (that is the separate hygiene issue).
- No change to grading behavior.
- No removal of the blueprint persistence substrate (Tier 2 stays dormant).

## Open questions

None. Tier 2 resolved to "keep dormant" in the approving session.
