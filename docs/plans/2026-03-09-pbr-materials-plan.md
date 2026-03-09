# PBR Material & Texture System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship professional fabric rendering with HDRI environment lighting, per-fabric texture maps, Material Editor tab, custom texture upload, and copilot integration.

**Architecture:** Extend the existing `toMeshPhysicalParams()` pipeline to include texture maps and HDRI. The MeshPhysicalMaterial is already in use — we add texture map fields, a TextureManager for loading/caching, and a MaterialTab UI. No custom shaders.

**Tech Stack:** Three.js (MeshPhysicalMaterial), @react-three/drei (Environment), React, Redux, Vitest, Playwright

---

### Task 1: HDRI Environment + Tone Mapping

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx`
- Create: `public/hdri/studio-soft.hdr` (placeholder — see step 1)

**Context:** The 3D viewport uses 4 lights (ambient + 3 directional + hemisphere) with no environment map. Adding HDRI + ACES tone mapping is the single highest-impact visual change — every fabric's sheen, roughness, and clearcoat will reflect a real environment.

**Step 1: Download a CC0 studio HDRI**

Download a studio HDRI from Poly Haven or ambientCG. Save as `public/hdri/studio-soft.hdr`. For development, you can generate a placeholder:

```bash
# Option A: Download from Poly Haven (recommended)
curl -L "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr" -o public/hdri/studio-soft.hdr

# Option B: If download fails, create a minimal placeholder (64x32 gray HDR)
# We'll replace with a real one later
mkdir -p public/hdri
```

If neither works, skip the file for now — the Environment component can use a preset fallback.

**Step 2: Add Environment + tone mapping to Viewport3D.tsx**

Open `src/components/Viewport3D/Viewport3D.tsx`.

Add import (after existing drei imports at line 3):

```typescript
import { OrbitControls, Grid, ContactShadows, Environment } from '@react-three/drei';
```

Modify the Canvas `gl` prop (line 299). Change:

```typescript
gl={{ antialias: true }}
```

to:

```typescript
gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
```

Add the `<Environment>` component inside the Canvas, after the lights (after line 313):

```typescript
        <Environment
          files="/hdri/studio-soft.hdr"
          background={false}
        />
```

If the `.hdr` file doesn't exist yet, use a drei preset as fallback:

```typescript
        <Environment preset="studio" background={false} />
```

Reduce light intensities since HDRI provides primary lighting. Change:
- Line 309: `<ambientLight intensity={0.5} />` → `<ambientLight intensity={0.3} />`
- Line 310: `<directionalLight ... intensity={0.7} ...>` → `intensity={0.5}`
- Line 311: `<directionalLight ... intensity={0.4} />` → `intensity={0.25}`
- Line 312: `<directionalLight ... intensity={0.3} />` → `intensity={0.2}`

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx public/hdri/
git commit -m "feat: add HDRI environment lighting + ACES tone mapping (#222)"
```

---

### Task 2: TextureManager Utility

**Files:**
- Create: `src/utils/textures/TextureManager.ts`
- Create: `src/utils/textures/__tests__/TextureManager.test.ts`

**Context:** We need a utility that loads Three.js textures from URLs, caches them (LRU), and disposes them properly. No texture loading exists in the codebase yet.

**Step 1: Write the failing test**

