# Rendering Enhancements Design

**Issue:** #377
**Date:** 2026-03-22
**Status:** Approved

Covers 7 CLO3D gap features: custom resolution, render properties, light properties, image/video properties, avatar rendering style, garment rendering style (flat/x-ray), and copy/save render image. Plus copilot tool registration for all new capabilities.

---

## 1. Architecture: Approach B — Decomposed Panel

One Redux slice (`renderSettingsSlice`) holds all render state. The `RenderSettingsPanel` becomes a thin shell rendering 8 extracted sub-components. New surface modes extend the existing `SurfaceMode3D` type in `simulationSlice`.

### File Structure

```
src/components/Viewport3D/
  RenderSettingsPanel.tsx          ← thin shell, renders sections
  RenderSettingsPanel.css          ← existing styles
  renderSections/
    EnvironmentSection.tsx         ← extracted (HDRI, rotation, upload)
    RenderQualitySection.tsx       ← tone mapping + sampling + denoiser + AA
    BackgroundSection.tsx          ← extracted (mode, color)
    GroundSection.tsx              ← extracted (visibility, shadow opacity/blur)
    LightingSection.tsx            ← extended (types, shadows, spot props)
    AvatarStyleSection.tsx         ← new (visible/transparent/silhouette/hidden)
    ResolutionSection.tsx          ← new (presets, W×H, aspect lock)
    ExportSection.tsx              ← extended (format, quality, copy, FPS)

src/store/
  renderSettingsSlice.ts           ← extended state + reducers
  simulationSlice.ts               ← new SurfaceMode3D values

src/components/DisplayBar3D/
  DisplayBar3D.tsx                 ← new surface mode buttons

src/components/Viewport3D/
  CustomLights.tsx                 ← multi-type light rendering + helpers
  GarmentSimulation.tsx            ← flat/xray/shaded material branches
  PieceMesh.tsx                    ← flat/xray/shaded for arrange mode
  AvatarModel.tsx                  ← avatar render style application

src/utils/export/
  stillExporter.ts                 ← format/quality/multi-sample support
  turntableRenderer.ts             ← codec/FPS options

src/tools/
  renderTools.ts                   ← 7 new copilot tools (registered in tool registry)
```

---

## 2. State Model

### renderSettingsSlice Extensions

```typescript
// --- New types ---

type LightType = 'rect' | 'point' | 'directional' | 'spot';
type AvatarRenderStyle = 'visible' | 'transparent' | 'silhouette' | 'hidden';
type ImageFormat = 'png' | 'jpeg' | 'exr';
type VideoFormat = 'webm' | 'mp4';
type ResolutionPreset = '1080p' | '4k' | 'instagram' | 'instagram-story' | 'custom';

// --- Extended CustomLight ---

interface CustomLight {
  id: string;
  type: LightType;                              // NEW (default: 'rect')
  color: string;
  intensity: number;
  width?: number;                                // rect only (default: 1)
  height?: number;                               // rect only (default: 1)
  position: [number, number, number];
  rotation: [number, number, number];
  castShadow: boolean;                           // NEW (default: false)
  shadowSoftness: number;                        // NEW (0-1, default: 0.5)
  spotAngle: number;                             // NEW (spot only, degrees, default: 45)
  spotPenumbra: number;                          // NEW (spot only, 0-1, default: 0.5)
  distance: number;                              // NEW (point only, 0 = infinite, default: 0)
  decay: number;                                 // NEW (point only, physically correct = 2, default: 2)
}

// --- New fields on RenderSettingsState ---

interface RenderSettingsState {
  // ... existing fields ...

  // Resolution
  resolutionPreset: ResolutionPreset;            // default: 'custom'
  exportWidth: number;                           // moved from component local state, default: 2048
  exportHeight: number;                          // moved from component local state, default: 2048
  aspectRatioLocked: boolean;                    // default: false

  // Render quality
  samplesPerPixel: number;                       // 1-64, default: 1 (realtime)
  denoiserEnabled: boolean;                      // default: false
  exportTransparent: boolean;                    // moved from component local state, default: false

  // Export format
  imageFormat: ImageFormat;                      // default: 'png'
  jpegQuality: number;                           // 0.1-1.0, default: 0.9
  videoFormat: VideoFormat;                      // default: 'webm'
  videoFps: number;                              // default: 30

  // Avatar
  avatarRenderStyle: AvatarRenderStyle;          // default: 'visible'
}
```

