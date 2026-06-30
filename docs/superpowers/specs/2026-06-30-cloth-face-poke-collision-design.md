# Cloth–Body Face-Poke: Face-Aware Collision Pass (Phase B) — Design

**Date:** 2026-06-30
**Status:** Approved (brainstorming) — ready for implementation plan
**North star:** purest possible cloth realism — the garment must sit on the avatar
like real clothing (Unreal/CLO3D feel); the body must not show through the cloth.
**Branch:** `feat/envelope-wrap`
**Author:** Samuel + Claude (Opus 4.8), informed by a 22-repo market benchmark + roster review (Halberg/Voronov/Cassian)

> **Framing — this REFORMULATES the Phase B promised by the pseudonormal spec.**
> `docs/superpowers/specs/2026-06-26-cloth-body-collision-pseudonormal-design.md`
> committed to "Phase B = a unified, narrow-band, face-sampled signed-distance
> **field** read by both collision and the tether." A 22-repo market benchmark
> (2026-06-30) **refutes the field as the face-poke fix**: (1) no repo demonstrates
> a real-time face-sampled narrow-band body SDF; (2) we already built and **deleted**
> a uniform-grid SDF (`docs/plans/2026-03-05-sdf-removal-design.md`) because at
> feasible resolution it blurs sub-cm detail; (3) an SDF sampled at 3 face verts is
> blind to the face interior — the exact poke location — so it needs face-interior
> sampling, reintroducing the same between-samples blindness; (4) the SDF cannot
> subsume the tether (Eulerian distance-to-*nearest-surface* ≠ the tether's
> Lagrangian distance-to-*my-anchor*). **Phase B is hereby redefined as a face-aware
> DUAL collision pass** (body features vs cloth faces), the only direction with both
> market proof of the algorithm and a real-time-feasible shape on our stack. The
> unified field, if ever built, is a separate *tether-unification* program, not the
> face-poke fix.

## 1. Problem / root cause (confirmed)

Phase A (pseudonormal sign fix, `55d882b3`..`918123c5`) stopped genuine **vertex**
penetration at concave junctions; the shirt now covers the body. The residual is
**face-poke**: a cloth triangle whose **3 vertices are all outside the body** is
still pierced by a convex body bump (nipple, ab) that pokes up **between** the verts,
through the flat cloth **face**. The opaque body then overdraws the cloth → anatomy-
shaped "skin patches" on the front.

This is **structurally unsolvable by vertex-vs-triangle collision**: that test
dispatches over cloth *points* and asks "is this point inside the body?". A
face-poke has no cloth point in contact — the body feature pierces the **interior
of a cloth 2-cell**. More substeps / a wider margin cannot touch it; the contact's
natural owner is a *face*, not a *point*. This is the first contact event in the
engine whose natural owner is not a single particle (see §4 A1).

## 2. Market evidence (22-repo benchmark, 2026-06-30)

Provenance: workflow `face-poke-benchmark` (28 agents). Full records archived with
the session. Decision-grade summary:

- **Only 2 of 22 repos solve face-poke. Every other cloth-on-body solver shares our
  exact blind spot** — including the closest peers: `NvidiaWarp-GarmentCode` (XPBD)
  "identical structural gap as ours", `GarmentLab` (PhysX5) "structurally identical
  blindness to OpenClo", `Electric-Bluefish/garment-sim` (XPBD) same. The gap is
  **structural to vertex-only collision, not a tuning miss.** We are in genuinely
  under-served territory.
- **`st-tech/ppf-contact-solver`** (Apache-2.0) — IPC cubic-barrier + ACCD, with
  **point-triangle contact in BOTH directions** (body-vertex vs cloth-face AND
  cloth-vertex vs body-face). Structurally *is* the fix. But **offline** (2–437
  s/frame). → **Borrow the barrier RESPONSE math (code-reusable); reject the global
  Newton/Hessian/PCG solver (the offline trap).**
