# Changelog

All notable changes to OpenClo are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

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
