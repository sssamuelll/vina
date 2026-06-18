# Imported-DXF Parametric Editing — Product Decision & Scope Boundary

- **Date:** 2026-06-18
- **Status:** Decided
- **Decision owner:** Samuel
- **Parent:** #847 (AXIS-2 construction-engine decision) — this extends, does not amend, the closed #847
- **Relates to:** #243 (AI Pattern Drafter — the Level-2 destination), #915 (grading-as-feature)
- **Verified by:** dual pass — ontological critique (Voronov) + empirical CAD survey (6 sources: CLO3D / Browzwear / Optitex / Gerber-Lectra / Valentina-Seamly2D + academic SOTA), adversarially refuted, all sources `webAccessOk`

## TL;DR

OpenClo will let a patternmaker **edit and grade an imported DXF "parametrically."** The phrase
is load-bearing and must be scoped honestly: an imported DXF is **flat geometry with no
construction history** (confirmed in code — `dxfToPatternPieces` produces `outline:
PathCommand[]` + `internals`, no derivation tree). What we can deliver on that geometry is
**shallow parametricity** — measurement/grade-driven movement of human-tagged points, plus
direct geometric editing — **not** native construction-tree regeneration where changing a
measurement re-derives a dart or style line. That regeneration requires construction history
the flat file does not carry and that **cannot be recovered automatically** (this is
research-grade and ships nowhere — see §Evidence).

We therefore partition the work into three levels and commit to a hard boundary:

- **Level 1 — edit/grade the noun. SHIP (this is M2).** Point-tagged grade rules + direct
  flat-geometry editing on imported pieces. Industry-standard; every surveyed CAD does it.
