import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, resetSimulation } from '../../store/simulationSlice';
import { FABRIC_LIBRARY } from '../../utils/cloth/fabricLibrary';

/**
 * Simulation control panel — start/pause/reset simulation,
 * select fabric presets, view simulation status.
 */
export default function SimulationView() {
  const dispatch = useDispatch();
  const simulation = useSelector((s: RootState) => s.simulation);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const isRunning = simulation.simulationState === 'running';
  const isPaused = simulation.simulationState === 'paused';
  const isIdle = simulation.simulationState === 'idle';

  return (
    <div className="simulation-view" style={{ padding: '12px' }}>
      {/* Status */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '4px',
          background: isRunning ? '#2d4a2d' : isPaused ? '#4a4a2d' : '#1e1e1e',
          border: `1px solid ${isRunning ? '#4a8a4a' : isPaused ? '#8a8a4a' : '#333'}`,
        }}>
          <span style={{ fontSize: '12px' }}>
            {isRunning ? '● SIMULATING' : isPaused ? '⏸ PAUSED' : '○ IDLE'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => isRunning ? dispatch(pauseSimulation()) : dispatch(startSimulation())}
          disabled={pieces.length === 0}
          style={{
            padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer',
            background: isRunning ? '#8a4a4a' : '#4a8a4a', color: '#fff',
            opacity: pieces.length === 0 ? 0.5 : 1,
          }}
        >
          {isRunning ? '⏸ Pause' : '▶ Start Simulation'}
        </button>
        <button
          onClick={() => dispatch(resetSimulation())}
          disabled={isIdle}
          style={{
            padding: '8px 16px', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
            background: 'transparent', color: '#ccc',
            opacity: isIdle ? 0.5 : 1,
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Piece count */}
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''} in scene
      </div>

      {/* Fabric info */}
      <div>
        <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Available Fabrics
        </label>
        <div style={{ marginTop: '4px', fontSize: '12px', color: '#aaa' }}>
          {Object.entries(FABRIC_LIBRARY).map(([id, preset]) => (
            <div key={id} style={{ padding: '2px 0' }}>{preset.name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
