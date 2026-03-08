## Summary

Implement a professional 3D rendering pipeline with HDRI environment maps, PBR viewport rendering, turntable image/video export, custom lighting rigs, ground shadows, transparent backgrounds, and high-resolution still export.

**Competitive context:** CLO3D ships V-Ray integration; Browzwear uses Unreal Engine rendering. While we don't need a full offline renderer immediately, the viewport must produce presentation-quality visuals with proper environment lighting.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §10 — Rendering & Visualization](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### HDRI Environment Maps
- Load `.hdr` / `.exr` environment maps for image-based lighting
- Ship 6–8 default environments (studio, outdoor, showroom, etc.)
- Custom HDRI upload
- HDRI rotation control (-180° to 180°)
- Environment as background or lighting-only (with solid/transparent background)

### PBR Viewport
- `MeshStandardMaterial` with environment map reflections
- Tone mapping: ACES filmic, Reinhard, linear
- Exposure control
- Anti-aliasing: MSAA or FXAA post-processing

### Custom Lighting
- Add/remove rectangle area lights with position gizmo
- Light properties: color, intensity, width, height
- Dome light (from HDRI)
- Up to 4 custom lights simultaneously
- Light presets: studio 3-point, soft box, dramatic

### Ground Shadow
- Contact shadow plane beneath garment
- Shadow opacity and blur controls
- Shadow-only ground (invisible floor that catches shadows)

### Turntable Render
- Orbit camera 360° around garment
- Configurable: frame count (12, 24, 36, 72), direction (CW/CCW)
- Export as image sequence (PNG) or video (MP4/WebM)
- Fixed or auto-centered pivot point

### High-Resolution Still Export
- Render at custom resolution (up to 8192x8192)
- Transparent background option (PNG with alpha)
- Front, back, side preset camera angles
- Batch export: all views in one click

---

## Implementation Strategy

### Phase 1: HDRI + PBR Viewport
1. Add `<Environment>` from `@react-three/drei` with HDRI loading
2. Switch cloth materials to `MeshStandardMaterial` with `envMap`
3. Add tone mapping and exposure controls to 3D settings panel
4. Bundle 6 default HDRI maps in `public/hdri/`

### Phase 2: Custom Lighting
1. Add `LightRig` state to 3D store
2. Implement `RectAreaLight` components with `TransformControls` gizmo
3. Light properties panel with color picker, intensity, dimensions
4. Preset lighting configurations

### Phase 3: Ground & Shadows
1. Add shadow-catching ground plane (`<ContactShadows>` from drei)
2. Shadow opacity, blur, and position controls
3. Toggle ground visibility independently from shadow

### Phase 4: Export
1. Turntable: animate `OrbitControls` and capture frames via `gl.toDataURL()`
2. Stitch frames into video using `MediaRecorder` API or FFmpeg WASM
3. High-res: render to offscreen `WebGLRenderTarget` at custom resolution
4. Transparent background: set `gl.setClearAlpha(0)` + export PNG

---

## Key Files to Modify/Create

- `src/components/Viewport3D/EnvironmentSetup.tsx` — HDRI + lighting
- `src/components/Viewport3D/GroundPlane.tsx` — shadow ground
- `src/components/RenderPanel/` — render settings and export controls
- `src/utils/export/turntableRenderer.ts` — turntable capture
- `src/utils/export/stillExporter.ts` — high-res export

## Related Issues

- #220 — PBR Material System (materials must be PBR for environment to work)
- #237 — Ray Tracing (future upgrade path)

## Acceptance Criteria

- [ ] HDRI environment maps load and provide image-based lighting
- [ ] At least 6 default HDRI environments ship with the app
- [ ] Custom HDRI upload via file picker
- [ ] HDRI rotation slider works in real-time
- [ ] Custom rectangle lights with position/rotation gizmo
- [ ] Ground shadow plane renders beneath garment
- [ ] Turntable exports as image sequence or video
- [ ] High-res still export at configurable resolution up to 8192x8192
- [ ] Transparent background export produces PNG with alpha
- [ ] Tone mapping and exposure controls in settings panel
