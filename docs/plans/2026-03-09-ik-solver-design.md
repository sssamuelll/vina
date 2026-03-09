# IK Solver for Avatar Posing — Design Document

> Issue #270: CCD/FABRIK solver, end-effector gizmos in 3D viewport, hybrid FK/IK, joint limits, pose library integration

## Goal

Enable users to pose the avatar by dragging end-effectors (hands, feet) in the 3D viewport. The IK solver computes natural joint angles automatically, respecting anatomical constraints.

## Current State

The codebase already has significant IK scaffolding:

- **IK types** in `avatarSlice.ts`: `IKChain`, `IKTarget`, `PoseState.ikChains/ikTargets/ikEnabled`
- **4 predefined chains**: leftArm (LeftShoulder→LeftArm→LeftForeArm), rightArm, leftLeg (LeftUpLeg→LeftLeg), rightLeg
- **Redux actions**: `toggleIK`, `setIKTarget`, `removeIKTarget`, `updateIKChainTarget`
- **THREE.CCDIKSolver** imported in `AvatarModel.tsx` with partial setup
- **Swing-twist constraints** in `swingTwistConstraint.ts` (anatomically correct, production-quality)
- **FK system**: 18 joints, Euler ZYX order, bind-pose-relative quaternion multiplication
- **Pose library**: Save/load from localStorage + IndexedDB

### What's Broken

The current `initializeIK()` in AvatarModel.tsx sets `target === effector` for each chain, making CCD a no-op. There are no target helpers and no proper solve loop integration.

## Architecture

### Approach: CCD-First with THREE.CCDIKSolver

Use the already-imported CCD solver. It handles arbitrary chain lengths, converges quickly for 2-3 bone chains, and is battle-tested in Three.js.

**Alternatives considered:**
- **FABRIK**: Better convergence but requires custom implementation (~400 lines). Can upgrade later.
- **Analytical two-bone**: Exact for arms/legs but can't extend to spine. Premature optimization.

### Data Flow

```
TransformControls drag
  → setIKTarget(chainName, worldPosition)  [Redux action]
  → useFrame() in AvatarModel reads ikTargets
  → Updates THREE.Object3D target helpers in scene
  → CCDIKSolver.update() solves all active chains
  → clampSwingTwist() applied per bone [post-solve correction]
  → setJointRotation() per bone [Redux, debounced with 1° threshold]
  → FK sliders auto-update (joints state is source of truth)
  → Pose saveable via existing pose library (no changes needed)
```

### Component Design

#### 1. IKEndEffectorGizmos (new)

`src/components/Viewport3D/IKEndEffectorGizmos.tsx`

Renders `<TransformControls>` from `@react-three/drei` at each active end-effector bone position.

```
Props: none (reads from Redux)
Visible when: ikEnabled && poseEditorOpen
Mode: translate only
Gizmo size: 0.15 (scaled to avatar)
```

For each IK chain:
1. Find the end-effector bone's world position (LeftHand, RightHand, LeftFoot, RightFoot — mapped from chain's last bone + 1)
2. Render a `<TransformControls>` attached to a helper object at that position
3. On `objectChange`: dispatch `setIKTarget({ name: chain.name, position: helper.position })`
4. On `dragging-changed`: toggle orbit controls

#### 2. IK Solve Loop (AvatarModel.tsx modification)

Replace the broken `initializeIK` with proper setup:

```typescript
// Target helpers — invisible Object3D per chain
const ikTargetHelpers = useRef<Map<string, THREE.Object3D>>(new Map());

function initializeIK(scene) {
  // Find SkinnedMesh + skeleton
  // For each IK chain:
  //   1. Create target Object3D, add to scene
  //   2. Position at end-effector's world position
  //   3. Build CCD IK config: { target: targetBoneIndex, effector: endBoneIndex, links: [...] }
  //   4. Set per-link rotationMin/rotationMax from JOINT_CONSTRAINTS
  // Create CCDIKSolver with mesh + iks array
}
```

