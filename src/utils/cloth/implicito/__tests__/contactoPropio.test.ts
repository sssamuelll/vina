import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { RejillaDeTriangulos, separacionPropia } from '../contactoPropio';
import { CuerpoRigido, puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import { armarPrenda } from '../prenda';
import { mallaDeContorno } from '../malla';
import { puntosDeCostura } from '../costuras';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { separacion, telaSI } from '../tela';
import { laminaPlana, piramideDeColision, rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, borde, errorDelGradiente } from './ayudas';

const sepTela = separacionPropia(telaSI(TELA_DE_LABORATORIO).grosor);
const nuevoPunto = (): PuntoEnTriangulo => ({ x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 });

describe('la tela contra sí misma', () => {
  it('la rejilla devuelve todo triángulo a menos de la holgura de un punto', () => {
    const r = azar(71), m = laminaPlana(10);
    const x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? 0.01 * r() : q)); // arrugada ±5 mm
    const rejilla = new RejillaDeTriangulos(0.004);
    rejilla.armar(x, m.tris, sepTela);
    const p = nuevoPunto();
    let cerca = 0;
    for (let caso = 0; caso < 200; caso++) {
      const px = 0.12 * r(), py = 0.01 * r(), pz = 0.12 * r();
      const candidatos = new Set(rejilla.cercanos(px, py, pz));
      for (let t = 0; t < m.tris.length / 3; t++) {
        const a = 3 * m.tris[3 * t], b = 3 * m.tris[3 * t + 1], c = 3 * m.tris[3 * t + 2];
        puntoMasCercano(px, py, pz, x[a], x[a + 1], x[a + 2], x[b], x[b + 1], x[b + 2], x[c], x[c + 1], x[c + 2], p);
        if (Math.hypot(px - p.x, py - p.y, pz - p.z) < sepTela) {
          expect(candidatos.has(t)).toBe(true);
          cerca++;
        }
      }
    }
    expect(cerca).toBeGreaterThan(10);
  });

  it('residuo = −∂G/∂x con los pares de dos láminas a 1 mm (diferencias finitas)', () => {
    const abajo = mallaDeContorno(rectangulo(-50, -50, 50, 50), 20), arriba = mallaDeContorno(rectangulo(-40, -40, 40, 40), 20);
    const prenda = armarPrenda([
      { id: 'abajo', ...abajo },
      { id: 'arriba', ...arriba, x: Float64Array.from(arriba.x, (q, k) => (k % 3 === 1 ? q + 0.001 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
    const r = azar(73);
    for (let q = 0; q < s.v.length; q++) s.v[q] = 0.05 * r();
    s.xt.set(s.x);
    s.armarParesPropios();
    expect(s.paresPropios.filter((p) => p.activo).length).toBeGreaterThan(0);
    for (let q = 0; q < s.x.length; q++) s.x[q] += 1e-6 * r();
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('una lámina cae sobre otra apoyada en el suelo y queda encima, a la separación entre capas', () => {
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-45, -45, 45, 45), 10);
    const s0 = separacion(telaSI(TELA_DE_LABORATORIO));
    const prenda = armarPrenda([
      { id: 'abajo', ...abajo, x: Float64Array.from(abajo.x, (q, k) => (k % 3 === 1 ? s0 : q)) },
      { id: 'arriba', ...arriba, x: Float64Array.from(arriba.x, (q, k) => (k % 3 === 1 ? s0 + 0.004 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const nAbajo = abajo.x.length / 3;
    let masBajo = Infinity;
    for (let c = 0; c < 60; c++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      for (let i = nAbajo; i < s.n; i++) masBajo = Math.min(masBajo, s.x[3 * i + 1]);
    }
    expect(masBajo).toBeGreaterThan(s0 + sepTela - 0.0005);
  });

  it('con contacto propio, la costura cierra igual: los compañeros de costura no se empujan', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
    const prenda = armarPrenda([
      { id: 'A', ...A },
      { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, borde(A, 0.1), borde(B, 0, A.x.length / 3)) },
      ajustes: { gravedad: 0, contactoPropio: true },
    });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    let peor = 0;
    const d = [0, 0, 0];
    for (let e = 0; e < s.costuras.n; e++) {
      s.costuras.separacion(e, s.x, d);
      peor = Math.max(peor, Math.hypot(d[0], d[1], d[2]));
    }
    expect(peor).toBeLessThan(1e-4);
  });

  it('la punta de una pirámide no atraviesa una tela de malla gruesa: el vértice del cuerpo contra el triángulo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
    const sobreLaPunta = (contactoPropio: boolean) => {
      const m = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
      // 5 mm sobre la punta, corrida para que la punta caiga en medio de un triángulo
      m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.105 : q + 0.003));
      const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }], ajustes: { contactoPropio } });
      for (let c = 0; c < 60; c++) pasoImplicito(s);
      // el punto de la tela más cercano a la punta, medido hacia arriba desde ella
      const p = nuevoPunto(), x = s.x;
      let mejor = Infinity, dy = 0;
      for (let t = 0; t < m.tris.length / 3; t++) {
        const a = 3 * m.tris[3 * t], b = 3 * m.tris[3 * t + 1], c = 3 * m.tris[3 * t + 2];
        puntoMasCercano(0, 0.1, 0, x[a], x[a + 1], x[a + 2], x[b], x[b + 1], x[b + 2], x[c], x[c + 1], x[c + 2], p);
        const d = Math.hypot(p.x, p.y - 0.1, p.z);
        if (d < mejor) {
          mejor = d;
          dy = p.y - 0.1;
        }
      }
      return dy;
    };
    expect(sobreLaPunta(true)).toBeGreaterThan(sepTela - 0.0005);
    expect(sobreLaPunta(false)).toBeLessThan(0);
  });
});
