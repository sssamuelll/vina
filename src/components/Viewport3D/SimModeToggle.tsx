/**
 * SimModeToggle — Arrange ↔ Simulate mode toggle for 3D viewport.
 *
 * CLO3D parity: clear visual distinction between static arrangement
 * and cloth simulation modes. Space bar toggles between them.
 */

import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import {
  startSimulation,
  resetSimulation,
  setViewMode3D,
  saveArrangementSnapshot,
  clearArrangementSnapshot,
} from '../../store/simulationSlice';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import { Move, Play, Square, RotateCcw } from 'lucide-react';

export default function SimModeToggle() {
  const dispatch = useDispatch();
  const viewMode3D = useSelector((s: RootState) => s.simulation.viewMode3D);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const hasSnapshot = useSelector((s: RootState) => s.simulation.arrangementSnapshot !== null);

  const isSimulating = viewMode3D === 'simulate';

  const handleToggle = useCallback(() => {
    if (viewMode3D === 'arrange') {
      // Save arrangement snapshot before simulating
      const placements = placeGarmentPieces(pieces, avatar.measurements);
      const snapshot: Record<string, [number, number, number]> = {};
      pieces.forEach((p, i) => {
        const pos = placements[i].position;
        snapshot[p.id] = [pos[0], pos[1], pos[2]];
      });
      dispatch(saveArrangementSnapshot(snapshot));
      dispatch(setViewMode3D('simulate'));
      dispatch(startSimulation());
    } else {
      // Back to arrange mode
      dispatch(resetSimulation());
      dispatch(setViewMode3D('arrange'));
    }
  }, [dispatch, viewMode3D, pieces, avatar.measurements]);

  const handleReset = useCallback(() => {
    dispatch(resetSimulation());
    dispatch(setViewMode3D('arrange'));
    dispatch(clearArrangementSnapshot());
  }, [dispatch]);

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      background: '#1a1a1a',
      borderRadius: 8,
      padding: 3,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      border: '1px solid #333',
      zIndex: 10,
      fontFamily: "'Inter', sans-serif",
      fontSize: 12,
    }}>
      {/* Arrange button */}
      <button
        onClick={() => { if (isSimulating) handleToggle(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          border: 'none',
          borderRadius: 6,
          background: !isSimulating ? '#2a4a6a' : 'transparent',
          color: !isSimulating ? '#8cc' : '#888',
          cursor: 'pointer',
          fontWeight: !isSimulating ? 600 : 400,
          fontSize: 12,
          transition: 'all 0.15s',
        }}
        title="Arrange Mode — position pieces around avatar"
      >
        <Move size={13} />
        Arrange
      </button>

      {/* Simulate button */}
      <button
        onClick={() => { if (!isSimulating) handleToggle(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          border: 'none',
          borderRadius: 6,
          background: isSimulating
            ? simulationState === 'running' ? '#2a5a3a' : '#3a3a2a'
            : 'transparent',
          color: isSimulating
            ? simulationState === 'running' ? '#8c8' : '#cc8'
            : '#888',
          cursor: 'pointer',
          fontWeight: isSimulating ? 600 : 400,
          fontSize: 12,
          transition: 'all 0.15s',
        }}
        title="Simulate Mode — run cloth physics (Space)"
      >
        {isSimulating && simulationState === 'running' ? <Square size={13} /> : <Play size={13} />}
        Simulate
      </button>

      {/* Reset button */}
      {hasSnapshot && (
        <button
          onClick={handleReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '5px 8px',
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: '#886',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          title="Reset 3D Arrangement (Ctrl+F)"
        >
          <RotateCcw size={13} />
        </button>
      )}
    </div>
  );
}
