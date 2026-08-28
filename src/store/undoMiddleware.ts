/* eslint-disable @typescript-eslint/no-explicit-any */
import { Middleware } from '@reduxjs/toolkit';
import type { RootState } from './index';
import { newId } from '../utils/ids';
import {
  appendHistoryTimelineEvent,
  getHistoryTimeline,
  resetHistoryTimeline,
  type HistoryTimelineEvent,
} from './historyTimeline';

// ─── Simulation Snapshot Integration ────────────────────────────────────────

/** Worker snapshot callbacks — registered by GarmentSimulation when simulation is active */
let _snapshotSave: ((id: string) => void) | null = null;
let _snapshotRestore: ((id: string) => void) | null = null;

/**
 * Register simulation snapshot callbacks for undo integration.
 * Called by GarmentSimulation when simulation becomes active.
 * Returns a cleanup function to unregister.
 */
export function registerSimulationCallbacks(
  save: (id: string) => void,
  restore: (id: string) => void,
): () => void {
  _snapshotSave = save;
  _snapshotRestore = restore;
  return () => {
    _snapshotSave = null;
    _snapshotRestore = null;
  };
}

const MAX_HISTORY = 50;
const UNDO_BATCH_MS = 500; // Batch rapid changes (e.g. slider drags) into one undo step
export const AGENT_UNDO_WINDOW_MS = 10_000;

export interface HistoryEntry {
  /** Human-readable description of the action */
  label: string;
  /** Redux action type */
  actionType: string;
  /** Timestamp */
  timestamp: number;
  /** Procedencia efímera del tool; no viaja en la action Redux. */
  agent?: {
    toolName: string;
    lastMutationAt: number;
  };
}

let activeAgentToolName: string | null = null;

export function withAgentHistorySource<T>(
  toolName: string,
  dispatch: () => T,
): T {
  const previous = activeAgentToolName;
  activeAgentToolName = toolName;
  try {
    return dispatch();
  } finally {
    activeAgentToolName = previous;
  }
}

declare const undoBatchTokenBrand: unique symbol;
export type UndoBatchToken = string & { readonly [undoBatchTokenBrand]: true };

export interface UndoBatchOwnershipMeta {
  undoBatchToken: UndoBatchToken;
}

type UndoBatchMode = 'owned' | 'capture-all';

interface ActiveUndoBatch {
  token: UndoBatchToken;
  mode: UndoBatchMode;
}

interface UndoState {
  past: unknown[];
  future: unknown[];
  pastEntries: HistoryEntry[];
  futureEntries: HistoryEntry[];
  lastSnapshotTime: number;
  batchingAction: string | null;
  /** Nested explicit batches, identified so stale end actions cannot close a successor. */
  batchStack: ActiveUndoBatch[];
  /** Snapshot taken at the start of the outermost batch */
  batchSnapshot: unknown | null;
  /** Label for the batched undo entry */
  batchLabel: string | null;
  /** Whether a project action occurred inside the outermost explicit batch. */
  batchDirty: boolean;
  /** Procedencia capturada por la primera mutación del batch explícito. */
  batchAgentToolName: string | null;
  /** Instante de la última mutación capturada por el batch explícito. */
  batchLastMutationAt: number;
  /** The first owned mutation already handled the simulation snapshot contract. */
  batchSimulationSnapshotHandled: boolean;
}

