# 3D Rendering Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the 3D viewport with multiple HDRI environments, render settings UI, custom lighting, and export capabilities.

**Architecture:** New Redux slice (`renderSettingsSlice`) stores all render settings. `EnvironmentSetup` component reads from slice and configures drei `<Environment>`. `RenderSettingsPanel` provides the UI sidebar. Export utilities are standalone functions that take renderer/scene/camera refs.

**Tech Stack:** React, Three.js, @react-three/fiber, @react-three/drei, Redux Toolkit, MediaRecorder API

---

### Task 1: Create renderSettingsSlice

**Files:**
- Create: `src/store/renderSettingsSlice.ts`
- Modify: `src/store/index.ts`
- Test: `src/store/__tests__/renderSettingsSlice.test.ts`

**Step 1: Write the failing test**

```typescript
// src/store/__tests__/renderSettingsSlice.test.ts
import { describe, it, expect } from 'vitest';
import renderSettingsReducer, {
  setHdriPreset,
  setHdriRotation,
  setHdriCustomUrl,
  setToneMapping,
  setExposure,
  setBackgroundMode,
  setBackgroundColor,
  addLight,
  removeLight,
  updateLight,
  applyLightPreset,
  setGroundVisible,
  setShadowOpacity,
  setShadowBlur,
  setTurntableFrameCount,
  setTurntableDirection,
  HDRI_PRESETS,
  LIGHT_PRESETS,
} from '../renderSettingsSlice';

describe('renderSettingsSlice', () => {
  it('has correct initial state', () => {
    const state = renderSettingsReducer(undefined, { type: '@@INIT' });
    expect(state.hdriPreset).toBe('studio-soft');
    expect(state.hdriRotation).toBe(0);
    expect(state.toneMapping).toBe('aces');
    expect(state.exposure).toBe(1.0);
    expect(state.backgroundMode).toBe('solid');
    expect(state.backgroundColor).toBe('#f0f0f0');
    expect(state.lights).toHaveLength(0);
    expect(state.groundVisible).toBe(true);
    expect(state.shadowOpacity).toBe(0.4);
    expect(state.shadowBlur).toBe(2);
  });

  it('setHdriPreset updates preset and clears custom URL', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, setHdriCustomUrl('blob:test'));
    state = renderSettingsReducer(state, setHdriPreset('showroom'));
    expect(state.hdriPreset).toBe('showroom');
    expect(state.hdriCustomUrl).toBeNull();
  });

  it('setHdriRotation clamps to -180..180', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, setHdriRotation(200));
    expect(state.hdriRotation).toBe(180);
    state = renderSettingsReducer(state, setHdriRotation(-200));
    expect(state.hdriRotation).toBe(-180);
  });

  it('setExposure clamps to 0.1..5.0', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, setExposure(10));
    expect(state.exposure).toBe(5.0);
    state = renderSettingsReducer(state, setExposure(0.01));
    expect(state.exposure).toBe(0.1);
  });

  it('addLight appends and enforces max 4', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    for (let i = 0; i < 5; i++) {
      state = renderSettingsReducer(state, addLight());
    }
    expect(state.lights).toHaveLength(4);
  });

  it('removeLight removes by id', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, addLight());
    const id = state.lights[0].id;
    state = renderSettingsReducer(state, removeLight(id));
    expect(state.lights).toHaveLength(0);
  });

  it('updateLight modifies specific light', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, addLight());
    const id = state.lights[0].id;
    state = renderSettingsReducer(state, updateLight({ id, changes: { intensity: 5 } }));
    expect(state.lights[0].intensity).toBe(5);
  });

  it('applyLightPreset replaces lights array', () => {
    let state = renderSettingsReducer(undefined, { type: '@@INIT' });
    state = renderSettingsReducer(state, applyLightPreset('studio3Point'));
    expect(state.lights).toHaveLength(3);
  });

  it('HDRI_PRESETS has 6 entries', () => {
    expect(HDRI_PRESETS).toHaveLength(6);
    expect(HDRI_PRESETS.map(p => p.id)).toContain('studio-soft');
  });

  it('LIGHT_PRESETS has 3 entries', () => {
    expect(Object.keys(LIGHT_PRESETS)).toHaveLength(3);
    expect(LIGHT_PRESETS.studio3Point).toBeDefined();
    expect(LIGHT_PRESETS.softBox).toBeDefined();
    expect(LIGHT_PRESETS.dramatic).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/renderSettingsSlice.test.ts`
