# A-pose Collision Bake + axisHints Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cloth collision mesh and the sleeve placement match the **A-pose** the renderer shows, so sleeves drape onto the visible (lowered) arms instead of floating where the T-pose arm would be.

**Architecture:** Two coupled halves that MUST ship together (feeding A-pose axisHints while the bake stays T-pose, or vice-versa, re-introduces the mismatch). **(A) A-pose bake:** before `extractMeshData`, pose the avatar's bones from the store joints and `updateMatrixWorld(true)` — the prior attempt failed because `skeleton.update()` reads `bone.matrixWorld` without a preceding world-matrix refresh, so it baked stale (T-pose) world matrices that carry the import scale → `minY≈0`. **(B) axisHints:** `AvatarModel` (which holds the posed bones) computes the world direction of the `LeftArm`/`RightArm` bones, publishes them to Redux; the three `resolveArrangementWithFrames` callers read them, map each sleeve piece (via `computeEffectiveRegions`) to its arm direction, and pass `opts.axisHints` — `surfaceFrame` already consumes `axisHint`.

**Tech Stack:** TypeScript, Three.js (SkinnedMesh/skeleton), Redux Toolkit, Vitest (unit), Playwright `@gpu-local` (E2E, maintainer-run).

## Global Constraints

- Typecheck with `npx tsc -b --noEmit` (build mode), NOT bare `tsc`. (CLAUDE.md)
- Unit tests: `npm run test` (Vitest). Lint `--max-warnings=0`. Never `--no-verify`.
- Pose math MUST match `AvatarModel.tsx:513-517` exactly: `DEG2RAD = Math.PI/180`, `new THREE.Euler(x*DEG2RAD, y*DEG2RAD, z*DEG2RAD, 'ZYX')`, `bone.quaternion.copy(bindPose).multiply(rotQ)` (post-multiply, local space). Joints come from `state.avatar.pose.joints` (live, not the static preset) so user-edited poses are honored.
- The two halves are coupled — both must land before the E2E (Task 8) is meaningful; do not declare success on one alone.
- Redux state must stay serializable: store arm directions as `[number,number,number]` arrays, not `THREE.Vector3`.
- This branch (`feat/envelope-wrap`) drapes the wrap; do NOT regress the `mariaShirt.m4` sonda or the wrap unit tests.

---

### Task 1: Generalize `applyAPose` → `applyPose(scene, joints)`

**Files:**
- Modify: `src/utils/cloth/avatarMeshExtractor.ts:239-266`
- Test: `src/utils/cloth/__tests__/applyPose.test.ts` (create)

**Interfaces:**
- Produces: `export function applyPose(scene: THREE.Object3D, joints: Record<string, { x: number; y: number; z: number }>): void` — applies per-bone rotations (degrees, Euler ZYX, post-multiplied onto the bind quaternion). Keep `applyAPose(scene)` as a thin wrapper calling `applyPose(scene, POSE_PRESETS['A-pose'])` for back-compat.

- [ ] **Step 1: Write the failing test**

```ts
// applyPose.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyPose } from '../avatarMeshExtractor';

describe('applyPose', () => {
  it('rotates a named bone by the joint (deg, ZYX, post-mult on bind)', () => {
    const bone = new THREE.Bone();
    bone.name = 'LeftArm';
    const scene = new THREE.Object3D();
    scene.add(bone);
    const bind = bone.quaternion.clone(); // identity
    applyPose(scene, { LeftArm: { x: 25, y: 0, z: 0 } });
    const expected = bind.clone().multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(25 * Math.PI / 180, 0, 0, 'ZYX')),
    );
    expect(bone.quaternion.angleTo(expected)).toBeLessThan(1e-6);
  });
  it('leaves un-listed bones at their bind pose', () => {
    const bone = new THREE.Bone(); bone.name = 'Spine';
    const scene = new THREE.Object3D(); scene.add(bone);
    const bind = bone.quaternion.clone();
    applyPose(scene, { LeftArm: { x: 25, y: 0, z: 0 } });
    expect(bone.quaternion.angleTo(bind)).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- applyPose`
Expected: FAIL — `applyPose` is not exported.

- [ ] **Step 3: Implement**

