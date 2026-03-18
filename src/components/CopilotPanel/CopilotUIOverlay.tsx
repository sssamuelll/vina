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
          // Dynamic import to avoid circular dependency — resolveCallback will exist after Task 6.
          // Use a variable for the module path so TypeScript does not fail at compile time when
          // the file does not yet exist.
          try {
            const modulePath = '../../hooks/useGuardedAction';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod = await (import(/* @vite-ignore */ modulePath) as Promise<any>);
            const cb = mod.resolveCallback?.(confirmation.callbackKey);
            cb?.();
          } catch {
            console.error('Failed to resolve callback for hook confirmation');
          }
        }
        break;
      }
    }
  }, [confirmation, dispatch]);

  return (
    <>
      <CopilotToastContainer />
      <CopilotConfirmDialog onConfirm={handleConfirm} />
      <CopilotActionLog />
    </>
  );
}