### Resolution Presets

| Preset | Width | Height | Aspect |
|--------|-------|--------|--------|
| 1080p | 1920 | 1080 | 16:9 |
| 4K | 3840 | 2160 | 16:9 |
| Instagram Square | 1080 | 1080 | 1:1 |
| Instagram Story | 1080 | 1920 | 9:16 |
| Custom | user input | user input | — |

When aspect ratio lock is engaged, the ratio is captured from the current W/H. Changing one dimension auto-calculates the other. Selecting a resolution preset unlocks aspect ratio and sets both dimensions — this avoids conflicts between a previously locked ratio and the preset's own ratio.

### SurfaceMode3D Extension (simulationSlice)

```typescript
type SurfaceMode3D =
  | 'textured' | 'translucent' | 'mesh' | 'thick'   // existing
  | 'flat' | 'xray' | 'shaded'                        // new single modes
  | 'shaded-wire' | 'textured-wire';                   // new combined modes
```

---

## 3. Garment Surface Modes

### New Mode Materials

| Mode | Material Strategy |
|------|-------------------|
| `flat` | Emissive = piece color, roughness 1.0, no light influence. Unlit look. |
| `shaded` | Standard material with `map`/`normalMap`/`roughnessMap` = null. Just lighting + base color. |
| `xray` | Opacity 0.1, depthWrite false + separate wireframe mesh overlay. |
| `shaded-wire` | Shaded base + wireframe mesh overlay. |
| `textured-wire` | Full textured base + wireframe mesh overlay. |

**Where modes are consumed:**
- **Arrange mode:** `PieceMesh.tsx` — already reads `surfaceMode3D` and sets opacity/wireframe. New modes add material branching here.
- **Simulate mode:** `GarmentSimulation.tsx` — currently does NOT read `surfaceMode3D`. Must be wired up to read it from Redux and apply material changes to the merged `MeshStandardNodeMaterial`. For `flat`, set emissive node and disable lighting contribution. For `shaded`, null out texture map nodes. For wireframe overlays, add a sibling wireframe mesh cloned from the merged geometry.

### Wireframe Overlay (combined modes)

Combined modes (`xray`, `shaded-wire`, `textured-wire`) render a second pass:

1. Clone garment geometry
2. Apply wireframe material using `MeshBasicNodeMaterial` (from `three/webgpu`) — **not** legacy `MeshBasicMaterial`, which is rejected by the WebGPU NodeMaterial system
3. Set `wireframe: true`, `depthTest: true`, `polygonOffset: true`, `polygonOffsetFactor: -1` to avoid z-fighting
4. Render as sibling mesh in the scene graph

This avoids modifying the `MeshStandardNodeMaterial` pipeline used by the base garment mesh.

### DisplayBar3D Layout

Existing button groups stay unchanged. New modes added after the surface group:

```
[toggles: G S I] | [surface: Tx Tr M Tk Fl XR Sh] | [+wire: S+W T+W] | [fit: St Sn Ft Pr]
```

New buttons use appropriate Lucide icons:
- Flat → `Square`
- X-Ray → `Scan`
- Shaded → `Circle`
- Shaded+Wire → `CircleDot` (repurposed, move pressure to `Target`)
- Textured+Wire → `ImagePlus`

---

## 4. Lighting Enhancements

### Light Types

