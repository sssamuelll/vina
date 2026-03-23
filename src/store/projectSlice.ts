/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PatternPiece, Seam, SeamGroup, Fabric, Avatar, OpenCloProject, InternalLine, PathCommand, PieceGroup, PointOfMeasure } from '../types/types';
import { NEW_PROJECT } from './actions';
import { validateAndRepairProject } from '../utils/projectValidator';
import type { ValidationDiagnostic, Quarantine } from '../utils/projectValidator';

const CATEGORY_DEFAULT_LAYER: Record<string, number> = {
  lining: 0, facing: 0,
  bodice: 1, skirt: 1, trouser: 1, waistband: 1, sleeve: 1,
  collar: 2, cuff: 2, pocket: 2, yoke: 2, hood: 2,
  other: 1,
};

function autoDetectLayer(category?: string): number {
  return CATEGORY_DEFAULT_LAYER[category ?? 'other'] ?? 1;
}

/** Lateral offset in metres when superimposing a piece in 'side' mode. */
const SUPERIMPOSE_SIDE_OFFSET_M = 0.1;

const defaultAvatar: Avatar = {
  id: 'default',
  name: 'Default Avatar',
  modelUrl: '',
  measurements: {
    height: 180,
    chest: 96,
    waist: 82,
    hips: 96,
    shoulder: 44,
    armLength: 64,
    inseam: 82,
  },
};

const defaultFabric: Fabric = {
  id: 'default-cotton',
  name: 'Cotton',
  color: '#e8e4df',
  weight: 150,
  stretch: 0.05,
  stiffness: 0.4,
  friction: 0.5,
};

export type AvatarMode = 'dressform' | 'model';

interface ProjectState {
  id: string;
  name: string;
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  avatar: Avatar;
  avatarMode: AvatarMode;
  avatarModelUrl: string | null;
  isDirty: boolean;
  /** Named piece groups for batch operations */
  groups: PieceGroup[];
  /** M:N seam groups connecting multiple edges */
  seamGroups: SeamGroup[];
  /** Per-piece 3D arrangement position overrides (piece ID → [x,y,z]) */
  arrangementOverrides: Record<string, [number, number, number]>;
  /** Points of measure */
  poms: PointOfMeasure[];
  /** Custom layer names (layer number → display name) */
  layerNames: Record<number, string>;
  /** Layer lock state (layer number → locked) */
  layerLocked: Record<number, boolean>;
  /** Diagnostics produced during the last loadProject call */
  loadDiagnostics: ValidationDiagnostic[];
  /** Entities quarantined (removed) during the last loadProject call */
  loadQuarantine: Quarantine;
}

