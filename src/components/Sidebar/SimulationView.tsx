import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  startSimulation, pauseSimulation, resetSimulation,
  setParticleDistance, setQualityLevel, setAutoQuality, setFabric, setDefaultFabric,
} from '../../store/simulationSlice';
import { toggleAnchorPoints } from '../../store/editorSlice';
import { QUALITY_PRESETS, type QualityLevel } from '../../utils/cloth/gpu/qualityPresets';
import { FABRIC_LIBRARY } from '../../utils/cloth/fabricLibrary';

const PRESET_COLORS: Record<QualityLevel, string> = {
  preview: '#888',
  standard: '#4a88cc',
  production: '#cc4a4a',
};

const PRESET_ICONS: Record<QualityLevel, string> = {
  preview: '⚡',
  standard: '●',
  production: '◆',
};

export default function SimulationView() {
  const dispatch = useDispatch();
  const simulation = useSelector((s: RootState) => s.simulation);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const showAnchorPoints = useSelector((s: RootState) => s.editor.showAnchorPoints);
  const isRunning = simulation.simulationState === 'running';
  const isPaused = simulation.simulationState === 'paused';
  const isIdle = simulation.simulationState === 'idle';
  const activePreset = QUALITY_PRESETS[simulation.qualityLevel];

  const handlePreset = (level: QualityLevel) => {
    const preset = QUALITY_PRESETS[level];
    dispatch(setQualityLevel(level));
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
            background: isRunning ? PRESET_COLORS[simulation.qualityLevel] : isPaused ? '#8a8a4a' : '#555',
            boxShadow: isRunning ? `0 0 6px ${PRESET_COLORS[simulation.qualityLevel]}` : 'none',
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

      {/* Quality Presets */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
          Quality Preset
        </label>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(Object.keys(QUALITY_PRESETS) as QualityLevel[]).map(level => {
            const preset = QUALITY_PRESETS[level];
            const isActive = simulation.qualityLevel === level;
            return (
              <button
                key={level}
                onClick={() => handlePreset(level)}
                disabled={isRunning || isPaused}
                style={{
                  flex: 1, padding: '8px 6px', border: `1px solid ${isActive ? PRESET_COLORS[level] : '#333'}`,
                  borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                  background: isActive ? `${PRESET_COLORS[level]}22` : 'transparent',
                  color: isActive ? PRESET_COLORS[level] : '#888',
                  transition: 'all 0.15s',
                  opacity: (isRunning || isPaused) ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: '14px' }}>{PRESET_ICONS[level]}</div>
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
            style={{ flex: 1, accentColor: PRESET_COLORS[simulation.qualityLevel] }}
          />
          <span style={{ fontSize: '12px', color: '#ccc', minWidth: '36px', textAlign: 'right' }}>
            {simulation.particleDistance}mm
          </span>
        </div>
      </div>

      {/* Auto Quality */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#aaa' }}>
          <input
            type="checkbox"
            checked={simulation.autoQuality}
            onChange={e => dispatch(setAutoQuality(e.target.checked))}
            style={{ accentColor: '#4a88cc' }}
          />
          Auto-adjust quality (match framerate)
        </label>
      </div>

      {/* Stats */}
      <div style={{ fontSize: '11px', color: '#666', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '16px' }}>
        <div>{pieces.length} piece{pieces.length !== 1 ? 's' : ''} • {simulation.particleCount > 0 ? `${simulation.particleCount.toLocaleString()} particles` : 'no mesh'}</div>
        {simulation.frameTimeMs > 0 && <div>{simulation.frameTimeMs.toFixed(1)}ms/frame • {Math.round(1000 / simulation.frameTimeMs)} FPS</div>}
        <div>Solver: {simulation.solverTier} {simulation.bodyCollision ? '• SDF ✓' : '• No body collision'}</div>
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

      {/* Viewport Overlays */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #2a2a2a', paddingTop: '12px' }}>
        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
          Viewport
        </div>
        <button
          onClick={() => dispatch(toggleAnchorPoints())}
          title="Toggle arrangement anchor points (Shift+F)"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            width: '100%', padding: '7px 10px', borderRadius: '5px',
            border: `1px solid ${showAnchorPoints ? '#4A90D9' : '#333'}`,
            background: showAnchorPoints ? '#1a2a3a' : '#1a1a1a',
            color: showAnchorPoints ? '#6aadee' : '#777',
            cursor: 'pointer', fontSize: '12px', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '14px' }}>⊕</span>
          <span>Arrangement Points</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>Shift+F</span>
        </button>
      </div>
    </div>
  );
}