| Type | Three.js Class | Unique Properties | Shadows |
|------|---------------|-------------------|---------|
| `rect` | `RectAreaLight` | width, height | No (not supported) |
| `point` | `PointLight` | decay, distance | No (expensive cube map) |
| `directional` | `DirectionalLight` | — (parallel rays) | Yes |
| `spot` | `SpotLight` | angle, penumbra | Yes |

### Shadow Strategy

**Constraint:** The WebGPURenderer's NodeMaterial system rejects legacy materials (`MeshDepthMaterial`, `ShadowMaterial`) required for shadow map generation. The codebase explicitly disables shadows with `shadows={!nodeMaterialActive}` (always false). Shadow maps are not feasible with the current renderer.

**v1 approach:**
- `ContactShadows` is currently disabled by the same NodeMaterial constraint (`!nodeMaterialActive`). Ground shadows rely on the existing ground plane opacity/blur setup
- `castShadow` and `shadowSoftness` fields exist in state but are **UI-only indicators** — they do not produce real shadow maps
- The "Natural" preset sets `castShadow: true` on the directional light as a forward-compatible default
- When Three.js NodeMaterial adds shadow support (tracked upstream), enabling real shadows becomes a renderer config change, not a state/UI change
- The `castShadow` toggle is shown in the UI with a tooltip: "Shadow maps require WebGL fallback mode"

### Light Helpers (Gizmos)

Visual helpers shown in viewport when a light is selected in the panel:

| Type | Helper |
|------|--------|
| `rect` | `RectAreaLightHelper` |
| `point` | `PointLightHelper` (small sphere) |
| `directional` | `DirectionalLightHelper` (arrow) |
| `spot` | `SpotLightHelper` (cone wireframe) |

Toggle-able via a "Show Helpers" checkbox in the Lighting section. Helpers use low-opacity wireframe, not obtrusive.

### Updated Presets

Existing presets remain with `type: 'rect'`. One new preset added:

```typescript
natural: [
  { id: 'sun', type: 'directional', color: '#fff8e7', intensity: 1.2,
    position: [3, 4, 2], rotation: [0, 0, 0], castShadow: true, shadowSoftness: 0.5, ... },
  { id: 'fill', type: 'point', color: '#e8f0ff', intensity: 0.4,
    position: [-2, 1.5, 1], rotation: [0, 0, 0], castShadow: false, ... },
]
```

### CustomLights.tsx Changes

Currently renders only `<rectAreaLight>`. Updated to switch on `light.type`:

```typescript
switch (light.type) {
  case 'rect':  return <rectAreaLight ... />;
  case 'point': return <pointLight ... />;
  case 'directional': return <directionalLight ... />;
  case 'spot':  return <spotLight ... />;
}
```

Each type conditionally applies shadow props and renders its helper when selected.

---

## 5. Avatar Render Style

### Styles

| Style | Implementation |
|-------|---------------|
| `visible` | Default — full material, opacity 1.0 |
| `transparent` | opacity 0.3, depthWrite false |
| `silhouette` | Black emissive material, opacity 0.8, no lighting |
| `hidden` | `visible = false` on avatar mesh group |

Applied in `AvatarModel.tsx` on the loaded GLB/VRM mesh group. Independent of garment surface mode.

**Transparent mode render order:** When avatar is `transparent` with `depthWrite: false`, garment fragments behind the avatar could be incorrectly occluded. Set `renderOrder: 1` on the avatar group in transparent mode so it renders after the garment, preventing depth buffer artifacts.

### UI

4-button toggle row in `AvatarStyleSection`, matching the pattern of the background mode toggle:

```
[Visible] [Transparent] [Silhouette] [Hidden]
```

---

## 6. Render Quality

### Controls

| Control | Range | Default | Scope |
|---------|-------|---------|-------|
| Samples per pixel | 1–64 | 1 | Export only |
| Denoiser | on/off | off | Export only |

Anti-aliasing is handled by hardware MSAA (`antialias: true` on WebGPURenderer), always active.

### Multi-Sample Accumulation (Export Only)

When `samplesPerPixel > 1`, the still exporter:

