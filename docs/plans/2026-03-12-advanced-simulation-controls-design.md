# Advanced Simulation Controls Design (#241)

## Goal

Add four simulation control features matching CLO3D functionality: wind (GPU + UI + 3D gizmo), per-piece freeze, steam/press brush tool, and enhanced quality presets.

## Approach

Incremental feature slices — each feature is independent, gets its own branch and PR. Ordered by value and existing scaffolding.

## Feature 1: Wind (GPU + UI + 3D Gizmo)

### Current State

- CPU solver (`xpbdSolver.ts`): `windForce` config + `applyWindForce(sdt)` — fully working
- WASM solver: `setWind(force)` — fully working
- GPU/TSL solver: **no wind support**
- Animation timeline: `'wind'` track type already defined in `AnimationTrack.objectType`
- Redux state: no wind state in `simulationSlice`
- UI: no wind controls

### State

```typescript
// simulationSlice.ts
interface WindSource {
  id: string;
  position: [number, number, number];
  direction: [number, number, number]; // unit vector
  strength: number;                     // m/s
  range: number;                        // meters, 0 = unlimited
  enabled: boolean;
}

// Added to SimulationSliceState:
windSources: WindSource[];              // default: one source at origin, direction [1,0,0], strength 0
```

### GPU Wind Compute

V1: single global directional wind (no positional falloff). TSL compute node iterates triangles, computes face-normal dot wind-direction, applies force proportional to projected area. Mirrors CPU `applyWindForce()` algorithm.

Add to `TslSolverConfig`:
```typescript
windForce: [number, number, number];  // combined direction * strength
dragCoefficient: number;
```

New TSL uniforms: `windX`, `windY`, `windZ`, `dragCoeff`. New compute Fn node: `windForceNode` runs per-triangle, accumulates force to vertices via atomicAdd (same pattern as self-collision).

### 3D Gizmo

`WindGizmo.tsx` — R3F component:
- Arrow mesh (cone + cylinder) showing wind direction
- `TransformControls` for position/rotation (same pattern as `CollisionBodyMesh.tsx`)
- Scale mapped to strength (visual feedback)
- Click to select, shows property panel
- Syncs with Redux `windSources[i]`

### UI Panel

Section in `SimulationView.tsx`:
- "Wind" collapsible section
- Add/remove wind source buttons
- Per-source: direction (3 sliders or spherical angles), strength slider (0-50 m/s), range slider, enable toggle
- Synced with gizmo selection

### Files

| Action | File |
|--------|------|
| Modify | `src/store/simulationSlice.ts` — wind state + CRUD actions |
| Modify | `src/utils/cloth/gpu/tslSolver.ts` — wind uniforms + compute node |
| Create | `src/utils/cloth/gpu/tslWind.ts` — wind TSL compute Fn |
| Create | `src/utils/cloth/gpu/__tests__/tslWind.test.ts` |
| Create | `src/components/Viewport3D/WindGizmo.tsx` — 3D arrow gizmo |
| Modify | `src/components/Sidebar/SimulationView.tsx` — wind panel |
| Modify | `src/utils/cloth/gpu/gpuSolverClient.ts` — pass wind to TSL |

---

## Feature 2: Per-Piece Freeze (CLO3D-style)

### Behavior

- Toggle freeze per pattern piece
- Frozen pieces: `invMass[v] = 0` for all vertices
- Frozen pieces remain as collision surfaces (positions static, other cloth collides)
- Visual: slight blue tint or wireframe overlay on frozen pieces

### State

```typescript
// simulationSlice.ts
frozenPieceIds: string[];  // piece IDs with invMass = 0
```

Actions: `toggleFreezePiece(pieceId)`, `unfreezeAllPieces()`

### Implementation

Before each solver dispatch, iterate frozen piece vertex ranges and set `invMass[v] = 0` in the invMass buffer. On unfreeze, restore original invMass values from fabric density.

### Files

| Action | File |
|--------|------|
| Modify | `src/store/simulationSlice.ts` — `frozenPieceIds` + actions |
| Modify | `src/utils/cloth/gpu/gpuSolverClient.ts` — apply invMass=0 |
| Modify | `src/components/Sidebar/SimulationView.tsx` — freeze toggle per piece |
| Create | `src/components/Viewport3D/FreezeOverlay.tsx` — visual indicator |

---

## Feature 3: Steam/Press Brush Tool

### Behavior

- New 3D tool mode (button in 3D toolbar)
- Click-and-drag on garment surface
- Raycast to find nearest particles within brush radius
- For affected particles: zero velocity, lerp positions toward rest-shape (T-pose)
- Visual: circular brush cursor on mesh surface

### State

```typescript
// simulationSlice.ts
steamBrush: {
  active: boolean;
  radius: number;     // meters, default 0.05
  strength: number;   // 0-1 lerp factor, default 0.3
}
```

### Implementation

New component `SteamBrushTool.tsx`:
- Raycast against garment mesh on pointer move
- On click-and-drag, collect particle indices within radius
- Send `relaxParticles` message to solver worker
- Solver lerps `positions[i]` toward `restPositions[i]` by strength factor, zeroes `velocities[i]`

### Files

| Action | File |
|--------|------|
| Modify | `src/store/simulationSlice.ts` — steam brush state |
| Modify | `src/components/Toolbar/Toolbar3D.tsx` — tool button |
| Create | `src/components/Viewport3D/SteamBrushTool.tsx` — raycast + relaxation |
| Modify | solver workers — `relaxParticles` message type |

---

## Feature 4: Quality Presets Enhancement

### Current State

`qualityPresets.ts` defines preview/standard/production with `particleDistance` and `substeps`.

### Enhancement

Extend presets to include:
- `selfCollision: boolean`
- `collisionMargin: number`
- `windQuality: 'off' | 'vertex' | 'face'`

Add "Custom" preset that unlocks all sliders. Current presets lock sliders to preset values.

### Files

| Action | File |
|--------|------|
| Modify | `src/utils/cloth/gpu/qualityPresets.ts` — extend definitions |
| Modify | `src/components/Sidebar/SimulationView.tsx` — conditional slider visibility |

---

## Implementation Order

1. **Wind** — highest value, most existing scaffolding
2. **Freeze** — smallest scope, quick win
3. **Presets** — polish existing system
4. **Steam brush** — most novel, benefits from stable foundation

Each feature is its own branch and PR.
