# Competitive Gap Analysis: Vina vs CLO3D & Browzwear

> Date: 2026-03-06
> Status: Draft
> Scope: Feature parity audit against CLO3D (v2025.2) and Browzwear (VStitcher 2024/2025)

## Purpose

This document catalogs every major feature in the two leading garment CAD platforms — CLO3D and Browzwear VStitcher — and maps them against Vina.ai's current capabilities. Each gap is classified by competitive impact to guide roadmap prioritization.

---

## 1. 2D Pattern Design Tools

### Already Implemented

| Feature | Notes |
|---------|-------|
| Pen/polygon drawing | 45 tools in 2D toolbar |
| Rectangle/circle/ellipse | Primitive shape tools |
| Split/merge patterns | Scissors + merge tool |
| Mirror/instance patterns | Linked editing system |
| Dart manipulation | Add/edit darts |
| Notch tool (7 types) | V, I, T, slit, castle, diamond, custom |
| Grainline tool | Visual + simulation-aware |
| Seam allowance offset | Per-edge configurable |
| Bezier curve editing | Cubic bezier with control handles |
| Internal lines/shapes | Construction lines within pieces |
| Symmetric editing | Linked editing across mirrored pieces |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| 3D Pen (draw on avatar) | Yes | No | **Tier 2** | Draw garment silhouette on 3D avatar, auto-flatten to 2D |
| AI Pattern Drafter | Yes (2025.0) | No | **Tier 3** | Parametric generation from measurements; Vina copilot covers some of this |
| Trace Tool (over image) | Yes | No | **Tier 3** | Trace imported reference images to create patterns |
| Spiral pattern tool | Yes | No | Low | Niche use case |

---

## 2. Sewing & Construction

### Already Implemented

| Feature | Notes |
|---------|-------|
| Segment sewing | Edge-to-edge sewing with alignment |
| Free sewing | Point-to-point flexible sewing |
| Topstitch (4 modes) | Seamline, offset, internal line, free |
| Seam types | French, overlock, flat-felled, etc. |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Pleats sewing/fold | Yes | Yes | **Tier 2** | Knife pleats, box pleats, fold arrangement |
| Fold arrangement | Yes | Yes | **Tier 2** | Apply fold angles on internal lines (hems, facings) |
| Seam puckering | Yes | No | **Tier 3** | Visual puckering effect along sewn seams |
| Seam bulk/thickness | Yes | Yes | **Tier 3** | Thickness buildup at multi-layer seam junctions |
| Tack/basting stitch | Yes | No | **Tier 3** | Temporary holds for complex constructions |

---

## 3. 3D Simulation & Draping

### Already Implemented

| Feature | Notes |
|---------|-------|
| XPBD cloth simulation | Rust WASM solver with JS fallback |
| Self-collision | Configurable per cloth |
| Multi-body collision | Universal collision body system |
| Play/pause/reset | Simulation controls |
| Simulation snapshots | A/B/C comparison |
| Per-body friction | Configurable per collision body |
| Collision margin/offset | Per-body offset in meters |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| GPU-accelerated sim | Yes | Yes | **Tier 2** | WebGPU compute shaders; planned |
| Wind effect | Yes | No | **Tier 3** | Directional wind with gizmo, area of influence |
| Steam/press tool | Yes | No | **Tier 3** | Smooth wrinkles via simulated pressing |
| Non-linear materials | Yes | No | **Tier 3** | Non-linear stress-strain response |
| Simulation quality presets | Yes | Yes | **Tier 3** | Fine/coarse wrinkle detail toggle |
| Freeze individual patterns | Yes | Yes | **Tier 3** | Lock specific pieces while simulating others |
| Elastic simulation | Yes | Yes | **Tier 3** | Elastic bands at edges; partially implemented |

---

## 4. Fabric & Material System

### Already Implemented