const initialState: ProjectState = {
  id: 'new-project',
  name: 'Untitled Project',
  pieces: [],
  seams: [],
  fabrics: [defaultFabric],
  avatar: defaultAvatar,
  avatarMode: 'model',
  avatarModelUrl: '/default-avatar.glb',
  isDirty: false,
  groups: [],
  seamGroups: [],
  arrangementOverrides: {},
  poms: [],
  layerNames: {},
  layerLocked: {},
  loadDiagnostics: [] as ValidationDiagnostic[],
  loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] } as Quarantine,
};

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    restoreState(_state, action: PayloadAction<any>) {
      return action.payload;
    },
    loadProject(state, action: PayloadAction<OpenCloProject>) {
      const { project: validated, diagnostics, quarantine } = validateAndRepairProject(action.payload);
      state.loadDiagnostics = diagnostics;
      state.loadQuarantine = quarantine;

      const p = validated;
      state.id = p.id;
      state.name = p.name;
      state.pieces = p.pieces;
      state.seams = p.seams;
      state.fabrics = p.fabrics;
      state.avatar = p.avatar;
      state.groups = p.groups ?? [];
      state.poms = p.poms ?? [];
      state.seamGroups = (p as any).seamGroups ?? [];
      state.isDirty = false;
      // Backfill layer/sublayer for pieces loaded from older project files
      for (const piece of state.pieces) {
        if ((piece as any).layer === undefined) {
          piece.layer = autoDetectLayer(piece.category);
        }
        if ((piece as any).sublayer === undefined) {
          piece.sublayer = 0;
        }
        if ((piece as any).active === undefined) {
          piece.active = true;
        }
        if ((piece as any).interfacingType === undefined) piece.interfacingType = 'none';
        if ((piece as any).solidifyFactor === undefined) piece.solidifyFactor = 0;
      }
      // Backfill sewing enhancement fields for seams from older projects
      for (const seam of state.seams) {
        if ((seam as any).tension === undefined) seam.tension = 100;
        if ((seam as any).strength === undefined) seam.strength = 1.0;
        if ((seam as any).active === undefined) seam.active = true;
        if ((seam as any).taped === undefined) seam.taped = false;
        if ((seam as any).tapeWidth === undefined) seam.tapeWidth = 10;
      }
      // Backfill layer metadata from older projects
      state.layerNames = (p as any).layerNames ?? {};
      state.layerLocked = (p as any).layerLocked ?? {};
    },
    clearLoadDiagnostics(state) {
      state.loadDiagnostics = [];
      state.loadQuarantine = { pieces: [], seams: [], poms: [], seamGroups: [] };
    },
    setProjectName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      state.isDirty = true;
    },

    // ─── Pieces ───
    addPiece(state, action: PayloadAction<PatternPiece>) {
      const piece = { ...action.payload };
      if (piece.layer === undefined || piece.layer === null) {
        piece.layer = autoDetectLayer(piece.category);
      }
      if (piece.sublayer === undefined || piece.sublayer === null) {
        piece.sublayer = 0;
      }
      state.pieces.push(piece);
      state.isDirty = true;
    },
    updatePiece(state, action: PayloadAction<PatternPiece>) {
      const idx = state.pieces.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        state.pieces[idx] = action.payload;
        state.isDirty = true;
      }
    },
    removePiece(state, action: PayloadAction<string>) {
      state.pieces = state.pieces.filter(p => p.id !== action.payload);
      state.seams = state.seams.filter(
        s => s.pieceA.pieceId !== action.payload && s.pieceB.pieceId !== action.payload
      );
      delete state.arrangementOverrides[action.payload];
      // Auto-remove from all groups
      for (const group of state.groups) {
        group.pieceIds = group.pieceIds.filter(id => id !== action.payload);
      }
      // Remove POMs referencing deleted piece
      state.poms = state.poms.filter(
        pom => pom.pointA.pieceId !== action.payload && pom.pointB.pieceId !== action.payload
      );
      state.isDirty = true;
    },
    /** Set a 3D arrangement position override for a piece. */
    setArrangement3D(state, action: PayloadAction<{ pieceId: string; position: [number, number, number] }>) {
      state.arrangementOverrides[action.payload.pieceId] = action.payload.position;
      state.isDirty = true;
    },
    /** Clear all 3D arrangement overrides. */
    clearArrangementOverrides(state) {
      state.arrangementOverrides = {};
      state.isDirty = true;
    },
    movePiece(state, action: PayloadAction<{ id: string; x: number; y: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.id);
      if (piece) {
        piece.position = { x: action.payload.x, y: action.payload.y };
        state.isDirty = true;
      }
    },
    addInternalLine(state, action: PayloadAction<{ pieceId: string; line: InternalLine }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.internals.push(action.payload.line);
        state.isDirty = true;
      }
    },
    updateInternalLine(state, action: PayloadAction<{ pieceId: string; lineId: string; path: PathCommand[] }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        const line = piece.internals.find(l => l.id === action.payload.lineId);
        if (line) {
          line.path = action.payload.path;
          piece.updatedAt = Date.now();
          state.isDirty = true;
        }
      }
    },
    removeInternalLine(state, action: PayloadAction<{ pieceId: string; lineId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.internals = piece.internals.filter(l => l.id !== action.payload.lineId);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    /** Replace all internals of a given type (e.g. grainline — only one per piece) */
    setInternalLine(state, action: PayloadAction<{ pieceId: string; line: InternalLine }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.internals = piece.internals.filter(l => l.type !== action.payload.line.type);
        piece.internals.push(action.payload.line);
        state.isDirty = true;
      }
    },
    rotatePiece(state, action: PayloadAction<{ id: string; rotation: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.id);
      if (piece) {
        piece.rotation = action.payload.rotation;
        state.isDirty = true;
      }
    },
    /** Duplicate a piece with a new ID and offset position. */
    duplicatePiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const clone = JSON.parse(JSON.stringify(piece));
        clone.id = `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        clone.name = `${piece.name} (copy)`;
        clone.position = { x: (piece.position?.x ?? 0) + 30, y: (piece.position?.y ?? 0) + 30 };
        state.pieces.push(clone);
        state.isDirty = true;
      }
    },
    /** Mirror/flip a piece horizontally (negate X coordinates). */
    flipPieceH(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece && piece.outline) {
        // Find center X
        let minX = Infinity, maxX = -Infinity;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          for (let i = 0; i < v.length; i += 2) {
            if (v[i] < minX) minX = v[i];
            if (v[i] > maxX) maxX = v[i];
          }
        }
        const cx = (minX + maxX) / 2;
        // Flip X around center
        for (const cmd of piece.outline) {
          const v = cmd.values;
          if (cmd.type === 'M' || cmd.type === 'L') {
            v[0] = 2 * cx - v[0];
          } else if (cmd.type === 'H') {
            v[0] = 2 * cx - v[0];
          } else if (cmd.type === 'C') {
            v[0] = 2 * cx - v[0];
            v[2] = 2 * cx - v[2];
            v[4] = 2 * cx - v[4];
          } else if (cmd.type === 'Q') {
            v[0] = 2 * cx - v[0];
            v[2] = 2 * cx - v[2];
          }
        }
        state.isDirty = true;
      }
    },
    /** Mirror/flip a piece vertically (negate Y coordinates). */
    flipPieceV(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece && piece.outline) {
        let minY = Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          for (let i = 1; i < v.length; i += 2) {
            if (v[i] < minY) minY = v[i];
            if (v[i] > maxY) maxY = v[i];
          }
        }
        const cy = (minY + maxY) / 2;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          if (cmd.type === 'M' || cmd.type === 'L') {
            v[1] = 2 * cy - v[1];
          } else if (cmd.type === 'V') {
            v[0] = 2 * cy - v[0];
          } else if (cmd.type === 'C') {
            v[1] = 2 * cy - v[1];
            v[3] = 2 * cy - v[3];
            v[5] = 2 * cy - v[5];
          } else if (cmd.type === 'Q') {
            v[1] = 2 * cy - v[1];
            v[3] = 2 * cy - v[3];
          }
        }
        state.isDirty = true;
      }
    },

    // ─── Reactive Solver (upsert for parametric updates) ───
    /**
     * Update only the outline and position of an existing piece.
     * Preserves all other properties (seams, internals, selection, etc.)
     * Used by the reactive solver middleware for parametric updates.
     */
    upsertPieceOutline(state, action: PayloadAction<{
      pieceId: string;
      outline: PathCommand[];
      position: { x: number; y: number };
    }>) {
      const { pieceId, outline, position } = action.payload;
      const piece = state.pieces.find(p => p.id === pieceId);

      if (piece) {
        // Update only geometry, preserve everything else
        piece.outline = outline;
        piece.position = position;
        piece.updatedAt = Date.now();
        state.isDirty = true;
      } else {
        // Should not happen if identity map is correct
        console.warn('[upsertPieceOutline] Piece not found:', pieceId);
      }
    },

    /**
     * Batch update multiple piece outlines (more efficient for many pieces).
     */
    upsertMultiplePieceOutlines(state, action: PayloadAction<Array<{
      pieceId: string;
      outline: PathCommand[];
      position: { x: number; y: number };
    }>>) {
      const now = Date.now();
      for (const { pieceId, outline, position } of action.payload) {
        const piece = state.pieces.find(p => p.id === pieceId);
        if (piece) {
          piece.outline = outline;
          piece.position = position;
          piece.updatedAt = now;
        }
      }
      if (action.payload.length > 0) {
        state.isDirty = true;
      }
    },

    // ─── Seams ───
    addSeam(state, action: PayloadAction<Seam>) {
      const s = action.payload;
      const seam: Seam = {
        ...s,
        tension: s.tension ?? 100,
        strength: s.strength ?? 1.0,
        active: s.active ?? true,
        taped: s.taped ?? false,
        tapeWidth: s.tapeWidth ?? 10,
      };
      state.seams.push(seam);
      state.isDirty = true;
    },
    removeSeam(state, action: PayloadAction<string>) {
      state.seams = state.seams.filter(s => s.id !== action.payload);
      state.isDirty = true;
    },
    updateSeam(state, action: PayloadAction<Seam>) {
      const idx = state.seams.findIndex(s => s.id === action.payload.id);
      if (idx !== -1) { state.seams[idx] = action.payload; state.isDirty = true; }
    },
    setSeamTension(state, action: PayloadAction<{ seamId: string; tension: number; strength?: number }>) {
      const seam = state.seams.find(s => s.id === action.payload.seamId);
      if (seam) {
        seam.tension = Math.max(10, Math.min(200, action.payload.tension));
        if (action.payload.strength !== undefined) {
          seam.strength = Math.max(0.01, Math.min(1.0, action.payload.strength));
        }
        state.isDirty = true;
      }
    },
    deactivateSeam(state, action: PayloadAction<{ seamId: string; active: boolean }>) {
      const seam = state.seams.find(s => s.id === action.payload.seamId);
      if (seam) { seam.active = action.payload.active; state.isDirty = true; }
    },
    deactivatePiece(state, action: PayloadAction<{ pieceId: string; active: boolean }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) { piece.active = action.payload.active; state.isDirty = true; }
    },
    /** Reverse sewing direction — swap pieceA and pieceB */
    reverseSeam(state, action: PayloadAction<string>) {
      const seam = state.seams.find(s => s.id === action.payload);
      if (seam) {
        const temp = seam.pieceA;
        seam.pieceA = seam.pieceB;
        seam.pieceB = temp;
        state.isDirty = true;
      }
    },

    // ─── Points of Measure (POM) ───
    addPOM(state, action: PayloadAction<PointOfMeasure>) {
      state.poms.push(action.payload);
      state.isDirty = true;
    },
    updatePOM(state, action: PayloadAction<PointOfMeasure>) {
      const idx = state.poms.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        state.poms[idx] = action.payload;
        state.isDirty = true;
      }
    },
    removePOM(state, action: PayloadAction<string>) {
      state.poms = state.poms.filter(p => p.id !== action.payload);
      state.isDirty = true;
    },
    recomputePOMValues(state, action: PayloadAction<Array<{ id: string; value: number }>>) {
      for (const { id, value } of action.payload) {
        const pom = state.poms.find(p => p.id === id);
        if (pom) pom.value = value;
      }
    },

    // ─── Seam Groups (M:N sewing) ───
    addSeamGroup(state, action: PayloadAction<SeamGroup>) {
      state.seamGroups.push(action.payload);
      state.isDirty = true;
    },
    removeSeamGroup(state, action: PayloadAction<string>) {
      state.seamGroups = state.seamGroups.filter(g => g.id !== action.payload);
      state.isDirty = true;
    },

    // ─── Linked Editing ───
    linkPieces(state, action: PayloadAction<{ pieceIdA: string; pieceIdB: string; mode: 'symmetry' | 'instance' }>) {
      const { pieceIdA, pieceIdB, mode } = action.payload;
      const a = state.pieces.find(p => p.id === pieceIdA);
      const b = state.pieces.find(p => p.id === pieceIdB);
      if (a && b) {
        a.linkedPieceId = pieceIdB;
        a.linkMode = mode;
        b.linkedPieceId = pieceIdA;
        b.linkMode = mode;
        state.isDirty = true;
      }
    },
    unlinkPieces(state, action: PayloadAction<{ pieceId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece?.linkedPieceId) {
        const partner = state.pieces.find(p => p.id === piece.linkedPieceId);
        if (partner) {
          partner.linkedPieceId = undefined;
          partner.linkMode = undefined;
        }
        piece.linkedPieceId = undefined;
        piece.linkMode = undefined;
        state.isDirty = true;
      }
    },
    cloneAsLinked(state, action: PayloadAction<{ pieceId: string; mode: 'symmetry' | 'instance' }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        const clone: PatternPiece = JSON.parse(JSON.stringify(piece));
        clone.id = `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        clone.name = `${piece.name} (linked)`;
        clone.position = { x: (piece.position?.x ?? 0) + 50, y: piece.position?.y ?? 0 };
        clone.linkedPieceId = piece.id;
        clone.linkMode = action.payload.mode;
        piece.linkedPieceId = clone.id;
        piece.linkMode = action.payload.mode;
        state.pieces.push(clone);
        state.isDirty = true;
      }
    },

    // ─── Layers ───
    setLayer(state, action: PayloadAction<{ pieceId: string; layer: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.layer = Math.max(0, action.payload.layer);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    setSublayer(state, action: PayloadAction<{ pieceId: string; sublayer: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.sublayer = Math.max(0, action.payload.sublayer);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },

    cloneToLayer(state, action: PayloadAction<{ pieceId: string; direction: 'over' | 'under' }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const clone: PatternPiece = {
        ...JSON.parse(JSON.stringify(piece)),
        id: `${piece.id}-clone-${Date.now()}`,
        name: `${piece.name} (clone)`,
        layer: action.payload.direction === 'over'
          ? (piece.layer ?? 1) + 1
          : Math.max(0, (piece.layer ?? 1) - 1),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.pieces.push(clone);
      const arrangement = state.arrangementOverrides[piece.id];
      if (arrangement) {
        state.arrangementOverrides[clone.id] = [...arrangement] as [number, number, number];
      }
      state.isDirty = true;
    },

    superimposePiece(state, action: PayloadAction<{
      pieceId: string;
      targetPieceId: string;
      mode: 'over' | 'under' | 'side';
    }>) {
      const { pieceId, targetPieceId, mode } = action.payload;
      const piece = state.pieces.find(p => p.id === pieceId);
      const target = state.pieces.find(p => p.id === targetPieceId);
      if (!piece || !target) return;
      const targetPos = state.arrangementOverrides[targetPieceId];
      if (targetPos) {
        if (mode === 'side') {
          state.arrangementOverrides[pieceId] = [targetPos[0] + SUPERIMPOSE_SIDE_OFFSET_M, targetPos[1], targetPos[2]];
        } else {
          state.arrangementOverrides[pieceId] = [...targetPos] as [number, number, number];
        }
      }
      if (mode === 'over') {
        piece.layer = (target.layer ?? 1) + 1;
      } else if (mode === 'under') {
        piece.layer = Math.max(0, (target.layer ?? 1) - 1);
      }
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },

    // ─── Layer Metadata ───
    /** Set a custom display name for a layer. */
    renameLayer(state, action: PayloadAction<{ layer: number; name: string }>) {
      state.layerNames[action.payload.layer] = action.payload.name;
      state.isDirty = true;
    },
    /** Remove a custom display name for a layer. */
    deleteLayerName(state, action: PayloadAction<{ layer: number }>) {
      delete state.layerNames[action.payload.layer];
      state.isDirty = true;
    },
    /** Lock or unlock a layer to prevent edits. */
    setLayerLocked(state, action: PayloadAction<{ layer: number; locked: boolean }>) {
      state.layerLocked[action.payload.layer] = action.payload.locked;
      state.isDirty = true;
    },
    /** Register or update a layer (sets the custom name if provided). */
    addLayer(state, action: PayloadAction<{ layer: number; name?: string }>) {
      if (action.payload.name) {
        state.layerNames[action.payload.layer] = action.payload.name;
      }
      state.isDirty = true;
    },
    /** Remove a layer and move its pieces to layer 1. */
    removeLayer(state, action: PayloadAction<{ layer: number }>) {
      const { layer } = action.payload;
      if (layer === 1) return; // cannot remove base layer
      for (const piece of state.pieces) {
        if ((piece.layer ?? 1) === layer) {
          piece.layer = 1;
          piece.updatedAt = Date.now();
        }
      }
      delete state.layerNames[layer];
      delete state.layerLocked[layer];
      state.isDirty = true;
    },

    // ─── Z-Order ───
    bringToFront(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const maxZ = Math.max(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = maxZ + 1;
        state.isDirty = true;
      }
    },
    sendToBack(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const minZ = Math.min(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = minZ - 1;
        state.isDirty = true;
      }
    },
    bringForward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) + 1;
        state.isDirty = true;
      }
    },
    sendBackward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) - 1;
        state.isDirty = true;
      }
    },

    // ─── Lock ───
    lockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = true;
        state.isDirty = true;
      }
    },
    unlockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = false;
        state.isDirty = true;
      }
    },

    // ─── Groups ───
    createGroup(state, action: PayloadAction<{ name: string; pieceIds: string[]; color?: string }>) {
      const { name, pieceIds, color } = action.payload;
      const GROUP_COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#845ef7'];
      state.groups.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        pieceIds: pieceIds.filter(id => state.pieces.some(p => p.id === id)),
        color: color ?? GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      state.isDirty = true;
    },
    renameGroup(state, action: PayloadAction<{ groupId: string; name: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        group.name = action.payload.name;
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    deleteGroup(state, action: PayloadAction<{ groupId: string }>) {
      state.groups = state.groups.filter(g => g.id !== action.payload.groupId);
      state.isDirty = true;
    },
    setGroupColor(state, action: PayloadAction<{ groupId: string; color: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        group.color = action.payload.color;
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    addPiecesToGroup(state, action: PayloadAction<{ groupId: string; pieceIds: string[] }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const existing = new Set(group.pieceIds);
        for (const id of action.payload.pieceIds) {
          if (!existing.has(id) && state.pieces.some(p => p.id === id)) {
            group.pieceIds.push(id);
          }
        }
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    removePiecesFromGroup(state, action: PayloadAction<{ groupId: string; pieceIds: string[] }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const removeSet = new Set(action.payload.pieceIds);
        group.pieceIds = group.pieceIds.filter(id => !removeSet.has(id));
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    moveGroup(state, action: PayloadAction<{ groupId: string; dx: number; dy: number }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.position = {
              x: (piece.position?.x ?? 0) + action.payload.dx,
              y: (piece.position?.y ?? 0) + action.payload.dy,
            };
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    setGroupFabric(state, action: PayloadAction<{ groupId: string; fabricId: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.fabricId = action.payload.fabricId;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    setGroupSeamAllowance(state, action: PayloadAction<{ groupId: string; width: number }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.seamAllowance = action.payload.width;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    mirrorGroup(state, action: PayloadAction<{ groupId: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.mirrored = !piece.mirrored;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },

    // ─── Fabrics ───
    addFabric(state, action: PayloadAction<Fabric>) {
      state.fabrics.push(action.payload);
    },
    updateFabric(state, action: PayloadAction<Fabric>) {
      const idx = state.fabrics.findIndex(f => f.id === action.payload.id);
      if (idx !== -1) state.fabrics[idx] = action.payload;
    },

    // ─── Avatar ───
    updateAvatar(state, action: PayloadAction<Partial<Avatar>>) {
      state.avatar = { ...state.avatar, ...action.payload };
    },
    updateMeasurements(state, action: PayloadAction<Partial<Avatar['measurements']>>) {
      state.avatar.measurements = { ...state.avatar.measurements, ...action.payload };
    },
    setAvatarMode(state, action: PayloadAction<AvatarMode>) {
      state.avatarMode = action.payload;
    },
    setAvatarModelUrl(state, action: PayloadAction<string | null>) {
      state.avatarModelUrl = action.payload;
      if (action.payload) state.avatarMode = 'model';
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => ({
      ...initialState,
      id: 'new-project-' + Date.now(),
    }));
  },
});

export const {
  restoreState, loadProject, clearLoadDiagnostics, setProjectName,
  addPiece, updatePiece, removePiece, movePiece, rotatePiece, duplicatePiece, flipPieceH, flipPieceV, setArrangement3D, clearArrangementOverrides,
  addInternalLine, updateInternalLine, removeInternalLine, setInternalLine,
  // Reactive solver (parametric updates)
  upsertPieceOutline, upsertMultiplePieceOutlines,
  addSeam, removeSeam, updateSeam, setSeamTension, deactivateSeam, deactivatePiece, reverseSeam,
  addSeamGroup, removeSeamGroup,
  // POMs
  addPOM, updatePOM, removePOM, recomputePOMValues,
  linkPieces, unlinkPieces, cloneAsLinked,
  // Layers
  setLayer, setSublayer, cloneToLayer, superimposePiece,
  renameLayer, deleteLayerName, setLayerLocked, addLayer, removeLayer,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece,
  // Groups
  createGroup, renameGroup, deleteGroup, setGroupColor,
  addPiecesToGroup, removePiecesFromGroup,
  moveGroup, setGroupFabric, setGroupSeamAllowance, mirrorGroup,
  addFabric, updateFabric,
  updateAvatar, updateMeasurements, setAvatarMode, setAvatarModelUrl,
} = projectSlice.actions;

const DEFAULT_LAYER_NAMES: Record<number, string> = { 0: 'Lining', 1: 'Shell', 2: 'Trims' };

export function getLayerDisplayName(state: { project: { layerNames: Record<number, string> } }, layer: number): string {
  return state.project.layerNames[layer] ?? DEFAULT_LAYER_NAMES[layer] ?? `Layer ${layer}`;
}

export default projectSlice.reducer;
