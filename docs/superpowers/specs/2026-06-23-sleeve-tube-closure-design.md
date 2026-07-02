# Sleeve Tube Closure — Design

> **Status:** approved (brainstorming) — 2026-06-23
> **Author:** Samuel + Claude (Opus 4.8)
> **Context:** follow-up to the envelope-wrap (PR #924) + A-pose collision bake + the
> `buildAxisHints` handedness fix (`93985123`). Branch `feat/envelope-wrap`.

## 1. Problem

After the A-pose work + handedness fix, the sleeves **seed on the correct A-pose
arms** (`@gpu-local` replay: `maxAbsX` 0.23 → 0.47 at t=2.5s) — but they **do not
stay**. Over 10s the sleeve fabric collapses off the arm and falls:

| metric | t=2.5s | t=10s |
|---|---|---|
| sleeve verts on arm (`|x|>0.25`) | 993 | **2** |
| garment min Y | 0.56 | **0.00 (floor)** |
| belowHip % | 0.01 | 2.91 |

**Root cause (verified by a 5-reader code investigation, 2026-06-23):** the sleeve
is an **open partial panel** — it is never closed into a tube around the arm, so
the arm is not enclosed, there is no grip, and gravity slides the sleeve off. This
is the sleeve analog of the torso self-support problem the envelope wrap solved for
the trunk (front↔back side seams close the torso loop).

## 2. Goal & success criteria

Close each one-piece sleeve into a **tube around the arm** so it stays on the
A-pose arm, held by two anchors working together: the existing
`sleeveCap↔armhole` seam (anchors the top to the shoulder) **plus** a new
**underarm seam** that closes the tube (the missing piece).

**Success (measured by the `@gpu-local` María replay — maintainer-run):**
- Sleeve verts (`|x|>0.25`) **persist** through 10s — they do not collapse from
  ~993 to ~2.
- No sleeve fabric reaches the floor (garment `minY` not driven to ~0 by sleeves).
- The existing A-pose sleeve-on-arm checkpoint (`sleeveMeanY < 1.476`) still holds.

The 10s drape is documented non-deterministic (#902/#912); the bar is a settled,
on-arm sleeve at the M4 checkpoint **and** persistence of the on-arm vert
population — not a pixel-exact 10s pose.

## 3. Mechanism (what the investigation established)

All claims below are code-verified; file:line anchors included so the plan does not
re-derive them.

**3.1 The solver already closes tubes via a self-seam — same mechanism as the torso.**
A seam is a soft XPBD compliant distance constraint whose `restLength` is shrunk by
`shrinkFactor` (0.97) each substep until the two edges meet
(`seamAssembly.ts:746,766`). `buildSeamConstraints` has **no `pieceA≠pieceB` guard**:
when both halves share a `pieceId`, `findPieceOffsetById` returns the same offset and
the two edges are different `t`-ranges of the one outline → distinct global vertex
indices → valid, non-colliding constraints (`seamAssembly.ts:595,655`). The store
`addSeam` reducer imposes no same-piece check (`projectSlice.ts:689`). The torso is
held closed purely by the front↔back side seams (two pieces); a sleeve self-seam is
**one** seam joining one piece's two free underarm edges.

**3.2 The underarm edges are already detected — and there is a dead hook.**
A one-piece sleeve outline = `sleeveCap` (convex top) + **two** near-vertical
underarm edges named `underarmSeam` / `underarmSeam-2` + `cuffEdge` (bottom). Both
underarm edges carry `matchHint='self-close'` (`semanticEdges.ts:154`, dedup at
`:200`). **Nothing consumes `'self-close'`** (grep finds only the definition) — it
is inert. Today only `sleeveCap↔armhole` is claimed; both underarm edges are
**unclaimed**. `GarmentKnowledge.ts:52` lists the canonical sleeve edge set as
`['sleeveCap','underarmSeam','cuffEdge']` (one logical underarm closure).

**3.3 The only blocker is the auto-sew PROPOSER, not the mechanics.**
Auto-sew is cross-piece by construction: the driver loops `for i { for j=i+1 }`
(`autoSew/index.ts:99-100`) so only distinct-piece candidates are formed, and a
filter explicitly drops same-piece candidates
(`safeCandidates = …filter(c => c.edgeA.pieceId !== c.edgeB.pieceId)`,
`index.ts:181`). So the tube-closing seam is never proposed.

**3.4 The wrap cannot (and should not) close the tube.**
`wrapPanel` is a pure per-vertex geometric map: `φ = w/R` clamped to
`±thetaMaxRad/2`, placed at `R+gap` from the cylinder axis
(`wrapPanel.ts:28-35`); `DEFAULT_WRAP = { thetaMaxRad: 2.618 (=150°), gap: 0.03 }`
(`wrapParams.ts:8`). Raising `thetaMaxRad` toward 2π only **maps** the two width
edges near each other — it does not weld them (no constraint) and overshoot >2π
self-intersects. Closure is the seam's job; the wrap supplies the curved initial
guess that places the edges near each other.

**3.5 The arm already exists as a collision surface.**
The collision mesh is baked from the **full** avatar scene (every `THREE.Mesh`),
pose-matched to A-pose (`applyPose` + `updateMatrixWorld(true)` before extract,
`avatarCollisionMesh.ts:36-41`), so the arms are real collision triangles. A closed
tube has an arm to rest on; **no arm collision needs to be built.** Residual risk:
if the source GLB lacks vertex normals, the centroid fallback in `collisionMesh.ts:85`
can point arm normals inward (pushes cloth into the arm) — a pre-existing risk to
*validate*, not to build for.

## 4. Design

Two coupled pieces.

### 4.1 Self-close seam pass (auto-sew) — generate the underarm seam

Add an **additive** pass to `autoSew/index.ts` that runs **after** the cross-piece
seam generation. It does **not** touch the cross-piece double loop or the
`index.ts:181` same-piece filter (those stay — cross-piece candidates remain
cross-piece).

Per piece, the pass:
1. Collects that piece's edges whose `matchHint === 'self-close'` (the
   `underarmSeam` family).
2. **Standard case = exactly 2** self-close edges → pairs them into one self-seam
   (`pieceA.pieceId === pieceB.pieceId === piece.id`,
   `pieceA.edgeName='underarmSeam'`, `pieceB.edgeName='underarmSeam-2'`).
3. If the count ≠ 2 → **skip and log** (do not guess; irregular outlines are out of
   scope). This keeps the pass safe on non-standard pieces.
4. Seam type `standard` (compliance 0.0001), default strength/tension — identical to
   the other construction seams. Whole edge (no `tStart/tEnd`).

The emitted `ProposedSeam` has the same shape as cross-piece proposals, so
`worldRefine`, the thunk, `buildSeamConstraints` and the GPU/WASM seam packing all
consume it uniformly (3.1).

### 4.2 Orientation (`reversed`)

The two underarm edges traverse the outline loop in **opposite** directions, so a
naive `t=0↔t=0` pairing sews a cap-to-cuff X. The pass sets `reversed` so the
**cap-side endpoint of edge A pairs with the cap-side endpoint of edge B**
(equivalently cuff↔cuff), determined geometrically by the straight-vs-flipped
endpoint-distance test (the same logic the M4 sonda's `crossed` check uses:
flippedSum < straightSum ⇒ reversed). Computed from the 2D outline endpoints
(pose-independent, deterministic).

### 4.3 Per-region wrap coverage — start the sleeve near-closed

Today every wrap call uses the global `DEFAULT_WRAP` (150°). For a one-piece sleeve
150° leaves the two underarm edges ~210° apart around the arm — too far for the seam
to close cleanly. `resolveArrangementWithFrames` is extended to return a **per-piece
`wrapParams`** alongside `{frame, flip}`:

- **Sleeve regions** (`left-sleeve`/`right-sleeve`/`cuff-*`): `thetaMaxRad` derived
  from the actual panel width — `thetaMaxRad = min(MAX_SLEEVE_WRAP, panelWidth / R)`
  where `MAX_SLEEVE_WRAP ≈ 5.76 rad (~330°)` caps below 2π to avoid self-intersection.
  The sleeve thus starts as a near-closed tube; the underarm seam (4.1) pulls the
  small remaining gap shut.
- **All other regions:** `DEFAULT_WRAP` (150°) — unchanged (the partial-torso-panel +
  side-seam design is intentional and seam-validated).

`gap` stays `DEFAULT_WRAP.gap` (0.03) for all regions.

## 5. Integration points

| File | Change |
|---|---|
| `src/utils/autoSew/index.ts` | Add the self-close pass after cross-piece generation (§4.1–4.2). |
| `src/utils/autoSew/worldRefine.ts` | Pass-through guard: same-piece seams bypass the cross-piece re-pairing untouched (keep their `reversed`); cross-piece logic unchanged. |
| `src/utils/cloth/arrangement/arrangementBinding.ts` | `resolveArrangementWithFrames` returns per-piece `wrapParams` in `PlacementWithFrame`; compute sleeve coverage from panel width (§4.3). |
| `src/utils/cloth/arrangement/wrapParams.ts` | Add `MAX_SLEEVE_WRAP` const + a `wrapParamsForRegion(region, frame, panelWidthMeters)` helper. |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Both wrap loops (render + solver) use the per-piece `wrapParams` instead of global `DEFAULT_WRAP` (render==solver preserved — identical call). |
| `src/utils/autoSew/worldRefine.ts` (`edgeWorld`) + `src/utils/__tests__/mariaShirt.m4.test.ts` | Use the per-piece `wrapParams` so the world-refine scoring and the M4 sonda measure the same wrapped pose the solver runs. |
| `src/utils/__tests__/mariaShirt.m4.test.ts` | Expect the underarm self-seam in the seam set; assertions (no crossed, `meanPairDist` bound) extended to it. |

`src/store/projectSlice.ts` (addSeam), `seamAssembly.ts`, and the GPU/WASM seam
packing need **no change** (3.1).

## 6. Validation / testing

1. **Unit (auto-sew):** for María's classified pieces, `autoSew` (+ the self-close
   pass) proposes one underarm self-seam per sleeve — `pieceA.pieceId ===
   pieceB.pieceId`, edges `underarmSeam`/`underarmSeam-2`, `reversed` set so the
   straight endpoint distance < flipped. A non-sleeve piece (no self-close edges)
   yields no self-seam. A piece with ≠2 self-close edges is skipped (logged).
