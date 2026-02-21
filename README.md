# OpenClo

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-997%20unit%20%2B%20133%20E2E-brightgreen)](src/)

**Open source 2D pattern editor + 3D cloth simulation + AI copilot — all in the browser.**

OpenClo is a free, browser-based alternative to CLO3D for garment pattern design. Draw pattern pieces with Bézier curves, connect seams, simulate fabric draping in real-time, and let an AI copilot generate patterns from natural language — all with no downloads, no license fees.

**[Live Demo →](https://openclo.sdar.dev)**

![OpenClo Editor](docs/screenshots/editor.png)

## Features

### 🖊️ 2D Pattern Editor
- Pen tool with Bézier curves (click for corners, drag for smooth)
- Rectangle tool, line tool, node editor
- Seam connections, notch marks (7 types), grainline, darts
- Measurement tool, parametric templates (bodice, sleeve, skirt, pants, collar)
- Draggable split-view 2D + 3D, command palette (⌘K)
- Undo/redo, autosave, keyboard shortcuts

### 🧵 3D Cloth Simulation
- **XPBD solver** — Matthias Müller port, physically accurate draping
- **10 real fabrics** — Cotton Poplin, Denim, Silk Charmeuse, Wool Crepe, Jersey Knit, Organza, Linen, Neoprene, Chiffon, Canvas
- **Web Worker** — 60fps off-thread simulation, zero UI blocking
- **ClothMesh** — R3F component with lazy loading, per-piece fabric selection
- Parametric avatar (1.80m, 44 body measurements), GLTF/GLB loader

### 🤖 AI Copilot (42 Tools, 5 Skills, 3 Providers)
- **Anthropic Claude, OpenAI GPT, Ollama** (local/free) — choose your provider
- **42 tools**: Create, modify, grade, nest, export, simulate — all via natural language
- **5 pattern-making skills**: Bodice (Aldrich/Müller/Gilewska), sleeve, skirt, collar, grading — with real drafting knowledge (35 formulas, 17 methods, 52 construction steps)
- **Teaching mode**: Explains WHY behind each action (patronaje education)
- **Bilingual**: Spanish and English with proper pattern-making terminology
- **Compound operations**: `generateFromDescription`, `transformPiece` (9 transformations)
- **Proactive analysis**: 5 automatic checks (SA consistency, dart alignment, fit issues)
- **Cost management**: Token tracking, budget warnings, smart model routing
- **Error recovery**: Automatic retry with backoff, provider fallback
- **Mobile**: Voice input, quick action chips, haptic feedback
- See [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md) for the full usage guide

### 🔌 Plugin System
- **Loader, registry, manager** with permissions and sandboxing
- **Community skills**: Import/export/validation, marketplace preparation
- **Language packs**: ES/EN built-in, extensible to any language
- **Formula plugins**: Add custom parametric calculations
- **PluginManager UI** in ActivityBar

### ⚙️ Industrial Engines
- **Seam allowance** — polygon offset with 6 corner types
- **Nesting** — bottom-left skyline bin packing, 3 strategies, rotation
- **Grading** — multi-size pattern scaling (XS–XXL, 41 grade rules)
- **Formula** — parametric calculations from 44 body measurements

### 📤 Export
- DXF (AAMA/ASTM D6673) with SPLINE entities
- PDF — printable cut layouts
- OBJ — 3D mesh export (ear-clipping triangulation)

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # http://localhost:5180
npx vitest run    # 997 unit tests
npm run build     # production build
```

### AI Copilot Setup

The copilot works with three providers:

1. **Ollama (free, local)**: Install [Ollama](https://ollama.ai), run `ollama pull llama3.1`, then enable in Settings → Agent
2. **Anthropic**: Add your API key in Settings → Agent → Anthropic
3. **OpenAI**: Add your API key in Settings → Agent → OpenAI

Open the copilot with **⌘/** (or click the AI icon in the ActivityBar).

## Architecture

React 18 + TypeScript + Vite, Redux Toolkit, Three.js via React Three Fiber.

```
src/
├── components/        # UI (editor, viewport, panels, copilot, plugin manager)
├── agent/             # AI agent (tools, skills, providers, memory, cost manager)
│   ├── tools/         # 42 tool definitions with JSON Schema
│   ├── skills/        # Pattern-making skills (bodice, sleeve, skirt, collar, grading)
│   ├── providers/     # Anthropic, OpenAI, Ollama LLM providers
│   └── plugins/       # Plugin system (loader, registry, permissions, sandboxing)
├── utils/             # Engines (seam allowance, nesting, grading, DXF, PDF, cloth sim)
│   └── cloth/         # XPBD solver, fabric library, Web Worker
├── store/             # Redux slices (project, editor, simulation, agent)
docs/
├── AGENT_SPEC.md      # Full agent architecture specification
├── AGENT_USAGE.md     # User guide for the AI copilot
└── specs/             # Architecture, roadmap, file formats
```

See [docs/specs/ARCHITECTURE.md](docs/specs/ARCHITECTURE.md) for details.

## Testing

```bash
npx vitest run          # 997 unit tests (52 suites)
npx vitest run --e2e    # 133 E2E tests (5 suites)
npx tsc -b              # Type checking (clean)
```

## File Format Compatibility

| Format | Import | Export | Status |
|--------|--------|--------|--------|
| DXF (AAMA/ASTM) | ✅ | ✅ | Full support |
| PDF | — | ✅ | Cut layouts |
| OBJ | — | ✅ | 3D meshes |
| OpenClo .json | ✅ | ✅ | Native format |
| CLO3D .zprj | 🔜 | 🔜 | Planned |
| SVG | 🔜 | — | Planned |

## Roadmap

| Version | What | Status |
|---------|------|--------|
| v0.1–v0.4 | Foundation — editor, 3D, templates, DXF/PDF, engines | ✅ Done |
| **v0.5** | **AI Agent (5 phases) + XPBD Cloth Simulation + Plugins** | **✅ Done** |
| v0.6 | Landing page, .zprj import, María testing | 🔨 Next |
| v1.0 | Public release — PWA, performance, full collision | 📋 Planned |

## Stats

- **~30,634 LOC** across 153 TypeScript files
- **997 unit tests** + **133 E2E tests** — all green
- **42 agent tools**, **5 skills**, **3 LLM providers**
- **10 fabric materials**, XPBD cloth simulation at 60fps
- **tsc -b clean**, zero warnings

## Why?

Professional pattern software (CLO3D, Browzwear, Gerber) is expensive, closed-source, and desktop-only. OpenClo is the open source alternative — browser-based, with AI-powered pattern generation that legacy tools can't match. A user can say *"hazme un corpiño talla 40"* and get a real pattern with darts, seam allowance, and grainlines in seconds.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