In `avatarMeshExtractor.ts`, replace the body of `applyAPose` with a generalized `applyPose` + keep `applyAPose` as a wrapper:
```ts
export function applyPose(
  scene: THREE.Object3D,
  joints: Record<string, { x: number; y: number; z: number }>,
): void {
  const boneMap = new Map<string, THREE.Bone>();
  const bindPoses = new Map<string, THREE.Quaternion>();
  scene.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    boneMap.set(bone.name, bone);
    bindPoses.set(bone.name, bone.quaternion.clone());
  });
  boneMap.forEach((bone, name) => {
    const bindPose = bindPoses.get(name);
    if (!bindPose) return;
    const jointRot = joints[name];
    if (jointRot) {
      const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
      const rotQ = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(bindPose).multiply(rotQ);
    } else {
      bone.quaternion.copy(bindPose);
    }
  });
}

/** Back-compat: A-pose from the static preset. */
export function applyAPose(scene: THREE.Object3D): void {
  applyPose(scene, POSE_PRESETS['A-pose']);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- applyPose` → PASS. `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/avatarMeshExtractor.ts src/utils/cloth/__tests__/applyPose.test.ts
git commit -m "feat(apose): generalize applyAPose -> applyPose(scene, joints)"
```

---

### Task 2: Bake the collision mesh in the posed skeleton

**Files:**
- Modify: `src/utils/cloth/avatarCollisionMesh.ts:16-53`
- Test: covered by the E2E (Task 8) — this needs a real GLB skeleton; add no fragile unit. The correctness gate here is `tsc` + the existing collision-mesh shape.

**Interfaces:**
- Consumes: `applyPose` (Task 1).
- Produces: `extractAvatarCollisionMesh(avatarUrl, avatarHeight, joints?)` — when `joints` is provided and non-empty, the bake is in that pose; absent/empty → unchanged T-pose bake (back-compat).

- [ ] **Step 1: Implement the pose-then-refresh bake**

In `avatarCollisionMesh.ts`, add the param and pose-before-extract logic. The load-bearing line is the **second** `updateMatrixWorld(true)` AFTER posing (the prior attempt omitted it → stale `bone.matrixWorld` → `minY≈0`):
```ts
import { extractMeshData, applyPose } from './avatarMeshExtractor';
// ...
export async function extractAvatarCollisionMesh(
  avatarUrl: string,
  avatarHeight: number,
  joints?: Record<string, { x: number; y: number; z: number }>,
): Promise<CollisionMeshData | null> {
  // ... existing import + importerToMetres(result.scene) ...
  result.scene.updateMatrixWorld(true);

  // Pose-matched bake: rotate bones to the rendered pose, then REFRESH the
  // world-matrix tree before extractMeshData's skeleton.update() reads
  // bone.matrixWorld. Without this second update the bake mixes posed
  // quaternions with stale (import-scaled) world matrices → minY≈0 collapse.
  if (joints && Object.keys(joints).length > 0) {
    applyPose(result.scene, joints);
    result.scene.updateMatrixWorld(true);
  }

  const { vertices, indices, normals } = extractMeshData(result.scene);
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Verify it compiles and doesn't break the T-pose path**

Run: `npx tsc -b --noEmit` → clean. `npm run test` → full suite green (the default `joints` undefined keeps every existing caller on the T-pose bake). `npm run lint` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/utils/cloth/avatarCollisionMesh.ts
git commit -m "feat(apose): pose-matched collision bake (applyPose + updateMatrixWorld before extract)"
```

---

### Task 3: Thread store joints into the collision bake

**Files:**
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts` — `loadCollision` (`:193`), its 3 call sites (`:519, :565, :612`), the debounced rebuild (`:718`), and add an `avatarJointsRef`.

**Interfaces:**
- Consumes: `extractAvatarCollisionMesh(url, height, joints?)` (Task 2).
- Produces: every collision bake on this hook passes `state.avatar.pose.joints` so the bake matches the render.

- [ ] **Step 1: Add a joints ref fed from Redux**

Near the other refs in the hook (`avatarModelUrlRef`, `avatarHeightRef`), add a selector + ref so the async bake reads fresh joints without re-init cascades:
```ts
const avatarJoints = useSelector((s: RootState) => s.avatar.pose.joints);
const avatarJointsRef = useRef(avatarJoints);
useEffect(() => { avatarJointsRef.current = avatarJoints; });
```

- [ ] **Step 2: Pass joints through `loadCollision`**

Add a `joints` param to `loadCollision` and forward it:
```ts
async function loadCollision(
  client: { setCollisionMesh: (mesh: any) => void; updateCollisionBody: (data: any) => void },
  avatarModelUrl: string | null,
  avatarHeight: number,
  collisionBodies: Array<...>,
  dispatch: ...,
  cancelled: { value: boolean },
  isWasm: boolean,
  joints: Record<string, { x: number; y: number; z: number }>,
) {
  // ...
  extractAvatarCollisionMesh(avatarModelUrl, avatarHeight, joints),
  // ...
}
```
Update the 3 call sites (`:519, :565, :612`) to pass `avatarJointsRef.current`, and the debounced rebuild (`:718`) to pass `avatarJointsRef.current` to `extractAvatarCollisionMesh`.

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit` → clean. `npm run test` → green. `npm run lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewport3D/useSimulationLifecycle.ts
git commit -m "feat(apose): thread store joints into every collision bake"
```

