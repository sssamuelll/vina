# Bundle Size Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the 3,509 KB monolith chunk into 4 separate chunks via `manualChunks` + dynamic `import()`, reducing initial load and enabling on-demand loading of optional features.

**Architecture:** Add Rollup `manualChunks` in `vite.config.ts` to separate Three.js into core/webgpu/addons chunks. Convert top-level imports of exporters (GLTFExporter, USDZExporter), loaders (FBXLoader, OBJLoader), animation utils (CCDIKSolver), and lighting utils (RectAreaLightUniformsLib) to dynamic `import()` calls at their usage sites.

**Tech Stack:** Vite/Rollup (build config), Three.js r183, React, TypeScript

---

### Task 1: Add manualChunks to vite.config.ts

**Files:**
- Modify: `vite.config.ts:35-56`

**Step 1: Add manualChunks configuration**

Add `build.rollupOptions.output.manualChunks` to the existing `defineConfig`:

```typescript
// In vite.config.ts, replace the build section (line 37-39):
build: {
  outDir: './dist',
  rollupOptions: {
    output: {
      manualChunks(id) {
        // Three.js addon loaders/exporters/animation → separate on-demand chunk
        if (id.includes('three/examples/jsm')) return 'three-addons';
        // WebGPU renderer + TSL + NodeMaterial → separate cacheable chunk
        if (id.includes('three/src/renderers/webgpu') ||
            id.includes('three/src/nodes') ||
            id.includes('three/webgpu')) return 'three-webgpu';
        // Three.js core → separate cacheable chunk
        if (id.includes('node_modules/three/')) return 'three-core';
      },
    },
  },
},
```

**Step 2: Run build to verify chunks split correctly**

Run: `npm run build 2>&1 | tail -15`

Expected: Output should show 4 separate chunks instead of one 3.5MB monolith:
- `three-core-*.js` (roughly 600-900 KB)
- `three-webgpu-*.js` (roughly 800-1000 KB)
- `three-addons-*.js` (roughly 200-500 KB)
- `index-*.js` (app code, roughly 150-300 KB)

The sum may be slightly larger than before due to chunk overhead, but no single chunk should be 3.5MB.

**Step 3: Run tests to verify nothing broke**

Run: `npm run test 2>&1 | tail -5`
Expected: All tests pass (2971+)

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No type errors

**Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "build: add manualChunks to split Three.js into separate cacheable chunks

Splits the 3.5MB monolith into three-core, three-webgpu, and three-addons
chunks for better cache efficiency and parallel loading.

Ref #294"
```

---

### Task 2: Dynamic import for GLTFExporter

**Files:**
- Modify: `src/utils/export/gltfExporter.ts:11`

**Step 1: Convert top-level GLTFExporter import to dynamic import**

The file currently has (line 11):
```typescript
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
```

Remove this line. Then change `exportToGLTF` (line 28-51) to dynamically import:

```typescript
export async function exportToGLTF(
  object: THREE.Object3D,
  options: GLTFExportOptions = {},
): Promise<ArrayBuffer | object> {
  const { binary = true, scale = 0.001 } = options;
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

  // Clone and scale to meters (glTF standard)
  const clone = object.clone(true);
  if (scale !== 1) {
    clone.scale.multiplyScalar(scale);
    clone.updateMatrixWorld(true);
  }

  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      clone,
      (result) => resolve(result),
      (error) => reject(error),
      { binary },
    );
  });
}
```

`downloadGLTF` doesn't need changes — it calls `exportToGLTF` which handles the dynamic import.

**Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No type errors

**Step 3: Run build**

Run: `npm run build 2>&1 | grep -E '(three-addons|gltf)' | head -5`
Expected: Build succeeds. GLTFExporter should be in the `three-addons` chunk.

**Step 4: Commit**

```bash
git add src/utils/export/gltfExporter.ts
git commit -m "perf: dynamic import GLTFExporter in gltfExporter.ts

Only loads GLTFExporter when user actually triggers a GLTF/GLB export,
removing it from the critical path.

