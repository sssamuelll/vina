# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)
[![codecov](https://codecov.io/gh/sssamuelll/openclo/graph/badge.svg)](https://codecov.io/gh/sssamuelll/openclo)

**The Cognitive Design Engine for Professional Fashion Engineering.**

> **Status (March 10, 2026):** Currently in **v0.7.0 "Precision & Professional Tools"**. We have successfully shipped Linked Editing, Agentic Copilot Loops, and Deterministic Geometry. Current focus: **BVH-Accelerated Collisions** and **2D-3D Live Link**. See our [Roadmap](ROADMAP.md).

OpenClo.ai is a high-performance, browser-based ecosystem that transcends traditional CAD. It combines a **Semantic Garment Engine** with an autonomous **Situated AI Copilot** and **Deterministic XPBD Physics** to provide a professional-grade environment for garment construction, grading, and 3D validation.

**[Launch Workspace](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

## 🚀 Recent Milestones (v0.7.0)
- **Agentic Copilot Loop**: Fully autonomous design iterations with meta-tool introspection.
- **Linked Editing**: Symmetric pattern propagation with real-time partner sync.
- **SkillBuilder API**: Modular skill authoring for community-driven fashion intelligence.
- **Geometry Stability**: Deterministic edge-name referencing for stable production pipelines.

## Core Pillars

### Semantic Garment Engine
Unlike legacy tools that treat patterns as static vectors, OpenClo.ai operates on a **Semantic Graph**. Every node and edge carries anatomical meaning (e.g., *ArmholeCurve*, *ShoulderSeam*), allowing the engine to maintain structural integrity and sewing compatibility automatically during complex transformations.

### Situated AI Agency
Our Copilot is a **Situated Fashion Agent** powered by a unified **Agentic Loop** architecture:
- **Semantic Pattern Recognition**: Understands garment anatomy as deeply as a master tailor.
- **Durable Design Memory**: Learns your aesthetic preferences, fit standards, and style history.
- **Agentic Loop**: Unified tool-use loop with meta-tools (read-only) and action tools (mutations), LLM-driven iteration until completion.

### Deterministic XPBD Physics
Powered by a high-speed **Rust-based engine (WASM)**, OpenClo.ai provides real-time, physically accurate 3D draping.
- **XPBD Solver**: Stable, deterministic simulation even under extreme stress.
- **Universal Collision**: Any imported mesh (GLB/OBJ) acts as a physical body with custom friction and offset control.

### Extensible Skill Marketplace
A modular ecosystem where professional construction logic is packaged into **Skills**. Includes a `SkillBuilder` API for authoring, a configurable registry for discovery, and community skill validation.

## Features

### Professional 2D Drafting
- **45 professional tools** including segment sewing, topstitch (4 modes), scissors/split, merge, mirror, and elastic.
- Advanced notch management (7 types), grainline control, and automated dart manipulation.
- **Linked editing**: Symmetric pattern propagation (instance and mirror modes).
- **Display Bar 2D**: Quick toggles for seam allowance, piece names, line lengths, and sewing lines.

### Industrial-Grade Simulation
- **32+ Physical Fabric Profiles** — Denim, Silk, Wool, Jersey, etc., with real-world shear/stretch data.
- **Simulation Snapshots**: Compare up to 3 draping states (A/B/C) side by side for fit analysis.
- **Multi-Body Collision**: Avatar + imported meshes with per-body friction and offset controls.

### Production Engines
- **Seam Allowance**: Intelligent polygon offset with 6 corner types.
- **Nesting**: High-efficiency bin packing for fabric optimization.
- **Grading**: Algorithmic multi-size scaling (XS-XXL) based on industrial grade rules.

## Interoperability

| Format | Status | Role |
|--------|--------|------|
| **DXF (AAMA/ASTM)** | Full (High-Fidelity) | Industrial Interop with spline support |
| **Seamly2D (.val/.vit)** | Auto-Ingest | Legacy Library Absorption |
| **OBJ/FBX/GLB/GLTF** | Full Support | 3D Mesh & Animation Pipeline |
| **PDF** | Export | Physical Production |

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # Workspace at http://localhost:5180
npx vitest run    # Run tests
```

## Project Stats

| Metric | Count |
|--------|-------|
| TypeScript Files | 461 |
| Unit/E2E Tests | 186+ |
| Total LOC | ~127,000 |
| Development Days | 20 |

---
**OpenClo.ai** — Digitizing Fashion Intelligence. MIT Licensed.