| Feature | Notes |
|---------|-------|
| Physical fabric library | 32+ presets in `physicalFabric.ts` |
| Directional properties | Stretch/bend warp, weft, shear/bias |
| Internal damping | Per-fabric 0.0–1.0 |
| Surface friction | Per-fabric and per-body friction |
| Tensile/tear strength | Full mechanical property set |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| PBR material rendering | Yes | Yes | **Tier 1** | Diffuse, normal, roughness, metallic maps on fabrics |
| Texture/diffuse maps | Yes | Yes | **Tier 1** | Apply fabric print textures to cloth mesh |
| Normal/specular maps | Yes | Yes | **Tier 1** | Surface detail without geometry |
| SBSAR/Substance support | No | Yes | **Tier 3** | Procedural material graphs |
| Multilayered fabrics | No | Yes | **Tier 3** | Composite fabric stacks |
| Knit swatch editor | Yes (2025.2) | No | **Tier 3** | Stitch-level knitwear design |
| Fabric scanner integration | Yes (zFab) | Yes (FAB) | **Tier 3** | Hardware; out of scope for web app |

---

## 5. Trims & Hardware

### Currently Missing (entire subsystem)

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Buttons | Yes | Yes | **Tier 1** | Parametric buttons with placement tool |
| Buttonholes | Yes | Yes | **Tier 1** | Paired with buttons for closures |
| Zippers | Yes | Yes | **Tier 1** | Draw along edges; tape width, teeth style |
| Snaps/rivets | Yes | Yes | **Tier 2** | Metal hardware |
| Custom OBJ trims | Yes | Yes | **Tier 2** | Import arbitrary 3D trim meshes |
| Elastic trims | Yes | Yes | **Tier 2** | Elastic binding at edges |
| Buckles/rings | Yes | Yes | **Tier 3** | D-rings, O-rings, belt buckles |
| Drawstrings | Yes | No | **Tier 3** | Functional drawstring elements |

### Implementation Notes

A trim system requires:
1. **Trim library** — Parametric + custom mesh trims
2. **Placement engine** — Snap to pattern edge/point, spacing controls
3. **3D rendering** — Instanced mesh rendering on cloth surface
4. **Simulation interaction** — Trims add mass, affect drape
5. **BOM integration** — Auto-populate bill of materials

---

## 6. Colorway Management

### Currently Missing (entire subsystem)

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Multi-colorway system | Yes | Yes | **Tier 1** | Create N color/material variations per garment |
| Per-colorway materials | Yes | Yes | **Tier 1** | Independent fabric, color, trim per colorway |
| Pantone libraries | Yes | Yes | **Tier 2** | TCX, TSX, TN color matching |
| Color palette import/export | Yes | Yes | **Tier 2** | .aco, .ase palette files |
| Linked vs unique items | Yes | Yes | **Tier 2** | Shared items update across all colorways |
| Quick colorway switch | Yes | Yes | **Tier 2** | One-click swap in object browser |

### Implementation Notes

A colorway system requires:
1. **Colorway state** — Array of material override sets per garment
2. **Material binding** — Each pattern piece references a material slot, colorway overrides the slot
3. **UI panel** — Colorway list, add/delete, rename, per-piece material picker
4. **3D sync** — Real-time material swap on cloth mesh
5. **Export** — Include colorway data in tech pack / BOM

---

## 7. Print & Graphics Placement

### Currently Missing (entire subsystem)

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Graphic placement (2D) | Yes | Yes | **Tier 1** | Place artwork on 2D pattern with transform gizmo |
| Graphic placement (3D) | Yes | Yes | **Tier 1** | Place artwork on 3D garment, projects to 2D |
| All-over print (UV tiling) | Yes | Yes | **Tier 1** | Seamless tiled prints across entire garment |
| Cross-seam alignment | Yes | Yes | **Tier 2** | UV-based alignment for continuous prints across pieces |
| AI/PSD artwork import | Yes | Yes | **Tier 2** | Import from Illustrator/Photoshop |
| 3D decal projection | Yes | Yes | **Tier 2** | Project image onto 3D surface |
| Sublimation print workflow | Yes | Yes | **Tier 3** | Full-garment sublimation via DXF + artwork |

### Implementation Notes

