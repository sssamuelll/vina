# OpenClo — Architecture Overview

> Current as of v0.11.0. Intentionally high-level; the code is the source of truth, and the ratified RFCs in [`docs/reports/`](../reports/) govern closed areas.

## What is OpenClo.ai?

OpenClo.ai is a **Cognitive Design Engine** for professional fashion engineering. It transcends traditional CAD by combining a **Semantic Garment Engine**, a **Situated AI Copilot**, and **Deterministic XPBD Physics** into a unified browser-native ecosystem.

**Primary Goal:** To digitize fashion intelligence, moving beyond static 2D drawing into intent-based garment synthesis and 3D validation.

## Technical Stack

| Layer | Technology |
|-------|------------|
| **UI Framework** | React 18 + TypeScript (strict) + Vite 6 |
| **State Management** | Redux Toolkit + Zustand |
| **Semantic Engine** | Graph-based Node/Edge Model with deterministic edge IDs |
| **2D Viewport** | SVG (Semantic Overlay + PathCommand System) |
| **3D Viewport** | Three.js (WebGPU renderer, `^0.184`) via React Three Fiber |
| **Physics Engine** | XPBD cloth, 4-tier cascade: **WebGPU/TSL (default)** → Rust/WASM (fallback + CI parity oracle) → CPU (reference) → Neural (experimental) |
| **AI Copilot** | Unified Agentic Loop (Provider-Agnostic) with Persistent Memory |
| **Server** | Node.js + Express (Project storage + Copilot Bridge) |
| **Testing** | Vitest (unit) + Playwright (E2E) |

## Core Data Model: The Semantic Graph

Unlike legacy systems that store patterns as isolated loops of coordinates, OpenClo.ai represents a garment as a **Semantic Directed Graph**.

```typescript
OpenCloProject
├── pieces: ProfessionalPatternPiece[]
│   ├── nodes: SemanticNode[]         // Landmarks (e.g., NeckPoint, BustPoint)
│   ├── edges: SemanticEdge[]         // Curves with meaning (e.g., Armhole, Hem)
│   │   └── id: "pieceId:edgeName"    // Deterministic, stable references
│   ├── constraints: Constraint[]     // Geometric rules (e.g., EqualLength, Parallel)
│   ├── fabric: FabricProfile         // Physical properties (Weight, Stretch, Shear)
│   ├── linkedPieceId?: string        // Partner piece for linked editing
│   └── linkMode?: 'instance' | 'symmetry'  // Link propagation mode
├── topology: SeamGraph               // Edge-name based seam connections
└── context: GlobalDesignContext      // Durable memory, style history, and intent log
```

### Piece Anatomy
- **SemanticNode**: Every vertex is anchored to an anatomical landmark or a functional geometric control point.
- **SemanticEdge**: Lines are tagged with functional metadata (e.g., `Seam`, `Fold`, `DartEdge`), with deterministic `pieceId:name` IDs for stable cross-system references.
- **Geometric Constraints**: A declarative layer ensuring that modifications maintain technical feasibility.

## Module Map

