## Summary

Implement an offline ray tracing / path tracing renderer for photorealistic garment visualization. This produces marketing-quality images that match physical sample photography.

**Competitive context:** CLO3D integrates Chaos V-Ray; Browzwear uses Unreal Engine rendering. Both produce photorealistic output. A WebGPU-based path tracer or integration with a JS ray tracing library can achieve comparable quality in-browser.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §10 — Rendering & Visualization](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Path Tracing Renderer
- Progressive path tracing with configurable sample count
- Interactive preview that refines over time
- Final render to image at specified resolution
- Global illumination, soft shadows, caustics
- Fabric-specific BRDFs: sheen, subsurface scattering, anisotropic highlights

### Render Settings
- Exposure, contrast, and white balance controls
- Noise threshold (quality vs speed tradeoff)
- Max bounces (light path depth)
- Denoiser: AI-based or bilateral filter for faster convergence

### Integration Options
- **Option A:** WebGPU compute-based path tracer (fully in-browser)
- **Option B:** Three.js path tracing addon (`three-gpu-pathtracer`)
- **Option C:** Server-side render farm with result streaming

---

## Implementation Strategy

### Recommended: three-gpu-pathtracer
1. Integrate `three-gpu-pathtracer` library
2. Share scene graph with existing R3F viewport
3. Add "Render" button that switches to path tracing mode
4. Progressive refinement with sample counter
5. Export final image when converged

### Alternative: WebGPU Path Tracer
1. Build custom WGSL path tracing compute shader
2. BVH acceleration structure for scene traversal
3. Material evaluation with fabric BRDF
4. Higher implementation effort but full control

---

## Dependencies

- #220 — PBR Materials (path tracer reads PBR material properties)
- #225 — HDRI Environments (path tracer uses HDRI for lighting)

## Acceptance Criteria

- [ ] Path tracing renderer produces photorealistic images
- [ ] Progressive refinement with interactive preview
- [ ] Global illumination and soft shadows
- [ ] Configurable sample count and resolution
- [ ] Fabric-appropriate shading (sheen, subsurface)
- [ ] Final render export as PNG/JPEG
- [ ] Denoiser for faster convergence
