## Summary

Add support for Substance Designer procedural materials (.sbsar files). Procedural materials generate textures algorithmically with adjustable parameters, enabling infinite fabric variations from a single material definition.

**Competitive context:** Browzwear supports SBSAR materials natively. Substance materials are widely used in 3D fashion and game development for photorealistic fabric representation.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §4 — Fabric & Material System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Load `.sbsar` (Substance Archive) files
- Expose material parameters as UI sliders (e.g., thread density, wear, color)
- Generate PBR texture maps (diffuse, normal, roughness, metallic, AO) from parameters
- Real-time texture regeneration when parameters change
- Preset parameter snapshots for quick variations

## Implementation Strategy

1. Use Substance Automation Toolkit (SAT) via WASM or server-side rendering
2. Alternatively, use `substance-integration` WebAssembly module
3. Parse `.sbsar` parameter definitions → generate UI controls
4. Render texture maps to canvas → apply to cloth material (#220)

## Dependencies

- #220 — PBR Material System (generated maps applied through PBR pipeline)

## Acceptance Criteria

- [ ] Load `.sbsar` files and expose parameters as sliders
- [ ] Generate diffuse, normal, roughness maps from parameters
- [ ] Real-time texture update on parameter change
- [ ] Generated textures apply to cloth mesh via PBR pipeline
