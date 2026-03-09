# PBR Material & Texture System — Design Document

> **Issue:** #222 (GitHub)
> **Date:** 2026-03-09
> **Status:** Approved

## Goal

Ship professional fabric rendering with HDRI environment lighting, per-fabric texture maps (diffuse, normal, roughness, AO), a Material Editor tab, custom texture upload, and copilot integration. Garments should look comparable to CLO3D/Browzwear.

## Architecture

### Layered Material Pipeline

Three layers extend the existing `toMeshPhysicalParams()` pipeline without breaking current fabric physics:

1. **Environment Layer** — HDRI environment map for image-based lighting
2. **Texture Layer** — TextureManager loads/caches texture maps per fabric
3. **UI Layer** — Material tab in PropertiesPanel for assignment and customization

No custom shaders. Extends the existing MeshPhysicalMaterial. Backward compatible — fabrics without textures render exactly as today.

## Section 1: HDRI Environment & Tone Mapping

**Current state:** 3 directional lights + ambient + hemisphere. No environment map. Linear color space.

**Changes in `Viewport3D.tsx`:**

- Add `<Environment>` from `@react-three/drei` with bundled studio HDRI (`public/hdri/studio-soft.hdr`, ~3-4MB)
- Switch to `ACESFilmicToneMapping` on the Canvas `gl` config
- Add `toneMappingExposure` (default 1.0)
- Keep existing lights as fill, reduce intensities since HDRI provides primary lighting
- Background: optional toggle between environment map and solid color

**Impact:** Single highest-impact visual change. Every fabric's sheen, roughness, and clearcoat will reflect a real environment.

## Section 2: Texture Data Model & Manager

### Data Model

Extend `PhysicalFabric` with optional `textures` field:

```typescript
interface FabricTextures {
  diffuse?: string;    // path relative to public/textures/fabrics/
  normal?: string;
  roughness?: string;
  ao?: string;         // ambient occlusion
}
```

### TextureManager (`src/utils/textures/TextureManager.ts`)

- `loadFabricTextures(textures: FabricTextures)` → `{ map, normalMap, roughnessMap, aoMap }` as Three.js Textures
- LRU cache (max ~20 texture sets) — avoids reloading when switching between pieces
- Automatic `texture.dispose()` on eviction to prevent GPU memory leaks
- Color spaces: `sRGBColorSpace` for diffuse, `LinearSRGBColorSpace` for normal/roughness/AO
- UV transform support: `repeat`, `rotation`, `offset` applied per-texture

### Custom Uploads

- Store in IndexedDB via blob URL
- Reference in piece's material config as `blob:...` URL
- Serialized in project file as base64 data URL for portability

### Extended `toMeshPhysicalParams()` Output

```typescript
interface FabricRenderParams {
  // existing scalar values
  roughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  opacity: number;
  // new texture references (null if no textures)
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
  aoMap: Texture | null;
  // UV transform
  mapRepeat: [number, number];
  mapRotation: number;
}
```

Backward compatible: null maps → existing scalar-only rendering.

## Section 3: Material Application in 3D Rendering

### GarmentSimulation.tsx

Per-piece material expands:

```tsx
<meshPhysicalMaterial
  roughness={params.roughness}
  sheen={params.sheen}
  sheenColor={params.sheenColor}
  map={params.map}
  normalMap={params.normalMap}
  roughnessMap={params.roughnessMap}
  aoMap={params.aoMap}
  color={pieceTint || '#ffffff'}
  vertexColors={fitMapActive}
/>
```

**Key behaviors:**
- `color` acts as tint multiplier with diffuse map (white = no tint)
- Fit map vertex colors override textures when active
- UV coordinates from 2D pattern piece coordinates (fabric grain follows pattern)

### UV Attribute Wiring

The simulation frame loop already writes positions and normals to BufferGeometry. Add UV attribute writing from the same data source — 2D pattern coordinates serve as UVs. This is how CLO3D maps textures (pattern-space UVs).

### Performance

Texture maps are GPU-resident after first upload. No per-frame cost. LRU cache prevents excessive VRAM. Target: 60fps with 4 textured pieces.

## Section 4: Material Editor UI

### Material Tab in PropertiesPanel

New `MaterialTab.tsx` — appears when a piece is selected, alongside existing property tabs.

**Fabric Preset Selector:**
- Grid of fabric thumbnails (diffuse texture previews, 48x48px)
- Grouped by category: Cotton, Silk, Denim, Wool, Technical, Leather
- Click to assign — updates `pieceFabrics` Redux state + re-renders
- Shows current fabric name + weight badge

