# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-6B4BFF?logo=webgpu&logoColor=white)](src/utils/cloth/gpu)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)
[![Tests](https://img.shields.io/badge/Tests-3354_passing-success?logo=vitest&logoColor=white)](tests/)

**The Cognitive Design Engine for Professional Fashion Engineering.**

> **Status (March 18, 2026):** Shipped **Click'n'Go Expert Mode** (#268) and **Diagnostic Inspector** (#32). Power users can now skip confirmations and auto-apply remembered tool settings. Right-click any piece to get instant diagnostics, AI-powered analysis, and one-click fixes. See our [Roadmap](ROADMAP.md).

OpenClo.ai is a high-performance, browser-based ecosystem that transcends traditional CAD. It combines a **Semantic Garment Engine** with an autonomous **Situated AI Copilot** and **Next-Gen WebGPU Physics** to provide a professional-grade environment for garment construction, grading, and 3D validation.

**[Launch Workspace](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

## 🚀 Recent Milestones (v0.7.x)
- **Diagnostic Inspector** (#32): Right-click any piece to get instant data, 13 deterministic diagnostic checks, and AI-powered analysis with one-click fix suggestions.
- **Click'n'Go Expert Mode** (#268): Expert mode toggle reduces confirmations, auto-applies last-used tool settings, per-tool overrides via Shift+right-click.
- **Walk Seam Verification**: Interactive tool for verifying seam length matching and ease distribution with <0.1mm Gauss-Legendre precision.
- **High-Precision Measurement**: Gauss-Legendre quadrature engine for arc-length and ease comparison tools.
- **WebGPU / TSL Engine**: Massive 10–50x performance boost via **Zero-copy Rendering** and shared compute buffers.
- **3D Interaction Suite**: Professional **Mesh Grab (O-Key)**, **Steam/Press Brush**, and **Per-piece Freeze** functionality.
- **Agentic Copilot Loop**: Fully autonomous design iterations with 3,350+ automated test cases.

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
- **45 professional tools** including segment sewing, topstitch (4 modes), scissors/split, merge, mirror, and elastic.
- **Advanced Measurement**: Walk-seam verification with ghost piece preview, markers, and curve delta/ease comparison.
- Advanced notch management (7 types), grainline control, and automated dart manipulation.
- **Linked editing**: Symmetric pattern propagation (instance and mirror modes).

### Industrial-Grade Simulation
- **32+ Physical Fabric Profiles** — Denim, Silk, Wool, Jersey, etc., with real-world shear/stretch data.
- **Interactive Tools**: Grab and pull fabric during simulation, apply steam for local relaxation.
- **Multi-Body Collision**: Avatar + imported meshes with per-body friction and offset controls.

### Production Engines
- **Seam Allowance**: Intelligent polygon offset with 6 corner types.
- **Nesting**: High-efficiency bin packing for fabric optimization.
- **Grading**: Algorithmic multi-size scaling (XS-XXL) based on industrial grade rules.

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
npx vitest run    # Run 3,100+ tests
```

## Project Stats

| Metric | Count |
|--------|-------|
| TypeScript Source Files | 530+ |
| Unit/E2E Test Files | 230+ |
| Total Automated Tests | 3,354 |
| Total LOC | ~155,000 |
| Development Days | 25 |

---
**OpenClo.ai** — Digitizing Fashion Intelligence. MIT Licensed.
