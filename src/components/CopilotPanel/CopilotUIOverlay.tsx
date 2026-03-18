/**
 * CopilotUIOverlay — Container for all copilot UI overlays.
 *
 * Includes:
 * - Toast notifications
 * - Confirmation dialogs
 * - Action log panel
 * - Keyboard shortcuts
 *
 * This component should be rendered at the app root level.
 */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import CopilotToastContainer from './CopilotToast';
import CopilotConfirmDialog from './CopilotConfirmDialog';
import CopilotActionLog from './CopilotActionLog';
import { useCopilotKeyboardShortcuts } from './useCopilotKeyboardShortcuts';
import { CopilotActionExecutor } from '../../copilot/actions/actionExecutor';
import { store } from '../../store';
import type { CopilotAction } from '../../copilot/actions/actionTypes';
import { resolveCallback } from '../../hooks/useGuardedAction';

/**
 * Props for CopilotUIOverlay.
 */
interface CopilotUIOverlayProps {
  /** Whether keyboard shortcuts are enabled */
  keyboardShortcuts?: boolean;
}

/**
 * Overlay component containing all copilot UI elements.
 */
export default function CopilotUIOverlay({ keyboardShortcuts = true }: CopilotUIOverlayProps) {
  const dispatch = useDispatch<AppDispatch>();
  const confirmation = useSelector((s: RootState) => s.copilotUI.pendingConfirmation);

  // Register keyboard shortcuts
  useCopilotKeyboardShortcuts({ enabled: keyboardShortcuts });

  // Clean up leaked callback when user cancels a hook-source confirmation
  const handleDismiss = useCallback(() => {
    if (confirmation?.source === 'hook' && confirmation.callbackKey) {
      resolveCallback(confirmation.callbackKey); // removes from map, discards callback
    }
  }, [confirmation]);

  // Handle confirmation dialog actions — branch on source
  const handleConfirm = useCallback(async () => {
    if (!confirmation) return;

    switch (confirmation.source) {
      case 'copilot': {
        const copilotAction = confirmation.action as CopilotAction;
        const executor = new CopilotActionExecutor(dispatch, () => store.getState());
        try {
          await executor.execute(copilotAction);
        } catch (error) {
          console.error('Failed to execute confirmed action:', error);
        }
        break;
      }
      case 'middleware': {
        if (confirmation.reduxAction) {
          const reduxAction = confirmation.reduxAction as { type: string; payload: unknown };
          store.dispatch({ ...reduxAction, meta: { skipConfirmation: true } });
        }
        break;
      }
      case 'hook': {
        if (confirmation.callbackKey) {
          const cb = resolveCallback(confirmation.callbackKey);
          cb?.();
        }
        break;
      }
    }
  }, [confirmation, dispatch]);

  return (
    <>
      <CopilotToastContainer />
      <CopilotConfirmDialog onConfirm={handleConfirm} onDismiss={handleDismiss} />
      <CopilotActionLog />
    </>
  );
}
