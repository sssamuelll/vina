## Summary

Build a graphic placement engine that allows designers to position artwork (logos, prints, patterns) on both 2D pattern pieces and 3D garments. Support all-over prints via UV tiling, cross-seam alignment, and sublimation workflows.

**Competitive context:** Both CLO3D and Browzwear offer full graphic placement in 2D and 3D with transform gizmos, all-over print, and cross-seam alignment. This is essential for streetwear, sportswear, and any printed garment design.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §7 — Print & Graphics Placement](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### 2D Graphic Placement
- Import image files (PNG, JPG, SVG, PSD) onto 2D pattern pieces
- Transform gizmo: scale, rotate, position with handles
- Snap to pattern center, edges, or construction lines
- Multiple graphics per piece (layered, z-ordered)
- Graphics respect seam allowance boundaries

### 3D Graphic Placement
- Place artwork directly on 3D simulated garment
- 3D placement auto-projects back to 2D pattern coordinates
- Real-time preview as garment drapes
- Gizmo for positioning on curved 3D surface

### All-Over Print (UV Tiling)
- Seamless tiled texture across entire garment
- Per-piece or global tiling controls (repeat X/Y, rotation)
- Grainline alignment: print direction follows fabric grain
- Roll width simulation: visualize how tiled print maps to fabric roll

### Cross-Seam Alignment
- UV-based continuous print across sewn pattern pieces
- Prints match across seam lines for visual continuity
- Alignment reference points at seam junctions
- Preview alignment quality in both 2D and 3D

### Sublimation Print Workflow
- Export flattened pattern pieces with artwork as high-res images
- DXF + corresponding artwork files for sublimation printing
- Color profile management (sRGB, CMYK preview)

---

## Implementation Strategy

### Phase 1: 2D Graphic Layer
1. Add `GraphicLayer` data model per pattern piece
2. Implement drag & drop image import onto 2D canvas
3. Build 2D transform gizmo (scale, rotate, translate handles)
4. Render graphics as overlay on pattern piece in 2D editor

### Phase 2: UV Mapping Pipeline
1. Ensure 2D → 3D UV mapping preserves pattern coordinates
2. Composite graphic onto base fabric texture via offscreen canvas/WebGL
3. Multi-texture material: base fabric + graphic overlay with alpha blending

### Phase 3: 3D Placement
1. Ray cast from mouse to 3D cloth mesh → get UV coordinate
2. Convert UV coordinate to 2D pattern position
3. Place graphic at corresponding 2D location
4. Real-time preview: update composite texture each frame

### Phase 4: All-Over Print & Cross-Seam
1. Implement UV tiling mode with repeat/offset controls
2. Cross-seam alignment: compute shared UV space for sewn edges
3. Preview alignment quality overlay

---

## Key Files to Create

- `src/stores/graphicStore.ts` — graphic placement state
- `src/components/GraphicEditor/` — 2D placement tools
- `src/components/Viewport3D/GraphicOverlay.tsx` — 3D composite rendering

## Related Issues

- #34 — Native graphic editor (existing issue — this supersedes/expands it)
- #33 — 3D decal projection (related — decals are a subset of this system)
- #220 — PBR Material System (graphics composite onto fabric textures)

## Acceptance Criteria

- [ ] Drag & drop image import places graphic on 2D pattern piece
- [ ] 2D transform gizmo allows scale, rotate, and reposition
- [ ] Graphics render on 3D garment via UV mapping
- [ ] 3D placement tool converts click position to 2D coordinates
- [ ] All-over print mode tiles texture across all pieces
- [ ] Cross-seam alignment produces continuous print across seam lines
- [ ] Export: flattened patterns with artwork at print-ready resolution
- [ ] Multiple graphics per piece with z-order control
- [ ] Graphics persist across simulation re-drape
