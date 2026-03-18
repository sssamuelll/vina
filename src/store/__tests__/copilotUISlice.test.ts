/**
 * Tests for copilotUISlice
 */

import { describe, it, expect, beforeEach } from 'vitest';
import reducer, {
  addHighlight,
  removeHighlight,
  clearHighlights,
  cleanupExpiredHighlights,
  showToast,
  dismissToast,
  clearToasts,
  cleanupExpiredToasts,
  logAction,
  markActionUndone,
  clearActionLog,
  toggleActionLogVisible,
  setActionLogVisible,
  showConfirmation,
  dismissConfirmation,
  showGhostPreview,
  hideGhostPreview,
  updateGhostPosition,
  type CopilotUIState,
} from '../copilotUISlice';

describe('copilotUISlice', () => {
  let initialState: CopilotUIState;

  beforeEach(() => {
    initialState = {
      highlights: [],
      toasts: [],
      actionLog: [],
      maxLogEntries: 50,
      pendingConfirmation: null,
      ghostPreview: null,
      actionLogVisible: false,
    };
  });

  describe('highlights', () => {
    it('should add a highlight', () => {
      const state = reducer(initialState, addHighlight({
        type: 'piece',
        targetId: 'piece-1',
        style: 'pulse',
        color: '#3b82f6',
        duration: 2000,
      }));

      expect(state.highlights).toHaveLength(1);
      expect(state.highlights[0].targetId).toBe('piece-1');
      expect(state.highlights[0].style).toBe('pulse');
      expect(state.highlights[0].id).toBeDefined();
      expect(state.highlights[0].timestamp).toBeDefined();
    });

    it('should remove a highlight by id', () => {
      const stateWithHighlight = reducer(initialState, addHighlight({
        type: 'piece',
        targetId: 'piece-1',
        style: 'pulse',
        color: '#3b82f6',
        duration: 2000,
      }));

      const highlightId = stateWithHighlight.highlights[0].id;
      const state = reducer(stateWithHighlight, removeHighlight(highlightId));

      expect(state.highlights).toHaveLength(0);
    });

    it('should clear all highlights', () => {
      let state = reducer(initialState, addHighlight({
        type: 'piece',
        targetId: 'piece-1',
        style: 'pulse',
        color: '#3b82f6',
        duration: 2000,
      }));
      state = reducer(state, addHighlight({
        type: 'edge',
        targetId: 'piece-2',
        index: 0,
        style: 'glow',
        color: '#10b981',
        duration: 2000,
      }));

      expect(state.highlights).toHaveLength(2);

      state = reducer(state, clearHighlights());
      expect(state.highlights).toHaveLength(0);
    });

    it('should cleanup expired highlights', () => {
      const oldTimestamp = Date.now() - 3000; // 3 seconds ago

      const stateWithHighlights: CopilotUIState = {
        ...initialState,
        highlights: [
          {
            id: 'h1',
            type: 'piece',
            targetId: 'p1',
            style: 'pulse',
            color: '#3b82f6',
            duration: 2000, // Should be expired
            timestamp: oldTimestamp,
          },
          {
            id: 'h2',
            type: 'piece',
            targetId: 'p2',
            style: 'pulse',
            color: '#3b82f6',
            duration: 0, // Persistent, should remain
            timestamp: oldTimestamp,
          },
        ],
      };

      const state = reducer(stateWithHighlights, cleanupExpiredHighlights());
      expect(state.highlights).toHaveLength(1);
      expect(state.highlights[0].id).toBe('h2');
    });
  });

  describe('toasts', () => {
    it('should show a toast', () => {
      const state = reducer(initialState, showToast({
        type: 'success',
        message: 'Action completed',
        duration: 3000,
      }));

      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].type).toBe('success');
      expect(state.toasts[0].message).toBe('Action completed');
    });

    it('should show an undo toast with action', () => {
      const state = reducer(initialState, showToast({
        type: 'undo',
        message: 'Deleted piece',
        actionLabel: 'Undo',
        actionPayload: { pieceId: 'p1' },
        duration: 5000,
      }));

      expect(state.toasts[0].type).toBe('undo');
      expect(state.toasts[0].actionLabel).toBe('Undo');
      expect(state.toasts[0].actionPayload).toEqual({ pieceId: 'p1' });
    });

    it('should dismiss a toast', () => {
      const stateWithToast = reducer(initialState, showToast({
        type: 'success',
        message: 'Test',
        duration: 3000,
      }));

      const toastId = stateWithToast.toasts[0].id;
      const state = reducer(stateWithToast, dismissToast(toastId));

      expect(state.toasts).toHaveLength(0);
    });

    it('should limit toasts to 5', () => {
      let state = initialState;
      for (let i = 0; i < 7; i++) {
        state = reducer(state, showToast({
          type: 'info',
          message: `Toast ${i}`,
          duration: 3000,
        }));
      }

      expect(state.toasts).toHaveLength(5);
    });

    it('should clear all toasts', () => {
      let state = initialState;
      for (let i = 0; i < 3; i++) {
        state = reducer(state, showToast({
          type: 'info',
          message: `Toast ${i}`,
          duration: 3000,
        }));
      }

      state = reducer(state, clearToasts());
      expect(state.toasts).toHaveLength(0);
    });

    it('should cleanup expired toasts', () => {
      const oldTimestamp = Date.now() - 5000;

      const stateWithToasts: CopilotUIState = {
        ...initialState,
        toasts: [
          {
            id: 't1',
            type: 'success',
            message: 'Old',
            duration: 3000,
            timestamp: oldTimestamp,
          },
          {
            id: 't2',
            type: 'error',
            message: 'Persistent',
            duration: 0,
            timestamp: oldTimestamp,
          },
        ],
      };

      const state = reducer(stateWithToasts, cleanupExpiredToasts());
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].id).toBe('t2');
    });
  });

  describe('actionLog', () => {
    it('should log an action', () => {
      const state = reducer(initialState, logAction({
        action: 'create_piece',
        description: 'Created Front Bodice',
        success: true,
        undoable: true,
      }));

      expect(state.actionLog).toHaveLength(1);
      expect(state.actionLog[0].action).toBe('create_piece');
      expect(state.actionLog[0].success).toBe(true);
      expect(state.actionLog[0].undone).toBe(false);
    });

    it('should add new entries at the beginning', () => {
      let state = reducer(initialState, logAction({
        action: 'action1',
        description: 'First',
        success: true,
        undoable: true,
      }));
      state = reducer(state, logAction({
        action: 'action2',
        description: 'Second',
        success: true,
        undoable: true,
      }));

      expect(state.actionLog[0].action).toBe('action2');
      expect(state.actionLog[1].action).toBe('action1');
    });

    it('should mark an action as undone', () => {
      const stateWithLog = reducer(initialState, logAction({
        action: 'delete_piece',
        description: 'Deleted piece',
        success: true,
        undoable: true,
      }));

      const entryId = stateWithLog.actionLog[0].id;
      const state = reducer(stateWithLog, markActionUndone(entryId));

      expect(state.actionLog[0].undone).toBe(true);
    });

    it('should clear the action log', () => {
      let state = initialState;
      for (let i = 0; i < 5; i++) {
        state = reducer(state, logAction({
          action: `action${i}`,
          description: `Action ${i}`,
          success: true,
          undoable: true,
        }));
      }

      state = reducer(state, clearActionLog());
      expect(state.actionLog).toHaveLength(0);
    });

    it('should trim log to maxLogEntries', () => {
      const stateWithSmallMax: CopilotUIState = {
        ...initialState,
        maxLogEntries: 3,
      };

      let state = stateWithSmallMax;
      for (let i = 0; i < 5; i++) {
        state = reducer(state, logAction({
          action: `action${i}`,
          description: `Action ${i}`,
          success: true,
          undoable: true,
        }));
      }

      expect(state.actionLog).toHaveLength(3);
    });

    it('should toggle action log visibility', () => {
      let state = reducer(initialState, toggleActionLogVisible());
      expect(state.actionLogVisible).toBe(true);

      state = reducer(state, toggleActionLogVisible());
      expect(state.actionLogVisible).toBe(false);
    });

    it('should set action log visibility', () => {
      const state = reducer(initialState, setActionLogVisible(true));
      expect(state.actionLogVisible).toBe(true);
    });
  });

  describe('confirmation', () => {
    it('should show a confirmation dialog', () => {
      const state = reducer(initialState, showConfirmation({
        title: 'Delete piece?',
        description: 'This will remove the piece.',
        consequences: ['Remove 3 connected seams'],
        destructive: true,
        action: { action: 'delete_piece', pieceId: 'p1' },
      }));

      expect(state.pendingConfirmation).not.toBeNull();
      expect(state.pendingConfirmation?.title).toBe('Delete piece?');
      expect(state.pendingConfirmation?.destructive).toBe(true);
    });

    it('should dismiss the confirmation dialog', () => {
      const stateWithConfirm = reducer(initialState, showConfirmation({
        title: 'Test',
        description: 'Test',
        consequences: [],
        destructive: false,
        action: {},
      }));

      const state = reducer(stateWithConfirm, dismissConfirmation());
      expect(state.pendingConfirmation).toBeNull();
    });
  });

  describe('confirmation source discriminator', () => {
    it('should store middleware source with reduxAction', () => {
      const state = reducer(initialState, showConfirmation({
        source: 'middleware',
        title: 'Delete piece?',
        description: 'This will remove the piece.',
        consequences: ['3 seams removed'],
        destructive: true,
        reduxAction: { type: 'project/removePiece', payload: 'piece-1' },
      }));
      expect(state.pendingConfirmation).not.toBeNull();
      expect(state.pendingConfirmation!.source).toBe('middleware');
      expect(state.pendingConfirmation!.reduxAction).toEqual({
        type: 'project/removePiece', payload: 'piece-1',
      });
    });

    it('should store hook source with callbackKey', () => {
      const state = reducer(initialState, showConfirmation({
        source: 'hook',
        title: 'Split piece?',
        description: 'This will split the piece.',
        consequences: [],
        destructive: true,
        callbackKey: 'abc-123',
      }));
      expect(state.pendingConfirmation!.source).toBe('hook');
      expect(state.pendingConfirmation!.callbackKey).toBe('abc-123');
    });

    it('should default source to copilot for backward compatibility', () => {
      const state = reducer(initialState, showConfirmation({
        title: 'Do something?',
        description: 'Something will happen.',
        consequences: [],
        destructive: false,
        action: { type: 'createPiece' },
      }));
      expect(state.pendingConfirmation!.source).toBe('copilot');
    });
  });

  describe('ghostPreview', () => {
    it('should show a ghost preview', () => {
      const state = reducer(initialState, showGhostPreview({
        type: 'piece',
        data: { width: 200, height: 300 },
        position: { x: 100, y: 100 },
      }));

      expect(state.ghostPreview).not.toBeNull();
      expect(state.ghostPreview?.type).toBe('piece');
    });

    it('should hide the ghost preview', () => {
      const stateWithPreview = reducer(initialState, showGhostPreview({
        type: 'piece',
        data: {},
      }));

      const state = reducer(stateWithPreview, hideGhostPreview());
      expect(state.ghostPreview).toBeNull();
    });

    it('should update ghost position', () => {
      const stateWithPreview = reducer(initialState, showGhostPreview({
        type: 'piece',
        data: {},
        position: { x: 0, y: 0 },
      }));

      const state = reducer(stateWithPreview, updateGhostPosition({ x: 50, y: 75 }));
      expect(state.ghostPreview?.position).toEqual({ x: 50, y: 75 });
    });
  });
});
