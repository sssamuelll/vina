# Bundle Size Optimization Design

## Problem

The production build produces a single 3,509 KB (1,032 KB gzipped) JavaScript chunk containing all of Three.js, WebGPU renderer, loaders, exporters, and application code. This impacts initial load time, parse cost, and cache efficiency.

## Goal

Split the monolith into 4 chunks via `manualChunks` and dynamic `import()`, reducing the initial page load from ~1,032 KB gz to ~580 KB gz and deferring optional features (exporters, mesh loaders) to on-demand loading.

## Current State

```
dist/assets/index-qvh3zZxM.js   3,509 KB (1,032 KB gz) — everything
dist/assets/index-DibrCr5W.js     159 KB (   47 KB gz) — app entry
```

### What's in the 3.5MB chunk

| Category | Examples | Always Needed? |
|----------|----------|----------------|
| Three.js core | Vector3, Mesh, BufferGeometry, MeshStandardMaterial | Yes |
| WebGPU renderer | WebGPURenderer, TSL compiler, NodeMaterial | Yes (at mount) |
| Loaders | GLTFLoader, FBXLoader, OBJLoader | GLTFLoader yes; FBX/OBJ on-demand |
| Exporters | GLTFExporter, USDZExporter | On-demand only |
| Animation | CCDIKSolver, SkeletonUtils | After avatar loads |
| Lighting | RectAreaLightUniformsLib | After scene setup |
| R3F + drei | Canvas, useFrame, OrbitControls | Yes |

## Design

### 1. manualChunks in vite.config.ts

Add rollup `manualChunks` to split Three.js into 3 separate cacheable chunks:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        // Three.js addon loaders/exporters → separate chunk
        if (id.includes('three/examples/jsm')) return 'three-addons';
        // WebGPU renderer + TSL + NodeMaterial → separate chunk
        if (id.includes('three/src/renderers/webgpu') ||
            id.includes('three/src/nodes') ||
            id.includes('three/webgpu')) return 'three-webgpu';
        // Three.js core → separate chunk
        if (id.includes('node_modules/three/')) return 'three-core';
      },
    },
  },
},
```

**Result**: 3 cache-independent chunks. Updating app code doesn't invalidate Three.js caches. Updating Three.js doesn't invalidate app code cache.

### 2. Dynamic import for exporters

`gltfExporter.ts` and `usdzExporter.ts` currently have top-level imports of `GLTFExporter` and `USDZExporter`. These are only called when the user explicitly clicks "Export". Convert to dynamic imports:

```typescript
// gltfExporter.ts — before
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// gltfExporter.ts — after
export async function exportToGLTF(object, options) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();
  // ...
}
```

Same pattern for `usdzExporter.ts`.

### 3. Dynamic import for FBX/OBJ loaders in meshImporter.ts

`meshImporter.ts` imports FBXLoader and OBJLoader at the top level. These are only used when the user imports a custom mesh. GLTFLoader stays static (used for default avatar on every session).

```typescript
// meshImporter.ts — before
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// meshImporter.ts — after
async function loadOBJ(url: string): Promise<THREE.Group> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  return new OBJLoader().loadAsync(url);
}
async function loadFBX(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  return new FBXLoader().loadAsync(url);
}
```

### 4. Dynamic import in AvatarModel.tsx

`AvatarModel.tsx` imports FBXLoader, OBJLoader, and CCDIKSolver at the top level. These are used conditionally based on the avatar file format.

- **GLTFLoader**: Keep static (default avatar is GLTF)
- **FBXLoader/OBJLoader**: Dynamic import, loaded only when user has an FBX/OBJ avatar
- **CCDIKSolver**: Dynamic import, loaded after avatar mesh is ready

Note: AvatarModel uses R3F's `useLoader` for GLTFLoader. FBX/OBJ paths already use custom loading logic, so dynamic import fits naturally.

### 5. Dynamic import in CustomLights.tsx

`RectAreaLightUniformsLib` is a one-time init call. Dynamic import with a load-once guard:

```typescript
let uniformsInitialized = false;

async function ensureRectAreaUniforms() {
  if (uniformsInitialized) return;
  const { RectAreaLightUniformsLib } = await import(
    'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
  );
  RectAreaLightUniformsLib.init();
  uniformsInitialized = true;
}
```

### 6. Expected results

| Chunk | Est. Size (gz) | Load Timing |
|-------|-----------------|-------------|
| `three-core.js` | ~280 KB | Immediate (parallel) |
| `three-webgpu.js` | ~320 KB | Immediate (parallel) |
| `index.js` (app) | ~200 KB | Immediate (parallel) |
| `three-addons.js` | ~130 KB | On-demand (export/import) |
| **Total initial** | **~800 KB** | **Down from 1,032 KB** |

Additional benefit: addons chunk (~130 KB gz) only loads when user triggers export or custom mesh import — may never load at all for many sessions.

### 7. Files to modify

| File | Change |
|------|--------|
| `vite.config.ts` | Add `manualChunks` in `build.rollupOptions.output` |
| `src/utils/export/gltfExporter.ts` | Dynamic `import()` for GLTFExporter |
| `src/utils/export/usdzExporter.ts` | Dynamic `import()` for USDZExporter |
| `src/utils/import/meshImporter.ts` | Dynamic `import()` for FBXLoader, OBJLoader |
| `src/components/Viewport3D/AvatarModel.tsx` | Dynamic `import()` for FBXLoader, OBJLoader, CCDIKSolver |
| `src/components/Viewport3D/CustomLights.tsx` | Dynamic `import()` for RectAreaLightUniformsLib |

### 8. What stays static (not changed)

- `GLTFLoader` — always needed for default avatar
- `WebGPURenderer` from `three/webgpu` — needed at Canvas mount (R3F sync factory)
- `three` core — always needed
- `@react-three/fiber` and `@react-three/drei` — always needed

### 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Dynamic import fails (network error) | Wrap in try/catch, show user-friendly error in export/import dialogs |
| First export/import is slower (~200ms) | Acceptable — user is already waiting for file I/O |
| manualChunks splits break at Three.js update | Test build after dependency updates; chunk names are stable |
| R3F useLoader incompatible with dynamic import | Only apply dynamic import to non-useLoader paths (FBX/OBJ custom logic) |

## Related

- Issue #294 — Bundle size: code-split three/webgpu
- PR #287 — WebGPU migration (introduced three/webgpu import)
