/**
 * SnapshotBar — floating chip bar for A/B simulation state comparison.
 * Shows saved draping states as clickable chips in the 3D viewport.
 */
import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import {
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  type SimSnapshotMeta,
} from '../../store/simulationSlice';
import './SnapshotBar.css';
import { newId } from '../../utils/ids';

interface SnapshotBarProps {
  onSaveSnapshot: (id: string) => void;
  onRestoreSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
}

const MAX_MANUAL_SLOTS = 3;

export default function SnapshotBar({ onSaveSnapshot, onRestoreSnapshot, onDeleteSnapshot }: SnapshotBarProps) {
  const dispatch = useDispatch();
  const snapshots = useSelector((s: RootState) => s.simulation.snapshots);
  const activeSnapshotId = useSelector((s: RootState) => s.simulation.activeSnapshotId);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);

  const manualSnapshots = snapshots.filter(s => !s.isAutoSave);
  const canSave = simulationState !== 'idle' && manualSnapshots.length < MAX_MANUAL_SLOTS;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const letter = String.fromCharCode(65 + manualSnapshots.length); // A, B, C
    const id = newId();
    onSaveSnapshot(id);
    dispatch(addSnapshot({ id, name: `Version ${letter}`, particleCount: 0, isAutoSave: false }));
    dispatch(setActiveSnapshot(id));
  }, [canSave, manualSnapshots.length, onSaveSnapshot, dispatch]);

  const handleRestore = useCallback((snap: SimSnapshotMeta) => {
    onRestoreSnapshot(snap.id);
    dispatch(setActiveSnapshot(snap.id));
  }, [onRestoreSnapshot, dispatch]);

  const handleDelete = useCallback((e: React.MouseEvent, snap: SimSnapshotMeta) => {
    e.stopPropagation();
    onDeleteSnapshot(snap.id);
    dispatch(removeSnapshot(snap.id));
  }, [onDeleteSnapshot, dispatch]);

  // Only show when simulation is active and there are manual snapshots (or can save)
  if (simulationState === 'idle') return null;
  if (manualSnapshots.length === 0 && !canSave) return null;

  return (
    <div className="snapshot-bar">
      {manualSnapshots.map(snap => (
        <button
          key={snap.id}
          className={`snap-chip${activeSnapshotId === snap.id ? ' active' : ''}`}
          onClick={() => handleRestore(snap)}
        >
          {snap.name}
          <span
            className="snap-delete"
            onClick={(e) => handleDelete(e, snap)}
            role="button"
            tabIndex={-1}
          >
            ×
          </span>
        </button>
      ))}
      <button
        className="snap-save-btn"
        onClick={handleSave}
        disabled={!canSave}
        title="Save current state"
      >
        +
      </button>
    </div>
  );
}