---

### Task 4: Redux channel for arm axis hints

**Files:**
- Modify: `src/store/simulationSlice.ts` (state + action)
- Test: `src/store/__tests__/simulationSlice.armAxis.test.ts` (create)

**Interfaces:**
- Produces: `simulation.armAxis: { left: [number,number,number] | null; right: [number,number,number] | null; ready: boolean }` (default `{ left: null, right: null, ready: false }`); action `setArmAxis(payload)`.

- [ ] **Step 1: Write the failing test**

```ts
// simulationSlice.armAxis.test.ts
import { describe, it, expect } from 'vitest';
import reducer, { setArmAxis } from '../simulationSlice';

describe('simulation.armAxis', () => {
  it('defaults to null/null/not-ready', () => {
    const s = reducer(undefined, { type: '@@init' });
    expect(s.armAxis).toEqual({ left: null, right: null, ready: false });
  });
  it('setArmAxis stores both directions + ready', () => {
    const s = reducer(undefined, setArmAxis({ left: [-1, 0, 0], right: [1, 0, 0], ready: true }));
    expect(s.armAxis).toEqual({ left: [-1, 0, 0], right: [1, 0, 0], ready: true });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -- simulationSlice.armAxis`
Expected: FAIL — `setArmAxis` not exported.

- [ ] **Step 3: Implement**

In `simulationSlice.ts`, add to the initial state `armAxis: { left: null, right: null, ready: false } as { left: [number,number,number]|null; right: [number,number,number]|null; ready: boolean }`, add the reducer:
```ts
setArmAxis(state, action: PayloadAction<{ left: [number,number,number]|null; right: [number,number,number]|null; ready: boolean }>) {
  state.armAxis = action.payload;
},
```
and export `setArmAxis` in the slice's actions export.

- [ ] **Step 4: Run it** → PASS. `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/simulationSlice.ts src/store/__tests__/simulationSlice.armAxis.test.ts
git commit -m "feat(apose): simulation.armAxis redux channel for arm directions"
```

---

### Task 5: `buildAxisHints` — map pieces + arm directions → per-piece hints

**Files:**
- Create: `src/utils/cloth/arrangement/buildAxisHints.ts`
- Test: `src/utils/cloth/arrangement/__tests__/buildAxisHints.test.ts` (create)

**Interfaces:**
- Consumes: `computeEffectiveRegions(pieces)` (`garmentPlacement.ts`), `V3` from `surfaceFrame.ts`.
- Produces: `buildAxisHints(pieces, armAxis): Record<string, V3>` — for each piece whose effective region is `left-sleeve`/`cuff-left` → `armAxis.left`; `right-sleeve`/`cuff-right` → `armAxis.right`; others omitted. Null arm dirs omit that side.

- [ ] **Step 1: Write the failing test**

```ts
// buildAxisHints.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildAxisHints } from '../buildAxisHints';
import * as gp from '../../garmentPlacement';

describe('buildAxisHints', () => {
  it('maps left/right sleeves to their arm directions, omits torso', () => {
    const pieces = [{ id: 'L' }, { id: 'R' }, { id: 'F' }] as any;
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve', 'front-torso'] as any);
    const hints = buildAxisHints(pieces, { left: [-0.9, -0.4, 0], right: [0.9, -0.4, 0], ready: true });
    expect(hints).toEqual({ L: [-0.9, -0.4, 0], R: [0.9, -0.4, 0] });
  });
  it('omits a side whose direction is null', () => {
    const pieces = [{ id: 'L' }, { id: 'R' }] as any;
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve'] as any);
    const hints = buildAxisHints(pieces, { left: null, right: [1, 0, 0], ready: true });
    expect(hints).toEqual({ R: [1, 0, 0] });
  });
});
```

