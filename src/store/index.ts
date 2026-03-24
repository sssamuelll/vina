import { configureStore } from '@reduxjs/toolkit';
import projectReducer from './projectSlice';
import editorReducer from './editorSlice';
import simulationReducer from './simulationSlice';
import pluginReducer from './pluginSlice';
import layoutReducer from './layoutSlice';
import markerReducer from './markerSlice';
import avatarReducer from './avatarSlice';
import avatarTapeReducer from './avatarTapeSlice';
import toolReducer from './toolSlice';
import parametricReducer from './parametricSlice';
import constructionReducer from './constructionSlice';
import blueprintReducer, { loadBlueprints } from './blueprintSlice';
import copilotUIReducer from './copilotUISlice';
import cameraReducer from './cameraSlice';
import collisionBodyReducer from './collisionBodySlice';
import renderSettingsReducer from './renderSettingsSlice';
import animationReducer from './animationSlice';
import workflowReducer, { loadWorkflow, rehydrateWorkflow } from './workflowSlice';
import inspectorReducer from './inspectorSlice';
import { createConfirmationMiddleware } from './confirmationMiddleware';
import { undoMiddleware } from './undoMiddleware';
import { linkedEditingMiddleware } from './linkedEditingMiddleware';
import { createReactiveSolverMiddleware } from './reactiveSolverMiddleware';
import { BUILTIN_BLUEPRINTS } from '../utils/construction/blueprints';

export const store = configureStore({
  reducer: {
    project: projectReducer,
    editor: editorReducer,
    simulation: simulationReducer,
    plugins: pluginReducer,
    layout: layoutReducer,
    marker: markerReducer,
    avatar: avatarReducer,
    avatarTape: avatarTapeReducer,
    tools: toolReducer,
    parametric: parametricReducer,
    construction: constructionReducer,
    blueprints: blueprintReducer,
    copilotUI: copilotUIReducer,
    camera: cameraReducer,
    collisionBody: collisionBodyReducer,
    renderSettings: renderSettingsReducer,
    animation: animationReducer,
    workflow: workflowReducer,
    inspector: inspectorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // All ignored paths below ARE JSON-serializable. They are excluded from
      // RTK's runtime serializableCheck for performance — the check recurses
      // every dispatched state diff and these paths contain large arrays
      // (hundreds of pattern pieces / collision bodies) that make the check
      // too slow in dev mode.  The undo system relies on JSON round-tripping
      // the project slice, which is safe because pieces and avatar are plain
      // JSON objects (see undoMiddleware.test.ts round-trip test).
      //
      // copilotUI.pendingConfirmation: holds transient confirmation payloads
      // whose `action`/`reduxAction` fields may contain non-serializable
      // values.  This slice is NOT part of the undo snapshot.
      serializableCheck: {
        ignoredPaths: ['project.pieces', 'project.avatar', 'collisionBody.bodies', 'copilotUI.pendingConfirmation'],
        ignoredActions: ['project/loadProject', 'project/restoreState', 'copilotUI/showConfirmation'],
      },
    }).concat(createConfirmationMiddleware(), undoMiddleware, linkedEditingMiddleware, createReactiveSolverMiddleware()),
});

// Load builtin recipes synchronously — must be available before first copilot turn
store.dispatch(loadBlueprints(BUILTIN_BLUEPRINTS));

const savedWorkflow = loadWorkflow();
if (savedWorkflow) {
  store.dispatch(rehydrateWorkflow(savedWorkflow));
}

// Expose store for debugging (remove in production)
(window as unknown as Record<string, unknown>).__OPENCLO_STORE__ = store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
