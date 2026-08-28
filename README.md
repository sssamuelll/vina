# Vina

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/vina/deploy.yml?branch=main)](https://github.com/sssamuelll/vina/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-6B4BFF?logo=webgpu&logoColor=white)](src/utils/cloth/gpu)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)
[![Tests](https://img.shields.io/badge/tests-6000%2B%20passing-success?logo=vitest&logoColor=white)](tests/)

**Browser-based garment CAD with real-time cloth simulation and an AI copilot.**

Vina lets a patternmaker bring a flat pattern into the browser, sew it in 3D, and watch it drape on an avatar with GPU-accelerated cloth physics. No install, no plugin, no server for design work. The pattern stays on your machine.

**[Try it → vina.sdar.dev](https://vina.sdar.dev)**  ·  [Contributing](CONTRIBUTING.md)  ·  [Architecture](docs/specs/ARCHITECTURE.md)

> **Status — v0.11.0 (August 2026).** The core loop works end to end: import a DXF/AAMA pattern → auto-detect edges → sew pieces in 3D → drape on an avatar with WebGPU cloth simulation. Since July the 2D editor has been hardened against a professional patternmaker's daily notes (rotated pieces, seam allowance on real DXFs, drag-to-measure). Size grading and production output (nesting, BOM) are in the tool; per-point grading of imported patterns and drafting-from-scratch are on the [roadmap](ROADMAP.md). A local diagnostic export (`Archivo ▸ Exportar diagnóstico`) bundles state and error history for bug reports — it reproduces 2D pattern bugs today; 3D drape bugs are next. We build in the open — expect rough edges and honest labels where a feature isn't finished yet.

---

## What it does today

The working path, end to end:

1. **Import** a pattern from a DXF/AAMA file (the format professional CAD tools like CLO3D and Gerber export).
2. **Detect** piece outlines, seams, notches, and grainlines from the imported geometry.
3. **Sew** pieces together in the 3D viewport by clicking edges, CLO3D-style.
4. **Simulate** the drape on an avatar with a real-time XPBD cloth solver running on WebGPU.
5. **Grade** the pattern across a size run, **nest** pieces for fabric consumption, and export a **bill of materials** or a **tech pack**.

An AI copilot sits alongside the canvas: it retrieves pattern-making knowledge (drafting methods, ease standards, fabric behavior) and can drive the same tools you use by hand.

## Why it's interesting to build on

If you like graphics, physics, or applied AI, there's a lot of real engineering here:

- **A 4-tier cloth solver with parity.** The same XPBD simulation runs on **WebGPU** (TSL compute shaders, the default tier), **Rust/WASM** (the fallback and CI parity oracle), a **CPU** reference, and an experimental neural tier. Cross-tier equivalence is locked by a boundary-contract test suite.
- **A semantic garment engine.** Pieces, seams, darts, and notches are first-class domain entities with their own rules, not just polylines. Editing one piece propagates to its symmetric twin; changing a measurement can re-grade a size run.
- **A knowledge-grounded copilot.** The agent retrieves relevant pattern-making knowledge before it acts, and operates the app through the same tool layer the UI uses, so human and agent affordances stay in sync.
- **Browser-native and client-side.** WebGPU physics, Rust compiled to WASM, zero-copy rendering into Three.js. It runs in a tab.

## Tech stack

React 18 · Redux Toolkit + Zustand · Three.js (WebGPU renderer) · Vite 6 · Rust + wasm-pack · Vitest + Playwright. TypeScript in strict mode throughout.

## Quick start

```bash
git clone https://github.com/sssamuelll/vina.git
cd vina
npm install
npm run dev        # workspace at http://localhost:5173
npm test           # ~6,000 unit tests
```

WebGPU runs in current Chrome, Edge, and Chromium-based browsers. Where WebGPU is unavailable, the simulation falls back to the WASM tier automatically. You only need Rust + `wasm-pack` if you plan to modify the cloth solver in `crates/xpbd-wasm`.

## Contributing

We'd love the help. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the commit gate, and code conventions, then browse [open issues](https://github.com/sssamuelll/vina/issues) — issues labeled `roadmap` describe larger pieces of the vision, and smaller bugs make good first contributions.

The commit gate is three commands, and a pre-commit hook runs the fast half automatically:

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

## Architecture at a glance

```
src/
├── components/   # React UI: shell, 2D PatternEditor, 3D Viewport
├── copilot/      # AI copilot: agentic loop, tools, RAG knowledge, skills
├── store/        # Redux slices + middleware
├── stores/       # Zustand state
├── utils/        # engines: cloth/, dxf/, grading/, nesting/, seam/, mesh/
└── workers/      # Web Worker pool (WASM + CPU solvers)

crates/xpbd-wasm/ # Rust XPBD cloth solver → public/wasm/
docs/             # specs, research, RFCs, historical plans
```

Full write-up in [docs/specs/ARCHITECTURE.md](docs/specs/ARCHITECTURE.md). The [docs index](docs/README.md) maps the rest.

## Interoperability

| Format | Direction | Use case |
|--------|-----------|----------|
| **DXF (AAMA/ASTM)** | Import + Export | Industrial pattern exchange — the primary import path |
| **OBJ / FBX / GLB / GLTF** | Import + Export | 3D meshes and avatars |
| **PDF** | Export | 1:1 patterns, cutting layouts, tech packs |
| **PNG / JPG / SVG** | Import | Reference images and artwork |
| **CSV** | Export | Bill of materials |

## Language

The application UI is in Spanish, aimed at professional patternmakers. Project documentation and code are in English so the project is open to contributors worldwide. A Spanish translation of the contributor docs is planned.

---

**Vina** — the Cognitive Design Engine for professional fashion engineering. MIT Licensed.