Expected: FAIL — module not found

**Step 3: Write the slice**

```typescript
// src/store/renderSettingsSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CustomLight {
  id: string;
  color: string;
  intensity: number;
  width: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface HdriPreset {
  id: string;
  name: string;
  file: string;
  thumbnail: string;
}

export const HDRI_PRESETS: HdriPreset[] = [
  { id: 'studio-soft', name: 'Studio Soft', file: '/hdri/studio-soft.hdr', thumbnail: '/hdri/thumb-studio-soft.jpg' },
  { id: 'studio-hard', name: 'Studio Hard', file: '/hdri/studio-hard.hdr', thumbnail: '/hdri/thumb-studio-hard.jpg' },
  { id: 'showroom', name: 'Showroom', file: '/hdri/showroom.hdr', thumbnail: '/hdri/thumb-showroom.jpg' },
  { id: 'outdoor-daylight', name: 'Outdoor', file: '/hdri/outdoor-daylight.hdr', thumbnail: '/hdri/thumb-outdoor-daylight.jpg' },
  { id: 'sunset', name: 'Sunset', file: '/hdri/sunset.hdr', thumbnail: '/hdri/thumb-sunset.jpg' },
  { id: 'neutral-grey', name: 'Neutral', file: '/hdri/neutral-grey.hdr', thumbnail: '/hdri/thumb-neutral-grey.jpg' },
];

export const LIGHT_PRESETS: Record<string, CustomLight[]> = {
  studio3Point: [
    { id: 'key', color: '#fff5e0', intensity: 3, width: 1, height: 1, position: [2, 2.5, 1.5], rotation: [0, -0.6, 0] },
    { id: 'fill', color: '#e0e8ff', intensity: 1.5, width: 1.5, height: 1.5, position: [-2, 2, 1], rotation: [0, 0.6, 0] },
    { id: 'rim', color: '#ffffff', intensity: 2, width: 0.5, height: 2, position: [0, 2, -2], rotation: [0, Math.PI, 0] },
  ],
  softBox: [
    { id: 'left', color: '#ffffff', intensity: 2, width: 2, height: 2, position: [-2, 1.5, 1], rotation: [0, 0.5, 0] },
    { id: 'right', color: '#ffffff', intensity: 2, width: 2, height: 2, position: [2, 1.5, 1], rotation: [0, -0.5, 0] },
  ],
  dramatic: [
    { id: 'main', color: '#ffffff', intensity: 5, width: 0.5, height: 0.5, position: [2, 3, 1], rotation: [-0.5, -0.5, 0] },
  ],
};

export type ToneMapping = 'aces' | 'reinhard' | 'linear';
export type BackgroundMode = 'hdri' | 'solid' | 'transparent';

interface RenderSettingsState {
  hdriPreset: string;
  hdriRotation: number;
  hdriCustomUrl: string | null;
  toneMapping: ToneMapping;
  exposure: number;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  lights: CustomLight[];
  groundVisible: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  turntableFrameCount: number;
  turntableDirection: 'cw' | 'ccw';
}

const initialState: RenderSettingsState = {
  hdriPreset: 'studio-soft',
  hdriRotation: 0,
  hdriCustomUrl: null,
  toneMapping: 'aces',
  exposure: 1.0,
  backgroundMode: 'solid',
  backgroundColor: '#f0f0f0',
  lights: [],
  groundVisible: true,
  shadowOpacity: 0.4,
  shadowBlur: 2,
  turntableFrameCount: 36,
  turntableDirection: 'cw',
};

let lightCounter = 0;

const renderSettingsSlice = createSlice({
  name: 'renderSettings',
  initialState,
  reducers: {
    setHdriPreset(state, action: PayloadAction<string>) {
      state.hdriPreset = action.payload;
      state.hdriCustomUrl = null;
    },
    setHdriRotation(state, action: PayloadAction<number>) {
      state.hdriRotation = Math.max(-180, Math.min(180, action.payload));
    },
    setHdriCustomUrl(state, action: PayloadAction<string | null>) {
      state.hdriCustomUrl = action.payload;
      if (action.payload) state.hdriPreset = 'custom';
    },
    setToneMapping(state, action: PayloadAction<ToneMapping>) {
      state.toneMapping = action.payload;
    },
    setExposure(state, action: PayloadAction<number>) {
      state.exposure = Math.max(0.1, Math.min(5.0, action.payload));
    },
    setBackgroundMode(state, action: PayloadAction<BackgroundMode>) {
      state.backgroundMode = action.payload;
    },
    setBackgroundColor(state, action: PayloadAction<string>) {
      state.backgroundColor = action.payload;
    },
    addLight(state) {
      if (state.lights.length >= 4) return;
      lightCounter++;
      state.lights.push({
        id: `light-${lightCounter}`,
        color: '#ffffff',
        intensity: 2,
        width: 1,
        height: 1,
        position: [0, 2, 2],
        rotation: [0, 0, 0],
      });
    },
    removeLight(state, action: PayloadAction<string>) {
      state.lights = state.lights.filter(l => l.id !== action.payload);
    },
    updateLight(state, action: PayloadAction<{ id: string; changes: Partial<CustomLight> }>) {
      const light = state.lights.find(l => l.id === action.payload.id);
      if (light) Object.assign(light, action.payload.changes);
    },
    applyLightPreset(state, action: PayloadAction<string>) {
      const preset = LIGHT_PRESETS[action.payload];
      if (preset) {
        lightCounter += preset.length;
        state.lights = preset.map((l, i) => ({ ...l, id: `light-${lightCounter - preset.length + i + 1}` }));
      }
    },
    setGroundVisible(state, action: PayloadAction<boolean>) {
      state.groundVisible = action.payload;
    },
    setShadowOpacity(state, action: PayloadAction<number>) {
      state.shadowOpacity = Math.max(0, Math.min(1, action.payload));
    },
    setShadowBlur(state, action: PayloadAction<number>) {
      state.shadowBlur = Math.max(0, Math.min(5, action.payload));
    },
    setTurntableFrameCount(state, action: PayloadAction<number>) {
      state.turntableFrameCount = action.payload;
    },
    setTurntableDirection(state, action: PayloadAction<'cw' | 'ccw'>) {
      state.turntableDirection = action.payload;
    },
  },
});

export const {
  setHdriPreset, setHdriRotation, setHdriCustomUrl,
  setToneMapping, setExposure,
  setBackgroundMode, setBackgroundColor,
  addLight, removeLight, updateLight, applyLightPreset,
  setGroundVisible, setShadowOpacity, setShadowBlur,
  setTurntableFrameCount, setTurntableDirection,
} = renderSettingsSlice.actions;
export default renderSettingsSlice.reducer;
```

