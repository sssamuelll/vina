# 3D Rendering Pipeline Design — Issue #227

## Goal

Upgrade the 3D viewport with multiple HDRI environments, render settings UI, custom rectangle area lights, turntable video export, and high-res still export with transparent background.

## Current State

The codebase already has significant PBR infrastructure:
- `MeshPhysicalMaterial` with full PBR (sheen, clearcoat, transmission, IOR, thickness)
- HDRI environment (`/hdri/studio-soft.hdr`) via drei `<Environment>`
- ACES filmic tone mapping with exposure=1.0
- Contact shadows on ground plane
- TextureManager with LRU caching (50 slots)
- 32 fabric presets with physics-to-PBR conversion (`toMeshPhysicalParams`)
- Camera presets with eased animation
- Existing snapshot function (`snapshot3D` in Viewport3D.tsx)

## Architecture

### New Redux Slice: `renderSettingsSlice.ts`

```typescript
interface RenderSettingsState {
  // HDRI
  hdriPreset: string;           // 'studio-soft' | 'studio-hard' | ... | 'custom'
  hdriRotation: number;         // degrees, -180 to 180
  hdriCustomUrl: string | null; // blob URL from file upload

  // Tone Mapping
  toneMapping: 'aces' | 'reinhard' | 'linear';
  exposure: number;             // 0.1 to 5.0, default 1.0

  // Background
  backgroundMode: 'hdri' | 'solid' | 'transparent';
  backgroundColor: string;      // hex, default '#f0f0f0'

  // Lights
  lights: CustomLight[];        // max 4

  // Ground
  groundVisible: boolean;
  shadowOpacity: number;        // 0-1
  shadowBlur: number;           // 0-5

  // Turntable
  turntableFrameCount: 36;
  turntableDirection: 'cw' | 'ccw';
}

interface CustomLight {
  id: string;
  color: string;
  intensity: number;       // 0-10
  width: number;           // meters
  height: number;          // meters
  position: [number, number, number];
  rotation: [number, number, number];
}
```

### HDRI Presets

Ship 6 default HDRIs in `public/hdri/` (all CC0 from Poly Haven, 1k resolution ~300KB each):

| Preset | File | Use Case |
|--------|------|----------|
| Studio Soft | `studio-soft.hdr` (existing) | General purpose, neutral |
| Studio Hard | `studio-hard.hdr` | Sharp highlights, product |
| Showroom | `showroom.hdr` | Retail presentation |
| Outdoor Daylight | `outdoor-daylight.hdr` | Natural light, editorial |
| Sunset | `sunset.hdr` | Warm, dramatic |
| Neutral Grey | `neutral-grey.hdr` | Flat, technical review |

### Component Architecture

```
Viewport3D.tsx
├── <EnvironmentSetup />     ← NEW: reads renderSettings, renders <Environment> + <CustomLights>
├── <RenderSettingsPanel />   ← NEW: sidebar panel (like AvatarPanel)
├── <ContactShadows />        ← reads shadowOpacity/blur from Redux
└── ground plane mesh          ← reads groundVisible from Redux
```

`RenderSettingsPanel` opens via a toolbar button (like the existing collision body "CB" button). Sections:
1. **Environment** — HDRI preset grid, rotation slider, upload button
2. **Rendering** — Tone mapping dropdown, exposure slider
3. **Background** — Mode toggle (HDRI/Solid/Transparent), color picker
4. **Lighting** — Add light button, light list with properties
5. **Ground** — Visibility toggle, shadow opacity/blur sliders
6. **Export** — Turntable config + render button, still export button

### Turntable Export

1. Disable OrbitControls, hide UI overlays
2. Orbit camera 360° in N steps (default 36 = 10° per frame)
3. At each step: `renderer.render(scene, camera)` → `canvas.toDataURL('image/png')`
4. Collect frames, stitch into video via `MediaRecorder` API on an offscreen canvas
5. Download as .webm (or fall back to PNG zip)

### High-Res Still Export

1. Create offscreen `WebGLRenderTarget` at requested resolution (up to 8192x8192)
2. Render scene to target
3. Read pixels via `renderer.readRenderTargetPixels()`
4. If transparent background: set `scene.background = null`, `gl.setClearAlpha(0)` before render
5. Encode to PNG via offscreen canvas
6. Restore original background after render

### Light Presets

3 built-in configurations:
- **Studio 3-Point**: Key (warm, 45° right), fill (cool, 45° left), rim (behind)
- **Soft Box**: Two large rect lights flanking the subject, even illumination
- **Dramatic**: Single hard light from above-right, high contrast

## Phases

**Phase 1** (HDRI + Render Controls): Tasks 1-7
**Phase 2** (Custom Lighting): Tasks 8-9
**Phase 3** (Export): Tasks 10-12

## Key Files

| File | Action |
|------|--------|
| `src/store/renderSettingsSlice.ts` | Create |
| `src/store/index.ts` | Modify (add reducer) |
| `src/components/Viewport3D/EnvironmentSetup.tsx` | Create |
| `src/components/Viewport3D/CustomLights.tsx` | Create |
| `src/components/Viewport3D/RenderSettingsPanel.tsx` | Create |
| `src/components/Viewport3D/RenderSettingsPanel.css` | Create |
| `src/components/Viewport3D/Viewport3D.tsx` | Modify (use EnvironmentSetup, add panel) |
| `src/utils/export/turntableRenderer.ts` | Create |
| `src/utils/export/stillExporter.ts` | Create |
| `public/hdri/*.hdr` | Add 5 new HDRI files |
