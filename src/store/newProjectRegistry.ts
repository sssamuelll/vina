/**
 * Central registry of Redux slices and their NEW_PROJECT reset behavior.
 *
 * Every *Slice.ts file in src/store/ MUST appear in exactly one of these lists.
 * A test validates completeness — adding a new slice without listing it here
 * causes a test failure, preventing state leakage between projects.
 *
 * @module newProjectRegistry
 */

/**
 * Slices that MUST reset state (fully or partially) when NEW_PROJECT is dispatched.
 * Each slice handles this via `extraReducers` on the NEW_PROJECT action.
 */
export const SLICES_THAT_RESET: readonly string[] = [
  'animationSlice',
  'avatarSlice',
  'avatarTapeSlice',
  'blueprintSlice',
  'cameraSlice',
  'collisionBodySlice',
  'constructionSlice',
  'copilotUISlice',
  'editorSlice',
  'inspectorSlice',
  'markerSlice',
  'parametricSlice',
  'projectSlice',
  'simulationSlice',
  'toolSlice',
  'workflowSlice', // partial reset: clears toolMemory, preserves expertMode/confirmOverrides
  'bomSlice',
  'nestingSlice',
  'gradingSlice',
];

/**
 * Slices that intentionally survive NEW_PROJECT.
 * These hold user-level preferences or global state not tied to any project.
 *
 * Each entry documents WHY it survives.
 */
export const SLICES_THAT_SURVIVE: readonly { slice: string; reason: string }[] = [
  { slice: 'layoutSlice', reason: 'UI layout preferences are user-level (panel positions, sizes)' },
  { slice: 'pluginSlice', reason: 'Installed/enabled plugins are global, not per-project' },
  { slice: 'renderSettingsSlice', reason: 'Render/lighting/export preferences are user-level defaults (HDRI preset, tone mapping, exposure, format). Custom lights are user setups, not project-derived.' },
];

/** All registered slice names (for completeness checking). */
export const ALL_REGISTERED_SLICES: readonly string[] = [
  ...SLICES_THAT_RESET,
  ...SLICES_THAT_SURVIVE.map(s => s.slice),
];