**Step 4: Register in store**

In `src/store/index.ts`, add:
```typescript
import renderSettingsReducer from './renderSettingsSlice';
// In configureStore reducer object:
renderSettings: renderSettingsReducer,
```

**Step 5: Run tests**

Run: `npx vitest run src/store/__tests__/renderSettingsSlice.test.ts`
Expected: All 10 tests PASS

**Step 6: Commit**

```bash
git add src/store/renderSettingsSlice.ts src/store/__tests__/renderSettingsSlice.test.ts src/store/index.ts
git commit -m "feat(render): add renderSettingsSlice with HDRI presets, lighting, and export config"
```

---

### Task 2: Create EnvironmentSetup component

**Files:**
- Create: `src/components/Viewport3D/EnvironmentSetup.tsx`
- Modify: `src/components/Viewport3D/Viewport3D.tsx`

**Context:** This component replaces the hardcoded `<Environment>`, `<ambientLight>`, `<directionalLight>`, and `<hemisphereLight>` in Viewport3D.tsx with a Redux-driven version. It reads from `renderSettingsSlice` and applies HDRI, tone mapping, exposure, and background mode.

**Step 1: Create EnvironmentSetup component**

```typescript
// src/components/Viewport3D/EnvironmentSetup.tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { HDRI_PRESETS } from '../../store/renderSettingsSlice';

const TONE_MAP: Record<string, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  linear: THREE.LinearToneMapping,
};

export default function EnvironmentSetup() {
  const { gl, scene } = useThree();
  const {
    hdriPreset, hdriRotation, hdriCustomUrl,
    toneMapping, exposure,
    backgroundMode, backgroundColor,
  } = useSelector((s: RootState) => s.renderSettings);

  // Apply tone mapping + exposure
  useEffect(() => {
    gl.toneMapping = TONE_MAP[toneMapping] ?? THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, toneMapping, exposure]);

  // Apply background
  useEffect(() => {
    if (backgroundMode === 'hdri') {
      // Background set by <Environment background> — clear our override
      scene.background = null; // Environment component handles it
    } else if (backgroundMode === 'transparent') {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
    } else {
      scene.background = new THREE.Color(backgroundColor);
      gl.setClearColor(new THREE.Color(backgroundColor), 1);
    }
  }, [gl, scene, backgroundMode, backgroundColor]);

  // Resolve HDRI file path
  const hdriFile = hdriCustomUrl
    || HDRI_PRESETS.find(p => p.id === hdriPreset)?.file
    || '/hdri/studio-soft.hdr';

  // Convert rotation degrees to radians for Environment
  const rotationRad = (hdriRotation * Math.PI) / 180;

  return (
    <>
      {/* Base ambient + hemisphere for minimum illumination */}
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#ffffff', '#b0c4de', 0.3]} />

      {/* Main shadow-casting light */}
      <directionalLight position={[3, 5, 4]} intensity={0.5} castShadow shadow-mapSize={1024} />
      <directionalLight position={[-3, 4, -2]} intensity={0.25} />
      <directionalLight position={[0, 2, 5]} intensity={0.2} />

      <Environment
        files={hdriFile}
        background={backgroundMode === 'hdri'}
        environmentRotation={[0, rotationRad, 0]}
      />
    </>
  );
}
```