2. **Unit (wrap coverage):** `wrapParamsForRegion` returns ~330°-capped coverage for
   a sleeve panel ≥ arm circumference, and `DEFAULT_WRAP` (150°) for torso/collar.
3. **M4 sonda:** updated expected seam set includes the underarm seam; still zero
   crossed seams; `meanPairDist` within bound (the fuller wrap converges the underarm
   edges — expect a small `meanPairDist` for the self-seam).
4. **`@gpu-local` replay (maintainer-run):** add a t=10s persistence assert — sleeve
   verts (`|x|>0.25`) stay above a floor count (e.g. ≥ ~100, vs the collapse to 2),
   and the sleeve does not drive `minY` to the floor. Keep the existing
   `sleeveMeanY<1.476` checkpoint.
5. **Gates:** `npx tsc -b --noEmit` + full `npm run test` + `npm run lint`.

## 7. Risks & mitigations

- **worldRefine mangling self-seams** → pass-through guard (§5); the self-close pass
  fixes `reversed` itself.
- **Fuller wrap self-intersection (>2π)** → `MAX_SLEEVE_WRAP < 2π`; self-collision
  (GPU always-on per C4 RFC) absorbs residual overlap during closing.
- **Arm collision normals inward** (GLB without vertex normals, `collisionMesh.ts:85`)
  → pre-existing; *validate* in the replay (a tube pushing into the arm = the normal
  issue); a fix is a separate item, not in scope here.