In `useFrame`:
```typescript
if (ikEnabled && ikSolver.current && ikTargets.length > 0) {
  // 1. Update target helper positions from Redux ikTargets
  // 2. ikSolver.update()
  // 3. Post-solve: clampSwingTwist per chain bone
  // 4. Extract Euler angles, dispatch to Redux (debounced, >1° delta)
}
```

#### 3. End-Effector Bone Mapping

| Chain | Chain Bones | End-Effector (target position) |
|-------|------------|-------------------------------|
| leftArm | LeftShoulder, LeftArm, LeftForeArm | LeftHand world position |
| rightArm | RightShoulder, RightArm, RightForeArm | RightHand world position |
| leftLeg | LeftUpLeg, LeftLeg | LeftFoot world position |
| rightLeg | RightUpLeg, RightLeg | RightFoot world position |

The target helper is positioned at the end-effector bone's world position initially. The user drags it, and CCD solves the chain to reach that target.

#### 4. FK/IK Hybrid Mode

- **Global toggle**: `ikEnabled` in Redux (already exists)
- **IK off**: FK gizmos work as before (drag spheres per joint)
- **IK on**: TransformControls appear at end-effectors. FK gizmos remain visible but read-only (color change to indicate IK mode). Joint sliders in sidebar still reflect real-time angles.
- **IK→FK transition**: Disabling IK preserves current joint angles. The pose "freezes" as FK.
- **FK→IK transition**: Enabling IK places target helpers at current end-effector positions.

#### 5. Joint Limits in CCD

THREE.CCDIKSolver supports `rotationMin` and `rotationMax` vectors per link:

```typescript
links: [
  {
    index: boneIdx,
    rotationMin: new THREE.Vector3(minX, minY, minZ),  // radians
    rotationMax: new THREE.Vector3(maxX, maxY, maxZ),
  },
  // ...
]
```

We populate these from `JOINT_CONSTRAINTS`. Additionally, after each CCD solve, we apply `clampSwingTwist()` for more anatomically accurate constraint enforcement (CCD's per-axis Euler limits are approximate; swing-twist is biomechanically correct).

#### 6. Pose Library Integration

No changes needed. IK writes joint rotations to `state.avatar.pose.joints` via `setJointRotation`. The existing `savePose` action captures this state. IK-generated poses are indistinguishable from FK-authored poses.

## Files

| File | Action | Description |
|------|--------|-------------|
| `src/components/Viewport3D/IKEndEffectorGizmos.tsx` | Create | TransformControls per chain end-effector |
| `src/components/Viewport3D/AvatarModel.tsx` | Modify | Fix CCD init, add target helpers, proper solve loop |
| `src/components/Viewport3D/Viewport3D.tsx` | Modify | Mount `<IKEndEffectorGizmos>` |
| `src/store/avatarSlice.ts` | Modify | Minor: end-effector bone name mapping constant |
| `src/components/Viewport3D/JointGizmos.tsx` | Modify | Visual-only mode when IK active |
| `tests/unit/ikSolver.test.ts` | Create | Unit tests for CCD integration + constraint clamping |
| `tests/e2e/ik-solver.spec.ts` | Create | E2E: toggle IK, drag end-effector, verify pose changes |

## Out of Scope (Future Enhancements)

- Spine IK chain
- Pole vector targets (elbow/knee direction hints)
- IK blending weights per chain
- Position + rotation end-effector targets
- FABRIK solver upgrade
- IK animation (keyframing target positions)

## Success Criteria

1. User can toggle IK mode in pose editor
2. TransformControls gizmos appear at hands and feet
3. Dragging a gizmo moves the limb naturally via CCD
4. Joint angles stay within anatomical limits
5. FK sliders reflect IK-solved angles in real time
6. Switching IK off preserves the current pose
7. IK-generated poses can be saved and loaded via pose library
