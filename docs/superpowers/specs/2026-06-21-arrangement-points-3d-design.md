# Arrangement Points 3D — collision-aware placement + grading-safe user adjustment

**Date:** 2026-06-21
**Status:** Design (approved in brainstorming; pending spec review → implementation plan)
**Related:** #887 (arrangement-points integration), #921/#922 (long-horizon drape; A1 determinism + B collar band-aid), M2 (engine conserved for grading)

## 1. Problem

A garment only drapes well if it starts from good initial conditions. Today it does not.

- **`computePlacement` (`garmentPlacement.ts`) is 2D-flat and collision-naive.** Position is parametric (from `deriveDimensions`) but **orientation is a hard-coded constant per region** (`rotation: [-π/2, ±π/2, 0]` for sleeves). The sleeve lands as a flat plane at **z = 0** facing ±X — which slices straight through the avatar's 3D arm **before simulation even starts**. There is zero collision logic in placement (the only mentions of "interpenetration"/"resolve" are comments).
- **The user-adjust path is half-built and incoherent.** `arrangementOverrides` exists (`Record<id, [x,y,z]>`, persisted) and a 3D drag gizmo exists (`DraggablePiece` + `TransformControls`), but: the override is **translation-only in world space** (no rotation, not grading-safe); the **`arrangement` tool is a stub** (`onActivate: console.log('Coming soon!')`); and the 60+ bone-attached `AnchorPoints` are **rendered but consumed by nothing** (no snapping).

Net: pieces start interpenetrating, the user can only translate (not orient), and the designed arrangement-points UX does nothing. Every downstream drape fix (friction tuning, GPU determinism) is band-aiding bad initial conditions.

## 2. Goals / Non-goals

**Goals**
- Pieces start **on the body surface in 3D with no gross interpenetration** at t=0 (sleeves align with and sit outside the arm; collar wraps the neck base).
- The user can **adjust position AND orientation** (3 planes) easily, with snapping to anchor points.
- The arrangement is stored in a **grading-safe-capable** format so a graded size re-drapes without manual re-arrangement (machinery deferred; format committed now).

**Non-goals (this design)**
- Building the grading re-application trigger (Phase 3, deferred — "design-for-it, build-later").
- True surface-patch wrapping / seam-derived orientation for curved pieces (Phase 4, conditional on measurement).
- Animating placement to a posed avatar (`#887` dynamic bone-attach; avatar is static during arrange/drape).

## 3. The binding-model decision (roster-derived)

**`POSE` is not one primitive — it is two, with different grading laws** (Voronov):

- **Position** transforms covariantly with measurements (a wider body moves the point) → belongs to the **parametric landmark** (`deriveDimensions`). Grading-safe by construction.
- **Orientation** does NOT transform with measurements (a wider body *translates* the piece, does not rotate it) → belongs to the **surface frame** at that landmark, which is grading-invariant.
- Neither belongs to the **bone position**. The bone is a *proxy* for the surface frame (`computeBoneAnchors` already uses the bone only for the quaternion; the offset magnitude is already parametric). This reconciles the #921 prior: anchoring *position* to a bone is grading-incompatible (holds); anchoring *orientation* to a *frame* (topological-local) is grading-safe.

**Decision:** asymmetric **hybrid** binding — position from the parametric landmark, orientation from the body surface frame (bone as an implementation source for tubular limbs, parametric fallback otherwise).