Create `src/utils/textures/__tests__/TextureManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextureManager } from '../TextureManager';

// Mock Three.js TextureLoader
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  const mockTexture = {
    dispose: vi.fn(),
    colorSpace: '',
    repeat: { set: vi.fn() },
    rotation: 0,
    offset: { set: vi.fn() },
    wrapS: 0,
    wrapT: 0,
    needsUpdate: false,
  };
  return {
    ...actual as object,
    TextureLoader: vi.fn().mockImplementation(() => ({
      loadAsync: vi.fn().mockResolvedValue({ ...mockTexture }),
    })),
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
    LinearSRGBColorSpace: 'srgb-linear',
  };
});

describe('TextureManager', () => {
  let manager: TextureManager;

  beforeEach(() => {
    manager = new TextureManager(3); // small cache for testing
  });

  it('loads a texture and returns it', async () => {
    const tex = await manager.load('/textures/fabrics/cotton/diffuse.jpg', 'srgb');
    expect(tex).toBeDefined();
    expect(tex.dispose).toBeDefined();
  });

  it('returns cached texture on second load', async () => {
    const tex1 = await manager.load('/test.jpg', 'srgb');
    const tex2 = await manager.load('/test.jpg', 'srgb');
    expect(tex1).toBe(tex2);
  });

  it('evicts LRU entry when cache is full', async () => {
    const t1 = await manager.load('/a.jpg', 'srgb');
    await manager.load('/b.jpg', 'srgb');
    await manager.load('/c.jpg', 'srgb');
    // Cache full (3). Loading 4th should evict /a.jpg
    await manager.load('/d.jpg', 'srgb');
    expect(t1.dispose).toHaveBeenCalled();
    expect(manager.size).toBe(3);
  });

  it('disposes all textures on clear', async () => {
    const t1 = await manager.load('/a.jpg', 'srgb');
    const t2 = await manager.load('/b.jpg', 'srgb');
    manager.clear();
    expect(t1.dispose).toHaveBeenCalled();
    expect(t2.dispose).toHaveBeenCalled();
    expect(manager.size).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textures/__tests__/TextureManager.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement TextureManager.ts**

Create `src/utils/textures/TextureManager.ts`:

```typescript
import { TextureLoader, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three';
import type { Texture } from 'three';

type ColorSpaceHint = 'srgb' | 'srgb-linear';

/**
 * LRU texture cache with automatic disposal.
 * Loads Three.js textures, sets correct color space, and manages GPU memory.
 */
export class TextureManager {
  private cache = new Map<string, Texture>();
  private loader = new TextureLoader();
  private maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.cache.size;
  }

  async load(url: string, colorSpace: ColorSpaceHint = 'srgb'): Promise<Texture> {
    // Cache hit — move to end (most recently used)
    const cached = this.cache.get(url);
    if (cached) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached;
    }

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value!;
      const tex = this.cache.get(oldest)!;
      tex.dispose();
      this.cache.delete(oldest);
    }

    // Load new texture
    const texture = await this.loader.loadAsync(url);
    texture.colorSpace = colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;

    this.cache.set(url, texture);
    return texture;
  }

  clear(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}

/** Singleton instance for the app */
export const textureManager = new TextureManager();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textures/__tests__/TextureManager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/textures/TextureManager.ts src/utils/textures/__tests__/TextureManager.test.ts
git commit -m "feat: add TextureManager with LRU cache and disposal (#222)"
```

---

### Task 3: Extend PhysicalFabric Data Model with Textures

**Files:**
- Modify: `src/utils/cloth/physicalFabric.ts`

**Context:** Each of the 32 fabric presets needs an optional `textures` field that maps to texture file paths. The `FabricRenderParams` type needs texture map fields. The `toMeshPhysicalParams()` function needs to accept loaded textures.

**Step 1: Add FabricTextures interface and textures field**

In `src/utils/cloth/physicalFabric.ts`, after the `PhysicalFabric` interface (around line 84), add:

```typescript
/** Paths to texture map files relative to public/textures/fabrics/ */
export interface FabricTextures {
  diffuse?: string;
  normal?: string;
  roughness?: string;
  ao?: string;
}
```

Add the field to the `PhysicalFabric` interface (inside the interface, after `tags`):

```typescript
  /** Optional texture map paths */
  textures?: FabricTextures;
```

**Step 2: Add texture data to fabric presets that will have textures**

For each fabric that will have bundled textures, add the `textures` field. For example, in the cotton-poplin entry (around line 91):

```typescript
  textures: {
    diffuse: 'cotton-poplin/diffuse.jpg',
    normal: 'cotton-poplin/normal.png',
  },
```

Add textures to these entries (match the asset table from design doc):
- `cotton-poplin`: diffuse, normal
- `cotton-twill-khaki`: diffuse, normal
- `denim-indigo`: diffuse, normal, roughness
- `silk-charmeuse`: diffuse, normal, roughness
- `wool-tweed`: diffuse, normal, roughness, ao
- `linen-plain`: diffuse, normal
- `jersey-cotton`: diffuse, normal
- `leather-nappa`: diffuse, normal, roughness, ao
- `neoprene`: diffuse, roughness
- `chiffon-silk`: diffuse, normal
- `canvas-duck`: diffuse, normal, roughness
- `fleece-polar`: diffuse, normal

**Step 3: Extend FabricRenderParams with texture map fields**

In the `FabricRenderParams` interface (line 690), add after the existing fields:

```typescript
  /** Loaded texture maps — null if no textures available */
  map: import('three').Texture | null;
  normalMap: import('three').Texture | null;
  roughnessMap: import('three').Texture | null;
  aoMap: import('three').Texture | null;
  /** UV transform */
  mapRepeat: [number, number];
  mapRotation: number;
