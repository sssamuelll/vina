# Changelog

All notable changes to OpenClo are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.7.0-dev] — 2026-03-05 (Current)

### In Progress
- **3D Navigation Polish** — Orbital controls and ergonomic viewport shortcuts
- **DXF Import Completion** — Full support for grading and notches in legacy ingestion
- **Display Bar 2D** — Quick-access contextual tools for pattern drafting
- **Linked Editing** — Real-time propagation of changes between symmetric pieces

## [0.6.0] — 2026-02-27

### Added
- **Architectural Shift** — Migrated core solver to **Rust-based WASM** for sub-millisecond physics updates
- **Cognitive Engine Foundation** — Transition from "chatbot" to "Situated AI Agent" with design memory
- **Copilot Brilliance Suite** — Persistent Design Memory, 3D Visual Perception, and Intent Prediction
- **Silent Ingestion Layer** — Automated hydration of Seamly2D/DXF files into the Semantic Graph model
- **Skill Marketplace SDK** — Namespacing and guardrails for community plugins

## [0.5.0] — 2026-02-21

### Added
- **XPBD Cloth Simulation** — Matthias Müller solver ported to TypeScript (MIT)
- 10 calibrated fabric materials (Cotton Poplin, Denim, Silk Charmeuse, Wool Crepe, Jersey Knit, Organza, Linen, Neoprene, Chiffon, Canvas)
- Web Worker for 60fps off-thread simulation
- ClothMesh R3F component in Viewport3D (lazy-loaded)
- Redux simulationSlice with play/pause/reset and per-piece fabric selection
- **AI Agent Phase 1 — Foundation**: 42 tools with JSON Schema, Anthropic + OpenAI providers with streaming, PATRONAJE_SOUL.md personality, context builder, tool executor, project memory
- **AI Agent Phase 2 — Intelligence**: Compound tools (generateFromDescription, transformPiece with 9 transformations), proactive analysis (5 checks), teaching mode (11 bilingual entries), ES/EN language detection, multi-turn agent loop (5 rounds), smart defaults
- **AI Agent Phase 3 — Skills**: Skill loader + registry, 5 core skills (bodice Aldrich/Müller/Gilewska, sleeve, skirt, collar, grading), 35 formulas, 17 drafting methods, 52 construction steps, 41 grade rules, 55 bilingual triggers
- **AI Agent Phase 4 — Polish**: Error recovery with retry + fallback, cost manager with budget + model routing, Ollama local LLM provider, mobile fullscreen + voice input + quick action chips + haptics, AgentSettings UI, keyboard shortcuts (⌘/)
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
- Commits: 2228e62 → 2c86de2

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
- Default avatar with A-pose (45° arms like CLO3D) at 1.80m height
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
- Node editor — double-click to edit anchor points + Bézier handles
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
- Pen tool with Bézier curves (click for corners, drag for smooth)
- Split-view 2D pattern editor + 3D viewport
- 2D→3D sync — pattern pieces render as meshes around mannequin
- Parametric dress form mannequin
- Zoom/pan navigation
- Properties panel
- Keyboard shortcuts
- README + MIT license