- **Level 2 — agent proposes a verb, human ratifies. THE BET (= #243, constrained).** The agent
  proposes a construction interpretation of imported geometry ("this looks like a dart; this
  notch pairs with that seam; these points share a grade rule") and the human confirms/corrects.
- **Level 3 — recover the verb automatically. NEVER PROMISED.** Full reconstruction of the
  construction tree from flat geometry alone. Ill-posed, research-grade, unshipped anywhere.

## Context: how we got here

#847 closed the construction-engine question (keep the engine — grading depends on it; remove
the dead blueprint shell; keep skills dormant as the #243 head-start). It deferred the
*forward* product question and flagged one unresolved risk: the target user is "asserted, not
evidenced."

Samuel then stated the product identity: **a patternmaking tool where the patternmaker makes
their patterns with an AI agent — take the best of CLO3D, add the AI integration, and propose
the improvements ourselves.** Pressed on sequencing, he chose to start from the **already-made
DXF** ("a flow we can finish first") and expand to editing that DXF, then creating from scratch,
with the agent wired through all of it. Pressed again on what "edit the imported DXF" means, he
chose **(A) edit it parametrically** — the harder of the two readings.

Choice (A) lands exactly on the seam between "geometry that *is*" (the imported noun) and
"geometry that *is because*" (the parametric verb the vision wants). We verified whether (A) is
tractable along two independent axes before committing.

## Evidence (why the three-level partition is the honest model)

### Ontological (Voronov)

Effort is continuous from Level 0→3; **kind is binary.** A derivation is not a quantity a pattern
has more or less of — it is a possession: the pattern holds it or it does not. A DXF holds none.
So every level above zero must first answer *where the derivation comes from*, and there are
exactly two answers, not a gradient: it was **read** from the geometry (it was latent there) or it
was **authored** onto it (it was never there; someone supplied it).

- **Level 1 reads.** Grading re-resolves a derivation the system already holds (size over existing
  axes). On a DXF — which holds none — Level 1 is an isolated, human-anchored metric transform. The
  question "*why* is this point here?" has no referent; it does not get deferred, it becomes
  unaskable. That is the honest ceiling of Level 1.
- **Levels 2 and 3 write.** The "verb" comes from the **skill library** (Aldrich / Müller /
  Gilewska blocks), not from the file; the geometry merely *ranks* candidate constructions. Level 2
  is Level 3's authoring machinery pointed at a smaller question, with a human at the output
  pressing *confirm*. "Assisted" describes the UX of the veto, not a reduction in the difficulty of
  the proposal. **Level 2 is #243, constrained by imported geometry — not a beachhead around #243.**

The boundary that governs everything falls **between Level 1 and Level 2** — between re-resolving a
held derivation and authoring one the system was never given.

### Empirical (6-source CAD survey, adversarially verified)

The claim "Level 1-2 is industry-standard / Level 3 is research-grade" survived an adversarial
refutation pass (`spectrumHolds: holds`, `level1_2_isIndustryStandard: true`,
`level3_isResearchGrade: true`):

- **Level 1 ships everywhere.** CLO3D grades imported DXF via per-point grade rules — a companion
  `.RUL` file applied on import, or manual rule creation ("Assign To New Rule") — geometry-only, no
  construction history needed. Optitex, Gerber AccuMark, Browzwear all do point/grade-rule tagging
  on imported flats.
- **Level 3 ships nowhere.** Every tool's true parametric construction tree (CLO Pattern
  Drafter/POM, Seamly2D/Valentina formula graphs) exists **only** for natively-drafted patterns and
  is never reconstructed from an import. Automatic inference from flat geometry is documented as
  unreliable and human-corrected: Optitex's own docs call it *"not always possible; sometimes
  incorrect"*; Grafis states *"a completely automatic import is not possible"*; AccuMark does
  essentially zero inference (corners default to rule #1).
- **The agent bridge is a real but narrow differentiator — in interaction model, not capability
  class.** Nobody does reliable auto-reconstruction. What incumbents leave **manual and silent** is
  the human-in-the-loop interpretation step. An agent that *proposes* a confirmable, revisable
  interpretation productizes exactly that gap. Frame it as **"agent proposes, human ratifies,"**
  never **"agent reconstructs / understands your pattern."**

**The two axes converged.** Voronov's "the agent supplies the verb from the skill library; geometry
ranks; honest moat = the library's closure" is the same finding as the market's "inference is
ill-posed, never authoritative; agent proposes, human ratifies; differentiator is the interaction
model." Independent methods, one conclusion → the partition is robust.

## Decision

1. **Build Level 1 as the M2 deliverable.** Per-point grade rules + direct flat-geometry editing
   on imported pieces, plus measurement-driven adjustment reusing the existing grading slice. This
   gives the indie real value (grade / fit / adjust an imported pattern, then simulate) and is the
   "completable first flow." Implementation scope: see the companion plan,
   `docs/superpowers/plans/2026-06-18-level1-imported-pattern-editing-scope.md`.

2. **Frame Level 2 as the bet, not a beachhead around #243.** Choosing (A) in full means waking
   #243's authoring engine (`resolver` + `formulaEvaluator` + `pieceBuilder` + the dormant skills),
   pointed at imported geometry as a constraint, with the agent proposing and the human ratifying.
   This reopens the M2/post-M2 boundary #847 drew — deliberately, and only when Level 1 ships.
   Level 2 is **not** in the companion plan; it gets its own spec when scoped.

3. **Never promise Level 3.** No automatic reconstruction of the construction tree from flat
   geometry. It is ill-posed and ships nowhere.

4. **Scope the moat to the skill library's closure.** The honest moat is "make *block-derivable*
   patterns parametric (with the agent proposing the block)," not "make *any* flat pattern
   parametric." The product must degrade honestly outside that closure, not silently.

## Honest-scope discipline (the #1 risk: semantic promise)

"Edit imported DXF parametrically" invites the user to expect native construction-tree
regeneration (change a measurement → the dart/style-line re-derives). Imported flats **cannot do
this.** Mis-set, that expectation reads as a broken promise. Therefore, binding on product, copy,
and code:

- **Say "grade and adjust," "shape," "re-tag" — not "the pattern regenerates."** Level 1 moves
  tagged points by measurement and edits geometry directly; it does not replay a construction.
- **Level 2 copy is "the agent proposes an interpretation you confirm" — never "the agent
  understands / reconstructs your pattern."** The proposal is probabilistic over flat geometry, with
  the ill-posedness the inference literature documents.
- **Two mechanisms must stay distinct in code, not merged into one "parametric" surface:**
  (a) *fit/grade* = per-point grade rules (genuine shallow parametricity), and (b) *style-line /
  dart / walk-seam edits* = direct, non-parametric geometry manipulation. Conflating them creates a
  user mental model — and brittle code — that implies regeneration where there is none.

## Codebase reality (the work is mostly wiring, not new engines)

The four-area code survey (2026-06-18) found the Level-1 substrate already present:

- **The per-point grade engine already existed dormant** (this decision wires it live).
  `gradePoints` + `GradeRule{measurement,deltaX,deltaY}` + `GradedPoint`
  (`src/utils/grading/gradingEngine.ts`, `src/utils/grading/types.ts`) implement the CLO3D
  per-point model — tested and exported but, at the time of this decision, with **zero production
  callers**; the live UI path (`GradingTab` → `gradePiece`) was naive uniform scaling. The Level-1
  build (2026-06-18) adds `gradePieceByRules` + a `gradePieceToSize` dispatcher and routes
  `GradingTab` through it — that dormant engine's first live caller.
- **Point-tagging on dense imported outlines already works.** `notchAnchor.ts` (`detectCorners`,
  `computeNotchAnchor`, `resolveNotchAnchor`) anchors a point to "N mm of arc from a detected
  corner" and already back-fills anchors on DXF import — exactly the "tag a point on an imported
  outline" machinery, surviving index renumbering.
- **A semantic-tag layer over imported geometry already has precedent.** `SemanticEdge`
  (`segmentRange` over the outline) is materialized on imported pieces by `detectSemanticEdges`;
  `Dart` / `GrainLine` / `notchAnchor` are the ratified "rich view bridged to flat geometry" pattern
  (D1-real / D-2: *path manda*). New optional fields on `PatternPiece` / `InternalLine` are the
  sanctioned extension point.
- **The construction graph never ingests imported geometry — confirmed.** `constructionTools` /
  `constructionSlice` reference only graph points by label and fail if absent; the flow is
  one-directional (construction → `PatternPiece`). This *is* the noun/verb seam, in code.
- **The Level-2 backbone exists.** `outlineAnalysis` (trams by curvature) → `geometricClassifier`
  (piece type + confidence + reasons) → `semanticEdges` (named roles on imported DXF) already maps
  flat geometry to roles. The dormant skills carry `gradeRules{point,measurement,deltaX,deltaY}` —
  the **same shape** as the grading engine's `GradeRule` — so a skill can *seed* a grade-rule
  proposal. That is the Level-2 wire, latent and waiting.

## Non-goals

- No automatic construction reconstruction from imported geometry (Level 3).
- No skills→agent wiring in this decision (that is Level 2 / #243, scoped separately).
- No change to the construction-graph subsystem or `parametricSlice` (untouched by Level 1).
- No native-regeneration promise in product, copy, or type names.

## Open question (carried forward, sharpened)

The #847 validation risk is **not closed** — it is re-aimed. The question is no longer "does the
indie-with-a-DXF exist?" but: **does a professional patternmaker want a confirmable interpretation
layer (Level 2), or do they prefer the silent manual re-tagging the incumbents ship?** That is now
testable technically (run the agent's proposals against real DXFs and measure correction rate)
rather than only by market traction. To be validated before committing hard to Level 2 / #243.
