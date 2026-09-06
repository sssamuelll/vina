/**
 * Confirmation Middleware — Task 3 of Click'n'Go (#268)
 *
 * Two responsibilities:
 * 1. Intercepts destructive Redux actions and gates them behind a confirmation
 *    modal (based on expertMode / confirmOverrides policy).
 * 2. Mirrors `tools/setToolOption` changes into `workflow.toolMemory` so that
 *    per-tool option state is persisted across tool switches.
 */

import type { Middleware } from '@reduxjs/toolkit';
import { showConfirmation } from './copilotUISlice';
import { persistWorkflow, updateToolMemory, type WorkflowState } from './workflowSlice';

// ─── Destructive action registry ─────────────────────────────────────────────

/** Maps Redux action type → logical operation name */
const DESTRUCTIVE_ACTIONS: Record<string, string> = {
  'project/removePiece': 'removePiece',
  'project/removePieces': 'removePieces',
  'project/removeSeam': 'removeSeam',
  'construction/removePoint': 'removePoint',
};

/** Títulos del diálogo. Ley de idioma del contrato de interfaz: lo que María
 *  lee justo antes de perder trabajo no puede estar en inglés (#1105). */
function getTitle(type: string, payload: unknown): string {
  if (type === 'removePieces' && Array.isArray(payload) && payload.length > 1) {
    return `Borrar ${payload.length} piezas`;
  }
  const TITLES: Record<string, string> = {
    removePiece: 'Borrar la pieza',
    removePieces: 'Borrar la pieza',
    removeSeam: 'Borrar la costura',
    removePoint: 'Borrar el punto de construcción',
  };
  return TITLES[type] ?? '¿Confirmas la acción?';
}

