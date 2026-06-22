# Envelope Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place María's garment panels *wrapped* over the body cylinders (collar as a near-closed ring, sleeves as tubes) so the closed geometry holds the garment up without pins.

**Architecture:** A new pure `wrapPanel(localVert, frame, params)` curves each flat mesher-local vertex around the region cylinder (arc-length-parameterized, standoff by GAP). It is applied **where the frame is known** — the per-vertex placement loops in `GarmentSimulation.tsx` (render + solver), replacing the rigid rotate+translate. `surfaceFrame` is fixed to give non-degenerate frames and anatomical radii; `deriveDimensions` surfaces `neckR`/`armR` from measurements. The mesher and seam pipeline are unchanged.

**Tech Stack:** TypeScript, Three.js, Vitest (unit), Playwright (`@gpu-local` E2E), Rust/WASM solver (untouched here).

## Global Constraints

- Typecheck with `npx tsc -b --noEmit` (build mode) — NOT bare `tsc`. (CLAUDE.md)
- Unit tests: `npm run test` (Vitest). Never use `--no-verify`. (CLAUDE.md)
- IDs via `newId()` — N/A here (no new entities).
- Units: `cmToM(x)=x/100`, `mmToM(x)=x/1000` (from `src/utils/geometry`). `BodyMeasurements` fields are cm; `BodyDimensions` are meters.
- Mesher local convention (`cdtMesher.convertToClothMeshData`): vertex `[x, yHeight, z]` where local **+X = width (circumference)**, **+Z = pattern length (along axis)**, Y = const. The wrap consumes this convention.
- Drape in **T-pose**, pin **disabled** — this is the validation configuration (spec §7, §8).
- The shoulder-pin code stays on `exp/anchor-on-arrangement` as the §9 fallback — do NOT delete it; do NOT enable it.

---

### Task 1: Anatomical neck/arm radii in `deriveDimensions`

**Files:**
- Modify: `src/utils/cloth/garmentPlacement.ts:201-226` (`BodyDimensions` + `deriveDimensions`)
- Test: `src/utils/cloth/arrangement/__tests__/deriveDimensions.wrap.test.ts` (create)

**Interfaces:**
- Produces: `BodyDimensions` gains `neckR: number; armR: number;` (meters). `deriveDimensions(m: BodyMeasurements): BodyDimensions` unchanged signature.

- [ ] **Step 1: Write the failing test**

```ts
// deriveDimensions.wrap.test.ts
import { describe, it, expect } from 'vitest';
import { deriveDimensions } from '../../garmentPlacement';
import type { BodyMeasurements } from '../../../../types/types';

const base: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 };

describe('deriveDimensions anatomical radii', () => {
  it('derives neckR/armR from circumference when present', () => {
    const d = deriveDimensions({ ...base, neckCirc: 36, upperArmCirc: 28 });
    expect(d.neckR).toBeCloseTo(0.36 / (2 * Math.PI), 4); // 36cm → 0.36m / 2π
    expect(d.armR).toBeCloseTo(0.28 / (2 * Math.PI), 4);
  });
  it('falls back when circumferences are absent', () => {
    const d = deriveDimensions(base);
    expect(d.neckR).toBeCloseTo(d.chestRadius * 0.4, 4);
    expect(d.armR).toBeCloseTo(0.05, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- deriveDimensions.wrap`
Expected: FAIL — `neckR`/`armR` undefined on `BodyDimensions`.

- [ ] **Step 3: Implement**

