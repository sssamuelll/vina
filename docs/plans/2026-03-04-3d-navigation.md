# Standard 3D Navigation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CLO3D-standard numpad camera presets (8 views), Focus (F) zoom-to-fit, and a copilot `setCameraView` tool so the LLM can control the 3D camera.

**Architecture:** New `cameraSlice` (Redux) holds pending camera requests. New `useCameraPresets` hook (React) reads them, animates OrbitControls via `requestAnimationFrame` lerp, and clears. Keyboard shortcuts in `Viewport3D.tsx` dispatch to the slice. Copilot tool dispatches to the same slice.

**Tech Stack:** React, Three.js, @react-three/drei (OrbitControls), Redux Toolkit, Vitest

---

### Task 1: Create cameraSlice (Redux state for camera requests)

**Files:**
- Create: `src/store/cameraSlice.ts`
- Modify: `src/store/index.ts:1-35`
- Test: `src/store/__tests__/cameraSlice.test.ts`

**Step 1: Write the failing test**

Create `src/store/__tests__/cameraSlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import cameraReducer, {
  setCameraPreset,
  focusOnPiece,
  clearCameraRequest,
  type ViewPreset,
} from '../cameraSlice';

describe('cameraSlice', () => {
  it('sets a camera preset request', () => {
    const state = cameraReducer(undefined, setCameraPreset('front'));
    expect(state.pendingPreset).toBe('front');
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('sets a focus piece request', () => {
    const state = cameraReducer(undefined, focusOnPiece('piece-123'));
    expect(state.pendingFocusPieceId).toBe('piece-123');
    expect(state.pendingPreset).toBeNull();
  });

  it('clears camera request', () => {
    let state = cameraReducer(undefined, setCameraPreset('back'));
    state = cameraReducer(state, clearCameraRequest());
    expect(state.pendingPreset).toBeNull();
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('preset request clears focus request', () => {
    let state = cameraReducer(undefined, focusOnPiece('piece-1'));
    state = cameraReducer(state, setCameraPreset('top'));
    expect(state.pendingPreset).toBe('top');
    expect(state.pendingFocusPieceId).toBeNull();
  });

  it('focus request clears preset request', () => {
    let state = cameraReducer(undefined, setCameraPreset('left'));
    state = cameraReducer(state, focusOnPiece('piece-2'));
    expect(state.pendingFocusPieceId).toBe('piece-2');
    expect(state.pendingPreset).toBeNull();
  });

  it('exports all 8 view presets as type', () => {
    const presets: ViewPreset[] = [
      'front', 'back', 'left', 'right', 'top', 'bottom',
      'threeQuarterLeft', 'threeQuarterRight',
    ];
    expect(presets).toHaveLength(8);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/cameraSlice.test.ts`
Expected: FAIL — module not found

**Step 3: Implement cameraSlice**

Create `src/store/cameraSlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ViewPreset =
  | 'front' | 'back'
  | 'left' | 'right'
  | 'top' | 'bottom'
  | 'threeQuarterLeft' | 'threeQuarterRight';

interface CameraState {
  pendingPreset: ViewPreset | null;
  pendingFocusPieceId: string | null;
}

const initialState: CameraState = {
  pendingPreset: null,
  pendingFocusPieceId: null,
};

const cameraSlice = createSlice({
  name: 'camera',
  initialState,
  reducers: {
    setCameraPreset(state, action: PayloadAction<ViewPreset>) {
      state.pendingPreset = action.payload;
      state.pendingFocusPieceId = null;
    },
    focusOnPiece(state, action: PayloadAction<string>) {
      state.pendingFocusPieceId = action.payload;
      state.pendingPreset = null;
    },
    clearCameraRequest(state) {
      state.pendingPreset = null;
      state.pendingFocusPieceId = null;
    },
  },
});

export const { setCameraPreset, focusOnPiece, clearCameraRequest } = cameraSlice.actions;
export default cameraSlice.reducer;
```

**Step 4: Register in store**

In `src/store/index.ts`, add the import after line 14 (`import copilotUIReducer...`):