1. Creates a `THREE.RenderTarget` (not `WebGLRenderTarget`) at export resolution with `HalfFloatType` for accumulation precision
2. For each sample, applies sub-pixel jitter to the camera projection matrix
3. Renders to the accumulation target
4. Averages all samples into the final buffer
5. Uses `readRenderTargetPixelsAsync` for WebGPU, sync readback for WebGL fallback
6. Outputs final image

This runs only during export. The live viewport stays at 1 sample with hardware MSAA for smooth interaction.

### Denoiser (v1: Export-Only Bilateral Filter)

**Constraint:** The WebGPURenderer's NodeMaterial system rejects legacy `ShaderMaterial`-based post-processing passes (`EffectComposer`, `FXAAPass`, `SMAAPass`). Viewport post-processing is not feasible with the current renderer.

**v1 approach:** Bilateral filter applied as a **CPU-side pixel buffer operation after export readback**, not as a viewport shader pass. The denoiser runs on the `Uint8Array` pixel data between `readRenderTargetPixels` and PNG/JPEG encoding in `stillExporter.ts`. This is export-only.

The toggle controls whether the filter is applied during export. The implementation can be swapped to OIDN (WASM) in a future iteration without changing the UI or state model.

### Anti-Aliasing

**Constraint:** Legacy `FXAAPass`/`SMAAPass` from `three/examples` use `ShaderMaterial` and are incompatible with the WebGPU NodeMaterial pipeline.

**v1 approach:** Rely on hardware MSAA already enabled via `antialias: true` on the `WebGPURenderer`. The AA state field is removed from the spec — hardware MSAA is always active and provides adequate edge smoothing for a garment CAD. If TSL-based post-processing nodes become available in Three.js, FXAA/SMAA can be added as a future enhancement.

---

## 7. Export Enhancements

### Image Format Support

| Format | MIME | Implementation |
|--------|------|---------------|
| PNG | `image/png` | Existing `canvas.toBlob()` |
| JPEG | `image/jpeg` | `canvas.toBlob(cb, 'image/jpeg', quality)` |
| EXR | — | `EXRExporter` from three/examples/jsm (float render target required) |

JPEG quality controlled by `jpegQuality` slider (0.1–1.0). EXR requires rendering to a `RenderTarget` with `FloatType` (separate code path from the `UnsignedByteType` used for PNG/JPEG). Uses `EXRExporter` from `three/examples/jsm` (available since r150+). Falls back to PNG if `EXRExporter` import fails.

### Video Format Support

| Format | MIME | Implementation |
|--------|------|---------------|
| WebM | `video/webm; codecs=vp9` | Existing `MediaRecorder` |
| MP4 | `video/mp4; codecs=avc1` | `MediaRecorder` where browser supports |

MP4 support detected via `MediaRecorder.isTypeSupported()`. If unsupported, option is grayed out with tooltip. FPS options: 24, 30, 60.

### Copy to Clipboard

```typescript
async function copyToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  );
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}
```

Button added next to "Export Still": `[Export Still] [Copy]`. Shows brief toast "Copied to clipboard" on success. Uses a lightweight inline toast (CSS animation, auto-dismiss after 2s) local to the Export section — not the `CopilotToast` system, since this is not a copilot action.

### Auto-Naming

Exported files use pattern: `openclo-render-YYYY-MM-DD-HHmmss.{ext}`

---

## 8. Copilot Tool Registration

7 new tools registered via `registerTool()` in `src/tools/renderTools.ts` (where the existing tool registry lives). All are `ExecuteStep`-compatible (no LLM evaluation needed).

### Tools

