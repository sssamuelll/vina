## Summary

Wire the existing `computeMorphWeights()` system to actually deform the avatar mesh. The morph weight computation and bone mapping exist in `morphTargets.ts`, and avatar profiles with measurements exist in `avatarLibrary.ts`, but the weights are never applied to the skeleton — the avatar always renders at default proportions regardless of profile measurements.

**Priority:** High — avatar profiles are cosmetic-only without this; fit validation across body types is impossible

---

## Current State

- `computeMorphWeights()` computes bone-scale multipliers from `MorphConfig` measurements
- `MORPH_BONE_MAP` maps measurement dimensions to skeleton bone names
- `AvatarProfile` stores `BodyMeasurements` per profile (4 default profiles exist)
- **Nothing connects profile measurements → bone scales → rendered skeleton**

## Requirements

### Bone-Scale Application
- When avatar profile changes, compute morph weights and apply bone scales to skeleton
- Scale bones on appropriate axes (chest/waist/hip = X+Z scale, limbs = Y scale for length)
- Smooth transition when switching profiles (optional, nice-to-have)

### Mesh Update
- After bone scaling, update skinned mesh so cloth collision sees the new shape
- Trigger collision mesh re-extraction (see #270)

### UI Integration
- Avatar profile selector should visually change the avatar body
- Manual measurement sliders should update avatar in real-time

---

## Implementation Notes

### Key Files
- `src/utils/avatar/morphTargets.ts` — `computeMorphWeights()`, `MORPH_BONE_MAP`
- `src/utils/avatar/avatarLibrary.ts` — `AvatarProfile`, default profiles
- `src/components/Viewport3D/AvatarModel.tsx` — skeleton access, rendering
- `src/store/avatarSlice.ts` — avatar state, profile selection

### Suggested Approach
1. In `AvatarModel.tsx`, after skeleton loads, read active profile measurements
2. Call `computeMorphWeights()` to get scale multipliers
3. Apply scales to corresponding bones via `bone.scale.set(sx, sy, sz)`
4. On profile change, reapply and trigger collision mesh update

---

## Related Issues

- #229 — Avatar Posing & Deformation (parent epic)
- #270 — Collision mesh auto-update on avatar deformation

## Acceptance Criteria

- [ ] Switching avatar profile visibly changes body proportions
- [ ] Bone scales match measurement ratios from `computeMorphWeights()`
- [ ] Measurement sliders update avatar mesh in real-time
- [ ] Collision mesh reflects deformed avatar shape
