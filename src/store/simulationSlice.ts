/**
 * Redux slice for cloth simulation state.
 *
 * Manages simulation lifecycle (idle/running/paused), per-piece fabric assignments,
 * layer visibility, and X-ray transparency mode.
 *
 * @module simulationSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { FitMapMode, FitMapConfig, FitMapStats } from '../utils/cloth/fitMaps';
import type { SimulationMode } from '../utils/cloth/gpu/qualityPresets';
import { DEFAULT_UV_TRANSFORM } from '../utils/defaults';

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
export type SurfaceMode3D =
  | 'textured' | 'translucent' | 'mesh' | 'thick'
  | 'flat' | 'xray' | 'shaded'
  | 'shaded-wire' | 'textured-wire';

/** Default UV transform for per-piece tiling. Re-exported from utils/defaults. */
export { DEFAULT_UV_TRANSFORM } from '../utils/defaults';

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

/**
 * Per-init summary of how the project's active seams resolved to XPBD
 * constraints (CLO3D parity plan Fase 4 — seam observability).
 *
 * Computed on the main thread by `summarizeSeamResolution` (seamPairs.ts)
 * with the same `parameterizeEdge` + `matchVertices` resolution the solver
 * workers run, so the numbers shown are the numbers the solver gets.
 * `null` = no simulation init yet, or project has no active seams.
 */
export interface SeamResolutionSummary {
  /** Total XPBD constraint pairs across all active seams. */
  totalConstraints: number;
  /** Active seams that resolved to ZERO constraints — they will NOT sew. */
  zeroConstraintSeams: Array<{ seamId: string; reason: string }>;
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
  /** Render/Export 3D panel visible (puerta: File menu + palette, Fase 2) */
  renderSettingsOpen: boolean;
  /** Fit map visualization configuration */
  fitMapConfig: FitMapConfig;
  /** Simulation mode: normal (fast) or complete (full quality) */
  simulationMode: SimulationMode;
  /** Currently active solver tier */
  solverTier: SolverTier;
  /** Frame time in ms (rolling average) */
  frameTimeMs: number;
  /** Particle count in active simulation */
  particleCount: number;
  /** Seam → constraint resolution summary for the running init (null = none) */
  seamResolution: SeamResolutionSummary | null;
  /** Whether body collision is active */
  bodyCollision: boolean;
  /**
   * Min cloth↔body signed distance in mm from the penetration metric (plan
   * drape-profesional §A1). Negative = penetration. null = never computed.
   * Kept after stop for post-stop inspection (same convention as
   * `lastSolverError`).
   */
  collisionDistance: number | null;
  /** 3D viewport mode */
  viewMode3D: ViewMode3D;
  /** Pre-simulation arrangement snapshot for reset */
  arrangementSnapshot: ArrangementSnapshot | null;
  /** Pinned vertices for cloth simulation */
  pinnedVertices: Record<string, PinData>;
  /** Currently selected pin ID (for editing/dragging) */
  selectedPinId: string | null;
  /** 3D mesh selection — selected vertex indices */
  selectedVertices: number[];
  /** Active box-select drag (screen coords) */
  selectBox3D: { startX: number; startY: number; currentX: number; currentY: number } | null;
  /** Active lasso-select polygon (screen coords) */
  selectLasso3D: { x: number; y: number }[] | null;
  /** 3D visibility: show garment pieces */
  showGarment: boolean;
  /** 3D visibility: show seam connection lines */
  showSeamlines3D: boolean;
  /** Seam lines DURANTE la sim (SimSeamLines) — default OFF por acta del
   *  consejo costura-real 2026-07-05: la anotación contradiciendo al shading
   *  era el "más anormal" del founder; queda como modo inspección. El toggle
   *  de arrange (showSeamlines3D) no cambia. */
  showSimSeamLines: boolean;
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
  /** Per-piece internal pressure in Pascals (puffer jacket inflation) */
  piecePressures: Record<string, number>;
  /** IDs of pieces whose particles are frozen (zero velocity, skip solver) */
  frozenPieceIds: string[];
  /** Piece IDs hidden in 3D viewport (excluded from simulation and rendering) */
  hiddenPieceIds: string[];
  /** Piece IDs with flipped normals in 3D */
  flippedPieceIds: string[];
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
  pieceUVTransforms: Record<string, { repeatX: number; repeatY: number; rotation: number; offsetX: number; offsetY: number }>;
  /** Per-piece opacity overrides (0-1, undefined = use fabric default) */
  pieceOpacity: Record<string, number>;
  /** Per-piece emission color (hex, undefined = no emission) */
  pieceEmission: Record<string, string>;
  /** Per-piece emission intensity (0-5, default 0) */
  pieceEmissionIntensity: Record<string, number>;
  /** Steam brush tool state (damps particle velocity on brush stroke) */
  steamBrush: {
    active: boolean;
    radius: number;
    strength: number;
  };
  /** Mesh grab tool state (grab and pull fabric during simulation) */
  meshGrab: {
    active: boolean;
    radius: number;
    strength: number;
  };
  /** Layer IDs that are hidden in the 3D viewport */
  hiddenLayerIds: number[];
  /** Custom outline/accent colors per layer (layer number → hex) */
  layerOutlineColors: Record<number, string>;
  /** Whether X-ray transparency mode is active (allows seeing through layers) */
  xrayMode: boolean;
  /** Active layer in X-ray mode (kept opaque); null = all transparent */
  xrayActiveLayer: number | null;
  /** Snapshot of pieceOpacity before X-ray mode was enabled (for restore) */
  xrayOpacitySnapshot: Record<string, number> | null;
  /** Left and right arm axis directions (unit vectors), null until avatar model poses them */
  armAxis: { left: [number, number, number] | null; right: [number, number, number] | null; ready: boolean };
}

