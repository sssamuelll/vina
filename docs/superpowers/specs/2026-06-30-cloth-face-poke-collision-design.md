# Cloth–Body Face-Poke: Face-Aware Collision Pass (Phase B) — Design

**Date:** 2026-06-30
**Status:** Approved (brainstorming) — **revised after roster review (2026-06-30)** — ready for implementation plan
**North star:** purest possible cloth realism — the garment must sit on the avatar
like real clothing (Unreal/CLO3D feel); the body must not show through the cloth.
**Branch:** `feat/envelope-wrap`
**Author:** Samuel + Claude (Opus 4.8), informed by a 22-repo market benchmark + two roster passes (benchmark synthesis; spec critique Serrano/Voronov/Halberg/Richter/Cassian + arbiter ruling)

> **Framing — this REFORMULATES the Phase B promised by the pseudonormal spec.**
> `docs/superpowers/specs/2026-06-26-cloth-body-collision-pseudonormal-design.md`
> committed to "Phase B = a unified, narrow-band, face-sampled signed-distance
> **field**." A 22-repo benchmark (2026-06-30) refuted the field as the face-poke
> fix: (1) no repo demonstrates a real-time face-sampled narrow-band body SDF; (2)
> we already built and **deleted** a uniform-grid SDF
> (`docs/plans/2026-03-05-sdf-removal-design.md`) — at feasible resolution it blurs
> sub-cm detail; (3) an SDF sampled at 3 face verts is blind to the face interior;
> (4) it cannot subsume the tether (Eulerian distance-to-*nearest-surface* ≠ the
> tether's Lagrangian distance-to-*my-anchor*). **Phase B is a face-aware collision
> pass** (body features vs cloth faces), the only direction with both market proof
> of the algorithm and a real-time-feasible shape on our stack.

> **Revision note (roster review, 2026-06-30).** Five lenses endorsed the
> architecture and found two BLOCKERs + three verified factual errors in the first
> draft, now fixed here: **(B1)** "determinism for free" was false — the gather
> reads *neighbor* face corners that peer threads mutate; fix = read from the
> `preCollisionPos` snapshot (immutable), §A2. **(B2)** the ~2 ms budget was
> underived and likely fails the ≥30 fps gate; the fix scope is now decided by a
> measurement gate, §7. **(Ruling c)** v1 ships a **body-vertex-only** detector as a
> ship-quality probe; the body-edge Möller-Trumbore test is a *measured* escalation,
> not a v1 default, §A3/§7 — because the poke geometry (§1) shows the edge regime is
> real, so vertex-only coverage of the motivating bump is *unknown until measured*.
> Also fixed: the insertion slot (§A5), the tether premise (§A6), the response math
> (§A4), and the fps-table misread (§4).

## 1. Problem / root cause (confirmed) — and the poke geometry

Phase A (pseudonormal sign fix, `55d882b3`..`918123c5`) stopped genuine **vertex**
penetration; the shirt now covers the body. The residual is **face-poke**: a cloth
triangle whose **3 vertices are all outside the body** is pierced by a convex body
feature poking up **between** the verts, through the flat cloth **face**. The opaque
body overdraws it → anatomy-shaped "skin patches" on the front. Vertex-vs-triangle
collision is **structurally blind** to this — the contact's owner is a *face*, not a
*point*; more substeps / wider margin cannot touch it.

**Poke geometry (the load-bearing fact, from the arbiter ruling).** A cloth face
with all 3 verts outside, yet poked, requires curvature on the scale of the cloth
triangle. A piecewise-flat triangle-soup body has curvature **only at its edges and
vertices**. So the piercing feature is a **body vertex** OR a **body edge** (a convex
ridge) crossing the face. Critically, because the cloth (~58k tris) is **denser**
than the avatar (~18k tris), a long body **edge** can cross a small cloth triangle
with *both* its endpoints projecting outside that triangle — a case **only the
edge (segment-triangle) test catches**, invisible to vertex-only detection. This is
why v1's vertex-only coverage of the motivating bump must be **measured, not
assumed** (§7).

## 2. Market evidence (22-repo benchmark, 2026-06-30)

Provenance: workflow `face-poke-benchmark` (28 agents). Decision-grade summary:

- **Only 2 of 22 repos solve face-poke; every other cloth-on-body solver shares our
  exact blind spot** — incl. peers `NvidiaWarp-GarmentCode` (XPBD) "identical gap as
  ours", `GarmentLab` (PhysX5) "structurally identical blindness to OpenClo",
  `garment-sim` (XPBD). The gap is **structural to vertex-only collision**, not a
  tuning miss. Under-served territory.
- **`st-tech/ppf-contact-solver`** (Apache-2.0) — IPC cubic-barrier + ACCD,
  point-triangle in BOTH directions. *Is* the fix, but **offline** (2–437 s/frame).
  → borrow the barrier RESPONSE math (code-reusable); reject the global solver.
- **`nakjun/Cloth-Simulation-WebGPU`** (no license) — Möller-Trumbore detection
  **in WGSL on our stack**, proving face-aware detection runs in a browser. Crude
  response (velocity reversal, jitter, ships with collision commented out), all-pairs
  O(N·M). → reimplement the M-T kernel (LEARN-ONLY); drive from OUR BVH.

**What the benchmark proves and does NOT prove (honest scope):** it proves the
blind spot is industry-wide and that face-aware *detection* is browser-portable. It
does **not** prove a real-time face-poke *response* is feasible at our scale — 0/22
demonstrate that. Do not borrow that confidence; §7 measures it.

**Borrow table:** cubic-barrier response → ppf `energy/model/push.hpp` (Apache, code-
reusable, ~30 lines, **optional** per §A4); Möller-Trumbore segment-triangle → nakjun
`IntersectionShader.ts` (no license, **learn-only, reimplement**, **v2 only** per
ruling c). **Avoid (license):** GPL (`ccincotti3`, `DrapeNet`), NVSCL non-commercial
(`NvidiaWarp-GarmentCode`).

## 3. Goals / Non-goals

**Goals**
- A **physical** fix: cloth tents over convex body bumps; the body stops showing
  through cloth faces on María's front drape.
- Real-time on the **default GPU tier** — ≥30 fps held on María (hard gate, §7).
- **No new non-determinism axis** — honestly achievable via the snapshot read (§A2).

**Non-goals (this design)**
- Render-only mitigation (visible-avatar inset) — rejected by the user ("físico").
- The unified body field / SDF — refuted (see Framing).
- **Body-edge Möller-Trumbore in v1** — it is a *measured escalation* (§7), not a v1
  default. v1 is the body-vertex probe.
- WASM/CPU parity in v1 — deferred follow-up (tracked A7 GPU-ahead divergence, like
  strain-limit + tether). A CPU-mirror correctness oracle MAY land in v1 CI (§A7).
- CCD as a structural feature — but the CCD-skip is justified on *cloth-velocity*
  grounds, not "avatar static" (§A5).
- Cloth-cloth face-poke (self-collision).

## 4. Global constraints (the substrate)

- GPU/TSL/WebGPU is the DEFAULT tier; collision is `gpu/tslCollision.ts` (BVH on a
  GPU StorageBuffer).
- **The frame budget is saturated.** Sweep in `tslCollision.ts:254-274`: María,
  29,338 particles, 15 substeps, **margin 0.03 → 30.7 ms → ~32 fps**; ~**2.6 ms**
  headroom to the 33.33 ms / 30 fps hard floor. *(Correction: margin 0.02 = 24.6 ms
  = 40.7 fps; that "cliff" is a **drape** cliff — creep/shoulder-slip — NOT an fps
  cliff. So lowering margin is not a free fps lever; it was rejected for drape.)*
- The avatar is **STATIC** during a drape → the body BVH (`gpu/bvh.ts`, build-once,
  leaf-ordered, already carries edge+vertex pseudonormals) and any per-particle
  precompute amortize at body-rebuild, never per-frame.
- Cloth topology is **static** for a drape → the per-particle incident-face list
  builds once.
- The body BVH bounds body **triangles** (hence their vertices and edges) — querying
  it with a cloth-face AABB finds the body features near that face; **no second
  acceleration structure** is needed on GPU.
- A `preCollisionPos` snapshot already exists in the pipeline (`snapshotPreCollision`,
  the `snapshot→postSolve` window) — the immutable read source for §A2.

## 5. Design

### A1 — The governing invariant (stated correctly this time)

The engine's law: *the actuator writes a particle position, and a particle gathers
only **immutable** data.* The existing vertex collision reads only the particle's own
(immutable-within-pass) position. The first draft mis-stated this as "writes from
self-gathered data" and claimed determinism "for free"; the face pass gathers a
face's **other two corners**, which are **mutable co-owned** state — so the invariant
that actually keeps it deterministic is **"gather only immutable data."**

(Note: scatter is **not** forbidden by the engine — `normalAccum`,
`tslSolver.ts:919-920`, already scatters over faces into per-particle accumulators
deterministically via int-quantized atomics, the #921 trick. We choose **gather**
here for simplicity and atomic-freedom *given the snapshot*, not because scatter is
impossible. The scatter-to-scratch shape remains a valid fallback if the gather cost
(§7) disappoints.)

### A2 — Mechanism: per-particle gather from the SNAPSHOT (the B1 fix)

```
dispatch OVER PARTICLES (as today):
  i = particle index
  for each cloth face f incident to i:            // clothVertexFaces[i], static, built once
    read f's 3 corners from preCollisionPos (IMMUTABLE snapshot, NOT live posBuf)
    aabb = AABB(f) + band
    query the EXISTING body-triangle BVH with aabb
    for each returned body triangle t:
      if a body FEATURE of t pierces f (§A3):
        accumulate the penetration into particle i's own correction   // writes ONLY i
  apply particle i's correction to its position (+ velocity damp, §A5)
```

Reading the face corners from `preCollisionPos` makes the detection input
**immutable during the dispatch** → no read-after-write race → determinism holds.
Each corner of a poked face independently detects the same feature and lifts itself →
the face tents. No new BVH, no scatter, no new atomics.

### A3 — Detection (v1 = vertex only; edge = measured v2, per ruling c)

- **v1 — body-vertex vs cloth-face:** is a body vertex inside the band-thick prism
  over face `f` (projects inside the triangle, on the inside of the face plane)?
  Built **ship-quality**, not scaffolding — it promotes to the v1 default in place if
  §7 passes.
- **v2 (measured escalation) — body-edge vs cloth-face:** Möller-Trumbore segment-
  vs-triangle. Built **only if** §7 shows the motivating poke survives vertex-only —
  the edge regime (§1) makes this genuinely possible. Reimplemented from nakjun
  (learn-only), driven by our BVH (never all-pairs), and gated behind an optimization
  pass (it is the single heaviest leaf, §7).

### A4 — Response (axis-consistent; the M7 fix)

The cloth **face** is the surface being pierced, so push the face out along **its own
normal** by the penetration depth — measuring and pushing along the **same axis**
avoids the depth-vs-direction mismatch and the "different body points" issue of the
first draft (which pushed along the body pseudonormal):

- **Signed position + penetration depth (corrected sign):** `signed = (bodyFeaturePoint − faceCorner)·n_outward`, where `n_outward` is the cloth face normal oriented **away from the body**. A safely-covered body vertex sits on the inner side (`signed ≤ −margin`). **Violation** when `signed > −margin` (the body vertex is within `margin` of, or past, the face on the outward side); then **penetration depth** `d = signed + margin` (> 0). Push the face out along `n_outward` by `d` so the body vertex ends up `margin` behind it. (An earlier draft `d = margin − signed` was sign-inverted — it would push harder the deeper the body sat.)
- **Outward orientation of `n_face` (the M11 fix):** cloth face normals are
  recomputed each frame and not globally sign-consistent. Disambiguate using the body
  pseudonormal (we build/upload angle-weighted Baerentzen–Aanaes edge+vertex
  pseudonormals): flip `n_face` if `n_face · n_pseudo(feature) < 0` so it points away
  from the body. (Pseudonormal used for *sign*, not as the push axis.)
- **Distribute to the 3 corners by the constraint gradient, not raw barycentrics
  (the M7(a) fix):** moving corner `i` by `α_i·d` lifts the contact point by only
  `(Σα_j²)·d < d` → under-clears. Use `Δx_i = (α_i / Σα_j²) · d · n_face`
  (mass-weighted), so one pass clears the contact by `d`. Clamp total Δx per particle
  to `MAX_PUSH_DIST = 0.05`.
- **Stiffness:** start with the pure positional push (XPBD compliance carries
  elasticity). Add the ppf cubic-barrier inertia term (`mass/gap²`, Apache, ~30
  lines) **only if** the pure push over/undershoots in @gpu-local tuning. Full
  elasticity-inclusive barrier (needs a Hessian) is out.

### A5 — Cadence + insertion (the H3 fix)

**Once per FRAME**, not per substep (a per-substep second pass ×15 → ~17–20 fps).
The real once-per-frame slot is the **brush/normals block** (`GarmentSimulation.tsx`
~`:551-558`), which runs **after** the final `postSolve` — the first-draft's "after
substeps, before postSolve" slot does not exist (those are inside `substepNodes`,
×15).