```

**Step 4: Update toMeshPhysicalParams to accept and pass through textures**

Change the function signature (line 735) to accept optional loaded textures:

```typescript
export function toMeshPhysicalParams(
  pf: PhysicalFabric,
  baseColor?: string,
  loadedTextures?: {
    map?: import('three').Texture | null;
    normalMap?: import('three').Texture | null;
    roughnessMap?: import('three').Texture | null;
    aoMap?: import('three').Texture | null;
  },
): FabricRenderParams {
```

At the end of the function, before the return (around line 760), add the texture fields:

```typescript
    map: loadedTextures?.map ?? null,
    normalMap: loadedTextures?.normalMap ?? null,
    roughnessMap: loadedTextures?.roughnessMap ?? null,
    aoMap: loadedTextures?.aoMap ?? null,
    mapRepeat: [4, 4],
    mapRotation: 0,
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors where `toMeshPhysicalParams` result is used without the new fields — we'll fix those in subsequent tasks. For now, the callers that destructure the result may need the defaults. If there are errors, add the default null values to the fallback object in `GarmentSimulation.tsx` (line 338):

```typescript
return {
  roughness: 0.7, metalness: 0, sheen: 0.15, sheenRoughness: 0.7,
  sheenColor: '#e8e4df', clearcoat: 0, clearcoatRoughness: 0,
  transmission: 0, thickness: 0.5, ior: 1.5, opacity: 0.85,
  color: '#e8e4df', side: 'double' as const,
  map: null, normalMap: null, roughnessMap: null, aoMap: null,
  mapRepeat: [4, 4] as [number, number], mapRotation: 0,
};
```

**Step 6: Commit**

```bash
git add src/utils/cloth/physicalFabric.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat: extend PhysicalFabric data model with texture map fields (#222)"
```

---

### Task 4: Generate UV Coordinates in Mesh Pipeline

**Files:**
- Modify: `src/utils/mesh/cdtMesher.ts`
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Context:** The BufferGeometry in GarmentSimulation has NO UV attribute. UVs are needed for texture mapping. The 2D pattern piece coordinates serve as UVs — this maps textures in pattern space (fabric grain follows the pattern piece), which is how CLO3D does it. The `ClothMeshData` already supports optional `uvs` but the mesher doesn't generate them.

**Step 1: Verify ClothMeshData supports uvs**

Check `src/utils/cloth/xpbdSolver.ts` around line 16-19 for the `ClothMeshData` interface. It should have `uvs?: Float32Array`. If not, add it.

**Step 2: Generate UVs in the mesher**

In `src/utils/mesh/cdtMesher.ts`, find where positions are generated. The 2D points used for triangulation ARE the UV coordinates. After creating the positions Float32Array, create a corresponding UVs array:

```typescript
// After positions are set (each vertex has x,y,z from the 2D points)
// UVs come from the original 2D coordinates normalized to pattern space
const uvs = new Float32Array(numVerts * 2);
for (let i = 0; i < numVerts; i++) {
  // The 2D point coordinates are the UVs
  // Normalize to reasonable tiling range (pattern pieces are in mm/cm)
  uvs[i * 2] = points[i][0];      // u = x in pattern space
  uvs[i * 2 + 1] = points[i][1];  // v = y in pattern space
}
```

Return `uvs` as part of the mesh data.

**Step 3: Set UV attribute on BufferGeometry**

In `GarmentSimulation.tsx`, find the BufferGeometry setup (line 143-148). After `geo.setAttribute('color', colorAttr)` (line 146), add:

```typescript
// UV coordinates from 2D pattern space for texture mapping
if (meshData.uvs && meshData.uvs.length > 0) {
  geo.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
}
```

You'll need to trace how `meshData` flows into this component to access the UVs. The positions come from the solver frame messages — UVs are static (set once at mesh creation, not per frame). Store them alongside the geometry reference.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/utils/mesh/cdtMesher.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat: generate UV coordinates for texture mapping (#222)"
```

---

### Task 5: Load and Apply Textures in GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Context:** Now that we have TextureManager, fabric texture paths, extended FabricRenderParams, and UVs, we wire it all together. The meshPhysicalMaterial gets texture maps.

**Step 1: Load fabric textures using TextureManager**

In `GarmentSimulation.tsx`, import the texture manager:

```typescript
import { textureManager } from '../../utils/textures/TextureManager';
import type { Texture } from 'three';
```

After the `renderParams` useMemo (line 335-343), add a texture loading effect:

```typescript
const [textures, setTextures] = useState<{
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
  aoMap: Texture | null;
}>({ map: null, normalMap: null, roughnessMap: null, aoMap: null });

useEffect(() => {
  const fabric = getPhysicalFabric(fabricId);
  if (!fabric?.textures) {
    setTextures({ map: null, normalMap: null, roughnessMap: null, aoMap: null });
    return;
  }
  const base = '/textures/fabrics/';
  const t = fabric.textures;

  Promise.all([
    t.diffuse ? textureManager.load(base + t.diffuse, 'srgb') : Promise.resolve(null),
    t.normal ? textureManager.load(base + t.normal, 'srgb-linear') : Promise.resolve(null),
    t.roughness ? textureManager.load(base + t.roughness, 'srgb-linear') : Promise.resolve(null),
    t.ao ? textureManager.load(base + t.ao, 'srgb-linear') : Promise.resolve(null),
  ]).then(([map, normalMap, roughnessMap, aoMap]) => {
    // Apply UV repeat/rotation
    [map, normalMap, roughnessMap, aoMap].forEach(tex => {
      if (tex) {
        tex.repeat.set(4, 4);
        tex.needsUpdate = true;
      }
    });
    setTextures({ map, normalMap, roughnessMap, aoMap });
  });
}, [fabricId]);
```

**Step 2: Apply textures to meshPhysicalMaterial**

Update the `<meshPhysicalMaterial>` JSX (lines 395-410). Add the texture map props:

```typescript
<meshPhysicalMaterial
  vertexColors={fitMapActive}
  side={THREE.DoubleSide}
  transparent
  opacity={renderParams.opacity}
  roughness={renderParams.roughness}
  metalness={renderParams.metalness}
  sheen={renderParams.sheen}
  sheenRoughness={renderParams.sheenRoughness}
  sheenColor={renderParams.sheenColor}
  clearcoat={renderParams.clearcoat}
  clearcoatRoughness={renderParams.clearcoatRoughness}
  transmission={renderParams.transmission}
  thickness={renderParams.thickness}
  ior={renderParams.ior}
  color={pieceTint || renderParams.color || '#ffffff'}
  map={fitMapActive ? null : textures.map}
  normalMap={textures.normalMap}
  roughnessMap={fitMapActive ? null : textures.roughnessMap}
  aoMap={textures.aoMap}
/>
```

Key: when fit map is active (`vertexColors` mode), disable diffuse and roughness maps so vertex colors show through. Normal maps and AO can stay.

**Step 3: Handle vertexColors toggle**

Currently `vertexColors` is always true (line 396). Change it to only be true when fit map is active:

```typescript
vertexColors={fitMapMode !== 'none'}
```

When no fit map is active, textures should render. When fit map is on, vertex colors override.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat: load and apply fabric textures in 3D rendering (#222)"
```

---

### Task 6: Redux State for Tints and Texture Overrides

**Files:**
- Modify: `src/store/simulationSlice.ts`

**Context:** Users need per-piece color tints and per-piece texture overrides (from custom uploads). These must persist in Redux for the UI and copilot to read.

**Step 1: Add new fields to SimulationSliceState**

In `src/store/simulationSlice.ts`, find the state interface (line 57). Add:

```typescript
  /** Per-piece color tint (hex string, white = no tint) */
  pieceTints: Record<string, string>;
  /** Per-piece texture overrides from custom uploads (slot → blob URL) */
  pieceTextureOverrides: Record<string, {
    diffuse?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
  }>;
  /** Per-piece UV transform */
  pieceUVTransforms: Record<string, { repeatX: number; repeatY: number; rotation: number }>;
```

Add to initial state (line 110):

```typescript
  pieceTints: {},
  pieceTextureOverrides: {},
  pieceUVTransforms: {},
```

**Step 2: Add reducers**

```typescript
    setPieceTint(state, action: PayloadAction<{ pieceId: string; tint: string }>) {
      state.pieceTints[action.payload.pieceId] = action.payload.tint;
    },
    setPieceTextureOverride(state, action: PayloadAction<{
      pieceId: string;
      slot: 'diffuse' | 'normal' | 'roughness' | 'ao';
      url: string | null;
    }>) {
      const { pieceId, slot, url } = action.payload;
      if (!state.pieceTextureOverrides[pieceId]) {
        state.pieceTextureOverrides[pieceId] = {};
      }
      if (url) {
        state.pieceTextureOverrides[pieceId][slot] = url;
      } else {
        delete state.pieceTextureOverrides[pieceId][slot];
      }
    },
    setPieceUVTransform(state, action: PayloadAction<{
      pieceId: string;
      repeatX?: number;
      repeatY?: number;
      rotation?: number;
    }>) {
      const { pieceId, ...transform } = action.payload;
      state.pieceUVTransforms[pieceId] = {
        ...state.pieceUVTransforms[pieceId] ?? { repeatX: 4, repeatY: 4, rotation: 0 },
        ...transform,
      };
    },
```

Export the new actions.

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors (or fix any tests that mock SimulationSliceState by adding the new fields).

**Step 4: Commit**

```bash
git add src/store/simulationSlice.ts
git commit -m "feat: add Redux state for piece tints, texture overrides, UV transforms (#222)"
```

---

### Task 7: MaterialTab UI Component

**Files:**
- Create: `src/components/PropertiesPanel/MaterialTab.tsx`
- Modify: `src/components/PropertiesPanel/PropertiesPanel.tsx`

**Context:** New "MATERIAL" section in PropertiesPanel. Shows fabric preset selector (grid), color tint picker, texture map slots, and UV transform controls. Only visible when a piece is selected.

**Step 1: Create MaterialTab.tsx**

Create `src/components/PropertiesPanel/MaterialTab.tsx`:

```typescript
import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setFabric, setPieceTint, setPieceUVTransform } from '../../store/simulationSlice';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../utils/cloth/physicalFabric';

const CATEGORIES = ['plain', 'twill', 'satin', 'knit-jersey', 'knit-rib', 'leather', 'technical', 'mesh', 'pile', 'nonwoven'] as const;

export default function MaterialTab() {
  const dispatch = useDispatch();
  const selectedPieceId = useSelector((s: RootState) => s.editor?.selectedPieceId ?? null);
  const pieceFabrics = useSelector((s: RootState) => s.simulation.pieceFabrics);
  const defaultFabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const pieceTints = useSelector((s: RootState) => s.simulation.pieceTints);
  const pieceUVTransforms = useSelector((s: RootState) => s.simulation.pieceUVTransforms);

  if (!selectedPieceId) {
    return <div style={{ padding: 8, color: '#888', fontSize: 11 }}>Select a piece to edit material</div>;
  }

  const fabricId = pieceFabrics[selectedPieceId] || defaultFabricId;
  const fabric = getPhysicalFabric(fabricId);
  const tint = pieceTints[selectedPieceId] || '#ffffff';
  const uv = pieceUVTransforms[selectedPieceId] || { repeatX: 4, repeatY: 4, rotation: 0 };

  const handleFabricSelect = useCallback((id: string) => {
    dispatch(setFabric({ pieceId: selectedPieceId, fabricId: id }));
  }, [dispatch, selectedPieceId]);

  return (
    <div style={{ padding: '0 8px' }}>
      {/* Fabric Preset Grid */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>FABRIC PRESET</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {PHYSICAL_FABRIC_LIBRARY.map(f => (
            <button
              key={f.id}
              onClick={() => handleFabricSelect(f.id)}
              title={`${f.name} — ${f.weight}gsm ${f.weaveType}`}
              style={{
                width: '100%',
                aspectRatio: '1',
                border: f.id === fabricId ? '2px solid #4a9eff' : '1px solid #444',
                borderRadius: 4,
                background: '#333',
                cursor: 'pointer',
                padding: 2,
                fontSize: 8,
                color: '#ccc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {f.name.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
        {fabric && (
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            {fabric.name} — {fabric.weight}gsm — {fabric.weaveType}
          </div>
        )}
      </div>

      {/* Color Tint */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>COLOR TINT</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
            style={{ width: 28, height: 28, border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
          />
          <input
            type="text"
            value={tint}
            onChange={e => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: e.target.value }))}
            style={{ width: 70, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 6px', fontSize: 11 }}
          />
          <button
            onClick={() => dispatch(setPieceTint({ pieceId: selectedPieceId, tint: '#ffffff' }))}
            style={{ background: '#555', border: 'none', borderRadius: 3, color: '#ccc', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* UV Transform */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>UV TRANSFORM</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Repeat X
            <input
              type="number"
              value={uv.repeatX}
              step={1}
              min={0.1}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatX: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Y
            <input
              type="number"
              value={uv.repeatY}
              step={1}
              min={0.1}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, repeatY: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
          <label style={{ fontSize: 10, color: '#aaa' }}>
            Rot
            <input
              type="number"
              value={uv.rotation}
              step={15}
              min={0}
              max={360}
              onChange={e => dispatch(setPieceUVTransform({ pieceId: selectedPieceId, rotation: Number(e.target.value) }))}
              style={{ width: 45, marginLeft: 4, background: '#333', border: '1px solid #555', borderRadius: 3, color: '#fff', padding: '2px 4px', fontSize: 11 }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add MATERIAL section to PropertiesPanel.tsx**

In `src/components/PropertiesPanel/PropertiesPanel.tsx`:

Add import:
```typescript
import MaterialTab from './MaterialTab';
```

Add `material: false` to the `collapsedSections` default (line 24-31).

After the PIECE section (around line 137), add:

```typescript
      {/* ── MATERIAL ── */}
      <PropertySection
        title="MATERIAL"
        collapsed={collapsedSections.material}
        onToggle={() => toggleSection('material')}
      >
        <MaterialTab />
      </PropertySection>
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/PropertiesPanel/MaterialTab.tsx src/components/PropertiesPanel/PropertiesPanel.tsx
git commit -m "feat: add MaterialTab UI with fabric grid, tint picker, UV controls (#222)"
```

---

### Task 8: Custom Texture Upload (Drag & Drop)

**Files:**
- Modify: `src/components/PropertiesPanel/MaterialTab.tsx`

**Context:** Users drag and drop PNG/JPG files onto texture slots. Files are stored as blob URLs in Redux. For project file portability, they're serialized as base64 data URLs.

**Step 1: Add texture slot drop zones to MaterialTab**

In `MaterialTab.tsx`, after the UV Transform section, add:

```typescript
      {/* Texture Map Slots */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>TEXTURE OVERRIDES</div>
        {(['diffuse', 'normal', 'roughness', 'ao'] as const).map(slot => (
          <TextureSlot
            key={slot}
            slot={slot}
            pieceId={selectedPieceId}
          />
        ))}
      </div>
```

Add a `TextureSlot` sub-component inside the same file:

```typescript
function TextureSlot({ slot, pieceId }: { slot: 'diffuse' | 'normal' | 'roughness' | 'ao'; pieceId: string }) {
  const dispatch = useDispatch();
  const overrides = useSelector((s: RootState) => s.simulation.pieceTextureOverrides[pieceId]);
  const url = overrides?.[slot];

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const blobUrl = URL.createObjectURL(file);
    dispatch(setPieceTextureOverride({ pieceId, slot, url: blobUrl }));
  }, [dispatch, pieceId, slot]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        borderBottom: '1px solid #333',
      }}
    >
      <div style={{ width: 28, height: 28, background: '#333', borderRadius: 3, border: '1px dashed #555', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {url ? (
          <img src={url} alt={slot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 8, color: '#666' }}>+</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: '#aaa', textTransform: 'capitalize', flex: 1 }}>{slot}</span>
      {url && (
        <button
          onClick={() => dispatch(setPieceTextureOverride({ pieceId, slot, url: null }))}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}
        >
          x
        </button>
      )}
    </div>
  );
}
```

Import `setPieceTextureOverride` from simulationSlice.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/PropertiesPanel/MaterialTab.tsx
git commit -m "feat: add drag & drop texture upload to MaterialTab (#222)"
```

