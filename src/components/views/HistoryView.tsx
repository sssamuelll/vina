/**
 * HistoryView — Visual timeline of undo/redo state.
 * CLO3D parity: History panel with clickable entries to jump to any state.
 */

import { useSyncExternalStore, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { undo, redo } from '../../store/editorSlice';
import {
  getHistory,
  getHistoryRevision,
  subscribeHistory,
  canUndo,
  canRedo,
  type HistoryEntry,
} from '../../store/undoMiddleware';
import { Undo2, Redo2 } from 'lucide-react';
import './views.css';

function useHistorySnapshot() {
  return useSyncExternalStore(
    subscribeHistory,
    () => getHistoryRevision(), // trigger re-render on revision change
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HistoryView() {
  const dispatch = useDispatch();
  useHistorySnapshot(); // subscribe to changes

  const { past, future } = getHistory();
  const hasUndo = canUndo();
  const hasRedo = canRedo();

  const handleJump = useCallback((targetIndex: number) => {
    const currentIndex = past.length; // current state is "after" all past entries
    if (targetIndex < currentIndex) {
      // Go back
      const steps = currentIndex - targetIndex;
      for (let i = 0; i < steps; i++) dispatch(undo());
    } else if (targetIndex > currentIndex) {
      // Go forward
      const steps = targetIndex - currentIndex;
      for (let i = 0; i < steps; i++) dispatch(redo());
    }
  }, [dispatch, past.length]);

  const isEmpty = past.length === 0 && future.length === 0;

  return (
    <div className="history-view">
      {/* Toolbar */}
      <div className="history-toolbar">
        <button
          className="history-btn"
          onClick={() => dispatch(undo())}
          disabled={!hasUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          className="history-btn"
          onClick={() => dispatch(redo())}
          disabled={!hasRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={14} />
        </button>
        <span className="history-count">
          {past.length} step{past.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline */}
      <div className="history-timeline">
        {isEmpty && (
          <div className="history-empty">
            No history yet. Start editing to build the timeline.
          </div>
        )}

        {/* Past entries */}
        {past.map((entry: HistoryEntry, i: number) => (
          <button
            key={`past-${i}`}
            className="history-entry history-entry-past"
            onClick={() => handleJump(i)}
            title={`Jump to: ${entry.label}`}
          >
            <span className="history-dot" />
            <span className="history-label">{entry.label}</span>
            <span className="history-time">{formatTime(entry.timestamp)}</span>
          </button>
        ))}

        {/* Current state marker */}
        <div className="history-entry history-entry-current">
          <span className="history-dot history-dot-current" />
          <span className="history-label">Current State</span>
        </div>

        {/* Future entries (redo stack, shown dimmed, reversed) */}
        {[...future].reverse().map((entry: HistoryEntry, i: number) => (
          <button
            key={`future-${i}`}
            className="history-entry history-entry-future"
            onClick={() => handleJump(past.length + i + 1)}
            title={`Redo to: ${entry.label}`}
          >
            <span className="history-dot" />
            <span className="history-label">{entry.label}</span>
            <span className="history-time">{formatTime(entry.timestamp)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
