# Rendering Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom resolution, render quality, advanced lighting, export formats, avatar styles, garment surface modes (flat/x-ray/shaded), copy-to-clipboard, and copilot tools for all new rendering features.

**Architecture:** Extend `renderSettingsSlice` with new state fields. Decompose `RenderSettingsPanel` (524 lines) into 8 focused sub-components in `renderSections/`. Add 5 new `SurfaceMode3D` values with material branching in both `PieceMesh.tsx` and `GarmentSimulation.tsx`. Register 7 copilot tools in `src/tools/renderTools.ts`.

**Tech Stack:** React, Redux Toolkit, React Three Fiber, Three.js (WebGPU-first), MeshStandardNodeMaterial, MeshBasicNodeMaterial

**Spec:** `docs/superpowers/specs/2026-03-22-rendering-enhancements-design.md`

---

## File Map

### New Files
- `src/components/Viewport3D/renderSections/EnvironmentSection.tsx` — extracted HDRI controls
- `src/components/Viewport3D/renderSections/RenderQualitySection.tsx` — tone mapping + sampling + denoiser
- `src/components/Viewport3D/renderSections/BackgroundSection.tsx` — extracted background mode + color
- `src/components/Viewport3D/renderSections/GroundSection.tsx` — extracted ground/shadow controls
- `src/components/Viewport3D/renderSections/LightingSection.tsx` — extracted + extended lighting
- `src/components/Viewport3D/renderSections/AvatarStyleSection.tsx` — avatar render style toggle
- `src/components/Viewport3D/renderSections/ResolutionSection.tsx` — presets + aspect lock
- `src/components/Viewport3D/renderSections/ExportSection.tsx` — extracted + format/quality/copy
- `src/tools/renderTools.ts` — 7 copilot tool definitions

### Modified Files
- `src/store/renderSettingsSlice.ts` — new types, state fields, reducers
- `src/store/simulationSlice.ts` — extend `SurfaceMode3D` type
- `src/components/Viewport3D/RenderSettingsPanel.tsx` — thin shell rendering sections
- `src/components/DisplayBar3D/DisplayBar3D.tsx` — new surface mode buttons
- `src/components/Viewport3D/CustomLights.tsx` — multi-type light rendering
- `src/components/Viewport3D/PieceMesh.tsx` — flat/xray/shaded material branching
- `src/components/Viewport3D/GarmentSimulation.tsx` — surface mode on merged mesh
- `src/components/Viewport3D/AvatarModel.tsx` — avatar render style application
- `src/components/Viewport3D/Viewport3D.tsx` — export callbacks for new formats/copy
- `src/utils/export/stillExporter.ts` — format/quality/multi-sample
- `src/utils/export/turntableRenderer.ts` — codec/FPS options
- `src/tools/index.ts` — register new render tools

---

## Task 1: Extend renderSettingsSlice with New Types and State

**Files:**
- Modify: `src/store/renderSettingsSlice.ts`

- [ ] **Step 1: Add new type definitions**

Add after the existing `BackgroundMode` type (line 8):

```typescript
export type LightType = 'rect' | 'point' | 'directional' | 'spot';
export type AvatarRenderStyle = 'visible' | 'transparent' | 'silhouette' | 'hidden';
export type ImageFormat = 'png' | 'jpeg' | 'exr';
export type VideoFormat = 'webm' | 'mp4';
export type ResolutionPreset = '1080p' | '4k' | 'instagram' | 'instagram-story' | 'custom';
```

- [ ] **Step 2: Extend CustomLight interface**

Replace the existing `CustomLight` interface (lines 10-18) with:

```typescript
export interface CustomLight {
  id: string;
  type: LightType;
  color: string;
  intensity: number;
  width?: number;       // rect only
  height?: number;      // rect only
  position: [number, number, number];
  rotation: [number, number, number];
  castShadow: boolean;
  shadowSoftness: number;
  spotAngle: number;    // spot only, degrees
  spotPenumbra: number; // spot only, 0-1
  distance: number;     // point only, 0 = infinite
  decay: number;        // point only, 2 = physically correct
}
```

- [ ] **Step 3: Add new state fields to RenderSettingsState**

Add after `turntableDirection` (line 40):

```typescript
  // Resolution
  resolutionPreset: ResolutionPreset;
  exportWidth: number;
  exportHeight: number;
  aspectRatioLocked: boolean;

  // Render quality
  samplesPerPixel: number;
  denoiserEnabled: boolean;

  // Export format
  imageFormat: ImageFormat;
  jpegQuality: number;
  exportTransparent: boolean;
  videoFormat: VideoFormat;
  videoFps: number;

  // Avatar
  avatarRenderStyle: AvatarRenderStyle;
```

- [ ] **Step 4: Update initialState with defaults**

Add defaults in the `initialState` object:

```typescript
  resolutionPreset: 'custom',
  exportWidth: 2048,
  exportHeight: 2048,
  aspectRatioLocked: false,
  samplesPerPixel: 1,
  denoiserEnabled: false,
  imageFormat: 'png',
  jpegQuality: 0.9,
  exportTransparent: false,
  videoFormat: 'webm',
  videoFps: 30,
  avatarRenderStyle: 'visible',
```

- [ ] **Step 5: Update createDefaultLight to include new fields**

```typescript
function createDefaultLight(): CustomLight {
  return {
    id: `light-${nextLightId++}`,
    type: 'rect',
    color: '#ffffff',
    intensity: 1.0,
    width: 1,
    height: 1,
    position: [0, 2, 2],
    rotation: [0, 0, 0],
    castShadow: false,
    shadowSoftness: 0.5,
    spotAngle: 45,
    spotPenumbra: 0.5,
    distance: 0,
    decay: 2,
  };
}
```

- [ ] **Step 6: Add migrateLight helper**

Add after `createDefaultLight`:

```typescript
function migrateLight(light: Partial<CustomLight> & { id: string }): CustomLight {
  return {
    type: 'rect',
    color: '#ffffff',
    intensity: 1.0,
    position: [0, 2, 2],
    rotation: [0, 0, 0],
    castShadow: false,
    shadowSoftness: 0.5,
    spotAngle: 45,
    spotPenumbra: 0.5,
    distance: 0,
    decay: 2,
    ...light,
  };
}
```

- [ ] **Step 7: Add new reducers**

Add in the `reducers` object after `setTurntableDirection`:

```typescript
    setResolutionPreset(state, action: PayloadAction<ResolutionPreset>) {
      state.resolutionPreset = action.payload;
      state.aspectRatioLocked = false;
      const presets: Record<ResolutionPreset, [number, number] | null> = {
        '1080p': [1920, 1080],
        '4k': [3840, 2160],
        'instagram': [1080, 1080],
        'instagram-story': [1080, 1920],
        'custom': null,
      };
      const dims = presets[action.payload];
      if (dims) {
        state.exportWidth = dims[0];
        state.exportHeight = dims[1];
      }
    },

    setExportWidth(state, action: PayloadAction<number>) {
      const w = clamp(action.payload, 256, 8192);
      if (state.aspectRatioLocked && state.exportWidth > 0) {
        const ratio = state.exportHeight / state.exportWidth;
        state.exportHeight = clamp(Math.round(w * ratio), 256, 8192);
      }
      state.exportWidth = w;
      state.resolutionPreset = 'custom';
    },

    setExportHeight(state, action: PayloadAction<number>) {
      const h = clamp(action.payload, 256, 8192);
      if (state.aspectRatioLocked && state.exportHeight > 0) {
        const ratio = state.exportWidth / state.exportHeight;
        state.exportWidth = clamp(Math.round(h * ratio), 256, 8192);
      }
      state.exportHeight = h;
      state.resolutionPreset = 'custom';
    },

    setAspectRatioLocked(state, action: PayloadAction<boolean>) {
      state.aspectRatioLocked = action.payload;
    },

    setSamplesPerPixel(state, action: PayloadAction<number>) {
      state.samplesPerPixel = clamp(action.payload, 1, 64);
    },

    setDenoiserEnabled(state, action: PayloadAction<boolean>) {
      state.denoiserEnabled = action.payload;
    },

    setImageFormat(state, action: PayloadAction<ImageFormat>) {
      state.imageFormat = action.payload;
    },

    setJpegQuality(state, action: PayloadAction<number>) {
      state.jpegQuality = clamp(action.payload, 0.1, 1.0);
    },

    setExportTransparent(state, action: PayloadAction<boolean>) {
      state.exportTransparent = action.payload;
    },

    setVideoFormat(state, action: PayloadAction<VideoFormat>) {
      state.videoFormat = action.payload;
    },

    setVideoFps(state, action: PayloadAction<number>) {
      state.videoFps = action.payload;
    },

    setAvatarRenderStyle(state, action: PayloadAction<AvatarRenderStyle>) {
      state.avatarRenderStyle = action.payload;
    },
```

