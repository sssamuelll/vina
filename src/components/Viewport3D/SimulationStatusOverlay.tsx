/**
 * Simulation Status Overlay — shows solver tier, FPS, and particle count.
 *
 * Positioned in the 3D viewport corner. Only visible during simulation.
 * Color-coded by solver tier for instant visual feedback.
 */

import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { SolverTier } from '../../store/simulationSlice';

const TIER_INFO: Record<SolverTier, { label: string; color: string; icon: string }> = {
  'none':          { label: 'Idle',         color: '#666',    icon: '⏸' },
  'webgpu':        { label: 'WebGPU',       color: '#4ade80', icon: '🟢' },
  'wasm':          { label: 'Wasm XPBD',    color: '#fb923c', icon: '🟠' },
  'cpu-worker':    { label: 'CPU Worker',   color: '#facc15', icon: '🟡' },
  'neural-drape':  { label: 'Neural Drape', color: '#60a5fa', icon: '🔵' },
};

export function SimulationStatusOverlay() {
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const solverTier = useSelector((s: RootState) => s.simulation.solverTier);
  const frameTimeMs = useSelector((s: RootState) => s.simulation.frameTimeMs);
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const qualityLevel = useSelector((s: RootState) => s.simulation.qualityLevel);

  if (simulationState === 'idle') return null;

  const tier = TIER_INFO[solverTier] ?? TIER_INFO['none'];
  const fps = frameTimeMs > 0 ? Math.round(1000 / frameTimeMs) : 0;
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 100,
      background: 'rgba(0,0,0,0.75)', borderRadius: 6,
      padding: '6px 10px', fontFamily: 'monospace', fontSize: 11,
      color: '#e0e0e0', pointerEvents: 'none',
      backdropFilter: 'blur(4px)', lineHeight: 1.6,
      border: `1px solid ${tier.color}33`,
    }}>
      <div style={{ color: tier.color, fontWeight: 600 }}>
        {tier.icon} {tier.label}
        {simulationState === 'paused' && ' (paused)'}
      </div>
      {fps > 0 && (
        <div style={{ color: fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#ef4444' }}>
          {fps} FPS ({frameTimeMs.toFixed(1)}ms)
        </div>
      )}
      {particleCount > 0 && (
        <div>{particleCount.toLocaleString()} particles</div>
      )}
      <div style={{ opacity: 0.6 }}>
        Quality: {qualityLevel}{isMobile ? ' · Mobile' : ''}
      </div>
    </div>
  );
}