- **`nakjun/Cloth-Simulation-WebGPU`** (no license) — Möller-Trumbore segment/tri-tri
  detection **in WGSL on our exact stack**, proving face-aware detection runs in a
  browser. But crude response (velocity reversal, jitter, ships with collision
  commented out) and all-pairs O(N·M). → **Reimplement the M-T kernel (LEARN-ONLY,
  M-T is prior art); drive it from OUR BVH, never their all-pairs dispatch.**

**Borrow table:**

| Technique | Source | License → use | Notes |
|---|---|---|---|
| Cubic-barrier contact response → position correction | ppf `energy/model/push.hpp` | Apache-2.0 → **code-reusable** (keep notice) | ~30 lines; optional, only if pure XPBD push over/undershoots |
| Möller-Trumbore segment-vs-triangle detection | nakjun `IntersectionShader.ts` | none → **learn-only, reimplement** | drive from our BVH, not all-pairs |
| Closest-point-on-triangle (vertex direction) | — | **already ours** (`triangleCollision.ts`) | do not rewrite |

**Do NOT touch (license):** GPL (`ccincotti3/webgpu_cloth_simulator`,
`liren2515/DrapeNet`), NVSCL non-commercial (`NvidiaWarp-GarmentCode`) — study only.

## 3. Goals / Non-goals

**Goals**
- A **physical** fix: cloth tents realistically over convex body bumps; the body no
  longer shows through cloth faces on the front of María's drape.
- Real-time on the **default GPU tier** (≥30 fps held on the María fixture).
- Determinism preserved — **no new non-determinism axis** beyond what ships today.

**Non-goals (this design)**
- A render-only mitigation (visible-avatar inset) — explicitly rejected by the user
  in favor of the physical fix ("sin compromiso").
- The unified body field / SDF — refuted as the face-poke fix (see Framing).
- WASM/CPU parity in v1 — deferred follow-up (tracked A7 GPU-ahead divergence, like
  strain-limiting and the tether). GPU is what the user sees.
- CCD — the avatar is static; per-frame cadence + the `MAX_PUSH_DIST` clamp cover it.
- Self-collision face-poke (cloth-cloth) — body-vs-cloth only here.

## 4. Global constraints (the substrate)

- GPU/TSL/WebGPU is the DEFAULT tier. Collision lives in
  `src/utils/cloth/gpu/tslCollision.ts` (BVH traversal on a GPU StorageBuffer).
- **The frame budget is already saturated.** The F4.3c sweep baked into
  `tslCollision.ts:254-274`: María, 29,338 particles, **margin 0.03 → 30.7 ms →
  32 fps**; margin 0.02 → 24 fps ("the cliff edge"). Collision IS the budget; there
  is ~0.7–3 ms of headroom above 30 fps. **Cost the pass you will actually dispatch.**
- The avatar is **STATIC** during a drape (joints/morph constant). The body
  collision BVH (`gpu/bvh.ts`, three-mesh-bvh, leaf-ordered, build-once) and any new
  per-particle precompute amortize at body-rebuild (debounced ~200 ms), never per-frame.
- Cloth topology is **static** for a given drape → the per-particle incident-face
  list builds once (like the tether captures targets once).
- The body collision mesh is **triangle soup** (`CollisionMeshData`, 9 floats/tri);
  the BVH bounds its triangles (hence its vertices and edges) — no new structure
  needed to find body features near a cloth face.

## 5. Design

### A1 — The governing invariant (why the obvious shape is wrong)

