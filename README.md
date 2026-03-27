# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-6B4BFF?logo=webgpu&logoColor=white)](src/utils/cloth/gpu)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)
[![Tests](https://img.shields.io/badge/Tests-4232_passing-success?logo=vitest&logoColor=white)](tests/)
[![Tools](https://img.shields.io/badge/Copilot_Tools-213-8B5CF6?logo=openai&logoColor=white)](src/copilot/action/tools/)

**The Cognitive Design Engine for Collaborative Fashion Engineering.**

> **Status (March 27, 2026):** Released **v0.9.0** — Seam system overhaul (pieces now sew together), **Pressure Simulation** for puffer jackets, **XPBD Fold Constraints** for pleats, **Colorway UI**, **Pre-Marking Rules** for nesting, **213 copilot tools**, and all audit findings resolved. See our [Changelog](CHANGELOG.md) and [Roadmap](ROADMAP.md).

OpenClo.ai is a high-performance, browser-based ecosystem that transcends traditional CAD. It combines a **Semantic Garment Engine** with an autonomous **Situated AI Copilot** and **Next-Gen WebGPU Physics** to provide a professional-grade environment for garment construction, grading, and 3D validation.

**[Launch Workspace](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

## 🚀 Recent Milestones (v0.9.0)
- **Seam System Overhaul**: Pieces actually sew together. Color-coded pairs, curved edge rendering, type-specific line styles, shrinkage/gathering control.
- **Pressure Simulation**: Internal inflation for puffer jackets, balloon sleeves, padded quilting.
- **XPBD Fold Constraints**: 3D pleat/crease simulation — fold lines create angular constraints in the solver.
- **Colorway Support**: Tab bar UI, per-fabricCode color overrides, 2D piece tinting, Gerber-compatible export.
- **Pre-Marking Rules**: Production nesting constraints (atFold, atEdge, priority, grainTilt) integrated into the nesting engine.
- **Undo Batch Grouping**: `batchUndo()` wraps N dispatches as a single undo entry — systemic fix for partial undo.
- **213 Copilot Tools**: Every feature registered for AI agent access with rollback support.
- **Elastic Tool**: Waistbands, cuffs, gathered edges with stretchRatio control and simulation integration.
- **Slash and Spread**: Cut and spread/rotate for fullness with 8-phase geometric pipeline.
- **All Audit Findings Resolved**: 15 original findings (2 BLOCKER, 5 HIGH, 6 MEDIUM, 2 LOW) — 100% closed.

## Core Pillars

### Semantic Garment Engine
Unlike legacy tools that treat patterns as static vectors, OpenClo.ai operates on a **Semantic Graph**. Every node and edge carries anatomical meaning (e.g., *ArmholeCurve*, *ShoulderSeam*), allowing the engine to maintain structural integrity and sewing compatibility automatically during complex transformations.

### Situated AI Agency
Our Copilot is a **Situated Fashion Agent** powered by a unified **Agentic Loop** architecture:
- **Semantic Pattern Recognition**: Understands garment anatomy as deeply as a master tailor.
- **Durable Design Memory**: Learns your aesthetic preferences, fit standards, and style history.
- **Agentic Loop**: Unified tool-use loop with meta-tools (read-only) and action tools (mutations).

### Next-Gen WebGPU Physics
Powered by **TSL (Three.js Shading Language)** and a **Rust-based WASM fallback**, OpenClo.ai provides real-time, physically accurate 3D draping.
- **Zero-copy Rendering**: Simulated positions remain in GPU memory, eliminating CPU-GPU transfer overhead.
- **Deterministic XPBD**: Stable, production-grade simulation even under extreme stress.
- **Interactive Gizmos**: Wind force control with 3D UI gizmos and real-time visualization.

## Features

### Professional 2D Drafting
- **60+ professional tools** including segment sewing, topstitch (4 modes), scissors/split, merge, mirror, elastic, slash-and-spread, pleats, and 3D mesh selection.
- **Advanced Measurement**: Walk-seam verification with ghost piece preview, POM measurements, and curve delta/ease comparison.
- Advanced notch management (7 types), grainline control, dart manipulation (segment + cap shaping), and annotation library.
- **Linked editing**: Symmetric pattern propagation (instance and mirror modes).
- **Colorways**: Per-fabricCode color overrides with tab bar UI and 2D piece tinting.

### Industrial-Grade Simulation
- **32+ Physical Fabric Profiles** — Denim, Silk, Wool, Jersey, etc., with real-world shear/stretch data.
- **Seam Simulation**: Pieces sew together with tension, shrinkage/gathering, and type-specific behavior.
- **Pressure & Folds**: Internal inflation for puffer jackets + XPBD fold constraints for pleats.
- **Interactive Tools**: Grab and pull fabric during simulation, apply steam for local relaxation.
- **Multi-Body Collision**: Avatar + imported meshes with per-body friction and offset controls.

### Production Engines
- **Seam Allowance**: Intelligent polygon offset with 7 corner types (mitered, envelope, square, etc.).
- **Nesting**: High-efficiency bin packing with pre-marking placement rules (atFold, priority, grainTilt).
- **Grading**: Algorithmic multi-size scaling (XS-XXL) based on industrial grade rules.
- **Fabric Codes**: Production classification (SELF, LINING, INTERLINING) with DXF/AAMA export.
- **Annotations**: 14 built-in production templates with category-colored 2D rendering and DXF export.

## Interoperability

| Format | Status | Role |
|--------|--------|------|
| **DXF (AAMA/ASTM)** | Full (High-Fidelity) | Industrial Interop with spline and layer support |
| **Seamly2D (.val/.vit)** | Auto-Ingest | Legacy Library Absorption |
| **OBJ/FBX/GLB/GLTF** | Full Support | 3D Mesh & Animation Pipeline |
| **PDF / SVG** | Export | Physical Production & Vector Assets |

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # Workspace at http://localhost:5180
npm test          # Run 4,200+ tests
```

## Project Stats

| Metric | Count |
|--------|-------|
| TypeScript Source Files | 580+ |
| Unit/E2E Test Files | 275+ |
| Total Automated Tests | 4,232 |
| Copilot Tools | 213 |
| Total LOC | ~165,000 |
| Development Days | 28 |

---
**OpenClo.ai** — Democratizing Fashion Intelligence. MIT Licensed.