- [ ] **Step 8: Update light presets with new fields and add natural preset**

Update `LIGHT_PRESETS` — add default fields to all existing presets and add the `natural` preset:

```typescript
export const LIGHT_PRESETS: Record<string, CustomLight[]> = {
  studio3Point: [
    { id: 'key',  type: 'rect', color: '#fff5e0', intensity: 1.5, width: 1,   height: 1,   position: [2, 2.5, 1.5],  rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
    { id: 'fill', type: 'rect', color: '#e0eaff', intensity: 0.8, width: 1.5, height: 1.5, position: [-2, 2, 1],     rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
    { id: 'rim',  type: 'rect', color: '#ffffff', intensity: 1.0, width: 0.5, height: 0.5, position: [0, 2, -2],     rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
  ],
  softBox: [
    { id: 'left',  type: 'rect', color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [-2, 1.5, 1], rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
    { id: 'right', type: 'rect', color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [2, 1.5, 1],  rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
  ],
  dramatic: [
    { id: 'main', type: 'rect', color: '#ffffff', intensity: 2.0, width: 0.5, height: 0.5, position: [2, 3, 1], rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
  ],
  natural: [
    { id: 'sun',  type: 'directional', color: '#fff8e7', intensity: 1.2, position: [3, 4, 2],    rotation: [0, 0, 0], castShadow: true, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
    { id: 'fill', type: 'point',       color: '#e8f0ff', intensity: 0.4, position: [-2, 1.5, 1], rotation: [0, 0, 0], castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
  ],
};
```

- [ ] **Step 9: Export all new actions and apply migrateLight in applyLightPreset**

Update `applyLightPreset` reducer to use `migrateLight`:

```typescript
    applyLightPreset(state, action: PayloadAction<string>) {
      const preset = LIGHT_PRESETS[action.payload];
      if (preset) {
        state.lights = preset.map((l) => migrateLight(l));
      }
    },
```

Export all new actions from the slice.

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from renderSettingsSlice changes.

- [ ] **Step 11: Commit**

```bash
git add src/store/renderSettingsSlice.ts
git commit -m "feat(render): extend renderSettingsSlice with resolution, quality, format, avatar, light type state"
```

---

## Task 2: Extend SurfaceMode3D in simulationSlice

**Files:**
- Modify: `src/store/simulationSlice.ts:31`

- [ ] **Step 1: Extend the SurfaceMode3D type**

At line 31, replace:

```typescript
export type SurfaceMode3D = 'textured' | 'translucent' | 'mesh' | 'thick';
```

With:

```typescript
export type SurfaceMode3D =
  | 'textured' | 'translucent' | 'mesh' | 'thick'
  | 'flat' | 'xray' | 'shaded'
  | 'shaded-wire' | 'textured-wire';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. Existing switch/if statements using `SurfaceMode3D` should still work since the new values are additive.

- [ ] **Step 3: Commit**

```bash
git add src/store/simulationSlice.ts
git commit -m "feat(render): extend SurfaceMode3D with flat, xray, shaded, and wire modes"
```

---

## Task 3: Extract Panel into Sub-Components (Shell + Environment + Background + Ground)

**Files:**
- Create: `src/components/Viewport3D/renderSections/EnvironmentSection.tsx`
- Create: `src/components/Viewport3D/renderSections/BackgroundSection.tsx`
- Create: `src/components/Viewport3D/renderSections/GroundSection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create the renderSections directory**

```bash
mkdir -p src/components/Viewport3D/renderSections
```

- [ ] **Step 2: Create EnvironmentSection.tsx**

Extract the Environment section (lines 100-159 of current panel) into its own component:

