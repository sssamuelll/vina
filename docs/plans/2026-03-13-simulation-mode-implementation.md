# Simulation Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 3-preset quality system with CLO-style 2-mode (Normal/Complete) + particle distance slider, and fix hardcoded substeps.

**Architecture:** Rename `QualityLevel` → `SimulationMode`, update presets to 2 modes, wire substeps through `solver.updateConfig()`, fix hardcoded loop in GarmentSimulation.tsx.

**Tech Stack:** Redux Toolkit, React, Three.js TSL, Vitest

---

### Task 1: Update Quality Presets Module

**Files:**
- Modify: `src/utils/cloth/gpu/qualityPresets.ts`
- Modify: `src/utils/cloth/gpu/index.ts`

**Step 1: Update `qualityPresets.ts`**

Replace `QualityLevel` type and `QUALITY_PRESETS` record:

```typescript
export type SimulationMode = 'normal' | 'complete';

export interface QualityPreset {
  label: string;
  particleDistance: number;
  substeps: number;
  selfCollision: boolean;
  collisionResolution: number;
  bendingEnabled: boolean;
  targetFPS: number;
}

export const SIMULATION_MODES: Record<SimulationMode, QualityPreset> = {
  normal: {
    label: 'Normal',
    particleDistance: 5,
    substeps: 5,
    selfCollision: false,
    collisionResolution: 32,
    bendingEnabled: true,
    targetFPS: 60,
  },
  complete: {
    label: 'Complete',
    particleDistance: 3,
    substeps: 20,
    selfCollision: true,
    collisionResolution: 128,
    bendingEnabled: true,
    targetFPS: 30,
  },
};
```

Keep `QUALITY_PRESETS` as a deprecated alias:
```typescript
/** @deprecated Use SIMULATION_MODES */
export const QUALITY_PRESETS = SIMULATION_MODES;
/** @deprecated Use SimulationMode */
export type QualityLevel = SimulationMode;
```

Update `autoSelectQuality` to work with 2 modes:
```typescript
export function autoSelectQuality(currentFps: number, currentLevel: SimulationMode): SimulationMode {
  const target = SIMULATION_MODES[currentLevel].targetFPS;
  if (currentLevel === 'complete' && currentFps < target * 0.7) return 'normal';
  if (currentLevel === 'normal' && currentFps > target * 1.5) return 'complete';
  return currentLevel;
}
```

Update `presetToSolverConfig`:
```typescript
export function presetToSolverConfig(preset: QualityPreset): Partial<GpuSolverConfig> {
  return {
    substeps: preset.substeps,
    selfCollision: preset.selfCollision,
    bendCompliance: preset.bendingEnabled ? 0.01 : 1000,
  };
}
```

**Step 2: Update `src/utils/cloth/gpu/index.ts`**

Add `SimulationMode` to exports, keep `QualityLevel` export for backward compat:
```typescript
export type { SimulationMode, QualityLevel, QualityPreset, BenchmarkResult } from './qualityPresets';
export { SIMULATION_MODES, QUALITY_PRESETS, ... } from './qualityPresets';
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -30`

**Step 4: Commit**

```bash
git add src/utils/cloth/gpu/qualityPresets.ts src/utils/cloth/gpu/index.ts
git commit -m "refactor(gpu): replace 3 quality presets with 2 simulation modes (#304)"
```

---

### Task 2: Update Redux State

**Files:**
- Modify: `src/store/simulationSlice.ts`
- Create: `src/store/__tests__/simulationSlice.mode.test.ts`

**Step 1: Write the failing test**

Create `src/store/__tests__/simulationSlice.mode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  setSimulationMode,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('simulationMode state', () => {
  it('defaults to normal', () => {
    const store = createStore();
    expect(store.getState().simulation.simulationMode).toBe('normal');
  });

  it('setSimulationMode changes mode to complete', () => {
    const store = createStore();
    store.dispatch(setSimulationMode('complete'));
    expect(store.getState().simulation.simulationMode).toBe('complete');
  });

  it('setSimulationMode changes mode back to normal', () => {
    const store = createStore();
    store.dispatch(setSimulationMode('complete'));
    store.dispatch(setSimulationMode('normal'));
    expect(store.getState().simulation.simulationMode).toBe('normal');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/simulationSlice.mode.test.ts`
