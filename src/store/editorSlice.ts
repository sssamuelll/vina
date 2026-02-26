import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EditorState, ViewMode, Tool2D, Point2D, UnitSystem } from '../types/types';
import { NEW_PROJECT } from './actions';

const initialState: EditorState = {
  viewMode: 'split',
  activeTool: 'select',
  selectedPieceIds: [],
  selectedSeamId: null,
  selectedInternalLine: null,
  zoom2D: 1,
  pan2D: { x: 0, y: 0 },
  showSeamAllowance: true,
  defaultSeamAllowanceWidth: 10,
  showGrainlines: true,
  showAnchorPoints: false,
  snapToGrid: true,
  gridSize: 10,
  units: 'mm',
};

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setViewMode(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
    },
    setActiveTool(state, action: PayloadAction<Tool2D>) {
      state.activeTool = action.payload;
    },
    selectPiece(state, action: PayloadAction<string>) {
      state.selectedPieceIds = [action.payload];
      state.selectedInternalLine = null;
    },
    togglePieceSelection(state, action: PayloadAction<string>) {
      const idx = state.selectedPieceIds.indexOf(action.payload);
      if (idx === -1) {
        state.selectedPieceIds.push(action.payload);
      } else {
        state.selectedPieceIds.splice(idx, 1);
      }
    },
    clearSelection(state) {
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedInternalLine = null;
    },
    selectAllPieces(state, action: PayloadAction<string[]>) {
      state.selectedPieceIds = action.payload;
      state.selectedSeamId = null;
      state.selectedInternalLine = null;
    },
    selectSeam(state, action: PayloadAction<string>) {
      state.selectedSeamId = action.payload;
      state.selectedPieceIds = [];
      state.selectedInternalLine = null;
    },
    selectInternalLine(state, action: PayloadAction<{ pieceId: string; lineId: string }>) {
      state.selectedInternalLine = action.payload;
      state.selectedPieceIds = [action.payload.pieceId];
      state.selectedSeamId = null;
    },
    setZoom2D(state, action: PayloadAction<number>) {
      state.zoom2D = Math.max(0.1, Math.min(10, action.payload));
    },
    setPan2D(state, action: PayloadAction<Point2D>) {
      state.pan2D = action.payload;
    },
    toggleSeamAllowance(state) {
      state.showSeamAllowance = !state.showSeamAllowance;
    },
    setDefaultSAWidth(state, action: PayloadAction<number>) {
      state.defaultSeamAllowanceWidth = Math.max(0, Math.min(50, action.payload));
    },
    toggleGrainlines(state) {
      state.showGrainlines = !state.showGrainlines;
    },
    toggleAnchorPoints(state) {
      state.showAnchorPoints = !state.showAnchorPoints;
    },
    toggleSnapToGrid(state) {
      state.snapToGrid = !state.snapToGrid;
    },
    setGridSize(state, action: PayloadAction<number>) {
      state.gridSize = action.payload;
    },
    setUnits(state, action: PayloadAction<UnitSystem>) {
      state.units = action.payload;
    },
    // These are intercepted by undoMiddleware — they never actually modify editor state
    undo() {},
    redo() {},
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setViewMode, setActiveTool,
  selectPiece, togglePieceSelection, clearSelection, selectAllPieces, selectSeam, selectInternalLine,
  setZoom2D, setPan2D,
  toggleSeamAllowance, setDefaultSAWidth, toggleGrainlines, toggleSnapToGrid, setGridSize, toggleAnchorPoints,
  setUnits,
  undo, redo,
} = editorSlice.actions;

export default editorSlice.reducer;
