# Cloth–Body Collision: Pseudonormal Sign Fix (Phase A) Design

**Date:** 2026-06-26
**Status:** Approved (brainstorming) — ready for implementation plan
**North star:** purest possible cloth realism — the garment must sit on the avatar
body like real clothing (Unreal/CLO3D feel), no compromise for expediency.

## Goal

Stop cloth from sinking INTO the avatar body so the opaque body stops drawing over
it (the "skin patches"). Fix the **confirmed root cause** — a wrong inside/outside
SIGN at concave / cross-body-part junctions — at the right place (the collision
contact test), preserving the full-detail body and cross-tier parity.

## Problem / Root cause (confirmed)

The garment DOES cover the body (xray confirms a complete shirt; coverage
front 96% / back 93%), but ~38% of cloth verts end up INSIDE the body, so the
opaque body overdraws them → "skin patches" shaped like anatomy (nipples, abs;
worst at the shoulders). The collision push itself is fine (full-magnitude,
`MAX_PUSH_DIST=0.05`, last position write per substep). Cloth penetrates because
the push is **skipped** for misclassified verts:

- **Pseudonormal misclassification (dominant).** `tslCollision.ts` Pass-1
  `findBestNode` picks the contact triangle by **unsigned** nearest distance;
  Pass-2 derives `bestSide` (inside/outside) from **one** face's normal
  (`tslCollision.ts` ~:579-581; CPU mirror `triangleCollision.ts:55,91`). On a
  non-convex manifold (shoulder, armpit, armscye) a genuinely-inside vert lies on
  the **+side** of its nearest face's plane → judged OUTSIDE → with
  `dist > margin` the push is `max(margin - dist, 0) = 0` → never pushed out →
  stays inside. This is the classic single-incident-face sign error; it is
  **resolution-independent** (5mm→3mm mesh left penetration 38.9%→38.0% unchanged),
  which a tessellation/conformance cause could not produce.
- **Seam pull-through (secondary, localized).** The armscye seam shrinks
  `restLength` to 0 (`seamAssembly.ts:746-754`), forcing sleeve-cap and
  bodice-armhole verts to **coincide**; over the convex shoulder that midpoint is
  INSIDE the body → drags both verts in faster than one collision push/substep
  rescues. Body-unaware.
- **Face-poke (front, OUT OF SCOPE for A).** Verts outside but the cloth FACE
  spans a convex bump (nipple/ab) → body shows through the face. Distinct
  mechanism (not vertex penetration); structurally unsolvable by vertex-vs-triangle
  collision. Measured as the residual after A; sizes the north-star (B).

The fix is **Baerentzen–Aanaes (2005) angle-weighted pseudonormals** — exactly the
construction invented to give a correct inside/outside sign on non-convex meshes.

## Scope

