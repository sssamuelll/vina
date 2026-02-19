# OpenClo

Open source 2D pattern editor + 3D garment visualization in the browser.

**[Live Demo →](https://openclo.sdar.dev)**

![OpenClo Screenshot](https://openclo.sdar.dev/vite.svg)

## What is this?

OpenClo is a browser-based tool for garment pattern design. Draw pattern pieces with Bezier curves, see them rendered in 3D around a parametric dress form, and eventually simulate how fabric drapes.

Think CLO3D, but open source, in the browser, and with AI assistance planned.

## Features (v0.1)

- **Split-view workspace** — 2D pattern editor + 3D viewport side by side
- **Pen tool with Bezier curves** — click for corners, drag for smooth curves
- **2D → 3D sync** — pattern pieces render as meshes around a mannequin
- **Parametric dress form** — adjustable measurements (height, chest, waist, hips, shoulder)
- **GLTF/GLB avatar loader** — import custom 3D models (ReadyPlayerMe, MakeHuman, etc.)
- **Keyboard shortcuts** — V (select), P (pen), L (line), H (hand), Delete, etc.
- **Zoom & pan** — mouse wheel zoom toward cursor, middle-click pan

## Stack

- React 18 + TypeScript + Vite
- Redux Toolkit (state management)
- Three.js via React Three Fiber v8 + drei v9
- SVG-based 2D editor
- No backend required — runs entirely in the browser

## Getting Started

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev
```

Open `http://localhost:5180`

## Roadmap

| Version | What | Status |
|---------|------|--------|
| v0.1 | Workspace, pen tool, 2D→3D sync | ✅ Done |
| v0.2 | Seam connections, notch marks, grainline | 🔨 Next |
| v0.3 | DXF/PDF export for real cutting | 📋 Planned |
| v0.4 | Cloth simulation (mass-spring physics) | 📋 Planned |
| v0.5 | AI Copilot — generate patterns from images/text | 📋 Planned |
| v1.0 | Public release with docs and demo | 📋 Planned |

## Why?

Professional pattern design software (CLO3D, Browzwear) is expensive, closed-source, and desktop-only. There's no open source alternative that combines 2D pattern editing with 3D visualization.

OpenClo aims to fill that gap — and eventually add AI-powered pattern generation that legacy software can't match.

## License

MIT
