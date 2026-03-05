import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EditorState, ViewMode, Tool2D, Point2D, UnitSystem, PatternPiece } from '../types/types';
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
  showPieceNames: true,
  showLineLengths: false,
  showSewingLines: true,
  renderMode2D: 'textured' as const,
  snapToGrid: true,
  gridSize: 10,
  units: 'mm',
  clipboard: null,
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
    togglePieceNames(state) {
      state.showPieceNames = !state.showPieceNames;
    },
    toggleLineLengths(state) {
      state.showLineLengths = !state.showLineLengths;
    },
    toggleSewingLines(state) {
      state.showSewingLines = !state.showSewingLines;
    },
    setRenderMode2D(state, action: PayloadAction<'textured' | 'translucent' | 'wireframe'>) {
      state.renderMode2D = action.payload;
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
    copyPieces(state, action: PayloadAction<{ pieces: PatternPiece[] }>) {
      state.clipboard = {
        pieces: JSON.parse(JSON.stringify(action.payload.pieces)),
      };
    },
    clearClipboard(state) {
      state.clipboard = null;
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
  togglePieceNames, toggleLineLengths, toggleSewingLines, setRenderMode2D,
  setUnits,
  copyPieces, clearClipboard,
  undo, redo,
} = editorSlice.actions;

export default editorSlice.reducer;

// ─── Clipboard Utility ──────────────────────────────────────────────────────

/**
 * Generate paste payloads from clipboard pieces.
 * Returns new PatternPiece objects with fresh IDs and offset positions.
 * Caller dispatches addPiece() for each one.
 */
export function createPastedPieces(clipboard: { pieces: PatternPiece[] }, mirror = false): PatternPiece[] {
  return clipboard.pieces.map(p => {
    const clone: PatternPiece = JSON.parse(JSON.stringify(p));
    clone.id = `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    clone.name = `${p.name} (${mirror ? 'mirror' : 'copy'})`;
    clone.position = {
      x: (p.position?.x ?? 0) + 30,
      y: (p.position?.y ?? 0) + 30,
    };
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    clone.linkedPieceId = undefined;
    clone.linkMode = undefined;
    return clone;
  });
}

// ─── Fit View Utility ────────────────────────────────────────────────────────

/**
 * Compute zoom and pan to fit all pieces in the viewport with padding.
 * Returns null if no pieces or all pieces have no outline data.
 */
export function computeFitView(
  pieces: { position: Point2D; outline: { values: number[] }[] }[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 1.2,
): { zoom: number; pan: Point2D } | null {
  if (pieces.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  for (const piece of pieces) {
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        const px = cmd.values[i] + piece.position.x;
        const py = cmd.values[i + 1] + piece.position.y;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        hasPoints = true;
      }
    }
  }

  if (!hasPoints) return null;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW <= 0 && contentH <= 0) return null;

  const zoom = Math.min(
    viewportWidth / (contentW * padding),
    viewportHeight / (contentH * padding),
    5,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    zoom: Math.max(0.1, zoom),
    pan: {
      x: viewportWidth / 2 - centerX * zoom,
      y: viewportHeight / 2 - centerY * zoom,
    },
  };
}