const undoState: UndoState = {
  past: [],
  future: [],
  pastEntries: [],
  futureEntries: [],
  lastSnapshotTime: 0,
  batchingAction: null,
  batchStack: [],
  batchSnapshot: null,
  batchLabel: null,
  batchDirty: false,
  batchAgentToolName: null,
  batchLastMutationAt: 0,
  batchSimulationSnapshotHandled: false,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function canUndo() { return undoState.past.length > 0; }
export function canRedo() { return undoState.future.length > 0; }
export function getUndoLength() { return undoState.past.length; }
export function getRedoLength() { return undoState.future.length; }

/** Devuelve los stacks vivos de undo y el timeline diagnóstico independiente. */
export function getHistory(): {
  past: HistoryEntry[];
  future: HistoryEntry[];
  timeline: HistoryTimelineEvent[];
} {
  return {
    past: undoState.pastEntries.map(cloneHistoryEntry),
    future: undoState.futureEntries.map(cloneHistoryEntry),
    timeline: [...getHistoryTimeline()],
  };
}

function cloneHistoryEntry(entry: HistoryEntry): HistoryEntry {
  return entry.agent
    ? { ...entry, agent: { ...entry.agent } }
    : { ...entry };
}

/** Jump to a specific point in the past (index into pastEntries) */
export function jumpToIndex(index: number, store: any): void {
  const stepsBack = undoState.past.length - index - 1;
  if (stepsBack <= 0) return;
  for (let i = 0; i < stepsBack; i++) {
    store.dispatch({ type: 'editor/undo' });
  }
}

/**
 * Execute a function inside an undo batch. All project/* dispatches within
 * the callback produce a single undo entry instead of one per dispatch.
 *
 * Usage:
 *   batchUndo(dispatch, 'Segment Dart', () => {
 *     dispatch(removeInternalLine(...));
 *     dispatch(addInternalLine(...));
 *     dispatch(addInternalLine(...));
 *   });
 */
type UndoDispatch = (action: { type: string; payload?: unknown; meta?: unknown }) => unknown;

interface UndoBatchStartPayload {
  token: UndoBatchToken;
  label: string;
  mode: UndoBatchMode;
}

function startUndoBatch(
  dispatch: UndoDispatch,
  label: string,
  mode: UndoBatchMode,
): UndoBatchToken {
  const token = newId() as UndoBatchToken;
  dispatch({ type: 'undo/startBatch', payload: { token, label, mode } });
  return token;
}

/** Start an ownership-scoped batch; tag its project actions with the returned token. */
export function beginUndoBatch(dispatch: UndoDispatch, label: string): UndoBatchToken {
  return startUndoBatch(dispatch, label, 'owned');
}

/** End only the matching innermost batch; stale or out-of-order tokens are no-ops. */
export function endUndoBatch(dispatch: UndoDispatch, token: UndoBatchToken): void {
  dispatch({ type: 'undo/endBatch', payload: token });
}

/** Lets long-lived gesture owners detect undo/load invalidation and reopen safely. */
export function isUndoBatchTokenActive(token: UndoBatchToken): boolean {
  return undoState.batchStack.some((batch) => batch.token === token);
}

/** Attach explicit ownership while preserving any action metadata already present. */
export function withUndoBatchToken<A extends { type: string }>(
  action: A,
  token: UndoBatchToken,
): A & { meta: UndoBatchOwnershipMeta } {
  const existingMeta = (action as A & { meta?: Record<string, unknown> }).meta;
  return {
    ...action,
    meta: { ...existingMeta, undoBatchToken: token },
  };
}

export function batchUndo<T>(
  dispatch: UndoDispatch,
  label: string,
  fn: () => T,
): T {
  const token = startUndoBatch(dispatch, label, 'capture-all');
  try {
    return fn();
  } finally {
    endUndoBatch(dispatch, token);
  }
}

// ─── Revision counter for React subscriptions ──────────────────────────────

let _revision = 0;
const _listeners = new Set<() => void>();

export function getHistoryRevision() { return _revision; }
export function subscribeHistory(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
function bumpRevision() {
  _revision++;
  _listeners.forEach(cb => cb());
}

function resetExplicitBatchState(): void {
  undoState.batchStack.length = 0;
  undoState.batchSnapshot = null;
  undoState.batchLabel = null;
  undoState.batchDirty = false;
  undoState.batchAgentToolName = null;
  undoState.batchLastMutationAt = 0;
  undoState.batchSimulationSnapshotHandled = false;
  undoState.batchingAction = null;
  undoState.lastSnapshotTime = 0;
}

function makeHistoryEntry(
  label: string,
  actionType: string,
  timestamp: number,
  agentToolName = activeAgentToolName,
): HistoryEntry {
  return {
    label,
    actionType,
    timestamp,
    ...(agentToolName
      ? { agent: { toolName: agentToolName, lastMutationAt: timestamp } }
      : {}),
  };
}

function rememberHistoryEntry(entry: HistoryEntry): void {
  undoState.pastEntries.push(entry);
  appendHistoryTimelineEvent({
    kind: 'historyEntry',
    label: entry.label,
    actionType: entry.actionType,
    timestamp: entry.timestamp,
    ...(entry.agent
      ? { agent: { toolName: entry.agent.toolName } }
      : {}),
  });
}

function finalizeExplicitBatch(): void {
  const snapshot = undoState.batchSnapshot;
  const label = undoState.batchLabel || 'Batch Operation';
  const dirty = undoState.batchDirty;
  const agentToolName = undoState.batchAgentToolName;
  const lastMutationAt = undoState.batchLastMutationAt;
  resetExplicitBatchState();
  if (!dirty || !snapshot) return;

  undoState.past.push(snapshot);
  const entry = makeHistoryEntry(label, 'batch', Date.now(), agentToolName);
  if (entry.agent) entry.agent.lastMutationAt = lastMutationAt;
  rememberHistoryEntry(entry);
  if (undoState.past.length > MAX_HISTORY) {
    undoState.past.shift();
    undoState.pastEntries.shift();
  }
  undoState.future.length = 0;
  undoState.futureEntries.length = 0;
  bumpRevision();
}

// ─── Action label mapping ───────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  'project/addPiece': 'Add Piece',
  'project/removePiece': 'Delete Piece',
  'project/updatePiece': 'Edit Piece',
  'project/movePiece': 'Move Piece',
  'project/rotatePiece': 'Rotate Piece',
  'project/flipPieceH': 'Flip Horizontal',
  'project/flipPieceV': 'Flip Vertical',
  'project/duplicatePiece': 'Duplicate Piece',
  'project/addSeam': 'Add Seam',
  'project/removeSeam': 'Delete Seam',
  'project/updateSeam': 'Edit Seam',
  'project/addInternalLine': 'Add Internal Line',
  'project/removeInternalLine': 'Delete Internal Line',
  'project/updateInternalLine': 'Edit Internal Line',
  'project/setInternalLine': 'Set Internal Line',
  'project/setFabricCode': 'Change Fabric',
  'project/setPieceFabric': 'Change Fabric',
  'project/updateMeasurements': 'Edit Measurements',
  'project/setAvatarMode': 'Change Avatar',
  'project/setProjectName': 'Rename Project',
  'project/setGroupSeamAllowance': 'Set Seam Allowance',
  'project/batchSetSeamAllowance': 'Apply seam allowance to all',
  'project/setEdgesSeamAllowance': 'Edit seam allowance',
  'project/addPOM': 'Add Measurement',
  'project/updatePOM': 'Update Measurement',
  'project/removePOM': 'Remove Measurement',
  'project/renameLayer': 'Rename Layer',
  'project/deleteLayerName': 'Remove Layer Name',
  'project/setLayerLocked': 'Toggle Layer Lock',
  'project/addLayer': 'Add Layer',
  'project/removeLayer': 'Remove Layer',
  'simulation/toggleHide3D': 'Toggle Hide Piece',
  'simulation/showAll3D': 'Show All Pieces',
  'simulation/toggleFlipNormal': 'Flip Normal',
  'simulation/toggleLayerVisibility': 'Toggle Layer Visibility',
  'simulation/showAllLayers': 'Show All Layers',
  'simulation/setXrayMode': 'Toggle X-Ray Mode',
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace('project/', '').replace(/([A-Z])/g, ' $1').trim();
}

// ─── Safe deep clone ─────────────────────────────────────────────────────────

/**
 * Deep-clone a value using structuredClone (handles undefined, NaN, Infinity,
 * typed arrays, etc.). Falls back to JSON round-trip if structuredClone throws
 * (e.g. functions in state). Returns null on total failure so callers can skip
 * the snapshot rather than crash.
 */
function safeClone<T>(value: T): T | null {
  try {
    return structuredClone(value);
  } catch {
    console.warn('[undoMiddleware] structuredClone failed, falling back to JSON (may lose NaN/undefined)');
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.error('[undoMiddleware] Failed to clone state for undo snapshot', err);
    return null;
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

function actionUndoBatchToken(action: any): UndoBatchToken | null {
  const token = action?.meta?.undoBatchToken;
  return typeof token === 'string' ? token as UndoBatchToken : null;
}

function activeBatchCaptures(action: any): boolean {
  if (undoState.batchStack.some((batch) => batch.mode === 'capture-all')) return true;
  const token = actionUndoBatchToken(action);
  return token !== null && undoState.batchStack.some((batch) => batch.token === token);
}

function snapshotSimulationForFirstBatchMutation(store: { getState: () => unknown }): void {
  if (undoState.batchSimulationSnapshotHandled) return;
  undoState.batchSimulationSnapshotHandled = true;
  const simState = (store.getState() as RootState).simulation?.simulationState;
  if (simState && simState !== 'idle' && _snapshotSave) {
    _snapshotSave('auto-pre-edit');
  }
}

/**
 * @cascade (mechanism, not user-facing cascade)
 * shape: self-dispatch + control-actions consumer
 * triggers (self): editor/undo, editor/redo (also dispatched by jumpToIndex)
 * triggers (control): undo/startBatch, undo/endBatch
 * dispatches: project/restoreState (on undo/redo)
 * meta-flags: `meta.resetUndoHistory` — declara una nueva base de sesión (hidratación del autoguardado): limpia el historial y no genera snapshot. Tercer flag `meta.*` del store, junto a `meta.skipConfirmation` y `meta.fromToolMemory` (B3-state P4).
 * guard: identified batch stack suppresses snapshots only for owned actions
 * undo: this middleware IS the grouping mechanism for other cascades
 * side effect: append/reset del timeline; el writer IDB debounced no despacha
 * cap-depth: n/a (self-dispatch is idempotent — each editor/undo consumes stack)
 * cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md`,
 *            BUG-7 fix-options doc (batch grouping precedent)
 */
export const undoMiddleware: Middleware = (store) => (next) => (action: any) => {
  const actionType: string = action?.type ?? '';
  const resetsUndoHistory = actionType === 'project/loadProject'
    || actionType === 'global/newProject'
    || action?.meta?.resetUndoHistory === true;

  if (actionType === 'editor/undo') {
    const undoRequestedByAgent = activeAgentToolName !== null;
    if (undoState.batchStack.length > 0) {
      finalizeExplicitBatch();
    }
    if (undoState.past.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    const snapshot = safeClone(currentProject);
    if (!snapshot) return; // abort undo — can't save current state for redo
    undoState.future.push(snapshot);
    const entry = undoState.pastEntries.pop();
    if (entry) {
      undoState.futureEntries.push(entry);
      const undoneAt = Date.now();
      const lastMutationAt = entry.agent?.lastMutationAt ?? entry.timestamp;
      const latencyMs = undoneAt - lastMutationAt;
      if (
        !undoRequestedByAgent
        && entry.agent
        && latencyMs >= 0
        && latencyMs <= AGENT_UNDO_WINDOW_MS
      ) {
        appendHistoryTimelineEvent({
          kind: 'rapidUndoAfterAgent',
          timestamp: undoneAt,
          toolName: entry.agent.toolName,
          actionType: entry.actionType,
          actionTimestamp: entry.timestamp,
          lastMutationAt,
          latencyMs,
        });
      }
    }
    const previous = undoState.past.pop()!;
    bumpRevision();
    const result = next({ type: 'project/restoreState', payload: previous });
    // Restore simulation state if simulation is active
    const simStateAfterUndo = (store.getState() as RootState).simulation?.simulationState;
    if (simStateAfterUndo && simStateAfterUndo !== 'idle' && _snapshotRestore) {
      _snapshotRestore('auto-pre-edit');
    }
    return result;
  }

  if (actionType === 'editor/redo') {
    if (undoState.batchStack.length > 0) {
      finalizeExplicitBatch();
    }
    if (undoState.future.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    const snapshot = safeClone(currentProject);
    if (!snapshot) return; // abort redo — can't save current state for undo
    undoState.past.push(snapshot);
    const entry = undoState.futureEntries.pop();
    if (entry) undoState.pastEntries.push(entry);
    const nextState = undoState.future.pop()!;
    bumpRevision();
    return next({ type: 'project/restoreState', payload: nextState });
  }

  // ─── Explicit batch grouping ──────────────────────────────────────────────
  if (actionType === 'undo/startBatch') {
    const payload = action.payload as UndoBatchStartPayload | undefined;
    if (!payload
      || typeof payload.token !== 'string'
      || typeof payload.label !== 'string'
      || (payload.mode !== 'owned' && payload.mode !== 'capture-all')
      || isUndoBatchTokenActive(payload.token)) {
      return;
    }
    if (undoState.batchStack.length === 0) {
      const currentProject = (store.getState() as RootState).project;
      undoState.batchSnapshot = safeClone(currentProject);
      undoState.batchLabel = payload.label || 'Batch Operation';
      undoState.batchDirty = false;
      undoState.batchSimulationSnapshotHandled = false;
    }
    undoState.batchStack.push({ token: payload.token, mode: payload.mode });
    return;
  }

  if (actionType === 'undo/endBatch') {
    const token = action.payload as UndoBatchToken | undefined;
    const activeBatch = undoState.batchStack.at(-1);
    if (!token || !activeBatch || activeBatch.token !== token) return;
    undoState.batchStack.pop();
    if (undoState.batchStack.length === 0) finalizeExplicitBatch();
    return;
  }

  // Registra mutaciones de proyecto salvo restauraciones internas o acciones
  // que declaran un nuevo estado base (como la hidratación del autoguardado).
  if (actionType.startsWith('project/') && actionType !== 'project/restoreState' && !resetsUndoHistory) {
    const hadActiveBatch = undoState.batchStack.length > 0;
    const capturedByBatch = hadActiveBatch && activeBatchCaptures(action);
    if (hadActiveBatch && !capturedByBatch) {
      // Commit the owned gesture before recording an unrelated action so
      // history order remains causal and every gesture token is invalidated.
      finalizeExplicitBatch();
    }

    const now = Date.now();
    const previousEntry = undoState.pastEntries.at(-1);
    const previousSource = previousEntry?.agent?.toolName ?? null;
    const isSameSource = previousSource === activeAgentToolName;
    const isSameAction = actionType === undoState.batchingAction && isSameSource;
    const isRecent = (now - undoState.lastSnapshotTime) < UNDO_BATCH_MS;

    if (capturedByBatch) {
      snapshotSimulationForFirstBatchMutation(store);
      if (!undoState.batchDirty) {
        undoState.batchAgentToolName = activeAgentToolName;
      }
      undoState.batchDirty = true;
      undoState.batchLastMutationAt = now;
      undoState.future.length = 0;
      undoState.futureEntries.length = 0;
      undoState.lastSnapshotTime = now;
      undoState.batchingAction = actionType;
      bumpRevision();
      return next(action);
    }

    // Auto-save simulation state before pattern edit (for undo integration)
    const simState = (store.getState() as RootState).simulation?.simulationState;
    if (simState && simState !== 'idle' && _snapshotSave && !(isSameAction && isRecent)) {
      _snapshotSave('auto-pre-edit');
    }

    // Batch rapid identical actions (e.g. slider-driven updatePiece) into one undo step.
    // Owned explicit-batch actions already returned through the branch above.
    if (!(isSameAction && isRecent)) {
      const currentProject = (store.getState() as RootState).project;
      const snapshot = safeClone(currentProject);
      if (!snapshot) return next(action); // skip snapshot on clone failure — don't corrupt history
      undoState.past.push(snapshot);
      rememberHistoryEntry(makeHistoryEntry(
        getActionLabel(actionType),
        actionType,
        now,
      ));
      if (undoState.past.length > MAX_HISTORY) {
        undoState.past.shift();
        undoState.pastEntries.shift();
      }
    } else if (previousEntry?.agent) {
      // Solo cambia el índice vivo; el evento append-only conserva su copia original.
      previousEntry.agent.lastMutationAt = now;
    }
    // Always clear redo on any new project action (even batched)
    undoState.future.length = 0;
    undoState.futureEntries.length = 0;

    undoState.lastSnapshotTime = now;
    undoState.batchingAction = actionType;
    bumpRevision();
  }

  // Un proyecto cargado, nuevo o hidratado establece una nueva base de sesión.
  if (resetsUndoHistory) {
    undoState.past.length = 0;
    undoState.future.length = 0;
    undoState.pastEntries.length = 0;
    undoState.futureEntries.length = 0;
    resetHistoryTimeline();
    resetExplicitBatchState();
    bumpRevision();
  }

  return next(action);
};
