/**
 * Blueprint Library Redux Slice
 * 
 * Manages the blueprint library (builtin + user blueprints) and execution state.
 * Blueprints contain Blocks; execution tracks both block and step index.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { Blueprint, BlueprintLibraryState } from '../types/blueprint';

const initialState: BlueprintLibraryState = {
  blueprints: [],
  activeBlueprintId: null,
  activeBlockIndex: 0,
  activeStepIndex: 0,
  paused: false,
};

const blueprintSlice = createSlice({
  name: 'blueprints',
  initialState,
  reducers: {
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

    saveBlueprint(state, action: PayloadAction<Blueprint>) {
      const idx = state.blueprints.findIndex(r => r.id === action.payload.id);
      if (idx >= 0) {
        state.blueprints[idx] = action.payload;
      } else {
        state.blueprints.push(action.payload);
      }
    },

    removeBlueprint(state, action: PayloadAction<string>) {
      state.blueprints = state.blueprints.filter(r => r.id !== action.payload);
      if (state.activeBlueprintId === action.payload) {
        state.activeBlueprintId = null;
        state.activeBlockIndex = 0;
        state.activeStepIndex = 0;
      }
    },

    startBlueprint(state, action: PayloadAction<string>) {
      state.activeBlueprintId = action.payload;
      state.activeBlockIndex = 0;
      state.activeStepIndex = 0;
      state.paused = false;
    },

    nextStep(state) {
      const blueprint = state.blueprints.find(r => r.id === state.activeBlueprintId);
      if (!blueprint) return;
      const block = blueprint.blocks[state.activeBlockIndex];
      if (!block) return;
      if (state.activeStepIndex < block.steps.length - 1) {
        state.activeStepIndex++;
      } else if (state.activeBlockIndex < blueprint.blocks.length - 1) {
        state.activeBlockIndex++;
        state.activeStepIndex = 0;
      }
    },

    prevStep(state) {
      if (state.activeStepIndex > 0) {
        state.activeStepIndex--;
      } else if (state.activeBlockIndex > 0) {
        state.activeBlockIndex--;
        const blueprint = state.blueprints.find(r => r.id === state.activeBlueprintId);
        const prevBlock = blueprint?.blocks[state.activeBlockIndex];
        state.activeStepIndex = prevBlock ? prevBlock.steps.length - 1 : 0;
      }
    },

    goToStep(state, action: PayloadAction<{ block: number; step: number }>) {
      state.activeBlockIndex = action.payload.block;
      state.activeStepIndex = action.payload.step;
    },

    togglePause(state) {
      state.paused = !state.paused;
    },

    stopBlueprint(state) {
      state.activeBlueprintId = null;
      state.activeBlockIndex = 0;
      state.activeStepIndex = 0;
      state.paused = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, (state) => {
      state.activeBlueprintId = null;
      state.activeBlockIndex = 0;
      state.activeStepIndex = 0;
      state.paused = false;
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
