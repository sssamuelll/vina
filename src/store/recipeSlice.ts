/**
 * Recipe Library Redux Slice
 * 
 * Manages the recipe library (builtin + user recipes) and recipe execution state.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { Recipe, RecipeLibraryState } from '../types/recipe';

const initialState: RecipeLibraryState = {
  recipes: [],
  activeRecipeId: null,
  activeStepIndex: 0,
  paused: false,
};

const recipeSlice = createSlice({
  name: 'recipes',
  initialState,
  reducers: {
    /** Load recipes into the library (merge, don't replace) */
    loadRecipes(state, action: PayloadAction<Recipe[]>) {
      for (const recipe of action.payload) {
        const idx = state.recipes.findIndex(r => r.id === recipe.id);
        if (idx >= 0) {
          state.recipes[idx] = recipe;
        } else {
          state.recipes.push(recipe);
        }
      }
    },

    /** Add or update a single recipe */
    saveRecipe(state, action: PayloadAction<Recipe>) {
      const idx = state.recipes.findIndex(r => r.id === action.payload.id);
      if (idx >= 0) {
        state.recipes[idx] = action.payload;
      } else {
        state.recipes.push(action.payload);
      }
    },

    /** Remove a recipe */
    removeRecipe(state, action: PayloadAction<string>) {
      state.recipes = state.recipes.filter(r => r.id !== action.payload);
      if (state.activeRecipeId === action.payload) {
        state.activeRecipeId = null;
        state.activeStepIndex = 0;
      }
    },

    /** Start executing a recipe */
    startRecipe(state, action: PayloadAction<string>) {
      state.activeRecipeId = action.payload;
      state.activeStepIndex = 0;
      state.paused = false;
    },

    /** Advance to next step */
    nextStep(state) {
      const recipe = state.recipes.find(r => r.id === state.activeRecipeId);
      if (recipe && state.activeStepIndex < recipe.steps.length - 1) {
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

    /** Stop recipe execution */
    stopRecipe(state) {
      state.activeRecipeId = null;
      state.activeStepIndex = 0;
      state.paused = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, (state) => {
      state.activeRecipeId = null;
      state.activeStepIndex = 0;
      state.paused = false;
      // Keep recipes — they're library, not project state
    });
  },
});

export const {
  loadRecipes,
  saveRecipe,
  removeRecipe,
  startRecipe,
  nextStep,
  prevStep,
  goToStep,
  togglePause,
  stopRecipe,
} = recipeSlice.actions;

export default recipeSlice.reducer;