Ref #294"
```

---

### Task 3: Dynamic import for USDZExporter

**Files:**
- Modify: `src/utils/export/usdzExporter.ts:11`

**Step 1: Convert top-level USDZExporter import to dynamic import**

The file currently has (line 11):
```typescript
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
```

Remove this line. Change `exportToUSDZ` (line 23-27) to:

```typescript
export async function exportToUSDZ(
  object: THREE.Object3D,
): Promise<Uint8Array> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
  const exporter = new USDZExporter();
  return await exporter.parseAsync(object);
}
```

`downloadUSDZ` doesn't need changes — it calls `exportToUSDZ`.

**Step 2: Run type check and build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: No errors, build succeeds

**Step 3: Commit**

```bash
git add src/utils/export/usdzExporter.ts
git commit -m "perf: dynamic import USDZExporter in usdzExporter.ts

Only loads USDZExporter when user actually triggers a USDZ export.

Ref #294"
```

---

### Task 4: Dynamic import for FBXLoader and OBJLoader in meshImporter.ts

**Files:**
- Modify: `src/utils/import/meshImporter.ts:12-13,134-146`

**Step 1: Remove top-level OBJLoader and FBXLoader imports**

Remove these two lines (lines 12-13):
```typescript
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
```

Keep `GLTFLoader` import (line 11) — it's always needed for default avatar.

**Step 2: Convert loadOBJ and loadFBX to use dynamic imports**

Replace `loadOBJ` (lines 134-139):
```typescript
async function loadOBJ(url: string): Promise<THREE.Group> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}
```

Replace `loadFBX` (lines 141-146):
```typescript
async function loadFBX(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const loader = new FBXLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}
```

**Step 3: Run type check and build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: No errors, build succeeds

**Step 4: Commit**

```bash
git add src/utils/import/meshImporter.ts
git commit -m "perf: dynamic import FBXLoader and OBJLoader in meshImporter.ts

FBX/OBJ loaders are only loaded when user imports a mesh in those formats.
GLTFLoader stays static as it's needed for the default avatar.

Ref #294"
```

---

### Task 5: Dynamic import for FBXLoader, OBJLoader, and CCDIKSolver in AvatarModel.tsx

**Files:**
- Modify: `src/components/Viewport3D/AvatarModel.tsx:3-6,210-264,417-548`

This is the most complex task. AvatarModel has 3 addon imports to convert:
- `OBJLoader` (line 4) — used in OBJ/FBX loading useEffect (line 216)
- `FBXLoader` (line 5) — used in OBJ/FBX loading useEffect (line 216)
- `CCDIKSolver` (line 6) — used in `initializeIK` (line 543) and typed in ref (line 177)

**Step 1: Remove top-level OBJLoader, FBXLoader, and CCDIKSolver imports**

Remove lines 4-6:
```typescript
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';
```

Keep `GLTFLoader` import (line 3) — used by `useLoader` which requires a static class reference.

**Step 2: Fix the CCDIKSolver type reference**

Line 177 uses `CCDIKSolver` as a type:
```typescript
const ikSolver = useRef<CCDIKSolver | null>(null);
```

Since we removed the import, change to:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ikSolver = useRef<any>(null);
```

This is acceptable because `ikSolver` is only used internally (`.update()` call on line 620) and never exposed.

**Step 3: Convert OBJ/FBX loading useEffect to use dynamic imports**

In the useEffect at line 210-264, replace line 216:
```typescript
// Before:
const loader = format === 'fbx' ? new FBXLoader() : new OBJLoader();
```

With dynamic import pattern. The entire useEffect body becomes:
```typescript
useEffect(() => {
    if (!isObjFbx) {
      setObjFbxScene(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        let result: THREE.Group;
        if (format === 'fbx') {
          const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
          result = await new FBXLoader().loadAsync(url);
        } else {
          const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
          result = await new OBJLoader().loadAsync(url);
        }
        if (cancelled) return;

        const group = result instanceof THREE.Group ? result : new THREE.Group().add(result);

        // Auto-scale: detect unit from bounding box and normalize
        const bbox = new THREE.Box3().setFromObject(group);
        const unit = detectUnit(bbox);
        const scale = UNIT_TO_METERS[unit] || 1;
        if (scale !== 1) {
          group.scale.multiplyScalar(scale);
          group.updateMatrixWorld(true);
        }

        // Auto-scale to target height
        const scaledBbox = new THREE.Box3().setFromObject(group);
        const currentHeight = scaledBbox.max.y - scaledBbox.min.y;
        if (currentHeight > 0) {
          const targetHeight = height;
          const ratio = targetHeight / currentHeight;
          if (ratio > 2 || ratio < 0.5) {
            group.scale.multiplyScalar(ratio);
            group.updateMatrixWorld(true);
          }
        }

        // Center feet on ground
        const finalBbox = new THREE.Box3().setFromObject(group);
        const center = new THREE.Vector3();
        finalBbox.getCenter(center);
        group.position.set(-center.x, -finalBbox.min.y, -center.z);

        // Ensure normals
        group.traverse(obj => {
          if (obj instanceof THREE.Mesh && obj.geometry && !obj.geometry.attributes.normal) {
            obj.geometry.computeVertexNormals();
          }
        });

        setObjFbxScene(group);
      } catch (err) {
        if (!cancelled) console.error(`[AvatarModel] Failed to load ${format}:`, err);
      }
    })();

    return () => { cancelled = true; };
  }, [url, isObjFbx, format, height]);
```

