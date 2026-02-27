/**
 * useCopilotUI — Hook for integrating copilot actions with UI feedback.
 *
 * Provides methods to:
 * - Show visual feedback (highlights, toasts)
 * - Log actions to the action history
 * - Request confirmations for destructive actions
 * - Clean up highlights automatically
 *
 * @module useCopilotUI
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store';
import {
  addHighlight,
  clearHighlights,
  cleanupExpiredHighlights,
  showToast,
  logAction,
  showConfirmation,
  dismissConfirmation,
  showGhostPreview,
  hideGhostPreview,
  type CopilotHighlight,
  type CopilotToast,
  type CopilotGhostPreview,
} from '../../store/copilotUISlice';
import { isDangerousAction, type CopilotAction } from '../../copilot/actions/actionTypes';

/**
 * Options for action feedback.
 */
interface ActionFeedbackOptions {
  /** Highlight style */
  highlightStyle?: CopilotHighlight['style'];
  /** Highlight duration in ms */
  highlightDuration?: number;
  /** Whether to show success toast */
  showToast?: boolean;
  /** Whether to log to action history */
  logToHistory?: boolean;
}

const DEFAULT_FEEDBACK_OPTIONS: ActionFeedbackOptions = {
  highlightStyle: 'pulse',
  highlightDuration: 2000,
  showToast: true,
  logToHistory: true,
};

/**
 * Hook for copilot UI integration.
 */
