# Arrangement Points 3D — Phase 1 (collision-aware placement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place each garment piece tangent to and OUTSIDE the avatar body in 3D (orientation derived from a body surface frame, not a hard-coded constant), so pieces no longer interpenetrate the avatar at t=0 — and store arrangement in a grading-safe-capable format.

**Architecture:** A pure `surfaceFrame(region, dims, axisHint?)` returns the body surface frame (point/normal/tangent/axis/radius) at each region's landmark. `computeAutoFrame`/`computePlacement` build the piece pose from that frame plus a collision-aware normal offset. `resolveArrangement` composes the auto pose with a per-piece `ArrangementBinding` delta (grading-safe; identity = pure auto), resolved once with a skeleton-ready gate and parametric fallback. Phase 1 uses the parametric default limb axis (bone-axis refinement and user-edit UX are later phases).

**Tech Stack:** TypeScript, three.js (`Matrix4.makeBasis` / `Euler` for frame→euler), Vitest. Spec: `docs/superpowers/specs/2026-06-21-arrangement-points-3d-design.md`.

## Global Constraints

- Typecheck with `npx tsc -b --noEmit` (build mode), NOT bare `tsc`.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`. Lint is `--max-warnings=0` on staged `*.{ts,tsx}` via the pre-commit hook. No `--no-verify`.
- IDs via `newId()` from `src/utils/ids.ts` (not relevant to Phase 1; no new persisted IDs).
- The `@gpu-local` E2E (`webgpu-maria-replay`) is run by the maintainer, NOT CI. Do not gate on it.
- Branch: `feat/arrangement-points-3d` (already created from `main`).
- Do NOT change the persisted `arrangementOverrides` store shape in Phase 1 (no user deltas are written yet). `ArrangementBinding` is defined and `resolveArrangement` handles it, but production only ever passes legacy `[x,y,z]` or empty overrides this phase.

---

### Task 1: `surfaceFrame` — body surface frame per region (pure)

**Files:**
- Create: `src/utils/cloth/arrangement/surfaceFrame.ts`
- Modify: `src/utils/cloth/garmentPlacement.ts` (export `BodyDimensions` interface, currently unexported at line ~200)
- Test: `src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts`

**Interfaces:**
- Consumes: `BodyDimensions` (from `garmentPlacement.ts`: `{heightM, waistHeight, shoulderHeight, neckHeight, chestRadius, hipRadius, shoulderWidth, armLength}`), `BodyRegion` (from `garmentPlacement.ts`).
- Produces:
  - `interface SurfaceFrame { point: V3; normal: V3; tangent: V3; axis: V3; radius: number }` where `type V3 = [number, number, number]`.
  - `function surfaceFrame(region: BodyRegion, d: BodyDimensions, axisHint?: V3): SurfaceFrame`
  - `function frameToEulerXYZ(normal: V3, tangent: V3): V3` (rotation that maps a flat piece — local +X=width, +Y=normal, +Z=length — so local +Y→`normal` and local +Z→`tangent`).

- [ ] **Step 1: Export `BodyDimensions`**

In `src/utils/cloth/garmentPlacement.ts`, change `interface BodyDimensions {` (line ~200) to `export interface BodyDimensions {`. No other change.

- [ ] **Step 2: Write the failing test**

Create `src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { surfaceFrame, frameToEulerXYZ } from '../surfaceFrame';
import type { BodyDimensions } from '../../garmentPlacement';

const D: BodyDimensions = {
  heightM: 1.68, waistHeight: 0.924, shoulderHeight: 1.3776, neckHeight: 1.4616,
  chestRadius: 0.14, hipRadius: 0.1528, shoulderWidth: 0.4, armLength: 0.6,
};

const len = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('surfaceFrame', () => {
  it('returns an orthonormal outward frame for the front torso', () => {
    const f = surfaceFrame('front-torso', D);
    expect(len(f.normal)).toBeCloseTo(1, 5);
    expect(len(f.tangent)).toBeCloseTo(1, 5);
    expect(dot(f.normal, f.tangent)).toBeCloseTo(0, 5);  // orthogonal
    expect(f.normal[2]).toBeGreaterThan(0);               // front faces +Z
    expect(f.radius).toBeCloseTo(D.chestRadius, 5);
  });

  it('aligns the sleeve tangent with the arm axis and normal outward', () => {
    const f = surfaceFrame('left-sleeve', D);
    expect(dot(f.normal, f.tangent)).toBeCloseTo(0, 5);
    expect(dot(f.normal, f.axis)).toBeCloseTo(0, 5);      // normal radial to the limb axis
    expect(f.point[0]).toBeLessThan(0);                   // left arm is -X
  });

  it('honors an axisHint (A-pose arm tilted down)', () => {
    const hint: [number, number, number] = [-0.7, -0.7, 0];
    const f = surfaceFrame('left-sleeve', D, hint);
    expect(dot(f.normal, f.axis)).toBeCloseTo(0, 5);
    // axis follows the hint direction
    expect(f.axis[1]).toBeLessThan(0);
  });

  it('frameToEulerXYZ maps a flat piece local +Y to the normal and +Z to the tangent', () => {
    const normal: [number, number, number] = [0, 0, 1];
    const tangent: [number, number, number] = [0, 1, 0];
    const e = frameToEulerXYZ(normal, tangent);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'XYZ'));
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(localY.z).toBeCloseTo(1, 5);  // local +Y → world normal (+Z)
    expect(localZ.y).toBeCloseTo(1, 5);  // local +Z → world tangent (+Y)
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts`
Expected: FAIL — `surfaceFrame`/`frameToEulerXYZ` not found.

- [ ] **Step 4: Implement `surfaceFrame.ts`**

Create `src/utils/cloth/arrangement/surfaceFrame.ts`:

```ts
/**
 * surfaceFrame — body surface frame at a garment region's landmark (#887 / Phase 1).
 *
 * Models the avatar as implicit cylinders (deriveDimensions). For each region
 * returns {point (on the cylinder axis), normal (outward), tangent (piece "up"),
 * axis (cylinder axis), radius}. Position is parametric (grading-safe). The limb
 * axis defaults to a T-pose direction; `axisHint` (from the bone, when available)
 * overrides it. Pure function — no THREE state, no avatar scene access.
 */
import * as THREE from 'three';
import type { BodyDimensions, BodyRegion } from '../garmentPlacement';

export type V3 = [number, number, number];

export interface SurfaceFrame {
  point: V3;     // landmark point on the body primitive axis
  normal: V3;    // outward unit normal (piece faces this way)
  tangent: V3;   // unit "up"/length direction of the piece
  axis: V3;      // unit cylinder axis direction at the landmark
  radius: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const toV3 = (t: THREE.Vector3): V3 => [t.x, t.y, t.z];

/** Outward radial normal perpendicular to `axis`, biased toward `prefer` (default +Z). */
function radialNormal(axis: THREE.Vector3, prefer = v(0, 0, 1)): THREE.Vector3 {
  // Project `prefer` onto the plane perpendicular to axis.
  const n = prefer.clone().sub(axis.clone().multiplyScalar(prefer.dot(axis)));
  if (n.lengthSq() < 1e-8) {
    // prefer is parallel to axis — fall back to +Y, then +X.
    const alt = Math.abs(axis.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    n.copy(alt.sub(axis.clone().multiplyScalar(alt.dot(axis))));
  }
  return n.normalize();
}

export function surfaceFrame(region: BodyRegion, d: BodyDimensions, axisHint?: V3): SurfaceFrame {
  const midTorso = (d.shoulderHeight + d.waistHeight) / 2;
  const armR = 0.05; // parametric arm radius (Phase 1 constant; mirrors AnchorPoints armR scale)
  const neckR = d.chestRadius * 0.4;

  switch (region) {
    case 'front-torso':
      return { point: [0, midTorso, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.chestRadius };
    case 'back-torso':
      return { point: [0, midTorso, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.chestRadius };
    case 'front-skirt':
    case 'waistband':
      return { point: [0, d.waistHeight, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.hipRadius };
    case 'back-skirt':
      return { point: [0, d.waistHeight, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.hipRadius };
    case 'collar':
      return { point: [0, (d.neckHeight + d.shoulderHeight) / 2, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
    case 'hood':
      return { point: [0, d.neckHeight, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
    case 'left-sleeve':
    case 'cuff-left': {
      const axis = (axisHint ? v(...axisHint) : v(-1, 0, 0)).normalize();
      const point = v(-(d.shoulderWidth / 2), d.shoulderHeight, 0).add(axis.clone().multiplyScalar(d.armLength / 2));
      const normal = radialNormal(axis);
      const tangent = axis.clone(); // sleeve length runs along the arm
      return { point: toV3(point), normal: toV3(normal), tangent: toV3(tangent), axis: toV3(axis), radius: armR };
    }
    case 'right-sleeve':
    case 'cuff-right': {
      const axis = (axisHint ? v(...axisHint) : v(1, 0, 0)).normalize();
      const point = v(d.shoulderWidth / 2, d.shoulderHeight, 0).add(axis.clone().multiplyScalar(d.armLength / 2));
      const normal = radialNormal(axis);
      const tangent = axis.clone();
      return { point: toV3(point), normal: toV3(normal), tangent: toV3(tangent), axis: toV3(axis), radius: armR };
    }
    case 'unknown':
    default:
      // Fallback: front-torso-like frame so the piece still lands on the body.
      return { point: [0, midTorso, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: Math.max(d.chestRadius, d.hipRadius) };
  }
}

/**
 * Rotation (Euler XYZ) placing a flat piece (local +X = width, +Y = surface
 * normal, +Z = length) so local +Y → `normal` and local +Z → `tangent`.
 */
export function frameToEulerXYZ(normal: V3, tangent: V3): V3 {
  const n = v(...normal).normalize();
  const t = v(...tangent).normalize();
  // Gram-Schmidt: orthogonalize tangent against normal.
  t.sub(n.clone().multiplyScalar(t.dot(n)));
  if (t.lengthSq() < 1e-8) t.copy(Math.abs(n.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0)).sub(n.clone().multiplyScalar(n.dot(v(0, 1, 0))));
  t.normalize();
  const b = new THREE.Vector3().crossVectors(t, n).normalize(); // local +X (width)
  const m = new THREE.Matrix4().makeBasis(b, n, t);             // cols = images of local X,Y,Z
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  return [e.x, e.y, e.z];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/utils/cloth/arrangement/surfaceFrame.ts src/utils/cloth/arrangement/__tests__/surfaceFrame.test.ts src/utils/cloth/garmentPlacement.ts
git commit -m "feat(arrangement): surfaceFrame — body surface frame per region (#887 Phase 1)"
```

---

### Task 2: Collision-aware `computePlacement` (orientation from frame + normal offset)

**Files:**
- Modify: `src/utils/cloth/garmentPlacement.ts` (add `computeAutoFrame`; rewrite the body of `computePlacement` at lines ~238-346 to delegate to it)
- Test: `src/utils/cloth/arrangement/__tests__/placement.collision.test.ts` (new)

**Interfaces:**
- Consumes: `surfaceFrame`, `frameToEulerXYZ`, `SurfaceFrame` (Task 1); `deriveDimensions`, `PlacementResult`, `GAP` (existing).
- Produces:
  - `function computeAutoFrame(region: BodyRegion, measurements: BodyMeasurements, pieceGeometry: {widthMm:number; heightMm:number}, axisHint?: V3): { placement: PlacementResult; frame: SurfaceFrame }`
  - `computePlacement(region, measurements, pieceGeometry)` — unchanged signature, now returns `computeAutoFrame(...).placement`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/cloth/arrangement/__tests__/placement.collision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeAutoFrame } from '../../garmentPlacement';
import type { BodyMeasurements } from '../../../../types/types';

const MEAS = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const GEOM = { widthMm: 300, heightMm: 400 };

/** Distance from world point p to the infinite line through `point` along unit `axis`. */
function distToAxis(p: THREE.Vector3, point: THREE.Vector3, axis: THREE.Vector3): number {
  const w = p.clone().sub(point);
  return w.clone().sub(axis.clone().multiplyScalar(w.dot(axis))).length();
}

describe('computeAutoFrame — collision-aware placement', () => {
  it('places every corner of the piece OUTSIDE the body cylinder (no gross interpenetration)', () => {
    for (const region of ['front-torso', 'left-sleeve', 'right-sleeve', 'collar'] as const) {
      const { placement, frame } = computeAutoFrame(region, MEAS, GEOM);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
      );
      const center = new THREE.Vector3(...placement.position);
      const axisPoint = new THREE.Vector3(...frame.point);
      const axisDir = new THREE.Vector3(...frame.axis).normalize();
      // Piece is flat: width along local X, length along local Z. Sample its 4 corners.
      const hw = (GEOM.widthMm / 1000) / 2, hl = (GEOM.heightMm / 1000) / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const corner = new THREE.Vector3(sx * hw, 0, sz * hl).applyQuaternion(q).add(center);
        expect(distToAxis(corner, axisPoint, axisDir)).toBeGreaterThanOrEqual(frame.radius - 1e-6);
      }
    }
  });

  it('faces the piece outward (transformed local +Y ≈ frame normal)', () => {
    const { placement, frame } = computeAutoFrame('front-torso', MEAS, GEOM);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
    );
    const faced = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(faced.dot(new THREE.Vector3(...frame.normal))).toBeGreaterThan(0.99);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/placement.collision.test.ts`
Expected: FAIL — `computeAutoFrame` not exported.

- [ ] **Step 3: Implement `computeAutoFrame` and rewire `computePlacement`**

In `src/utils/cloth/garmentPlacement.ts`, add near the top of the imports:

```ts
import { surfaceFrame, frameToEulerXYZ, type SurfaceFrame, type V3 } from './arrangement/surfaceFrame';
```

Replace the body of `computePlacement` (lines ~238-346, the big `switch (region)`) with a delegation, and add `computeAutoFrame` above it:

```ts
/**
 * Collision-aware auto pose for a region (#887 Phase 1): position = surface
 * landmark + outward normal · (radius + GAP) — tangent to and OUTSIDE the body
 * cylinder — and orientation from the surface frame (replaces the old hard-coded
 * per-region rotation that placed sleeves as a flat z=0 plane through the arm).
 */
export function computeAutoFrame(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceGeometry: { widthMm: number; heightMm: number },
  axisHint?: V3,
): { placement: PlacementResult; frame: SurfaceFrame } {
  const d = deriveDimensions(measurements);
  const frame = surfaceFrame(region, d, axisHint);
  const pH = mmToM(pieceGeometry.heightMm);

  // Hang skirts/hoods/cuffs from their landmark by half the piece height along
  // the tangent, matching the old vertical-centering behaviour.
  const hang = (region === 'front-skirt' || region === 'back-skirt') ? pH / 2 : 0;

  const offset = frame.radius + GAP;
  const position: [number, number, number] = [
    frame.point[0] + frame.normal[0] * offset - frame.tangent[0] * hang,
    frame.point[1] + frame.normal[1] * offset - frame.tangent[1] * hang,
    frame.point[2] + frame.normal[2] * offset - frame.tangent[2] * hang,
  ];
  const rotation = frameToEulerXYZ(frame.normal, frame.tangent);
  return { placement: { position, rotation }, frame };
}

export function computePlacement(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceGeometry: { widthMm: number; heightMm: number },
): PlacementResult {
  return computeAutoFrame(region, measurements, pieceGeometry).placement;
}
```

Keep `deriveDimensions`, `placeGarmentPieces`, `applyArrangementOverrides`, `placementLocalToWorld`, and the in-plane orientation normalization untouched — they consume `PlacementResult`, whose shape is unchanged.

- [ ] **Step 4: Run the new test, then the full suite**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/placement.collision.test.ts`
Expected: PASS (2 tests).

Run: `npx vitest run src/utils/cloth/__tests__/garmentPlacement.test.ts`
Expected: PASS. If any assertion checks a literal `rotation` value from the old hard-coded constants, update it to the frame-derived rotation (read the actual value from a one-off `console.log` and pin it). Region-detection assertions are unaffected.

Run: `npm run test`
Expected: PASS. Watch the autoSew/world-refine and M4 placement-coherence suites (the `placementLocalToWorld` / `mariaShirt.m4` sonda). If they break, the failure is the orientation change interacting with world refinement — reconcile by confirming the new orientation still faces outward (Step 1's facing test); do not revert the collision offset.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: clean.

```bash
git add src/utils/cloth/garmentPlacement.ts src/utils/cloth/arrangement/__tests__/placement.collision.test.ts src/utils/cloth/__tests__/garmentPlacement.test.ts
git commit -m "feat(arrangement): collision-aware computePlacement — pieces start outside the body (#887 Phase 1)"
```

---

### Task 3: `ArrangementBinding` + `resolveArrangement` (grading-safe compose)

**Files:**
- Create: `src/utils/cloth/arrangement/arrangementBinding.ts`
- Modify: `src/utils/cloth/garmentPlacement.ts` (export the existing `outlineBBox` helper at line ~41 — change `function outlineBBox` to `export function outlineBBox` — so the binding module reuses it instead of duplicating the bbox computation)
- Test: `src/utils/cloth/arrangement/__tests__/arrangementBinding.test.ts`

**Interfaces:**
- Consumes: `computeAutoFrame` (Task 2), `detectBodyRegion`, `PlacementResult`, `BodyMeasurements`, `PatternPiece`; `V3`, `SurfaceFrame` (Task 1).
- Produces:
  - `interface ArrangementBinding { space: 'frame'; posDelta: V3; rotDelta: [number,number,number,number] }`
  - `type ArrangementOverride = ArrangementBinding | V3` (V3 = legacy world position)
  - `function resolveArrangement(pieces: PatternPiece[], measurements: BodyMeasurements, overrides: Record<string, ArrangementOverride> | undefined, opts?: { skeletonReady?: boolean; axisHints?: Record<string, V3> }): PlacementResult[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/cloth/arrangement/__tests__/arrangementBinding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveArrangement, type ArrangementBinding } from '../arrangementBinding';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MEAS_A = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const MEAS_B = { ...MEAS_A, chest: 104, hips: 112 } as BodyMeasurements; // graded up

function piece(id: string, name: string): PatternPiece {
  return {
    id, name, category: undefined as never, side: undefined as never,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

describe('resolveArrangement', () => {
  const front = piece('p1', 'Front');

  it('identity (no override) equals the auto placement', () => {
    const [auto] = resolveArrangement([front], MEAS_A, undefined);
    const [none] = resolveArrangement([front], MEAS_A, {});
    expect(none.position).toEqual(auto.position);
    expect(none.rotation).toEqual(auto.rotation);
  });

  it('legacy [x,y,z] override replaces position in WORLD space (does not track grading)', () => {
    const ov = { p1: [0.1, 1.0, 0.2] as [number, number, number] };
    const [a] = resolveArrangement([front], MEAS_A, ov);
    const [b] = resolveArrangement([front], MEAS_B, ov);
    expect(a.position).toEqual([0.1, 1.0, 0.2]);
    expect(b.position).toEqual([0.1, 1.0, 0.2]); // identical across sizes = NOT grading-safe
  });

  it('frame-delta binding tracks the graded body (grading-safe)', () => {
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0.05, 0, 0], rotDelta: [0, 0, 0, 1] };
    const [autoA] = resolveArrangement([front], MEAS_A, {});
    const [a] = resolveArrangement([front], MEAS_A, { p1: binding });
    const [autoB] = resolveArrangement([front], MEAS_B, {});
    const [b] = resolveArrangement([front], MEAS_B, { p1: binding });
    // The auto frame MOVED with the grade (wider chest → larger +Z offset).
    expect(autoB.position[2]).toBeGreaterThan(autoA.position[2]);
    // The delta stays frame-relative: pose tracks the graded auto frame, not a fixed world point.
    const deltaA = a.position[2] - autoA.position[2];
    const deltaB = b.position[2] - autoB.position[2];
    expect(deltaB).toBeCloseTo(deltaA, 6); // same body-relative offset at both sizes
    expect(b.position[2]).not.toBeCloseTo(a.position[2], 4); // absolute world pos changed with grade
  });

  it('falls back to parametric placement when skeletonReady is false (no NaN, no origin snap)', () => {
    const [p] = resolveArrangement([piece('s1', 'Left Sleeve')], MEAS_A, {}, { skeletonReady: false });
    expect(p.position.every((n) => Number.isFinite(n))).toBe(true);
    expect(p.position).not.toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/arrangementBinding.test.ts`
Expected: FAIL — `resolveArrangement` not found.

- [ ] **Step 3: Implement `arrangementBinding.ts`**

Create `src/utils/cloth/arrangement/arrangementBinding.ts`:

```ts
/**
 * resolveArrangement — compose the collision-aware auto pose with a per-piece
 * binding delta, ONCE (frozen) (#887 Phase 1).
 *
 * Grading-safe format: `posDelta` is in the landmark's local frame, `rotDelta`
 * is a quaternion relative to the surface frame, so a graded size re-derives the
 * auto frame (deriveDimensions) and the delta rides along. Legacy `[x,y,z]`
 * overrides are world-space position replacements (back-compat; NOT grading-safe).
 * Skeleton-not-ready resolves with the parametric default axis — never snaps to
 * the world origin (which would seed the avatar with an in-body NaN cascade).
 */
import * as THREE from 'three';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';
import { computeAutoFrame, detectBodyRegion, outlineBBox, type PlacementResult } from '../garmentPlacement';
import type { V3 } from './surfaceFrame';

export interface ArrangementBinding {
  space: 'frame';
  posDelta: V3;                                  // in the auto frame's local basis
  rotDelta: [number, number, number, number];    // quaternion relative to the auto frame
}

export type ArrangementOverride = ArrangementBinding | V3;

function isBinding(o: ArrangementOverride): o is ArrangementBinding {
  return !Array.isArray(o) && (o as ArrangementBinding).space === 'frame';
}

function pieceGeometryOf(p: PatternPiece): { widthMm: number; heightMm: number } {
  const { width, height } = outlineBBox(p.outline); // reuse garmentPlacement helper (no duplication)
  return { widthMm: width, heightMm: height };
}

export function resolveArrangement(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
  overrides: Record<string, ArrangementOverride> | undefined,
  opts?: { skeletonReady?: boolean; axisHints?: Record<string, V3> },
): PlacementResult[] {
  return pieces.map((p) => {
    const region = detectBodyRegion(p);
    // Skeleton not ready → ignore bone axis hints, use the parametric default.
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    const { placement, frame } = computeAutoFrame(region, measurements, pieceGeometryOf(p), axisHint);

    const ov = overrides?.[p.id];
    if (!ov) return placement;

    if (!isBinding(ov)) {
      // Legacy world-space position override (back-compat, position only).
      return { position: ov, rotation: placement.rotation };
    }

    // Frame-delta compose: posDelta in the frame basis, rotDelta relative to the frame.
    const n = new THREE.Vector3(...frame.normal).normalize();
    const t = new THREE.Vector3(...frame.tangent).normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    const worldPosDelta = b.clone().multiplyScalar(ov.posDelta[0])
      .add(n.clone().multiplyScalar(ov.posDelta[1]))
      .add(t.clone().multiplyScalar(ov.posDelta[2]));
    const position: V3 = [
      placement.position[0] + worldPosDelta.x,
      placement.position[1] + worldPosDelta.y,
      placement.position[2] + worldPosDelta.z,
    ];
    const autoQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
    );
    const deltaQ = new THREE.Quaternion(ov.rotDelta[0], ov.rotDelta[1], ov.rotDelta[2], ov.rotDelta[3]);
    const e = new THREE.Euler().setFromQuaternion(autoQ.multiply(deltaQ), 'XYZ');
    return { position, rotation: [e.x, e.y, e.z] };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/arrangementBinding.test.ts`
Expected: PASS (4 tests, including the grading-safe test).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --noEmit`
Expected: clean.

```bash
git add src/utils/cloth/arrangement/arrangementBinding.ts src/utils/cloth/arrangement/__tests__/arrangementBinding.test.ts
git commit -m "feat(arrangement): resolveArrangement — grading-safe frame-delta compose (#887 Phase 1)"
```

---

### Task 4: Wire `resolveArrangement` into the placement consumers

**Files:**
- Modify: `src/store/autoSewThunk.ts` (`refineProposalsAgainstState`, lines ~34-39)
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (the two `applyArrangementOverrides(placeGarmentPieces(...), ...)` call sites, lines ~237 and ~317)
- Test: full suite (integration covered by existing autoSew/simulation suites)

**Interfaces:**
- Consumes: `resolveArrangement` (Task 3).
- Produces: no new exports. The consumers now produce collision-aware placements; with no overrides the output equals the auto placement, so seam world-refinement and the solver see pieces that start outside the body.

- [ ] **Step 1: Rewire `autoSewThunk.ts`**

Replace the `import` (line ~19) and `refineProposalsAgainstState` body (lines ~34-39):

```ts
// import — drop applyArrangementOverrides/placeGarmentPieces, add resolveArrangement
import { resolveArrangement } from '../utils/cloth/arrangement/arrangementBinding';
```

```ts
export function refineProposalsAgainstState(
  seams: Seam[],
  pieces: PatternPiece[],
  state: RootState,
): Seam[] {
  const placements = resolveArrangement(
    pieces,
    state.project.avatar.measurements,
    state.project.arrangementOverrides,
  );
  return refineSeamsInWorld(seams, pieces, placements);
}
```

(`state.project.arrangementOverrides` is `Record<string, [x,y,z]>` today — accepted as legacy `ArrangementOverride`.)

- [ ] **Step 2: Rewire `GarmentSimulation.tsx`**

At both call sites (lines ~237 and ~317), replace:

```ts
const placements = applyArrangementOverrides(
  placeGarmentPieces(pieces, measurements),
  pieces,
  arrangementOverrides,
);
```

with:

```ts
const placements = resolveArrangement(pieces, measurements, arrangementOverrides);
```

Update the import in `GarmentSimulation.tsx`: remove `applyArrangementOverrides`/`placeGarmentPieces` if now unused (keep whichever is still referenced elsewhere in the file), and add `import { resolveArrangement } from '../../utils/cloth/arrangement/arrangementBinding';`. Verify the `measurements` / `arrangementOverrides` variable names in scope at each site match (read the surrounding lines; they come from the same selector that fed `placeGarmentPieces`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. Fix any unused-import errors flagged by the removal.

- [ ] **Step 4: Full gate**

Run: `npm run test`
Expected: PASS. The autoSew suites now refine against collision-aware placements; if a suite pinned a literal pre-fix world position, update it to the new placement (the seam-pairing logic is position-relative and should be unaffected).

Run: `npm run lint`
Expected: clean (`--max-warnings=0` on changed files).

- [ ] **Step 5: Commit**

```bash
git add src/store/autoSewThunk.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(arrangement): route placement through resolveArrangement (#887 Phase 1)"
```

---

## Self-Review

**1. Spec coverage (Phase 1 sections of the design doc):**
- §4.2 `surfaceFrame` → Task 1. ✓
- §4.2 `computePlacement` enhanced (orientation + collision offset) → Task 2. ✓
- §4.1 `ArrangementBinding` format + §4.3 resolve-once + grading-safe → Task 3. ✓
- §4.3 skeleton-gate + parametric fallback → Task 3 (`opts.skeletonReady`, axisHint ignored when not ready) + Task 4 (consumers pass overrides; bone axisHints wired in a later phase — Phase 1 uses parametric default, which the fallback test pins). ✓
- §5.3 collision-aware offset (tangent + outside cylinder) → Task 2 geometric test. ✓
- §8 testing: surfaceFrame orthonormal (T1), geometric no-penetration (T2), resolve identity/fallback/grading-safe/legacy (T3). ✓
- **Deferred (correctly out of Phase 1):** §6 user UX (tool/rotation/snap), §9 Phase 3 re-grading trigger, §9 Phase 4 surface-patch, and the bone-axis `axisHints` wiring at the consumer (the hook exists; the avatar-scene wiring + skeleton-ready gate at the call site is Phase 2, when avatar access is added for snapping). The store-shape migration to `ArrangementBinding` objects is Phase 2 (no deltas are written in Phase 1). The GPU-local pre-sim penetration checkpoint is maintainer-run, noted in constraints.

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; every test step has real assertions. ✓

**3. Type consistency:** `V3` defined in Task 1, reused in Tasks 2-3. `SurfaceFrame`/`surfaceFrame`/`frameToEulerXYZ` (T1) consumed by `computeAutoFrame` (T2). `computeAutoFrame` (T2) consumed by `resolveArrangement` (T3). `resolveArrangement` (T3) consumed by consumers (T4). `ArrangementOverride = ArrangementBinding | V3` matches the legacy `Record<string,[x,y,z]>` store. `PlacementResult {position, rotation}` shape unchanged throughout. ✓

**Watch-point (flagged, not a gap):** Task 2 changes `computePlacement`'s rotation output, which is load-bearing for the M4 placement-coherence sonda and autoSew world-refinement. The full-suite gate in Tasks 2 and 4 is the guard; the facing test (T2 Step 1) pins that orientation stays outward. If M4 coherence breaks in a way the suite can't auto-resolve, surface it in review rather than reverting the collision offset.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-arrangement-points-3d-phase1.md`.**