**Velocity handling (newly specified):** because the pass runs *after* `postSolve`
(which already derived velocity from the substep position delta), a position-only push
would leave velocity pointing back into the bump → re-penetration next frame. So the
face pass also **damps the inward-normal component** of the corrected vertex's
velocity (a mini velocity-exclusion mirroring the per-substep collision's
snapshot→postSolve behavior, #897 F2.3). Without this, the tent re-collapses each
frame.

*Watch-item:* per-frame correction may "breathe" sub-cm (15 substeps re-flatten, the
frame re-tents). With the velocity damp it should hold; if it shimmers, escalate to
every-N-substeps. Measured in §7.

**CCD-skip rationale (the L15 fix):** justified on **cloth-velocity** grounds — the
poke is quasi-static (the cloth creeps slowly at the bump), and `MAX_PUSH_DIST`
bounds per-frame travel — NOT on "avatar is static." Bound the transient-poke miss
during the high-motion settle phase in §7.

### A6 — Tether coupling (rewritten against the REAL tether; the H4 fix)

The first draft built its "de-risk FIRST" argument on `captureTetherTargets`
("closest body point"), which is **explicitly not auto-run** (`gpuSolverClient.ts`
~`:1045-1050`). The **shipped** tether targets each vertex's **settled
self-position** via `recaptureTetherTargetsFromGpu`, fired once at ~frame 150
(`GarmentSimulation.tsx` ~`:569-588`). So:

- If the face pass runs continuously, the ~frame-150 settle-capture snapshots the
  **already-corrected** (tented) pose → tether target and face pass **agree**. The
  feared oscillation is largely an artifact of the wrong model.
- The only real coupling: the tether is a **max-distance clamp**; a face lift that
  exceeds the vertex's region radius fights it. But the push is clamped to
  `MAX_PUSH_DIST = 0.05`, and where the region radius ≥ 0.05 the clamp never trips →
  no fight. Front-torso radius is ~0.025 m, so a tight-radius bump *could* fight.

**Demoted from "#1 risk / de-risk FIRST" to a MEASUREMENT GATE:** measure the region
radii at the nipple/ab and whether a lift there exceeds the local radius **before**
building any remedy. If a fight exists, prefer re-using the existing
`recaptureTetherTargetsFromGpu` *after* the first face correction over a new
radius-floor SBA (which carries 1-frame cross-kernel latency). Do **not** add
GPU target recapture that re-introduces the slide-off the settle-tether arrested
(project memory `613fd730`).

### A7 — Scope, tiers, parity

- **GPU-only v1**, behind a `SolverCapabilities` flag. Note (L14): this is a **schema
  change** — there is no `collision` category today (flat flags + one `tools`
  sub-object), and per C4 #701 every field is required → all 4 tier constants must
  declare it.
- **Device-loss quality signal (the H6 fix):** `device.lost → handleGpuDeviceLost →`
  WASM, which has **no** face-poke → the body silently pokes through again. The
  silent-absence overlay today is for *tool* absence; add a **quality-downgrade
  signal** so a GPU-less fallback is not silently wrong.
- **WASM/CPU port = deferred follow-up** (tracked A7 GPU-ahead divergence). On
  CPU/WASM there is no BVH (`TriangleSpatialHash` over body *triangles*) — the dual
  query needs its own structure there; scoped with the port.
- **Correctness oracle, decoupled from the port (the F4 fix):** a CPU-mirror of the
  detection+response math runs the cube-poke-quad boundary test **in v1 CI** — a cube
  vertex/edge poking a flat 2-tri quad whose 3 verts are all outside → assert all 3
  face verts move +n_face, none cross the body, a non-poking control vertex yields
  zero correction. This guards the most novel collision code without waiting for the
  full WASM port.

## 6. Components

| Unit | Responsibility | Status |
|---|---|---|
| `clothVertexFaces` incident-face list | per-particle → incident cloth faces | **new, cheap** — invert the existing `triangleIdsSBA` (already on GPU for `normalAccum`); do not re-upload topology (L13) |
| snapshot read | face corners from `preCollisionPos` (immutable) | **reuse** existing snapshot |
| body-vertex-vs-face test (v1) | in-prism + signed depth | **new TSL** (distance math mirrors `triangleCollision.ts`, but the GPU kernel is a re-author, not an import; the cloth-side sign is `(V−corner)·n_face`, no body pseudonormal for the cloth face) (M10) |
| body-edge-vs-face test (v2) | Möller-Trumbore segment-triangle | **deferred** (measured escalation) |
| face-pass kernel | per-particle gather + self-push along outward `n_face`, `α_i/Σα_j²` weighting, `MAX_PUSH` clamp, inward-velocity damp | **new** (`tslCollision.ts`/`tslSolver.ts`) |
| frame-step insertion | once/frame in the brush/normals slot (~`:551-558`) | **modify** `GarmentSimulation.tsx` |
| multi-feature reduction | a body vertex is shared by ~6 tris, an edge by 2 → same feature returned up to 6× → over-push at convex tips (M8); reduce by single-winner `atomicMin` on depth (like the existing pass) or divide by incidence | **new** discipline |
| `SolverCapabilities.collision.facePoke` + quality-downgrade signal | GPU-only gating; non-silent fallback | **new** (schema change, 4 tiers) |
| CPU-mirror cube-poke oracle | v1 CI correctness guard | **new test** |

## 7. Validation / success criteria — the measurement gate (ruling c)

The build is a **ship-quality body-vertex probe**; one @gpu-local María run
(29,338 particles, 15 substeps, maintainer-run) measures two numbers and forces the
scope decision:

1. **fps with the vertex face-pass on** (hard gate = ≥30 fps with device margin).
2. **face-poke residual** — does the motivating nipple/ab poke visibly survive?

**Decision table:**

| fps | nipple | Outcome |
|---|---|---|
| ≥30 (margin) | closed | **Promote the probe to v1 default-on in place**; spec scope = vertex-only, now backed by the number; edge test never built. |
| ≥30 | **survives** | The bug is in the **edge regime** (§1). Vertex-only does NOT go default-on as "the fix." **v2 = add body-edge Möller-Trumbore**, budgeted against the measured residual headroom → **optimization pass first** (BVH refit / valence cap / two-phase broad-cull) before default-on. |
| **<30** | — | The pass is too heavy at this fidelity → escalate to **architecture** (quality-tier gating / optimization), not scope, before any default-on. |

- **Also measured:** the "breathing" watch-item (A5); the settle-phase transient-poke
  miss (A5 CCD-skip); whether a tether fight exists at nipple/ab radii (A6).
- **Unit (CI, no GPU):** the `clothVertexFaces` builder; the CPU-mirror cube-poke
  oracle (§A7); (with the edge escalation) the M-T segment-triangle test.
- **Visual (Samuel):** the front face-poke gone on María.

## 8. Risk & de-risk order

1. **Budget / fps gate (B2)** — the existential risk; the §7 measurement is the first
   thing the plan runs after the probe builds. Everything default-on hinges on it.
2. **Multi-feature over-count (M8)** — over-push at convex tips (the loudest pokes);
   the reduction discipline must land in the kernel, not be an afterthought.
3. **Velocity handling / breathing (A5)** — verify the inward-velocity damp holds the
   tent without shimmer.
4. **Tether fight (A6)** — measurement gate, not a pre-emptive build.

## 9. Out of scope

Render-only inset; the unified SDF/body field; body-edge M-T in v1 (measured v2);
WASM/CPU parity (v1); the full elasticity-inclusive barrier; ppf's global solver; any
GPL/NVSCL code reuse.

## 10. Open questions

**Resolved during design + roster review:** detector scope v1 = vertex-only probe,
edge = measured escalation (ruling c); read source = `preCollisionPos` snapshot (B1);
response axis = outward cloth face normal, distribute by `α_i/Σα_j²` (M7);
orientation sign via body pseudonormal (M11); cadence = per-frame at the brush/normals
slot + inward-velocity damp (H3); tether = measurement gate against the real
settled-self target (H4/A6); scatter not forbidden, gather chosen for simplicity
(M9); CCD-skip on cloth-velocity grounds (L15); SDF rejected (Framing).

**Remaining (for the plan):**
- The exact dispatched cost derivation feeding the §7 gate (union-AABB vs per-face
  traversal; expected candidate-triangle count per particle).
- The multi-feature reduction choice (atomicMin single-winner vs divide-by-incidence).
- Band width vs avatar tessellation calibration (if the edge escalation triggers).

## Appendix — benchmark cluster map (provenance)

| Cluster | Face-poke? | Repos |
|---|---|---|
| IPC barrier + dual point-tri/edge-edge (OFFLINE) | YES | `ppf-contact-solver` |
| Face-aware detect, crude response (OUR WGSL stack) | partial | `nakjun/Cloth-Simulation-WebGPU` |
| Edge-tri insight, training-time/neural, cloth-cloth | right primitive, wrong runtime | `ContourCraft` |
| Proximity push-out, vertex-vs-mesh — BLIND like us | no | `garment-sim`, `NvidiaWarp-GarmentCode`, `GarmentLab` |
| Vertex-vs-analytic-primitive only | n/a | `DiffCloth`, `FastMassSpring`, `opencloth`, `three-simplecloth` |
| Neural draping, no inference-time contact | no | `DrapeNet`, `ISP` |
| No body collision (floor/self/free) | n/a | `Ten-Minute-Physics-Unity`, `ClothSimulation`, `ccincotti3`, `jspdown/cloth`, `rarepng/sim`, `Yuu6883/WebGPUDemo` |
| Not a cloth solver / wrong domain | n/a | `pakm-3d`, `stickproject`, `clo3d-mcp`, `fabrics-drape-data` |