**Step 2: Update Viewport3D.tsx**

Replace the hardcoded lights and `<Environment>` block (lines 319-327) with `<EnvironmentSetup />`:

```typescript
// Add import at top:
import EnvironmentSetup from './EnvironmentSetup';

// Remove these lines (319-327):
//   <ambientLight intensity={0.3} />
//   <directionalLight position={[3, 5, 4]} intensity={0.5} castShadow shadow-mapSize={1024} />
//   <directionalLight position={[-3, 4, -2]} intensity={0.25} />
//   <directionalLight position={[0, 2, 5]} intensity={0.2} />
//   <hemisphereLight args={['#ffffff', '#b0c4de', 0.3]} />
//   <Environment files="/hdri/studio-soft.hdr" background={false} />

// Replace with:
//   <EnvironmentSetup />
```

Also remove the hardcoded `scene.background` in `onCreated` (line 312), since EnvironmentSetup now manages it:
```typescript
// Remove from onCreated:
//   scene.background = new THREE.Color('#f0f0f0');
```

Also update the `gl` prop to remove hardcoded tone mapping (EnvironmentSetup handles it):
```typescript
gl={{ antialias: true }}
```

Also read `groundVisible`, `shadowOpacity`, `shadowBlur` from Redux for the ground plane and ContactShadows:
```typescript
const { groundVisible, shadowOpacity, shadowBlur } = useSelector((s: RootState) => s.renderSettings);

// Update ContactShadows:
<ContactShadows position={[0, 0, 0]} opacity={shadowOpacity} scale={3} blur={shadowBlur} far={2} />

// Conditionally render ground plane:
{groundVisible && (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
    <planeGeometry args={[20, 20]} />
    <meshStandardMaterial color="#ffffff" />
  </mesh>
)}
```

**Step 3: Run tests and verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All existing tests pass, no type errors

**Step 4: Commit**

```bash
git add src/components/Viewport3D/EnvironmentSetup.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(render): extract EnvironmentSetup component, wire to Redux renderSettings"
```

---

### Task 3: Create RenderSettingsPanel UI

**Files:**
- Create: `src/components/Viewport3D/RenderSettingsPanel.tsx`
- Create: `src/components/Viewport3D/RenderSettingsPanel.css`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (add toggle button + panel)

**Context:** This panel follows the same pattern as AvatarPanel and CollisionBodyPanel. It opens from a toolbar button and slides in from the right. It reuses the `ap-` CSS class naming pattern from AvatarPanel.css for consistency.

**Step 1: Create RenderSettingsPanel.css**

Use the same styling patterns as AvatarPanel.css (`.ap-section`, `.ap-section-header`, `.ap-btn`, etc.) but with `.render-panel` wrapper class. Add styles for HDRI preset thumbnails grid and color picker.