/** Las viñetas de consecuencia del diálogo. Sin punto final: son etiquetas. */
function getConsequences(type: string, payload: unknown): string[] {
  if (type === 'removePieces' && Array.isArray(payload) && payload.length > 1) {
    return [
      `Se borran ${payload.length} piezas`,
      'Las costuras y los avíos de esas piezas se borran con ellas',
    ];
  }
  const CONSEQUENCES: Record<string, string[]> = {
    removePiece: [
      'Las costuras y los avíos de esta pieza se borran con ella',
    ],
    removeSeam: [
      'Las dos piezas dejan de estar cosidas',
    ],
    removePoint: [
      'Las líneas y las curvas que se apoyan en ese punto pueden romperse',
    ],
  };
  return CONSEQUENCES[type] ?? [];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionLike {
  type: string;
  payload?: unknown;
  meta?: {
    skipConfirmation?: boolean;
    fromToolMemory?: boolean;
    [key: string]: unknown;
  };
}

interface StoreState {
  workflow?: WorkflowState;
}

interface SetToolOptionPayload {
  toolId: string;
  optionId: string;
  value: unknown;
}

// ─── Debounced persistence ────────────────────────────────────────────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedPersist(getState: () => unknown) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const state = getState() as { workflow?: WorkflowState };
    if (state.workflow) {
      persistWorkflow(state.workflow);
    }
    persistTimer = null;
  }, 500);
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Confirmation middleware.
 *
 * Place this **before** undoMiddleware in the custom middleware chain so that
 * blocked actions never reach the undo history.
 *
 * Holds 3 sub-cascadas — see @cascade headers per branch below.
 *
 * cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md`
 */
export const confirmationMiddleware: Middleware = (storeApi) => (next) => (rawAction: unknown) => {
  const action = rawAction as ActionLike;

  // ── 0. Auto-apply tool memory on tool activation in expert mode ───────────
  /**
   * @cascade (sub-cascada c — tool-memory auto-apply)
   * shape: 1→N fan-out — one tool-activation triggers N setToolOption dispatches
   * triggers: tools/setActiveTool2D, tools/setActiveTool3D
   * dispatches: tools/setToolOption (with meta.fromToolMemory: true) per saved option
   * guard: meta.fromToolMemory marks each re-dispatch so sub-cascada b skips it
   * undo: does not group (state mirror, not user action)
   * cap-depth: 1 (meta.fromToolMemory prevents mirror loop)
   */

  if (action.type === 'tools/setActiveTool2D' || action.type === 'tools/setActiveTool3D') {
    const result = next(action);
    const state = storeApi.getState() as StoreState & {
      workflow?: { expertMode: boolean; toolMemory: Record<string, Record<string, unknown>> };
    };
    if (state.workflow?.expertMode) {
      const toolId = action.payload as string;
      const memory = state.workflow.toolMemory[toolId];
      if (memory) {
        for (const [optionId, value] of Object.entries(memory)) {
          storeApi.dispatch({
            type: 'tools/setToolOption',
            payload: { toolId, optionId, value },
            meta: { fromToolMemory: true },
          });
        }
      }
    }
    return result;
  }

  // ── 1. Destructive action gating ─────────────────────────────────────────
  /**
   * @cascade (sub-cascada a — intercept-defer-replay)
   * shape: replay — destructive action blocked, UI dialog dispatched, then
   *        user-confirm causes call-site to re-dispatch with meta.skipConfirmation
   * triggers: project/removePiece, project/removePieces, project/removeSeam,
   *           construction/removePoint
   * dispatches: copilotUI/showConfirmation (UI) when override === 'always'
   * guard: meta.skipConfirmation flag (caller responsibility on replay)
   * undo: n/a (replay is single action; original blocked, replay flows through)
   * cap-depth: 1 (replays with meta.skipConfirmation do not re-block)
   */
  const opName = DESTRUCTIVE_ACTIONS[action.type];
  if (opName) {
    // Allow caller to bypass the guard (e.g. when the user already confirmed)
    if (!action.meta?.skipConfirmation) {
      const state = storeApi.getState() as StoreState;
      const override = state.workflow?.confirmOverrides?.[opName] ?? 'default';

      // All "destructive" actions are undoable (Ctrl+Z), so don't confirm
      // by default. Only confirm if the user explicitly set override to 'always'.
      const shouldConfirm = override === 'always';

      if (shouldConfirm) {
        // Block the action and show the confirmation dialog instead
        storeApi.dispatch(
          showConfirmation({
            source: 'middleware',
            title: getTitle(opName, action.payload),
            description: 'Confirma que quieres seguir',
            consequences: getConsequences(opName, action.payload),
            destructive: true,
            reduxAction: { type: action.type, payload: action.payload },
          })
        );
        // Do NOT call next(action) — action is deferred until the user confirms
        return;
      }
    }
  }

  // ── 2. Let the action through ─────────────────────────────────────────────

  const result = next(action);

  // ── 3. Mirror setToolOption into workflow.toolMemory ──────────────────────
  /**
   * @cascade (sub-cascada b — tool-memory mirror)
   * shape: obs 1→1 — every setToolOption from a user mirrors into workflow.toolMemory
   * triggers: tools/setToolOption (only if meta.fromToolMemory is absent)
   * dispatches: workflow/updateToolMemory
   * guard: skip if action.meta.fromToolMemory (set by sub-cascada c re-dispatches)
   * undo: does not group (state mirror, not user action)
   * cap-depth: 1 (updateToolMemory is workflow/*, not in trigger set)
   */
  if (action.type === 'tools/setToolOption' && !action.meta?.fromToolMemory) {
    const { toolId, optionId, value } = action.payload as SetToolOptionPayload;
    storeApi.dispatch(
      updateToolMemory({ tool: toolId, values: { [optionId]: value } })
    );
  }

  // ── 4. Persist workflow state changes ─────────────────────────────────────

  if (action.type.startsWith('workflow/')) {
    debouncedPersist(storeApi.getState);
  }

  return result;
};
