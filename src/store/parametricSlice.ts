/**
 * Parametric Slice — Redux state for parametric editing of template patterns.
 *
 * Stores the active Seamly2D pattern, base measurements, and variable overrides.
 * Connected to ParametricView UI and copilot generateFromTemplate tool.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { SeamlyPattern } from '../utils/seamly2d/templateEngine';
import type { BodyMeasurements } from '../types/types';
import type { StandardSize, SizeSystem } from '../utils/seamly2d/sizeTables';

export interface ParametricState {
  /** Active template pattern (null = no pattern loaded) */
  activePattern: SeamlyPattern | null;
  /** Base measurements used for generation */
  baseMeasurements: BodyMeasurements | null;
  /** Current size label */
  currentSize: StandardSize | null;
  /** Size system */
  sizeSystem: SizeSystem;
  /** Variable value overrides (key → value). When a slider moves, this is updated. */
  variableOverrides: Record<string, number>;
  /** Default resolved variable values (before any overrides) */
  variableDefaults: Record<string, number>;
  /** Piece IDs generated from this template (for targeted updates) */
  generatedPieceIds: string[];
}

const initialState: ParametricState = {
  activePattern: null,
  baseMeasurements: null,
  currentSize: null,
  sizeSystem: 'eu-women',
  variableOverrides: {},
  variableDefaults: {},
  generatedPieceIds: [],
};

const parametricSlice = createSlice({
  name: 'parametric',
  initialState,
  reducers: {
    /**
     * Activate a template pattern for parametric editing.
     * Called after generateFromTemplate succeeds.
     */
    activateTemplate(
      state,
      action: PayloadAction<{
        pattern: SeamlyPattern;
        measurements: BodyMeasurements;
        size: StandardSize | null;
        sizeSystem: SizeSystem;
        resolvedVariables: Record<string, number>;
        pieceIds: string[];
      }>,
    ) {
      const { pattern, measurements, size, sizeSystem, resolvedVariables, pieceIds } = action.payload;
      state.activePattern = pattern;
      state.baseMeasurements = measurements;
      state.currentSize = size;
      state.sizeSystem = sizeSystem;
      state.variableDefaults = resolvedVariables;
      state.variableOverrides = {};
      state.generatedPieceIds = pieceIds;
    },

    /** Update a single variable override (slider moved). */
    setVariableOverride(
      state,
      action: PayloadAction<{ key: string; value: number }>,
    ) {
      state.variableOverrides[action.payload.key] = action.payload.value;
    },

    /** Batch update multiple variable overrides. */
    setVariableOverrides(
      state,
      action: PayloadAction<Record<string, number>>,
    ) {
      state.variableOverrides = { ...state.variableOverrides, ...action.payload };
    },

    /** Reset all overrides to defaults. */
    resetOverrides(state) {
      state.variableOverrides = {};
    },

    /** Reset a single variable to its default. */
    resetVariable(state, action: PayloadAction<string>) {
      delete state.variableOverrides[action.payload];
    },

    /** Clear the active template entirely. */
    clearTemplate() {
      return initialState;
    },

    /** Update generated piece IDs (after re-generation). */
    setGeneratedPieceIds(state, action: PayloadAction<string[]>) {
      state.generatedPieceIds = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  activateTemplate,
  setVariableOverride,
  setVariableOverrides,
  resetOverrides,
  resetVariable,
  clearTemplate,
  setGeneratedPieceIds,
} = parametricSlice.actions;

export default parametricSlice.reducer;
