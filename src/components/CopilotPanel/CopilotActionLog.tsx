/**
 * CopilotActionLog — Side panel showing copilot action history.
 *
 * Displays a chronological log of actions the copilot has performed,
 * with success/failure status and undo capability.
 */

import { useSelector, useDispatch } from 'react-redux';
import { X, Check, AlertCircle, Undo2, Clock, Trash2 } from 'lucide-react';
import { RootState, AppDispatch } from '../../store';
import {
  setActionLogVisible,
  clearActionLog,
  markActionUndone,
  type CopilotActionLogEntry,
} from '../../store/copilotUISlice';
import { undo } from '../../store/editorSlice';
import './CopilotActionLog.css';

/**
 * Format timestamp as relative time.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

/**
 * Format action type for display.
 */
function formatActionType(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Single action log entry.
 */
function ActionLogEntry({ entry }: { entry: CopilotActionLogEntry }) {
  const dispatch = useDispatch<AppDispatch>();

  const handleUndo = () => {
    dispatch(undo());
    dispatch(markActionUndone(entry.id));
  };

  const isUndoable = entry.undoable && entry.success && !entry.undone;

  return (
    <div className={`action-log-entry ${entry.undone ? 'action-log-entry-undone' : ''}`}>
      <div className="action-log-entry-icon">
        {entry.success ? (
          <Check className="action-log-icon-success" size={14} />
        ) : (
          <AlertCircle className="action-log-icon-error" size={14} />
        )}
      </div>

      <div className="action-log-entry-content">
        <div className="action-log-entry-header">
          <span className="action-log-entry-type">
            {formatActionType(entry.action)}
          </span>
          <span className="action-log-entry-time">
            <Clock size={10} />
            {formatRelativeTime(entry.timestamp)}
          </span>
        </div>
        <p className="action-log-entry-description">
          {entry.description}
          {entry.undone && <span className="action-log-undone-badge">Undone</span>}
        </p>
      </div>

      {isUndoable && (
        <button
          className="action-log-entry-undo"
          onClick={handleUndo}
          title="Undo this action"
        >
          <Undo2 size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Action log panel component.
 */
export default function CopilotActionLog() {
  const dispatch = useDispatch<AppDispatch>();
  const { actionLog, actionLogVisible } = useSelector((state: RootState) => state.copilotUI);

  if (!actionLogVisible) return null;

  const handleClose = () => {
    dispatch(setActionLogVisible(false));
  };

  const handleClear = () => {
    dispatch(clearActionLog());
  };

  // Group entries by date
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groupedEntries: { label: string; entries: CopilotActionLogEntry[] }[] = [];
  let currentGroup: { label: string; entries: CopilotActionLogEntry[] } | null = null;

  for (const entry of actionLog) {
    const entryDate = new Date(entry.timestamp).toDateString();
    let label: string;

    if (entryDate === today) {
      label = 'Today';
    } else if (entryDate === yesterday) {
      label = 'Yesterday';
    } else {
      label = new Date(entry.timestamp).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }

    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, entries: [] };
      groupedEntries.push(currentGroup);
    }
    currentGroup.entries.push(entry);
  }

  return (
    <div className="action-log-panel">
      <div className="action-log-header">
        <h3 className="action-log-title">Copilot Actions</h3>
        <div className="action-log-header-actions">
          {actionLog.length > 0 && (
            <button
              className="action-log-clear"
              onClick={handleClear}
              title="Clear log"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className="action-log-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="action-log-content">
        {actionLog.length === 0 ? (
          <div className="action-log-empty">
            <p>No actions yet</p>
            <p className="action-log-empty-hint">
              Copilot actions will appear here
            </p>
          </div>
        ) : (
          groupedEntries.map((group, i) => (
            <div key={i} className="action-log-group">
              <div className="action-log-group-label">{group.label}</div>
              {group.entries.map(entry => (
                <ActionLogEntry key={entry.id} entry={entry} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