```
src/
├── copilot/               # Situated AI Agency
│   ├── reasoning/bridge/  # AgenticLoop — unified tool-use orchestration
│   │   ├── AgenticLoop.ts     # Main LLM-driven iteration loop
│   │   ├── meta-tools/        # Read-only introspection tools
│   │   └── domainBootstrap.ts # Domain context initialization
│   ├── action/tools/      # Copilot tool definitions (schema + execute handler)
│   ├── action/skills/     # Skill system (SkillBuilder, registry)
│   ├── knowledge/         # RAG knowledge base
│   ├── memory/            # Durable design memory (cross-session)
│   ├── providers/         # LLM providers (Anthropic, OpenAI, Ollama)
│   └── hooks/             # React integration (useBridge)
├── components/            # UI Layers
│   ├── PatternEditor/     # 2D SVG canvas with tool hooks
│   │   └── renderers/     # Overlays (topstitch, etc.)
│   ├── Viewport3D/        # R3F viewport with XPBD simulation
│   │   ├── CollisionBodyMesh.tsx   # Imported collision objects with gizmo
│   │   ├── CollisionBodyPanel.tsx  # Collision body management UI
│   │   └── SnapshotBar.tsx         # A/B/C drape comparison
│   ├── DisplayBar2D/      # 2D context toolbar
│   ├── shell/             # AppShell + UnifiedBar (chat/commands/settings) + TopBar + LeftDock/RightDock (DockShell — 2D & 3D side docks) + ContextPanel
│   ├── Toolbar2D/         # 2D tool palette
│   ├── Toolbar3D/         # 3D tool palette
│   └── Workspace/         # Synchronized 2D/3D state management
├── types/                 # Shared TypeScript interfaces
│   └── collisionBody.ts   # CollisionBody type (transform, collision, animation)
├── utils/                 # Industrial utilities
│   ├── cloth/             # XPBD solver, triangle collision, 32+ fabrics
│   ├── dxf/               # DXF parser, converter, AAMA export
│   ├── geometry/          # Geometry extraction + optimization utilities
│   ├── import/            # Mesh import (OBJ/FBX/GLB/GLTF)
│   ├── export/            # Professional DXF/PDF/OBJ generation
│   ├── grading/           # Multi-size scaling engine
│   ├── nesting/           # Bin packing layout engine
│   ├── seam/              # Seam allowance engine
│   ├── autoSew/           # Automatic seam generation with edge-name refs
│   └── semanticEdit/      # Semantic edit utilities
├── store/                 # Reactive project state (Redux Toolkit)
│   ├── collisionBodySlice.ts        # Multi-body collision state
│   ├── simulationSlice.ts           # Simulation + snapshots
│   ├── cameraSlice.ts               # 3D camera presets
│   ├── linkedEditingMiddleware.ts   # Symmetric pattern propagation
│   └── editorSlice.ts               # 2D display toggles + tool state
└── workers/               # Web Workers
    └── wasmSolverWorker.ts  # WASM + CPU fallback solver
```

## Key Architectural Decisions

1. **Semantic-First Representation**: Geometry is a projection of the semantic graph. This allows the AI to "think" in terms of tailoring rules rather than coordinate manipulation.
2. **Four-tier cloth solver with parity**: The XPBD simulation runs on a WebGPU/TSL tier by default and cascades to Rust/WASM (also the deterministic CI parity oracle), a CPU reference, and an experimental neural tier. Cross-tier equivalence is locked by a boundary-contract test suite (see `docs/reports/2026-05-10-rfc-746-cloth-solver-boundary-contracts.md`).
3. **Stable Edge References**: All seam connections use `pieceId:edgeName` identifiers instead of fragile index-based references, ensuring stability across edits.
4. **Unified Agentic Loop**: The copilot uses a single `AgenticLoop` that drives LLM tool-use iteration with meta-tools (read-only) and action tools (mutations), replacing the earlier Planner/Executor/Reasoner triad.
5. **DXF-first import**: The primary import path is DXF/AAMA — the format professional CAD tools (CLO3D, Gerber, Optitex) export. Imported geometry is hydrated into the semantic model: pieces, edges, notches, and grainlines are detected from the flat file. Seamly2D import remains as a deprecated legacy path.
6. **Durable Agent Memory**: The Copilot's memory is decoupled from the project. It persists across sessions, learning the user's aesthetic and technical standards.
7. **Agent-Agnostic Protocol**: The communication between the UI and the AI uses a strict JSON-RPC protocol, allowing OpenClo.ai to work with any LLM (Claude, GPT-4, or local Llama3 via Ollama).
8. **Linked Editing Middleware**: Redux middleware intercepts pattern mutations and propagates changes to linked partner pieces (instance cloning or symmetric mirroring).