```typescript
import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setHdriPreset,
  setHdriRotation,
  setHdriCustomUrl,
  HDRI_PRESETS,
} from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function EnvironmentSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { hdriPreset, hdriRotation, hdriCustomUrl } = useSelector(
    (s: RootState) => s.renderSettings,
  );
  const hdriInputRef = useRef<HTMLInputElement>(null);

  const handleHdriUpload = useCallback(
    (file: File) => {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (!['hdr', 'exr'].includes(ext)) return;
      const url = URL.createObjectURL(file);
      dispatch(setHdriCustomUrl(url));
    },
    [dispatch],
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Environment
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="render-hdri-grid">
            {HDRI_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`render-hdri-item ${hdriPreset === preset.id && !hdriCustomUrl ? 'active' : ''}`}
                onClick={() => dispatch(setHdriPreset(preset.id))}
                title={preset.name}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Rotation</span>
              <span>{hdriRotation}&deg;</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range" min={-180} max={180} step={1} value={hdriRotation}
                onChange={(e) => dispatch(setHdriRotation(Number(e.target.value)))}
              />
              <input
                type="number" min={-180} max={180} step={1} value={hdriRotation}
                onChange={(e) => dispatch(setHdriRotation(Number(e.target.value)))}
              />
            </div>
          </div>

          <input
            ref={hdriInputRef}
            type="file"
            accept=".hdr,.exr"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleHdriUpload(f);
              e.target.value = '';
            }}
          />
          <button className="ap-btn" onClick={() => hdriInputRef.current?.click()}>
            Upload HDRI
          </button>
          {hdriCustomUrl && <div className="ap-hint">Custom HDRI loaded</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create BackgroundSection.tsx**

Extract background section (lines 205-236 of current panel):

```typescript
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setBackgroundMode,
  setBackgroundColor,
} from '../../../store/renderSettingsSlice';
import type { BackgroundMode } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function BackgroundSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { backgroundMode, backgroundColor } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Background
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-mode-toggle">
            {(['hdri', 'solid', 'transparent'] as BackgroundMode[]).map((mode) => (
              <button
                key={mode}
                className={backgroundMode === mode ? 'active' : ''}
                onClick={() => dispatch(setBackgroundMode(mode))}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {backgroundMode === 'solid' && (
            <div className="render-color-row">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => dispatch(setBackgroundColor(e.target.value))}
              />
              <span style={{ fontSize: 11, color: '#999' }}>{backgroundColor}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create GroundSection.tsx**

Extract ground section (lines 239-290 of current panel):

```typescript
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setGroundVisible,
  setShadowOpacity,
  setShadowBlur,
} from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function GroundSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { groundVisible, shadowOpacity, shadowBlur } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Ground
      </button>
      {open && (
        <div className="ap-section-body">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={groundVisible}
              onChange={(e) => dispatch(setGroundVisible(e.target.checked))}
            />
            Visible
          </label>

          <div>
            <div className="ap-slider-label">
              <span>Shadow Opacity</span>
              <span>{shadowOpacity.toFixed(2)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range" min={0} max={1} step={0.05} value={shadowOpacity}
                onChange={(e) => dispatch(setShadowOpacity(Number(e.target.value)))}
              />
              <input
                type="number" min={0} max={1} step={0.05} value={shadowOpacity}
                onChange={(e) => dispatch(setShadowOpacity(Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Shadow Blur</span>
              <span>{shadowBlur.toFixed(1)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range" min={0} max={5} step={0.1} value={shadowBlur}
                onChange={(e) => dispatch(setShadowBlur(Number(e.target.value)))}
              />
              <input
                type="number" min={0} max={5} step={0.1} value={shadowBlur}
                onChange={(e) => dispatch(setShadowBlur(Number(e.target.value)))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update RenderSettingsPanel to use extracted sections**

**Important:** To avoid a broken panel during extraction, keep the existing Rendering, Lighting, and Export sections inline in this commit. Replace ONLY the Environment, Background, and Ground sections with the extracted components. The remaining sections will be swapped out one by one in subsequent tasks.

In `RenderSettingsPanel.tsx`:
1. Add imports for the 3 new section components
2. Replace the inline Environment JSX (lines 100-159) with `<EnvironmentSection open={envOpen} onToggle={() => setEnvOpen(!envOpen)} />`
3. Replace the inline Background JSX (lines 205-236) with `<BackgroundSection open={bgOpen} onToggle={() => setBgOpen(!bgOpen)} />`
4. Replace the inline Ground JSX (lines 239-290) with `<GroundSection open={groundOpen} onToggle={() => setGroundOpen(!groundOpen)} />`
5. Keep the Rendering, Lighting, and Export sections inline — they get extracted in Tasks 4, 5, and 8

Also create a shared types file at `src/components/Viewport3D/renderSections/types.ts`:

```typescript
export interface RenderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onExportStill?: (w: number, h: number, transparent: boolean) => void;
  onExportTurntable?: () => void;
  onExportAllViews?: (w: number, h: number, transparent: boolean) => void;
  onExport3D?: (format: '3d-glb' | '3d-gltf' | '3d-usdz', includeAvatar: boolean, scale: number) => void;
  onCopyToClipboard?: () => void;
}
```

Update the `RenderSettingsPanelProps` interface in the panel file to match the types file (add `onCopyToClipboard`).

- [ ] **Step 6: Verify TypeScript compiles and app renders**

Run: `npx tsc --noEmit`
Expected: No errors. The panel should render the 3 extracted sections.

- [ ] **Step 7: Commit**

```bash
git add src/components/Viewport3D/renderSections/ src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "refactor(render): extract Environment, Background, Ground into sub-components"
```

---

## Task 4: Create RenderQualitySection

**Files:**
- Create: `src/components/Viewport3D/renderSections/RenderQualitySection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create RenderQualitySection.tsx**

This section contains the existing tone mapping + exposure controls, plus new sampling and denoiser:

```typescript
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setToneMapping,
  setExposure,
  setSamplesPerPixel,
  setDenoiserEnabled,
} from '../../../store/renderSettingsSlice';
import type { ToneMapping } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function RenderQualitySection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { toneMapping, exposure, samplesPerPixel, denoiserEnabled } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Render Quality
      </button>
      {open && (
        <div className="ap-section-body">
          <div>
            <div className="ap-slider-label"><span>Tone Mapping</span></div>
            <select
              className="ap-select"
              value={toneMapping}
              onChange={(e) => dispatch(setToneMapping(e.target.value as ToneMapping))}
            >
              <option value="aces">ACES Filmic</option>
              <option value="reinhard">Reinhard</option>
              <option value="linear">Linear</option>
            </select>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Exposure</span>
              <span>{exposure.toFixed(1)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range" min={0.1} max={5.0} step={0.1} value={exposure}
                onChange={(e) => dispatch(setExposure(Number(e.target.value)))}
              />
              <input
                type="number" min={0.1} max={5.0} step={0.1} value={exposure}
                onChange={(e) => dispatch(setExposure(Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Export Samples</span>
              <span>{samplesPerPixel}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range" min={1} max={64} step={1} value={samplesPerPixel}
                onChange={(e) => dispatch(setSamplesPerPixel(Number(e.target.value)))}
              />
              <input
                type="number" min={1} max={64} step={1} value={samplesPerPixel}
                onChange={(e) => dispatch(setSamplesPerPixel(Number(e.target.value)))}
              />
            </div>
            <div className="ap-hint">Higher = smoother exports, slower render</div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={denoiserEnabled}
              onChange={(e) => dispatch(setDenoiserEnabled(e.target.checked))}
            />
            Export Denoiser
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to RenderSettingsPanel shell**

Import `RenderQualitySection`, add state `const [qualityOpen, setQualityOpen] = useState(true)`, render it after `EnvironmentSection`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewport3D/renderSections/RenderQualitySection.tsx src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "feat(render): add RenderQualitySection with sampling and denoiser controls"
```

---

## Task 5: Create LightingSection with Multi-Type Support

**Files:**
- Create: `src/components/Viewport3D/renderSections/LightingSection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create LightingSection.tsx**

Enhanced version of the existing lighting section, adding light type selector and type-specific controls:

```typescript
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  addLight,
  removeLight,
  updateLight,
  applyLightPreset,
} from '../../../store/renderSettingsSlice';
import type { LightType } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

const LIGHT_TYPE_LABELS: Record<LightType, string> = {
  rect: 'Area',
  point: 'Point',
  directional: 'Directional',
  spot: 'Spot',
};

export default function LightingSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const lights = useSelector((s: RootState) => s.renderSettings.lights);

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Lighting
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-btn-row">
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('studio3Point'))}>Studio 3-Point</button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('softBox'))}>Soft Box</button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('dramatic'))}>Dramatic</button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('natural'))}>Natural</button>
          </div>

          <button className="ap-btn" onClick={() => dispatch(addLight())} disabled={lights.length >= 4}>
            Add Light
          </button>

          {lights.map((light) => (
            <div key={light.id} className="render-light-item">
              <div className="render-light-header">
                <div className="render-color-row">
                  <input
                    type="color" value={light.color}
                    onChange={(e) => dispatch(updateLight({ id: light.id, changes: { color: e.target.value } }))}
                  />
                  <span>{light.id}</span>
                </div>
                <button
                  className="ap-btn" style={{ flex: 'none', padding: '1px 6px', fontSize: 10 }}
                  onClick={() => dispatch(removeLight(light.id))} title="Remove light"
                >
                  &times;
                </button>
              </div>

              {/* Light Type Selector */}
              <div>
                <div className="ap-slider-label"><span>Type</span></div>
                <select
                  className="ap-select"
                  value={light.type}
                  onChange={(e) => dispatch(updateLight({ id: light.id, changes: { type: e.target.value as LightType } }))}
                >
                  {Object.entries(LIGHT_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Intensity (all types) */}
              <div>
                <div className="ap-slider-label">
                  <span>Intensity</span><span>{light.intensity.toFixed(1)}</span>
                </div>
                <div className="ap-slider-control">
                  <input type="range" min={0} max={10} step={0.1} value={light.intensity}
                    onChange={(e) => dispatch(updateLight({ id: light.id, changes: { intensity: Number(e.target.value) } }))}
                  />
                </div>
              </div>

              {/* Width/Height (rect only) */}
              {light.type === 'rect' && (
                <>
                  <div>
                    <div className="ap-slider-label"><span>Width</span><span>{(light.width ?? 1).toFixed(1)}</span></div>
                    <div className="ap-slider-control">
                      <input type="range" min={0.1} max={5} step={0.1} value={light.width ?? 1}
                        onChange={(e) => dispatch(updateLight({ id: light.id, changes: { width: Number(e.target.value) } }))}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="ap-slider-label"><span>Height</span><span>{(light.height ?? 1).toFixed(1)}</span></div>
                    <div className="ap-slider-control">
                      <input type="range" min={0.1} max={5} step={0.1} value={light.height ?? 1}
                        onChange={(e) => dispatch(updateLight({ id: light.id, changes: { height: Number(e.target.value) } }))}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Spot angle/penumbra (spot only) */}
              {light.type === 'spot' && (
                <>
                  <div>
                    <div className="ap-slider-label"><span>Angle</span><span>{light.spotAngle}&deg;</span></div>
                    <div className="ap-slider-control">
                      <input type="range" min={10} max={90} step={1} value={light.spotAngle}
                        onChange={(e) => dispatch(updateLight({ id: light.id, changes: { spotAngle: Number(e.target.value) } }))}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="ap-slider-label"><span>Penumbra</span><span>{light.spotPenumbra.toFixed(2)}</span></div>
                    <div className="ap-slider-control">
                      <input type="range" min={0} max={1} step={0.05} value={light.spotPenumbra}
                        onChange={(e) => dispatch(updateLight({ id: light.id, changes: { spotPenumbra: Number(e.target.value) } }))}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Shadow toggle (directional & spot only) */}
              {(light.type === 'directional' || light.type === 'spot') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', opacity: 0.5 }}
                  title="Shadow maps require WebGL fallback mode"
                >
                  <input type="checkbox" checked={light.castShadow}
                    onChange={(e) => dispatch(updateLight({ id: light.id, changes: { castShadow: e.target.checked } }))}
                  />
                  Cast Shadow (WebGL only)
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to RenderSettingsPanel shell**

Import `LightingSection`, add state, render after `GroundSection`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewport3D/renderSections/LightingSection.tsx src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "feat(render): add LightingSection with multi-type light support"
```

---

## Task 6: Create AvatarStyleSection

**Files:**
- Create: `src/components/Viewport3D/renderSections/AvatarStyleSection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create AvatarStyleSection.tsx**

```typescript
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import { setAvatarRenderStyle } from '../../../store/renderSettingsSlice';
import type { AvatarRenderStyle } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

const STYLES: { value: AvatarRenderStyle; label: string }[] = [
  { value: 'visible', label: 'Visible' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'silhouette', label: 'Silhouette' },
  { value: 'hidden', label: 'Hidden' },
];

export default function AvatarStyleSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const avatarRenderStyle = useSelector(
    (s: RootState) => s.renderSettings.avatarRenderStyle,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Avatar Style
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-mode-toggle">
            {STYLES.map((s) => (
              <button
                key={s.value}
                className={avatarRenderStyle === s.value ? 'active' : ''}
                onClick={() => dispatch(setAvatarRenderStyle(s.value))}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to RenderSettingsPanel shell**

Import, add state, render after `LightingSection`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/renderSections/AvatarStyleSection.tsx src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "feat(render): add AvatarStyleSection with 4 render style options"
```

---

## Task 7: Create ResolutionSection

**Files:**
- Create: `src/components/Viewport3D/renderSections/ResolutionSection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create ResolutionSection.tsx**

```typescript
import { useSelector, useDispatch } from 'react-redux';
import { Lock, Unlock } from 'lucide-react';
import type { RootState, AppDispatch } from '../../../store';
import {
  setResolutionPreset,
  setExportWidth,
  setExportHeight,
  setAspectRatioLocked,
} from '../../../store/renderSettingsSlice';
import type { ResolutionPreset } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
}

const PRESETS: { value: ResolutionPreset; label: string }[] = [
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
  { value: 'instagram', label: 'IG Square' },
  { value: 'instagram-story', label: 'IG Story' },
  { value: 'custom', label: 'Custom' },
];

export default function ResolutionSection({ open, onToggle }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { resolutionPreset, exportWidth, exportHeight, aspectRatioLocked } =
    useSelector((s: RootState) => s.renderSettings);

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Resolution
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-mode-toggle">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                className={resolutionPreset === p.value ? 'active' : ''}
                onClick={() => dispatch(setResolutionPreset(p.value))}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: '#888' }}>W</label>
            <input
              type="number" min={256} max={8192} step={1} value={exportWidth}
              onChange={(e) => dispatch(setExportWidth(Number(e.target.value)))}
              style={{
                width: 60, padding: '2px 4px', border: '1px solid var(--border-color, #444)',
                borderRadius: 3, background: 'var(--bg-secondary, #2a2a2a)', color: '#ccc',
                fontSize: 10, textAlign: 'right',
              }}
            />
            <button
              className="ap-btn"
              style={{ flex: 'none', padding: '2px 4px', fontSize: 10 }}
              onClick={() => dispatch(setAspectRatioLocked(!aspectRatioLocked))}
              title={aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            >
              {aspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <label style={{ fontSize: 10, color: '#888' }}>H</label>
            <input
              type="number" min={256} max={8192} step={1} value={exportHeight}
              onChange={(e) => dispatch(setExportHeight(Number(e.target.value)))}
              style={{
                width: 60, padding: '2px 4px', border: '1px solid var(--border-color, #444)',
                borderRadius: 3, background: 'var(--bg-secondary, #2a2a2a)', color: '#ccc',
                fontSize: 10, textAlign: 'right',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to RenderSettingsPanel shell**

Import, add state, render after `AvatarStyleSection`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/renderSections/ResolutionSection.tsx src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "feat(render): add ResolutionSection with presets and aspect ratio lock"
```

---

## Task 8: Create ExportSection with Format, Quality, Copy

**Files:**
- Create: `src/components/Viewport3D/renderSections/ExportSection.tsx`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx`

- [ ] **Step 1: Create ExportSection.tsx**

Enhanced version of existing export section with format/quality/copy/FPS:

```typescript
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setImageFormat,
  setJpegQuality,
  setExportTransparent,
  setVideoFormat,
  setVideoFps,
  setTurntableFrameCount,
  setTurntableDirection,
} from '../../../store/renderSettingsSlice';
import type { ImageFormat, VideoFormat } from '../../../store/renderSettingsSlice';

interface Props {
  open: boolean;
  onToggle: () => void;
  onExportStill?: (w: number, h: number, transparent: boolean) => void;
  onExportTurntable?: () => void;
  onExportAllViews?: (w: number, h: number, transparent: boolean) => void;
  onExport3D?: (format: '3d-glb' | '3d-gltf' | '3d-usdz', includeAvatar: boolean, scale: number) => void;
  onCopyToClipboard?: () => void;
}

export default function ExportSection({
  open, onToggle,
  onExportStill, onExportTurntable, onExportAllViews, onExport3D, onCopyToClipboard,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    exportWidth, exportHeight, exportTransparent,
    imageFormat, jpegQuality,
    videoFormat, videoFps,
    turntableFrameCount, turntableDirection,
  } = useSelector((s: RootState) => s.renderSettings);

  const [export3DFormat, setExport3DFormat] = useState<'3d-glb' | '3d-gltf' | '3d-usdz'>('3d-glb');
  const [export3DIncludeAvatar, setExport3DIncludeAvatar] = useState(true);
  const [export3DScale, setExport3DScale] = useState(0.001);
  const [copyToast, setCopyToast] = useState(false);

  const mp4Supported = typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('video/mp4; codecs=avc1');

  const handleCopy = async () => {
    onCopyToClipboard?.();
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Export
      </button>
      {open && (
        <div className="ap-section-body">
          {/* ── Still ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 2 }}>Still</div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Format</label>
            <select className="ap-select" style={{ width: 'auto' }} value={imageFormat}
              onChange={(e) => dispatch(setImageFormat(e.target.value as ImageFormat))}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="exr">EXR (HDR)</option>
            </select>
          </div>

          {imageFormat === 'jpeg' && (
            <div>
              <div className="ap-slider-label">
                <span>Quality</span><span>{jpegQuality.toFixed(1)}</span>
              </div>
              <div className="ap-slider-control">
                <input type="range" min={0.1} max={1.0} step={0.1} value={jpegQuality}
                  onChange={(e) => dispatch(setJpegQuality(Number(e.target.value)))}
                />
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={exportTransparent}
              onChange={(e) => dispatch(setExportTransparent(e.target.checked))}
            />
            Transparent background
          </label>

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ap-btn accent" style={{ flex: 1 }} disabled={!onExportStill}
              onClick={() => onExportStill?.(exportWidth, exportHeight, exportTransparent)}
            >
              Export Still
            </button>
            <button className="ap-btn" disabled={!onCopyToClipboard} onClick={handleCopy}
              title="Copy current view to clipboard"
            >
              Copy
            </button>
          </div>
          {copyToast && (
            <div style={{ fontSize: 10, color: '#8f8', padding: '2px 0', animation: 'fadeIn 0.2s' }}>
              Copied to clipboard
            </div>
          )}

          {/* ── Turntable ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>Turntable</div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Frames</label>
            <select className="ap-select" style={{ width: 'auto' }} value={turntableFrameCount}
              onChange={(e) => dispatch(setTurntableFrameCount(Number(e.target.value)))}
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={36}>36</option>
              <option value={72}>72</option>
            </select>
            <label style={{ fontSize: 10, color: '#888' }}>FPS</label>
            <select className="ap-select" style={{ width: 'auto' }} value={videoFps}
              onChange={(e) => dispatch(setVideoFps(Number(e.target.value)))}
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
            <div className="ap-mode-toggle" style={{ flex: 1 }}>
              <button className={turntableDirection === 'cw' ? 'active' : ''}
                onClick={() => dispatch(setTurntableDirection('cw'))}
              >CW</button>
              <button className={turntableDirection === 'ccw' ? 'active' : ''}
                onClick={() => dispatch(setTurntableDirection('ccw'))}
              >CCW</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Codec</label>
            <select className="ap-select" style={{ width: 'auto' }} value={videoFormat}
              onChange={(e) => dispatch(setVideoFormat(e.target.value as VideoFormat))}
            >
              <option value="webm">WebM (VP9)</option>
              <option value="mp4" disabled={!mp4Supported}>
                MP4 (H.264){!mp4Supported ? ' — not supported' : ''}
              </option>
            </select>
          </div>

          <button className="ap-btn accent" disabled={!onExportTurntable} onClick={() => onExportTurntable?.()}>
            Render Turntable
          </button>

          {/* ── Batch ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>Batch</div>
          <button className="ap-btn accent" disabled={!onExportAllViews}
            onClick={() => onExportAllViews?.(exportWidth, exportHeight, exportTransparent)}
          >
            Export All Views
          </button>

          {/* ── 3D Model ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>3D Model</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Format</label>
            <select className="ap-select" style={{ width: 'auto' }} value={export3DFormat}
              onChange={(e) => setExport3DFormat(e.target.value as '3d-glb' | '3d-gltf' | '3d-usdz')}
            >
              <option value="3d-glb">GLB</option>
              <option value="3d-gltf">glTF</option>
              <option value="3d-usdz">USDZ</option>
            </select>
            <label style={{ fontSize: 10, color: '#888' }}>Scale</label>
            <select className="ap-select" style={{ width: 'auto' }} value={export3DScale}
              onChange={(e) => setExport3DScale(Number(e.target.value))}
            >
              <option value={1.0}>mm</option>
              <option value={0.1}>cm</option>
              <option value={0.001}>m</option>
              <option value={0.03937}>inches</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={export3DIncludeAvatar}
              onChange={(e) => setExport3DIncludeAvatar(e.target.checked)}
            />
            Include avatar
          </label>
          <button className="ap-btn accent" disabled={!onExport3D}
            onClick={() => onExport3D?.(export3DFormat, export3DIncludeAvatar, export3DScale)}
          >
            Export 3D
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to RenderSettingsPanel shell**

Import `ExportSection`, add state, render last. Pass `onExportStill`, `onExportTurntable`, `onExportAllViews`, `onExport3D`, and `onCopyToClipboard` props through.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewport3D/renderSections/ExportSection.tsx src/components/Viewport3D/RenderSettingsPanel.tsx
git commit -m "feat(render): add ExportSection with format, quality, codec, FPS, and copy"
```

---

## Task 9: Multi-Type Light Rendering in CustomLights.tsx

**Files:**
- Modify: `src/components/Viewport3D/CustomLights.tsx`

- [ ] **Step 1: Rewrite CustomLights to support all 4 light types**

Replace the entire file content:

```typescript
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { CustomLight } from '../../store/renderSettingsSlice';

let rectAreaLightInitialized = false;

function RectLight({ light }: { light: CustomLight }) {
  const ref = useRef<THREE.RectAreaLight>(null);

  // RectAreaLightUniformsLib.init() sets up WebGL-specific uniforms.
  // Under WebGPU renderer this may be a no-op. Keep it for WebGL fallback compatibility.
  // If rect area lights don't render correctly under WebGPU, this init can be safely removed.
  useEffect(() => {
    if (rectAreaLightInitialized) return;
    rectAreaLightInitialized = true;
    import('three/examples/jsm/lights/RectAreaLightUniformsLib.js').then(
      ({ RectAreaLightUniformsLib }) => {
        RectAreaLightUniformsLib.init();
      },
    ).catch(() => { /* WebGPU may not need this */ });
  }, []);

  return (
    <rectAreaLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      width={light.width ?? 1}
      height={light.height ?? 1}
      position={light.position}
      rotation={new THREE.Euler(...light.rotation)}
    />
  );
}

function PointLightComponent({ light }: { light: CustomLight }) {
  return (
    <pointLight
      color={light.color}
      intensity={light.intensity}
      position={light.position}
      distance={light.distance}
      decay={light.decay}
    />
  );
}

function DirectionalLightComponent({ light }: { light: CustomLight }) {
  return (
    <directionalLight
      color={light.color}
      intensity={light.intensity}
      position={light.position}
    />
  );
}

function SpotLightComponent({ light }: { light: CustomLight }) {
  return (
    <spotLight
      color={light.color}
      intensity={light.intensity}
      position={light.position}
      angle={THREE.MathUtils.degToRad(light.spotAngle)}
      penumbra={light.spotPenumbra}
      distance={light.distance}
      decay={light.decay}
    />
  );
}

function LightRenderer({ light }: { light: CustomLight }) {
  switch (light.type) {
    case 'point':       return <PointLightComponent light={light} />;
    case 'directional': return <DirectionalLightComponent light={light} />;
    case 'spot':        return <SpotLightComponent light={light} />;
    case 'rect':
    default:            return <RectLight light={light} />;
  }
}

export default function CustomLights() {
  const lights = useSelector((s: RootState) => s.renderSettings.lights);

  return (
    <>
      {lights.map((light) => (
        <LightRenderer key={light.id} light={light} />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/CustomLights.tsx
git commit -m "feat(render): support point, directional, and spot lights in CustomLights"
```

---

## Task 10: New Garment Surface Modes in PieceMesh + GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/PieceMesh.tsx:145-181`
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

- [ ] **Step 1: Extend PieceMesh surface mode logic**

In `PieceMesh.tsx`, replace the opacity/visibility logic (around lines 145-154) to handle new modes:

```typescript
// Determine material properties based on surface mode
const isWireMode = surfaceMode === 'mesh' || surfaceMode === 'xray'
  || surfaceMode === 'shaded-wire' || surfaceMode === 'textured-wire';
const showSolid = surfaceMode !== 'mesh';
const showWireframe = isWireMode;

let solidOpacity = 1.0;
let useEmissiveOnly = false;
let stripTextures = false;

switch (surfaceMode) {
  case 'translucent':
    solidOpacity = isSelected ? 0.4 : 0.2;
    break;
  case 'thick':
    solidOpacity = isSelected ? 0.95 : 0.85;
    break;
  case 'flat':
    solidOpacity = 1.0;
    useEmissiveOnly = true;
    break;
  case 'xray':
    solidOpacity = 0.1;
    break;
  case 'shaded':
  case 'shaded-wire':
    solidOpacity = 1.0;
    stripTextures = true;
    break;
  case 'textured':
  case 'textured-wire':
    solidOpacity = 1.0;
    break;
  case 'mesh':
    solidOpacity = 0.6;
    break;
  default:
    solidOpacity = isSelected ? 0.85 : 0.6;
}
```

Then update the meshStandardMaterial in the solid face mesh to conditionally set emissive/map based on `useEmissiveOnly` and `stripTextures`:

- If `useEmissiveOnly`: set `emissive={pieceColor}`, `emissiveIntensity={1}`, `color="#000000"`, `roughness={1}`
- If `stripTextures`: set `map={null}`, `normalMap={null}`, `roughnessMap={null}`

- [ ] **Step 2: Add surfaceMode3D to GarmentSimulation.tsx**

Add a Redux selector for `surfaceMode3D` near the top of the component. In the mesh rendering section (around line 1004-1041), conditionally adjust the material:

For the CPU/WASM fallback (`meshPhysicalMaterial` path, lines 1017-1039):
- `flat`: override with `emissive={color}`, `emissiveIntensity={1}`, `color="#000000"`
- `shaded`/`shaded-wire`: set `map={null}`, `normalMap={null}`, `roughnessMap={null}`
- `xray`: set `opacity={0.1}`, `depthWrite={false}`
- `translucent`: keep existing logic

For combined wire modes, add a sibling wireframe mesh after the main `<mesh>`. Since `meshBasicNodeMaterial` may not be available as a JSX intrinsic in R3F, create the wireframe material imperatively:

```typescript
// At component level, create wireframe material once:
const wireframeMat = useMemo(() => {
  const mat = new THREE.MeshBasicMaterial({
    wireframe: true,
    color: '#888888',
    transparent: true,
    opacity: 0.3,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  return mat;
}, []);

// In JSX, after the main mesh:
{(surfaceMode === 'xray' || surfaceMode === 'shaded-wire' || surfaceMode === 'textured-wire') && staticGeometry && (
  <mesh geometry={staticGeometry} material={wireframeMat} />
)}
```

**WebGPU compatibility note:** `MeshBasicMaterial` with `wireframe: true` may produce warnings under the WebGPU renderer but typically still renders (wireframe is geometry-level, not shader-level). If it fails at runtime, fall back to `WireframeGeometry` + `LineSegments` which is renderer-agnostic. Test both paths.

For the GPU solver path (TSL `MeshStandardNodeMaterial`, around line 577-593):
- `flat`: After creating the material, set `mat.emissive.set(pieceColor)`, `mat.emissiveIntensity = 1`, `mat.color.set('#000000')`
- `shaded`: Set `mat.map = null`, `mat.normalMap = null`, `mat.roughnessMap = null`
- These properties are on `MeshStandardNodeMaterial` since it extends `MeshStandardMaterial`
- Add the `surfaceMode3D` selector and run these adjustments in a `useEffect` that depends on `surfaceMode3D`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewport3D/PieceMesh.tsx src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(render): implement flat, xray, shaded, and wire surface modes"
```

---

## Task 11: Update DisplayBar3D with New Surface Mode Buttons

**Files:**
- Modify: `src/components/DisplayBar3D/DisplayBar3D.tsx`

- [ ] **Step 1: Add new surface mode buttons**

Add new entries to the `surfaceModes` array (after line 50):

```typescript
import {
  Shirt, Link, Spline,
  Image, Droplets, Box, Layers,
  Activity, ArrowLeftRight, User, Target,
  Square, Scan, Circle, CircleDot, ImagePlus,
} from 'lucide-react';

// ...

const surfaceModes: ModeItem[] = [
  { icon: <Image size={18} />,     label: 'Textured',       mode: 'textured' },
  { icon: <Droplets size={18} />,  label: 'Translucent',    mode: 'translucent' },
  { icon: <Box size={18} />,       label: 'Mesh',           mode: 'mesh' },
  { icon: <Layers size={18} />,    label: 'Thick Surface',  mode: 'thick' },
  { icon: <Square size={18} />,    label: 'Flat',           mode: 'flat' },
  { icon: <Scan size={18} />,      label: 'X-Ray',          mode: 'xray' },
  { icon: <Circle size={18} />,    label: 'Shaded',         mode: 'shaded' },
];

const wireModes: ModeItem[] = [
  { icon: <CircleDot size={18} />,  label: 'Shaded + Wire',   mode: 'shaded-wire' },
  { icon: <ImagePlus size={18} />,  label: 'Textured + Wire', mode: 'textured-wire' },
];
```

Update the `fitModes` to use `Target` for Pressure Points (since `CircleDot` is now used for Shaded+Wire):

```typescript
const fitModes: FitItem[] = [
  { icon: <Activity size={18} />,        label: 'Stress Map',      mode: 'stress' },
  { icon: <ArrowLeftRight size={18} />,  label: 'Strain Map',      mode: 'strain' },
  { icon: <User size={18} />,            label: 'Fit Map',         mode: 'fit' },
  { icon: <Target size={18} />,          label: 'Pressure Points', mode: 'pressure' },
];
```

- [ ] **Step 2: Add wire modes group to the JSX**

After the surface modes rendering block and before fit modes, add a separator and wire modes:

```typescript
<div className="db-separator" />

{wireModes.map(m => (
  <ToolTooltip key={m.mode} name={m.label} position="right">
    <button
      className={`db-btn ${sim.surfaceMode3D === m.mode ? 'mode-active' : ''}`}
      onClick={() => dispatch(setSurfaceMode3D(m.mode))}
    >
      {m.icon}
    </button>
  </ToolTooltip>
))}

<div className="db-separator" />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/DisplayBar3D/DisplayBar3D.tsx
git commit -m "feat(render): add flat, xray, shaded, and wire mode buttons to DisplayBar3D"
```

---

## Task 12: Avatar Render Style in AvatarModel.tsx

**Files:**
- Modify: `src/components/Viewport3D/AvatarModel.tsx`

- [ ] **Step 1: Read avatarRenderStyle from Redux and apply to avatar mesh**

Add a Redux selector for `avatarRenderStyle` near the top of the component. In the `useEffect` that traverses the scene and sets material properties (around line 370-385), apply the style:

```typescript
const avatarRenderStyle = useSelector(
  (s: RootState) => s.renderSettings.avatarRenderStyle,
);

// In the traverse effect, or a new useEffect that depends on avatarRenderStyle:
useEffect(() => {
  if (!scene) return;

  scene.visible = avatarRenderStyle !== 'hidden';
  if (avatarRenderStyle === 'hidden') return;

  // Set render order for transparent mode (renders after garment)
  scene.renderOrder = avatarRenderStyle === 'transparent' ? 1 : 0;

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial) return;

    switch (avatarRenderStyle) {
      case 'visible':
        mat.opacity = 1.0;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.emissive?.setHex(0x000000);
        mat.emissiveIntensity = 0;
        break;
      case 'transparent':
        mat.opacity = 0.3;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.emissive?.setHex(0x000000);
        mat.emissiveIntensity = 0;
        break;
      case 'silhouette':
        mat.opacity = 0.8;
        mat.transparent = true;
        mat.depthWrite = true;
        mat.color?.setHex(0x000000);
        mat.emissive?.setHex(0x111111);
        mat.emissiveIntensity = 1;
        mat.roughness = 1;
        break;
    }
    mat.needsUpdate = true;
  });
}, [scene, avatarRenderStyle]);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Viewport3D/AvatarModel.tsx
git commit -m "feat(render): apply avatar render style (visible/transparent/silhouette/hidden)"
```

---

## Task 13: Export Format Support in stillExporter + turntableRenderer

**Files:**
- Modify: `src/utils/export/stillExporter.ts`
- Modify: `src/utils/export/turntableRenderer.ts`

- [ ] **Step 1: Extend StillExportConfig and export function**

In `stillExporter.ts`, extend the config interface and the export function to support image format and JPEG quality:

```typescript
export interface StillExportConfig {
  width: number;
  height: number;
  transparent: boolean;
  format?: 'png' | 'jpeg' | 'exr';  // NEW
  jpegQuality?: number;              // NEW (0.1-1.0)
  samplesPerPixel?: number;          // NEW
  denoiserEnabled?: boolean;         // NEW
}
```

In the export function, after readback pixels, encode based on format:

```typescript
// After rendering and readback...
const mimeType = config.format === 'jpeg' ? 'image/jpeg' : 'image/png';
const quality = config.format === 'jpeg' ? (config.jpegQuality ?? 0.9) : undefined;
const ext = config.format === 'jpeg' ? 'jpg' : config.format === 'exr' ? 'exr' : 'png';

// For PNG/JPEG: use canvas.toBlob
const canvas2d = document.createElement('canvas');
canvas2d.width = width;
canvas2d.height = height;
const ctx = canvas2d.getContext('2d')!;
const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
ctx.putImageData(imageData, 0, 0);

const blob = await new Promise<Blob>((resolve) =>
  canvas2d.toBlob((b) => resolve(b!), mimeType, quality),
);

// Auto-name with timestamp
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
downloadBlob(blob, `openclo-render-${ts}.${ext}`);
```

For EXR: add a try/catch dynamic import of `EXRExporter` — if unavailable, fall back to PNG.

- [ ] **Step 2: Extend turntableRenderer for codec/FPS**

In `turntableRenderer.ts`, update the config interface and MediaRecorder setup:

```typescript
export interface TurntableConfig {
  frameCount: number;
  direction: 'cw' | 'ccw';
  fps?: number;              // NEW (default: 30)
  videoFormat?: 'webm' | 'mp4'; // NEW
  onProgress?: (frame: number, total: number) => void;
}
```

Update the MediaRecorder creation:

```typescript
const fps = config.fps ?? 30;
const stream = offscreen.captureStream(fps);

let mimeType: string;
if (config.videoFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
  mimeType = 'video/mp4; codecs=avc1';
} else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
  mimeType = 'video/webm;codecs=vp9';
} else {
  mimeType = 'video/webm';
}

const mediaRecorder = new MediaRecorder(stream, {
  mimeType,
  videoBitsPerSecond: 8_000_000,
});
```

Update the file extension in the download:

```typescript
const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
downloadBlob(blob, `openclo-turntable-${ts}.${ext}`);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/utils/export/stillExporter.ts src/utils/export/turntableRenderer.ts
git commit -m "feat(render): add JPEG/EXR format support and MP4/FPS options for export"
```

---

## Task 14: Copy to Clipboard + Export Callback Wiring

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx:314-398`

- [ ] **Step 1: Add copy-to-clipboard callback**

In `Viewport3D.tsx`, add a new callback alongside the existing export callbacks:

```typescript
const handleCopyToClipboard = useCallback(async () => {
  const container = containerRef.current;
  if (!container) return;
  const canvas = container.querySelector('canvas');
  if (!canvas) return;

  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    );
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (err) {
    console.warn('Copy to clipboard failed:', err);
  }
}, []);
```

- [ ] **Step 2: Update export callbacks to use Redux state for format/quality**

Update `handleExportStill` to read format/quality/samples from Redux state. Use the same store access pattern as the existing `handleExportTurntable` — `(window as unknown as Record<string, unknown>).__OPENCLO_STORE__` or whatever the existing turntable callback uses at line 336:

```typescript
const handleExportStill = useCallback(async (width: number, height: number, transparent: boolean) => {
  // ... existing ref extraction ...
  const storeRef = (window as any).__OPENCLO_STORE__;
  const settings = storeRef?.getState().renderSettings;
  await exportStill(gl, sc, cam, {
    width,
    height,
    transparent,
    format: settings?.imageFormat,
    jpegQuality: settings?.jpegQuality,
    samplesPerPixel: settings?.samplesPerPixel,
    denoiserEnabled: settings?.denoiserEnabled,
  });
}, []);
```

Update `handleExportTurntable` to pass FPS and video format:

```typescript
const handleExportTurntable = useCallback(async () => {
  const storeRef = (window as any).__OPENCLO_STORE__;
  const config = storeRef?.getState().renderSettings;
  const blob = await renderTurntable(gl, sc, cam, {
    frameCount: config?.turntableFrameCount ?? 36,
    direction: config?.turntableDirection ?? 'cw',
    fps: config?.videoFps,
    videoFormat: config?.videoFormat,
  });
  const ext = config?.videoFormat === 'mp4' ? 'mp4' : 'webm';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `openclo-turntable-${ts}.${ext}`);
}, []);
```

Also update `handleExportAllViews` to pass format/quality through:

```typescript
const handleExportAllViews = useCallback(async (width: number, height: number, transparent: boolean) => {
  const storeRef = (window as any).__OPENCLO_STORE__;
  const settings = storeRef?.getState().renderSettings;
  await exportAllViews(gl, sc, cam, {
    width, height, transparent,
    format: settings?.imageFormat,
    jpegQuality: settings?.jpegQuality,
    samplesPerPixel: settings?.samplesPerPixel,
    denoiserEnabled: settings?.denoiserEnabled,
  });
}, []);
```

- [ ] **Step 3: Pass onCopyToClipboard to RenderSettingsPanel**

In the JSX where `RenderSettingsPanel` is rendered (around line 637):

```typescript
<RenderSettingsPanel
  open={renderPanelOpen}
  onClose={() => setRenderPanelOpen(false)}
  onExportStill={handleExportStill}
  onExportTurntable={handleExportTurntable}
  onExportAllViews={handleExportAllViews}
  onExport3D={handleExport3D}
  onCopyToClipboard={handleCopyToClipboard}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(render): wire copy-to-clipboard and format-aware export callbacks"
```

---

## Task 15: Register Copilot Tools

**Files:**
- Create: `src/tools/renderTools.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Create renderTools.ts**

Create copilot tool definitions following the exact `ToolDefinition` and `CopilotToolMetadata` interfaces from `src/tools/types.ts`. The `copilot` field requires `description`, `examples` (string[]), `keywords` (string[]), and optionally `parameterHints`. Parameters for copilot schema generation come from the `options: ToolOption[]` array on each tool.

```typescript
import type { ToolDefinition } from './types';

// Dummy icon for copilot-only tools (hidden from toolbar)
const NoIcon: React.FC<{ size?: number }> = () => null;

export const renderTools: ToolDefinition[] = [
  {
    id: 'setRenderResolution',
    name: 'Set Render Resolution',
    description: 'Set render resolution by preset or custom dimensions',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'preset', label: 'Preset', type: 'select', value: 'custom',
        choices: [
          { label: '1080p', value: '1080p' }, { label: '4K', value: '4k' },
          { label: 'IG Square', value: 'instagram' }, { label: 'IG Story', value: 'instagram-story' },
          { label: 'Custom', value: 'custom' },
        ] },
      { id: 'width', label: 'Width', type: 'number', value: 2048, min: 256, max: 8192 },
      { id: 'height', label: 'Height', type: 'number', value: 2048, min: 256, max: 8192 },
    ],
    copilot: {
      description: 'Set render resolution by preset (1080p, 4k, instagram, instagram-story) or custom width/height',
      examples: ['Set resolution to 4K', 'Make it 1080x1080', 'Use Instagram story resolution'],
      keywords: ['resolution', 'size', 'dimensions', 'width', 'height', '4k', '1080p', 'instagram'],
      produces: 'view',
      parameterHints: { preset: 'Resolution preset name', width: 'Custom width in pixels', height: 'Custom height in pixels' },
    },
  },
  {
    id: 'setGarmentDisplayMode',
    name: 'Set Garment Display Mode',
    description: 'Change garment surface rendering mode',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'mode', label: 'Mode', type: 'select', value: 'textured',
        choices: [
          { label: 'Textured', value: 'textured' }, { label: 'Translucent', value: 'translucent' },
          { label: 'Mesh', value: 'mesh' }, { label: 'Thick', value: 'thick' },
          { label: 'Flat', value: 'flat' }, { label: 'X-Ray', value: 'xray' },
          { label: 'Shaded', value: 'shaded' }, { label: 'Shaded+Wire', value: 'shaded-wire' },
          { label: 'Textured+Wire', value: 'textured-wire' },
        ] },
    ],
    copilot: {
      description: 'Set garment display mode: textured, translucent, mesh, thick, flat, xray, shaded, shaded-wire, textured-wire',
      examples: ['Switch to X-Ray mode', 'Show flat view', 'Use shaded wireframe'],
      keywords: ['display', 'surface', 'render', 'flat', 'xray', 'wireframe', 'shaded', 'textured'],
      produces: 'view',
    },
  },
  {
    id: 'setAvatarRenderStyle',
    name: 'Set Avatar Render Style',
    description: 'Change avatar visibility in renders',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'style', label: 'Style', type: 'select', value: 'visible',
        choices: [
          { label: 'Visible', value: 'visible' }, { label: 'Transparent', value: 'transparent' },
          { label: 'Silhouette', value: 'silhouette' }, { label: 'Hidden', value: 'hidden' },
        ] },
    ],
    copilot: {
      description: 'Set avatar render style: visible, transparent, silhouette, hidden',
      examples: ['Hide the avatar', 'Make avatar transparent', 'Show avatar silhouette'],
      keywords: ['avatar', 'mannequin', 'visible', 'hidden', 'transparent', 'silhouette'],
      produces: 'view',
    },
  },
  {
    id: 'applyLightingPreset',
    name: 'Apply Lighting Preset',
    description: 'Apply a lighting preset to the 3D scene',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'preset', label: 'Preset', type: 'select', value: 'studio3Point',
        choices: [
          { label: 'Studio 3-Point', value: 'studio3Point' }, { label: 'Soft Box', value: 'softBox' },
          { label: 'Dramatic', value: 'dramatic' }, { label: 'Natural', value: 'natural' },
        ] },
    ],
    copilot: {
      description: 'Apply lighting preset: studio3Point, softBox, dramatic, natural',
      examples: ['Use studio 3-point lighting', 'Set dramatic lighting', 'Apply natural lighting'],
      keywords: ['light', 'lighting', 'studio', 'dramatic', 'natural', 'preset'],
      produces: 'view',
    },
  },
  {
    id: 'exportRender',
    name: 'Export Render',
    description: 'Export a rendered image or animation',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'type', label: 'Type', type: 'select', value: 'still',
        choices: [
          { label: 'Still', value: 'still' }, { label: 'Turntable', value: 'turntable' },
          { label: 'All Views', value: 'allViews' },
        ] },
      { id: 'format', label: 'Format', type: 'select', value: 'png',
        choices: [
          { label: 'PNG', value: 'png' }, { label: 'JPEG', value: 'jpeg' }, { label: 'EXR', value: 'exr' },
        ] },
    ],
    copilot: {
      description: 'Export render: type (still/turntable/allViews), optional format (png/jpeg/exr)',
      examples: ['Export a 4K PNG', 'Render turntable video', 'Export all views as JPEG'],
      keywords: ['export', 'render', 'save', 'image', 'turntable', 'video', 'png', 'jpeg'],
      produces: 'none',
    },
  },
  {
    id: 'copyRenderToClipboard',
    name: 'Copy Render to Clipboard',
    description: 'Copy the current 3D view to clipboard',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    copilot: {
      description: 'Copy the current 3D viewport to clipboard as PNG',
      examples: ['Copy the current view', 'Copy to clipboard', 'Screenshot to clipboard'],
      keywords: ['copy', 'clipboard', 'screenshot', 'capture'],
      produces: 'none',
    },
  },
  {
    id: 'setRenderQuality',
    name: 'Set Render Quality',
    description: 'Configure export render quality settings',
    context: '3d',
    hidden: true,
    icon: NoIcon,
    options: [
      { id: 'samples', label: 'Samples', type: 'number', value: 1, min: 1, max: 64 },
      { id: 'denoiser', label: 'Denoiser', type: 'toggle', value: false },
    ],
    copilot: {
      description: 'Set render quality: samples (1-64 for export), denoiser (on/off)',
      examples: ['Set samples to 32', 'Enable denoiser', 'High quality export settings'],
      keywords: ['quality', 'samples', 'denoiser', 'render', 'export'],
      produces: 'none',
    },
  },
];
```

- [ ] **Step 2: Register in index.ts**

In `src/tools/index.ts`, add import at the top with the other imports:

```typescript
import { renderTools } from './renderTools';
```

Then add the spread at the end of the `allTools` array (after `meshGrabTool`, before the closing `];`):

```typescript
  // 3D Tools — Rendering (copilot-only, hidden from toolbar)
  ...renderTools,
];
```

This follows the existing pattern — `allTools` is an untyped array, and the `forEach` at line 137 registers each tool.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/tools/renderTools.ts src/tools/index.ts
git commit -m "feat(render): register 7 copilot tools for rendering operations"
```

---

## Task 16: Final Verification and Cleanup

**Files:** All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run unit tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 3: Verify panel renders all 8 sections**

Open the app, click the render settings button in the 3D viewport. Verify all 8 sections appear:
1. Environment
2. Render Quality (with sampling/denoiser)
3. Background
4. Ground
5. Lighting (with type selector)
6. Avatar Style (4-button toggle)
7. Resolution (presets + lock)
8. Export (format/quality/copy)

- [ ] **Step 4: Verify DisplayBar3D shows new modes**

Check the 3D display bar shows: Flat, X-Ray, Shaded, Shaded+Wire, Textured+Wire buttons.

- [ ] **Step 5: Verify light presets work**

Click each lighting preset (Studio 3-Point, Soft Box, Dramatic, Natural) and confirm lights render.

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(render): final cleanup for rendering enhancements"
```
