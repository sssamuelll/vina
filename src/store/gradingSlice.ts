/**
 * Grading Slice — Size grading configuration and results (Issue #258)
 *
 * Manages state for the grading system:
 * - Size system selection (EU/US/UK/custom)
 * - Base size and active sizes
 * - Production quantities per size
 * - Generated piece tracking and staleness
 *
 * @module gradingSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';

// ============================================================================
// State
// ============================================================================

export interface GradingState {
  enabled: boolean;
  sizeSystem: 'eu-women' | 'eu-men' | 'us-women' | 'uk-women' | 'eu-children' | 'custom';
  baseSize: string;
  activeSizes: string[];
  quantities: Record<string, number>;
  generatedPieces: Record<string, string[]>;
  stale: boolean;
  lastGradedAt: number | null;
}

const initialState: GradingState = {
  enabled: false,
  sizeSystem: 'eu-women',
  baseSize: 'M',
  // Base size starts active so the panel doesn't open dead (Fase 3).
  activeSizes: ['M'],
  quantities: {},
  generatedPieces: {},
  stale: false,
  lastGradedAt: null,
};

// ============================================================================
// Slice
// ============================================================================

const gradingSlice = createSlice({
  name: 'grading',
  initialState,
  reducers: {
    /**
     * Toggle grading on/off.
     */
    setEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },

    /**
     * Select size standard. Resets activeSizes and generatedPieces.
     */
    setSizeSystem(state, action: PayloadAction<GradingState['sizeSystem']>) {
      state.sizeSystem = action.payload;
      state.activeSizes = [];
      state.generatedPieces = {};
    },

    /**
     * Set base size.
     */
    setBaseSize(state, action: PayloadAction<string>) {
      state.baseSize = action.payload;
    },

    /**
     * Set which sizes to generate.
     */
    setActiveSizes(state, action: PayloadAction<string[]>) {
      state.activeSizes = action.payload;
    },

    /**
     * Set production quantity for a size.
     */
    setQuantity(state, action: PayloadAction<{ size: string; quantity: number }>) {
      state.quantities[action.payload.size] = action.payload.quantity;
    },

    /**
     * Store generated pieceIds, set stale=false, record timestamp.
     */
    setGradingResult(state, action: PayloadAction<{ generatedPieces: Record<string, string[]> }>) {
      state.generatedPieces = action.payload.generatedPieces;
      state.stale = false;
      state.lastGradedAt = Date.now();
    },

    /**
     * Mark grading as stale (base pieces changed).
     */
    setStale(state, action: PayloadAction<boolean>) {
      state.stale = action.payload;
    },

    /**
     * Reset generatedPieces, stale, lastGradedAt but keep config.
     */
    clearGrading(state) {
      state.generatedPieces = {};
      state.stale = false;
      state.lastGradedAt = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setEnabled,
  setSizeSystem,
  setBaseSize,
  setActiveSizes,
  setQuantity,
  setGradingResult,
  setStale,
  clearGrading,
} = gradingSlice.actions;

export default gradingSlice.reducer;
