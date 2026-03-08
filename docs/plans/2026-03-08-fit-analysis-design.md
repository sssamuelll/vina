# Fit Analysis System — Design Document

> **Issue:** #221 (GitHub)
> **Date:** 2026-03-08
> **Status:** Approved

## Goal

Ship CLO3D-equivalent fit analysis maps (stress, strain, fit, pressure) with professional UI, configurable ranges, copilot observation tools, and E2E tests. Both WASM and CPU solver paths supported from day one.

## Architecture

### Data Pipeline

The XPBD solver already computes positions per frame. Edge data (constraint IDs + rest lengths) is static after mesh setup.

**WASM Solver** — add 3 new `wasm-bindgen` exports to `lib.rs`:
- `stretch_ids_ptr() -> *const i32` — edge index pairs `[a,b, a,b, ...]`
- `stretch_rest_ptr() -> *const f32` — rest lengths per edge
- `num_stretch_edges() -> usize` — edge count

**CPU Solver** — already exposes via `requestEdgeData()` message.

**WASM Worker** — add `getEdgeData` message handler that reads from WASM memory pointers, same response format as CPU worker.

**Per-Frame Flow:**
```
WASM positions_ptr() → Worker postMessage('frame', positions)
→ Main thread: computeFitMapData(mode, positions, edgeDataRef)
→ Update vertex colors on BufferGeometry
```

Edge data is read once after mesh init and cached in `edgeDataRef`. No extra per-frame messages.

### Existing Computation (`fitMaps.ts`)

Already implemented:
- `computeStressMap()` — E × ε from strain + fabric properties → kPa
- `computeStrainMap()` — currentLength / restLength per edge → %
- `computeFitMap()` — elongation / maxStretchRatio with contact mask → white/yellow/red zones
- `computePressurePoints()` — distance threshold from avatar → binary contact
- `computeFitMapData()` — unified entry point dispatching by mode

Color scales match CLO3D: 8-stop blue→red gradient for stress/strain, 3-zone white/yellow/red for fit, magenta for pressure.

## UI Components

### Fit Map Toolbar Flyout (`FitMapToolbar.tsx`)

Dropdown button in the 3D viewport toolbar:
- Icon button with heat-map glyph, shows active mode label when on
- 5 options: None, Stress, Strain, Fit, Pressure — each with icon + label + color swatch
- Keyboard shortcuts registered in ShortcutRegistry

### Color Legend Overlay (`FitMapLegend.tsx`)

Bottom-left of 3D viewport, visible when a map is active:
- **Stress/Strain**: Horizontal gradient bar (blue→red) with min/max labels and unit
- **Fit**: Three-zone bar — white | yellow | red with "OK", "Tight", "Can't Wear"
- **Pressure**: Dot indicator with count
- **Stats row**: min, max, mean values below the gradient

### Range Config Popover (`FitMapConfig.tsx`)

Click the legend to open:
- Min/max inputs for stress range (default 0–100 kPa)
- Min/max for strain range (default 100–120%)
- Tight/can't-wear thresholds (default 80%/100%)
- Pressure distance slider (default 2mm)
- "Reset to defaults" button

### Shortcuts

Register in `defaults.ts`:
- `view.fitMapStress`, `view.fitMapStrain`, `view.fitMapFit`, `view.fitMapPressure`, `view.fitMapNone`

### Redux State

`simulationSlice` already has `fitMapMode`. Add:
- `fitMapConfig: FitMapConfig` — user-adjustable ranges
- `fitMapStats: FitMapStats | null` — latest computed stats (for copilot reads)

## Copilot Integration

Fit analysis tools are **observation instruments** for the agentic loop. The agent already has action tools (`modifyDimension`, `modifyEdge`). We give it eyes.

### New Meta-Tools (read-only)

**`getFitMapStats`**
- Returns current fit map statistics from live simulation
- Output: `{ mode, min, max, mean, tightPct, cantWearPct, pressurePointCount }`
- Agent uses this to evaluate acceptance criteria

**`getFitMapByPiece`**
- Breaks down stats per pattern piece
- Output: `{ pieces: [{ id, name, maxStress, avgStrain, tightPct, cantWearPct }] }`
- Agent uses this to decide which piece to modify

### Existing Tool (keep as-is)

**`setFitMapMode`** — toggles visualization mode

### Agentic Loop Example

```
User: "Make this garment wearable"
Agent:
  1. setFitMapMode({ mode: 'fit' })
  2. getFitMapStats() → 18% can't-wear, bodice-front worst
  3. getFitMapByPiece() → bodice-front: 34% can't-wear at side seam
  4. modifyDimension({ piece: 'bodice-front', direction: 'widen', amount: 8 })
  5. [waits for simulation to settle]
  6. getFitMapStats() → 3% can't-wear
  7. "Widened bodice-front by 8mm. Can't-wear reduced from 18% to 3%."
```

## E2E Tests (`tests/e2e/fit-maps.spec.ts`)

1. **Toolbar flyout renders and toggles maps** — select Stress → legend appears with kPa; select None → legend disappears
2. **All 4 map modes activate without crash** — cycle stress → strain → fit → pressure → none; no console errors
3. **Legend shows live stats** — activate strain during simulation; min/max/mean are not NaN
4. **Range config popover opens and persists** — change stress max to 200; reopen; value persists
5. **Keyboard shortcuts toggle maps** — press shortcut → legend appears; press none shortcut → disappears
6. **Fit map survives simulation reset** — activate → reset → re-simulate → no crash, stats update

**Not tested in E2E** (unit test territory): exact color values, precise stress numbers.

## Unit Tests

- Extend `fitMaps.test.ts`: validate math for all 4 map types with known inputs
- New: `getFitMapStats` meta-tool returns correct structure
- New: `getFitMapByPiece` breaks down correctly per piece

## File Map

| Layer | Files |
|-------|-------|
| Rust WASM | `crates/xpbd-wasm/src/lib.rs` — 3 new exports |
| WASM Worker | `src/utils/cloth/wasm/wasmSolverWorker.ts` — getEdgeData handler |
| Fit Maps | `src/utils/cloth/fitMaps.ts` — already built |
| UI: Toolbar | New: `src/components/Viewport3D/FitMapToolbar.tsx` |
| UI: Legend | New: `src/components/Viewport3D/FitMapLegend.tsx` |
| UI: Config | New: `src/components/Viewport3D/FitMapConfig.tsx` |
| Shortcuts | `src/shortcuts/defaults.ts` — 5 new entries |
| Redux | `src/store/simulationSlice.ts` — add fitMapConfig + fitMapStats |
| Copilot | New: `src/copilot/reasoning/bridge/meta-tools/fitMapTools.ts` |
| E2E Tests | New: `tests/e2e/fit-maps.spec.ts` |
| Unit Tests | `src/utils/cloth/__tests__/fitMaps.test.ts` |

## Out of Scope (YAGNI)

- 3D measurement tapes (issue #230)
- POM rulers (issue #230)
- Directional warp/weft/shear strain split
- Exportable fit map report (after tech pack #225)
