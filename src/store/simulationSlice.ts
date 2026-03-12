/**
 * Redux slice for cloth simulation state.
 *
 * Manages simulation lifecycle (idle/running/paused) and per-piece fabric assignments.
 *
 * @module simulationSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { FitMapMode, FitMapConfig, FitMapStats } from '../utils/cloth/fitMaps';
import type { QualityLevel } from '../utils/cloth/gpu/qualityPresets';

/** Simulation lifecycle state. */
export type SimulationState = 'idle' | 'running' | 'paused';

/** 3D viewport mode: arrange (position pieces) or simulate (cloth physics). */
export type ViewMode3D = 'arrange' | 'simulate';

/** Snapshot of piece 3D positions for reset functionality. */
export interface ArrangementSnapshot {
  /** piece ID → [x, y, z] position */
  positions: Record<string, [number, number, number]>;
  timestamp: number;
}

/** Which solver tier is currently active. */
export type SolverTier = 'none' | 'webgpu' | 'wasm' | 'cpu-worker' | 'neural-drape';

/** 3D surface rendering mode. */
export type SurfaceMode3D = 'textured' | 'translucent' | 'mesh' | 'thick';

/** Pin strength determines how firmly the vertex is held. */
export type PinStrength = 'weak' | 'medium' | 'strong';

/** A pinned vertex in the cloth simulation. */
export interface PinData {
  /** Unique pin ID */
  id: string;
  /** Vertex index in the simulation mesh */
  vertexIndex: number;
  /** Target position [x, y, z] in world coordinates */
  targetPosition: [number, number, number];
  /** How firmly the pin holds the vertex */
  strength: PinStrength;
}

/** Metadata for a simulation state snapshot. Heavy data stays in worker. */
export interface SimSnapshotMeta {
  id: string;
  name: string;
  timestamp: number;
  particleCount: number;
  isAutoSave: boolean;
}

interface SimulationSliceState {
  /** Current simulation state */
  simulationState: SimulationState;
  /** Fabric ID assigned to each pattern piece, keyed by piece ID */
  pieceFabrics: Record<string, string>;
  /** Default fabric ID for new pieces */
  defaultFabricId: string;
  /** Default particle distance in mm (CLO3D-style mesh density control) */
  particleDistance: number;
  /** Per-piece particle distance overrides in mm, keyed by piece ID */
  pieceParticleDistance: Record<string, number>;
  /** Active fit map visualization mode */
  fitMapMode: FitMapMode;
  /** Fit map visualization configuration */
  fitMapConfig: FitMapConfig;
  /** Quality preset level */
  qualityLevel: QualityLevel;
  /** Auto-quality detection enabled */
  autoQuality: boolean;
  /** Currently active solver tier */
  solverTier: SolverTier;
  /** Frame time in ms (rolling average) */
  frameTimeMs: number;
  /** Particle count in active simulation */
  particleCount: number;
  /** Whether body collision is active */
  bodyCollision: boolean;
  /** 3D viewport mode */
  viewMode3D: ViewMode3D;
  /** Pre-simulation arrangement snapshot for reset */
  arrangementSnapshot: ArrangementSnapshot | null;
  /** Pinned vertices for cloth simulation */
  pinnedVertices: Record<string, PinData>;
  /** Currently selected pin ID (for editing/dragging) */
  selectedPinId: string | null;
  /** 3D visibility: show garment pieces */
  showGarment: boolean;
  /** 3D visibility: show seam connection lines */
  showSeamlines3D: boolean;
  /** 3D visibility: show internal lines (darts, notches, etc.) */
  showInternalLines3D: boolean;
  /** 3D surface rendering mode */
  surfaceMode3D: SurfaceMode3D;
  /** Simulation state snapshots (max 4: 1 auto + 3 manual) */
  snapshots: SimSnapshotMeta[];
  /** Currently active snapshot ID */
  activeSnapshotId: string | null;
  /** Whether the simulation is warm-starting after a dimension edit */
  isWarmStarting: boolean;
  /** Wind force direction vector [x, y, z] in N/m² */
  windForce: [number, number, number];
  /** Whether wind is enabled */
  windEnabled: boolean;
  /** Drag coefficient (scales wind and air drag) */
  dragCoefficient: number;
  /** Latest fit map statistics (null when no fit map active) */
  fitMapStats: FitMapStats | null;
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
}

