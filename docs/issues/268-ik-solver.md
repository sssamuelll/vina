## Summary

Implement an Inverse Kinematics (IK) solver for avatar posing. The IK infrastructure (chains, targets) already exists in `avatarSlice.ts` but the actual solver is missing. This is the highest-impact avatar posing gap — FK joint rotation is implemented but IK end-effector control is not.

**Priority:** High — blocks natural pose authoring workflows (drag hand/foot to position)

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §8 — Avatar System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Current State

- FK posing works: 16 joints, angle constraints, presets (A-pose, T-pose, etc.)
- `IKChain` and `IKTarget` types defined in avatar state
- No solver algorithm implemented

## Requirements

### IK Solver
- Implement CCD (Cyclic Coordinate Descent) or FABRIK solver
- Support chains: arm (shoulder→elbow→wrist→hand), leg (hip→knee→ankle→foot), spine
- Respect existing joint angle limits from FK system
- Real-time solve at interactive frame rates

### Integration
- 3D viewport: drag end-effector handles (hands, feet) to set IK targets
- Hybrid FK/IK: user can switch per-chain between FK and IK mode
- Pose library: IK-authored poses save as joint angles (same format as FK)
- Collision mesh must update after IK solve (see #270)

---

## Implementation Notes

### Key Files
- `src/store/avatarSlice.ts` — IKChain/IKTarget state, joint definitions
- `src/components/Viewport3D/AvatarModel.tsx` — avatar rendering, skeleton access
- `src/utils/avatar/morphTargets.ts` — bone name mapping reference

### Suggested Approach
1. Add `solveIK(chain: IKChain, target: Vector3)` utility
2. Wire to TransformControls gizmo on end-effector bones
3. On gizmo drag → solve IK → update joint rotations in store → re-render

---

## Related Issues

- #229 — Avatar Posing & Deformation (parent epic)
- #270 — Collision mesh auto-update on avatar deformation

## Acceptance Criteria

- [ ] IK solver produces natural joint rotations for arm and leg chains
- [ ] End-effector gizmos draggable in 3D viewport
- [ ] Joint angle limits respected during IK solve
- [ ] Hybrid FK/IK toggle per chain
- [ ] IK-authored poses saveable to pose library
