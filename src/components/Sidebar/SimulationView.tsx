import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  startSimulation, pauseSimulation, resetSimulation,
  setParticleDistance, setSimulationMode, setFabric, setDefaultFabric,
  setWindForce, setWindEnabled, setDragCoefficient,
  toggleFreezePiece,
} from '../../store/simulationSlice';
import { SIMULATION_MODES, type SimulationMode } from '../../utils/cloth/gpu/qualityPresets';
import { FABRIC_LIBRARY } from '../../utils/cloth/fabricLibrary';

const MODE_COLORS: Record<SimulationMode, string> = {
  normal: '#4a88cc',
  complete: '#cc4a4a',
};

const MODE_ICONS: Record<SimulationMode, string> = {
  normal: '⚡',
  complete: '◆',
};

export default function SimulationView() {
  const dispatch = useDispatch();
  const simulation = useSelector((s: RootState) => s.simulation);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const windForce = useSelector((s: RootState) => s.simulation.windForce);
  const windEnabled = useSelector((s: RootState) => s.simulation.windEnabled);
  const dragCoefficient = useSelector((s: RootState) => s.simulation.dragCoefficient);
  const frozenPieceIds = useSelector((s: RootState) => s.simulation.frozenPieceIds);

  const isRunning = simulation.simulationState === 'running';
  const isPaused = simulation.simulationState === 'paused';
  const isIdle = simulation.simulationState === 'idle';
  const activePreset = SIMULATION_MODES[simulation.simulationMode];

  const handleMode = (mode: SimulationMode) => {
    const preset = SIMULATION_MODES[mode];
    dispatch(setSimulationMode(mode));
    dispatch(setParticleDistance(preset.particleDistance));
  };

  return (
    <div className="simulation-view" style={{ padding: '12px' }}>
      {/* Status */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '6px',
          background: isRunning ? '#2d4a2d' : isPaused ? '#4a4a2d' : '#1e1e1e',
          border: `1px solid ${isRunning ? '#4a8a4a' : isPaused ? '#8a8a4a' : '#333'}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isRunning ? MODE_COLORS[simulation.simulationMode] : isPaused ? '#8a8a4a' : '#555',
            boxShadow: isRunning ? `0 0 6px ${MODE_COLORS[simulation.simulationMode]}` : 'none',
          }} />
          <span style={{ fontSize: '12px', color: '#ccc' }}>
            {isRunning ? `SIMULATING — ${activePreset.label}` : isPaused ? 'PAUSED' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button
          onClick={() => isRunning ? dispatch(pauseSimulation()) : dispatch(startSimulation())}
          disabled={pieces.length === 0}
          style={{
            flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer',
            background: isRunning ? '#8a4a4a' : '#4a8a4a', color: '#fff', fontSize: '12px',
            opacity: pieces.length === 0 ? 0.4 : 1,
          }}
        >
          {isRunning ? '⏸ Pause' : '▶ Simulate'}
        </button>
        <button
          onClick={() => dispatch(resetSimulation())}
          disabled={isIdle}
          style={{
            padding: '8px 12px', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer',
            background: 'transparent', color: '#aaa', fontSize: '12px',
            opacity: isIdle ? 0.4 : 1,
          }}
        >
          ↺
        </button>
      </div>

      {/* Simulation Mode */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
          Simulation Mode
        </label>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(Object.keys(SIMULATION_MODES) as SimulationMode[]).map(mode => {
            const preset = SIMULATION_MODES[mode];
            const isActive = simulation.simulationMode === mode;
            return (
              <button
                key={mode}
                onClick={() => handleMode(mode)}
                disabled={isRunning || isPaused}
                style={{
                  flex: 1, padding: '8px 6px', border: `1px solid ${isActive ? MODE_COLORS[mode] : '#333'}`,
                  borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                  background: isActive ? `${MODE_COLORS[mode]}22` : 'transparent',
                  color: isActive ? MODE_COLORS[mode] : '#888',
                  transition: 'all 0.15s',
                  opacity: (isRunning || isPaused) ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: '14px' }}>{MODE_ICONS[mode]}</div>
                <div style={{ marginTop: '2px' }}>{preset.label}</div>
                <div style={{ fontSize: '9px', opacity: 0.7 }}>{preset.particleDistance}mm</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Particle Distance (manual) */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Particle Distance
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <input
            type="range"
            min={2} max={20} step={1}
            value={simulation.particleDistance}
            onChange={e => dispatch(setParticleDistance(Number(e.target.value)))}
            disabled={isRunning || isPaused}
            style={{ flex: 1, accentColor: MODE_COLORS[simulation.simulationMode] }}
          />
          <span style={{ fontSize: '12px', color: '#ccc', minWidth: '36px', textAlign: 'right' }}>
            {simulation.particleDistance}mm
          </span>
        </div>
      </div>

      {/* Wind */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Wind
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#aaa' }}>
            <input
              type="checkbox"
              checked={windEnabled}
              onChange={e => dispatch(setWindEnabled(e.target.checked))}
              style={{ accentColor: '#4a88cc' }}
            />
            Enable
          </label>
        </div>
        {windEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#888', minWidth: '12px' }}>{axis}</span>
                <input
                  type="range"
                  min={-20} max={20} step={0.5}
                  value={windForce[i]}
                  onChange={e => {
                    const next: [number, number, number] = [...windForce] as [number, number, number];
                    next[i] = Number(e.target.value);
                    dispatch(setWindForce(next));
                  }}
                  style={{ flex: 1, accentColor: '#4a88cc' }}
                />
                <span style={{ fontSize: '12px', color: '#ccc', minWidth: '36px', textAlign: 'right' }}>
                  {windForce[i].toFixed(1)}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#888', minWidth: '12px' }}>Cd</span>
              <input
                type="range"
                min={0} max={5} step={0.1}
                value={dragCoefficient}
                onChange={e => dispatch(setDragCoefficient(Number(e.target.value)))}
                style={{ flex: 1, accentColor: '#4a88cc' }}
              />
              <span style={{ fontSize: '12px', color: '#ccc', minWidth: '36px', textAlign: 'right' }}>
                {dragCoefficient.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ fontSize: '11px', color: '#666', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '16px' }}>
        <div>{pieces.length} piece{pieces.length !== 1 ? 's' : ''} • {simulation.particleCount > 0 ? `${simulation.particleCount.toLocaleString()} particles` : 'no mesh'}</div>
        {simulation.frameTimeMs > 0 && <div>{simulation.frameTimeMs.toFixed(1)}ms/frame • {Math.round(1000 / simulation.frameTimeMs)} FPS</div>}
        <div>Solver: {simulation.solverTier} {simulation.bodyCollision ? '• Collision ✓' : '• No body collision'}</div>
      </div>

      {/* Default Fabric */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
          Default Fabric
        </label>
        <select
          value={simulation.defaultFabricId}
          onChange={e => dispatch(setDefaultFabric(e.target.value))}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: '4px',
            border: '1px solid #444', background: '#1e1e1e', color: '#ccc',
            fontSize: '12px',
          }}
        >
          {Object.entries(FABRIC_LIBRARY).map(([id, fab]) => (
            <option key={id} value={id}>{fab.name} — {fab.weight}gsm</option>
          ))}
        </select>
        {(() => {
          const fab = FABRIC_LIBRARY[simulation.defaultFabricId];
          return fab ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <div style={{
                width: 16, height: 16, borderRadius: 3,
                background: fab.color || '#888', border: '1px solid #555',
              }} />
              <span style={{ fontSize: '10px', color: '#888' }}>
                Stretch: {Math.round(fab.stretchStiffness * 100)}% · Bend: {Math.round(fab.bendStiffness * 100)}% · {fab.thickness}mm
              </span>
            </div>
          ) : null;
        })()}
      </div>

      {/* Per-Piece Fabric Assignment */}
      {pieces.length > 0 && (
        <div>
          <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
            Piece Fabrics
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {pieces.map(p => {
              const fabricId = simulation.pieceFabrics[p.id] || simulation.defaultFabricId;
              const fab = FABRIC_LIBRARY[fabricId];
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: fab?.color || '#888', border: '1px solid #555', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '11px', color: '#aaa', minWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <select
                    value={fabricId}
                    onChange={e => dispatch(setFabric({ pieceId: p.id, fabricId: e.target.value }))}
                    style={{
                      flex: 1, padding: '3px 4px', borderRadius: '3px',
                      border: '1px solid #444', background: '#1e1e1e', color: '#ccc',
                      fontSize: '11px',
                    }}
                  >
                    {Object.entries(FABRIC_LIBRARY).map(([id, f]) => (
                      <option key={id} value={id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-Piece Freeze */}
      {pieces.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
            Freeze Pieces
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {pieces.map(p => {
              const isFrozen = frozenPieceIds.includes(p.id);
              return (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  cursor: 'pointer', fontSize: '11px', color: isFrozen ? '#8ab4f8' : '#aaa',
                }}>
                  <input
                    type="checkbox"
                    checked={isFrozen}
                    onChange={() => dispatch(toggleFreezePiece(p.id))}
                  />
                  <span>{p.name}</span>
                  {isFrozen && <span style={{ fontSize: '10px', color: '#668' }}>frozen</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}


    </div>
  );
}
