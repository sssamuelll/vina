# Steam/Press Brush Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 3D brush tool that relaxes cloth particles toward zero velocity on click-drag, simulating steam pressing / fabric calming.

**Architecture:** New tool definition registered in the tool registry. Brush handler lives in `GarmentSimulation.tsx` alongside the existing pin click handler. On pointer-down + move, finds particles within brush radius and damps their velocity via direct SBA writes (GPU) or worker message (WASM). A `relaxParticles()` method on `GpuSolverClient` handles the GPU path. Visual feedback via a transparent sphere at the brush location.

**Tech Stack:** React Three Fiber (R3F), Redux Toolkit, Three.js StorageBufferAttribute, Vitest

---

### Task 1: Redux State — Steam Brush Config

**Files:**
- Modify: `src/store/simulationSlice.ts`
- Create: `src/store/__tests__/simulationSlice.steam.test.ts`

**Step 1: Write the failing test**

Create `src/store/__tests__/simulationSlice.steam.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  setSteamBrushActive,
  setSteamBrushRadius,
  setSteamBrushStrength,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('steamBrush state', () => {
  it('starts with steamBrush defaults', () => {
    const store = createStore();
    const { steamBrush } = store.getState().simulation;
    expect(steamBrush).toEqual({ active: false, radius: 0.05, strength: 0.3 });
  });

  it('setSteamBrushActive toggles active', () => {
    const store = createStore();
    store.dispatch(setSteamBrushActive(true));
    expect(store.getState().simulation.steamBrush.active).toBe(true);
  });

  it('setSteamBrushRadius updates radius', () => {
    const store = createStore();
    store.dispatch(setSteamBrushRadius(0.1));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.1);
  });

  it('setSteamBrushRadius clamps to [0.01, 0.5]', () => {
    const store = createStore();
    store.dispatch(setSteamBrushRadius(0));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.01);
    store.dispatch(setSteamBrushRadius(2));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.5);
  });

  it('setSteamBrushStrength updates strength', () => {
    const store = createStore();
    store.dispatch(setSteamBrushStrength(0.8));
    expect(store.getState().simulation.steamBrush.strength).toBe(0.8);
  });

  it('setSteamBrushStrength clamps to [0, 1]', () => {
    const store = createStore();
    store.dispatch(setSteamBrushStrength(-1));
    expect(store.getState().simulation.steamBrush.strength).toBe(0);
    store.dispatch(setSteamBrushStrength(5));
    expect(store.getState().simulation.steamBrush.strength).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/simulationSlice.steam.test.ts`
Expected: FAIL — actions not exported

**Step 3: Implement**

In `src/store/simulationSlice.ts`:

1. Add to `SimulationSliceState` interface (after `frozenPieceIds: string[]`):
```typescript
steamBrush: {
  active: boolean;
  radius: number;
  strength: number;
};
```

2. Add to `initialState` (after `frozenPieceIds: []`):
```typescript
steamBrush: {
  active: false,
  radius: 0.05,
  strength: 0.3,
},
```

3. Add reducers (after `unfreezeAllPieces`):
```typescript
setSteamBrushActive(state, action: PayloadAction<boolean>) {
  state.steamBrush.active = action.payload;
},
setSteamBrushRadius(state, action: PayloadAction<number>) {
  state.steamBrush.radius = Math.max(0.01, Math.min(0.5, action.payload));
},
setSteamBrushStrength(state, action: PayloadAction<number>) {
  state.steamBrush.strength = Math.max(0, Math.min(1, action.payload));
},
```

4. Export the 3 actions.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/simulationSlice.steam.test.ts`
Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add src/store/simulationSlice.ts src/store/__tests__/simulationSlice.steam.test.ts
git commit -m "feat(state): add steamBrush state to simulationSlice (#303)"
```

---

### Task 2: Tool Definition + Registration

**Files:**
- Create: `src/tools/definitions/steamBrush.tsx`
- Modify: `src/tools/index.ts`

**Step 1: Create tool definition**

Create `src/tools/definitions/steamBrush.tsx`:

