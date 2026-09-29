/**
 * Simulation Status Overlay — shows solver tier, FPS, and particle count.
 *
 * Positioned in the 3D viewport corner. Only visible during simulation.
 * Color-coded by solver tier for instant visual feedback.
 *
 * Collapsed by default to a single line (dot + tier + warning badge); the
 * telemetry detail expands on click (Fase1-H2: debug chrome fuera de la
 * posición primaria de lectura — plan 2026-07-16). The silent-absence
 * surface (C4 § 3.1.A) survives the collapse via the warning badge.
 */

import { useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { SolverTier } from '../../store/simulationSlice';
import {
  CPU_CAPABILITIES,
  WASM_CAPABILITIES,
  GPU_CAPABILITIES,
  NEURAL_CAPABILITIES,
} from '../../utils/cloth/solverCapabilities';
import {
  particleCountLabel,
  seamResolutionFailureLabel,
  SIMULATION_MODE_LABELS,
  SOLVER_TIER_INFO,
} from './solverTierDisplay';

// ponytail: static map — tier strings are a closed enum (SolverTier), no dynamic lookup needed.
const TIER_CAPS = {
  'webgpu':       GPU_CAPABILITIES,
  'wasm':         WASM_CAPABILITIES,
  'cpu-worker':   CPU_CAPABILITIES,
  'neural-drape': NEURAL_CAPABILITIES,
  'none':         CPU_CAPABILITIES,
} as const satisfies Record<SolverTier, typeof CPU_CAPABILITIES>;

export function SimulationStatusOverlay() {
  const [expanded, setExpanded] = useState(false);
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

  const tier = SOLVER_TIER_INFO[solverTier] ?? SOLVER_TIER_INFO.none;
  const fps = frameTimeMs > 0 ? Math.round(1000 / frameTimeMs) : 0;
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  // Diagnósticos reales que el colapso no puede silenciar (C4 § 3.1.A):
  // el badge ⚠ del header delata que hay detalle que leer.
  const warningCount =
    (seamResolution && seamResolution.zeroConstraintSeams.length > 0 ? 1 : 0) +
    (solverTier !== 'none' && !bodyCollision ? 1 : 0) +
    (solverTier !== 'none' && bodyCollision && !TIER_CAPS[solverTier].facePoke ? 1 : 0) +
    (solverTier === 'wasm' ? 1 : 0) +
    (toolUnsupported ? 1 : 0);

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 100,
      background: 'rgba(0,0,0,0.75)', borderRadius: 6,
      padding: '4px 8px', fontFamily: 'monospace', fontSize: 11,
      color: '#e0e0e0',
      backdropFilter: 'blur(4px)', lineHeight: 1.6,
      border: `1px solid ${tier.color}33`,
    }} data-superficie="indicador-simulacion">
      <button
        type="button"
        aria-label="Estado de la simulación"
        aria-expanded={expanded}
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, margin: 0,
          font: 'inherit', color: tier.color, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{
          width: 7, height: 7, borderRadius: '50%', background: tier.color, flexShrink: 0,
        }} />
        {tier.label}
        {simulationState === 'paused' && ' (en pausa)'}
        {warningCount > 0 && (
          <span
            aria-label={warningCount === 1 ? '1 aviso' : `${warningCount} avisos`}
            style={{ color: '#fb923c', fontWeight: 600 }}
          >
            ⚠ {warningCount}
          </span>
        )}
        <span aria-hidden style={{ opacity: 0.5, fontSize: 9 }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <>
      {fps > 0 && (
        <div style={{ color: fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#ef4444' }}>
          {fps} fps ({frameTimeMs.toFixed(1)} ms)
        </div>
      )}
      {particleCount > 0 && (
        <div>{particleCountLabel(particleCount)}</div>
      )}
      {seamResolution && (
        <div>🧵 {seamResolution.totalConstraints.toLocaleString('es-ES')} restricciones de costura</div>
      )}
      {seamResolution && seamResolution.zeroConstraintSeams.length > 0 && (
        <div
          style={{ color: '#ef4444', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title={
            'Estas costuras se resolvieron con 0 restricciones XPBD: el solver no puede unirlas. ' +
            'Causa por costura: ' +
            seamResolution.zeroConstraintSeams
              .map(z => `${z.seamId} (${seamResolutionFailureLabel(z.reason)})`)
              .join(', ') +
            '. Revisa el emparejado de bordes en 2D.'
          }
        >
          ⚠️ {seamResolution.zeroConstraintSeams.length} costura{seamResolution.zeroConstraintSeams.length === 1 ? '' : 's'} sin restricciones — no va a coser
        </div>
      )}
      <div style={{ opacity: 0.6 }}>
        Modo: {SIMULATION_MODE_LABELS[simulationMode]}{isMobile ? ' · móvil' : ''}
      </div>
      {solverTier !== 'none' && !bodyCollision && (
        <div style={{ color: '#fb923c', fontSize: 10 }}>
          ⚠️ Sin colisión con el cuerpo
        </div>
      )}
      {solverTier !== 'none' && bodyCollision && !TIER_CAPS[solverTier].facePoke && (
        <div style={{ color: '#fb923c', fontSize: 10 }}>
          ⚠️ El cuerpo puede asomar a través de la tela — la detección de penetración no está disponible en este motor
        </div>
      )}
      {solverTier === 'wasm' && (
        // Self-collision REMOVED from this list (M4-D): the #608 port runs
        // on the WASM tier and the runtime default is ON — listing it here
        // was the stale "hallazgo B" text. The remaining four are still
        // honestly CPU-only (WASM_CAPABILITIES, A7).
        <div
          style={{ color: '#fb923c', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title="El motor WASM no admite LRA (anclajes de largo alcance), restricciones de pliegue, presión por pieza ni rigidez por pieza. Cambia al motor CPU para tener todas las funciones. Ver RFC A7."
        >
          ⚠️ Funciones limitadas (LRA, pliegues, presión y rigidez por pieza desactivados — usa el motor CPU)
        </div>
      )}
      {toolUnsupported && (
        <div
          style={{ color: '#fb923c', fontSize: 10, maxWidth: 200, marginTop: 2 }}
          title={
            activeTool3D === 'steamBrush'
              ? 'La plancha a vapor requiere el motor WebGPU (los kernels TSL escriben el amortiguado de velocidad por partícula). WebGPU viene activado por defecto; si lo desactivaste, limpia localStorage(\'vina-use-webgpu\'). Ver RFC C4 § 2.3.'
              : 'El agarre de malla requiere el motor WebGPU o WASM (CPU no tiene anclaje posicional; Neural no tiene interacción por partícula). Cambia a WASM o WebGPU. Ver RFC C4 § 2.3.'
          }
        >
          ⚠️ La herramienta activa ({activeTool3D === 'steamBrush' ? 'plancha a vapor' : 'agarre de malla'}) no funciona con este motor
        </div>
      )}
      </>}
    </div>
  );
}
