import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { PaperSize, LayoutResult } from '../utils/export/cuttingLayout';

export interface MarkerState {
  isOpen: boolean;
  paperSize: PaperSize;
  paperWidth: number;
  paperHeight: number;
  scale: number;
  margin: number;
  layout: LayoutResult | null;
  selectedPieceIndex: { page: number; piece: number } | null;
  includeSeamAllowance: boolean;
  showGrid: boolean;
  gridSpacing: number;
  fabricUtilization: number;
}

const initialState: MarkerState = {
  isOpen: false,
  paperSize: 'A0',
  paperWidth: 841,
  paperHeight: 1189,
  scale: 1,
  margin: 10,
  layout: null,
  selectedPieceIndex: null,
  includeSeamAllowance: true,
  showGrid: true,
  gridSpacing: 10,
  fabricUtilization: 0,
};

const markerSlice = createSlice({
  name: 'marker',
  initialState,
  reducers: {
    openMarker(state, action: PayloadAction<{
      layout: LayoutResult;
      paperSize: PaperSize;
      paperWidth: number;
      paperHeight: number;
      scale: number;
      margin: number;
      includeSeamAllowance: boolean;
    }>) {
      state.isOpen = true;
      state.layout = action.payload.layout;
      state.paperSize = action.payload.paperSize;
      state.paperWidth = action.payload.paperWidth;
      state.paperHeight = action.payload.paperHeight;
      state.scale = action.payload.scale;
      state.margin = action.payload.margin;
      state.includeSeamAllowance = action.payload.includeSeamAllowance;
      state.fabricUtilization = action.payload.layout.fabricUtilization;
      state.selectedPieceIndex = null;
    },
    closeMarker(state) {
      state.isOpen = false;
      state.layout = null;
      state.selectedPieceIndex = null;
    },
    setLayout(state, action: PayloadAction<LayoutResult>) {
      state.layout = action.payload;
      state.fabricUtilization = action.payload.fabricUtilization;
    },
    movePiece(state, action: PayloadAction<{
      pageIndex: number;
      pieceIndex: number;
      newPosition: [number, number];
    }>) {
      if (!state.layout) return;
      const { pageIndex, pieceIndex, newPosition } = action.payload;
      const page = state.layout.pages[pageIndex];
      if (!page) return;
      const piece = page.pieces[pieceIndex];
      if (!piece) return;

      // Compute delta from old position
      const dx = newPosition[0] - piece.position[0];
      const dy = newPosition[1] - piece.position[1];

      // Snap to grid
      let snapDx = dx;
      let snapDy = dy;
      if (state.showGrid && state.gridSpacing > 0) {
        const snappedX = Math.round(newPosition[0] / state.gridSpacing) * state.gridSpacing;
        const snappedY = Math.round(newPosition[1] / state.gridSpacing) * state.gridSpacing;
        snapDx = snappedX - piece.position[0];
        snapDy = snappedY - piece.position[1];
      }

      // Update position
      piece.position = [
        piece.position[0] + snapDx,
        piece.position[1] + snapDy,
      ];

      // Shift outline coordinates
      for (let i = 0; i < piece.outline.length; i += 2) {
        piece.outline[i] += snapDx;
        piece.outline[i + 1] += snapDy;
      }
      if (piece.seamAllowance) {
        for (let i = 0; i < piece.seamAllowance.length; i += 2) {
          piece.seamAllowance[i] += snapDx;
          piece.seamAllowance[i + 1] += snapDy;
        }
      }
    },
    rotatePiece(state, action: PayloadAction<{
      pageIndex: number;
      pieceIndex: number;
      degrees: number;
    }>) {
      if (!state.layout) return;
      const { pageIndex, pieceIndex, degrees } = action.payload;
      const page = state.layout.pages[pageIndex];
      if (!page) return;
      const piece = page.pieces[pieceIndex];
      if (!piece) return;

      const rad = (degrees * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      // Rotate around piece position (center of placement)
      const cx = piece.position[0];
      const cy = piece.position[1];

      function rotateCoords(coords: number[]) {
        for (let i = 0; i < coords.length; i += 2) {
          const rx = coords[i] - cx;
          const ry = coords[i + 1] - cy;
          coords[i] = cx + rx * cos - ry * sin;
          coords[i + 1] = cy + rx * sin + ry * cos;
        }
      }

      rotateCoords(piece.outline);
      if (piece.seamAllowance) rotateCoords(piece.seamAllowance);
      piece.rotation = (piece.rotation + degrees) % 360;
    },
    selectPiece(state, action: PayloadAction<{ page: number; piece: number } | null>) {
      state.selectedPieceIndex = action.payload;
    },
    deselectPiece(state) {
      state.selectedPieceIndex = null;
    },
    toggleGrid(state) {
      state.showGrid = !state.showGrid;
    },
    setGridSpacing(state, action: PayloadAction<number>) {
      state.gridSpacing = Math.max(1, action.payload);
    },
    setFabricUtilization(state, action: PayloadAction<number>) {
      state.fabricUtilization = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  openMarker,
  closeMarker,
  setLayout,
  movePiece,
  rotatePiece,
  selectPiece,
  deselectPiece,
  toggleGrid,
  setGridSpacing,
  setFabricUtilization,
} = markerSlice.actions;

export default markerSlice.reducer;