The engine has **one law, repeated in every subsystem**: *the only actuator writes a
particle position from data that particle gathered itself.* `findBestNode` /
`applyPushNode` dispatch over **particles**; `bestDistBuf` is sized `numParticles`;
the pseudonormal sign is the *sign of a point*; the tether kernel is
`compute(fn, N)` over **particles**, each writing only itself ("race-free by
construction, no atomics"). The #921 composite-key `atomicMin` determinism win and
the tether's atomic-freedom are dividends of this law.

The naive face-poke shape — *dispatch over cloth faces, push the face out* — is
**scatter**: a face writes its 3 shared particles; adjacent faces contend → float
`atomicAdd` → non-associative → **re-opens the #921 determinism axis we just
closed**. **Rejected.**

### A2 — Mechanism (gather, not scatter)

Keep the particle as the sole write-owner. Move only **detection** to be face-aware:

```
dispatch OVER PARTICLES (as today):
  i = particle index
  for each cloth face f incident to i:          // clothVertexFaces[i], static, built once
    aabb = AABB(f) expanded by band             // f's 3 current positions
    query the EXISTING body-triangle BVH with aabb
    for each returned body triangle t:
      // does a body FEATURE of t pierce face f?
      if  body-vertex(t) inside f's prism  OR  body-edge(t) crosses f  (§A3):
        d = penetration depth of that feature through f
        push particle i OUTWARD by its barycentric share of d  (§A4)   // writes ONLY i
```

Each of a poked face's 3 corners independently runs this, detects the same body
feature, and lifts itself → the face tents. **No new BVH, no scatter, no new
atomics, determinism preserved for free.** The synthesis's "double-response" open
question dissolves — it was an artifact of the rejected face-dispatch.

### A3 — Detection: two body features (both mandatory)

- **Body-vertex vs cloth-face:** is a body vertex inside the thin prism over face
  `f` (within the band, projecting inside the triangle)? Reuse the closest-point /
  barycentric machinery already in `triangleCollision.ts` / `tslCollision.ts`.
- **Body-edge vs cloth-face (mandatory, not optional):** Möller-Trumbore
  segment-vs-triangle — does a body edge cross `f`? Vertex-only **misses sparse,
  low-poly bumps** whose tip sits between body verts (Halberg). Reimplemented from
  nakjun (learn-only).

### A4 — Response

Positional XPBD correction: particle `i` moves outward along the **body
pseudonormal** of the piercing feature (we already build + upload angle-weighted
Baerentzen–Aanaes pseudonormals, `bodyPseudonormals.ts` / `bvh.ts`), by its
barycentric share of the measured penetration, invMass-weighted, clamped to
`MAX_PUSH_DIST = 0.05`. Pushing along the pseudonormal composes with the Phase A
Pass-2 sign fix (same body normal field) rather than fighting it.

Start with the **pure XPBD push** (compliance carries stiffness). Add the **ppf
cubic-barrier inertia term** (`mass/gap²`, Apache, ~30 lines) **only if** the pure
push over/undershoots in @gpu-local tuning. The full elasticity-inclusive barrier
(needs a Hessian we don't assemble) is out.

### A5 — Cadence: once per FRAME, not per substep

Collision is already the whole budget; a second pass **per substep** (×15) →
~17–20 fps (Halberg, from the sweep). Face-poke is **quasi-static** against a static
avatar — it does not need per-substep CCD. Dispatch the face pass **once per frame**,
after the substep loop, before postSolve/normals (in `GarmentSimulation.tsx`'s frame
step). Budget ≈ ~2 ms → fits the headroom.

*Watch-item (honest):* the per-frame tent may "breathe" sub-cm (substeps flatten,
the frame re-tents). At 30 fps likely imperceptible; if it flutters, escalate to
every-N-substeps. Measure.

### A6 — Tether coupling (the de-risk-FIRST item)

The body-tether (`feat/envelope-wrap`,
`docs/superpowers/specs/2026-06-25-cloth-body-tether-max-distance-design.md`) pulls a
vertex toward its **init-captured anchor** (its closest body point — which is **not**
the bump). The face pass pushes the vertex **off the bump**. For the same vertex the
two authorities reference **different body locations** and will fight: the face pass
lifts to clear the bump, the tether yanks it back → oscillation.

**Structural rule (Voronov):** the corrected vertex's **effective tether radius must
be ≥ the bump clearance**, i.e. the tether *yields* to the face pass — either by
flooring the radius at corrected verts, or recapturing the tether target to the
corrected position after the face pass. This coupling is **branch-specific and the
highest integration risk; de-risk it FIRST in the plan** (measure whether, at
default region radii, any proud bump under a tight-radius region forces the
oscillation; pick yield-vs-recapture from the measurement).

### A7 — Scope, tiers, parity

- **GPU-only in v1**, behind `SolverCapabilities.collision.facePoke` +
  `SimulationStatusOverlay` silent-absence (A7 / Epic-746 convention).
- **WASM/CPU port + parity oracle = deferred follow-up** (tracked A7 GPU-ahead
  divergence). On CPU/WASM there is no BVH (it uses `TriangleSpatialHash` over body
  *triangles*) — the dual query needs its own acceleration there; scoped with the
  port, not now.
- **Boundary-contract oracle (ships with the WASM port):** a cube vertex/edge poking
  a flat 2-triangle quad whose 3 verts are all outside → assert all 3 face verts move
  +pseudonormal, none cross the body, a non-poking control vertex yields zero
  correction.

## 6. Components

| Unit | Responsibility | Status |
|---|---|---|
| `clothVertexFaces` incident-face list | per-particle → incident cloth faces; built once at init (static topology) | **new**, cheap |
| body-vertex-vs-face test | closest-point + in-prism + depth | **reuse** `triangleCollision.ts` math |
| body-edge-vs-face test | Möller-Trumbore segment-triangle | **new**, reimplemented from nakjun (learn-only) |
| face-pass kernel | per-particle gather + push-self along pseudonormal, clamp `MAX_PUSH_DIST` | **new** (`tslCollision.ts` / `tslSolver.ts`) |
| frame-step insertion | dispatch once/frame after substeps | **modify** `GarmentSimulation.tsx` |
| tether yield/recapture | radius floor or target recapture at corrected verts | **modify** tether path (`gpuSolverClient.ts`) |
| `SolverCapabilities.collision.facePoke` + overlay | GPU-only gating + silent absence | **new** flag |

## 7. Validation / success criteria

- **@gpu-local María (maintainer-run):**
  1. **fps GATE (hard, before default-on):** ≥30 fps held with the pass on. If it
     misses, narrow the band / drop the edge test before shipping default-on.
     (Halberg + synthesis OQ8 — the "fits" budget is an estimate until measured.)
  2. **face-poke residual:** the front inside-body / overdraw fraction drops sharply
     vs the Phase-A baseline at the nipple/ab regions; visible skin patches gone.
  3. **tether harmony:** the cloth tents over bumps without oscillating against the
     tether (A6).
- **Unit (CI, no GPU):** the incident-face list builder; the Möller-Trumbore
  segment-triangle test on a known crossing/non-crossing fixture; (with the WASM
  port) the cube-poke-quad boundary oracle.
- **Visual (Samuel):** the front face-poke gone on María.

## 8. Risk & de-risk order

1. **Tether coupling (A6)** — de-risk FIRST; it can reshape the response/cadence.
2. **Frame budget (A5/§7.1)** — measure on María before default-on; the gate.
3. **Sparse-bump miss** — body-edge test mandatory; if still missed, the calibration
   knob is avatar bump-region tessellation vs band width.
4. **Breathing flutter (A5)** — escalate to every-N-substeps only if visible.

## 9. Out of scope

Render-only inset; the unified SDF/body field; WASM/CPU parity (v1); CCD;
cloth-cloth face-poke; the full elasticity-inclusive barrier; ppf's global solver;
any GPL/NVSCL code reuse.

## 10. Open questions

**Resolved during design:** queried primitive = vertex **and** edge (A3); response =
pure XPBD push first, ppf barrier term only if needed (A4); push direction =
pseudonormal (A4); cadence = per-frame (A5); CCD = skip (avatar static); scatter
double-count = dissolved by gather formulation (A1/A2); SDF = rejected (Framing).

**Remaining (for the plan):**
- A6: yield-vs-recapture for the tether — decide from the measurement.
- Exact insertion point + uniform/SBA plumbing in `GarmentSimulation.tsx` /
  `tslSolver.ts` for a per-frame (not per-substep) pass.
- Band width vs avatar tessellation calibration.

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