```typescript
// setRenderResolution
// "Set resolution to 4K" / "Make it 1080x1080"
{
  name: 'setRenderResolution',
  description: 'Set render resolution by preset or custom dimensions',
  params: {
    preset: { type: 'string', enum: ['1080p', '4k', 'instagram', 'instagram-story', 'custom'], optional: true },
    width: { type: 'number', optional: true },
    height: { type: 'number', optional: true },
  },
  execute: ({ preset, width, height }) => {
    if (preset) dispatch(setResolutionPreset(preset));
    if (width) dispatch(setExportWidth(width));
    if (height) dispatch(setExportHeight(height));
  },
}

// setGarmentDisplayMode
// "Switch to X-Ray mode" / "Show flat view"
{
  name: 'setGarmentDisplayMode',
  params: { mode: { type: 'string', enum: SurfaceMode3D_values } },
  execute: ({ mode }) => dispatch(setSurfaceMode3D(mode)),
}

// setAvatarRenderStyle
// "Hide the avatar" / "Make avatar transparent"
{
  name: 'setAvatarRenderStyle',
  params: { style: { type: 'string', enum: ['visible', 'transparent', 'silhouette', 'hidden'] } },
  execute: ({ style }) => dispatch(setAvatarRenderStyle(style)),
}

// applyLightingPreset
// "Use studio 3-point lighting"
{
  name: 'applyLightingPreset',
  params: { preset: { type: 'string', enum: ['studio3Point', 'softBox', 'dramatic', 'natural'] } },
  execute: ({ preset }) => dispatch(applyLightPreset(preset)),
}

// exportRender
// "Export a 4K PNG with transparent background"
{
  name: 'exportRender',
  params: {
    type: { type: 'string', enum: ['still', 'turntable', 'allViews'] },
    format: { type: 'string', enum: ['png', 'jpeg', 'exr'], optional: true },
    transparent: { type: 'boolean', optional: true },
  },
  execute: async ({ type, format, transparent }) => {
    if (format) dispatch(setImageFormat(format));
    if (transparent !== undefined) {
      const currentBg = getState().renderSettings.backgroundMode;
      dispatch(setBackgroundMode(transparent ? 'transparent' : currentBg));
    }
    // trigger appropriate export callback
  },
}

// copyRenderToClipboard
// "Copy the current view to clipboard"
{
  name: 'copyRenderToClipboard',
  params: {},
  execute: async () => { /* canvas.toBlob → clipboard.write */ },
}

// setRenderQuality
// "Set samples to 32 and enable denoiser"
{
  name: 'setRenderQuality',
  params: {
    samples: { type: 'number', optional: true },
    denoiser: { type: 'boolean', optional: true },
  },
  execute: ({ samples, denoiser }) => {
    if (samples) dispatch(setSamplesPerPixel(samples));
    if (denoiser !== undefined) dispatch(setDenoiserEnabled(denoiser));
  },
}
```

No rollback functions needed — rendering operations don't mutate project state.

---

## 9. Migration & Backwards Compatibility

### CustomLight Migration

Existing `CustomLight` objects in Redux state (and localStorage) lack the new fields (`type`, `castShadow`, etc.). The slice initializer applies defaults:

```typescript
// In reducer or selector
function migrateLight(light: CustomLight): CustomLight {
  return {
    type: 'rect',
    castShadow: false,
    shadowSoftness: 0.5,
    spotAngle: 45,
    spotPenumbra: 0.5,
    distance: 0,
    decay: 2,
    ...light,
  };
}
```

### Export Width/Height

Currently local state in `RenderSettingsPanel`. Moved to Redux with same defaults (2048×2048). No user-facing change.

---

## 10. Non-Goals

- **Real-time ray tracing** — out of scope, Three.js doesn't support it
- **Full OIDN denoiser** — deferred to future; v1 uses CPU bilateral filter on export
- **Shadow maps** — blocked by WebGPU NodeMaterial rejection of `MeshDepthMaterial`; state is forward-compatible
- **Viewport post-processing (FXAA/SMAA)** — blocked by WebGPU NodeMaterial rejection of legacy `ShaderMaterial`; hardware MSAA provides adequate AA
- **Light position dragging in viewport** — deferred; v1 uses panel sliders only
- **Render layers/passes** (separate diffuse/specular/AO) — out of scope
- **Animation timeline for lights** — out of scope
