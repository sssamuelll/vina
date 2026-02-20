# OpenClo

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

**Open source 2D pattern editor + 3D garment visualization in the browser.**

OpenClo is a free, browser-based alternative to CLO3D for garment pattern design. Draw pattern pieces with Bézier curves, connect seams, add notches and grainlines, see everything rendered in 3D around a parametric avatar, and export production-ready files — all with optional AI assistance.

**[Live Demo →](https://openclo.sdar.dev)**

![OpenClo Editor](docs/screenshots/editor.png)

## Features

### 🖊️ Editor
- Pen tool with Bézier curves (click for corners, drag for smooth)
- Node editor — edit anchor points + handles
- Seam connections, notch marks (7 types), grainline, darts
- Measurement tool
- Parametric templates (bodice, sleeve, skirt, pants, collar)
- Draggable split-view 2D + 3D
- Undo/redo, save/load, keyboard shortcuts

### ⚙️ Engines
- **Seam allowance** — polygon offset with 6 corner types
- **Nesting** — bottom-left skyline bin packing
- **Grading** — multi-size pattern scaling
- **Formula** — parametric calculations from 44 body measurements

### 📤 Export
- DXF (AAMA/ASTM D6673) with SPLINE entities
- PDF — printable cut layouts
- OBJ — 3D mesh export

### 🤖 AI Copilot
- **Multi-provider**: Anthropic Claude, OpenAI GPT, Ollama (local/free)
- **42 tools**: Create, modify, grade, nest, export — all via natural language
- **Pattern skills**: Bodice, sleeve, skirt, collar, grading — with real drafting knowledge
- **Teaching mode**: Explains WHY behind each action (patronaje education)
- **Bilingual**: Spanish and English with proper pattern-making terminology
- **Cost management**: Token tracking, budget warnings, smart model routing
- **Error recovery**: Automatic retry with backoff, provider fallback
- **Mobile-friendly**: Voice input, quick action chips, haptic feedback
- **Offline mode**: Works with Ollama or built-in templates, no internet required
- See [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md) for the full usage guide

### 👤 3D Viewport
- Parametric avatar (1.80m default, 44 body measurements)
- GLTF/GLB loader (Avaturn, ReadyPlayerMe, MakeHuman)
- A-pose, real-time pattern mesh preview

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # http://localhost:5180
npx vitest run    # 82 unit tests
npm run build     # production build
```

## Architecture

React 18 + TypeScript + Vite, Redux Toolkit, Three.js via React Three Fiber.

Each engine in `src/utils/` is independent — pure TypeScript, no external deps, fully unit tested.

```
src/
├── components/     # UI (editor, viewport, panels, chat)
├── utils/          # Engines (seam allowance, nesting, grading, DXF, PDF...)
├── store/          # Redux slices
docs/specs/         # Architecture, roadmap, file formats
```

See [docs/specs/ARCHITECTURE.md](docs/specs/ARCHITECTURE.md) for details.

## File Format Compatibility

| Format | Import | Export | Status |
|--------|--------|--------|--------|
| DXF (AAMA/ASTM) | ✅ | ✅ | Full support |
| PDF | — | ✅ | Cut layouts |
| OBJ | — | ✅ | 3D meshes |
| OpenClo .json | ✅ | ✅ | Native format |
| CLO3D .zprj | 🔜 | 🔜 | Planned v0.5 |
| SVG | 🔜 | — | Planned v0.5 |
| Gerber AccuMark | 🔜 | 🔜 | Planned v0.5 |

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 1 | Foundation — editor, 3D, templates, AI, tests | ✅ Done (v0.1–v0.4) |
| 2 | Industry formats — DXF/CLO3D/Gerber import+export | 🔨 In Progress (v0.5) |
| 3 | Pro UI — per-view toolbars, floating panels | 📋 Planned (v0.6) |
| 4 | Avatar system — pose editor, body morphs | 📋 Planned (v0.7) |
| 5 | Production output — A0/A1 PDF, marker making | 📋 Planned (v0.8) |
| 6 | Cloth simulation — physics, draping, heatmaps | 📋 Planned (v0.9) |
| 7 | Grading — multi-size rules, size range export | 📋 Planned (v0.10) |

See [docs/specs/ROADMAP.md](docs/specs/ROADMAP.md) for full details.

## Why?

Professional pattern software (CLO3D, Browzwear, Gerber) is expensive, closed-source, and desktop-only. OpenClo is the open source alternative — browser-based, with AI-powered pattern generation that legacy tools can't match.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