```typescript
import cameraReducer from './cameraSlice';
```

Add to the reducer object after line 34 (`copilotUI: copilotUIReducer,`):

```typescript
    camera: cameraReducer,
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/cameraSlice.test.ts`
Expected: PASS — all 6 tests

**Step 6: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass

**Step 7: Commit**

```bash
git add src/store/cameraSlice.ts src/store/__tests__/cameraSlice.test.ts src/store/index.ts
git commit -m "feat: add cameraSlice for camera preset and focus requests

New Redux slice bridges copilot/keyboard → viewport camera animation.
Actions: setCameraPreset, focusOnPiece, clearCameraRequest.

Refs #138"
```

---

### Task 2: Create useCameraPresets hook (animation + preset positions)

**Files:**
- Create: `src/components/Viewport3D/useCameraPresets.ts`
- Test: `src/components/Viewport3D/__tests__/cameraPresets.test.ts`

**Step 1: Write the failing test**

Create `src/components/Viewport3D/__tests__/cameraPresets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { VIEW_PRESETS, DEFAULT_TARGET } from '../useCameraPresets';

describe('VIEW_PRESETS', () => {
  it('defines all 8 view presets', () => {
    expect(Object.keys(VIEW_PRESETS)).toHaveLength(8);
    expect(VIEW_PRESETS.front).toBeDefined();
    expect(VIEW_PRESETS.back).toBeDefined();
    expect(VIEW_PRESETS.left).toBeDefined();
    expect(VIEW_PRESETS.right).toBeDefined();
    expect(VIEW_PRESETS.top).toBeDefined();
    expect(VIEW_PRESETS.bottom).toBeDefined();
    expect(VIEW_PRESETS.threeQuarterLeft).toBeDefined();
    expect(VIEW_PRESETS.threeQuarterRight).toBeDefined();
  });

  it('front view looks along +Z axis', () => {
    const { position } = VIEW_PRESETS.front;
    expect(position[2]).toBeGreaterThan(0); // camera in front (+Z)
    expect(position[0]).toBe(0); // centered X
  });

  it('back view looks along -Z axis', () => {
    const { position } = VIEW_PRESETS.back;
    expect(position[2]).toBeLessThan(0); // camera behind (-Z)
    expect(position[0]).toBe(0);
  });

  it('top view looks down from +Y', () => {
    const { position } = VIEW_PRESETS.top;
    expect(position[1]).toBeGreaterThan(DEFAULT_TARGET[1]); // above target
  });

  it('all presets use default target', () => {
    for (const preset of Object.values(VIEW_PRESETS)) {
      expect(preset.target).toEqual(DEFAULT_TARGET);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Viewport3D/__tests__/cameraPresets.test.ts`
Expected: FAIL — module not found

**Step 3: Implement useCameraPresets**