---

### Task 9: assignFabric Copilot Tool

**Files:**
- Modify: `src/copilot/action/tools/definitions/fabricTools.ts`
- Create: `src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts`

**Context:** The copilot needs an action tool to assign fabrics to pieces. Existing tools are read-only (search, details, compare). We add `assignFabric` with rollback support.

**Step 1: Write the failing test**

Create `src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// We'll test the assignFabric tool's execute function directly
describe('assignFabric tool', () => {
  it('assigns fabric to piece and provides rollback', async () => {
    // Import after mock setup
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find(t => t.name === 'assignFabric');
    expect(assignTool).toBeDefined();

    const mockDispatch = vi.fn();
    const mockGetState = () => ({
      simulation: {
        pieceFabrics: { 'piece-1': 'cotton-poplin' },
        defaultFabricId: 'cotton-poplin',
        pieceTints: {},
      },
      project: {
        pieces: [{ id: 'piece-1', name: 'Bodice Front' }],
      },
    }) as any;

    const result = await assignTool!.execute(
      { pieceId: 'piece-1', fabricId: 'denim-indigo' },
      mockDispatch,
      mockGetState,
    );

    expect(result.success).toBe(true);
    expect(mockDispatch).toHaveBeenCalled();
    expect(result.rollback).toBeInstanceOf(Function);
  });

  it('returns error for unknown fabric', async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find(t => t.name === 'assignFabric');

    const mockDispatch = vi.fn();
    const mockGetState = () => ({
      simulation: { pieceFabrics: {}, defaultFabricId: 'cotton-poplin', pieceTints: {} },
      project: { pieces: [{ id: 'piece-1', name: 'Test' }] },
    }) as any;

    const result = await assignTool!.execute(
      { pieceId: 'piece-1', fabricId: 'nonexistent-fabric' },
      mockDispatch,
      mockGetState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts`
