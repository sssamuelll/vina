/**
 * Del clic en «Simular» al primer cuadro de la corrida la tela se prepara, y el
 * estado lo dice («Preparando la tela»). `telaEnMovimiento` marca ese primer
 * cuadro (spec 2026-10-11 «simular al instante» § 4.7).
 */
import { describe, it, expect } from 'vitest';
import reducer, { marcarTelaEnMovimiento, startSimulation, pauseSimulation, resetSimulation } from '../simulationSlice';

describe('simulation.telaEnMovimiento', () => {
  it('la tela está quieta hasta su primer cuadro, y vuelve a estarlo al restablecer', () => {
    let s = reducer(undefined, startSimulation());
    expect(s.telaEnMovimiento).toBe(false);
    s = reducer(s, marcarTelaEnMovimiento(true));
    s = reducer(s, pauseSimulation());
    s = reducer(s, startSimulation());
    expect(s.telaEnMovimiento, 'pausar y reanudar no la vuelve a preparar').toBe(true);
    s = reducer(s, resetSimulation());
    expect(s.telaEnMovimiento).toBe(false);
  });
});
