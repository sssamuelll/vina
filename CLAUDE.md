# Claude Code Project Guide

> OpenClo.ai — The Cognitive Design Engine for Professional Fashion Engineering

## Project Overview

OpenClo.ai is a browser-based garment CAD with AI copilot and real-time XPBD cloth simulation. Built with React, Three.js, and Rust WASM.

## Key Directories

```
src/
├── components/           # React UI components
│   ├── CopilotPanel/    # AI assistant chat interface
│   │   └── ProgressMessage/  # Bridge execution progress UI
│   ├── Toolbar/         # 2D/3D tool buttons
│   └── Viewport/        # 2D canvas and 3D viewer
├── copilot/             # AI copilot system
│   ├── bridge/          # Planner + Executor + Reasoner architecture
│   │   ├── types.ts           # Step, ExecutionPlan, StepResult, etc.
│   │   ├── Planner.ts         # LLM planning (JSON output)
│   │   ├── Executor.ts        # Step execution (no LLM)
│   │   ├── Reasoner.ts        # Error recovery (LLM on failure)
│   │   ├── ResultStore.ts     # Result accumulation + variable resolution
│   │   ├── SummaryGenerator.ts # Template-based summaries
│   │   └── ExecutionBridge.ts # Main orchestrator
│   ├── hooks/           # React integration
│   │   └── useBridge.ts       # Bridge state management hook
│   ├── tools/           # Copilot tool definitions
│   └── features.ts      # Feature flags (bridge mode)
├── core/                # Semantic garment engine
│   ├── geometry/        # Constraint-based geometry
│   └── pattern/         # Pattern piece operations
├── types/
│   └── collisionBody.ts  # CollisionBody interface
├── utils/
│   ├── cloth/           # XPBD cloth simulation
│   │   ├── physicalFabric.ts    # 32 fabric presets
│   │   ├── xpbdSolver.ts        # TypeScript solver (JS fallback)
│   │   ├── triangleCollision.ts # Triangle mesh collision solver
│   │   ├── collisionMesh.ts     # CollisionMeshData + extraction helpers
│   │   └── wasm/                # WASM worker interface
│   ├── import/          # Mesh import (OBJ/FBX/GLB/GLTF)
│   └── mesh/            # Meshing utilities
├── workers/             # Web Worker pool for reactive solver
├── store/               # Redux slices + middleware
│   └── reactiveSolverMiddleware.ts  # Parametric rebuild pipeline
└── stores/              # Zustand state management

crates/
└── xpbd-wasm/           # Rust WASM cloth solver
    └── src/lib.rs       # Core physics implementation

public/
└── wasm/                # Compiled WASM binaries
    ├── xpbd_wasm.js     # JS bindings (must sync with Rust)
    └── xpbd_wasm_bg.wasm
```

## Cloth Simulation Parameters

### ClothSimConfig

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `substeps` | number | 15 | XPBD solver iterations per frame |
| `damping` | number | 0.99 | Global velocity damping |
| `gravityY` | number | -9.81 | Gravity acceleration |
| `dragCoefficient` | number | 1.0 | Air resistance (0-2) |
| `stretchComplianceWarp` | number | 0.0 | Stretch along grain (0 = stiff) |
| `stretchComplianceWeft` | number | 0.0 | Stretch across grain |
| `stretchComplianceShear` | number | 0.001 | Diagonal stretch |
| `bendComplianceWarp` | number | 1.0 | Bend along grain |
| `bendComplianceWeft` | number | 1.0 | Bend across grain |
| `internalDamping` | number | 0.3 | Per-fabric damping (0 = fluid, 1 = heavy) |
| `selfCollision` | boolean | false | Enable self-collision |
| `thickness` | number | 0.002 | Cloth thickness (meters) |

### PhysicalFabric Properties

Each fabric in `physicalFabric.ts` has:

