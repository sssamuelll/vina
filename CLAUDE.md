# Claude Code Project Guide

> OpenClo.ai — The Cognitive Design Engine for Professional Fashion Engineering

## Project Overview

OpenClo.ai is a browser-based garment CAD with AI copilot and real-time XPBD cloth simulation. Built with React, Three.js, and Rust WASM.

## Key Directories

```
src/
├── components/           # React UI components
│   ├── CopilotPanel/    # AI assistant chat interface
│   ├── Toolbar/         # 2D/3D tool buttons
│   └── Viewport/        # 2D canvas and 3D viewer
├── core/                # Semantic garment engine
│   ├── geometry/        # Constraint-based geometry
│   └── pattern/         # Pattern piece operations
├── utils/
│   ├── cloth/           # XPBD cloth simulation
│   │   ├── physicalFabric.ts    # 32 fabric presets
│   │   ├── xpbdSolver.ts        # TypeScript solver (JS fallback)
│   │   └── wasm/                # WASM worker interface
│   └── mesh/            # Meshing utilities
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

1. Define tool in copilot bridge
2. Register in tool registry
3. Add execution handler

## Architecture Notes

- **Solver Selection**: WASM preferred, JS fallback if WASM fails
- **Off-Thread**: Simulation runs in Web Worker
- **Zero-Copy**: WASM memory accessed directly via `positions_ptr()`
- **Edge Types**: 0 = WARP, 1 = WEFT, 2 = SHEAR

## References

- [Cloth Simulation Research](docs/research/cloth-simulation-research.md)
- [Fabric Calibration Guide](docs/research/fabric-calibration-guide.md)
- [Architecture Spec](docs/specs/ARCHITECTURE.md)
