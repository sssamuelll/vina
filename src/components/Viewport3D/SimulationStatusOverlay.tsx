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
  const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
  const bodyCollision = useSelector((s: RootState) => s.simulation.bodyCollision);
  const seamResolution = useSelector((s: RootState) => s.simulation.seamResolution);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);

  // Tool tier coverage per C4 RFC § 2.3: steam brush is GPU-only;
  // mesh grab is GPU + WASM. CPU + Neural have no tool dispatch.
  // SolverCapabilities.tools mirrors this for capability-aware consumers.
  const toolUnsupported =
    (activeTool3D === 'steamBrush' && solverTier !== 'webgpu') ||
    (activeTool3D === 'meshGrab' && solverTier !== 'webgpu' && solverTier !== 'wasm');

  // Render the overlay when simulation is active OR when an unsupported
  // tool is armed in idle (user can activate steamBrush/meshGrab from the
  // toolbar before pressing Play — without this, dragging on cloth would
  // silent-skip with zero feedback).
  if (simulationState === 'idle' && !toolUnsupported) return null;

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
      {seamResolution && (
        <div>🧵 {seamResolution.totalConstraints.toLocaleString()} seam constraints</div>
      )}
      {seamResolution && seamResolution.zeroConstraintSeams.length > 0 && (
        <div
          style={{ color: '#ef4444', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title={
            'These seams resolved to 0 XPBD constraints, so the solver cannot pull them together. ' +
            'Per-seam cause: ' +
            seamResolution.zeroConstraintSeams.map(z => `${z.seamId} (${z.reason})`).join(', ') +
            '. Check the seam edge pairing in 2D. Parity plan Fase 4.'
          }
        >
          ⚠️ {seamResolution.zeroConstraintSeams.length} seam{seamResolution.zeroConstraintSeams.length === 1 ? '' : 's'} resolved to 0 constraints — will not sew
        </div>
      )}
      <div style={{ opacity: 0.6 }}>
        Mode: {simulationMode}{isMobile ? ' · Mobile' : ''}
      </div>
      {solverTier !== 'none' && !bodyCollision && (
        <div style={{ color: '#fb923c', fontSize: 10 }}>
          ⚠️ No body collision
        </div>
      )}
      {solverTier === 'wasm' && (
        // Self-collision REMOVED from this list (M4-D): the #608 port runs
        // on the WASM tier and the runtime default is ON — listing it here
        // was the stale "hallazgo B" text. The remaining four are still
        // honestly CPU-only (WASM_CAPABILITIES, A7).
        <div
          style={{ color: '#fb923c', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title="WASM tier does not support LRA (long range attachments), fold constraints, per-piece pressure, or per-piece stiffness. Switch to CPU tier for full feature parity. See A7 RFC."
        >
          ⚠️ Limited features (LRA, fold, pressure, piece stiffness disabled — use CPU tier)
        </div>
      )}
      {toolUnsupported && (
        <div
          style={{ color: '#fb923c', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title={
            activeTool3D === 'steamBrush'
              ? 'Steam brush requires the WebGPU tier (TSL kernels write per-particle velocity damping). Switch to WebGPU tier (opt-in via localStorage) when upstream Three.js fix lands. See C4 RFC § 2.3.'
              : 'Mesh grab requires the WebGPU or WASM tier (CPU has no positional pin; Neural has no per-particle interactivity). Switch to WASM or WebGPU tier. See C4 RFC § 2.3.'
          }
        >
          ⚠️ Active tool ({activeTool3D === 'steamBrush' ? 'steam brush' : 'mesh grab'}) not supported on this tier
        </div>
      )}
    </div>
  );
}
