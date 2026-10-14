import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { separacion, telaSI } from '../tela';
import { CUSICK, escenaCusick, escenaVoladizo, laminaPlana } from '../banco/escenas';
import { aplastados, caidaCusick, peirce, puntaDelVoladizo } from '../banco/medidas';
import { elasticaExacta } from '../banco/elastica';

describe('el banco: escenas y medidas', () => {
  it('la tela pasa a SI: g/m² a kg/m², mm a m y µN·m a N·m', () => {
    const t = telaSI({ gramaje: 200, grosor: 0.5, kTrama: 300, kUrdimbre: 600, kCizalla: 50, pandeo: 1, bTrama: 2, bUrdimbre: 5, bBies: 3, friccionCuerpo: 0.4, friccionTela: 0.45 });
    expect(t.densidad).toBeCloseTo(0.2, 12);
    expect(t.grosor).toBeCloseTo(0.0005, 12);
    expect(t.bUrdimbre).toBeCloseTo(5e-6, 15);
    expect(separacion(t)).toBeCloseTo(0.00125, 12);
  });

  it('el marco del hilo deja la urdimbre en v', () => {
    const uv = aMarcoDelHilo(Float64Array.from([0.01, 0.02]), [1, 0]);
    expect(uv[0]).toBeCloseTo(-0.02, 12);
    expect(uv[1]).toBeCloseTo(0.01, 12);
    const vertical = aMarcoDelHilo(Float64Array.from([0.01, 0.02]));
    expect(Array.from(vertical)).toEqual([0.01, 0.02]);
  });

  it('el voladizo empotra justo los vértices con x ≤ 0 y tiene vértices sobre el borde', () => {
    const e = escenaVoladizo(15, 'urdimbre', 2.5);
    const { x, fijos } = e.malla;
    let enBorde = 0;
    for (let i = 0; i < x.length / 3; i++) {
      expect(fijos?.[i]).toBe(x[3 * i] <= 1e-6 ? 1 : 0);
      if (Math.abs(x[3 * i]) < 1e-6 && Math.abs(x[3 * i + 2]) < 0.0124) enBorde++;
    }
    expect(enBorde).toBeGreaterThan(5);
    expect(e.hilo).toEqual([1, 0]);
    expect(escenaVoladizo(15, 'trama', 5).hilo).toEqual([0, 1]);
  });

  it('un disco plano que no cayó: coeficiente 100, sin ondas ni aplastados', () => {
    const e = escenaCusick(10);
    const { coeficiente, ondas } = caidaCusick(e.malla.x, e.malla);
    expect(coeficiente).toBeGreaterThan(99);
    expect(coeficiente).toBeLessThanOrEqual(100.0001);
    expect(ondas).toBe(0);
    expect(aplastados(e.malla.x, e.malla)).toBe(0);
    expect(e.malla.x[1]).toBe(CUSICK.alturaInicial);
    expect(e.obstaculos).toEqual([{ tipo: 'pedestal', radio: CUSICK.radioPedestal, tapa: CUSICK.tapa }]);
  });

  it('aplastados cuenta los triángulos con menos de la mitad de su área', () => {
    const m = laminaPlana(20);
    const x = Float64Array.from(m.x);
    for (let i = 0; i < x.length / 3; i++) x[3 * i] = m.x[3 * i] * 0.4;
    expect(aplastados(x, m)).toBe(100);
    for (let i = 0; i < x.length / 3; i++) x[3 * i] = m.x[3 * i] * 0.6;
    expect(aplastados(x, m)).toBe(0);
  });

  it('la elástica exacta es la viga lineal cuando la caída es chica (δ = wL⁴/8B)', () => {
    const B = 1e-3, w = 1, L = 0.05;
    const lineal = (w * L ** 4) / (8 * B);
    expect(Math.abs(-elasticaExacta(B, w, L).y - lineal) / lineal).toBeLessThan(0.01);
  });

  it('Peirce: ángulo de la cuerda y longitud de flexión', () => {
    const th = Math.PI / 6, L = 0.1;
    const r = peirce({ x: L * Math.cos(th), y: -L * Math.sin(th) }, L);
    expect(r.angulo).toBeCloseTo(30, 9);
    expect(r.longitudDeFlexion).toBeCloseTo(L * Math.cbrt(Math.cos(th / 2) / (8 * Math.tan(th))), 12);
  });

  it('la punta del voladizo es el promedio de su borde libre', () => {
    const e = escenaVoladizo(15, 'trama', 5);
    const p = puntaDelVoladizo(e.malla.x, e.malla, 0.015);
    expect(p.x).toBeCloseTo(0.015, 6);
    expect(p.y).toBeCloseTo(0, 12);
  });
});