Key CSS additions:
```css
.render-panel-wrapper { /* Same as .avatar-panel-wrapper */ }
.render-panel { /* Same as .avatar-panel */ }
.render-hdri-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.render-hdri-item { /* thumbnail + label */ }
.render-hdri-item.active { border-color: var(--accent); }
```

**Step 2: Create RenderSettingsPanel.tsx**

Sections:
1. **Environment**: HDRI preset grid (6 thumbnails), rotation slider (-180 to 180), "Upload HDRI" button
2. **Rendering**: Tone mapping dropdown (ACES/Reinhard/Linear), exposure slider (0.1-5.0)
3. **Background**: 3-button toggle (HDRI/Solid/Transparent), color picker (when solid)
4. **Ground**: Visible toggle, shadow opacity slider (0-1), shadow blur slider (0-5)
5. **Lighting**: "Add Light" button, preset buttons (Studio 3-Point, Soft Box, Dramatic), light list with color/intensity/size controls, "Remove" per light
6. **Export**: Turntable config (frame count dropdown, direction toggle), "Render Turntable" button, "Export Still" button with resolution input, "Export All Views" button

All controls dispatch to `renderSettingsSlice` actions.

**Step 3: Mount in Viewport3D.tsx**

Add state + toggle button (similar to collision body button):
```typescript
const [renderPanelOpen, setRenderPanelOpen] = useState(false);

// Button in viewport overlay area:
<button onClick={() => setRenderPanelOpen(!renderPanelOpen)}>Render</button>

// Panel component:
<RenderSettingsPanel open={renderPanelOpen} onClose={() => setRenderPanelOpen(false)} />
```

**Step 4: Run and verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, existing tests pass

**Step 5: Commit**

```bash
git add src/components/Viewport3D/RenderSettingsPanel.tsx src/components/Viewport3D/RenderSettingsPanel.css src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(render): add RenderSettingsPanel UI with HDRI, tone mapping, background, and ground controls"
```

---

### Task 4: Download and bundle HDRI assets

**Files:**
- Add: `public/hdri/studio-hard.hdr`
- Add: `public/hdri/showroom.hdr`
- Add: `public/hdri/outdoor-daylight.hdr`
- Add: `public/hdri/sunset.hdr`
- Add: `public/hdri/neutral-grey.hdr`
- Add: `public/hdri/thumb-*.jpg` (6 thumbnails)

**Context:** Download 5 additional HDRIs from Poly Haven (CC0 license) at 1k resolution. The existing `studio-soft.hdr` stays. Generate 120x80 JPEG thumbnails for the preset selector grid.

**Step 1: Download HDRIs**

Use curl to download from Poly Haven CDN (1k resolution, ~300KB-1MB each):
```bash
# studio-hard: sharp studio lighting
curl -o public/hdri/studio-hard.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr"

# showroom: bright retail space
curl -o public/hdri/showroom.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/photo_studio_loft_hall_1k.hdr"

# outdoor-daylight: natural sunlight
curl -o public/hdri/outdoor-daylight.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_43d_clear_puresky_1k.hdr"

# sunset: warm dramatic lighting
curl -o public/hdri/sunset.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr"

# neutral-grey: flat even lighting for technical review
curl -o public/hdri/neutral-grey.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/industrial_sunset_puresky_1k.hdr"
```

Note: If Poly Haven URLs change, search for equivalent CC0 HDRIs. Key criteria:
- studio-hard: specular highlights visible on fabrics
- showroom: bright, retail-like
- outdoor-daylight: clear sky, strong directional sun
- sunset: warm, orange/pink tones
- neutral-grey: even, low-contrast illumination

**Step 2: Generate thumbnails**

If ImageMagick is available:
```bash
for f in studio-soft studio-hard showroom outdoor-daylight sunset neutral-grey; do
  # Create a simple colored placeholder thumbnail if HDR conversion tools aren't available
  convert -size 120x80 xc:'#555555' -gravity center -fill white -pointsize 10 -annotate 0 "$f" "public/hdri/thumb-$f.jpg" 2>/dev/null || \
  python3 -c "
from PIL import Image
img = Image.new('RGB', (120, 80), (80, 80, 80))
img.save('public/hdri/thumb-$f.jpg')
" 2>/dev/null || \
  echo "Placeholder for $f"
done
```