- **Stretch**: `stretchWarp`, `stretchWeft`, `stretchBias` (% elongation)
- **Bending**: `bendingWarp`, `bendingWeft` (mN·cm rigidity)
- **Damping**: `internalDamping` (0.0-1.0)
- **Surface**: `friction`, `frictionBody`, `surfaceRoughness`
- **Strength**: `tensileStrengthWarp/Weft`, `tearStrength`

## WASM Sync Requirement

When modifying `crates/xpbd-wasm/src/lib.rs`:

```bash
cd crates/xpbd-wasm
wasm-pack build --target web --out-dir pkg

# CRITICAL: Copy BOTH files to public/wasm/
cp pkg/xpbd_wasm.js public/wasm/
cp pkg/xpbd_wasm_bg.wasm public/wasm/
```

If only `.wasm` is copied, the worker falls back to CPU solver.

## Testing

```bash
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npx tsc --noEmit      # Type check
```

## Common Tasks

### Add New Fabric Preset

1. Edit `src/utils/cloth/physicalFabric.ts`
2. Add to `PHYSICAL_FABRIC_LIBRARY` array
3. Set realistic values based on textile properties

### Modify Cloth Physics

1. **Rust solver**: `crates/xpbd-wasm/src/lib.rs`
2. **JS fallback**: `src/utils/cloth/xpbdSolver.ts`
3. **Worker interface**: `src/utils/cloth/wasm/wasmSolverWorker.ts`
4. Rebuild WASM and copy both files

### Add Copilot Tool

1. Define tool schema in `src/copilot/tools/`
2. Register in tool registry with `registerTool()`
3. Implement execute handler returning `ToolResult`
4. Add optional rollback function for reversible operations

```typescript
// Example tool with rollback support
const result: ToolResult = {
  success: true,
  data: { /* result data */ },
  rollback: () => dispatch(restorePreviousState(snapshot))
};
```

## Copilot Bridge Architecture

The copilot uses a **Planner + Executor + Reasoner** pattern to minimize hallucination and ensure reliable execution.

### Flow

```
User Request → Planner (LLM) → Executor (no LLM) → Summary
                                    ↓ (on error)
                               Reasoner (LLM)
```

### Components

| Component | LLM? | Purpose |
|-----------|------|---------|
| **Planner** | Yes | Generates JSON execution plan |
| **Executor** | No | Runs steps, collects results |
| **Reasoner** | Yes | Handles errors (retry/ask/abort) |
| **SummaryGenerator** | No | Template-based output |

### Step Types

- **ExecuteStep**: Runs a tool directly, no LLM involvement
- **EvaluateStep**: LLM interprets results (e.g., "Is fit acceptable?")

### Variable References

Steps can reference previous results with `$stepId.field` syntax:

```json
{
  "type": "execute",
  "tool": "modifyEdge",
  "params": { "targetLength": "$measure1.result.length" }
}
```

### Enabling Bridge Mode

```javascript
localStorage.setItem('openclo-use-bridge', 'true');
```

### Key Files

- `src/copilot/bridge/ExecutionBridge.ts` - Main orchestrator
- `src/copilot/hooks/useBridge.ts` - React integration
- `src/copilot/features.ts` - Feature flags
- `docs/plans/2026-03-02-copilot-bridge-architecture-design.md` - Full design doc

## Collision Bodies

Any 3D mesh (OBJ/FBX/GLB/GLTF) can be imported as a collision body alongside the avatar.

### CollisionBody Redux Slice (`src/store/collisionBodySlice.ts`)

State: `{ bodies: CollisionBody[], selectedBodyId: string | null }`

Key actions: `addCollisionBody`, `removeCollisionBody`, `updateCollisionBodyTransform`, `updateCollisionBodyCollision`, `selectCollisionBody`, `setAnimationState`

### Multi-Body Collision Architecture