Requires UV mapping on cloth mesh (already used for simulation) plus a texture compositing pipeline:
1. **Artwork layer** — Image + transform per pattern piece
2. **UV projection** — Map 2D placement to 3D mesh UVs
3. **Compositing** — Base fabric texture + graphic overlay
4. **WebGL rendering** — Multi-texture material with alpha blending

---

## 8. Avatar System

### Already Implemented

| Feature | Notes |
|---------|-------|
| Parametric measurements | 44 body measurements |
| Custom avatar import | OBJ/FBX/GLB/GLTF |
| Collision mesh extraction | Auto-extract from imported meshes |
| Animation playback | Animated collision bodies |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Morph target deformation | Yes | Yes | **Tier 2** | Blend shapes for body variation |
| Soft/deformable avatars | Yes | Yes | **Tier 3** | Avatar deforms under garment pressure |
| AI pose generator | Yes (2025.0) | Yes | **Tier 3** | Generate poses from text/image |
| Avatar size sets | Yes | Yes | **Tier 2** | Quick-switch between size-specific avatars |
| Dress form avatars | Yes | No | **Tier 3** | Mannequin models for draping |
| Full joint-based posing | Yes | Yes | **Tier 2** | IK/FK posing with joint hierarchy |

---

## 9. Fit Analysis & Visualization

### Currently Missing (entire subsystem)

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Stress map | Yes | Yes | **Tier 1** | Force per unit area; red = high pressure |
| Strain map | Yes | Yes | **Tier 1** | Stretch/distortion rate; red > 120% |
| Fit map (ease) | Yes | Yes | **Tier 1** | Garment-to-body distance visualization |
| Pressure map | Yes | Yes | **Tier 1** | Contact pressure between garment and body |
| 3D measurement tapes | Yes | Yes | **Tier 2** | Place measurement lines on 3D garment |
| 2D vs 3D comparison | Yes | No | **Tier 2** | Compare flat pattern to simulated dimensions |
| POM (point of measure) | Yes | Yes | **Tier 2** | Ruler measurements with grading display |

### Implementation Notes

The XPBD solver already computes the data needed for fit analysis:
1. **Stress** — Constraint force magnitudes per triangle (already in solver)
2. **Strain** — Rest-length vs current-length ratio per edge (already computed)
3. **Fit/ease** — Distance from each cloth vertex to nearest avatar surface (ray cast)
4. **Pressure** — Normal force at collision points (already in collision solver)
5. **Rendering** — Color-mapped overlay on 3D mesh using vertex colors or custom shader

This is one of the highest-value features relative to implementation cost.

---

## 10. Rendering & Visualization

### Already Implemented

| Feature | Notes |
|---------|-------|
| Real-time 3D viewport | React Three Fiber |
| Basic lighting | Directional + ambient |
| Viewport snapshot | Screenshot capture |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| PBR material rendering | Yes | Yes | **Tier 1** | Standard PBR pipeline (metallic/roughness) |
| HDRI environment maps | Yes | Yes | **Tier 1** | Environment-based lighting |
| Ray tracing / path tracing | Yes (V-Ray) | Yes (Unreal) | **Tier 2** | High-quality offline render; WebGPU potential |
| Turntable render | Yes | Yes | **Tier 2** | 360-degree image/video sequence |
| Custom lighting rigs | Yes | Yes | **Tier 2** | Multiple positioned lights |
| Ground shadow | Yes | Yes | **Tier 2** | Contact shadow on floor plane |
| Transparent background | Yes | Yes | **Tier 3** | Alpha channel export |
| High-res still export | Yes | Yes | **Tier 2** | Configurable resolution output |

### Implementation Notes

Three.js / R3F already supports PBR and HDRI. Key work:
1. **HDRI loader** — `RGBELoader` + `PMREMGenerator` (Three.js built-in)
2. **PBR materials** — `MeshStandardMaterial` with map/normalMap/roughnessMap
3. **Environment** — `<Environment>` component from @react-three/drei
4. **Turntable** — Orbit camera animation + frame capture

---

## 11. Grading & Sizing

