# Simulation Mode — CLO-Style Quality Control

**Issue:** #304
**Date:** 2026-03-13

## Problem

The TSL solver loop in `GarmentSimulation.tsx:269` hardcodes `const substeps = 10`. The existing quality presets (preview/standard/production) dispatch Redux state but never reach the solver. Users have no way to control simulation fidelity.

## Solution

Replace the 3-preset system with a CLO3D-style 2-axis control:

1. **Simulation Mode** — `Normal` (5 substeps, fast iteration) or `Complete` (20 substeps, high fidelity)
2. **Particle Distance** — slider (2–20mm), already exists, unchanged

Mode controls **compute intensity** at runtime via `solver.updateConfig({ substeps })`. Particle distance controls **mesh density** (requires re-mesh, not runtime-changeable).

## Architecture

### State

Replace `qualityLevel: 'preview' | 'standard' | 'production'` with `simulationMode: 'normal' | 'complete'` in `simulationSlice.ts`. Keep `particleDistance` as-is.

### Type Rename

`QualityLevel` → `SimulationMode = 'normal' | 'complete'`
`QUALITY_PRESETS` → `SIMULATION_MODES` (2 entries)

### Solver Wiring

```
User toggles mode → dispatch(setSimulationMode('complete'))

GarmentSimulation.tsx (useFrame):
  const substeps = tslSolverRef.current?.config?.substeps ?? 10;
  for (let s = 0; s < substeps; s++) { ... }

On mode change (useEffect):
  solver.updateConfig({ substeps: SIMULATION_MODES[mode].substeps })
```

### Mode Definitions

| Mode | Substeps | Self-Collision | Use Case |
|------|----------|---------------|----------|
| Normal | 5 | false | Fast draping, iteration |
| Complete | 20 | true | Final quality, detail work |

### UI

- **SimulationView.tsx**: Replace 3 preset buttons with 2-button mode toggle
- **SimModeToggle.tsx**: Update color/label references
- **SimulationStatusOverlay.tsx**: Show mode name instead of preset name
- Remove `autoQuality` checkbox (unused)