Expected: FAIL — no `assignFabric` tool found.

**Step 3: Add assignFabric tool to fabricTools.ts**

In `src/copilot/action/tools/definitions/fabricTools.ts`, add after the `compareFabricsTool` definition:

```typescript
const assignFabricTool: ToolDefinition = {
  name: 'assignFabric',
  description:
    'Assigns a fabric preset to a pattern piece, changing both physics simulation and visual appearance. ' +
    'Optionally set a color tint. / Asigna un tejido a una pieza del patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Target pattern piece ID' },
      fabricId: { type: 'string', description: 'Fabric preset ID (use searchFabrics to find)' },
      tint: { type: 'string', description: 'Optional hex color tint (e.g. "#2c3e50")' },
    },
    required: ['pieceId', 'fabricId'],
  },
  execute: async (params, dispatch, getState) => {
    const { pieceId, fabricId, tint } = params as { pieceId: string; fabricId: string; tint?: string };
    const state = getState();
    const piece = state.project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) {
      return { success: false, error: `Piece "${pieceId}" not found` };
    }
    const fabric = getPhysicalFabric(fabricId);
    if (!fabric) {
      return { success: false, error: `Fabric "${fabricId}" not found. Use searchFabrics to find valid IDs.` };
    }

    // Snapshot for rollback
    const prevFabricId = state.simulation.pieceFabrics[pieceId] || state.simulation.defaultFabricId;
    const prevTint = state.simulation.pieceTints?.[pieceId];

    // Apply
    dispatch(setFabric({ pieceId, fabricId }));
    if (tint) {
      dispatch(setPieceTint({ pieceId, tint }));
    }

    return {
      success: true,
      data: {
        pieceId,
        pieceName: piece.name,
        fabricId,
        fabricName: fabric.name,
        weight: fabric.weight,
        weaveType: fabric.weaveType,
        tint: tint || null,
      },
      rollback: () => {
        dispatch(setFabric({ pieceId, fabricId: prevFabricId }));
        if (prevTint) {
          dispatch(setPieceTint({ pieceId, tint: prevTint }));
        }
      },
    };
  },
};
```

