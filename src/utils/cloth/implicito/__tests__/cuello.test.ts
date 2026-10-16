import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido } from '../cuerpo';
import { mallaDeContorno } from '../malla';
import type { PuntoDeCostura } from '../costuras';
import { esferaDeColision, rectangulo } from '../banco/escenas';
import { anillarTira } from '../banco/cuello';

describe('la tira del cuello en anillo (E11)', () => {
  // un «cuello» esférico de 6 cm en el origen; la tira, de 400 × 30 mm, arranca plana a 20 cm detrás
  const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.06, 3)));
  const sep = 0.00125;
  const armar = () => {
    const m = mallaDeContorno(rectangulo(0, 0, 400, 30), 10);
    const nt = m.x.length / 3;
    // el escote: un vértice por cada vértice del borde cosido (y = 0 del dibujo), en un óvalo de 15 × 12 cm a la altura
    // del centro del cuello, el delantero (z > 0) y la espalda (z < 0)
    const borde: number[] = [];
    for (let v = 0; v < nt; v++) if (Math.abs(m.patron[2 * v + 1]) < 1e-9) borde.push(v);
    borde.sort((a, b) => m.patron[2 * a] - m.patron[2 * b]);
    const x = new Float64Array(3 * (nt + borde.length));
    for (let v = 0; v < nt; v++) {
      x[3 * v] = m.patron[2 * v] - 0.2;
      x[3 * v + 1] = 0.1;
      x[3 * v + 2] = -0.2 + m.patron[2 * v + 1];
    }
    const puntos: PuntoDeCostura[] = borde.map((v, k) => {
      const th = (2 * Math.PI * k) / borde.length - Math.PI / 2;
      const e = nt + k;
      x[3 * e] = 0.15 * Math.cos(th);
      x[3 * e + 1] = 0;
      x[3 * e + 2] = 0.12 * Math.sin(th);
      return { a: v, b0: e, b1: e, s: 0 };
    });
    const patron = new Float64Array(2 * (nt + borde.length));
    patron.set(m.patron);
    return { m, nt, borde, x, puntos, patron };
  };

  it('cierra el anillo con el largo de reposo, fuera del cuello y en el orden del escote', () => {
    const { m, nt, borde, x, puntos, patron } = armar();
    const r = anillarTira(x, patron, { v0: 0, nv: nt }, puntos, cuerpo, sep);
    expect(r).not.toBeNull();
    expect(r!.cosidos).toBe(borde.length);
    // 400 mm de largo: un radio de 63,7 mm, más que el cuello más la separación
    expect(r!.radio).toBeCloseTo(0.4 / (2 * Math.PI), 6);
    expect(Math.abs(r!.estiramiento)).toBeLessThan(1e-9);
    // las dos puntas del borde cosido quedan juntas: la costura del anillo arranca cerrada
    const a = borde[0], b = borde[borde.length - 1];
    expect(Math.hypot(x[3 * a] - x[3 * b], x[3 * a + 1] - x[3 * b + 1], x[3 * a + 2] - x[3 * b + 2])).toBeLessThan(1e-9);
    // ningún vértice de la tira dentro del cuello
    for (let v = 0; v < nt; v++) expect(cuerpo.cercano(x[3 * v], x[3 * v + 1], x[3 * v + 2])!.d).toBeGreaterThan(sep);
    // cada vértice cosido mira hacia su punto del escote (menos de un cuarto de vuelta)
    for (const p of puntos) {
      const ang = (q: number) => Math.atan2(x[3 * q + 2], x[3 * q]);
      expect(Math.cos(ang(p.a) - ang(p.b0))).toBeGreaterThan(0.7);
    }
    // el borde libre sube lo que mide la tira de ancho
    let alto = 0;
    for (let v = 0; v < nt; v++) alto = Math.max(alto, x[3 * v + 1]);
    expect(alto).toBeCloseTo(0.03, 6);
    expect(m.tris.length).toBeGreaterThan(0);
  });

  it('con un cuello más ancho que la tira, la tira lo rodea a la separación y arranca estirada', () => {
    const ancho = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.08, 3)));
    const { nt, x, puntos, patron } = armar();
    const r = anillarTira(x, patron, { v0: 0, nv: nt }, puntos, ancho, sep);
    expect(r!.radio).toBeGreaterThan(0.08 + sep);
    expect(r!.estiramiento).toBeGreaterThan(0.2);
    for (let v = 0; v < nt; v++) expect(ancho.cercano(x[3 * v], x[3 * v + 1], x[3 * v + 2])!.d).toBeGreaterThan(sep);
  });

  it('sin escote no toca nada', () => {
    const { nt, x, patron } = armar();
    const antes = Float64Array.from(x);
    expect(anillarTira(x, patron, { v0: 0, nv: nt }, [], cuerpo, sep)).toBeNull();
    expect(x).toEqual(antes);
  });
});
