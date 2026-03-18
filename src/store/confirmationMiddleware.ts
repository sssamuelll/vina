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
import { updateToolMemory } from './workflowSlice';

// ─── Destructive action registry ─────────────────────────────────────────────

/** Maps Redux action type → logical operation name */
const DESTRUCTIVE_ACTIONS: Record<string, string> = {
  'project/removePiece': 'removePiece',
  'project/removeSeam': 'removeSeam',
  'construction/removePoint': 'removePoint',
};

/** Human-readable dialog titles */
const TITLES: Record<string, string> = {
  removePiece: 'Remove Pattern Piece',
  removeSeam: 'Remove Seam',
  removePoint: 'Remove Construction Point',
};

/** Consequence bullets shown in the confirmation dialog */
const CONSEQUENCES: Record<string, string[]> = {
  removePiece: [
    'The pattern piece will be permanently deleted.',
    'Any seams attached to this piece will also be removed.',
    'This action cannot be undone without using undo history.',
  ],
  removeSeam: [
    'The seam connection between pieces will be permanently deleted.',
    'This action cannot be undone without using undo history.',
  ],
  removePoint: [
    'The construction point will be permanently deleted.',
    'Any lines or curves that reference this point may break.',
    'This action cannot be undone without using undo history.',
  ],
};

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

interface WorkflowState {
  expertMode: boolean;
  confirmOverrides: Record<string, 'default' | 'always' | 'never'>;
  toolMemory: Record<string, Record<string, unknown>>;
}

interface StoreState {
  workflow?: WorkflowState;
}

interface SetToolOptionPayload {
  toolId: string;
  optionId: string;
  value: unknown;
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Creates the confirmation middleware.
 *
 * Place this **before** undoMiddleware in the custom middleware chain so that
 * blocked actions never reach the undo history.
 */
export function createConfirmationMiddleware(): Middleware {
  return (storeApi) => (next) => (rawAction: unknown) => {
    const action = rawAction as ActionLike;

    // ── 1. Destructive action gating ─────────────────────────────────────────

    const opName = DESTRUCTIVE_ACTIONS[action.type];
    if (opName) {
      // Allow caller to bypass the guard (e.g. when the user already confirmed)
      if (!action.meta?.skipConfirmation) {
        const state = storeApi.getState() as StoreState;
        const workflow = state.workflow;
        const expertMode = workflow?.expertMode ?? false;
        const override = workflow?.confirmOverrides?.[opName] ?? 'default';

        const shouldConfirm =
          override === 'always' ||
          (override === 'default' && !expertMode);

        if (shouldConfirm) {
          // Block the action and show the confirmation dialog instead
          storeApi.dispatch(
            showConfirmation({
              source: 'middleware',
              title: TITLES[opName],
              description: `This action will ${opName}. Please confirm you want to proceed.`,
              consequences: CONSEQUENCES[opName],
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

    return result;
  };
}