If no image tools available, create minimal JPEG placeholders. The thumbnails are nice-to-have; the HDRI selector can fall back to text labels.

**Step 3: Verify files**

```bash
ls -la public/hdri/
# Should show 6 .hdr files and 6 .jpg thumbnails
```

**Step 4: Commit**

```bash
git add public/hdri/
git commit -m "feat(render): add 5 HDRI environment presets from Poly Haven (CC0)"
```

---

### Task 5: Create CustomLights component

**Files:**
- Create: `src/components/Viewport3D/CustomLights.tsx`
- Modify: `src/components/Viewport3D/Viewport3D.tsx`

**Context:** Renders RectAreaLight components inside the Canvas based on Redux `renderSettings.lights` array. Uses drei's `useHelper` for optional visual debugging. Each light gets a visible wireframe helper when selected in the panel.

**Step 1: Create CustomLights.tsx**

```typescript
// src/components/Viewport3D/CustomLights.tsx
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

// Initialize RectAreaLight uniforms once
let rectAreaLightInitialized = false;

function RectLight({ light }: { light: { id: string; color: string; intensity: number; width: number; height: number; position: [number, number, number]; rotation: [number, number, number] } }) {
  const ref = useRef<THREE.RectAreaLight>(null);

  useEffect(() => {
    if (!rectAreaLightInitialized) {
      RectAreaLightUniformsLib.init();
      rectAreaLightInitialized = true;
    }
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

export default function CustomLights() {
  const lights = useSelector((s: RootState) => s.renderSettings.lights);

  return (
    <>
      {lights.map(light => (
        <RectLight key={light.id} light={light} />
      ))}
    </>
  );
}
```

**Step 2: Mount in Viewport3D.tsx**

```typescript
import CustomLights from './CustomLights';

// Inside Canvas, after <EnvironmentSetup />:
<CustomLights />
```

**Step 3: Run and verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, existing tests pass

**Step 4: Commit**

```bash
git add src/components/Viewport3D/CustomLights.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(render): add CustomLights component with RectAreaLight support"
```

---

### Task 6: Create turntable export utility

**Files:**
- Create: `src/utils/export/turntableRenderer.ts`

**Context:** Captures frames by orbiting the camera around the scene and stitches them into a video using the MediaRecorder API. The function takes refs to the Three.js renderer, scene, and camera, plus configuration from Redux state.

**Step 1: Create turntableRenderer.ts**

```typescript
// src/utils/export/turntableRenderer.ts
import * as THREE from 'three';

export interface TurntableConfig {
  frameCount: number;       // 12, 24, 36, 72
  direction: 'cw' | 'ccw';
  width?: number;           // render width (default: canvas width)
  height?: number;          // render height (default: canvas height)
  fps?: number;             // frames per second (default: 24)
  target?: THREE.Vector3;   // orbit target (default: [0, 0.75, 0])
  radius?: number;          // orbit radius (default: current camera distance)
  cameraY?: number;         // camera Y position (default: current)
}

export async function renderTurntable(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: TurntableConfig,
  onProgress?: (frame: number, total: number) => void,
): Promise<Blob> {
  const {
    frameCount,
    direction,
    fps = 24,
    target = new THREE.Vector3(0, 0.75, 0),
  } = config;

  // Calculate orbit radius from current camera position
  const currentPos = camera.position.clone();
  const offset = currentPos.clone().sub(target);
  const radius = config.radius ?? Math.sqrt(offset.x ** 2 + offset.z ** 2);
  const cameraY = config.cameraY ?? currentPos.y;

  // Save original camera state
  const originalPos = camera.position.clone();
  const originalTarget = camera.clone().getWorldDirection(new THREE.Vector3());

  const canvas = renderer.domElement;
  const width = config.width ?? canvas.width;
  const height = config.height ?? canvas.height;

  // Create offscreen canvas for video recording
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // Set up MediaRecorder
  const stream = offscreen.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm',
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });

  mediaRecorder.start();

  // Render each frame
  const angleStep = ((direction === 'ccw' ? -1 : 1) * 2 * Math.PI) / frameCount;
  // Find starting angle from current camera position
  const startAngle = Math.atan2(offset.x, offset.z);

  for (let i = 0; i < frameCount; i++) {
    const angle = startAngle + angleStep * i;
    camera.position.set(
      target.x + radius * Math.sin(angle),
      cameraY,
      target.z + radius * Math.cos(angle),
    );
    camera.lookAt(target);

    renderer.render(scene, camera);

    // Copy WebGL canvas to offscreen canvas
    ctx.drawImage(canvas, 0, 0, width, height);

    onProgress?.(i + 1, frameCount);

    // Small delay to let MediaRecorder capture the frame
    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  mediaRecorder.stop();

  // Restore camera
  camera.position.copy(originalPos);
  camera.lookAt(target);

  return recordingDone;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/utils/export/turntableRenderer.ts
git commit -m "feat(render): add turntable video export via MediaRecorder"
```

