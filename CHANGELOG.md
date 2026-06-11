# Changelog

All notable changes to OpenClo are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.11.0] — 2026-06-11 (Current)

CLO3D seam/sewing parity release — the full parity plan (`docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md`, Fases 0-6) shipped as PRs #871-#876. Garments now actually sew in the default solver tier: two curved pieces close in ≤2s on WASM, every seam pair has a stable identity color, sewing direction is real (crossed-X warning + Ctrl+B), and unresolvable seams warn instead of silently falling.

> Interim note: work between 0.10.0 (2026-03-29) and this release — drift audit closures (A2-A7, B-, C-, D-, E-series RFCs), Epic-746 boundary contracts, MVP v1 Opt C, housekeeping #500-#870 — is not backfilled here; see git history. This entry covers the parity plan release.

### Added
- **Seam closure on WASM (default tier)** — per-substep seam target decay in the Rust solver (`set_seam_shrink_params`), mirroring the CPU reference; seams close in ≤2s sim-time. CI now smoke-tests seam closure against the committed WASM binary (#872).
- **Sewing direction + Reverse Sewing (Ctrl+B)** — `Seam.pieceB.reversed` flows through every tier's vertex matching (`parameterizeEdge` mirrors t). 2D connection lines draw start→start + end→end (a reversed half shows the crossed-X error signal, CLO3D-style) with perpendicular directional notches at each start. Ctrl+B, panel button, context menu and the new `reverseSeam` copilot tool all toggle it (#875).
- **Seam observability** — when a seam resolves to 0 XPBD constraints the user gets an error toast, an inspector entry, and the simulation overlay shows the live seam constraint count. Capability flag `seams` per solver tier: the cascade skips WebGPU/Neural (with a visible notice) when a project has seams (#874).
- **Stable seam pair colors** — pair identity color hashed from the seam id (deleting a neighbor no longer recolors survivors); selection shows as weight + glow, never recolor; both sewing overlays now share one pick-color language (first=green, second=blue) (#876).
- **Seam length mismatch in absolute mm** — red warning above 1mm (CLO3D parity), replacing the 5% relative threshold that hid a 19mm error on a 400mm seam (#876).

### Fixed
- **The demo-killer chain** — the default tier simulated with ZERO seams: the WASM init callsite dropped `seamInitData` (BP-1, #871); the WASM worker then crashed on seam-carrying inits (unconverted `SeamInitData` shape → TypeError) and silently fell back to CPU (#875); and `segmentRange` was produced in command space but consumed in flattened space, so curved edges (armholes, necklines) sewed, picked and highlighted the wrong vertices (BP-3) — fixed via the single canonical boundary `commandRangeToFlattened` (#873).
- **Per-edge seam allowance widths lost on load** — generative load re-detected edges without copying `seamAllowanceWidth`; widths now survive re-keyed by edge name (#876).
- **`reverseSeam` was a physical no-op** — it swapped pieceA↔pieceB, which produces identical constraint pairs; it now reverses actual traversal direction (#875).

### Changed
- **Shrinkage slider removed** — it was `100 − tension` rendered twice; gathering/easing intent stays on the Tension slider. The copilot keeps `setSeamShrinkage` as a semantic alias (#876).
- **`setSeamRange` (copilot) refuses partial ranges** — the solver does not renormalize filtered t-values yet; sub-range seams would sew wrong vertices. Full-edge `[0,1]` still accepted; partial-edge sewing ships as an atomic pair with renormalization (#486) (#875).

### Known Issues (deferred by plan § 5, tracked post-ship)
- Partial-edge sewing (tStart/tEnd) — only as an atomic pair with solver renormalization (#486).
- SeamGroup M:N proportional subdivision — needs the t-range substrate (épica #878).
- WebGPU/Neural tiers do not close seams — honestly capability-gated; WebGPU itself blocked by Three.js 0.183 `atomicAdd` upstream (#708, #731).
- Seam lines not yet drawn over the simulated garment — `SeamRenderer3D` renders in arrange mode only (#880).
- Editing seams during simulation requires a restart (live edit deferred).
- Corner types on curved outlines (partial fix in #859), typographic polish, Clipper2 SA-offset memoization in `PieceRenderer` — deferred polish batch.
- Boundary-as-domain-entity refactor (épica #878) and the CLO3D benchmark as falsifiable E2E spec (épica #879) are the structural post-ship tracks (`docs/plans/2026-06-11-post-ship-plan.md`).

### Stats
- 5,574 automated tests passing across 380 files (+1,138 since 0.10.0).
- 232 copilot tools registered (+1: `reverseSeam`).
- 6 PRs, ~2,600 lines changed, shipped 8 days ahead of the 2026-06-19 target.

## [0.10.0] — 2026-03-29

### Added
- **Tech Pack & BOM Generation** — Auto-populated Bill of Materials extracting fabrics, interfacing, thread, seam tape, elastics, and trims from the garment project. Multi-page tech pack PDF export with 3D views, measurements, BOM table, construction notes, and colorway swatches. Per-colorway cost comparison. 8 copilot tools (#225, PR #482).
- **Trim & Hardware Library** — 22-preset library covering buttons, zippers, snaps, rivets, buckles, rings, hook & eye, and drawstring stops. Discriminated union placement model (edge, count, point modes). Redux CRUD with full cascade on piece/edge operations. BOM extraction. 10 copilot tools (#226, PR #484, #496).
- **3D Sewing Tool** — Click two edges in the 3D viewport to create seams (CLO3D-style). Pure edge picker using local-space proximity, compatibility checks (same-piece rejection, already-seamed detection, length mismatch warning), arrange-mode only. Three.js Line highlights (#457, PR #487).
- **Nesting & Fabric Consumption** — Fabric roll nesting with configurable width (90/112/150cm), gap control, and production metrics. Dynamic roll length calculation. Canvas preview in the bottom panel. Utilization and waste percentage display (#235, PR #488).
- **Auto-Trace** — Custom Canny edge detection (zero dependencies, ~280 lines). Grayscale, Gaussian blur, Sobel gradients, non-max suppression, hysteresis threshold, Moore-Neighbor contour tracing, Douglas-Peucker simplification. Web Worker for non-blocking UI. Contours sorted by area for easy selection (#430, PR #490).
- **Single-Axis Grading** — Size grading with EU/US/UK size systems. Redux state tracking active sizes, quantities, and staleness. Dedicated Grading layer (layer 10, hidden by default). Staleness middleware detects base piece changes. batchUndo for single-step undo of grade operations (#258, PR #491, #492).
- **Artwork Import & Placement** — Place SVG/PNG/JPG artwork on garment pieces. Canvas-based compositor overlays artwork onto fabric texture (zero shader changes). SVG bitmap dimension handling. Artwork validates width/height > 0 and clamps opacity. 3 copilot tools (#237, PR #494).
- **RAG Knowledge Base** — 65-chunk static knowledge index covering drafting methods (Aldrich, Müller, Gilewska), ease standards, grading rules, fabric properties, and Seamly2D patterns. Client-side cosine similarity search with keyword fallback. AgenticLoop retrieves top-5 relevant chunks and injects as "Reference Materials" in the LLM system prompt (#497, #498, PR #503, #504).
- **2D Trim Placement Tool** — Click-to-place trims on pattern pieces. Trim Library Panel with search and type grouping. SVG trim markers on 2D canvas with type-specific icons. Edge-points interpolation for edge-placed trims (#483, PR #496).

### Changed
- **Confirmation Dialogs Removed** — Delete confirmations (removePiece, removeSeam, removePoint) no longer show by default since all actions are undoable via Ctrl+Z. Users can opt back in via override system. Dialog text changed from "cannot be undone" to "You can undo this with Ctrl+Z" (PR #485).

### Stats
- 4,436 automated tests passing across 289 files.
- 231 copilot tools registered.
- 65 RAG knowledge chunks indexed.
- 22 trim presets, 32 fabric presets.

## [0.9.0] — 2026-03-27

### Added
- **Seam System Overhaul** — Pieces now actually sew together in simulation. Fixed silent edge name resolution, WASM solver data passing, and shrink speed. Color-coded seam pairs, curved edge rendering, type-specific line styles (French=dashed, overlock=dash-dot), green selection glow, shrinkage/gathering slider (#451, #452, #453, #454, #455, #456, #458, #459, #460, #461, #462).
- **Pressure Simulation** — Internal inflation forces for puffer jackets, balloon sleeves, padded quilting. Per-triangle outward normal force with consistent winding detection (#382, #469).
- **XPBD Fold Constraints** — 3D simulation of pleats and creases. Fold lines create angular constraints in the solver, causing fabric to fold during simulation (#429, #471).
- **Undo Batch Grouping** — `batchUndo()` wraps N dispatches as a single undo entry. Eliminates the recurring N-dispatch partial-undo problem across all features (#437, #465).
- **Colorway UI** — Tab bar for switching colorways, per-fabricCode color override editor, 2D piece tinting via resolveColorway() (#446, #467).
- **Pre-Marking Placement Rules** — Production constraint system for nesting: atFold, atEdge, priority, grainTilt, pairWith, minDistance. Integrated into nesting engine (#262, #472).
- **Annotation Library** — 14 built-in production annotation templates (CUT 2, INTERFACE, GRAIN, etc.) with category-colored rendering and DXF export (#266, #434).
- **Fabric Codes on Pieces** — Production classification (SELF, LINING, INTERLINING, etc.) with color-coded 2D indicators and DXF export (#259, #425).
- **Garment Information** — Metadata dialog for brand, season, style number, designer, date, notes. Persisted and copilot-accessible (#378, #445).
- **Texture Tiling** — UV offset support, repeat presets (1x1/2x2/4x4/8x8), range sliders, lock aspect toggle, reducer clamping (#376, #427).
- **3D Mesh Selection** — Box select tool for 3D vertex selection with screen-space overlay, vertex projection via camera MVP, SelectedVertexRenderer (#371, #447).
- **Elastic Tool** — Full elastic data model, UI, simulation integration, and copilot tools for waistbands, cuffs, gathered edges (#322, #424).
- **Slash and Spread** — Cut and spread/rotate for fullness with 8-phase geometric pipeline (#363, #426).
- **Pleats & Folds** — Knife, box, accordion, inverted box pleat types with fold direction (mountain/valley) and crease angle (#260, #431).
- **Image Trace** — Reference image layer for pattern tracing with calibration and opacity controls (#244, #435).
- **Seam Corner Types** — 7 professional SA corner types (mitered, envelope, square, etc.) (#255, #449).
- **DXF Wizard** — Auto-detect DXF format (AAMA, ASTM, legacy) on import (#264, #450).
- **AAMA Export Metadata** — FABRIC_CODE, ANNOTATION, FOLD_DIR layers in AAMA DXF export (#439, #444).
- **Global Error Tracker** — Ring buffer capturing unhandled errors + rejections, exposed via `window.__OPENCLO_ERRORS__()` (#441, #474).

### Fixed
- **Seam Root Cause** — Silent edge name resolution failure fixed: `buildSeamConstraints()` now parses `"edge-N"` fallback pattern. WASM worker was missing piece edge data (one-line fix). Shrink factor 0.995→0.97 (#451, #452, #453).
- **Undo Deep-Clone** — Replaced `JSON.parse(JSON.stringify())` with `structuredClone()` + fallback. Abort on clone failure prevents array desync (#400, #414).
- **Double Undo Bug** — Removed duplicate Cmd+Z handler in `useCopilotKeyboardShortcuts` that caused two undo dispatches per keypress (#414).
- **Safe localStorage** — 24 files migrated to `safeStorage` wrapper with detection, in-memory fallback, per-key error logging. 9 bare calls wrapped (#401, #418).
- **Edge Reference Cascade** — `cascadeEdgeRename`/`cascadeEdgeRemove` reducers update seams, elastics, pleats atomically when edges change. Validator extended for elastic/pleat cross-references (#436, #468).
- **Shared Defaults** — `utils/defaults.ts` centralizes feature constants (seam allowance, tension, strength, elastic ratios, UV transform). UI hooks and copilot tools import from same source (#438, #470).
- **Collision Mesh Validation** — Vertex/face count checks on mesh import, constraint ID validation (#407, #443).
- **Name Sanitization** — Centralized `sanitizeName()` prevents export injection via control characters (#403, #420).

### Stats
- ~165,000 LOC across 580+ TypeScript source files.
- 4,200+ automated tests passing.
- 213 copilot tools registered.
- 35+ E2E test cases.

## [0.8.0] — 2026-03-24

### Added
- **Layer System (v1)** — Professional layer management matching CLO3D parity. Includes layer ordering, sublayers, superimpose (over/under), and layer cloning. Piece arrangement now respects layer index for complex garment construction (#372, #379).
- **Security Audit Compliance** — 100% resolution of March 2024 security audit. Replaced Base64 obfuscation with **AES-GCM encryption** in `SecureStorage`. Eliminated API key persistence to `localStorage` (#394, #399, #416).
- **Runtime Data Validation** — Strict `projectValidator` integrated at all data contract boundaries (load/import). Features automated repair for out-of-range simulation parameters and orphaned piece identity mapping (#397, #413).
- **Plugin Sandbox** — Full Web Worker isolation for community plugins with a capability-gated bridge, preventing unauthorized access to workspace state (#393, #410).
- **Professional Dart Enhancements** — Support for segmented darts, shaped dart caps (roof/cup), and intelligent intake distribution for high-end tailoring (#366).
- **WebGPU/TSL Surface Modes** — Shaded, Shaded-Wire, Textured-Wire, Flat, and X-Ray modes now fully functional on the WebGPU/NodeMaterial rendering path (#392).
- **Diagnostic Inspector UI** — High-visibility error badges and red dashed outlines for pieces failing validation. New `ruleUnresolvedPoints` diagnostic rule for broken geometry detection (#396).
- **POM Measurement System** — Persistent, named measurements (circumferences, heights, surface tapes) that update in real-time with the 3D simulation (#367).
- **Cut and Sew Logic** — Automated sewing creation on scissor-cut edges, significantly speeding up pattern manipulation (#364).
- **Rendering Enhancements** — Custom resolution exports, HDRI environment lighting, and high-fidelity PBR material properties (per-piece opacity + emission) (#377, #374).

### Fixed
- **3D Scene Scale** — Resolved "miniature effect" by recalibrating FOV (50°) and natural scene distance (3.0). Ground plane and environment now match human scale (#328, #329).
- **Undo System Stability** — Migrated to `structuredClone` for safe deep-cloning of simulation state, preventing reference leakage between history states (#400, #414).
- **Camera Orbit Pivot** — Locked 3D orbit pivot to the avatar center to prevent camera "wandering" during inspection (#346, #347).
- **Circular Chunk Dependencies** — Resolved Three.js/WebGPU TDZ (Temporal Dead Zone) errors by consolidating core and addon chunks (#309, #313).
- **TypeScript Build Compliance** — Fixed all strict type errors in the simulation and inspector modules for CI/CD green-light.

### Stats
- ~142,000 LOC across 512 TypeScript source files.
- 1585 automated tests passing (100%).
- 52 professional-grade CAD tools.

## [0.7.0] — 2026-03-06

### Added
- **Linked Editing** — Real-time propagation between symmetric pieces via Redux middleware. Supports `instance` (identical) and `symmetry` (mirrored) link modes with automatic partner sync.
- **Segment Sewing Tool** — Multi-seam type tool supporting standard, french, flat-felled, and overlock seams. Shortcut: `N`.
- **Topstitch Tools** — 4 specialized modes: Edit, Free, Seamline, and Segment topstitching with dedicated overlay UI.
- **3D Navigation Presets** — Camera slice with 8 view presets (front, back, left, right, top, bottom, three-quarter left/right) and focus-on-piece zoom.
- **Display Bar 2D** — Contextual floating toolbar with toggles for seam allowance, piece names, line lengths, grainlines, sewing lines, and render modes (textured, translucent, wireframe).
- **Split/Merge Tools** — Scissors tool (`X`) for splitting pattern pieces and Merge tool (`J`) for joining adjacent pieces.
- **Simulation Snapshots** — A/B/C comparison UI with max 3 manual slots and auto-save support.
- **Geometry Reference Stability** — Deterministic `pieceId:name` edge IDs, edge-name seam references replacing index-based system, auto-sew with stable references.
- **Agentic Copilot Loop** — Unified `AgenticLoop` architecture replacing old Planner/Executor/Reasoner pattern. Supports meta-tools (read-only) and action tools (mutations) with LLM-driven iteration.
- **Skill Authoring (SkillBuilder)** — `SkillBuilder` class with `fromConstruction()`, `withMetadata()`, `getPreview()`, `validate()`, `build()` API for community skill creation.
- **Skill Marketplace Module** — Configurable registry URL, `fetchAvailableSkills()`, community skill validation pipeline.
- **DXF Import Completion** — Full parser supporting LINE, LWPOLYLINE, POLYLINE, SPLINE, ARC, CIRCLE entities with layer-based role mapping and notch geometry.
- **Edit Classifier** — Utility classifying 2D edits as 'dimension' or 'topology' for warm-start simulation decisions.
- **2D Editor Performance** — Geometry extraction refactored to `src/utils/geometry/`, optimized for high-frequency interactions.
- **Domain Bootstrap** — Copilot domain bootstrap system for context-aware reasoning.
- **Meta-Tools System** — Read-only tools for copilot introspection without state mutation.
- **32+ Fabric Presets** — Expanded physical fabric library from 10 to 32+ calibrated materials.

### Changed
- **Copilot Architecture** — Migrated from Planner/Executor/Reasoner to unified AgenticLoop.
- **Seam References** — Migrated from index-based to edge-name references across the entire stack (store, worker, auto-sew).
- **Project Version** — Bumped to v0.7.0.

### Stats
- ~127,000 LOC across 461 TypeScript source files
- 186 test files
- 45 tool definitions

## [0.6.0] — 2026-02-27

### Added
- **Architectural Shift** — Migrated core solver to **Rust-based WASM** for sub-millisecond physics updates
- **Cognitive Engine Foundation** — Transition from "chatbot" to "Situated AI Agent" with design memory
- **Copilot Brilliance Suite** — Persistent Design Memory, 3D Visual Perception, and Intent Prediction
- **Silent Ingestion Layer** — Automated hydration of Seamly2D/DXF files into the Semantic Graph model
- **Skill Marketplace SDK** — Namespacing and guardrails for community plugins

## [0.5.0] — 2026-02-21

### Added
- **XPBD Cloth Simulation** — Matthias Muller solver ported to TypeScript (MIT)
- 10 calibrated fabric materials (Cotton Poplin, Denim, Silk Charmeuse, Wool Crepe, Jersey Knit, Organza, Linen, Neoprene, Chiffon, Canvas)
- Web Worker for 60fps off-thread simulation
- ClothMesh R3F component in Viewport3D (lazy-loaded)
- Redux simulationSlice with play/pause/reset and per-piece fabric selection
- **AI Agent Phase 1 — Foundation**: 42 tools with JSON Schema, Anthropic + OpenAI providers with streaming, PATRONAJE_SOUL.md personality, context builder, tool executor, project memory
- **AI Agent Phase 2 — Intelligence**: Compound tools (generateFromDescription, transformPiece with 9 transformations), proactive analysis (5 checks), teaching mode (11 bilingual entries), ES/EN language detection, multi-turn agent loop (5 rounds), smart defaults
- **AI Agent Phase 3 — Skills**: Skill loader + registry, 5 core skills (bodice Aldrich/Muller/Gilewska, sleeve, skirt, collar, grading), 35 formulas, 17 drafting methods, 52 construction steps, 41 grade rules, 55 bilingual triggers
- **AI Agent Phase 4 — Polish**: Error recovery with retry + fallback, cost manager with budget + model routing, Ollama local LLM provider, mobile fullscreen + voice input + quick action chips + haptics, AgentSettings UI, keyboard shortcuts
- **AI Agent Phase 5 — Community**: Plugin system (loader, registry, manager, permissions, sandboxing, namespacing), community skills (import/export/validation), marketplace preparation, language packs (ES/EN + extensible), formula plugins, PluginManager UI in ActivityBar
- 997 unit tests (52 suites) + 5 E2E suites (133 tests total)
- Documentation: AGENT_SPEC.md, AGENT_USAGE.md, OPENCLAW_PATTERNS.md

### Fixed
- unloadPlugin cleanup not removing all registered items
- resetLoadedPlugins error handling on invalid state
- Empty triggers validation in skill loader
- setBudget(0) incorrectly treated as falsy
- Disconnected simulation button in PropertiesPanel

### Stats
- ~30,634 LOC across 153 TypeScript files
- 22,860+ lines added in this sprint
- Commits: 2228e62 to 2c86de2

## [0.4.0] — 2026-02-20

### Added
- Seam allowance engine — real polygon offset with 6 corner types
- DXF import parser + AAMA/ASTM D6673 export with SPLINE entities
- 7 professional notch types (slit, T, V, castle, diamond, circle, square)
- 44 body measurements with male sizing defaults
- Nesting engine — bottom-left skyline bin packing for auto-layout
- Grading engine for multi-size pattern scaling
- Formula engine for parametric calculations
- OBJ export for 3D meshes
- Default avatar with A-pose (45 deg arms like CLO3D) at 1.80m height
- Complete project specs — architecture, core engine, simulation, file formats, AI copilot, UX, testing, security, roadmap

### Fixed
- A-pose skeleton rotation (quaternion multiply on local Z axis)
- SkeletonUtils.clone for proper skeleton cloning
- Store test updated to match current default measurements

## [0.3.0] — 2026-02-19

### Added
- DXF (R12) export with layers (cut, seam, notch, grainline, label)
- PDF export — printable cut layouts
- Parametric pattern templates (bodice, sleeve, skirt, pants, collar)
- AI copilot — agent-agnostic protocol, chat panel, command executor
- Save/load projects (.json)
- Undo/redo system (full history)
- Measurement tool — click-to-measure distance
- Node editor — double-click to edit anchor points + Bezier handles
- Local server architecture (Node.js backend)

### Changed
- Professional UI overhaul — CAD-grade design system
- VS Code-style layout — flex panels, copilot in toolbar
- Smooth viewport resize transitions
- Draggable split divider between 2D/3D

## [0.2.0] — 2026-02-19

### Added
- Seam tool — connect edges between pattern pieces
- Notch marks + grainline tool
- GLTF/GLB avatar loader (ReadyPlayerMe, MakeHuman)
- CI/CD auto-deploy to openclo.sdar.dev
- 82 unit tests across 7 suites
- 16 E2E test suites (Puppeteer)
- Mobile experience: fullscreen chat-only on <768px

### Changed
- TypeScript strict — clean build, no unused vars
- Professional motion design for UI transitions
- CSS dedup — shared utilities, ~40 duplicate declarations removed

## [0.1.0] — 2026-02-19

### Added
- Initial workspace — Vite + React + TypeScript + Three.js
- Pen tool with Bezier curves (click for corners, drag for smooth)
- Split-view 2D pattern editor + 3D viewport
- 2D to 3D sync — pattern pieces render as meshes around mannequin
- Parametric dress form mannequin
- Zoom/pan navigation
- Properties panel
- Keyboard shortcuts
- README + MIT license