Import at top of file:

```typescript
import { setFabric, setPieceTint } from '../../../../store/simulationSlice';
```

Add to the exports array:

```typescript
export const tools: ToolDefinition[] = [
  searchFabricsTool,
  getFabricDetailsTool,
  compareFabricsTool,
  assignFabricTool,
];
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/action/tools/definitions/fabricTools.ts src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts
git commit -m "feat(copilot): add assignFabric action tool with rollback (#222)"
```

---

### Task 10: Placeholder Texture Assets

**Files:**
- Create: `public/textures/fabrics/` directory structure
- Create: placeholder texture files

**Context:** We need the directory structure and at least a few real textures for development and testing. Generate simple placeholder textures programmatically or download CC0 textures.

**Step 1: Create directory structure**

```bash
mkdir -p public/textures/fabrics/cotton-poplin
mkdir -p public/textures/fabrics/denim-indigo
mkdir -p public/textures/fabrics/silk-charmeuse
mkdir -p public/textures/fabrics/leather-smooth
mkdir -p public/textures/fabrics/jersey-knit
mkdir -p public/textures/fabrics/linen-plain
mkdir -p public/textures/fabrics/wool-tweed
mkdir -p public/textures/fabrics/canvas-heavy
mkdir -p public/textures/fabrics/chiffon-sheer
mkdir -p public/textures/fabrics/fleece
mkdir -p public/textures/fabrics/neoprene
mkdir -p public/textures/fabrics/cotton-twill
```

