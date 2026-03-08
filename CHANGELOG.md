# Changelog

All notable changes to OpenClo are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.7.0] — 2026-03-06 (Current)

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
