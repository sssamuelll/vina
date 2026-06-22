# Envelope Wrap — drape held by closed geometry instead of pins

**Date:** 2026-06-22
**Status:** Design v2 (revised after adversarial council review; pending user review → implementation plan)
**Related:** #887 (arrangement points; this is **Phase 4** of `2026-06-21-arrangement-points-3d-design.md`, promoted), #921 Eje C (structural shoulder pin — this design **attempts to supersede it, pending GPU verification**; the pin stays as a measured fallback), #902 (friction creep: "carga el peso por estructura, no por fricción"), #922 A1 (GPU contact determinism — **prerequisite**, see §8), M2 (engine conserved for grading)

> **Framing (read first — corrects v1).** This design does **not eliminate** the anti-descent constraint that keeps the garment up. It **relocates** it: from a boundary condition the solver *cannot* violate (a pin: `invMass=0`) to an **emergent** condition the solver *can* violate (closed geometry: a collar ring caught on the shoulders + sleeve tubes wrapping the arms, sustained over a non-deterministic 10s GPU horizon). That relocation is how a real shirt works — it hangs from structure, not from a nail — but in *this* solver it is a **bet to be measured, not a guarantee**. "Pinless" is therefore a **result we test for**, not a premise. If the bet fails, the escalation ladder (§9) returns to the full tube (approach A) or to the pin — both kept available on purpose.

## 1. Problem

A shirt stays on a body because its **closed geometry** carries the weight: the neckline is a closed ring narrower than the shoulders (it catches on them); the sleeves are tubes that wrap the arms (circumferential contact holds them). Today the garment has neither — Arrangement Phase 1 places each piece as a **flat plane tangent to the body** (its own honest boundary: *"a rigid transform cannot wrap"*). With no closed structure, the garment can only be held by friction or an artificial pin.

Measured on the GPU María replay (2026-06-22):