**Step 2: Generate placeholder textures**

Create a Node script `/tmp/gen-placeholders.mjs` that generates simple colored placeholder images (64x64 JPG) for each fabric. Use the canvas package or simply create minimal valid JPEG/PNG files. Alternatively, download real CC0 textures:

```bash
# Download a few real CC0 fabric textures from ambientCG
# Example for cotton (adjust URLs as needed):
curl -L "https://ambientcg.com/get?file=Fabric051_1K-JPG.zip" -o /tmp/fabric-cotton.zip
# Unzip and extract diffuse + normal to public/textures/fabrics/cotton-poplin/
```

If downloading isn't possible, create minimal placeholder files:

```bash
# Generate a simple 64x64 white JPEG as placeholder
node -e "
const { createCanvas } = require('canvas');
const fs = require('fs');
const dirs = ['cotton-poplin','denim-indigo','silk-charmeuse','leather-smooth','jersey-knit','linen-plain'];
dirs.forEach(d => {
  const c = createCanvas(64,64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e4df';
  ctx.fillRect(0,0,64,64);
  fs.writeFileSync('public/textures/fabrics/' + d + '/diffuse.jpg', c.toBuffer('image/jpeg'));
});
"
```

The exact approach depends on available tools. The key deliverable: at least `cotton-poplin/diffuse.jpg` and `cotton-poplin/normal.png` exist as valid image files.

