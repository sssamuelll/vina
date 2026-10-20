import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido } from '../cuerpo';
import { mallaDeContorno } from '../malla';
import { aplastados, distanciaAlCuerpo, estiramiento, pliegues, separacionDeCosturas } from '../banco/medidas';
import { esferaDeColision, rectangulo } from '../banco/escenas';

describe('las medidas de la camiseta', () => {
  const m = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10);

  it('una lámina agrandada 5 % estira 5 % todas sus aristas', () => {
    const e = estiramiento(Float64Array.from(m.x, (q) => 1.05 * q), m);
    for (const p of [e.p05, e.p50, e.p95]) expect(p).toBeCloseTo(0.05, 9);
    expect(e.encogidas).toBe(0);
  });

  it('el pliegue de dos caras que comparten una arista: plano 0°, doblado 135°', () => {
    const tris = Uint32Array.from([0, 1, 2, 1, 0, 3]), patron = new Float64Array(8);
    const plano = pliegues(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, -1, 0]), { x: new Float64Array(12), patron, tris });
    expect(plano.p50).toBeCloseTo(0, 6);
    const doblado = pliegues(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 1, 1]), { x: new Float64Array(12), patron, tris });
    expect(doblado.p50).toBeCloseTo(135, 6);
    expect([doblado.sobre90, doblado.sobre150]).toEqual([1, 0]);
  });

  it('la separación de un punto de costura es la del punto del otro lado, no la del vértice', () => {
    const x = Float64Array.from([0, 0, 0, 0.001, 0, 0, 0.003, 0, 0]);
    expect(separacionDeCosturas(x, [{ a: 0, b0: 1, b1: 2, s: 0.5 }]).mediana).toBeCloseTo(0.002, 12);
  });

  it('la distancia al cuerpo de una lámina a 1 cm de una esfera', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.05, 4)));
    const x = Float64Array.from({ length: 30 }, (_, k) => (k % 3 === 1 ? 0.06 : 0.001 * (k % 7)));
    expect(distanciaAlCuerpo(x, cuerpo).p50 * 1000).toBeCloseTo(10, 0);
  });

  it('cuenta los vértices que quedaron dentro del cuerpo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.05, 4)));
    // tres vértices a 1 cm de la esfera y uno en su centro
    const x = Float64Array.from([0, 0.06, 0, 0.06, 0, 0, 0, 0, 0.06, 0, 0, 0]);
    expect(distanciaAlCuerpo(x, cuerpo).dentro).toBeCloseTo(25, 9);
  });

  it('cuenta los aplastados de un rango de triángulos', () => {
    // dos triángulos de 0,5 de área en el patrón; en x, el primero queda igual y el segundo, a un cuarto de su área
    const malla = { x: new Float64Array(18), patron: Float64Array.from([0, 0, 1, 0, 0, 1, 2, 0, 3, 0, 2, 1]), tris: Uint32Array.from([0, 1, 2, 3, 4, 5]) };
    const x = [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 2.5, 0, 0, 2, 0.5, 0];
    expect(aplastados(x, malla)).toBe(50);
    expect(aplastados(x, malla, 0, 1)).toBe(0);
    expect(aplastados(x, malla, 1, 1)).toBe(100);
  });

  it('mide el estiramiento de un rango de triángulos', () => {
    // los mismos dos triángulos: el primero igual al patrón y el segundo, con las aristas a la mitad
    const malla = { x: new Float64Array(18), patron: Float64Array.from([0, 0, 1, 0, 0, 1, 2, 0, 3, 0, 2, 1]), tris: Uint32Array.from([0, 1, 2, 3, 4, 5]) };
    const x = [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 2.5, 0, 0, 2, 0.5, 0];
    expect(estiramiento(x, malla, 0, 1).p95).toBeCloseTo(0, 12);
    expect(estiramiento(x, malla, 1, 1).p95).toBeCloseTo(-0.5, 12);
  });
});
