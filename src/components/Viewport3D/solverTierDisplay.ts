import type { SolverTier } from '../../store/simulationSlice';
import type { SimulationMode } from '../../utils/cloth/gpu/qualityPresets';
import type { SeamResolutionFailure } from '../../utils/cloth/seamPairs';

export const SOLVER_TIER_INFO = {
  none: { label: 'En reposo', color: '#666' },
  webgpu: { label: 'WebGPU', color: '#4ade80' },
  wasm: { label: 'WASM XPBD', color: '#fb923c' },
  'cpu-worker': { label: 'CPU Worker', color: '#facc15' },
  'neural-drape': { label: 'Neural Drape', color: '#60a5fa' },
} as const satisfies Record<SolverTier, { label: string; color: string }>;

export const SIMULATION_MODE_LABELS = {
  normal: 'normal',
  complete: 'completo',
} as const satisfies Record<SimulationMode, string>;

const SEAM_RESOLUTION_FAILURE_LABELS = {
  'missing-piece': 'falta una pieza',
  'non-finite-outline': 'el contorno contiene valores no finitos',
  'unknown-edge': 'no se reconoce uno de los bordes',
  'empty-match': 'no se encontraron vértices compatibles',
} as const satisfies Record<SeamResolutionFailure, string>;

export function seamResolutionFailureLabel(reason: string): string {
  return SEAM_RESOLUTION_FAILURE_LABELS[reason as SeamResolutionFailure]
    ?? 'causa no reconocida';
}

export function particleCountLabel(count: number): string {
  return `${count.toLocaleString('es-ES')} partículas`;
}

export function pieceCountLabel(count: number): string {
  return `${count.toLocaleString('es-ES')} ${count === 1 ? 'pieza' : 'piezas'}`;
}
