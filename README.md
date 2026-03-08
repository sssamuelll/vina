# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![codecov](https://codecov.io/gh/sssamuelll/openclo/graph/badge.svg)](https://codecov.io/gh/sssamuelll/openclo)

**The Cognitive Design Engine for Professional Fashion Engineering.**

> **Status (March 2026):** Currently in **v0.7.0 "Precision & Professional Tools"**. We have shipped linked editing, segment sewing, topstitch tools, 3D navigation presets, and a fully agentic copilot loop. See our [Roadmap](ROADMAP.md) for the path to v1.0.

OpenClo.ai is a high-performance, browser-based ecosystem that transcends traditional CAD. It combines a **Semantic Garment Engine** with an autonomous **Situated AI Copilot** and **Deterministic XPBD Physics** to provide a professional-grade environment for garment construction, grading, and 3D validation.

**[Launch Workspace](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

## Core Pillars

### Semantic Garment Engine
Unlike legacy tools that treat patterns as static vectors, OpenClo.ai operates on a **Semantic Graph**. Every node and edge carries anatomical meaning (e.g., *ArmholeCurve*, *ShoulderSeam*), allowing the engine to maintain structural integrity and sewing compatibility automatically during complex transformations. Edge references use deterministic `pieceId:name` format for stable cross-system linking.

### Situated AI Agency
Our Copilot is a **Situated Fashion Agent** powered by a unified **Agentic Loop** architecture:
- **Semantic Pattern Recognition**: Understands garment anatomy as deeply as a master tailor.
- **Durable Design Memory**: Learns your aesthetic preferences, fit standards, and style history across sessions.
- **Intent-Based Synthesis**: Generates production-ready patterns from natural language intent.
- **Agentic Loop**: Unified tool-use loop with meta-tools (read-only) and action tools (mutations), LLM-driven iteration until completion.

### Deterministic XPBD Physics
Powered by a high-speed **Rust-based engine (WASM)**, OpenClo.ai provides real-time, physically accurate 3D draping. Validate fit, tension, and drape with industrial precision directly in the browser. Features multi-body collision with per-body friction and offset controls.

### Extensible Skill Marketplace
A modular ecosystem where professional construction logic is packaged into **Skills**. Includes a `SkillBuilder` API for authoring, a configurable registry for discovery, and community skill validation. From bespoke tailoring to high-performance sportswear, the community can create, share, and evolve the platform's intelligence.

## Features

### Professional 2D Drafting
- Constraint-based geometry engine with Bezier precision.
- **45 professional tools** including segment sewing, topstitch (4 modes), scissors/split, merge, mirror, elastic, and more.
- Advanced notch management (7 types), grainline control, and automated dart manipulation.
- Real-time 2D + 3D split-view with synchronized semantic updates.
- **Linked editing**: Symmetric pattern propagation (instance and mirror modes).
- **Display Bar 2D**: Quick toggles for seam allowance, piece names, line lengths, sewing lines, and render modes.

### Industrial-Grade Simulation
- **32+ Physical Fabric Profiles** — Denim, Silk, Wool, Jersey, Organza, Neoprene, and many more with real-world shear and stretch data.
- **Multi-Body Collision** — Avatar + imported meshes (furniture, mannequins, props) with per-body friction and offset.
- **Parametric Avatar System** — 44 body measurements for hyper-accurate virtual fitting.
- **Simulation Snapshots** — Compare up to 3 draping states (A/B/C) side by side.
- Off-thread Web Worker execution for 60fps simulation on any device.

### Production Engines
- **Seam Allowance**: Intelligent polygon offset with 6 corner types.
- **Nesting**: High-efficiency bin packing for fabric optimization.
- **Grading**: Algorithmic multi-size scaling (XS-XXL) based on industrial grade rules.
- **Formula Engine**: Parametric calculations for measurement-driven patterns.

### 3D Navigation
- 8 camera presets (front, back, left, right, top, bottom, three-quarter left/right).
- Focus-on-piece zoom with automatic framing.

## Interoperability & Ingestion

OpenClo.ai is designed for zero-friction integration with existing professional workflows. Our **Silent Ingestion Layer** automatically elevates legacy formats into intelligent semantic models.

| Format | Status | Role |
|--------|--------|------|
| **DXF (AAMA/ASTM)** | Full (import + export) | Industrial Interop |
| **Seamly2D (.val/.vit)** | Auto-Ingest | Legacy Library Absorption |
| **OBJ/FBX/GLB/GLTF** | Import (collision) + OBJ Export | 3D Mesh Pipeline |
| **PDF** | Export | Physical Production |
| **CLO3D (.zprj)** | Planned | Professional Migration |

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # Cognitive workspace at http://localhost:5180
npx vitest run    # Unit tests
```

## Project Stats

| Metric | Count |
|--------|-------|
| Source files | 461 |
| Test files | 186 |
| Total LOC | ~127,000 |
| Tool definitions | 45 |
| Fabric presets | 32+ |
| Copilot skills | 5 core + community |

## Why OpenClo.ai?

Professional fashion software (CLO3D, Browzwear) is often a closed-source "black box." OpenClo.ai is the open-source alternative that doesn't just digitize lines — it **digitizes fashion intelligence**. We are building a future where design isn't just about drawing, but about collaborating with an agent that understands the physics and anatomy of the fabric as well as you do.

## License

MIT
