## Summary

Implement FBX/COLLADA skeletal motion import for avatar animation and Alembic (.abc) animation cache export for mesh-level garment animation data. These formats connect OpenClo to the broader 3D animation pipeline.

**Competitive context:** CLO3D supports FBX motion import, COLLADA import, and Alembic export. These are standard in VFX and gaming pipelines for cloth animation.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §13 — Animation](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### FBX/COLLADA Motion Import
- Import skeletal animations from FBX files (walk cycles, poses, runway walks)
- Import from COLLADA (.dae) animation files
- Map imported skeleton to OpenClo avatar joint hierarchy
- IK joint mapping handles different skeleton topologies
- Timeline integration: imported animation plays in keyframe editor

### Alembic Animation Cache Export
- Export simulated cloth mesh animation as Alembic (.abc) cache
- Per-frame vertex positions and normals
- Compatible with Maya, Houdini, Blender, Cinema 4D
- Configurable frame range and sample rate
- Includes mesh topology for compatible playback

### Additional Export Formats
- Maya Cache (.mc/.mcx)
- Point Cache 2 (.pc2)
- MDD Cache (.mdd)
- OBJ Sequence (numbered .obj files per frame)

---

## Implementation Strategy

1. FBX motion: parse skeleton animation tracks from FBX using `three/examples/jsm/loaders/FBXLoader`
2. Skeleton retargeting: map source joints to OpenClo avatar joints by name/hierarchy matching
3. Alembic export: use `alembic-js` WASM bindings or custom encoder
4. Cache formats: binary serialization of vertex position arrays per frame

## Dependencies

- #229 — Avatar Posing (skeleton system for motion retargeting)
- #230 — Keyframe Animation (timeline for motion playback)

## Acceptance Criteria

- [ ] FBX skeletal animation loads and plays on avatar
- [ ] Skeleton retargeting maps different joint hierarchies
- [ ] Alembic export captures cloth simulation as mesh cache
- [ ] OBJ sequence export writes numbered .obj per frame
- [ ] Imported motions visible in keyframe timeline
