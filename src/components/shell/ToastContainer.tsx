import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { dismissToast, cleanupExpiredToasts } from '../../store/copilotUISlice';
import './ToastContainer.css';

/**
 * ToastContainer — renders the canonical `copilotUI.toasts` slice.
 *
 * Before this component existed, every `showSuccessToast` / `showErrorToast`
 * dispatch (export feedback, DXF import, storage warnings, copilot pipeline)
 * was silently swallowed: the renderer died with the old shell. This is the
 * minimal v1 surface — message + dismiss. Undo/action buttons are YAGNI
 * until `showUndoToast` has live callers.
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
    <div className="toast-container" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`} role="status">
          <span className="toast__message">{toast.message}</span>
          <button
            className="toast__dismiss"
            aria-label="Dismiss notification"
            onClick={() => dispatch(dismissToast(toast.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
