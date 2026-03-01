# Status Bar Enhancement Design (#160)

## Overview

Enhance the StatusBar component to display real-time simulation metrics including solver health, particle count, frame time, and body collision status.

## Current State

The StatusBar currently shows:
- Ready status
- Piece count
- Active tool
- Seam allowance
- Units (mm)
- Zoom level
- Grid status

## Design

### Data Source

All required data already exists in `simulationSlice`:

| Field | Type | Description |
|-------|------|-------------|
| `solverTier` | `'none' \| 'webgpu' \| 'wasm' \| 'cpu-worker' \| 'neural-drape'` | Active solver |
| `frameTimeMs` | `number` | Rolling average frame time |
| `particleCount` | `number` | Active particle count |
| `bodyCollision` | `boolean` | SDF collision enabled |
| `simulationState` | `'idle' \| 'running' \| 'paused'` | Simulation lifecycle |

### New Status Items

Added to the right side of the status bar:

| Item | Format | Condition |
|------|--------|-----------|
| Solver tier | `Wasm ●` / `GPU ●` / `CPU ●` | Always when not 'none' |
| Particle count | `12.4k` | When > 0 |
| Frame time | `16.2ms` | When simulating |
| Body collision | `SDF ✓` | When enabled |

### Visual Indicators

Frame time health indicator (colored dot):
- Green (`#3794ff`): < 33ms (30+ fps)
- Yellow (`#cca700`): 33-100ms (10-30 fps)
- Red (`#f14c4c`): > 100ms (< 10 fps)

### Layout

```
[Ready] | [Pieces: 3] | [Select (V)]    [Wasm ●] | [12.4k] | [16.2ms] | [SDF ✓] | [SA: 10mm] | [mm] | [100%] | [Grid: On]
```

## Implementation

### Files to Modify

1. `src/components/StatusBar/StatusBar.tsx` — Add simulation selectors and render new items
2. `src/components/StatusBar/StatusBar.css` — Add status dot/indicator styles

### Code Changes

**StatusBar.tsx:**
```tsx
// Add to imports
const { solverTier, frameTimeMs, particleCount, bodyCollision, simulationState } =
  useSelector((s: RootState) => s.simulation);

// Helper to format particle count
const formatCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);

// Solver label mapping
const solverLabels: Record<string, string> = {
  'webgpu': 'GPU',
  'wasm': 'Wasm',
  'cpu-worker': 'CPU',
  'neural-drape': 'Neural',
};
```

**StatusBar.css:**
```css
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
}
.status-dot.healthy { background: #3794ff; }
.status-dot.warning { background: #cca700; }
.status-dot.critical { background: #f14c4c; }
```

## Success Criteria

1. Solver tier visible when simulation active
2. Particle count in compact format (1.2k)
3. Frame time with color-coded health
4. SDF status when body collision enabled
5. All items use existing CSS variable system

## References

- Issue: #160
- Spec: [UI-VSCODE-ARCHITECTURE.md](../specs/UI-VSCODE-ARCHITECTURE.md)
