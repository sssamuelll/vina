import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneMapping = 'aces' | 'reinhard' | 'linear';
export type BackgroundMode = 'hdri' | 'solid' | 'transparent';

export interface CustomLight {
  id: string;
  color: string;       // hex
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

export const LIGHT_PRESETS: Record<string, CustomLight[]> = {
  studio3Point: [
    { id: 'key',  color: '#fff5e0', intensity: 1.5, width: 1,   height: 1,   position: [2, 2.5, 1.5],  rotation: [0, 0, 0] },
    { id: 'fill', color: '#e0eaff', intensity: 0.8, width: 1.5, height: 1.5, position: [-2, 2, 1],     rotation: [0, 0, 0] },
    { id: 'rim',  color: '#ffffff', intensity: 1.0, width: 0.5, height: 0.5, position: [0, 2, -2],     rotation: [0, 0, 0] },
  ],
  softBox: [
    { id: 'left',  color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [-2, 1.5, 1], rotation: [0, 0, 0] },
    { id: 'right', color: '#ffffff', intensity: 1.0, width: 2, height: 2, position: [2, 1.5, 1],  rotation: [0, 0, 0] },
  ],
  dramatic: [
    { id: 'main', color: '#ffffff', intensity: 2.0, width: 0.5, height: 0.5, position: [2, 3, 1], rotation: [0, 0, 0] },
  ],
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
    color: '#ffffff',
    intensity: 1.0,
    width: 1,
    height: 1,
    position: [0, 2, 2],
    rotation: [0, 0, 0],
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
        state.lights = preset.map((l) => ({ ...l }));
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
} = renderSettingsSlice.actions;

export default renderSettingsSlice.reducer;
