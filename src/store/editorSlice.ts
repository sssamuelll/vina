import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EditorState, ViewMode, Tool2D, Point2D, UnitSystem } from '../types/types';

const initialState: EditorState = {
  viewMode: 'split',
  activeTool: 'select',
  selectedPieceIds: [],
  selectedSeamId: null,
  zoom2D: 1,
  pan2D: { x: 0, y: 0 },
  showSeamAllowance: true,
  showGrainlines: true,
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
    },
    selectSeam(state, action: PayloadAction<string>) {
      state.selectedSeamId = action.payload;
      state.selectedPieceIds = [];
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
    toggleGrainlines(state) {
      state.showGrainlines = !state.showGrainlines;
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
});

export const {
  setViewMode, setActiveTool,
  selectPiece, togglePieceSelection, clearSelection, selectSeam,
  setZoom2D, setPan2D,
  toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, setGridSize,
  setUnits,
  undo, redo,
} = editorSlice.actions;

export default editorSlice.reducer;
