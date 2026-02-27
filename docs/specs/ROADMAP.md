# OpenClo — Roadmap

## v0.1–v0.5: Foundation ✅ COMPLETE

Everything needed to draw patterns, see them in 3D, and export files. **DONE.**

- [x] 2D pattern editor (pen, rectangle, line tools, node editing, internal lines)
- [x] 3D viewport with avatar (GLB, A-pose)
- [x] XPBD cloth simulation (10 fabrics, Web Worker 60fps) — pieces fall with gravity
- [x] AI Agent (42 tools, 5 skills, 3 providers, plugin system, marketplace prep)
- [x] DXF import/export (ASTM D6673/AAMA), PDF export, OBJ export
- [x] Seam allowance engine (Seamly2D port), grading engine, nesting engine, formula engine
- [x] VS Code-style UI (ActivityBar, Sidebar, CommandPalette, StatusBar, BottomPanel)
- [x] 997 unit tests + 133 E2E tests
- [x] CI/CD to openclo.sdar.dev

**Critical Gap Identified:** We built wide (AI, plugins, file formats) when we should have gone deep. The cloth simulation drops pieces with gravity but cannot SEW them into actual garments. Missing core pipeline: meshing → seam assembly → placement → collision.

---

## v0.6: Core Simulation Pipeline 🔨 **CRITICAL PHASE**

**Goal:** Complete the 3D garment assembly pipeline. Patterns become actual sewn garments, not just falling pieces.

**Duration:** 6-8 weeks (meshing 1wk, sewing 2-3wk, collision 2wk, placement 1-2wk)

### Meshing Pipeline
- [x] **CDT Meshing** — integrate `cdt2d` library for 2D pattern outlines → triangle meshes
- [x] **clean-pslg** integration — robust polygon processing for complex shapes
- [x] **Adaptive tessellation** — more triangles on curves, fewer on straight edges (via subdivision)
- [x] **Quality refinement** — eliminate long/thin triangles for simulation stability (Subdivide & Fill)

### Seam Assembly System  
- [x] **Edge parameterization** — map seam edges to 0-1 parameter space for alignment
- [x] **Sewing constraints in XPBD solver** — sewn vertices share positions
- [x] **Seam types** — standard, french, flat-felled with different constraint behaviors
- [ ] **Length validation** — warn when seaming edges with >5% length difference

### Garment Placement
- [ ] **Cylindrical mapping** — wrap pattern pieces around avatar at correct body positions
- [ ] **Automatic inflation** — push pieces 2-5cm away from avatar surface initially
- [ ] **Pin point detection** — shoulders, waistband, sleeve caps to prevent falling

### Avatar Collision
- [x] **SDF generation** — signed distance field from avatar mesh (64³/128³ resolution)
- [x] **Inside/outside detection** — push cloth vertices outside avatar surface
- [x] **Surface normal calculation** — accurate collision response (fixed for M2/Safari)

### Self-Collision
- [ ] **Spatial hashing** — grid-based acceleration structure (Müller paper #11/#15)
- [ ] **Vertex-triangle tests** — only check nearby pairs, not brute force O(n²)
- [ ] **Performance toggle** — disable for complex garments if needed

### Simulation Stability
- [ ] **Long Range Attachments** — prevent over-stretching on large triangles  
- [ ] **Adaptive substepping** — multiple physics steps per frame for stability
- [ ] **Constraint iteration tuning** — balance quality vs performance

**Success criteria:** Patterns sewn into complete garments that drape naturally on avatar.

---

## v0.7: Production Output 📄

**Goal:** Export-ready files for cutting and manufacturing.

### PDF Cutting Layouts
- [ ] **A0/A1 paper sizes** — industry standard cutting table formats
- [ ] **Automatic nesting** — optimize piece placement for fabric utilization
- [ ] **Marker making interface** — manual adjustment of automatic layouts
- [ ] **Tiled A4 PDF** — split large layouts across multiple sheets with alignment marks

### Seam Allowance Visualization
- [ ] **Toggle in 2D editor** — show/hide seam allowance offset
- [ ] **Layer-based export** — sew line + cut line on separate DXF layers
- [ ] **SA width per seam** — different allowances for different seam types

---

## v0.8: File Format Interoperability 📁

**Goal:** Seamless data exchange with industry tools (CLO3D, Gerber, Illustrator).

### CLO3D Integration
- [ ] **.zprj import** — María's daily format: unzip, parse DXF + metadata JSON, load avatar OBJ
- [ ] **.zprj export** — zip DXF + metadata + avatar + thumbnail PNG
- [ ] **Fabric property mapping** — CLO3D fabric parameters ↔ OpenClo simulation settings

### Additional Formats  
- [ ] **SVG import** — Illustrator/Inkscape vector paths → pattern pieces
- [ ] **Gerber AccuMark** — ZIP with ASTM DXF + manifest files
- [ ] **Optitex import/export** — industry-standard pattern format

---

## v0.9: Avatar System 🧍

**Goal:** Avatar is as important as the pattern. Full control over body and pose.

### Pose Control
- [ ] **Pose editor** — sliders per joint (shoulders, arms, legs, torso)
- [ ] **Pose presets** — A-pose, T-pose, sitting, walking, arms-forward
- [ ] **Timeline animation** — simple keyframe-based pose sequences

### Body Customization
- [ ] **Measurements → morphs** — chest, waist, hips reshape the mesh parametrically
- [ ] **Custom avatar loading** — Avaturn, ReadyPlayerMe, MakeHuman GLB files
- [ ] **Avatar library** — save/switch between multiple body types
- [ ] **Skin tone + underwear** — visual customization options

---

## v1.0: Public Release 🚀

**Goal:** Production-ready tool with complete user experience.

### Performance & Polish
- [ ] **Landing page** — openclo.com with feature showcase
- [ ] **Code splitting** — reduce initial bundle size (target: <1.2MB)
- [ ] **Performance audit** — 60fps simulation, <200ms measurement updates
- [ ] **Accessibility compliance** — WCAG 2.1 AA standards

### Documentation & Examples
- [ ] **Tutorial videos** — 10-minute walkthroughs for each garment type
- [ ] **Example projects** — shirt, dress, pants, jacket with source files
- [ ] **API documentation** — for plugin developers
- [ ] **Community forum** — Discord or Discussions for user support

### Production Features  
- [ ] **PWA/offline support** — work without internet connection
- [ ] **Project templates** — quick-start patterns for common garments
- [ ] **Export quality settings** — low/medium/high mesh density options

---

## Post v1.0: Future Vision 🔮

- **AI pattern generation** — photo → pattern pieces via computer vision
- **AI fit prediction** — body scan → recommended pattern adjustments  
- **Cloud collaboration** — share via URL, version history, real-time comments
- **Pattern marketplace** — buy/sell pattern templates with revenue sharing
- **Knit pattern support** — sweaters, jerseys with different physics model
- **Multi-material garments** — combine fabric + leather + hardware in single design
- **Real-time multiplayer** — collaborative pattern making

---

## Technical Dependencies

**Critical for v0.6:**
- `cdt2d` — 2D constrained Delaunay triangulation  
- `clean-pslg` — polygon preprocessing for robust meshing
- XPBD constraint solver improvements
- SharedArrayBuffer for Web Worker physics (requires COOP/COEP headers)

**Reference:** Technical implementation details in [CORE-ENGINE.md](./CORE-ENGINE.md) and [SIMULATION.md](./SIMULATION.md).