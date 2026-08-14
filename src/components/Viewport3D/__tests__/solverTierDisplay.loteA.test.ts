import { describe, expect, it } from 'vitest';
import {
  particleCountLabel,
  pieceCountLabel,
  seamResolutionFailureLabel,
  SIMULATION_MODE_LABELS,
  SOLVER_TIER_INFO,
} from '../solverTierDisplay';

describe('copy visible de la simulación', () => {
  it('convierte los enums del motor en etiquetas legibles', () => {
    expect(SOLVER_TIER_INFO.none.label).toBe('En reposo');
    expect(SOLVER_TIER_INFO.wasm.label).toBe('WASM XPBD');
    expect(SIMULATION_MODE_LABELS.complete).toBe('completo');
  });

  it('etiqueta los contadores y respeta el singular', () => {
    expect(particleCountLabel(1200)).toBe('1200 partículas');
    expect(pieceCountLabel(1)).toBe('1 pieza');
    expect(pieceCountLabel(5)).toBe('5 piezas');
  });

  it('no expone las causas internas de una costura fallida', () => {
    expect(seamResolutionFailureLabel('unknown-edge')).toBe('no se reconoce uno de los bordes');
    expect(seamResolutionFailureLabel('future-reason')).toBe('causa no reconocida');
  });
});
