import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PatternPiece, Seam, Fabric, Avatar, OpenCloProject, InternalLine } from '../types/types';

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
};

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    restoreState(_state, action: PayloadAction<any>) {
      return action.payload;
    },
    loadProject(state, action: PayloadAction<OpenCloProject>) {
      const p = action.payload;
      state.id = p.id;
      state.name = p.name;
      state.pieces = p.pieces;
      state.seams = p.seams;
      state.fabrics = p.fabrics;
      state.avatar = p.avatar;
      state.isDirty = false;
    },
    setProjectName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      state.isDirty = true;
    },

    // ─── Pieces ───
    addPiece(state, action: PayloadAction<PatternPiece>) {
      state.pieces.push(action.payload);
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

    // ─── Seams ───
    addSeam(state, action: PayloadAction<Seam>) {
      state.seams.push(action.payload);
      state.isDirty = true;
    },
    removeSeam(state, action: PayloadAction<string>) {
      state.seams = state.seams.filter(s => s.id !== action.payload);
      state.isDirty = true;
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
});

export const {
  restoreState, loadProject, setProjectName,
  addPiece, updatePiece, removePiece, movePiece, rotatePiece, addInternalLine, setInternalLine,
  addSeam, removeSeam,
  addFabric, updateFabric,
  updateAvatar, updateMeasurements, setAvatarMode, setAvatarModelUrl,
} = projectSlice.actions;

export default projectSlice.reducer;
