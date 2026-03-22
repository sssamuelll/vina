import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneMapping = 'aces' | 'reinhard' | 'linear';
export type BackgroundMode = 'hdri' | 'solid' | 'transparent';
export type LightType = 'rect' | 'point' | 'spot' | 'directional';
export type AvatarRenderStyle = 'visible' | 'hidden' | 'wireframe' | 'xray';
export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type VideoFormat = 'webm' | 'mp4';
export type ResolutionPreset = '1080p' | '4k' | 'instagram' | 'instagram-story' | 'custom';

export interface CustomLight {
  id: string;
  type: LightType;
  color: string;       // hex
  intensity: number;
  width?: number;
  height?: number;
  position: [number, number, number];
  rotation: [number, number, number];
  castShadow: boolean;
  shadowSoftness: number;
  spotAngle: number;
  spotPenumbra: number;
  distance: number;
  decay: number;
}

export interface HdriPreset {
  id: string;
  name: string;
  file: string;
  thumbnail: string;
}

export interface RenderSettingsState {
  hdriPreset: string;
  hdriRotation: number;          // -180 .. 180
  hdriCustomUrl: string | null;
  toneMapping: ToneMapping;
  exposure: number;              // 0.1 .. 5.0
  backgroundMode: BackgroundMode;
  backgroundColor: string;       // hex
  lights: CustomLight[];         // max 4
  groundVisible: boolean;
  shadowOpacity: number;         // 0 .. 1
  shadowBlur: number;            // 0 .. 5
  turntableFrameCount: number;
  turntableDirection: 'cw' | 'ccw';
  // Resolution
  resolutionPreset: ResolutionPreset;
  exportWidth: number;
  exportHeight: number;
  aspectRatioLocked: boolean;
  // Quality
  samplesPerPixel: number;
  denoiserEnabled: boolean;
  // Format
  imageFormat: ImageFormat;
  jpegQuality: number;           // 0.0 .. 1.0
  exportTransparent: boolean;
  videoFormat: VideoFormat;
  videoFps: number;
  // Avatar
  avatarRenderStyle: AvatarRenderStyle;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HDRI_PRESETS: HdriPreset[] = [
  { id: 'studio-soft',       name: 'Studio Soft', file: '/hdri/studio-soft.hdr',       thumbnail: '/hdri/thumb-studio-soft.jpg' },
  { id: 'studio-hard',       name: 'Studio Hard', file: '/hdri/studio-hard.hdr',       thumbnail: '/hdri/thumb-studio-hard.jpg' },
  { id: 'showroom',          name: 'Showroom',    file: '/hdri/showroom.hdr',          thumbnail: '/hdri/thumb-showroom.jpg' },
  { id: 'outdoor-daylight',  name: 'Outdoor',     file: '/hdri/outdoor-daylight.hdr',  thumbnail: '/hdri/thumb-outdoor-daylight.jpg' },
  { id: 'sunset',            name: 'Sunset',      file: '/hdri/sunset.hdr',            thumbnail: '/hdri/thumb-sunset.jpg' },
  { id: 'neutral-grey',      name: 'Neutral',     file: '/hdri/neutral-grey.hdr',      thumbnail: '/hdri/thumb-neutral-grey.jpg' },
];

const LIGHT_NEW_DEFAULTS: Omit<CustomLight, 'id' | 'color' | 'intensity' | 'width' | 'height' | 'position' | 'rotation'> = {
  type: 'rect',
  castShadow: false,
  shadowSoftness: 0.5,
  spotAngle: 45,
  spotPenumbra: 0.5,
  distance: 0,
  decay: 2,
};

export const LIGHT_PRESETS: Record<string, CustomLight[]> = {
  studio3Point: [
    { id: 'key',  color: '#fff5e0', intensity: 1.5, width: 1,   height: 1,   position: [2, 2.5, 1.5],  rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
    { id: 'fill', color: '#e0eaff', intensity: 0.8, width: 1.5, height: 1.5, position: [-2, 2, 1],     rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
    { id: 'rim',  color: '#ffffff', intensity: 1.0, width: 0.5, height: 0.5, position: [0, 2, -2],     rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
  ],
  softBox: [
    { id: 'left',  color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [-2, 1.5, 1], rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
    { id: 'right', color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [2, 1.5, 1],  rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
  ],
  dramatic: [
    { id: 'main', color: '#ffffff', intensity: 2.0, width: 0.5, height: 0.5, position: [2, 3, 1], rotation: [0, 0, 0], ...LIGHT_NEW_DEFAULTS },
  ],
  natural: [
    { id: 'sun',  color: '#fff8e7', intensity: 2.0, position: [5, 8, 3],  rotation: [0, 0, 0], type: 'directional', castShadow: true,  shadowSoftness: 0.3, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
    { id: 'fill', color: '#b0c8ff', intensity: 0.5, position: [-3, 2, 2], rotation: [0, 0, 0], type: 'point',       castShadow: false, shadowSoftness: 0.5, spotAngle: 45, spotPenumbra: 0.5, distance: 0, decay: 2 },
  ],
};

const RESOLUTION_PRESET_DIMENSIONS: Record<Exclude<ResolutionPreset, 'custom'>, [number, number]> = {
  '1080p': [1920, 1080],
  '4k': [3840, 2160],
  'instagram': [1080, 1080],
  'instagram-story': [1080, 1920],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let nextLightId = 1;

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

/**
 * Ensures a light object (e.g. from a preset or persisted state) has all
 * required fields, back-filling missing ones with safe defaults.
 */
function migrateLight(partial: Partial<CustomLight> & Pick<CustomLight, 'id' | 'color' | 'intensity' | 'position' | 'rotation'>): CustomLight {
  return {
    type: 'rect',
    width: 1,
    height: 1,
    castShadow: false,
    shadowSoftness: 0.5,
    spotAngle: 45,
    spotPenumbra: 0.5,
    distance: 0,
    decay: 2,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: RenderSettingsState = {
  hdriPreset: 'studio-soft',
  hdriRotation: 0,
  hdriCustomUrl: null,
  toneMapping: 'aces',
  exposure: 1.0,
  backgroundMode: 'solid',
  backgroundColor: '#e0e0e0',
  lights: [],
  groundVisible: true,
  shadowOpacity: 0.4,
  shadowBlur: 2,
  turntableFrameCount: 36,
  turntableDirection: 'cw',
  // Resolution
  resolutionPreset: 'custom',
  exportWidth: 2048,
  exportHeight: 2048,
  aspectRatioLocked: false,
  // Quality
  samplesPerPixel: 1,
  denoiserEnabled: false,
  // Format
  imageFormat: 'png',
  jpegQuality: 0.9,
  exportTransparent: false,
  videoFormat: 'webm',
  videoFps: 30,
  // Avatar
  avatarRenderStyle: 'visible',
};

const renderSettingsSlice = createSlice({
  name: 'renderSettings',
  initialState,
  reducers: {
    setHdriPreset(state, action: PayloadAction<string>) {
      state.hdriPreset = action.payload;
      state.hdriCustomUrl = null;
    },

    setHdriRotation(state, action: PayloadAction<number>) {
      state.hdriRotation = clamp(action.payload, -180, 180);
    },

    setHdriCustomUrl(state, action: PayloadAction<string | null>) {
      state.hdriCustomUrl = action.payload;
      if (action.payload !== null) {
        state.hdriPreset = 'custom';
      }
    },

    setToneMapping(state, action: PayloadAction<ToneMapping>) {
      state.toneMapping = action.payload;
    },

    setExposure(state, action: PayloadAction<number>) {
      state.exposure = clamp(action.payload, 0.1, 5.0);
    },

    setBackgroundMode(state, action: PayloadAction<BackgroundMode>) {
      state.backgroundMode = action.payload;
    },

    setBackgroundColor(state, action: PayloadAction<string>) {
      state.backgroundColor = action.payload;
    },

    addLight(state) {
      if (state.lights.length < 4) {
        state.lights.push(createDefaultLight());
      }
    },

    removeLight(state, action: PayloadAction<string>) {
      state.lights = state.lights.filter((l) => l.id !== action.payload);
    },

    updateLight(state, action: PayloadAction<{ id: string; changes: Partial<Omit<CustomLight, 'id'>> }>) {
      const light = state.lights.find((l) => l.id === action.payload.id);
      if (light) {
        Object.assign(light, action.payload.changes);
      }
    },

    applyLightPreset(state, action: PayloadAction<string>) {
      const preset = LIGHT_PRESETS[action.payload];
      if (preset) {
        state.lights = preset.map((l) => migrateLight({ ...l }));
      }
    },

    setGroundVisible(state, action: PayloadAction<boolean>) {
      state.groundVisible = action.payload;
    },

    setShadowOpacity(state, action: PayloadAction<number>) {
      state.shadowOpacity = clamp(action.payload, 0, 1);
    },

    setShadowBlur(state, action: PayloadAction<number>) {
      state.shadowBlur = clamp(action.payload, 0, 5);
    },

    setTurntableFrameCount(state, action: PayloadAction<number>) {
      state.turntableFrameCount = action.payload;
    },

    setTurntableDirection(state, action: PayloadAction<'cw' | 'ccw'>) {
      state.turntableDirection = action.payload;
    },

    // --- Resolution ---

    setResolutionPreset(state, action: PayloadAction<ResolutionPreset>) {
      state.resolutionPreset = action.payload;
      if (action.payload !== 'custom') {
        const [w, h] = RESOLUTION_PRESET_DIMENSIONS[action.payload];
        state.exportWidth = w;
        state.exportHeight = h;
        // Presets impose a fixed ratio; unlock so the user can freely adjust after
        state.aspectRatioLocked = false;
      }
    },

    setExportWidth(state, action: PayloadAction<number>) {
      const newWidth = Math.max(1, Math.round(action.payload));
      if (state.aspectRatioLocked && state.exportWidth > 0) {
        const ratio = state.exportHeight / state.exportWidth;
        state.exportHeight = Math.max(1, Math.round(newWidth * ratio));
      }
      state.exportWidth = newWidth;
      state.resolutionPreset = 'custom';
    },

    setExportHeight(state, action: PayloadAction<number>) {
      const newHeight = Math.max(1, Math.round(action.payload));
      if (state.aspectRatioLocked && state.exportHeight > 0) {
        const ratio = state.exportWidth / state.exportHeight;
        state.exportWidth = Math.max(1, Math.round(newHeight * ratio));
      }
      state.exportHeight = newHeight;
      state.resolutionPreset = 'custom';
    },

    setAspectRatioLocked(state, action: PayloadAction<boolean>) {
      state.aspectRatioLocked = action.payload;
    },

    // --- Quality ---

    setSamplesPerPixel(state, action: PayloadAction<number>) {
      state.samplesPerPixel = Math.max(1, Math.round(action.payload));
    },

    setDenoiserEnabled(state, action: PayloadAction<boolean>) {
      state.denoiserEnabled = action.payload;
    },

    // --- Format ---

    setImageFormat(state, action: PayloadAction<ImageFormat>) {
      state.imageFormat = action.payload;
    },

    setJpegQuality(state, action: PayloadAction<number>) {
      state.jpegQuality = clamp(action.payload, 0, 1);
    },

    setExportTransparent(state, action: PayloadAction<boolean>) {
      state.exportTransparent = action.payload;
    },

    setVideoFormat(state, action: PayloadAction<VideoFormat>) {
      state.videoFormat = action.payload;
    },

    setVideoFps(state, action: PayloadAction<number>) {
      state.videoFps = Math.max(1, Math.round(action.payload));
    },

    // --- Avatar ---

    setAvatarRenderStyle(state, action: PayloadAction<AvatarRenderStyle>) {
      state.avatarRenderStyle = action.payload;
    },
  },
});

export const {
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
  setResolutionPreset,
  setExportWidth,
  setExportHeight,
  setAspectRatioLocked,
  setSamplesPerPixel,
  setDenoiserEnabled,
  setImageFormat,
  setJpegQuality,
  setExportTransparent,
  setVideoFormat,
  setVideoFps,
  setAvatarRenderStyle,
} = renderSettingsSlice.actions;

export default renderSettingsSlice.reducer;