### Already Implemented

| Feature | Notes |
|---------|-------|
| Multi-size grading | XS through XXL |
| Grade rule support | Basic grade rules |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Grade rule import/export (RUL) | Yes | Yes | **Tier 2** | Industry-standard RUL file format |
| Nested size overlay view | Yes | Yes | **Tier 2** | All graded sizes overlaid on one pattern |
| Grading review (3D per size) | Yes | Yes | **Tier 2** | Simulate and compare all sizes |
| Per-point grading | Yes | Yes | **Tier 2** | Different grade rules per pattern point |
| Graphic grading | Yes | No | **Tier 3** | Grade print placement across sizes |

---

## 12. Production Output

### Already Implemented

| Feature | Notes |
|---------|-------|
| DXF export (AAMA) | Industry-standard pattern export |
| PDF export | Print-ready pattern sheets |
| OBJ export | 3D mesh export |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Auto BOM (Bill of Materials) | Yes | Yes | **Tier 1** | Auto-populate from garment components |
| Tech pack generation | Yes | Yes | **Tier 1** | Auto-generate specification sheets |
| Nesting / marker making | Yes | Yes | **Tier 2** | Optimal pattern arrangement for cutting |
| Fabric consumption calc | Yes | Yes | **Tier 2** | Yardage calculation from nested layout |
| FBX export | Yes | Yes | **Tier 2** | Animation-capable 3D format |
| glTF/GLB export | Yes | Yes | **Tier 2** | Web-optimized 3D format |
| USD export | Yes (2024.0+) | No | **Tier 3** | Universal Scene Description |
| Alembic animation cache | Yes | No | **Tier 3** | Mesh animation export |
| Cost estimation | Yes | Yes | **Tier 2** | Per-colorway cost from BOM |

---

## 13. Animation

### Currently Missing (entire subsystem)

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Keyframe animation | Yes | Yes | **Tier 2** | Timeline-based property animation |
| Camera animation | Yes | Yes | **Tier 2** | Animated camera for presentations |
| Wind animation | Yes | No | **Tier 3** | Keyframed wind parameters |
| FBX motion import | Yes | Yes | **Tier 3** | Import skeletal animations |
| Animation video export | Yes | Yes | **Tier 2** | Render animation to MP4 |

---

## 14. Collaboration

### Currently Missing

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Cloud review platform | Yes (CLO-SET) | Yes (Stylezone) | **Tier 2** | Browser-based 3D review |
| 3D annotations | Yes | Yes | **Tier 2** | Spatial comments on 3D garment |
| PLM integration | Yes | Yes | **Tier 3** | Connect to product lifecycle management |
| Team workspaces | Yes | Yes | **Tier 3** | Multi-user project organization |

---

## 15. API & Automation

### Already Implemented

| Feature | Notes |
|---------|-------|
| Copilot plugin/skill system | Tool-based extensibility |
| Bridge architecture | Planner + Executor + Reasoner |

### Gaps

| Feature | CLO3D | Browzwear | Priority | Notes |
|---------|-------|-----------|----------|-------|
| Headless CLI / batch mode | Yes | Yes | **Tier 3** | Server-side rendering/processing |
| Python/JS scripting API | Yes | Yes | **Tier 3** | Programmatic garment manipulation |
| Batch processing | Yes | Yes | **Tier 3** | Process multiple garments automatically |

---

## Prioritized Roadmap Recommendation

### Tier 1 — Critical (users won't switch without these)

These features are table-stakes for any professional garment CAD. Missing them means Vina cannot replace CLO3D/Browzwear for production workflows.

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 1 | **Fit Analysis (stress/strain/fit/pressure maps)** | Medium | Very High | XPBD solver already computes needed data |
| 2 | **PBR Materials + Texture Maps** | Medium | Very High | Three.js PBR pipeline ready |
| 3 | **Colorway Management** | Medium | Very High | Material system + UI panel |
| 4 | **Print/Graphics Placement** | Medium-High | Very High | UV mapping + texture compositing |
| 5 | **Tech Pack / BOM Generation** | Medium | Very High | Pattern + material + trim metadata |
| 6 | **Trims (buttons, zippers, snaps)** | High | High | 3D instancing + placement engine |

