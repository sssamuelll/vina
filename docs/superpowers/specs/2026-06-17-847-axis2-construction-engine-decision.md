# AXIS-2 — Construction/Parametric Engine: Product Decision (#847)

- **Date:** 2026-06-17
- **Status:** Decided (approved in brainstorm session)
- **Decision owner:** Samuel
- **Resolves:** #847
- **Defers (post-M2):** #243, #53, #163, #176
- **Spins off:** rename hygiene (was #847 part-2), grading-as-feature (approach C)

## TL;DR

OpenClo is **DXF-in for M2**. The only live pattern-creation path is DXF import — the
Seamly pattern route (`loadSeamlyPattern` + its ~42 converted JSONs) was deleted by the
nuke (#841/#842) and no longer exists, verified. We do **not** build an agent-driven parametric
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

4. **Keep the blueprint substrate dormant (Tier 2) — and make the dormancy real.**
   `saveUserBlueprint` / `listBlueprints` and the `blueprints[]` CRUD (`loadBlueprints` /
   `saveBlueprint` / `removeBlueprint`) are retained as source for #53, but **un-registered from
   the live tool set** (removed from `registry.ts` `ALL_TOOL_MODULES`) so the agent cannot reach
   them — otherwise the "dormant" label is a lie (the tools were agent-callable). Note: this
   substrate is in-memory only (no IDB/LS); it never persisted, so "persistence substrate" was a
   misnomer — it is a schema/source substrate. (Decided over a "total cut" alternative;
   un-register correction added post roster-review — see Post-review correction.)

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
- **AC3 — dormancy real + documented.** The drafting skills carry a header comment declaring
  their dormant, not-wired status (#243). The blueprint tools are un-registered from the live
  tool set (agent-unreachable) and their header documents the dormant, non-persistent status
  (#53).

## Non-goals

- No new user-facing surface.
- No skills→agent wiring (`getRelevantSkills` / `buildSkillContext` stay unused).
- No folder rename (that is the separate hygiene issue).
- No change to grading behavior.
- No deletion of the blueprint substrate files (Tier 2 stays as dormant source; tools
  un-registered, not deleted).

## Open questions

None. Tier 2 resolved to "keep dormant"; a post-implementation roster review corrected the
dormancy from *labeled* to *real* by un-registering the tools (see below).

## Post-review correction (roster review, 2026-06-17)

A full-roster review of the branch surfaced one verified theme (Axiom-0: *"a subsystem's state
is declared by its wiring, not its comment"*) — three labels diverged from the wiring. All three
fixed on this branch before merge:

1. **Dormancy made real, not just labeled.** `saveUserBlueprint` / `listBlueprints` were still in
   `registry.ts` `ALL_TOOL_MODULES` — agent-reachable, so "DORMANT" was false. Un-registered them
   (the agent can no longer create un-executable blueprints). Source files retained for #53.
2. **"Persistence substrate" was a misnomer.** `blueprints[]` is in-memory Redux only (no IDB/LS);
   a saved blueprint dies on reload. Corrected the `SLICES_THAT_SURVIVE` reason and the tool/type
   headers to state in-memory/non-persistent honestly.
3. **Tombstones removed.** `templateEngine.ts` error text and `types/blueprint.ts` header still
   referenced the deleted executor / `searchBlueprints`. Rewritten to match the post-cut reality.

Refuted by the adversarial pass (not acted on): "AC3 violated" (spec §5 permits the barrel),
"skillRegistry has no consumer" (a marketplace UI reads it), "no migration for saved blueprints"
(nothing ever persisted).

A fourth label error turned out to be a flat factual error, so it was **corrected**, not
deferred: the TL;DR claimed a second import route ("~42 pre-converted Seamly patterns"), but
`loadSeamlyPattern` / `listSeamlyPatterns` survive only as a negation assertion in
`protocol.test.ts:108`, `seamlyTools.ts` no longer exists, and `tools/seamly2d-converter/output/`
is empty — the nuke (#841/#842) deleted the whole route. TL;DR corrected to DXF-only.

## Pending validation

One observation is not code-verifiable and is **not resolved** by this branch — it gates the
soundness of the M2 product bet, not the cut:

- **The "indie without CLO3D, brings their own DXF, wants to simulate" target user is asserted,
  not evidenced.** The DXF-in moat rests on this archetype, but there is no user research or
  telemetry behind it. Validate with real prospective users before M2 commits hard to
  import-only — if the actual wedge is "designs from measurements" (the #243/#53 archetype), the
  moat is mis-aimed. This is the one open question the brainstorm's "discover" answer deferred.
