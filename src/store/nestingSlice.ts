/**
 * Nesting Slice — Fabric nesting configuration and results (Issue #235)
 *
 * Manages state for the nesting preview panel:
 * - Roll configuration (width, gap, rotation, mirror)
 * - Nesting result with placements
 * - Computed metrics (usedLength, wastePercent)
 *
 * @module nestingSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { NestingResult } from '../utils/nesting/types';

// ============================================================================
// State
// ============================================================================

export interface NestingConfig {
  rollWidth: number;      // mm, default 1500
  gap: number;            // mm, default 10
  rotationStep: number;   // degrees, default 180
  allowMirror: boolean;
}

export interface NestingState {
  config: NestingConfig;
  result: NestingResult | null;
  usedLength: number | null;     // mm
  wastePercent: number | null;
  lastNestedAt: number | null;
}

const initialState: NestingState = {
  config: { rollWidth: 1500, gap: 10, rotationStep: 180, allowMirror: false },
  result: null,
  usedLength: null,
  wastePercent: null,
  lastNestedAt: null,
};

// ============================================================================
// Slice
// ============================================================================

const nestingSlice = createSlice({
  name: 'nesting',
  initialState,
  reducers: {
    /**
     * Merge partial config changes into the current nesting configuration.
     */
    setNestingConfig(state, action: PayloadAction<Partial<NestingConfig>>) {
      Object.assign(state.config, action.payload);
    },

    /**
     * Store the nesting result along with computed metrics.
     */
    setNestingResult(
      state,
      action: PayloadAction<{ result: NestingResult; usedLength: number; wastePercent: number }>
    ) {
      state.result = action.payload.result;
      state.usedLength = action.payload.usedLength;
      state.wastePercent = action.payload.wastePercent;
      state.lastNestedAt = Date.now();
    },

    /**
     * Clear the nesting result and metrics, keeping config intact.
     */
    clearNesting(state) {
      state.result = null;
      state.usedLength = null;
      state.wastePercent = null;
      state.lastNestedAt = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setNestingConfig,
  setNestingResult,
  clearNesting,
} = nestingSlice.actions;

export default nestingSlice.reducer;
