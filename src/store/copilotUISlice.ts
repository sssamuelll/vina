/**
 * Copilot UI State — Phase 5 of Issue #130
 *
 * Manages visual feedback for copilot actions:
 * - Highlights for pieces, edges, points
 * - Toast notifications (undo, success, error, info)
 * - Action log entries
 * - Pending confirmation dialogs
 *
 * **E-async ratified (§ 3.2.A Variant F)**: this slice owns the canonical
 * Toast surface. Helpers (`showToast` base + 4 typed: `showSuccessToast`,
 * `showErrorToast`, `showInfoToast`, `showUndoToast`) are the canonical
 * mechanism for **user-facing transient notifications** in the D2
 * 6-variant convention table — auto-dismiss (3-8s), 5-toast limit,
 * NEW_PROJECT reset. NOT infrautilizado (inventory claim refuted by
 * E-async sweep — heavy callsite distribution across copilot pipeline +
 * boundary surfaces post-A3/BUG-15).
 *
 * Cross-ref: docs/reports/2026-05-03-drift-fase2-e-async-states.md § 3.2.A.
 *
 * @module copilotUISlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import { newId } from '../utils/ids';

// ============================================================================
// Types
// ============================================================================

/**
 * Highlight effect for visual feedback.
 */
export interface CopilotHighlight {
  id: string;
  type: 'piece' | 'edge' | 'point' | 'seam';
  /** ID of the element (piece ID, seam ID, etc.) */
  targetId: string;
  /** For edge/point: index within the piece */
  index?: number;
  /** Highlight style */
  style: 'pulse' | 'glow' | 'outline' | 'flash';
  /** Color (CSS color string) */
  color: string;
  /** Duration in ms (0 = persistent until removed) */
  duration: number;
  /** Timestamp when highlight was added */
  timestamp: number;
}

/**
 * Toast notification for user feedback.
 */
export interface CopilotToast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'undo';
  message: string;
  /** Optional action label (e.g., "Undo") */
  actionLabel?: string;
  /** Action payload for undo toasts */
  actionPayload?: unknown;
  /** Duration in ms (0 = persistent) */
  duration: number;
  /** Timestamp when toast was shown */
  timestamp: number;
}

/**
 * Action log entry for history panel.
 */
export interface CopilotActionLogEntry {
  id: string;
  /** Action type (e.g., 'create_piece', 'delete_seam') */
  action: string;
  /** Human-readable description */
  description: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: number;
  /** Whether this action can be undone */
  undoable: boolean;
  /** Whether this action has been undone */
  undone: boolean;
  /** Related piece/seam IDs */
  relatedIds?: string[];
}

/**
 * Pending confirmation dialog.
 */