```tsx
import { ToolDefinition } from '../types';

export const steamBrushTool: ToolDefinition = {
  id: 'steamBrush',
  name: 'Steam Brush',
  description: 'Relax cloth by brushing — damps velocity to calm fabric movement',
  context: '3d',
  shortcut: 'b',
  icon: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Steam/brush icon: wavy lines above a circle */}
      <circle cx="9" cy="12" r="5" />
      <path d="M7 5C7 3.5 8 2 9 2S11 3.5 11 5" />
      <path d="M5 6C5 4.5 6 3 7 3" />
      <path d="M11 3C12 3 13 4.5 13 6" />
    </svg>
  ),
  cursor: 'crosshair',
  group: '3d-simulation',
  options: [
    {
      id: 'brushRadius',
      label: 'Brush Radius',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Small (2cm)', value: 'small' },
        { label: 'Medium (5cm)', value: 'medium' },
        { label: 'Large (10cm)', value: 'large' },
      ],
    },
    {
      id: 'relaxStrength',
      label: 'Strength',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Light', value: 'light' },
        { label: 'Medium', value: 'medium' },
        { label: 'Strong', value: 'strong' },
      ],
    },
  ],
  onActivate: () => {
    console.log('[Steam Brush] Activated — click and drag on cloth to relax');
  },
  copilot: {
    description: 'Steam brush tool relaxes cloth particles by damping their velocity. Click and drag on the garment surface to calm fabric movement in that area, simulating steam pressing.',
    examples: [
      'Use the steam brush on the wrinkled area',
      'Smooth out the fabric',
      'Press the collar flat',
    ],
    keywords: ['steam', 'press', 'brush', 'smooth', 'relax', 'calm', 'iron', 'flatten'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: false,
  },
};
```

**Step 2: Register in tool index**

In `src/tools/index.ts`:

1. Add import (after `pinTool` import):
```typescript
import { steamBrushTool } from './definitions/steamBrush';
```

2. Add to `allTools` array in the "3D Tools — Simulation" section (after `simulateTool`):
```typescript
steamBrushTool,
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/tools/definitions/steamBrush.tsx src/tools/index.ts
git commit -m "feat(tool): add steam brush tool definition and registration (#303)"
```

---

### Task 3: `relaxParticles()` on GpuSolverClient

This method damps velocity for a set of particle indices via direct SBA writes.

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`
- Modify: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`

**Step 1: Write the failing test**

Add to `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`:

```typescript
describe('relaxParticles', () => {
  it('is a method on GpuSolverClient', () => {
    expect(typeof GpuSolverClient.prototype.relaxParticles).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/utils/cloth/gpu/gpuSolverClient.ts`, add method (after `freezePieces()`):

```typescript
/**
 * Relax particles by damping their velocity.
 * Used by the steam brush tool to calm cloth movement.
 * @param indices - Particle indices to relax
 * @param strength - Damping factor 0-1 (1 = fully zero velocity)
 */
relaxParticles(indices: number[], strength: number): void {
  if (!this.tslBuffers) return;

  const velArr = this.tslBuffers.velocitySBA.array as Float32Array;
  const factor = 1 - strength;

  for (const idx of indices) {
    const base = idx * 3;
    velArr[base] *= factor;
    velArr[base + 1] *= factor;
    velArr[base + 2] *= factor;
  }

  this.tslBuffers.velocitySBA.version++;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(gpu): add relaxParticles() to GpuSolverClient (#303)"
```

---

### Task 4: Steam Brush Handler in GarmentSimulation

This is the core interaction: on pointer-down + move over the garment mesh, find particles within brush radius and relax them.

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Step 1: Implement**

In `src/components/Viewport3D/GarmentSimulation.tsx`:

1. Add imports at the top:
```typescript
import { ThreeEvent } from '@react-three/fiber';
```
(Check if `ThreeEvent` is already imported — it may be.)

2. Add Redux selectors (near the existing `activeTool3D` selector):
```typescript
const steamBrush = useSelector((s: RootState) => s.simulation.steamBrush);
```

3. Add a ref for tracking brush dragging state (near other refs):
```typescript
const brushDragging = useRef(false);
```

4. Add a ref for the brush cursor mesh (near other refs):
```typescript
const brushCursorRef = useRef<THREE.Mesh>(null);
```

5. Add the brush pointer handlers (after `handleMeshClick`, before the `if (!staticGeometry)` return):

