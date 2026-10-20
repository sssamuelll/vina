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
  { slice: 'blueprintSlice', reason: 'Dormant per #847: in-memory blueprint store with no live writer (tools un-registered) and no durable persistence (no IDB/LS) — empty in practice, survives NEW_PROJECT only in-session, not across reload. Retained as #53 head-start; the removed handler only reset transient stepping pointers.' },
  { slice: 'pluginSlice', reason: 'Installed/enabled plugins are global, not per-project' },
  { slice: 'renderSettingsSlice', reason: 'Render/lighting/export preferences are user-level defaults (HDRI preset, tone mapping, exposure, format). Custom lights are user setups, not project-derived.' },
  { slice: 'dockSlice', reason: 'Kept auto-suggestion ids are a user UI preference, not project data — intentionally persists across projects.' },
  { slice: 'inputSchemeSlice', reason: 'Input device preference (mouse/trackpad) is user-level hardware config — survives project switches.' },
  { slice: 'iaSlice', reason: 'La conversación con la IA es un hilo de la sesión, no un dato del proyecto: el loop del agente (copilot/conversacion.ts) conserva su historia entre proyectos, y antes de P2c la conversación vivía en un componente que tampoco se reiniciaba con «Proyecto nuevo».' },
  { slice: 'puenteSlice', reason: 'La conexión con el agente de la usuaria (spec 2026-10-09) es un permiso de la sesión, no un dato del proyecto: con «Proyecto nuevo» el agente sigue conectado, y la revisión de la próxima respuesta le dice que el patrón cambió.' },
];

/** All registered slice names (for completeness checking). */
export const ALL_REGISTERED_SLICES: readonly string[] = [
  ...SLICES_THAT_RESET,
  ...SLICES_THAT_SURVIVE.map(s => s.slice),
];