Expected: FAIL — `setSimulationMode` not exported

**Step 3: Implement**

In `src/store/simulationSlice.ts`:

1. Import `SimulationMode` from qualityPresets:
```typescript
import { type SimulationMode } from '../utils/cloth/gpu/qualityPresets';
```

2. Replace `qualityLevel` state field:
```typescript
// Replace: qualityLevel: QualityLevel;
simulationMode: SimulationMode;
```

3. Replace in `initialState`:
```typescript
// Replace: qualityLevel: 'standard' as QualityLevel,
simulationMode: 'normal' as SimulationMode,
```

4. Replace reducer:
```typescript
// Replace setQualityLevel with:
setSimulationMode(state, action: PayloadAction<SimulationMode>) {
  state.simulationMode = action.payload;
},
```

5. Keep `setQualityLevel` as deprecated alias if needed, or just rename it.

6. Remove `autoQuality` state field and `setAutoQuality` reducer.

7. Export `setSimulationMode`. Keep `setQualityLevel` exported as alias pointing to `setSimulationMode`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/simulationSlice.mode.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/simulationSlice.ts src/store/__tests__/simulationSlice.mode.test.ts
git commit -m "feat(state): replace qualityLevel with simulationMode (#304)"
```

---

### Task 3: Fix Hardcoded Substeps in GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Step 1: Implement**

1. Add Redux selector for `simulationMode`:
```typescript
const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
```

2. Import `SIMULATION_MODES`:
```typescript
import { SIMULATION_MODES } from '../../utils/cloth/gpu/qualityPresets';
```

3. Replace line 269 (`const substeps = 10;`) with:
```typescript
const substeps = tslSolverRef.current?.config?.substeps ?? 10;
```

4. Add a `useEffect` to update solver config when mode changes:
```typescript
useEffect(() => {
  const solver = tslSolverRef.current;
  if (!solver) return;
  const preset = SIMULATION_MODES[simulationMode];
  solver.updateConfig({ substeps: preset.substeps });
}, [simulationMode]);
```

5. Ensure the solver is initialized with the correct substeps. Find where `createTslSolver` is called and pass `SIMULATION_MODES[simulationMode].substeps` instead of hardcoded value.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "fix(sim): read substeps from solver config instead of hardcoded 10 (#304)"
```

---

### Task 4: Update UI Components

**Files:**
- Modify: `src/components/Sidebar/SimulationView.tsx`
- Modify: `src/components/Viewport3D/SimModeToggle.tsx`
- Modify: `src/components/Viewport3D/SimulationStatusOverlay.tsx`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Update SimulationView.tsx**

1. Replace imports:
```typescript
import { SIMULATION_MODES, type SimulationMode } from '../../utils/cloth/gpu/qualityPresets';
import { setSimulationMode, ... } from '../../store/simulationSlice';
```

2. Replace `PRESET_COLORS` and `PRESET_ICONS` with:
```typescript
const MODE_COLORS: Record<SimulationMode, string> = {
  normal: '#4a88cc',
  complete: '#cc4a4a',
};
const MODE_ICONS: Record<SimulationMode, string> = {
  normal: '⚡',
  complete: '◆',
};
```

3. Replace `handlePreset` with:
```typescript
const handleMode = (mode: SimulationMode) => {
  const preset = SIMULATION_MODES[mode];
  dispatch(setSimulationMode(mode));
  dispatch(setParticleDistance(preset.particleDistance));
};
```

4. Replace the 3-button preset selector with a 2-button mode toggle. Use `simulation.simulationMode` instead of `simulation.qualityLevel`.

5. Remove the `autoQuality` checkbox.

6. Update status section color references to use `simulation.simulationMode`.

**Step 2: Update SimModeToggle.tsx**

1. Replace `QUALITY_PRESETS` import with `SIMULATION_MODES`:
```typescript
import { SIMULATION_MODES } from '../../utils/cloth/gpu/qualityPresets';
```