- Avatar collision mesh is entry `__avatar__` in the collision body array
- Each body gets its own `TriangleSpatialHash` for spatial queries
- Solver iterates all bodies per particle: `for (body of collisionBodies) { solveTriangleCollision(...) }`
- Per-body `friction` (0-1) and `margin`/offset (meters)

### Worker Messages

Both WASM and CPU workers support:
- `setCollisionBodies` — replace entire array
- `updateCollisionBody` — add/update single body by id
- `removeCollisionBody` — remove by id
- `setCollisionMesh` — backward-compatible (wraps as `__avatar__`)

### Key Files

- `src/types/collisionBody.ts` — CollisionBody interface
- `src/store/collisionBodySlice.ts` — Redux CRUD + selection
- `src/components/Viewport3D/CollisionBodyMesh.tsx` — R3F mesh + TransformControls gizmo + animation
- `src/components/Viewport3D/CollisionBodyPanel.tsx` — UI panel (import, friction/offset sliders)
- `src/utils/cloth/triangleCollision.ts` — `solveTriangleCollision` with friction param
- `src/utils/cloth/collisionMesh.ts` — `CollisionMeshData` + `collisionMeshFromBuffers` helper

## Reactive Solver Middleware

Automatically rebuilds pattern pieces when measurements or variables change. Two-phase pipeline with worker pool support.

### Flow

```
Trigger Action → Phase 1: Resolve Points (sync, < 16ms)
               → Phase 2: Build Pieces (debounced, main thread or worker pool)
```

### Trigger Actions

- `project/updateMeasurements` — body measurements changed
- `construction/setVariable` — construction variable changed
- `parametric/setVariableOverride` — slider moved
- `parametric/setVariableOverrides` — batch variable update
- `parametric/activateTemplate` — new template loaded

### Key Concepts

- **Generation tracking**: Each trigger increments `generationId`. Stale work is cancelled.
- **Adaptive debounce**: 50–400ms based on median of recent compute times.
- **Priority scheduling**: Selected piece builds first, then visible, then off-screen.
- **Main thread fallback**: Datasets under 50 points skip workers entirely.
- **Piece identity**: `pieceIdentityMap` in constructionSlice maps construction piece IDs to pattern piece IDs, enabling upsert behavior across rebuilds.

### API

```typescript
import {
  createReactiveSolverMiddleware, // Middleware factory
  getSolverMetrics,               // { totalResolves, computeTimes, cancelledJobs, errors }
  getSolverState,                 // { generationId, poolReady, pendingJobs, debounceMs }
  subscribeToComputingState,      // listener(isComputing: boolean) → unsubscribe
  getIsComputing,                 // Current computing state
  warmupSolver,                   // Pre-initialize worker pool
  shutdownSolver,                 // Cleanup pool + timers
} from './store/reactiveSolverMiddleware';
```

### Key Files

- `src/store/reactiveSolverMiddleware.ts` — Middleware implementation
- `src/types/reactiveSolver.ts` — Types (jobs, results, strategies, metrics)
- `src/workers/workerPool.ts` — Web Worker pool with priority queue
- `src/workers/workerProtocol.ts` — Serialization + transfer strategy
- `src/store/__tests__/reactiveSolverMiddleware.test.ts` — Integration tests

## Architecture Notes

- **Solver Selection**: WASM preferred, JS fallback if WASM fails
- **Off-Thread**: Simulation runs in Web Worker
- **Zero-Copy**: WASM memory accessed directly via `positions_ptr()`
- **Edge Types**: 0 = WARP, 1 = WEFT, 2 = SHEAR

## References

- [Cloth Simulation Research](docs/research/cloth-simulation-research.md)
- [Fabric Calibration Guide](docs/research/fabric-calibration-guide.md)
- [Copilot Bridge Architecture](docs/plans/2026-03-02-copilot-bridge-architecture-design.md)
- [Architecture Spec](docs/specs/ARCHITECTURE.md)
- [Reactive Solver Middleware Design](docs/plans/2026-02-27-reactive-solver-middleware-design.md)
