import { describe, expect, it } from 'vitest';
import { mallaDeContorno } from '../malla';
import { Placa } from '../placa';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { toparPlaca } from '../banco/experimentos';

describe('los experimentos del banco', () => {
  it('toparPlaca baja a su techo los triángulos que pasan de N veces la mediana y deja los demás como estaban', () => {
    const m = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const placa = new Placa(m.patron, m.tris, telaSI(TELA_DE_LABORATORIO));
    const antes = Float64Array.from(placa.K), nt = antes.length / 9;
    const maximo = (K: Float64Array, t: number) => Math.max(Math.abs(K[9 * t]), Math.abs(K[9 * t + 4]), Math.abs(K[9 * t + 8]));
    const k = Array.from({ length: nt }, (_, t) => maximo(antes, t)).filter((v) => v > 0).sort((a, b) => a - b);
    const techo = 1.5 * k[k.length >> 1];
    const altos = Array.from({ length: nt }, (_, t) => t).filter((t) => maximo(antes, t) > techo);
    expect(altos.length).toBeGreaterThan(0);
    expect(toparPlaca(placa, 1.5)).toBe(altos.length);
    for (let t = 0; t < nt; t++) {
      if (maximo(antes, t) > techo) expect(maximo(placa.K, t) / techo).toBeCloseTo(1, 12);
      else for (let q = 0; q < 9; q++) expect(placa.K[9 * t + q]).toBe(antes[9 * t + q]);
    }
  });
});
