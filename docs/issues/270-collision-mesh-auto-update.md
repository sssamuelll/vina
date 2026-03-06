## Summary

Automatically re-extract and update the collision mesh whenever the avatar's shape changes — from IK/FK posing, morph weight application, or profile switching. Currently the collision mesh is extracted once on avatar load and never updated, so cloth simulation collides against the original pose/shape even after the avatar is modified.

**Priority:** High — without this, any avatar deformation makes cloth simulation inaccurate

---

## Current State

- Collision mesh extracted once via `extractAvatarCollisionMesh()` on avatar load
- Sent to worker as `__avatar__` collision body via `setCollisionMesh`
- No mechanism to re-extract after pose or morph changes
- Worker supports `updateCollisionBody` message (can receive updated mesh data)

## Requirements

### Auto Re-extraction
- After any avatar deformation (pose change, morph weight, profile switch), re-extract collision mesh from the current skinned mesh state
- Use `extractAvatarCollisionMesh()` or equivalent on the deformed geometry
- Send updated mesh to worker via `updateCollisionBody` for `__avatar__`

### Performance
- Debounce re-extraction during interactive dragging (e.g., IK drag, slider scrub)
- Extract from GPU-side skinned mesh if possible (avoid CPU re-skin)
- Target: re-extraction completes within one frame for meshes up to 50K triangles

### Correctness
- Worker spatial hash must rebuild for updated `__avatar__` body
- Running simulation should see updated collision shape on next substep

---

## Implementation Notes

### Key Files
- `src/utils/cloth/avatarMeshExtractor.ts` — `extractAvatarCollisionMesh()`
- `src/utils/cloth/avatarCollisionMesh.ts` — collision mesh wrapper
- `src/utils/cloth/wasm/wasmSolverWorker.ts` — worker message handling
- `src/components/Viewport3D/AvatarModel.tsx` — avatar mesh reference

### Suggested Approach
1. Add a `useEffect` or event listener that fires on avatar deformation
2. Re-run `extractAvatarCollisionMesh()` on the current skeleton/mesh state
3. Post `updateCollisionBody` message to worker with new vertex positions
4. Debounce with ~100ms delay during continuous interaction

---

## Related Issues

- #229 — Avatar Posing & Deformation (parent epic)
- #268 — IK solver (produces pose changes that need collision update)
- #269 — Apply morph weights (produces shape changes that need collision update)
- #246 — Soft/deformable avatars (future: bidirectional deformation)

## Acceptance Criteria

- [ ] Changing avatar pose updates collision mesh within 100ms
- [ ] Changing avatar profile/measurements updates collision mesh
- [ ] Cloth simulation reacts to updated collision shape in real-time
- [ ] No performance regression during interactive posing (debounced)
- [ ] Worker spatial hash rebuilds correctly for updated geometry