const initialState: SimulationSliceState = {
  simulationState: 'idle',
  pieceFabrics: {},
  defaultFabricId: 'cotton-poplin',
  particleDistance: 5,
  pieceParticleDistance: {},
  fitMapMode: 'none' as FitMapMode,
  renderSettingsOpen: false,
  fitMapConfig: {
    stressRange: [0, 100],
    strainRange: [1.0, 1.2],
    fitThresholds: [0.8, 1.0],
    pressureDistance: 0.002,
  },
  simulationMode: 'normal' as SimulationMode,
  solverTier: 'none' as SolverTier,
  frameTimeMs: 0,
  particleCount: 0,
  seamResolution: null,
  bodyCollision: false,
  collisionDistance: null,
  viewMode3D: 'arrange' as ViewMode3D,
  arrangementSnapshot: null,
  pinnedVertices: {},
  selectedPinId: null,
  selectedVertices: [],
  selectBox3D: null,
  selectLasso3D: null,
  showGarment: true,
  showSeamlines3D: true,
  showSimSeamLines: false,
  showInternalLines3D: true,
  surfaceMode3D: 'textured' as SurfaceMode3D,
  snapshots: [],
  activeSnapshotId: null,
  isWarmStarting: false,
  windForce: [0, 0, 0],
  windEnabled: false,
  dragCoefficient: 1.0,
  piecePressures: {},
  frozenPieceIds: [],
  hiddenPieceIds: [],
  flippedPieceIds: [],
  fitMapStats: null,
  pieceTints: {},
  pieceTextureOverrides: {},
  pieceUVTransforms: {},
  pieceOpacity: {},
  pieceEmission: {},
  pieceEmissionIntensity: {},
  steamBrush: {
    active: false,
    radius: 0.05,
    strength: 0.3,
  },
  meshGrab: {
    active: false,
    radius: 0.08,
    strength: 0.6,
  },
  hiddenLayerIds: [],
  layerOutlineColors: {},
  xrayMode: false,
  xrayActiveLayer: null,
  xrayOpacitySnapshot: null,
  armAxis: { left: null, right: null, ready: false },
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
    /**
     * Set the fabric for a specific pattern piece in the SIMULATION runtime cache.
     *
     * **Transient by design.** Writes ONLY to `sim.pieceFabrics`. Used for:
     * - `MaterialTab.tsx` — preview material panel, sibling de tint/opacity/UV/textures.
     * - `SimulationView.tsx` — sim sidebar tweaks, sibling de Per-Piece Freeze.
     * - `useColorwaySync.ts` — sync `project.fabricId` + colorway override → sim cache.
     *
     * **Do NOT use for persistent piece fabric assignment.** Use
     * `project/setPieceFabric` for persistent writes (e.g., copilot tools,
     * programmatic apply). Persistent writes propagate to sim via `useColorwaySync`.
     *
     * Cross-ref: `docs/reports/2026-04-30-drift-fase2-b10state-par1-fabric-write-surfaces.md`.
     */
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
    /** Show/hide the Render & Export 3D panel. */
    setRenderSettingsOpen(state, action: PayloadAction<boolean>) {
      state.renderSettingsOpen = action.payload;
    },
    /** Update fit map configuration (partial merge). */
    updateFitMapConfig(state, action: PayloadAction<Partial<FitMapConfig>>) {
      Object.assign(state.fitMapConfig, action.payload);
    },
    /** Set simulation mode (normal or complete). */
    setSimulationMode(state, action: PayloadAction<SimulationMode>) {
      state.simulationMode = action.payload;
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
    /**
     * Record the seam → constraint resolution summary for the current init.
     * Pass `null` to clear (sim teardown / project without seams).
     * Surfaced in `SeccionDel3D`; zero-constraint seams also get
     * a toast + `inspector.seamResolutionErrors` entry (E-async conventions).
     */
    setSeamResolution(state, action: PayloadAction<SeamResolutionSummary | null>) {
      state.seamResolution = action.payload;
    },
    /** Set body collision status. */
    setBodyCollision(state, action: PayloadAction<boolean>) {
      state.bodyCollision = action.payload;
    },
    /**
     * Record the min cloth↔body signed distance (mm) from the penetration
     * metric (§A1). Feeds the inspector rules `fit:body-penetration` /
     * `fit:pressure-point` via dataCollector.
     */
    setCollisionDistance(state, action: PayloadAction<number | null>) {
      state.collisionDistance = action.payload;
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
      // state-encoded ID — see B10-state. The vertex index is intentionally
      // baked into the pin ID for cross-reference; do NOT migrate to newId().
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

    // ─── 3D Mesh Selection ──────────────────────────────────────────────────

    setSelectedVertices(state, action: PayloadAction<number[]>) {
      state.selectedVertices = action.payload;
    },
    addSelectedVertices(state, action: PayloadAction<number[]>) {
      const set = new Set(state.selectedVertices);
      for (const v of action.payload) set.add(v);
      state.selectedVertices = Array.from(set);
    },
    clearSelectedVertices(state) {
      state.selectedVertices = [];
    },
    setSelectBox3D(state, action: PayloadAction<{ startX: number; startY: number; currentX: number; currentY: number } | null>) {
      state.selectBox3D = action.payload;
    },
    setSelectLasso3D(state, action: PayloadAction<{ x: number; y: number }[] | null>) {
      state.selectLasso3D = action.payload;
    },

    // ─── 3D Display Toggles ──────────────────────────────────────────────────

    toggleGarment(state) {
      state.showGarment = !state.showGarment;
    },
    toggleSeamlines3D(state) {
      state.showSeamlines3D = !state.showSeamlines3D;
    },
    toggleSimSeamLines(state) {
      state.showSimSeamLines = !state.showSimSeamLines;
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
    /** Set internal pressure for a piece (Pa). 0 = no pressure. */
    setPiecePressure(state, action: PayloadAction<{ pieceId: string; pressurePa: number }>) {
      const { pieceId, pressurePa } = action.payload;
      if (pressurePa <= 0) {
        delete state.piecePressures[pieceId];
      } else {
        state.piecePressures[pieceId] = Math.min(pressurePa, 1000); // cap at 1000 Pa
      }
    },

    /** Toggle freeze state for a single piece (add if absent, remove if present). */
    toggleFreezePiece(state, action: PayloadAction<string>) {
      const idx = state.frozenPieceIds.indexOf(action.payload);
      if (idx >= 0) {
        state.frozenPieceIds.splice(idx, 1);
      } else {
        state.frozenPieceIds.push(action.payload);
      }
    },
    /** Clear all frozen pieces. */
    unfreezeAllPieces(state) {
      state.frozenPieceIds = [];
    },

    // ─── 3D Arrangement: Hide / Flip ────────────────────────────────────────────

    /** Toggle hide state for a single piece in 3D (add if absent, remove if present). */
    toggleHide3D(state, action: PayloadAction<string>) {
      const idx = state.hiddenPieceIds.indexOf(action.payload);
      if (idx >= 0) {
        state.hiddenPieceIds.splice(idx, 1);
      } else {
        state.hiddenPieceIds.push(action.payload);
      }
    },
    /** Show all pieces (clear hidden list). */
    showAll3D(state) {
      state.hiddenPieceIds = [];
    },
    /** Hide specific pieces by ID list. */
    hideAll3D(state, action: PayloadAction<string[]>) {
      state.hiddenPieceIds = action.payload;
    },
    /** Toggle flipped normal for a single piece in 3D. */
    toggleFlipNormal(state, action: PayloadAction<string>) {
      const idx = state.flippedPieceIds.indexOf(action.payload);
      if (idx >= 0) {
        state.flippedPieceIds.splice(idx, 1);
      } else {
        state.flippedPieceIds.push(action.payload);
      }
    },
    /** Clear all flipped normals. */
    clearFlippedNormals(state) {
      state.flippedPieceIds = [];
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
    /** Set per-piece UV transform (partial merge with defaults, clamped). */
    setPieceUVTransform(state, action: PayloadAction<{
      pieceId: string;
      repeatX?: number;
      repeatY?: number;
      rotation?: number;
      offsetX?: number;
      offsetY?: number;
    }>) {
      const { pieceId, ...transform } = action.payload;
      const merged = {
        ...(state.pieceUVTransforms[pieceId] ?? DEFAULT_UV_TRANSFORM),
        ...transform,
      };
      // Clamp to valid ranges
      merged.repeatX = Math.max(0.1, Math.min(20, merged.repeatX));
      merged.repeatY = Math.max(0.1, Math.min(20, merged.repeatY));
      merged.rotation = ((merged.rotation % 360) + 360) % 360;
      merged.offsetX = Math.max(0, Math.min(1, merged.offsetX));
      merged.offsetY = Math.max(0, Math.min(1, merged.offsetY));
      state.pieceUVTransforms[pieceId] = merged;
    },

    // ─── Opacity & Emission ──────────────────────────────────────────────────

    /** Set per-piece opacity (0-1). Removes override when fully opaque. */
    setPieceOpacity(state, action: PayloadAction<{ pieceId: string; opacity: number }>) {
      const { pieceId, opacity } = action.payload;
      if (!Number.isFinite(opacity)) return;
      if (opacity >= 1.0) {
        delete state.pieceOpacity[pieceId];
      } else {
        state.pieceOpacity[pieceId] = Math.max(0, Math.min(1, opacity));
      }
    },
    /** Set opacity for multiple pieces in a single dispatch. */
    setBatchPieceOpacity(state, action: PayloadAction<Record<string, number>>) {
      for (const [pieceId, opacity] of Object.entries(action.payload)) {
        if (!Number.isFinite(opacity)) continue;
        if (opacity >= 1.0) { delete state.pieceOpacity[pieceId]; }
        else { state.pieceOpacity[pieceId] = Math.max(0, Math.min(1, opacity)); }
      }
    },
    /** Clear per-piece opacity override. */
    clearPieceOpacity(state, action: PayloadAction<string>) {
      delete state.pieceOpacity[action.payload];
    },
    /** Set per-piece emission color and optional intensity. */
    setPieceEmission(state, action: PayloadAction<{ pieceId: string; color: string; intensity?: number }>) {
      const { pieceId, color, intensity } = action.payload;
      state.pieceEmission[pieceId] = color;
      if (intensity !== undefined && Number.isFinite(intensity)) {
        state.pieceEmissionIntensity[pieceId] = Math.max(0, Math.min(5, intensity));
      }
    },
    /** Clear per-piece emission color and intensity. */
    clearPieceEmission(state, action: PayloadAction<string>) {
      delete state.pieceEmission[action.payload];
      delete state.pieceEmissionIntensity[action.payload];
    },

    // ─── Steam Brush ──────────────────────────────────────────────────────────

    /** Activate or deactivate the steam brush tool. */
    setSteamBrushActive(state, action: PayloadAction<boolean>) {
      state.steamBrush.active = action.payload;
    },
    /** Set steam brush radius (meters). Clamped to [0.01, 0.5]. */
    setSteamBrushRadius(state, action: PayloadAction<number>) {
      state.steamBrush.radius = Math.max(0.01, Math.min(0.5, action.payload));
    },
    /** Set steam brush strength (0–1). Clamped to [0, 1]. */
    setSteamBrushStrength(state, action: PayloadAction<number>) {
      state.steamBrush.strength = Math.max(0, Math.min(1, action.payload));
    },

    // ─── Mesh Grab ─────────────────────────────────────────────────────────

    /** Activate or deactivate the mesh grab tool. */
    setMeshGrabActive(state, action: PayloadAction<boolean>) {
      state.meshGrab.active = action.payload;
    },
    /** Set mesh grab radius (meters). Clamped to [0.01, 0.5]. */
    setMeshGrabRadius(state, action: PayloadAction<number>) {
      state.meshGrab.radius = Math.max(0.01, Math.min(0.5, action.payload));
    },
    /** Set mesh grab strength (0–1). Clamped to [0, 1]. */
    setMeshGrabStrength(state, action: PayloadAction<number>) {
      state.meshGrab.strength = Math.max(0, Math.min(1, action.payload));
    },

    // ─── Layer Visibility ────────────────────────────────────────────────────────

    toggleLayerVisibility(state, action: PayloadAction<number>) {
      const idx = state.hiddenLayerIds.indexOf(action.payload);
      if (idx >= 0) {
        state.hiddenLayerIds.splice(idx, 1);
      } else {
        state.hiddenLayerIds.push(action.payload);
      }
    },
    showAllLayers(state) {
      state.hiddenLayerIds = [];
    },
    setLayerOutlineColor(state, action: PayloadAction<{ layer: number; color: string }>) {
      state.layerOutlineColors[action.payload.layer] = action.payload.color;
    },
    setXrayMode(state, action: PayloadAction<{ enabled: boolean; activeLayer?: number }>) {
      if (action.payload.enabled) {
        if (!state.xrayMode) {
          state.xrayOpacitySnapshot = { ...state.pieceOpacity };
        }
        state.xrayMode = true;
        state.xrayActiveLayer = action.payload.activeLayer ?? null;
      } else {
        if (state.xrayOpacitySnapshot) {
          state.pieceOpacity = { ...state.xrayOpacitySnapshot };
        }
        state.xrayOpacitySnapshot = null;
        state.xrayMode = false;
        state.xrayActiveLayer = null;
      }
    },
    setXrayActiveLayer(state, action: PayloadAction<number>) {
      state.xrayActiveLayer = action.payload;
    },
    cleanupRemovedLayer(state, action: PayloadAction<number>) {
      state.hiddenLayerIds = state.hiddenLayerIds.filter(id => id !== action.payload);
      delete state.layerOutlineColors[action.payload];
      if (state.xrayActiveLayer === action.payload) {
        state.xrayActiveLayer = null;
      }
    },

    // ─── A-Pose: Arm Axis Directions ───────────────────────────────────────

    /** Store left and right arm axis directions from avatar model. */
    setArmAxis(state, action: PayloadAction<{ left: [number, number, number] | null; right: [number, number, number] | null; ready: boolean }>) {
      state.armAxis = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
    builder.addMatcher(
      (action) => action.type === 'project/removePiece',
      (state, action) => {
        const pieceId = (action as unknown as { payload: string }).payload;
        state.hiddenPieceIds = state.hiddenPieceIds.filter(id => id !== pieceId);
        state.flippedPieceIds = state.flippedPieceIds.filter(id => id !== pieceId);
        delete state.pieceOpacity[pieceId];
        delete state.pieceEmission[pieceId];
        delete state.pieceEmissionIntensity[pieceId];
        delete state.pieceTints[pieceId];
        delete state.pieceTextureOverrides[pieceId];
        delete state.pieceUVTransforms[pieceId];
      },
    );
  },
});

export const {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setSeamResolution,
  setFabric,
  setDefaultFabric,
  setParticleDistance,
  setPieceParticleDistance,
  setFitMapMode,
  setRenderSettingsOpen,
  updateFitMapConfig,
  setSimulationMode,
  setSolverTier,
  setFrameTime,
  setParticleCount,
  setBodyCollision,
  setCollisionDistance,
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
  // 3D mesh selection
  setSelectedVertices,
  addSelectedVertices,
  clearSelectedVertices,
  setSelectBox3D,
  setSelectLasso3D,
  // 3D display
  toggleGarment,
  toggleSeamlines3D,
  toggleSimSeamLines,
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
  setPiecePressure,
  toggleFreezePiece,
  unfreezeAllPieces,
  // 3D Arrangement: hide / flip
  toggleHide3D,
  showAll3D,
  hideAll3D,
  toggleFlipNormal,
  clearFlippedNormals,
  setFitMapStats,
  // PBR material overrides
  setPieceTint,
  setPieceTextureOverride,
  setPieceUVTransform,
  // Opacity & emission
  setPieceOpacity,
  setBatchPieceOpacity,
  clearPieceOpacity,
  setPieceEmission,
  clearPieceEmission,
  // Steam brush
  setSteamBrushActive,
  setSteamBrushRadius,
  setSteamBrushStrength,
  // Mesh grab
  setMeshGrabActive,
  setMeshGrabRadius,
  setMeshGrabStrength,
  // Layer visibility & X-ray
  toggleLayerVisibility,
  showAllLayers,
  setLayerOutlineColor,
  setXrayMode,
  setXrayActiveLayer,
  cleanupRemovedLayer,
  // A-Pose: arm axis
  setArmAxis,
} = simulationSlice.actions;

/** @deprecated Use setSimulationMode */
export const setQualityLevel = setSimulationMode;

export default simulationSlice.reducer;