2. Replace `qualityLevel` selector with `simulationMode`:
```typescript
const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
const activeMode = SIMULATION_MODES[simulationMode];
```

3. Update button colors: `normal` = blue (#2a3a5a), `complete` = red (#5a2a2a).

4. Update title and label references.

**Step 3: Update SimulationStatusOverlay.tsx**

Replace `qualityLevel` selector with `simulationMode`:
```typescript
const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
```
Update display: `Quality: ${simulationMode}` → `Mode: ${simulationMode}`.

**Step 4: Update useKeyboardShortcuts.ts**

Replace `setQualityLevel('production')` with `setSimulationMode('complete')`:
```typescript
dispatch(setSimulationMode('complete'));
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add src/components/Sidebar/SimulationView.tsx src/components/Viewport3D/SimModeToggle.tsx src/components/Viewport3D/SimulationStatusOverlay.tsx src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(ui): update UI to use simulation mode toggle (#304)"
```

---

### Task 5: Update Copilot Tools + Remaining References

**Files:**
- Modify: `src/copilot/perception/copilotContext.ts`
- Modify: `src/copilot/action/tools/definitions/uiStateTools.ts`
- Modify: `src/copilot/action/tools/definitions/3dInteractionTools.ts`
- Modify: `src/utils/cloth/deviceDetect.ts`

**Step 1: Update copilotContext.ts**

Replace `qualityLevel` references with `simulationMode`:
```typescript
simulationMode: simulation.simulationMode,
// ...
lines.push(`Mode: ${context.simulation.simulationMode} | Solver: ...`);
```

**Step 2: Update uiStateTools.ts**

Replace `qualityLevel` and `autoQuality` references:
```typescript
simulationMode: sim.simulationMode,
// Remove: autoQuality: sim.autoQuality,
```

**Step 3: Update 3dInteractionTools.ts**

Check for any `qualityLevel` references and update.

**Step 4: Update deviceDetect.ts**

Replace `QualityLevel` import with `SimulationMode`:
```typescript
import type { SimulationMode } from './gpu/qualityPresets';
// ...
recommendedQuality: SimulationMode;
```
Map: mobile → `'normal'`, lowMem → `'normal'`, default → `'normal'`, highEnd → `'complete'`.

**Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add src/copilot/perception/copilotContext.ts src/copilot/action/tools/definitions/uiStateTools.ts src/copilot/action/tools/definitions/3dInteractionTools.ts src/utils/cloth/deviceDetect.ts
git commit -m "refactor: update copilot tools and device detect for simulation modes (#304)"
```

---

### Task 6: Fix Test Mocks + Final Verification

**Files:**
- Modify: `src/components/Viewport3D/__tests__/FitMapToggle.test.tsx`
- Modify: `src/copilot/perception/__tests__/contextBuilder.test.ts`
- Modify: `src/copilot/perception/__tests__/copilotContext.test.ts`
- Modify: `src/copilot/actions/__tests__/actionExecutor.test.ts`
- Modify: `src/copilot/__tests__/uiBridgeTools.test.ts`
- Modify: `src/copilot/__tests__/uiStateTools.test.ts`

**Step 1: Fix all mock states**

In every test mock that has `qualityLevel: 'standard'` or similar, replace with `simulationMode: 'normal'`.
Remove `autoQuality` from mocks.

Run: `grep -rn 'qualityLevel\|autoQuality' src/ --include='*.test.*'` to find all occurrences.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -u
git commit -m "fix: update test mocks for simulationMode (#304)"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Update quality presets module | `qualityPresets.ts`, `gpu/index.ts` |
| 2 | Update Redux state | `simulationSlice.ts` + test |
| 3 | Fix hardcoded substeps | `GarmentSimulation.tsx` |
| 4 | Update UI components | `SimulationView.tsx`, `SimModeToggle.tsx`, `SimulationStatusOverlay.tsx`, `useKeyboardShortcuts.ts` |
| 5 | Update copilot tools + device detect | `copilotContext.ts`, `uiStateTools.ts`, `3dInteractionTools.ts`, `deviceDetect.ts` |
| 6 | Fix test mocks + verify | 6 test files |