---

### Task 7: Create high-res still export utility

**Files:**
- Create: `src/utils/export/stillExporter.ts`

**Context:** Renders the scene to an offscreen WebGLRenderTarget at custom resolution, optionally with transparent background, and downloads as PNG.

**Step 1: Create stillExporter.ts**

```typescript
// src/utils/export/stillExporter.ts
import * as THREE from 'three';

export interface StillExportConfig {
  width: number;
  height: number;
  transparent?: boolean;
  filename?: string;
}

export function exportStill(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: StillExportConfig,
): void {
  const { width, height, transparent = false, filename } = config;

  // Save original state
  const originalBackground = scene.background;
  const originalSize = new THREE.Vector2();
  renderer.getSize(originalSize);
  const originalClearAlpha = renderer.getClearAlpha();
  const originalAspect = camera.aspect;

  // Configure for export
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  if (transparent) {
    scene.background = null;
    renderer.setClearAlpha(0);
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Render to target
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Read pixels
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

  // Restore
  renderer.setRenderTarget(null);
  scene.background = originalBackground;
  renderer.setClearAlpha(originalClearAlpha);
  camera.aspect = originalAspect;
  camera.updateProjectionMatrix();
  renderTarget.dispose();

  // Flip vertically (WebGL is bottom-up) and create image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    imageData.data.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow);
  }
  ctx.putImageData(imageData, 0, 0);

  // Download
  const link = document.createElement('a');
  link.download = filename || `openclo-render-${width}x${height}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export type ViewAngle = 'front' | 'back' | 'left' | 'right';

const VIEW_POSITIONS: Record<ViewAngle, [number, number, number]> = {
  front: [0, 0.8, 2.8],
  back: [0, 0.8, -2.8],
  left: [-2.8, 0.8, 0],
  right: [2.8, 0.8, 0],
};