```typescript
// Steam brush: find particles within radius and relax
const findParticlesInRadius = useCallback((point: THREE.Vector3, radius: number): number[] => {
  const positions = positionsRef.current;
  if (!positions) return [];
  const numParticles = positions.length / 3;
  const radiusSq = radius * radius;
  const result: number[] = [];
  for (let i = 0; i < numParticles; i++) {
    const dx = positions[i * 3] - point.x;
    const dy = positions[i * 3 + 1] - point.y;
    const dz = positions[i * 3 + 2] - point.z;
    if (dx * dx + dy * dy + dz * dz <= radiusSq) {
      result.push(i);
    }
  }
  return result;
}, [positionsRef]);

const handleBrushStroke = useCallback((point: THREE.Vector3) => {
  const indices = findParticlesInRadius(point, steamBrush.radius);
  if (indices.length === 0) return;
  if (clients.gpu) {
    clients.gpu.relaxParticles(indices, steamBrush.strength);
  }
}, [findParticlesInRadius, steamBrush.radius, steamBrush.strength, clients.gpu]);

const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
  if (activeTool3D !== 'steamBrush') return;
  e.stopPropagation();
  brushDragging.current = true;
  handleBrushStroke(e.point);
}, [activeTool3D, handleBrushStroke]);

const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
  if (activeTool3D !== 'steamBrush') return;
  // Update brush cursor position
  if (brushCursorRef.current) {
    brushCursorRef.current.position.copy(e.point);
    brushCursorRef.current.visible = true;
  }
  if (!brushDragging.current) return;
  e.stopPropagation();
  handleBrushStroke(e.point);
}, [activeTool3D, handleBrushStroke]);

const handlePointerUp = useCallback(() => {
  brushDragging.current = false;
}, []);
```

6. Add pointer event props to the `<mesh>` element (alongside existing `onClick`):
```tsx
<mesh
  ref={meshRef}
  geometry={staticGeometry}
  onClick={handleMeshClick}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
  material={tslMaterial || undefined}
>
```

7. Add brush cursor visual (after the closing `</mesh>` tag, before `</>`):
```tsx
{/* Steam brush cursor */}
{activeTool3D === 'steamBrush' && (
  <mesh ref={brushCursorRef} visible={false}>
    <sphereGeometry args={[steamBrush.radius, 16, 16]} />
    <meshBasicMaterial color="#88ccff" transparent opacity={0.2} depthWrite={false} />
  </mesh>
)}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(ui): add steam brush interaction handler with visual cursor (#303)"
```

---

### Task 5: Fix Mock State + Final Verification

**Files:**
- Modify: `src/components/Viewport3D/__tests__/FitMapToggle.test.tsx`
- Modify: `src/copilot/perception/__tests__/contextBuilder.test.ts`

**Step 1: Run type check to find failures**

Run: `npx tsc --noEmit 2>&1 | grep steamBrush`

Add `steamBrush: { active: false, radius: 0.05, strength: 0.3 },` to any mock SimulationSliceState objects that are missing it.

Known files:
- `src/components/Viewport3D/__tests__/FitMapToggle.test.tsx` — add after `frozenPieceIds: []`
- `src/copilot/perception/__tests__/contextBuilder.test.ts` — add after `frozenPieceIds: []`

**Step 2: Run all tests**

Run: `npx vitest run src/utils/cloth/gpu/ src/store/__tests__/simulationSlice.steam.test.ts`
Expected: All pass

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/Viewport3D/__tests__/FitMapToggle.test.tsx src/copilot/perception/__tests__/contextBuilder.test.ts
git commit -m "fix: add steamBrush to mock SimulationSliceState in tests (#303)"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Redux state + actions | `simulationSlice.steam.test.ts` | `simulationSlice.ts` |
| 2 | Tool definition + registration | `steamBrush.tsx` | `tools/index.ts` |
| 3 | `relaxParticles()` on GPU client | — | `gpuSolverClient.ts`, test |
| 4 | Brush handler + cursor visual | — | `GarmentSimulation.tsx` |
| 5 | Fix test mocks + verify | — | `FitMapToggle.test.tsx`, `contextBuilder.test.ts` |
