/**
 * Blueprint Library Redux Slice
 * 
 * Manages the blueprint library (builtin + user blueprints) and blueprint execution state.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { Blueprint, BlueprintLibraryState } from '../types/blueprint';

const initialState: BlueprintLibraryState = {
  blueprints: [],
  activeBlueprintId: null,
  activeStepIndex: 0,
  paused: false,
};

const blueprintSlice = createSlice({
  name: 'blueprints',
  initialState,
  reducers: {
    /** Load blueprints into the library (merge, don't replace) */
    loadBlueprints(state, action: PayloadAction<Blueprint[]>) {
      for (const blueprint of action.payload) {
        const idx = state.blueprints.findIndex(r => r.id === blueprint.id);
        if (idx >= 0) {
          state.blueprints[idx] = blueprint;
        } else {
          state.blueprints.push(blueprint);
        }
      }
    },

    /** Add or update a single blueprint */
    saveBlueprint(state, action: PayloadAction<Blueprint>) {
      const idx = state.blueprints.findIndex(r => r.id === action.payload.id);
      if (idx >= 0) {
        state.blueprints[idx] = action.payload;
      } else {
        state.blueprints.push(action.payload);
      }
    },

    /** Remove a blueprint */
    removeBlueprint(state, action: PayloadAction<string>) {
      state.blueprints = state.blueprints.filter(r => r.id !== action.payload);
      if (state.activeBlueprintId === action.payload) {
        state.activeBlueprintId = null;
        state.activeStepIndex = 0;
      }
    },

    /** Start executing a blueprint */
    startBlueprint(state, action: PayloadAction<string>) {
      state.activeBlueprintId = action.payload;
      state.activeStepIndex = 0;
      state.paused = false;
    },

    /** Advance to next step */
    nextStep(state) {
      const blueprint = state.blueprints.find(r => r.id === state.activeBlueprintId);
      if (blueprint && state.activeStepIndex < blueprint.steps.length - 1) {
        state.activeStepIndex++;
      }
    },

    /** Go back to previous step */
    prevStep(state) {
      if (state.activeStepIndex > 0) {
        state.activeStepIndex--;
      }
    },

    /** Jump to specific step */
    goToStep(state, action: PayloadAction<number>) {
      state.activeStepIndex = action.payload;
    },

    /** Pause/resume execution */
    togglePause(state) {
      state.paused = !state.paused;
    },

    /** Stop blueprint execution */
    stopBlueprint(state) {
      state.activeBlueprintId = null;
      state.activeStepIndex = 0;
      state.paused = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, (state) => {
      state.activeBlueprintId = null;
      state.activeStepIndex = 0;
      state.paused = false;
      // Keep blueprints — they're library, not project state
    });
  },
});

export const {
  loadBlueprints,
  saveBlueprint,
  removeBlueprint,
  startBlueprint,
  nextStep,
  prevStep,
  goToStep,
  togglePause,
  stopBlueprint,
} = blueprintSlice.actions;

export default blueprintSlice.reducer;
