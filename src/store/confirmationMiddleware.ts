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

/** Human-readable dialog titles */
function getTitle(type: string, payload: unknown): string {
  if (type === 'removePieces' && Array.isArray(payload) && payload.length > 1) {
    return `Remove ${payload.length} Pattern Pieces`;
  }
  const TITLES: Record<string, string> = {
    removePiece: 'Remove Pattern Piece',
    removePieces: 'Remove Pattern Piece',
    removeSeam: 'Remove Seam',
    removePoint: 'Remove Construction Point',
  };
  return TITLES[type] ?? 'Confirm Action';
}

/** Consequence bullets shown in the confirmation dialog */
function getConsequences(type: string, payload: unknown): string[] {
  if (type === 'removePieces' && Array.isArray(payload) && payload.length > 1) {
    return [
      `${payload.length} pattern pieces will be deleted.`,
      'All seams and trims attached to these pieces will also be removed.',
    ];
  }
  const CONSEQUENCES: Record<string, string[]> = {
    removePiece: [
      'Any seams and trims attached to this piece will also be removed.',
    ],
    removeSeam: [
      'The seam connection between pieces will be removed.',
    ],
    removePoint: [
      'Any lines or curves that reference this point may break.',
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
 */
export const confirmationMiddleware: Middleware = (storeApi) => (next) => (rawAction: unknown) => {
  const action = rawAction as ActionLike;

  // ── 0. Auto-apply tool memory on tool activation in expert mode ───────────

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
            description: 'Please confirm you want to proceed.',
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
