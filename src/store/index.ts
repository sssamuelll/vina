import { configureStore } from '@reduxjs/toolkit';
import projectReducer from './projectSlice';
import editorReducer from './editorSlice';
import simulationReducer from './simulationSlice';
import pluginReducer from './pluginSlice';
import layoutReducer from './layoutSlice';
import markerReducer from './markerSlice';
import avatarReducer from './avatarSlice';
import toolReducer from './toolSlice';
import parametricReducer from './parametricSlice';
import constructionReducer from './constructionSlice';
import recipeReducer, { loadRecipes } from './recipeSlice';
import { undoMiddleware } from './undoMiddleware';
import { BUILTIN_RECIPES } from '../utils/construction/recipes';

export const store = configureStore({
  reducer: {
    project: projectReducer,
    editor: editorReducer,
    simulation: simulationReducer,
    plugins: pluginReducer,
    layout: layoutReducer,
    marker: markerReducer,
    avatar: avatarReducer,
    tools: toolReducer,
    parametric: parametricReducer,
    construction: constructionReducer,
    recipes: recipeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['project.pieces', 'project.avatar'],
        ignoredActions: ['project/loadProject', 'project/restoreState'],
      },
    }).concat(undoMiddleware),
});

// Load builtin recipes synchronously — must be available before first copilot turn
store.dispatch(loadRecipes(BUILTIN_RECIPES));

// Expose store for debugging (remove in production)
(window as unknown as Record<string, unknown>).__OPENCLO_STORE__ = store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
