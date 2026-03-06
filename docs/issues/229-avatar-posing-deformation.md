## Summary

Implement full avatar posing with IK/FK joint manipulation, morph target deformation for body shape variation, and avatar size sets for quick-switching between size-specific bodies.

**Competitive context:** Both CLO3D and Browzwear offer joint-based posing, morph targets for body shape adjustment, and avatar size sets. These are required to validate garment fit across body types and poses.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §8 — Avatar System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Joint-Based Posing (IK/FK)
- Select and rotate avatar joints (shoulder, elbow, hip, knee, spine, etc.)
- Forward Kinematics: direct joint angle control
- Inverse Kinematics: move end effector (hand/foot), chain auto-solves
- Joint angle limits (prevent unnatural poses)
- Pose library: save/load named poses
- Import poses from FBX or COLLADA joint data

### Morph Target Deformation
- Load blend shapes for body variation (bust, waist, hip, muscle, etc.)
- Slider controls per morph target (0–100%)
- Multiple morph targets can be combined
- Collision mesh auto-updates when morph targets change
- Compatible with MakeHuman and similar parametric avatar sources

### Avatar Size Sets
- Define a set of avatars representing garment sizes (XS–XXL)
- Quick-switch between size avatars from toolbar
- Each size avatar has appropriate body measurements
- Auto-re-simulate on avatar switch
- Link graded patterns to corresponding size avatar

---

## Implementation Strategy

### Phase 1: Joint Posing
1. Parse skeleton hierarchy from FBX/GLB avatar files
2. Implement FK: joint rotation gizmos in 3D viewport
3. Implement IK: CCD or FABRIK solver for end-effector control
4. Store poses as named joint angle sets
5. Re-compute collision mesh from posed skeleton

### Phase 2: Morph Targets
1. Load morph targets from GLB/FBX blend shapes
2. UI: slider panel for each morph target
3. Apply morph deltas to mesh geometry
4. Update collision mesh from deformed geometry
5. Integrate with parametric measurement system

### Phase 3: Size Sets
1. Define size set: map size labels to avatar configurations
2. UI: size selector dropdown/tabs in toolbar
3. On switch: load appropriate avatar, apply graded pattern, simulate
4. Cache simulated results per size for quick comparison

---

## Related Issues

- #8 — Research: parametric avatar deformation (existing research issue)
- #118 — Avatar Tools epic (closed — measurement tapes and pose tools)
- #227 — Advanced Grading (3D review per size needs size-specific avatars)
- #268 — IK Solver Implementation (extracted from Phase 1)
- #269 — Apply Morph Weights to Avatar Mesh (extracted from Phase 2)
- #270 — Collision Mesh Auto-Update on Avatar Deformation (cross-cutting dependency)

## Notes

**MakeHuman morph targets — deferred.** MakeHuman exports standard GLB/FBX which our loader already handles. The only gap is reading blend shape data from meshes, which is covered by the general morph target work in Phase 2. No MakeHuman-specific integration is needed — it will work automatically once #269 and blend shape loading are implemented.

## Acceptance Criteria

- [ ] Avatar joints selectable and rotatable in 3D viewport
- [ ] IK solver moves hand/foot endpoints naturally
- [ ] Joint angle limits prevent unnatural poses
- [ ] Pose library: save, load, and delete named poses
- [ ] Morph target sliders adjust body shape in real-time
- [ ] Collision mesh updates after morph/pose changes
- [ ] Avatar size set: define XS–XXL avatars
- [ ] Quick-switch between size avatars re-simulates garment
- [ ] FBX pose import loads joint angles from file
