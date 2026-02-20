# OpenClo — Roadmap

## Completed

### v0.1 — Foundation
- [x] Split-view workspace (2D editor + 3D viewport)
- [x] Pen tool with Bezier curves (click corners, drag curves)
- [x] 2D → 3D sync (pattern pieces render as meshes around mannequin)
- [x] Parametric dress form (adjustable measurements)
- [x] GLTF/GLB avatar loader (ReadyPlayerMe, MakeHuman)
- [x] Keyboard shortcuts (V, P, L, H, Delete, Ctrl+Z, etc.)
- [x] Zoom & pan (wheel zoom toward cursor, middle-click pan)

### v0.2 — Pattern Tools
- [x] Seam connections between piece edges
- [x] Notch marks
- [x] Grainline tool
- [x] Fabric grain direction

### v0.3 — Export
- [x] DXF export (R12, LWPOLYLINE, basic layers)
- [x] PDF export (A4, piece layout)
- [x] Node editor (double-click to edit anchor points + bezier handles)
- [x] Save/Load projects (.json)
- [x] Undo/Redo system

### v0.4 — AI & Polish (current)
- [x] AI Chat panel (agent-agnostic protocol)
- [x] Parametric templates (bodice, sleeve, skirt, pants, collar)
- [x] Measurement tool
- [x] Command executor (AI → Redux actions)
- [x] PropertiesPanel (collapsible sidebar)
- [x] Mobile chat-only experience (<768px)
- [x] VS Code-style layout (flex panels, draggable divider)
- [x] Smooth viewport transitions
- [x] CI/CD (GitHub Actions → openclo.sdar.dev)
- [x] 82 unit tests + 16 E2E suites
- [x] CSS deduplication + design system

## In Progress

### v0.5 — Industry File Formats
> **Goal:** Speak the industry's language. Import from CLO3D/Gerber, export ASTM-compliant DXF.

**See:** [FILE-FORMATS.md](./FILE-FORMATS.md) for detailed spec.

- [ ] **DXF Import** — parse LWPOLYLINE, SPLINE, LINE, POINT, TEXT, BLOCK/INSERT; ASTM layer mapping
- [ ] **DXF Export upgrade** — ASTM D6673 layer numbering, SPLINE entities (not polyline approximation), piece BLOCKs
- [ ] **Real seam allowance offset** — parallel curve offset (Clipper.js or Minkowski sum), export as Layer 2
- [ ] **CLO3D .zprj import** — unzip, parse DXF + metadata JSON, load avatar OBJ
- [ ] **CLO3D .zprj export** — zip DXF + metadata + avatar + thumbnail
- [ ] **Gerber AccuMark import** — unzip, parse ASTM DXF per piece
- [ ] **Gerber AccuMark export** — zip with ASTM DXF + manifest
- [ ] **SVG import** — parse paths → PatternPiece outlines (useful for Illustrator/Inkscape users)

### v0.6 — Avatar Editor
- [ ] Pose editor — sliders per joint (shoulders, arms, legs, torso bend)
- [ ] Pose presets (A-pose, T-pose, sitting, walking, arms-forward)
- [ ] Body measurements → morph targets (chest, waist, hips, height reshape the mesh)
- [ ] Load custom avatar (GLB/GLTF from Avaturn, ReadyPlayerMe, MakeHuman)
- [ ] Avatar library — save/switch between multiple avatars
- [ ] Skin tone / underwear color customization

### v0.7 — Production Output
- [ ] PDF cut layout — A0/A1 paper sizes, automatic nesting
- [ ] Marker making — automatic piece layout for fabric width
- [ ] Seam allowance visualization in 2D editor
- [ ] Print-ready tiled PDF (A4 pages with alignment marks)

## Planned

### v0.8 — Cloth Simulation
- [ ] Mass-spring physics engine
- [ ] Real-time draping on avatar
- [ ] Fabric property presets (cotton, silk, denim, jersey)
- [ ] Collision detection (avatar ↔ fabric)
- [ ] Tension/stress visualization

### v0.9 — Grading
- [ ] Size grading rules (S/M/L/XL or numeric)
- [ ] Grade reference points
- [ ] Multi-size DXF export
- [ ] Size range visualization

### v0.10 — Collaboration
- [ ] Cloud project storage
- [ ] Share projects via URL
- [ ] Version history
- [ ] Comments on pieces

### v1.0 — Public Release
- [ ] Landing page
- [ ] Documentation site
- [ ] Tutorial videos
- [ ] Example projects (shirt, dress, pants, jacket)
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] PWA / offline support

## Future Ideas (post v1.0)
- AI pattern generation from images (photo → pattern pieces)
- AI fit prediction (body scan → recommended adjustments)
- Knit pattern support
- Embroidery/print placement
- Integration with fabric suppliers (order directly)
- Marketplace for pattern templates
- Real-time collaboration (multiplayer editor)