Create `src/components/Viewport3D/useCameraPresets.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as THREE from 'three';
import type { RootState } from '../../store';
import { clearCameraRequest, type ViewPreset } from '../../store/cameraSlice';

// ─── Constants ───

const ANIMATION_DURATION_MS = 250;

export const DEFAULT_TARGET: [number, number, number] = [0, 0.75, 0];
const DEFAULT_DISTANCE = 2.8;

export const VIEW_PRESETS: Record<ViewPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  front:             { position: [0, 0.75, DEFAULT_DISTANCE],  target: DEFAULT_TARGET },
  back:              { position: [0, 0.75, -DEFAULT_DISTANCE], target: DEFAULT_TARGET },
  right:             { position: [DEFAULT_DISTANCE, 0.75, 0],  target: DEFAULT_TARGET },
  left:              { position: [-DEFAULT_DISTANCE, 0.75, 0], target: DEFAULT_TARGET },
  top:               { position: [0, DEFAULT_TARGET[1] + DEFAULT_DISTANCE, 0.001], target: DEFAULT_TARGET },
  bottom:            { position: [0, DEFAULT_TARGET[1] - DEFAULT_DISTANCE, 0.001], target: DEFAULT_TARGET },
  threeQuarterRight: { position: [2.0, 0.75, 2.0],  target: DEFAULT_TARGET },
  threeQuarterLeft:  { position: [-2.0, 0.75, 2.0], target: DEFAULT_TARGET },
};

// ─── Types ───

interface OrbitControlsRef {
  object: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  update: () => void;
}

// ─── Hook ───

export function useCameraPresets(
  orbitRef: React.RefObject<OrbitControlsRef | null>,
) {
  const dispatch = useDispatch();
  const pendingPreset = useSelector((s: RootState) => s.camera.pendingPreset);
  const pendingFocusPieceId = useSelector((s: RootState) => s.camera.pendingFocusPieceId);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const animRef = useRef<number | null>(null);

  // ─── Animate camera to target position/target ───

  const animateTo = useCallback((
    toPos: [number, number, number],
    toTarget: [number, number, number],
  ) => {
    const controls = orbitRef.current;
    if (!controls) return;

    // Cancel any running animation
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const camera = controls.object;
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const destPos = new THREE.Vector3(...toPos);
    const destTarget = new THREE.Vector3(...toTarget);
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      // Smooth ease-out: t' = 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(fromPos, destPos, eased);
      controls.target.lerpVectors(fromTarget, destTarget, eased);
      controls.update();

      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(step);
  }, [orbitRef]);

  // ─── Set camera to a named preset ───

  const setCameraView = useCallback((preset: ViewPreset) => {
    const view = VIEW_PRESETS[preset];
    if (!view) return;
    animateTo(view.position, view.target);
  }, [animateTo]);

  // ─── Focus on a selected piece ───

  const focusOnSelection = useCallback((pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const controls = orbitRef.current;
    if (!controls) return;

    // Compute bounding box center from the piece outline in 3D space
    // Pieces are positioned on a Y plane; use arrangement overrides if available
    // For now, use a simple centroid from the 2D outline projected to 3D
    const outline = piece.outline;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const cmd of outline) {
      if (cmd.type === 'Z') continue;
      const vals = cmd.values;
      if (cmd.type === 'M' || cmd.type === 'L') {
        minX = Math.min(minX, vals[0]); maxX = Math.max(maxX, vals[0]);
        minY = Math.min(minY, vals[1]); maxY = Math.max(maxY, vals[1]);
      } else if (cmd.type === 'C') {
        // Check all 3 points
        for (let i = 0; i < 6; i += 2) {
          minX = Math.min(minX, vals[i]); maxX = Math.max(maxX, vals[i]);
        }
        for (let i = 1; i < 6; i += 2) {
          minY = Math.min(minY, vals[i]); maxY = Math.max(maxY, vals[i]);
        }
      } else if (cmd.type === 'Q') {
        for (let i = 0; i < 4; i += 2) {
          minX = Math.min(minX, vals[i]); maxX = Math.max(maxX, vals[i]);
        }
        for (let i = 1; i < 4; i += 2) {
          minY = Math.min(minY, vals[i]); maxY = Math.max(maxY, vals[i]);
        }
      }
    }

    // 2D pattern coordinates are in mm, convert to meters for 3D
    const scale = 0.001;
    const cx = ((minX + maxX) / 2) * scale;
    const cy = ((minY + maxY) / 2) * scale;
    const width = (maxX - minX) * scale;
    const height = (maxY - minY) * scale;

    // Position target at the piece center (projected to 3D space)
    // Pieces hang around y=0.75 on the avatar
    const targetY = 0.75 + cy;
    const target: [number, number, number] = [cx, targetY, 0];

    // Camera distance to frame the bounding sphere
    const radius = Math.max(width, height) / 2;
    const camera = controls.object as THREE.PerspectiveCamera;
    const fov = camera.fov * (Math.PI / 180);
    const dist = Math.max(radius / Math.tan(fov / 2), 0.8);

    const position: [number, number, number] = [cx, targetY, dist];
    animateTo(position, target);
  }, [pieces, orbitRef, animateTo]);

  // ─── Watch Redux for copilot-dispatched requests ───

  useEffect(() => {
    if (pendingPreset) {
      setCameraView(pendingPreset);
      dispatch(clearCameraRequest());
    }
  }, [pendingPreset, setCameraView, dispatch]);

  useEffect(() => {
    if (pendingFocusPieceId) {
      focusOnSelection(pendingFocusPieceId);
      dispatch(clearCameraRequest());
    }
  }, [pendingFocusPieceId, focusOnSelection, dispatch]);

  // ─── Cleanup animation on unmount ───

  useEffect(() => {
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  return { setCameraView, focusOnSelection };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Viewport3D/__tests__/cameraPresets.test.ts`
Expected: PASS — all 5 tests