const initialState: SimulationSliceState = {
  simulationState: 'idle',
  pieceFabrics: {},
  defaultFabricId: 'cotton-poplin',
  particleDistance: 5,
  pieceParticleDistance: {},
  fitMapMode: 'none' as FitMapMode,
  fitMapConfig: {
    stressRange: [0, 100],
    strainRange: [1.0, 1.2],
    fitThresholds: [0.8, 1.0],
    pressureDistance: 0.002,
  },
  qualityLevel: 'standard' as QualityLevel,
  autoQuality: true,
  solverTier: 'none' as SolverTier,
  frameTimeMs: 0,
  particleCount: 0,
  bodyCollision: false,
  viewMode3D: 'arrange' as ViewMode3D,
  arrangementSnapshot: null,
  pinnedVertices: {},
  selectedPinId: null,
  showGarment: true,
  showSeamlines3D: true,
  showInternalLines3D: true,
  surfaceMode3D: 'textured' as SurfaceMode3D,
  snapshots: [],
  activeSnapshotId: null,
  isWarmStarting: false,
  windForce: [0, 0, 0],
  windEnabled: false,
  dragCoefficient: 1.0,
  fitMapStats: null,
  pieceTints: {},
  pieceTextureOverrides: {},
  pieceUVTransforms: {},
};

