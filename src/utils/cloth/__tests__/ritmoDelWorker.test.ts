import { describe, it, expect } from 'vitest';
import { esperaTrasElPaso } from '../ritmoDelWorker';

describe('esperaTrasElPaso: el ritmo de los workers de tela', () => {
  it('va sobrado: espera lo que falta para el tiempo real (1/60 s por paso)', () => {
    expect(esperaTrasElPaso(4)).toBeCloseTo(1000 / 60 - 4, 6);
  });

  it('va atrasado: no espera nada; antes un paso de 20 ms esperaba otros 20', () => {
    expect(esperaTrasElPaso(20)).toBe(0);
    expect(esperaTrasElPaso(120)).toBe(0);
  });
});
