import { describe, expect, it } from 'vitest';
import { franjaDelMargen, MARGEN_POR_DEFECTO_MM } from '../margen';
import { armarPrenda, franjaDePrenda } from '../prenda';
import { aMarcoDelHilo, mallaDeContorno } from '../malla';
import { prepararReposo } from '../reposo';
import { Placa } from '../placa';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { borde } from './ayudas';

const segmentos = (lado: number[]) => lado.slice(1).map((v, k) => [lado[k], v] as [number, number]);

function centroX(m: { patron: ArrayLike<number>; tris: ArrayLike<number> }, t: number): number {
  return (m.patron[2 * m.tris[3 * t]] + m.patron[2 * m.tris[3 * t + 1]] + m.patron[2 * m.tris[3 * t + 2]]) / 3;
}

/** Un cuadrado de 100 mm a 5 mm con su borde x = 100 mm cosido y un margen de 10 mm. */
function cuadradoConFranja() {
  const m = mallaDeContorno(rectangulo(0, 0, 100, 100), 5);
  const franja = franjaDelMargen(m.patron, m.tris, new Uint16Array(m.tris.length / 3), segmentos(borde(m, 0.1)), [0.01]);
  return { m, franja };
}

describe('el margen de costura', () => {
  it('la franja son los triángulos con el centro a menos del margen del borde cosido', () => {
    const { m, franja } = cuadradoConFranja();
    let enFranja = 0;
    for (let t = 0; t < m.tris.length / 3; t++) {
      const d = 0.1 - centroX(m, t);
      if (d < 0.0099) expect(franja[t], `triángulo ${t} a ${d} m`).toBe(1);
      if (d > 0.0101) expect(franja[t], `triángulo ${t} a ${d} m`).toBe(0);
      enFranja += franja[t];
    }
    expect(enFranja).toBeGreaterThan(20);
  });

  it('la franja lleva la masa de sus capas', () => {
    const { m, franja } = cuadradoConFranja();
    const uv = aMarcoDelHilo(m.patron);
    const sin = prepararReposo(uv, m.tris, 0.2), con = prepararReposo(uv, m.tris, 0.2, undefined, Float64Array.from(franja, (f) => (f ? 2 : 1)));
    let areaDeLaFranja = 0;
    for (let t = 0; t < m.tris.length / 3; t++) if (franja[t]) areaDeLaFranja += sin.coef[7 * t + 6];
    const total = (r: { masa: Float64Array }) => r.masa.reduce((s, q) => s + q, 0);
    expect(total(con) - total(sin)).toBeCloseTo(0.2 * areaDeLaFranja, 12);
  });

  it('la flexión de la franja se multiplica, triángulo por triángulo', () => {
    const { m, franja } = cuadradoConFranja();
    const uv = aMarcoDelHilo(m.patron), tela = telaSI(TELA_DE_LABORATORIO);
    const uno = new Placa(uv, m.tris, tela), tres = new Placa(uv, m.tris, tela, { factor: Float64Array.from(franja, (f) => (f ? 3 : 1)) });
    for (let t = 0; t < m.tris.length / 3; t++) {
      for (let j = 0; j < 9; j++) expect(tres.K[9 * t + j]).toBeCloseTo((franja[t] ? 3 : 1) * uno.K[9 * t + j], 15);
    }
  });

  it('en la prenda, cada pieza con su margen, o el de por defecto', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 5);
    const prenda = armarPrenda([
      { id: 'A', ...A, margenMm: 15 },
      { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.1 : q)) },
    ]);
    const nA = A.x.length / 3, tA = A.tris.length / 3;
    const franja = franjaDePrenda(prenda, [{ a: borde(A, 0.1), b: borde(B, 0, nA) }]);
    let lejosEnA = 0;
    for (let t = 0; t < prenda.malla.tris.length / 3; t++) {
      if (!franja[t]) continue;
      // en el dibujo de cada pieza, la distancia a su borde cosido: x = 100 mm en A, x = 0 en B
      const d = t < tA ? 0.1 - centroX(prenda.malla, t) : centroX(prenda.malla, t);
      expect(d).toBeLessThan(t < tA ? 0.015 : MARGEN_POR_DEFECTO_MM / 1000);
      if (t < tA && d > 0.0105) lejosEnA++;
    }
    expect(lejosEnA).toBeGreaterThan(0);
  });
});
