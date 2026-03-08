## Summary

Add a PBR (Physically-Based Rendering) material system that allows users to apply texture maps — diffuse, normal, roughness, metallic, and opacity — to cloth meshes. This transforms the 3D viewport from a simulation preview into a realistic fabric visualization tool.

**Competitive context:** Both CLO3D and Browzwear render fabrics with full texture maps. Without this, OpenClo garments look like flat-shaded polygons, which is the most visually obvious gap versus competitors.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §4 — Fabric & Material System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Texture Map Types
| Map | Purpose | Three.js Property |
|-----|---------|-------------------|
| **Diffuse / Color** | Base color/print of fabric | `map` |
| **Normal** | Surface micro-detail (weave texture) | `normalMap` |
| **Roughness** | Matte vs shiny surface | `roughnessMap` |
| **Metallic** | Metal vs dielectric (for hardware/trims) | `metalnessMap` |
| **Opacity / Alpha** | Transparency (lace, mesh fabrics) | `alphaMap` |
| **Ambient Occlusion** | Contact shadows in fabric folds | `aoMap` |

### Texture Application
- Apply texture per pattern piece or per material slot
- Texture transform controls: scale, rotation, offset (for repeat/tiling)
- UV mapping uses existing cloth mesh UVs from 2D pattern layout
- Real-time preview — texture updates as simulation runs
- Texture resolution: support up to 4096x4096

### Material Presets
- Extend `PHYSICAL_FABRIC_LIBRARY` entries with default texture set references
- Ship 10–15 bundled fabric textures (cotton weave, denim, silk, knit, etc.)
- User can upload custom textures (drag & drop or file picker)

### Material Editor Panel
- Per-piece material assignment UI
- Texture slot browser with preview thumbnails
- Transform controls (repeat X/Y, rotation, offset)
- PBR property sliders (roughness, metalness, normal strength)
- Color tint overlay on top of diffuse texture

---

## Implementation Strategy

### Phase 1: Material Infrastructure
1. Create `FabricMaterial` class extending `MeshStandardMaterial`
2. Add `TextureStore` — manages loaded textures, caching, and disposal
3. Add texture fields to fabric preset type in `physicalFabric.ts`

### Phase 2: UV Mapping
1. Ensure cloth mesh has proper UV coordinates from 2D pattern → 3D mapping
2. UV unwrapping already exists for simulation; verify it's passed to Three.js geometry
3. Add UV2 channel for ambient occlusion if needed

### Phase 3: Material Editor UI
1. New `MaterialPanel` component in sidebar
2. Texture slot grid with upload/clear buttons
3. Transform controls (repeat, rotation, offset)
4. Live preview updates

### Phase 4: Bundled Textures
1. Create `public/textures/fabrics/` directory
2. Include CC0-licensed fabric texture sets
3. Thumbnail generation for material browser

---

## Key Files to Modify

- `src/utils/cloth/physicalFabric.ts` — add texture references to fabric presets
- `src/components/Viewport3D/ClothMesh.tsx` — switch from basic material to PBR
- New: `src/stores/materialStore.ts` — texture loading and material state
- New: `src/components/MaterialPanel/` — material editor UI

## Related Issues

- #115 — Epic: Materials & Fabric System (closed — physical properties done; textures remain)
- #93 — Fabric Rendering (closed — sheen/SSS exploration)
- #221 — Colorway Management (materials per colorway depend on this)

## Acceptance Criteria

- [ ] Cloth mesh renders with `MeshStandardMaterial` + environment map
- [ ] Users can apply diffuse, normal, roughness, and opacity maps per piece
- [ ] Texture repeat/rotation/offset controls work in real-time
- [ ] At least 10 bundled fabric texture sets ship with the app
- [ ] Material editor panel allows per-piece assignment
- [ ] Custom texture upload via drag & drop (PNG, JPG, WebP)
- [ ] Textures persist across simulation reset/re-drape
- [ ] Performance: textured rendering maintains 60fps with 4 pattern pieces
