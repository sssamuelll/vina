# OpenClo — Roadmap

## Phase 1: Foundation ✅ (v0.1–v0.4)

Everything needed to draw patterns and see them in 3D. Done.

- [x] Split-view workspace (2D SVG editor + 3D Three.js viewport)
- [x] Pen tool with Bezier curves, node editing
- [x] 2D → 3D sync (pieces render as meshes around avatar)
- [x] Pattern tools: seams, notches, grainline, darts, measurement
- [x] Parametric templates (bodice, sleeve, skirt, pants, collar)
- [x] DXF + PDF export (basic)
- [x] Save/Load projects, Undo/Redo
- [x] AI Chat copilot (agent-agnostic protocol)
- [x] GLTF/GLB avatar with A-pose
- [x] Mobile: chat-only (<768px)
- [x] CI/CD → openclo.sdar.dev
- [x] 82 unit tests + 16 E2E suites

## Phase 2: Industry Compatibility (v0.5) — IN PROGRESS

**Goal:** Speak the industry's language. A patronista can bring work from CLO3D into OpenClo and export back.

### File Formats
- [ ] DXF Import (ASTM D6673) — LWPOLYLINE, SPLINE, LINE, POINT, TEXT, BLOCK/INSERT
- [ ] DXF Export upgrade — ASTM layer numbering, SPLINE entities, piece BLOCKs
- [ ] Real seam allowance offset — Clipper.js parallel curve, exported as Layer 2
- [ ] CLO3D .zprj import — unzip, parse DXF + metadata JSON, load avatar OBJ
- [ ] CLO3D .zprj export — zip DXF + metadata + avatar + thumbnail
- [ ] Gerber AccuMark import/export — ZIP with ASTM DXF + manifest
- [ ] SVG import — Illustrator/Inkscape paths → PatternPiece outlines

**See:** [FILE-FORMATS.md](./FILE-FORMATS.md)

## Phase 3: Professional UI (v0.6)

**Goal:** Feel like a real CAD tool, not a prototype. Maximize workspace, minimize chrome.

### Layout Overhaul
- [ ] Kill the permanent right sidebar — properties as floating popover on selection
- [ ] Per-view toolbars — 2D tools on left of 2D editor, 3D tools on left of 3D viewport
- [ ] Floating panels inside views (BioCanvas approach) — collapsible, draggable
- [ ] Swappable view positions — user chooses 2D left / 3D right or vice versa
- [ ] Fullscreen per view — maximize 2D or 3D to entire screen
- [ ] Top toolbar: only global actions (save, export, undo, view mode)
- [ ] Right-click context menus for pieces, seams, avatar
- [ ] Status bar per view (coords/zoom in 2D, camera angle in 3D)

## Phase 4: Avatar System (v0.7)

**Goal:** The avatar is as important as the pattern. Full control over body and pose.

- [ ] Pose editor — sliders per joint (shoulders, arms, legs, torso)
- [ ] Pose presets (A-pose, T-pose, sitting, walking, arms-forward)
- [ ] Body measurements → morph targets (chest, waist, hips reshape the mesh)
- [ ] Load custom avatars (Avaturn, ReadyPlayerMe, MakeHuman)
- [ ] Avatar library — save/switch between multiple bodies
- [ ] Skin tone / underwear customization

## Phase 5: Production Output (v0.8)

**Goal:** Output that goes directly to the cutting table.

- [ ] PDF cut layout — A0/A1 paper sizes, automatic nesting
- [ ] Marker making — optimize piece layout for fabric width
- [ ] Seam allowance visualization in 2D editor
- [ ] Print-ready tiled PDF (A4 pages with alignment marks)

## Phase 6: Cloth Simulation (v0.9)

**Goal:** See how the garment actually drapes on the body.

- [ ] Mass-spring physics engine (Verlet integration)
- [ ] Real-time draping on avatar
- [ ] Fabric property presets (cotton, silk, denim, jersey, chiffon)
- [ ] Collision detection (avatar ↔ fabric, self-collision)
- [ ] Tension/stress heatmap visualization
- [ ] Web Worker physics (SharedArrayBuffer)

**See:** [SIMULATION.md](./SIMULATION.md)

## Phase 7: Grading (v0.10)

**Goal:** One pattern, all sizes.

- [ ] Size grading rules (S/M/L/XL or numeric ranges)
- [ ] Grade reference points on pieces
- [ ] Multi-size DXF export
- [ ] Size range overlay visualization

## v1.0 — Public Release

- [ ] Landing page + documentation site
- [ ] Tutorial videos + example projects (shirt, dress, pants, jacket)
- [ ] Performance optimization + accessibility audit
- [ ] PWA / offline support

## Future (post v1.0)

- AI pattern generation from photos (image → pattern pieces)
- AI fit prediction (body scan → recommended adjustments)
- Cloud collaboration (share via URL, version history, comments)
- Knit pattern support
- Embroidery/print placement
- Fabric supplier integration (order directly)
- Pattern marketplace
- Real-time multiplayer editor