**Step 5: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass

**Step 6: Commit**

```bash
git add src/components/Viewport3D/useCameraPresets.ts src/components/Viewport3D/__tests__/cameraPresets.test.ts
git commit -m "feat: add useCameraPresets hook with animated camera transitions

8 CLO3D-standard view presets + focus-on-piece with 250ms ease-out
animation using requestAnimationFrame lerp on OrbitControls.

Refs #138"
```

---

### Task 3: Wire keyboard shortcuts in Viewport3D

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx:76,150-184`

**Step 1: Add hook imports and instantiation**

At the top of `Viewport3D.tsx`, add the import (after the existing imports around line 14):

```typescript
import { useCameraPresets } from './useCameraPresets';
import { setCameraPreset, focusOnPiece } from '../../store/cameraSlice';
```

Inside the component (after line 76 where `orbitRef` is defined), add:

```typescript
const cameraPresets = useCameraPresets(orbitRef);
```

**Step 2: Add numpad + F keyboard handlers**

In the existing `useEffect` keydown handler (lines 154-184), add the following cases inside the `handler` function, before the closing `};` of the handler (before line 180):

```typescript
      // ─── Numpad Camera Presets (CLO3D-standard) ───
      if (e.code === 'Numpad2') { e.preventDefault(); cameraPresets.setCameraView('front'); }
      if (e.code === 'Numpad8') { e.preventDefault(); cameraPresets.setCameraView('back'); }
      if (e.code === 'Numpad4') { e.preventDefault(); cameraPresets.setCameraView('right'); }
      if (e.code === 'Numpad6') { e.preventDefault(); cameraPresets.setCameraView('left'); }
      if (e.code === 'Numpad5') { e.preventDefault(); cameraPresets.setCameraView('top'); }
      if (e.code === 'Numpad0') { e.preventDefault(); cameraPresets.setCameraView('bottom'); }
      if (e.code === 'Numpad1') { e.preventDefault(); cameraPresets.setCameraView('threeQuarterRight'); }
      if (e.code === 'Numpad3') { e.preventDefault(); cameraPresets.setCameraView('threeQuarterLeft'); }

      // ─── Focus (F) — zoom to selected piece (CLO3D-standard) ───
      if ((e.key === 'F' || e.key === 'f') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (selectedPieceIds.length > 0) {
          cameraPresets.focusOnSelection(selectedPieceIds[0]);
        }
      }
```

**Important:** The existing `Shift+F` handler (line 160-163) already checks for `e.shiftKey`, so plain `F` won't conflict. Also update the dependency array of this `useEffect` to include `cameraPresets` and `selectedPieceIds`.

Update the `useEffect` dependency array (line 184) to:

```typescript
  }, [activeTool3D, dispatch, cameraPresets, selectedPieceIds]);
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat: wire numpad camera presets and Focus (F) in 3D viewport

Numpad 0-8 switch between CLO3D-standard views. F zooms to selected
piece. Both use smooth 250ms animated transitions.

Refs #138"
```

---

### Task 4: Add setCameraView copilot tool

**Files:**
- Modify: `src/copilot/action/tools/definitions/3dInteractionTools.ts:71-413`
- Test: `src/copilot/action/tools/__tests__/setCameraView.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/action/tools/__tests__/setCameraView.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { tools } from '../definitions/3dInteractionTools';

