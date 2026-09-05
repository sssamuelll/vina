import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EditorState, ViewMode, Tool2D, Point2D, UnitSystem, PatternPiece } from '../types/types';
import { NEW_PROJECT } from './actions';
import { removeReferenceImage } from './projectSlice';
import { newId } from '../utils/ids';
import { DEFAULT_SEAM_ALLOWANCE } from '../utils/defaults';
import { ZOOM_MAX, ZOOM_MIN } from '../input/zoom2d';

const initialState: EditorState = {
  viewMode: 'split',
  activeTool: 'select',
  selectedPieceIds: [],
  selectedSeamId: null,
  selectedPOMId: null,
  selectedInternalLine: null,
  saSelection: null,
  notchMirrorInvert: true,
  zoom2D: 1,
  pan2D: { x: 0, y: 0 },
  fitViewToken: 0,
  showSeamAllowance: true,
  defaultSeamAllowanceWidth: DEFAULT_SEAM_ALLOWANCE,
  showGrainlines: true,
  showNotches: true,
  showAnchorPoints: false,
  showPieceNames: false,
  showLineLengths: false,
  showSewingLines: true,
  renderMode2D: 'textured' as const,
  snapToGrid: true,
  gridSize: 10,
  units: 'mm',
  clipboard: null,
  superimposePickMode: null,
  showReferenceImages: true,
  selectedReferenceImageId: null,
  calibrationMode: null,
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
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    togglePieceSelection(state, action: PayloadAction<string>) {
      state.selectedPOMId = null;
      state.saSelection = null;
      const idx = state.selectedPieceIds.indexOf(action.payload);
      if (idx === -1) {
        state.selectedPieceIds.push(action.payload);
      } else {
        state.selectedPieceIds.splice(idx, 1);
      }
      // Una línea seleccionada es una sub-selección DENTRO de una pieza, así que
      // solo sobrevive mientras esa pieza SEA la selección, a secas. Este era el
      // único camino de cambio de pieza que no la soltaba (samuel #215), y no es
      // cosmético: Delete/Backspace cuelgan de `selectedInternalLine` y borran su
      // `{pieceId, lineId}` tal cual, así que una selección colgada de la pieza
      // anterior borra geometría que no se está mirando.
      if (
        state.selectedInternalLine
        && !(state.selectedPieceIds.length === 1
          && state.selectedPieceIds[0] === state.selectedInternalLine.pieceId)
      ) {
        state.selectedInternalLine = null;
      }
    },
    clearSelection(state) {
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    selectAllPieces(state, action: PayloadAction<string[]>) {
      state.selectedPieceIds = action.payload;
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    selectAllVisiblePieces(state, action: PayloadAction<{ pieces: PatternPiece[]; layerLocked: Record<number, boolean> }>) {
      const { pieces, layerLocked } = action.payload;
      state.selectedPieceIds = pieces
        .filter(p => p.active !== false && p.locked !== true && !layerLocked[p.layer ?? 1])
        .map(p => p.id);
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    selectSeam(state, action: PayloadAction<string>) {
      state.selectedSeamId = action.payload;
      state.selectedPOMId = null;
      state.selectedPieceIds = [];
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    selectPOM(state, action: PayloadAction<string | null>) {
      state.selectedPOMId = action.payload;
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
    selectInternalLine(state, action: PayloadAction<{ pieceId: string; lineId: string }>) {
      state.selectedInternalLine = action.payload;
      state.selectedPieceIds = [action.payload.pieceId];
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.saSelection = null;
    },
    // Seam-allowance tool selection — a typed, mutually-exclusive SET (N edges OR
    // N vertices, never mixed). The discriminated shape makes the illegal mixed
    // state unrepresentable. Cross-kind exclusivity (vs piece/seam/POM/internal
    // line) stays manual — that is the deferred debt this feature does not touch.
    // `additive` (Shift) toggles items into the existing edge set; a plain click
    // or a kind switch replaces it. Multi-vertex is out of scope: vertices stay
    // single (spec 2026-06-09 — "solo edges primero").
    selectSaEdges(state, action: PayloadAction<{ items: { pieceId: string; edgeId: string }[]; additive?: boolean }>) {
      const { items, additive } = action.payload;
      if (additive && state.saSelection?.kind === 'edge') {
        const cur = state.saSelection.items;
        for (const it of items) {
          const i = cur.findIndex(e => e.pieceId === it.pieceId && e.edgeId === it.edgeId);
          if (i === -1) cur.push(it); else cur.splice(i, 1);
        }
        state.saSelection = cur.length > 0 ? { kind: 'edge', items: cur } : null;
      } else {
        state.saSelection = items.length > 0 ? { kind: 'edge', items } : null;
      }
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
    },
    selectSaVertices(state, action: PayloadAction<{ pieceId: string; vertexIndex: number }>) {
      // Single vertex (multi-vertex deferred): replace the set.
      state.saSelection = { kind: 'vertex', items: [action.payload] };
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
    },
    clearSaSelection(state) {
      state.saSelection = null;
    },
    // Notch-mirror sense toggle (F3): which way the corresponding notch maps
    // across the seam. Shared so the panel control and the canvas ghost agree.
    setNotchMirrorInvert(state, action: PayloadAction<boolean>) {
      state.notchMirrorInvert = action.payload;
    },
    setZoom2D(state, action: PayloadAction<number>) {
      state.zoom2D = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, action.payload));
    },
    setPan2D(state, action: PayloadAction<Point2D>) {
      state.pan2D = action.payload;
    },
    /** Request a fit-to-content of the 2D viewport. Dispatched after a pattern
     *  is imported; the PatternEditor performs the actual fit (it owns the
     *  viewport size). Monotonic so each request is observed exactly once. */
    requestFitView(state) {
      state.fitViewToken += 1;
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
    toggleNotches(state) {
      state.showNotches = !state.showNotches;
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
    toggleReferenceImages(state) {
      state.showReferenceImages = !state.showReferenceImages;
    },
    setShowReferenceImages(state, action: PayloadAction<boolean>) {
      state.showReferenceImages = action.payload;
    },
    setSelectedReferenceImage(state, action: PayloadAction<string | null>) {
      state.selectedReferenceImageId = action.payload;
    },
    startCalibration(state, action: PayloadAction<{ imageId: string }>) {
      state.calibrationMode = { imageId: action.payload.imageId, point1: null };
    },
    setCalibrationPoint1(state, action: PayloadAction<Point2D>) {
      if (state.calibrationMode) {
        state.calibrationMode.point1 = action.payload;
      }
    },
    cancelCalibration(state) {
      state.calibrationMode = null;
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
    enterSuperimposePickMode(state, action: PayloadAction<{ sourcePieceId: string; mode: 'over' | 'under' | 'side' }>) {
      state.superimposePickMode = {
        active: true,
        sourcePieceId: action.payload.sourcePieceId,
        mode: action.payload.mode,
      };
    },
    exitSuperimposePickMode(state) {
      state.superimposePickMode = null;
    },
    // These are intercepted by undoMiddleware — they never actually modify editor state
    undo() {},
    redo() {},
  },
  extraReducers: (builder) => {
    // Reset the editor on a new project, but keep fitViewToken monotonic so a
    // DXF imported right after File ▸ New still triggers a fresh fit-to-content.
    builder.addCase(NEW_PROJECT, (state) => ({ ...initialState, fitViewToken: state.fitViewToken }));
    builder.addCase(removeReferenceImage, (state, action) => {
      if (state.selectedReferenceImageId === action.payload) {
        state.selectedReferenceImageId = null;
      }
    });
    // Clear selection ONLY when pieces/seams are actually removed (Fix #3)
    builder.addMatcher(
      (action) => action.type === 'project/removePiece' || action.type === 'project/removePieces' || action.type === 'project/removeSeam',
      (state) => {
        state.selectedPieceIds = [];
        state.selectedSeamId = null;
        state.selectedPOMId = null;
        state.selectedInternalLine = null;
        state.saSelection = null;
      }
    );
  },
});

export const {
  setViewMode, setActiveTool,
  selectPiece, togglePieceSelection, clearSelection, selectAllPieces, selectAllVisiblePieces, selectSeam, selectPOM, selectInternalLine, selectSaEdges, selectSaVertices, clearSaSelection,
  setZoom2D, setPan2D, requestFitView,
  toggleSeamAllowance, setDefaultSAWidth, setNotchMirrorInvert, toggleGrainlines, toggleNotches, toggleSnapToGrid, setGridSize, toggleAnchorPoints,
  togglePieceNames, toggleLineLengths, toggleSewingLines, setRenderMode2D,
  toggleReferenceImages, setShowReferenceImages, setSelectedReferenceImage,
  startCalibration, setCalibrationPoint1, cancelCalibration,
  setUnits,
  copyPieces, clearClipboard,
  enterSuperimposePickMode, exitSuperimposePickMode,
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
    clone.id = newId();
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
  pieces: { position: Point2D; rotation?: number; outline: { values: number[] }[] }[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 1.2,
): { zoom: number; pan: Point2D } | null {
  if (pieces.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  for (const piece of pieces) {
    const rot = ((piece.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Piece-local outline bbox center = the renderer's rotation pivot.
    let lminX = Infinity, lminY = Infinity, lmaxX = -Infinity, lmaxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        lminX = Math.min(lminX, cmd.values[i]);
        lmaxX = Math.max(lmaxX, cmd.values[i]);
        lminY = Math.min(lminY, cmd.values[i + 1]);
        lmaxY = Math.max(lmaxY, cmd.values[i + 1]);
      }
    }
    const cx = (lminX + lmaxX) / 2;
    const cy = (lminY + lmaxY) / 2;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        const lx = cmd.values[i] - cx;
        const ly = cmd.values[i + 1] - cy;
        const px = lx * cos - ly * sin + cx + piece.position.x;
        const py = lx * sin + ly * cos + cy + piece.position.y;
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