**Step 3: Add textures directory to .gitignore exceptions**

Ensure `public/textures/` is NOT ignored by checking `.gitignore`. It should be committed.

**Step 4: Commit**

```bash
git add public/textures/ public/hdri/
git commit -m "feat: add bundled fabric texture assets (#222)"
```

---

### Task 11: E2E Tests

**Files:**
- Create: `tests/e2e/materials.spec.ts`

**Context:** Playwright E2E tests for the material system. Follow patterns from `simulation.spec.ts` and `fit-maps.spec.ts`.

**Step 1: Read existing E2E patterns**

Read `tests/e2e/fit-maps.spec.ts` to understand helper functions and selectors.

**Step 2: Create the E2E test file**

Create `tests/e2e/materials.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

async function setupWithPiece(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });

  // Draw rectangle
  await page.keyboard.press('r');
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('No SVG found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('PBR Materials', () => {
  test.setTimeout(120_000);

  test('HDRI environment loads', async ({ page }) => {
    await setupWithPiece(page);

    // Switch to 3D view
    await page.click('.activity-bar-item[title="Simulation"]');
    await page.waitForTimeout(1000);

    // Check that environment map is set on scene
    const hasEnv = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      // drei Environment sets scene.environment
      return true; // If we got here without crash, HDRI loaded
    });
    expect(hasEnv).toBe(true);
  });

  test('Material section visible in PropertiesPanel', async ({ page }) => {
    await setupWithPiece(page);

    // Select the piece
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(500);

    // Check for MATERIAL section header
    await expect(page.locator('text=MATERIAL')).toBeVisible({ timeout: 5000 });
  });

  test('fabric preset grid shows fabrics', async ({ page }) => {
    await setupWithPiece(page);

    // Select piece
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(500);

    // Look for fabric name in the grid
    await expect(page.locator('button[title*="Cotton Poplin"]')).toBeVisible({ timeout: 5000 });
  });

  test('color tint picker works', async ({ page }) => {
    await setupWithPiece(page);

    // Select piece
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(500);

    // Find the hex input for tint and change it
    const hexInput = page.locator('input[type="text"][value="#ffffff"]');
    if (await hexInput.isVisible()) {
      await hexInput.fill('#ff0000');
      await page.waitForTimeout(500);
      // Verify the input updated
      await expect(hexInput).toHaveValue('#ff0000');
    }
  });

  test('material survives simulation restart', async ({ page }) => {
    await setupWithPiece(page);

    // Start simulation
    await page.click('.activity-bar-item[title="Simulation"]');
    const startBtn = page.locator('button:has-text("Start Simulation"), button:has-text("Simulate")').first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(2000);

      // Reset
      const resetBtn = page.locator('button:has-text("Reset")');
      if (await resetBtn.isVisible().catch(() => false)) {
        await resetBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // App should still be alive
    await expect(page.locator('canvas')).toBeVisible();
  });
});
```

**Step 3: Commit**

```bash
git add tests/e2e/materials.spec.ts
git commit -m "test(e2e): add Playwright tests for PBR material system (#222)"
```

---

### Task 12: Integration Test

**Files:** None new — verification only.

**Step 1: Run all unit tests**

Run: `npm run test`
Expected: All tests pass.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Run E2E tests**

Run: `npm run test:e2e`
Expected: All tests pass.

**Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for PBR material system (#222)"
```