describe('setCameraView tool', () => {
  const tool = tools.find(t => t.name === 'setCameraView');

  it('is registered in 3dInteractionTools', () => {
    expect(tool).toBeDefined();
  });

  it('has correct parameter schema', () => {
    expect(tool!.parameters.properties.view).toBeDefined();
    expect(tool!.parameters.properties.view.enum).toContain('front');
    expect(tool!.parameters.properties.view.enum).toContain('back');
    expect(tool!.parameters.properties.view.enum).toHaveLength(8);
    expect(tool!.parameters.properties.focusPieceId).toBeDefined();
  });

  it('dispatches setCameraPreset for view param', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: { pieces: [] },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({ view: 'front' }, dispatch, getState);
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    // Verify dispatched action type
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('camera/setCameraPreset');
    expect(action.payload).toBe('front');
  });

  it('dispatches focusOnPiece for focusPieceId param', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: { pieces: [{ id: 'p1', name: 'Front' }] },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({ focusPieceId: 'p1' }, dispatch, getState);
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('camera/focusOnPiece');
    expect(action.payload).toBe('p1');
  });

  it('returns error when neither view nor focusPieceId provided', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn() as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({}, dispatch, getState);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/action/tools/__tests__/setCameraView.test.ts`
Expected: FAIL — tool not found

**Step 3: Add setCameraView tool to 3dInteractionTools.ts**

At the top of `src/copilot/action/tools/definitions/3dInteractionTools.ts`, add the import (after the existing imports around line 22):

```typescript
import { setCameraPreset, focusOnPiece } from '../../../../store/cameraSlice';
```

Then add the new tool definition to the `tools` array, after the `analyzeGarmentReadiness` tool (before the closing `];` at line 413):

```typescript
  // ─── Camera Navigation ─────────────────────────────────────────────────────

  {
    name: 'setCameraView',
    description:
      'Set the 3D camera to a preset view angle or focus on a specific pattern piece. ' +
      'Use view presets for standard angles (front, back, left, right, top, bottom, threeQuarterLeft, threeQuarterRight). ' +
      'Use focusPieceId to zoom in on a specific piece.',
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'threeQuarterLeft', 'threeQuarterRight'],
          description: 'Camera view preset name',
        },
        focusPieceId: {
          type: 'string',
          description: 'Piece ID to focus/zoom the camera on (alternative to view preset)',
        },
      },
    },
    execute: async (params, dispatch, getState) => {
      const view = params.view as string | undefined;
      const focusPieceIdParam = params.focusPieceId as string | undefined;

      if (view) {
        dispatch(setCameraPreset(view as Parameters<typeof setCameraPreset>[0]));
        return {
          success: true,
          data: { view },
          message: `Camera set to ${view} view.`,
        };
      }

      if (focusPieceIdParam) {
        const pieces = getState().project.pieces;
        const piece = pieces.find((p: { id: string }) => p.id === focusPieceIdParam);
        if (!piece) {
          return { success: false, error: `Piece "${focusPieceIdParam}" not found.` };
        }
        dispatch(focusOnPiece(focusPieceIdParam));
        return {
          success: true,
          data: { focusPieceId: focusPieceIdParam, pieceName: piece.name },
          message: `Camera focused on piece "${piece.name}".`,
        };
      }

      return {
        success: false,
        error: 'Provide either "view" (preset name) or "focusPieceId" (piece ID).',
      };
    },
  },
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/action/tools/__tests__/setCameraView.test.ts`
Expected: PASS — all 5 tests

**Step 5: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass

**Step 6: Commit**

```bash
git add src/copilot/action/tools/definitions/3dInteractionTools.ts src/copilot/action/tools/__tests__/setCameraView.test.ts
git commit -m "feat(copilot): add setCameraView tool for 3D camera navigation

LLM can set camera to 8 preset views or focus on a specific piece.
Dispatches to cameraSlice; viewport hook animates the transition.

Refs #138"
```

---

### Task 5: Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (including new cameraSlice, cameraPresets, and setCameraView tests)

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Verify tool is registered in copilot**

Run: `npx vitest run src/copilot/action/tools/__tests__/setCameraView.test.ts --reporter=verbose`
Expected: All 5 tests pass with verbose output
