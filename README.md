# OpenClo

Open source 2D pattern editor + 3D garment visualization in the browser.

**[Live Demo →](https://openclo.sdar.dev)**

## What is this?

OpenClo is a browser-based tool for garment pattern design. Draw pattern pieces with Bezier curves, see them rendered in 3D around a mannequin, export production-ready DXF for cutting.

Think CLO3D, but open source, in the browser, and with AI assistance.

## Features

**2D Pattern Editor**
- Pen tool with Bezier curves (click for corners, drag for smooth curves)
- Node editor (double-click to edit anchor points + handles)
- Seam connections, notch marks, grainline, darts
- Measurement tool
- Parametric templates (bodice, sleeve, skirt, pants, collar)
- SVG-based — infinite precision

**3D Viewport**
- Pattern pieces rendered as meshes around parametric avatar
- GLTF/GLB avatar loader (Avaturn, ReadyPlayerMe, MakeHuman)
- A-pose default, adjustable body measurements

**AI Copilot**
- Agent-agnostic chat panel (works with any LLM provider)
- Generate and modify patterns via natural language
- Command executor bridges AI responses → editor actions

**Export**
- DXF (R12) — pattern pieces with layers (cut, seam, notch, grainline, label)
- PDF — printable cut layouts

**Other**
- Save/Load projects
- Undo/Redo (full history)
- Keyboard shortcuts
- Mobile: chat-only experience (<768px)
- CI/CD auto-deploy

## Stack

- React 18 + TypeScript + Vite
- Redux Toolkit
- Three.js via React Three Fiber v8 + drei v9
- Node.js + Express (server)
- 82 unit tests (Vitest) + 16 E2E suites (Puppeteer)

## Getting Started

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev
```

Open `http://localhost:5180`

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 1 | Foundation — editor, 3D, templates, AI, tests | ✅ Done (v0.1–v0.4) |
| 2 | **Industry formats** — DXF/CLO3D/Gerber import+export | 🔨 In Progress (v0.5) |
| 3 | **Pro UI** — per-view toolbars, floating panels, swappable views | 📋 Planned (v0.6) |
| 4 | **Avatar system** — pose editor, body morphs, avatar library | 📋 Planned (v0.7) |
| 5 | **Production output** — A0/A1 PDF, marker making, nesting | 📋 Planned (v0.8) |
| 6 | **Cloth simulation** — mass-spring physics, draping, heatmaps | 📋 Planned (v0.9) |
| 7 | **Grading** — multi-size rules, grade points, size range export | 📋 Planned (v0.10) |
| — | **v1.0 Public release** — landing page, docs, tutorials | 📋 Planned |

See [docs/specs/ROADMAP.md](docs/specs/ROADMAP.md) for full details.

## File Format Compatibility

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| DXF (ASTM D6673) | 🔨 v0.5 | ✅ Basic / 🔨 ASTM upgrade | Universal pattern exchange |
| CLO3D .zprj | 🔨 v0.5 | 🔨 v0.5 | ZIP with DXF + metadata |
| Gerber AccuMark | 🔨 v0.5 | 🔨 v0.5 | ZIP with ASTM DXF |
| SVG | 🔨 v0.5 | — | Illustrator/Inkscape paths |
| PDF | — | ✅ | Cut layouts |
| OpenClo .json | ✅ | ✅ | Native project format |

See [docs/specs/FILE-FORMATS.md](docs/specs/FILE-FORMATS.md) for format details.

## Why?

Professional pattern design software (CLO3D, Browzwear, Gerber AccuMark) is expensive, closed-source, and desktop-only. There's no open source alternative that combines 2D pattern editing with 3D visualization.

OpenClo fills that gap — and adds AI-powered pattern generation that legacy software can't match.

## License

MIT