This spec covers **Phase A** only:
1. Pseudonormal-based inside/outside sign in the body-collision contact test.
2. A residual-`restLength` floor on seams (kills the armscye pull-through).
3. Cross-tier lockstep (GPU + CPU + WASM) — the bug + fix are identical in all
   three; the WASM parity oracle (#746/#748) must stay green.

**Phase B (the committed north-star, separate future spec):** a **unified body
field** — a narrow-band, high-resolution, **face-sampled**, baked-gradient signed
distance field that the collision (`φ≥margin`, `∇φ` push) AND the tether (cling
reference) both read. One body representation instead of two (BVH + `tetherTargetSBA`).
It resolves concave junctions natively, solves **face-poke** (face-sampling beats
vertex-vs-triangle), and is the realism ceiling. NOT the uniform SDF that already
shipped across all four tiers and was deliberately deleted
(`docs/plans/2026-03-05-sdf-removal-design.md`): at feasible uniform resolution
(128³ ≈ 16 mm cells over a ~2 m body) it BLURS the sub-cm detail it is sold on and
breaks the parity oracle. Phase A runs first and **measures what face-poke
survives**, which sizes B's necessity and resolution.

The tether (already shipped, `613fd730`, arrested #902) is orthogonal: collision
only pushes OUT (non-penetration); the POSITIVE "belongs on the body / worn"
relation is the tether. A handles non-penetration; the tether handles the worn
feel; B (later) unifies their body representation.

## Global Constraints

- GPU tier = TSL/WebGPU is the DEFAULT (what the user sees). Collision lives in
  `src/utils/cloth/gpu/tslCollision.ts` (BVH traversal on a GPU StorageBuffer).
- ~29,338 particles, 15 substeps/frame, ≥30 fps target (currently ~32 fps at the
  `uAabbMargin=0.03` floor). The Pass-1 BVH traversal is the hotspot — **do not
  touch Pass-1**; the sign fix is winner-only, O(1), in Pass-2.
- The avatar is STATIC during a drape (joints/morph constant). The collision body
  REBUILDS on pose/morph change (debounced ~200 ms). All precompute (weld,
  adjacency, pseudonormals) amortizes there, like the existing per-rebuild BVH
  build — never per-frame.
- Cross-tier parity is non-negotiable: CPU `triangleCollision.ts` + WASM Rust
  `crates/xpbd-wasm/src/lib.rs` carry the identical collision + bug; the fix lands
  in lockstep and the WASM parity oracle stays green.
- The body collision mesh is **triangle soup** (`CollisionMeshData.vertices` is the
  expanded 9-floats/tri format; see `bvh.ts`) — no shared vertices, no adjacency.

---

## Design

### A1 — Pseudonormal contact sign (the kernel change)

The closest-point computation already determines which **feature** of the contact
triangle is nearest (the barycentric region: face interior / one of 3 edges / one
of 3 vertices). Pass-2 replaces the single face-normal side test with the
angle-weighted pseudonormal of that feature:

- **face interior** → the triangle face normal (unchanged behavior).
- **edge** → the (area/angle-weighted) average of the two faces sharing the edge.
- **vertex** → the angle-weighted sum of the normals of all faces incident to the
  vertex (weighted by each face's incident angle at that vertex — the
  Baerentzen–Aanaes weighting).

`bestSide = dot(p − closestPoint, pseudonormal[feature])`. On a closed consistent
manifold this is the true inside/outside sign everywhere, including concave wedges.

Pass-1 (`findBestNode`, the fps hotspot) is **unchanged** — nearest-by-distance
still selects the right contact triangle; only the side derivation in Pass-2 changes.

### A2 — Precompute (CPU, at body-rebuild)

New per-rebuild step alongside the BVH build (`bvh.ts` / wherever
`setTslCollisionBody('__avatar__', …)` builds the body):

1. **Weld** the triangle soup into an indexed manifold (merge coincident vertices
   within an epsilon).
2. Build **edge** and **vertex** adjacency; compute the **angle-weighted
   pseudonormals** per edge and per vertex.
3. Pack + reorder to BVH leaf order (matching `triVerts`/`triNormals`) and upload
   as StorageBuffers. The CSR storage pattern in `src/utils/cloth/wasm/adjacencyCSR.ts`
   is reusable for the per-feature neighbor lists; the pseudonormal computation
   itself is new.

### A3 — Weldability precondition (THE risk — de-risk FIRST)

A skinned human body mesh is frequently **non-manifold or inconsistently wound**
exactly at armpit / armscye / crotch (gaps, T-junctions, duplicated UV seams).
There the weld may fail to produce a clean manifold, and the pseudonormals would be
garbage **precisely where they are needed most** (the shoulders). Therefore the
**first implementation task is a spike**, not the pipeline:

- Weld the real María avatar collision mesh; measure manifoldness + winding
  consistency, especially at armpit/armscye. Report: % manifold, # non-manifold
  edges/vertices, where they cluster.
- Decide the **fallback** for non-manifold / boundary features based on the
  measurement: per-vertex fall back to the face normal, or a robust
  generalized-winding-number inside test for those specific verts. (Do not design
  the fallback in the abstract; design it to the measured defect.)

If the body welds clean at the critical regions, the full pipeline proceeds. If
not, the spike result reshapes A2/A1 before any pipeline investment.

### A4 — Seam residual-`restLength` floor

In `seamAssembly.ts` (and the GPU mirror `makeSeamConstraintFn` in `tslSolver.ts`,
and the Rust mirror), clamp the decaying seam `restLength` to a small floor
(≈ local body offset, e.g. 2–3 mm) instead of 0, so paired edges meet AT the
surface, not at a single interior point. Start global (simplest); if it produces a
visible gap on non-shoulder seams, make it region-specific (armscye only). ~5 lines
per tier. Independent of A1 — both are required (A1 stops misclassification; A4
stops the active inward drag).

### A5 — Cross-tier lockstep

The sign fix (A1) and the seam floor (A4) land together in GPU
(`tslCollision.ts`), CPU (`triangleCollision.ts`), and WASM (Rust `lib.rs`). Rebuild
+ sync the WASM binary (`public/wasm/` — both `.js` and `_bg.wasm`). The boundary
contract / parity oracle (#746/#748) and the CI `rust` job stay green.

## Testing / Success criteria

- **First-class coverage/occlusion metric (new, the gap that cost us days):** add
  to the verify loop a body-surface **coverage** metric (% of the body region that
  has cloth proud/outside of it) and a **signed inside-body penetration** fraction
  (note the concave-region inflation caveat; prefer a robust inside test for the
  metric itself). "The map finally has coverage on it."
- **@gpu-local (María drape M4):** shoulder/armpit **vertex penetration → ~0**; the
  full 18,220-tri body detail preserved (no smoothing); ≥30 fps held; WASM parity
  oracle green.
- **Visual (Samuel):** the concave/shoulder skin patches gone.
- **Unit tests:** pseudonormal correctness on a known concave fixture (a wedge/saddle
  where the single face normal misclassifies but the pseudonormal is correct); the
  weld/manifold builder (incl. a non-manifold fixture → fallback path); the seam
  `restLength` floor.
- **Residual measurement (feeds B):** after A, measure the remaining FRONT
  face-poke (body bump between cloth verts) — this is explicitly OUT of A's scope
  and sizes Phase B.

## Out of scope (Phase A)

- Front face-poke (body detail through cloth faces) — measured residual → Phase B.
- The unified body field (Phase B) — its own future spec/brainstorm.
- WASM tier visual parity beyond the oracle (the user sees GPU).

## Open questions resolved during design

- **SDF vs pseudonormal:** the roster (4 of 5 lenses, incl. clinical + ship-it +
  runtime) chose pseudonormals; a uniform SDF re-litigates a deleted decision and
  REGRESSES detail at feasible resolution. The field is the north-star (B), done
  right (narrow-band/high-res/face-sampled/unified-with-tether), not now.
- **Phasing:** A first (it teaches what face-poke survives, which sizes B).
