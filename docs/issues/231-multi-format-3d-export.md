## Summary

Implement export support for industry-standard 3D file formats: FBX, glTF/GLB, and USD. These formats are required for interoperability with 3D rendering tools (Blender, Maya, Unreal Engine), e-commerce platforms, and AR/VR applications.

**Competitive context:** CLO3D exports to FBX, glTF, USD, OBJ, and Alembic. Browzwear exports to FBX, glTF, and OBJ. OpenClo currently exports only OBJ, which lacks material, animation, and skeleton data.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §12 — Production Output](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### glTF/GLB Export
- Export simulated garment as `.glb` (binary) or `.gltf` + assets
- Include: mesh geometry, PBR materials, textures, UV maps
- Support for multiple meshes (one per pattern piece)
- Draco compression option for smaller file sizes
- Suitable for web viewers, AR try-on, e-commerce

### FBX Export
- Export with skeleton and skinning data (if avatar included)
- Include: mesh, materials, textures, animation data
- Binary FBX format for broad compatibility
- Compatible with Maya, Blender, Unreal Engine, Unity

### USD Export
- Universal Scene Description format
- Include: mesh, materials, variants (colorways as USD variants)
- USDZ package for Apple AR Quick Look
- Suitable for professional VFX pipelines

### Export Options
- Include/exclude avatar mesh
- Include/exclude trims
- Coordinate system selection (Y-up, Z-up)
- Scale factor (mm, cm, m, inches)
- Mesh quality: original or decimated
- Single merged mesh or per-piece separate meshes

---

## Implementation Strategy

### Phase 1: glTF/GLB
1. Use `three/examples/jsm/exporters/GLTFExporter`
2. Configure PBR material export (diffuse, normal, roughness maps)
3. Add export options UI (compression, include avatar, scale)
4. Download as `.glb` file

### Phase 2: FBX
1. Use FBX SDK via WASM or `fbx-parser` library
2. Export mesh geometry with UV coordinates
3. Export skeleton hierarchy if avatar included
4. Include PBR material references

### Phase 3: USD
1. Use OpenUSD WASM bindings or `usd-wasm`
2. Export mesh + materials as USD stage
3. Map colorways to USD variants
4. Package as `.usdz` for Apple AR

---

## Related Issues

- #120 — Export Pipeline Epic (existing — this implements the 3D format portion)
- #25 — 3D interop (closed — import done; export remains)
- #220 — PBR Materials (exported materials depend on this)

## Acceptance Criteria

- [ ] glTF/GLB export with mesh, PBR materials, and textures
- [ ] FBX export with mesh, skeleton (if avatar), and materials
- [ ] USD export with mesh, materials, and colorway variants
- [ ] USDZ packaging for Apple AR Quick Look
- [ ] Export options: scale, coordinate system, include/exclude components
- [ ] Draco compression for glTF
- [ ] Exported files open correctly in Blender and Three.js viewer