export interface CopilotConfirmation {
  id: string;
  /** Who triggered the confirmation */
  source: 'copilot' | 'middleware' | 'hook';
  /** Title for the dialog */
  title: string;
  /** Description of what will happen */
  description: string;
  /** List of consequences */
  consequences: string[];
  /** Whether the action is destructive */
  destructive: boolean;
  /** Action to execute if confirmed (copilot source) */
  action?: unknown;
  /** Redux action to dispatch if confirmed (middleware source) */
  reduxAction?: unknown;
  /** Callback registry key to invoke if confirmed (hook source) */
  callbackKey?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Ghost preview for create operations.
 */
export interface CopilotGhostPreview {
  type: 'piece' | 'seam' | 'dart';
  /** Preview data (varies by type) */
  data: unknown;
  /** Position for the preview */
  position?: { x: number; y: number };
}

/**
 * Complete copilot UI state.
 */
export interface CopilotUIState {
  /** Active highlights */
  highlights: CopilotHighlight[];
  /** Active toasts */
  toasts: CopilotToast[];
  /** Action log entries */
  actionLog: CopilotActionLogEntry[];
  /** Maximum log entries to keep */
  maxLogEntries: number;
  /** Pending confirmation dialog */
  pendingConfirmation: CopilotConfirmation | null;
  /** Ghost preview for create operations */
  ghostPreview: CopilotGhostPreview | null;
  /** Whether action log panel is visible */
  actionLogVisible: boolean;
}

const initialState: CopilotUIState = {
  highlights: [],
  toasts: [],
  actionLog: [],
  maxLogEntries: 50,
  pendingConfirmation: null,
  ghostPreview: null,
  actionLogVisible: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

// B11-state: thin wrapper. Prefix ignored. Previous `let nextId = 1`
// counter removed — verified non-load-bearing (entities have explicit
// `timestamp: number` fields; no consumer sorts these arrays by ID).
function generateId(_prefix: string): string {
  return newId();
}

// ============================================================================
// Slice
// ============================================================================

const copilotUISlice = createSlice({
  name: 'copilotUI',
  initialState,
  reducers: {
    // === Highlights ===

    /**
     * Add a highlight for visual feedback.
     */
    addHighlight(state, action: PayloadAction<Omit<CopilotHighlight, 'id' | 'timestamp'>>) {
      const highlight: CopilotHighlight = {
        ...action.payload,
        id: generateId('highlight'),
        timestamp: Date.now(),
      };
      state.highlights.push(highlight);
    },

    /**
     * Remove a specific highlight.
     */
    removeHighlight(state, action: PayloadAction<string>) {
      state.highlights = state.highlights.filter(h => h.id !== action.payload);
    },

    /**
     * Remove all highlights for a target.
     */
    removeHighlightsForTarget(state, action: PayloadAction<string>) {
      state.highlights = state.highlights.filter(h => h.targetId !== action.payload);
    },

    /**
     * Clear all highlights.
     */
    clearHighlights(state) {
      state.highlights = [];
    },

    /**
     * Remove expired highlights (called by cleanup timer).
     */
    cleanupExpiredHighlights(state) {
      const now = Date.now();
      state.highlights = state.highlights.filter(h => {
        if (h.duration === 0) return true; // Persistent
        return now - h.timestamp < h.duration;
      });
    },

    // === Toasts ===

    /**
     * Show a toast notification.
     */
    showToast(state, action: PayloadAction<Omit<CopilotToast, 'id' | 'timestamp'>>) {
      const toast: CopilotToast = {
        ...action.payload,
        id: generateId('toast'),
        timestamp: Date.now(),
      };
      state.toasts.push(toast);

      // Limit to 5 toasts at a time
      if (state.toasts.length > 5) {
        state.toasts = state.toasts.slice(-5);
      }
    },

    /**
     * Dismiss a toast.
     */
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter(t => t.id !== action.payload);
    },

    /**
     * Clear all toasts.
     */
    clearToasts(state) {
      state.toasts = [];
    },

    /**
     * Remove expired toasts.
     */
    cleanupExpiredToasts(state) {
      const now = Date.now();
      state.toasts = state.toasts.filter(t => {
        if (t.duration === 0) return true; // Persistent
        return now - t.timestamp < t.duration;
      });
    },

    // === Action Log ===

    /**
     * Add an entry to the action log.
     */
    logAction(state, action: PayloadAction<Omit<CopilotActionLogEntry, 'id' | 'timestamp' | 'undone'>>) {
      const entry: CopilotActionLogEntry = {
        ...action.payload,
        id: generateId('log'),
        timestamp: Date.now(),
        undone: false,
      };
      state.actionLog.unshift(entry); // Add to beginning

      // Trim to max entries
      if (state.actionLog.length > state.maxLogEntries) {
        state.actionLog = state.actionLog.slice(0, state.maxLogEntries);
      }
    },

    /**
     * Mark an action as undone.
     */
    markActionUndone(state, action: PayloadAction<string>) {
      const entry = state.actionLog.find(e => e.id === action.payload);
      if (entry) {
        entry.undone = true;
      }
    },

    /**
     * Clear the action log.
     */
    clearActionLog(state) {
      state.actionLog = [];
    },

    /**
     * Toggle action log visibility.
     */
    toggleActionLogVisible(state) {
      state.actionLogVisible = !state.actionLogVisible;
    },

    /**
     * Set action log visibility.
     */
    setActionLogVisible(state, action: PayloadAction<boolean>) {
      state.actionLogVisible = action.payload;
    },

    // === Confirmation Dialog ===

    /**
     * Show a confirmation dialog.
     */
    showConfirmation(state, action: PayloadAction<Omit<CopilotConfirmation, 'id' | 'timestamp' | 'source'> & { source?: 'copilot' | 'middleware' | 'hook' }>) {
      state.pendingConfirmation = {
        source: 'copilot',
        ...action.payload,
        id: generateId('confirm'),
        timestamp: Date.now(),
      };
    },

    /**
     * Dismiss the confirmation dialog.
     */
    dismissConfirmation(state) {
      state.pendingConfirmation = null;
    },

    // === Ghost Preview ===

    /**
     * Show a ghost preview.
     */
    showGhostPreview(state, action: PayloadAction<CopilotGhostPreview>) {
      state.ghostPreview = action.payload;
    },

    /**
     * Hide the ghost preview.
     */
    hideGhostPreview(state) {
      state.ghostPreview = null;
    },

    /**
     * Update ghost preview position.
     */
    updateGhostPosition(state, action: PayloadAction<{ x: number; y: number }>) {
      if (state.ghostPreview) {
        state.ghostPreview.position = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  // Highlights
  addHighlight,
  removeHighlight,
  removeHighlightsForTarget,
  clearHighlights,
  cleanupExpiredHighlights,
  // Toasts
  showToast,
  dismissToast,
  clearToasts,
  cleanupExpiredToasts,
  // Action Log
  logAction,
  markActionUndone,
  clearActionLog,
  toggleActionLogVisible,
  setActionLogVisible,
  // Confirmation
  showConfirmation,
  dismissConfirmation,
  // Ghost Preview
  showGhostPreview,
  hideGhostPreview,
  updateGhostPosition,
} = copilotUISlice.actions;

export default copilotUISlice.reducer;

// ============================================================================
// Thunks / Action Creators
// ============================================================================

/**
 * Show an undo toast with action.
 */
export function showUndoToast(message: string, undoPayload: unknown) {
  return showToast({
    type: 'undo',
    message,
    actionLabel: 'Undo',
    actionPayload: undoPayload,
    duration: 5000,
  });
}

/**
 * Show a success toast.
 */
export function showSuccessToast(message: string) {
  return showToast({
    type: 'success',
    message,
    duration: 3000,
  });
}

/**
 * Show an error toast.
 */
export function showErrorToast(message: string) {
  return showToast({
    type: 'error',
    message,
    duration: 5000,
  });
}

/**
 * Show an info toast.
 *
 * Added per E-async D8 gap 4 closure (§ 3.5.2.A) for non-error informational
 * notifications (e.g., validator load warnings). Symmetric with
 * showSuccessToast / showErrorToast helpers.
 */
export function showInfoToast(message: string) {
  return showToast({
    type: 'info',
    message,
    duration: 4000,
  });
}

/**
 * Show a warning toast.
 *
 * Added per #716 (E-async follow-up) for severity/helper symmetry with
 * showSuccessToast / showErrorToast / showInfoToast / showUndoToast. The
 * 'warning' severity already exists in CopilotToast.type union; this helper
 * removes the verbose `showToast({ type:'warning', ... })` papercut.
 *
 * Cross-ref: D2 § 3.2.A Variant F (toast helpers canonical).
 */
export function showWarningToast(message: string) {
  return showToast({
    type: 'warning',
    message,
    duration: 4000,
  });
}

/**
 * Highlight a piece with animation.
 */
export function highlightPiece(pieceId: string, style: CopilotHighlight['style'] = 'pulse', duration = 2000) {
  return addHighlight({
    type: 'piece',
    targetId: pieceId,
    style,
    color: '#3b82f6', // Blue
    duration,
  });
}

/**
 * Highlight an edge with animation.
 */
export function highlightEdge(pieceId: string, edgeIndex: number, style: CopilotHighlight['style'] = 'glow', duration = 2000) {
  return addHighlight({
    type: 'edge',
    targetId: pieceId,
    index: edgeIndex,
    style,
    color: '#10b981', // Green
    duration,
  });
}

/**
 * Show confirmation for a destructive action.
 */
export function confirmDestructiveAction(
  title: string,
  description: string,
  consequences: string[],
  action: unknown
) {
  return showConfirmation({
    title,
    description,
    consequences,
    destructive: true,
    action,
  });
}
