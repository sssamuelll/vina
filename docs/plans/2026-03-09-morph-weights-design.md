# Apply Morph Weights to Mesh — Issue #271

## Goal

Wire morph target influences from avatar GLB to UI sliders, update collision mesh on deformation, and support native GLB morph targets alongside the existing bone-scale morph system.

## Current State

The codebase has a bone-scale morph system that works visually but has gaps:

- `computeMorphWeights()` in `src/utils/avatar/morphTargets.ts` maps body measurements → bone scale multipliers against `DEFAULT_MEASUREMENTS` baseline
- `AvatarModel.tsx` applies these scales in `applyPose()` (lines 519-535) when measurements change
- Collision mesh is extracted once during simulation startup (`useSimulationLifecycle.ts` → `loadCollision()`) and **never rebuilt** when measurements change
- Native GLB morph targets (`morphTargetInfluences` / `morphTargetDictionary`) are completely ignored

## Gaps to Close

### Gap 1: Collision Mesh Stale After Measurement Change

When a user changes body measurements (e.g., chest from 88cm to 96cm), the avatar visually deforms via bone scaling, but the collision mesh used by the XPBD solver remains at the original shape. Cloth drapes against a stale body.

**Fix**: Re-extract collision mesh from the deformed skeleton when measurements change.

### Gap 2: Native GLB Morph Targets Ignored

Some avatar GLBs ship with morph targets (blendshapes) — e.g., "muscular", "slim", "busty". These are stored in `mesh.morphTargetDictionary` and driven by `mesh.morphTargetInfluences[]`. The app currently doesn't detect or expose them.

**Fix**: After loading an avatar, detect morph targets, expose as sliders in AvatarPanel, store values in Redux, apply via `morphTargetInfluences`.

### Gap 3: No Tests for Morph → Collision Pipeline

No verification that profile switching or measurement changes trigger collision mesh updates.

**Fix**: Unit tests for the rebuild trigger logic and E2E tests for profile switching.

## Architecture

### Collision Mesh Rebuild

```
measurements change → avatarSlice dispatches
  → useSimulationLifecycle watches avatar.measurements
  → debounce 200ms
  → re-extract collision mesh from current scene (deformed skeleton)
  → client.setCollisionMesh(newMesh)
  → solver uses updated body shape
```

Key insight: `extractMeshData()` in `avatarMeshExtractor.ts` already handles SkinnedMesh via `applyBoneTransform()`, so re-extracting from the live scene after bone scaling captures the deformed shape.

The rebuild uses the existing Three.js scene reference (already available in `useSimulationLifecycle` via the avatar model ref) rather than re-loading the avatar file. This means we traverse the scene graph, read current vertex positions with bone transforms applied, and build a fresh `CollisionMeshData`.

### Native Morph Targets

```
Avatar loads → detect morphTargetDictionary on any SkinnedMesh
  → dispatch setAvailableMorphTargets(names[])
  → AvatarPanel renders sliders for each morph target
  → User adjusts slider → dispatch setMorphTarget({ name, value })
  → AvatarModel applies mesh.morphTargetInfluences[i] = value
  → Collision rebuild triggers (same debounced pipeline)
```

State in `avatarSlice`:

```typescript
// New state fields
morphTargets: Record<string, number>;        // { "muscular": 0.5, "slim": 0.0 }
availableMorphTargets: string[];             // ["muscular", "slim", "busty"]
```

### Component Changes

| File | Change |
|------|--------|
| `src/store/avatarSlice.ts` | Add `morphTargets`, `availableMorphTargets`, actions |
| `src/components/Viewport3D/AvatarModel.tsx` | Detect morph targets on load, apply influences |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Watch measurements + morphTargets, debounced collision rebuild |
| `src/components/Viewport3D/AvatarPanel.tsx` | Render morph target sliders in new "Body Shape" section |

### Debounce Strategy

Collision mesh re-extraction is expensive (~50-100ms for a typical avatar mesh). Use a 200ms debounce to batch rapid slider movements. The debounce timer resets on each change, so dragging a slider only triggers one rebuild when the user stops.

## Key Files

| File | Action |
|------|--------|
| `src/store/avatarSlice.ts` | Modify (add morph target state + actions) |
| `src/components/Viewport3D/AvatarModel.tsx` | Modify (detect + apply morph targets) |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Modify (collision rebuild on measurement/morph change) |
| `src/components/Viewport3D/AvatarPanel.tsx` | Modify (morph target sliders) |
| `src/store/__tests__/morphTargets.test.ts` | Create (unit tests) |
| `tests/e2e/morph-weights.spec.ts` | Create (E2E tests) |
