/**
 * CopilotConfirmDialog — Confirmation dialog for destructive actions.
 *
 * Shows what the copilot wants to do and asks for user confirmation.
 */

import { useSelector, useDispatch } from 'react-redux';
import { AlertTriangle, X } from 'lucide-react';
import { RootState, AppDispatch } from '../../store';
import { dismissConfirmation } from '../../store/copilotUISlice';
import './CopilotConfirmDialog.css';

interface CopilotConfirmDialogProps {
  /** Callback when user confirms the action */
  onConfirm?: () => void;
  /** Callback when user cancels/dismisses — used to clean up pending callbacks */
  onDismiss?: () => void;
}

export default function CopilotConfirmDialog({ onConfirm, onDismiss }: CopilotConfirmDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const confirmation = useSelector((state: RootState) => state.copilotUI.pendingConfirmation);

  if (!confirmation) return null;

  const handleCancel = () => {
    onDismiss?.();
    dispatch(dismissConfirmation());
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    dispatch(dismissConfirmation());
  };

  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className="copilot-confirm-overlay"
      onClick={handleCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className={`copilot-confirm-dialog ${confirmation.destructive ? 'copilot-confirm-destructive' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="copilot-confirm-close"
          onClick={handleCancel}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="copilot-confirm-header">
          {confirmation.destructive && (
            <AlertTriangle className="copilot-confirm-icon" />
          )}
          <h2 id="confirm-title" className="copilot-confirm-title">
            {confirmation.title}
          </h2>
        </div>

        <p className="copilot-confirm-description">
          {confirmation.description}
        </p>

        {confirmation.consequences.length > 0 && (
          <ul className="copilot-confirm-consequences">
            {confirmation.consequences.map((consequence, i) => (
              <li key={i}>{consequence}</li>
            ))}
          </ul>
        )}

        {confirmation.destructive && (
          <p className="copilot-confirm-warning">
            You can undo this with Ctrl+Z.
          </p>
        )}

        <div className="copilot-confirm-actions">
          <button
            className="copilot-confirm-btn copilot-confirm-btn-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className={`copilot-confirm-btn ${confirmation.destructive ? 'copilot-confirm-btn-destructive' : 'copilot-confirm-btn-primary'}`}
            onClick={handleConfirm}
            autoFocus
          >
            {confirmation.destructive ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
