# Level 1 — Imported-Pattern Editing & Grading: Implementation Scope

- **Date:** 2026-06-18
- **Status:** Scoped (not started)
- **Parent decision:** `docs/superpowers/specs/2026-06-18-imported-dxf-parametric-editing-decision.md`
- **Scope owner:** Samuel
- **Grounded by:** four-area code survey (DXF import / grading engine / piece model / measurements+skills), 2026-06-18

## What Level 1 delivers

On an **imported DXF piece** (flat geometry, no construction), the user (or the agent on the
user's behalf) can:

1. **Tag a point** of the outline to a measurement-anchored **grade rule** — "this point moves
   `deltaX/deltaY` per unit of `waist`" — and generate a graded size run that respects per-point
   growth (not the current naive uniform scale).
2. **Edit geometry directly** — move points, adjust curves, move/retag internal lines (darts,
   notches, seams) — as flat, non-parametric manipulation.
3. **See honest provenance** — the UI distinguishes "graded by per-point rules" from "scaled
   uniformly" and surfaces when an imported file lacks the data to grade well.

Level 1 is **shallow parametricity**: tagged-point movement by measurement + direct edits. It is
**not** construction regeneration. The decision spec's honest-scope discipline is binding here.

## Reuse inventory (already in the tree)

The Level-1 engine and anchoring machinery exist; the work is integration.

| Asset | Path | State | Role in Level 1 |
|---|---|---|---|
| `gradePoints` | `src/utils/grading/gradingEngine.ts:24` | implemented, tested, **no production caller** | the per-point grade engine — wire it live |
| `GradeRule` / `GradedPoint` | `src/utils/grading/types.ts:1-11` | defined, unused in prod | the per-point data model |
| `gradePiece` (uniform) | `src/utils/grading/gradingEngine.ts:139` | **live** (`GradingTab`) | fallback when a piece has no rules |
| `detectCorners` / `computeNotchAnchor` / `resolveNotchAnchor` | `src/utils/notchAnchor.ts:53,126,157` | live (DXF notch back-fill) | tag/resolve a point on a dense imported outline, surviving renumbering |
| `SemanticEdge` + `detectSemanticEdges` | `src/types/types.ts:323`, `src/utils/semanticEdges.ts` | live on imports | precedent + carrier for edge-level tags |
| `gradingSlice` / `GradingTab` | `src/store/gradingSlice.ts`, `src/components/BottomPanel/GradingTab.tsx` | live | host UI + state |
| `BodyMeasurements` / size tables | `src/types/types.ts:513`, `src/utils/seamly2d/sizeTables.ts` | live | the measurements grade rules key off |

**Net:** no new grade engine, no new anchoring math. Level 1 is (a) one data-model field, (b) a
resolve/apply wire, (c) a tagging UI, (d) honest fallback handling.

## Work breakdown

### Step 1 — Data model: anchor grade rules to outline points

Add **optional** fields to `PatternPiece` (and/or `InternalLine`), following the exact precedent of
`edges?` / `darts?` / `notchAnchor?`:

- `gradeRules?: PointGradeRule[]` where a `PointGradeRule` binds a `GradeRule[]` to an outline
  location **by anchor, not by raw index** — reuse the `NotchAnchor` shape (`refPoint` corner +
  `distanceMm` + `cw/ccw`) so a rule survives outline resampling/renumbering. Resolve to a live
  vertex via `resolveNotchAnchor`.
- Optional `semanticTags?` for point/segment role labels if the tagging UX needs names beyond
  grade rules (defer if not needed for grading itself).

Constraints (from CLAUDE.md ratifications):
- **B2-state:** do not change the `project.pieces` collection shape; additive optional fields only.
- **D1-real / D-2:** `outline`/`path` stays the render/export truth; grade rules are *intent*
  metadata, not geometry.
- **IDs:** any new entity IDs via `newId()` (`src/utils/ids.ts`).
- **Persistence:** rules persist with the project through the canonical `storageSet`/`storageGet`
  envelope; bump the project schema version + inline shape comment at the callsite.

### Step 2 — Resolve & apply: wire `gradePoints` into the live path

- In `GradingTab.runGrading` (currently calls `gradePiece`, uniform): when a piece carries
  `gradeRules`, resolve each rule's anchor to a current outline point and call `gradePoints`;
  otherwise fall back to `gradePiece`. Both already return graded `PatternPiece`s the canvas
  renders.
- **Internals — decided (2026-06-18, code review):** the per-point path grades the **outline only**;
  `internals` (darts/notches/grainlines) are **carried unchanged** in v1 (the uniform path scales
  them, but a coherent per-point internal transform needs the deferred displacement-field/blending,
  and a half-measure would misalign notches from their corners). This is documented in
  `gradePieceByRules`'s docstring and locked by a test. **Required before a producer ships:** a
  UI/provenance surface that tells the user internals are not yet graded in per-point mode — until
  then, switching a piece with internals from uniform to per-point silently freezes them (the
  regression the review flagged). Proper internal grading lands with the blending increment.

### Step 3 — Tagging UI (assign rules to points)

- Minimal surface in the grading panel: select an outline point → assign `(measurement, deltaX,
  deltaY)` rows → preview the graded nest. This is the human-facing Level-1 verb.
- Point selection uses `detectCorners` to snap to real corners on dense DXF outlines; off-corner
  points anchor by arc distance.

### Step 4 — Honest fallback & provenance (the semantic-promise guard)

- Detect when an imported piece **cannot** grade well: bare DXF with no `.RUL`, no tagged rules →
  surface "uniform scale only — tag points for per-point grading," never silently pretend.
- Label graded output by method (`per-point` vs `uniform`) in the UI.

### Step 5 (stretch) — Ingest grade data at import

Today the importer **drops** all grading data (`.rul`/`.mrk` explicitly ignored in
`gerberImport.ts`; no AAMA/ASTM grade-point or nested-size reading in `src/utils/dxf/`). As a
stretch, read companion `.RUL` or AAMA embedded grade points → seed `gradeRules` on import, so a
properly-authored industry DXF arrives already gradable. Scope this only after Steps 1-4 land; it
is additive and independently testable.

## Out of scope (hard boundary)

- **Level 2** — agent *proposes* a construction interpretation (geometricClassifier → semanticEdges
  → skills with matching `gradeRules` shape). The backbone exists but wiring it is #243; separate
  spec.
- **Level 3** — automatic construction-tree reconstruction. Never.
- **The construction subsystem** — `constructionTools` / `constructionSlice` / `parametricSlice` /
  `templateEngine` / `constructionResolver` are **not touched** by Level 1. Confirmed orthogonal.
- **Native-regeneration semantics** — no "change a measurement, the dart re-derives" on imports.

## Hazards to resolve during implementation

- **Unit inconsistency.** `BodyMeasurements` comments say cm; `sizeTables.ts` says "all
  measurements in mm" (chest 920); skills assume cm. Grade-rule deltas must pin a unit and convert
  at one boundary, or grading will be silently wrong by 10×. Resolve before Step 2.
- **Anchor stability under heavy resampling.** DXF outlines can be 200+ vertices; verify
  `detectCorners` + arc-anchor round-trips a tagged point after a uniform grade transform (it
  already back-fills on import; confirm under edit/grade mutation).
- **Internal-line grading semantics.** Decide and document whether tagged internals grade by their
  own rules or follow the nearest outline anchor (Step 2).

## Acceptance criteria

- **AC1 — per-point grading live.** A tagged imported piece grades via `gradePoints` (not uniform
  scale), producing a per-size nest where tagged points move by their rules. Gates green:
  `npx tsc -b --noEmit && npm run test && npm run lint`.
- **AC2 — model additive & ratified.** `gradeRules?` is optional on `PatternPiece`; `project.pieces`
  shape unchanged (B2-state); `outline` remains render truth (D1-real); rules persist through the
  versioned IDB envelope with inline shape comment.
- **AC3 — honest fallback.** An untagged / bare-DXF piece still grades (uniform) and the UI labels
  it as uniform, surfacing the path to per-point grading — no silent pretense of regeneration.
- **AC4 — boundary intact.** No edits to `constructionTools` / `constructionSlice` /
  `parametricSlice` / `templateEngine`; no Level-2/3 capability introduced.