- [ ] **Step 2: Run it** → FAIL (`buildAxisHints` not defined).

- [ ] **Step 3: Implement**

```ts
// buildAxisHints.ts
import { computeEffectiveRegions, type BodyRegion } from '../garmentPlacement';
import type { PatternPiece } from '../../../types/types';
import type { V3 } from './surfaceFrame';

export interface ArmAxis { left: V3 | null; right: V3 | null; ready: boolean; }

export function buildAxisHints(pieces: PatternPiece[], armAxis: ArmAxis): Record<string, V3> {
  const regions = computeEffectiveRegions(pieces);
  const out: Record<string, V3> = {};
  pieces.forEach((p, i) => {
    const r: BodyRegion = regions[i];
    if ((r === 'left-sleeve' || r === 'cuff-left') && armAxis.left) out[p.id] = armAxis.left;
    else if ((r === 'right-sleeve' || r === 'cuff-right') && armAxis.right) out[p.id] = armAxis.right;
  });
  return out;
}
```

- [ ] **Step 4: Run it** → PASS. `npx tsc -b --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/arrangement/buildAxisHints.ts src/utils/cloth/arrangement/__tests__/buildAxisHints.test.ts
git commit -m "feat(apose): buildAxisHints maps sleeve pieces to arm directions"
```

---

### Task 6: `AvatarModel` publishes arm directions to Redux

**Files:**
- Modify: `src/components/Viewport3D/AvatarModel.tsx` (after `applyPose.current()` runs, in the pose effect ~`:599-603`)

**Interfaces:**
- Consumes: the posed `LeftArm`/`RightArm` bones in `boneMap.current`; `setArmAxis` (Task 4).
- Produces: dispatches `setArmAxis({ left, right, ready: true })` with each arm's world long-axis direction.

- [ ] **Step 1: Implement the producer**

After the pose is applied (the effect at `:599-603` that calls `applyPose.current()`), compute and dispatch each arm's world direction. Use the bone→child world-position direction (robust for limb axis), falling back to the bone's oriented local axis:
```ts
const armDir = (boneName: string, childName: string): [number,number,number] | null => {
  const bone = boneMap.current.get(boneName);
  const child = boneMap.current.get(childName);
  if (!bone) return null;
  const a = new THREE.Vector3(); bone.getWorldPosition(a);
  if (child) {
    const b = new THREE.Vector3(); child.getWorldPosition(b);
    const d = b.sub(a).normalize();
    if (d.lengthSq() > 1e-8) return [d.x, d.y, d.z];
  }
  const q = new THREE.Quaternion(); bone.getWorldQuaternion(q);
  const d = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
  return [d.x, d.y, d.z];
};
const left = armDir('LeftArm', 'LeftForeArm');
const right = armDir('RightArm', 'RightForeArm');
dispatch(setArmAxis({ left, right, ready: boneMap.current.size > 0 }));
```
Place this inside the same effect AFTER `applyPose.current()` so the bone world matrices reflect the pose (the effect runs on `[joints, measurements, morphTargets]`). Import `setArmAxis` + `useDispatch`.

- [ ] **Step 2: Verify**