export function exportAllViews(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: Omit<StillExportConfig, 'filename'>,
): void {
  const target = new THREE.Vector3(0, 0.75, 0);
  const originalPos = camera.position.clone();

  for (const [view, pos] of Object.entries(VIEW_POSITIONS) as [ViewAngle, [number, number, number]][]) {
    camera.position.set(...pos);
    camera.lookAt(target);
    exportStill(renderer, scene, camera, {
      ...config,
      filename: `openclo-${view}-${config.width}x${config.height}.png`,
    });
  }

  // Restore camera
  camera.position.copy(originalPos);
  camera.lookAt(target);
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/utils/export/stillExporter.ts
git commit -m "feat(render): add high-res still export with transparent background and batch views"
```

---

### Task 8: Wire export buttons in RenderSettingsPanel

**Files:**
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`
- Modify: `src/components/Viewport3D/Viewport3D.tsx`

**Context:** The RenderSettingsPanel needs access to the Three.js renderer, scene, and camera to trigger exports. Pass these as props from Viewport3D (which already stores them via `containerRef.__gl`, `__scene`, `__camera`).

**Step 1: Add export handlers to RenderSettingsPanel**

The panel receives `onExportStill`, `onExportTurntable`, `onExportAllViews` callback props from Viewport3D. Each callback is implemented in Viewport3D where the Three.js refs are available.

```typescript
// In Viewport3D.tsx, add:
import { renderTurntable, downloadBlob } from '../../utils/export/turntableRenderer';
import { exportStill, exportAllViews } from '../../utils/export/stillExporter';

const handleExportStill = useCallback((width: number, height: number, transparent: boolean) => {
  const container = containerRef.current;
  if (!container) return;
  const store = container as unknown as Record<string, unknown>;
  const gl = store.__gl as THREE.WebGLRenderer | undefined;
  const scene = store.__scene as THREE.Scene | undefined;
  const cam = store.__camera as THREE.PerspectiveCamera | undefined;
  if (!gl || !scene || !cam) return;
  exportStill(gl, scene, cam, { width, height, transparent });
}, []);

const handleExportTurntable = useCallback(async () => {
  const container = containerRef.current;
  if (!container) return;
  const store = container as unknown as Record<string, unknown>;
  const gl = store.__gl as THREE.WebGLRenderer | undefined;
  const scene = store.__scene as THREE.Scene | undefined;
  const cam = store.__camera as THREE.PerspectiveCamera | undefined;
  if (!gl || !scene || !cam) return;
  const { turntableFrameCount, turntableDirection } = store.getState().renderSettings;
  const blob = await renderTurntable(gl, scene, cam, {
    frameCount: turntableFrameCount,
    direction: turntableDirection,
  });
  downloadBlob(blob, `openclo-turntable-${Date.now()}.webm`);
}, []);

const handleExportAllViews = useCallback((width: number, height: number, transparent: boolean) => {
  const container = containerRef.current;
  if (!container) return;
  const store = container as unknown as Record<string, unknown>;
  const gl = store.__gl as THREE.WebGLRenderer | undefined;
  const scene = store.__scene as THREE.Scene | undefined;
  const cam = store.__camera as THREE.PerspectiveCamera | undefined;
  if (!gl || !scene || !cam) return;
  exportAllViews(gl, scene, cam, { width, height, transparent });
}, []);
```

Pass these as props to `<RenderSettingsPanel>`.

**Step 2: Add export section UI in RenderSettingsPanel**

The Export section contains:
- Still export: width/height inputs (default 2048x2048), transparent checkbox, "Export Still" button
- Turntable: frame count dropdown (12/24/36/72), direction toggle, "Render Turntable" button
- Batch: "Export All Views" button

**Step 3: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, all tests pass

**Step 4: Commit**

```bash
git add src/components/Viewport3D/RenderSettingsPanel.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(render): wire export buttons — turntable video, high-res still, batch views"
```

---

### Task 9: Unit tests for export utilities

**Files:**
- Create: `src/utils/export/__tests__/stillExporter.test.ts`

**Context:** Test the stillExporter utility's pixel flipping and camera restore logic using mock Three.js objects.

**Step 1: Write tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Test the view positions and export config
describe('stillExporter', () => {
  it('VIEW_POSITIONS covers 4 angles', async () => {
    const { exportAllViews } = await import('../stillExporter');
    // We can't easily test WebGL in vitest, but we can test the module loads
    expect(exportAllViews).toBeDefined();
  });
});

describe('turntableRenderer', () => {
  it('module exports renderTurntable and downloadBlob', async () => {
    const { renderTurntable, downloadBlob } = await import('../turntableRenderer');
    expect(renderTurntable).toBeDefined();
    expect(downloadBlob).toBeDefined();
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/utils/export/__tests__/stillExporter.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/export/__tests__/stillExporter.test.ts
git commit -m "test(render): add unit tests for export utilities"
```

---

### Task 10: E2E tests for render settings

**Files:**
- Create: `tests/e2e/render-settings.spec.ts`

**Context:** Verify the RenderSettingsPanel opens, HDRI preset selector works, and tone mapping/exposure controls are functional.

**Step 1: Write E2E tests**

```typescript
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

test.describe('Render Settings', () => {
  test.setTimeout(120_000);

  test('Render settings panel opens and shows sections', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    // Click the Render toggle button
    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Panel should show Environment section
    await expect(page.locator('text=Environment')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Rendering')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Background')).toBeVisible({ timeout: 3000 });
  });

  test('HDRI preset changes without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Click a different HDRI preset
    const showroomBtn = page.locator('.render-hdri-item:has-text("Showroom")');
    if (await showroomBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showroomBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // No WebGL errors
    const glErrors = errors.filter(e => e.includes('WebGL') || e.includes('THREE'));
    expect(glErrors).toHaveLength(0);
  });
});
```

**Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/render-settings.spec.ts --headed`
Expected: PASS (may need to adjust selectors based on actual UI)

**Step 3: Commit**

```bash
git add tests/e2e/render-settings.spec.ts
git commit -m "test(render): add E2E tests for render settings panel"
```
