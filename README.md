# OpenClo.ai

[![Build](https://img.shields.io/github/actions/workflow/status/sssamuelll/openclo/deploy.yml?branch=main)](https://github.com/sssamuelll/openclo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-997%20unit%20%2B%20133%20E2E-brightgreen)](src/)
[![codecov](https://codecov.io/gh/sssamuelll/openclo/graph/badge.svg)](https://codecov.io/gh/sssamuelll/openclo)

**The Cognitive Design Engine for Professional Fashion Engineering.**

OpenClo.ai is a high-performance, browser-based ecosystem that transcends traditional CAD. It combines a **Semantic Garment Engine** with an autonomous **AI Copilot** and **Deterministic XPBD Physics** to provide a professional-grade environment for garment construction, grading, and 3D validation.

**[Launch Workspace →](https://openclo.sdar.dev)**

![OpenClo.ai Interface](docs/screenshots/editor.png)

## Core Pillars

### 🧠 Semantic Garment Engine
Unlike legacy tools that treat patterns as static vectors, OpenClo.ai operates on a **Semantic Graph**. Every node and edge carries anatomical meaning (e.g., *ArmholeCurve*, *ShoulderSeam*), allowing the engine to maintain structural integrity and sewing compatibility automatically during complex transformations.

### 🤖 Situated AI Agency
Our Copilot isn't just a chat interface; it's a **Situated Fashion Agent** with:
- **Semantic Pattern Recognition**: It understands garment anatomy as deeply as a master tailor.
- **Durable Design Memory**: It learns your specific aesthetic preferences, fit standards, and style history across sessions.
- **Intent-Based Synthesis**: Generate production-ready patterns from natural language intent, not just rigid templates.

### ⚡ Deterministic XPBD Physics
Powered by a high-speed **Rust-based engine (WASM)**, OpenClo.ai provides real-time, physically accurate 3D draping. Validate fit, tension, and drape with industrial precision directly in the browser.

### 🔌 Extensible Skill Marketplace
A modular ecosystem where professional construction logic is packaged into **Skills**. From bespoke tailoring to high-performance sportswear, the community can create, share, and evolve the "intelligence" of the platform.

## Features

### 🖊️ Professional 2D Drafting
- Constraint-based geometry engine with Bézier precision.
- Advanced notch management (7 types), grainline control, and automated dart manipulation.
- Real-time 2D + 3D split-view with synchronized semantic updates.

### 🧵 Industrial-Grade Simulation
- **10+ Physical Fabric Profiles** — Denim, Silk, Wool, etc., with real-world shear and stretch data.
- **Parametric Avatar System** — 44 body measurements for hyper-accurate virtual fitting.
- Off-thread Web Worker execution for 60fps simulation on any device.

### ⚙️ Production Engines
- **Seam Allowance**: Intelligent polygon offset with 6 corner types.
- **Nesting**: High-efficiency bin packing for fabric optimization.
- **Grading**: Algorithmic multi-size scaling (XS–XXL) based on industrial grade rules.

## Interoperability & Ingestion

OpenClo.ai is designed for zero-friction integration with existing professional workflows. Our **Silent Ingestion Layer** automatically elevates legacy formats into intelligent semantic models.

| Format | Status | Role |
|--------|--------|------|
| **DXF (AAMA/ASTM)** | ✅ Full | Industrial Interop |
| **Seamly2D (.val/.vit)** | ✅ Auto-Ingest | Legacy Library Absorption |
| **PDF/OBJ** | ✅ Export | Physical/Digital Production |
| **CLO3D (.zprj)** | 🔜 Planned | Professional Migration |

## Quick Start

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev       # Cognitive workspace at http://localhost:5180
npx vitest run    # 997 unit tests
```

## Why OpenClo.ai?

Professional fashion software (CLO3D, Browzwear) is often a closed-source "black box." OpenClo.ai is the open-source alternative that doesn't just digitize lines—it **digitizes fashion intelligence**. We are building a future where design isn't just about drawing, but about collaborating with an agent that understands the physics and anatomy of the fabric as well as you do.