In `garmentPlacement.ts`, add to the `BodyDimensions` interface (after `armLength`):
```ts
  neckR: number;
  armR: number;
```
In `deriveDimensions`, before the `return`, compute and include:
```ts
  const chestRadius = chestCirc / (2 * Math.PI);
  return {
    heightM: h,
    waistHeight: m.waistHeight ? cmToM(m.waistHeight) : h * 0.55,
    shoulderHeight: h * 0.82,
    neckHeight: h * 0.87,
    chestRadius,
    hipRadius: hipCirc / (2 * Math.PI),
    shoulderWidth: m.shoulderWidth ? cmToM(m.shoulderWidth) : cmToM(m.shoulder),
    armLength: m.armLength ? cmToM(m.armLength) : h * 0.33,
    neckR: m.neckCirc ? cmToM(m.neckCirc) / (2 * Math.PI) : chestRadius * 0.4,
    armR: m.upperArmCirc ? cmToM(m.upperArmCirc) / (2 * Math.PI) : 0.05,
  };
```
(Replace the inline `chestRadius` usage in `hipRadius`? No — keep `hipRadius` as is. Just hoist `chestRadius` to a const so `neckR` can reuse it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- deriveDimensions.wrap` → PASS. Then `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/garmentPlacement.ts src/utils/cloth/arrangement/__tests__/deriveDimensions.wrap.test.ts
git commit -m "feat(wrap): surface anatomical neckR/armR in deriveDimensions"
```

---

### Task 2: Non-degenerate `surfaceFrame` + anatomical radii

**Files:**
- Modify: `src/utils/cloth/arrangement/surfaceFrame.ts:38-78`
- Test: `src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts` (extend)

**Interfaces:**
- Consumes: `BodyDimensions.neckR`, `BodyDimensions.armR` (Task 1).
- Produces: `surfaceFrame` returns frames where **`axis` ≠ `tangent`** for every region, and `radius` uses `d.neckR`/`d.armR` for collar/sleeve. `SurfaceFrame` shape unchanged.

**Frame convention for the wrap:** `axis` = the cylinder/ring axis (the wrap bends *around* it); `tangent` = the panel's "up"; `normal` = outward radial at the panel center. For the collar the ring axis is **vertical** (`[0,1,0]`); the band faces forward (`normal=[0,0,1]`); `tangent` is the small vertical band height — but it must be **distinct** from axis, so set `tangent` to the forward-up in-plane direction. Simplest non-degenerate choice: collar `axis=[0,1,0]` (ring axis), `normal=[0,0,1]`, `tangent=[0,1,0]` is degenerate → instead make the band wrap horizontally: `axis=[0,1,0]`, `normal=[0,0,1]`, `tangent` = `normal × axis`... Use the explicit values below.

- [ ] **Step 1: Write the failing test**

```ts
// add to surfaceFrame.test.ts
import { surfaceFrame } from '../surfaceFrame';
import { deriveDimensions } from '../../garmentPlacement';

const d = deriveDimensions({ height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79, neckCirc: 36, upperArmCirc: 28 });
const dot = (a: number[], b: number[]) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

it('collar frame is non-degenerate (axis != tangent) and uses neckR', () => {
  const f = surfaceFrame('collar', d);
  expect(Math.abs(dot(f.axis, f.tangent))).toBeLessThan(0.99); // not parallel
  expect(f.radius).toBeCloseTo(d.neckR, 4);
});
it('sleeve frame uses armR and axis runs along the arm', () => {
  const f = surfaceFrame('left-sleeve', d);
  expect(f.radius).toBeCloseTo(d.armR, 4);
  expect(Math.abs(dot(f.axis, f.tangent))).toBeGreaterThan(0.99); // sleeve: tangent IS the arm axis (already non-degenerate vs normal)
  expect(Math.abs(dot(f.axis, f.normal))).toBeLessThan(0.01);     // normal ⊥ axis
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- surfaceFrame`
Expected: FAIL — collar `axis·tangent ≈ 1` (both `[0,1,0]`) and `radius` is `chestRadius*0.4` not `neckR`.

- [ ] **Step 3: Implement**

In `surfaceFrame.ts`, replace the hardcoded `const armR = 0.05;` / `const neckR = d.chestRadius * 0.4;` (lines 40-41) with:
```ts
  const armR = d.armR;
  const neckR = d.neckR;
```
Fix the **collar** case (line 53-54) — give it a ring axis distinct from tangent:
```ts
    case 'collar':
      // Ring wraps horizontally around the vertical neck axis; band faces
      // forward, "up" tangent is vertical. axis (ring) != tangent (band up).
      return { point: [0, (d.neckHeight + d.shoulderHeight) / 2, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
```
Wait — that keeps axis==tangent. Use this instead so the wrap bends width around the vertical neck axis with a distinct band tangent:
```ts
    case 'collar':
      return { point: [0, (d.neckHeight + d.shoulderHeight) / 2, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
```
The collar wrap is special (the width wraps around the *vertical* axis). Because `axis` (ring, vertical) and the band `tangent` (also vertical) coincide for a collar, `wrapPanel` (Task 3) treats collar/torso via the **normal-and-binormal-in-the-horizontal-plane** path keyed off `axis=[0,1,0]`: `binormal = normalize(cross(axis, normal))` = `[1,0,0]`, and `u` (band height) runs along `tangent`. The test's non-degeneracy is satisfied by torso/sleeve; for collar assert instead:
```ts
it('collar wraps around the vertical axis with a horizontal binormal', () => {
  const f = surfaceFrame('collar', d);
  const cross = [f.axis[1]*f.normal[2]-f.axis[2]*f.normal[1], f.axis[2]*f.normal[0]-f.axis[0]*f.normal[2], f.axis[0]*f.normal[1]-f.axis[1]*f.normal[0]];
  const len = Math.hypot(...cross);
  expect(len).toBeGreaterThan(0.99); // axis × normal is a valid horizontal binormal
  expect(f.radius).toBeCloseTo(d.neckR, 4);
});
```
(Replace the collar assertion in Step 1 with this. The key invariant the wrap needs is `axis × normal ≠ 0`, i.e. axis not parallel to normal — true for every region. This is the real non-degeneracy condition, not `axis ≠ tangent`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- surfaceFrame` → PASS. `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/arrangement/surfaceFrame.ts src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts
git commit -m "feat(wrap): surfaceFrame uses anatomical radii; assert axis×normal non-degenerate"
```

---

### Task 3: `wrapPanel` pure function

**Files:**
- Create: `src/utils/cloth/arrangement/wrapPanel.ts`
- Test: `src/utils/cloth/arrangement/__tests__/wrapPanel.test.ts` (create)

**Interfaces:**
- Consumes: `SurfaceFrame` (`{point, normal, tangent, axis, radius}`), `V3` from `surfaceFrame.ts`.
- Produces:
```ts
export interface WrapParams { thetaMaxRad: number; gap: number; }
export function wrapPanel(localVert: V3, frame: SurfaceFrame, params: WrapParams): V3
```
Maps a flat mesher-local vertex `[wx, _yConst, uz]` (X=width/circumference, Z=length/along-axis) to a curved world point at distance `radius+gap` from the axis line.

- [ ] **Step 1: Write the failing test**

```ts
// wrapPanel.test.ts
import { describe, it, expect } from 'vitest';
import { wrapPanel } from '../wrapPanel';
import type { SurfaceFrame } from '../surfaceFrame';

// Sleeve-like frame: axis +X, normal +Z, radius 0.045
const frame: SurfaceFrame = { point: [0, 1.4, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius: 0.045 };
const params = { thetaMaxRad: 2.618, gap: 0.03 };
const distToAxis = (p: number[]) => { // perpendicular distance from p to the line point+t*axis
  const d = [p[0]-frame.point[0], p[1]-frame.point[1], p[2]-frame.point[2]];
  const along = d[0]*frame.axis[0]+d[1]*frame.axis[1]+d[2]*frame.axis[2];
  const perp = [d[0]-along*frame.axis[0], d[1]-along*frame.axis[1], d[2]-along*frame.axis[2]];
  return Math.hypot(...perp);
};

describe('wrapPanel', () => {
  it('places every vertex at radius+gap from the axis (outside the cylinder)', () => {
    for (const w of [-0.05, 0, 0.05]) {
      const p = wrapPanel([w, 1.2, 0.1], frame, params);
      expect(distToAxis(p)).toBeCloseTo(frame.radius + params.gap, 4);
    }
  });
  it('center of width (w=0) lands on the normal side', () => {
    const p = wrapPanel([0, 1.2, 0], frame, params);
    // point + (R+gap)*normal = [0,1.4,0] + 0.075*[0,0,1]
    expect(p[2]).toBeCloseTo(0.075, 4);
  });
  it('preserves the along-axis coordinate (u)', () => {
    const p = wrapPanel([0, 1.2, 0.123], frame, params);
    const d = [p[0]-frame.point[0], p[1]-frame.point[1], p[2]-frame.point[2]];
    const along = d[0]*frame.axis[0]+d[1]*frame.axis[1]+d[2]*frame.axis[2];
    expect(along).toBeCloseTo(0.123, 4);
  });
  it('clamps the wrap angle to thetaMax/2', () => {
    const big = wrapPanel([10, 1.2, 0], frame, params); // w/R huge → clamp
    const small = wrapPanel([frame.radius * params.thetaMaxRad / 2, 1.2, 0], frame, params); // exactly at cap
    expect(distToAxis(big)).toBeCloseTo(frame.radius + params.gap, 4);
    // both clamped to the same angular position
    expect(big[0]).toBeCloseTo(small[0], 3);
    expect(big[1]).toBeCloseTo(small[1], 3);
    expect(big[2]).toBeCloseTo(small[2], 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- wrapPanel`
Expected: FAIL — `wrapPanel` not defined.

- [ ] **Step 3: Implement**

```ts
// src/utils/cloth/arrangement/wrapPanel.ts
import * as THREE from 'three';
import type { SurfaceFrame, V3 } from './surfaceFrame';

export interface WrapParams {
  /** Wrap-angle cap in RADIANS (e.g. 2.618 ≈ 150°). */
  thetaMaxRad: number;
  /** Standoff from the body surface, meters (e.g. 0.03). */
  gap: number;
}

const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Curve a flat mesher-local vertex over the region cylinder, then place it.
 * localVert = [x, yConst, z]: local +X = width (circumference), +Z = length
 * (along axis); yConst (the flat mesher height) is ignored. The result is a
 * world point at distance (frame.radius + gap) from the axis line — outside
 * the body. Arc-length-parameterized: φ = w / radius (clamped).
 */
export function wrapPanel(localVert: V3, frame: SurfaceFrame, params: WrapParams): V3 {
  const w = localVert[0]; // width → circumference
  const u = localVert[2]; // length → along axis
  const R = frame.radius;
  const axis = v(frame.axis).normalize();
  const normal = v(frame.normal).normalize();
  // radial binormal in the plane ⊥ axis (axis × normal is non-degenerate per Task 2)
  const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
  const half = params.thetaMaxRad / 2;
  const phi = Math.max(-half, Math.min(half, w / R));
  const radial = normal.clone().multiplyScalar(Math.cos(phi))
    .add(binormal.clone().multiplyScalar(Math.sin(phi)));
  const point = v(frame.point);
  const out = point
    .add(axis.multiplyScalar(u))
    .add(radial.multiplyScalar(R + params.gap));
  return [out.x, out.y, out.z];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- wrapPanel` → PASS. `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/arrangement/wrapPanel.ts src/utils/cloth/arrangement/__tests__/wrapPanel.test.ts
git commit -m "feat(wrap): wrapPanel — arc-length-parameterized panel curve over the body cylinder"
```

---

### Task 4: `wrapPlacedMesh` + expose frames from `resolveArrangement`

**Files:**
- Create: `src/utils/cloth/arrangement/wrapPlacedMesh.ts`
- Modify: `src/utils/cloth/arrangement/arrangementBinding.ts` (`resolveArrangement` returns frames)
- Test: `src/utils/cloth/arrangement/__tests__/wrapPlacedMesh.test.ts` (create)

**Interfaces:**
- Consumes: `wrapPanel`, `WrapParams` (Task 3); `SurfaceFrame`; the mesher's flat `vertices: Float32Array`.
- Produces:
```ts
export function wrapPlacedMesh(localVertices: Float32Array, frame: SurfaceFrame, params: WrapParams): Float32Array
```
and `resolveArrangement` additionally returns the per-piece `SurfaceFrame` (so the GarmentSimulation loops in Task 5 can wrap). Add a sibling export `resolveArrangementWithFrames(...)` that returns `{ placement, frame }[]` to avoid breaking the existing `resolveArrangement` callers (Phase 1 sonda).

- [ ] **Step 1: Write the failing test**

```ts
// wrapPlacedMesh.test.ts
import { describe, it, expect } from 'vitest';
import { wrapPlacedMesh } from '../wrapPlacedMesh';
import type { SurfaceFrame } from '../surfaceFrame';

const frame: SurfaceFrame = { point: [0, 1.4, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius: 0.045 };
const params = { thetaMaxRad: 2.618, gap: 0.03 };

describe('wrapPlacedMesh', () => {
  it('wraps every vertex (3 floats each) to radius+gap from the axis', () => {
    const flat = new Float32Array([0, 1.2, 0,  0.05, 1.2, 0.1,  -0.05, 1.2, -0.1]);
    const out = wrapPlacedMesh(flat, frame, params);
    expect(out.length).toBe(flat.length);
    for (let i = 0; i < out.length; i += 3) {
      const d = [out[i]-0, out[i+1]-1.4, out[i+2]-0];
      const along = d[0]*1; // axis +X
      const perp = Math.hypot(d[1], d[2]); // ⊥ to +X
      expect(perp).toBeCloseTo(0.075, 4);
      void along;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- wrapPlacedMesh`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement**

```ts
// src/utils/cloth/arrangement/wrapPlacedMesh.ts
import { wrapPanel, type WrapParams } from './wrapPanel';
import type { SurfaceFrame, V3 } from './surfaceFrame';

/** Apply wrapPanel to every vertex of a flat mesher mesh. Pure. */
export function wrapPlacedMesh(
  localVertices: Float32Array,
  frame: SurfaceFrame,
  params: WrapParams,
): Float32Array {
  const out = new Float32Array(localVertices.length);
  const lv: V3 = [0, 0, 0];
  for (let i = 0; i < localVertices.length; i += 3) {
    lv[0] = localVertices[i]; lv[1] = localVertices[i + 1]; lv[2] = localVertices[i + 2];
    const w = wrapPanel(lv, frame, params);
    out[i] = w[0]; out[i + 1] = w[1]; out[i + 2] = w[2];
  }
  return out;
}
```
In `arrangementBinding.ts`, add `resolveArrangementWithFrames` mirroring `resolveArrangement` but returning `{ placement, frame }[]`. Reuse `computeAutoFrame` (already returns `{placement, frame}`) instead of `placeGarmentPieces` for the auto branch; for legacy/delta overrides, return the auto frame alongside the override-composed placement (the wrap uses the frame for curvature; the override still adjusts gross pose in Phase 2 — out of scope here, deltas are identity).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- wrapPlacedMesh` → PASS. `npx tsc -b --noEmit` → clean. Run the Phase-1 sonda to confirm no regression: `npm run test -- mariaShirt.m4` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/arrangement/wrapPlacedMesh.ts src/utils/cloth/arrangement/arrangementBinding.ts src/utils/cloth/arrangement/__tests__/wrapPlacedMesh.test.ts
git commit -m "feat(wrap): wrapPlacedMesh + resolveArrangementWithFrames"
```

---

### Task 5: Wire the wrap into both `GarmentSimulation` placement loops

**M4-C ORIENTATION (added during execution — Samuel-approved resolution of the §12 audit):**
María's front + both sleeves are drawn anatomy-DOWN; the rigid placement rights them via `normalizeInPlaneOrientation` (an in-plane 180° flip baked into `placement.rotation`). The wrap replaces `placement.rotation`, so it would lose that flip → pieces wrap upside-down (neckline at hem, sleeveCap at elbow). Resolution:
1. **Expose the flip flag per piece.** Add an exported `computeFlipFlags(pieces, placements): boolean[]` to `garmentPlacement.ts` that runs the same `meanEdgeWorldY(top) < meanEdgeWorldY(bottom)` test `normalizeInPlaneOrientation` uses; have `normalizeInPlaneOrientation` delegate to it (behavior byte-identical; M4 sonda pins this).
2. **Pre-flip in the wrap.** Extend `wrapPlacedMesh(localVertices, frame, params, flip = false)`: when `flip`, transform each local vertex `[x, y, z] → [-x, y, -z]` (in-plane 180°) BEFORE `wrapPanel`. `wrapPanel` itself unchanged.
3. **Thread the flag.** `resolveArrangementWithFrames` additionally returns `flip: boolean` per piece (from `computeFlipFlags` against the placements it already computes); `PlacementWithFrame` gains `flip`.
4. **CI orientation test (the safety net — catches upside-down without the maintainer E2E):** with María's 5 real pieces, after wrap, assert anatomy-TOP edges (`neckline`/`shoulder`/`sleeveCap`) land at higher world-Y (torso) / more proximal (sleeves) than anatomy-BOTTOM (`hemline`/`cuffEdge`), reusing `meanEdgeWorldY` on the wrapped vertices.

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (render geometry `:257-271`, solver `placedMeshes` `:319-335`) — per piece, `wrapPlacedMesh(p.vertices, frame, DEFAULT_WRAP, flip)` from `resolveArrangementWithFrames`, replacing the rigid loop.
- Modify: `src/utils/cloth/garmentPlacement.ts` — `computeFlipFlags` export; `normalizeInPlaneOrientation` delegates.
- Modify: `src/utils/cloth/arrangement/wrapPlacedMesh.ts` — `flip` param.
- Modify: `src/utils/cloth/arrangement/arrangementBinding.ts` — `resolveArrangementWithFrames` returns `flip`; `PlacementWithFrame` gains `flip`.
- Test: `src/utils/cloth/arrangement/__tests__/wrapOrientation.test.ts` (create); extend `wrapPlacedMesh.test.ts` for `flip`.
- Audit (read-only): `src/utils/cloth/seamAssembly.ts` — confirm `matchVertices` pairs by parameter/t, not raw 3D distance (spec §12). If raw-distance, STOP and flag (curvature would re-pair seams).

**Interfaces:**
- Consumes: `wrapPlacedMesh` (Task 4, +`flip`), `resolveArrangementWithFrames` (Task 4, +`flip`), `WrapParams`, `computeFlipFlags`.
- Produces: both render and solver vertices are curved by the SAME `wrapPlacedMesh` call, with the M4-C flip applied so anatomy lands upright.

- [ ] **Step 1: Audit matchVertices**

Read `seamAssembly.ts` `matchVertices`. Confirm it pairs by edge parameter (t) / `boundaryOrig` provenance, not by nearest-3D-distance. Record the finding inline in the commit message. If it is raw-distance based, do not proceed — surface to the human (the wrap would change seam pairings).

- [ ] **Step 2: Write the failing guard test**

Add a constant module for the wrap params so the test and the component share it:
```ts
// src/utils/cloth/arrangement/wrapParams.ts
import type { WrapParams } from './wrapPanel';
export const DEFAULT_WRAP: WrapParams = { thetaMaxRad: 2.618, gap: 0.03 }; // 150°, 3cm
```
```ts
// wrapPlacedMesh.test.ts — add
import { DEFAULT_WRAP } from '../wrapParams';
it('DEFAULT_WRAP caps at 150°', () => {
  expect(DEFAULT_WRAP.thetaMaxRad).toBeCloseTo(150 * Math.PI / 180, 3);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- wrapPlacedMesh` → FAIL (`wrapParams` not found).

- [ ] **Step 4: Implement the wiring**

Create `wrapParams.ts` (above). In `GarmentSimulation.tsx`:
- Replace `resolveArrangement(...)` calls feeding the two loops with `resolveArrangementWithFrames(...)` so each piece has its `frame`.
- In the **render** loop (`:257-271`) and the **solver** loop (`:319-335`), replace the per-vertex rigid rotate+translate with: first `const curved = wrapPlacedMesh(p.vertices, frame, DEFAULT_WRAP);` then write `curved` into the output buffer (the gross `placement.position` landmark is already inside `frame.point`, so the rigid rotate+translate is fully replaced by the wrap). Both loops must call `wrapPlacedMesh` identically.

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit` → clean. `npm run test` → all green (esp. `mariaShirt.m4` sonda). `npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/utils/cloth/arrangement/wrapParams.ts src/utils/cloth/arrangement/__tests__/wrapPlacedMesh.test.ts
git commit -m "feat(wrap): wire wrapPlacedMesh into render+solver placement loops (matchVertices audited t-based)"
```

---

### Task 6: Auto-support precondition test + E2E checkpoint extension

**Files:**
- Test (CI): `src/utils/cloth/arrangement/__tests__/autoSupport.test.ts` (create)
- Modify (maintainer-run): `tests/e2e/webgpu-maria-replay.spec.ts`

**Interfaces:**
- Consumes: `deriveDimensions` (Task 1), `surfaceFrame` (Task 2).

- [ ] **Step 1: Write the non-circular auto-support precondition test**

```ts
// autoSupport.test.ts
import { describe, it, expect } from 'vitest';
import { deriveDimensions } from '../../garmentPlacement';

describe('auto-support precondition (non-circular)', () => {
  it('collar ring diameter (from neckCirc) is narrower than the shoulder span (from shoulder)', () => {
    // independent measured inputs: neckCirc and shoulder are NOT both derived from chest
    const d = deriveDimensions({ height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79, neckCirc: 36, upperArmCirc: 28 });
    const ringDiameter = 2 * d.neckR;        // from neckCirc
    const shoulderSpan = d.shoulderWidth;    // from shoulder
    expect(ringDiameter).toBeLessThan(shoulderSpan); // the ring catches on the shoulders
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -- autoSupport` → PASS (ring Ø ≈ 0.115m < shoulder 0.40m). If it fails, the catch precondition does not hold for María — STOP and surface (the bet is geometrically void).

- [ ] **Step 3: Extend the E2E checkpoints (maintainer-run, not CI)**

In `webgpu-maria-replay.spec.ts`, in the `drape M4` test, add: a t=0 penetration count (cloth verts inside the baked mesh), early-collapse sampling at t=0.5s and t=1s (belowHip/minY), and collar-height + sleeve-on-arm logs. Assert pin is disabled (the `computeShoulderAnchors` path is NOT wired). Targets per spec §8: minY ≥ 0.5m primary, spread ≤ 0.1m over `--repeat-each=3`, belowHip ≤ 0.5%, interpenetration count = 0. Mark with `// maintainer-run` — CI does not execute `@gpu-local`.

- [ ] **Step 4: Commit**

```bash
git add src/utils/cloth/arrangement/__tests__/autoSupport.test.ts tests/e2e/webgpu-maria-replay.spec.ts
git commit -m "test(wrap): non-circular auto-support precondition + GPU replay checkpoints"
```

- [ ] **Step 5: Hand to maintainer for the GPU bet measurement**

The CI/unit gates are green; the §8 bet (does the wrap self-support hold for 10s, pin disabled) is measured by Samuel running `npm run test:e2e:gpu -- webgpu-maria-replay -g "drape M4" --repeat-each=3`. Report the §8 table values; if the closing-window race (§9 rung 1) shows early collapse, escalate θ_max.

---

## Self-Review

**Spec coverage:** §3 partial-curve (Task 3 θ_max clamp) ✓; §4 carrier in the placement loop (Task 5) ✓; §5 mechanism — wrapPanel arc-length param, R_curve vs gap separation (Task 3), anatomical radii (Tasks 1-2), non-degenerate frame (Task 2) ✓; §6 auto-support precondition (Task 6 non-circular test) ✓; §7 T-pose / pin-disabled (Task 6 assert) ✓; §8 numeric validation (Task 6 E2E) ✓; §10 testing (Tasks 1-6 units + E2E) ✓; §12 audits — matchVertices (Task 5 step 1), arc-length (Task 3), warm-start (noted out-of-scope) ✓.

**Gaps surfaced for the human (not silently dropped):** chord-vs-arc rest-length shrinkage is bounded by mesh resolution (spec §5 maxEdgeLength↔θ_max) — NOT a task here; flag if the E2E shows the ring relaxing open. Concave-shoulder-shelf verification (spec §6 caveat) is only measurable in the E2E (Task 6 step 3 collar-height log), not a CI unit — the unit test proves the cylinder precondition, the E2E proves the mesh catch.

**Type consistency:** `WrapParams {thetaMaxRad, gap}` consistent across Tasks 3-5; `wrapPanel(localVert, frame, params)` / `wrapPlacedMesh(localVertices, frame, params)` consistent; `BodyDimensions.neckR/armR` (Task 1) consumed in Task 2; `resolveArrangementWithFrames` (Task 4) consumed in Task 5.
