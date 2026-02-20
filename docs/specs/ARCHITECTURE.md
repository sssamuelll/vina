# OpenClo — Architecture Overview

## What Is OpenClo?

Browser-based open source alternative to CLO3D. 2D pattern editor + 3D garment visualization + AI copilot.

**Target users:** Pattern makers (patronistas), fashion designers, students, indie creators.
**Primary use case:** María at Adidas — patterns from scratch, adjustments on base, fitting on avatar. Output: DXF/PDF for real cutting.

## Stack

| Layer | Tech |
|-------|------|
| UI Framework | React 18 + TypeScript + Vite |
| State | Redux Toolkit |
| 2D Editor | SVG (custom canvas, PathCommand system) |
| 3D Viewport | Three.js via React Three Fiber v8 + drei v9 |
| Server | Node.js + Express (serves UI + project files + copilot bridge) |
| Tests | Vitest (82 unit) + Puppeteer (16 E2E suites) |
| Deploy | GitHub Actions → rsync → openclo.sdar.dev |

## Core Data Model

```
OpenCloProject
├── pieces: PatternPiece[]     — 2D pattern outlines (Bezier paths)
│   ├── outline: PathCommand[] — M/L/C/Q/Z commands
│   ├── internals: InternalLine[] — darts, grainline, notch, fold, pleat
│   ├── seamAllowance: number  — mm
│   └── position/rotation/mirrored
├── seams: Seam[]              — connections between piece edges
├── fabrics: Fabric[]          — physical properties (weight, stretch, stiffness)
└── avatar: Avatar             — GLTF/GLB model + body measurements
```

Units: **millimeters** (1 SVG unit = 1mm)

## Module Map

```
src/
├── components/
│   ├── PatternEditor/     — 2D SVG editor (GridLayer, PieceRenderer, SeamRenderer, ToolOverlay, HintText)
│   ├── Viewport3D/        — Three.js 3D viewport
│   ├── Workspace/         — Split-view layout, draggable divider
│   ├── Chat/              — AI copilot panel (agent-agnostic protocol)
│   ├── PropertiesPanel/   — Piece/avatar properties sidebar
│   └── Toolbar/           — Tool selection, view mode, actions
├── store/                 — Redux slices (project, editor, undo middleware)
├── utils/
│   ├── exportDXF.ts       — DXF R12 export (LWPOLYLINE, layers)
│   ├── exportPDF.ts       — PDF export (A0/A1 cut layout)
│   ├── patternTemplates.ts — Parametric generators (bodice, sleeve, skirt, pants, collar)
│   ├── commandExecutor.ts  — AI command → Redux action bridge
│   └── protocol.ts         — Copilot context builder
├── server/                — Node.js backend
├── types/types.ts         — All TypeScript interfaces
└── styles/shared.css      — Design system utilities
```

## Key Decisions

- **SVG for 2D, Three.js for 3D** — SVG gives precision + accessibility; Three.js handles cloth sim
- **PathCommand system** — same as SVG path `d` attribute, maps directly to DXF/PDF export
- **Agent-agnostic copilot** — no hardcoded AI provider; protocol layer bridges any LLM
- **Mobile = chat only** — no attempt to cram a CAD editor into a phone; <768px shows copilot
- **No external chart/crop/UI libraries** — everything built from scratch to keep bundle minimal
- **Templates as bootstraps** — parametric generators create starting pieces; user/AI refines from there
