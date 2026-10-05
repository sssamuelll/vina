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
import blueprintReducer from './blueprintSlice';
import copilotUIReducer from './copilotUISlice';
import iaReducer from './iaSlice';
import cameraReducer from './cameraSlice';
import collisionBodyReducer from './collisionBodySlice';
import renderSettingsReducer from './renderSettingsSlice';
import animationReducer from './animationSlice';
import workflowReducer, { loadWorkflow, rehydrateWorkflow } from './workflowSlice';
import dockReducer, { loadDocks, rehydrateDocks, persistDocks } from './dockSlice';
import inspectorReducer from './inspectorSlice';
import bomReducer from './bomSlice';
import nestingReducer from './nestingSlice';
import gradingReducer from './gradingSlice';
import inputSchemeReducer, { hydrateInputScheme, rehydrateInputScheme, persistInputScheme } from './inputSchemeSlice';
import { initProjectPersistence } from './projectAutosave';
import { seguirLaRevision } from './revisionDelProyecto';
import { initLineLengthPreference } from './lineLengthPreference';
import { confirmationMiddleware } from './confirmationMiddleware';
import { journalMiddleware } from './journalMiddleware';
import { undoMiddleware } from './undoMiddleware';
import { linkedEditingMiddleware } from './linkedEditingMiddleware';
import { reactiveSolverMiddleware } from './reactiveSolverMiddleware';
import { gradingStalenessMiddleware } from './gradingStalenessMiddleware';
import { resewBridgeMiddleware } from './resewBridgeMiddleware';
import { initHistoryTimelinePersistence } from './historyTimeline';

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
    ia: iaReducer,
    camera: cameraReducer,
    collisionBody: collisionBodyReducer,
    renderSettings: renderSettingsReducer,
    animation: animationReducer,
    workflow: workflowReducer,
    dock: dockReducer,
    inspector: inspectorReducer,
    bom: bomReducer,
    nesting: nestingReducer,
    grading: gradingReducer,
    inputScheme: inputSchemeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Ignored paths — excluded from RTK's runtime serializableCheck for
      // performance.  The check recurses every dispatched state diff; these
      // paths contain large arrays that make it too slow in dev mode.
      //
      // project.pieces, project.avatar, collisionBody.bodies:
      //   All plain JSON (strings, numbers, booleans, arrays, plain objects).
      //   The undo middleware JSON-round-trips the project slice, which is
      //   safe — verified by projectStateSerialization.test.ts.
      //
      // copilotUI.pendingConfirmation:
      //   Transient confirmation payloads whose `action`/`reduxAction` fields
      //   may contain non-serializable values (functions, promises).
      //   NOT part of the undo snapshot — excluded for correctness.
      serializableCheck: {
        ignoredPaths: ['project.pieces', 'project.avatar', 'collisionBody.bodies', 'copilotUI.pendingConfirmation'],
        ignoredActions: ['project/loadProject', 'project/restoreState', 'copilotUI/showConfirmation'],
      },
    }).concat(journalMiddleware, confirmationMiddleware, linkedEditingMiddleware, undoMiddleware, reactiveSolverMiddleware, gradingStalenessMiddleware, resewBridgeMiddleware),
});

void initHistoryTimelinePersistence();

const savedWorkflow = loadWorkflow();
if (savedWorkflow) {
  store.dispatch(rehydrateWorkflow(savedWorkflow));
}

const savedDocks = loadDocks();
if (savedDocks) {
  store.dispatch(rehydrateDocks(savedDocks));
}

// Persist the kept-dock set whenever it changes (focused subscribe; isolated
// from the cascade-middleware chain and the workflowSlice envelope).
let prevDock = store.getState().dock;
store.subscribe(() => {
  const dock = store.getState().dock;
  if (dock !== prevDock) {
    prevDock = dock;
    persistDocks(dock);
  }
});

// Input scheme: async IDB hydrate (fire-and-forget; default Mouse until it lands)
// + focused persist subscribe — same isolation rationale as persistDocks above.
void hydrateInputScheme().then((saved) => {
  if (saved) store.dispatch(rehydrateInputScheme(saved));
});
initLineLengthPreference(store);
let prevInputScheme = store.getState().inputScheme;
store.subscribe(() => {
  const inputScheme = store.getState().inputScheme;
  if (inputScheme !== prevInputScheme) {
    prevInputScheme = inputScheme;
    persistInputScheme(inputScheme);
  }
});

// Project autosave: async IDB hydrate (restore + toast), THEN a focused
// debounced persist subscriber — hydrate-then-subscribe so an early dispatch
// can never clobber the autosave with the boot-empty project. The user's
// actual work must survive a reload (browsers are volatile).
void initProjectPersistence(store);

// La revisión del proyecto para los agentes (spec 2026-10-05 § 5.2).
seguirLaRevision(store);

// Expose store for debugging (remove in production)
(window as unknown as Record<string, unknown>).__VINA_STORE__ = store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
