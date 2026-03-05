# OpenClo.ai — Architecture Overview

## What is OpenClo.ai?

OpenClo.ai is a **Cognitive Design Engine** for professional fashion engineering. It transcends traditional CAD by combining a **Semantic Garment Engine**, a **Situated AI Copilot**, and **Deterministic XPBD Physics** into a unified browser-native ecosystem.

**Primary Goal:** To digitize fashion intelligence, moving beyond static 2D drawing into intent-based garment synthesis and 3D validation.

## Technical Stack

| Layer | Technology |
|-------|------------|
| **UI Framework** | React 18 + TypeScript + Vite |
| **State Management** | Redux Toolkit |
| **Semantic Engine** | Graph-based Node/Edge Model (Custom) |
| **2D Viewport** | SVG (Semantic Overlay + PathCommand System) |
| **3D Viewport** | Three.js via React Three Fiber v8 |
| **Physics Engine** | Extended Position Based Dynamics (XPBD) in **Rust (WASM)** |
| **AI Copilot** | Agentic Loop (Provider-Agnostic) with Persistent Memory |
| **Server** | Node.js + Express (Project storage + Copilot Bridge) |

## Core Data Model: The Semantic Graph

Unlike legacy systems that store patterns as isolated loops of coordinates, OpenClo.ai represents a garment as a **Semantic Directed Graph**.

```typescript
OpenCloProject
├── pieces: ProfessionalPatternPiece[]
│   ├── nodes: SemanticNode[]         // Landmarks (e.g., NeckPoint, BustPoint)
│   ├── edges: SemanticEdge[]         // Curves with meaning (e.g., Armhole, Hem)
│   ├── constraints: Constraint[]     // Geometric rules (e.g., EqualLength, Parallel)
│   └── fabric: FabricProfile         // Physical properties (Weight, Stretch, Shear)
├── topology: SeamGraph               // Connections between semantic edges
└── context: GlobalDesignContext      // Durable memory, style history, and intent log
```

### Piece Anatomy
- **SemanticNode**: Every vertex is anchored to an anatomical landmark or a functional geometric control point.
- **SemanticEdge**: Lines are tagged with functional metadata (e.g., `Seam`, `Fold`, `DartEdge`), allowing the AI to understand the *role* of each curve.
- **Geometric Constraints**: A declarative layer ensuring that modifications (by the human or AI) maintain technical feasibility (e.g., a sleeve cap length must match the armhole length).

## Module Map

```
src/
├── copilot/           # Situated AI Agency
│   ├── brain/         # Cognitive logic, Intent Prediction, Adaptive Learning
│   ├── context/       # Semantic context builders and Durable Memory
│   └── tools/         # 42+ tools for graph manipulation and synthesis
├── engine/            # The Semantic Core
│   ├── solver/        # Constraint resolution and geometric validation
│   ├── semantics/     # Anatomical landmark mapping and graph logic
│   └── ingestion/     # Silent Ingestion Layer (Legacy format translation)
├── components/        # UI Layers
│   ├── Viewport2D/    # Interactive SVG view with semantic ghosting
│   ├── Viewport3D/    # R3F-based viewport with XPBD simulation
│   │   ├── CollisionBodyMesh.tsx   # Imported collision objects with gizmo
│   │   └── CollisionBodyPanel.tsx  # Collision body management UI
│   └── Workspace/     # Synchronized 2D/3D state management
├── types/             # Shared TypeScript interfaces
│   └── collisionBody.ts  # CollisionBody type (transform, collision, animation)
├── utils/             # Industrial utilities
│   ├── cloth/         # XPBD solver, triangle collision, multi-body worker protocol
│   ├── import/        # Mesh import (OBJ/FBX/GLB/GLTF)
│   └── export/        # Professional DXF/PDF/OBJ generation
└── store/             # Reactive project state (Redux Toolkit)
    └── collisionBodySlice.ts  # Multi-body collision state management
```

## Key Architectural Decisions

1.  **Semantic-First Representation**: Geometry is a projection of the semantic graph. This allows the AI to "think" in terms of tailoring rules rather than coordinate manipulation.
2.  **Deterministic Physics (Rust/WASM)**: By moving the XPBD solver to Rust, we achieve sub-millisecond physics updates in the browser, enabling "Instant Drape" feedback during drafting.
3.  **Silent Ingestion Layer**: Compatibility with formats like Seamly2D or DXF is handled as a background "Hydration Service." Legacy data is imported and automatically upgraded to our semantic model using AI-driven heuristics.
4.  **Durable Agent Memory**: The Copilot's "Brain" is decoupled from the project. It persists across sessions, learning the user's aesthetic and technical standards (e.g., "always use 1cm seam allowance for jersey").
5.  **Agent-Agnostic Protocol**: The communication between the UI and the AI uses a strict JSON-RPC protocol, allowing OpenClo.ai to work with any LLM (Claude, GPT-4, or local Llama3 via Ollama).