Rejected alternatives:
- **Bone-pure** — scoped **L** by Plumb (~230-280 lines: requires a world→bone inverse that does not exist + mutates the `[x,y,z]` shape across ~14 callsites + 18 test files + persistence versioning + couples deferred #887). Also gives the *wrong* orientation on the torso (Spine axis is vertical, not the outward normal — which is why `computePlacement` hard-codes face +Z).
- **Parametric-pure** — scoped **XS** but **cannot produce orientation**: `deriveDimensions` returns scalars, zero directional info. "A position disguised as a pose" (Halberg, Null Vale, Voronov agree).
- **Hybrid** — scoped **S** (~40-60 lines): reuses `computePlacement` position, adds surface-frame orientation.

## 4. Architecture

### 4.1 Data model — the grading-safe format

Replace `arrangementOverrides: Record<id, [x,y,z]>` (world, position-only) with:

```ts
interface ArrangementBinding {
  space: 'frame';            // discriminant → additive migration; legacy 'world' converted lazily
  posDelta: [number, number, number];        // translation in the landmark's LOCAL frame
  rotDelta: [number, number, number, number]; // quaternion delta RELATIVE to the surface frame
}
// arrangementOverrides: Record<string, ArrangementBinding>
```

- Untouched piece: `posDelta = 0`, `rotDelta = identity` → 100% auto placement. The delta stores only the user's adjustment.
- The delta is **relative to the auto frame**, which re-evaluates per size via `deriveDimensions` → a graded size repositions/reorients automatically. **This is the grading-safe format; the re-grading trigger is Phase 3.**
- Storing `[x,y,z]` world + a world quaternion would be grading-*incapable* named grading-safe — explicitly rejected.

### 4.2 Units (single-purpose, testable)

| Unit | Responsibility | Location |
|---|---|---|
| `surfaceFrame(region, measurements, avatar?)` → `{point, normal, tangent}` | Body surface frame at the region landmark. Parametric first; bone-proxy for tubular limbs; constant fallback. **Pure.** | new, `garmentPlacement.ts` or `cloth/arrangement/` |
| `computePlacement` (enhanced) | Parametric position (unchanged) + orientation from `surfaceFrame` (replaces the constant rotation) + **collision-aware normal offset**. | `garmentPlacement.ts` |
| `resolveArrangement(pieces, bindings, measurements, skeletonReady)` | Compose `autoFrame ∘ delta`, **once at t=0, frozen**, skeleton-gated with fallback. | new, consumed by solver init |
| `ArrangementBinding` + migration | New override shape + lazy legacy `[x,y,z]` convert. | `projectSlice.ts` |
| Drag → frame-delta | `onDragEnd` captures rotation too, writes delta relative to the frame. | `DraggablePiece.tsx` (Phase 2) |
| Tool `arrangement` + snap | Un-stub; snap pieces to anchor points. | `arrangement.tsx` + `AnchorPoints.tsx` (Phase 2) |

### 4.3 Resolve flow (non-negotiable conditions)

```
autoFrame(region, measurements)        // parametric position + surface-frame orientation + collision offset
   ∘ binding.delta                     // compose user adjustment
   = final piece pose
```

1. **Format = `landmark + frame-delta`**, never `[x,y,z] + world-quat`.
2. **Resolve once at t=0 and freeze.** Do NOT copy the per-frame `useFrame` pattern of `AnchorPoints` — a per-frame-resolved start pose is non-deterministic between runs, which is exactly the #921 instability. (Null Vale: "the difference between grading-safe and grading-poison is one word: *when*.")
3. **Gate behind skeleton-ready** + fallback (Halberg): the bone frame is only truthful after `scene.traverse` resolves the skeleton; gate `simulate` on skeleton-ready and re-resolve once before stepping. Missing bone / no rig → parametric-default frame, never snap-to-origin (0,0,0 = inside the avatar = NaN seed).

## 5. The collision-aware placement engine (Phase 1 core)

### 5.1 Body as implicit primitives

`deriveDimensions` already models the body as cylinders/cones; make it explicit as the placement surface:
- **Torso:** vertical cylinder, radius interpolating `chestRadius → hipRadius` with height.
- **Arms:** cylinders along the arm axis, radius `armR`.
- **Neck:** small cylinder (`~chestRadius·0.4`).

### 5.2 `surfaceFrame` per region

| Region | `point` (parametric) | `normal` (out) | `tangent` (piece up) |
|---|---|---|---|
| front-torso | `[0, midTorso, +R]` | `+Z` | `+Y` |
| back-torso | `[0, midTorso, -R]` | `-Z` | `+Y` |
| left/right-sleeve | arm-axis midpoint | radial to arm axis | **along the arm axis** ← the fix |
| collar | neck base | radial to neck axis | wraps the neck |
| skirt / waistband | hip cylinder | `±Z` radial | `+Y` |

The arm/neck **axis direction** comes from the bone when skeleton-ready (handles T-pose vs A-pose), parametric default otherwise. The radial normal and offset magnitude are parametric (grading-safe).

### 5.3 Collision-aware offset (why it eliminates gross interpenetration)

```
position    = surfaceFrame.point + surfaceFrame.normal · (radius + GAP)
orientation = align(piece.up → tangent, piece.normal → normal)
```

A plane **tangent to a convex cylinder** touches it on a single line; everywhere else the plane is **outside** the cylinder. Today's sleeve interpenetrates because it is at z=0 (through the body), not tangent. Orienting it tangent + offsetting by `armR + GAP` leaves it **just outside the arm, aligned with it** → no gross interpenetration at t=0. This also re-solves the collar principledly (tangent to the neck cylinder at the base, not a flat strip floating forward — superseding the #922 Eje B band-aid).

### 5.4 What Phase 1 does NOT solve (honest boundary)

The plane is still **rigid**: it touches the cylinder on a line, so for **wrapping** pieces (sleeve, collar) the edges sit at variable distance from the curved surface — **residual curvature**, not gross interpenetration (Null Vale: the true primitive is a *surface patch*; a rigid transform cannot wrap). Two paths:
1. The solver's **collision-resolve** cleans the residue — now from a *good start* (outside, aligned), not today's chaos. Likely sufficient.
2. If it does not converge, **Phase 4** (seam-derived orientation / patch projection).

**Phase 1 bet:** a good rigid start + the solver suffices. **Measure it** (the `webgpu-maria-replay` E2E) before investing in Phase 4.

## 6. User adjustment (Phase 2)

- **Un-stub the `arrangement` tool:** `onActivate` → `setViewMode3D('arrange')` + show anchor points + enable gizmo. Wire its declared options (Snap to Body, Auto Arrange).
- **Drag with rotation (the 3 planes):** add `TransformControls` rotate mode; `onDragEnd` captures rotation and converts the world pose → **frame-delta** (`posDelta` frame-local, `rotDelta` relative to the surface normal). The world→frame inverse is cheap (one `getWorldQuaternion().invert()` at drop, not hot-path).
- **Snap to anchor points:** dragging near a point snaps the piece landmark to it (Snap-to-Body toggle). The 60+ `AnchorPoints` become functional.
- Every edit persists as a grading-safe delta.

## 7. Error handling

| Case | Behavior |
|---|---|
| Skeleton not ready at resolve | Resolve with parametric-constant frame (deterministic); gate `simulate` on skeleton-ready + re-resolve once before stepping. Never resolve mid-sim. |
| Missing bone / unknown rig naming (`mixamorig:`) | Parametric default frame (no bone axis). Never snap-to-origin. |
| Frame underivable (degenerate measurements) | Fallback to current `computePlacement`. |
| Legacy `[x,y,z]` world override | `space` discriminant: lazy-convert on load (resolve world→delta against the stored-size auto frame) or treat as world. Additive migration; does not break the ~14 callsites. |
| NaN pose to solver | Existing `placeGarmentPieces` NaN guard (A3). |

## 8. Testing

**Pure-JS unit (CI, no GPU):**
- `surfaceFrame` per region: orthonormal normal/tangent, normal points outward, correct for known measurements.
- **`computePlacement` collision-aware: geometric assertion that the piece's tangent plane lies OUTSIDE the body cylinder** (no plane point within `radius` of the axis) → proves no gross interpenetration **without a GPU**. This is the core complaint, tested in CI.
- `resolveArrangement`: `autoFrame ∘ identity = autoFrame`; delta composition; skeleton-not-ready → fallback.
- **Grading-safe test (Lyra's mandate):** create a binding with a delta, **grade measurements to another size**, re-resolve, assert the pose **tracks the graded body** (same body-relative landmark/offset), NOT clamped to the old world position. Without this test, "design-for-not-build" is "not-now" in disguise.
- Legacy migration: world `[x,y,z]` override handled without crash.

**GPU-local E2E (`@gpu-local`, run by maintainer):** `webgpu-maria-replay` with a new **pre-sim checkpoint** — penetration metric at t=0 ≈ 0 (sleeves no longer start inside the arm) — plus drape at 2.5s/10s. This measures the Phase 1 bet (good start + solver suffices, likely fixing the `minY=0.412` regression seen while debugging #921) vs needing Phase 4.

## 9. Phasing

- **Phase 1 — Collision-aware auto-placement** (fixes the complaint): `surfaceFrame` + enhanced `computePlacement` (real orientation + normal offset) + new binding format (delta=identity = auto) + `resolveArrangement` (once, frozen, gated, fallback) + unit tests. No new UX.
- **Phase 2 — User adjustment:** un-stub tool, drag rotation as frame-delta, snap to anchor points.
- **Phase 3 — Grading re-application** (design-for-it now, build later): the trigger + pieceId base→graded identity mapping. The real grading break is **pieceId orphaning** (grading mints new IDs; overrides keyed by old ID — same as `duplicatePiece`), so this phase is identity-wiring + re-resolve, not new placement math. Deferred; the Phase 1 format makes it additive.
- **Phase 4 (conditional) — surface-patch / seam-derived orientation** for wrapping pieces. Only if Phase 1's GPU measurement shows residual curvature the solver cannot resolve.

## 10. Relationship to #921 / #922

- **A1 (GPU contact determinism)** — orthogonal; stays in #922.
- **B (collar reposition band-aid in #922)** — superseded by Phase 1's principled collar placement (tangent to the neck cylinder). Drop B from #922 or let Phase 1 replace it.
- The `minY=0.412` 2.5s-checkpoint failure observed while debugging #921 is plausibly a bad-initial-conditions symptom; Phase 1 is the principled fix attempt, measured by the same E2E.

## 11. Roster appendix (key verdicts)

- **Grading-safe = `design-for-not-build`** (Lyra/Halberg/Plumb): store the grading-safe format now; do not build the re-grading machinery (grading does not touch `arrangementOverrides` today; the expensive half is pieceId identity mapping).
- **POSE = two primitives** (Voronov): position→landmark (covariant/grading-safe), orientation→surface frame (invariant). Bone is a frame proxy, not the owner.
- **Pure parametric cannot orient; pure bone is L + grading-poison if read per-frame** (Halberg/Null Vale/Plumb). Hybrid = S.
- **The true primitive is a surface patch; orientation is largely a seam OUTPUT** (Null Vale): rigid transforms leave curvature residue at wrapping pieces — the Phase 1 boundary, Phase 4 territory.
- **Resolve once at t=0, freeze; gate on skeleton-ready** (Halberg/Null Vale): a per-frame start pose reintroduces #921 non-determinism.