### Tier 2 — Important Differentiators

These features separate a professional tool from a prototype. Users expect them within the first year.

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 7 | **HDRI Environment + Rendering** | Low-Medium | High | drei `<Environment>` + PMREMGenerator |
| 8 | **Pleats & Fold Arrangement** | Medium | High | Sewing system extension |
| 9 | **Nesting with Consumption** | High | High | Computational geometry algorithm |
| 10 | **3D Pen (draw on avatar)** | Medium | Medium-High | Ray casting + flattening algorithm |
| 11 | **Keyframe Animation System** | High | Medium | Timeline UI + property interpolation |
| 12 | **FBX/glTF Export** | Medium | High | Three.js exporters exist |
| 13 | **GPU-Accelerated Simulation** | High | High | WebGPU compute shaders |
| 14 | **Avatar Morph Targets** | Medium | Medium | Blend shape loading + UI |
| 15 | **Nested Size Overlay View** | Low | Medium | 2D rendering extension |
| 16 | **Cloud Review Platform** | Very High | Medium | Full-stack web platform |

### Tier 3 — Nice to Have

These are polishing features or niche capabilities that add depth but aren't blockers.

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 17 | Wind simulation | Medium | Low-Medium |
| 18 | Steam/press tool | Low | Low |
| 19 | Seam puckering/bulk | Medium | Low |
| 20 | Knit swatch editor | Very High | Low (niche) |
| 21 | Substance/SBSAR support | Medium | Low |
| 22 | Pantone color libraries | Low | Medium |
| 23 | AI pose generator | Medium | Low |
| 24 | Headless CLI | High | Low |
| 25 | PLM integration | Very High | Medium (enterprise only) |

---

## Vina Competitive Advantages

Areas where Vina already leads or differentiates:

| Advantage | Details |
|-----------|---------|
| **Browser-native** | No install required; CLO3D and Browzwear are desktop-only |
| **AI Copilot** | Integrated LLM assistant with tool execution (bridge architecture) |
| **Open architecture** | Skill marketplace, plugin system, extensible tools |
| **Real-time WASM solver** | Rust-compiled XPBD running in browser at near-native speed |
| **Modern stack** | React + Three.js + Zustand; easy to extend and maintain |
| **Constraint-based geometry** | Semantic garment engine with parametric relationships |
| **Universal collision bodies** | Import any mesh as collision body (not just avatar) |
| **Free/open** | No $50+/month subscription barrier |

---

## Appendix: Feature Count Summary

| Category | CLO3D | Browzwear | Vina | Coverage |
|----------|-------|-----------|---------|----------|
| 2D Pattern Tools | 25+ | 20+ | 20+ | ~80% |
| Sewing & Construction | 12 | 10 | 6 | ~50% |
| 3D Simulation | 12 | 10 | 7 | ~58% |
| Fabric & Materials | 14 | 12 | 6 | ~43% |
| Trims & Hardware | 10 | 8 | 0 | **0%** |
| Colorway Management | 6 | 6 | 0 | **0%** |
| Print & Graphics | 7 | 7 | 0 | **0%** |
| Avatar System | 10 | 8 | 5 | ~50% |
| Fit Analysis | 7 | 6 | 0 | **0%** |
| Rendering | 10 | 8 | 2 | ~20% |
| Grading | 8 | 6 | 2 | ~25% |
| Production Output | 10 | 8 | 3 | ~30% |
| Animation | 5 | 4 | 0 | **0%** |
| Collaboration | 5 | 4 | 0 | **0%** |
| API & Automation | 6 | 4 | 2 | ~33% |

**Overall estimated feature coverage: ~35-40% of combined CLO3D + Browzwear feature set**

The highest-impact, lowest-effort wins are: **Fit Analysis**, **PBR Materials**, and **HDRI Rendering** — all three leverage existing infrastructure (XPBD solver data, Three.js PBR pipeline).
