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
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store';
import CopilotToastContainer from './CopilotToast';
import CopilotConfirmDialog from './CopilotConfirmDialog';
import CopilotActionLog from './CopilotActionLog';
import { useCopilotKeyboardShortcuts } from './useCopilotKeyboardShortcuts';
import { CopilotActionExecutor } from '../../copilot/actions/actionExecutor';
import { store } from '../../store';
import type { CopilotAction } from '../../copilot/actions/actionTypes';

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

  // Register keyboard shortcuts
  useCopilotKeyboardShortcuts({ enabled: keyboardShortcuts });

  // Handle confirmation dialog actions
  const handleConfirm = useCallback(async (action: unknown) => {
    // Execute the confirmed action
    const copilotAction = action as CopilotAction;
    const executor = new CopilotActionExecutor(dispatch, () => store.getState());

    try {
      await executor.execute(copilotAction);
    } catch (error) {
      console.error('Failed to execute confirmed action:', error);
    }
  }, [dispatch]);

  return (
    <>
      <CopilotToastContainer />
      <CopilotConfirmDialog onConfirm={handleConfirm} />
      <CopilotActionLog />
    </>
  );
}