**Color Tint Picker:**
- Color swatch + hex input
- Defaults to white (no tint)
- Per-piece storage: `pieceTints: Record<string, string>` in simulationSlice

**Texture Map Slots:**
- 4 labeled drop zones: Diffuse, Normal, Roughness, AO
- Small thumbnail when loaded (preset or custom)
- Drag & drop PNG/JPG to override preset
- "X" to clear override and revert to preset

**UV Transform Controls:**
- Repeat X/Y: number inputs (default 4.0)
- Rotation: slider 0-360 degrees

## Section 5: Bundled Texture Assets

### Fabric Texture Sets (`public/textures/fabrics/`)

| Fabric | Diffuse | Normal | Roughness | AO |
|--------|---------|--------|-----------|-----|
| cotton-poplin | yes | yes | no | no |
| cotton-twill | yes | yes | no | no |
| denim-indigo | yes | yes | yes | no |
| silk-charmeuse | yes | yes | yes | no |
| wool-tweed | yes | yes | yes | yes |
| linen-plain | yes | yes | no | no |
| jersey-knit | yes | yes | no | no |
| leather-smooth | yes | yes | yes | yes |
| neoprene | yes | no | yes | no |
| chiffon-sheer | yes | yes | no | no |
| canvas-heavy | yes | yes | yes | no |
| fleece | yes | yes | no | no |

**Specs:** 1024x1024, JPG for diffuse/roughness/AO (~100-200KB), PNG for normal (~300KB). Seamless/tileable. CC0 licensed. Total: ~30-50MB.

### HDRI

One studio HDRI: `public/hdri/studio-soft.hdr` (~3-4MB). Neutral photography studio lighting.

### File Structure

```
public/
├── hdri/
│   └── studio-soft.hdr
└── textures/
    └── fabrics/
        ├── cotton-poplin/
        │   ├── diffuse.jpg
        │   └── normal.png
        ├── denim-indigo/
        │   ├── diffuse.jpg
        │   ├── normal.png
        │   └── roughness.jpg
        └── ...
```

## Section 6: Copilot Integration

### New Action Tool: `assignFabric`

- Params: `{ pieceId: string, fabricId: string, tint?: string }`
- Updates `pieceFabrics` in Redux + triggers re-render
- Rollback: restore previous fabricId

Completes the copilot material loop: search fabrics → compare → assign → observe fit impact.

**No new meta-tools** — `getFabricDetails` already returns material properties. `getPieceDetails` already includes `fabricId`.

## Section 7: E2E Tests (`tests/e2e/materials.spec.ts`)

1. **HDRI loads and renders** — verify environment map active
2. **Fabric preset changes piece appearance** — assign denim, verify diffuse map loaded
3. **Material tab opens with piece selected** — select piece → Material tab visible
4. **Color tint applies** — pick red tint → verify material color
5. **UV repeat controls work** — change repeat X to 8 → verify texture.repeat.x
6. **Custom texture upload** — drop PNG on diffuse slot → verify map assigned
7. **Material survives simulation restart** — assign fabric → reset → re-start → still assigned

## Unit Tests

- `TextureManager`: cache hit/miss, LRU eviction, dispose called
- `toMeshPhysicalParams` extended: returns texture refs when available, null when not
- `assignFabric` copilot tool: correct Redux state mutation + rollback

## File Map

| Layer | Files |
|-------|-------|
| HDRI | Modify: `src/components/Viewport3D/Viewport3D.tsx` |
| TextureManager | New: `src/utils/textures/TextureManager.ts` |
| Fabric data | Modify: `src/utils/cloth/physicalFabric.ts` — add textures field |
| 3D rendering | Modify: `src/components/Viewport3D/GarmentSimulation.tsx` — texture maps + UV |
| Material UI | New: `src/components/PropertiesPanel/MaterialTab.tsx` |
| Redux state | Modify: `src/store/simulationSlice.ts` — pieceTints, texture overrides |
| Copilot | Modify: `src/copilot/action/tools/definitions/fabricTools.ts` — assignFabric |
| Assets | New: `public/hdri/studio-soft.hdr`, `public/textures/fabrics/` |
| E2E tests | New: `tests/e2e/materials.spec.ts` |
| Unit tests | New: `src/utils/textures/__tests__/TextureManager.test.ts` |

## Out of Scope (YAGNI)

- Procedural/noise-based textures
- Custom shader materials
- Multiple HDRI presets / environment selector
- Displacement maps
- Subsurface scattering
- Material library browser (separate panel)
