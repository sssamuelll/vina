# ShortcutProvider + GarmentSimulation Split — Design

## Problem

1. **GarmentSimulation.tsx** is 862 lines mixing solver lifecycle, collision loading, meshing, warm-start, rendering, fit maps, pin tools, and 3D export. Untestable in isolation, hard to reason about.

2. **Keyboard shortcuts** are handled in 12 separate files with independent `addEventListener('keydown')` calls. No centralized registry, no user customization, potential event handler conflicts.

## Part 1: GarmentSimulation Split

Extract three hooks from the 862-line `MergedSimulation` component.

### `useSimulationLifecycle` (~250 lines)

Owns the solver cascade (GPU → WASM → CPU → Neural), client refs, start/stop/pause.

**Inputs:** `placedMeshes`, `seamInitData`, `fabricId`, `onFrame` callback, `onEdgeData` callback
**Outputs:** `clients: { cpu, wasm, gpu, neural }`, `stretchingIds`

The solver tier selection, `withTimeout` helper, dispatch of `setSolverTier`, and cleanup all live here. Currently lines 388–640.

### `useCollisionBodies` (~120 lines)

Loads avatar collision mesh and custom collision bodies into the active solver. Handles pin sync to WASM solver.

**Inputs:** `clients`, `avatarModelUrl`, `avatarHeight`, `collisionBodies`, `pinnedVertices`
**Side effects:** Calls `setCollisionMesh`, `updateCollisionBody`, `setPins` on active client

Currently the collision loading code is duplicated for WASM (lines 444–495) and CPU (lines 524–575). This hook deduplicates it by operating on whichever client is active.

### `useMeshing` (~120 lines)

Async piece meshing via `SimulationInitClient`, edit classification, and warm-start debounce.

**Inputs:** `pieces`, `globalParticleDistance`, `pieceParticleDistances`, `simulationState`, `clients`
**Outputs:** `pieceMeshes`

Currently lines 94–233. Warm-start path detects dimension-only edits and updates constraints in-place without full re-mesh.

### Remaining in `MergedSimulation` (~350 lines)

- Redux selectors
- Geometry building (`staticGeometry`, `placedMeshes` useMemos)
- Per-frame rendering (useFrame with fit map overlay)
- Pin tool click handler
- 3D export event listener
- Snapshot imperative handle
- JSX return

All rendering concern — appropriate for an R3F component.

## Part 2: ShortcutProvider

### Architecture

```
ShortcutRegistry (class)
  ├── defaults: Map<actionId, ShortcutDef>       // built-in bindings
  ├── overrides: Map<actionId, KeyCombo>          // user customizations (localStorage)
  ├── handlers: Map<actionId, () => void>         // runtime action handlers
  └── contexts: Map<actionId, ShortcutContext>    // when each shortcut is active

ShortcutProvider (React component)
  ├── one document.addEventListener('keydown', ...)
  ├── resolves key event → context → matching action → execute
  └── provides registry via React Context

useShortcut(actionId, handler, deps)              // register handler from any component
useShortcutRegistry()                             // access registry for settings UI
```

### ShortcutDef

```typescript
interface ShortcutDef {
  id: string;                    // e.g. 'simulation.start'
  key: string;                   // default key, e.g. 'Space'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;                 // human-readable, e.g. 'Start Simulation'
  category: ShortcutCategory;    // 'Simulation' | '3D Tools' | '2D Tools' | etc.
  context: ShortcutContext;      // 'global' | '2d' | '3d' | 'copilot'
}

type ShortcutContext = 'global' | '2d' | '3d' | 'copilot';
```

### Context Resolution

The active context is determined by which panel has focus:
- 2D editor focused → `'2d'` shortcuts active + `'global'`
- 3D viewport focused → `'3d'` shortcuts active + `'global'`
- Copilot panel focused → `'copilot'` shortcuts active + `'global'`
- Nothing focused → `'global'` only

### User Customization

- Overrides stored in `localStorage('openclo-shortcut-overrides')`
- Format: `Record<actionId, { key, ctrl?, shift?, alt? }>`
- Reset individual or all shortcuts to defaults
- Conflict detection: warn if a key combo is already bound in the same context

### Migration Path

1. Create `ShortcutRegistry` with all shortcuts from `useKeyboardShortcuts.ts` as defaults
2. Create `<ShortcutProvider>` wrapping `<App>` in `main.tsx`
3. Convert `useKeyboardShortcuts.ts` to register via `useShortcut()` calls
4. Migrate other 11 files to use `useShortcut()` or remove their listeners
5. Add settings UI (can be a later PR — the registry supports it from day one)

### What We Don't Build Now

- Settings UI for rebinding (registry supports it, but UI is a separate issue)
- Import/export of shortcut configs (.cfg file like CLO3D)

The registry and localStorage persistence are built now so the UI can be added later without touching the architecture.

## File Changes

| Action | File | What |
|--------|------|------|
| Create | `src/components/Viewport3D/useSimulationLifecycle.ts` | Solver cascade hook |
| Create | `src/components/Viewport3D/useCollisionBodies.ts` | Collision + pin sync hook |
| Create | `src/components/Viewport3D/useMeshing.ts` | Async meshing + warm-start hook |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Thin component consuming hooks |
| Create | `src/shortcuts/ShortcutRegistry.ts` | Registry class |
| Create | `src/shortcuts/ShortcutProvider.tsx` | React provider + single listener |
| Create | `src/shortcuts/useShortcut.ts` | Hook for registering shortcuts |
| Create | `src/shortcuts/defaults.ts` | Default shortcut definitions |
| Modify | `src/main.tsx` | Wrap app in ShortcutProvider |
| Modify | `src/hooks/useKeyboardShortcuts.ts` | Migrate to useShortcut() calls |
| Modify | 11 other files with keyboard listeners | Migrate or remove |

## Success Criteria

1. GarmentSimulation.tsx is under 400 lines — all rendering concern
2. `useSimulationLifecycle`, `useCollisionBodies`, `useMeshing` are independently testable
3. One `keydown` listener on `document` instead of 12+
4. All existing shortcuts work identically after migration
5. User overrides persist in localStorage
6. All existing tests pass
