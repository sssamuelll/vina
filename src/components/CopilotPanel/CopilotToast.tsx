/**
 * CopilotToast — Toast notification component for copilot feedback.
 *
 * Shows success, error, warning, and undo notifications with optional actions.
 */

import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, Check, AlertTriangle, Info, Undo2 } from 'lucide-react';
import { RootState, AppDispatch } from '../../store';
import { dismissToast, cleanupExpiredToasts, type CopilotToast as ToastType } from '../../store/copilotUISlice';
import { undo } from '../../store/editorSlice';
import './CopilotToast.css';

/**
 * Get icon for toast type.
 */
function ToastIcon({ type }: { type: ToastType['type'] }) {
  switch (type) {
    case 'success':
      return <Check className="copilot-toast-icon copilot-toast-icon-success" />;
    case 'error':
      return <X className="copilot-toast-icon copilot-toast-icon-error" />;
    case 'warning':
      return <AlertTriangle className="copilot-toast-icon copilot-toast-icon-warning" />;
    case 'undo':
      return <Undo2 className="copilot-toast-icon copilot-toast-icon-undo" />;
    case 'info':
    default:
      return <Info className="copilot-toast-icon copilot-toast-icon-info" />;
  }
}

/**
 * Single toast item.
 */
function ToastItem({ toast }: { toast: ToastType }) {
  const dispatch = useDispatch<AppDispatch>();

  const handleDismiss = () => {
    dispatch(dismissToast(toast.id));
  };

  const handleAction = () => {
    if (toast.type === 'undo') {
      dispatch(undo());
    }
    handleDismiss();
  };

  return (
    <div className={`copilot-toast copilot-toast-${toast.type}`}>
      <ToastIcon type={toast.type} />
      <span className="copilot-toast-message">{toast.message}</span>
      {toast.actionLabel && (
        <button
          className="copilot-toast-action"
          onClick={handleAction}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        className="copilot-toast-close"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Toast container that renders all active toasts.
 */
export default function CopilotToastContainer() {
  const dispatch = useDispatch<AppDispatch>();
  const toasts = useSelector((state: RootState) => state.copilotUI.toasts);

  // Cleanup expired toasts periodically
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(cleanupExpiredToasts());
    }, 1000);
    return () => clearInterval(interval);
  }, [dispatch]);

  if (toasts.length === 0) return null;

  return (
    <div className="copilot-toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