**Step 4: Convert initializeIK to use dynamic CCDIKSolver import**

Change `initializeIK` (line 417) to async and dynamically import CCDIKSolver:

```typescript
const initializeIK = async (activeScene: THREE.Object3D) => {
```

At line 543 where `CCDIKSolver` is constructed:
```typescript
// Before:
if (iks.length > 0) {
  ikSolver.current = new CCDIKSolver(mesh, iks);
}

// After:
if (iks.length > 0) {
  const { CCDIKSolver } = await import('three/examples/jsm/animation/CCDIKSolver.js');
  ikSolver.current = new CCDIKSolver(mesh, iks);
}
```

The caller at line 409 already doesn't await, which is fine — IK initialization is non-blocking:
```typescript
// Apply initial pose immediately after loading
initializeIK(scene);
requestAnimationFrame(() => applyPose.current());
```

**Step 5: Run type check and build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: No errors, build succeeds

**Step 6: Commit**

```bash
git add src/components/Viewport3D/AvatarModel.tsx
git commit -m "perf: dynamic import FBXLoader, OBJLoader, CCDIKSolver in AvatarModel

These addons are only loaded when:
- FBXLoader/OBJLoader: user has a non-GLTF avatar
- CCDIKSolver: IK chains are initialized (after avatar loads)

GLTFLoader stays static (required by useLoader for default avatar).

Ref #294"
```

---

### Task 6: Dynamic import for RectAreaLightUniformsLib in CustomLights.tsx

**Files:**
- Modify: `src/components/Viewport3D/CustomLights.tsx:6,9,14-18`

**Step 1: Convert to dynamic import with load-once guard**

Remove top-level import (line 6):
```typescript
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
```

Replace the initialization logic (lines 9, 14-18). The full `RectLight` component becomes:

```typescript
// Initialize RectAreaLight uniforms once globally
let rectAreaLightInitialized = false;

function RectLight({ light }: { light: CustomLight }) {
  const ref = useRef<THREE.RectAreaLight>(null);

  useEffect(() => {
    if (rectAreaLightInitialized) return;
    rectAreaLightInitialized = true;
    import('three/examples/jsm/lights/RectAreaLightUniformsLib.js').then(
      ({ RectAreaLightUniformsLib }) => {
        RectAreaLightUniformsLib.init();
      },
    );
  }, []);

  return (
    <rectAreaLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      width={light.width}
      height={light.height}
      position={light.position}
      rotation={new THREE.Euler(...light.rotation)}
    />
  );
}
```

**Step 2: Run type check and build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: No errors, build succeeds

**Step 3: Commit**

```bash
git add src/components/Viewport3D/CustomLights.tsx
git commit -m "perf: dynamic import RectAreaLightUniformsLib in CustomLights

Only loads the RectAreaLight uniform library when a rect light is
actually rendered in the scene.

Ref #294"
```

---

### Task 7: Final build verification and size comparison

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `npm run test 2>&1 | tail -10`
Expected: All 2971+ tests pass

**Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No type errors

**Step 3: Run production build and compare chunk sizes**

Run: `npm run build 2>&1 | tail -20`

Expected: No single chunk over ~1,100 KB. Should see multiple Three.js chunks:
- `three-core-*.js`
- `three-webgpu-*.js`
- `three-addons-*.js`
- `index-*.js` (app code)

Record the sizes for the PR description.

**Step 4: Compare with baseline**

Baseline (before optimization):
```
index-qvh3zZxM.js   3,509 KB (1,032 KB gz) — single monolith
index-DibrCr5W.js     159 KB (   47 KB gz) — app entry
```

Document the improvement in absolute and percentage terms.
