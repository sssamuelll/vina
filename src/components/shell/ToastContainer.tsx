import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { dismissToast, cleanupExpiredToasts } from '../../store/copilotUISlice';
import './ToastContainer.css';

/**
 * ToastContainer — renders the canonical `copilotUI.toasts` slice.
 *
 * Before this component existed, every `showSuccessToast` / `showErrorToast`
 * dispatch (export feedback, DXF import, storage warnings, copilot pipeline)
 * was silently swallowed: the renderer died with the old shell. Surface:
 * message + dismiss, plus an optional action button when the toast carries
 * `actionLabel` + `actionPayload` (a serializable Redux action dispatched on
 * click — first live caller: the project-restore toast's "Empezar de cero").
 *
 * Position: fixed bottom-right, above the Solver pill (bottom: 56px),
 * column-reverse so the newest toast sits closest to the bottom edge.
 *
 * Expiry: a setInterval dispatches `cleanupExpiredToasts` every second
 * while any toasts are live; the interval is cleared when the list empties
 * or the component unmounts.
 */
export default function ToastContainer() {
  const dispatch = useDispatch();
  const toasts = useSelector((s: RootState) => s.copilotUI.toasts);

  // Cleanup interval — only runs while toasts are present.
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      dispatch(cleanupExpiredToasts());
    }, 1000);
    return () => clearInterval(id);
  }, [toasts.length, dispatch]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" data-material="papel" aria-live="polite" aria-label="Notificaciones">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`} role="status" data-superficie="toast">
          <span className="toast__message">{toast.message}</span>
          {toast.actionLabel && toast.actionPayload != null && (
            <button
              className="toast__action"
              onClick={() => {
                dispatch(toast.actionPayload as UnknownAction);
                dispatch(dismissToast(toast.id));
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            className="toast__dismiss"
            aria-label="Cerrar notificación"
            onClick={() => dispatch(dismissToast(toast.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
