# Cloth Body-Tether (Max-Distance) — Design

**Date:** 2026-06-25
**Status:** Design (brainstormed, approved) — pending implementation plan
**Branch:** `feat/envelope-wrap`
**Author:** Samuel + Claude (Opus 4.8)

## Problem

On the default GPU (TSL) tier the garment is held to the body by **nothing structural** —
only friction + repulsive collision (`bodyAnchoring = false`; all GPU particles
`invMass = 1.0`, no pin system). The cloth slides/resbala, does not cling to the body,
and does not feel "worn" the way Unreal Engine cloth does. `AnchorPoints.tsx` already
computes bone-attached anchors but is **visual-only** (billboard, never writes to the solver).

This is Samuel's frente #2 ("resbala / ceñido al cuerpo") — the core of the UE-feel north
star. The realism (gummy) work is done (bend recalibration + strain-limiting + material-bend);
this is the **clinging** axis.

## Goal

A **max-distance tether** (Unreal Chaos Cloth model): each cloth vertex may drift at most a
per-vertex **radius** away from a reference point on the body. Vertices with a small radius
cling (shoulders, chest); vertices with a large radius hang loose (skirt hem, sleeves). This
is what makes UE cloth follow the body without being a rigid second skin.

**Scope decisions (approved during brainstorm 2026-06-25):**

1. **Mechanism:** full max-distance tether (not a hard shoulder pin, not backstop-only).
2. **Radius assignment:** **automatic by region** — reuse the existing piece-region
   classification (`front-torso` / `back-torso` / `collar` / `sleeve` / `skirt` / ...). No
   painting UI.
3. **Target:** **static (Approach A)** — captured once in init via closest-point on the body
   BVH. The avatar is static during the drape (confirmed by the roster), so the target does
   not need to move per-frame.

## Non-Goals (explicit follow-ups, NOT in this spec)

- **Dynamic target (#887 binding):** target that follows the bone via `landmark + frame-delta`
  so the cling survives avatar animation. Dead work today (no pose-during-drape). Follow-up.
- **Max-distance painting (UI):** an Unreal/CLO-style brush to paint per-vertex radius.
  Large UI feature. Follow-up.
- **WASM/CPU parity:** the tether is GPU-ahead (like the strain-limiting). Flagged per the
  A7 per-feature port-or-ratify cadence; back-port queued, not done here.

## Design

### Architecture

A new GPU-solver subsystem, **`bodyTether`**, with the SAME shape as the STEP 4 strain-limiting
pass (`tslSolver.ts`): a per-vertex constraint compute node, dispatched in the substep loop.
It is **race-free by construction** — each cloth vertex is independent (unlike edges, no two
constraints share a particle), so no graph coloring and no atomics are needed; a single
`compute(fn, N, [64])` over all particles.

### Components

1. **`tetherTargetSBA`** — `StorageBufferAttribute`, vec3 × N (one per cloth particle).
   The closest point on the body surface to each cloth vertex, captured **once in init**.
   This is the static anchor.

2. **`tetherMaxDistSBA`** — `StorageBufferAttribute`, float × N. The per-vertex cling radius,
   assigned **by region** at init.

3. **`makeTetherFn`** — the kernel (mirrors `makeStrainLimitFn`'s shape):

   ```
   i = instanceIndex
   w = invMassBuf.element(i)
   If(w > 0):                                  // pinned/frozen particles untouched
     d   = posBuf.element(i) - targetBuf.element(i)
     dist = length(d)
     If(dist > maxDistBuf.element(i)):         // one-sided: only pull IN when too far
       pos = target + d * (maxDist / dist)     // project onto the radius sphere
   ```

   One-sided and rigid (no compliance): the target is a fixed point, only the vertex moves.
   It never pushes the vertex *away* from the body — that is the collision pass's job.

### Data flow

**Init** (after placement + collision-mesh setup, when both cloth initial positions and the
body BVH exist):
- For each cloth vertex: query the body BVH for the closest point → write `tetherTargetSBA`.
  Reuses the closest-point-on-triangle math already in `tslCollision.ts` / `triangleCollision.ts`.
  *(Implementation choice for the plan: CPU closest-point query in init vs. a one-shot GPU init
  kernel. CPU is simpler and runs once; the BVH is already built CPU-side in `setTslCollisionBody`.)*
- For each cloth vertex: map its piece's region → radius → write `tetherMaxDistSBA`.

**Per-substep:**
- The tether kernel reads `pos` / `target` / `maxDist` and clamps. The tether bounds the
  **maximum** distance to the body; the collision pass (margin 8 mm) bounds the **minimum**.
  The vertex therefore lives in `[8mm, maxDist]` of its target — they are **complementary**,
  not in conflict (as long as `maxDist > margin`). That band is exactly "cling without
  penetrating".

### Region → radius map (initial tuning values)

| Region | Radius | Rationale |
|---|---|---|
| `front-torso` / `back-torso` | ~0.025 m | clings to the torso |
| `collar` | ~0.02 m | clings to the neck |
| `sleeve` | ~0.05 m | semi-loose on the arm |
| `skirt` / hem / lower | ~0.12 m | hangs loose |
| default / unknown | ~0.06 m | moderate |

These are starting values, tuned @gpu-local against the María fixture. A `BodyTetherConfig`
(or a region→radius constant map) holds them so they are adjustable without touching the kernel.

### Integration (substep order)

Dispatched in `GarmentSimulation.tsx`'s `substepNodes` **after** the internal constraints
(stretch / bend / seam / self-collision / strain-limit) and **before** groundClamp + the
pre-collision snapshot — the same insertion point as the strain-limiting pass. This keeps the
tether energy-consistent (folds into `vNat`) and lets the body-collision pass run last to
guarantee the 8 mm minimum.

### Config / lifecycle

- `TslSolverConfig` gains an optional `bodyTether?: { enabled, regionRadii }` (or the radii
  live as a constant map and only an `enabled` flag is threaded). Default enabled on the GPU tier.
- The tether buffers are allocated alongside the other per-particle SBAs and disposed in the
  same dispose chain.
- The init-time target capture happens once per solver init (and on collision-mesh rebuild if
  the avatar pose/measurements change — same debounced path as `setCollisionMesh`).

### Testing

- **Unit (`tslSolver.test.ts`):** the solver exposes the tether compute node(s); they are
  constructed when cloth particles exist (mirror the strain-limit structure test).
- **@gpu-local (`webgpu-maria-replay`):** add a tether metric to the DIAG probe — mean
  cloth-to-body distance should drop (cling) and stay bounded; `belowHip` holds; no resbalón;
  `nan = 0`. Compare tether-off vs tether-on.

## Parity

GPU-ahead vs WASM/CPU (no tether pass there) — documented A7 divergence, like the
strain-limiting. WASM back-port queued, not in scope.

## Risks / open questions for the plan

- **Target staleness on pose/measurement change:** if the avatar mesh rebuilds (debounced
  collision rebuild), the targets must be recaptured or they point at stale body geometry.
  The plan must wire target recapture into the same rebuild path.
- **Init target capture cost:** closest-point for ~29k vertices against the body BVH, once.
  CPU should be fine (one-shot); profile if it stalls init.
- **Radius tuning:** the region radii are guesses; expect a tuning pass @gpu-local. Too small
  → rigid/second-skin; too large → no cling.
- **Interaction with the wrap:** the envelope-wrap places panels tangent+outside the body;
  the tether then pulls them to `maxDist`. Verify they compose (the wrap sets the start pose,
  the tether holds it near the body) and don't fight.