- **Shared corner vertex** between the two underarm `t`-ranges (cap/cuff junction) →
  `matchVertices` skips a self-pair (len 0); the pass uses disjoint full-edge ranges.
- **Two-piece tailored sleeves** (front/back construction) would close via a
  cross-piece seam already handled by the existing pipeline — out of scope; this
  design targets the one-piece sleeve that emits `self-close`.

## 8. Scope / non-goals

**In scope:** generate the one-piece sleeve underarm self-seam (consume the existing
`self-close` hint), fuller per-region sleeve wrap, the integration + validation above.

**Out of scope (YAGNI):**
- Generalizing `self-close` to other roles (darts, center-folds) — only the underarm
  emits it today.
- Touching the A-pose pose or the `buildAxisHints` handedness (already fixed,
  `93985123`).
- The arm-collision-normal robustness fix (separate, pre-existing).
- The torso "huecos" (partial-torso-wrap gaps) — a distinct residual.
- A seam-tool UI affordance for authoring same-piece seams (programmatic path
  suffices for the default flow).

## 9. Contingency

If the fuller wrap + seam still does not hold the sleeve at 10s in the replay
(e.g. the tube slides axially toward the wrist on the angled arm), the next lever is
an **axial anchor** — the `sleeveCap↔armhole` seam already pins the top; if needed,
raise the underarm seam stiffness (lower compliance) or add a light cuff-to-arm
relationship. This is a contingency, not part of the initial build; the replay
measures whether it is needed.
