# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-6B4BFF?logo=webgpu&logoColor=white)](src/utils/cloth/gpu)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)
[![Tests](https://img.shields.io/badge/Tests-4436_passing-success?logo=vitest&logoColor=white)](tests/)
[![Tools](https://img.shields.io/badge/Copilot_Tools-231-8B5CF6?logo=openai&logoColor=white)](src/copilot/action/tools/)

**The Cognitive Design Engine for Collaborative Fashion Engineering.**

> **Status (March 29, 2026):** Released **v0.10.0** — Full production pipeline from paper to factory. **Auto-Trace** converts scanned patterns to digital pieces. **3D Sewing Tool** lets you click edges to create seams. **Nesting** calculates fabric consumption. **BOM + Tech Pack** exports industry-standard production spec sheets. **Grading** scales patterns across sizes. **RAG-powered copilot** retrieves pattern-making knowledge before every interaction. See our [Changelog](CHANGELOG.md).

OpenClo.ai is a browser-based garment CAD that combines a **Semantic Garment Engine** with a **Knowledge-Grounded AI Copilot** and **WebGPU Physics** to provide a complete design-to-production environment. No plugins. No installs. Just open your browser.

**[Launch Workspace](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

---

## What Makes OpenClo Different

### Paper to Production in One Tool

Most garment CAD tools handle one stage — pattern drafting OR 3D simulation OR production output. OpenClo covers the full pipeline:

```
Paper Pattern → Auto-Trace → Digital Pattern → 3D Sewing → Simulation
    → Trims & Artwork → Grading (S-XXL) → Nesting → BOM → Tech Pack PDF
```

Every step is connected. Change a measurement and the graded sizes, nested layout, and bill of materials all update.

### AI That Knows Pattern Making

The copilot isn't just a chatbot with buttons. It retrieves relevant pattern-making knowledge — drafting methods from Aldrich, Müller, and Gilewska, ease standards by fabric type, grading rules — and reasons over them before acting. Ask it to "draft a fitted bodice for these measurements" and it knows which construction method to use and why.

### Runs in Your Browser

WebGPU physics, XPBD cloth simulation, and Rust WASM solvers — all running client-side. No server required for design work. Your patterns stay on your machine.

---

## Features

### Design
- **60+ 2D Tools** — Pen, scissors, merge, mirror, slash-and-spread, dart manipulation, elastic, pleats
- **3D Sewing Tool** — Click two edges in the 3D viewport to create seams (CLO3D-style)
- **Auto-Trace** — Canny edge detection converts scanned patterns to vector outlines
- **Artwork Placement** — Place logos, prints, and graphics on pieces with canvas compositing
- **Trim & Hardware** — 22-preset library (buttons, zippers, snaps, rivets, buckles), click-to-place on pieces
- **Colorways** — Per-piece color overrides with tab bar UI and 2D/3D preview

### Simulation
- **XPBD Cloth Physics** — 32 fabric presets with real-world stretch, bend, and shear data
- **WebGPU + WASM** — GPU solver via TSL, Rust WASM fallback, zero-copy rendering
- **Seam Simulation** — Pieces sew together with tension, gathering, and type-specific behavior
- **Pressure & Folds** — Puffer jacket inflation, XPBD fold constraints for pleats
- **Interactive** — Grab fabric, apply steam, control wind with 3D gizmos

### Production
- **Grading** — Scale patterns across EU/US/UK size systems (XS-XXL) with staleness detection
- **Nesting** — Fabric roll mode with skyline algorithm, configurable width/gap, utilization stats
- **Bill of Materials** — Auto-extracted fabrics, interfacing, thread, seam tape, elastics, trims with cost tracking
- **Tech Pack PDF** — Multi-page production spec sheet with 3D views, measurements, BOM, construction notes
- **DXF/AAMA Export** — Industry-standard format with multi-size blocks and production layers

### Intelligence
- **231 Copilot Tools** — Every feature accessible via natural language
- **RAG Knowledge Base** — 65 chunks of pattern-making knowledge retrieved per interaction
- **Agentic Loop** — LLM drives tool execution with read-only inspection and action tools
- **Bilingual** — English and Spanish throughout tools and UI

## Interoperability

| Format | Direction | Use Case |
|--------|-----------|----------|
| **DXF (AAMA/ASTM)** | Import + Export | Industrial pattern exchange |
| **Seamly2D** | Import | 18 validated parametric patterns |
| **OBJ/FBX/GLB/GLTF** | Import + Export | 3D mesh, animation, VR/AR |
| **PDF** | Export | 1:1 patterns, cutting layouts, tech packs |
| **PNG/JPG/SVG** | Import | Reference images, artwork, auto-trace |
| **CSV** | Export | Bill of materials |

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # Workspace at http://localhost:5173
npm test          # Run 4,400+ tests
```

## Project Stats

| Metric | Count |
|--------|-------|
| TypeScript Source Files | 950+ |
| Automated Tests | 4,436 |
| Copilot Tools | 231 |
| Knowledge Chunks (RAG) | 65 |
| Fabric Presets | 32 |
| Trim Presets | 22 |

---

**OpenClo.ai** — From sketch to factory floor. MIT Licensed.