const simulationSlice = createSlice({
  name: 'simulation',
  initialState,
  reducers: {
    /** Start the cloth simulation. */
    startSimulation(state) {
      state.simulationState = 'running';
    },
    /** Pause the cloth simulation. */
    pauseSimulation(state) {
      state.simulationState = 'paused';
    },
    /** Reset the cloth simulation to idle. */
    resetSimulation(state) {
      state.simulationState = 'idle';
    },
    /** Set the fabric for a specific pattern piece. */
    setFabric(state, action: PayloadAction<{ pieceId: string; fabricId: string }>) {
      state.pieceFabrics[action.payload.pieceId] = action.payload.fabricId;
    },
    /** Set the default fabric for new pieces. */
    setDefaultFabric(state, action: PayloadAction<string>) {
      state.defaultFabricId = action.payload;
    },
    /** Set the global particle distance (mm). Clamped to 2–20mm. */
    setParticleDistance(state, action: PayloadAction<number>) {
      state.particleDistance = Math.max(2, Math.min(20, action.payload));
    },
    /** Set per-piece particle distance override (mm). */
    setPieceParticleDistance(state, action: PayloadAction<{ pieceId: string; distance: number }>) {
      state.pieceParticleDistance[action.payload.pieceId] = Math.max(2, Math.min(20, action.payload.distance));
    },
    /** Set the active fit map visualization mode. */
    setFitMapMode(state, action: PayloadAction<FitMapMode>) {
      state.fitMapMode = action.payload;
    },
    /** Update fit map configuration (partial merge). */
    updateFitMapConfig(state, action: PayloadAction<Partial<FitMapConfig>>) {
      Object.assign(state.fitMapConfig, action.payload);
    },
    /** Set quality preset level. */
    setQualityLevel(state, action: PayloadAction<QualityLevel>) {
      state.qualityLevel = action.payload;
    },
    /** Toggle auto-quality detection. */
    setAutoQuality(state, action: PayloadAction<boolean>) {
      state.autoQuality = action.payload;
    },
    /** Set which solver tier is active. */
    setSolverTier(state, action: PayloadAction<SolverTier>) {
      state.solverTier = action.payload;
    },
    /** Update frame time (rolling average). */
    setFrameTime(state, action: PayloadAction<number>) {
      state.frameTimeMs = action.payload;
    },
    /** Set particle count. */
    setParticleCount(state, action: PayloadAction<number>) {
      state.particleCount = action.payload;
    },
    /** Set body collision status. */
    setBodyCollision(state, action: PayloadAction<boolean>) {
      state.bodyCollision = action.payload;
    },
    /** Set 3D viewport mode (arrange/simulate). */
    setViewMode3D(state, action: PayloadAction<ViewMode3D>) {
      state.viewMode3D = action.payload;
    },
    /** Save current piece positions as arrangement snapshot. */
    saveArrangementSnapshot(state, action: PayloadAction<Record<string, [number, number, number]>>) {
      state.arrangementSnapshot = {
        positions: action.payload,
        timestamp: Date.now(),
      };
    },
    /** Clear arrangement snapshot. */
    clearArrangementSnapshot(state) {
      state.arrangementSnapshot = null;
    },

    // ─── Pin Management ─────────────────────────────────────────────────────

    /** Add a pin at a vertex position. */
    addPin(state, action: PayloadAction<{
      vertexIndex: number;
      position: [number, number, number];
      strength?: PinStrength;
    }>) {
      const id = `pin_${Date.now()}_${action.payload.vertexIndex}`;
      state.pinnedVertices[id] = {
        id,
        vertexIndex: action.payload.vertexIndex,
        targetPosition: action.payload.position,
        strength: action.payload.strength || 'strong',
      };
      state.selectedPinId = id;
    },

    /** Remove a specific pin by ID. */
    removePin(state, action: PayloadAction<string>) {
      delete state.pinnedVertices[action.payload];
      if (state.selectedPinId === action.payload) {
        state.selectedPinId = null;
      }
    },

    /** Update a pin's target position (for dragging). */
    updatePinPosition(state, action: PayloadAction<{
      pinId: string;
      position: [number, number, number];
    }>) {
      const pin = state.pinnedVertices[action.payload.pinId];
      if (pin) {
        pin.targetPosition = action.payload.position;
      }
    },

    /** Clear all pins (Ctrl+W). */
    clearAllPins(state) {
      state.pinnedVertices = {};
      state.selectedPinId = null;
    },

    /** Select a pin for editing. */
    selectPin(state, action: PayloadAction<string | null>) {
      state.selectedPinId = action.payload;
    },

    /** Update pin strength. */
    setPinStrength(state, action: PayloadAction<{
      pinId: string;
      strength: PinStrength;
    }>) {
      const pin = state.pinnedVertices[action.payload.pinId];
      if (pin) {
        pin.strength = action.payload.strength;
      }
    },

    // ─── 3D Display Toggles ──────────────────────────────────────────────────

    toggleGarment(state) {
      state.showGarment = !state.showGarment;
    },
    toggleSeamlines3D(state) {
      state.showSeamlines3D = !state.showSeamlines3D;
    },
    toggleInternalLines3D(state) {
      state.showInternalLines3D = !state.showInternalLines3D;
    },
    setSurfaceMode3D(state, action: PayloadAction<SurfaceMode3D>) {
      state.surfaceMode3D = action.payload;
    },

    // ─── Snapshot Metadata ──────────────────────────────────────────────────

    addSnapshot(state, action: PayloadAction<{
      id: string; name: string; particleCount: number; isAutoSave: boolean;
    }>) {
      const { id, name, particleCount, isAutoSave } = action.payload;
      state.snapshots.push({ id, name, timestamp: Date.now(), particleCount, isAutoSave });
      // Max 4 entries (1 auto + 3 manual)
      while (state.snapshots.length > 4) {
        state.snapshots.shift();
      }
    },
    removeSnapshot(state, action: PayloadAction<string>) {
      state.snapshots = state.snapshots.filter(s => s.id !== action.payload);
      if (state.activeSnapshotId === action.payload) {
        state.activeSnapshotId = null;
      }
    },
    setActiveSnapshot(state, action: PayloadAction<string | null>) {
      state.activeSnapshotId = action.payload;
    },
    clearSnapshots(state) {
      state.snapshots = [];
      state.activeSnapshotId = null;
    },
    setIsWarmStarting(state, action: PayloadAction<boolean>) {
      state.isWarmStarting = action.payload;
    },
    /** Set wind force direction vector. */
    setWindForce(state, action: PayloadAction<[number, number, number]>) {
      state.windForce = action.payload;
    },
    /** Enable or disable wind. */
    setWindEnabled(state, action: PayloadAction<boolean>) {
      state.windEnabled = action.payload;
    },
    /** Set drag coefficient. Clamped to [0, 5]. */
    setDragCoefficient(state, action: PayloadAction<number>) {
      state.dragCoefficient = Math.max(0, Math.min(5, action.payload));
    },
    /** Set the latest fit map statistics (null to clear). */
    setFitMapStats(state, action: PayloadAction<FitMapStats | null>) {
      state.fitMapStats = action.payload;
    },

    // ─── PBR Material Overrides ───────────────────────────────────────────────

    /** Set per-piece color tint (hex string). */
    setPieceTint(state, action: PayloadAction<{ pieceId: string; tint: string }>) {
      state.pieceTints[action.payload.pieceId] = action.payload.tint;
    },
    /** Set per-piece texture override for a specific slot. Pass null to clear. */
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
    /** Set per-piece UV transform (partial merge with defaults). */
    setPieceUVTransform(state, action: PayloadAction<{
      pieceId: string;
      repeatX?: number;
      repeatY?: number;
      rotation?: number;
    }>) {
      const { pieceId, ...transform } = action.payload;
      state.pieceUVTransforms[pieceId] = {
        ...(state.pieceUVTransforms[pieceId] ?? { repeatX: 4, repeatY: 4, rotation: 0 }),
        ...transform,
      };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFabric,
  setDefaultFabric,
  setParticleDistance,
  setPieceParticleDistance,
  setFitMapMode,
  updateFitMapConfig,
  setQualityLevel,
  setAutoQuality,
  setSolverTier,
  setFrameTime,
  setParticleCount,
  setBodyCollision,
  setViewMode3D,
  saveArrangementSnapshot,
  clearArrangementSnapshot,
  // Pin actions
  addPin,
  removePin,
  updatePinPosition,
  clearAllPins,
  selectPin,
  setPinStrength,
  // 3D display
  toggleGarment,
  toggleSeamlines3D,
  toggleInternalLines3D,
  setSurfaceMode3D,
  // Snapshots
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  clearSnapshots,
  setIsWarmStarting,
  // Wind
  setWindForce,
  setWindEnabled,
  setDragCoefficient,
  setFitMapStats,
  // PBR material overrides
  setPieceTint,
  setPieceTextureOverride,
  setPieceUVTransform,
} = simulationSlice.actions;

export default simulationSlice.reducer;