Run: `npx tsc -b --noEmit` → clean. `npm run test` → green (no unit asserts React bones; integration verified by the E2E). `npm run lint` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/AvatarModel.tsx
git commit -m "feat(apose): AvatarModel publishes posed arm directions to redux"
```

---

### Task 7: Feed `axisHints` into the three `resolveArrangementWithFrames` callers

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (`:239` render, `:318` solver), `src/store/autoSewThunk.ts` (`:39`)

**Interfaces:**
- Consumes: `buildAxisHints` (Task 5), `simulation.armAxis` (Task 4).
- Produces: all three callers pass `{ axisHints, skeletonReady }` so the sleeve frames follow the A-pose arm. Render and solver MUST pass the identical hints (no divergence).

- [ ] **Step 1: Implement**

In `GarmentSimulation.tsx`, read `armAxis` and build hints once; pass to BOTH `resolveArrangementWithFrames` calls:
```ts
const armAxis = useSelector((s: RootState) => s.simulation.armAxis);
// inside each memo (render :239 + solver :318), before resolveArrangementWithFrames:
const axisHints = buildAxisHints(activePieces, armAxis);
const arrangement = resolveArrangementWithFrames(activePieces, avatarMeasurements, arrangementOverrides, { axisHints, skeletonReady: armAxis.ready });
```
Add `armAxis` to both memos' dependency arrays.
In `autoSewThunk.ts` `refineProposalsAgainstState` (`:34-40`), read `state.simulation.armAxis`, build hints, pass opts:
```ts
const armAxis = state.simulation.armAxis;
const axisHints = buildAxisHints(pieces, armAxis);
const placements = resolveArrangementWithFrames(pieces, state.project.avatar.measurements, state.project.arrangementOverrides, { axisHints, skeletonReady: armAxis.ready });
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b --noEmit` → clean. `npm run test` → green (the wrap unit tests + `mariaShirt.m4` sonda still pass — they pass no `armAxis`, so hints are empty and behavior is unchanged when `ready=false`). `npm run lint` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/store/autoSewThunk.ts
git commit -m "feat(apose): feed A-pose axisHints into render/solver/autoSew placement"
```

---

### Task 8: E2E verification in A-pose (maintainer-run)

**Files:**
- Modify: `tests/e2e/webgpu-maria-replay.spec.ts` (add an A-pose drape assertion in the `drape M4` test)

**Interfaces:**
- Consumes: the full A-pose stack (Tasks 1-7).

- [ ] **Step 1: Add the A-pose sleeve checkpoint (maintainer-run)**

The replay already runs in A-pose (default avatar). Add a checkpoint at 2.5s that asserts the sleeves are now ON the arms, not floating: segment the cloth mesh by `|x|>0.25` (sleeves) and assert their mean Y is BELOW the shoulder height (≈1.476m) — i.e. the sleeve hangs along the lowered A-pose arm, not at the horizontal T-pose height. Mark `// maintainer-run` (CI has no GPU). Keep existing asserts intact.

- [ ] **Step 2: Hand to maintainer**

The CI/unit gates (Tasks 1,4,5 unit + tsc/lint on all) are green-able here; the visual proof is the maintainer running `npm run test:e2e:gpu -- webgpu-maria-replay -g "drape M4"` and confirming (via screenshot) the sleeves drape on the A-pose arms with no penetration. Report the §8 numbers + a capture.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/webgpu-maria-replay.spec.ts
git commit -m "test(apose): A-pose sleeve-on-arm checkpoint in the GPU replay (maintainer-run)"
```

---

## Self-Review

**Coverage:** half A (bake) = Tasks 1 (applyPose) + 2 (pose-then-refresh bake, the `updateMatrixWorld` fix) + 3 (thread store joints); half B (axisHints) = Tasks 4 (redux channel) + 5 (buildAxisHints) + 6 (AvatarModel producer) + 7 (3 callers consume); coupling honored — both land before Task 8's E2E. The investigation's Q1 (stale `bone.matrixWorld`) → Task 2; Q2/Q3 (render order, joint math) → Tasks 1-2; Q4 (axisHints gap, 3 callers) → Tasks 5-7. ✓

**Placeholder scan:** every code step has real code; integration tasks (2,3,6,7) that can't be unit-tested cite the exact existing call sites + the exact change, gated by tsc/lint/suite + the E2E — not "implement later". ✓

**Type consistency:** `applyPose(scene, joints)` (T1) consumed by T2-T3; `extractAvatarCollisionMesh(url, height, joints?)` (T2) consumed by T3; `setArmAxis`/`simulation.armAxis` (T4) consumed by T6-T7; `ArmAxis`/`buildAxisHints` (T5) consumed by T7; `{axisHints, skeletonReady}` matches `resolveArrangementWithFrames` opts (existing). ✓

**Honest gaps surfaced (not silently dropped):** the bake (T2), the AvatarModel producer (T6), and the caller wiring (T7) are React/Three/skeleton integration — not unit-testable without a real GLB; their real proof is Task 8's maintainer-run E2E. The `armDir` bone→child direction (T6) assumes `LeftArm→LeftForeArm` exists in the rig; if a rig lacks the child the code falls back to the bone's oriented axis — flag if María's rig uses non-standard bone names.