export function useCopilotUI() {
  const dispatch = useDispatch<AppDispatch>();
  const cleanupIntervalRef = useRef<number | null>(null);

  // Setup cleanup interval for expired highlights
  useEffect(() => {
    cleanupIntervalRef.current = window.setInterval(() => {
      dispatch(cleanupExpiredHighlights());
    }, 1000);

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [dispatch]);

  /**
   * Highlight a piece.
   */
  const highlightPiece = useCallback((
    pieceId: string,
    options: { style?: CopilotHighlight['style']; color?: string; duration?: number } = {}
  ) => {
    dispatch(addHighlight({
      type: 'piece',
      targetId: pieceId,
      style: options.style || 'pulse',
      color: options.color || '#3b82f6',
      duration: options.duration ?? 2000,
    }));
  }, [dispatch]);

  /**
   * Highlight an edge on a piece.
   */
  const highlightEdge = useCallback((
    pieceId: string,
    edgeIndex: number,
    options: { style?: CopilotHighlight['style']; color?: string; duration?: number } = {}
  ) => {
    dispatch(addHighlight({
      type: 'edge',
      targetId: pieceId,
      index: edgeIndex,
      style: options.style || 'glow',
      color: options.color || '#10b981',
      duration: options.duration ?? 2000,
    }));
  }, [dispatch]);

  /**
   * Highlight a seam.
   */
  const highlightSeam = useCallback((
    seamId: string,
    options: { style?: CopilotHighlight['style']; color?: string; duration?: number } = {}
  ) => {
    dispatch(addHighlight({
      type: 'seam',
      targetId: seamId,
      style: options.style || 'glow',
      color: options.color || '#f59e0b',
      duration: options.duration ?? 2000,
    }));
  }, [dispatch]);

  /**
   * Clear all highlights.
   */
  const clearAllHighlights = useCallback(() => {
    dispatch(clearHighlights());
  }, [dispatch]);

  /**
   * Show a toast notification.
   */
  const toast = useCallback((
    type: CopilotToast['type'],
    message: string,
    options: { actionLabel?: string; actionPayload?: unknown; duration?: number } = {}
  ) => {
    dispatch(showToast({
      type,
      message,
      actionLabel: options.actionLabel,
      actionPayload: options.actionPayload,
      duration: options.duration ?? (type === 'error' ? 5000 : 3000),
    }));
  }, [dispatch]);

  /**
   * Show a success toast.
   */
  const toastSuccess = useCallback((message: string) => {
    toast('success', message);
  }, [toast]);

  /**
   * Show an error toast.
   */
  const toastError = useCallback((message: string) => {
    toast('error', message, { duration: 5000 });
  }, [toast]);

  /**
   * Show an undo toast.
   */
  const toastUndo = useCallback((message: string) => {
    toast('undo', message, { actionLabel: 'Undo', duration: 5000 });
  }, [toast]);

  /**
   * Log an action to the history.
   */
  const log = useCallback((
    action: string,
    description: string,
    success: boolean,
    options: { undoable?: boolean; relatedIds?: string[] } = {}
  ) => {
    dispatch(logAction({
      action,
      description,
      success,
      undoable: options.undoable ?? true,
      relatedIds: options.relatedIds,
    }));
  }, [dispatch]);

  /**
   * Request confirmation for a destructive action.
   * Returns a promise that resolves with the action if confirmed, or null if cancelled.
   */
  const requestConfirmation = useCallback((
    title: string,
    description: string,
    consequences: string[],
    action: unknown
  ): Promise<unknown | null> => {
    return new Promise((resolve) => {
      // Store the resolver in a closure
      const handleConfirm = (confirmedAction: unknown) => {
        resolve(confirmedAction);
      };

      // Note: The actual confirmation handling needs to be done via CopilotConfirmDialog
      // This just shows the dialog
      dispatch(showConfirmation({
        title,
        description,
        consequences,
        destructive: true,
        action: { ...action as object, __resolver: handleConfirm },
      }));

      // For now, auto-resolve after timeout if not handled
      // In production, the CopilotConfirmDialog would call the resolver
    });
  }, [dispatch]);

  /**
   * Dismiss the current confirmation dialog.
   */
  const cancelConfirmation = useCallback(() => {
    dispatch(dismissConfirmation());
  }, [dispatch]);

  /**
   * Show a ghost preview for a create operation.
   */
  const showPreview = useCallback((preview: CopilotGhostPreview) => {
    dispatch(showGhostPreview(preview));
  }, [dispatch]);

  /**
   * Hide the ghost preview.
   */
  const hidePreview = useCallback(() => {
    dispatch(hideGhostPreview());
  }, [dispatch]);

  /**
   * Provide feedback for a completed action.
   * Handles highlighting, toasts, and logging based on the action type.
   */
  const feedbackForAction = useCallback((
    action: CopilotAction,
    result: { success: boolean; message?: string; data?: Record<string, unknown> },
    options: ActionFeedbackOptions = {}
  ) => {
    const opts = { ...DEFAULT_FEEDBACK_OPTIONS, ...options };

    // Highlight affected pieces
    if (opts.highlightDuration && opts.highlightDuration > 0) {
      const pieceId = 'pieceId' in action ? (action as { pieceId: string }).pieceId : null;
      if (pieceId) {
        highlightPiece(pieceId, {
          style: opts.highlightStyle,
          duration: opts.highlightDuration,
          color: result.success ? '#10b981' : '#ef4444',
        });
      }

      // For create actions, highlight the new piece
      if (action.action === 'create_piece' && result.data?.pieceId) {
        highlightPiece(result.data.pieceId as string, {
          style: 'flash',
          duration: opts.highlightDuration,
          color: '#10b981',
        });
      }
    }

    // Show toast
    if (opts.showToast) {
      if (result.success) {
        if (isDangerousAction(action)) {
          toastUndo(result.message || `${action.action} completed`);
        } else {
          toastSuccess(result.message || `${action.action} completed`);
        }
      } else {
        toastError(result.message || `${action.action} failed`);
      }
    }

    // Log to history
    if (opts.logToHistory) {
      const relatedIds: string[] = [];
      if ('pieceId' in action) relatedIds.push((action as { pieceId: string }).pieceId);
      if ('seamId' in action) relatedIds.push((action as { seamId: string }).seamId);
      if (result.data?.pieceId) relatedIds.push(result.data.pieceId as string);

      log(
        action.action,
        result.message || (result.success ? 'Completed' : 'Failed'),
        result.success,
        {
          undoable: result.success,
          relatedIds: relatedIds.length > 0 ? relatedIds : undefined,
        }
      );
    }
  }, [highlightPiece, toastSuccess, toastError, toastUndo, log]);

  /**
   * Check if an action needs confirmation before execution.
   */
  const needsConfirmation = useCallback((action: CopilotAction): boolean => {
    return isDangerousAction(action);
  }, []);

  return {
    // Highlights
    highlightPiece,
    highlightEdge,
    highlightSeam,
    clearAllHighlights,
    // Toasts
    toast,
    toastSuccess,
    toastError,
    toastUndo,
    // Action Log
    log,
    // Confirmations
    requestConfirmation,
    cancelConfirmation,
    needsConfirmation,
    // Ghost Preview
    showPreview,
    hidePreview,
    // Combined Feedback
    feedbackForAction,
  };
}

export default useCopilotUI;
