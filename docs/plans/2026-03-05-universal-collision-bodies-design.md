# Universal Collision Bodies — Design

## Problem

The collision system is hardcoded to a single avatar mesh. Users can't drape fabric over furniture, mannequins, cushion cores, car seats, or any other 3D object. CLO3D handles this by importing OBJs "as an avatar," but that's confusing, lacks per-body properties, has no transform gizmo, and can't compose multi-object scenes.

## Approach

Add a parallel `CollisionBody` system alongside the existing avatar. Each collision body is an imported mesh with its own transform, collision properties, and optional animation. The solver accepts an array of collision meshes. The avatar becomes just another entry (`__avatar__`) in that array. A transform gizmo (drei `TransformControls`) enables live repositioning, and GLB/FBX animation clips play back with real-time collision mesh updates.

## Data Model

```typescript
// src/types/collisionBody.ts
interface CollisionBody {
  id: string;
  name: string;
  meshUrl: string;
  format: 'obj' | 'fbx' | 'glb' | 'gltf';
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];   // euler degrees
    scale: [number, number, number];
  };
  collision: {
    enabled: boolean;
    friction: number;       // 0-1, default 0.3
    offset: number;         // meters, default 0.005
  };
  animation: {
    clipIndex: number | null;
    playing: boolean;
    time: number;
    loop: boolean;
  };
  visible: boolean;
}
```

Added to Redux store via `collisionBodySlice`:
- `collisionBodies: CollisionBody[]`
- `selectedCollisionBodyId: string | null`

No changes to existing avatar types. Avatar stays special (measurements, pose, IK).

## Multi-Body Collision in Worker

Current: single `collisionMesh` + `collisionHash`.

New: array of `{ id, mesh, hash }`.

Worker messages:
- `setCollisionBodies` — replace entire array (init)
- `updateCollisionBody` — update single body (transform change / animation frame)
- `removeCollisionBody` — remove by id

Simulation loop iterates all bodies:
```typescript
for (const body of collisionBodies) {
  solveTriangleCollision(positions, invMass, n, body.mesh, body.hash, body.margin);
}
```

The avatar's collision mesh is sent as `id: '__avatar__'`. Per-body `friction` and `margin` (offset) are passed to `solveTriangleCollision` (currently hardcoded, needs parameterizing).

## Transform Gizmo + Live Re-mesh

Each `CollisionBody` renders as a `CollisionBodyMesh` component in the 3D viewport. When selected, drei `TransformControls` wraps it (translate/rotate/scale modes).

On transform change:
1. Update Redux state with new transform
2. Re-extract `CollisionMeshData` with world-space vertices
3. Send `updateCollisionBody` to worker

Throttled to ~10fps during drag, final precise update on drag end.

## Animation Playback

For GLB/FBX with embedded clips:
- `THREE.AnimationMixer` drives skeletal animation
- `useFrame` advances mixer when `playing`
- Posed mesh vertices re-extracted and sent to worker (~10fps throttle)

Playback controls in CollisionBodyPanel:
- Clip selector, play/pause/stop, time scrubber, loop toggle, speed multiplier

No in-app keyframing. Animation comes from the imported file.

## UI — CollisionBodyPanel

Panel in the 3D viewport sidebar, alongside AvatarPanel.

Per body:
- Name (editable), visibility toggle, collision toggle, delete
- Friction slider (0-1), collision offset slider
- Transform mode selector (Translate / Rotate / Scale)
- Animation controls (if file has clips)

Import: drag & drop or file picker (.obj, .fbx, .glb, .gltf) via existing `meshImporter.ts`.

## File Changes

| Action | File | What |
|--------|------|------|
| Create | `src/types/collisionBody.ts` | `CollisionBody` interface |
| Create | `src/store/collisionBodySlice.ts` | Redux slice — CRUD, selection, transform |
| Create | `src/components/Viewport3D/CollisionBodyPanel.tsx` | UI panel |
| Create | `src/components/Viewport3D/CollisionBodyMesh.tsx` | R3F mesh + gizmo + animation |
| Modify | `src/utils/cloth/triangleCollision.ts` | Add friction/margin params |
| Modify | `src/utils/cloth/wasm/wasmSolverWorker.ts` | Multi-body array + messages |
| Modify | `src/utils/cloth/wasm/wasmSolverClient.ts` | New methods |
| Modify | `src/utils/cloth/clothWorker.ts` | Same multi-body changes |
| Modify | `src/utils/cloth/clothWorkerClient.ts` | Same new methods |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Send avatar + bodies |
| Modify | `src/components/Viewport3D/Viewport3D.tsx` | Render bodies, panel toggle |
| Modify | `src/store/store.ts` | Register collisionBodySlice |

## What Stays Unchanged

Avatar system: AvatarPanel, avatarSlice, AvatarModel, avatarMeshExtractor, morphTargets, jointConstraints, vrmLoader. All untouched.
