import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { RejillaDePuntos, separacionPropia } from '../contactoPropio';
import { CuerpoRigido, puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import { armarPrenda } from '../prenda';
import { mallaDeContorno } from '../malla';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { separacion, telaSI } from '../tela';
import { escenaCostura, piramideDeColision, rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

const sepTela = separacionPropia(telaSI(TELA_DE_LABORATORIO).grosor);
const nuevoPunto = (): PuntoEnTriangulo => ({ x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 });

describe('la tela contra sí misma', () => {
  it('la rejilla de puntos da todo punto que cae dentro de la caja', () => {
    const r = azar(71), P = Float64Array.from({ length: 3 * 500 }, () => 0.2 * r());
    const rejilla = new RejillaDePuntos();
    rejilla.armar(P, 0.013);
    for (let caso = 0; caso < 100; caso++) {
      const c = [0.2 * r(), 0.2 * r(), 0.2 * r()], m = 0.02 * (r() + 0.5);
      const vistos = new Set<number>();
      rejilla.enCaja(c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m, (p) => vistos.add(p));
      for (let p = 0; p < 500; p++) {
        if ([0, 1, 2].every((d) => Math.abs(P[3 * p + d] - c[d]) <= m)) expect(vistos.has(p)).toBe(true);
      }
    }
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

  it('los pares usan la rigidez del contacto propio (kPropio) y no la del cuerpo', () => {
    const abajo = mallaDeContorno(rectangulo(-50, -50, 50, 50), 20), arriba = mallaDeContorno(rectangulo(-40, -40, 40, 40), 20);
    const prenda = armarPrenda([
      { id: 'abajo', ...abajo },
      { id: 'arriba', ...arriba, x: Float64Array.from(arriba.x, (q, k) => (k % 3 === 1 ? q + 0.001 : q)) },
    ]);
    const armar = (ajustes: { kContacto: number; kPropio?: number }) => {
      const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0, ...ajustes } });
      const r = azar(79);
      for (let q = 0; q < s.v.length; q++) s.v[q] = 0.05 * r();
      s.xt.set(s.x);
      s.armarParesPropios();
      for (let q = 0; q < s.x.length; q++) s.x[q] += 1e-6 * r();
      s.linealizar();
      return s;
    };
    const medir = (s: SistemaTela) => {
      const res = new Float64Array(s.x.length), Ap = new Float64Array(s.x.length), B = new Float64Array(3 * s.x.length);
      s.residuo(res);
      s.sumarContactosPor(Float64Array.from(s.x, (_, k) => Math.sin(k)), Ap);
      s.sumarBloquesDeContacto(B);
      return { E: s.energiaIncremental(s.x), res, Ap, B };
    };
    // sin obstáculos solo hay pares: el contacto propio en 20 con el del cuerpo en 2000 es todo en 20
    const propio = medir(armar({ kContacto: 2000, kPropio: 20 })), todo20 = medir(armar({ kContacto: 20 }));
    expect(propio.E).toBeCloseTo(todo20.E, 12);
    for (const k of ['res', 'Ap', 'B'] as const) {
      expect(propio[k].reduce((m, q, i) => Math.max(m, Math.abs(q - todo20[k][i])), 0)).toBeLessThan(1e-12 * (1 + Math.max(...todo20[k].map(Math.abs))));
    }
    expect(Math.abs(medir(armar({ kContacto: 2000 })).E - propio.E)).toBeGreaterThan(1e-9);
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

  it('con contacto propio, una costura plegada cierra igual: los compañeros de costura no se empujan', () => {
    // B plegada 150° sobre la costura: junto a la línea, los vértices de un lado caen sobre la cara del otro a menos
    // de la separación; si los compañeros de costura formaran par, se empujarían y la costura no cerraría
    const e = escenaCostura(0, 150);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { costuras: e.costuras, franja: e.franja, ajustes: { gravedad: 0, contactoPropio: true } });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    let peor = 0;
    const d = [0, 0, 0];
    for (let k = 0; k < s.costuras.n; k++) {
      s.costuras.separacion(k, s.x, d);
      peor = Math.max(peor, Math.hypot(d[0], d[1], d[2]));
    }
    expect(peor).toBeLessThan(1e-4);
  });

  it('la punta de una pirámide no atraviesa una tela de malla gruesa: el vértice del cuerpo contra el triángulo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
    const sobreLaPunta = (contactoPropio: boolean, kPropio?: number) => {
      const m = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
      // 5 mm sobre la punta, corrida para que la punta caiga en medio de un triángulo
      m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.105 : q + 0.003));
      const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }], ajustes: { contactoPropio, kPropio } });
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
    // la punta es contacto con el cuerpo: lleva su rigidez aunque la tela contra la tela sea blanda
    expect(sobreLaPunta(true, 1)).toBeGreaterThan(sepTela - 0.0005);
  });
  it('una lámina sola no tiene pares, aunque un vértice corra (E6: la tela de al lado no es otra capa)', () => {
    const s = new SistemaTela(mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), TELA_DE_LABORATORIO);
    s.v[0] = 1.2; // a 1,2 m/s el radio de búsqueda llega a su tope de 2 cm
    s.xt.set(s.x);
    s.armarParesPropios();
    expect(s.paresPropios).toHaveLength(0);
  });

  it('un vértice justo encima de un vértice de la otra capa forma par: cae sobre la cara cerrada de sus triángulos', () => {
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), nAbajo = abajo.x.length / 3;
    // el vértice de abajo más cerca del centro y uno 1 mm encima, en una pieza aparte de un triángulo lejano
    let c = 0;
    for (let i = 1; i < nAbajo; i++) if (Math.hypot(abajo.x[3 * i], abajo.x[3 * i + 2]) < Math.hypot(abajo.x[3 * c], abajo.x[3 * c + 2])) c = i;
    const punto = { x: Float64Array.from([abajo.x[3 * c], 0.001, abajo.x[3 * c + 2], 0.3, 0.001, 0.3, 0.31, 0.001, 0.3]), patron: Float64Array.from([0, 0, 0.3, 0.3, 0.31, 0.3]), tris: Uint32Array.from([0, 1, 2]) };
    const prenda = armarPrenda([{ id: 'abajo', ...abajo }, { id: 'punto', ...punto }]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
    s.xt.set(s.x);
    s.armarParesPropios();
    expect(s.paresPropios.filter((p) => p.v[0] === nAbajo && p.activo).length).toBeGreaterThan(0);
  });

  it('una capa que viene rápido no atraviesa la de abajo en un cuadro (la anticipación)', () => {
    // la de arriba a 6 mm y bajando a 0,6 m/s: sola, el paso la llevaría 10 mm más abajo
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-40, -40, 40, 40), 10, 0.006);
    const nAbajo = abajo.x.length / 3;
    const prenda = armarPrenda([{ id: 'abajo', ...abajo, fijos: new Uint8Array(nAbajo).fill(1) }, { id: 'arriba', ...arriba }]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
    for (let i = nAbajo; i < s.n; i++) s.v[3 * i + 1] = -0.6;
    pasoImplicito(s);
    let masBajo = Infinity;
    for (let i = nAbajo; i < s.n; i++) masBajo = Math.min(masBajo, s.x[3 * i + 1]);
    expect(masBajo).toBeGreaterThan(sepTela - 0.0005);
  });

  it('dos capas que se acercan forman par activo antes de tocarse, por la velocidad del cuadro anterior', () => {
    // la de arriba 2 mm más allá de la separación y bajando 5 mm por cuadro
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-45, -45, 45, 45), 10, sepTela + 0.002);
    const nAbajo = abajo.x.length / 3;
    const s = new SistemaTela(armarPrenda([{ id: 'abajo', ...abajo }, { id: 'arriba', ...arriba }]).malla, TELA_DE_LABORATORIO);
    for (let i = nAbajo; i < s.n; i++) s.v[3 * i + 1] = -0.3;
    s.xt.set(s.x);
    s.armarParesPropios();
    const activos = s.paresPropios.filter((p) => p.activo);
    expect(activos.length).toBeGreaterThan(0);
    expect(activos.every((p) => p.p0 < 0)).toBe(true);
  });

  it('las puntas del cuerpo frenan con la fricción de la tela contra el cuerpo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
    const m = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
    // la punta ya pasó la tela 1 mm, en medio de un triángulo (los mismos corrimientos de la prueba de la pirámide)
    m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.099 : q + 0.003));
    const s = new SistemaTela(m, { ...TELA_DE_LABORATORIO, friccionTela: 0 }, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
    s.xt.set(s.x);
    s.armarParesPropios();
    const puntas = s.paresPropios.filter((p) => p.v.length === 3);
    expect(puntas.length).toBeGreaterThan(0);
    expect(puntas.every((p) => p.kt > 0)).toBe(true);
  });
});
