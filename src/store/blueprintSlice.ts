/**
 * Blueprint Library Redux Slice
 *
 * User blueprint library (CRUD only). DORMANT in M2: blueprints can be saved and
 * listed, but there is no executor — the step-by-step execution model was removed
 * with the blueprint execution shell (#847). Retained as the persistence substrate
 * for blueprint authoring (#53, post-M2).
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Blueprint, BlueprintLibraryState } from '../types/blueprint';

const initialState: BlueprintLibraryState = {
  blueprints: [],
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
    },
  },
});

export const {
  loadBlueprints,
  saveBlueprint,
  removeBlueprint,
} = blueprintSlice.actions;

export default blueprintSlice.reducer;