| Configuration | belowHip @10s | minY @10s | Sleeves | Pins |
|---|---|---|---|---|
| No pin (Phase 1 only) | **47.67%** | 0.0 | fall | none — "Venom-suit" pour |
| Shoulder pin (#921 Eje C) | 0.35% | 0.0 (sleeve falls) | fall, bare arms | yes (band-aid) |
| Shoulder + sleeveCap pin | 0.01% | 0.0–0.82 (erratic) | bunch/crumple at shoulder, not on arm | yes (band-aid) |

The pin resolves the torso but never puts the sleeves **on the arm** (a pinned flat panel crumples; it does not wrap). Friction cannot substitute: μ=0.4 holds only slopes < arctan(0.4) ≈ 22°, and the torso exceeds that (#902). **The root cause is the flat placement, not the solver.**

## 2. Goals / Non-goals

**Goals**
- María's shirt starts **wrapped** on the body (torso curved, sleeves as near-tubes on the arms, collar as a near-closed ring) with **no gross interpenetration at t=0** (operationalized in §8).
- The garment **stays on for 10s of sim with the pin disabled**, held by its closed geometry — measured, with numeric pass/fail (§8).
- **`minY` (sleeves) is the primary metric** — that is where the pin fails and where this design must add value. `belowHip` (torso) is secondary.

**Non-goals (this design)**
- User adjustment UX (drag/orient/snap) — Phase 2 of the arrangement-points spec, unchanged.
- Generality to arbitrary garments — validate the bet on María first.
- A-pose collision bake — drape in T-pose for this beachhead; the A-pose bake bug is an explicit follow-up. **The self-support CLAIM is scoped to T-pose; A-pose is unproven (§7).**
- Removing the pin code — it stays **merged-and-disabled** (not on a side branch that rots), as the §9 fallback.

## 3. Approach — partial curve, with the full tube as the real fallback

- **A — full geometric tube at t=0:** map the panel into a (near) closed tube. Most placement geometry; **strongest physics** (a closed tube has hoop integrity from frame 1, no closing-window race).
- **B — wrap by simulation:** place flat-and-close, let seams pull the tube closed. **Rejected — this is what fails today**: the garment falls before the seams close.
- **C — partial curve + seams close (chosen as the optimization):** curve each panel to a capped wrap angle so it **starts mostly wrapped**, and let the existing seams close the remainder. Less geometry than A.

**Decision: C as an optimization of A, with A as the designed fallback.** C bets that a partial wrap survives the closing window (§9, HIGH risk). At θ_max = 150° the residual gap is **~42% of the circumference open** (150/360), not "~30%" — non-trivial. The escalation ladder raises θ_max toward 360°, degrading C continuously into A; **A is the real fallback design, not a contingency afterthought.**

## 4. Architecture — where the wrap actually lives (BLOCKER fix from v1)

v1 wrongly claimed the wrap rides the existing pipeline "untouched." It cannot: `PlacementResult` is a **rigid** `{position:[3], rotation:[3]}` per piece (`garmentPlacement.ts:34-37`); the mesh is baked **flat** (`cdtMesher.ts:465`, `y = const`); both render and solver paths apply that one rigid transform to **every** vertex (`GarmentSimulation.tsx:257-271, :319-330`). **Per-vertex curvature cannot be expressed by a rigid transform.**

**Decision: the wrap materializes curved vertices in the mesher.** Pieces are *born curved*.

| Unit | Responsibility | Status |
|---|---|---|
| `wrapPanel(local2D, frame, params)` → `V3` | **NEW, pure.** Map a panel-local 2D point to a curved 3D point over the region's cylinder. | new, `cloth/arrangement/wrapPanel.ts` |
| `cdtMesher.convertToClothMeshData` | Apply `wrapPanel` when emitting vertices, so cloth meshes are born curved (`y ≠ const`). The curve is baked into the **rest positions**. | **MODIFIED** |
| `surfaceFrame` | Return a **non-degenerate** frame per region: a distinct ring-axis vs tangent for collar/torso (today `axis==tangent==[0,1,0]`, §5). | **MODIFIED** (was "Unchanged") |
| `placeGarmentPieces` / `PlacementResult` | Still emits the rigid per-piece `{position, rotation}` for gross placement; the per-vertex curve is now in the mesh, so the rigid transform composes on top. | reused |
| seam matching (`worldRefine`, `autoSew`) | **Must be reconciled:** these compute seam partners on **flat** edges. State explicitly whether they run before the curve (on flat geometry) or need the curved positions. | **audit required** |

This is the structural change v1 missed: the wrap is a **mesh-generation** change, not a placement transform. `resolveArrangement` and the rigid placement stay; the curvature is in the rest mesh.

## 5. The wrap mechanism

`wrapPanel` bends panel-local 2D coordinates over the region cylinder. Two axes per panel: `u` (along the cylinder axis) stays straight; `w` (circumference) bends into an arc.

**Frame fix (BLOCKER):** `surfaceFrame` must give each region a **ring axis distinct from the band tangent**:
- **Collar/torso:** the ring axis is **vertical** (the neck/torso loop axis); `w` wraps **horizontally** around it; `u` is the small vertical band height. (Today both are `[0,1,0]` — degenerate; must change.)
- **Sleeve:** ring axis is the **arm axis**; `w` wraps around it; `u` runs down the arm.

**Radius — two distinct roles, separated (HIGH fix):**
- `R_curve = frame.radius` — the radius the panel curves at (controls circumferential tightness / contact).
- **Standoff** — after curving at `R_curve`, translate the whole curved panel outward by `GAP` along its local normal field. (v1 used one `R = radius + GAP`, which curves *looser* and leaves a circumferential gap that defeats contact.)

**Arc map:** `φ = clamp((w − w_center) / R_curve, −θ_max/2, +θ_max/2)`, `θ_max` stored in **radians** (≈ 2.618 rad = 150°; v1's "150" fed raw was 75 rad = no clamp — MEDIUM fix). `pos = frame.point + axis·u + R_curve·(cosφ·normal + sinφ·binormal)`, `binormal = normalize(cross(axis, normal))`, then `+ GAP·normal_local`.

**Radii from anatomy, not constants (BLOCKER fix):** `neckR`, `armR` must come from measured anatomy (neck/bicep circumference) or be sampled from the **baked collision mesh** at the landmark — not `chestRadius*0.4` / `0.05`. A pre-sim checkpoint asserts `R_curve ≥ baked-mesh-radius + thickness` at each landmark (so the tube neither hangs loose nor interpenetrates).

**Arc length / pre-strain (HIGH):** bending `w` into an arc at fixed radius must **preserve arc length** so rest-lengths (computed from placed vertices) do not bake pre-strain that relaxes and **opens the ring** on frame 1. State explicitly that `wrapPanel` is arc-length-preserving.

**Chord sag (MEDIUM):** the "outside the cylinder" guarantee holds at vertices but flat triangles chord across the arc and dip inward at 150°. Couple `maxEdgeLength` (mesh resolution) to `θ_max` so the triangulated surface — not just vertices — stays outside `R_curve`.

## 6. Auto-support — what holds it (and the honest caveat)

Once the seams close, the closed geometry carries the weight, with the pin disabled:

- **Collar ring** narrower than the shoulders → a near-inextensible ring (default `stretchCompliance = 0.0` = stiff) cannot slide down past the wider shoulders → catches and bears the torso. **Caveat (HIGH):** this is proven only on the parametric *cylinder*; the solver collides against the **baked GLB triangle mesh**. The catch needs a real **concave shoulder shelf** in that mesh — a smooth slope lets the ring slide to the chest. There is no "catch" primitive; catching is emergent from inextensible edges meeting whatever triangles exist. **§8 must verify the ring settles at neck height, not chest height.**
- **Sleeve tubes:** circumferential contact gives normal force around the arm. **Caveat:** "normal force all around" only exists once the tube is **closed** (a dependency, not a guarantee); an open 150° arc peels radially under gravity — the exact "bunch at shoulder" failure the pin already produced. The dominant sleeve failure in T-pose is **radial peel of the open arc**, not axial slide.

This is the relocation in the framing banner: the hold is now **emergent and contingent**, not boundary-stipulated.

## 7. Pose

Drape in **T-pose** for this beachhead: the collision bake (T-pose bind), the placement (`frame.axis`), and the render all agree only in T-pose; applying A-pose to the bake corrupts the skinned bake (garment falls through — `avatarCollisionMesh.ts`). María shows horizontal arms for now.

**Scope of the no-debt claim (HIGH fix):** only the wrap **geometry function** is pose-parametric and transfers. The **validated result** — collar-catch geometry, sleeve load path, θ_max tuning, §8 thresholds — is calibrated against the T-pose shoulder shelf and horizontal arms. In A-pose the shoulder slope, arm load path, and gravity-along-sleeve all change. **The self-support tuning must be re-validated under the A-pose bake; the claim is "self-supporting in T-pose; A-pose unproven."**

## 8. Validation — operationalized (HIGH fix)

**Prerequisite:** #922 A1 (GPU contact determinism) is a **hard prerequisite**, not orthogonal — the holding mechanism *is* the contact the codebase documents as non-deterministic. Without A1, a run-to-run spread cannot be attributed to the wrap vs solver noise.

`webgpu-maria-replay` (`@gpu-local`, maintainer-run, `--repeat-each=3`), with numeric targets:

| Metric | Definition | Target |
|---|---|---|
| interpenetration @t=0 | count of cloth verts with signed distance < 0 to baked mesh; max depth (m) | count = 0 |
| **minY @10s (primary)** | lowest cloth vert; tied to expected sleeve-end height | **≥ 0.5 m**, run-to-run spread (max−min over 3 runs) **≤ 0.1 m** |
| sleeve-on-arm | mean distance of sleeve verts to arm axis | ≈ `R_curve` (not bunched at shoulder) |
| collar height | median Y of collar-ring verts | settles at **neck** height, not chest |
| belowHip @10s | % verts below hip line | ≤ 0.5% (parity with the pin, not the looser ~2% of v1) |
| early collapse | belowHip/minY at **t=0.5s and t=1s** | no collapse-then-redrape masked at 10s |
| pin | enabled? | **disabled** |

**Verdict rule:** all 3 runs must pass minY (primary). A 3-run spread that overlaps the known A1 noise floor is a FAIL of testability, not a pass — if even the pin-enabled config is erratic, the instability is the solver and the bet is untestable on this substrate (escalate / validate on the WASM oracle).

## 9. Risk & contingency — ladder with numeric triggers (BLOCKER fix)

**The bet:** the partial wrap survives the closing window and the emergent catch holds for 10s. Triggers are defined **up front**, numerically:

1. **Closing-window race (HIGH):** if early-collapse metrics (§8, t=0.5s/1s) show belowHip > 20% before seams reach ~90% closure → **raise θ_max** toward 360° (C → A). The closing dynamics are a first-class measured object: at `sdt = 1/900`, count substeps until collar seams cross the closed threshold vs how far the open lip falls under g in that window.
2. **Ring opens / stretches past shoulders:** if collar height settles at chest not neck → **stiffen the collar band** (lower neckline stretch compliance). *Confirm this uses existing per-region material override machinery or scope it as new work.*
3. **Last resort — transient pin that releases on seam closure:** the #921 shoulder-anchor code, kept **merged-and-disabled**. Explicitly not the design; a measured safety net if 1–2 fail.

Each rung is measured by §8 before taking the next. **A (full tube) is the designed fallback; the pin is the floor.**

## 10. Testing

**Unit (CI, no GPU):**
- `wrapPanel`: curved vertices lie **outside** `R_curve` (no point within `R_curve` of axis); the **triangulated surface** (not just verts) stays outside given the `maxEdgeLength`↔`θ_max` coupling; `u` stays straight; arc length preserved (no pre-strain); `θ_max` clamp actually caps (radians).
- **Auto-support precondition (non-circular):** ring diameter and shoulder width derived from **independent** measured values (neck circumference vs shoulder measurement), NOT both from `chestRadius`. Assert ring Ø < shoulder width on real María numbers.
- **Closed config stays outside the body:** after simulating seam closure on the placed verts, the *closed* ring/tube is outside the cylinder (seams must not pull the gap shut **through** the body — closure-direction check, not just "gap small").
- `surfaceFrame`: collar/torso/sleeve frames are non-degenerate (axis ≠ tangent).

**GPU-local E2E (`@gpu-local`):** the §8 replay with the t=0 + post-closure penetration checkpoints, collar-height and sleeve-on-arm metrics, early-collapse sampling, run ≥3×, pin disabled.

## 11. Phasing & relationship

- This is **Phase 4** of `2026-06-21-arrangement-points-3d-design.md`, promoted from "curvature cleanup" to "the structural mechanism that *attempts to* remove pins."
- **Attempts to supersede #921 Eje C, pending GPU verification.** The pin stays merged-and-disabled as the §9 floor — not deleted, not on a rotting branch.
- **Prerequisite:** #922 A1 (determinism) — required for §8 to be meaningful.
- **Orthogonal / unchanged:** Phase 1 collision-aware placement (this builds on it), Phase 2 user-adjust UX, Phase 3 grading re-application.
- **Spawns a follow-up:** A-pose collision bake (pose-matched bake) so María drapes in a natural pose and the self-support tuning can be re-validated there.

## 12. Open audit items (resolve during implementation-planning)

- Seam matching (`worldRefine`/`autoSew`) on flat vs curved geometry (§4) — does partner assignment still hold when rest mesh is curved?
- `wrapPanel` vs `normalizeInPlaneOrientation` (the 180° in-plane flip) order — does the flip invert the arc into the body?
- Collar-vs-head: does the T-pose bake have a head collider giving the ring an upper stop? Without it the ring can slide *up* off the neck, defeating the catch.
- Seam vs self-collision contention at the closing lip (both run per-substep; candidate minY-instability source).
- `wrapPanel` × arrangement-delta composition order (curve-then-transform), for Phase 2 forward-compat.
